import { describe, expect, it } from "vitest";

import { canUserSeeTicket, isTicketInBotFlow, toNumberArray } from "@/lib/can-user-see-ticket";
import type {
  TicketVisibilityData,
  UserVisibilityData,
  VisibilityConfig,
} from "@/lib/can-user-see-ticket";

/**
 * Cenario espelhado do CHECKLIST_VALIDACAO_SINO_RBAC.md (bloco 0.1/0.2):
 * 2 filas (A/B), 2 canais (1/2) e os perfis do roteiro de validacao.
 */
const FILA_A = 1;
const FILA_B = 2;
const CANAL_1 = 10;
const CANAL_2 = 20;

const ADMIN1: UserVisibilityData = { userId: 100, profile: "admin" };
const SUPER1: UserVisibilityData = {
  userId: 201,
  profile: "super",
  queues: [{ id: FILA_A }],
  whatsappAllowed: [{ id: CANAL_1 }],
  configs: { supervisorViewDept: "enabled" },
};
/** Supervisor com a config ligada e SEM nenhuma fila — o caso que quase virou lockout. */
const SUPER2: UserVisibilityData = {
  userId: 202,
  profile: "super",
  queues: [],
  configs: { supervisorViewDept: "enabled" },
};
const USER1: UserVisibilityData = {
  userId: 301,
  profile: "user",
  queues: [{ id: FILA_A }],
  whatsappAllowed: [{ id: CANAL_1 }],
};
const USER2: UserVisibilityData = {
  userId: 302,
  profile: "user",
  queues: [{ id: FILA_B }],
  whatsappAllowed: [{ id: CANAL_2 }],
};
const CUSTOM1: UserVisibilityData = {
  userId: 401,
  profile: "custom",
  queues: [{ id: FILA_A }],
  whatsappAllowed: [{ id: CANAL_1 }],
  customProfile: { customPermissions: { tickets_view_all: true } },
};
const CUSTOM2: UserVisibilityData = {
  userId: 402,
  profile: "custom",
  queues: [{ id: FILA_A }],
  whatsappAllowed: [{ id: CANAL_1 }],
  customProfile: { customPermissions: { tickets_view_all: false } },
};

/**
 * Flags do tenant no estado inicial do checklist (0.3). `nullTickets: "disabled"` e o
 * default REAL da coluna e precisa ser explicito: a chave ausente e permissiva no gate.
 */
const TENANT_PADRAO: VisibilityConfig = {
  supervisorAdmin: "disabled",
  nullTickets: "disabled",
  notViewTicketsChatBot: false,
  notViewAssignedTickets: false,
  inboundByQueueOnly: "disabled",
  supervisorChannelScoped: "disabled",
};

function ticket(over: Partial<TicketVisibilityData> = {}): TicketVisibilityData {
  return {
    id: 9000,
    userId: null,
    queueId: FILA_A,
    whatsappId: CANAL_1,
    isGroup: false,
    groupUserIdArray: [],
    userIdArray: [],
    shared: false,
    chatFlowId: null,
    contact: { wallets: [] },
    ...over,
  };
}

describe("bloco 1.1 — supervisor restrito por departamento", () => {
  it("nao ve ticket da Fila B", () => {
    expect(canUserSeeTicket(ticket({ queueId: FILA_B }), SUPER1, TENANT_PADRAO)).toBe(false);
  });

  it("ve ticket da Fila A", () => {
    expect(canUserSeeTicket(ticket({ queueId: FILA_A }), SUPER1, TENANT_PADRAO)).toBe(true);
  });

  it("ve o ticket ATRIBUIDO a ele mesmo fora do departamento", () => {
    const t = ticket({ queueId: FILA_B, userId: SUPER1.userId });
    expect(canUserSeeTicket(t, SUPER1, TENANT_PADRAO)).toBe(true);
  });

  it("ve o CONVITE ativo fora do departamento", () => {
    const t = ticket({ queueId: FILA_B, userId: 999, shared: true, userIdArray: [SUPER1.userId!] });
    expect(canUserSeeTicket(t, SUPER1, TENANT_PADRAO)).toBe(true);
  });

  it("ve o GRUPO do qual participa fora do departamento", () => {
    const t = ticket({
      queueId: FILA_B,
      isGroup: true,
      groupUserIdArray: [SUPER1.userId!],
    });
    expect(canUserSeeTicket(t, SUPER1, TENANT_PADRAO)).toBe(true);
  });

  it("nao ve ticket SEM FILA de outra pessoa", () => {
    const t = ticket({ queueId: null, userId: 999 });
    expect(canUserSeeTicket(t, SUPER1, TENANT_PADRAO)).toBe(false);
  });

  it("continua restrito mesmo sendo admin-like (supervisorAdmin desligado)", () => {
    // supervisorAdmin "disabled" => super age como admin, MAS a regra de departamento
    // roda ANTES do isAdminLike, de proposito (espelha o filtro da lista).
    expect(canUserSeeTicket(ticket({ queueId: FILA_B }), SUPER1, TENANT_PADRAO)).toBe(false);
  });
});

describe("bloco 1.2 — supervisor com departamento ligado e SEM fila", () => {
  it("NAO e restringido em lugar nenhum (espelha o SQL)", () => {
    expect(canUserSeeTicket(ticket({ queueId: FILA_B }), SUPER2, TENANT_PADRAO)).toBe(true);
    expect(canUserSeeTicket(ticket({ queueId: null, userId: 999 }), SUPER2, TENANT_PADRAO)).toBe(true);
    expect(canUserSeeTicket(ticket({ whatsappId: CANAL_2 }), SUPER2, TENANT_PADRAO)).toBe(true);
  });
});

describe("bloco 1.3 — atendente fora da fila", () => {
  it("nao ve ticket ainda NAO roteado (sem fila e sem atendente)", () => {
    const t = ticket({ queueId: null, userId: null });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(false);
  });

  it("passa a ver quando o ticket e roteado para a fila dele", () => {
    expect(canUserSeeTicket(ticket({ queueId: FILA_A, userId: null }), USER1, TENANT_PADRAO)).toBe(true);
  });

  it("some para user1 e aparece para user2 quando vai para a Fila B", () => {
    const t = ticket({ queueId: FILA_B, userId: null, whatsappId: CANAL_2 });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(false);
    expect(canUserSeeTicket(t, USER2, TENANT_PADRAO)).toBe(true);
  });

  it("com 'Visualizar Tickets sem Usuario ou Fila' LIGADA, volta a ver o nao roteado", () => {
    const t = ticket({ queueId: null, userId: null });
    expect(canUserSeeTicket(t, USER1, { ...TENANT_PADRAO, nullTickets: "enabled" })).toBe(true);
  });

  it("atendente SEM nenhuma fila nao e filtrado por fila", () => {
    const semFila: UserVisibilityData = { ...USER1, queues: [] };
    const t = ticket({ queueId: FILA_B, userId: null, whatsappId: CANAL_1 });
    expect(canUserSeeTicket(t, semFila, TENANT_PADRAO)).toBe(true);
  });
});

describe("bloco 2.1 — convite (shared)", () => {
  it("convidado ve ticket de outra fila atribuido a outra pessoa", () => {
    const t = ticket({ queueId: FILA_A, userId: 999, shared: true, userIdArray: [USER2.userId!], whatsappId: CANAL_2 });
    expect(canUserSeeTicket(t, USER2, TENANT_PADRAO)).toBe(true);
  });

  it("convite REMOVIDO (shared=false) com residuo no userIdArray NAO libera", () => {
    const t = ticket({ queueId: FILA_A, userId: 999, shared: false, userIdArray: [USER2.userId!], whatsappId: CANAL_2 });
    expect(canUserSeeTicket(t, USER2, TENANT_PADRAO)).toBe(false);
  });
});

describe("bloco 2.2 — carteira de contato", () => {
  it("dono da carteira ve ticket fora das filas dele (sem depender de setting)", () => {
    const t = ticket({ queueId: FILA_B, userId: 999, contact: { wallets: [{ id: USER1.userId! }] } });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(true);
  });

  it("quem NAO e dono da carteira segue bloqueado fora da fila", () => {
    const t = ticket({ queueId: FILA_B, userId: 999, contact: { wallets: [{ id: 777 }] } });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(false);
  });
});

describe("bloco 2.3 — perfil custom com tickets_view_all", () => {
  it("custom1 ve tickets de todas as filas e canais", () => {
    const t = ticket({ queueId: FILA_B, whatsappId: CANAL_2, userId: 999 });
    expect(canUserSeeTicket(t, CUSTOM1, TENANT_PADRAO)).toBe(true);
  });

  it("custom2 (sem a permissao) fica no escopo normal", () => {
    const t = ticket({ queueId: FILA_B, whatsappId: CANAL_2, userId: 999 });
    expect(canUserSeeTicket(t, CUSTOM2, TENANT_PADRAO)).toBe(false);
  });
});

describe("bloco 2.4 — atendimento automatico (chatbot)", () => {
  const CFG = { ...TENANT_PADRAO, notViewTicketsChatBot: true };

  it("ticket ORFAO do bot nao aparece nem para o admin", () => {
    const t = ticket({ userId: null, queueId: null, chatFlowId: 55 });
    expect(canUserSeeTicket(t, ADMIN1, CFG)).toBe(false);
    expect(canUserSeeTicket(t, USER1, CFG)).toBe(false);
  });

  it("ticket JA TRANSFERIDO para a fila volta a aparecer (chatFlowId sobrevive ao TransferField)", () => {
    const t = ticket({ userId: null, queueId: FILA_A, chatFlowId: 55 });
    expect(canUserSeeTicket(t, USER1, CFG)).toBe(true);
    expect(canUserSeeTicket(t, ADMIN1, CFG)).toBe(true);
  });

  it("ticket do bot ja ATRIBUIDO ao atendente continua visivel para ele", () => {
    const t = ticket({ userId: USER1.userId, queueId: null, chatFlowId: 55 });
    expect(canUserSeeTicket(t, USER1, CFG)).toBe(true);
  });

  it("membro do grupo delegado continua vendo mesmo orfao do bot", () => {
    const t = ticket({
      userId: null,
      queueId: null,
      chatFlowId: 55,
      isGroup: true,
      groupUserIdArray: [USER1.userId!],
    });
    expect(canUserSeeTicket(t, USER1, CFG)).toBe(true);
  });

  it("com a opcao DESLIGADA, o orfao do bot aparece normalmente", () => {
    const t = ticket({ userId: null, queueId: FILA_A, chatFlowId: 55 });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(true);
  });
});

describe("bloco 3 — restricao por canal", () => {
  it("atendente do Canal 1 nao ve ticket do Canal 2", () => {
    const t = ticket({ queueId: FILA_A, whatsappId: CANAL_2, userId: null });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(false);
  });

  it("usuario SEM canal marcado nao sofre restricao de canal", () => {
    const semCanal: UserVisibilityData = { ...USER1, whatsappAllowed: [] };
    const t = ticket({ queueId: FILA_A, whatsappId: CANAL_2, userId: null });
    expect(canUserSeeTicket(t, semCanal, TENANT_PADRAO)).toBe(true);
  });

  it("'Receptivo apenas por fila' desliga a restricao de canal", () => {
    const t = ticket({ queueId: FILA_A, whatsappId: CANAL_2, userId: null });
    expect(canUserSeeTicket(t, USER1, { ...TENANT_PADRAO, inboundByQueueOnly: "enabled" })).toBe(true);
  });

  it("ticket de canal EXCLUIDO (whatsappId null) atribuido a mim continua visivel", () => {
    const t = ticket({ queueId: FILA_A, whatsappId: null, userId: USER1.userId });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(true);
  });

  it("supervisorChannelScoped restringe o supervisor admin-like ao canal dele", () => {
    const superSemDept: UserVisibilityData = { ...SUPER1, configs: { supervisorViewDept: "disabled" } };
    const cfg = { ...TENANT_PADRAO, supervisorChannelScoped: "enabled" };
    expect(canUserSeeTicket(ticket({ whatsappId: CANAL_1 }), superSemDept, cfg)).toBe(true);
    expect(canUserSeeTicket(ticket({ whatsappId: CANAL_2 }), superSemDept, cfg)).toBe(false);
  });
});

describe("bloco 7 — nao-regressao de admin e grupos", () => {
  it("admin ve tudo: outra fila, outro canal, atribuido a terceiro", () => {
    const t = ticket({ queueId: FILA_B, whatsappId: CANAL_2, userId: 999 });
    expect(canUserSeeTicket(t, ADMIN1, TENANT_PADRAO)).toBe(true);
  });

  it("superadmin ve tudo", () => {
    const sa: UserVisibilityData = { userId: 1, profile: "superadmin" };
    const t = ticket({ queueId: FILA_B, whatsappId: CANAL_2, userId: 999 });
    expect(canUserSeeTicket(t, sa, TENANT_PADRAO)).toBe(true);
  });

  it("grupo com 'Usuarios do Grupo' definidos: so eles veem", () => {
    // Canal do proprio user2 — a regra de canal roda ANTES da regra de grupos (ver o caso abaixo).
    const t = ticket({ isGroup: true, groupUserIdArray: [USER2.userId!], queueId: FILA_A, whatsappId: CANAL_2 });
    expect(canUserSeeTicket(t, USER2, TENANT_PADRAO)).toBe(true);
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(false);
  });

  it("restricao de canal tem PRECEDENCIA sobre a delegacao de grupo", () => {
    // Espelha o AND global de canal do backend: quem foi delegado no modal "Usuarios do Grupo"
    // mas nao tem o canal do grupo liberado continua sem ver. Se este teste inverter, o gate
    // ficou mais permissivo que a lista do REST.
    const t = ticket({ isGroup: true, groupUserIdArray: [USER2.userId!], queueId: FILA_A, whatsappId: CANAL_1 });
    expect(canUserSeeTicket(t, USER2, TENANT_PADRAO)).toBe(false);
  });

  it("ticket de colega NA MINHA FILA continua visivel (nao fecha a conversa sozinho)", () => {
    const t = ticket({ queueId: FILA_A, userId: 999, whatsappId: CANAL_1 });
    expect(canUserSeeTicket(t, USER1, TENANT_PADRAO)).toBe(true);
  });

  it("'Nao visualizar Tickets ja atribuidos' esconde o de colega na mesma fila", () => {
    const t = ticket({ queueId: FILA_A, userId: 999, whatsappId: CANAL_1 });
    expect(canUserSeeTicket(t, USER1, { ...TENANT_PADRAO, notViewAssignedTickets: true })).toBe(false);
  });

  it("usuario sem sessao (null) nunca ve nada", () => {
    expect(canUserSeeTicket(ticket(), null, TENANT_PADRAO)).toBe(false);
    expect(canUserSeeTicket(ticket(), { userId: null, profile: "admin" }, TENANT_PADRAO)).toBe(false);
  });
});

describe("helpers", () => {
  it("isTicketInBotFlow exige as TRES condicoes", () => {
    expect(isTicketInBotFlow({ chatFlowId: 5, queueId: null, userId: null })).toBe(true);
    expect(isTicketInBotFlow({ chatFlowId: 5, queueId: 1, userId: null })).toBe(false);
    expect(isTicketInBotFlow({ chatFlowId: 5, queueId: null, userId: 9 })).toBe(false);
    expect(isTicketInBotFlow({ chatFlowId: null, queueId: null, userId: null })).toBe(false);
  });

  it("toNumberArray normaliza objetos, strings e numeros", () => {
    expect(toNumberArray([{ id: 1 }, "2", 3, { id: "4" }, null, "abc"])).toEqual([1, 2, 3, 4]);
    expect(toNumberArray(null)).toEqual([]);
  });
});
