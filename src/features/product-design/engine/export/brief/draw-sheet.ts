import { BAG_SIDES, onSheet, type BagSheet } from "../../surfaces/bag-sheet";
import { BRIEF_PAGE_MM } from "./layout";
import type { DesignBrief } from "./model";
import type { BriefCtx, BriefStyle, Pen } from "./pen";

/** Pictures the brief draws the sheet with: each side's flat artwork (its bleed box). */
type SideArt = (code: string) => CanvasImageSource | undefined;

const M = 14;
const W = BRIEF_PAGE_MM.width - 2 * M;
const SMALL = 2.8;
const BODY = 3.2;

const mm = (value: number) => (Math.round(value * 10) / 10).toLocaleString("vi-VN");

/**
 * A bag's flat sheet as the print file lays it out: each side's artwork in place (clipped like the
 * print file clips it), the die line, the folds, the unprinted glue flap and folds named, and the
 * sizes of every column and row. The caller has drawn the page frame.
 */
export function drawSheetPage(
  pen: Pen,
  ctx: BriefCtx,
  brief: DesignBrief,
  sheet: BagSheet,
  art: SideArt,
  style: BriefStyle,
) {
  const { trimWidthMm: tw, trimHeightMm: th, bleedMm: b } = sheet;
  const scale = Math.min((W - 14) / tw, 112 / th);
  const ox = M + 12;
  const oy = 52;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  for (const code of BAG_SIDES) {
    const area = brief.areas.find((a) => a.code === code);
    const image = art(code);
    if (!area || !image) continue;
    const side = sheet.sides[code];
    const bf = area.surface.bleedMm;
    const { width: fw, height: fh } = area.surface.flatBounds;
    const clipW = side.width + (code === "LEFT" ? b : 0);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pen.px(X(side.x)), pen.px(Y(side.y)));
    ctx.lineTo(pen.px(X(side.x + clipW)), pen.px(Y(side.y)));
    ctx.lineTo(pen.px(X(side.x + clipW)), pen.px(Y(side.y + side.height + b)));
    ctx.lineTo(pen.px(X(side.x)), pen.px(Y(side.y + side.height + b)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      image,
      pen.px(X(side.x - bf)),
      pen.px(Y(side.y - bf)),
      pen.px(fw * scale),
      pen.px(fh * scale),
    );
    ctx.restore();
    pen.text(X(side.x) + 1.5, Y(side.y) + 4, area.name, SMALL, { bold: true, alpha: 0.75 });
  }

  pen.stroke(
    [
      [X(0), Y(0)],
      [X(tw), Y(0)],
      [X(tw), Y(th)],
      [X(0), Y(th)],
    ],
    { color: style.guides.trim, widthMm: 0.35, close: true },
  );
  const dash = [1.4, 0.9];
  for (const x of sheet.verticalFolds) {
    pen.stroke(
      [
        [X(x), Y(0)],
        [X(x), Y(th)],
      ],
      { color: style.guides.crease, widthMm: 0.3, dash },
    );
  }
  for (const y of sheet.horizontalFolds) {
    pen.stroke(
      [
        [X(0), Y(y)],
        [X(tw), Y(y)],
      ],
      { color: style.guides.crease, widthMm: 0.3, dash },
    );
  }
  pen.text(X(1), Y(sheet.topFoldMm + sheet.printedHeightMm / 2), "Mép dán", SMALL, {
    alpha: 0.7,
  });
  pen.text(
    X(sheet.glueFlapMm) + 2,
    Y(sheet.topFoldMm / 2) + 1,
    "Gấp miệng (vào trong) — không in",
    SMALL,
    {
      alpha: 0.7,
    },
  );
  pen.text(
    X(sheet.glueFlapMm) + 2,
    Y(sheet.topFoldMm + sheet.printedHeightMm + sheet.bottomFoldMm / 2) + 1,
    "Phần gấp đáy — không in (chỉ có lề tràn của mặt)",
    SMALL,
    { alpha: 0.7 },
  );

  // Column widths above, row heights on the left, the whole sheet on top.
  const columns = [0, ...sheet.verticalFolds.filter((_, i) => i % 3 !== 2), tw].filter(
    (x, i, all) => i === 0 || x !== all[i - 1],
  );
  for (let i = 0; i + 1 < columns.length; i++) {
    const [a, z] = [columns[i] ?? 0, columns[i + 1] ?? 0];
    pen.stroke(
      [
        [X(a), oy - 4],
        [X(z), oy - 4],
      ],
      { alpha: 0.5 },
    );
    pen.text((X(a) + X(z)) / 2, oy - 5.2, mm(z - a), SMALL, { align: "center", alpha: 0.8 });
  }
  pen.text((X(0) + X(tw)) / 2, oy - 10, `Tấm trải phẳng ${mm(tw)} × ${mm(th)} mm`, BODY, {
    bold: true,
    align: "center",
  });
  const rows = [0, ...sheet.horizontalFolds, th];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [a, z] = [rows[i] ?? 0, rows[i + 1] ?? 0];
    pen.stroke(
      [
        [ox - 4, Y(a)],
        [ox - 4, Y(z)],
      ],
      { alpha: 0.5 },
    );
    pen.text(ox - 5.5, (Y(a) + Y(z)) / 2 + 1, mm(z - a), SMALL, { align: "right", alpha: 0.8 });
  }

  let y = Y(th) + 9;
  y = pen.para(
    M,
    y,
    W,
    `Thành phẩm ${mm(tw)} × ${mm(th)} mm, lề tràn ${mm(b)} mm quanh tấm. Mép dán ${mm(sheet.glueFlapMm)} mm, gấp miệng ${mm(sheet.topFoldMm)} mm, gấp đáy ${mm(sheet.bottomFoldMm)} mm${sheet.assumed ? " (mép dán và gấp đáy là giá trị giả định, chờ xưởng xác nhận)" : ""}.`,
    BODY,
    {},
    2,
  );
  y = pen.para(
    M,
    y + 1,
    W,
    "Cách gấp: bế theo viền ngoài, cuộn tấm thành ống, dán cạnh phải Hông trái đè lên Mép dán; gấp miệng vào trong; gấp phần đáy thành đáy túi. Nét liền = đường bế, nét đứt = nếp gấp.",
    BODY,
    { alpha: 0.8 },
    2,
  );
  // The side order is fixed: say where each lies, measured on the sheet's trim.
  pen.para(
    M,
    y + 1,
    W,
    BAG_SIDES.map((code) => {
      const r = onSheet(sheet, sheet.sides[code]);
      const name = brief.areas.find((a) => a.code === code)?.name ?? code;
      return `${name}: từ ${mm(r.x - b)} mm, rộng ${mm(r.width)} mm`;
    }).join(" · "),
    SMALL,
    { alpha: 0.7 },
    2,
  );
}
