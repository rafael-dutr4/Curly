import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROJECT_NAME, nameFromFileName, toFileName } from "../src/app/project.ts";

test("the project name comes from the file name, without the extension", () => {
  assert.equal(nameFromFileName("blog.curly"), "blog");
  assert.equal(nameFromFileName("examples/ecommerce.curly"), "ecommerce");
  assert.equal(nameFromFileName("/home/rafa/models/shop.curly"), "shop");
});

test("only the last extension is dropped", () => {
  assert.equal(nameFromFileName("notes.v2.curly"), "notes.v2");
});

test("a file with no extension keeps its whole name", () => {
  assert.equal(nameFromFileName("scratch"), "scratch");
});

test("a dotfile is a name, not an extension", () => {
  assert.equal(nameFromFileName(".curly"), ".curly");
});

test("an empty name falls back to the default", () => {
  assert.equal(nameFromFileName(""), DEFAULT_PROJECT_NAME);
  assert.equal(nameFromFileName("   "), DEFAULT_PROJECT_NAME);
});

test("exports are named after the project", () => {
  assert.equal(toFileName("blog", ".samples.json"), "blog.samples.json");
  assert.equal(toFileName("blog", ".schema.json"), "blog.schema.json");
  assert.equal(toFileName("blog", ".curly"), "blog.curly");
});

test("a name typed by a person is made safe for a download", () => {
  // A slash would be read as a path, which is the one that actually matters.
  assert.equal(toFileName("my shop", ".samples.json"), "my-shop.samples.json");
  assert.equal(toFileName("a/b", ".curly"), "a-b.curly");
  assert.equal(toFileName('we"ird:name', ".curly"), "we-ird-name.curly");
  assert.equal(toFileName("a   b", ".curly"), "a-b.curly", "runs of separators collapse");
});

test("a name that is only punctuation falls back rather than producing a dotfile", () => {
  assert.equal(toFileName("///", ".samples.json"), `${DEFAULT_PROJECT_NAME}.samples.json`);
  assert.equal(toFileName("...", ".samples.json"), `${DEFAULT_PROJECT_NAME}.samples.json`);
  assert.equal(toFileName("", ".samples.json"), `${DEFAULT_PROJECT_NAME}.samples.json`);
});

test("dots, dashes and underscores inside a name survive", () => {
  assert.equal(toFileName("notes.v2", ".curly"), "notes.v2.curly");
  assert.equal(toFileName("my_model-2", ".curly"), "my_model-2.curly");
});

test("opening a file and exporting gives matching names", () => {
  const project = nameFromFileName("ecommerce.curly");
  assert.deepEqual(
    [".schema.json", ".validators.json", ".samples.json"].map((s) => toFileName(project, s)),
    ["ecommerce.schema.json", "ecommerce.validators.json", "ecommerce.samples.json"],
  );
});
