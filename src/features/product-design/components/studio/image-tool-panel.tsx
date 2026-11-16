"use client";

import { useEffect } from "react";

import { Alert } from "@/components/shared";

import { ImageDropzone } from "../image-dropzone";
import type { DesignAsset } from "../../types";
import { placeImage } from "./image-actions";
import { ImageLibrary } from "./image-library";
import { ProjectLibraryImages } from "./project-library-images";
import { useEditorState, useStudio } from "./studio-context";
import {
  acceptedFormatNames,
  acceptedFormats,
  UPLOAD_MESSAGES,
  useAssetPicker,
} from "./use-asset-upload";
import { useLibraryPlacement } from "./use-library-placement";
import { usePasteImage } from "./use-paste-image";

/** "PNG, JPG hoặc SVG": the names in order, the last one after "hoặc". */
const formatList = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} hoặc ${names.at(-1)}` : names.join("");

/**
 * The Image/Logo tool's options: a dropzone ("Kéo thả hoặc chọn ảnh") that also takes a paste on
 * the stage while it is open (closed, `ImagePaste` does), the images of the project's library when
 * the design belongs to one ("Thư viện dự án", copied in and placed) and the images already
 * uploaded to this design ("Ảnh của bạn", `ImageLibrary`). A picked, dropped or pasted file is
 * stored and placed on the active surface; picking an uploaded image places it again.
 */
export function ImageToolPanel() {
  const services = useStudio();
  const { design, template, stageRef } = services;
  const readOnly = useEditorState((s) => s.readOnly);
  const surface = useEditorState((s) => s.activeSurface);
  const { pick, busy, error, fail } = useAssetPicker();
  const library = useLibraryPlacement();
  // A refusal belongs to the face it was made on.
  const { clearRefusal } = library;
  useEffect(() => clearRefusal(), [surface, clearRefusal]);

  const place = (asset: DesignAsset) => {
    if (!placeImage(services, asset)) fail(UPLOAD_MESSAGES.noRoom);
  };
  const placeFromLibrary = async (itemId: string) => {
    fail(null);
    await library.place(itemId); // a refusal is kept by the placement, drop or click alike
  };
  const addFile = async (file: File) => {
    library.clearRefusal();
    const asset = await pick(file);
    if (asset) place(asset);
  };
  usePasteImage(stageRef, readOnly ? null : (file) => void addFile(file));

  return (
    <div className="flex flex-col gap-4">
      <ImageDropzone
        accept={acceptedFormats(template)}
        hint={`${formatList(acceptedFormatNames(template))}, tối đa ${template.maxFileSizeMb} MB. Có thể dán ảnh (Ctrl+V) khi đang chọn khung vẽ.`}
        disabled={readOnly || busy}
        onFile={(file) => void addFile(file)}
        className="min-h-32"
      />
      {busy ? (
        <p role="status" className="text-ink-secondary text-sm">
          Đang tải ảnh lên…
        </p>
      ) : null}
      {(error ?? library.refusal) ? (
        <div role="alert">
          <Alert tone="danger">{error ?? library.refusal}</Alert>
        </div>
      ) : null}
      {design.project ? (
        <ProjectLibraryImages
          projectId={design.project.id}
          disabled={readOnly || busy || library.pending}
          onPlace={(itemId) => void placeFromLibrary(itemId)}
        />
      ) : null}
      <ImageLibrary designId={design.id} disabled={readOnly || busy} onPick={place} />
    </div>
  );
}
