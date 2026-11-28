"use client";

import { useState } from "react";

import { useDesignableCatalogue } from "@/app/(storefront)/design/designable-products";
import { NewDesignDialog } from "@/features/product-design/components/new-design-dialog";
import { LauncherMissingProduct } from "@/features/product-design/components/launcher-states";

/**
 * `/design/new` without a product or SKU: instead of sending the customer back to the catalogue, the "Thiết kế mới" dialog
 * opens at once (S08-11). Closing it leaves the page saying what is missing, with a button to open it again; choosing a
 * product and variant goes on to the launcher with them. A project the link names (`?project=`) is kept.
 */
export function NewDesignChooser({ projectId }: { projectId?: string | undefined }) {
  const catalogue = useDesignableCatalogue();
  const [open, setOpen] = useState(true);
  return (
    <>
      <LauncherMissingProduct onChoose={() => setOpen(true)} />
      <NewDesignDialog
        catalogue={catalogue}
        open={open}
        onOpenChange={setOpen}
        {...(projectId ? { projectId } : {})}
      />
    </>
  );
}
