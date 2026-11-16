"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import { useStudio } from "./studio-context";
import { useLeaveGuard } from "./use-leave-guard";

/**
 * The header's way back: to the design list, or to the project page when the design belongs to a
 * project (the label says which). While an edit is not stored yet (`unsaved`) it asks first
 * (`useLeaveGuard`, shared with the project crumb).
 */
export function StudioBackLink({ unsaved }: { unsaved: boolean }) {
  const { design } = useStudio();
  const { project } = design;
  const { guard, dialog } = useLeaveGuard(unsaved);
  const back = project ? STORE_ROUTES.design.project(project.id) : STORE_ROUTES.design.list;

  return (
    <>
      <Button
        asChild
        variant="ghost"
        className="min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)] px-3"
      >
        <Link href={back} onClick={guard(back)}>
          <ArrowLeft aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1.5">
            {project ? "Dự án" : "Thiết kế của tôi"}
          </span>
        </Link>
      </Button>
      {dialog}
    </>
  );
}
