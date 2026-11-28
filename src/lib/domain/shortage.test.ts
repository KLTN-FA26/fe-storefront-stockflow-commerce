import { describe, expect, it } from "vitest";

import { shortagePayload } from "@/test/shortage-card";

import {
  isKnownOffer,
  shortageCardSchema,
  shortageEffectLines,
  shortageOptionLabel,
  shortageStatusMeta,
  shortageTitle,
} from "./shortage";

const card = shortageCardSchema.parse(shortagePayload());
const effect = (option: string) =>
  shortageEffectLines(
    card.options.find((o) => o.option === option)!,
    card,
  );

describe("shortage card payload", () => {
  it("parses the BE payload, with the nulls the BE writes", () => {
    expect(card.options).toHaveLength(4);
    expect(card.chosen).toBeNull();
    expect(shortageTitle(card)).toBe("Đơn thiếu 2 thùng");
  });

  it("keeps a way or a status newer than this FE as UNKNOWN instead of failing the card", () => {
    const parsed = shortageCardSchema.parse(
      shortagePayload({ status: "PAUSED", options: [{ option: "SWAP_SKU" }] }),
    );
    expect(parsed.status).toBe("UNKNOWN");
    expect(isKnownOffer(parsed.options[0]!)).toBe(false);
    expect(shortageStatusMeta(parsed.status).label).toBe("Thiếu thùng");
  });

  it("rejects a payload without its version (a choice must name it)", () => {
    expect(() => shortageCardSchema.parse({ ...shortagePayload(), version: undefined })).toThrow();
  });
});

describe("the effect each way shows (17 §4.14 step 56)", () => {
  it("WAIT: the expected date, and the agreement to move the window only when it falls after it", () => {
    expect(effect("WAIT_FOR_PRODUCTION")).toEqual([
      "Dự kiến giao từ 22/12/2026.",
      "Chọn hướng này là đồng ý dời lịch giao tới ngày đó.",
      "Số tiền phải trả không đổi.",
    ]);
    const inside = shortageEffectLines(
      {
        option: "WAIT_FOR_PRODUCTION",
        expectedDeliveryDate: "2026-12-08",
        afterWindow: false,
        laterBatchesClosed: [],
      },
      card,
    );
    expect(inside.join(" ")).not.toContain("dời lịch");
  });

  it("REDUCE: the missing cartons of this batch and the money the amount due falls by", () => {
    expect(effect("REDUCE_CARTONS")[0]).toMatch(
      /^Bỏ 2 thùng thiếu của đợt này, số phải trả giảm 2\.530\.000\s?₫\.$/,
    );
  });

  it("SHIP_PART: names the later batches that are closed too, only when there are any", () => {
    expect(effect("SHIP_PART_CLOSE_REST").join(" ")).toContain(
      "Các đợt sau (đợt 2, 3) cũng bị đóng.",
    );
    const alone = shortageEffectLines(
      { option: "SHIP_PART_CLOSE_REST", amountReduced: 1_000, laterBatchesClosed: [] },
      card,
    );
    expect(alone.join(" ")).not.toContain("đợt sau");
  });

  it("CANCEL: the most that is refunded, and the fee clause only when a fee is possible", () => {
    expect(effect("CANCEL_ORDER")[0]).toMatch(
      /Hoàn tối đa 30\.000\.000\s?₫; phí \(nếu có\) theo thoả thuận với Sale\.$/,
    );
    const noFee = shortageEffectLines(
      { option: "CANCEL_ORDER", refundUpTo: 5_000, feePossible: false, laterBatchesClosed: [] },
      card,
    );
    expect(noFee[0]).not.toContain("phí");
  });

  it("words every status and way in Vietnamese, never the code", () => {
    expect(shortageOptionLabel("REDUCE_CARTONS")).toBe("Giảm số thùng");
    expect(shortageStatusMeta("SENT").label).toBe("Chờ anh/chị chọn");
    expect(shortageStatusMeta("SUPERSEDED").label).toBe("Đã có thẻ mới thay thế");
    expect(shortageStatusMeta("EXPIRED").label).toBe("Không cần chọn nữa");
  });
});
