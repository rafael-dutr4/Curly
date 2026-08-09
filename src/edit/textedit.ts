import type { Span } from "../lang/token.ts";

/**
 * The whole editing model in one idea: a change to the diagram is a change to
 * the text.
 *
 * The obvious design for an editable diagram is to keep a model object, let
 * the UI mutate it, and regenerate the file when it changes. That is a trap.
 * Regenerating destroys comments and formatting, and holding two copies of the
 * truth means writing synchronization code that is wrong in ways that only
 * surface later.
 *
 * So an edit operation is a pure function from source text to a list of
 * patches. The patches are applied, the file is reparsed, and the diagram is
 * redrawn from the result. There is exactly one piece of state in the
 * application and it is a string, which is why the two views cannot disagree.
 */

export interface TextEdit {
  /** The region to replace. An empty region (start === end) is an insertion. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function replace(span: Span | { start: number; end: number }, text: string): TextEdit {
  return { start: span.start, end: span.end, text };
}

export function insert(at: number, text: string): TextEdit {
  return { start: at, end: at, text };
}

export function remove(span: Span | { start: number; end: number }): TextEdit {
  return { start: span.start, end: span.end, text: "" };
}

/**
 * Apply patches back to front.
 *
 * Applying front to back would be a bug: the first patch changes the length of
 * the string, so every offset after it is wrong. Working backwards means the
 * offsets not yet used are still valid, and no bookkeeping is needed at all.
 *
 *     "users { a: string }"    replace [8,9)="b", replace [11,17)="int"
 *     apply [11,17) first  ->  "users { a: int }"
 *     then  [8,9)          ->  "users { b: int }"
 *
 * Overlapping patches are a programming error rather than bad user input, so
 * unlike the parser this does throw. Two operations both rewriting the same
 * text means the caller built something incoherent, and silently picking a
 * winner would hide it.
 */
export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  if (edits.length === 0) return source;

  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const later = ordered[i]!;
    const earlier = ordered[i + 1]!;
    if (earlier.end > later.start) {
      throw new Error(
        `overlapping text edits: [${earlier.start},${earlier.end}) and [${later.start},${later.end})`,
      );
    }
  }

  let result = source;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end > result.length || edit.start > edit.end) {
      throw new Error(`text edit out of range: [${edit.start},${edit.end}) in ${result.length} characters`);
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
