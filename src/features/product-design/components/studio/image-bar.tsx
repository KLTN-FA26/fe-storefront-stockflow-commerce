"use client";

import { FlipHorizontal2, FlipVertical2, Fullscreen, ImageUp } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ImageElement } from "../../engine";
import { BarDivider, BarIconButton, WrapSwitch } from "./bar-controls";
import { BarGroup, BarMore } from "./bar-overflow";
import { DpiBadge } from "./dpi-badge";
import { patchElement } from "./element-actions";
import { replacementPatch } from "./image-actions";
import { SaveImageToProject } from "./project-save-items";
import type { PropertySectionProps } from "./property-sections";
import { fitPlacement } from "./safe-fit";
import { useStudio } from "./studio-context";
import { acceptedFormats, firstFile, UPLOAD_MESSAGES, useAssetPicker } from "./use-asset-upload";

/**
 * The image's controls in the context bar: the resolution it reaches where it sits (DPI badge),
 * flipping, fitting the safe area, replacing the file ("Thay ảnh": the new image keeps the place and
 * fills as much of the old frame as its ratio lets it) and bending around the cup ("Uốn theo thân
 * ly", a cup body's sector only). When the bar is narrow, the upload's progress or error moves into
 * "Thêm" first, then the flips and the wrap switch; the error is also said in the studio's live
 * region (assertively), so it is heard wherever it is drawn. A locked image keeps all of it as
 * it is.
 */
export function ImageBar({ element, code }: PropertySectionProps<ImageElement>) {
  const { editor, surfaces, template, announce, design } = useStudio();
  const { pick, busy, error } = useAssetPicker();
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) announce(error, { urgent: true });
  }, [error, announce]);
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
    <>
      <DpiBadge compact element={element} surface={surface} minDpi={template.minDpi} />
      <BarDivider />
      <BarGroup id="image-flips" rank={4} disabled={locked}>
        <BarIconButton
          label="Lật ngang"
          aria-pressed={element.flipX}
          className="aria-pressed:bg-bg-muted"
          onClick={() => patch({ flipX: !element.flipX })}
        >
          <FlipHorizontal2 aria-hidden />
        </BarIconButton>
        <BarIconButton
          label="Lật dọc"
          aria-pressed={element.flipY}
          className="aria-pressed:bg-bg-muted"
          onClick={() => patch({ flipY: !element.flipY })}
        >
          <FlipVertical2 aria-hidden />
        </BarIconButton>
      </BarGroup>
      <BarIconButton
        label="Vừa vùng an toàn"
        disabled={locked}
        onClick={() => patch({ placement: fitPlacement(element, surface) })}
      >
        <Fullscreen aria-hidden />
      </BarIconButton>
      <BarIconButton
        label="Thay ảnh"
        disabled={locked || busy}
        onClick={() => fileInput.current?.click()}
      >
        <ImageUp aria-hidden />
      </BarIconButton>
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
        <BarGroup id="image-busy" rank={7}>
          <span role="status" className="text-ink-secondary shrink-0 text-xs">
            {UPLOAD_MESSAGES.uploading}
          </span>
        </BarGroup>
      ) : null}
      {error ? (
        <BarGroup id="image-error" rank={7} more={<p className="text-danger text-xs">{error}</p>}>
          <span className="text-danger max-w-56 truncate text-xs" title={error}>
            {error}
          </span>
        </BarGroup>
      ) : null}
      {surface.kind === "sector" ? (
        <BarGroup id="wrap" rank={2} disabled={locked}>
          <WrapSwitch
            checked={element.wrap === true}
            disabled={locked}
            onChange={(wrap) => patch({ wrap: wrap ? true : undefined })}
          />
        </BarGroup>
      ) : null}
      {design.project ? (
        <BarMore>
          <SaveImageToProject element={element} />
        </BarMore>
      ) : null}
    </>
  );
}
