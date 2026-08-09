import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isLocale,
  isMessageKey,
  LOCALES,
  matchLocale,
  message,
  MESSAGES,
  type MessageKey,
  otherLocale,
  say,
  translate,
} from "../src/i18n/messages.ts";
import { compile } from "../src/lang/compile.ts";
import { lint } from "../src/lint/lint.ts";
import { locale, onLocaleChange, setLocale, t } from "../src/i18n/locale.ts";

/**
 * The table cannot lose a language, because a message with one entry does not
 * typecheck. What a type cannot catch is an empty string, a placeholder that
 * was translated along with the words, and a key in the markup that no longer
 * exists. That is what these are for.
 */

const KEYS = Object.keys(MESSAGES) as MessageKey[];

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

test("every message says something in every language", () => {
  for (const key of KEYS) {
    for (const one of LOCALES) {
      assert.ok(translate(one, key).trim().length > 0, `${key} is empty in ${one}`);
    }
  }
});

test("a translation keeps the placeholders of the English it translates", () => {
  for (const key of KEYS) {
    const expected = placeholders(MESSAGES[key].en);
    for (const one of LOCALES) {
      assert.deepEqual(placeholders(MESSAGES[key][one]), expected, `${key} in ${one}`);
    }
  }
});

test("placeholders are filled by name, wherever the translation puts them", () => {
  assert.equal(translate("en", "finding.line", { line: 3, message: "no _id" }), "line 3: no _id");
  assert.equal(translate("pt-BR", "finding.line", { line: 3, message: "sem _id" }), "linha 3: sem _id");
});

test("a placeholder with nothing to fill it is left alone rather than blanked", () => {
  assert.equal(translate("en", "export.blocked", {}), "Fix the errors first. {explanation}");
});

test("a message inside a message is worded in the same language", () => {
  const expected = message("parse.expected", {
    what: message("parse.want.colonAfterField", { name: "email" }),
    found: message("token.symbol", { symbol: "}" }),
  });

  assert.equal(say("en", expected), "expected ':' after the field name 'email', found '}'");
  assert.equal(say("pt-BR", expected), "esperava ':' depois do nome do campo 'email', encontrei '}'");
});

test("what the linter says is worded at the end, not where it is found", () => {
  const finding = lint(compile("post { _id: objectId }\nusers { _id: objectId, posts: ref(post)[] }").model)[0]!;

  assert.match(say("en", finding.message), /is an array of references with no expected size/);
  assert.match(say("pt-BR", finding.message), /é uma lista de referências sem tamanho esperado/);
  assert.equal(say("pt-BR", finding.fix!.title), "Adicionar @count(100)");
});

test("an unknown key shows itself instead of throwing", () => {
  assert.equal(translate("en", "nope.not.here" as MessageKey, undefined), "nope.not.here");
});

test("the language button offers the other language", () => {
  assert.equal(translate("en", "language.toggle"), "PT-BR");
  assert.equal(translate("pt-BR", "language.toggle"), "EN");
  assert.equal(otherLocale("en"), "pt-BR");
  assert.equal(otherLocale("pt-BR"), "en");
});

test("the browser's languages pick a side", () => {
  assert.equal(matchLocale(["pt-BR", "en-US"]), "pt-BR");
  assert.equal(matchLocale(["pt"]), "pt-BR");
  assert.equal(matchLocale(["PT-br"]), "pt-BR");
  assert.equal(matchLocale(["en-GB", "pt-BR"]), "en");
  assert.equal(matchLocale(["fr", "de"]), "en");
  assert.equal(matchLocale([]), "en");
});

test("a stored locale is only trusted when it is one we have", () => {
  assert.ok(isLocale("pt-BR"));
  assert.ok(!isLocale("pt-PT"));
  assert.ok(!isLocale(null));
});

test("switching notifies once, and only when the language actually changes", () => {
  const before = locale();
  let calls = 0;
  const off = onLocaleChange(() => (calls += 1));

  setLocale("pt-BR");
  assert.equal(locale(), "pt-BR");
  assert.equal(t("toolbar.open"), "Abrir");

  setLocale("pt-BR");
  assert.equal(calls, 1, "setting the same language again is not a change");

  setLocale("en");
  assert.equal(t("toolbar.open"), "Open");
  assert.equal(calls, 2);

  off();
  setLocale("pt-BR");
  assert.equal(calls, 2, "an unsubscribed listener stops hearing");

  setLocale(before);
});

test("every key the markup asks for is in the table", () => {
  const html = readFileSync("index.html", "utf8");
  const asked = [...html.matchAll(/data-i18n(?:-tip|-aria)?="([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(asked.length > 0, "the markup carries no keys at all");
  for (const key of asked) {
    assert.ok(isMessageKey(key), `index.html asks for ${key}, which is not a message`);
  }
});

test("every button in the toolbar has words that can be translated", () => {
  const html = readFileSync("index.html", "utf8");
  for (const [button] of html.matchAll(/<button[^>]*>/g)) {
    // The theme and language buttons are labelled from code, because what they
    // say depends on which theme or language is current.
    if (/id="toggle-(theme|locale)"/.test(button)) continue;
    assert.match(button, /data-i18n="/, `a toolbar button has untranslated text: ${button}`);
  }
});
