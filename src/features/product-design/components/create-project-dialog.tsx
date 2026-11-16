"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { STORE_ROUTES } from "@/constants";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

import { ApiError } from "@/lib/api/error";

import { describeProjectError } from "../errors";
import { useCreateProject } from "../mutations";
import { projectCreateInputSchema } from "../project-schemas";
import type { CreateProjectInput } from "../types";

const FIELD_ERROR = "text-danger text-sm";

function CreateProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const create = useCreateProject();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(projectCreateInputSchema),
    defaultValues: { name: "", description: "" },
  });
  const submit = handleSubmit((values) =>
    create.mutate(
      { name: values.name, description: values.description?.trim() || undefined },
      {
        onSuccess: (project) => router.push(STORE_ROUTES.design.project(project.id)),
        // A field the server refused is shown on that field, not only in the Alert.
        onError: (error) => {
          const message = error instanceof ApiError ? error.fieldErrors?.name : undefined;
          if (message) setError("name", { message });
        },
      },
    ),
  );
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Tạo dự án</DialogTitle>
        <DialogDescription>
          Dự án gom các bản thiết kế của một bộ sản phẩm và dùng chung ảnh, mẫu chữ.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="project-name">Tên dự án</Label>
        <Input
          id="project-name"
          className="min-h-11"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "project-name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p id="project-name-error" role="alert" className={FIELD_ERROR}>
            {errors.name.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-description">Mô tả (không bắt buộc)</Label>
        <Textarea
          id="project-description"
          rows={3}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "project-description-error" : undefined}
          {...register("description")}
        />
        {errors.description ? (
          <p id="project-description-error" role="alert" className={FIELD_ERROR}>
            {errors.description.message}
          </p>
        ) : null}
      </div>
      {create.isError ? <Alert tone="danger">{describeProjectError(create.error)}</Alert> : null}
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          onClick={onCancel}
          disabled={create.isPending}
        >
          Huỷ
        </Button>
        <Button
          type="submit"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          disabled={create.isPending || create.isSuccess}
        >
          {create.isPending ? "Đang tạo..." : "Tạo dự án"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Tạo dự án": a name and an optional description; the new project's page opens when it is made. */
export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        <CreateProjectForm onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
