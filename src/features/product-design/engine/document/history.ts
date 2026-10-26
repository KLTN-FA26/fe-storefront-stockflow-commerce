import type { DesignDocument } from "./schema";

/**
 * Snapshot undo/redo. Callers `record` the document as it was *before* a change; documents are
 * immutable, so a snapshot is just a reference. Consecutive records that share a `gestureId`
 * (a drag, a brush stroke, a slider scrub) collapse into the first one, so one gesture is one step.
 */
export class DocumentHistory {
  private undoStack: DesignDocument[] = [];
  private redoStack: DesignDocument[] = [];
  private lastGestureId: string | undefined;

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(before: DesignDocument, gestureId?: string): void {
    this.redoStack = [];
    if (gestureId !== undefined && gestureId === this.lastGestureId) return;
    this.lastGestureId = gestureId;
    this.push(this.undoStack, before);
  }

  /** The document to restore, or `null` when there is nothing to undo; `current` becomes redoable. */
  undo(current: DesignDocument): DesignDocument | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.lastGestureId = undefined;
    this.push(this.redoStack, current);
    return previous;
  }

  /** The document to restore, or `null` when there is nothing to redo; `current` becomes undoable. */
  redo(current: DesignDocument): DesignDocument | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.lastGestureId = undefined;
    this.push(this.undoStack, current);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastGestureId = undefined;
  }

  /** Append, dropping the oldest snapshots beyond the limit. */
  private push(stack: DesignDocument[], doc: DesignDocument): void {
    stack.push(doc);
    if (stack.length > this.limit) stack.splice(0, stack.length - this.limit);
  }
}
