"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import type { LegalProfile } from "../api";
import { useMyLegalProfile } from "../queries";

const FIELDS: readonly { key: keyof LegalProfile; label: string; mono?: boolean }[] = [
  { key: "legalName", label: "Tên doanh nghiệp" },
  { key: "taxCode", label: "Mã số thuế", mono: true },
  { key: "registeredAddress", label: "Địa chỉ đăng ký" },
  { key: "representativeName", label: "Người đại diện" },
  { key: "representativeTitle", label: "Chức vụ" },
  { key: "invoiceEmail", label: "Email nhận hoá đơn" },
  { key: "bankName", label: "Ngân hàng" },
  { key: "bankAccountNumber", label: "Số tài khoản", mono: true },
  { key: "bankAccountHolder", label: "Chủ tài khoản" },
];

/**
 * "Thông tin pháp lý" (SF-UX-40): the company name, tax code, address, representative, invoice e-mail
 * and bank account the contract and the e-invoice are drawn up with, read only, so a wrong value is
 * caught before a contract is sent. Changing it is Sales' job: "Báo Sale nếu cần sửa" opens a chat.
 * Left out when the customer has none, or the BE does not offer it.
 */
export function LegalProfileCard() {
  const signedIn = useSignedIn();
  const query = useMyLegalProfile(signedIn === true);
  const profile = query.data;
  if (!profile) return null;
  const shown = FIELDS.filter((field) => profile[field.key]?.trim());
  if (shown.length === 0) return null;

  return (
    <SurfaceCard className="space-y-4">
      <section aria-labelledby="legal-profile-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="legal-profile-heading" className="font-display text-ink-primary text-base font-semibold">
            Thông tin pháp lý
          </h2>
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
            <Link href={STORE_ROUTES.chat.new}>
              <MessageCircle aria-hidden className="mr-2 size-4" />
              Báo Sale nếu cần sửa
            </Link>
          </Button>
        </div>
        <p className="text-ink-secondary text-sm">
          Hợp đồng và hoá đơn điện tử được lập theo các thông tin này.
        </p>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {shown.map((field) => (
            <div key={field.key} className="min-w-0">
              <dt className="text-ink-tertiary text-xs">{field.label}</dt>
              <dd
                className={
                  field.mono
                    ? "text-ink-primary font-mono font-medium break-all tabular-nums"
                    : "text-ink-primary font-medium break-words"
                }
              >
                {profile[field.key]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </SurfaceCard>
  );
}
