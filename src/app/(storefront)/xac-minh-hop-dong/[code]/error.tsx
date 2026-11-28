"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-ink-primary text-xl font-semibold">
        Chưa mở được trang xác minh hợp đồng
      </h1>
      <p className="text-ink-secondary">Vui lòng thử lại sau.</p>
      <Button className="min-h-11" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
