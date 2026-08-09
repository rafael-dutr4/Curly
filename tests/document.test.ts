import test from "node:test";
import assert from "node:assert/strict";

import { createDocument, type Change } from "../src/app/document.ts";
import * as ops from "../src/edit/ops.ts";

const MODEL = "users {\n  a: string\n}\n";

test("a new document exposes its source and compilation", () => {
  const document = createDocument(MODEL);
  assert.equal(document.source(), MODEL);
  assert.deepEqual(
    document.compilation().model.collections.map((c) => c.name),
    ["users"],
  );
});

test("setting the source recompiles it", () => {
  const document = createDocument(MODEL);
  document.set("order {\n  b: int\n}\n");
  assert.deepEqual(
    document.compilation().model.collections.map((c) => c.name),
    ["order"],
  );
});

test("setting the same text changes nothing and notifies nobody", () => {
  const document = createDocument(MODEL);
  let calls = 0;
  document.subscribe(() => (calls += 1));
  assert.equal(document.set(MODEL), false);
  assert.equal(calls, 0);
});

test("subscribers hear the origin of a change", () => {
  const document = createDocument(MODEL);
  const seen: string[] = [];
  document.subscribe((change: Change) => seen.push(change.origin));

  document.set("users {\n  ab: string\n}\n", "typing");
  document.run((s, m) => ops.addField(s, m, { collection: "users", path: [] }, "c", "int"));
  document.undo();

  assert.deepEqual(seen, ["typing", "gesture", "history"]);
});

test("unsubscribing stops the notifications", () => {
  const document = createDocument(MODEL);
  let calls = 0;
  const off = document.subscribe(() => (calls += 1));
  document.set("a {}\n");
  off();
  document.set("b {}\n");
  assert.equal(calls, 1);
});

// --- operations -----------------------------------------------------------

test("running an operation applies its patches", () => {
  const document = createDocument(MODEL);
  assert.equal(document.run((s, m) => ops.renameField(s, m, { collection: "users", path: ["a"] }, "b")), true);
  assert.equal(document.source(), "users {\n  b: string\n}\n");
});

test("an operation that produces no patches is not a change", () => {
  const document = createDocument(MODEL);
  assert.equal(document.run((s, m) => ops.renameField(s, m, { collection: "users", path: ["nope"] }, "b")), false);
  assert.equal(document.canUndo(), false);
});

// --- undo -----------------------------------------------------------------

test("a gesture is exactly one undo step", () => {
  const document = createDocument(MODEL);
  document.run((s, m) => ops.setPosition(s, m, "users", 10, 20));
  assert.ok(document.source().includes("@at(10, 20)"));

  assert.equal(document.undo(), true);
  assert.equal(document.source(), MODEL);
  assert.equal(document.canUndo(), false);
});

test("redo puts it back, and a new change clears the redo stack", () => {
  const document = createDocument(MODEL);
  document.run((s, m) => ops.setPosition(s, m, "users", 10, 20));
  document.undo();
  assert.equal(document.canRedo(), true);

  document.redo();
  assert.ok(document.source().includes("@at(10, 20)"));

  document.undo();
  document.set("something {}\n", "gesture");
  assert.equal(document.canRedo(), false, "a new change abandons the redone future");
});

test("undo and redo on an empty history are refused", () => {
  const document = createDocument(MODEL);
  assert.equal(document.undo(), false);
  assert.equal(document.redo(), false);
});

test("typing on one line folds into a single undo step", () => {
  const document = createDocument("users {\n  a: string\n}\n");
  // Character by character, as a textarea would report it.
  document.set("users {\n  ab: string\n}\n", "typing");
  document.set("users {\n  abc: string\n}\n", "typing");
  document.set("users {\n  abcd: string\n}\n", "typing");

  document.undo();
  assert.equal(document.source(), "users {\n  a: string\n}\n", "one step returns to before the run");
  assert.equal(document.canUndo(), false);
});

test("typing a new line closes the run, so undo lands on line boundaries", () => {
  const document = createDocument("users {\n  a: string\n}\n");
  document.set("users {\n  ab: string\n}\n", "typing");
  document.set("users {\n  ab: string,\n\n}\n", "typing"); // adds a line
  document.set("users {\n  ab: string,\n  c\n}\n", "typing");

  // Three steps, because the newline closed the run that "ab" opened.
  document.undo();
  assert.equal(document.source(), "users {\n  ab: string,\n\n}\n", "back to before typing c");
  document.undo();
  assert.equal(document.source(), "users {\n  ab: string\n}\n", "back to before the newline");
  document.undo();
  assert.equal(document.source(), "users {\n  a: string\n}\n", "back to the start");
  assert.equal(document.canUndo(), false);
});

test("commit closes the run, so the next keystroke is a new step", () => {
  const document = createDocument("users {\n  a: string\n}\n");
  document.set("users {\n  ab: string\n}\n", "typing");
  document.commit();
  document.set("users {\n  abc: string\n}\n", "typing");

  document.undo();
  assert.equal(document.source(), "users {\n  ab: string\n}\n");
});

test("a gesture closes an open typing run", () => {
  const document = createDocument("users {\n  a: string\n}\n");
  document.set("users {\n  ab: string\n}\n", "typing");
  document.run((s, m) => ops.setPosition(s, m, "users", 5, 5));

  document.undo();
  assert.equal(document.source(), "users {\n  ab: string\n}\n", "the gesture undoes on its own");
  document.undo();
  assert.equal(document.source(), "users {\n  a: string\n}\n", "then the typing run");
});

test("typing after an undo does not resume the old run", () => {
  const document = createDocument("users {\n  a: string\n}\n");
  document.set("users {\n  ab: string\n}\n", "typing");
  document.undo();
  document.set("users {\n  ax: string\n}\n", "typing");

  document.undo();
  assert.equal(document.source(), "users {\n  a: string\n}\n");
});

test("history is bounded and drops the oldest states", () => {
  const document = createDocument("a0 {}\n");
  for (let i = 1; i <= 260; i += 1) document.set(`a${i} {}\n`, "gesture");

  let steps = 0;
  while (document.undo()) steps += 1;
  assert.equal(steps, 200);
  assert.ok(document.canUndo() === false);
});

test("undo works through a broken intermediate state", () => {
  const document = createDocument(MODEL);
  document.set("users {\n  a: \n}\n", "gesture");
  assert.ok(document.compilation().diagnostics.length > 0, "the broken state still compiles to diagnostics");
  document.undo();
  assert.equal(document.source(), MODEL);
  assert.deepEqual(document.compilation().diagnostics, []);
});
