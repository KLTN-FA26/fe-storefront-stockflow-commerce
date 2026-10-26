/** A step of the export that cannot go on, with what to tell the customer. */
export class ExportError extends Error {}

export const EXPORT_MESSAGES = {
  image: "Không tải được ảnh gốc để tạo file in. Hãy kiểm tra kết nối rồi thử lại.",
  canvas: "Trình duyệt không vẽ được file in. Hãy thử lại hoặc dùng trình duyệt khác.",
  encode: "Không tạo được ảnh của file in. Hãy thử lại.",
} as const;

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
