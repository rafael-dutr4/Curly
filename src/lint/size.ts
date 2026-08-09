import { type Message, message } from "../i18n/messages.ts";
import { type FieldType, type Model, type ModelCollection, type ModelField } from "../lang/model.ts";

/**
 * How big is a document going to be?
 *
 * This is the question a document modeller actually needs answered, because
 * MongoDB stops at 16MB per document and the usual way to reach that ceiling
 * is an array that only ever grows. Finding out in production is expensive;
 * finding out while drawing the model is free.
 *
 * The numbers are BSON's, and they are estimates by design. A string has no
 * length in the model, so it gets an assumed one; an array has no size unless
 * `@count` says so. The point is not to predict a byte total, it is to tell
 * a 400 byte document from a 40MB one, and for that an estimate is enough.
 */

export const DOCUMENT_LIMIT = 16 * 1024 * 1024;

/** What a string is assumed to hold when nothing says otherwise. */
const ASSUMED_STRING = 32;

/** What an array is assumed to hold when `@count` does not say. */
const ASSUMED_COUNT = 10;

/** BSON overhead: 4 bytes of length plus a terminator, per document. */
const DOCUMENT_OVERHEAD = 5;

/** Per element: a type byte, the key, and its terminator. */
const FIELD_OVERHEAD = 2;

const SCALAR_BYTES: Readonly<Record<string, number>> = {
  string: ASSUMED_STRING + 5,
  int: 4,
  long: 8,
  double: 8,
  decimal: 16,
  bool: 1,
  date: 8,
  timestamp: 8,
  objectId: 12,
  uuid: 16 + 5,
  binary: 64 + 5,
  any: 16,
};

export interface SizeEstimate {
  readonly bytes: number;
  /** True when any array in the document had no `@count` to go on. */
  readonly assumed: boolean;
}

export function estimateCollection(model: Model, collection: ModelCollection): SizeEstimate {
  let assumed = false;

  /**
   * The collections currently being followed through a reference.
   *
   * A reference costs what the target's key costs, and a key is only ever
   * guessed when there is no `_id` to point at. That guess is the first field,
   * which can be a reference straight back:
   *
   *     users { posts: ref(post)[] }
   *     post  { author: ref(users) }
   *
   * Following that pair costs a stack overflow, which took the editor down as
   * the second collection was typed. A key on the chain already has a size
   * being worked out, so re-entering it means the chain is a cycle, and the
   * honest answer for a key nobody declared is what a key usually is.
   */
  const following = new Set<string>();

  const bytes = DOCUMENT_OVERHEAD + sumFields(collection.fields);
  return { bytes: Math.round(bytes), assumed };

  function sumFields(fields: readonly ModelField[]): number {
    let total = 0;
    for (const field of fields) {
      total += FIELD_OVERHEAD + field.name.length + sizeOf(field.type, field.count);
    }
    return total;
  }

  function sizeOf(type: FieldType, count: number | null): number {
    switch (type.kind) {
      case "optional":
        return sizeOf(type.inner, count);

      case "array": {
        if (count === null) assumed = true;
        const length = count ?? ASSUMED_COUNT;
        const element = sizeOf(type.element, null);
        // Each element carries its own index as a key: "0", "1", ... "1234".
        const indexKeys = length === 0 ? 0 : length * (String(length - 1).length + FIELD_OVERHEAD);
        return DOCUMENT_OVERHEAD + length * element + indexKeys;
      }

      case "embedded":
        return DOCUMENT_OVERHEAD + sumFields(type.fields);

      case "ref": {
        // A reference stores the target's key, so it costs what that key costs.
        const target = model.byName.get(type.target);
        const key = target?.fields.find((f) => f.name === "_id") ?? target?.fields[0];
        if (!key || following.has(type.target)) return SCALAR_BYTES["objectId"]!;

        following.add(type.target);
        const size = sizeOf(key.type, key.count);
        following.delete(type.target);
        return size;
      }

      case "scalar":
        return SCALAR_BYTES[type.name] ?? 16;
    }
  }
}

/** Every collection's estimate, keyed by name. */
export function estimateAll(model: Model): Map<string, SizeEstimate> {
  return new Map(model.collections.map((c) => [c.name, estimateCollection(model, c)]));
}

/**
 * `1.2 MB`, `840 bytes`. A message rather than a string, because it is read
 * inside a finding and the unit is a word in whatever language that is read in.
 */
export function formatBytes(bytes: number): Message {
  if (bytes < 1024) return message("size.bytes", { amount: bytes });
  if (bytes < 1024 * 1024) return message("size.kilobytes", { amount: (bytes / 1024).toFixed(1) });
  return message("size.megabytes", { amount: (bytes / (1024 * 1024)).toFixed(1) });
}
