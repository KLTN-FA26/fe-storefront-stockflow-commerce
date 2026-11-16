"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { describeProjectError } from "../errors";
import { useUpdateProject } from "../mutations";
import { projectCreateInputSchema } from "../project-schemas";
import type { DesignProject } from "../types";

/** What the form holds: the name, and the description as text (empty stands for none). */
const formSchema = projectCreateInputSchema
  .pick({ name: true })
  .extend({ description: projectCreateInputSchema.shape.description.unwrap().unwrap() });
type FormValues = { name: string; description: string };

function EditForm({ project, onDone }: { project: DesignProject; onDone: () => void }) {
  const update = useUpdateProject(project.id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: project.name, description: project.description ?? "" },
  });
  const submit = handleSubmit(({ name, description }) =>
    update.mutate(
      {
        name,
        description: description.trim() === "" ? null : description,
        version: project.version,
      },
      { onSuccess: onDone },
    ),
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <Label htmlFor="project-rename" className="sr-only">
        Tên dự án
      </Label>
      <Input
        id="project-rename"
        autoFocus
        className="min-h-11 max-w-md rounded-[var(--r-md)]"
        aria-invalid={errors.name ? true : undefined}
        {...register("name")}
      />
      {errors.name ? (
        <p role="alert" className="text-danger text-sm">
          {errors.name.message}
        </p>
      ) : null}
      <Label htmlFor="project-description" className="sr-only">
        Mô tả dự án
      </Label>
      <Textarea
        id="project-description"
        placeholder="Mô tả dự án (không bắt buộc)"
        className="max-w-xl rounded-[var(--r-md)]"
        aria-invalid={errors.description ? true : undefined}
        {...register("description")}
      />
      {errors.description ? (
        <p role="alert" className="text-danger text-sm">
          {errors.description.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={update.isPending}
        >
          {update.isPending ? "Đang lưu..." : "Lưu"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={onDone}
          disabled={update.isPending}
        >
          Huỷ
        </Button>
      </div>
      {update.isError ? <Alert tone="danger">{describeProjectError(update.error)}</Alert> : null}
    </form>
  );
}

/** The project's name as the page's heading, with its description, edited in place while the project is open. */
export function ProjectTitle({ project }: { project: DesignProject }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <EditForm project={project} onDone={() => setEditing(false)} />;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <h1 className="font-display text-ink-primary min-w-0 text-2xl font-bold break-words sm:text-3xl">
        {project.name}
      </h1>
      {project.status === "ACTIVE" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-[var(--r-md)]"
          aria-label="Sửa tên và mô tả dự án"
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
