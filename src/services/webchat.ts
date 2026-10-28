import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

// ─── Link direto (URL pública) — PLANO_WEBCHAT_URL F2/F3 ─────────────────────
// Shape do Whatsapps.webchatConfig (JSONB) para canais type='webchat'.
// O campo NÃO está na interface Whatsapp (services/whatsapp.ts é intocável);
// leia-o com cast: (w as Record<string, unknown>).webchatConfig.
// Presença da chave no GET (mesmo null) = backend novo (probe de capacidade §7).

export interface WebchatPreChatForm {
  enabled?: boolean;
  fields?: string[];
  required?: string[];
  [key: string]: unknown;
}

export interface WebchatPageLabels {
  start?: string | null;
  formTitle?: string | null;
  connecting?: string | null;
  reconnecting?: string | null;
  unavailable?: string | null;
  retry?: string | null;
  send?: string | null;
  [key: string]: unknown;
}

export interface WebchatDirectConfig {
  directLinkEnabled?: boolean;
  title?: string | null;
  color?: string | null;
  logoUrl?: string | null;
  welcomeMessage?: string | null;
  placeholder?: string | null;
  preChatForm?: WebchatPreChatForm | null;
  privacyText?: string | null;
  privacyUrl?: string | null;
  labels?: WebchatPageLabels | null;
  /**
   * Canal que recebe pelo link de convite ({{linkWebchat}}, PLANO_WEBCHAT_LINK_CONVITE D5):
   * um por empresa — o backend desmarca os outros canais ao gravar `true`. Backend antigo
   * descarta a chave em silêncio (por isso a tela só oferece com a availability).
   */
  inviteLinkEnabled?: boolean;
  /**
   * Texto do botão "Enviar convite do WebChat" do atendimento (null/ausente = texto padrão
   * no idioma da empresa). Backend antigo descarta a chave: a tela só oferece o campo quando
   * GET /webchat-invite/message responde.
   */
  inviteMessageText?: string | null;
  // Chaves futuras do backend preservadas no merge (o PUT envia o objeto completo).
  [key: string]: unknown;
}

/** Cor padrão da página pública (mesmo default do backend). */
export const WEBCHAT_DEFAULT_COLOR = "#2196F3";

/** Campos aceitos no pré-chat form, na ordem de exibição. */
export const WEBCHAT_PRECHAT_FIELDS: string[] = ["name", "email", "phone", "cpf"];

/**
 * Monta a URL pública do link direto: `${API_URL}/chat/${wabaId}`.
 * Sempre remove a barra final de NEXT_PUBLIC_API_URL (bug conhecido de barra dupla).
 */
export function buildDirectLinkUrl(wabaId: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  return `${base}/chat/${wabaId}`;
}

// ─── Link de convite (PLANO_WEBCHAT_LINK_CONVITE §5.6) ───────────────────────
// `available` = o servidor entende a variável {{linkWebchat}} (recurso ligado e banco pronto).
// Backend antigo responde 404 → recurso escondido (Switch, variável nos seletores). Uma
// consulta por carga de página, dividida entre todos os seletores; 404 fica memorizado e
// outra falha (rede, 5xx) só é tentada de novo depois de 1 min.

export interface WebchatInviteAvailability {
  available: boolean;
  /** Nome da variável sem chaves ("linkWebchat"), quando o servidor informa. */
  variable?: string;
}

const INVITE_AVAILABILITY_RETRY_MS = 60000;
let inviteAvailabilityPromise: Promise<WebchatInviteAvailability> | null = null;
let inviteAvailabilityRetryAt = 0;

function errorStatusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : undefined;
}

export function fetchWebchatInviteAvailability(): Promise<WebchatInviteAvailability> {
  if (inviteAvailabilityPromise) return inviteAvailabilityPromise;
  if (Date.now() < inviteAvailabilityRetryAt) return Promise.resolve({ available: false });
  const pending = api
    .get<{ available?: unknown; variable?: unknown }>("/webchat-invite/availability", BACKGROUND_REQUEST)
    .then(({ data }): WebchatInviteAvailability => ({
      available: data?.available === true,
      variable: typeof data?.variable === "string" ? data.variable : undefined,
    }))
    .catch((err: unknown): WebchatInviteAvailability => {
      if (errorStatusOf(err) !== 404) {
        inviteAvailabilityPromise = null;
        inviteAvailabilityRetryAt = Date.now() + INVITE_AVAILABILITY_RETRY_MS;
      }
      return { available: false };
    });
  inviteAvailabilityPromise = pending;
  return pending;
}

// ─── Botão "Enviar convite do WebChat" do atendimento ───────────────────────
// GET /webchat-invite/message: `ready` (convite pronto na empresa: canal marcado, recurso
// ligado), `text` (o que vai ao cliente, sempre com {{linkWebchat}}) e `defaultText` (padrão
// no idioma da empresa, sugestão da configuração). `null` = servidor sem a rota (404,
// memorizado até recarregar a página) ou falha (nova tentativa depois de 1 min). A resposta
// vale 60 s e é dividida entre o cabeçalho, a caixa de mensagem e a configuração.

export interface WebchatInviteMessage {
  ready: boolean;
  text: string;
  defaultText: string;
}

const INVITE_MESSAGE_TTL_MS = 60000;
// Falha passageira (rede, 5xx): mantém o último valor e tenta de novo depois disto.
const INVITE_MESSAGE_ERROR_RETRY_MS = 15000;
let inviteMessageCache: { value: WebchatInviteMessage | null; at: number; tenant: string } | null = null;
let inviteMessagePromise: Promise<WebchatInviteMessage | null> | null = null;
let inviteMessagePromiseTenant = "";
let inviteMessageUnsupported = false;
const inviteMessageListeners = new Set<(value: WebchatInviteMessage | null) => void>();

// O cache é da empresa logada: outro login na mesma aba (sem recarregar) não herda o valor.
function currentInviteTenant(): string {
  try {
    return String(useAuthStore.getState().user?.tenantId ?? "");
  } catch {
    return "";
  }
}

function storeInviteMessage(
  value: WebchatInviteMessage | null,
  tenant: string,
  at: number = Date.now()
): WebchatInviteMessage | null {
  inviteMessageCache = { value, at, tenant };
  inviteMessageListeners.forEach((listener) => {
    try {
      listener(value);
    } catch {
      // um assinante com erro não impede os outros
    }
  });
  return value;
}

/** Último valor conhecido da empresa logada (undefined = ainda não perguntado). */
export function getCachedWebchatInviteMessage(): WebchatInviteMessage | null | undefined {
  return inviteMessageCache && inviteMessageCache.tenant === currentInviteTenant()
    ? inviteMessageCache.value
    : undefined;
}

/** Avisa a cada resposta nova (o cabeçalho e a caixa de mensagem ficam iguais). */
export function subscribeWebchatInviteMessage(
  listener: (value: WebchatInviteMessage | null) => void
): () => void {
  inviteMessageListeners.add(listener);
  return () => {
    inviteMessageListeners.delete(listener);
  };
}

export function fetchWebchatInviteMessage(opts?: { fresh?: boolean }): Promise<WebchatInviteMessage | null> {
  if (inviteMessageUnsupported) return Promise.resolve(null);
  const tenant = currentInviteTenant();
  const cached = inviteMessageCache && inviteMessageCache.tenant === tenant ? inviteMessageCache : null;
  if (!opts?.fresh && cached && Date.now() - cached.at < INVITE_MESSAGE_TTL_MS) {
    return Promise.resolve(cached.value);
  }
  if (inviteMessagePromise && inviteMessagePromiseTenant === tenant) return inviteMessagePromise;
  const pending = api
    .get<{ ready?: unknown; text?: unknown; defaultText?: unknown }>("/webchat-invite/message", BACKGROUND_REQUEST)
    .then(({ data }) => {
      const text = typeof data?.text === "string" ? data.text : "";
      const defaultText = typeof data?.defaultText === "string" ? data.defaultText : "";
      // Sem texto não há o que enviar: o botão não aparece.
      return storeInviteMessage({ ready: data?.ready === true && text.trim().length > 0, text, defaultText }, tenant);
    })
    .catch((err: unknown) => {
      if (errorStatusOf(err) === 404) {
        inviteMessageUnsupported = true;
        return storeInviteMessage(null, tenant);
      }
      // Falha passageira: o botão não some por causa dela — fica o último valor e nova
      // tentativa em 15 s (vence o TTL de propósito).
      const previous = cached ? cached.value : null;
      return storeInviteMessage(
        previous,
        tenant,
        Date.now() - INVITE_MESSAGE_TTL_MS + INVITE_MESSAGE_ERROR_RETRY_MS
      );
    })
    .finally(() => {
      if (inviteMessagePromise === pending) inviteMessagePromise = null;
    });
  inviteMessagePromise = pending;
  inviteMessagePromiseTenant = tenant;
  return pending;
}

/** Depois de salvar o texto ou a opção do convite: a próxima leitura vai ao servidor. */
export function invalidateWebchatInviteMessage(): void {
  inviteMessageCache = null;
}

export async function verifyWebchatConfig() {
  return api.get<{
    configurado: boolean;
    wssUrlFuncionando: boolean;
    backendWssFuncionando: boolean;
    modo: "backend" | "wss_legacy" | "ambos" | "nenhum";
  }>("/webchat/config");
}

export async function getWebchatWidget(tenantId: number, wabaId: string, websocketToken: string, enableMenuButtons?: boolean) {
  return api.get(`/widget/${tenantId}/${wabaId}/${websocketToken}`, {
    responseType: "blob",
    params: enableMenuButtons ? { menuButtons: "1" } : undefined,
  });
}
