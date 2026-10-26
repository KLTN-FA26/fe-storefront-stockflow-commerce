"use client";

import { Check, Copy, Monitor } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

/**
 * The studio is for a computer only. Below Tailwind's `lg` (64rem, 1024 px) the window is too
 * narrow; in rem, so it switches where the `lg:` classes do.
 */
const NARROW_QUERY = "(max-width: 63.99rem)";
/** A screen driven by fingers, with no mouse to hover: a phone or a tablet, at any width. */
const TOUCH_QUERY = "(pointer: coarse) and (hover: none)";
const QUERIES = [NARROW_QUERY, TOUCH_QUERY];

/** A tablet by its browser: iPadOS Safari says "Macintosh", and only its touch points tell it apart. */
function isTabletBrowser(): boolean {
  const agent = navigator.userAgent;
  return (
    /\b(iPad|Android|Tablet|Kindle|Silk)\b/i.test(agent) ||
    (/\bMacintosh\b/.test(agent) && navigator.maxTouchPoints > 1)
  );
}

/** Whether this device may open the studio; "unknown" while the page is server-rendered. */
type DeviceFit = "desktop" | "unsupported" | "unknown";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const lists = QUERIES.map((query) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener("change", onChange));
  return () => lists.forEach((list) => list.removeEventListener("change", onChange));
}

// A browser without `matchMedia` (a test DOM) is judged by its user agent alone.
const clientFit = (): DeviceFit =>
  (typeof window.matchMedia === "function" &&
    QUERIES.some((query) => window.matchMedia(query).matches)) ||
  isTabletBrowser()
    ? "unsupported"
    : "desktop";

/** The fit of the device, following the window as it is resized. */
function useDeviceFit(): DeviceFit {
  return useSyncExternalStore(subscribe, clientFit, () => "unknown");
}

type CopyState = "idle" | "copied" | "failed";

/** The page's link, to open on a computer. */
function CopyLinkButton() {
  const [state, setState] = useState<CopyState>("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the address bar still has it.
      setState("failed");
    }
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        className="min-h-11 rounded-[var(--r-md)] px-4"
        onClick={() => void copy()}
      >
        {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "copied" ? "Đã sao chép liên kết" : "Sao chép liên kết"}
      </Button>
      <p role="status" className="text-ink-tertiary text-xs">
        {state === "failed" ? "Không sao chép được. Hãy sao chép địa chỉ trên trình duyệt." : ""}
      </p>
    </div>
  );
}

/** What a phone, a tablet or a window narrower than 1024 px sees instead of the studio. */
function DesktopOnlyNotice({ className }: { className?: string | undefined }) {
  return (
    <main className={cn("flex flex-1 items-center justify-center p-4", className)}>
      <EmptyState
        icon={<Monitor aria-hidden className="size-8" />}
        title="Chức năng thiết kế chỉ hỗ trợ trên máy tính"
        description="Hãy mở trang này trên máy tính hoặc laptop, với cửa sổ rộng từ 1024px. Điện thoại và máy tính bảng chưa được hỗ trợ."
        className="w-full max-w-md border-solid shadow-[var(--sh-sm)]"
        action={
          <div className="flex flex-col items-center gap-1">
            <CopyLinkButton />
            <Button asChild variant="ghost" className="min-h-11 rounded-[var(--r-md)] px-4">
              <Link href={STORE_ROUTES.design.list}>Thiết kế của tôi</Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}

/**
 * The studio and its launcher on a computer with a window at least 1024 px wide; a notice on a
 * phone, a tablet or a narrower window. Once the studio has opened it stays mounted, hidden behind
 * the notice, while the window is too narrow, so narrowing a desktop window loses no edit.
 */
export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const fit = useDeviceFit();
  const [opened, setOpened] = useState(false);
  if (fit === "desktop" && !opened) setOpened(true);

  return (
    <>
      {fit === "desktop" ? null : (
        // Server-rendered before the width is known: CSS hides the notice on a wide screen.
        <DesktopOnlyNotice className={fit === "unknown" ? "lg:hidden" : undefined} />
      )}
      {opened ? (
        <div hidden={fit !== "desktop"} className={fit === "desktop" ? "contents" : undefined}>
          {children}
        </div>
      ) : null}
    </>
  );
}
