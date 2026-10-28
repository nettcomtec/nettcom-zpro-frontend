// Divisória de transferência do atendimento (docs/PLANO_HISTORICO_TRANSFERENCIAS_ATENDIMENTO.md).
// O backend (RecordTicketTransferServiceZPRO) grava em Message.dataJson os NOMES e ids de origem,
// destino e autor; o texto é montado aqui, no idioma da tela. Mensagem antiga (ou de backend
// antigo) não tem esse dado: quem desenha cai no body, como sempre foi.
// Os ids são só informativos: a migração de empresa não os troca, então nunca servem para
// junção nem para conferir acesso.

export type TicketTransferType = "assign" | "channel" | "chatbot";

export type TicketTransferReason =
  | "manual"
  | "api"
  | "offline"
  | "distribution"
  | "inactivity"
  | "user_deleted";

export interface TicketTransferSide {
  userId: number | null;
  userName: string | null;
  queueId: number | null;
  queueName: string | null;
  whatsappId: number | null;
  whatsappName: string | null;
  chatFlowId: number | null;
  chatFlowName: string | null;
}

export interface TicketTransferNotice {
  type: TicketTransferType;
  reason: TicketTransferReason;
  by: { id: number; name: string | null } | null;
  from: TicketTransferSide;
  to: TicketTransferSide;
}

export interface TicketTransferText {
  title: string;
  path: string | null;
  channel: string | null;
}

// Tradução com reserva em português: na bolha embrulha o `t` da tela; no PDF é o uiT.
export type TicketTransferTranslate = (
  key: string,
  values: Record<string, string> | undefined,
  fallback: string
) => string;

const TYPES: ReadonlyArray<TicketTransferType> = ["assign", "channel", "chatbot"];
const REASONS: ReadonlyArray<TicketTransferReason> = [
  "manual",
  "api",
  "offline",
  "distribution",
  "inactivity",
  "user_deleted",
];
const AUTOMATIC: ReadonlyArray<TicketTransferReason> = ["offline", "distribution", "inactivity", "user_deleted"];
const NAME_MAX = 120;

// Controle e marcas de direção de texto (o backend já tira; aqui é só defesa).
const isUnsafeCodePoint = (cp: number): boolean =>
  cp <= 0x1f ||
  (cp >= 0x7f && cp <= 0x9f) ||
  cp === 0x200e ||
  cp === 0x200f ||
  (cp >= 0x202a && cp <= 0x202e) ||
  (cp >= 0x2066 && cp <= 0x2069);

function readName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const kept = Array.from(value).filter((ch) => !isUnsafeCodePoint(ch.codePointAt(0) as number));
  const text = kept.join("").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > NAME_MAX ? chars.slice(0, NAME_MAX).join("") : text;
}

function readId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function readSide(value: unknown): TicketTransferSide {
  const side = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    userId: readId(side.userId),
    userName: readName(side.userName),
    queueId: readId(side.queueId),
    queueName: readName(side.queueName),
    whatsappId: readId(side.whatsappId),
    whatsappName: readName(side.whatsappName),
    chatFlowId: readId(side.chatFlowId),
    chatFlowName: readName(side.chatFlowName),
  };
}

/** Lê o dado estruturado da divisória; `null` = divisória antiga ou dado inválido (usar o body). */
export function readTicketTransferNotice(msg: { dataJson?: unknown } | null | undefined): TicketTransferNotice | null {
  const raw = msg?.dataJson;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    // Atalho barato antes do JSON.parse (molde do cartão de formulário).
    if (!text.startsWith("{") || !text.includes("ticket_transfer")) return null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  if (data.kind !== "ticket_transfer" || data.v !== 1) return null;
  const type = TYPES.find((item) => item === data.type);
  if (!type) return null;
  const reason = REASONS.find((item) => item === data.reason) ?? "manual";
  const byRaw = data.by && typeof data.by === "object" && !Array.isArray(data.by) ? (data.by as Record<string, unknown>) : null;
  const byId = byRaw ? readId(byRaw.id) : null;
  return {
    type,
    reason,
    by: byId !== null ? { id: byId, name: readName(byRaw?.name) } : null,
    from: readSide(data.from),
    to: readSide(data.to),
  };
}

/**
 * Monta o texto da divisória: `title` ("Transferido por Ana"), `path` (origem → destino) e
 * `channel` (só quando o canal mudou). Pura: o idioma vem da função `t`; a seta vem de `arrow`
 * ("→" na tela, "->" no PDF, porque o "→" não existe na fonte padrão do PDF).
 */
export function formatTicketTransferNotice(
  notice: TicketTransferNotice,
  t: TicketTransferTranslate,
  opts: { arrow?: string } = {}
): TicketTransferText {
  const arrow = opts.arrow ?? "→";
  const automatic = AUTOMATIC.includes(notice.reason);

  let title: string;
  if (notice.reason === "api") {
    title = t("transferApi", undefined, "Transferido pela API");
  } else if (!automatic && notice.by) {
    title = t("transferBy", { name: notice.by.name || `#${notice.by.id}` }, "Transferido por {name}");
  } else {
    title = t("transferAuto", undefined, "Transferido automaticamente");
  }

  const originTag =
    notice.reason === "offline"
      ? t("transferTagOffline", undefined, "(offline)")
      : notice.reason === "user_deleted"
        ? t("transferTagUserDeleted", undefined, "(usuário excluído)")
        : "";

  const sideText = (side: TicketTransferSide, tag: string): string => {
    const user = side.userName ? (tag ? `${side.userName} ${tag}` : side.userName) : "";
    return [user, side.queueName].filter(Boolean).join(" · ");
  };

  const noQueue = t("transferNoQueue", undefined, "Sem fila");
  const fromText = sideText(notice.from, originTag) || noQueue;

  let toText: string;
  if (notice.type === "chatbot") {
    toText = notice.to.chatFlowName
      ? t("transferChatbot", { flow: notice.to.chatFlowName }, "Chatbot: {flow}")
      : t("transferChatbotNoName", undefined, "Chatbot");
  } else if (!notice.to.userName && notice.to.queueName) {
    toText = t("transferQueueNoAgent", { queue: notice.to.queueName }, "Fila {queue} (sem atendente)");
  } else {
    toText = sideText(notice.to, "") || noQueue;
  }

  // Troca de canal que manteve atendente e fila: só a linha do canal.
  const sameAssignment =
    notice.from.userId === notice.to.userId && notice.from.queueId === notice.to.queueId;
  const path = notice.type === "channel" && sameAssignment ? null : `${fromText} ${arrow} ${toText}`;

  let channel: string | null = null;
  if (
    notice.from.whatsappId !== null &&
    notice.to.whatsappId !== null &&
    notice.from.whatsappId !== notice.to.whatsappId
  ) {
    channel = t(
      "transferChannel",
      { path: `${notice.from.whatsappName || "-"} ${arrow} ${notice.to.whatsappName || "-"}` },
      "Canal: {path}"
    );
  }

  return { title, path, channel };
}

/** Texto gravado pelo backend com a seta trocada (PDF de divisória sem dado estruturado). */
export function transferBodyWithAsciiArrow(body: string | null | undefined): string {
  return String(body || "").split("→").join("->");
}
