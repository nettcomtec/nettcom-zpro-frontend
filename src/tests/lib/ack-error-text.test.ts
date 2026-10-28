import { describe, it, expect } from "vitest";
import pt from "@/i18n/locales/pt.json";
import { describeAckError } from "@/lib/ack-error-text";

const bubble = (pt as unknown as { messageBubble: Record<string, string> }).messageBubble;
const t = (key: string) => bubble[key] ?? key;

describe("describeAckError", () => {
  it("traduz os códigos da Meta do relatório de envio em massa", () => {
    expect(describeAckError({ code: 131049, title: "This message was not delivered" }, t)).toEqual({
      code: "131049",
      showCode: true,
      desc: bubble.ackError131049,
    });
    expect(describeAckError({ code: "131026" }, t).desc).toBe(bubble.ackError131026);
  });

  it("código + subcódigo com texto próprio vence o do código", () => {
    expect(describeAckError({ code: 100, subcode: 33 }, t).desc).toBe(bubble.ackError100_33);
    expect(describeAckError({ code: 100, subcode: 99 }, t).desc).toBe(bubble.ackError100);
  });

  it("código desconhecido usa título e detalhe do provedor", () => {
    expect(describeAckError({ code: 130472, title: "User's number is part of an experiment", details: "x" }, t)).toEqual({
      code: "130472",
      showCode: true,
      desc: "User's number is part of an experiment — x",
    });
  });

  it("código nosso (slug) não aparece entre parênteses", () => {
    const r = describeAckError({ code: "TELEGRAM_UNREACHABLE" }, t);
    expect(r.showCode).toBe(false);
    expect(r.desc).toBe(bubble.ackErrorTELEGRAM_UNREACHABLE);
  });

  it("sem erro gravado devolve tudo vazio", () => {
    expect(describeAckError(null, t)).toEqual({ code: "", showCode: false, desc: "" });
    expect(describeAckError(undefined, t)).toEqual({ code: "", showCode: false, desc: "" });
  });
});
