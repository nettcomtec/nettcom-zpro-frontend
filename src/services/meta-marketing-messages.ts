import api, { BACKGROUND_REQUEST } from "@/lib/api";

// Termos da Marketing Messages API da Meta por canal WABA
// (docs/PLANO_MARKETING_MESSAGES_API_WABA.md, D5/D13). Só quem resolve o aviso de
// pagamento recebe linhas; os demais recebem lista vazia sem consulta à Meta.

/**
 * onboarded = termos aceitos (marketing sai pela Marketing Messages API);
 * eligible = a conta pode aceitar (único estado que mostra o selo);
 * other = outro valor da Meta (sem selo); unknown = a consulta não respondeu.
 */
export type MarketingMessagesOnboardingStatus = "onboarded" | "eligible" | "other" | "unknown";

export interface MarketingMessagesChannelStatus {
  whatsappId: number;
  status: MarketingMessagesOnboardingStatus;
  checkedAt: string | null;
}

const KNOWN_STATUSES = new Set<MarketingMessagesOnboardingStatus>(["onboarded", "eligible", "other", "unknown"]);

function normalizeRow(raw: unknown): MarketingMessagesChannelStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { whatsappId?: unknown; status?: unknown; checkedAt?: unknown };
  const whatsappId = Number(row.whatsappId);
  if (!Number.isInteger(whatsappId) || whatsappId <= 0) return null;
  const status = typeof row.status === "string" && KNOWN_STATUSES.has(row.status as MarketingMessagesOnboardingStatus)
    ? (row.status as MarketingMessagesOnboardingStatus)
    : "other";
  const checkedAt = typeof row.checkedAt === "string" ? row.checkedAt : null;
  return { whatsappId, status, checkedAt };
}

/**
 * GET /meta/marketing-messages-status. Nunca lança nem mostra aviso de erro:
 * backend antigo (404), falha ou resposta fora do formato = lista vazia (sem selo).
 */
export async function getMarketingMessagesStatus(): Promise<MarketingMessagesChannelStatus[]> {
  try {
    const { data } = await api.get<{ channels?: unknown }>("/meta/marketing-messages-status", {
      ...BACKGROUND_REQUEST,
    });
    const channels = data && typeof data === "object" ? (data as { channels?: unknown }).channels : null;
    if (!Array.isArray(channels)) return [];
    const out: MarketingMessagesChannelStatus[] = [];
    for (const item of channels) {
      const row = normalizeRow(item);
      if (row) out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}
