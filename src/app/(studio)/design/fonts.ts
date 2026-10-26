import {
  Be_Vietnam_Pro,
  Dancing_Script,
  Lobster,
  Montserrat,
  Oswald,
  Pacifico,
  Playfair_Display,
  Roboto_Slab,
} from "next/font/google";

import type { FontRegistry } from "@/features/product-design/engine";

// The studio's text fonts, self-hosted by next/font. Only the studio route imports this module:
// next/font cannot run under Vitest, and the storefront must not pay for eight font families.
// `latin` is listed beside `vietnamese` because Google's `vietnamese` subset holds only the accented
// letters: without it every plain letter of a Vietnamese text would fall back to the system font.
// `preload: false`: the canvas asks for a face when it draws text, so the browser fetches the faces
// a design uses, not all of them up front. Options must be literals (next/font reads them statically).

// Static faces: weights and italics are listed explicitly.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const lobster = Lobster({
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
  preload: false,
});
const pacifico = Pacifico({
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
  preload: false,
});

// Variable faces: one file covers regular and bold.
const montserrat = Montserrat({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const robotoSlab = Roboto_Slab({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
});
const oswald = Oswald({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
});
const dancingScript = Dancing_Script({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
});

/** `italic` is true only for the families that ship an italic face (and are asked for it above). */
export const STUDIO_FONTS: FontRegistry = {
  "be-vietnam-pro": {
    label: "Be Vietnam Pro",
    family: beVietnamPro.style.fontFamily,
    italic: true,
  },
  montserrat: { label: "Montserrat", family: montserrat.style.fontFamily, italic: true },
  "roboto-slab": { label: "Roboto Slab", family: robotoSlab.style.fontFamily, italic: false },
  "playfair-display": {
    label: "Playfair Display",
    family: playfairDisplay.style.fontFamily,
    italic: true,
  },
  oswald: { label: "Oswald", family: oswald.style.fontFamily, italic: false },
  "dancing-script": {
    label: "Dancing Script",
    family: dancingScript.style.fontFamily,
    italic: false,
  },
  lobster: { label: "Lobster", family: lobster.style.fontFamily, italic: false },
  pacifico: { label: "Pacifico", family: pacifico.style.fontFamily, italic: false },
};
