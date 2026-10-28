import { describe, expect, it } from "vitest";

import { matchQuickReplyTemplate, parseQuickReplyTemplate } from "@/lib/quick-reply-template";

const tpl = (name: string, language: string) => ({ name, language });

describe("parseQuickReplyTemplate", () => {
  it("lê o templateJson gravado como texto pelo cadastro", () => {
    expect(parseQuickReplyTemplate('{"name":" boas_vindas ","language":"pt_BR"}')).toEqual({ name: "boas_vindas", language: "pt_BR" });
  });

  it("aceita objeto e idioma ausente", () => {
    expect(parseQuickReplyTemplate({ name: "boas_vindas" })).toEqual({ name: "boas_vindas", language: "" });
  });

  it("recusa sem nome, JSON quebrado e vazio", () => {
    expect(parseQuickReplyTemplate('{"name":"","language":"pt_BR"}')).toBeNull();
    expect(parseQuickReplyTemplate("{quebrado")).toBeNull();
    expect(parseQuickReplyTemplate(null)).toBeNull();
    expect(parseQuickReplyTemplate(undefined)).toBeNull();
    expect(parseQuickReplyTemplate("null")).toBeNull();
    expect(parseQuickReplyTemplate({ name: 42 })).toBeNull();
  });
});

describe("matchQuickReplyTemplate", () => {
  const list = [tpl("boas_vindas", "pt_BR"), tpl("boas_vindas", "en_US"), tpl("cobranca", "pt_BR")];

  it("acha pelo nome e idioma, sem diferenciar maiúscula nem hífen no idioma", () => {
    expect(matchQuickReplyTemplate(list, { name: "Boas_Vindas", language: "pt-br" })).toEqual({ kind: "found", template: list[0] });
    expect(matchQuickReplyTemplate(list, { name: "boas_vindas", language: "en_US" })).toEqual({ kind: "found", template: list[1] });
  });

  it("hífen no NOME não vira sublinhado (a lista é filtrada pelo nome real)", () => {
    expect(matchQuickReplyTemplate(list, { name: "boas-vindas", language: "pt_BR" })).toEqual({ kind: "notFound" });
  });

  it("idioma em branco com um só idioma = acha", () => {
    expect(matchQuickReplyTemplate(list, { name: "cobranca", language: "" })).toEqual({ kind: "found", template: list[2] });
  });

  it("idioma em branco com mais de um idioma = atendente escolhe, pelo nome real", () => {
    expect(matchQuickReplyTemplate(list, { name: "BOAS_VINDAS", language: "" })).toEqual({ kind: "pickLanguage", name: "boas_vindas" });
  });

  it("nunca troca o idioma cadastrado por outro", () => {
    expect(matchQuickReplyTemplate(list, { name: "Cobranca", language: "en_US" })).toEqual({ kind: "languageMissing", name: "cobranca" });
  });

  it("nome inexistente na conexão", () => {
    expect(matchQuickReplyTemplate(list, { name: "outro", language: "pt_BR" })).toEqual({ kind: "notFound" });
    expect(matchQuickReplyTemplate([], { name: "cobranca", language: "" })).toEqual({ kind: "notFound" });
  });
});
