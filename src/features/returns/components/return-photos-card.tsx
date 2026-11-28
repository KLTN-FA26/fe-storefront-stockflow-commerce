"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { toast } from "@/components/shared/Toast";
import { PhotoPicker } from "@/components/storefront/photo-picker";
import { Button } from "@/components/ui/button";
import {
  RETURN_PHOTO_MAX_BYTES,
  RETURN_PHOTO_MAX_COUNT,
  RETURN_PHOTO_TYPES,
  acceptsPhotos,
  describeReturnError,
  getReturnPhotoLink,
  useAddMyReturnPhoto,
  type CustomerReturn,
} from "@/lib/returns";

import { CARD } from "./return-detail-sections";

/**
 * Ảnh vấn đề khách đã gửi; thêm ảnh khi yêu cầu còn chờ duyệt hoặc đã duyệt và đang chờ hàng về
 * (`acceptsPhotos`, như BE nhận) — Sales duyệt và đề nghị hoàn tiền dựa trên ảnh.
 */
export function ReturnPhotosCard({ request }: { request: CustomerReturn }) {
  const photos = request.evidence ?? [];
  const [picked, setPicked] = useState<File[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const upload = useAddMyReturnPhoto();
  const room = Math.max(RETURN_PHOTO_MAX_COUNT - photos.length, 0);
  const canAdd = acceptsPhotos(request.status) && room > 0;

  const open = async (evidenceId: string) => {
    setOpening(evidenceId);
    try {
      window.open(
        await getReturnPhotoLink(request.id, evidenceId),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (error) {
      toast.error("Không mở được ảnh", describeReturnError(error));
    } finally {
      setOpening(null);
    }
  };

  const send = async () => {
    const left: File[] = [];
    for (const file of picked) {
      try {
        await upload.mutateAsync({ returnId: request.id, file });
      } catch (error) {
        left.push(file);
        toast.error(`Chưa tải được ${file.name}`, describeReturnError(error));
      }
    }
    setPicked(left);
    if (left.length === 0) toast.success("Đã thêm ảnh");
  };

  if (photos.length === 0 && !canAdd) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="return-photos-heading">
      <h2
        id="return-photos-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Ảnh vấn đề
      </h2>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id}>
              <Button
                type="button"
                variant="outline"
                className="border-border-default relative aspect-square size-full min-h-11 overflow-hidden rounded-[var(--r-md)] p-0"
                disabled={opening === photo.id}
                aria-label={`Xem ảnh ${photo.originalName ?? ""}`.trim()}
                onClick={() => void open(photo.id)}
              >
                {photo.thumbnailUrl ? (
                  <Image
                    src={photo.thumbnailUrl}
                    alt={photo.originalName ?? "Ảnh vấn đề"}
                    fill
                    unoptimized
                    sizes="8rem"
                    className="object-cover"
                  />
                ) : (
                  <ImageIcon aria-hidden className="text-ink-tertiary size-6" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-secondary text-sm">
          Chưa có ảnh nào. Sale cần ít nhất một ảnh của vấn đề để duyệt yêu cầu.
        </p>
      )}
      {canAdd ? (
        <div className="space-y-3">
          <PhotoPicker
            files={picked}
            onChange={setPicked}
            max={room}
            maxBytes={RETURN_PHOTO_MAX_BYTES}
            accept={RETURN_PHOTO_TYPES}
            label="Thêm ảnh"
            hint="JPEG, PNG hoặc WebP, mỗi ảnh tối đa 15 MB."
            disabled={upload.isPending}
          />
          {picked.length > 0 ? (
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)] px-5"
              disabled={upload.isPending}
              onClick={() => void send()}
            >
              {upload.isPending ? "Đang tải ảnh..." : `Gửi ${picked.length} ảnh`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
