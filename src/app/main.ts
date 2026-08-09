// Entry point. The pipeline is wired here as each stage lands:
//   source text -> lexer -> parser -> resolve -> layout -> render
//
// For now this only proves the module graph loads in the browser.

const brand = document.getElementById("brand");
if (brand) {
  brand.textContent = "Curly";
}

export {};
