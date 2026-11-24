import { BRAND } from "@/constants";

/**
 * The abstract artwork of the sign-in panel: three oversized cup silhouettes rising out of the bottom edge, a round
 * "logo" stamped across them, and a die-line arc sweeping over: your logo, on every cup. Shapes only, in the panel's
 * ink (`currentColor`), so it follows the theme. Decoration: hidden from assistive technology.
 */
export function AuthArtwork() {
  return (
    <svg
      viewBox="0 0 600 600"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {/* Die-line arc: the top edge of a flat cup wrap. */}
      <path
        d="M-40 300 A520 520 0 0 1 640 140"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeDasharray="10 9"
      />

      {/* Cups, back to front. */}
      <path d="M250 330 L410 330 L392 640 L268 640 Z" fill="currentColor" fillOpacity="0.08" />
      <rect x="240" y="312" width="180" height="22" rx="11" fill="currentColor" fillOpacity="0.12" />

      <path d="M430 250 L620 250 L598 640 L452 640 Z" fill="currentColor" fillOpacity="0.14" />
      <rect x="418" y="228" width="214" height="26" rx="13" fill="currentColor" fillOpacity="0.2" />

      <path
        d="M330 420 L500 420 L482 640 L348 640 Z"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* The stamped logo: the one solid shape on the panel. */}
      <circle cx="470" cy="420" r="74" fill="currentColor" />
      <circle cx="470" cy="420" r="74" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" transform="translate(14 14)" />
      {/* The wordmark, as on the home page, stamped on the badge inside a dotted ring. */}
      <circle cx="470" cy="420" r="62" fill="none" className="stroke-accent" strokeWidth="2" strokeDasharray="2 5" />
      <text
        x="470"
        y="426"
        textAnchor="middle"
        className="font-display"
        fontSize="19"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        <tspan className="fill-ink-primary">{BRAND.wordmark.primary}</tspan>
        <tspan className="fill-accent">{BRAND.wordmark.accent}</tspan>
      </text>

    </svg>
  );
}
