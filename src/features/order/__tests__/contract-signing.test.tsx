import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders } from "@/test/render";
import { contractDtoSchema } from "../contract-schemas";
import { contractSigningActions, describeSigningError } from "../contract-signing-rules";
import {
  changeRequestInputSchema,
  signingInputSchema,
  pdfInputSchema,
  verificationDtoSchema,
  otpDtoSchema,
  inspectionDtoSchema,
} from "../contract-signing-schemas";
import {
  getContractRevisions,
  getSignaturePage,
  getRevisionDocument,
  getContractVerification,
  uploadContractSignature,
  checkContractFile,
} from "../contract-signing-api";
import { ContractSigningActions } from "../components/contract-signing-actions";
import { ContractVerificationScreen } from "../components/contract-verification-screen";
import { ContractEvidence, ContractRevisions } from "../components/contract-evidence";

const contract = contractDtoSchema.parse({
  id: "c0a70000-0000-4000-8000-000000000001",
  orderId: "0c0e0000-0000-4000-8000-000000000001",
  contractNumber: "HD-1",
  orderNumber: "SO-1",
  status: "SENT",
  version: 3,
  totals: { netAmount: 100, taxAmount: 8, totalAmount: 108 },
  canSign: true,
  canRequestChanges: true,
  signBy: "2099-12-31",
});
const input = {
  signerName: "Nguyễn Văn An",
  signerTitle: "Giám đốc",
  read: true,
  consent: true,
  otp: "123456",
};
afterEach(() => vi.restoreAllMocks());

describe("contract signing rules and parsers", () => {
  it("reads resendAfter as the backend instant", () => {
    expect(otpDtoSchema.parse({ resendAfter: "2026-11-28T10:00:00Z" }).resendAfter).toBe(
      "2026-11-28T10:00:00Z",
    );
    expect(otpDtoSchema.safeParse({ resendAfter: 60 }).success).toBe(false);
  });
  it("accepts older responses and hides actions without explicit capabilities", () => {
    const old = contractDtoSchema.parse({
      ...contract,
      canSign: undefined,
      canRequestChanges: undefined,
    });
    expect(contractSigningActions(old, true)).toMatchObject({ sign: false, change: false });
    expect(verificationDtoSchema.parse({})).toEqual({});
  });
  it.each([
    "CHANGES_REQUESTED",
    "CUSTOMER_SIGNED",
    "SIGNED",
    "COMPLETED",
    "LIQUIDATED",
    "CANCELLED",
    "DRAFT",
  ])("has no signing actions from %s", (status) => {
    expect(
      contractSigningActions(contractDtoSchema.parse({ ...contract, status }), true),
    ).toMatchObject({ sign: false, change: false });
  });
  it("checks permissions and Vietnam's end-of-day deadline", () => {
    expect(contractSigningActions(contract, false).sign).toBe(false);
    const expiring = { ...contract, signBy: "2026-11-28" };
    expect(contractSigningActions(expiring, true, new Date("2026-11-28T16:59:59Z")).overdue).toBe(
      false,
    );
    expect(contractSigningActions(expiring, true, new Date("2026-11-28T17:00:00Z")).overdue).toBe(
      true,
    );
  });
  it("requires consent, named signer, title and six numeric digits", () => {
    expect(signingInputSchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { consent: false },
      { read: false },
      { signerName: " " },
      { signerTitle: " " },
      { signerName: "a".repeat(201) },
      { otp: "12345" },
      { otp: "12abcd" },
    ])
      expect(signingInputSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
  });
  it("bounds change reasons and rejects invalid uploads", () => {
    for (const length of [9, 2001])
      expect(changeRequestInputSchema.safeParse({ reason: "x".repeat(length) }).success).toBe(
        false,
      );
    for (const length of [10, 2000])
      expect(changeRequestInputSchema.safeParse({ reason: "x".repeat(length) }).success).toBe(true);
    expect(pdfInputSchema.safeParse({ file: [] }).success).toBe(false);
    expect(
      pdfInputSchema.safeParse({ file: [new File(["abc"], "a.txt", { type: "text/plain" })] })
        .success,
    ).toBe(false);
  });
  it.each([400, 403, 404, 405])("treats optional endpoint %s as unavailable", async (status) => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(status, "UNAVAILABLE", "English backend message"),
    );
    expect(await getContractRevisions(contract.orderId)).toBeNull();
    expect(await getContractVerification("missing")).toBeNull();
  });
  it("parses short-lived links for certificates and historical documents", async () => {
    const link = {
      url: "https://files.example/certificate.pdf",
      expiresAt: "2026-11-28T10:00:00Z",
    };
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: link });
    expect(await getSignaturePage(contract.orderId)).toEqual(link);
    expect(await getRevisionDocument(contract.orderId, 1)).toEqual(link);
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      `/orders/me/${contract.orderId}/contract/signature-page`,
      `/orders/me/${contract.orderId}/contract/revisions/1/document`,
    ]);
  });
  it.each(["UNREADABLE", "UNKNOWN_KIND"])(
    "rejects inspection kind %s without breaking the contract",
    (kind) => {
      expect(inspectionDtoSchema.parse({ kind, valid: true }).kind).toBe("UNREADABLE");
    },
  );
  it("keeps nullable certificate validity facts and translates actual backend error codes", () => {
    for (const certificateValidAtSigning of [true, false, null]) {
      expect(
        inspectionDtoSchema.parse({ kind: "DIGITAL", signers: [{ certificateValidAtSigning }] })
          .signers?.[0]?.certificateValidAtSigning,
      ).toBe(certificateValidAtSigning);
    }
    expect(describeSigningError(new ApiError(409, "OPTIMISTIC_LOCK", "stale"))).toContain(
      "đã thay đổi",
    );
    expect(
      describeSigningError(
        new ApiError(422, "CONTRACT_SIGNED_FILE_REJECTED", "bad", undefined, undefined, {
          reason: "CERTIFICATE_NOT_VALID_AT_SIGNING",
        }),
      ),
    ).toContain("không có hiệu lực tại thời điểm ký");
  });
  it("does not hide network/server errors or expose backend messages", async () => {
    const error = new ApiError(500, "UNKNOWN", "English backend message");
    vi.spyOn(api, "get").mockRejectedValue(error);
    await expect(getContractVerification("code")).rejects.toBe(error);
    expect(describeSigningError(error)).not.toContain("English");
  });
  it("sends multipart names exactly as contracted", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { matches: true } });
    const file = new File(["%PDF-1.4"], "signed.pdf", { type: "application/pdf" });
    await uploadContractSignature(contract.orderId, 3, file, input.signerName, input.signerTitle);
    const body = post.mock.calls[0]?.[1];
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Expected multipart form data");
    expect(body.get("version")).toBe("3");
    expect(body.get("signerName")).toBe(input.signerName);
    expect(await checkContractFile("a/b", file)).toEqual({ matches: true });
    expect(post.mock.calls[1]?.[0]).toBe("/public/contract-verifications/a%2Fb/check");
  });
});

describe("contract signing screens", () => {
  const permissions = () =>
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        roles: [],
        permissions: ["sales-orders:READ", "sales-orders:UPDATE"],
        dataScope: "OWN",
      },
    });
  it("hides actions when the existing permission helper refuses access", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { roles: [], permissions: [], dataScope: "OWN" },
    });
    renderWithProviders(<ContractSigningActions contract={contract} />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Ký hợp đồng" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Yêu cầu chỉnh sửa" })).not.toBeInTheDocument();
  });
  it("keeps read-only customers from signing or requesting changes", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { roles: [], permissions: ["sales-orders:READ"], dataScope: "OWN" },
    });
    renderWithProviders(<ContractSigningActions contract={contract} />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Ký hợp đồng" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Yêu cầu chỉnh sửa" })).not.toBeInTheDocument();
  });
  it.each(["UNREADABLE", "FUTURE_KIND"])("shows rejected inspection evidence for %s", (kind) => {
    const evidence = contractDtoSchema.parse({
      ...contract,
      customerSignature: { inspection: { kind, valid: true } },
    });
    renderWithProviders(<ContractEvidence contract={evidence} />);
    expect(screen.getByText("Không chấp nhận kết quả kiểm tra tài liệu này.")).toBeInTheDocument();
    expect(screen.queryByText("Chữ ký số hợp lệ")).not.toBeInTheDocument();
  });
  it("validates change reason and sends only after explicit confirmation", async () => {
    permissions();
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWithProviders(<ContractSigningActions contract={contract} />);
    await user.click(screen.getByRole("button", { name: "Yêu cầu chỉnh sửa" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nhập ít nhất 10 ký tự");
    expect(post).not.toHaveBeenCalled();
    await user.type(
      screen.getByLabelText("Lý do cần chỉnh sửa (10–2.000 ký tự)"),
      "Điều chỉnh lịch giao hàng",
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/orders/me/${contract.orderId}/contract/change-request`, {
        version: 3,
        reason: "Điều chỉnh lịch giao hàng",
      }),
    );
  });
  it("displays customer signature and scan inspection while awaiting the company", () => {
    const signed = {
      ...contract,
      status: "CUSTOMER_SIGNED" as const,
      customerSignature: {
        method: "UPLOAD",
        signerName: "Nguyễn Văn An",
        signerTitle: "Giám đốc",
        signedAt: "2026-11-28T10:00:00Z",
        inspection: { kind: "SCAN" as const, chainChecked: false },
      },
    };
    renderWithProviders(
      <>
        <ContractSigningActions contract={signed} />
        <ContractEvidence contract={signed} />
      </>,
    );
    expect(screen.getByText("Nguyễn Văn An · Giám đốc")).toBeInTheDocument();
    expect(screen.getByText("Bản scan — không có chữ ký số")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ký hợp đồng" })).not.toBeInTheDocument();
  });
  it("offers certificate, copies verification code and shows revision reasons", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        { revision: 1, changeRequestReason: "Điều chỉnh lịch giao", documentAvailable: false },
      ],
    });
    const signed = {
      ...contract,
      status: "SIGNED" as const,
      revision: 2,
      verificationCode: "ABCDEFGHJKMN",
    };
    renderWithProviders(
      <>
        <ContractEvidence contract={signed} />
        <ContractRevisions contract={signed} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Tải trang chứng nhận" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Lý do yêu cầu chỉnh sửa: Điều chỉnh lịch giao/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sao chép mã xác minh" }));
    expect(screen.getByText("ABCD-EFGH-JKMN")).toBeInTheDocument();
    expect(write).toHaveBeenCalledWith("ABCD-EFGH-JKMN");
    expect(screen.getByRole("link", { name: "Xác minh hợp đồng" })).toHaveAttribute(
      "href",
      "/xac-minh-hop-dong/ABCDEFGHJKMN",
    );
  });
  async function openOtp() {
    permissions();
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        sentTo: "k***@example.vn",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        resendAfter: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<ContractSigningActions contract={contract} />);
    await user.click(screen.getByRole("button", { name: "Ký hợp đồng" }));
    await user.type(screen.getByLabelText("Họ tên người ký"), input.signerName);
    await user.type(screen.getByLabelText("Chức danh người ký"), input.signerTitle);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Gửi mã xác thực" }));
    await screen.findByLabelText("Mã xác thực gồm 6 chữ số");
    return { user, post };
  }
  it("pastes OTP, shows masked email and countdown, then displays success", async () => {
    const { user, post } = await openOtp();
    expect(screen.getByText(/k\*\*\*@example.vn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gửi lại mã sau/ })).toBeDisabled();
    await user.click(screen.getByLabelText("Mã xác thực gồm 6 chữ số"));
    await user.paste("123 456");
    post.mockResolvedValue({ data: {} });
    await user.click(screen.getByRole("button", { name: "Xác thực và ký hợp đồng" }));
    await screen.findByText(/Hợp đồng có hiệu lực khi công ty hoàn tất ký/);
    expect(post).toHaveBeenLastCalledWith(`/orders/me/${contract.orderId}/contract/sign`, {
      version: 3,
      otp: "123456",
      signerName: input.signerName,
      signerTitle: input.signerTitle,
      consent: true,
    });
  });
  it("shows attempts left and maps OTP failures into Vietnamese", async () => {
    const { user, post } = await openOtp();
    post.mockRejectedValue(
      new ApiError(422, "CONTRACT_OTP_INVALID", "Invalid OTP", undefined, undefined, {
        attemptsLeft: 4,
      }),
    );
    await user.type(screen.getByLabelText("Mã xác thực gồm 6 chữ số"), "000000");
    await user.click(screen.getByRole("button", { name: "Xác thực và ký hợp đồng" }));
    expect(await screen.findByText("Còn 4 lần nhập mã.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Mã xác thực không đúng");
  });
  it("explains deadline and disables both signing paths", async () => {
    permissions();
    renderWithProviders(
      <ContractSigningActions contract={{ ...contract, signBy: "2020-01-01" }} />,
    );
    expect(screen.getByRole("button", { name: "Ký hợp đồng" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tải lên bản đã ký" })).toBeDisabled();
    expect(screen.getByText(/Quá hạn ký/)).toHaveTextContent("liên hệ Sale");
  });
  it("hides unsupported signing after an optional endpoint refusal", async () => {
    const { user, post } = await openOtp();
    post.mockRejectedValue(new ApiError(405, "UNAVAILABLE", "Unsupported"));
    await user.type(screen.getByLabelText("Mã xác thực gồm 6 chữ số"), "123456");
    await user.click(screen.getByRole("button", { name: "Xác thực và ký hợp đồng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Ký hợp đồng" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải hợp đồng HD-1" })).toBeInTheDocument();
  });
  it.each([true, false])("public file check renders matches=%s", async (matches) => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        contractNumber: "HD-1",
        status: "SIGNED",
        testCertificate: true,
        documentSha256: "abc",
      },
    });
    vi.spyOn(api, "post").mockResolvedValue({ data: { matches } });
    const user = userEvent.setup();
    renderWithProviders(<ContractVerificationScreen code="demo" />);
    await user.upload(
      await screen.findByLabelText("File PDF (tối đa 20 MB)"),
      new File(["%PDF-1.4"], "test.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Kiểm tra file" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      matches ? "File khớp chính xác" : "File không khớp",
    );
    expect(screen.getByRole("note")).toHaveTextContent("Chứng thư số dùng thử");
  });
  it("public not-found leaves no upload form", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(404, "NOT_FOUND", "Missing"));
    renderWithProviders(<ContractVerificationScreen code="missing" />);
    expect(await screen.findByText(/Không tìm thấy hợp đồng/)).toBeInTheDocument();
    expect(screen.queryByLabelText("File PDF (tối đa 20 MB)")).not.toBeInTheDocument();
  });
});
