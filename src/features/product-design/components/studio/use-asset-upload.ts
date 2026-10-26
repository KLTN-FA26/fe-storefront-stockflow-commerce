"use client";

import { useCallback, useRef, useState } from "react";

import {
  rasterizeSvg,
  readImageDimensions,
  sha256Hex,
  type CustomizationTemplate,
} from "../../engine";
import { describeDesignError } from "../../errors";
import { useUploadAsset } from "../../mutations";
import type { DesignAsset } from "../../types";
import { SVG_MIN_RASTER_WIDTH_PX, svgRasterWidthPx } from "./image-actions";
import { useStudio } from "./studio-context";

/** Images past this many pixels are refused: decoding one would exhaust a phone's memory. */
const MAX_PIXELS = 40_000_000;
const BYTES_PER_MB = 1024 * 1024;
const SVG_TYPE = "image/svg+xml";

export const UPLOAD_MESSAGES = {
  unsupported: "Định dạng không được hỗ trợ. Hỗ trợ: PNG, JPG, WebP, SVG.",
  tooLarge: (maxMb: number) => `Tệp lớn hơn ${maxMb} MB.`,
  tooManyPixels: "Ảnh vượt 40 megapixel.",
  unreadable: "Không đọc được kích thước ảnh.",
  noRoom: "Mặt này đã đủ số phần tử tối đa, hãy xoá bớt để thêm ảnh.",
} as const;

/** A file turned away before anything was sent; its message says why, in the customer's words. */
export class AssetRefusedError extends Error {}

/** The words for a failed upload: a refusal's own, else the API error's. */
export const describeUploadError = (error: unknown) =>
  error instanceof AssetRefusedError ? error.message : describeDesignError(error);

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

/** The `accept` of a file input: the template's formats and SVG, which is rasterised before it is sent. */
export const acceptedFormats = (template: Pick<CustomizationTemplate, "allowedFileFormats">) =>
  [...template.allowedFileFormats, ".svg"].join(",");

/** The first of `files` (a drop or a paste may carry several; one image is placed at a time). */
export const firstFile = (files: FileList | null | undefined): File | undefined => files?.[0];

const HEX_DIGITS = new TextEncoder().encode("0123456789abcdef");

/**
 * The idempotency key of an upload: the SHA-256 hex of `hex(bytes) + "\0" + name + "\0" +
 * contentType`, then `+ "\0" + role` for an artifact (R67). The BE replays a key only for the same
 * bytes, name and type (the mock's `sameUpload` too) and answers 422 `IDEMPOTENCY_KEY_REUSED` for
 * anything else, so identical bytes under another name or type must not share a key, while a true
 * retry still does. (R58)
 */
export async function uploadKey(
  bytes: Uint8Array,
  name: string,
  contentType: string,
  artifactRole?: string,
): Promise<string> {
  const tail = artifactRole === undefined ? "" : `\0${artifactRole}`;
  const suffix = new TextEncoder().encode(`\0${name}\0${contentType}${tail}`);
  const input = new Uint8Array(bytes.length * 2 + suffix.length); // the hex digits as ASCII
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    input[2 * i] = HEX_DIGITS[byte >> 4] ?? 0;
    input[2 * i + 1] = HEX_DIGITS[byte & 15] ?? 0;
  }
  input.set(suffix, bytes.length * 2);
  return sha256Hex(input);
}

/** The SVG as a PNG named after it, drawn for the active face; a file the browser cannot draw is unreadable. */
async function rasterized(file: File, widthPx: number): Promise<File> {
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
 * its type is not one the template accepts (SVG always is), when it is larger than the template's
 * `maxFileSizeMb`, when its header does not give a size, or when it has more than 40 MP. An SVG is
 * drawn to a PNG first (it is never stored as SVG), which is then checked like any file. The
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
      if (!isSvg && !template.allowedFileFormats.includes(type)) {
        throw new AssetRefusedError(UPLOAD_MESSAGES.unsupported);
      }
      const maxBytes = template.maxFileSizeMb * BYTES_PER_MB;
      const tooLarge = new AssetRefusedError(UPLOAD_MESSAGES.tooLarge(template.maxFileSizeMb));
      if (!isSvg && file.size > maxBytes) throw tooLarge;

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
      if (header.width * header.height > MAX_PIXELS) {
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
        setError(describeUploadError(failure));
        return null;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [upload],
  );

  return { pick, busy, error, fail: setError };
}
