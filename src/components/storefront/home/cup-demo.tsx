"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Hand } from "lucide-react";

import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";

import {
  ARTWORK_ASPECT,
  BADGE_TEXT_MAX,
  DEFAULT_BADGE_TEXT,
  DEMO_SWATCHES,
  drawCupArtwork,
  readToken,
} from "./cup-demo-artwork";

// three.js and the model load only here, after the page has rendered.
const CupDemo3D = dynamic(() => import("./cup-demo-3d"), {
  ssr: false,
  loading: () => <StageNote>Đang tải ly 3D…</StageNote>,
});

function StageNote({ children }: { children: string }) {
  return (
    <div className="text-ink-tertiary absolute inset-0 flex items-center justify-center text-sm">
      {children}
    </div>
  );
}

/**
 * "Try it" on the home page: the visitor types the shop's name and picks a print colour; the flat 2D band and the
 * turning 3D sample cup redraw at once, the way the design studio works. A demo only: nothing is saved or sent.
 */
export function CupDemo() {
  const hydrated = useHydrated();
  const [picked, setPicked] = useState(0);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const sheetRef = useRef<HTMLCanvasElement>(null);
  // Theme tokens resolve in the browser only (light and dark give other blues).
  const ink = hydrated ? readToken(DEMO_SWATCHES[picked]?.token ?? "--accent") : "";

  useEffect(() => {
    if (sheetRef.current && ink) drawCupArtwork(sheetRef.current, ink, name);
  }, [ink, name]);

  return (
    <section aria-labelledby="cup-demo-title" className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 id="cup-demo-title" className="font-display text-ink-primary text-2xl font-bold tracking-tight sm:text-3xl">
            Thử in tên quán lên ly
          </h2>
          <p className="text-ink-secondary max-w-[48ch] text-sm leading-6">
            Gõ tên quán và chọn màu in: khuôn 2D và ly 3D đổi theo ngay, giống cách studio thiết kế
            làm việc với logo thật của bạn.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="cup-demo-name">Tên quán</Label>
            <Input
              id="cup-demo-name"
              value={name}
              maxLength={BADGE_TEXT_MAX}
              placeholder={`Ví dụ: Hạt Nâu (mặc định ${DEFAULT_BADGE_TEXT})`}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11"
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-ink-primary mb-1.5 text-sm font-medium">Màu in</legend>
            <div className="flex gap-1">
              {DEMO_SWATCHES.map((swatch, index) => (
                <button
                  key={swatch.token}
                  type="button"
                  aria-label={swatch.name}
                  aria-pressed={index === picked}
                  onClick={() => setPicked(index)}
                  className={cn(
                    "focus-visible:ring-accent flex size-11 items-center justify-center rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    index === picked ? "border-ink-primary" : "border-transparent",
                  )}
                >
                  <span className="size-7 rounded-full" style={{ backgroundColor: `var(${swatch.token})` }} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <figure className="space-y-2">
          <canvas
            ref={sheetRef}
            width={900}
            height={Math.round(900 / ARTWORK_ASPECT)}
            role="img"
            aria-label="Khuôn in 2D của ly: dải in trải phẳng với tên quán ở hai mặt"
            className="border-border-default bg-bg-surface block h-auto w-full rounded-[var(--r-md)] border"
          />
          <figcaption className="text-ink-tertiary text-xs">Khuôn in 2D, trải phẳng quanh thân ly 12oz</figcaption>
        </figure>
      </div>

      <figure className="space-y-2">
        <div className="bg-bg-subtle relative aspect-[4/3] overflow-hidden rounded-[var(--r-xl)]">
          {failed ? (
            <StageNote>Trình duyệt này chưa xem được 3D. Khuôn 2D bên cạnh vẫn đổi theo.</StageNote>
          ) : ink ? (
            <CupDemo3D ink={ink} text={name} onFail={onFail} />
          ) : null}
          <span className="bg-bg-surface text-ink-primary absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-[var(--sh-sm)]">
            <Box className="text-accent size-3.5" aria-hidden="true" />
            Xem trước 3D
          </span>
          {failed ? null : (
            <span className="text-ink-tertiary absolute right-3 bottom-3 inline-flex items-center gap-1.5 text-xs">
              <Hand className="size-3.5" aria-hidden="true" />
              Kéo để xoay
            </span>
          )}
        </div>
        <figcaption className="text-ink-tertiary text-xs">
          Hình xem trước chỉ để tham khảo: màu in thực tế có thể khác trên màn hình.
        </figcaption>
      </figure>
    </section>
  );
}
