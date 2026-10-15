"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

/** Last-resort boundary for unexpected render errors; data errors are handled in the screens. */
export default function AddressesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-5xl space-y-4">
      <Alert tone="danger" title="Không hiển thị được sổ địa chỉ">
        Đã xảy ra lỗi ngoài dự kiến.{error.digest ? ` (Mã tra cứu: ${error.digest})` : ""}
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button className="h-11 rounded-[var(--r-md)]" onClick={reset}>
          Thử lại
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-[var(--r-md)]">
          <Link href={STORE_ROUTES.account.home}>Về tài khoản</Link>
        </Button>
      </div>
    </div>
  );
}
