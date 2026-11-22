"use client";

import { useState } from "react";

import { Alert } from "@/components/shared";

import { MAX_IMAGE_PIXELS, readImageDimensions } from "../engine";
import { describeLibraryUploadError, TOO_MANY_PIXELS_MESSAGE } from "../errors";
import { useUploadLibraryImage } from "../library-mutations";
import type { Gate } from "../project-rules";
import { ImageDropzone } from "./image-dropzone";
import { SVG_MIN_RASTER_WIDTH_PX } from "./studio/image-actions";
import { AssetRefusedError, rasterized, uploadKey } from "./studio/use-asset-upload";

/**
 * What the library takes (PO 2026-11-22, Q2 / SD-9: as the BE): PNG, JPEG and WebP
 * (`DesignProjectAssetService.LIBRARY_TYPES`), up to 50 MB and 40 megapixels (`ImageDimensions`, 413 above it). An SVG
 * is drawn to a PNG before it is sent.
 */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const SVG_TYPE = "image/svg+xml";
const MAX_MB = 50;
const BYTES_PER_MB = 1024 * 1024;

const MESSAGES = {
  unsupported: "Định dạng không được hỗ trợ. Hỗ trợ: PNG, JPG, WebP, SVG.",
  tooLarge: `Tệp lớn hơn ${MAX_MB} MB.`,
  tooManyPixels: TOO_MANY_PIXELS_MESSAGE,
  unreadable: "Không đọc được kích thước ảnh.",
} as const;

const normalType = (file: File) => (file.type === "image/jpg" ? "image/jpeg" : file.type);

/** The picked file's type and bytes, checked before an SVG is drawn (a huge one would hang the tab). */
function refusalOf(file: File): string | null {
  const type = normalType(file);
  if (type !== SVG_TYPE && !ACCEPTED_TYPES.includes(type)) return MESSAGES.unsupported;
  if (file.size > MAX_MB * BYTES_PER_MB) return MESSAGES.tooLarge;
  return null;
}

/** The file about to be sent: its bytes again (a drawn SVG), then its pixels from the header. */
function sentRefusalOf(file: File, bytes: Uint8Array): string | null {
  if (file.size > MAX_MB * BYTES_PER_MB) return MESSAGES.tooLarge;
  const header = readImageDimensions(bytes);
  if (!header) return MESSAGES.unreadable;
  return header.width * header.height > MAX_IMAGE_PIXELS ? MESSAGES.tooManyPixels : null;
}

/** The file to check and send: an SVG is drawn to a PNG first, as a design's upload does (Q6). */
async function sendable(file: File): Promise<File> {
  const type = normalType(file);
  if (type === SVG_TYPE) return rasterized(file, SVG_MIN_RASTER_WIDTH_PX);
  return type === file.type ? file : new File([file], file.name, { type });
}

/**
 * The upload box of the library's Ảnh tab: pick or drop a PNG, JPG, WebP or SVG (an SVG is sent as the
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
    const picking = refusalOf(picked);
    if (picking) return setRefused(picking);
    let file: File;
    try {
      file = await sendable(picked);
    } catch (error) {
      return setRefused(error instanceof AssetRefusedError ? error.message : "Không đọc được ảnh.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = sentRefusalOf(file, bytes);
    if (problem) return setRefused(problem);
    upload.mutate({
      file,
      name: file.name,
      idempotencyKey: await uploadKey(bytes, file.name, file.type),
    });
  };
  const message =
    refused ?? (upload.isError ? describeLibraryUploadError(upload.error, MAX_MB) : null);

  return (
    <div className="space-y-2">
      <ImageDropzone
        accept={[...ACCEPTED_TYPES, SVG_TYPE].join(",")}
        hint={`PNG, JPG, WebP hoặc SVG, tối đa ${MAX_MB} MB.`}
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
