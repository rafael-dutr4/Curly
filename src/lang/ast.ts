import type { Span } from "./token.ts";

/**
 * The syntax tree. Every node carries the span it covers, from the start of its
 * first token to the end of its last, which is what later lets an edit rewrite
 * exactly one name or one type without touching the rest of the file.
 *
 * The tree mirrors the grammar one to one:
 *
 *   file       := entry*
 *   entry      := collection | directive
 *   collection := ident annotation* block
 *   directive  := "@" ident arg* block
 *   block      := "{" (field ("," field)*)? ","? "}"
 *   field      := ident ":" type annotation*
 *   type       := (scalar | embedded | ref | arrayOf) postfix*
 *   arrayOf    := "[" type "]"
 *   ref        := "ref" "(" ident ")"
 *   postfix    := "?" | "[]"
 *   annotation := "@" ident ("(" arg ("," arg)* ")")?
 */

export interface NameNode {
  readonly kind: "name";
  readonly text: string;
  readonly span: Span;
}

export interface FileNode {
  readonly kind: "file";
  readonly entries: readonly EntryNode[];
  readonly span: Span;
}

export type EntryNode = CollectionNode | DirectiveNode;

export interface CollectionNode {
  readonly kind: "collection";
  readonly name: NameNode;
  readonly annotations: readonly AnnotationNode[];
  readonly block: BlockNode;
  readonly span: Span;
}

/**
 * Reserved for v2. Document by example puts everything inside a collection
 * literal, which leaves nowhere to hang a query, so the top level `@name { }`
 * form is claimed now. Parsing it today means `@access "..." { }` can be added
 * later without breaking a single existing file.
 */
export interface DirectiveNode {
  readonly kind: "directive";
  readonly name: NameNode;
  readonly args: readonly ArgNode[];
  readonly block: BlockNode;
  readonly span: Span;
}

export interface BlockNode {
  readonly kind: "block";
  readonly fields: readonly FieldNode[];
  readonly span: Span;
}

export interface FieldNode {
  readonly kind: "field";
  readonly name: NameNode;
  readonly type: TypeNode;
  readonly annotations: readonly AnnotationNode[];
  readonly span: Span;
}

export type TypeNode = ScalarTypeNode | EmbeddedTypeNode | RefTypeNode | ArrayTypeNode | OptionalTypeNode;

/** A named type such as `string`. Whether the name is a known scalar is resolve's problem. */
export interface ScalarTypeNode {
  readonly kind: "scalar";
  readonly name: NameNode;
  readonly span: Span;
}

/** An embedded document, written as a nested `{ ... }`. Drawn as a box inside a box. */
export interface EmbeddedTypeNode {
  readonly kind: "embedded";
  readonly block: BlockNode;
  readonly span: Span;
}

/** A pointer to another collection, written `ref(order)`. Drawn as an arrow. */
export interface RefTypeNode {
  readonly kind: "ref";
  readonly target: NameNode;
  readonly span: Span;
}

export interface ArrayTypeNode {
  readonly kind: "array";
  readonly element: TypeNode;
  readonly span: Span;
}

export interface OptionalTypeNode {
  readonly kind: "optional";
  readonly inner: TypeNode;
  readonly span: Span;
}

export interface AnnotationNode {
  readonly kind: "annotation";
  readonly name: NameNode;
  readonly args: readonly ArgNode[];
  readonly span: Span;
}

export type ArgNode = NumberArgNode | StringArgNode | NameArgNode;

export interface NumberArgNode {
  readonly kind: "number";
  readonly value: number;
  readonly span: Span;
}

export interface StringArgNode {
  readonly kind: "string";
  /** The decoded value, without the surrounding quotes. */
  readonly value: string;
  readonly span: Span;
}

export interface NameArgNode {
  readonly kind: "nameArg";
  readonly value: string;
  readonly span: Span;
}

/** Strips `?` and `[]` wrappers to reach the scalar, embedded or ref underneath. */
export function baseType(type: TypeNode): ScalarTypeNode | EmbeddedTypeNode | RefTypeNode {
  let current = type;
  while (current.kind === "array" || current.kind === "optional") {
    current = current.kind === "array" ? current.element : current.inner;
  }
  return current;
}
