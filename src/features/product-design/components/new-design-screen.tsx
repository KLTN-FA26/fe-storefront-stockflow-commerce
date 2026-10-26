"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { useIsMock } from "@/providers/app-providers";

import { designCapabilities } from "../capabilities";
import { TEMPLATE_NOT_FOUND_MESSAGE, describeDesignError, isDesignApiUnavailable } from "../errors";
import { useCreateDesign } from "../mutations";
import { useCustomization } from "../queries";
import { defaultDesignName } from "../selectors";
import type { CreateDesignInput } from "../types";
import {
  LauncherError,
  LauncherFrame,
  LauncherLoading,
  LauncherSignIn,
  LauncherUnavailable,
} from "./launcher-states";
import { TemplateChoice, type Template } from "./template-choice";

const createRequest = (productId: string, template: Template): CreateDesignInput => ({
  productId,
  sku: template.sku,
  templateCode: template.code,
  name: defaultDesignName(template.name, new Date()),
});

/**
 * `/design/new?product=&sku=`: reads the templates of the product (P2), picks the one of the SKU,
 * creates the design (P1) and opens its studio. It asks only when there is more than one template.
 * P1 and P2 are proposed endpoints, so nothing is called until `selfService` says the BE has them.
 */
export function NewDesignScreen({ product, sku }: { product: string; sku: string | null }) {
  const { replace } = useRouter();
  const signedIn = useSignedIn();
  const { selfService } = designCapabilities(useIsMock());
  const customization = useCustomization(product, signedIn === true && selfService);
  const { mutate, data: created, error: createError, isPending: creating } = useCreateDesign();
  const [picked, setPicked] = useState<string>();
  const started = useRef(false);

  const productHref = STORE_ROUTES.catalog.detail(product);
  const productId = customization.data?.productId;
  const templates = (customization.data?.templates ?? []).filter(
    (template) => sku === null || template.sku === sku,
  );
  const chosen = templates.find((template) => template.code === picked) ?? templates[0];
  const start = () => {
    if (productId && chosen) mutate(createRequest(productId, chosen));
  };

  // One template: there is nothing to ask, so start straight away (once, however often this re-renders).
  const only = templates.length === 1 ? templates[0] : undefined;
  useEffect(() => {
    if (!only || !productId || started.current) return;
    started.current = true;
    mutate(createRequest(productId, only));
  }, [only, productId, mutate]);

  useEffect(() => {
    if (created) replace(STORE_ROUTES.design.detail(created.id));
  }, [created, replace]);

  const body = (() => {
    const back = { href: productHref, label: "Quay lại sản phẩm" };
    // Without P1 signing in would not let the customer start either: Sales is the way in.
    if (!selfService) return <LauncherUnavailable back={back} />;
    if (signedIn === undefined) return <LauncherLoading label="Đang chuẩn bị thiết kế…" />;
    if (!signedIn) return <LauncherSignIn from={STORE_ROUTES.design.newFor(product, sku)} />;
    if (customization.isPending) return <LauncherLoading label="Đang tải mẫu thiết kế…" />;
    const error = createError ?? customization.error;
    if (isDesignApiUnavailable(error)) return <LauncherUnavailable back={back} />;
    if (error) {
      return (
        <LauncherError
          title="Không bắt đầu được thiết kế"
          message={describeDesignError(error)}
          onRetry={createError ? start : () => void customization.refetch()}
          retrying={creating || customization.isFetching}
          backHref={productHref}
        />
      );
    }
    if (created) return <LauncherLoading label="Đang mở trình thiết kế…" />;
    if (!chosen) {
      return (
        <LauncherError
          title="Không bắt đầu được thiết kế"
          message={TEMPLATE_NOT_FOUND_MESSAGE}
          backHref={productHref}
        />
      );
    }
    if (templates.length > 1) {
      return (
        <TemplateChoice
          templates={templates}
          value={chosen.code}
          onChange={setPicked}
          onStart={start}
          starting={creating}
          showSku={sku === null}
        />
      );
    }
    return <LauncherLoading label="Đang tạo thiết kế…" />;
  })();

  return <LauncherFrame>{body}</LauncherFrame>;
}
