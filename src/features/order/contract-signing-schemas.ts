import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
export const signerDtoSchema = z.object({
  name: z.string().nullish(),
  title: z.string().nullish(),
  authorizationRef: z.string().nullish(),
});
export const inspectionDtoSchema = z.object({
  kind: z.enum(["DIGITAL", "SCAN", "UNREADABLE"]).catch("UNREADABLE").optional(),
  valid: z.boolean().optional(),
  coversWholeDocument: z.boolean().optional(),
  matchesSentDocument: z.boolean().optional(),
  chainChecked: z.boolean().optional(),
  reason: z.string().nullish(),
  signers: z
    .array(
      z.object({
        subject: z.string().nullish(),
        issuer: z.string().nullish(),
        serial: z.string().nullish(),
        notBefore: instant.nullish(),
        notAfter: instant.nullish(),
        signedAt: instant.nullish(),
        certificateValidAtSigning: z.boolean().nullish(),
      }),
    )
    .optional(),
});
export const signatureDtoSchema = z.object({
  method: z.string().optional(),
  signerName: z.string().nullish(),
  signerTitle: z.string().nullish(),
  email: z.string().nullish(),
  signedAt: instant.nullish(),
  otpVerified: z.boolean().optional(),
  byName: z.string().nullish(),
  certificateSubject: z.string().nullish(),
  certificateIssuer: z.string().nullish(),
  testCertificate: z.boolean().optional(),
  inspection: inspectionDtoSchema.nullish(),
});
export const otpDtoSchema = z.object({
  sentTo: z.string().optional(),
  expiresAt: instant.optional(),
  resendAfter: instant.optional(),
});
export const revisionDtoSchema = z.object({
  revision: z.number().int().optional(),
  sentAt: instant.nullish(),
  sentByName: z.string().nullish(),
  changeRequestReason: z.string().nullish(),
  changeRequestedAt: instant.nullish(),
  documentAvailable: z.boolean().optional(),
});
export const verificationDtoSchema = z.object({
  contractNumber: z.string().optional(),
  revision: z.number().int().optional(),
  sellerName: z.string().optional(),
  buyerName: z.string().optional(),
  status: z.string().optional(),
  customerSignedAt: instant.nullish(),
  companySignedAt: instant.nullish(),
  documentSha256: z.string().optional(),
  testCertificate: z.boolean().optional(),
});
// HOP-DONG-API 2026-11-28, QĐ-3: named signer, title and explicit consent; six numeric OTP digits.
export const signingInputSchema = z.object({
  signerName: z.string().trim().min(1, "Nhập họ tên người ký").max(200, "Tối đa 200 ký tự"),
  signerTitle: z.string().trim().min(1, "Nhập chức danh người ký").max(200, "Tối đa 200 ký tự"),
  read: z.boolean().refine(Boolean, "Vui lòng xác nhận đã đọc hợp đồng"),
  consent: z.boolean().refine(Boolean, "Vui lòng đồng ý ký điện tử"),
  otp: z.string().regex(/^\d{6}$/, "Nhập đủ 6 chữ số của mã xác thực"),
});
export const signerInputSchema = signingInputSchema.pick({ signerName: true, signerTitle: true });
export const signingConsentSchema = signingInputSchema.omit({ otp: true });
// HOP-DONG-API, portal /change-request: reason 10–2000 characters.
export const changeRequestInputSchema = z.object({
  reason: z.string().trim().min(10, "Nhập ít nhất 10 ký tự").max(2000, "Tối đa 2.000 ký tự"),
});
// HOP-DONG-API, SignedPdfInspector: PDF upload capped at 20 MB.
export const pdfInputSchema = z.object({
  file: z
    .custom<FileList>()
    .transform((files) => files?.[0])
    .refine(
      (file) =>
        Boolean(
          file &&
          file.size > 0 &&
          file.size <= 20 * 1024 * 1024 &&
          (file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))),
        ),
      "Chọn file PDF không rỗng, tối đa 20 MB",
    ),
});
export const uploadSigningInputSchema = signerInputSchema.extend(pdfInputSchema.shape);
export type Signature = z.infer<typeof signatureDtoSchema>;
export type Inspection = z.infer<typeof inspectionDtoSchema>;
export type SigningInput = z.infer<typeof signingInputSchema>;
export const ELECTRONIC_CONSENT =
  "Hai Bên đồng ý giao kết và ký Hợp đồng này bằng phương tiện điện tử trên cổng khách hàng; chữ ký điện tử của mỗi Bên có giá trị như chữ ký trên văn bản giấy theo thoả thuận này";
