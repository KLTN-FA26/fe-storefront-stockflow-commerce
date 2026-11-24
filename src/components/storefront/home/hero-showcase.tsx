/** The artboard's dot pattern; the picture is shown once per page (the home hero). */
const DOTS_ID = "home-hero-dots";

/**
 * The hero's picture of what the shop does, on a dotted artboard like the design studio's canvas: on the left the
 * cup's print laid flat, its logo selected for editing (dashed box, handles, cursor) — the 2D design; on the right the
 * same print on a cup drawn in three-quarter view (elliptic rim and base, sleeve following the curve) — the 3D
 * preview. Theme tokens only, so it follows light and dark mode.
 */
export function HeroShowcase() {
  const dots = DOTS_ID;
  return (
    <div className="bg-bg-surface border-border-default overflow-hidden rounded-[var(--r-xl)] border shadow-[var(--sh-md)]">
      <svg
        viewBox="0 0 600 440"
        role="img"
        aria-label="Thiết kế logo trên khuôn in 2D, xem trước trên ly 3D"
        className="block h-auto w-full"
      >
        <defs>
          <pattern id={dots} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" className="fill-border-default" />
          </pattern>
        </defs>
        <rect width="600" height="440" fill={`url(#${dots})`} />

        {/* 2D: the print band laid flat, the logo selected for editing */}
        <g transform="translate(14 40) rotate(-7 170 190)">
          <path
            d="M95 125 A200 200 0 0 0 245 125 L294 246 A330 330 0 0 1 46 246 Z"
            className="fill-bg-surface stroke-border-strong"
            strokeWidth="2"
          />
          <path
            d="M80 162 A240 240 0 0 0 260 162 L283 215 A290 290 0 0 1 57 215 Z"
            className="fill-accent"
          />
          <circle cx="170" cy="196" r="22" className="fill-bg-surface" />
          <text x="170" y="200" textAnchor="middle" fontSize={10} className="fill-accent font-display font-bold">
            LOGO
          </text>
          <rect x="142" y="168" width="56" height="56" fill="none" strokeWidth="1.5" strokeDasharray="4 3" className="stroke-ink-primary" />
          {[
            [142, 168],
            [198, 168],
            [142, 224],
            [198, 224],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={(x ?? 0) - 4} y={(y ?? 0) - 4} width="8" height="8" className="fill-bg-surface stroke-ink-primary" strokeWidth="1.5" />
          ))}
          <path d="M204 230 L204 252 L210 246 L215 257 L219 255 L214 244 L222 244 Z" className="fill-ink-primary stroke-bg-surface" strokeWidth="1.5" strokeLinejoin="round" />
        </g>

        {/* the step from the sheet to the cup */}
        <path d="M300 168 C320 140 336 136 352 144" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" className="stroke-accent" />
        <path d="M344 134 L356 146 L340 150" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />

        {/* 3D: the printed cup, three-quarter view */}
        <ellipse cx="452" cy="382" rx="92" ry="13" className="fill-ink-primary opacity-[0.1]" />
        <path d="M370 112 L390 370 A62 12 0 0 0 514 370 L534 112 Z" className="fill-bg-surface stroke-border-strong" strokeWidth="2" />
        <path d="M376.2 192 Q452 221.6 527.8 192 L520.9 282 Q452 308.8 383.1 282 Z" className="fill-accent" />
        <ellipse cx="452" cy="246" rx="27" ry="29" className="fill-bg-surface" />
        <text x="452" y="250" textAnchor="middle" fontSize={12} className="fill-accent font-display font-bold">
          LOGO
        </text>
        {/* the side turning away from the light */}
        <path d="M498 112 L534 112 L514 370 A62 12 0 0 1 496 380 Z" className="fill-ink-primary opacity-[0.07]" />
        {/* rim and opening */}
        <ellipse cx="452" cy="112" rx="86" ry="17" className="fill-bg-surface stroke-border-strong" strokeWidth="2" />
        <ellipse cx="452" cy="112" rx="76" ry="12" className="fill-bg-muted" />

        {/* what each side is: one row, same size, each centred under its picture (sheet ≈ x 184, cup x 452) */}
        <g className="font-display">
          <rect x="122" y="398" width="124" height="30" rx="15" className="fill-bg-surface stroke-border-default" strokeWidth="1.5" />
          <text x="184" y="418" textAnchor="middle" fontSize={13} className="fill-ink-primary font-semibold">
            Thiết kế 2D
          </text>
          <rect x="390" y="398" width="124" height="30" rx="15" className="fill-bg-surface stroke-border-default" strokeWidth="1.5" />
          <text x="452" y="418" textAnchor="middle" fontSize={13} className="fill-ink-primary font-semibold">
            Xem trước 3D
          </text>
        </g>
      </svg>
    </div>
  );
}
