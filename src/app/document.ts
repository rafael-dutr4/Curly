import { applyEdits, type TextEdit } from "../edit/textedit.ts";
import { compile, type Compilation } from "../lang/compile.ts";
import type { Model } from "../lang/model.ts";

/**
 * The document is the application's only state, and it is a string.
 *
 * Everything on screen (the diagram, the diagnostics, the exports) is derived
 * from it, so there is nothing to keep in sync and no way for two views to
 * disagree. A change arrives either as new text from the textarea or as an
 * operation from the diagram, and both end in the same place.
 */

export type Origin = "typing" | "gesture" | "history" | "load";

export interface Change {
  readonly source: string;
  readonly compilation: Compilation;
  readonly origin: Origin;
}

export type Listener = (change: Change) => void;

export type Operation = (source: string, model: Model) => TextEdit[];

/** Deep history is not free and nobody undoes a thousand steps. */
const HISTORY_LIMIT = 200;

export interface CurlyDocument {
  source(): string;
  compilation(): Compilation;
  /** Replace the text. Returns false when nothing actually changed. */
  set(next: string, origin?: Origin): boolean;
  /** Run an edit operation against the current source. Returns false when it produced no patches. */
  run(operation: Operation): boolean;
  /** End the current typing run, so the next keystroke starts a new undo step. */
  commit(): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: Listener): () => void;
}

export function createDocument(initial: string): CurlyDocument {
  let source = initial;
  let compilation = compile(initial);

  const past: string[] = [];
  const future: string[] = [];
  const listeners = new Set<Listener>();

  /**
   * Undo granularity.
   *
   * One snapshot per keystroke makes undo useless, and the usual fix is to
   * coalesce keystrokes inside a time window. That is not available here: the
   * repository forbids a clock in `src/`, because a function that reads the
   * time cannot be tested with a golden file.
   *
   * So the run is closed by events instead of by elapsed time. Typing folds
   * into the open run; a diagram gesture, an undo, a blur, or typing that adds
   * a line all close it. Ending a run on a newline is what keeps the steps at
   * roughly line granularity, which is the part a time window was buying.
   */
  let runOpen = false;

  const notify = (origin: Origin): void => {
    const change: Change = { source, compilation, origin };
    for (const listener of listeners) listener(change);
  };

  const record = (previous: string): void => {
    past.push(previous);
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
  };

  const set = (next: string, origin: Origin = "typing"): boolean => {
    if (next === source) return false;

    if (origin === "typing") {
      const addsLine = countLines(next) !== countLines(source);
      if (!runOpen || addsLine) {
        record(source);
        runOpen = !addsLine;
      } else {
        // Folded into the open run: the snapshot already on the stack is the
        // state this run started from, which is what undo should return to.
        future.length = 0;
      }
    } else {
      record(source);
      runOpen = false;
    }

    source = next;
    compilation = compile(next);
    notify(origin);
    return true;
  };

  const step = (from: string[], to: string[], origin: Origin): boolean => {
    const next = from.pop();
    if (next === undefined) return false;
    to.push(source);
    source = next;
    compilation = compile(next);
    runOpen = false;
    notify(origin);
    return true;
  };

  return {
    source: () => source,
    compilation: () => compilation,
    set,

    run(operation) {
      const edits = operation(source, compilation.model);
      if (edits.length === 0) return false;
      return set(applyEdits(source, edits), "gesture");
    },

    commit() {
      runOpen = false;
    },

    undo: () => step(past, future, "history"),
    redo: () => step(future, past, "history"),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function countLines(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") count += 1;
  return count;
}
