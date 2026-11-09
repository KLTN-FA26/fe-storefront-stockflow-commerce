"use client";

import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { ApiError } from "@/lib/api/error";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { beId } from "@/lib/validation/primitives";

import type { FontRegistry } from "../../engine";
import { describeDesignError } from "../../errors";
import { useDesign, useDesignAssets, useDesignDocument, usePrintConfig } from "../../queries";
import type { Design } from "../../types";
import { LauncherFrame, LauncherSignIn } from "../launcher-states";
import type { ExportRenderer } from "./export-renderer";
import type { StudioServices } from "./studio-context";
import { StudioSkeleton } from "./studio-skeleton";
import { StudioLoadError, StudioNotFound } from "./studio-states";
import { StudioWorkspace } from "./studio-workspace";

export type DesignStudioProps = {
  designId: string;
  fonts: FontRegistry;
  /** The product's photo for the flat preview; the app composes it from the catalogue. */
  renderProductPhoto?: (design: Design) => ReactNode;
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

/** A design's variant that lost its print configuration cannot be opened (catalog BR-14). */
const NO_PRINT_CONFIG = "Quy cách này chưa nhận thiết kế.";

/**
 * `/design/[id]`: signed-in customers only (ruling R18) — a visitor gets the launcher's sign-in
 * prompt, which brings them back here, and nothing is read. A link whose id is no design id says
 * so without asking the BE (R1-02).
 */
export function DesignStudio(props: DesignStudioProps) {
  const signedIn = useSignedIn();
  if (signedIn === undefined) return <StudioSkeleton />;
  if (!signedIn) {
    return (
      <LauncherFrame>
        <LauncherSignIn from={STORE_ROUTES.design.detail(encodeURIComponent(props.designId))} />
      </LauncherFrame>
    );
  }
  if (!isDesignId(props.designId)) return <StudioNotFound />;
  return <LoadedDesignStudio {...props} />;
}

/**
 * Loads the design, its document, its images and its variant's print configuration (by the
 * design's product slug and SKU), then opens the studio, whatever the status: it follows the
 * status itself (spec §6.4). A design that is not the caller's, or was deleted (ARCHIVED), is not
 * found (docs 12 BR-03, BR-16); so is one whose document is missing. A design deleted while it is
 * open (another tab) answers its next read with a 404: that wins over the design still cached, so
 * the studio closes on "Không tìm thấy thiết kế" (its unsaved edit stays in this browser).
 */
function LoadedDesignStudio({
  designId,
  fonts,
  renderProductPhoto,
  onServices,
  exportRenderer,
}: DesignStudioProps) {
  const design = useDesign(designId);
  const document = useDesignDocument(designId, true);
  const assets = useDesignAssets(designId, true);
  const product = design.data?.product.slug ?? "";
  const sku = design.data?.variant.sku ?? "";
  const printConfig = usePrintConfig(product, sku, design.data !== undefined);
  const config = printConfig.data;

  const gone =
    isNotFound(design.error) || isUnreadableAddress(design.error) || isNotFound(document.error);
  if (gone || design.data?.status === "ARCHIVED") return <StudioNotFound />;
  if (
    design.data &&
    document.data &&
    assets.data &&
    config &&
    config.template.model.kind !== "gltf"
  ) {
    return (
      <StudioWorkspace
        key={designId}
        design={design.data}
        record={document.data}
        printConfig={config}
        assets={assets.data}
        fonts={fonts}
        productPhoto={renderProductPhoto?.(design.data)}
        onServices={onServices}
        exportRenderer={exportRenderer}
      />
    );
  }

  const queries = [design, document, assets, printConfig];
  const failure = queries.find((query) => query.error)?.error;
  if (failure) {
    return (
      <StudioLoadError
        message={describeDesignError(failure)}
        onRetry={() => queries.forEach((query) => query.error && void query.refetch())}
        retrying={queries.some((query) => query.isFetching)}
      />
    );
  }
  // Retrying cannot help: the variant has no print configuration until the warehouse adds one.
  if (config === null) return <StudioLoadError message={NO_PRINT_CONFIG} />;
  if (config?.template.model.kind === "gltf") {
    return <StudioLoadError message="Mẫu 3D của sản phẩm này chưa được hỗ trợ." />;
  }
  return <StudioSkeleton />;
}
