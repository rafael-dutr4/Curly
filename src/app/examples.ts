/**
 * The worked examples, listed here rather than discovered at runtime because a
 * static site cannot list a directory, and because the one line description is
 * the reason to open each one.
 *
 * A test checks that every path here exists on disk, so this list cannot drift
 * away from `examples/`.
 */

import type { Locale, MessageKey } from "../i18n/messages.ts";

export interface Example {
  readonly path: string;
  /** The name and the description live in the message table, one per language. */
  readonly name: MessageKey;
  readonly description: MessageKey;
}

/**
 * Where to fetch an example from, for the language being read.
 *
 * A model file is not a message. Its collection and field names are the model,
 * and translating them would be translating the user's data, so the Portuguese
 * copies under `examples/pt-BR/` differ from the English ones only in their
 * comments — which is where the whole point of an example is written.
 *
 *     pathFor(blog, "pt-BR")  ->  "examples/pt-BR/blog.curly"
 */
export function pathFor(example: Example, locale: Locale): string {
  return locale === "en" ? example.path : example.path.replace("examples/", `examples/${locale}/`);
}

export const EXAMPLES: readonly Example[] = [
  {
    path: "examples/blog.curly",
    name: "example.blog.name",
    description: "example.blog.description",
  },
  {
    path: "examples/ecommerce.curly",
    name: "example.shop.name",
    description: "example.shop.description",
  },
  {
    path: "examples/sensors.curly",
    name: "example.sensors.name",
    description: "example.sensors.description",
  },
  {
    path: "examples/library.curly",
    name: "example.library.name",
    description: "example.library.description",
  },
];
