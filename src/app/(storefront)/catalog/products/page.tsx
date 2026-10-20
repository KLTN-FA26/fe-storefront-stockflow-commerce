import { redirect } from "next/navigation";

import { STORE_ROUTES } from "@/constants";

/** /catalog/products alone has no page of its own: it is the catalogue. */
export default function CatalogProductsIndex() {
  redirect(STORE_ROUTES.catalog.list);
}
