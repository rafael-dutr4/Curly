# Curly

A modelling tool for document based (non relational) databases that runs in the browser.

**[Open Curly](https://rafael-dutr4.github.io/Curly/)**

For relational databases there is brModelo, a desktop program that is no longer maintained. For document databases the tools that exist (Hackolade, Moon Modeler) are paid desktop programs. Curly is the free browser alternative.

## The idea

Relational modelling has one right answer: normalize. Document modelling does not. The shape of a document comes from the queries the application makes, so the same domain gives different models depending on how it is read.

A Curly model is a text file that reads like a sample document:

```
users @at(120, 40) {
  _id: objectId,
  email: string @unique,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}

order @at(480, 40) {
  _id: objectId,
  total: decimal,
  items: [{
    sku: string,
    qty: int
  }]
}
```

Embedding is a nested `{}` and drawn as a box inside a box. A reference is `ref(other)` and drawn as an arrow. Choosing between the two is what document modelling is.

The text file is the source of truth. The diagram is editable, and every edit is applied as a patch to the text, so comments and formatting survive and the model stays diffable in Git.

## What it does

- Writes the model as text, and draws it as a diagram.
- Edits either side: click a name or a type on the diagram to change it, drag a box to place it, drag a handle onto another collection to make it a reference.
- Reports every mistake with the line it is on, and keeps drawing whatever it understood.
- Exports JSON Schema, a MongoDB `$jsonSchema` validator, and sample documents.
- Opens and saves `.curly` files, and keeps the current buffer across a reload.

## Running it

```bash
npm install
npm run build
npm run serve
```

Then open `http://localhost:8000`.

During development, `npm run watch` recompiles on save.

## Tests

```bash
npm test
```

Tests run straight off the TypeScript sources, because Node strips the types. No build step is needed to run them.

## No dependencies

TypeScript is the only development dependency and there are no runtime dependencies. No framework, no bundler, no test framework. The browser loads the compiled ES modules directly.

## Deploy

Pushing to `master` builds and publishes to GitHub Pages. `dist/` is not committed, so the workflow compiles it: see `.github/workflows/pages.yml`.

##### References

- `docs/DSL.md`: the language reference.
- `examples/`: two models with the reasoning behind their shape written in comments.
- `AGENTS.md`: the contract for agents working on this repository.
