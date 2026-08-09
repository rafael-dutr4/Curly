import { lex } from "../lang/lexer.ts";
import { SCALAR_TYPES } from "../lang/model.ts";
import type { Token } from "../lang/token.ts";

/**
 * Syntax highlighting, from the real lexer rather than from regular
 * expressions.
 *
 * This is the payoff for the lexer producing tokens with spans and keeping
 * comments: the highlighter does not have to re-understand the language, it
 * only has to decide a colour per token. Anything the lexer accepts, this
 * agrees with by construction, and the two cannot drift apart.
 *
 * A textarea cannot colour its own text, so the usual trick applies: a `<pre>`
 * behind it holds the coloured copy and the textarea on top is transparent
 * except for its caret. The two must agree on font, size, line height and
 * padding to the pixel, which is why those live together in the stylesheet.
 */

const SCALARS: ReadonlySet<string> = new Set(SCALAR_TYPES);

export function highlight(source: string): string {
  const tokens = lex(source).tokens;
  let html = "";
  let cursor = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind === "eof") break;

    // Whatever sat between the last token and this one is whitespace, and it
    // has to be copied through or the mirror stops lining up with the text.
    html += escape(source.slice(cursor, token.span.start));
    html += `<span class="tok ${classOf(tokens, i)}">${escape(token.text)}</span>`;
    cursor = token.span.end;
  }

  html += escape(source.slice(cursor));

  // A textarea renders an empty last line for a trailing newline and a `pre`
  // does not, so identical content leaves the mirror exactly one line shorter
  // and the colours slide off the text at the bottom of a long file. Measured:
  // 3824px against 3844px, which is one 20px line. Doubling the final newline
  // makes the two the same height, and adding one that was never there would
  // make the mirror a line too tall instead.
  return source.endsWith("\n") ? `${html}\n` : html;
}

/**
 * What a token means depends on its neighbours, which is the same context the
 * parser uses, only much less of it: a name before a colon is a field, a name
 * after `@` is an annotation, `ref` before a bracket is a keyword.
 */
function classOf(tokens: readonly Token[], index: number): string {
  const token = tokens[index]!;

  switch (token.kind) {
    case "comment":
      return "comment";
    case "string":
      return "string";
    case "number":
      return "number";
    case "error":
      return "invalid";
    case "at":
      return "annotation";
    case "ident":
      break;
    default:
      return "punct";
  }

  const previous = tokens[index - 1];
  const next = tokens[index + 1];

  if (previous?.kind === "at") return "annotation";
  if (token.text === "ref" && next?.kind === "lparen") return "keyword";
  if (next?.kind === "colon") return "field";
  if (SCALARS.has(token.text)) return "type";
  // A name in the first column that opens a block, or takes an annotation
  // before one, is a collection being declared.
  if (token.span.col === 1 && (next?.kind === "lbrace" || next?.kind === "at")) return "collection";
  return "name";
}

function escape(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** How many lines the gutter needs to number. */
export function lineCount(source: string): number {
  let count = 1;
  for (let i = 0; i < source.length; i += 1) if (source[i] === "\n") count += 1;
  return count;
}

/** Which line an offset falls on, counting from 1. */
export function lineAt(source: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, source.length);
  for (let i = 0; i < limit; i += 1) if (source[i] === "\n") line += 1;
  return line;
}
