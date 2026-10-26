"use client";

import { useMemo, type ReactNode } from "react";

import { ApiError } from "@/lib/api/error";
import { beId } from "@/lib/validation/primitives";
import { useIsMock } from "@/providers/app-providers";

import { designCapabilities } from "../../capabilities";
import type { FontRegistry } from "../../engine";
import { describeDesignError, isDesignApiUnavailable } from "../../errors";
import { useCustomization, useDesign, useDesignAssets, useDesignDocument } from "../../queries";
import type { DesignDraft } from "../../types";
import type { ExportRenderer } from "./export-renderer";
import type { StudioServices } from "./studio-context";
import { StudioSkeleton } from "./studio-skeleton";
import { StudioLoadError, StudioNotFound } from "./studio-states";
import { StudioWorkspace } from "./studio-workspace";
import { WorkflowView } from "./workflow-view";

export type DesignStudioProps = {
  designId: string;
  fonts: FontRegistry;
  /** The product's photo for the flat preview; the app composes it from the catalogue. */
  renderProductPhoto?: (design: DesignDraft) => ReactNode;
  /** Test seam: receives the studio's services each time they change. */
  onServices?: (services: StudioServices) => void;
  /** Test seam: draws the review files in place of the canvases (jsdom has none). */
  exportRenderer?: ExportRenderer;
};

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;
/** The BE refuses an address it cannot read (400 `REQUEST_REJECTED`): for a design, none is there. */
const isUnreadableAddress = (error: unknown) => error instanceof ApiError && error.status === 400;

const DESIGN_ID = beId();
/** Design ids are UUIDs: anything else (a mistyped or cut-off link) names no design. */
const isDesignId = (id: string) => DESIGN_ID.safeParse(id).success;

/** Without P6's `productSlug` and `templateCode` there is no template to open a design with (R6). */
const lacksTemplate = (design: DesignDraft) => !design.productSlug || !design.templateCode;

/** `/design/[id]`: a link whose id is no design id says so without asking the BE (R1-02). */
export function DesignStudio(props: DesignStudioProps) {
  if (!isDesignId(props.designId)) return <StudioNotFound />;
  return <LoadedDesignStudio {...props} />;
}

/**
 * Loads the design, its document (P3), its images (P4) and its template (P2, by the draft's
 * `productSlug` and `templateCode`), then opens the studio. Until the BE serves P3/P4 nothing of
 * theirs is called, and a design without a template (one Sales created) cannot be edited either:
 * both open the workflow-only view (R72), where the lifecycle steps still work. The document always
 * exists (R41): a 404 means the design itself is not there.
 */
function LoadedDesignStudio({
  designId,
  fonts,
  renderProductPhoto,
  onServices,
  exportRenderer,
}: DesignStudioProps) {
  const isMock = useIsMock();
  const capabilities = useMemo(() => designCapabilities(isMock), [isMock]);
  const live = capabilities.document && capabilities.assets;
  const design = useDesign(designId);
  const document = useDesignDocument(designId, capabilities.document);
  const assets = useDesignAssets(designId, capabilities.assets);
  const slug = design.data?.productSlug ?? "";
  const customization = useCustomization(slug, live && slug !== "");
  const template = customization.data?.templates.find(
    (candidate) => candidate.code === design.data?.templateCode,
  );

  if (design.data && document.data && assets.data && template && template.model.kind !== "gltf") {
    return (
      <StudioWorkspace
        key={designId}
        design={design.data}
        record={document.data}
        template={template}
        assets={assets.data}
        fonts={fonts}
        capabilities={capabilities}
        productPhoto={renderProductPhoto?.(design.data)}
        onServices={onServices}
        exportRenderer={exportRenderer}
      />
    );
  }

  const queries = [design, document, assets, customization];
  // A template P2 no longer lists (deactivated) cannot open the editor either.
  const editorUnavailable =
    !live ||
    (design.data !== undefined && lacksTemplate(design.data)) ||
    (customization.data !== undefined && !template) ||
    queries.some((query) => isDesignApiUnavailable(query.error));
  if (editorUnavailable && design.data) return <WorkflowView design={design.data} />;
  const failure = queries.find((query) => query.error)?.error;
  if (isNotFound(design.error) || isUnreadableAddress(design.error) || isNotFound(document.error)) {
    return <StudioNotFound />;
  }
  if (failure) {
    return (
      <StudioLoadError
        message={describeDesignError(failure)}
        onRetry={() => queries.forEach((query) => query.error && void query.refetch())}
        retrying={queries.some((query) => query.isFetching)}
      />
    );
  }
  if (template?.model.kind === "gltf") {
    return <StudioLoadError message="Mẫu 3D của sản phẩm này chưa được hỗ trợ." />;
  }
  return <StudioSkeleton />;
}
