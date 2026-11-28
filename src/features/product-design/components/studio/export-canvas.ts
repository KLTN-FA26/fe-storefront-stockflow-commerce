import { ApiError } from "@/lib/api/error";

/** A step of the export that cannot go on, with what to tell the customer. */
export class ExportError extends Error {}

export const EXPORT_MESSAGES = {
  image: "Không tải được ảnh gốc để tạo file in. Hãy kiểm tra kết nối rồi thử lại.",
  imageServer:
    "Máy chủ chưa gửi được ảnh gốc để tạo file in (kết nối của bạn vẫn bình thường). Hãy thử lại sau ít phút.",
  imageUnreadable:
    "Có ảnh trong thiết kế không đọc được. Hãy xoá ảnh đó, tải lại ảnh rồi gửi duyệt.",
  canvas: "Trình duyệt không vẽ được file in. Hãy thử lại hoặc dùng trình duyệt khác.",
  encode: "Không tạo được ảnh của file in. Hãy thử lại.",
  profile: "Không tải được hồ sơ màu để tạo file in. Hãy kiểm tra kết nối rồi thử lại.",
} as const;

/**
 * The words for an original image that could not be loaded for the print file: "check the connection" only when the
 * request itself did not get through (the browser's network `TypeError`, or the client's status 0); when the server
 * answered with a failure (a download answered 4xx/5xx, the link refused) the connection is fine and saying so only
 * sends the customer to the wrong place; any other failure is an image that cannot be read.
 */
export function describeImageLoadFailure(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 0 ? EXPORT_MESSAGES.image : EXPORT_MESSAGES.imageServer;
  }
  if (error instanceof TypeError) return EXPORT_MESSAGES.image;
  if (error instanceof Error && /^Image download answered \d+/.test(error.message)) {
    return EXPORT_MESSAGES.imageServer;
  }
  return EXPORT_MESSAGES.imageUnreadable;
}

export function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export function pngOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ExportError(EXPORT_MESSAGES.encode))),
      "image/png",
    ),
  ).then(blobBytes);
}
