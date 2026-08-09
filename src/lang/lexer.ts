import { message } from "../i18n/messages.ts";
import type { Span, Token, TokenKind } from "./token.ts";
import { type Diagnostic, error } from "./diagnostic.ts";

/**
 * The lexer turns characters into tokens. It is the first of the three stages
 * of the front end, and it is deliberately the dumbest one: it knows what a
 * name looks like and what a brace looks like, and nothing at all about where
 * either is allowed to appear. That question belongs to the parser.
 *
 * Two things make this lexer different from a textbook one:
 *
 * 1. Comments are emitted as tokens instead of being discarded. Curly rewrites
 *    the user's file when they edit the diagram, and losing their comments on a
 *    drag would be unforgivable. The parser skips them; they survive because
 *    editing is surgical.
 *
 * 2. An unexpected character produces an error token and a diagnostic, and then
 *    lexing continues. Nothing here throws. The editor calls this on almost
 *    every keystroke, when the file is usually half typed.
 */

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const PUNCTUATION: Readonly<Record<string, TokenKind>> = {
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
  "(": "lparen",
  ")": "rparen",
  ":": "colon",
  ",": "comma",
  "?": "question",
  "@": "at",
};

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];

  // The cursor. `line` and `lineStart` exist only so a span can report a
  // human readable position without scanning the source again.
  let index = 0;
  let line = 1;
  let lineStart = 0;

  const at = (offset = 0): string => source[index + offset] ?? "";
  const done = (): boolean => index >= source.length;

  /** Span from a remembered start position to wherever the cursor is now. */
  const spanFrom = (start: number, startLine: number, startCol: number): Span => ({
    start,
    end: index,
    line: startLine,
    col: startCol,
  });

  const push = (kind: TokenKind, span: Span): void => {
    tokens.push({ kind, text: source.slice(span.start, span.end), span });
  };

  while (!done()) {
    const c = at();

    // Whitespace. Newlines advance the line counter and reset the column
    // origin, which is the only bookkeeping the rest of the lexer needs.
    if (c === "\n") {
      index += 1;
      line += 1;
      lineStart = index;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      index += 1;
      continue;
    }

    const start = index;
    const startLine = line;
    const startCol = index - lineStart + 1;

    // Line comment.
    if (c === "/" && at(1) === "/") {
      while (!done() && at() !== "\n") index += 1;
      push("comment", spanFrom(start, startLine, startCol));
      continue;
    }

    // Name. Identifiers are the workhorse token: collection names, field
    // names, type names, annotation names and the `ref` keyword are all
    // idents. Keywords are recognised by the parser, not here, so the lexer
    // never has to know the vocabulary.
    if (isNameStart(c)) {
      index += 1;
      while (!done() && isNameContinue(at())) index += 1;
      push("ident", spanFrom(start, startLine, startCol));
      continue;
    }

    // Number, for annotation arguments like @at(120, 40).
    if (isDigit(c) || (c === "-" && isDigit(at(1)))) {
      if (c === "-") index += 1;
      while (!done() && isDigit(at())) index += 1;
      if (at() === "." && isDigit(at(1))) {
        index += 1;
        while (!done() && isDigit(at())) index += 1;
      }
      push("number", spanFrom(start, startLine, startCol));
      continue;
    }

    // String, for annotation arguments like @default("draft"). Supports \" and
    // \\ so a quote can appear inside. An unterminated string stops at the end
    // of the line rather than swallowing the rest of the file, because in an
    // editor the missing quote is nearly always on the line being typed.
    if (c === '"') {
      index += 1;
      let terminated = false;
      while (!done() && at() !== "\n") {
        if (at() === "\\" && (at(1) === '"' || at(1) === "\\")) {
          index += 2;
          continue;
        }
        if (at() === '"') {
          index += 1;
          terminated = true;
          break;
        }
        index += 1;
      }
      const span = spanFrom(start, startLine, startCol);
      if (!terminated) {
        diagnostics.push(error(span, message("lex.unterminatedString")));
        push("error", span);
      } else {
        push("string", span);
      }
      continue;
    }

    const punctuation = PUNCTUATION[c];
    if (punctuation !== undefined) {
      index += 1;
      push(punctuation, spanFrom(start, startLine, startCol));
      continue;
    }

    // Anything else. Consume exactly one character so the loop always makes
    // progress, then keep going.
    index += 1;
    const span = spanFrom(start, startLine, startCol);
    diagnostics.push(error(span, message("lex.unexpectedCharacter", { char: JSON.stringify(c) })));
    push("error", span);
  }

  // The parser reads tokens with a cursor and needs something to look at when
  // it runs out, so the stream always ends with an empty eof token.
  tokens.push({
    kind: "eof",
    text: "",
    span: { start: source.length, end: source.length, line, col: source.length - lineStart + 1 },
  });

  return { tokens, diagnostics };
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isNameStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}

function isNameContinue(c: string): boolean {
  return isNameStart(c) || isDigit(c);
}
