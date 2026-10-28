import { describe, expect, it } from "vitest";

import { isClosedTicketRatingReply, parseEvaluationScore } from "@/lib/evaluation-score";

describe("parseEvaluationScore (espelho do backend)", () => {
  it("aceita a resposta que é o número", () => {
    expect(parseEvaluationScore("5", 5)).toBe(5);
    expect(parseEvaluationScore(" 5 ", 5)).toBe(5);
    expect(parseEvaluationScore("5.", 5)).toBe(5);
    expect(parseEvaluationScore("5!", 5)).toBe(5);
    expect(parseEvaluationScore("5 ⭐", 5)).toBe(5);
    expect(parseEvaluationScore("0", 5)).toBe(0);
    expect(parseEvaluationScore(4, 5)).toBe(4);
  });

  it("aceita keycap e o 10 em keycap", () => {
    expect(parseEvaluationScore("5️⃣", 5)).toBe(5);
    expect(parseEvaluationScore("\u{1F51F}", 10)).toBe(10);
  });

  it("aceita a linha do menu copiada", () => {
    expect(parseEvaluationScore("5 - Incrível", 5)).toBe(5);
    expect(parseEvaluationScore("3 – Muito Bom", 5)).toBe(3);
  });

  it("recusa texto que só começa com número", () => {
    expect(parseEvaluationScore("5 minutos que já te passo", 5)).toBeNull();
    expect(parseEvaluationScore("2 unidades", 5)).toBeNull();
    expect(parseEvaluationScore("5 - nota 4", 5)).toBeNull();
    expect(parseEvaluationScore("ok", 5)).toBeNull();
    expect(parseEvaluationScore("", 5)).toBeNull();
    expect(parseEvaluationScore(null, 5)).toBeNull();
  });

  it("respeita a escala da empresa", () => {
    expect(parseEvaluationScore("7", 5)).toBeNull();
    expect(parseEvaluationScore("7", 10)).toBe(7);
    expect(parseEvaluationScore("7", "10")).toBe(7);
    expect(parseEvaluationScore("5", undefined)).toBe(5);
    expect(parseEvaluationScore("6", undefined)).toBeNull();
  });
});

describe("isClosedTicketRatingReply", () => {
  it("é a nota do cliente num atendimento fechado", () => {
    expect(isClosedTicketRatingReply({ fromMe: false, body: "5", ticket: { status: "closed" } }, "5")).toBe(true);
  });

  it("texto do cliente no fechado continua notificando", () => {
    expect(isClosedTicketRatingReply({ fromMe: false, body: "ainda não resolveu", ticket: { status: "closed" } }, "5")).toBe(false);
  });

  it("nota em atendimento aberto continua notificando", () => {
    expect(isClosedTicketRatingReply({ fromMe: false, body: "5", ticket: { status: "open" } }, "5")).toBe(false);
    expect(isClosedTicketRatingReply({ fromMe: false, body: "5", ticket: { status: "pending" } }, "5")).toBe(false);
  });

  it("mensagem nossa ou sem ticket aninhado não entra", () => {
    expect(isClosedTicketRatingReply({ fromMe: true, body: "5", ticket: { status: "closed" } }, "5")).toBe(false);
    expect(isClosedTicketRatingReply({ fromMe: false, body: "5" }, "5")).toBe(false);
    expect(isClosedTicketRatingReply({ fromMe: false, body: "5", ticket: null }, "5")).toBe(false);
  });
});
