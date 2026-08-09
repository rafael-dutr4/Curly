import type { FieldType, Model, ModelField } from "../lang/model.ts";
import { findKey } from "./jsonschema.ts";
import { randomFor, type Random } from "./prng.ts";

/**
 * Example documents for a model.
 *
 * A schema tells you what is allowed; a document shows you what you are
 * actually going to be looking at in a shell, which is usually the faster way
 * to notice that a shape is wrong.
 *
 * Every value is seeded from its own field path, so the output is stable
 * across runs and adding a field at the top does not shuffle everything below
 * it. Nothing here reads the clock or `Math.random`.
 */

/** How many elements an array gets. Enough to look like a list, short enough to read. */
const ARRAY_LENGTH = 3;

const WORDS = [
  "alder", "basalt", "cedar", "delta", "ember", "fjord", "gale", "harbor",
  "indigo", "jasper", "kelp", "larch", "meadow", "nimbus", "onyx", "pallas",
  "quartz", "rowan", "slate", "thistle", "umber", "vale", "willow", "zephyr",
] as const;

export function sampleDocuments(model: Model): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const collection of model.collections) {
    out[collection.name] = objectValue(model, collection.fields, collection.name);
  }
  return out;
}

export function sampleDocument(model: Model, name: string): unknown {
  const collection = model.byName.get(name);
  if (!collection) return null;
  return objectValue(model, collection.fields, collection.name);
}

function objectValue(model: Model, fields: readonly ModelField[], path: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    // Optional fields are included rather than dropped: a sample exists to
    // show the full shape, and an absent key teaches nothing.
    out[field.name] = fieldValue(model, field, `${path}.${field.name}`);
  }
  return out;
}

function fieldValue(model: Model, field: ModelField, path: string): unknown {
  // A declared default is the truest possible sample of that field.
  if (field.defaultValue !== null) return field.defaultValue;
  if (field.enumValues && field.enumValues.length > 0) {
    return randomFor(path).pick(field.enumValues);
  }
  return typeValue(model, field.type, path);
}

function typeValue(model: Model, type: FieldType, path: string): unknown {
  switch (type.kind) {
    case "optional":
      return typeValue(model, type.inner, path);

    case "array":
      // Each element is seeded separately, so a list is not three copies.
      return Array.from({ length: ARRAY_LENGTH }, (_, i) => typeValue(model, type.element, `${path}#${i}`));

    case "embedded":
      return objectValue(model, type.fields, path);

    case "ref":
      return referenceValue(model, type.target, path);

    case "scalar":
      return scalarValue(type.name, path);
  }
}

/**
 * A reference holds the key of the target, so the sample is a value of that
 * key's type. It never expands the target document: that is what a reference
 * means, and expanding would not terminate on a collection that points at
 * itself.
 */
function referenceValue(model: Model, target: string, path: string): unknown {
  const collection = model.byName.get(target);
  const key = collection ? findKey(collection) : null;
  if (!key) return objectId(randomFor(path));
  return typeValue(model, key.type, `${target}.${key.name}@${path}`);
}

function scalarValue(name: string, path: string): unknown {
  const random = randomFor(path);
  const leaf = path.split(".").at(-1) ?? "";

  switch (name) {
    case "string":
      return stringValue(leaf, random);
    case "int":
      return random.int(1000);
    case "long":
      return random.int(1_000_000) * 1000;
    case "double":
      return Math.round(random.fraction() * 100_000) / 100;
    case "decimal":
      return Math.round(random.fraction() * 20_000) / 100;
    case "bool":
      return random.int(2) === 1;
    case "date":
      return dateValue(random).slice(0, 10);
    case "timestamp":
      return dateValue(random);
    case "objectId":
      return objectId(random);
    case "uuid":
      return uuid(random);
    case "binary":
      // btoa is a global in both the browser and Node, so no shim is needed.
      return btoa(String.fromCharCode(...Array.from({ length: 6 }, () => random.int(256))));
    case "any":
      return null;
    default:
      // An unknown type is reported elsewhere; the sample says so plainly
      // rather than inventing a value for it.
      return `<${name}>`;
  }
}

/**
 * A few field names have an obvious shape, and a sample that reads like real
 * data is easier to judge than one full of nonsense words. Anything not
 * recognised falls back to a word, which is still better than "string1".
 */
function stringValue(leaf: string, random: Random): string {
  const lower = leaf.toLowerCase();
  const word = random.pick(WORDS);

  if (lower.includes("email")) return `${word}@example.com`;
  if (lower.includes("url") || lower.includes("link")) return `https://example.com/${word}`;
  if (lower.includes("slug") || lower.includes("sku")) return `${word}-${random.int(900) + 100}`;
  if (lower.includes("name") || lower.includes("title")) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  if (lower.includes("phone")) return `+1 555 ${String(random.int(9000) + 1000)}`;
  return word;
}

/** A date somewhere in a fixed window. No clock, so the output stays stable. */
function dateValue(random: Random): string {
  const start = Date.UTC(2024, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  return new Date(start + random.int(700) * day + random.int(day)).toISOString();
}

function objectId(random: Random): string {
  return Array.from({ length: 24 }, () => "0123456789abcdef"[random.int(16)]).join("");
}

function uuid(random: Random): string {
  const hex = (n: number): string =>
    Array.from({ length: n }, () => "0123456789abcdef"[random.int(16)]).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
