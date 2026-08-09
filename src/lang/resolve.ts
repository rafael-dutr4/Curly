import type { AnnotationNode, BlockNode, CollectionNode, FileNode, TypeNode } from "./ast.ts";
import { type Diagnostic, error, type Suggestion, warning } from "./diagnostic.ts";
import type { Span } from "./token.ts";
import {
  type FieldType,
  type Model,
  type ModelCollection,
  type ModelField,
  type Position,
  type ReferenceEdge,
  SCALAR_TYPES,
} from "./model.ts";

/**
 * Resolve answers the questions the parser cannot: does this type name exist,
 * does this reference point at a real collection, is this field declared twice.
 *
 * It runs in two passes for one reason: a collection may reference another that
 * is declared further down the file. The first pass collects the names, the
 * second pass checks every reference against them.
 *
 * Like every other stage, it does not throw and does not give up. An unknown
 * type is reported and kept, so a model that is half wrong still draws.
 */

export interface ResolveResult {
  readonly model: Model;
  readonly diagnostics: readonly Diagnostic[];
}

const FIELD_ANNOTATIONS = new Set(["unique", "index", "default", "enum", "count"]);
const COLLECTION_ANNOTATIONS = new Set(["at"]);
const SCALAR_SET: ReadonlySet<string> = new Set(SCALAR_TYPES);

export function resolve(file: FileNode): ResolveResult {
  const diagnostics: Diagnostic[] = [];
  const report = (span: Span, message: string, fix?: Suggestion) => diagnostics.push(error(span, message, fix));
  const warn = (span: Span, message: string, fix?: Suggestion) => diagnostics.push(warning(span, message, fix));

  // --- pass one: collect the collection names -----------------------------
  const declared = new Map<string, CollectionNode>();
  for (const entry of file.entries) {
    if (entry.kind === "directive") {
      warn(
        entry.span,
        `'@${entry.name.text}' is reserved for a future version and is ignored for now`,
      );
      continue;
    }
    const existing = declared.get(entry.name.text);
    if (existing) {
      report(
        entry.name.span,
        `the collection '${entry.name.text}' is already declared on line ${existing.name.span.line}`,
      );
      continue;
    }
    declared.set(entry.name.text, entry);
  }

  const names = [...declared.keys()];

  // --- pass two: resolve types and references -----------------------------
  const collections: ModelCollection[] = [];
  const edges: ReferenceEdge[] = [];

  for (const [name, node] of declared) {
    const { position, positionSpan } = readPosition(node, warn, report);
    const fields = resolveBlock(node.block, name);
    collections.push({
      name,
      nameSpan: node.name.span,
      span: node.span,
      fields,
      position,
      positionSpan,
    });
  }

  return {
    model: {
      collections,
      byName: new Map(collections.map((c) => [c.name, c])),
      edges,
    },
    diagnostics,
  };

  function resolveBlock(block: BlockNode, owner: string): ModelField[] {
    const fields: ModelField[] = [];
    const seen = new Map<string, Span>();

    for (const node of block.fields) {
      const previous = seen.get(node.name.text);
      if (previous) {
        report(
          node.name.span,
          `the field '${node.name.text}' is already declared on line ${previous.line}`,
        );
        continue;
      }
      seen.set(node.name.text, node.name.span);

      const flags = readFieldAnnotations(node.annotations);
      fields.push({
        name: node.name.text,
        nameSpan: node.name.span,
        span: node.span,
        type: resolveType(node.type, owner, node.name.text),
        annotations: node.annotations.map((a) => ({ name: a.name.text, span: a.span })),
        unique: flags.unique,
        indexed: flags.indexed,
        defaultValue: flags.defaultValue,
        enumValues: flags.enumValues,
        count: flags.count,
      });
    }

    return fields;
  }

  function resolveType(node: TypeNode, owner: string, fieldName: string): FieldType {
    switch (node.kind) {
      case "scalar": {
        const known = SCALAR_SET.has(node.name.text);
        if (!known) {
          const suggestion = nearest(node.name.text, SCALAR_TYPES as readonly string[]);
          report(
            node.name.span,
            suggestion
              ? `unknown type '${node.name.text}', did you mean '${suggestion}'?`
              : `unknown type '${node.name.text}'`,
            suggestion ? { title: `Use '${suggestion}'`, replaceWith: suggestion } : undefined,
          );
        }
        return { kind: "scalar", name: node.name.text, known, span: node.span };
      }

      case "ref": {
        const target = node.target.text;
        const resolved = declared.has(target);
        if (!resolved) {
          const suggestion = nearest(target, names);
          report(
            node.target.span,
            suggestion
              ? `no collection named '${target}', did you mean '${suggestion}'?`
              : `no collection named '${target}'`,
            suggestion ? { title: `Point at '${suggestion}'`, replaceWith: suggestion } : undefined,
          );
        } else {
          // Only a reference that points somewhere becomes an edge, so the
          // layout graph never contains a dangling node.
          edges.push({ from: owner, to: target, fieldName, span: node.span });
        }
        return { kind: "ref", target, resolved, span: node.span, targetSpan: node.target.span };
      }

      case "embedded":
        return { kind: "embedded", fields: resolveBlock(node.block, owner), span: node.span };

      case "array":
        return { kind: "array", element: resolveType(node.element, owner, fieldName), span: node.span };

      case "optional":
        return { kind: "optional", inner: resolveType(node.inner, owner, fieldName), span: node.span };
    }
  }

  function readFieldAnnotations(annotations: readonly AnnotationNode[]) {
    let unique = false;
    let indexed = false;
    let defaultValue: string | number | null = null;
    let enumValues: (string | number)[] | null = null;
    let count: number | null = null;

    for (const annotation of annotations) {
      const name = annotation.name.text;

      if (!FIELD_ANNOTATIONS.has(name)) {
        // A warning and not an error: a file written by a newer version of
        // Curly should still open in an older one.
        warn(annotation.span, `unknown annotation '@${name}', it is ignored`, {
          title: "Remove it",
          replaceWith: "",
        });
        continue;
      }

      switch (name) {
        case "unique":
          unique = true;
          break;
        case "index":
          indexed = true;
          break;
        case "default": {
          const first = annotation.args[0];
          if (!first || annotation.args.length !== 1) {
            report(annotation.span, "@default takes exactly one value");
            break;
          }
          defaultValue = first.kind === "number" ? first.value : String(first.value);
          break;
        }
        case "enum": {
          if (annotation.args.length === 0) {
            report(annotation.span, "@enum needs at least one value");
            break;
          }
          enumValues = annotation.args.map((a) => (a.kind === "number" ? a.value : String(a.value)));
          break;
        }
        case "count": {
          const first = annotation.args[0];
          if (annotation.args.length !== 1 || first?.kind !== "number" || first.value < 0) {
            report(annotation.span, "@count takes one number, the expected size of the array");
            break;
          }
          count = first.value;
          break;
        }
      }
    }

    return { unique, indexed, defaultValue, enumValues, count };
  }

  function readPosition(
    node: CollectionNode,
    warnAt: (span: Span, message: string) => void,
    reportAt: (span: Span, message: string) => void,
  ): { position: Position | null; positionSpan: Span | null } {
    let position: Position | null = null;
    let positionSpan: Span | null = null;

    for (const annotation of node.annotations) {
      const name = annotation.name.text;
      if (!COLLECTION_ANNOTATIONS.has(name)) {
        warnAt(annotation.span, `unknown annotation '@${name}' on a collection, it is ignored`);
        continue;
      }

      const [x, y] = annotation.args;
      if (annotation.args.length !== 2 || x?.kind !== "number" || y?.kind !== "number") {
        reportAt(annotation.span, "@at takes two numbers, as @at(x, y)");
        continue;
      }

      // A repeated @at keeps the last one, which is also what setPosition
      // would produce, so the file cannot drift into an ambiguous state.
      position = { x: x.value, y: y.value };
      positionSpan = annotation.span;
    }

    return { position, positionSpan };
  }
}

/**
 * The closest candidate within a small edit distance, for "did you mean".
 * The threshold scales with the word length so short names do not match
 * everything and long names tolerate a typo or two.
 */
function nearest(word: string, candidates: readonly string[]): string | null {
  const limit = Math.max(1, Math.floor(word.length / 3) + 1);
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance && distance <= limit) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/** Levenshtein distance, two rows instead of the full matrix. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = previous[j]! + 1;
      const insertion = current[j - 1]! + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }

  return previous[b.length]!;
}
