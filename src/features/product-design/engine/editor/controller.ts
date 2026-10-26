import { shallow } from "zustand/shallow";
import { createStore, type StoreApi } from "zustand/vanilla";

import { DocumentHistory } from "../document/history";
import type { DesignDocument, Hex } from "../document/schema";
import type { CustomizationTemplate, PrintAreaCode } from "../template/schema";

export type ToolId = "select" | "image" | "text" | "brush" | "eraser" | "background";

export type EditorState = {
  document: DesignDocument;
  activeSurface: PrintAreaCode;
  /** An element of the active surface, or `null`. */
  selectedId: string | null;
  tool: ToolId;
  zoom: number;
  readOnly: boolean;
  brush: { sizeMm: number; color: Hex; opacity: number };
  eraser: { sizeMm: number };
  /** Bumped by every change to the document (command, undo, redo, replace); drives autosave and preflight. */
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
};

export type EditorController = {
  store: StoreApi<EditorState>;
  /**
   * Run a document command. A command that returns the same document is not an edit: nothing is
   * recorded and nobody is told. Commands sharing a `gestureId` (one drag, one stroke) are one undo step.
   */
  apply(command: (doc: DesignDocument) => DesignDocument, opts?: { gestureId?: string }): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  setTool(tool: ToolId): void;
  /** Ignored for a code the template has no print area for. Drops the selection. */
  setActiveSurface(code: PrintAreaCode): void;
  setZoom(zoom: number): void;
  /** While read-only, commands, undo and redo do nothing; `replaceDocument` still loads. */
  setReadOnly(readOnly: boolean): void;
  setBrush(patch: Partial<EditorState["brush"]>): void;
  setEraser(patch: Partial<EditorState["eraser"]>): void;
  /** Load another document (a saved version, a conflict reload): history is cleared, every surface is reported changed. */
  replaceDocument(doc: DesignDocument): void;
  /** `changed` lists the template's print areas whose content changed; returns the unsubscribe. */
  onDocumentChange(listener: (doc: DesignDocument, changed: PrintAreaCode[]) => void): () => void;
  newId(): string;
};

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

const DEFAULT_BRUSH: EditorState["brush"] = { sizeMm: 2, color: "#000000", opacity: 1 };
const DEFAULT_ERASER: EditorState["eraser"] = { sizeMm: 5 };

export function createEditor(opts: {
  template: CustomizationTemplate;
  document: DesignDocument;
  newId?: () => string;
}): EditorController {
  const { template } = opts;
  const codes = template.printAreas.map((area) => area.code);
  const [firstSurface] = codes;
  if (firstSurface === undefined) throw new Error("A template needs at least one print area");

  const history = new DocumentHistory();
  const listeners = new Set<(doc: DesignDocument, changed: PrintAreaCode[]) => void>();

  const store = createStore<EditorState>(() => ({
    document: opts.document,
    activeSurface: firstSurface,
    selectedId: null,
    tool: "select",
    zoom: 1,
    readOnly: false,
    brush: DEFAULT_BRUSH,
    eraser: DEFAULT_ERASER,
    revision: 0,
    canUndo: false,
    canRedo: false,
  }));

  /** Undo and redo are offered only while they would do something, which excludes read-only. */
  const historyFlags = (readOnly: boolean) => ({
    canUndo: !readOnly && history.canUndo,
    canRedo: !readOnly && history.canRedo,
  });

  const changedSurfaces = (before: DesignDocument, after: DesignDocument) =>
    codes.filter((code) => before.surfaces[code] !== after.surfaces[code]);

  /** The selection survives only while its element is still on the active surface. */
  const keepSelection = (doc: DesignDocument, state: EditorState) => {
    const onSurface = doc.surfaces[state.activeSurface]?.elements.some(
      (element) => element.id === state.selectedId,
    );
    return onSurface ? state.selectedId : null;
  };

  /** Store the new document, then tell the listeners, so they can read a consistent state. */
  const commit = (doc: DesignDocument, changed: PrintAreaCode[]) => {
    const state = store.getState();
    store.setState({
      document: doc,
      selectedId: keepSelection(doc, state),
      revision: state.revision + 1,
      ...historyFlags(state.readOnly),
    });
    for (const listener of [...listeners]) listener(doc, changed);
  };

  const travel = (step: (current: DesignDocument) => DesignDocument | null) => {
    const { document: current, readOnly } = store.getState();
    if (readOnly) return;
    const target = step(current);
    if (target) commit(target, changedSurfaces(current, target));
  };

  return {
    store,

    apply(command, applyOpts) {
      const { document: before, readOnly } = store.getState();
      if (readOnly) return;
      const after = command(before);
      if (after === before) return;
      history.record(before, applyOpts?.gestureId);
      commit(after, changedSurfaces(before, after));
    },

    undo: () => travel((current) => history.undo(current)),
    redo: () => travel((current) => history.redo(current)),

    select(id) {
      if (store.getState().selectedId !== id) store.setState({ selectedId: id });
    },

    setTool(tool) {
      if (store.getState().tool !== tool) store.setState({ tool });
    },

    setActiveSurface(code) {
      if (!codes.includes(code) || store.getState().activeSurface === code) return;
      store.setState({ activeSurface: code, selectedId: null });
    },

    setZoom(zoom) {
      if (Number.isNaN(zoom)) return;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      if (store.getState().zoom !== clamped) store.setState({ zoom: clamped });
    },

    setReadOnly(readOnly) {
      if (store.getState().readOnly === readOnly) return;
      store.setState({ readOnly, ...historyFlags(readOnly) });
    },

    setBrush(patch) {
      const current = store.getState().brush;
      const brush = { ...current, ...patch };
      if (!shallow(current, brush)) store.setState({ brush });
    },

    setEraser(patch) {
      const current = store.getState().eraser;
      const eraser = { ...current, ...patch };
      if (!shallow(current, eraser)) store.setState({ eraser });
    },

    replaceDocument(doc) {
      history.clear();
      commit(doc, [...codes]);
    },

    onDocumentChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    newId: opts.newId ?? (() => crypto.randomUUID()),
  };
}
