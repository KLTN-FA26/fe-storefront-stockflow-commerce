import { z } from "zod";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { contractDocumentDtoSchema } from "./contract-schemas";
import {
  otpDtoSchema,
  revisionDtoSchema,
  verificationDtoSchema,
  type SigningInput,
} from "./contract-signing-schemas";

export const signingBase = (id: string) => `/orders/me/${encodeURIComponent(id)}/contract`;
export const verificationBase = (code: string) =>
  `/public/contract-verifications/${encodeURIComponent(code)}`;
export const isSigningUnavailable = (error: unknown) =>
  error instanceof ApiError && [400, 403, 404, 405].includes(error.status);

export async function optionalSigningGet<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  try {
    const { data } = await api.get<unknown>(path, signal ? { signal } : {});
    return schema.parse(data);
  } catch (error) {
    if (isSigningUnavailable(error)) return null;
    throw error;
  }
}
export const getContractRevisions = (id: string, signal?: AbortSignal) =>
  optionalSigningGet(`${signingBase(id)}/revisions`, z.array(revisionDtoSchema), signal);
export const getContractVerification = (code: string, signal?: AbortSignal) =>
  optionalSigningGet(verificationBase(code), verificationDtoSchema, signal);
export const getSignaturePage = (id: string) =>
  optionalSigningGet(`${signingBase(id)}/signature-page`, contractDocumentDtoSchema);
export const getRevisionDocument = (id: string, revision: number) =>
  optionalSigningGet(
    `${signingBase(id)}/revisions/${revision}/document`,
    contractDocumentDtoSchema,
  );
export async function requestContractOtp(id: string) {
  const { data } = await api.post<unknown>(`${signingBase(id)}/sign/otp`, {});
  return otpDtoSchema.parse(data);
}
// Mutations return ContractView; refresh the canonical GET and related queries afterwards.
export async function signContract(id: string, version: number, input: SigningInput) {
  const { otp, signerName, signerTitle } = input;
  await api.post(`${signingBase(id)}/sign`, {
    version,
    otp,
    signerName,
    signerTitle,
    consent: true,
  });
}
export async function requestContractChanges(id: string, version: number, reason: string) {
  await api.post(`${signingBase(id)}/change-request`, { version, reason });
}
export async function uploadContractSignature(
  id: string,
  version: number,
  file: File,
  signerName: string,
  signerTitle: string,
) {
  const body = new FormData();
  body.append("file", file);
  body.append("version", String(version));
  body.append("signerName", signerName);
  body.append("signerTitle", signerTitle);
  await api.post(`${signingBase(id)}/sign/upload`, body, { headers: { "Content-Type": null } });
}
export async function checkContractFile(code: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post<unknown>(`${verificationBase(code)}/check`, body, {
    headers: { "Content-Type": null },
  });
  return z.object({ matches: z.boolean().optional() }).parse(data);
}
