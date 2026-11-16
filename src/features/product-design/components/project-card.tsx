"use client";

import Image from "next/image";
import Link from "next/link";
import { FolderOpen } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { isRemoteImage } from "@/lib/remote-image";

import { PROJECT_DESIGN_LIMIT } from "../project-schemas";
import { useProjectPreviews } from "../queries";
import type { ProjectSummary } from "../types";
import { ProjectStatusBadge } from "./project-status-badge";

/** Up to four previews in a strip; empty slots stay as quiet tiles so every card keeps its shape. */
function PreviewStrip({ urls, name }: { urls: readonly string[]; name: string }) {
  return (
    <div className="bg-bg-subtle grid grid-cols-4 gap-1 p-2">
      {[0, 1, 2, 3].map((i) => {
        const src = urls[i];
        return (
          <div
            key={i}
            className="bg-bg-surface border-border-default relative aspect-square overflow-hidden rounded-[var(--r-md)] border"
          >
            {src ? (
              <Image
                src={src}
                alt={`Bản xem trước ${i + 1} của ${name}`}
                fill
                unoptimized={isRemoteImage(src) || src.startsWith("blob:")}
                sizes="(min-width: 1024px) 8vw, 20vw"
                className="object-contain p-1"
              />
            ) : i === 0 ? (
              <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center">
                <FolderOpen aria-hidden className="size-5" />
                <span className="sr-only">Chưa có bản xem trước</span>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** One project (spec 2026-11-12 §5): name, description, previews, "N/20 bản", when, status. */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const href = STORE_ROUTES.design.project(project.id);
  const previewUrls = useProjectPreviews(project.id);
  return (
    <article className="bg-bg-surface border-border-default flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-shadow duration-200 hover:shadow-[var(--sh-md)]">
      <PreviewStrip urls={previewUrls} name={project.name} />
      <div className="flex flex-1 flex-col gap-3 p-[var(--card-pad)]">
        <div className="space-y-2">
          <ProjectStatusBadge status={project.status} />
          <h2 className="text-ink-primary line-clamp-2 text-base font-semibold break-words">
            {project.name}
          </h2>
          {project.description ? (
            <p className="text-ink-secondary line-clamp-2 text-sm break-words">
              {project.description}
            </p>
          ) : null}
          <p className="text-ink-tertiary text-xs tabular-nums">
            {project.designCount}/{PROJECT_DESIGN_LIMIT} bản
          </p>
          <p className="text-ink-secondary text-sm tabular-nums">
            Tạo lúc {formatDateTime(project.createdAt)}
          </p>
        </div>
        <div className="mt-auto">
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
            <Link href={href} aria-label={`Mở dự án ${project.name}`}>
              Mở dự án
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
