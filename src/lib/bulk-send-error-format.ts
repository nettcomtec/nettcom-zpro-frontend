import type { AxiosError } from "axios";

const BACKEND_ERROR_LABELS: Record<string, string> = {
  ERR_DUPLICATED_CONTACT: "Contato já cadastrado",
  ERR_NO_CONTACT_FOUND: "Contato não encontrado",
  ERR_WAPP_NOT_INITIALIZED: "Sessão WhatsApp não inicializada",
  ERR_NO_WABA_SESSION: "Sessão WABA não disponível",
  ERR_SESSION_EXPIRED: "Sessão expirada",
  ERR_SENDING_WAPP_MSG: "Falha ao enviar mensagem",
  ERR_CREATING_TICKET: "Falha ao criar ticket",
  ERR_CREATING_CONTACT: "Falha ao criar contato",
  ERR_NO_PERMISSION: "Sem permissão para esta ação",
  ERR_ORDER_DETAILS_REQUIRED: "Template de cobrança: preencha os dados do pagamento",
  ERR_TEMPLATE_BUTTON_PARAM_REQUIRED: "Preencha o código do botão do template",
  ERR_WABA_SEND_FAILED: "A Meta recusou o envio",
};

function translateKnownCode(value: string): string {
  return BACKEND_ERROR_LABELS[value] || value;
}

/**
 * Extrai uma mensagem de erro legível de respostas do backend ou Meta,
 * evitando `[object Object]` ou JSON cru no modal de progresso.
 *
 * Trata três formatos comuns:
 * - AxiosError: `err.response.data.error`
 * - Raw response (nosso interceptor rejeita com `error.response`): `err.data.error`
 * - Error: `err.message`
 */
export function formatBulkSendError(err: unknown): string {
  if (err == null) return "Erro desconhecido";
  if (typeof err === "string") return translateKnownCode(err);

  const ax = err as AxiosError<unknown> & { data?: unknown; status?: number };

  // 1) AxiosError.response.data
  if (ax?.response?.data != null) {
    const msg = pickMessage(ax.response.data);
    if (msg) return translateKnownCode(msg);
  }

  // 2) Raw response object (interceptor rejeita com error.response direto)
  if (ax?.data != null) {
    const msg = pickMessage(ax.data);
    if (msg) return translateKnownCode(msg);
  }

  if (typeof (err as { message?: unknown }).message === "string") {
    return translateKnownCode((err as { message: string }).message);
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Erro desconhecido";
  }
}

function pickMessage(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") {
    // Pode vir JSON embebido em string
    try {
      const parsed = JSON.parse(data) as unknown;
      const inner = pickMessage(parsed);
      if (inner) return inner;
    } catch {
      // não era JSON
    }
    return data;
  }
  if (typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // Meta: { error: { message, code, ... } }
  if (obj.error) {
    // O backend passou a devolver { error: <código>, message: <motivo da Meta> }.
    // No modal de progresso o motivo diz o que corrigir; o código cru, não.
    if (typeof obj.error === "string") {
      if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
      return obj.error;
    }
    if (typeof obj.error === "object" && obj.error !== null) {
      const e = obj.error as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
    }
  }

  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.errorCode === "string") return obj.errorCode;

  return null;
}
