import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import { toJsonSchema, toMongoValidator } from "../src/export/jsonschema.ts";
import { sampleDocument, sampleDocuments } from "../src/export/samples.ts";
import { createRandom, hash, randomFor } from "../src/export/prng.ts";

const MODEL = `
users {
  _id: objectId,
  email: string @unique,
  age: int?,
  active: bool,
  profile: {
    name: string,
    avatar: string?
  },
  tags: string[],
  orders: ref(order)[]
}

order {
  _id: objectId,
  total: decimal,
  state: string @enum(draft, paid) @default("draft")
}
`;

function schema(source: string, name: string): Record<string, unknown> {
  return toJsonSchema(compile(source).model)[name] as Record<string, unknown>;
}

function properties(source: string, name: string): Record<string, Record<string, unknown>> {
  return schema(source, name)["properties"] as Record<string, Record<string, unknown>>;
}

// --- the generator --------------------------------------------------------

test("the generator is deterministic for a seed", () => {
  const a = createRandom(12345);
  const b = createRandom(12345);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test("different seeds give different sequences", () => {
  assert.notEqual(createRandom(1).next(), createRandom(2).next());
});

test("the state never collapses to zero, which would freeze the sequence", () => {
  const random = createRandom(0);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i += 1) seen.add(random.next());
  assert.ok(seen.size > 400, `only ${seen.size} distinct values`);
});

test("values stay unsigned, so the sequence does not drift negative", () => {
  const random = createRandom(0xdeadbeef);
  for (let i = 0; i < 1000; i += 1) {
    const value = random.next();
    assert.ok(value >= 0 && value <= 0xffffffff, `out of range: ${value}`);
  }
});

test("int and fraction stay inside their bounds", () => {
  const random = createRandom(7);
  for (let i = 0; i < 500; i += 1) {
    assert.ok(random.int(10) >= 0 && random.int(10) < 10);
    const f = random.fraction();
    assert.ok(f >= 0 && f < 1);
  }
  assert.equal(createRandom(7).int(0), 0, "a zero bound does not divide by zero");
});

test("the same path always seeds the same generator", () => {
  assert.equal(hash("users.email"), hash("users.email"));
  assert.notEqual(hash("users.email"), hash("users.name"));
  assert.equal(randomFor("users.email").next(), randomFor("users.email").next());
});

// --- json schema ----------------------------------------------------------

test("each collection becomes its own schema", () => {
  assert.deepEqual(Object.keys(toJsonSchema(compile(MODEL).model)), ["users", "order"]);
  assert.equal(schema(MODEL, "users")["title"], "users");
});

test("scalars map to JSON Schema types", () => {
  const source = `t {
    a: string, b: int, c: long, d: double, e: decimal, f: bool,
    g: date, h: timestamp, i: objectId, j: uuid, k: binary, l: any
  }`;
  const p = properties(source, "t");
  assert.deepEqual(p["a"], { type: "string" });
  assert.deepEqual(p["b"], { type: "integer" });
  assert.deepEqual(p["d"], { type: "number" });
  assert.deepEqual(p["f"], { type: "boolean" });
  assert.deepEqual(p["g"], { type: "string", format: "date" });
  assert.deepEqual(p["h"], { type: "string", format: "date-time" });
  assert.deepEqual(p["i"], { type: "string", pattern: "^[0-9a-fA-F]{24}$" });
  assert.deepEqual(p["j"], { type: "string", format: "uuid" });
  assert.deepEqual(p["l"], {}, "any is unconstrained");
});

test("a field without ? is required, and one with ? is not", () => {
  const required = schema(MODEL, "users")["required"] as string[];
  assert.ok(required.includes("email"));
  assert.ok(!required.includes("age"), "age is optional");
});

test("optionality does not change the value's own schema", () => {
  assert.deepEqual(properties(MODEL, "users")["age"], { type: "integer" });
});

test("an embedded document becomes a nested object with its own required list", () => {
  const profile = properties(MODEL, "users")["profile"]!;
  assert.equal(profile["type"], "object");
  assert.deepEqual(profile["required"], ["name"]);
  assert.equal(profile["additionalProperties"], false);
});

test("an array becomes items of the element schema", () => {
  assert.deepEqual(properties(MODEL, "users")["tags"], { type: "array", items: { type: "string" } });
});

test("a reference takes the type of the target's key, not the whole document", () => {
  const orders = properties(MODEL, "users")["orders"]!;
  assert.equal(orders["type"], "array");
  const items = orders["items"] as Record<string, unknown>;
  assert.equal(items["pattern"], "^[0-9a-fA-F]{24}$", "order._id is an objectId");
  assert.equal(items["description"], "references order");
});

test("@enum and @default reach the schema", () => {
  const state = properties(MODEL, "order")["state"]!;
  assert.deepEqual(state["enum"], ["draft", "paid"]);
  assert.equal(state["default"], "draft");
});

test("additionalProperties is closed", () => {
  assert.equal(schema(MODEL, "users")["additionalProperties"], false);
});

test("an unknown type is left unconstrained rather than guessed", () => {
  assert.deepEqual(properties("t { a: nope }", "t")["a"], {});
});

test("@at never reaches an export", () => {
  const exported = JSON.stringify(toJsonSchema(compile("users @at(10, 20) { a: int }").model));
  assert.ok(!exported.includes("at"), exported);
});

// --- mongo validator ------------------------------------------------------

test("the mongo dialect says bsonType and keeps the richer types", () => {
  const validator = toMongoValidator(compile(MODEL).model, "users") as Record<string, Record<string, unknown>>;
  const root = validator["$jsonSchema"]!;
  assert.equal(root["bsonType"], "object");
  const p = root["properties"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(p["_id"], { bsonType: "objectId" });
  assert.deepEqual(p["email"], { bsonType: "string" });
  assert.deepEqual(p["tags"], { bsonType: "array", items: { bsonType: "string" } });
});

test("bson keeps int and double apart, which json schema cannot", () => {
  const validator = toMongoValidator(compile("t { a: int, b: double }").model, "t") as Record<string, Record<string, unknown>>;
  const p = (validator["$jsonSchema"] as Record<string, unknown>)["properties"] as Record<string, Record<string, unknown>>;
  assert.equal(p["a"]!["bsonType"], "int");
  assert.equal(p["b"]!["bsonType"], "double");
});

test("a validator for a collection that is not there is null", () => {
  assert.equal(toMongoValidator(compile(MODEL).model, "nope"), null);
});

// --- samples --------------------------------------------------------------

test("a sample has a value for every field, optional ones included", () => {
  const users = sampleDocument(compile(MODEL).model, "users") as Record<string, unknown>;
  assert.deepEqual(Object.keys(users), ["_id", "email", "age", "active", "profile", "tags", "orders"]);
});

test("samples are byte identical across runs", () => {
  const first = JSON.stringify(sampleDocuments(compile(MODEL).model));
  const second = JSON.stringify(sampleDocuments(compile(MODEL).model));
  assert.equal(first, second);
});

test("values look like their type", () => {
  const users = sampleDocument(compile(MODEL).model, "users") as Record<string, unknown>;
  assert.match(String(users["_id"]), /^[0-9a-f]{24}$/);
  assert.match(String(users["email"]), /@example\.com$/, "an email shaped field gets an email");
  assert.equal(typeof users["age"], "number");
  assert.equal(typeof users["active"], "boolean");
  assert.ok(Array.isArray(users["tags"]));
});

test("an array gets several different elements, not one repeated", () => {
  const users = sampleDocument(compile(MODEL).model, "users") as Record<string, unknown>;
  const tags = users["tags"] as string[];
  assert.equal(tags.length, 3);
  assert.ok(new Set(tags).size > 1, `all elements identical: ${JSON.stringify(tags)}`);
});

test("a reference samples the target's key, it does not expand the document", () => {
  const users = sampleDocument(compile(MODEL).model, "users") as Record<string, unknown>;
  for (const value of users["orders"] as unknown[]) {
    assert.match(String(value), /^[0-9a-f]{24}$/);
  }
});

test("a collection that references itself terminates", () => {
  const model = compile("node { _id: objectId, parent: ref(node)? }").model;
  assert.doesNotThrow(() => sampleDocuments(model));
  const node = sampleDocument(model, "node") as Record<string, unknown>;
  assert.match(String(node["parent"]), /^[0-9a-f]{24}$/);
});

test("a default wins over a generated value, and an enum picks from its own values", () => {
  const order = sampleDocument(compile(MODEL).model, "order") as Record<string, unknown>;
  assert.equal(order["state"], "draft");

  const noDefault = sampleDocument(compile("t { s: string @enum(a, b, c) }").model, "t") as Record<string, unknown>;
  assert.ok(["a", "b", "c"].includes(String(noDefault["s"])));
});

test("adding a field does not change the values of the others", () => {
  const before = sampleDocument(compile("t { a: string, b: int }").model, "t") as Record<string, unknown>;
  const after = sampleDocument(compile("t { z: string, a: string, b: int }").model, "t") as Record<string, unknown>;
  assert.equal(before["a"], after["a"], "seeding by path, not by position");
  assert.equal(before["b"], after["b"]);
});

test("dates are fixed, because nothing here may read the clock", () => {
  const first = sampleDocument(compile("t { at: timestamp, on: date }").model, "t") as Record<string, string>;
  const second = sampleDocument(compile("t { at: timestamp, on: date }").model, "t") as Record<string, string>;
  assert.equal(first["at"], second["at"]);
  assert.match(String(first["at"]), /^\d{4}-\d{2}-\d{2}T/);
  assert.match(String(first["on"]), /^\d{4}-\d{2}-\d{2}$/);
});

test("exporting a broken model does not throw", () => {
  for (const source of ["users {", "users { a: ref(nope) }", "", "users { a: }"]) {
    const { model } = compile(source);
    assert.doesNotThrow(() => toJsonSchema(model), source);
    assert.doesNotThrow(() => sampleDocuments(model), source);
  }
});

// --- the two together -----------------------------------------------------

test("every generated sample satisfies its own schema", () => {
  // Checked with a small walker rather than a validator library, since the
  // repository has no dependencies. It covers what the exporter emits:
  // types, required keys, enums and additionalProperties.
  const { model } = compile(MODEL);
  const schemas = toJsonSchema(model);
  const samples = sampleDocuments(model);

  for (const [name, document] of Object.entries(samples)) {
    const problems = check(schemas[name]!, document, name);
    assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
  }
});

function check(schema: Record<string, unknown>, value: unknown, path: string): string[] {
  const problems: string[] = [];
  const type = schema["type"] as string | undefined;

  if (schema["enum"] && !(schema["enum"] as unknown[]).includes(value)) {
    problems.push(`${path} is not one of the enum values`);
  }

  if (type === "object") {
    if (typeof value !== "object" || value === null) return [`${path} should be an object`];
    const properties = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
    for (const key of (schema["required"] ?? []) as string[]) {
      if (!(key in (value as object))) problems.push(`${path}.${key} is required but missing`);
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childSchema = properties[key];
      if (!childSchema) {
        if (schema["additionalProperties"] === false) problems.push(`${path}.${key} is not allowed`);
        continue;
      }
      problems.push(...check(childSchema, child, `${path}.${key}`));
    }
    return problems;
  }

  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} should be an array`];
    const items = schema["items"] as Record<string, unknown> | undefined;
    if (items) value.forEach((element, i) => problems.push(...check(items, element, `${path}[${i}]`)));
    return problems;
  }

  if (type === "string") {
    if (typeof value !== "string") problems.push(`${path} should be a string`);
    else {
      const pattern = schema["pattern"] as string | undefined;
      if (pattern && !new RegExp(pattern).test(value)) problems.push(`${path} does not match ${pattern}`);
    }
  }
  if (type === "integer" && !Number.isInteger(value)) problems.push(`${path} should be an integer`);
  if (type === "number" && typeof value !== "number") problems.push(`${path} should be a number`);
  if (type === "boolean" && typeof value !== "boolean") problems.push(`${path} should be a boolean`);

  return problems;
}
