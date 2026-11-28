"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ContractDocument } from "../contract-schemas";
import { isSigningUnavailable } from "../contract-signing-api";
import { describeSigningError } from "../contract-signing-rules";

export function ContractLinkButton({
  label,
  load,
}: {
  label: string;
  load: () => Promise<ContractDocument | null>;
}) {
  const [hidden, setHidden] = useState(false);
  const mutation = useMutation({ mutationFn: load });
  if (hidden) return null;
  const download = () => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    mutation.mutate(undefined, {
      onSuccess: (link) => {
        if (!link) {
          tab?.close();
          setHidden(true);
          return;
        }
        if (tab) tab.location.replace(link.url);
        else window.location.assign(link.url);
      },
      onError: (error) => {
        tab?.close();
        if (isSigningUnavailable(error)) setHidden(true);
      },
    });
  };
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        className="min-h-11 w-full"
        onClick={download}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Đang tải..." : label}
      </Button>
      {mutation.error && (
        <p role="alert" className="text-danger-ink text-sm">
          {describeSigningError(mutation.error)}
        </p>
      )}
    </div>
  );
}
