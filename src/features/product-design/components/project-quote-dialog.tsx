"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasErrorCode } from "@/lib/api/describe-error";
import { cn } from "@/lib/cn";

import {
  describeQuoteRequestError,
  isCustomerInactive,
  isTransientFailure,
  projectQuoteFieldErrorsOf,
} from "../quote-request-errors";
import { useRequestProjectQuote } from "../quote-request-mutations";
import { MAX_QUOTE_CARTONS, vnToday } from "../quote-request-rules";
import { projectQuoteFormSchema } from "../quote-request-schemas";
import type {
  Design,
  DesignProject,
  ProjectQuoteFormValues,
  ProjectQuoteRequest,
  ProjectQuoteRequestInput,
} from "../types";
import {
  ACTION_BUTTON,
  DIALOG_CONTENT,
  FIELD_ERROR,
  QuoteRequestSent,
} from "./quote-request-parts";

type Props = {
  project: Pick<DesignProject, "id" | "name">;
  /** The project's APPROVED designs, in the page's order: one row each. */
  designs: readonly Design[];
  /** The request still open: its designs start chosen with their cartons, asking changes it. */
  current: ProjectQuoteRequest | null;
  onClose: () => void;
};

const defaultsOf = (
  designs: readonly Design[],
  current: ProjectQuoteRequest | null,
): ProjectQuoteFormValues => ({
  lines: designs.map((design) => {
    const asked = current?.lines.find((line) => line.designId === design.id);
    return {
      designId: design.id,
      chosen: asked !== undefined || designs.length === 1,
      cartons: asked ? String(asked.cartons) : "",
    };
  }),
  desiredDeliveryDate: current?.desiredDeliveryDate ?? "",
});

function ProjectQuoteForm({ project, designs, current, onClose }: Props) {
  const ask = useRequestProjectQuote(project.id);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<ProjectQuoteFormValues, unknown, ProjectQuoteRequestInput>({
    resolver: zodResolver(projectQuoteFormSchema),
    defaultValues: defaultsOf(designs, current),
  });
  const { fields } = useFieldArray({ control, name: "lines" });
  const chosen = useWatch({ control, name: "lines" });

  const submit = handleSubmit((input) => {
    // The form rows of the lines sent, in order: `lines[k]` of a refusal is row `sent[k]`.
    const sent = getValues("lines").flatMap((line, index) => (line.chosen ? [index] : []));
    ask.mutate(input, {
      onError: (error) => {
        const fields = projectQuoteFieldErrorsOf(error);
        if (!fields) return;
        if (fields.desiredDeliveryDate) {
          setError("desiredDeliveryDate", { message: fields.desiredDeliveryDate });
        }
        for (const [line, message] of fields.cartons) {
          const row = sent[line];
          if (row !== undefined) setError(`lines.${row}.cartons`, { message });
        }
      },
    });
  });

  if (ask.isSuccess) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Yêu cầu báo giá cả dự án</DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <QuoteRequestSent
          updated={!ask.data.created}
          chat={{ kind: "DESIGN_PROJECT", id: project.id }}
        />
        <DialogFooter className="gap-2">
          <Button type="button" className={ACTION_BUTTON} onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </>
    );
  }

  const error = ask.error;
  const onFields = error !== null && projectQuoteFieldErrorsOf(error) !== null;
  const blocked = isCustomerInactive(error) || hasErrorCode(error, "DESIGN_PROJECT_ARCHIVED");
  const listError = errors.lines?.root?.message ?? errors.lines?.message;
  const dateError = errors.desiredDeliveryDate?.message;
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {current ? "Cập nhật yêu cầu báo giá cả dự án" : "Yêu cầu báo giá cả dự án"}
        </DialogTitle>
        <DialogDescription>
          Chọn các bản đã duyệt của {project.name}, nhập số thùng mong muốn cho từng bản (chỉ là gợi
          ý) và một ngày giao chung. Sale lập một báo giá cho cả bộ.
        </DialogDescription>
      </DialogHeader>
      <fieldset
        className="grid gap-2"
        aria-describedby={listError ? "project-quote-lines-error" : undefined}
      >
        <legend className="text-ink-primary mb-1 text-sm font-medium">Bản thiết kế đã duyệt</legend>
        <ul className="grid gap-2">
          {fields.map((field, index) => {
            const design = designs[index];
            if (!design) return null;
            const rowId = `project-quote-${design.id}`;
            const cartonsError = errors.lines?.[index]?.cartons?.message;
            return (
              <li
                key={field.id}
                className="border-border-default grid gap-2 rounded-[var(--r-md)] border p-3"
              >
                <div className="flex min-h-11 items-center gap-3">
                  <Controller
                    control={control}
                    name={`lines.${index}.chosen`}
                    render={({ field: check }) => (
                      <Checkbox
                        id={`${rowId}-chosen`}
                        checked={check.value}
                        onCheckedChange={(next) => check.onChange(next === true)}
                        disabled={ask.isPending}
                      />
                    )}
                  />
                  <Label htmlFor={`${rowId}-chosen`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="text-ink-primary block truncate">{design.name}</span>
                    <span className="text-ink-tertiary block text-xs font-normal">
                      {design.variant.label}
                    </span>
                  </Label>
                </div>
                {chosen[index]?.chosen ? (
                  <div className="grid gap-1">
                    <Label htmlFor={`${rowId}-cartons`} className="text-sm">
                      Số thùng mong muốn
                    </Label>
                    <Input
                      id={`${rowId}-cartons`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_QUOTE_CARTONS}
                      step={1}
                      className="min-h-11 tabular-nums"
                      disabled={ask.isPending}
                      aria-invalid={cartonsError ? true : undefined}
                      aria-describedby={cartonsError ? `${rowId}-cartons-error` : undefined}
                      {...register(`lines.${index}.cartons`)}
                    />
                    {cartonsError ? (
                      <p id={`${rowId}-cartons-error`} role="alert" className={FIELD_ERROR}>
                        {cartonsError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {listError ? (
          <p id="project-quote-lines-error" role="alert" className={FIELD_ERROR}>
            {listError}
          </p>
        ) : null}
        <p className="text-ink-tertiary text-xs">
          Số thùng chỉ là gợi ý: Sale sẽ đề xuất số thùng và giá trong báo giá.
        </p>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="project-quote-date">Ngày giao mong muốn chung (không bắt buộc)</Label>
        <Input
          id="project-quote-date"
          type="date"
          min={vnToday()}
          className="min-h-11 tabular-nums"
          disabled={ask.isPending}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? "project-quote-date-error" : undefined}
          {...register("desiredDeliveryDate")}
        />
        {dateError ? (
          <p id="project-quote-date-error" role="alert" className={FIELD_ERROR}>
            {dateError}
          </p>
        ) : null}
      </div>
      {error && !onFields ? (
        <div role="alert">
          <Alert tone="danger">{describeQuoteRequestError(error)}</Alert>
        </div>
      ) : null}
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className={ACTION_BUTTON}
          disabled={ask.isPending}
          onClick={onClose}
        >
          Huỷ
        </Button>
        <Button type="submit" className={ACTION_BUTTON} disabled={ask.isPending || blocked}>
          {ask.isPending
            ? "Đang gửi..."
            : isTransientFailure(error)
              ? "Thử lại"
              : current
                ? "Cập nhật yêu cầu"
                : "Gửi yêu cầu"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "Yêu cầu báo giá cả dự án" (docs 12 §4.11.34): one or more APPROVED designs of the project, the
 * cartons of each and one shared date. There is no "submit and ask" for a project (§4.11.36).
 */
export function ProjectQuoteDialog({
  open,
  onOpenChange,
  ...props
}: Omit<Props, "onClose"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CONTENT, "sm:max-w-lg")}>
        {open ? <ProjectQuoteForm {...props} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
