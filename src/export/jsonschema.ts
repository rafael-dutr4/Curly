import { baseFieldType, type FieldType, type Model, type ModelCollection, type ModelField } from "../lang/model.ts";

/**
 * A model becomes JSON Schema, and the same walk becomes a MongoDB
 * `$jsonSchema` validator.
 *
 * The two formats differ in almost nothing: Mongo says `bsonType` where JSON
 * Schema says `type`, and its vocabulary of types is richer because BSON
 * distinguishes an int from a double. Writing two walkers would mean two
 * places to forget a case, so there is one walker and a dialect.
 *
 * What the model knows and JSON Schema needs:
 *
 *   optional      a field without `?` goes in `required`
 *   embedded      a nested object with its own required list
 *   ref(x)        the type of x's `_id`, because that is what is stored
 *   @enum         enum
 *   @default      default
 */

export type Dialect = "json" | "bson";

type Schema = Record<string, unknown>;

const JSON_TYPES: Readonly<Record<string, Schema>> = {
  string: { type: "string" },
  int: { type: "integer" },
  long: { type: "integer" },
  double: { type: "number" },
  decimal: { type: "number" },
  bool: { type: "boolean" },
  date: { type: "string", format: "date" },
  timestamp: { type: "string", format: "date-time" },
  objectId: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
  uuid: { type: "string", format: "uuid" },
  binary: { type: "string", contentEncoding: "base64" },
  any: {},
};

const BSON_TYPES: Readonly<Record<string, Schema>> = {
  string: { bsonType: "string" },
  int: { bsonType: "int" },
  long: { bsonType: "long" },
  double: { bsonType: "double" },
  decimal: { bsonType: "decimal" },
  bool: { bsonType: "bool" },
  date: { bsonType: "date" },
  timestamp: { bsonType: "timestamp" },
  objectId: { bsonType: "objectId" },
  uuid: { bsonType: "binData" },
  binary: { bsonType: "binData" },
  any: {},
};

/** One JSON Schema per collection, keyed by name. */
export function toJsonSchema(model: Model): Record<string, Schema> {
  const out: Record<string, Schema> = {};
  for (const collection of model.collections) {
    out[collection.name] = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: collection.name,
      ...objectSchema(model, collection.fields, "json"),
    };
  }
  return out;
}

/** The `$jsonSchema` validator for one collection, ready for createCollection. */
export function toMongoValidator(model: Model, name: string): Schema | null {
  const collection = model.byName.get(name);
  if (!collection) return null;
  return { $jsonSchema: { title: collection.name, ...objectSchema(model, collection.fields, "bson") } };
}

/** Every validator at once, in the shape a setup script wants. */
export function toMongoValidators(model: Model): Record<string, Schema> {
  const out: Record<string, Schema> = {};
  for (const collection of model.collections) {
    const validator = toMongoValidator(model, collection.name);
    if (validator) out[collection.name] = validator;
  }
  return out;
}

function objectSchema(model: Model, fields: readonly ModelField[], dialect: Dialect): Schema {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = fieldSchema(model, field, dialect);
    // Optionality is the one thing carried by the type rather than by an
    // annotation, and it lands on the parent rather than on the property.
    if (field.type.kind !== "optional") required.push(field.name);
  }

  const schema: Schema =
    dialect === "bson" ? { bsonType: "object", properties } : { type: "object", properties };
  if (required.length > 0) schema["required"] = required;
  schema["additionalProperties"] = false;
  return schema;
}

function fieldSchema(model: Model, field: ModelField, dialect: Dialect): Schema {
  const schema = typeSchema(model, field.type, dialect);
  if (field.enumValues) schema["enum"] = [...field.enumValues];
  if (field.defaultValue !== null) schema["default"] = field.defaultValue;
  return schema;
}

function typeSchema(model: Model, type: FieldType, dialect: Dialect): Schema {
  switch (type.kind) {
    case "optional":
      // `?` says nothing about the value, only whether the key must be there.
      return typeSchema(model, type.inner, dialect);

    case "array": {
      const items = typeSchema(model, type.element, dialect);
      return dialect === "bson" ? { bsonType: "array", items } : { type: "array", items };
    }

    case "embedded":
      return objectSchema(model, type.fields, dialect);

    case "ref":
      // A reference stores the target's key, so it takes that key's type.
      return referenceSchema(model, type.target, dialect);

    case "scalar": {
      const table = dialect === "bson" ? BSON_TYPES : JSON_TYPES;
      // An unknown type is left unconstrained rather than guessed at. The
      // error is already reported; the export should not invent a meaning.
      return { ...(table[type.name] ?? {}) };
    }
  }
}

function referenceSchema(model: Model, target: string, dialect: Dialect): Schema {
  const collection = model.byName.get(target);
  const key = collection ? findKey(collection) : null;
  const schema = key ? typeSchema(model, key.type, dialect) : { ...(dialect === "bson" ? BSON_TYPES : JSON_TYPES)["objectId"]! };
  schema["description"] = `references ${target}`;
  return schema;
}

/** The field a reference points at: `_id` when it exists, otherwise the first one. */
export function findKey(collection: ModelCollection): ModelField | null {
  return collection.fields.find((f) => f.name === "_id") ?? collection.fields[0] ?? null;
}
