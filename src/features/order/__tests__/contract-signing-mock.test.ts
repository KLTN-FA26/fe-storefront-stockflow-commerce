import { describe, expect, it } from "vitest";
import { createDefaultMockContractBook } from "@/lib/api/mock-contracts";
import { MOCK_CONTRACT_ORDER_IDS } from "@/lib/api/mock-fixtures/wf02";
import { contractDocumentDtoSchema, contractDtoSchema } from "../contract-schemas";
import { otpDtoSchema, verificationDtoSchema } from "../contract-signing-schemas";

const dataOf = (result: { data: unknown }) => (result.data as { data: unknown }).data;
const id = MOCK_CONTRACT_ORDER_IDS.sent;
const signer = { signerName: "Nguyễn Văn An", signerTitle: "Giám đốc" };
describe("contract signing mock", () => {
  it("issues an OTP, rate limits resends, consumes it once and publishes CUSTOMER_SIGNED in chat", () => {
    const book = createDefaultMockContractBook();
    const contract = contractDtoSchema.parse(dataOf(book.get(id)));
    expect(otpDtoSchema.safeParse(dataOf(book.otp(id))).success).toBe(true);
    expect(book.otp(id).status).toBe(429);
    expect(
      book.customerSign(id, { ...signer, version: contract.version, otp: "000000", consent: true })
        .data,
    ).toMatchObject({ errorCode: "CONTRACT_OTP_INVALID", details: { attemptsLeft: 4 } });
    expect(
      book.customerSign(id, { ...signer, version: contract.version, otp: "123456", consent: true })
        .status,
    ).toBe(200);
    expect(contractDtoSchema.parse(dataOf(book.get(id)))).toMatchObject({
      status: "CUSTOMER_SIGNED",
      customerSignature: { method: "OTP", otpVerified: true },
    });
    expect(book.cardPayload(id)?.status).toBe("CUSTOMER_SIGNED");
    expect(
      book.customerSign(id, { ...signer, version: contract.version, otp: "123456", consent: true })
        .status,
    ).toBe(409);
  });
  it("limits certificate downloads to signed contracts and resolves actual revisions", () => {
    const book = createDefaultMockContractBook();
    const contract = contractDtoSchema.parse(dataOf(book.get(id)));
    expect(book.signaturePage(id).status).toBe(404);
    expect(
      contractDocumentDtoSchema.parse(dataOf(book.signaturePage(MOCK_CONTRACT_ORDER_IDS.signed)))
        .url,
    ).toContain("certificate.pdf");
    book.changeRequest(id, contract.version, "Điều chỉnh lịch giao hàng");
    expect(contractDocumentDtoSchema.parse(dataOf(book.revisionDocument(id, 1))).url).toContain(
      "-r1.pdf",
    );
    expect(book.revisionDocument(id, 2).status).toBe(404);
    expect(book.revisions("missing").status).toBe(404);
    expect(book.revisionDocument("missing", 1).status).toBe(404);
    expect(book.verify(" ABCD EFGH JKMN ").status).toBe(200);
    expect(book.verify("ABCD-EFGH-JKMO").status).toBe(404);
  });
  it("exhausts all five attempts", () => {
    const book = createDefaultMockContractBook();
    const contract = contractDtoSchema.parse(dataOf(book.get(id)));
    book.otp(id);
    for (let attempt = 0; attempt < 5; attempt++)
      book.customerSign(id, { ...signer, version: contract.version, otp: "000000", consent: true });
    expect(
      book.customerSign(id, { ...signer, version: contract.version, otp: "123456", consent: true })
        .data,
    ).toMatchObject({ errorCode: "CONTRACT_OTP_EXPIRED" });
  });
  it("records upload inspection and locks changes after signing", () => {
    const book = createDefaultMockContractBook();
    const contract = contractDtoSchema.parse(dataOf(book.get(id)));
    const result = book.customerSign(id, { ...signer, version: contract.version }, true);
    expect(contractDtoSchema.parse(dataOf(result))).toMatchObject({
      status: "CUSTOMER_SIGNED",
      customerSignature: { inspection: { kind: "SCAN", chainChecked: false } },
    });
    expect(book.changeRequest(id, contract.version + 1, "Điều chỉnh lịch giao hàng").status).toBe(
      409,
    );
  });
  it("stores change reasons, shows changes requested and serves public evidence without personal data", () => {
    const book = createDefaultMockContractBook();
    const contract = contractDtoSchema.parse(dataOf(book.get(id)));
    expect(book.changeRequest(id, contract.version, "Điều chỉnh lịch giao hàng").status).toBe(200);
    expect(contractDtoSchema.parse(dataOf(book.get(id)))).toMatchObject({
      status: "CHANGES_REQUESTED",
      deliverySchedule: [],
      paymentPlan: [],
      canSign: false,
      canRequestChanges: false,
    });
    expect(dataOf(book.revisions(id))).toMatchObject([
      { revision: 1, changeRequestReason: "Điều chỉnh lịch giao hàng" },
    ]);
    const verified = dataOf(book.verify("abcd-efgh-jkmn"));
    expect(verificationDtoSchema.safeParse(verified).success).toBe(true);
    expect(verified).not.toHaveProperty("email");
    expect(verified).not.toHaveProperty("totalAmount");
    expect(book.verify("missing").status).toBe(404);
  });
});
