import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export type BreadcrumbItem = { label: string; href?: string | undefined };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="text-ink-tertiary flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="hover:text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className="text-ink-secondary inline-flex min-h-11 items-center"
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="size-4" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
