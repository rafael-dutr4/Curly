import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/lang/parser.ts";
import type { CollectionNode, FieldNode, TypeNode } from "../src/lang/ast.ts";
import { type Message, say } from "../src/i18n/messages.ts";

/** The compiler names a message; a test reads it in English. */
const en = (message: Message): string => say("en", message);


function collections(source: string): CollectionNode[] {
  return parse(source).file.entries.filter((e): e is CollectionNode => e.kind === "collection");
}

function onlyCollection(source: string): CollectionNode {
  const found = collections(source);
  assert.equal(found.length, 1, `expected one collection in ${JSON.stringify(source)}`);
  return found[0]!;
}

function fieldNames(collection: CollectionNode): string[] {
  return collection.block.fields.map((f) => f.name.text);
}

/** A compact readable shape for a type, so assertions stay legible. */
function shape(type: TypeNode): string {
  switch (type.kind) {
    case "scalar":
      return type.name.text;
    case "ref":
      return `ref(${type.target.text})`;
    case "array":
      return `${shape(type.element)}[]`;
    case "optional":
      return `${shape(type.inner)}?`;
    case "embedded":
      return `{${type.block.fields.map((f) => `${f.name.text}: ${shape(f.type)}`).join(", ")}}`;
  }
}

function typeOf(source: string, fieldName: string): string {
  const field = onlyCollection(source).block.fields.find((f) => f.name.text === fieldName);
  assert.ok(field, `no field named ${fieldName}`);
  return shape(field.type);
}

test("parses a collection with scalar fields", () => {
  const collection = onlyCollection("users { _id: objectId, email: string }");
  assert.equal(collection.name.text, "users");
  assert.deepEqual(fieldNames(collection), ["_id", "email"]);
});

test("parses several collections", () => {
  assert.deepEqual(
    collections("users { a: string }\norder { b: int }").map((c) => c.name.text),
    ["users", "order"],
  );
});

test("accepts a trailing comma and an empty block", () => {
  assert.deepEqual(fieldNames(onlyCollection("users { a: string, }")), ["a"]);
  assert.deepEqual(fieldNames(onlyCollection("users {}")), []);
  assert.equal(parse("users { a: string, }").diagnostics.length, 0);
});

test("parses embedded documents as nested blocks", () => {
  assert.equal(
    typeOf("users { profile: { name: string, avatar: string? } }", "profile"),
    "{name: string, avatar: string?}",
  );
});

test("parses references", () => {
  assert.equal(typeOf("users { orders: ref(order) }", "orders"), "ref(order)");
});

test("a field named ref is not mistaken for the ref keyword", () => {
  assert.equal(typeOf("users { ref: string }", "ref"), "string");
});

test("postfix modifiers wrap in the order they are written", () => {
  assert.equal(typeOf("users { a: string[] }", "a"), "string[]");
  assert.equal(typeOf("users { a: string? }", "a"), "string?");
  assert.equal(typeOf("users { a: string?[] }", "a"), "string?[]");
  assert.equal(typeOf("users { a: string[]? }", "a"), "string[]?");
  assert.equal(typeOf("users { a: ref(order)[] }", "a"), "ref(order)[]");
});

test("parses an array written around its element", () => {
  assert.equal(typeOf("users { items: [{ sku: string }] }", "items"), "{sku: string}[]");
  assert.equal(typeOf("users { tags: [string] }", "tags"), "string[]");
});

test("parses field annotations with and without arguments", () => {
  const field = onlyCollection('users { email: string @unique @default("none") }').block.fields[0]!;
  assert.deepEqual(
    field.annotations.map((a) => a.name.text),
    ["unique", "default"],
  );
  assert.deepEqual(field.annotations[1]!.args, [
    { kind: "string", value: "none", span: field.annotations[1]!.args[0]!.span },
  ]);
});

test("parses the @at annotation on a collection", () => {
  const collection = onlyCollection("users @at(120, 40) { a: string }");
  const at = collection.annotations[0]!;
  assert.equal(at.name.text, "at");
  assert.deepEqual(
    at.args.map((a) => a.value),
    [120, 40],
  );
});

test("parses a negative coordinate", () => {
  const at = onlyCollection("users @at(-8, 40) { a: string }").annotations[0]!;
  assert.deepEqual(
    at.args.map((a) => a.value),
    [-8, 40],
  );
});

test("parses a top level directive, reserved for v2", () => {
  const entries = parse('@access "user with orders" { a: string }').file.entries;
  const directive = entries[0]!;
  assert.equal(directive.kind, "directive");
  assert.equal(directive.kind === "directive" && directive.name.text, "access");
  assert.equal(directive.kind === "directive" && directive.args[0]!.value, "user with orders");
});

test("a comment anywhere does not reach the tree", () => {
  const collection = onlyCollection("// note\nusers { // another\n  a: string // trailing\n}");
  assert.deepEqual(fieldNames(collection), ["a"]);
  assert.equal(parse("// note\nusers { a: string }").diagnostics.length, 0);
});

test("spans slice back to the source they came from", () => {
  const source = "users @at(1, 2) {\n  email: string @unique,\n  profile: { name: string }\n}";
  const collection = onlyCollection(source);
  assert.equal(source.slice(collection.span.start, collection.span.end), source);

  const email = collection.block.fields[0]!;
  assert.equal(source.slice(email.span.start, email.span.end), "email: string @unique");
  assert.equal(source.slice(email.name.span.start, email.name.span.end), "email");
  assert.equal(source.slice(email.type.span.start, email.type.span.end), "string");
});

// --- recovery -------------------------------------------------------------
//
// The point of every test below: a diagnostic is produced, the rest of the
// file is still understood, and nothing throws.

test("a missing colon is reported and the next field still parses", () => {
  const source = "users {\n  email string,\n  name: string\n}";
  const result = parse(source);
  assert.equal(result.diagnostics.length, 1);
  assert.match(en(result.diagnostics[0]!.message), /expected ':' after the field name 'email'/);
  assert.equal(result.diagnostics[0]!.span.line, 2);

  const collection = result.file.entries[0]! as CollectionNode;
  assert.deepEqual(
    collection.block.fields.map((f: FieldNode) => f.name.text),
    ["name"],
  );
});

test("a missing comma is reported and both fields survive", () => {
  const result = parse("users {\n  a: string\n  b: int\n}");
  assert.equal(result.diagnostics.length, 1);
  assert.match(en(result.diagnostics[0]!.message), /expected ',' or '}' after the field 'a'/);
  assert.deepEqual(fieldNames(result.file.entries[0]! as CollectionNode), ["a", "b"]);
});

test("recovery steps over a nested block instead of stopping at its brace", () => {
  const source = "users {\n  profile { name: string },\n  email: string\n}\norder { total: int }";
  const result = parse(source);
  // The `users` block keeps going after the bad field, and `order` is reached.
  assert.deepEqual(
    collections(source).map((c) => c.name.text),
    ["users", "order"],
  );
  assert.deepEqual(fieldNames(result.file.entries[0]! as CollectionNode), ["email"]);
});

test("an unclosed block does not swallow the rest of the file silently", () => {
  const result = parse("users {\n  a: string\n\norder { b: int }");
  assert.ok(result.diagnostics.length > 0);
  assert.doesNotThrow(() => parse("users {"));
});

test("junk at the top level is skipped to the next collection", () => {
  const source = ") ) )\nusers { a: string }";
  const result = parse(source);
  assert.ok(result.diagnostics.length > 0);
  assert.deepEqual(
    collections(source).map((c) => c.name.text),
    ["users"],
  );
});

test("a lexer error is carried through and does not stop parsing", () => {
  const result = parse("users { a: string }\n%\norder { b: int }");
  assert.ok(result.diagnostics.some((d) => /unexpected character/.test(en(d.message))));
  assert.deepEqual(
    result.file.entries.map((e) => (e.kind === "collection" ? e.name.text : e.name.text)),
    ["users", "order"],
  );
});

test("parsing terminates on anything, and never throws", () => {
  const inputs = [
    "",
    "   ",
    "{",
    "}",
    "users",
    "users {",
    "users { a",
    "users { a:",
    "users { a: }",
    "users { : string }",
    "users { a: ref( }",
    "users { a: ref(order }",
    "users { a: [ }",
    "users { a: string @ }",
    "users { a: string @at( }",
    "@",
    "@access",
    "users @",
    "%%%",
    '"unterminated',
    "users { profile: { name: }",
  ];
  for (const source of inputs) {
    assert.doesNotThrow(() => parse(source), `threw on ${JSON.stringify(source)}`);
  }
});
