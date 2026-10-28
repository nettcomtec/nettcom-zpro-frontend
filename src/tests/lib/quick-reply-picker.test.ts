import { describe, expect, it } from "vitest";

import {
  applyQuickReplyAtToken,
  findSlashToken,
  insertQuickReplyAt,
  isTextQuickReply,
  quickReplyVarWarnings,
  rankQuickReplies,
  templateQuickReplyRefs,
  visibleQuickReplies,
} from "@/lib/quick-reply-picker";
import type { FastReply } from "@/services/fast-reply";

const row = (over: Partial<FastReply>): FastReply => ({
  id: 1,
  key: "oi",
  message: "Olá",
  isPublic: true,
  userId: 1,
  tenantId: 1,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("visibleQuickReplies", () => {
  it("mostra públicas, as próprias e as sem dono", () => {
    const rows = [
      row({ id: 1, isPublic: true, userId: 9 }),
      row({ id: 2, isPublic: false, userId: 5 }),
      row({ id: 3, isPublic: false, userId: 9 }),
      row({ id: 4, isPublic: false, userId: null as unknown as number }),
    ];
    expect(visibleQuickReplies(rows, 5).map((r) => r.id)).toEqual([1, 2, 4]);
    expect(visibleQuickReplies(rows, "5").map((r) => r.id)).toEqual([1, 2, 4]);
  });
});

describe("isTextQuickReply", () => {
  it("aceita só texto com conteúdo", () => {
    expect(isTextQuickReply(row({}))).toBe(true);
    expect(isTextQuickReply(row({ messageType: "text" }))).toBe(true);
    expect(isTextQuickReply(row({ message: "  " }))).toBe(false);
    expect(isTextQuickReply(row({ message: "null" }))).toBe(false);
    expect(isTextQuickReply(row({ messageType: "buttons" }))).toBe(false);
    expect(isTextQuickReply(row({ messageType: "list" }))).toBe(false);
    expect(isTextQuickReply(row({ messageType: "template" }))).toBe(false);
    expect(isTextQuickReply(row({ messageType: "location" }))).toBe(false);
  });
});

describe("findSlashToken", () => {
  it("acha o atalho no início do campo e depois de espaço ou quebra de linha", () => {
    expect(findSlashToken("/oi", 3)).toEqual({ start: 0, end: 3, query: "oi" });
    expect(findSlashToken("bom dia /pre", 12)).toEqual({ start: 8, end: 12, query: "pre" });
    expect(findSlashToken("link\n/x", 7)).toEqual({ start: 5, end: 7, query: "x" });
    expect(findSlashToken("/", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  it("usa a palavra inteira quando o cursor está no meio", () => {
    expect(findSlashToken("a /abcd b", 4)).toEqual({ start: 2, end: 7, query: "abcd" });
  });

  it("ignora link, e/ou e cursor antes do /", () => {
    expect(findSlashToken("https://x.test/abc", 18)).toBeNull();
    expect(findSlashToken("e/ou", 4)).toBeNull();
    expect(findSlashToken("a /oi", 2)).toBeNull();
    expect(findSlashToken("", 0)).toBeNull();
    expect(findSlashToken("oi", 2)).toBeNull();
  });
});

describe("rankQuickReplies", () => {
  const rows = [row({ id: 1, key: "/bomdia" }), row({ id: 2, key: "dia" }), row({ id: 3, key: "Diaria" }), row({ id: 4, key: "x" })];

  it("põe 'começa com' antes de 'contém', sem maiúscula", () => {
    expect(rankQuickReplies(rows, "DIA").items.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("busca vazia devolve todas e corta no limite", () => {
    expect(rankQuickReplies(rows, "").items).toHaveLength(4);
    const many = Array.from({ length: 60 }, (_, i) => row({ id: i, key: `k${i}` }));
    const res = rankQuickReplies(many, "", 50);
    expect(res.items).toHaveLength(50);
    expect(res.more).toBe(true);
    expect(rankQuickReplies(rows, "zz")).toEqual({ items: [], more: false });
  });
});

describe("applyQuickReplyAtToken", () => {
  it("troca só o /atalho e preserva o resto (link do convite)", () => {
    const text = "Entre: https://t.me/bot?start=tg_x /oi";
    const token = findSlashToken(text, text.length)!;
    expect(applyQuickReplyAtToken(text, token, "Olá {{name}}")).toEqual({
      text: "Entre: https://t.me/bot?start=tg_x Olá {{name}}",
      caret: text.length - 3 + "Olá {{name}}".length,
    });
    const mid = "a /oi b";
    expect(applyQuickReplyAtToken(mid, findSlashToken(mid, 5)!, "X")).toEqual({ text: "a X b", caret: 3 });
  });
});

describe("insertQuickReplyAt", () => {
  it("insere na posição do cursor com espaço de separação", () => {
    expect(insertQuickReplyAt("", null, "Olá")).toEqual({ text: "Olá", caret: 3 });
    expect(insertQuickReplyAt("link", null, "Olá")).toEqual({ text: "link Olá", caret: 8 });
    expect(insertQuickReplyAt("ab", 1, "X")).toEqual({ text: "a X b", caret: 3 });
    expect(insertQuickReplyAt("a b", 2, "X")).toEqual({ text: "a X b", caret: 3 });
    expect(insertQuickReplyAt("a\n", 2, "X")).toEqual({ text: "a\nX", caret: 3 });
    expect(insertQuickReplyAt("ab", 99, "X")).toEqual({ text: "ab X", caret: 4 });
  });
});

describe("templateQuickReplyRefs", () => {
  it("lê só as rápidas de template com nome", () => {
    const rows = [
      row({ id: 1, key: "/tpl", messageType: "template", templateJson: '{"name":"boas_vindas","language":"pt_BR"}' }),
      row({ id: 2, key: "x", messageType: "template", templateJson: "{quebrado" }),
      row({ id: 3, key: "t", messageType: "text" }),
    ];
    expect(templateQuickReplyRefs(rows)).toEqual([{ id: 1, key: "tpl", ref: { name: "boas_vindas", language: "pt_BR" } }]);
  });
});

describe("quickReplyVarWarnings", () => {
  const all = "Oi {{name}} {firstName}, sou {{user}} ({userEmail}). Protocolo {{protocol}} #{ticketId} {{greeting}} {{name}}";

  it("avisa cada espécie só quando o dado não vai existir", () => {
    expect(quickReplyVarWarnings(all, { contactKnown: false, ownerKnown: false, ticketVarsEmpty: true })).toEqual([
      { kind: "contactData", vars: ["{{name}}", "{firstName}"] },
      { kind: "userEmpty", vars: ["{{user}}", "{userEmail}"] },
      { kind: "ticketEmpty", vars: ["{{protocol}}", "{ticketId}"] },
    ]);
    expect(quickReplyVarWarnings(all, { contactKnown: true, ownerKnown: true, ticketVarsEmpty: false })).toEqual([]);
  });

  it("ignora texto sem variável, maiúscula diferente e variável sem aviso", () => {
    expect(quickReplyVarWarnings("Bom dia", { contactKnown: false, ownerKnown: false, ticketVarsEmpty: true })).toEqual([]);
    expect(quickReplyVarWarnings("{{Name}} {{greeting}} {{phoneNumber}}", { contactKnown: false, ownerKnown: false, ticketVarsEmpty: true })).toEqual([]);
  });
});
