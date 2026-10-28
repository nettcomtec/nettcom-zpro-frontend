import api, { BACKGROUND_REQUEST } from "@/lib/api";
import type {
  GlobalPanelAppInput,
  GlobalPanelAppItem,
  PanelAppEmbedCheckResult,
  PanelAppInput,
  PanelAppLaunchEcho,
  PanelAppManageItem,
  PanelAppManageList,
  PanelAppNavEntry,
  PanelAppOptions,
  PanelAppPlacement,
  PanelAppScope,
  PanelAppSigningKeyInfo,
} from "@/lib/panel-apps";

/**
 * Rotas dos aplicativos personalizados (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md §5.2).
 * Erros chegam como o RESPONSE do interceptor: código por `getBackendErrorCode`,
 * status por `err.status`. Backend antigo = 404 sem código.
 */

/** Versões do aviso de socket por escopo (cada uma força a recarga só do próprio cache no servidor). */
export interface PanelAppNoticeVersions {
  tenant?: number;
  global?: number;
}

/** Eco da fase 2 (`launch: { v: 1 }`): ausente ou fora do formato = backend da v1 / fase desligada. */
export function readPanelAppLaunchEcho(raw: unknown): PanelAppLaunchEcho | null {
  const v = (raw as { v?: unknown } | null | undefined)?.v;
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? { v } : null;
}

export interface MyPanelAppsResult {
  apps: PanelAppNavEntry[];
  /** Eco da fase 2; null = backend da v1 ou fase desligada (a lista é só de menu). */
  launch: PanelAppLaunchEcho | null;
}

/**
 * Menu: o que o usuário vê. Com `launch` (front da fase 2) pede `?launch=1`: o backend
 * novo devolve também as apps só de contato/atendimento e as com variável, com
 * `placements`/`needsLaunch` e o eco; o backend da v1 ignora o parâmetro e devolve a
 * lista de sempre, sem eco (nunca tratar a lista sem eco como da fase 2).
 */
export async function fetchMyPanelApps(
  versions?: PanelAppNoticeVersions,
  opts?: { launch?: boolean }
): Promise<MyPanelAppsResult> {
  const params: Record<string, number> = {};
  if (versions?.tenant) params.vt = versions.tenant;
  if (versions?.global) params.vg = versions.global;
  if (opts?.launch) params.launch = 1;
  const { data } = await api.get<{ apps?: PanelAppNavEntry[]; launch?: unknown }>("/panel-apps/mine", {
    params: Object.keys(params).length ? params : undefined,
    ...BACKGROUND_REQUEST,
    skipNoPermissionToast: true,
  });
  const launch = opts?.launch ? readPanelAppLaunchEcho(data?.launch) : null;
  const apps = Array.isArray(data?.apps) ? data.apps : [];
  // Sem o eco os campos da fase 2 não valem (nunca vêm de backend da v1, mas a lista é tratada como v1).
  return {
    apps: launch ? apps : apps.map(({ placements: _p, needsLaunch: _n, ...rest }) => rest),
    launch,
  };
}

export interface PanelAppLaunchBody {
  placement: PanelAppPlacement;
  contactId?: number;
  ticketId?: number;
  /**
   * Só no lugar "contact": atendimento pelo qual a tela chegou ao contato (`?ticketId=` do
   * perfil). O servidor só o usa para LIBERAR quem vê o contato por esse atendimento.
   */
  ticketIdHint?: number;
  /** Modo ao vivo ligado no clique: o servidor tira os dados do contato (D8). */
  liveMode?: boolean;
}

export interface PanelAppLaunchResult {
  url: string;
  expiresAt: string | null;
}

/**
 * Lançamento (rota única, Ag2-15): o front manda SÓ ids; o servidor confere o acesso,
 * mascara (D7/D8), monta e assina e devolve o link final. Erro = o response do
 * interceptor (código por `getBackendErrorCode`; 404 SEM código = backend da v1).
 */
export async function launchPanelApp(appId: number, body: PanelAppLaunchBody): Promise<PanelAppLaunchResult> {
  const payload: Record<string, unknown> = { placement: body.placement };
  if (body.placement !== "menu" && typeof body.contactId === "number") payload.contactId = body.contactId;
  if (body.placement === "ticket" && typeof body.ticketId === "number") payload.ticketId = body.ticketId;
  if (body.placement === "contact" && typeof body.ticketIdHint === "number") payload.ticketIdHint = body.ticketIdHint;
  if (body.liveMode === true) payload.liveMode = true;
  const { data } = await api.post<{ url?: unknown; expiresAt?: unknown }>(`/panel-apps/${appId}/launch`, payload, {
    skipNoPermissionToast: true,
  });
  const url = typeof data?.url === "string" ? data.url : "";
  if (!url) throw new Error("ERR_PANEL_APP_URL_INVALID");
  return { url, expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : null };
}

/** "Gerar nova chave" da ficha assinada (a anterior deixa de valer na hora). */
export async function rotatePanelAppSigningKey(appId: number, scope: PanelAppScope): Promise<PanelAppSigningKeyInfo> {
  const path = scope === "global" ? `/panel-apps-global/${appId}/signing-key` : `/panel-apps/${appId}/signing-key`;
  const { data } = await api.post<{ signingKey?: PanelAppSigningKeyInfo }>(path, {});
  if (!data?.signingKey || typeof data.signingKey.publicKeyBase64 !== "string") {
    throw new Error("ERR_PANEL_APP_KEY_GENERATION_FAILED");
  }
  return data.signingKey;
}

// ── Gestão da empresa ──────────────────────────────────────────────────────

export async function fetchPanelAppsManage(): Promise<PanelAppManageList> {
  const { data } = await api.get<PanelAppManageList>("/panel-apps");
  return {
    own: Array.isArray(data?.own) ? data.own : null,
    global: Array.isArray(data?.global) ? data.global : [],
    maxApps: typeof data?.maxApps === "number" ? data.maxApps : 50,
    launch: readPanelAppLaunchEcho(data?.launch),
  };
}

export async function fetchPanelAppOptions(): Promise<PanelAppOptions> {
  const { data } = await api.get<PanelAppOptions>("/panel-apps/options");
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    teams: Array.isArray(data?.teams) ? data.teams : [],
    customProfiles: Array.isArray(data?.customProfiles) ? data.customProfiles : [],
  };
}

export async function createPanelApp(input: PanelAppInput): Promise<PanelAppManageItem> {
  const { data } = await api.post<{ app: PanelAppManageItem }>("/panel-apps", input);
  return data.app;
}

export async function updatePanelApp(id: number, input: PanelAppInput): Promise<PanelAppManageItem> {
  const { data } = await api.put<{ app: PanelAppManageItem }>(`/panel-apps/${id}`, input);
  return data.app;
}

export async function deletePanelApp(id: number): Promise<void> {
  await api.delete(`/panel-apps/${id}`);
}

export async function movePanelApp(id: number, direction: "up" | "down"): Promise<void> {
  await api.post(`/panel-apps/${id}/move`, { direction });
}

/** Ocultar/mostrar uma app GLOBAL nesta empresa (D24: fora da trava do plano). */
export async function setGlobalPanelAppHidden(id: number, hidden: boolean): Promise<void> {
  await api.put(`/panel-apps/${id}/hidden`, { hidden });
}

// ── Gestão do superadmin ───────────────────────────────────────────────────

export async function fetchGlobalPanelApps(): Promise<GlobalPanelAppItem[]> {
  const { data } = await api.get<{ apps?: GlobalPanelAppItem[] }>("/panel-apps-global");
  return Array.isArray(data?.apps) ? data.apps : [];
}

/** Mesma lista com o eco da fase 2 (`launch`), para a tela do superadmin. */
export async function fetchGlobalPanelAppsManage(): Promise<{
  apps: GlobalPanelAppItem[];
  launch: PanelAppLaunchEcho | null;
}> {
  const { data } = await api.get<{ apps?: GlobalPanelAppItem[]; launch?: unknown }>("/panel-apps-global");
  return {
    apps: Array.isArray(data?.apps) ? data.apps : [],
    launch: readPanelAppLaunchEcho(data?.launch),
  };
}

export async function createGlobalPanelApp(input: GlobalPanelAppInput): Promise<GlobalPanelAppItem> {
  const { data } = await api.post<{ app: GlobalPanelAppItem }>("/panel-apps-global", input);
  return data.app;
}

export async function updateGlobalPanelApp(id: number, input: GlobalPanelAppInput): Promise<GlobalPanelAppItem> {
  const { data } = await api.put<{ app: GlobalPanelAppItem }>(`/panel-apps-global/${id}`, input);
  return data.app;
}

export async function deleteGlobalPanelApp(id: number): Promise<void> {
  await api.delete(`/panel-apps-global/${id}`);
}

export async function moveGlobalPanelApp(id: number, direction: "up" | "down"): Promise<void> {
  await api.post(`/panel-apps-global/${id}/move`, { direction });
}

/**
 * Todos os planos para o alvo da app global. `GET /plan/?scope=admin` pagina de 40 em 40
 * (`hasMore`); sem isto o 41º plano não aparecia para escolher. Teto de 25 páginas.
 */
export async function fetchAllPlansForTarget(): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const { data } = await api.get("/plan/", { params: { scope: "admin", pageNumber: page } });
    const rows = Array.isArray(data) ? data : data?.plan || data?.plans;
    if (Array.isArray(rows)) out.push(...rows);
    if (Array.isArray(data) || data?.hasMore !== true || !Array.isArray(rows) || rows.length === 0) break;
  }
  return out;
}

// ── Conferência de embed (rota do servidor do front, §5.6) ─────────────────

/**
 * "Testar": o servidor do front busca só os cabeçalhos do site (com a guarda anti-SSRF)
 * e diz se ele aceita ser aberto dentro do painel. POST com corpo — a URL pode ter token
 * e nunca vai na querystring. Falha de rede/limite = `unknown` (nunca impede salvar).
 */
export async function checkPanelAppEmbed(url: string): Promise<PanelAppEmbedCheckResult> {
  try {
    const res = await fetch("/api/panel-app-embed-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, origin: typeof window !== "undefined" ? window.location.origin : "" }),
    });
    if (!res.ok) return { result: "unknown", reason: res.status === 429 ? "rate_limited" : `http_${res.status}` };
    const body = (await res.json()) as Partial<PanelAppEmbedCheckResult>;
    const result = body?.result === "ok" || body?.result === "blocked" ? body.result : "unknown";
    return { result, reason: typeof body?.reason === "string" ? body.reason : "" };
  } catch {
    return { result: "unknown", reason: "network" };
  }
}
