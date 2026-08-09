import type { ModelField } from "../lang/model.ts";
import type { Span } from "../lang/token.ts";

/**
 * Anything that holds fields between braces: a collection, or an embedded
 * document inside one. Both are edited identically, so neither the format
 * helpers nor the operations need to know which they were given.
 *
 * `span` must end just past the closing brace, which is true of both a
 * collection's span and an embedded type's span.
 */
export interface Container {
  readonly fields: readonly ModelField[];
  readonly span: Span;
}

/**
 * Deleting text is easy. Inserting is where a generated file starts to look
 * generated, so the rule for everything added here is: copy the neighbours.
 *
 * A new field takes the indentation of the field above it and matches whether
 * the file uses a trailing comma. None of this is guesswork about a style
 * guide, it is reading what the user already did two lines up.
 */

export const DEFAULT_INDENT = "  ";

/** Offset of the first character on the line containing `offset`. */
export function lineStart(source: string, offset: number): number {
  const previous = source.lastIndexOf("\n", Math.max(0, offset - 1));
  return previous === -1 ? 0 : previous + 1;
}

/** Offset just past the end of the line containing `offset`, newline excluded. */
export function lineEnd(source: string, offset: number): number {
  const next = source.indexOf("\n", offset);
  return next === -1 ? source.length : next;
}

/** The leading whitespace of the line containing `offset`. */
export function indentAt(source: string, offset: number): string {
  const start = lineStart(source, offset);
  const match = /^[ \t]*/.exec(source.slice(start, lineEnd(source, start)));
  return match ? match[0] : "";
}

/** True when everything before `offset` on its line is whitespace. */
export function aloneOnLine(source: string, offset: number): boolean {
  return source.slice(lineStart(source, offset), offset).trim() === "";
}

/**
 * The indentation to use for a new field: whatever the existing fields use, or
 * one step in from the collection when the block is empty.
 */
export function fieldIndent(source: string, container: Container): string {
  const first = container.fields[0];
  if (first && aloneOnLine(source, first.span.start)) return indentAt(source, first.span.start);
  return indentAt(source, container.span.start) + DEFAULT_INDENT;
}

/** The `}` that closes a container is the last character of its span. */
export function closingBrace(container: Container): number {
  return container.span.end - 1;
}

/**
 * Offset of the comma after a field, or null when there is none.
 * Only whitespace and comments may sit between the field and its comma.
 */
export function commaAfter(source: string, field: ModelField, limit: number): number | null {
  let index = field.span.end;
  while (index < limit) {
    const character = source[index]!;
    if (character === ",") return index;
    if (character === "/" && source[index + 1] === "/") {
      index = lineEnd(source, index);
      continue;
    }
    if (!/\s/.test(character)) return null;
    index += 1;
  }
  return null;
}

/** True when the last field of the block is followed by a comma. */
export function usesTrailingComma(source: string, container: Container): boolean {
  const last = container.fields.at(-1);
  if (!last) return false;
  return commaAfter(source, last, closingBrace(container)) !== null;
}

/** True when the block is written across several lines rather than on one. */
export function isMultiline(source: string, container: Container): boolean {
  return source.slice(container.span.start, container.span.end).includes("\n");
}
