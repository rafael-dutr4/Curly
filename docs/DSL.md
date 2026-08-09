# The Curly language

A Curly model is a text file. It reads like a sample document, with types where
the values would be.

```
users @at(120, 40) {
  _id: objectId,
  email: string @unique,
  createdAt: timestamp,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}
```

The file is the source of truth. The diagram is a view of it, and editing the
diagram patches the text, so comments and formatting survive.

## Collections

A collection is a name followed by a block. The name is what a `ref` points at,
so it has to be unique in the file.

```
order {
  _id: objectId,
  total: decimal
}
```

Fields are separated by commas. A trailing comma is allowed, and an empty block
is allowed.

## Types

Scalars:

| Type | Meaning |
| --- | --- |
| `string` | text |
| `int` | 32 bit whole number |
| `long` | 64 bit whole number |
| `double` | floating point |
| `decimal` | exact decimal, for money |
| `bool` | true or false |
| `date` | a day |
| `timestamp` | a point in time |
| `objectId` | a MongoDB key |
| `uuid` | a UUID |
| `binary` | bytes |
| `any` | anything, no constraint |

Two modifiers can be written after any type, and they can be combined:

```
avatar: string?      optional
tags: string[]       an array
notes: string?[]     an array of optional strings
seen: string[]?      an optional array of strings
```

## Embedding and referencing

These two are the whole point of the language, and choosing between them is
document modelling.

**Embed** with a nested block. The document is stored inside its parent and is
read with it.

```
users {
  profile: {
    name: string,
    avatar: string?
  }
}
```

**Reference** with `ref(name)`. Only the key is stored, and reading the target
is a second query.

```
users {
  orders: ref(order)[]
}
```

An array of embedded documents can be written either way round. These mean the
same thing:

```
items: [{ sku: string, qty: int }]
items: { sku: string, qty: int }[]
```

Rough guidance: embed what is always read with the parent, is owned by it, and
is bounded in size. Reference what has a life of its own, is shared, or grows
without limit. A document has a 16MB ceiling in MongoDB, and an array that only
ever grows is the usual way to reach it.

## Annotations

On a field:

| Annotation | Meaning |
| --- | --- |
| `@unique` | the value is unique across the collection |
| `@index` | the field is indexed |
| `@default(v)` | default value |
| `@enum(a, b)` | the allowed values |
| `@count(n)` | how many elements this array is expected to hold |

```
state: string @enum(draft, published) @default("draft")
```

On a collection:

| Annotation | Meaning |
| --- | --- |
| `@at(x, y)` | where the box sits in the diagram |

`@at` is written by dragging a box, not usually by hand. A collection without
one is placed automatically.

`@count` is what lets the linter say anything useful about size. Without it an
array has no expected length, so nothing can tell a list of three addresses
from a list of three million events:

```
lines: [{ sku: string, qty: int }] @count(20)
```

An annotation Curly does not know is a warning rather than an error, so a file
written by a newer version still opens.

## What the linter checks

The compiler tells you the model is spelled correctly. The linter tells you it
is a good idea. The interesting failures of a document model are all legal
syntax, so these are the ones worth knowing about.

| Rule | Says |
| --- | --- |
| `unbounded-array` | an array of documents or references has no `@count`, so nothing stops it growing past 16MB |
| `large-document` | a document is estimated over 1MB and heading for the limit |
| `document-too-large` | the estimate is already over 16MB, so it cannot be written at all |
| `fan-out` | an array holds hundreds of references, and the link probably belongs on the other collection |
| `deep-nesting` | embedding is more than four levels deep, which is hard to query |
| `missing-key` | a collection has no `_id`, so a reference to it has to assume one |
| `redundant-index` | `@unique` already indexes the field, so `@index` adds nothing |

Sizes are estimates. A string has no length in the model, so it is assumed to
be 32 bytes, and an array with no `@count` is assumed to hold ten. The point is
to tell a 400 byte document from a 40MB one, and an estimate does that.

Nothing here blocks anything. A note is advice, a warning is advice with more
urgency, and both leave the model exactly as you wrote it.

## Comments

`//` to the end of the line. Comments survive every edit made through the
diagram, so they are a good place to record why a shape was chosen.

```
// Embedded because a post is always read with its comments.
comments: [{ body: string, at: timestamp }]
```

## Errors

Nothing stops at the first mistake. A file with errors still draws whatever was
understood, and each problem is reported with the line it is on:

```
users {
  email string,          -> expected ':' after the field name 'email'
  org: ref(oragnization) -> no collection named 'oragnization', did you mean 'organization'?
  tags: strng[]          -> unknown type 'strng', did you mean 'string'?
}
```

## Reserved

A top level `@name { ... }` form parses and is ignored with a warning. It is
reserved for declaring access patterns:

```
@access "user with their last 10 orders" { }
```

Nothing uses it yet. It exists in the grammar now so that adding it later does
not break files written today.

## Grammar

```
file       := entry*
entry      := collection | directive
collection := ident annotation* block
directive  := "@" ident arg* block
block      := "{" (field ("," field)*)? ","? "}"
field      := ident ":" type annotation*
type       := (scalar | block | ref | arrayOf) postfix*
arrayOf    := "[" type "]"
ref        := "ref" "(" ident ")"
postfix    := "?" | "[]"
annotation := "@" ident ("(" arg ("," arg)* ")")?
comment    := "//" .* end-of-line
```
