/**
 * Código de erro devolvido pelo backend, seja qual for o formato que chegou à tela.
 *
 * O interceptor de `lib/api.ts` rejeita com `error.response || error`, então nas
 * telas o corpo do backend vem em `err.data` — e não em `err.response.data`, que é
 * o formato do AxiosError cru (só aparece quando o erro não passou pelo
 * interceptor). Lê os dois, nessa ordem, com `error` antes de `message`. Só aceita
 * texto: rota que devolve o objeto de erro da Meta em `error` cai no `message`.
 * Vazio quando não há código (rede, timeout, erro de código nosso).
 */
export function getBackendErrorCode(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (!err || typeof err !== "object") return "";
  const e = err as { data?: unknown; response?: { data?: unknown } | null };
  for (const body of [e.data, e.response?.data]) {
    if (!body || typeof body !== "object") continue;
    const { error, message } = body as { error?: unknown; message?: unknown };
    if (typeof error === "string" && error.trim()) return error.trim();
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "";
}

/**
 * Token da Meta do canal vencido ou revogado. O backend responde 422 (nunca 401,
 * que dispararia a renovação de sessão do painel) com
 * "ERR_FACEBOOK_UNAUTHORIZED: <motivo em português>".
 */
export function isMetaTokenUnauthorized(err: unknown): boolean {
  return getBackendErrorCode(err).startsWith("ERR_FACEBOOK_UNAUTHORIZED");
}

/**
 * A Meta limitou as consultas de gerenciamento da conta do WhatsApp (erro 80008): o
 * backend pausa as consultas daquela WABA e responde 429 com
 * "ERR_META_RATE_LIMITED:<data ISO em que volta a consultar>".
 */
export function metaRateLimitedUntil(err: unknown): Date | null {
  const match = /^ERR_META_RATE_LIMITED:(\S+)/.exec(getBackendErrorCode(err));
  if (!match) return null;
  const until = new Date(match[1]);
  return Number.isNaN(until.getTime()) ? null : until;
}

/** Hora (HH:MM, no relógio de quem vê) em que a pausa da Meta termina; com data se não for hoje. */
export function formatMetaPauseTime(until: Date): string {
  const sameDay = until.toDateString() === new Date().toDateString();
  return sameDay
    ? until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : until.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Texto do aviso de consultas pausadas pela Meta, ou null quando o erro é outro.
 * `tCommon` é o tradutor do namespace `common`.
 */
export function metaRateLimitedMessage(
  err: unknown,
  tCommon: (key: any, values?: any) => string
): string | null {
  const until = metaRateLimitedUntil(err);
  return until ? tCommon("metaRateLimited", { time: formatMetaPauseTime(until) }) : null;
}

/**
 * Etiqueta que não existe mais na empresa (apagada depois de a tela carregar a
 * lista): o backend recusa o vínculo inteiro com 400 ERR_TAG_NOT_FOUND.
 */
export function isTagNotFound(err: unknown): boolean {
  return getBackendErrorCode(err) === "ERR_TAG_NOT_FOUND";
}

/**
 * Campo do cadastro de contato recusado pelo backend: "ERR_CONTACT_FIELD_TOO_LONG:<campo>"
 * (passou de 255 caracteres) ou "ERR_INVALID_FIELD:<campo>" (fila, carteira ou raia do
 * Kanban que não é número ou não é da empresa). `labelKey` é a chave do rótulo em
 * `contatosPage`; campo desconhecido devolve o próprio nome.
 */
const CONTACT_FIELD_LABEL_KEYS: Record<string, string> = {
  name: "fieldLabelName",
  number: "fieldLabelNumber",
  email: "emailLabel",
  cpf: "cpfLabel",
  birthdayDate: "birthDateLabel",
  firstName: "firstNameLabel",
  lastName: "lastNameLabel",
  businessName: "businessNameLabel",
  "extraInfo.name": "fieldLabelExtraName",
  "extraInfo.value": "fieldLabelExtraValue",
  wallets: "walletLabel",
  queueId: "queueLabel",
  kanban: "colKanban",
};

export function parseContactFieldError(
  err: unknown
): { kind: "tooLong" | "invalid"; field: string; labelKey: string | null } | null {
  const match = /^(ERR_CONTACT_FIELD_TOO_LONG|ERR_INVALID_FIELD):([A-Za-z.]{1,40})/.exec(getBackendErrorCode(err));
  if (!match) return null;
  return {
    kind: match[1] === "ERR_CONTACT_FIELD_TOO_LONG" ? "tooLong" : "invalid",
    field: match[2],
    labelKey: CONTACT_FIELD_LABEL_KEYS[match[2]] ?? null,
  };
}
