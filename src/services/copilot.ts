import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { locales, type Locale } from "@/i18n/config";

/**
 * Idioma da interface do atendente, para as operacoes do Copiloto cujo texto e
 * LIDO POR ELE (resumo, sentimento, insights, Pergunte a IA). Nao vai nas que
 * produzem texto para o CLIENTE (sugerir resposta, respostas rapidas, reescrever,
 * gerar template): la o idioma continua sendo o do tenant, senao a lingua do
 * atendente vazaria para a conversa. Backend antigo ignora o campo.
 *
 * Devolve objeto para dar spread — VAZIO quando o usuario nunca escolheu idioma
 * (o LocalStorage so e escrito no setLocale). Sem esse cuidado, quem nunca trocou
 * de idioma mandaria "pt" e sobrescreveria o idioma configurado no tenant.
 */
export function copilotUiLangPayload(): { uiLang?: Locale } {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem("language") as Locale | null;
    if (stored && (locales as readonly string[]).includes(stored)) return { uiLang: stored };
  } catch {
    // noop — sem escolha explicita, segue o idioma do tenant
  }
  return {};
}

export type SentimentLevel = "positive" | "neutral" | "negative" | "frustrated";

export interface SuggestReplyResult {
  suggestion: string;
  provider?: string;
  model?: string;
}

export interface SentimentResult {
  sentiment: SentimentLevel;
  summary: string;
  provider?: string;
  model?: string;
}

export async function suggestReply(
  ticketId: number,
  currentText?: string
): Promise<SuggestReplyResult> {
  const { data } = await api.post<SuggestReplyResult>("/copilot/suggest", {
    ticketId,
    currentText,
  });
  return data;
}

export async function analyzeSentiment(
  ticketId: number,
  options?: { background?: boolean }
): Promise<SentimentResult> {
  const { data } = await api.post<SentimentResult>(
    "/copilot/sentiment",
    { ticketId, ...copilotUiLangPayload() },
    options?.background ? { ...BACKGROUND_REQUEST } : undefined
  );
  return data;
}

export interface GenerateTemplateResult {
  result: string;
  provider: string;
  model: string;
}

export async function generateTemplateViaCopilot(
  systemPrompt: string,
  userPrompt: string,
  opts?: { source?: "copilot" | "channel"; whatsappId?: number }
): Promise<GenerateTemplateResult> {
  const { data } = await api.post<GenerateTemplateResult>("/copilot/generate-template", {
    systemPrompt,
    userPrompt,
    ...(opts?.source ? { source: opts.source } : {}),
    ...(opts?.whatsappId ? { whatsappId: opts.whatsappId } : {}),
  });
  return data;
}

export type TranslateTargetLang = "pt" | "en" | "es" | "fr" | "de" | "it" | "zh" | "ar";

export interface TranslateResult {
  translated: string;
  targetLang: TranslateTargetLang;
}

export async function translateMessage(
  messageBody: string,
  ticketId: number,
  targetLang: TranslateTargetLang,
  messageId?: string
): Promise<TranslateResult> {
  const { data } = await api.post<TranslateResult>("/copilot/translate", {
    messageBody,
    ticketId,
    targetLang,
    ...(messageId ? { messageId } : {}),
  });
  return data;
}

export interface ContactSummaryResult {
  summary: string;
  ticketsAnalyzed: number;
  generatedAt?: string | null;
  provider?: string;
  model?: string;
}

export async function summarizeContact(
  contactId: number,
  ticketId: number,
  systemPrompt?: string
): Promise<ContactSummaryResult> {
  const { data } = await api.post<ContactSummaryResult>("/copilot/contact-summary", {
    contactId,
    ticketId,
    systemPrompt,
    ...copilotUiLangPayload(),
  });
  return data;
}

export interface FastReplySuggestionsResult {
  suggestions: string[];
  provider?: string;
  model?: string;
}

export async function suggestFastReplies(
  ticketId: number,
  systemPrompt?: string
): Promise<FastReplySuggestionsResult> {
  const { data } = await api.post<FastReplySuggestionsResult>("/copilot/fast-reply-suggestions", {
    ticketId,
    systemPrompt,
  });
  return data;
}

export interface DashboardInsightsResult {
  id: number;
  insights: string[];
  provider: string;
  model: string;
  createdAt: string;
}

export async function generateDashboardInsights(
  stats: Record<string, unknown>,
  systemPrompt?: string,
  period?: string
): Promise<DashboardInsightsResult> {
  const { data } = await api.post<DashboardInsightsResult>("/copilot/dashboard-insights", {
    stats,
    systemPrompt,
    period,
    ...copilotUiLangPayload(),
  });
  return data;
}

export interface DashboardInsightHistoryRow {
  id: number;
  provider: string | null;
  model: string | null;
  period: string | null;
  insights: string[];
  stats: Record<string, unknown>;
  userId: number | null;
  createdAt: string;
}

export interface DashboardInsightHistoryResult {
  rows: DashboardInsightHistoryRow[];
  total: number;
}

export async function listDashboardInsights(
  limit = 20,
  offset = 0
): Promise<DashboardInsightHistoryResult> {
  const { data } = await api.get<DashboardInsightHistoryResult>(
    "/copilot/dashboard-insights/history",
    { params: { limit, offset } }
  );
  return data;
}

export async function deleteDashboardInsight(id: number): Promise<void> {
  await api.delete(`/copilot/dashboard-insights/${id}`);
}

export interface CopilotTestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  reply?: string;
  error?: string;
}

export async function testCopilotCredentials(
  payload?: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }
): Promise<CopilotTestResult> {
  const { data } = await api.post<CopilotTestResult>("/copilot/test", payload || {});
  return data;
}
