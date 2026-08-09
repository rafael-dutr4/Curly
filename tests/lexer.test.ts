import test from "node:test";
import assert from "node:assert/strict";

import { lex } from "../src/lang/lexer.ts";
import type { Token, TokenKind } from "../src/lang/token.ts";

/** Tokens without the trailing eof, which every stream has and no test cares about. */
function tokens(source: string): Token[] {
  const all = lex(source).tokens;
  return all.slice(0, -1);
}

function kinds(source: string): TokenKind[] {
  return tokens(source).map((t) => t.kind);
}

test("lexes a whole collection", () => {
  assert.deepEqual(kinds("users { _id: objectId }"), [
    "ident",
    "lbrace",
    "ident",
    "colon",
    "ident",
    "rbrace",
  ]);
});

test("lexes every punctuation token", () => {
  assert.deepEqual(kinds("{}[]():,?@"), [
    "lbrace",
    "rbrace",
    "lbracket",
    "rbracket",
    "lparen",
    "rparen",
    "colon",
    "comma",
    "question",
    "at",
  ]);
});

test("a span slices back to the exact token text", () => {
  const source = "email: string @unique,";
  for (const token of tokens(source)) {
    assert.equal(source.slice(token.span.start, token.span.end), token.text);
  }
});

test("spans carry the offsets the plan documents", () => {
  const source = "email: string @unique,";
  const spans = tokens(source).map((t) => [t.kind, t.span.start, t.span.end]);
  assert.deepEqual(spans, [
    ["ident", 0, 5], // email
    ["colon", 5, 6],
    ["ident", 7, 13], // string
    ["at", 14, 15],
    ["ident", 15, 21], // unique
    ["comma", 21, 22],
  ]);
});

test("line and col are 1 based and follow newlines", () => {
  const source = "users {\n  _id: objectId\n}";
  const found = tokens(source).map((t) => [t.text, t.span.line, t.span.col]);
  assert.deepEqual(found, [
    ["users", 1, 1],
    ["{", 1, 7],
    ["_id", 2, 3],
    [":", 2, 6],
    ["objectId", 2, 8],
    ["}", 3, 1],
  ]);
});

test("comments are kept as tokens, not discarded", () => {
  const source = "// a note\nusers {}";
  const found = tokens(source);
  assert.equal(found[0]?.kind, "comment");
  assert.equal(found[0]?.text, "// a note");
  assert.equal(found[1]?.text, "users");
});

test("a comment stops at the end of its line", () => {
  const found = tokens("users // here\n{}");
  assert.deepEqual(
    found.map((t) => t.text),
    ["users", "// here", "{", "}"],
  );
});

test("names may contain digits and underscores but not start with a digit", () => {
  assert.deepEqual(kinds("_id user2 2bad"), ["ident", "ident", "number", "ident"]);
});

test("lexes numbers, including negative and decimal", () => {
  const found = tokens("@at(-12, 4.5)");
  assert.deepEqual(
    found.map((t) => [t.kind, t.text]),
    [
      ["at", "@"],
      ["ident", "at"],
      ["lparen", "("],
      ["number", "-12"],
      ["comma", ","],
      ["number", "4.5"],
      ["rparen", ")"],
    ],
  );
});

test("a lone minus is not a number", () => {
  assert.deepEqual(kinds("-"), ["error"]);
});

test("lexes strings, including escaped quotes", () => {
  const found = tokens('@default("a \\"b\\" c")');
  const string = found.find((t) => t.kind === "string");
  assert.equal(string?.text, '"a \\"b\\" c"');
});

test("an unterminated string is an error that stops at the newline", () => {
  const result = lex('@default("oops\nusers {}');
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0]!.message, /unterminated string/);
  // Lexing continues, so the collection on the next line is still tokenized.
  assert.ok(result.tokens.some((t) => t.text === "users"));
});

test("an unexpected character reports and then keeps going", () => {
  const result = lex("users % {}");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]!.message, 'unexpected character "%"');
  assert.equal(result.diagnostics[0]!.span.start, 6);
  assert.deepEqual(
    result.tokens.map((t) => t.kind),
    ["ident", "error", "lbrace", "rbrace", "eof"],
  );
});

test("lexing always terminates and always ends with eof", () => {
  for (const source of ["", "   ", "\n\n", "%%%", '"', "//", "users {"]) {
    const found = lex(source).tokens;
    assert.equal(found.at(-1)?.kind, "eof", `eof missing for ${JSON.stringify(source)}`);
  }
});

test("the eof token sits at the end of the source", () => {
  const source = "users {}";
  const eof = lex(source).tokens.at(-1)!;
  assert.equal(eof.span.start, source.length);
  assert.equal(eof.span.end, source.length);
});

test("concatenating every token text plus the gaps rebuilds the source", () => {
  // Nothing is silently dropped: the tokens plus whitespace cover the file.
  const source = 'users @at(1, 2) { // hi\n  email: string?,\n}\n';
  let rebuilt = "";
  let cursor = 0;
  for (const token of tokens(source)) {
    rebuilt += source.slice(cursor, token.span.start) + token.text;
    cursor = token.span.end;
  }
  rebuilt += source.slice(cursor);
  assert.equal(rebuilt, source);
});
