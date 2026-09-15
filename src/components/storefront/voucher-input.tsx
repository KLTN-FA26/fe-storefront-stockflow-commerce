"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VoucherInputProps {
  value?: string;
  error?: string;
  onApply: (code: string) => void;
}

export function VoucherInput({ value = "", error, onApply }: VoucherInputProps) {
  const [code, setCode] = useState(value);

  return (
    <div className="space-y-2 rounded-xl bg-bg-surface p-4 shadow-md">
      <label className="text-sm font-semibold text-ink-primary" htmlFor="voucher-code">Mã ưu đãi</label>
      <div className="flex gap-2">
        <Input id="voucher-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="STOCKFLOW" />
        <Button type="button" className="rounded-full" disabled={!code.trim()} onClick={() => onApply(code.trim())}>Áp dụng</Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
