import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import type { Model } from "../src/lang/model.ts";
import { applyEdits, insert, remove, replace, type TextEdit } from "../src/edit/textedit.ts";
import * as ops from "../src/edit/ops.ts";

/** Run an operation against a source string and return the new source. */
function apply(source: string, run: (source: string, model: Model) => TextEdit[]): string {
  const { model } = compile(source);
  return applyEdits(source, run(source, model));
}

const MODEL = `// what a user is
users @at(120, 40) {
  _id: objectId,
  email: string @unique,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}

order {
  _id: objectId,
  total: decimal
}
`;

const ref = (collection: string, ...path: string[]) => ({ collection, path });

// --- applying patches -----------------------------------------------------

test("patches are applied back to front, so later offsets stay valid", () => {
  const source = "users { a: string }";
  const result = applyEdits(source, [replace({ start: 8, end: 9 }, "b"), replace({ start: 11, end: 17 }, "int")]);
  assert.equal(result, "users { b: int }");
});

test("the order patches are given in does not matter", () => {
  const source = "users { a: string }";
  const forwards = applyEdits(source, [replace({ start: 8, end: 9 }, "b"), replace({ start: 11, end: 17 }, "int")]);
  const backwards = applyEdits(source, [replace({ start: 11, end: 17 }, "int"), replace({ start: 8, end: 9 }, "b")]);
  assert.equal(forwards, backwards);
});

test("an empty patch list leaves the source untouched", () => {
  assert.equal(applyEdits(MODEL, []), MODEL);
});

test("insert and remove are just patches with one empty side", () => {
  assert.equal(applyEdits("ab", [insert(1, "X")]), "aXb");
  assert.equal(applyEdits("abc", [remove({ start: 1, end: 2 })]), "ac");
});

test("overlapping patches throw, because that is a bug and not user input", () => {
  assert.throws(
    () => applyEdits("users { a: string }", [replace({ start: 8, end: 12 }, "x"), replace({ start: 10, end: 14 }, "y")]),
    /overlapping text edits/,
  );
});

test("a patch outside the source throws", () => {
  assert.throws(() => applyEdits("abc", [replace({ start: 0, end: 99 }, "x")]), /out of range/);
});

// --- renaming -------------------------------------------------------------

test("renaming a field touches only that name", () => {
  const result = apply(MODEL, (s, m) => ops.renameField(s, m, ref("users", "email"), "mail"));
  assert.equal(result, MODEL.replace("email: string", "mail: string"));
});

test("renaming a nested field reaches inside the embedded document", () => {
  const result = apply(MODEL, (s, m) => ops.renameField(s, m, ref("users", "profile", "avatar"), "picture"));
  assert.equal(result, MODEL.replace("avatar: string?", "picture: string?"));
  assert.ok(result.includes("name: string"), "the sibling field is untouched");
});

test("renaming a collection also rewrites every reference to it", () => {
  const result = apply(MODEL, (s, m) => ops.renameCollection(s, m, "order", "purchase"));
  assert.ok(result.includes("purchase {"), "the declaration is renamed");
  assert.ok(result.includes("ref(purchase)[]"), "the reference is renamed");
  assert.ok(!result.includes("ref(order)"), "no reference keeps the old name");
  assert.ok(!/^order /m.test(result), "no declaration keeps the old name");
  assert.ok(result.includes("orders: ref(purchase)[]"), "the field named orders is not renamed");
  assert.deepEqual(compile(result).diagnostics, [], "the result still resolves");
});

test("renaming a collection to its own name does nothing", () => {
  assert.equal(apply(MODEL, (s, m) => ops.renameCollection(s, m, "order", "order")), MODEL);
});

// --- adding fields --------------------------------------------------------

test("a new field copies the indentation of the fields above it", () => {
  const result = apply(MODEL, (s, m) => ops.addField(s, m, ref("users"), "age", "int"));
  assert.ok(result.includes("  orders: ref(order)[],\n  age: int\n}"), result);
});

test("a new field keeps the trailing comma style when the file uses one", () => {
  const source = "users {\n  a: string,\n}\n";
  assert.equal(apply(source, (s, m) => ops.addField(s, m, ref("users"), "b", "int")), "users {\n  a: string,\n  b: int,\n}\n");
});

test("a new field adds the missing comma to the field that used to be last", () => {
  const source = "users {\n  a: string\n}\n";
  assert.equal(apply(source, (s, m) => ops.addField(s, m, ref("users"), "b", "int")), "users {\n  a: string,\n  b: int\n}\n");
});

test("a new field respects a four space file", () => {
  const source = "users {\n    a: string\n}\n";
  assert.equal(apply(source, (s, m) => ops.addField(s, m, ref("users"), "b", "int")), "users {\n    a: string,\n    b: int\n}\n");
});

test("a field can be added to an empty block written either way", () => {
  assert.equal(apply("users {}\n", (s, m) => ops.addField(s, m, ref("users"), "a", "int")), "users {\n  a: int\n}\n");
  assert.equal(apply("users {\n}\n", (s, m) => ops.addField(s, m, ref("users"), "a", "int")), "users {\n  a: int\n}\n");
});

test("a field can be added inside an embedded document", () => {
  const result = apply(MODEL, (s, m) => ops.addField(s, m, ref("users", "profile"), "bio", "string?"));
  assert.ok(result.includes("    avatar: string?,\n    bio: string?\n  }"), result);
  assert.deepEqual(compile(result).diagnostics, []);
});

// --- deleting fields ------------------------------------------------------

test("deleting a middle field takes its line and its comma", () => {
  const result = apply(MODEL, (s, m) => ops.deleteField(s, m, ref("users", "email")));
  assert.equal(result, MODEL.replace("  email: string @unique,\n", ""));
});

test("deleting the last field takes the comma belonging to the one before it", () => {
  const source = "users {\n  a: string,\n  b: int\n}\n";
  assert.equal(apply(source, (s, m) => ops.deleteField(s, m, ref("users", "b"))), "users {\n  a: string\n}\n");
});

test("deleting the only field leaves an empty block", () => {
  assert.equal(apply("users {\n  a: string\n}\n", (s, m) => ops.deleteField(s, m, ref("users", "a"))), "users {\n}\n");
});

test("deleting a field leaves the file parseable", () => {
  for (const name of ["_id", "email", "profile", "orders"]) {
    const result = apply(MODEL, (s, m) => ops.deleteField(s, m, ref("users", name)));
    assert.deepEqual(compile(result).diagnostics, [], `broke when deleting ${name}: ${result}`);
  }
});

// --- moving ---------------------------------------------------------------

test("moving a field swaps it with its neighbour", () => {
  const source = "users {\n  a: string,\n  b: int\n}\n";
  assert.equal(apply(source, (s, m) => ops.moveField(s, m, ref("users", "a"), 1)), "users {\n  b: int,\n  a: string\n}\n");
});

test("moving past the end does nothing", () => {
  const source = "users {\n  a: string,\n  b: int\n}\n";
  assert.equal(apply(source, (s, m) => ops.moveField(s, m, ref("users", "b"), 1)), source);
  assert.equal(apply(source, (s, m) => ops.moveField(s, m, ref("users", "a"), -1)), source);
});

// --- types ----------------------------------------------------------------

test("setting a type replaces exactly the type", () => {
  const result = apply(MODEL, (s, m) => ops.setType(s, m, ref("users", "email"), "int"));
  assert.equal(result, MODEL.replace("email: string @unique", "email: int @unique"));
});

test("making a reference is a type change, and the arrow follows", () => {
  const source = "users {\n  o: string\n}\n\norder {\n  _id: objectId\n}\n";
  const result = apply(source, (s, m) => ops.makeReference(s, m, ref("users", "o"), "order"));
  assert.ok(result.includes("o: ref(order)"));
  assert.equal(compile(result).model.edges.length, 1);
});

test("toggling optional adds and then removes the question mark", () => {
  const once = apply(MODEL, (s, m) => ops.toggleOptional(s, m, ref("users", "email")));
  assert.ok(once.includes("email: string? @unique"));
  const twice = apply(once, (s, m) => ops.toggleOptional(s, m, ref("users", "email")));
  assert.equal(twice, MODEL, "toggling twice returns the original file");
});

test("toggling optional finds the question mark wherever it sits in the chain", () => {
  const source = "users {\n  a: string?[]\n}\n";
  assert.equal(apply(source, (s, m) => ops.toggleOptional(s, m, ref("users", "a"))), "users {\n  a: string[]\n}\n");
});

test("toggling array adds and then removes the brackets", () => {
  const source = "users {\n  a: string\n}\n";
  const once = apply(source, (s, m) => ops.toggleArray(s, m, ref("users", "a")));
  assert.equal(once, "users {\n  a: string[]\n}\n");
  assert.equal(apply(once, (s, m) => ops.toggleArray(s, m, ref("users", "a"))), source);
});

test("toggling array off works on the bracket-around spelling too", () => {
  const source = "users {\n  items: [{ sku: string }]\n}\n";
  assert.equal(apply(source, (s, m) => ops.toggleArray(s, m, ref("users", "items"))), "users {\n  items: { sku: string }\n}\n");
});

// --- annotations ----------------------------------------------------------

test("an annotation is appended after the type and its existing annotations", () => {
  const source = "users {\n  a: string @unique\n}\n";
  assert.equal(apply(source, (s, m) => ops.addAnnotation(s, m, ref("users", "a"), "index")), "users {\n  a: string @unique @index\n}\n");
});

test("adding an annotation that is already there does nothing", () => {
  const source = "users {\n  a: string @unique\n}\n";
  assert.equal(apply(source, (s, m) => ops.addAnnotation(s, m, ref("users", "a"), "unique")), source);
});

test("removing an annotation takes the space in front of it", () => {
  const result = apply(MODEL, (s, m) => ops.removeAnnotation(s, m, ref("users", "email"), "unique"));
  assert.equal(result, MODEL.replace("email: string @unique", "email: string"));
});

// --- positions ------------------------------------------------------------

test("dragging a box that has no position writes one", () => {
  const result = apply(MODEL, (s, m) => ops.setPosition(s, m, "order", 480, 200));
  assert.ok(result.includes("order @at(480, 200) {"), result);
});

test("dragging a box that already has a position replaces it, never stacks", () => {
  const once = apply(MODEL, (s, m) => ops.setPosition(s, m, "users", 300, 90));
  assert.ok(once.includes("users @at(300, 90) {"));
  const twice = apply(once, (s, m) => ops.setPosition(s, m, "users", 310, 95));
  assert.ok(twice.includes("users @at(310, 95) {"));
  assert.equal(twice.match(/@at\(/g)?.length, 1, "only one @at should exist");
});

test("positions are written as whole numbers", () => {
  const result = apply(MODEL, (s, m) => ops.setPosition(s, m, "order", 480.6, 200.2));
  assert.ok(result.includes("@at(481, 200)"), result);
});

test("clearing a position removes the annotation and its space", () => {
  const result = apply(MODEL, (s, m) => ops.clearPosition(s, m, "users"));
  assert.ok(result.includes("users {"), result);
  assert.ok(!result.includes("@at"));
});

// --- missing targets ------------------------------------------------------

test("an operation on something that is not there produces no patches", () => {
  const { model } = compile(MODEL);
  assert.deepEqual(ops.renameField(MODEL, model, ref("users", "nope"), "x"), []);
  assert.deepEqual(ops.renameCollection(MODEL, model, "nope", "x"), []);
  assert.deepEqual(ops.deleteField(MODEL, model, ref("nope", "a")), []);
  assert.deepEqual(ops.setPosition(MODEL, model, "nope", 1, 2), []);
  assert.deepEqual(ops.addField(MODEL, model, ref("users", "nope"), "a", "int"), []);
  assert.deepEqual(ops.removeAnnotation(MODEL, model, ref("users", "email"), "nope"), []);
  assert.deepEqual(ops.addCollection(MODEL, model, "users"), [], "adding a duplicate collection is refused");
});

// --- the property that matters --------------------------------------------

test("comments and formatting survive every operation", () => {
  const source = `// leading note
users {  // about users
  _id: objectId,      // the key
  email: string @unique,

  // a blank line and a comment in the middle
  profile: {
    name: string
  }
}
`;
  const sequence: ((s: string, m: Model) => TextEdit[])[] = [
    (s, m) => ops.renameField(s, m, ref("users", "email"), "mail"),
    (s, m) => ops.addField(s, m, ref("users"), "age", "int"),
    (s, m) => ops.toggleOptional(s, m, ref("users", "age")),
    (s, m) => ops.setPosition(s, m, "users", 100, 50),
    (s, m) => ops.addAnnotation(s, m, ref("users", "mail"), "index"),
    (s, m) => ops.addField(s, m, ref("users", "profile"), "bio", "string"),
  ];

  let current = source;
  for (const step of sequence) current = apply(current, step);

  for (const comment of [
    "// leading note",
    "// about users",
    "// the key",
    "// a blank line and a comment in the middle",
  ]) {
    assert.ok(current.includes(comment), `lost ${comment}\n${current}`);
  }

  assert.deepEqual(compile(current).diagnostics, [], current);
  assert.ok(current.includes("age: int?"));
  assert.ok(current.includes("mail: string @unique @index"));
  assert.ok(current.includes("bio: string"));
});

test("the same sequence twice from the same start is byte identical", () => {
  const run = (): string => {
    let current = MODEL;
    current = apply(current, (s, m) => ops.addField(s, m, ref("users"), "age", "int"));
    current = apply(current, (s, m) => ops.renameCollection(s, m, "order", "purchase"));
    current = apply(current, (s, m) => ops.setPosition(s, m, "purchase", 400, 300));
    current = apply(current, (s, m) => ops.deleteField(s, m, ref("users", "_id")));
    return current;
  };
  assert.equal(run(), run());
});

test("every operation leaves a file that still parses", () => {
  const steps: ((s: string, m: Model) => TextEdit[])[] = [
    (s, m) => ops.addField(s, m, ref("users"), "extra", "string"),
    (s, m) => ops.deleteField(s, m, ref("users", "profile")),
    (s, m) => ops.moveField(s, m, ref("users", "_id"), 1),
    (s, m) => ops.toggleArray(s, m, ref("users", "email")),
    (s, m) => ops.toggleOptional(s, m, ref("users", "email")),
    (s, m) => ops.setType(s, m, ref("users", "email"), "int"),
    (s, m) => ops.addAnnotation(s, m, ref("users", "_id"), "index"),
    (s, m) => ops.removeAnnotation(s, m, ref("users", "email"), "unique"),
    (s, m) => ops.setPosition(s, m, "order", 10, 20),
    (s, m) => ops.clearPosition(s, m, "users"),
    (s, m) => ops.addCollection(s, m, "invoice"),
  ];

  for (const step of steps) {
    const result = apply(MODEL, step);
    const errors = compile(result).diagnostics.filter((d) => d.severity === "error");
    assert.deepEqual(errors, [], `left a broken file:\n${result}`);
  }
});

test("deleting an unreferenced collection leaves a clean file", () => {
  const source = "users {\n  a: string\n}\n\nlonely {\n  b: int\n}\n";
  const result = apply(source, (s, m) => ops.deleteCollection(s, m, "lonely"));
  assert.equal(result, "users {\n  a: string\n}\n");
  assert.deepEqual(compile(result).diagnostics, []);
});

test("deleting a referenced collection reports the dangling reference rather than hiding it", () => {
  // The deliberate contract: delete only what was asked for, and let the
  // reference that is now broken be named by an error. Refusing would argue
  // with the user; rewriting their other collections would destroy work.
  const result = apply(MODEL, (s, m) => ops.deleteCollection(s, m, "order"));
  assert.ok(!/^order /m.test(result), "the collection is gone");
  assert.ok(result.includes("orders: ref(order)[]"), "the reference is left exactly as written");

  const errors = compile(result).diagnostics.filter((d) => d.severity === "error");
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /no collection named 'order'/);
});

test("deleting a collection removes it and the blank line it left behind", () => {
  const result = apply(MODEL, (s, m) => ops.deleteCollection(s, m, "order"));
  assert.ok(!result.includes("order {"));
  assert.ok(!/\n\n\n/.test(result), `left a gap:\n${result}`);
  assert.ok(result.includes("users @at(120, 40) {"));
});

test("a new collection is appended with a blank line before it", () => {
  const result = apply(MODEL, (s, m) => ops.addCollection(s, m, "invoice"));
  assert.ok(result.endsWith("invoice {\n  _id: objectId\n}\n"), JSON.stringify(result.slice(-60)));
  assert.ok(result.includes("}\n\ninvoice {"));
  assert.deepEqual(compile(result).diagnostics, []);
});

// --- creating from the diagram --------------------------------------------

test("a collection created from the diagram is pinned where it was asked for", () => {
  const result = apply(MODEL, (s, m) => ops.addCollection(s, m, "invoice", { x: 640, y: 220 }));
  assert.ok(result.includes("invoice @at(640, 220) {"), result);
  assert.deepEqual(compile(result).diagnostics, []);
});

test("a created collection rounds its position and starts with a key", () => {
  const result = apply(MODEL, (s, m) => ops.addCollection(s, m, "invoice", { x: 12.7, y: 4.2 }));
  assert.ok(result.includes("invoice @at(13, 4) {\n  _id: objectId\n}"), result);
});

test("a collection created without a position is left for the layout to place", () => {
  const result = apply(MODEL, (s, m) => ops.addCollection(s, m, "invoice"));
  assert.ok(result.includes("invoice {"));
  assert.ok(!/invoice @at/.test(result));
});

test("the suggested name steps aside for the ones already taken", () => {
  const { model } = compile(MODEL);
  assert.equal(ops.unusedCollectionName(model), "collection");

  const withOne = compile(`${MODEL}\ncollection { a: string }`).model;
  assert.equal(ops.unusedCollectionName(withOne), "collection2");

  const withTwo = compile(`${MODEL}\ncollection { a: string }\ncollection2 { a: string }`).model;
  assert.equal(ops.unusedCollectionName(withTwo), "collection3");
});

test("the menu can tell what a field already is", () => {
  const { model } = compile("t {\n  a: string,\n  b: string?,\n  c: string[],\n  d: string?[]\n}");
  const field = (name: string) => model.collections[0]!.fields.find((f) => f.name === name)!.type;

  assert.equal(ops.hasWrapper(field("a"), "optional"), false);
  assert.equal(ops.hasWrapper(field("b"), "optional"), true);
  assert.equal(ops.hasWrapper(field("c"), "array"), true);
  assert.equal(ops.hasWrapper(field("d"), "optional"), true);
  assert.equal(ops.hasWrapper(field("d"), "array"), true);
});
