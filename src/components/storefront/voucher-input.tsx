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
    <div className="border-border-default bg-bg-surface space-y-2 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      <label className="text-ink-primary text-sm font-semibold" htmlFor="voucher-code">
        Mã ưu đãi
      </label>
      <div className="flex gap-2">
        <Input
          id="voucher-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="STOCKFLOW"
          className="h-11 min-w-0"
        />
        <Button
          type="button"
          className="min-h-11 shrink-0 rounded-[var(--r-md)]"
          disabled={!code.trim()}
          onClick={() => onApply(code.trim())}
        >
          Áp dụng
        </Button>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
