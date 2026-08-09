import { compile } from "../lang/compile.ts";

// Entry point. The pipeline is wired here as each stage lands:
//   source text -> lexer -> parser -> resolve -> layout -> render
//
// Only the front end exists so far, so this reports what it understood.

const STARTER = `users @at(120, 40) {
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
`;

const source = document.getElementById("source") as HTMLTextAreaElement | null;
const diagnostics = document.getElementById("diagnostics");

function render(text: string): void {
  const compilation = compile(text);

  if (diagnostics) {
    diagnostics.replaceChildren(
      ...compilation.diagnostics.map((d) => {
        const item = document.createElement("li");
        item.textContent = `${d.severity} line ${d.span.line}: ${d.message}`;
        return item;
      }),
    );
  }

  const brand = document.getElementById("brand");
  if (brand) {
    const names = compilation.model.collections.map((c) => c.name).join(", ");
    brand.textContent = names ? `Curly: ${names}` : "Curly";
  }
}

if (source) {
  source.value = STARTER;
  source.addEventListener("input", () => render(source.value));
  render(source.value);
}
