import type { Locale } from "../i18n/messages.ts";

/**
 * What a first time visitor sees, chosen to show embedding, references and @at
 * at once.
 *
 * The model is the same in both languages and the comments are not, for the
 * same reason as the worked examples: the collection and field names are the
 * model, and the comments are what explains it. Two whole strings rather than
 * one string with the comments substituted in, because a model file is read as
 * a file, and stitching one together from fragments makes it harder to see what
 * a new visitor is actually going to get.
 */

const BODY = `
users {
  _id: objectId,
  email: string @unique,
  createdAt: timestamp,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}

order {
  _id: objectId,
  total: decimal,
  placedAt: timestamp @index,
  items: [{
    sku: string,
    qty: int
  }]
}

item @at(880, 60) {
  _id: objectId,
  sku: string @unique,
  name: string
}
`;

const STARTERS: Readonly<Record<Locale, string>> = {
  en: `// A model reads like a sample document.
// Embedding is a nested {} and draws as a box inside a box.
// A reference is ref(other) and draws as an arrow.
${BODY}`,
  "pt-BR": `// Um modelo se lê como um documento de exemplo.
// Embutir é um {} aninhado, e é desenhado como uma caixa dentro da outra.
// Uma referência é ref(outra), e é desenhada como uma seta.
${BODY}`,
};

export function starter(locale: Locale): string {
  return STARTERS[locale];
}
