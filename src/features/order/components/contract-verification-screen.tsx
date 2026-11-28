"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { Skeleton } from "@/components/shared";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_STATUS, statusMetaOf } from "@/lib/domain/status-map";
import { formatDateTime } from "@/lib/format/date";
import { pdfInputSchema } from "../contract-signing-schemas";
import { checkContractFile, isSigningUnavailable } from "../contract-signing-api";
import { useContractVerification } from "../contract-signing-queries";
import { describeSigningError } from "../contract-signing-rules";

function CheckFile({ code }: { code: string }) {
  const [hidden, setHidden] = useState(false);
  const form = useForm<z.input<typeof pdfInputSchema>, unknown, z.output<typeof pdfInputSchema>>({
    resolver: zodResolver(pdfInputSchema),
  });
  const mutation = useMutation({
    mutationFn: (file: File) => checkContractFile(code, file),
    onError: (error) => {
      if (isSigningUnavailable(error)) setHidden(true);
    },
  });
  if (hidden) return null;
  const field = form.register("file");
  return (
    <form
      className="border-border-default space-y-3 border-t pt-4"
      noValidate
      onSubmit={form.handleSubmit(({ file }) => mutation.mutate(file!))}
    >
      <h2 className="text-ink-primary font-semibold">Kiểm tra file</h2>
      <p className="text-ink-secondary text-sm">
        Chọn PDF để đối chiếu SHA-256 với bản hợp đồng đã ký lưu trong hệ thống.
      </p>
      <Label htmlFor="verification-file">File PDF (tối đa 20 MB)</Label>
      <Input
        id="verification-file"
        type="file"
        accept="application/pdf,.pdf"
        disabled={mutation.isPending}
        {...field}
        onChange={(event) => {
          mutation.reset();
          void field.onChange(event);
        }}
      />
      {form.formState.errors.file && (
        <p role="alert" className="text-danger-ink text-sm">
          {form.formState.errors.file.message}
        </p>
      )}
      <Button type="submit" className="min-h-11" disabled={mutation.isPending}>
        {mutation.isPending ? "Đang kiểm tra..." : "Kiểm tra file"}
      </Button>
      {mutation.data?.matches !== undefined && (
        <p
          role="status"
          className={mutation.data.matches ? "text-positive-ink" : "text-danger-ink"}
        >
          {mutation.data.matches
            ? "File khớp chính xác với bản hợp đồng đã ký trong hệ thống."
            : "File không khớp với bản hợp đồng đã ký trong hệ thống."}
        </p>
      )}
      {mutation.isSuccess && mutation.data.matches === undefined && (
        <p role="status">Dịch vụ chưa cung cấp kết quả đối chiếu. Vui lòng thử lại sau.</p>
      )}
      {mutation.error && (
        <p role="alert" className="text-danger-ink text-sm">
          {describeSigningError(mutation.error)}
        </p>
      )}
    </form>
  );
}
export function ContractVerificationScreen({ code }: { code: string }) {
  const query = useContractVerification(code);
  const data = query.data;
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="font-display text-ink-primary text-2xl font-semibold">Xác minh hợp đồng</h1>
      <section
        className="border-border-default bg-bg-surface space-y-4 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
        aria-label="Kết quả xác minh hợp đồng"
      >
        {query.isPending ? (
          <Skeleton role="status" aria-label="Đang xác minh hợp đồng" className="h-52 w-full" />
        ) : query.isError ? (
          <div role="alert" className="space-y-3">
            <p>Chưa tải được kết quả xác minh. Vui lòng thử lại.</p>
            <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : !data ? (
          <p role="status">
            Không tìm thấy hợp đồng hoặc dịch vụ xác minh chưa khả dụng. Vui lòng kiểm tra mã và
            liên hệ bên bán.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-ink-primary font-mono font-semibold break-all">
                {data.contractNumber ?? "Hợp đồng"}
              </h2>
              <ToneBadge {...statusMetaOf(CONTRACT_STATUS, data.status, "Đang cập nhật")} />
            </div>
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["Phiên bản", data.revision],
                  ["Bên bán", data.sellerName],
                  ["Bên mua", data.buyerName],
                  [
                    "Khách hàng ký lúc",
                    data.customerSignedAt && formatDateTime(data.customerSignedAt),
                  ],
                  ["Công ty ký lúc", data.companySignedAt && formatDateTime(data.companySignedAt)],
                  ["SHA-256", data.documentSha256],
                ] as const
              ).map(
                ([label, value]) =>
                  value != null && (
                    <div key={label} className="space-y-1">
                      <dt className="text-ink-secondary">{label}</dt>
                      <dd className="text-ink-primary break-all">{value}</dd>
                    </div>
                  ),
              )}
            </dl>
            {data.testCertificate && (
              <p
                role="note"
                className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm"
              >
                Chứng thư số dùng thử của hệ thống, không do tổ chức cung cấp dịch vụ chứng thực chữ
                ký số cấp.
              </p>
            )}
            <CheckFile code={code} />
          </>
        )}
      </section>
    </main>
  );
}
