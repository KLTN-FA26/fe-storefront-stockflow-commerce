"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { requestTechnicalReview, reviseSpecification, uploadArtifact } from "../../api";
import {
  buildPrintPdf,
  buildSheetPdf,
  buildSpecSummary,
  documentChecksum,
  mmToPx,
  printDpi,
  runPreflight,
  specText,
  type DesignDocument,
  type PrintPage,
  type SpecSummary,
} from "../../engine";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery, designKeys, designQuery } from "../../queries";
import type { ArtifactRole, DesignArtifact, DesignDraft } from "../../types";
import { ExportError } from "./export-renderer";
import { useStudio } from "./studio-context";
import { uploadKey } from "./use-asset-upload";
import { isStored } from "./use-autosave";

export type ReviewWorkStep = "preview" | "print" | "spec" | "upload" | "request";
export type ReviewStep = "idle" | ReviewWorkStep | "done" | "error";
export const REVIEW_WORK_STEPS: readonly ReviewWorkStep[] = [
  "preview",
  "print",
  "spec",
  "upload",
  "request",
];

/** Spec §9: the preview is 1600 × 1600; the print raster is `printDpi(minDpi)` = `max(minDpi, 300)`. */
const PREVIEW_PX = 1600;

type ExportedFile = { name: string; type: string; bytes: Uint8Array };
const FILES: Record<
  "CUSTOMER_PREVIEW" | "PRINT_READY" | "TECHNICAL_SPEC",
  Omit<ExportedFile, "bytes">
> = {
  CUSTOMER_PREVIEW: { name: "preview.png", type: "image/png" },
  PRINT_READY: { name: "print-ready.pdf", type: "application/pdf" },
  TECHNICAL_SPEC: { name: "technical-spec.pdf", type: "application/pdf" },
};
type ExportRole = keyof typeof FILES;
const ROLES = Object.keys(FILES) as ExportRole[];

/** What a run has finished, kept so a retry resumes where it failed. */
type Work = {
  /** The saved document the files are of, its checksum, and its summary for the sheet and text. */
  document?: DesignDocument;
  checksum?: string;
  summary?: SpecSummary;
  files: Partial<Record<ExportRole, ExportedFile>>;
  uploaded: Partial<Record<ArtifactRole, DesignArtifact>>;
  specified: boolean;
  /** The version the specification write returned: P5 sends it. */
  version?: number | undefined;
};
const freshWork = (): Work => ({ files: {}, uploaded: {}, specified: false });

const MESSAGES = {
  notSaved: "Thiết kế chưa lưu được nên chưa thể gửi QC. Hãy lưu lại rồi thử lại.",
  failing: "Sửa các lỗi trước khi gửi kiểm tra.",
  changed: "Thiết kế vừa thay đổi ở nơi khác. Hãy kiểm tra lại rồi gửi lại.",
} as const;

/**
 * The stored document is no longer the one the files were made from (another tab or device saved
 * it): nothing more is sent, autosave goes into conflict (R69) and the next run exports anew.
 */
export class DocumentChangedError extends ExportError {}

/** One macrotask: lets the dialog paint (and stay responsive) between heavy steps. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export type ReviewSubmission = {
  run(): Promise<void>;
  retry(): Promise<void>;
  step: ReviewStep;
  error?: unknown;
  /** The step that failed, while `step` is "error". */
  failedStep?: ReviewWorkStep;
  /** How far the current step is, 0–1 (the surfaces drawn, the files uploaded). */
  fraction: number;
};

/**
 * "Gửi QC kiểm tra" (spec §9): saves what is pending, then makes the preview PNG, the print-ready
 * PDF (one page per print area at `max(minDpi, 300)` DPI with its cut path) and the technical-spec
 * PDF, uploads the three (keyed by bytes, name, type and role, R67), stores the specification text
 * and asks QC to review (P5). A failed step is retried from where it stopped: what was made or
 * uploaded is kept, and a re-sent upload carries the same key.
 */
export function useReviewSubmission(design: DesignDraft): ReviewSubmission {
  const services = useStudio();
  const { editor, template, surfaces, autosave, exportRenderer: renderer } = services;
  const client = useQueryClient();
  const work = useRef<Work>(freshWork());
  const busy = useRef(false);
  const [state, setState] = useState<Omit<ReviewSubmission, "run" | "retry">>({
    step: "idle",
    fraction: 0,
  });

  const currentVersion = async () =>
    (await client.fetchQuery({ ...designQuery(design.id), staleTime: 0 })).version;
  /** Refuses to go on unless the stored document is still the exported one (same checksum). */
  const assertStoredIs = async (checksum: string) => {
    const stored = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
    if (stored.checksum !== checksum) throw new DocumentChangedError(MESSAGES.changed);
  };

  async function execute() {
    if (busy.current) return;
    busy.current = true;
    const w = work.current;
    let step: ReviewWorkStep = "preview";
    const enter = (next: ReviewWorkStep, fraction = 0) => {
      step = next;
      setState({ step: next, fraction });
    };
    try {
      enter("preview");
      if (!w.document || !w.summary || !w.checksum) {
        await autosave.flush();
        if (!isStored(autosave.latestState())) throw new ExportError(MESSAGES.notSaved);
        const document = editor.store.getState().document;
        // The report of exactly what is sent (the panel's may still be on its 300 ms wait).
        const report = runPreflight({
          document,
          template,
          surfaces,
          sizer: services.sizer,
          assets: services.assetStatus,
          fontStatus: services.fontStatus,
        });
        if (report.result === "Fail") throw new ExportError(MESSAGES.failing);
        const checksum = await documentChecksum(document);
        // Saved, yet not what is stored: another tab or device saved since this one loaded it.
        await assertStoredIs(checksum);
        w.summary = buildSpecSummary({ name: design.name, template, document, report, checksum });
        w.checksum = checksum;
        w.document = document;
      }
      const { document, summary, checksum } = w;
      w.files.CUSTOMER_PREVIEW ??= {
        ...FILES.CUSTOMER_PREVIEW,
        bytes: await renderer.preview(PREVIEW_PX),
      };

      enter("print");
      if (!w.files.PRINT_READY) {
        const pxPerMm = mmToPx(1, printDpi(template.minDpi));
        const pages: PrintPage[] = [];
        try {
          for (const [i, code] of surfaces.order.entries()) {
            enter("print", i / surfaces.order.length);
            await breathe();
            const surface = surfaces.byCode[code]!;
            const bands = await renderer.printSurface(code, document, pxPerMm);
            const { width: widthMm, height: heightMm } = surface.flatBounds;
            pages.push({ code, widthMm, heightMm, bands, cutPath: surface.outline("trim") });
          }
        } finally {
          renderer.release();
        }
        enter("print", 1);
        await breathe();
        w.files.PRINT_READY = { ...FILES.PRINT_READY, bytes: await buildPrintPdf(pages) };
      }

      enter("spec");
      if (!w.files.TECHNICAL_SPEC) {
        const sheet = await renderer.specSheet(summary);
        await breathe();
        w.files.TECHNICAL_SPEC = { ...FILES.TECHNICAL_SPEC, bytes: await buildSheetPdf(sheet) };
      }

      for (const [i, artifactRole] of ROLES.entries()) {
        enter("upload", i / ROLES.length);
        const file = w.files[artifactRole];
        if (w.uploaded[artifactRole] || !file) continue;
        const key = await uploadKey(file.bytes, file.name, file.type, artifactRole);
        // pdf-lib and `Blob.arrayBuffer` hand out plain ArrayBuffer-backed bytes.
        const blob = new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type });
        w.uploaded[artifactRole] = await uploadArtifact(
          design.id,
          artifactRole,
          blob,
          file.name,
          key,
        );
      }

      enter("request");
      if (!w.specified) {
        await assertStoredIs(checksum);
        const revised = await reviseSpecification(design.id, {
          version: await currentVersion(),
          spec: specText(summary), // ≤ 4000 characters (R32)
        });
        w.specified = true;
        w.version = revised.version;
      }
      await assertStoredIs(checksum);
      const version = w.version ?? (await currentVersion());
      const requested = await requestTechnicalReview(design.id, { version });
      client.setQueryData(designKeys.detail(design.id), requested);
      autosave.setVersion(requested.version); // R48: the next save sends the version P5 left
      await invalidateDesign(client, design.id);
      setState({ step: "done", fraction: 1 });
    } catch (error) {
      w.version = undefined; // a failed write may mean the design moved on: read it again
      if (error instanceof DocumentChangedError) {
        // R69: the editor is behind a document saved elsewhere. Autosave stops and the conflict
        // dialog offers the reload; the dialog closes (see `ReviewSubmitDialog`).
        work.current = freshWork();
        autosave.conflict();
      } else if (Object.keys(w.uploaded).length > 0 || w.specified) {
        // The uploads and the specification moved the version on: re-read the design so autosave
        // adopts it (R48, R69: the stored document is still this one) instead of a 409.
        void invalidateDesign(client, design.id);
      }
      setState({ step: "error", error, failedStep: step, fraction: 0 });
    } finally {
      busy.current = false;
    }
  }

  return {
    ...state,
    run: () => {
      work.current = freshWork();
      return execute();
    },
    retry: execute,
  };
}
