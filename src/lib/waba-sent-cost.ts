// Estimativa de custo das mensagens enviadas por um canal da API oficial (aba "Custos"
// de /configuracoes/meta), a partir das contagens do backend (`/wabametaGetSentMessagesCost`).
//
// Regras da Meta aplicadas dia a dia:
// - resposta (mensagem de serviço) foi grátis até 30/09/2026;
// - desde 01/10/2026 as primeiras 1.000 respostas do mês, por número, são grátis
//   (a franquia não acumula e recomeça todo mês); da 1.001ª em diante, tarifa cheia;
// - template sempre é cobrado e nunca entra na franquia;
// - o que saiu pelo canal vinculado (modo híbrido) não passa pela Meta;
// - o que foi digitado no app do celular (coexistência) e o histórico importado não são cobrados.
// Backend anterior (sem `byDayDetail`) = conta de antes: tudo cobrado.

export const WABA_SERVICE_FREE_TIER = 1000;
export const WABA_SERVICE_CHARGE_START = "2026-10-01";

export interface WabaSentKindCounts {
  service: number;
  template: number;
  linked: number;
  app?: number;
}

export interface WabaSentCostInput {
  startDate: string;
  rate: number;
  byDay: Array<{ day: string; count: number }>;
  byDayDetail?: Array<{ day: string } & WabaSentKindCounts>;
  serviceBeforeStart?: number;
  linkedBeforeStart?: number;
}

export interface WabaSentCostDay {
  day: string;
  count: number;
  /** sem cobrança: franquia, resposta antes de 01/10/2026, canal vinculado e app do celular */
  free: number;
  paid: number;
  cost: number;
}

export interface WabaSentCostSummary {
  detailed: boolean;
  days: WabaSentCostDay[];
  total: number;
  free: number;
  paid: number;
  /** respostas pela oficial no período (cobradas ou não) */
  service: number;
  /** cobradas que são resposta (o resto das cobradas é template) */
  paidService: number;
  cost: number;
  /** quanto o que saiu pelo canal vinculado custaria pela API oficial */
  linkedSavings: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function allocate(input: WabaSentCostInput, linkedAsService: boolean) {
  const detail = [...(input.byDayDetail || [])].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const startMonth = String(input.startDate || "").slice(0, 7);
  const usedBefore = num(input.serviceBeforeStart) + (linkedAsService ? num(input.linkedBeforeStart) : 0);
  let month = "";
  let used = 0;
  return detail.map((d) => {
    const m = d.day.slice(0, 7);
    if (m !== month) {
      used = m === startMonth ? usedBefore : 0;
      month = m;
    }
    const linked = num(d.linked);
    const service = num(d.service) + (linkedAsService ? linked : 0);
    const template = num(d.template);
    let paidService = 0;
    if (d.day >= WABA_SERVICE_CHARGE_START) {
      const room = Math.max(0, WABA_SERVICE_FREE_TIER - used);
      paidService = Math.max(0, service - room);
      used += service;
    }
    const paid = paidService + template;
    const count = num(d.service) + template + linked + num(d.app);
    return { day: d.day, count, free: count - paid, paid, paidService, service: num(d.service) };
  });
}

export function computeWabaSentCost(input: WabaSentCostInput): WabaSentCostSummary {
  const rate = num(input.rate);
  if (!Array.isArray(input.byDayDetail)) {
    const days = (input.byDay || []).map((d) => {
      const count = num(d.count);
      return { day: d.day, count, free: 0, paid: count, cost: count * rate };
    });
    const total = days.reduce((a, d) => a + d.count, 0);
    return {
      detailed: false, days, total, free: 0, paid: total,
      service: total, paidService: total, cost: total * rate, linkedSavings: 0,
    };
  }
  const actual = allocate(input, false);
  const ifOfficial = allocate(input, true);
  const days = actual.map((d) => ({ day: d.day, count: d.count, free: d.free, paid: d.paid, cost: d.paid * rate }));
  const sum = (list: Array<Record<string, number | string>>, key: string) =>
    list.reduce((a, d) => a + (Number(d[key]) || 0), 0);
  const paid = sum(actual, "paid");
  return {
    detailed: true,
    days,
    total: sum(actual, "count"),
    free: sum(actual, "free"),
    paid,
    service: sum(actual, "service"),
    paidService: sum(actual, "paidService"),
    cost: paid * rate,
    linkedSavings: Math.max(0, sum(ifOfficial, "paid") - paid) * rate,
  };
}

/**
 * Custo de uma linha das tabelas por tipo/origem: template inteiro + a parte das respostas
 * cobradas, repartida pela quantidade de respostas da linha (a franquia é do mês, não do tipo).
 */
export function wabaSentRowCost(row: WabaSentKindCounts, summary: WabaSentCostSummary, rate: number): number {
  const r = num(rate);
  const share = summary.service > 0 ? summary.paidService / summary.service : 0;
  return (num(row.template) + num(row.service) * share) * r;
}

/**
 * Quanto o modo híbrido evitaria: só as respostas pela oficial das origens de conversa
 * (já descontado o que saiu pelo vinculado e os templates), limitado às respostas cobradas.
 */
export function wabaSentAvoidableCost(
  rows: Array<{ sendType: string } & WabaSentKindCounts>,
  avoidableSendTypes: string[],
  summary: WabaSentCostSummary,
  rate: number,
): number {
  const avoidable = rows.reduce(
    (acc, row) => acc + (avoidableSendTypes.includes(String(row.sendType)) ? num(row.service) : 0),
    0,
  );
  return Math.min(avoidable, summary.paidService) * num(rate);
}
