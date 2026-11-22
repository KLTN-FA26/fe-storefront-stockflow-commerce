import type { PreflightIssueDto } from "./design-dtos";

// The BE's preflight rules as the customer reads them: one plain Vietnamese sentence per rule, the
// studio's own where it has one. The BE's `message` is English and never shown.

/**
 * Every `rule` the BE's preflight answers (origin/develop d47ed4ae): `LayoutPreflight.check` (the
 * layout), `DesignSubmissionService.plan` (the variant, the carton spec, the print and spec files)
 * and `printFileIssues`. The contract (`design-studio-fe-contract.md` §8) calls the list complete
 * and says a new or renamed rule is announced first; a rule outside it still gets a generic
 * sentence, and the studio sends the customer to Sale for it.
 */
export const BE_PREFLIGHT_RULES = [
  "EMPTY_DESIGN",
  "ELEMENT_INVALID",
  "OUTSIDE_PRINT_AREA",
  "CROSSES_SAFE_AREA",
  "DPI_BELOW_MIN",
  "ASSET_INVALID",
  "FONT_NOT_ALLOWED",
  "VARIANT_UNAVAILABLE",
  "CARTON_SPEC_MISSING",
  "PRINT_FILE_INVALID",
] as const;
export type BePreflightRule = (typeof BE_PREFLIGHT_RULES)[number];

type Sentence = string | ((values: Record<string, unknown>) => string);

/** One sentence for each rule of `BE_PREFLIGHT_RULES`, and for no other: the type keeps them equal. */
const MESSAGE_BY_RULE: Readonly<Record<BePreflightRule, Sentence>> = {
  EMPTY_DESIGN: "Thiết kế chưa có nội dung.",
  OUTSIDE_PRINT_AREA: "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
  CROSSES_SAFE_AREA: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
  DPI_BELOW_MIN: (values) =>
    typeof values.dpi === "number" && typeof values.minDpi === "number"
      ? `Ảnh chỉ đạt ${values.dpi} DPI, thấp hơn mức tối thiểu ${values.minDpi} DPI.`
      : "Ảnh có độ phân giải thấp hơn mức tối thiểu của quy cách này.",
  ASSET_INVALID: "Ảnh không hợp lệ hoặc không tải được.",
  FONT_NOT_ALLOWED: "Phông chữ này không được phép in.",
  ELEMENT_INVALID: "Có phần tử trong thiết kế không đọc được. Hãy xoá phần tử đó và thêm lại.",
  VARIANT_UNAVAILABLE: "Quy cách này hiện không còn nhận thiết kế.",
  CARTON_SPEC_MISSING: "Sản phẩm này chưa có quy cách đóng thùng nên chưa gửi duyệt được.",
  PRINT_FILE_INVALID:
    "File in chưa đúng định dạng hoặc khổ giấy của quy cách (cần PDF, đúng kích thước vùng in kể cả phần tràn lề). Hãy thử gửi lại.",
};

const isBeRule = (rule: string): rule is BePreflightRule =>
  (BE_PREFLIGHT_RULES as readonly string[]).includes(rule);

/** The rules the table words, for a test to hold against the BE's list. */
export const wordedPreflightRules = () => Object.keys(MESSAGE_BY_RULE);

/**
 * A rule this build has no sentence for (SF-UX-12): no raw code in the sentence, which the customer
 * cannot act on; the studio offers "Chat với Sale" under it instead (`needsSale`).
 */
export const UNKNOWN_RULE_SENTENCE = "Thiết kế chưa đạt một kiểm tra tự động.";

/** The sentence for one finding of the BE; a rule not listed gets a generic sentence. */
export function describePreflightRule(issue: Pick<PreflightIssueDto, "rule" | "values">): string {
  const known = isBeRule(issue.rule) ? MESSAGE_BY_RULE[issue.rule] : undefined;
  if (typeof known === "function") return known(issue.values ?? {});
  return known ?? UNKNOWN_RULE_SENTENCE;
}

/** The studio's own rule id for a BE rule (F-3): only the carton spec is named differently. */
export const engineRuleOf = (rule: string) =>
  rule === "CARTON_SPEC_MISSING" ? "NO_CARTON_SPEC" : rule;

/** The BE's rule for an engine rule id, the other way round: what a recorded browser refusal names. */
export const beRuleOf = (ruleId: string) =>
  ruleId === "NO_CARTON_SPEC" ? "CARTON_SPEC_MISSING" : ruleId;

/** Whether the BE's list words the rule (its own name, or the studio's for the carton spec). */
export const isWordedBeRule = (rule: string) => isBeRule(beRuleOf(rule));

/** The sentence for a recorded failure whose rules cannot be read: no code, no id. */
const GENERIC_RECORDED = "Bản thiết kế chưa đạt kiểm tra tự động.";

/**
 * The studio's own fail rules that the BE cannot check, so never answers, but records when the
 * browser reports them (`POST …/preflight-failures`, `DesignSubmissionService.recordReportedFailure`
 * keeps any rule): worded as the studio's preflight words them (`engine/preflight/rules/area.ts`).
 * The studio's other rules are notes, never reported.
 */
const STUDIO_RECORDED_RULES: Readonly<Record<string, string>> = {
  ON_SEAM: "Phần tử nằm trên mép dán của ly và sẽ bị che.",
};

/** A rule code as the BE writes it: capital letters, digits and underscores. */
const RULE_CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * The customer's words for the note of a `PREFLIGHT_FAILED` event. The BE writes it as
 * `rule[ surface][/elementId]` joined by `; ` (the mock joins with `, `): each rule it knows is
 * worded like a finding of the same rule (without its numbers, which the note lacks), the studio's
 * own reported rules (`ON_SEAM`) as the studio words them; the surface
 * and the element id are dropped, and so is a rule this table lacks. Content with no known rule
 * reads as one generic line, so a code or an id is never shown. Null for an empty note.
 */
export function describeRecordedFailure(note: string): string | null {
  const parts = note
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const sentences = new Set<string>();
  for (const part of parts) {
    const rule = part.split(/\s+/)[0] ?? "";
    if (!RULE_CODE.test(rule)) continue;
    if (isBeRule(rule)) sentences.add(describePreflightRule({ rule, values: {} }));
    else if (Object.hasOwn(STUDIO_RECORDED_RULES, rule))
      sentences.add(STUDIO_RECORDED_RULES[rule]!);
  }
  return sentences.size > 0 ? [...sentences].join("\n") : GENERIC_RECORDED;
}
