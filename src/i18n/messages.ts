/**
 * Every word the interface says, in both languages, in one table.
 *
 * The table is keyed by message and then by locale, rather than one object per
 * language, because that is the arrangement a missing translation cannot
 * survive: a key with only one entry does not typecheck, so English and
 * Portuguese can never drift apart by forgetting a line.
 *
 *     "menu.editType": { en: "Edit type", "pt-BR": "Editar tipo" }
 *
 * Placeholders are named and written in braces, so a translation may move them
 * around, which positional `%s` would not allow:
 *
 *     translate("pt-BR", "finding.line", { line: 3, message: "..." })
 *       ->  "linha 3: ..."
 *
 * This module is pure. It knows nothing about the DOM, about what the current
 * language is, or about how it was chosen.
 */

export const LOCALES = ["en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

/** What one message says in each language. */
export type Translations = Readonly<Record<Locale, string>>;

export const MESSAGES = {
  // The toolbar.
  "project.aria": {
    en: "Project name",
    "pt-BR": "Nome do projeto",
  },
  "project.tip": {
    en: "The name of this model. Exports and saved files are named after it.",
    "pt-BR": "O nome deste modelo. As exportações e os arquivos salvos recebem este nome.",
  },
  "toolbar.open": { en: "Open", "pt-BR": "Abrir" },
  "toolbar.open.tip": {
    en: "Open a .curly model from your computer",
    "pt-BR": "Abra um modelo .curly do seu computador",
  },
  "toolbar.save": { en: "Save", "pt-BR": "Salvar" },
  "toolbar.save.tip": {
    en: "Save the model back to its file, or choose where to put it",
    "pt-BR": "Salve o modelo de volta no arquivo dele, ou escolha onde guardá-lo",
  },
  "toolbar.example": { en: "Load example", "pt-BR": "Carregar exemplo" },
  "toolbar.example.tip": {
    en: "Replace the model with one of the worked examples",
    "pt-BR": "Substitua o modelo por um dos exemplos comentados",
  },
  // "Source" is the name of the pane in both languages, by request.
  "toolbar.source": { en: "Source", "pt-BR": "Source" },
  "toolbar.source.tip": {
    en: "Show the model as text and edit it directly",
    "pt-BR": "Mostre o modelo como texto e edite-o diretamente",
  },
  "toolbar.schema": { en: "JSON Schema", "pt-BR": "JSON Schema" },
  "toolbar.schema.tip": {
    en: "Download one JSON Schema per collection, with required fields, enums and defaults",
    "pt-BR": "Baixe um JSON Schema por coleção, com campos obrigatórios, enums e padrões",
  },
  "toolbar.validator": { en: "Mongo validator", "pt-BR": "Validador Mongo" },
  "toolbar.validator.tip": {
    en: "Download MongoDB $jsonSchema validators, ready for createCollection",
    "pt-BR": "Baixe validadores $jsonSchema do MongoDB, prontos para o createCollection",
  },
  "toolbar.png": { en: "PNG", "pt-BR": "PNG" },
  "toolbar.png.tip": {
    en: "Download the whole diagram as a PNG, at twice the size so the text stays sharp",
    "pt-BR": "Baixe o diagrama inteiro como PNG, no dobro do tamanho para o texto ficar nítido",
  },
  "toolbar.samples": { en: "Samples", "pt-BR": "Amostras" },
  "toolbar.samples.tip": {
    en: "Download one example document per collection, to see the shape you would actually query",
    "pt-BR": "Baixe um documento de amostra por coleção, para ver o formato que você consultaria de verdade",
  },
  "source.aria": { en: "Model source", "pt-BR": "Texto do modelo" },

  // The theme button says where it goes, not where it is.
  "theme.light": { en: "Light", "pt-BR": "Claro" },
  "theme.dark": { en: "Dark", "pt-BR": "Escuro" },
  "theme.tip": {
    en: "Switch to the {theme} theme",
    "pt-BR": "Mude para o tema {theme}",
  },
  "theme.name.light": { en: "light", "pt-BR": "claro" },
  "theme.name.dark": { en: "dark", "pt-BR": "escuro" },

  /**
   * The language button, like the theme button, is labelled with the language
   * it switches to. Reading the table under the current locale is exactly what
   * gives that: in English it says PT-BR, in Portuguese it says EN.
   */
  "language.toggle": { en: "PT-BR", "pt-BR": "EN" },
  "language.tip": {
    en: "Switch the interface to Brazilian Portuguese",
    "pt-BR": "Mude a interface para o inglês",
  },

  // Exports.
  "export.blocked": {
    en: "Fix the errors first. {explanation}",
    "pt-BR": "Corrija os erros primeiro. {explanation}",
  },
  "export.label": { en: "export", "pt-BR": "exportação" },
  "export.pngFailed": {
    en: "the diagram could not be exported as a PNG",
    "pt-BR": "não foi possível exportar o diagrama como PNG",
  },

  // Dialogs.
  "discard.title": { en: "Discard your changes?", "pt-BR": "Descartar suas alterações?" },
  "discard.detail": {
    en: "You have edits that are not saved to a file. Loading {what} replaces them, and this cannot be undone.",
    "pt-BR":
      "Você tem edições que não foram salvas em um arquivo. Carregar {what} substitui tudo, e isso não pode ser desfeito.",
  },
  "discard.what.model": { en: "another model", "pt-BR": "outro modelo" },
  "discard.what.example": { en: "an example", "pt-BR": "um exemplo" },
  "discard.keep": { en: "Keep editing", "pt-BR": "Continuar editando" },
  "discard.confirm": { en: "Discard and continue", "pt-BR": "Descartar e continuar" },
  "examples.title": { en: "Load an example", "pt-BR": "Carregue um exemplo" },
  "examples.detail": {
    en: "Each one is a small model with its reasoning written in the comments.",
    "pt-BR": "Cada um é um modelo pequeno, com o raciocínio escrito nos comentários.",
  },
  "dialog.cancel": { en: "Cancel", "pt-BR": "Cancelar" },

  // The worked examples.
  "example.blog.name": { en: "Blog", "pt-BR": "Blog" },
  "example.blog.description": {
    en: "Comments embedded in the post, because a post is read with them.",
    "pt-BR": "Comentários embutidos no post, porque um post é lido junto com eles.",
  },
  "example.shop.name": { en: "Shop", "pt-BR": "Loja" },
  "example.shop.description": {
    en: "An order references its customer but copies what was bought.",
    "pt-BR": "Um pedido referencia o cliente, mas copia o que foi comprado.",
  },
  "example.sensors.name": { en: "Sensors", "pt-BR": "Sensores" },
  "example.sensors.description": {
    en: "Time series in buckets, with the totals stored rather than recounted.",
    "pt-BR": "Séries temporais em baldes, com os totais guardados em vez de recontados.",
  },
  "example.library.name": { en: "Library", "pt-BR": "Biblioteca" },
  "example.library.description": {
    en: "One collection holding several shapes, and a subset of recent loans.",
    "pt-BR": "Uma coleção com vários formatos, e um subconjunto dos empréstimos recentes.",
  },

  // The findings list.
  "finding.line": { en: "line {line}: {message}", "pt-BR": "linha {line}: {message}" },
  "finding.fix.tip": {
    en: "Apply this change to the model",
    "pt-BR": "Aplique esta mudança ao modelo",
  },
  "severity.error": { en: "error", "pt-BR": "erro" },
  "severity.warning": { en: "warning", "pt-BR": "aviso" },
  "severity.note": { en: "note", "pt-BR": "nota" },

  // The context menu.
  "menu.renameField": { en: "Rename “{name}”", "pt-BR": "Renomear “{name}”" },
  "menu.editType": { en: "Edit type", "pt-BR": "Editar tipo" },
  "menu.makeRequired": { en: "Make required", "pt-BR": "Tornar obrigatório" },
  "menu.makeOptional": { en: "Make optional", "pt-BR": "Tornar opcional" },
  "menu.makeSingle": { en: "Make single", "pt-BR": "Tornar simples" },
  "menu.makeArray": { en: "Make an array", "pt-BR": "Transformar em lista" },
  "menu.addUnique": { en: "Add @unique", "pt-BR": "Adicionar @unique" },
  "menu.removeUnique": { en: "Remove @unique", "pt-BR": "Remover @unique" },
  "menu.addIndex": { en: "Add @index", "pt-BR": "Adicionar @index" },
  "menu.removeIndex": { en: "Remove @index", "pt-BR": "Remover @index" },
  "menu.moveUp": { en: "Move up", "pt-BR": "Mover para cima" },
  "menu.moveDown": { en: "Move down", "pt-BR": "Mover para baixo" },
  "menu.deleteField": { en: "Delete field", "pt-BR": "Excluir campo" },
  "menu.renameCollection": { en: "Rename “{name}”", "pt-BR": "Renomear “{name}”" },
  "menu.addField": { en: "Add field", "pt-BR": "Adicionar campo" },
  "menu.unpin": { en: "Unpin from this position", "pt-BR": "Desafixar desta posição" },
  "menu.deleteCollection": { en: "Delete collection", "pt-BR": "Excluir coleção" },
  "menu.newCollection": { en: "New collection here", "pt-BR": "Nova coleção aqui" },

  // The file pickers.
  "files.pickerDescription": { en: "Curly model", "pt-BR": "Modelo Curly" },

  // What the lexer found in the characters.
  "lex.unterminatedString": {
    en: "unterminated string, the closing quote is missing",
    "pt-BR": "string não terminada, falta a aspa de fechamento",
  },
  "lex.unexpectedCharacter": {
    en: "unexpected character {char}",
    "pt-BR": "caractere inesperado {char}",
  },

  // What the parser was looking for. `what` and `found` are messages too, so
  // a translation may put them wherever its grammar wants them.
  "parse.expected": {
    en: "expected {what}, found {found}",
    "pt-BR": "esperava {what}, encontrei {found}",
  },
  "parse.want.annotationArgument": { en: "an annotation argument", "pt-BR": "um argumento de anotação" },
  "parse.want.annotationName": { en: "an annotation name after '@'", "pt-BR": "um nome de anotação depois de '@'" },
  "parse.want.directiveName": { en: "a directive name after '@'", "pt-BR": "um nome de diretiva depois de '@'" },
  "parse.want.refTarget": {
    en: "the name of the referenced collection",
    "pt-BR": "o nome da coleção referenciada",
  },
  "parse.want.type": { en: "a type", "pt-BR": "um tipo" },
  "parse.want.fieldName": { en: "a field name", "pt-BR": "um nome de campo" },
  "parse.want.collectionName": { en: "a collection name", "pt-BR": "um nome de coleção" },
  "parse.want.closeAnnotationArgs": {
    en: "')' to close the annotation arguments",
    "pt-BR": "')' para fechar os argumentos da anotação",
  },
  "parse.want.openRef": { en: "'(' after ref", "pt-BR": "'(' depois de ref" },
  "parse.want.closeRef": { en: "')' to close ref", "pt-BR": "')' para fechar o ref" },
  "parse.want.closeArray": { en: "']' to close the array", "pt-BR": "']' para fechar a lista" },
  "parse.want.colonAfterField": {
    en: "':' after the field name '{name}'",
    "pt-BR": "':' depois do nome do campo '{name}'",
  },
  "parse.want.openBrace": { en: "'{brace}'", "pt-BR": "'{brace}'" },
  "parse.want.closeBlock": { en: "'{brace}' to close the block", "pt-BR": "'{brace}' para fechar o bloco" },
  "parse.want.commaOrClose": {
    en: "',' or '{brace}' after the field '{name}'",
    "pt-BR": "',' ou '{brace}' depois do campo '{name}'",
  },

  // What a token is, when an error has to name one.
  "token.name": { en: "a name", "pt-BR": "um nome" },
  "token.number": { en: "a number", "pt-BR": "um número" },
  "token.string": { en: "a string", "pt-BR": "uma string" },
  "token.comment": { en: "a comment", "pt-BR": "um comentário" },
  "token.symbol": { en: "'{symbol}'", "pt-BR": "'{symbol}'" },
  "token.unexpected": { en: "an unexpected character", "pt-BR": "um caractere inesperado" },
  "token.eof": { en: "the end of the file", "pt-BR": "o fim do arquivo" },

  // What the resolver made of the names and the annotations.
  "resolve.reservedDirective": {
    en: "'@{name}' is reserved for a future version and is ignored for now",
    "pt-BR": "'@{name}' está reservado para uma versão futura e por enquanto é ignorado",
  },
  "resolve.duplicateCollection": {
    en: "the collection '{name}' is already declared on line {line}",
    "pt-BR": "a coleção '{name}' já foi declarada na linha {line}",
  },
  "resolve.duplicateField": {
    en: "the field '{name}' is already declared on line {line}",
    "pt-BR": "o campo '{name}' já foi declarado na linha {line}",
  },
  "resolve.unknownType": { en: "unknown type '{name}'", "pt-BR": "tipo desconhecido '{name}'" },
  "resolve.unknownTypeDidYouMean": {
    en: "unknown type '{name}', did you mean '{suggestion}'?",
    "pt-BR": "tipo desconhecido '{name}', você quis dizer '{suggestion}'?",
  },
  "resolve.fix.useType": { en: "Use '{suggestion}'", "pt-BR": "Usar '{suggestion}'" },
  "resolve.noCollection": {
    en: "no collection named '{name}'",
    "pt-BR": "não existe coleção chamada '{name}'",
  },
  "resolve.noCollectionDidYouMean": {
    en: "no collection named '{name}', did you mean '{suggestion}'?",
    "pt-BR": "não existe coleção chamada '{name}', você quis dizer '{suggestion}'?",
  },
  "resolve.fix.pointAt": { en: "Point at '{suggestion}'", "pt-BR": "Apontar para '{suggestion}'" },
  "resolve.unknownAnnotation": {
    en: "unknown annotation '@{name}', it is ignored",
    "pt-BR": "anotação desconhecida '@{name}', ela é ignorada",
  },
  "resolve.unknownCollectionAnnotation": {
    en: "unknown annotation '@{name}' on a collection, it is ignored",
    "pt-BR": "anotação desconhecida '@{name}' em uma coleção, ela é ignorada",
  },
  "resolve.fix.removeIt": { en: "Remove it", "pt-BR": "Remover" },
  "resolve.defaultOneValue": {
    en: "@default takes exactly one value",
    "pt-BR": "@default recebe exatamente um valor",
  },
  "resolve.enumNeedsValues": {
    en: "@enum needs at least one value",
    "pt-BR": "@enum precisa de pelo menos um valor",
  },
  "resolve.countOneNumber": {
    en: "@count takes one number, the expected size of the array",
    "pt-BR": "@count recebe um número, o tamanho esperado da lista",
  },
  "resolve.atTwoNumbers": {
    en: "@at takes two numbers, as @at(x, y)",
    "pt-BR": "@at recebe dois números, como @at(x, y)",
  },

  // What the linter has to say about the model.
  "lint.missingKey": {
    en: "'{collection}' has no _id, so a reference to it has to assume one",
    "pt-BR": "'{collection}' não tem _id, então uma referência a ela precisa supor um",
  },
  "lint.fix.addId": { en: "Add _id", "pt-BR": "Adicionar _id" },
  "lint.deepNesting": {
    en: "'{field}' is {depth} levels deep, which is hard to query and usually wants its own collection",
    "pt-BR": "'{field}' está {depth} níveis abaixo, o que é difícil de consultar e normalmente pede uma coleção própria",
  },
  "lint.redundantIndex": {
    en: "@unique already indexes '{field}', so @index adds nothing",
    "pt-BR": "@unique já indexa '{field}', então @index não acrescenta nada",
  },
  "lint.fix.removeIndex": { en: "Remove @index", "pt-BR": "Remover @index" },
  "lint.unboundedArray": {
    en: "'{collection}.{field}' is an array of {what} with no expected size, so nothing stops it growing past the 16MB document limit. Add @count(n) to say how big it gets.",
    "pt-BR":
      "'{collection}.{field}' é uma lista de {what} sem tamanho esperado, então nada impede que ela cresça além do limite de 16MB por documento. Use @count(n) para dizer o tamanho que ela chega.",
  },
  "lint.what.documents": { en: "documents", "pt-BR": "documentos" },
  "lint.what.references": { en: "references", "pt-BR": "referências" },
  "lint.fix.addCount": { en: "Add @count(100)", "pt-BR": "Adicionar @count(100)" },
  "lint.fanOut": {
    en: "'{collection}.{field}' holds about {count} references. Storing the link on '{target}' instead keeps this document small and the query indexed.",
    "pt-BR":
      "'{collection}.{field}' guarda cerca de {count} referências. Guardar o vínculo em '{target}' mantém este documento pequeno e a consulta indexada.",
  },
  "lint.documentTooLarge": {
    en: "a '{collection}' document is about {size}{qualifier}, over the 16MB limit. It cannot be written as one document.",
    "pt-BR":
      "um documento de '{collection}' tem cerca de {size}{qualifier}, acima do limite de 16MB. Ele não cabe em um único documento.",
  },
  "lint.largeDocument": {
    en: "a '{collection}' document is about {size}{qualifier}, which is heading for the 16MB limit",
    "pt-BR": "um documento de '{collection}' tem cerca de {size}{qualifier}, caminhando para o limite de 16MB",
  },
  "lint.assumed": {
    en: " (assuming 10 elements where @count is missing)",
    "pt-BR": " (supondo 10 elementos onde falta @count)",
  },

  // Sizes, which are read inside the sentences above.
  "size.bytes": { en: "{amount} bytes", "pt-BR": "{amount} bytes" },
  "size.kilobytes": { en: "{amount} KB", "pt-BR": "{amount} KB" },
  "size.megabytes": { en: "{amount} MB", "pt-BR": "{amount} MB" },
} as const satisfies Record<string, Translations>;

export type MessageKey = keyof typeof MESSAGES;

/**
 * A parameter may itself be a message, and is translated with the sentence it
 * lands in. That is what lets the parser build
 *
 *     expected {what}, found {found}
 *
 * out of pieces that each have their own translation, without the parser ever
 * knowing which language it is going to be read in.
 */
export type Params = Readonly<Record<string, string | number | Message>>;

/**
 * Something to say, decided where it is found and worded where it is shown.
 *
 * The compiler and the linter are pure and know nothing about locales, so they
 * return one of these instead of a sentence. `src/app/editor.ts` turns it into
 * words at the moment it paints the list, which is also why switching the
 * language re-words findings that were produced long before.
 */
export interface Message {
  readonly key: MessageKey;
  readonly params?: Params;
}

export function message(key: MessageKey, params?: Params): Message {
  return params ? { key, params } : { key };
}

export function say(locale: Locale, message: Message): string {
  return translate(locale, message.key, message.params);
}

/**
 * A missing key is returned as itself rather than thrown for. A wrong word on
 * screen is a bug worth seeing; a blank page because a button asked for a key
 * that was renamed is a worse one.
 */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const text = (MESSAGES as Record<string, Translations | undefined>)[key]?.[locale];
  if (text === undefined) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "object" ? say(locale, value) : String(value);
  });
}

/** `pt`, `pt-BR` and `pt-br` all mean Portuguese; anything else means English. */
export function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    if (tag.toLowerCase().startsWith("pt")) return "pt-BR";
    if (tag.toLowerCase().startsWith("en")) return "en";
  }
  return "en";
}

/** Guards the keys that arrive as strings from the markup. */
export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(MESSAGES, value);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "pt-BR" : "en";
}
