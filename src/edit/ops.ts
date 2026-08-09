import { baseFieldType, type FieldType, type Model, type ModelField } from "../lang/model.ts";
import {
  aloneOnLine,
  closingBrace,
  commaAfter,
  type Container,
  fieldIndent,
  lineEnd,
  lineStart,
} from "./format.ts";
import { insert, remove, replace, type TextEdit } from "./textedit.ts";

/**
 * Every diagram gesture ends up in one of these functions. They take the
 * source and the model, and they return patches. They never touch the DOM,
 * never mutate anything, and never rewrite a line they were not asked to,
 * which is what keeps a 400 line model with comments byte identical apart
 * from the few characters that actually changed.
 *
 * An operation that cannot find its target returns no patches. A gesture on
 * something that is no longer there should do nothing, not throw.
 */

/** Path to a container: `[]` is the collection itself, `["profile"]` an embedded document. */
export interface ContainerRef {
  readonly collection: string;
  readonly path: readonly string[];
}

/** Path to a field, where the last element is the field's own name. */
export interface FieldRef {
  readonly collection: string;
  readonly path: readonly string[];
}

// --- lookups --------------------------------------------------------------

export function findContainer(model: Model, ref: ContainerRef): Container | null {
  const collection = model.byName.get(ref.collection);
  if (!collection) return null;

  let container: Container = { fields: collection.fields, span: collection.span };
  for (const step of ref.path) {
    const field = container.fields.find((f) => f.name === step);
    if (!field) return null;
    const base = baseFieldType(field.type);
    if (base.kind !== "embedded") return null;
    container = { fields: base.fields, span: base.span };
  }
  return container;
}

export function findField(model: Model, ref: FieldRef): ModelField | null {
  if (ref.path.length === 0) return null;
  const parent = findContainer(model, { collection: ref.collection, path: ref.path.slice(0, -1) });
  return parent?.fields.find((f) => f.name === ref.path.at(-1)) ?? null;
}

// --- collections ----------------------------------------------------------

/**
 * Renaming a collection is two kinds of edit at once: the declaration, and
 * every `ref(...)` anywhere in the file that points at it. Missing the second
 * kind would leave the model broken, which is exactly the sort of thing a
 * diagram tool is supposed to save you from.
 */
export function renameCollection(source: string, model: Model, name: string, newName: string): TextEdit[] {
  const collection = model.byName.get(name);
  if (!collection || newName === name) return [];

  const edits = [replace(collection.nameSpan, newName)];
  for (const type of everyType(model)) {
    if (type.kind === "ref" && type.target === name) edits.push(replace(type.targetSpan, newName));
  }
  return edits;
}

/**
 * Delete a collection, and only the collection.
 *
 * If something still references it the file is left with a dangling `ref`,
 * reported as an error the moment it reparses. That is deliberate. The
 * alternatives are worse: refusing the delete makes the tool argue with the
 * user, and quietly rewriting their other collections to clean up destroys
 * work they never asked to change. A visible error naming the exact reference
 * is the honest outcome.
 */
export function deleteCollection(source: string, model: Model, name: string): TextEdit[] {
  const collection = model.byName.get(name);
  if (!collection) return [];

  let start = aloneOnLine(source, collection.span.start)
    ? lineStart(source, collection.span.start)
    : collection.span.start;

  // Take the blank lines that followed it too, so deleting does not leave a
  // growing gap behind in the file.
  let end = collection.span.end;
  while (end < source.length) {
    const stop = lineEnd(source, end);
    if (source.slice(end, stop).trim() !== "") break;
    end = Math.min(source.length, stop + 1);
    if (source.slice(end, lineEnd(source, end)).trim() !== "") break;
  }

  // The last collection in the file has no following blank line to absorb, so
  // the separator in front of it is the one that would be left behind.
  if (source.slice(end).trim() === "") {
    while (start > 0) {
      const previousLine = lineStart(source, start - 1);
      if (source.slice(previousLine, start).trim() !== "") break;
      start = previousLine;
    }
  }

  return [remove({ start, end })];
}

export function addCollection(source: string, model: Model, name: string): TextEdit[] {
  if (model.byName.has(name)) return [];
  const separator = source.length === 0 ? "" : source.endsWith("\n\n") ? "" : source.endsWith("\n") ? "\n" : "\n\n";
  return [insert(source.length, `${separator}${name} {\n  _id: objectId\n}\n`)];
}

/**
 * Write a dragged box's position back into the file, replacing the existing
 * `@at` when there is one so repeated drags do not stack annotations.
 */
export function setPosition(source: string, model: Model, name: string, x: number, y: number): TextEdit[] {
  const collection = model.byName.get(name);
  if (!collection) return [];

  const text = `@at(${Math.round(x)}, ${Math.round(y)})`;
  if (collection.positionSpan) return [replace(collection.positionSpan, text)];
  return [insert(collection.nameSpan.end, ` ${text}`)];
}

export function clearPosition(source: string, model: Model, name: string): TextEdit[] {
  const collection = model.byName.get(name);
  if (!collection?.positionSpan) return [];
  const start = source[collection.positionSpan.start - 1] === " "
    ? collection.positionSpan.start - 1
    : collection.positionSpan.start;
  return [remove({ start, end: collection.positionSpan.end })];
}

// --- fields ---------------------------------------------------------------

/**
 * Insert a field, copying whatever the neighbours do. If the block already
 * ends with a trailing comma the new field keeps that style; if it does not,
 * a comma is added to the field that used to be last.
 */
export function addField(source: string, model: Model, ref: ContainerRef, name: string, type: string): TextEdit[] {
  const container = findContainer(model, ref);
  if (!container) return [];

  const brace = closingBrace(container);
  const indent = fieldIndent(source, container);
  const last = container.fields.at(-1);

  if (!last) {
    // An empty block is either `{}` on one line or `{` and `}` on two. In the
    // first case the field brings its own newlines; in the second the closing
    // brace already has a line of its own to sit on.
    return aloneOnLine(source, brace)
      ? [insert(lineStart(source, brace), `${indent}${name}: ${type}\n`)]
      : [insert(brace, `\n${indent}${name}: ${type}\n`)];
  }

  const comma = commaAfter(source, last, brace);
  if (comma !== null) return [insert(comma + 1, `\n${indent}${name}: ${type},`)];
  return [insert(last.span.end, `,\n${indent}${name}: ${type}`)];
}

export function renameField(source: string, model: Model, ref: FieldRef, newName: string): TextEdit[] {
  const field = findField(model, ref);
  if (!field || field.name === newName) return [];
  return [replace(field.nameSpan, newName)];
}

/**
 * Removing a field has to remove its comma too, and which comma depends on
 * where it sits. A field in the middle owns the comma after it; the last field
 * has none of its own, so the comma belonging to the field before it is the
 * one that has to go, or the block is left ending in a dangling separator.
 */
export function deleteField(source: string, model: Model, ref: FieldRef): TextEdit[] {
  const parent = findContainer(model, { collection: ref.collection, path: ref.path.slice(0, -1) });
  const field = findField(model, ref);
  if (!parent || !field) return [];

  const index = parent.fields.indexOf(field);
  const brace = closingBrace(parent);
  const comma = commaAfter(source, field, brace);

  const previous = comma === null && index > 0 ? parent.fields[index - 1]! : null;
  const previousComma = previous ? commaAfter(source, previous, field.span.start) : null;

  if (previousComma !== null) {
    // Reaching back for the previous field's comma means the deletion starts
    // on that field's line, so the newline at the end of this one has to stay:
    // it is what still separates the previous field from the closing brace.
    let end = field.span.end;
    const stop = lineEnd(source, end);
    if (source.slice(end, stop).trim() === "") end = stop;
    return [remove({ start: previousComma, end })];
  }

  const wholeLine = aloneOnLine(source, field.span.start);
  const start = wholeLine ? lineStart(source, field.span.start) : field.span.start;
  let end = comma !== null ? comma + 1 : field.span.end;

  if (wholeLine) {
    const stop = lineEnd(source, end);
    if (source.slice(end, stop).trim() === "") end = Math.min(source.length, stop + 1);
  }

  return [remove({ start, end })];
}

/** Swap a field with its neighbour, moving the text of both. */
export function moveField(source: string, model: Model, ref: FieldRef, direction: -1 | 1): TextEdit[] {
  const parent = findContainer(model, { collection: ref.collection, path: ref.path.slice(0, -1) });
  const field = findField(model, ref);
  if (!parent || !field) return [];

  const index = parent.fields.indexOf(field);
  const other = parent.fields[index + direction];
  if (!other) return [];

  return [
    replace(field.span, source.slice(other.span.start, other.span.end)),
    replace(other.span, source.slice(field.span.start, field.span.end)),
  ];
}

// --- types ----------------------------------------------------------------

export function setType(source: string, model: Model, ref: FieldRef, type: string): TextEdit[] {
  const field = findField(model, ref);
  if (!field) return [];
  return [replace(field.type.span, type)];
}

/** Turn a field into a reference. The gesture behind this is dragging an arrow. */
export function makeReference(source: string, model: Model, ref: FieldRef, target: string): TextEdit[] {
  return setType(source, model, ref, `ref(${target})`);
}

/**
 * Add or remove `?`.
 *
 * Removing works the same for both spellings of a wrapper because a wrapper's
 * span always covers its inner type: replacing the wrapper with the text of
 * what it wraps deletes exactly the punctuation.
 *
 *     string?      remove [0,7) -> "string"
 */
export function toggleOptional(source: string, model: Model, ref: FieldRef): TextEdit[] {
  const field = findField(model, ref);
  if (!field) return [];

  const existing = findWrapper(field.type, "optional");
  if (existing && existing.kind === "optional") {
    return [replace(existing.span, source.slice(existing.inner.span.start, existing.inner.span.end))];
  }
  return [insert(field.type.span.end, "?")];
}

/** Add or remove `[]`, including the `[type]` spelling, which has the same span shape. */
export function toggleArray(source: string, model: Model, ref: FieldRef): TextEdit[] {
  const field = findField(model, ref);
  if (!field) return [];

  const existing = findWrapper(field.type, "array");
  if (existing && existing.kind === "array") {
    return [replace(existing.span, source.slice(existing.element.span.start, existing.element.span.end))];
  }
  return [insert(field.type.span.end, "[]")];
}

// --- annotations ----------------------------------------------------------

export function addAnnotation(source: string, model: Model, ref: FieldRef, annotation: string): TextEdit[] {
  const field = findField(model, ref);
  if (!field) return [];
  const text = annotation.startsWith("@") ? annotation : `@${annotation}`;
  const bare = text.slice(1).split("(")[0]!;
  if (field.annotations.some((a) => a.name === bare)) return [];
  return [insert(field.span.end, ` ${text}`)];
}

export function removeAnnotation(source: string, model: Model, ref: FieldRef, name: string): TextEdit[] {
  const field = findField(model, ref);
  const annotation = field?.annotations.find((a) => a.name === name);
  if (!annotation) return [];

  const start = source[annotation.span.start - 1] === " " ? annotation.span.start - 1 : annotation.span.start;
  return [remove({ start, end: annotation.span.end })];
}

// --- walking --------------------------------------------------------------

/** Every type in the model, including those nested inside embedded documents. */
function* everyType(model: Model): Generator<FieldType> {
  function* walk(fields: readonly ModelField[]): Generator<FieldType> {
    for (const field of fields) yield* walkType(field.type);
  }
  function* walkType(type: FieldType): Generator<FieldType> {
    yield type;
    if (type.kind === "array") yield* walkType(type.element);
    else if (type.kind === "optional") yield* walkType(type.inner);
    else if (type.kind === "embedded") yield* walk(type.fields);
  }
  for (const collection of model.collections) yield* walk(collection.fields);
}

/** The first `?` or `[]` in a type's wrapper chain, ignoring what is inside an embedded document. */
function findWrapper(type: FieldType, kind: "array" | "optional"): FieldType | null {
  let current: FieldType = type;
  for (;;) {
    if (current.kind === kind) return current;
    if (current.kind === "array") current = current.element;
    else if (current.kind === "optional") current = current.inner;
    else return null;
  }
}
