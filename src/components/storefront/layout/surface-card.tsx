import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type SurfaceCardProps = {
  as?: "div" | "section" | "article" | "aside" | undefined;
  padded?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
};

export function SurfaceCard({
  as: Tag = "div",
  padded = true,
  className,
  children,
}: SurfaceCardProps) {
  return (
    <Tag
      className={cn(
        "bg-bg-surface border-border-default rounded-[var(--r-lg)] border shadow-[var(--card-shadow)]",
        padded && "p-[var(--card-pad)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
