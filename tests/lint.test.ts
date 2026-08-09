import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import { lint, type Finding } from "../src/lint/lint.ts";
import { DOCUMENT_LIMIT, estimateCollection, formatBytes } from "../src/lint/size.ts";

function findings(source: string): Finding[] {
  return lint(compile(source).model);
}

function rules(source: string): string[] {
  return findings(source).map((f) => f.rule);
}

function sizeOf(source: string, name = "t"): number {
  const { model } = compile(source);
  return estimateCollection(model, model.byName.get(name)!).bytes;
}

// --- quiet by default -----------------------------------------------------

test("a reasonable model produces nothing", () => {
  const source = `
users {
  _id: objectId,
  email: string @unique,
  tags: string[],
  profile: { name: string }
}
`;
  assert.deepEqual(findings(source), []);
});

test("an array of scalars is not reported, because a linter that fires on everything gets ignored", () => {
  assert.deepEqual(rules("t { _id: objectId, tags: string[] }"), []);
});

test("an empty model has nothing to say about it", () => {
  assert.deepEqual(findings(""), []);
});

// --- unbounded arrays -----------------------------------------------------

test("an array of embedded documents with no expected size is reported", () => {
  const [finding] = findings("t { _id: objectId, lines: [{ sku: string }] }");
  assert.equal(finding?.rule, "unbounded-array");
  assert.match(finding!.message, /16MB/);
  assert.match(finding!.message, /@count\(n\)/, "the finding says what to do about it");
});

test("an array of references with no expected size is reported", () => {
  assert.deepEqual(rules("t { _id: objectId, o: ref(o)[] }\no { _id: objectId }"), ["unbounded-array"]);
});

test("@count answers the question and silences the note", () => {
  assert.deepEqual(rules("t { _id: objectId, lines: [{ sku: string }] @count(20) }"), []);
});

test("the finding points at the field, not the collection", () => {
  const source = "t { _id: objectId, lines: [{ sku: string }] }";
  const [finding] = findings(source);
  assert.equal(source.slice(finding!.span.start, finding!.span.end), "lines");
});

// --- fan out --------------------------------------------------------------

test("a big array of references suggests turning the link around", () => {
  const source = "author { _id: objectId, posts: ref(post)[] @count(5000) }\npost { _id: objectId }";
  const finding = findings(source).find((f) => f.rule === "fan-out");
  assert.equal(finding?.level, "warning");
  assert.match(finding!.message, /Storing the link on 'post' instead/);
});

test("a small array of references is fine", () => {
  const source = "author { _id: objectId, posts: ref(post)[] @count(20) }\npost { _id: objectId }";
  assert.ok(!rules(source).includes("fan-out"));
});

test("a big array of embedded documents is not a fan out", () => {
  // Fan out is about the cost of a join. Embedded documents have no join to
  // pay for; their problem is size, which the size rule owns.
  assert.ok(!rules("t { _id: objectId, lines: [{ sku: string }] @count(5000) }").includes("fan-out"));
});

test("5000 small embedded documents is a quarter of a megabyte, and not yet a problem", () => {
  const bytes = sizeOf("t { _id: objectId, lines: [{ sku: string }] @count(5000) }");
  assert.ok(bytes > 200_000 && bytes < 400_000, formatBytes(bytes));
  assert.deepEqual(rules("t { _id: objectId, lines: [{ sku: string }] @count(5000) }"), []);
});

// --- nesting --------------------------------------------------------------

test("nesting up to the limit is left alone", () => {
  // Four levels of embedding is the limit, not past it.
  const source = "t { _id: objectId, a: { b: { c: { d: { e: string } } } } }";
  assert.ok(!rules(source).includes("deep-nesting"), rules(source).join(", "));
});

test("nesting past the limit is reported exactly once", () => {
  const source = "t { _id: objectId, a: { b: { c: { d: { e: { f: string } } } } } }";
  const found = findings(source).filter((f) => f.rule === "deep-nesting");
  assert.equal(found.length, 1, "reported at the first offending level and not repeated below it");
  assert.match(found[0]!.message, /5 levels deep/);
  assert.equal(source.slice(found[0]!.span.start, found[0]!.span.end), "e");
});

test("ordinary nesting is not reported", () => {
  assert.ok(!rules("t { _id: objectId, a: { b: { c: string } } }").includes("deep-nesting"));
});

// --- small rules ----------------------------------------------------------

test("a collection with no key is noted", () => {
  const [finding] = findings("t { name: string }");
  assert.equal(finding?.rule, "missing-key");
  assert.equal(finding?.level, "note");
});

test("an empty collection is not nagged about its missing key", () => {
  assert.deepEqual(rules("t { }"), []);
});

test("@unique and @index together is redundant", () => {
  const source = "t { _id: objectId, email: string @unique @index }";
  const [finding] = findings(source);
  assert.equal(finding?.rule, "redundant-index");
  assert.equal(source.slice(finding!.span.start, finding!.span.end), "@index", "it points at the one to remove");
});

test("@unique or @index alone is fine", () => {
  assert.deepEqual(rules("t { _id: objectId, a: string @unique, b: string @index }"), []);
});

// --- size estimation ------------------------------------------------------

test("a small document is small", () => {
  const bytes = sizeOf("t { _id: objectId, n: int, ok: bool }");
  assert.ok(bytes > 0 && bytes < 200, `${bytes}`);
});

test("size grows with the number of elements", () => {
  const ten = sizeOf("t { _id: objectId, xs: [{ a: string }] @count(10) }");
  const hundred = sizeOf("t { _id: objectId, xs: [{ a: string }] @count(100) }");
  assert.ok(hundred > ten * 5, `${ten} then ${hundred}`);
});

test("a reference costs its target's key, not the whole document", () => {
  const withRef = sizeOf("t { _id: objectId, o: ref(o) }\no { _id: objectId, big: string, more: string, extra: string }");
  const withId = sizeOf("t { _id: objectId, o: objectId }");
  assert.ok(Math.abs(withRef - withId) < 8, `${withRef} vs ${withId}`);
});

test("an array with no @count is estimated but flagged as assumed", () => {
  const { model } = compile("t { _id: objectId, xs: [{ a: string }] }");
  const estimate = estimateCollection(model, model.byName.get("t")!);
  assert.equal(estimate.assumed, true);

  const counted = compile("t { _id: objectId, xs: [{ a: string }] @count(3) }").model;
  assert.equal(estimateCollection(counted, counted.byName.get("t")!).assumed, false);
});

test("a document over the limit says so plainly", () => {
  const source = "t { _id: objectId, xs: [{ body: string }] @count(400000) }";
  const finding = findings(source).find((f) => f.rule === "document-too-large");
  assert.ok(finding, rules(source).join(", "));
  assert.equal(finding!.level, "warning");
  assert.match(finding!.message, /cannot be written as one document/);
  assert.ok(sizeOf(source) > DOCUMENT_LIMIT);
});

test("a large but legal document is a warning, not a refusal", () => {
  const source = "t { _id: objectId, xs: [{ body: string }] @count(30000) }";
  const found = rules(source);
  assert.ok(found.includes("large-document"), found.join(", "));
  assert.ok(!found.includes("document-too-large"));
});

test("the estimate is qualified when it had to assume", () => {
  const finding = findings("t { _id: objectId, xs: [{ body: string }] }").find((f) => f.rule === "large-document");
  // 10 assumed elements is nowhere near a megabyte, so nothing should fire.
  assert.equal(finding, undefined);
});

test("sizes are written for a person to read", () => {
  assert.equal(formatBytes(840), "840 bytes");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

// --- behaviour ------------------------------------------------------------

test("findings come back in source order", () => {
  const source = `
alpha { name: string }

beta { _id: objectId, xs: [{ a: string }] }
`;
  const found = findings(source);
  assert.ok(found.length >= 2);
  for (let i = 1; i < found.length; i += 1) {
    assert.ok(found[i]!.span.start >= found[i - 1]!.span.start, "out of order");
  }
});

test("linting a broken model does not throw", () => {
  for (const source of ["t {", "t { a: }", "%%%", "", "t { a: ref(nope) }", "t { a: nonsense }"]) {
    assert.doesNotThrow(() => findings(source), source);
  }
});

test("a self referencing collection is estimated without recursing forever", () => {
  assert.doesNotThrow(() => findings("node { _id: objectId, parent: ref(node)?, kids: ref(node)[] @count(4) }"));
});

test("the shipped examples are clean, or say something worth saying", () => {
  // The blog embeds comments with no bound, which is exactly the trade the
  // example exists to show, so the note is correct and wanted.
  const blog = findings(
    "post { _id: objectId, comments: [{ body: string }] }\n",
  );
  assert.deepEqual(blog.map((f) => f.rule), ["unbounded-array"]);
});
