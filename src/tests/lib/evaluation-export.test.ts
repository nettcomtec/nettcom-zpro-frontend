import { describe, expect, it } from "vitest";

import {
  EXPORT_MAX_PAGES,
  EXPORT_MAX_ROWS,
  EXPORT_PAGE_SIZE,
  buildEvaluationExportRows,
  evaluationStatus,
  isNewEvaluationsBackend,
} from "@/lib/evaluation-export";
import type { TicketEvaluation } from "@/services/evaluations";

const base = (over: Partial<TicketEvaluation> = {}): TicketEvaluation => ({
  id: 1,
  ticketId: 10,
  evaluation: "5",
  attempts: 2,
  type: "native",
  externalUrl: null,
  createdAt: "2026-10-20T14:30:00.000Z",
  updatedAt: "2026-10-20T15:00:00.000Z",
  user: { id: 3, name: "Ana" },
  ticket: {
    id: 10,
    protocol: "20261020143000000010",
    createdAt: "2026-10-20T14:00:00.000Z",
    channel: "whatsapp",
    queue: { id: 2, queue: "Suporte" },
    whatsapp: { id: 7, name: "Comercial", type: "baileys" },
    contact: { id: 5, name: "Cliente", number: "5511999998888", username: null, bsuid: null },
  },
  ...over,
});

describe("constantes do export", () => {
  it("teto de 10.000 linhas em páginas de 500", () => {
    expect(EXPORT_PAGE_SIZE).toBe(500);
    expect(EXPORT_MAX_PAGES).toBe(20);
    expect(EXPORT_MAX_ROWS).toBe(10000);
  });
});

describe("evaluationStatus", () => {
  it("nota com espaços é respondida", () => {
    expect(evaluationStatus(base({ evaluation: " 5 " }))).toBe("answered");
  });

  it("nota 0 é respondida (não é pendente)", () => {
    expect(evaluationStatus(base({ evaluation: "0", attempts: 0 }))).toBe("answered");
  });

  it("pergunta com tentativas abaixo de 2 aguarda resposta", () => {
    expect(evaluationStatus(base({ evaluation: "Como foi o atendimento?", attempts: 0 }))).toBe("pending");
  });

  it("pergunta com 2 tentativas ficou sem resposta", () => {
    expect(evaluationStatus(base({ evaluation: "Como foi o atendimento?", attempts: 2 }))).toBe("no_response");
  });

  it("link externo", () => {
    expect(evaluationStatus(base({ type: "external", evaluation: "external" }))).toBe("external");
  });

  it("nota numérica antiga (tipo number) é respondida", () => {
    expect(evaluationStatus(base({ evaluation: 4 }))).toBe("answered");
  });
});

describe("buildEvaluationExportRows", () => {
  it("monta a linha completa da respondida", () => {
    const [row] = buildEvaluationExportRows([base()], { canSeeNumber: true });
    expect(row.ticketId).toBe(10);
    expect(row.protocol).toBe("20261020143000000010");
    expect(row.contactName).toBe("Cliente");
    expect(row.contactIdentity).toBe("5511999998888");
    expect(row.agent).toBe("Ana");
    expect(row.score).toBe(5);
    expect(row.status).toBe("answered");
    expect(row.sentAt?.toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(row.answeredAt?.toISOString()).toBe("2026-10-20T15:00:00.000Z");
    expect(row.queue).toBe("Suporte");
    expect(row.channel).toBe("Comercial");
  });

  it("nota acima da escala sai inteira", () => {
    const [row] = buildEvaluationExportRows([base({ evaluation: "10" })], { canSeeNumber: true });
    expect(row.score).toBe(10);
  });

  it("pendente sai sem nota e sem data de resposta", () => {
    const [row] = buildEvaluationExportRows([base({ evaluation: "Como foi?", attempts: 1 })], { canSeeNumber: true });
    expect(row.status).toBe("pending");
    expect(row.score).toBeNull();
    expect(row.answeredAt).toBeNull();
  });

  it("sem a permissão de exportar contatos não leva o número", () => {
    const [row] = buildEvaluationExportRows([base()], { canSeeNumber: false });
    expect(row.contactIdentity).toBe("");
    expect(row.contactName).toBe("Cliente");
  });

  it("identidade sem número usa o @usuário ou o BSUID, como a tela", () => {
    const ticket = base().ticket!;
    const [byUser] = buildEvaluationExportRows(
      [base({ ticket: { ...ticket, contact: { id: 5, name: "X", number: "", username: "cliente", bsuid: null } } })],
      { canSeeNumber: true }
    );
    expect(byUser.contactIdentity).toBe("cliente");
    const [byBsuid] = buildEvaluationExportRows(
      [base({ ticket: { ...ticket, contact: { id: 5, name: "X", number: "", username: null, bsuid: "BR.123" } } })],
      { canSeeNumber: true }
    );
    expect(byBsuid.contactIdentity).toBe("BSUID:BR.123");
  });

  it("canal sem conexão sai vazio (nunca o código interno)", () => {
    const ticket = base().ticket!;
    const [row] = buildEvaluationExportRows([base({ ticket: { ...ticket, whatsapp: null } })], { canSeeNumber: true });
    expect(row.channel).toBe("");
  });

  it("servidor antigo: protocolo, fila e canal vazios", () => {
    const [row] = buildEvaluationExportRows(
      [base({ ticket: { id: 10, contact: { id: 5, name: "Cliente", number: "5511999998888" } } })],
      { canSeeNumber: true }
    );
    expect(row.protocol).toBe("");
    expect(row.queue).toBe("");
    expect(row.channel).toBe("");
  });

  it("sem atendimento e sem agente as colunas ficam vazias", () => {
    const [row] = buildEvaluationExportRows([base({ ticket: undefined, user: undefined })], { canSeeNumber: true });
    expect(row.contactName).toBe("");
    expect(row.contactIdentity).toBe("");
    expect(row.agent).toBe("");
  });

  it("link externo leva a URL e fica sem nota", () => {
    const [row] = buildEvaluationExportRows(
      [base({ type: "external", evaluation: "external", externalUrl: "https://exemplo.com/p?t=10" })],
      { canSeeNumber: true }
    );
    expect(row.status).toBe("external");
    expect(row.score).toBeNull();
    expect(row.externalUrl).toBe("https://exemplo.com/p?t=10");
  });
});

describe("isNewEvaluationsBackend", () => {
  it("com a chave userFilter é o servidor novo (mesmo nula)", () => {
    expect(isNewEvaluationsBackend({ data: [], total: 0, userFilter: null })).toBe(true);
    expect(isNewEvaluationsBackend({ data: [], total: 0, userFilter: 3 })).toBe(true);
  });

  it("sem a chave é o servidor antigo", () => {
    expect(isNewEvaluationsBackend({ data: [], total: 0 })).toBe(false);
    expect(isNewEvaluationsBackend([])).toBe(false);
    expect(isNewEvaluationsBackend(null)).toBe(false);
  });
});
