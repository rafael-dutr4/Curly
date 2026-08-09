import { type Message, message } from "../i18n/messages.ts";

/**
 * A region of the source text.
 *
 * `start` and `end` are character offsets into the source string, with `end`
 * exclusive, so `source.slice(span.start, span.end)` is exactly the text the
 * span covers. `line` and `col` are 1 based and describe where `start` is,
 * because those are the numbers a person reads in an error message.
 *
 * Spans are the backbone of the whole project. They let a diagnostic point at
 * one character, they let a click on the diagram find the AST node behind it,
 * and they are what makes an edit surgical instead of a file rewrite.
 */
export interface Span {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly col: number;
}

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "comment"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "lparen"
  | "rparen"
  | "colon"
  | "comma"
  | "question"
  | "at"
  | "error"
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  /** The exact source text of the token. For a string it includes the quotes. */
  readonly text: string;
  readonly span: Span;
}

/**
 * What a token is, for an error that has to name one.
 *
 * A message rather than a sentence: the parser builds "expected X, found Y"
 * out of two of these, and neither piece is worded until the list is painted.
 */
export function describeKind(kind: TokenKind): Message {
  switch (kind) {
    case "ident":
      return message("token.name");
    case "number":
      return message("token.number");
    case "string":
      return message("token.string");
    case "comment":
      return message("token.comment");
    case "error":
      return message("token.unexpected");
    case "eof":
      return message("token.eof");
    default:
      return message("token.symbol", { symbol: SYMBOLS[kind] ?? kind });
  }
}

/** The punctuation, quoted as it is written. The same in every language. */
const SYMBOLS: Readonly<Record<string, string>> = {
  lbrace: "{",
  rbrace: "}",
  lbracket: "[",
  rbracket: "]",
  lparen: "(",
  rparen: ")",
  colon: ":",
  comma: ",",
  question: "?",
  at: "@",
};
