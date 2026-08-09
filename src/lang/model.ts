import type { Span } from "./token.ts";

/**
 * The resolved model: the syntax tree with meaning attached.
 *
 * The parser proves the file has a legal shape. It cannot know whether
 * `ref(oder)` points at anything, because answering that needs the whole file.
 * The Model is what comes out the other side of that question: names checked,
 * annotations interpreted, and the reference graph collected so the layout
 * stage can treat the collections as nodes and edges.
 *
 * Everything here keeps its span, because every consumer eventually needs to
 * point back at the source: diagnostics to underline it, the diagram to select
 * it, the edit layer to patch it.
 */

export const SCALAR_TYPES = [
  "string",
  "int",
  "long",
  "double",
  "decimal",
  "bool",
  "date",
  "timestamp",
  "objectId",
  "uuid",
  "binary",
  "any",
] as const;

export type ScalarType = (typeof SCALAR_TYPES)[number];

export type FieldType = ScalarFieldType | EmbeddedFieldType | RefFieldType | ArrayFieldType | OptionalFieldType;

export interface ScalarFieldType {
  readonly kind: "scalar";
  /** The name as written. Unknown names are reported and kept, so the diagram still draws. */
  readonly name: string;
  readonly known: boolean;
  readonly span: Span;
}

export interface EmbeddedFieldType {
  readonly kind: "embedded";
  readonly fields: readonly ModelField[];
  readonly span: Span;
}

export interface RefFieldType {
  readonly kind: "ref";
  readonly target: string;
  /** False when no collection of that name exists. The edge is then not drawn. */
  readonly resolved: boolean;
  readonly span: Span;
}

export interface ArrayFieldType {
  readonly kind: "array";
  readonly element: FieldType;
  readonly span: Span;
}

export interface OptionalFieldType {
  readonly kind: "optional";
  readonly inner: FieldType;
  readonly span: Span;
}

export interface ModelField {
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
  readonly type: FieldType;
  readonly unique: boolean;
  readonly indexed: boolean;
  readonly defaultValue: string | number | null;
  readonly enumValues: readonly (string | number)[] | null;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface ModelCollection {
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
  readonly fields: readonly ModelField[];
  /** From `@at(x, y)`. Null means the layout stage places it. */
  readonly position: Position | null;
  /** Span of the whole `@at(...)` annotation, so setPosition can replace it. */
  readonly positionSpan: Span | null;
}

/** One `ref(...)`, flattened out of the field tree so layout can use a plain graph. */
export interface ReferenceEdge {
  readonly from: string;
  readonly to: string;
  readonly fieldName: string;
  readonly span: Span;
}

export interface Model {
  readonly collections: readonly ModelCollection[];
  readonly byName: ReadonlyMap<string, ModelCollection>;
  readonly edges: readonly ReferenceEdge[];
}

/** True when the type is optional at its outermost level, ignoring array nesting. */
export function isOptional(type: FieldType): boolean {
  return type.kind === "optional";
}

/** Strips `?` and `[]` to reach the scalar, embedded or ref underneath. */
export function baseFieldType(type: FieldType): ScalarFieldType | EmbeddedFieldType | RefFieldType {
  let current = type;
  while (current.kind === "array" || current.kind === "optional") {
    current = current.kind === "array" ? current.element : current.inner;
  }
  return current;
}
