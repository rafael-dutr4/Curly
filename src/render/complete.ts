import { compile } from "../lang/compile.ts";
import { type Model, SCALAR_TYPES } from "../lang/model.ts";

/**
 * Completions for the type editor.
 *
 * A type is not a closed list of words. `string` is a type, and so are
 * `string?`, `ref(order)[]` and an embedded document written out in braces.
 * So this suggests rather than restricts: it offers every type that exists,
 * and separately says whether what has been typed is one.
 *
 * The candidates come from the model, so `ref(...)` is offered for exactly
 * the collections that are there, and a reference to a collection that does
 * not exist cannot be picked by accident.
 */

/** Everything the field could be, in the order worth reading. */
export function typeCandidates(model: Model): string[] {
  return [...SCALAR_TYPES, ...model.collections.map((c) => `ref(${c.name})`), "{  }"];
}

/**
 * Split a written type into the part being named and the modifiers after it,
 * so completing `str` inside `str[]` replaces the name and keeps the array.
 *
 *     "string?[]"  ->  base "string", suffix "?[]"
 */
export function splitType(text: string): { base: string; suffix: string } {
  let base = text.trimEnd();
  let suffix = "";
  for (;;) {
    if (base.endsWith("?")) {
      suffix = `?${suffix}`;
      base = base.slice(0, -1);
      continue;
    }
    if (base.endsWith("[]")) {
      suffix = `[]${suffix}`;
      base = base.slice(0, -2);
      continue;
    }
    break;
  }
  return { base: base.trim(), suffix };
}

/**
 * Candidates that match what has been typed, prefixes first.
 *
 * Prefix before substring matters: typing `int` should offer `int` before it
 * offers anything that merely contains those letters.
 */
export function completionsFor(candidates: readonly string[], base: string): string[] {
  const needle = loosen(base);
  if (!needle) return [...candidates];

  const starts: string[] = [];
  const contains: string[] = [];
  for (const candidate of candidates) {
    const lower = loosen(candidate);
    if (lower.startsWith(needle)) starts.push(candidate);
    else if (lower.includes(needle)) contains.push(candidate);
  }
  return [...starts, ...contains];
}

/**
 * Compare without the closing bracket.
 *
 * Half of `ref(order)` is `ref(ord`, but an editor that closes brackets, or a
 * user editing an existing type, gives `ref(ord)`. Against the candidate
 * `ref(order)` that is not a prefix, and the completion that was obviously
 * wanted would never appear.
 */
function loosen(text: string): string {
  return text.trim().toLowerCase().replace(/\)$/, "");
}

/**
 * Is this text actually a type?
 *
 * Answered by the real parser rather than by a list, because a list cannot
 * know that `ref(order)[]` is fine and `ref(oder)[]` is not. A throwaway
 * collection is appended to the current source and compiled; if nothing is
 * reported inside the part that was added, the type is good.
 *
 * This is the only honest way to check: it uses the same grammar, the same
 * scalar names and the same collections the model itself will be judged by.
 */
export function isTypeValid(source: string, model: Model, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  let probe = "__probe";
  while (model.byName.has(probe)) probe += "_";

  const appended = `\n${probe} { __field: ${trimmed} }\n`;
  const { diagnostics } = compile(source + appended);

  // Only what the probe caused matters. Errors already in the model are the
  // model's problem and would otherwise make every type look wrong.
  return !diagnostics.some((d) => d.severity === "error" && d.span.end > source.length);
}
