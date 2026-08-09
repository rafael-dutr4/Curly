import test from "node:test";
import assert from "node:assert/strict";

import { highlight, lineAt, lineCount } from "../src/app/highlight.ts";

/** The text a browser would show, with the markup stripped back off. */
function rendered(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function classesOf(source: string): string[] {
  return [...highlight(source).matchAll(/class="tok ([a-z]+)"/g)].map((m) => m[1]!);
}

function classOfToken(source: string, text: string): string | undefined {
  const html = highlight(source);
  const match = new RegExp(`class="tok ([a-z]+)">${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`).exec(html);
  return match?.[1];
}

test("the highlighted copy renders back to the source", () => {
  // This is the property the whole mirror depends on. If a character is lost
  // or added anywhere but the very end, the text stops sitting on its line.
  for (const source of [
    "users { a: string }",
    "// note\nusers {\n  a: string?\n}",
    "users {}\n\n\norder {}",
    'a { b: string @default("x") }',
    "",
    "   ",
    "%%%",
    "users { a: ref( }",
  ]) {
    assert.equal(rendered(highlight(source)), source, JSON.stringify(source));
  }
});

test("a trailing newline is doubled, so both layers make the same last line", () => {
  // A textarea renders an empty last line for a trailing newline and a pre
  // does not. Without this the mirror is one line short and the colours slide
  // off the text at the bottom of a long file.
  assert.equal(rendered(highlight("users {}\n")), "users {}\n\n");
  assert.equal(rendered(highlight("users {}")), "users {}", "and never invented when it was not there");
});

test("html in the source is escaped, not executed", () => {
  const html = highlight('a { b: string @default("<script>") }');
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("tokens are classified from the lexer, with context", () => {
  assert.equal(classOfToken("// hello\nusers {}", "// hello"), "comment");
  assert.equal(classOfToken("users { a: string }", "users"), "collection");
  assert.equal(classOfToken("users { a: string }", "a"), "field");
  assert.equal(classOfToken("users { a: string }", "string"), "type");
  assert.equal(classOfToken("users { a: ref(order) }\norder {}", "ref"), "keyword");
  assert.equal(classOfToken("users @at(1, 2) {}", "at"), "annotation");
  assert.equal(classOfToken("users @at(1, 2) {}", "1"), "number");
  assert.equal(classOfToken('a { b: string @default("x") }', '&quot;x&quot;') ?? classOfToken('a { b: string @default("x") }', '"x"'), "string");
});

test("a name that only looks like a keyword is not one", () => {
  // `ref` is only the keyword when a bracket follows it.
  assert.equal(classOfToken("users { ref: string }", "ref"), "field");
});

test("an unexpected character is marked invalid rather than dropped", () => {
  const source = "users % {}";
  assert.ok(classesOf(source).includes("invalid"));
  assert.equal(rendered(highlight(source)), source);
});

test("highlighting never throws, whatever the input", () => {
  for (const source of ["", "{", '"unterminated', "@", "users {", "\n\n\n", "ref(", "users { a: [ }"]) {
    assert.doesNotThrow(() => highlight(source), JSON.stringify(source));
  }
});

// --- the gutter -----------------------------------------------------------

test("line counting matches what the gutter has to number", () => {
  assert.equal(lineCount(""), 1);
  assert.equal(lineCount("a"), 1);
  assert.equal(lineCount("a\nb"), 2);
  assert.equal(lineCount("a\nb\n"), 3, "a trailing newline opens a line the caret can sit on");
});

test("an offset maps to the line it falls on", () => {
  const source = "one\ntwo\nthree";
  assert.equal(lineAt(source, 0), 1);
  assert.equal(lineAt(source, 3), 1);
  assert.equal(lineAt(source, 4), 2);
  assert.equal(lineAt(source, source.length), 3);
  assert.equal(lineAt(source, 9999), 3, "past the end is the last line, not a crash");
});

test("the line a span reports and the line the offset falls on agree", () => {
  // The lexer computes lines while scanning; this computes them by counting.
  // They are two different pieces of code and they have to say the same thing.
  const source = "users {\n  a: string,\n\n  b: int\n}\n";
  for (let i = 0; i <= source.length; i += 1) {
    const expected = source.slice(0, i).split("\n").length;
    assert.equal(lineAt(source, i), expected, `at ${i}`);
  }
});
