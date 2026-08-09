# Curly Agent Guide

## Mission

Curly is a document database modeller that runs in the browser. A model is a text file that reads like a sample document; the diagram is an editable view of that file.

This project exists as much for the learning as for the product. Explain the mechanism when you build it, and prefer the approach that teaches more when two options cost about the same.

## Non-negotiable rules

- **No dependencies.** TypeScript is the only `devDependency` and there are no runtime dependencies. Do not add a framework, a bundler, a test framework, a parser generator, a layout engine or a virtual DOM. If something looks like it needs one, write the small version by hand.
- **The text file is the only source of truth.** Never keep a mutable model object that the UI edits. A UI gesture produces `TextEdit[]`, the patches are applied to the source, and the source is reparsed.
- **Never regenerate the model file.** Edits are surgical patches against spans. Comments, blank lines and the user's formatting must survive every operation.
- **The parser never throws.** It returns `{ ast, diagnostics }`. A broken file still renders whatever parsed.
- **Every token and AST node carries a span.** Nothing may drop span information.
- **Determinism.** Layout, edit operations and the sample generator are pure functions. No `Date.now()` and no `Math.random()` anywhere in `src/`.

## Repository map

```
src/lang/     the compiler front end
  token.ts        token kinds and the Span type
  lexer.ts        text -> tokens, comments preserved
  ast.ts          AST node types
  parser.ts       recursive descent with panic mode recovery
  diagnostic.ts   severity, message, span
  model.ts        the resolved model types
  resolve.ts      AST -> Model, symbol table and semantic checks
src/edit/     text patching
  textedit.ts     TextEdit, apply back to front, overlap check
  ops.ts          the edit operations
  format.ts       indentation and comma style for inserted text
src/layout/   pure geometry, no DOM
  measure.ts      monospace width arithmetic
  layout.ts       box sizing recursion and longest path layering
src/lint/     advice about the model, not about the syntax
  size.ts         BSON size estimation from the model
  lint.ts         the rules
src/render/   the DOM lives here and nowhere else
  svg.ts          geometry -> SVG with data-span attributes
  theme.ts        sizes and colors
  interact.ts     hit testing, drag, inline input overlay
  menu.ts         the context menu
  complete.ts     type completions and the validity check
src/export/
  jsonschema.ts   Model -> JSON Schema and MongoDB $jsonSchema
  samples.ts      Model -> example documents
  prng.ts         xorshift32
  image.ts        the diagram as a standalone SVG, and as a PNG
src/app/
  document.ts     the source string, undo stack, reparse, change events
  main.ts         wiring and debounce
  editor.ts       the numbered, highlighted text pane and the findings list
  highlight.ts    tokens -> coloured HTML, from the lexer
  storage.ts      File System Access API with a download fallback
  tooltip.ts      one tooltip element, driven by data-tip
```

Everything before `src/render/` is pure and testable in Node. Keep it that way: no `document`, no `window` and no measurement APIs outside `src/render/` and `src/app/`.

## Toolchain

Node runs the TypeScript sources directly by stripping types, so tests need no build step. `tsc` compiles to `dist/` for the browser and rewrites the `.ts` import extensions to `.js`.

Relative imports in `src/` must be written with the `.ts` extension (`import { lex } from "./lexer.ts"`). This is what lets the same file run under Node and compile for the browser.

```bash
npm run check    # tsc --noEmit
npm test         # node --test tests/*.test.ts
npm run build    # tsc -> dist/
npm run serve    # http://localhost:8000
```

## Tests

One test file per module in `tests/`, using `node:test` and `node:assert`. Golden file tests for the exporters, the layout geometry and every edit operation. `tests/fixtures/invalid/` holds broken models that must produce diagnostics with correct spans and must never throw.

The round trip test is the one that matters: apply a sequence of edit operations to an example, then assert that every original comment is still present, that the reparsed model is what the operations intended, and that running the sequence twice is byte identical.

## Commits

Conventional Commits, scoped to the module: `feat(lexer):`, `fix(layout):`, `docs:`, `test(parser):`, `build:`, `refactor:`, `chore:`.

Subject in the imperative. **Never add a `Co-Authored-By` trailer or a generated-with footer.**

One commit per coherent step, not one per milestone.

**Every commit that adds behavior explains it in the body, with a worked example.** The history is meant to be readable as the story of how the thing was built, so a body says what the technique is and shows it on real input:

```
feat(parser): parse the model grammar with panic mode recovery

Postfix modifiers are a loop, not recursion. Each ? or [] wraps what has
been built so far, so no grammar rule is needed per combination:

    string?[]    ->  Array(Optional(Scalar string))
    ref(order)[] ->  Array(Ref order)
```

Indent examples by four spaces so they survive `git log` without a code fence. The same rule applies to the code itself: comments explain the mechanism and why it was chosen, not what the next line does.

##### References

- `README.md`: what Curly is and how to run it.
- `docs/DSL.md`: the language reference.
