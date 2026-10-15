import { Search } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type HeaderSearchProps = { className?: string | undefined };

export function HeaderSearch({ className }: HeaderSearchProps) {
  return (
    <form
      role="search"
      method="get"
      action={STORE_ROUTES.catalog.list}
      className={cn(
        "bg-bg-subtle ring-border-default focus-within:ring-accent flex h-11 w-full items-center rounded-[var(--r-md)] ring-1 ring-inset focus-within:ring-2",
        className,
      )}
    >
      <Input
        type="search"
        name="q"
        aria-label="Tìm sản phẩm"
        placeholder="Tìm áo, cốc, ấn phẩm…"
        className="text-ink-primary placeholder:text-ink-tertiary h-full flex-1 rounded-[var(--r-md)] border-0 bg-transparent pl-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="submit"
        variant="ghost"
        aria-label="Tìm kiếm"
        className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent size-11 shrink-0 rounded-[var(--r-md)] focus-visible:ring-2"
      >
        <Search className="size-5" aria-hidden="true" />
      </Button>
    </form>
  );
}
