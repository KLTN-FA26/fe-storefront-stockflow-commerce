"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/shared";

export default function OrderDetailError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <PageContainer className="max-w-4xl text-center">
      <h2 className="font-display text-ink-primary text-2xl font-bold">Đã xảy ra lỗi</h2>
      <p className="text-ink-secondary mt-2">{error.message}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button variant="outline" className="rounded-full" onClick={() => router.back()}>
          Quay lại
        </Button>
        <Button className="rounded-full" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </PageContainer>
  );
}
