import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import { completionsFor, isTypeValid, splitType, typeCandidates } from "../src/render/complete.ts";

const SOURCE = "users {\n  _id: objectId\n}\n\norder {\n  _id: objectId\n}\n";
const MODEL = compile(SOURCE).model;

// --- candidates -----------------------------------------------------------

test("every scalar is offered", () => {
  const candidates = typeCandidates(MODEL);
  for (const scalar of ["string", "int", "decimal", "objectId", "timestamp", "bool"]) {
    assert.ok(candidates.includes(scalar), scalar);
  }
});

test("a reference is offered for each collection that exists, and no others", () => {
  const refs = typeCandidates(MODEL).filter((c) => c.startsWith("ref("));
  assert.deepEqual(refs, ["ref(users)", "ref(order)"]);
});

test("an embedded document is offered too", () => {
  assert.ok(typeCandidates(MODEL).some((c) => c.includes("{")));
});

// --- splitting ------------------------------------------------------------

test("modifiers are separated from the name being completed", () => {
  assert.deepEqual(splitType("string"), { base: "string", suffix: "" });
  assert.deepEqual(splitType("string?"), { base: "string", suffix: "?" });
  assert.deepEqual(splitType("string[]"), { base: "string", suffix: "[]" });
  assert.deepEqual(splitType("string?[]"), { base: "string", suffix: "?[]" });
  assert.deepEqual(splitType("string[]?"), { base: "string", suffix: "[]?" });
  assert.deepEqual(splitType("ref(order)[]"), { base: "ref(order)", suffix: "[]" });
});

test("a half typed name splits without losing what is there", () => {
  assert.deepEqual(splitType("str"), { base: "str", suffix: "" });
  assert.deepEqual(splitType("str[]"), { base: "str", suffix: "[]" });
  assert.deepEqual(splitType(""), { base: "", suffix: "" });
});

// --- filtering ------------------------------------------------------------

test("prefixes come before mere substrings", () => {
  const found = completionsFor(["string", "int", "restring"], "str");
  assert.deepEqual(found, ["string", "restring"]);
});

test("matching ignores case, because nobody types objectId correctly first time", () => {
  assert.ok(completionsFor(typeCandidates(MODEL), "objectid").includes("objectId"));
});

test("an empty box offers everything", () => {
  assert.deepEqual(completionsFor(["a", "b"], ""), ["a", "b"]);
});

test("a name that matches nothing offers nothing", () => {
  assert.deepEqual(completionsFor(typeCandidates(MODEL), "zzzz"), []);
});

test("typing part of a collection name finds its reference", () => {
  assert.ok(completionsFor(typeCandidates(MODEL), "ord").includes("ref(order)"));
});

test("a half typed reference matches with or without the closing bracket", () => {
  // Editing an existing ref, or an editor that closes brackets, gives the
  // needle a ")" that the candidate does not have at that point.
  for (const typed of ["ref(", "ref(ord", "ref(ord)", "ref(order)"]) {
    assert.ok(completionsFor(typeCandidates(MODEL), typed).includes("ref(order)"), typed);
  }
});

// --- validity -------------------------------------------------------------

test("the real types are accepted, with any modifiers", () => {
  for (const text of ["string", "string?", "string[]", "string?[]", "objectId", "{ a: string }", "[{ a: int }]"]) {
    assert.equal(isTypeValid(SOURCE, MODEL, text), true, text);
  }
});

test("a reference is judged against the collections that exist", () => {
  assert.equal(isTypeValid(SOURCE, MODEL, "ref(order)"), true);
  assert.equal(isTypeValid(SOURCE, MODEL, "ref(order)[]"), true);
  assert.equal(isTypeValid(SOURCE, MODEL, "ref(oder)"), false, "a typo in the target is not a type");
});

test("a misspelled scalar is rejected", () => {
  assert.equal(isTypeValid(SOURCE, MODEL, "strng"), false);
  assert.equal(isTypeValid(SOURCE, MODEL, "Strings"), false);
});

test("nonsense and half typed text are rejected", () => {
  for (const text of ["", "   ", "ref(", "{", "string @", ","]) {
    assert.equal(isTypeValid(SOURCE, MODEL, text), false, JSON.stringify(text));
  }
});

test("errors already in the model do not make every type look wrong", () => {
  // The probe is appended, so only what it caused counts.
  const broken = "users {\n  a: nonsense\n}\n";
  const model = compile(broken).model;
  assert.equal(isTypeValid(broken, model, "string"), true);
  assert.equal(isTypeValid(broken, model, "alsononsense"), false);
});

test("a collection named like the probe does not break the check", () => {
  const odd = "__probe {\n  _id: objectId\n}\n";
  const model = compile(odd).model;
  assert.equal(isTypeValid(odd, model, "string"), true);
  assert.equal(isTypeValid(odd, model, "ref(__probe)"), true);
});

test("validating never throws", () => {
  for (const text of ["}}}", "%%%", "ref(ref(ref", '"', "\n\n"]) {
    assert.doesNotThrow(() => isTypeValid(SOURCE, MODEL, text), JSON.stringify(text));
  }
});
