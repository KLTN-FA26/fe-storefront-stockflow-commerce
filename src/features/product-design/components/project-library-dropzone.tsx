"use client";

import { useState } from "react";

import { Alert } from "@/components/shared";

import { describeProjectError } from "../errors";
import { useUploadLibraryImage } from "../library-mutations";
import type { Gate } from "../project-rules";
import { ImageDropzone } from "./image-dropzone";
import { SVG_MIN_RASTER_WIDTH_PX } from "./studio/image-actions";
import { AssetRefusedError, rasterized, uploadKey } from "./studio/use-asset-upload";

/** What the library's default file rules take (docs 12 §4.9.29, B34): PNG or JPG, up to 50 MB. */
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const SVG_TYPE = "image/svg+xml";
const MAX_MB = 50;
const BYTES_PER_MB = 1024 * 1024;

/** What the default file rules refuse, said before anything is sent. */
function refusalOf(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Định dạng không được hỗ trợ. Hỗ trợ: PNG, JPG, SVG.";
  }
  if (file.size > MAX_MB * BYTES_PER_MB) return `Tệp lớn hơn ${MAX_MB} MB.`;
  return null;
}

/** The file to check and send: an SVG is drawn to a PNG first, as a design's upload does (Q6). */
async function sendable(file: File): Promise<File> {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (type === SVG_TYPE) return rasterized(file, SVG_MIN_RASTER_WIDTH_PX);
  return type === file.type ? file : new File([file], file.name, { type });
}

/**
 * The upload box of the library's Ảnh tab: pick or drop a PNG, JPG or SVG (an SVG is sent as the
 * PNG it is drawn to). `gate` locks it, with its reason written under it, when the library is full
 * or the project is closed.
 */
export function LibraryDropzone({ projectId, gate }: { projectId: string; gate: Gate }) {
  const upload = useUploadLibraryImage(projectId);
  const [refused, setRefused] = useState<string | null>(null);
  const off = !gate.allowed || upload.isPending;

  const send = async (picked: File) => {
    setRefused(null);
    upload.reset();
    let file: File;
    try {
      file = await sendable(picked);
    } catch (error) {
      return setRefused(error instanceof AssetRefusedError ? error.message : "Không đọc được ảnh.");
    }
    const problem = refusalOf(file);
    setRefused(problem);
    if (problem) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    upload.mutate({
      file,
      name: file.name,
      idempotencyKey: await uploadKey(bytes, file.name, file.type),
    });
  };
  const message = refused ?? (upload.isError ? describeProjectError(upload.error) : null);

  return (
    <div className="space-y-2">
      <ImageDropzone
        accept={[...ACCEPTED_TYPES, SVG_TYPE].join(",")}
        hint={`PNG, JPG hoặc SVG, tối đa ${MAX_MB} MB.`}
        disabled={off}
        onFile={(file) => void send(file)}
        className="min-h-24"
      />
      {gate.allowed ? null : <p className="text-ink-secondary text-sm">{gate.reason}</p>}
      {upload.isPending ? (
        <p role="status" className="text-ink-secondary text-sm">
          Đang tải ảnh lên…
        </p>
      ) : null}
      {message ? (
        <div role="alert">
          <Alert tone="danger">{message}</Alert>
        </div>
      ) : null}
    </div>
  );
}
