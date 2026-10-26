"use client";

import { FlipHorizontal2, FlipVertical2, Fullscreen, ImageUp } from "lucide-react";
import { useId, useRef } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { ImageElement } from "../../engine";
import { DpiBadge } from "./dpi-badge";
import { patchElement } from "./element-actions";
import { fitPlacement, replacementPatch } from "./image-actions";
import type { PropertySectionProps } from "./property-sections";
import { useStudio } from "./studio-context";
import { acceptedFormats, firstFile, useAssetPicker } from "./use-asset-upload";

const COMMAND = "min-h-11 justify-start rounded-[var(--r-md)] px-3";

/**
 * The image's own section of the Properties panel: the resolution it reaches where it sits (DPI
 * badge), flipping, fitting the safe area, bending around the cup ("Uốn theo thân ly", a cup
 * body's sector only: a flat face has nothing to bend around) and replacing the file ("Thay ảnh":
 * the new image keeps the place and fills as much of the old frame as its ratio lets it). A locked
 * image keeps all of it as it is.
 */
export function ImageProperties({ element, code }: PropertySectionProps<ImageElement>) {
  const { editor, surfaces, template } = useStudio();
  const { pick, busy, error } = useAssetPicker();
  const fileInput = useRef<HTMLInputElement>(null);
  const wrapId = useId();
  const surface = surfaces.byCode[code];
  if (!surface) return null;

  const target = { code, surface, element };
  const { locked } = element;
  const patch = (changes: Partial<ImageElement>) => patchElement(editor, target, changes);
  const replace = async (file: File) => {
    const asset = await pick(file);
    if (asset) patch(replacementPatch(element, asset));
  };

  return (
    <div className="border-border-default flex flex-col gap-3 border-t pt-4">
      <h3 className="text-ink-primary text-sm font-semibold">Ảnh</h3>
      <DpiBadge element={element} minDpi={template.minDpi} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className={COMMAND}
          aria-pressed={element.flipX}
          disabled={locked}
          onClick={() => patch({ flipX: !element.flipX })}
        >
          <FlipHorizontal2 aria-hidden className="mr-1.5 size-4" />
          Lật ngang
        </Button>
        <Button
          type="button"
          variant="outline"
          className={COMMAND}
          aria-pressed={element.flipY}
          disabled={locked}
          onClick={() => patch({ flipY: !element.flipY })}
        >
          <FlipVertical2 aria-hidden className="mr-1.5 size-4" />
          Lật dọc
        </Button>
        <Button
          type="button"
          variant="outline"
          className={COMMAND}
          disabled={locked}
          onClick={() => patch({ placement: fitPlacement(element, surface) })}
        >
          <Fullscreen aria-hidden className="mr-1.5 size-4" />
          Vừa vùng an toàn
        </Button>
        <Button
          type="button"
          variant="outline"
          className={COMMAND}
          disabled={locked || busy}
          onClick={() => fileInput.current?.click()}
        >
          <ImageUp aria-hidden className="mr-1.5 size-4" />
          Thay ảnh
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={acceptedFormats(template)}
        aria-label="Chọn ảnh thay thế"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = firstFile(event.target.files);
          event.target.value = "";
          if (file) void replace(file);
        }}
      />
      {busy ? (
        <p role="status" className="text-ink-secondary text-sm">
          Đang tải ảnh lên…
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {surface.kind === "sector" ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={wrapId} className="text-ink-primary min-h-11 flex-1 text-sm">
            Uốn theo thân ly
          </Label>
          <Switch
            id={wrapId}
            checked={element.wrap === true}
            disabled={locked}
            onCheckedChange={(wrap) => patch({ wrap: wrap ? true : undefined })}
          />
        </div>
      ) : null}
    </div>
  );
}
