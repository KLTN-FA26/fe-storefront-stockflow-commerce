import type { DesignDocument, DesignElement, Hex, SurfaceContent } from "../../document/schema";
import { bagSheet, type BagSheet } from "../../surfaces/bag-sheet";
import { elementOutline, type ElementSizer } from "../../geometry/element";
import type { PointMm } from "../../geometry/types";
import type { PreflightLevel, PreflightReport } from "../../preflight/types";
import type { FontRegistry } from "../../render/fonts";
import type { PrintSurface, SurfaceSet } from "../../surfaces/types";
import type { CustomizationTemplate, MaterialKind, PrintArea } from "../../template/schema";
import { pathBounds } from "../pdf-path";

/** One printed element as the producer reads it: what it is, where, how big and in which colours. */
export type BriefElement = {
  /** 1-based on its print area, as the print file's layers number it. */
  number: number;
  kind: string;
  content: string;
  /** From the rim (a cup) or the print area's top edge, to the element's centre, in mm. */
  fromTopMm: number;
  /** From the centre line (the cup's front, the face's middle) to the element's centre; − is left. */
  acrossMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  colors: Hex[];
  font?: string;
  warnings: string[];
  /** The element's outline in the area's flat mm, and its centre there. */
  outline: PointMm[];
  centre: PointMm;
};

export type BriefArea = {
  code: string;
  name: string;
  surface: PrintSurface;
  trimMm: { width: number; height: number };
  bleedMm: number;
  safeMm: number;
  /** "miệng ly" or "mép trên vùng in": what `fromTopMm` is measured from. */
  topLabel: string;
  /** "giữa mặt trước" or "giữa <area>": what `acrossMm` is measured from. */
  centreLabel: string;
  background: string;
  elements: BriefElement[];
};

export type BriefColor = { hex: Hex; uses: string[] };
export type BriefIssue = { level: PreflightLevel; where: string; message: string };

/** The design brief: what the producer prepresses from, beside the print file. */
export type DesignBrief = {
  title: string;
  product: string;
  templateCode: string;
  sku: string;
  material: string;
  materialNote: string;
  /**
   * Printed on the formed product (a clear PET cup): not die-cut, and the print file carries a
   * white-ink underlay under the colours.
   */
  formed: boolean;
  dimensions: string;
  /** A paper bag's flat sheet: its print file is one page with the four sides laid on it. */
  sheet?: BagSheet;
  version: number;
  exportedAt: string;
  checksum: string;
  areas: BriefArea[];
  colors: BriefColor[];
  issues: BriefIssue[];
};

const MATERIALS: Record<MaterialKind, { label: string; note: string }> = {
  "paper-white": {
    label: "Giấy trắng",
    note: "Màu trắng trong thiết kế là màu giấy: không in mực trắng.",
  },
  kraft: {
    label: "Giấy kraft",
    note: "Giấy nâu làm màu in tối đi; chỗ trắng và màu sáng cần lót mực trắng bên dưới.",
  },
  "kraft-brown": {
    label: "Giấy kraft nâu",
    note: "Giấy nâu làm màu in tối đi; chỗ trắng và màu sáng cần lót mực trắng bên dưới.",
  },
  "kraft-white": {
    label: "Giấy kraft trắng",
    note: "Màu trắng trong thiết kế là màu giấy: không in mực trắng.",
  },
  "pet-clear": {
    label: "Nhựa PET trong",
    note: "Ly trong: lót mực trắng dưới mọi phần có màu; chỗ không in để trong; hình mặt sau nhìn xuyên qua thành ly.",
  },
};

const mm = (value: number) => (Math.round(value * 10) / 10).toLocaleString("vi-VN");

function dimensionsOf(template: CustomizationTemplate): string {
  const { model } = template;
  if (model.kind === "parametric-cup") {
    return `Miệng Ø${mm(model.topDiameterMm)} · đáy Ø${mm(model.bottomDiameterMm)} · cao ${mm(model.heightMm)} mm; dải in cách miệng ${mm(model.bandTopOffsetMm)} mm, cách đáy ${mm(model.bandBottomOffsetMm)} mm; mép dán ${mm(model.seamMm)} mm`;
  }
  if (model.kind === "parametric-bag") {
    const sheet = bagSheet(model, template.printAreas);
    return `Rộng ${mm(model.widthMm)} · hông ${mm(model.gussetMm)} · cao ${mm(model.heightMm)} mm; gấp miệng ${mm(model.topFoldMm)} mm, mép dán ${mm(sheet.glueFlapMm)} mm, gấp đáy ${mm(sheet.bottomFoldMm)} mm${sheet.assumed ? " (giả định)" : ""}`;
  }
  return "Theo mô hình của mẫu";
}

/** The `u` of the centre line: the cup's front (where the sector's upright is 0), a face's middle. */
function centreU(surface: PrintSurface, seamMm: number): number {
  if (surface.kind === "sector") {
    // `upright` grows linearly with `u`: two samples give the `u` where it is 0.
    const [a, b] = [surface.toFlat(0, 0).uprightRad, surface.toFlat(1, 0).uprightRad];
    return -a / (b - a);
  }
  return (surface.uRange[0] + surface.uRange[1] - seamMm) / 2;
}

function describe(el: DesignElement, fonts: FontRegistry) {
  switch (el.type) {
    case "image":
      return { kind: "Ảnh / logo", content: "Ảnh khách tải lên (tệp gốc trong gói)", colors: [] };
    case "drawing":
      return {
        kind: "Nét vẽ tay",
        content: `${el.strokes.length} nét`,
        colors: el.strokes.flatMap((s) => (s.mode === "draw" ? [s.color] : [])),
      };
    case "text": {
      const style = [el.bold ? "đậm" : "", el.italic ? "nghiêng" : ""].filter(Boolean).join(", ");
      const label = fonts[el.fontCode]?.label ?? el.fontCode;
      return {
        kind: "Chữ",
        content: `“${el.content.replace(/\s+/g, " ").trim()}”`,
        colors: el.outline ? [el.color, el.outline.color] : [el.color],
        font: `${label}${style ? `, ${style}` : ""}, ${mm(el.sizePt)} pt`,
      };
    }
  }
}

function backgroundOf(content: SurfaceContent | undefined): string {
  const background = content?.background;
  if (!background || background.kind === "none") return "Không có nền (để màu vật liệu)";
  if (background.kind === "color")
    return `Màu trơn ${background.color} phủ toàn vùng in, tràn ra lề`;
  return `Hoạ tiết ${background.patternId}, màu ${background.colors.join(" và ")}`;
}

/**
 * The brief of a design: per print area, every printed element (hidden ones are not printed) with
 * its centre measured the way a shop measures it (from the rim or top edge, across from the centre
 * line), its size, rotation, colours and font; the colours and where each is used; the checks the
 * customer accepted. Pure: the studio draws it (`drawBriefPage`) and the PDF is its pages.
 */
export function buildDesignBrief(input: {
  title: string;
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  document: DesignDocument;
  report: PreflightReport;
  sizer: ElementSizer;
  fonts: FontRegistry;
  version: number;
  exportedAt: string;
  checksum: string;
}): DesignBrief {
  const { template, surfaces, document, report, sizer, fonts } = input;
  const cup = template.model.kind === "parametric-cup" ? template.model : null;
  const material = template.model.kind === "gltf" ? null : MATERIALS[template.model.material];
  const colors = new Map<Hex, Set<string>>();
  const use = (hex: Hex, where: string) =>
    colors.set(hex, (colors.get(hex) ?? new Set()).add(where));
  const where = new Map<string, string>();

  const areas = template.printAreas.flatMap((area: PrintArea): BriefArea[] => {
    const surface = surfaces.byCode[area.code];
    if (!surface) return [];
    const content = document.surfaces[area.code];
    const u0 = centreU(surface, cup?.seamMm ?? 0);
    const top = cup ? 0 : surface.vRange[0];
    const background = content?.background;
    if (background?.kind === "color") use(background.color, `Nền · ${area.name}`);
    if (background?.kind === "pattern")
      for (const c of background.colors) use(c, `Nền · ${area.name}`);

    const elements = (content?.elements ?? [])
      .filter((el) => !el.hidden)
      .map((el, i): BriefElement => {
        const number = i + 1;
        const box = sizer(el);
        const { u, v, rotationDeg, scale } = el.placement;
        const info = describe(el, fonts);
        for (const hex of info.colors) use(hex, `${number} · ${info.kind} · ${area.name}`);
        where.set(el.id, `${number} · ${info.kind} · ${area.name}`);
        const at = surface.toFlat(u, v);
        return {
          number,
          kind: info.kind,
          content: info.content,
          fromTopMm: v - top,
          acrossMm: u - u0,
          widthMm: box.width * scale,
          heightMm: box.height * scale,
          rotationDeg,
          colors: [...new Set(info.colors)],
          ...(info.font ? { font: info.font } : {}),
          warnings: report.issues.filter((x) => x.elementId === el.id).map((x) => x.message),
          outline: elementOutline(el, surface, box),
          centre: { x: at.x, y: at.y },
        };
      });
    const trim = pathBounds(surface.outline("trim"));
    return [
      {
        code: area.code,
        name: area.name,
        surface,
        trimMm: { width: trim.width, height: trim.height },
        bleedMm: area.bleedMm,
        safeMm: area.safeMarginMm,
        topLabel: cup ? "miệng ly" : "mép trên vùng in",
        centreLabel: cup ? "giữa mặt trước" : `giữa ${area.name.toLocaleLowerCase("vi")}`,
        background: backgroundOf(content),
        elements,
      },
    ];
  });

  const areaName = new Map(template.printAreas.map((a) => [a.code, a.name]));
  return {
    title: input.title,
    product: template.name,
    templateCode: template.code,
    sku: template.sku,
    material: material?.label ?? "Theo mẫu",
    materialNote: material?.note ?? "",
    formed: cup?.material === "pet-clear",
    dimensions: dimensionsOf(template),
    ...(template.model.kind === "parametric-bag"
      ? { sheet: bagSheet(template.model, template.printAreas) }
      : {}),
    version: input.version,
    exportedAt: input.exportedAt,
    checksum: input.checksum,
    areas,
    colors: [...colors].map(([hex, uses]) => ({ hex, uses: [...uses] })),
    issues: report.issues.map((issue) => ({
      level: issue.level,
      where:
        (issue.elementId && where.get(issue.elementId)) ||
        (issue.surfaceCode && areaName.get(issue.surfaceCode)) ||
        "Toàn thiết kế",
      message: issue.message,
    })),
  };
}
