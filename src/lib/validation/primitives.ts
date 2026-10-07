// Ported — same validation primitives
import { z } from "zod";

export const vnd = (msg = "Số tiền không hợp lệ") =>
  z.number().int(msg).nonnegative(msg);

export const money = (msg = "Số tiền không hợp lệ") =>
  z.number().nonnegative(msg);

export const intQty = (msg = "Số lượng phải > 0") =>
  z.number().int(msg).positive(msg);

export const decimalQty = (msg = "Số lượng phải > 0") =>
  z.number().positive(msg);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ (YYYY-MM-DD)");

export const futureDate = isoDate.refine(
  (d) => new Date(d) > new Date(),
  "Ngày phải trong tương lai",
);

export const expiryAfter = (receiveDate: string) =>
  isoDate.refine((d) => d > receiveDate, "Hạn dùng phải sau ngày nhận"); // BR-06 (03-receipt)

export const barcode = z.string().min(4, "Barcode quá ngắn").max(64, "Barcode quá dài");

export const locationCode = z
  .string()
  .regex(/^LOC-[A-Z]{2,3}-/, "Mã vị trí không hợp lệ (LOC-XX(X)-...)");

export const requiredString = (msg = "Trường bắt buộc") =>
  z.string().trim().min(1, msg);

export const currencySchema = z.enum(["VND", "USD", "CNY"]);

export const email = z.string().email("Email không hợp lệ");

export const phone = z
  .string()
  .regex(/^(\+84|0)\d{9,10}$/, "Số điện thoại không hợp lệ");

/** Matches backend VietnamPhoneValidator: mobile/landline, optional separators and +84/84. */
export const vietnamPhone = z.string().refine((value) => {
  if (value.trim() === "") return true;
  const compact = value.replace(/[\s.\-()]/g, "");
  return /^(?:\+?84|0)(?:[35789]\d{8}|2\d{9})$/.test(compact);
}, "Số điện thoại không hợp lệ");
