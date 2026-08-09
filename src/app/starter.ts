/** What a first time visitor sees, chosen to show embedding, references and @at at once. */
export const STARTER = `// A model reads like a sample document.
// Embedding is a nested {} and draws as a box inside a box.
// A reference is ref(other) and draws as an arrow.

users {
  _id: objectId,
  email: string @unique,
  createdAt: timestamp,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}

order {
  _id: objectId,
  total: decimal,
  placedAt: timestamp @index,
  items: [{
    sku: string,
    qty: int
  }]
}

item @at(880, 60) {
  _id: objectId,
  sku: string @unique,
  name: string
}
`;
