import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { compile } from "../src/lang/compile.ts";
import { layout } from "../src/layout/layout.ts";
import { toJsonSchema } from "../src/export/jsonschema.ts";
import { sampleDocuments } from "../src/export/samples.ts";

/**
 * The examples are shipped with the app and are the first thing anyone sees,
 * so a change to the language that breaks one has to fail the build.
 */

const FILES = readdirSync("examples").filter((f) => f.endsWith(".curly"));

test("there are examples to check", () => {
  assert.ok(FILES.length > 0);
});

for (const file of FILES) {
  const source = readFileSync(`examples/${file}`, "utf8");

  test(`${file} parses and resolves with nothing to report`, () => {
    assert.deepEqual(compile(source).diagnostics, []);
  });

  test(`${file} draws, with every reference connected`, () => {
    const { model } = compile(source);
    const drawing = layout(model);
    assert.ok(drawing.boxes.length > 0);
    assert.equal(drawing.edges.length, model.edges.length, "every edge in the model is drawn");
  });

  test(`${file} exports`, () => {
    const { model } = compile(source);
    const schemas = toJsonSchema(model);
    assert.deepEqual(Object.keys(schemas).sort(), model.collections.map((c) => c.name).sort());
    assert.doesNotThrow(() => sampleDocuments(model));
  });

  test(`${file} has no overlapping boxes`, () => {
    // The examples pin every collection with @at, and pinned means exactly
    // there, so a bad coordinate is the author's mistake and not the layout's.
    const boxes = layout(compile(source).model).boxes;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        assert.ok(!overlaps, `${a.name} overlaps ${b.name}`);
      }
    }
  });

  test(`${file} explains at least one modelling decision in a comment`, () => {
    // The examples exist to teach the embed-or-reference choice, not just to
    // be syntactically valid.
    assert.ok(source.includes("//"), "no comments at all");
  });
}
