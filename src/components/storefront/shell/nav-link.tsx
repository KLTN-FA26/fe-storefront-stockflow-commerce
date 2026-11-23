"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Whether `href` is the page the customer is on: the exact path, or a page below it (`/design` covers
 * `/design/projects`, unless a more specific link of the same nav owns it, which `isCurrentLink` decides).
 */
export function isCurrentPath(pathname: string | null, href: string): boolean {
  if (!pathname || href === "/" || href.includes("#")) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific link of a nav that matches the current page, so a parent does not light up with its child. */
export function currentHref(pathname: string | null, hrefs: readonly string[]): string | null {
  const matches = hrefs.filter((href) => isCurrentPath(pathname, href));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

type NavLinkProps = Omit<ComponentProps<typeof Link>, "href" | "className"> & {
  href: string;
  /** Every href of the same nav, to pick the most specific current one. */
  siblings: readonly string[];
  className: string;
  currentClassName: string;
  idleClassName: string;
};

/**
 * A nav link that says where the customer is (WCAG 2.4.8 / H1): `aria-current="page"` and the current style on the
 * page's own link only. It replaces a fixed accent colour that made one link look selected on every page.
 */
export function NavLink({
  href,
  siblings,
  className,
  currentClassName,
  idleClassName,
  ...rest
}: NavLinkProps) {
  const current = currentHref(usePathname(), siblings) === href;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(className, current ? currentClassName : idleClassName)}
      {...rest}
    />
  );
}
