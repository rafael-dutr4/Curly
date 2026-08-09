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

/** Human readable name for a token kind, used to build error messages. */
export function describeKind(kind: TokenKind): string {
  switch (kind) {
    case "ident":
      return "a name";
    case "number":
      return "a number";
    case "string":
      return "a string";
    case "comment":
      return "a comment";
    case "lbrace":
      return "'{'";
    case "rbrace":
      return "'}'";
    case "lbracket":
      return "'['";
    case "rbracket":
      return "']'";
    case "lparen":
      return "'('";
    case "rparen":
      return "')'";
    case "colon":
      return "':'";
    case "comma":
      return "','";
    case "question":
      return "'?'";
    case "at":
      return "'@'";
    case "error":
      return "an unexpected character";
    case "eof":
      return "the end of the file";
  }
}
