"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { EmptyState, Skeleton, toast } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ImageGallery } from "@/components/storefront/image-gallery";
import { PageShell } from "@/components/storefront/layout";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { useAvailability, usePrices } from "@/lib/catalog/queries";
import { normalizeSku } from "@/lib/catalog/schemas";
import { availabilityBySku, indexBySku } from "@/lib/catalog/selectors";
import { useCartStore } from "@/lib/store/use-cart-store";

import { isForbidden, isPriceUnavailable, isProductNotFound } from "../errors";
import { useCatalogGallery, useCatalogProduct } from "../queries";
import { imageFor, sortedImages } from "../selectors";
import { CatalogLoadError, SignInRequired } from "./catalog-states";
import { ProductPurchasePanel } from "./product-purchase-panel";

function ProductSkeleton() {
  return (
    <div role="status" aria-label="Đang tải sản phẩm" className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="aspect-square w-full rounded-[var(--r-lg)]" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

const crumbs = (title?: string) => [
  { label: "Trang chủ", href: APP_ROUTES.home },
  { label: "Sản phẩm", href: STORE_ROUTES.catalog.list },
  ...(title ? [{ label: title }] : []),
];

export function ProductDetailScreen({ slug }: { slug: string }) {
  const signedIn = useSignedIn();
  const enabled = signedIn === true;
  const product = useCatalogProduct(slug, enabled);
  const gallery = useCatalogGallery(slug, enabled);
  const variants = useMemo(() => product.data?.variants ?? [], [product.data]);
  const skus = variants.map((variant) => variant.sku);
  const stock = useAvailability(skus, enabled && variants.length > 0);
  const prices = usePrices(skus, enabled && variants.length > 0);
  const add = useCartStore((state) => state.add);

  const [picked, setPicked] = useState<string>();
  const [typedQuantity, setTypedQuantity] = useState<number>();

  if (signedIn === undefined || (enabled && product.isPending))
    return (
      <PageShell>
        <ProductSkeleton />
      </PageShell>
    );
  if (!signedIn) {
    return (
      <PageShell breadcrumbs={crumbs()}>
        <SignInRequired from={STORE_ROUTES.catalog.detail(slug)} />
      </PageShell>
    );
  }
  if (isProductNotFound(product.error)) {
    return (
      <PageShell breadcrumbs={crumbs()}>
        <EmptyState
          title="Sản phẩm không còn khả dụng"
          description="Sản phẩm này đã ngừng bán hoặc đường dẫn không đúng."
          action={
            <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={STORE_ROUTES.catalog.list}>Xem các sản phẩm khác</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }
  if (isPriceUnavailable(product.error)) {
    return (
      <PageShell breadcrumbs={crumbs()}>
        <EmptyState
          title="Sản phẩm tạm thời chưa có giá"
          description="Sản phẩm này chưa được niêm yết giá nên chưa đặt được. Hãy chat với Sales để được báo giá."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
                <Link href={STORE_ROUTES.chat.list}>Chat với Sales</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
                <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm khác</Link>
              </Button>
            </div>
          }
        />
      </PageShell>
    );
  }
  const data = product.data;
  if (!data) {
    return (
      <PageShell breadcrumbs={crumbs()}>
        <CatalogLoadError
          title="Không tải được sản phẩm"
          error={product.error}
          onRetry={() => void product.refetch()}
          retrying={product.isFetching}
        />
      </PageShell>
    );
  }

  const stockBySku = availabilityBySku(stock.data);
  const availabilityOf = (sku: string) =>
    stockBySku.get(normalizeSku(sku)) ??
    variants.find((variant) => normalizeSku(variant.sku) === normalizeSku(sku))?.availability;
  const sku =
    picked ??
    variants.find((variant) => availabilityOf(variant.sku) !== "OUT_OF_STOCK")?.sku ??
    variants[0]?.sku ??
    "";
  const schedule = indexBySku(prices.data).get(normalizeSku(sku));
  const quantity = typedQuantity ?? schedule?.moq ?? 1;
  const pricesState = prices.isPending
    ? "loading"
    : isForbidden(prices.error)
      ? "restricted"
      : prices.error
        ? "error"
        : "ready";

  // The chosen SKU's own picture leads; the rest follow in the BE's order.
  const lead = imageFor(gallery.data, sku);
  const images = [lead, ...sortedImages(gallery.data).filter((image) => image !== lead)]
    .filter((image) => image !== undefined)
    .map((image) => ({ src: image.url, alt: image.altText ?? data.title }));

  return (
    <PageShell breadcrumbs={crumbs(data.title)}>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
        <div className="lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
          <ImageGallery key={sku} images={images} />
        </div>
        <div className="min-w-0 space-y-5">
          <div className="space-y-3">
            <h1 className="font-display text-ink-primary text-2xl font-bold tracking-tight sm:text-3xl">
              {data.title}
            </h1>
            {data.description ? (
              <p className="text-ink-secondary text-sm whitespace-pre-line sm:text-base">
                {data.description}
              </p>
            ) : null}
          </div>
          {variants.length === 0 ? (
            <EmptyState title="Sản phẩm chưa có phiên bản để đặt" />
          ) : (
            <ProductPurchasePanel
              variants={variants}
              sku={sku}
              onSkuChange={(next) => {
                setPicked(next);
                setTypedQuantity(undefined);
              }}
              availabilityOf={availabilityOf}
              schedule={schedule}
              pricesState={pricesState}
              quantity={quantity}
              onQuantityChange={setTypedQuantity}
              designHref={
                data.kind === "CUSTOMIZABLE" ? STORE_ROUTES.design.newFor(data.slug, sku) : null
              }
              onAdd={() => {
                add(
                  {
                    sku,
                    slug: data.slug,
                    title: data.title,
                    ...(lead ? { imageUrl: lead.url } : {}),
                  },
                  quantity,
                );
                toast.success("Đã thêm vào giỏ hàng", `${data.title} · ${sku} × ${quantity}`);
              }}
            />
          )}
        </div>
      </section>
    </PageShell>
  );
}
