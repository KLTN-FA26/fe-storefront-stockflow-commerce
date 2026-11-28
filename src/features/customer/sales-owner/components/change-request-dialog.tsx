"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm } from "react-hook-form";

import { cn } from "@/lib/cn";
import { Alert, SearchableCombobox, type ComboboxOption } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import { OWNER_CHANGE_REQUEST_REASON_LABELS } from "../lifecycle";
import { describeOwnerChangeRequestError, useSubmitOwnerChangeRequest } from "../mutations";
import { useMySalesOptions } from "../queries";
import {
  OWNER_CHANGE_REQUEST_REASONS,
  ownerChangeRequestFormSchema,
  toOwnerChangeRequest,
  type OwnerChangeRequestFormInput,
  type OwnerChangeRequestFormValues,
} from "../schemas";

const DIALOG =
  "bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0";
const BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";
/** The "no preference" entry of the Sales list; sent as no `preferredSalesUserId`. */
const NO_PREFERENCE: ComboboxOption = { value: "none", label: "Không chọn ai cụ thể" };

function ErrorText({ id, error }: { id: string; error?: string | undefined }) {
  return error ? (
    <p id={id} role="alert" className="text-danger-ink text-xs">
      {error}
    </p>
  ) : null;
}

/** The form, mounted only while the dialog is open: each opening starts empty. */
function RequestForm({ onClose }: { onClose: () => void }) {
  const submit = useSubmitOwnerChangeRequest();
  // Optional: the list is offered only when the BE answers it (D11, KE-HOACH §10.5).
  const options = useMySalesOptions().data ?? [];
  const { control, register, handleSubmit, formState } = useForm<
    OwnerChangeRequestFormInput,
    unknown,
    OwnerChangeRequestFormValues
  >({
    resolver: zodResolver(ownerChangeRequestFormSchema),
    defaultValues: { note: "", preferredSalesUserId: "" },
  });
  const reason = useController({ control, name: "reason" });
  const preferred = useController({ control, name: "preferredSalesUserId" });
  const { errors } = formState;
  const send = handleSubmit((values) =>
    submit.mutate(toOwnerChangeRequest(values), { onSuccess: onClose }),
  );
  const salesOptions = [NO_PREFERENCE, ...options.map((o) => ({ value: o.userId, label: o.name }))];

  return (
    <form onSubmit={send} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Yêu cầu đổi người hỗ trợ</DialogTitle>
        <DialogDescription>
          Quản lý bán hàng sẽ xem xét yêu cầu và báo kết quả cho bạn. Sale hiện tại không thấy yêu
          cầu này trước khi có quyết định.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="text-ink-primary mb-1 text-sm font-medium">Lý do</legend>
        <RadioGroup
          value={reason.field.value ?? ""}
          onValueChange={reason.field.onChange}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? "owner-change-reason-error" : undefined}
          className="gap-2"
        >
          {OWNER_CHANGE_REQUEST_REASONS.map((value) => (
            <Label
              key={value}
              className={cn(
                "border-border-default flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-3 font-normal",
                reason.field.value === value && "border-accent bg-bg-subtle",
              )}
            >
              <RadioGroupItem value={value} />
              {OWNER_CHANGE_REQUEST_REASON_LABELS[value]}
            </Label>
          ))}
        </RadioGroup>
        <ErrorText id="owner-change-reason-error" error={errors.reason?.message} />
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="owner-change-note">Ghi chú</Label>
        <Textarea
          id="owner-change-note"
          rows={3}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? "owner-change-note-error" : undefined}
          {...register("note")}
        />
        <ErrorText id="owner-change-note-error" error={errors.note?.message} />
      </div>

      {options.length > 0 ? (
        <div className="grid gap-1">
          <SearchableCombobox
            label="Sale bạn muốn làm việc"
            value={preferred.field.value || NO_PREFERENCE.value}
            options={salesOptions}
            onSelect={(option) =>
              preferred.field.onChange(option.value === NO_PREFERENCE.value ? "" : option.value)
            }
          />
          <p className="text-ink-tertiary text-xs">Không bắt buộc. Quản lý bán hàng sẽ cân nhắc.</p>
        </div>
      ) : null}

      {submit.error ? (
        <div role="alert">
          <Alert tone="danger">{describeOwnerChangeRequestError(submit.error)}</Alert>
        </div>
      ) : null}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className={BUTTON}
          disabled={submit.isPending}
          onClick={onClose}
        >
          Huỷ
        </Button>
        <Button type="submit" className={BUTTON} disabled={submit.isPending}>
          {submit.isPending ? "Đang gửi..." : "Gửi yêu cầu"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ChangeRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        {open ? <RequestForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
