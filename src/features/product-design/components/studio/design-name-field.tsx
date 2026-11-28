"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Input } from "@/components/ui/input";

import { describeDesignError } from "../../errors";
import { useRenameDesign } from "../../mutations";
import { designKeys } from "../../queries";
import { renameDesignInputSchema } from "../../schemas";
import type { Design } from "../../types";
import { useStudio } from "./studio-context";
import { StudioIconButton } from "./studio-icon-button";

type NameInput = z.input<typeof renameDesignInputSchema>;
type NameOutput = z.output<typeof renameDesignInputSchema>;

/**
 * The inline form: the name field, checked with the rename schema (1–200 characters once trimmed,
 * docs 12 §3). Enter or leaving the field renames; Escape gives up. While the rename is sent the
 * field waits; a refusal is said under it and the field stays open.
 */
function NameForm({ onDone }: { onDone: () => void }) {
  const { design, autosave } = useStudio();
  const client = useQueryClient();
  const rename = useRenameDesign(design.id);
  const errorId = useId();
  const { register, handleSubmit, setFocus, formState } = useForm<NameInput, unknown, NameOutput>({
    resolver: zodResolver(renameDesignInputSchema),
    defaultValues: { name: design.name },
  });

  /** A rename is under way, or the field was given up: Enter then blur must not send twice. */
  const settled = useRef(false);

  useEffect(() => {
    setFocus("name", { shouldSelect: true });
  }, [setFocus]);

  const send = async ({ name }: NameOutput) => {
    if (settled.current) return;
    if (name === design.name) return onDone();
    settled.current = true;
    try {
      // What is pending is saved first, so the rename sends the version the server holds now.
      await autosave.flush();
      const version =
        client.getQueryData<Design>(designKeys.detail(design.id))?.version ?? design.version;
      const renamed = await rename.mutateAsync({ name, version });
      autosave.setVersion(renamed.version); // the rename moved the version on (docs 12 BR-11)
      onDone();
    } catch {
      // `rename.error` says why; a design that moved to another status closes the field itself.
      settled.current = false;
    }
  };
  const submit = () => handleSubmit(send)();
  const giveUp = () => {
    settled.current = true;
    onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") giveUp();
  };
  const message =
    formState.errors.name?.message ?? (rename.error && describeDesignError(rename.error));
  const field = register("name");

  return (
    <div className="relative min-w-0">
      <Input
        {...field}
        onBlur={(event) => {
          void field.onBlur(event);
          void submit();
        }}
        aria-label="Tên thiết kế"
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        readOnly={formState.isSubmitting}
        onKeyDown={onKeyDown}
        className="h-11 max-w-72 min-w-0 rounded-[var(--r-md)]"
      />
      {message ? (
        <p
          id={errorId}
          role="alert"
          className="bg-bg-surface border-border-default text-danger absolute top-full left-0 z-10 mt-1 w-max max-w-72 rounded-[var(--r-md)] border px-2 py-1 text-xs shadow-[var(--sh-md)]"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The design's name as the page heading, renamed in place through `PATCH /designs/{id}` while the
 * design may be renamed (`editable`: a DRAFT). Not offered once it is read-only.
 */
export function DesignNameField({ editable }: { editable: boolean }) {
  const { design } = useStudio();
  const [editing, setEditing] = useState(false);

  if (editing && editable) return <NameForm onDone={() => setEditing(false)} />;
  return (
    <div className="flex min-w-32 items-center gap-0.5">
      <h1 title={design.name} className="text-ink-primary truncate text-base font-semibold">
        {design.name}
      </h1>
      {editable ? (
        <StudioIconButton label="Đổi tên thiết kế" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
        </StudioIconButton>
      ) : null}
    </div>
  );
}
