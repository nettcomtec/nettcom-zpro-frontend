import {
  sendMessage,
  sendTextWaba,
  sendTextInstagramMeta,
  sendTextMessengerMeta,
  sendTextDialog360,
  sendTextGupshup,
} from "@/services/messages";
import { createEvaluation, resolveExternalRatingUrl, type EvaluationConfig } from "@/services/evaluations";
import { ensureRegionTexts, getRegionNow, getRegionText } from "@/hooks/use-region";
import { flushPendingWabaText } from "@/lib/waba-agent-grouping";

/** Canais que suportam a pesquisa de satisfação automática (têm captura da nota no backend). */
export const EVALUATION_CHANNELS = [
  "whatsapp", "baileys", "zapo", "waba", "meow", "evo", "evogo", "zapi", "uazapi",
  "instagram", "messenger", "dialog360", "gupshup",
];

/** true se o canal do ticket suporta a pesquisa de satisfação (inclui hub_* e webchat). */
export function channelSupportsEvaluation(channel: string | undefined): boolean {
  const ch = (channel || "").toLowerCase();
  return EVALUATION_CHANNELS.includes(ch) || ch.includes("hub_") || ch.includes("webchat");
}

export interface EvaluationTicketLike {
  id: number;
  channel?: string;
  isGroup?: boolean;
  contact: { number?: string; name?: string };
  whatsapp?: { id?: number; tokenAPI?: string };
  user?: { name?: string };
  protocol?: string;
}

export interface SendEvaluationOptions {
  /** Config de avaliação já carregado (evita novo GET). Passe sempre que possível. */
  config?: EvaluationConfig | null;
  /**
   * Rótulo da pergunta ("Avalie este atendimento:") já traduzido. Default PT. Só vale
   * quando a empresa não tem pergunta própria nem idioma da Região configurado.
   */
  questionLabel?: string;
}

const DEFAULT_QUESTION_LABEL = "Avalie este atendimento:";
const DEFAULT_SCALE = ["Ruim", "Regular", "Bom", "Muito Bom", "Excelente", "Incrível"];
/** Teto da espera pelos textos da Região: estourado, a pesquisa sai com o fallback de hoje. */
const REGION_TEXTS_WAIT_MS = 3000;

/**
 * Com idioma da Região configurado, garante os textos ao cliente carregados (voo único,
 * normalmente já vieram no boot do painel). Nunca lança nem segura o envio além do teto.
 */
async function waitRegionTexts(): Promise<void> {
  if (!getRegionNow().languageConfigured) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ensureRegionTexts(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REGION_TEXTS_WAIT_MS);
      }),
    ]);
  } catch {
    // sem os textos: segue o fallback
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Monta e envia a pesquisa de satisfação de um ticket e registra a avaliação pendente.
 * Fonte ÚNICA usada pelo topo do atendimento, pelo painel do contato e pelo fechar-rápido
 * da lista — garante que todos enviem a pesquisa do mesmo jeito, em todos os canais.
 *
 * NÃO exibe toast nem altera o status do ticket: quem chama decide o que fazer em seguida
 * (fechar agora, manter aberto, etc.). Lança em caso de erro de envio.
 *
 * @returns "native" (registrou avaliação pendente, aguarda a nota do cliente) |
 *          "link" (enviou o link externo, sem retorno de nota).
 */
export async function sendEvaluationForTicket(
  ticket: EvaluationTicketLike,
  opts: SendEvaluationOptions = {}
): Promise<"native" | "link"> {
  // Grupo não recebe pesquisa: sem esta trava a pergunta sairia no grupo antes de o
  // backend recusar a avaliação.
  if (ticket.isGroup) throw new Error("ERR_GROUP_NOT_SUPPORTED");
  // WABA: o texto do atendente que esperava para juntar sai antes da pesquisa.
  await flushPendingWabaText(ticket.id);
  const config = opts.config ?? null;

  // Pergunta (vai ao CLIENTE), mesma ordem do envio automático no backend: a da empresa
  // (/avaliacoes) → a padrão no idioma da Região, só quando ela define idioma → o rótulo
  // no idioma do atendente, como sempre foi (sem Região configurada nada muda) → PT.
  await waitRegionTexts();
  const customQuestion = String(config?.ratingQuestion || "").trim();
  const label =
    customQuestion ||
    getRegionText("evaluation.question", undefined, "") ||
    opts.questionLabel ||
    DEFAULT_QUESTION_LABEL;

  const maxScore = typeof config?.ratingMaxScore === "number" ? config.ratingMaxScore : 5;
  const ratings = (config?.rating ?? []).filter((r) => r.rating <= maxScore);
  // Escala padrão (empresa sem rótulos salvos): mesma regra da pergunta.
  const ratingBody = ratings.length
    ? `${label}\n${ratings.map((r) => `${r.rating} - ${r.label}`).join("\n")}`
    : `${label}\n${[0, 1, 2, 3, 4, 5]
        .filter((r) => r <= maxScore)
        .map((r) => `${r} - ${getRegionText(`evaluation.scale.${r}`, undefined, DEFAULT_SCALE[r])}`)
        .join("\n")}`;

  const ratingMode = config?.ratingMode || "native";
  const ratingExternalUrl = config?.ratingExternalUrl || "";
  const isExternal = ratingMode === "link" && !!ratingExternalUrl.trim();

  const externalUrl = isExternal
    ? resolveExternalRatingUrl(ratingExternalUrl, {
        ticketId: ticket.id,
        protocol: ticket.protocol,
        contactName: ticket.contact?.name,
        contactNumber: ticket.contact?.number,
        agentName: ticket.user?.name,
      })
    : "";
  const bodyToSend = isExternal ? externalUrl : ratingBody;

  const ch = (ticket.channel || "").toLowerCase();
  const idFront = `eval-${ticket.id}-${Date.now()}`;

  if (ch === "waba" || ch === "instagram" || ch === "messenger" || ch === "dialog360" || ch === "gupshup") {
    // Canais Meta/BSP: payload dedicado (com from/tokenApi/whatsappId), igual ao envio manual do painel.
    const metaPayload = {
      read: 1, fromMe: true, mediaUrl: "", body: bodyToSend,
      scheduleDate: null, quotedMsg: null,
      from: ticket.contact?.number, tokenApi: ticket.whatsapp?.tokenAPI,
      whatsappId: ticket.whatsapp?.id, ticketId: ticket.id, idFront, sendType: "evaluation",
    };
    if (ch === "waba") await sendTextWaba(metaPayload);
    else if (ch === "instagram") await sendTextInstagramMeta(metaPayload);
    else if (ch === "messenger") await sendTextMessengerMeta(metaPayload);
    else if (ch === "dialog360") await sendTextDialog360(metaPayload);
    else await sendTextGupshup(metaPayload);
  } else {
    await sendMessage(ticket.id, {
      read: 1, fromMe: true, mediaUrl: "", body: bodyToSend,
      scheduleDate: null, quotedMsg: null, sendType: "evaluation", idFront,
    }, { channel: ticket.channel });
  }

  if (isExternal) {
    await createEvaluation({ evaluation: "external", attempts: 2, ticketId: ticket.id, type: "external", externalUrl });
    return "link";
  }
  await createEvaluation({ evaluation: label, attempts: 0, ticketId: ticket.id });
  return "native";
}
