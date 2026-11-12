"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { describeDesignError } from "../errors";
import { useCreateDesign } from "../mutations";
import { useDraftCount, usePrintConfig } from "../queries";
import { defaultDesignName, isPrintConfigUsable } from "../selectors";
import type { Design } from "../types";
import {
  LauncherDraftLimit,
  LauncherError,
  LauncherFrame,
  LauncherLoading,
  LauncherNoPrintConfig,
  LauncherSignIn,
} from "./launcher-states";

/**
 * `/design/new?product=&sku=` (spec 2026-11-09 §6.2), checked in order: signed in; (the desktop
 * gate sits in the layout, so a phone never gets here); the variant has a usable print
 * configuration (`isPrintConfigUsable`); fewer than 50 drafts; then create the draft and open its
 * studio.
 */
export function NewDesignScreen({ product, sku }: { product: string; sku: string }) {
  const { replace } = useRouter();
  const signedIn = useSignedIn();
  const config = usePrintConfig(product, sku, signedIn === true);
  const printable = config.data && isPrintConfigUsable(config.data) ? config.data : null;
  const count = useDraftCount(printable !== null);
  const create = useCreateDesign();
  // The in-flight create of this visit, by link: a re-run effect (StrictMode) reuses it.
  const attempt = useRef<{ key: string; promise: Promise<Design> } | null>(null);
  // A create that lands after the customer left the launcher opens nothing.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const key = `${product}+${sku}`;
  const limit = count.data?.limit;
  const full = count.data !== undefined && count.data.drafts >= count.data.limit;
  const { mutateAsync } = create;
  const name = printable ? defaultDesignName(printable.product.title, printable.sku) : null;
  // Decided before the create starts: the create itself fills the 50th slot and refreshes the count.
  const ready = name !== null && count.data !== undefined && !full;

  const start = useCallback(
    (force: boolean) => {
      if (name === null) return;
      if (!force && attempt.current?.key === key) return;
      const promise = mutateAsync({ productSlug: product, sku, name });
      attempt.current = { key, promise };
      promise.then(
        (design) => {
          if (mounted.current) replace(STORE_ROUTES.design.detail(design.id));
        },
        () => undefined, // shown from the mutation's error, with a retry
      );
    },
    [key, name, mutateAsync, product, sku, replace],
  );

  useEffect(() => {
    if (ready) start(false);
  }, [ready, start]);

  const productHref = STORE_ROUTES.catalog.detail(product);
  // Only a read with no answer yet stops the launcher: a failed re-read keeps what it answered.
  const configFailed = config.isError && config.data === undefined;
  const countFailed = count.isError && count.data === undefined;
  const body = (() => {
    if (signedIn === undefined) return <LauncherLoading label="Đang chuẩn bị thiết kế…" />;
    if (!signedIn) return <LauncherSignIn from={STORE_ROUTES.design.newFor(product, sku)} />;
    if (create.isError || (create.isIdle && (configFailed || countFailed))) {
      const retry = create.isError
        ? () => start(true)
        : () => void (configFailed ? config.refetch() : count.refetch());
      return (
        <LauncherError
          title="Không bắt đầu được thiết kế"
          message={describeDesignError(create.error ?? (configFailed ? config.error : count.error))}
          onRetry={retry}
          retrying={create.isPending || config.isFetching || count.isFetching}
          backHref={productHref}
        />
      );
    }
    if (config.isPending) return <LauncherLoading label="Đang kiểm tra quy cách…" />;
    if (printable === null) {
      return <LauncherNoPrintConfig backHref={productHref} unavailable={config.data !== null} />;
    }
    if (create.isIdle && full && limit !== undefined) return <LauncherDraftLimit limit={limit} />;
    if (create.isSuccess) return <LauncherLoading label="Đang mở trình thiết kế…" />;
    return <LauncherLoading label="Đang tạo thiết kế…" />;
  })();

  return <LauncherFrame>{body}</LauncherFrame>;
}
