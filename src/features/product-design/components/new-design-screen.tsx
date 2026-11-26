"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import { createKeyFor, forgetCreateKey, isRetryableWithSameKey } from "../create-key";
import { describeLauncherError, isFutileToRetry, isProjectRefusal } from "../errors";
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
  // `?project=` makes the new design join that project (a project page's "Tạo bản mới"); the route
  // reads only `product` and `sku`, so the screen reads this one itself.
  const projectId = useSearchParams()?.get("project")?.trim() || undefined;
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

  const key = `${product}+${sku}+${projectId ?? ""}`;
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
      // The key outlives a reload (sessionStorage): a reload before the redirect replays this create.
      const idempotencyKey = createKeyFor(key);
      const promise = mutateAsync({ productSlug: product, sku, name, projectId, idempotencyKey });
      attempt.current = { key, promise };
      promise.then(
        (design) => {
          // The visit is over: the next one to this link is a new design.
          forgetCreateKey(key);
          if (mounted.current) replace(STORE_ROUTES.design.detail(design.id));
        },
        (error: unknown) => {
          // The BE keeps a 4xx for the key and would replay it; only a failure a retry can get past
          // (network, 5xx) or one still in progress keeps the key. Shown from the mutation's error.
          if (!isRetryableWithSameKey(error)) forgetCreateKey(key);
        },
      );
    },
    [key, name, mutateAsync, product, sku, projectId, replace],
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
    if (!signedIn)
      return <LauncherSignIn from={STORE_ROUTES.design.newFor(product, sku, projectId)} />;
    if (create.isError || (create.isIdle && (configFailed || countFailed))) {
      const retry = create.isError
        ? () => start(true)
        : () => void (configFailed ? config.refetch() : count.refetch());
      // The project refused the design (full, closed): trying again cannot help, the page can.
      const refused = create.isError && projectId !== undefined && isProjectRefusal(create.error);
      // A 4xx the BE stores for the key is answered the same on every try: no retry, Sales is the way on.
      const hopeless = create.isError && isFutileToRetry(create.error);
      return (
        <LauncherError
          title="Không bắt đầu được thiết kế"
          message={describeLauncherError(
            create.error ?? (configFailed ? config.error : count.error),
            { chat: hopeless && !refused },
          )}
          {...(refused || hopeless ? {} : { onRetry: retry })}
          retrying={create.isPending || config.isFetching || count.isFetching}
          backHref={refused ? STORE_ROUTES.design.project(projectId) : productHref}
          {...(refused ? { backLabel: "Về dự án" } : { chatProductSlug: product })}
        />
      );
    }
    if (config.isPending) return <LauncherLoading label="Đang kiểm tra quy cách…" />;
    if (printable === null) {
      return (
        <LauncherNoPrintConfig
          backHref={productHref}
          unavailable={config.data !== null}
          productSlug={product}
        />
      );
    }
    if (create.isIdle && full && limit !== undefined) return <LauncherDraftLimit limit={limit} />;
    if (create.isSuccess) return <LauncherLoading label="Đang mở trình thiết kế…" />;
    return <LauncherLoading label="Đang tạo thiết kế…" />;
  })();

  return <LauncherFrame>{body}</LauncherFrame>;
}
