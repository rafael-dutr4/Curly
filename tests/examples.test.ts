import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { compile } from "../src/lang/compile.ts";
import { layout } from "../src/layout/layout.ts";
import { toJsonSchema } from "../src/export/jsonschema.ts";
import { sampleDocuments } from "../src/export/samples.ts";
import { EXAMPLES, pathFor } from "../src/app/examples.ts";
import { isMessageKey, LOCALES } from "../src/i18n/messages.ts";

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

test("every example in the menu exists on disk", () => {
  // The menu is a hand written list, because a static site cannot read a
  // directory. This is what stops it drifting away from examples/.
  for (const example of EXAMPLES) {
    assert.ok(FILES.includes(example.path.replace("examples/", "")), `${example.path} is missing`);
    // The name and the description are message keys, so the test that every
    // message is filled in every language covers the words themselves.
    assert.ok(isMessageKey(example.name), `${example.name} is not a message`);
    assert.ok(isMessageKey(example.description), `${example.description} is not a message`);
  }
});

test("every example on disk is offered in the menu", () => {
  for (const file of FILES) {
    assert.ok(
      EXAMPLES.some((e) => e.path === `examples/${file}`),
      `examples/${file} is not listed in the menu`,
    );
  }
});

/**
 * The translated copies exist so the reasoning in the comments can be read in
 * the reader's language. Only the comments are translated: the collection and
 * field names are the model itself, so a translated copy has to describe the
 * same model, token for token, or the two languages would be teaching two
 * different things.
 */
for (const locale of LOCALES.filter((l) => l !== "en")) {
  for (const example of EXAMPLES) {
    const path = pathFor(example, locale);

    test(`${path} exists and models exactly what the English one does`, () => {
      const translated = readFileSync(path, "utf8");
      const original = readFileSync(example.path, "utf8");
      assert.deepEqual(compile(translated).diagnostics, []);
      assert.deepEqual(withoutComments(translated), withoutComments(original));
    });

    test(`${path} translates the comments rather than copying them`, () => {
      const translated = commentsOf(readFileSync(path, "utf8"));
      const original = commentsOf(readFileSync(example.path, "utf8"));
      assert.ok(translated.length > 0, "no comments at all");
      assert.equal(translated.length > 0 && original.length > 0, true);
      assert.notDeepEqual(translated, original);
    });
  }
}

/** The model with every comment and blank line taken out, for comparing two files. */
function withoutComments(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.replace(/\s*\/\/.*$/, "").trimEnd())
    .filter((line) => line.trim().length > 0);
}

function commentsOf(source: string): string[] {
  return source
    .split("\n")
    .map((line) => /\/\/(.*)$/.exec(line)?.[1]?.trim() ?? "")
    .filter((line) => line.length > 0);
}
