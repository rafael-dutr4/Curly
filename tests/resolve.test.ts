import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import { baseFieldType, type FieldType } from "../src/lang/model.ts";
import { type Message, say } from "../src/i18n/messages.ts";

/** The compiler names a message; a test reads it in English. */
const en = (message: Message): string => say("en", message);


function errors(source: string): string[] {
  return compile(source)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => en(d.message));
}

function warnings(source: string): string[] {
  return compile(source)
    .diagnostics.filter((d) => d.severity === "warning")
    .map((d) => en(d.message));
}

function fieldType(source: string, collection: string, field: string): FieldType {
  const found = compile(source).model.byName.get(collection)?.fields.find((f) => f.name === field);
  assert.ok(found, `no field ${collection}.${field}`);
  return found.type;
}

test("a clean model resolves with no diagnostics", () => {
  const source = `
users @at(120, 40) {
  _id: objectId,
  email: string @unique,
  profile: { name: string, avatar: string? },
  orders: ref(order)[]
}

order @at(480, 40) {
  _id: objectId,
  total: decimal,
  items: [{ sku: string, qty: int }]
}
`;
  const { model, diagnostics } = compile(source);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    model.collections.map((c) => c.name),
    ["users", "order"],
  );
});

test("references become edges in declaration order", () => {
  const { model } = compile("users { orders: ref(order)[] }\norder { _id: objectId }");
  assert.deepEqual(model.edges, [
    { from: "users", to: "order", fieldName: "orders", span: model.edges[0]!.span },
  ]);
});

test("a reference resolves against a collection declared later in the file", () => {
  // This is the whole reason resolve is two passes.
  assert.deepEqual(errors("a { b: ref(b) }\nb { _id: objectId }"), []);
});

test("an unresolved reference is reported and produces no edge", () => {
  const { model, diagnostics } = compile("users { orders: ref(order) }");
  assert.equal(diagnostics.length, 1);
  assert.match(en(diagnostics[0]!.message), /no collection named 'order'/);
  assert.deepEqual(model.edges, []);

  const type = baseFieldType(fieldType("users { orders: ref(order) }", "users", "orders"));
  assert.equal(type.kind === "ref" && type.resolved, false);
});

test("a near miss on a collection name suggests the right one", () => {
  const [message] = errors("users { orders: ref(oder) }\norder { _id: objectId }");
  assert.match(message!, /did you mean 'order'\?/);
});

test("a near miss on a type name suggests the right one", () => {
  assert.match(errors("users { a: strng }")[0]!, /unknown type 'strng', did you mean 'string'\?/);
  assert.match(errors("users { a: objectid }")[0]!, /did you mean 'objectId'\?/);
});

test("a wildly wrong type is reported without a bogus suggestion", () => {
  const [message] = errors("users { a: somethingelseentirely }");
  assert.match(message!, /^unknown type 'somethingelseentirely'$/);
});

test("an unknown type is kept so the diagram still draws", () => {
  const type = fieldType("users { a: strng }", "users", "a");
  assert.equal(type.kind === "scalar" && type.known, false);
  assert.equal(type.kind === "scalar" && type.name, "strng");
});

test("a duplicate collection is reported once and does not replace the first", () => {
  const { model, diagnostics } = compile("users { a: string }\nusers { b: int }");
  assert.equal(diagnostics.length, 1);
  assert.match(en(diagnostics[0]!.message), /already declared on line 1/);
  assert.equal(model.collections.length, 1);
  assert.deepEqual(model.collections[0]!.fields.map((f) => f.name), ["a"]);
});

test("a duplicate field is reported and the first one wins", () => {
  const { model, diagnostics } = compile("users {\n  a: string,\n  a: int\n}");
  assert.equal(diagnostics.length, 1);
  assert.match(en(diagnostics[0]!.message), /the field 'a' is already declared on line 2/);
  assert.deepEqual(model.collections[0]!.fields.map((f) => f.name), ["a"]);
});

test("the same field name inside different embedded documents is fine", () => {
  assert.deepEqual(errors("users { a: { n: string }, b: { n: string } }"), []);
});

test("embedded documents resolve recursively", () => {
  const type = fieldType("users { profile: { home: { city: string } } }", "users", "profile");
  assert.equal(type.kind, "embedded");
  const inner = type.kind === "embedded" ? type.fields[0]!.type : null;
  assert.equal(inner?.kind, "embedded");
});

test("a reference inside an embedded document still becomes an edge", () => {
  const { model } = compile("users { profile: { org: ref(org) } }\norg { _id: objectId }");
  assert.deepEqual(
    model.edges.map((e) => [e.from, e.to, e.fieldName]),
    [["users", "org", "org"]],
  );
});

test("field annotations become flags", () => {
  const { model } = compile('users { email: string @unique @index @default("none") }');
  const field = model.collections[0]!.fields[0]!;
  assert.equal(field.unique, true);
  assert.equal(field.indexed, true);
  assert.equal(field.defaultValue, "none");
});

test("@enum collects its values", () => {
  const { model } = compile("post { state: string @enum(draft, published) }");
  assert.deepEqual(model.collections[0]!.fields[0]!.enumValues, ["draft", "published"]);
});

test("an unknown annotation is a warning, not an error", () => {
  assert.deepEqual(errors("users { a: string @sparkles }"), []);
  assert.match(warnings("users { a: string @sparkles }")[0]!, /unknown annotation '@sparkles'/);
});

test("@at gives the collection a position and remembers its own span", () => {
  const source = "users @at(120, 40) { a: string }";
  const collection = compile(source).model.collections[0]!;
  assert.deepEqual(collection.position, { x: 120, y: 40 });
  assert.equal(source.slice(collection.positionSpan!.start, collection.positionSpan!.end), "@at(120, 40)");
});

test("a collection without @at has no position", () => {
  const collection = compile("users { a: string }").model.collections[0]!;
  assert.equal(collection.position, null);
  assert.equal(collection.positionSpan, null);
});

test("a malformed @at is reported and leaves the collection unplaced", () => {
  for (const bad of ["@at(1)", "@at(1, 2, 3)", "@at(a, b)", "@at()"]) {
    const source = `users ${bad} { a: string }`;
    assert.match(errors(source)[0] ?? "", /@at takes two numbers/, `not reported for ${bad}`);
    assert.equal(compile(source).model.collections[0]!.position, null);
  }
});

test("a repeated @at keeps the last one", () => {
  const collection = compile("users @at(1, 2) @at(3, 4) { a: string }").model.collections[0]!;
  assert.deepEqual(collection.position, { x: 3, y: 4 });
});

test("a top level directive is a warning and is not a collection", () => {
  const { model, diagnostics } = compile('@access "user with orders" { a: string }\nusers { b: int }');
  assert.match(en(diagnostics[0]!.message), /reserved for a future version/);
  assert.deepEqual(model.collections.map((c) => c.name), ["users"]);
});

test("parse errors and resolve errors both arrive, in that order", () => {
  const messages = compile("users {\n  a string,\n  b: nope\n}").diagnostics.map((d) => en(d.message));
  assert.match(messages[0]!, /expected ':'/);
  assert.match(messages[1]!, /unknown type 'nope'/);
});

test("resolving never throws, whatever the input", () => {
  const inputs = ["", "users {", "users { a: ref( }", "@", "%%%", "users { a: [ }", "a { b: ref(a) }"];
  for (const source of inputs) {
    assert.doesNotThrow(() => compile(source), `threw on ${JSON.stringify(source)}`);
  }
});

test("a self reference resolves and makes a self edge", () => {
  const { model, diagnostics } = compile("node { parent: ref(node)? }");
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    model.edges.map((e) => [e.from, e.to]),
    [["node", "node"]],
  );
});
