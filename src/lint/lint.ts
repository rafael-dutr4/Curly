import { baseFieldType, type FieldType, type Model, type ModelCollection, type ModelField } from "../lang/model.ts";
import type { Span } from "../lang/token.ts";
import { DOCUMENT_LIMIT, estimateCollection, formatBytes } from "./size.ts";

/**
 * The linter.
 *
 * This is the part that makes Curly more than a drawing program. A diagram
 * tool can tell you the model is spelled correctly; the interesting failures
 * of a document model are all legal syntax. An array that only grows, a
 * document heading for the 16MB ceiling, nesting nobody can query: every one
 * of those parses perfectly and hurts later.
 *
 * Two rules about the rules:
 *
 * 1. A finding says what to do about it. "Deeply nested" is an observation;
 *    "six levels deep, and a query cannot reach past a few" is advice.
 * 2. Noise is the enemy. A linter that fires on every model gets turned off,
 *    so anything that is merely common is a note, and only real trouble is a
 *    warning.
 *
 * Still missing, and deliberately so: the rule that an access pattern has no
 * index to support it. That one needs access patterns to exist, which is the
 * next piece of the language.
 */

export type FindingLevel = "warning" | "note";

export interface Finding {
  readonly rule: string;
  readonly level: FindingLevel;
  readonly message: string;
  readonly span: Span;
}

/** Deeper than this and a document is hard to query and harder to read. */
const NESTING_LIMIT = 4;

/** An array of references this long is a fan out that usually belongs the other way round. */
const FAN_OUT_LIMIT = 500;

/** A document this big is not yet fatal, but it is heading somewhere bad. */
const LARGE_DOCUMENT = 1024 * 1024;

export function lint(model: Model): Finding[] {
  const findings: Finding[] = [];

  for (const collection of model.collections) {
    missingKey(collection, findings);
    walkFields(collection, collection.fields, 1, findings);
    documentSize(model, collection, findings);
  }

  return findings.sort((a, b) => a.span.start - b.span.start);
}

/**
 * A collection with no `_id` is not wrong, since MongoDB adds one. It is worth
 * saying because a reference to this collection has to guess what it points at.
 */
function missingKey(collection: ModelCollection, findings: Finding[]): void {
  if (collection.fields.length === 0) return;
  if (collection.fields.some((f) => f.name === "_id")) return;

  findings.push({
    rule: "missing-key",
    level: "note",
    message: `'${collection.name}' has no _id, so a reference to it has to assume one`,
    span: collection.nameSpan,
  });
}

function walkFields(
  collection: ModelCollection,
  fields: readonly ModelField[],
  depth: number,
  findings: Finding[],
): void {
  for (const field of fields) {
    redundantIndex(field, findings);
    unboundedArray(collection, field, findings);
    fanOut(collection, field, findings);

    const base = baseFieldType(field.type);
    if (base.kind !== "embedded") continue;

    if (depth === NESTING_LIMIT + 1) {
      findings.push({
        rule: "deep-nesting",
        level: "note",
        message: `'${field.name}' is ${depth} levels deep, which is hard to query and usually wants its own collection`,
        span: field.nameSpan,
      });
    }
    walkFields(collection, base.fields, depth + 1, findings);
  }
}

/** `@unique` already creates an index, so asking for both says the same thing twice. */
function redundantIndex(field: ModelField, findings: Finding[]): void {
  if (!(field.unique && field.indexed)) return;
  const annotation = field.annotations.find((a) => a.name === "index");
  findings.push({
    rule: "redundant-index",
    level: "note",
    message: `@unique already indexes '${field.name}', so @index adds nothing`,
    span: annotation?.span ?? field.nameSpan,
  });
}

/**
 * The 16MB ceiling is reached by growth, not by width. A document with an
 * array that has no expected size is the shape that gets there.
 */
function unboundedArray(collection: ModelCollection, field: ModelField, findings: Finding[]): void {
  if (!isArray(field.type) || field.count !== null) return;

  const base = baseFieldType(field.type);
  // A list of scalars is almost always a handful of tags or labels, and
  // firing on every one of those is how a linter gets switched off. Embedded
  // documents and references are the arrays that carry real weight.
  if (base.kind === "scalar") return;

  const what = base.kind === "embedded" ? "documents" : "references";

  findings.push({
    rule: "unbounded-array",
    level: "note",
    message: `'${collection.name}.${field.name}' is an array of ${what} with no expected size, so nothing stops it growing past the 16MB document limit. Add @count(n) to say how big it gets.`,
    span: field.nameSpan,
  });
}

/** An array holding thousands of references is a join waiting to hurt. */
function fanOut(collection: ModelCollection, field: ModelField, findings: Finding[]): void {
  if (!isArray(field.type) || field.count === null || field.count <= FAN_OUT_LIMIT) return;
  const base = baseFieldType(field.type);
  if (base.kind !== "ref") return;

  findings.push({
    rule: "fan-out",
    level: "warning",
    message: `'${collection.name}.${field.name}' holds about ${field.count} references. Storing the link on '${base.target}' instead keeps this document small and the query indexed.`,
    span: field.nameSpan,
  });
}

/** The estimate, reported once it stops being comfortable. */
function documentSize(model: Model, collection: ModelCollection, findings: Finding[]): void {
  const estimate = estimateCollection(model, collection);
  if (estimate.bytes < LARGE_DOCUMENT) return;

  const size = formatBytes(estimate.bytes);
  const qualifier = estimate.assumed ? " (assuming 10 elements where @count is missing)" : "";

  if (estimate.bytes >= DOCUMENT_LIMIT) {
    findings.push({
      rule: "document-too-large",
      level: "warning",
      message: `a '${collection.name}' document is about ${size}${qualifier}, over the 16MB limit. It cannot be written as one document.`,
      span: collection.nameSpan,
    });
    return;
  }

  findings.push({
    rule: "large-document",
    level: "warning",
    message: `a '${collection.name}' document is about ${size}${qualifier}, which is heading for the 16MB limit`,
    span: collection.nameSpan,
  });
}

function isArray(type: FieldType): boolean {
  let current = type;
  for (;;) {
    if (current.kind === "array") return true;
    if (current.kind === "optional") {
      current = current.inner;
      continue;
    }
    return false;
  }
}
