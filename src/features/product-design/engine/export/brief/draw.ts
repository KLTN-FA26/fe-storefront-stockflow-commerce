import { BRIEF_PAGE_MM, type BriefPage } from "./layout";
import type { BriefArea, BriefElement, DesignBrief } from "./model";
import { createPen, type BriefCtx, type BriefStyle, type Pen } from "./pen";

/** Pictures the studio draws for the brief: the 3D preview and each area's flat artwork. */
export type BriefImages = {
  preview?: CanvasImageSource;
  art(code: string): CanvasImageSource | undefined;
};

const M = 14;
const W = BRIEF_PAGE_MM.width - 2 * M;
const SMALL = 2.8;
const BODY = 3.2;
const ROW_H = 10;

const mm = (value: number) => (Math.round(value * 10) / 10).toLocaleString("vi-VN");

function frame(
  pen: Pen,
  brief: DesignBrief,
  index: number,
  count: number,
  heading: string,
  sub: string,
) {
  pen.text(M, 11, `MÔ TẢ THIẾT KẾ  ·  ${brief.title}`, SMALL, { bold: true, alpha: 0.7 });
  pen.text(BRIEF_PAGE_MM.width - M, 11, `Trang ${index + 1}/${count}`, SMALL, {
    alpha: 0.7,
    align: "right",
  });
  pen.stroke(
    [
      [M, 14],
      [M + W, 14],
    ],
    { alpha: 0.2 },
  );
  pen.text(M, 25, heading, 6, { bold: true });
  if (sub) pen.para(M, 31, W, sub, BODY, { alpha: 0.7 }, 1);
  const foot = BRIEF_PAGE_MM.height - 10;
  pen.stroke(
    [
      [M, foot - 4],
      [M + W, foot - 4],
    ],
    { alpha: 0.2 },
  );
  pen.text(
    M,
    foot,
    "Mô tả ý đồ thiết kế để nhà sản xuất chế bản. Kích thước thật lấy theo file in PRINT_READY; màu chốt theo bản in thử.",
    2.4,
    { alpha: 0.6 },
  );
  pen.text(
    M + W,
    foot,
    `Phiên bản ${brief.version} · ${brief.exportedAt} · SHA-256 ${brief.checksum.slice(0, 16)}`,
    2.4,
    { alpha: 0.6, align: "right" },
  );
}

function kv(
  pen: Pen,
  x: number,
  y: number,
  rows: [string, string][],
  labelW: number,
  valueW: number,
) {
  let at = y;
  for (const [label, value] of rows) {
    pen.text(x, at, label, BODY, { alpha: 0.65 });
    at = Math.max(at + 6, pen.para(x + labelW, at, valueW, value, BODY, {}, 3) + 1.6);
  }
  return at;
}

function overview(pen: Pen, brief: DesignBrief, images: BriefImages, ctx: BriefCtx) {
  const areas = brief.areas
    .map((a) => `${a.name} ${mm(a.trimMm.width)} × ${mm(a.trimMm.height)} mm`)
    .join("; ");
  let y = kv(
    pen,
    M,
    42,
    [
      ["Tên thiết kế", brief.title],
      ["Sản phẩm", `${brief.product} (mẫu ${brief.templateCode})`],
      ["SKU gốc", brief.sku],
      ["SKU riêng của khách", "Sinh khi duyệt"],
      ["Vật liệu", brief.material],
      ["Kích thước", brief.dimensions],
      ["Vùng in (thành phẩm)", areas],
    ],
    42,
    95,
  );
  y += 4;
  pen.text(M, y, "Nội dung in", 4, { bold: true });
  y += 6;
  for (const area of brief.areas) {
    y = pen.para(M, y, 137, `${area.name}: ${area.background}`, BODY, { bold: true }, 2);
    for (const el of area.elements.slice(0, 6)) {
      pen.badge(M + 3, y - 1.1, el.number, 2);
      y = pen.para(M + 8, y, 129, `${el.kind}: ${el.content}`, BODY, {}, 1);
    }
    if (area.elements.length > 6)
      y = pen.para(
        M + 8,
        y,
        129,
        `… và ${area.elements.length - 6} phần tử khác`,
        BODY,
        { alpha: 0.7 },
        1,
      );
    y += 1.5;
  }
  const [px, py, side] = [M + 150, 40, 119];
  pen.box(px, py, side, side);
  if (images.preview)
    ctx.drawImage(images.preview, pen.px(px), pen.px(py), pen.px(side), pen.px(side));
  pen.para(
    px,
    py + side + 5,
    side,
    "Ảnh 3D từ studio. Màu trên màn hình chỉ để tham khảo.",
    SMALL,
    { alpha: 0.7 },
    1,
  );
  if (brief.materialNote)
    pen.para(
      px,
      py + side + 11,
      side,
      `${brief.material}: ${brief.materialNote}`,
      BODY,
      { bold: true },
      3,
    );
}

function position(area: BriefArea, el: BriefElement) {
  const across =
    Math.abs(el.acrossMm) < 0.05
      ? `trên đường ${area.centreLabel}`
      : `${mm(Math.abs(el.acrossMm))} mm về ${el.acrossMm < 0 ? "trái" : "phải"} so với ${area.centreLabel}`;
  return `Cách ${area.topLabel} ${mm(el.fromTopMm)} mm; ${across}`;
}

const COLUMNS = [8, 24, 55, 70, 34, 50, 28] as const;
const HEADERS = ["#", "Loại", "Nội dung", "Vị trí tâm", "Kích thước", "Màu · phông", "Ghi chú"];

function table(pen: Pen, area: BriefArea, from: number, to: number, top: number) {
  pen.box(M, top - 5, W, 7, { alpha: 0.15 });
  let x = M;
  HEADERS.forEach((h, i) => {
    pen.text(x + 1.5, top, h, SMALL, { bold: true, alpha: 0.75 });
    x += COLUMNS[i] ?? 0;
  });
  let y = top + 2;
  for (let row = from; row < to; row++) {
    const el = row === 0 ? null : area.elements[row - 1];
    const cells = el
      ? [
          "",
          el.kind,
          el.content,
          position(area, el),
          `${mm(el.widthMm)} × ${mm(el.heightMm)} mm${el.rotationDeg ? `; xoay ${mm(el.rotationDeg)}°` : ""}`,
          [el.colors.join(", ") || "Theo ảnh", el.font].filter(Boolean).join(" · "),
          el.warnings.length > 0 ? `(!) ${el.warnings[0]}` : "",
        ]
      : ["", "Nền", area.background, "Toàn vùng in", "—", "", ""];
    let cx = M;
    cells.forEach((cell, i) => {
      const w = COLUMNS[i] ?? 0;
      if (i === 0 && el) pen.badge(cx + 4, y + 3.6, el.number, 2.2);
      else if (cell) pen.para(cx + 1.5, y + 4, w - 3, cell, SMALL, { bold: i === 1 }, 2);
      cx += w;
    });
    y += ROW_H;
    pen.stroke(
      [
        [M, y],
        [M + W, y],
      ],
      { alpha: 0.15 },
    );
  }
}

function areaPage(
  pen: Pen,
  brief: DesignBrief,
  page: Extract<BriefPage, { kind: "area" }>,
  images: BriefImages,
  ctx: BriefCtx,
  style: BriefStyle,
) {
  const area = brief.areas[page.area];
  if (!area) return;
  if (page.continued) {
    table(pen, area, page.from, page.to, 44);
    return;
  }
  const { flatBounds } = area.surface;
  const scale = Math.min(W / flatBounds.width, 78 / flatBounds.height);
  const origin: [number, number] = [M + (W - flatBounds.width * scale) / 2, 38];
  const art = images.art(area.code);
  if (art)
    ctx.drawImage(
      art,
      pen.px(origin[0]),
      pen.px(origin[1]),
      pen.px(flatBounds.width * scale),
      pen.px(flatBounds.height * scale),
    );
  for (const guide of area.surface.guides()) {
    if (guide.kind === "bleed") continue;
    const kind = guide.kind;
    pen.path(guide.path, origin, scale, {
      color: style.guides[kind],
      widthMm: kind === "trim" ? 0.35 : 0.3,
      ...(kind === "safe"
        ? { dash: [1.4, 0.9] }
        : kind === "crease"
          ? { dash: [2, 0.8, 0.4, 0.8] }
          : {}),
    });
  }
  for (const el of area.elements) {
    const pts = el.outline.map((p): [number, number] => [
      origin[0] + p.x * scale,
      origin[1] + p.y * scale,
    ]);
    pen.stroke(pts, { dash: [0.8, 0.8], close: true, alpha: 0.85 });
    const top = pts.reduce((best, p) => (p[1] < best[1] ? p : best), pts[0] ?? [0, 0]);
    pen.badge(top[0], top[1] - 2.8, el.number);
  }
  const legendY = origin[1] + flatBounds.height * scale + 6;
  let lx = M;
  for (const [kind, label, dash] of [
    ["trim", brief.formed ? "Mép vùng in (không bế)" : "Đường cắt thành phẩm", undefined],
    ["safe", "Vùng an toàn", [1.4, 0.9]],
    ["seam", "Mép dán", undefined],
    ["crease", "Nếp gấp", [2, 0.8, 0.4, 0.8]],
  ] as const) {
    pen.stroke(
      [
        [lx, legendY - 1],
        [lx + 7, legendY - 1],
      ],
      { color: style.guides[kind], widthMm: 0.35, ...(dash ? { dash: [...dash] } : {}) },
    );
    lx += 9 + pen.text(lx + 9, legendY, label, SMALL, { alpha: 0.75 }) + 6;
  }
  pen.text(lx, legendY, "Khung nét đứt và số: phần tử, khớp tên lớp trong file in", SMALL, {
    alpha: 0.75,
  });
  table(pen, area, page.from, page.to, legendY + 9);
}

function colorsPage(pen: Pen, brief: DesignBrief, page: Extract<BriefPage, { kind: "colors" }>) {
  const top = 46;
  if (brief.colors.length === 0) {
    pen.para(M, top, W, "Thiết kế không có màu trơn nào: màu theo ảnh khách tải lên.", BODY);
  } else {
    pen.box(M, top - 5, W, 7, { alpha: 0.15 });
    for (const [x, h] of [
      [M + 1.5, "Màu"],
      [M + 46, "Dùng ở"],
      [M + 190, "CMYK / Pantone (nhà in điền)"],
    ] as const) {
      pen.text(x, top, h, SMALL, { bold: true, alpha: 0.75 });
    }
  }
  let y = top + 2;
  for (const color of brief.colors.slice(page.from, page.to)) {
    pen.box(M + 1.5, y + 1.5, 14, 8, { fill: color.hex });
    pen.text(M + 19, y + 7, color.hex, BODY, { bold: true });
    pen.para(M + 46, y + 4.5, 140, color.uses.join("; "), SMALL, {}, 2);
    pen.box(M + 190, y + 1.5, 70, 8);
    y += 11;
    pen.stroke(
      [
        [M, y],
        [M + W, y],
      ],
      { alpha: 0.15 },
    );
  }
  if (brief.materialNote)
    pen.para(
      M,
      Math.max(y + 8, 170),
      W,
      `Vật liệu: ${brief.material}. ${brief.materialNote}`,
      BODY,
      { bold: true },
      2,
    );
}

function notesPage(pen: Pen, brief: DesignBrief) {
  let y = 44;
  pen.text(M, y, "Lưu ý khi kiểm tra tự động", 4, { bold: true });
  y += 7;
  if (brief.issues.length === 0) y = pen.para(M, y, 130, "Không có lưu ý.", BODY);
  for (const issue of brief.issues.slice(0, 9)) {
    y = pen.para(M, y, 130, `(!) ${issue.where}: ${issue.message}`, BODY, {}, 2) + 1;
  }
  if (brief.issues.length > 9)
    y = pen.para(M, y, 130, `… và ${brief.issues.length - 9} lưu ý khác`, BODY, { alpha: 0.7 });
  y += 5;
  pen.text(M, y, "Gói file gửi kèm", 4, { bold: true });
  y += 7;
  const fonts = [
    ...new Set(
      brief.areas.flatMap((a) =>
        a.elements.flatMap((e) => (e.font ? [e.font.split(",")[0] ?? ""] : [])),
      ),
    ),
  ];
  for (const [name, what] of [
    [
      "print-ready.pdf",
      brief.formed
        ? "File in PDF/X-4: kích thước thật, lớp lót trắng (mực White) dưới phần có màu, không có đường cắt (in lên ly đã thành hình); mỗi phần tử một lớp"
        : "File in PDF/X-4: kích thước thật, lề tràn, đường cắt CutContour; mỗi phần tử một lớp, đánh số như tài liệu này",
    ],
    ["Tài liệu này", "Ý đồ thiết kế: vị trí, kích thước, màu từng phần tử"],
    ["Tệp gốc", "Ảnh và logo khách tải lên, độ phân giải gốc"],
    [
      "Phông chữ",
      fonts.length > 0
        ? `${fonts.join(", ")} (chữ trong file in đã chuyển thành nét)`
        : "Không có chữ",
    ],
  ] as const) {
    pen.text(M, y, name, BODY, { bold: true });
    y = pen.para(M + 32, y, 98, what, BODY, {}, 2) + 1.5;
  }
  const rx = M + 150;
  let ry = 44;
  pen.text(rx, ry, "Việc của nhà sản xuất", 4, { bold: true });
  ry += 7;
  for (const task of [
    "Chọn phương pháp in hợp với máy và vật liệu.",
    "Chế bản từ file in và tài liệu này: tách màu, lót trắng, bản in, đường bế.",
    "Gửi bản in thử trước khi in hàng loạt.",
    "Báo lại nếu phải đổi vị trí, kích thước hoặc màu.",
  ]) {
    pen.box(rx, ry - 3, 3.2, 3.2, { alpha: 0.7 });
    ry = pen.para(rx + 6, ry, 113, task, BODY, {}, 2) + 1.5;
  }
  ry += 5;
  for (const [title, fields] of [
    ["Nhà sản xuất", ["Phương pháp in", "Số màu in", "Ngày gửi bản in thử"]],
    ["Duyệt bản in thử", ["Quản lý kinh doanh", "Khách hàng", "Ngày duyệt"]],
  ] as const) {
    const h = 9 + fields.length * 8;
    pen.box(rx, ry, 119, h);
    pen.text(rx + 4, ry + 6, title, BODY, { bold: true });
    fields.forEach((field, i) => {
      const fy = ry + 14 + i * 8;
      pen.text(rx + 4, fy, field, BODY, { alpha: 0.7 });
      pen.stroke(
        [
          [rx + 42, fy + 0.6],
          [rx + 114, fy + 0.6],
        ],
        { alpha: 0.5, dash: [0.5, 0.8] },
      );
    });
    ry += h + 5;
  }
}

/**
 * Draws page `index` of `pages` of the brief on a canvas `pxPerMm` px per mm (A4 landscape). The
 * caller paints the paper (white) first and rasterises the page for `buildSheetPdf`.
 */
export function drawBriefPage(
  ctx: BriefCtx,
  brief: DesignBrief,
  pages: BriefPage[],
  index: number,
  pxPerMm: number,
  style: BriefStyle,
  images: BriefImages,
): void {
  const page = pages[index];
  if (!page) return;
  const pen = createPen(ctx, pxPerMm, style);
  const count = pages.length;
  switch (page.kind) {
    case "overview":
      frame(
        pen,
        brief,
        index,
        count,
        "Tổng quan",
        "Khách muốn in gì lên sản phẩm: nhìn trang này là hình dung được thành phẩm.",
      );
      overview(pen, brief, images, ctx);
      break;
    case "area": {
      const area = brief.areas[page.area];
      const n = `${page.area + 1}/${brief.areas.length}`;
      frame(
        pen,
        brief,
        index,
        count,
        `Vùng in ${n} · ${area?.name ?? ""}${page.continued ? " (tiếp)" : ""}`,
        area
          ? `Thành phẩm ${mm(area.trimMm.width)} × ${mm(area.trimMm.height)} mm · lề tràn ${mm(area.bleedMm)} mm · vùng an toàn cách mép ${mm(area.safeMm)} mm. Hình thu nhỏ; số đo là mm thật.`
          : "",
      );
      areaPage(pen, brief, page, images, ctx, style);
      break;
    }
    case "colors":
      frame(
        pen,
        brief,
        index,
        count,
        "Màu và vật liệu",
        "Mã màu là màu khách chọn trên màn hình (sRGB). Nhà in quy đổi CMYK hoặc chọn màu pha, ghi vào cột trống, chốt trên bản in thử.",
      );
      colorsPage(pen, brief, page);
      break;
    case "notes":
      frame(pen, brief, index, count, "Lưu ý, gói file và xác nhận", "");
      notesPage(pen, brief);
      break;
  }
}
