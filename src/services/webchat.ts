import api from "@/lib/api";

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
