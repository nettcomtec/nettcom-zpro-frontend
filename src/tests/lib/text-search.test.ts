import { describe, it, expect } from "vitest";
import { privateChatSearchTokens, splitFoldedMatches } from "@/lib/text-search";

const marked = (text: string, tokens: string[]) =>
  splitFoldedMatches(text, tokens).filter((p) => p.match).map((p) => p.value);

describe("privateChatSearchTokens", () => {
  it("separa por espaço, descarta palavras de 1 letra e limita a 5", () => {
    expect(privateChatSearchTokens("  a bb  ccc d eeeee ff gg hh ")).toEqual(["bb", "ccc", "eeeee", "ff", "gg"]);
  });

  it("termo só com palavras curtas não busca", () => {
    expect(privateChatSearchTokens("a b")).toEqual([]);
    expect(privateChatSearchTokens("   ")).toEqual([]);
  });
});

describe("splitFoldedMatches", () => {
  it("marca a palavra ignorando acento e caixa, devolvendo o texto original", () => {
    expect(marked("A Reunião de segunda", ["reuniao"])).toEqual(["Reunião"]);
  });

  it("marca todas as ocorrências de cada palavra", () => {
    expect(marked("ok, Ok e OK", ["ok"])).toEqual(["ok", "Ok", "OK"]);
    expect(marked("contrato do cliente", ["contrato", "cliente"])).toEqual(["contrato", "cliente"]);
  });

  it("junta os pedaços sem perder nenhum caractere", () => {
    const text = "Pedido 123 do São João 😀 confirmado";
    const parts = splitFoldedMatches(text, ["sao", "joao"]);
    expect(parts.map((p) => p.value).join("")).toBe(text);
    expect(parts.filter((p) => p.match).map((p) => p.value)).toEqual(["São", "João"]);
  });

  it("sem palavra encontrada devolve o texto inteiro sem marca", () => {
    expect(splitFoldedMatches("nada aqui", ["xyz"])).toEqual([{ value: "nada aqui", match: false }]);
    expect(splitFoldedMatches("nada aqui", [])).toEqual([{ value: "nada aqui", match: false }]);
  });
});
