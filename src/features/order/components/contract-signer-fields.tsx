"use client";

import type { FieldErrors, UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContractSignerFields({
  register,
  errors,
}: {
  register: (
    name: "signerName" | "signerTitle",
  ) => UseFormRegisterReturn<"signerName" | "signerTitle">;
  errors: FieldErrors<{ signerName: string; signerTitle: string }>;
}) {
  return (
    <>
      {(
        [
          ["signerName", "Họ tên người ký"],
          ["signerTitle", "Chức danh người ký"],
        ] as const
      ).map(([name, label]) => (
        <div className="space-y-1.5" key={name}>
          <Label htmlFor={name}>{label}</Label>
          <Input
            id={name}
            maxLength={200}
            autoComplete={name === "signerName" ? "name" : "organization-title"}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
            {...register(name)}
          />
          {errors[name] && (
            <p id={`${name}-error`} role="alert" className="text-danger-ink text-sm">
              {errors[name]?.message}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
