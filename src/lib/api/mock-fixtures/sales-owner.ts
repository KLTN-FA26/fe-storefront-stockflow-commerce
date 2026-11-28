/**
 * BE-shaped fixtures for the customer's Sales (HOP-DONG-API, BE-A; KE-HOACH sales owner §10.5) and the public lead
 * form (§10.3): the shapes the contract names, over one book per page so a request sent shows on the card.
 */

export type MockSalesOwner = { name: string | null; active: boolean; coverName: string | null };
export type MockSalesOption = { userId: string; name: string };
export type MockOwnerChangeRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string;
  note: string;
  preferredSalesName: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export const MOCK_SALES_OWNER: MockSalesOwner = {
  name: "Trần Minh Khoa",
  active: true,
  coverName: "Lê Thu Hà",
};

export const MOCK_SALES_OPTIONS: MockSalesOption[] = [
  { userId: "0193b6a0-0000-7000-8000-000000000101", name: "Trần Minh Khoa" },
  { userId: "0193b6a0-0000-7000-8000-000000000102", name: "Lê Thu Hà" },
  { userId: "0193b6a0-0000-7000-8000-000000000103", name: "Phạm Quốc Bảo" },
];

const COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type Result = { status: number; data: unknown };

const refusal = (status: number, errorCode: string, message: string): Result => ({
  status,
  data: { success: false, errorCode, message, correlationId: `mock-${errorCode.toLowerCase()}` },
});

const asBody = (data: unknown): Record<string, unknown> => {
  const parsed = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
};

/** The demo customer's Sales and change requests: one open request at a time, 30 days after a decision. */
export function createMockSalesOwnerBook(
  owner: MockSalesOwner = MOCK_SALES_OWNER,
  options: MockSalesOption[] = MOCK_SALES_OPTIONS,
  requests: MockOwnerChangeRequest[] = [],
  now: () => Date = () => new Date(),
) {
  let seq = requests.length;
  const latestFirst = () => [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    owner: (): Result => ({ status: 200, data: owner.name ? owner : null }),
    options: (): Result => ({ status: 200, data: options }),
    requests: (): Result => ({ status: 200, data: latestFirst() }),
    request(data: unknown): Result {
      const body = asBody(data);
      if (typeof body.reason !== "string" || body.reason === "") {
        return refusal(400, "VALIDATION_FAILED", "Vui lòng chọn lý do");
      }
      const latest = latestFirst()[0];
      if (latest?.status === "PENDING") {
        return refusal(409, "OWNER_CHANGE_REQUEST_PENDING", "Đang có một yêu cầu chờ duyệt");
      }
      if (
        latest?.decidedAt &&
        now().getTime() - Date.parse(latest.decidedAt) < COOLDOWN_DAYS * DAY_MS
      ) {
        return refusal(409, "OWNER_CHANGE_REQUEST_COOLDOWN", "Chưa đủ 30 ngày từ lần xử lý trước");
      }
      const preferred = options.find((option) => option.userId === body.preferredSalesUserId);
      seq += 1;
      const created: MockOwnerChangeRequest = {
        id: `0193b6a0-0000-7000-8000-${String(seq).padStart(12, "0")}`,
        status: "PENDING",
        reason: body.reason,
        note: typeof body.note === "string" ? body.note : "",
        preferredSalesName: preferred?.name ?? null,
        decisionNote: null,
        createdAt: now().toISOString(),
        decidedAt: null,
      };
      requests.push(created);
      return { status: 201, data: created };
    },
  };
}

export type MockSalesOwnerBook = ReturnType<typeof createMockSalesOwnerBook>;

/**
 * `POST /public/leads`: always 202 `{received: true}`, a known customer's tax code included (the BE then tells that
 * customer's Sales). A body without `consent: true` is the only refusal, as the BE's validation would be.
 */
export function mockLeadResponse(data: unknown): Result {
  const body = asBody(data);
  if (body.consent !== true) return refusal(400, "VALIDATION_FAILED", "consent must be true");
  return { status: 202, data: { success: true, data: { received: true } } };
}
