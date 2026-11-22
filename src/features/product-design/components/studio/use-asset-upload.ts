"use client";

import { useCallback, useRef, useState } from "react";

import {
  MAX_IMAGE_PIXELS,
  rasterizeSvg,
  readImageDimensions,
  type CustomizationTemplate,
} from "../../engine";
import { describeDesignError, describeFileRefusal } from "../../errors";
import { useUploadAsset } from "../../mutations";
import type { DesignAsset } from "../../types";
import { SVG_MIN_RASTER_WIDTH_PX, svgRasterWidthPx } from "./image-actions";
import { uploadKey } from "../../upload-key";
import { useStudio } from "./studio-context";

export { uploadKey };

const BYTES_PER_MB = 1024 * 1024;
const SVG_TYPE = "image/svg+xml";

export const UPLOAD_MESSAGES = {
  unsupported: (formats: readonly string[]) =>
    `Định dạng không được hỗ trợ. Hỗ trợ: ${formats.join(", ")}.`,
  tooLarge: (maxMb: number) => `Tệp lớn hơn ${maxMb} MB.`,
  tooManyPixels: "Ảnh vượt 40 megapixel.",
  unreadable: "Không đọc được kích thước ảnh.",
  noRoom: "Mặt này đã đủ số phần tử tối đa, hãy xoá bớt để thêm ảnh.",
  uploading: "Đang tải ảnh lên…",
} as const;

/** A file turned away before anything was sent; its message says why, in the customer's words. */
export class AssetRefusedError extends Error {}

/** The words for a failed upload: a refusal's own, else the API error's. */
export const describeUploadError = (
  error: unknown,
  template?: Pick<CustomizationTemplate, "allowedFileFormats" | "maxFileSizeMb">,
) =>
  error instanceof AssetRefusedError
    ? error.message
    : ((template && describeFileRefusal(error, template)) ?? describeDesignError(error));

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: SVG_TYPE,
};

/** The MIME type the file declares (`image/jpg` read as JPEG); from its extension when it declares none. */
function declaredType(file: File): string {
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type) return type === "image/jpg" ? "image/jpeg" : type;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[extension] ?? "";
}

/**
 * Whether the template takes an SVG: it is drawn to a PNG before it is sent (the BE never stores SVG), so only a
 * template that takes PNG takes it (PO 2026-11-22, Q2 / SD-10: as the BE).
 */
export const takesSvg = (template: Pick<CustomizationTemplate, "allowedFileFormats">) =>
  template.allowedFileFormats.includes("image/png");

/** The `accept` of a file input: the template's formats, and SVG when it takes PNG (`takesSvg`). */
export const acceptedFormats = (template: Pick<CustomizationTemplate, "allowedFileFormats">) =>
  [...template.allowedFileFormats, ...(takesSvg(template) ? [".svg"] : [])].join(",");

/** What a customer calls each format; any other MIME type reads as its subtype in capitals. */
const FORMAT_NAMES: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  [SVG_TYPE]: "SVG",
};

/**
 * The formats a customer may pick, by name: the template's (its file rules', `templateOf`), then SVG when the template
 * takes PNG, because it is drawn to a PNG before it is sent.
 */
export function acceptedFormatNames(
  template: Pick<CustomizationTemplate, "allowedFileFormats">,
): string[] {
  const names = template.allowedFileFormats.map(
    (type) => FORMAT_NAMES[type] ?? type.replace(/^image\//, "").toUpperCase(),
  );
  return [...new Set([...names, ...(takesSvg(template) ? [FORMAT_NAMES[SVG_TYPE]!] : [])])];
}

/** The first of `files` (a drop or a paste may carry several; one image is placed at a time). */
export const firstFile = (files: FileList | null | undefined): File | undefined => files?.[0];

/** The SVG as a PNG named after it, drawn for the active face; a file the browser cannot draw is unreadable. */
export async function rasterized(file: File, widthPx: number): Promise<File> {
  let png: Blob;
  try {
    png = await rasterizeSvg(await file.text(), widthPx);
  } catch {
    throw new AssetRefusedError(UPLOAD_MESSAGES.unreadable);
  }
  return new File([png], `${file.name.replace(/\.svg$/i, "")}.png`, { type: "image/png" });
}

/**
 * Stores a picked image for the design (P4) and returns it. A file is refused, in this order, when
 * its type is not one the template accepts (SVG when it takes PNG), when it is larger than the template's
 * `maxFileSizeMb` (an SVG too, before it is drawn: a huge one would hang the tab), when its header does not give a
 * size, or when it has more than 40 MP. An SVG is drawn to a PNG first (it is never stored as SVG), which is then
 * checked like any file. The
 * idempotency key covers the bytes, the name and the type (`uploadKey`), so the same file sent twice
 * is stored once and the same bytes under another name are a new upload. The decoded image goes into the image cache, so the element that places it draws at once instead of
 * downloading what was just uploaded.
 */
export function useAssetUpload() {
  const { design, template, editor, surfaces, images } = useStudio();
  const { mutateAsync } = useUploadAsset(design.id);

  const upload = useCallback(
    async (file: File): Promise<DesignAsset> => {
      const type = declaredType(file);
      const isSvg = type === SVG_TYPE;
      if (isSvg ? !takesSvg(template) : !template.allowedFileFormats.includes(type)) {
        throw new AssetRefusedError(UPLOAD_MESSAGES.unsupported(acceptedFormatNames(template)));
      }
      const maxBytes = template.maxFileSizeMb * BYTES_PER_MB;
      const tooLarge = new AssetRefusedError(UPLOAD_MESSAGES.tooLarge(template.maxFileSizeMb));
      // The SVG's own bytes first (B7): drawing a huge one would hang the tab before any check ran.
      if (file.size > maxBytes) throw tooLarge;

      // The part carries the type the key and the template check were made for (a file may declare
      // none, `image/jpg`, or parameters).
      let toSend = !isSvg && file.type !== type ? new File([file], file.name, { type }) : file;
      if (isSvg) {
        const surface = surfaces.byCode[editor.store.getState().activeSurface];
        toSend = await rasterized(
          file,
          surface ? svgRasterWidthPx(surface) : SVG_MIN_RASTER_WIDTH_PX,
        );
        if (toSend.size > maxBytes) throw tooLarge;
      }

      const bytes = new Uint8Array(await toSend.arrayBuffer());
      const header = readImageDimensions(bytes);
      if (!header) throw new AssetRefusedError(UPLOAD_MESSAGES.unreadable);
      if (header.width * header.height > MAX_IMAGE_PIXELS) {
        throw new AssetRefusedError(UPLOAD_MESSAGES.tooManyPixels);
      }

      const asset = await mutateAsync({
        file: toSend,
        name: toSend.name,
        idempotencyKey: await uploadKey(bytes, toSend.name, toSend.type),
      });
      // A decode that fails here is not an upload failure: `useAssetImages` downloads the stored
      // file when the cache lacks it, and reports it unreadable if that fails too.
      await images.load(asset.assetId, toSend, "proxy").catch(() => undefined);
      return asset;
    },
    [template, editor, surfaces, images, mutateAsync],
  );

  return { upload };
}

/**
 * `upload` for a control: `pick(file)` resolves the stored asset, or `null` after recording why it
 * could not (`error`); `busy` is true from the pick to the answer, and a pick while busy is ignored.
 */
export function useAssetPicker() {
  const { upload } = useAssetUpload();
  const { template } = useStudio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const pick = useCallback(
    async (file: File): Promise<DesignAsset | null> => {
      if (running.current) return null;
      running.current = true;
      setBusy(true);
      setError(null);
      try {
        return await upload(file);
      } catch (failure) {
        setError(describeUploadError(failure, template));
        return null;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [upload, template],
  );

  return { pick, busy, error, fail: setError };
}
