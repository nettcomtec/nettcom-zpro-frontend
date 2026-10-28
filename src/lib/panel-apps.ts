import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Calendar,
  CalendarCheck,
  ClipboardList,
  FileText,
  FileSignature,
  Folder,
  Briefcase,
  Building2,
  BarChart3,
  PieChart,
  LineChart,
  Table,
  Database,
  ShoppingCart,
  Package,
  Truck,
  Receipt,
  Wallet,
  CreditCard,
  DollarSign,
  Users,
  UserRound,
  Contact,
  Headset,
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  Globe,
  Link as LinkIcon,
  BookOpen,
  GraduationCap,
  Utensils,
  Bed,
  Car,
  Wrench,
  Settings,
  Shield,
  Star,
  HeartPulse,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Aplicativos personalizados (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md §5.3).
 * Espelho de backend/src/services/PanelAppServices/PanelAppRulesZPRO.ts (listas e
 * tetos — mudar um exige o outro). Este arquivo não importa o store das apps (evita
 * ciclo store → service → lib); o hook da lista visível mora no store.
 */

// ── Listas (espelho do backend) ────────────────────────────────────────────

export const PANEL_APP_CATEGORIES = [
  "ferramentas",
  "atendimento",
  "comunicacao-marketing",
  "gestao",
  "administracao",
  "automacao",
  "gestao-comercial",
  "configuracao",
] as const;
export type PanelAppCategory = (typeof PANEL_APP_CATEGORIES)[number];

export const PANEL_APP_OPEN_MODES = ["embed", "new_tab"] as const;
export type PanelAppOpenMode = (typeof PANEL_APP_OPEN_MODES)[number];

/** Perfis base que veem a app. `custom` = todo perfil personalizado. */
export const PANEL_APP_PROFILES = ["admin", "super", "user", "custom"] as const;
export type PanelAppProfile = (typeof PANEL_APP_PROFILES)[number];

export const PANEL_APP_EMBED_CHECKS = ["ok", "blocked", "unknown"] as const;
export type PanelAppEmbedCheck = (typeof PANEL_APP_EMBED_CHECKS)[number];

export type PanelAppScope = "tenant" | "global";

export const MAX_TENANT_APPS = 50;
export const MAX_GLOBAL_APPS = 50;
export const MAX_GRANT_USERS = 500;
export const MAX_GRANT_TEAMS = 200;
export const MAX_GRANT_CUSTOM_PROFILES = 100;
export const MAX_TARGET_TENANTS = 500;
export const MAX_TARGET_PLANS = 100;
export const PANEL_APP_NAME_MAX = 60;
export const PANEL_APP_URL_MAX = 2048;

/** Ícones da lista curada (import nominal — nunca o pacote inteiro). Chave = valor gravado. */
export const PANEL_APP_ICONS: Record<string, LucideIcon> = {
  "app-window": AppWindow,
  calendar: Calendar,
  "calendar-check": CalendarCheck,
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  "file-signature": FileSignature,
  folder: Folder,
  briefcase: Briefcase,
  "building-2": Building2,
  "bar-chart-3": BarChart3,
  "pie-chart": PieChart,
  "line-chart": LineChart,
  table: Table,
  database: Database,
  "shopping-cart": ShoppingCart,
  package: Package,
  truck: Truck,
  receipt: Receipt,
  wallet: Wallet,
  "credit-card": CreditCard,
  "dollar-sign": DollarSign,
  users: Users,
  "user-round": UserRound,
  contact: Contact,
  headset: Headset,
  "message-square": MessageSquare,
  mail: Mail,
  phone: Phone,
  "map-pin": MapPin,
  globe: Globe,
  link: LinkIcon,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  utensils: Utensils,
  bed: Bed,
  car: Car,
  wrench: Wrench,
  settings: Settings,
  shield: Shield,
  star: Star,
  "heart-pulse": HeartPulse,
};

export const PANEL_APP_ICON_KEYS: string[] = Object.keys(PANEL_APP_ICONS);

export function getPanelAppIcon(key: string | null | undefined): LucideIcon {
  return (key && PANEL_APP_ICONS[key]) || AppWindow;
}

// ── Fase 2: onde a app aparece (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md) ──

/** Onde a app aparece: menu lateral, ação "Abrir em…" do contato e do atendimento. */
export const PANEL_APP_PLACEMENTS = ["menu", "contact", "ticket"] as const;
export type PanelAppPlacement = (typeof PANEL_APP_PLACEMENTS)[number];

/** Eco do backend com a fase 2 ligada e pronta (`launch: { v: 1 }` no `/mine?launch=1` e na gestão). */
export interface PanelAppLaunchEcho {
  v: number;
}

/** Parte pública da chave da ficha assinada (a privada nunca sai do servidor). */
export interface PanelAppSigningKeyInfo {
  keyId: string;
  publicKeyBase64: string;
  publicKeyPem: string;
  createdAt: string | null;
  /** Origem em que a chave nasceu: trocar o endereço para outra origem gera chave nova (D15). */
  origin?: string;
}

// ── Contrato com o backend (rotas de §5.2) ─────────────────────────────────

/**
 * Item do menu — `GET /panel-apps/mine` → `{ apps: PanelAppNavEntry[] }` (empresa primeiro,
 * depois provedor). `placements`/`needsLaunch` só vêm com o eco da fase 2 (`?launch=1`):
 * ausentes = app da v1 (só menu, abre pelo endereço gravado).
 */
export interface PanelAppNavEntry {
  id: number;
  scope: PanelAppScope;
  name: string;
  url: string;
  icon: string;
  category: PanelAppCategory | string;
  position: number;
  openMode: PanelAppOpenMode;
  embedCheck: PanelAppEmbedCheck | null;
  placements?: PanelAppPlacement[];
  /** Endereço com variável: abre por lançamento (`POST /panel-apps/:id/launch`), nunca pelo `url`. */
  needsLaunch?: boolean;
}

export interface PanelAppRef {
  id: number;
  name: string;
}

/** App da empresa na gestão (`GET /panel-apps` → `own`). Inclui as inativas. */
export interface PanelAppManageItem {
  id: number;
  name: string;
  url: string;
  icon: string;
  category: PanelAppCategory | string;
  position: number;
  openMode: PanelAppOpenMode;
  isActive: boolean;
  profiles: PanelAppProfile[];
  embedCheck: PanelAppEmbedCheck | null;
  embedCheckedAt: string | null;
  users: PanelAppRef[];
  teams: PanelAppRef[];
  customProfiles: PanelAppRef[];
  /** Fase 2 (só com o eco): onde aparece, se abre por lançamento e a chave da ficha. */
  placements?: PanelAppPlacement[];
  needsLaunch?: boolean;
  signingKey?: PanelAppSigningKeyInfo | null;
  signingKeyUnreadable?: boolean;
  /** Só na resposta do POST/PUT: a chave foi trocada nesta gravação (domínio novo — D15). */
  signingKeyRotated?: boolean;
}

/** App global que alcança a empresa (`GET /panel-apps` → `global`), com a ocultação. */
export interface PanelAppProviderItem {
  id: number;
  name: string;
  icon: string;
  category: PanelAppCategory | string;
  openMode: PanelAppOpenMode;
  hidden: boolean;
}

/**
 * `GET /panel-apps`. `own === null` = plano sem o recurso "Aplicativos personalizados"
 * (D24: a página mostra só "Aplicativos do provedor").
 */
export interface PanelAppManageList {
  own: PanelAppManageItem[] | null;
  global: PanelAppProviderItem[];
  maxApps: number;
  /** Eco da fase 2 (ausente = backend da v1 ou fase desligada). */
  launch?: PanelAppLaunchEcho | null;
}

/** `GET /panel-apps/options` — nomes para os seletores (o gestor personalizado não lê /custom-profiles). */
export interface PanelAppOptions {
  users: PanelAppRef[];
  teams: PanelAppRef[];
  customProfiles: PanelAppRef[];
}

/**
 * Corpo de `POST /panel-apps` e `PUT /panel-apps/:appId`. No PUT tudo é opcional;
 * `userIds`/`groupIds`/`customProfileIds` AUSENTES = não mexer naquele tipo de vínculo.
 */
export interface PanelAppInput {
  name?: string;
  url?: string;
  icon?: string;
  category?: string;
  openMode?: PanelAppOpenMode;
  isActive?: boolean;
  profiles?: PanelAppProfile[];
  embedCheck?: PanelAppEmbedCheck | null;
  userIds?: number[];
  groupIds?: number[];
  customProfileIds?: number[];
  /** Fase 2: só enviar com `launchSupported` (backend da v1 ignora; ausente = não mexe). */
  placements?: PanelAppPlacement[];
}

/** App global na tela do superadmin (`GET /panel-apps-global` → `{ apps }`). */
export interface GlobalPanelAppItem {
  id: number;
  name: string;
  url: string;
  icon: string;
  category: PanelAppCategory | string;
  position: number;
  openMode: PanelAppOpenMode;
  isActive: boolean;
  profiles: PanelAppProfile[];
  embedCheck: PanelAppEmbedCheck | null;
  embedCheckedAt: string | null;
  allTenants: boolean;
  targetTenantIds: number[];
  targetPlanIds: number[];
  showToSuperadmin: boolean;
  /** Fase 2 (só com o eco). Global = sempre `["menu"]` (D4). */
  placements?: PanelAppPlacement[];
  needsLaunch?: boolean;
  signingKey?: PanelAppSigningKeyInfo | null;
  signingKeyUnreadable?: boolean;
  signingKeyRotated?: boolean;
}

/** Corpo de `POST /panel-apps-global` e `PUT /panel-apps-global/:appId`. */
export interface GlobalPanelAppInput {
  name?: string;
  url?: string;
  icon?: string;
  category?: string;
  openMode?: PanelAppOpenMode;
  isActive?: boolean;
  profiles?: PanelAppProfile[];
  embedCheck?: PanelAppEmbedCheck | null;
  allTenants?: boolean;
  targetTenantIds?: number[];
  targetPlanIds?: number[];
  showToSuperadmin?: boolean;
}

/** Resposta da conferência de embed (`POST /api/panel-app-embed-check`, rota do front). */
export interface PanelAppEmbedCheckResult {
  result: PanelAppEmbedCheck;
  reason: string;
}

// ── Códigos de erro do backend ─────────────────────────────────────────────

export const PANEL_APP_ERROR_CODES = [
  "ERR_PANEL_APP_URL_INVALID",
  "ERR_PANEL_APP_HTTPS_REQUIRED",
  "ERR_PANEL_APP_SAME_ORIGIN",
  "ERR_PANEL_APP_LIMIT",
  "ERR_PANEL_APP_NAME_REQUIRED",
  "ERR_PANEL_APP_INVALID_GRANT",
  "ERR_PANEL_APP_NOT_FOUND",
  "ERR_PANEL_APPS_UNAVAILABLE",
  "ERR_PANEL_APPS_DISABLED",
  "ERR_PANEL_APPS_NOT_READY",
  // Fase 2 — gestão (endereço com variáveis e chave da ficha)
  "ERR_PANEL_APP_VARIABLE_IN_HOST",
  "ERR_PANEL_APP_VARIABLE_IN_PATH",
  "ERR_PANEL_APP_VARIABLE_NOT_ALLOWED",
  "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED",
  "ERR_PANEL_APP_LAUNCH_NOT_READY",
  "ERR_PANEL_APP_KEY_GENERATION_FAILED",
] as const;

/**
 * Códigos do lançamento (`POST /panel-apps/:id/launch`) — chave i18n
 * `panelAppLaunch.errors.<código>` (e `panelAppLaunch.errors.generic` para o resto).
 */
export const PANEL_APP_LAUNCH_ERROR_CODES = [
  "ERR_PANEL_APP_LAUNCH_DISABLED",
  "ERR_PANEL_APP_LAUNCH_NOT_READY",
  "ERR_PANEL_APP_NOT_FOUND",
  "ERR_PANEL_APP_PLACEMENT_NOT_ALLOWED",
  "ERR_PANEL_APP_CONTEXT_INVALID",
  "ERR_PANEL_APP_CONTEXT_NOT_FOUND",
  "ERR_PANEL_APP_CONTEXT_FORBIDDEN",
  "ERR_PANEL_APP_KEY_MISSING",
  "ERR_PANEL_APP_KEY_UNREADABLE",
  "ERR_PANEL_APP_KEY_ORIGIN_CHANGED",
  "ERR_PANEL_APP_URL_INVALID",
  "ERR_PANEL_APP_URL_TOO_LONG",
  "ERR_PANEL_APP_VARIABLE_IN_HOST",
  "ERR_PANEL_APP_VARIABLE_IN_PATH",
  "ERR_PANEL_APP_VARIABLE_NOT_ALLOWED",
  "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED",
  "ERR_PANEL_APP_HTTPS_REQUIRED",
] as const;
export type PanelAppLaunchErrorCode = (typeof PANEL_APP_LAUNCH_ERROR_CODES)[number];

// ── Menu ───────────────────────────────────────────────────────────────────

/** Chave do item de menu (sidebar, busca rápida) — nunca o href (duas apps "nova aba" podem ter a mesma URL). */
export const panelAppNavKey = (app: Pick<PanelAppNavEntry, "id">): string => `panel-app-${app.id}`;

/** Endereço do visualizador de uma app embutida (D25). */
export const panelAppViewHref = (id: number): string => `/ferramentas/${id}`;

export const PANEL_APP_VIEW_ROUTE = /^\/ferramentas\/\d+$/;

/**
 * Categoria do menu onde a app entra, por perfil (§5.3). A categoria canônica que o
 * perfil não tem cai em "ferramentas"; o chamador ainda cai em "ferramentas" quando a
 * categoria existe mas ficou vazia depois dos gates.
 */
export function resolvePanelAppCategoryKey(profile: string | null | undefined, canonical: string): string {
  const p = profile || "user";
  switch (canonical) {
    case "atendimento":
    case "comunicacao-marketing":
    case "gestao":
      return p === "superadmin" ? "ferramentas" : canonical;
    case "administracao":
      if (p === "super") return "sup-administracao";
      if (p === "admin" || p === "custom") return "adm-administracao";
      return "ferramentas";
    case "automacao":
      if (p === "super") return "sup-automacao";
      if (p === "admin" || p === "custom") return "adm-automacao";
      return "ferramentas";
    case "gestao-comercial":
      if (p === "super") return "sup-gestao-comercial";
      if (p === "admin" || p === "custom") return "adm-gestao-comercial";
      return "ferramentas";
    case "configuracao":
      return p === "admin" || p === "custom" ? "adm-configuracao" : "ferramentas";
    default:
      return "ferramentas";
  }
}

/**
 * Antes de TODO uso da URL em `src`/`href`/`window.open` (Ag1-11): embutida só `https:`;
 * nova aba `http:` ou `https:`; nunca a origem do próprio painel nem `javascript:`/`data:`.
 */
export function isSafePanelAppUrl(url: string | null | undefined, openMode: string): boolean {
  if (!url || typeof url !== "string" || url.length > PANEL_APP_URL_MAX) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || !parsed.hostname) return false;
  if (parsed.protocol === "http:") {
    if (openMode !== "new_tab") return false;
  } else if (parsed.protocol !== "https:") {
    return false;
  }
  if (typeof window !== "undefined" && parsed.origin === window.location.origin) return false;
  return true;
}

// ── Fase 2: endereço com variáveis (§5.0, §5.2 e §5.5) ─────────────────────

// Espelho de backend/src/services/PanelAppServices/PanelAppTemplateZPRO.ts (bloco entre "Espelho de" e "Fim do espelho"). Mudar um exige o outro: frontend/src/tests/lib/panel-app-template.test.ts compara os dois.
export const PANEL_APP_URL_VARIABLES = [
  { name: "contactId", group: "contact", pathSafe: true },
  { name: "name", group: "contact", pathSafe: false },
  { name: "firstName", group: "contact", pathSafe: false },
  { name: "lastName", group: "contact", pathSafe: false },
  { name: "phoneNumber", group: "contact", pathSafe: true },
  { name: "email", group: "contact", pathSafe: false },
  { name: "businessName", group: "contact", pathSafe: false },
  { name: "ticketId", group: "ticket", pathSafe: true },
  { name: "protocol", group: "ticket", pathSafe: true },
  { name: "currentUserId", group: "user", pathSafe: true },
  { name: "currentUserName", group: "user", pathSafe: false },
  { name: "currentUserEmail", group: "user", pathSafe: false },
  { name: "tenantId", group: "tenant", pathSafe: true },
  { name: "token", group: "token", pathSafe: true },
] as const;

export type PanelAppUrlVariableName = (typeof PANEL_APP_URL_VARIABLES)[number]["name"];
export type PanelAppUrlVariableGroup = (typeof PANEL_APP_URL_VARIABLES)[number]["group"];

/** Grupos que a app GLOBAL pode usar (D4: quem abre, a empresa e a ficha; nunca o cliente). */
export const PANEL_APP_GLOBAL_VARIABLE_GROUPS: readonly PanelAppUrlVariableGroup[] = ["user", "tenant", "token"];

/** Teto do link final (modelo + valores + ficha). */
export const PANEL_APP_LAUNCHED_URL_MAX = 4096;

export type PanelAppTemplateIssue =
  | "ERR_PANEL_APP_URL_INVALID"
  | "ERR_PANEL_APP_VARIABLE_IN_HOST"
  | "ERR_PANEL_APP_VARIABLE_IN_PATH"
  | "ERR_PANEL_APP_VARIABLE_NOT_ALLOWED"
  | "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED";

export interface PanelAppTemplateMatch {
  name: PanelAppUrlVariableName;
  index: number;
  length: number;
}

// {{nome}} ou %7B%7Bnome%7D%7D: o hex não diferencia maiúsculas, o nome diferencia.
const TEMPLATE_VARIABLE_PATTERN = "\\{\\{([A-Za-z]+)\\}\\}|%7[Bb]%7[Bb]([A-Za-z]+)%7[Dd]%7[Dd]";

const findUrlVariable = (name: string) => PANEL_APP_URL_VARIABLES.find((v) => v.name === name);

/** Ocorrências de variável CONHECIDA no texto, na ordem em que aparecem. */
export function findTemplateVariableMatches(text: string): PanelAppTemplateMatch[] {
  const out: PanelAppTemplateMatch[] = [];
  if (typeof text !== "string" || !text) return out;
  const re = new RegExp(TEMPLATE_VARIABLE_PATTERN, "g");
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const name = m[1] || m[2] || "";
    const def = findUrlVariable(name);
    if (def) out.push({ name: def.name, index: m.index, length: m[0].length });
    m = re.exec(text);
  }
  return out;
}

/** Nomes das variáveis conhecidas no texto, sem repetição, na ordem em que aparecem. */
export function findTemplateVariables(text: string): PanelAppUrlVariableName[] {
  const out: PanelAppUrlVariableName[] = [];
  findTemplateVariableMatches(text).forEach((m) => {
    if (!out.includes(m.name)) out.push(m.name);
  });
  return out;
}

/** O endereço tem variável conhecida (a app abre por lançamento)? */
export function templateNeedsLaunch(url: string | null | undefined): boolean {
  return typeof url === "string" && findTemplateVariableMatches(url).length > 0;
}

/** Troca cada variável conhecida pelo texto devolvido por `valueOf` (já pronto para o endereço). */
export function replaceTemplateVariables(text: string, valueOf: (name: PanelAppUrlVariableName) => string): string {
  const matches = findTemplateVariableMatches(text);
  if (!matches.length) return text;
  let out = "";
  let last = 0;
  matches.forEach((m) => {
    out += text.slice(last, m.index) + valueOf(m.name);
    last = m.index + m.length;
  });
  return out + text.slice(last);
}

/** Posição do 1º `?` ou `#` (fim do caminho); -1 = sem query nem fragmento. */
const templatePathEnd = (text: string): number => {
  const q = text.indexOf("?");
  const h = text.indexOf("#");
  if (q < 0) return h;
  if (h < 0) return q;
  return Math.min(q, h);
};

/** Esquema, usuário, senha, host e porta (null = não abre como endereço). */
const templateAuthority = (text: string): string | null => {
  try {
    const u = new URL(text);
    return [u.protocol, u.username, u.password, u.hostname, u.port].join("|");
  } catch {
    return null;
  }
};

/**
 * Regras do endereço com variáveis, na ordem: (a) a variável não muda esquema, usuário,
 * host nem porta (troca toda variável por "a" e por "b"; os dois precisam abrir com a
 * MESMA autoridade); (b) texto livre só depois do 1º `?` ou `#` (no caminho, `..`, `.`
 * e `%2e%2e` mudam a página e o vazio vira `//`); (c) app global só com variável de quem
 * abre, da empresa ou a ficha; (d) ficha só com https (D13). Texto CRU. null = sem problema.
 */
export function checkPanelAppTemplate(raw: string, opts: { scope: "tenant" | "global" }): PanelAppTemplateIssue | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  const matches = findTemplateVariableMatches(text);
  if (!matches.length) return null;

  const withA = templateAuthority(replaceTemplateVariables(text, () => "a"));
  const withB = templateAuthority(replaceTemplateVariables(text, () => "b"));
  if (withA === null || withB === null) {
    // Sem as variáveis o endereço também não abre: o problema não é a variável.
    if (templateAuthority(replaceTemplateVariables(text, () => "")) === null) return "ERR_PANEL_APP_URL_INVALID";
    return "ERR_PANEL_APP_VARIABLE_IN_HOST";
  }
  if (withA !== withB) return "ERR_PANEL_APP_VARIABLE_IN_HOST";

  const pathEnd = templatePathEnd(text);
  for (const m of matches) {
    const def = findUrlVariable(m.name);
    if (def && !def.pathSafe && (pathEnd < 0 || m.index < pathEnd)) return "ERR_PANEL_APP_VARIABLE_IN_PATH";
  }

  if (opts.scope === "global") {
    for (const m of matches) {
      const def = findUrlVariable(m.name);
      if (def && !PANEL_APP_GLOBAL_VARIABLE_GROUPS.includes(def.group)) return "ERR_PANEL_APP_VARIABLE_NOT_ALLOWED";
    }
  }

  if (matches.some((m) => m.name === "token") && withA.split("|")[0] !== "https:") {
    return "ERR_PANEL_APP_TOKEN_HTTPS_REQUIRED";
  }
  return null;
}
// Fim do espelho.

/** Mesmas regras a–d do servidor, para a tela avisar antes de salvar (nome usado no plano). */
export const validatePanelAppTemplateClient = checkPanelAppTemplate;

/** Variáveis da app global (D4): só quem abre, a empresa e a ficha. */
export function panelAppVariablesForScope(scope: PanelAppScope): (typeof PANEL_APP_URL_VARIABLES)[number][] {
  return PANEL_APP_URL_VARIABLES.filter(
    (v) => scope === "tenant" || PANEL_APP_GLOBAL_VARIABLE_GROUPS.includes(v.group)
  );
}

/** Valores de EXEMPLO (nunca dado real — Ag2-11a): "Testar" e a conferência ao salvar. */
const PANEL_APP_SAMPLE_VALUES: Record<PanelAppUrlVariableName, string> = {
  contactId: "123",
  name: "Ana Lima",
  firstName: "Ana",
  lastName: "Lima",
  phoneNumber: "5511999990000",
  email: "ana@example.com",
  businessName: "Example",
  ticketId: "456",
  protocol: "202621101200456",
  currentUserId: "7",
  currentUserName: "Bia",
  currentUserEmail: "bia@example.com",
  tenantId: "1",
  token: "TOKEN",
};

/** O endereço digitado com valores de exemplo no lugar das variáveis (texto sem variável volta igual). */
export function samplePanelAppUrl(raw: string): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  return replaceTemplateVariables(text, (name) => encodeURIComponent(PANEL_APP_SAMPLE_VALUES[name] ?? ""));
}

const PANEL_APP_CONTEXT_GROUPS: readonly PanelAppUrlVariableGroup[] = ["contact", "ticket"];

/** Avisos (não bloqueiam) do endereço com variáveis, para o diálogo de cadastro. */
export interface PanelAppTemplateWarnings {
  /** Variável de contato/atendimento com "Menu lateral" marcado: abre vazia pelo menu. */
  emptyFromMenu: boolean;
  /** Variável de atendimento com "Contato" marcado: abre vazia pelo contato. */
  emptyFromContact: boolean;
  /** Variáveis no CAMINHO que podem vir vazias (o caminho ganha `//`). */
  maybeEmptyInPath: PanelAppUrlVariableName[];
  /** Endereço http com variável (sem ficha): os dados vão sem criptografia (D13). */
  httpWithVariables: boolean;
}

export function panelAppTemplateWarnings(
  raw: string,
  opts: { placements: readonly PanelAppPlacement[] }
): PanelAppTemplateWarnings {
  const text = typeof raw === "string" ? raw.trim() : "";
  const matches = findTemplateVariableMatches(text);
  const out: PanelAppTemplateWarnings = {
    emptyFromMenu: false,
    emptyFromContact: false,
    maybeEmptyInPath: [],
    httpWithVariables: false,
  };
  if (!matches.length) return out;
  const placements = opts.placements || [];
  const groupOf = (name: PanelAppUrlVariableName) => findUrlVariable(name)?.group;
  out.emptyFromMenu =
    placements.includes("menu") && matches.some((m) => PANEL_APP_CONTEXT_GROUPS.includes(groupOf(m.name) as PanelAppUrlVariableGroup));
  out.emptyFromContact = placements.includes("contact") && matches.some((m) => groupOf(m.name) === "ticket");
  const pathEnd = templatePathEnd(text);
  matches.forEach((m) => {
    if (pathEnd >= 0 && m.index >= pathEnd) return;
    const mayBeEmpty =
      m.name === "phoneNumber" ||
      (m.name === "contactId" && placements.includes("menu")) ||
      ((m.name === "ticketId" || m.name === "protocol") && (placements.includes("menu") || placements.includes("contact")));
    if (mayBeEmpty && !out.maybeEmptyInPath.includes(m.name)) out.maybeEmptyInPath.push(m.name);
  });
  try {
    out.httpWithVariables = new URL(samplePanelAppUrl(text)).protocol === "http:";
  } catch {
    out.httpWithVariables = false;
  }
  return out;
}

/** `isSafePanelAppUrl` para o LINK LANÇADO (até 4096, com valores e ficha). */
export function isSafeLaunchedPanelAppUrl(url: string | null | undefined, openMode: string): boolean {
  if (!url || typeof url !== "string" || url.length > PANEL_APP_LAUNCHED_URL_MAX) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || !parsed.hostname) return false;
  if (parsed.protocol === "http:") {
    if (openMode !== "new_tab") return false;
  } else if (parsed.protocol !== "https:") {
    return false;
  }
  if (typeof window !== "undefined" && parsed.origin === window.location.origin) return false;
  return true;
}

/**
 * Apps do MENU (sidebar, busca rápida, visualizador, recentes): sem `placements` (v1) ou
 * com "menu". Os consumidores da v1 só recebem estas (Ag1-9).
 */
export function selectMenuPanelApps(apps: PanelAppNavEntry[]): PanelAppNavEntry[] {
  return apps.filter((a) => !Array.isArray(a.placements) || a.placements.includes("menu"));
}

/** Apps da ação "Abrir em…" do contato/atendimento: só da empresa (D4) e com o lugar marcado. */
export function selectContextPanelApps(
  apps: PanelAppNavEntry[],
  placement: Exclude<PanelAppPlacement, "menu">
): PanelAppNavEntry[] {
  return apps.filter((a) => a.scope === "tenant" && Array.isArray(a.placements) && a.placements.includes(placement));
}

/**
 * ÚNICO seletor das apps visíveis — sidebar, busca rápida e visualizador (Ag1-7/Ag2-M8, D30):
 * com o interruptor "Aplicativos" do /tenants desligado, as apps da PRÓPRIA empresa
 * somem (menu, busca, recentes e link direto); as globais continuam.
 */
export function selectVisiblePanelApps(
  apps: PanelAppNavEntry[] | null | undefined,
  tenantMenuVisibility: Record<string, boolean> | null | undefined
): PanelAppNavEntry[] {
  if (!apps || apps.length === 0) return [];
  if (tenantMenuVisibility?.aplicativos === false) return apps.filter((a) => a.scope !== "tenant");
  return apps;
}

/**
 * Quem vê o item "Aplicativos" e abre a tela de gestão (`/aplicativos`): admin, ou
 * perfil personalizado ligado com `custom_apps_manage` e chave de menu `aplicativos`
 * não desmarcada; para todos, o interruptor do /tenants (`aplicativos`) não desligado.
 * `hasPermission` é seguro aqui: o admin já passou antes e só o personalizado chega nele.
 */
export function usePanelAppsManageVisible(): boolean {
  return useAuthStore((s) => {
    const user = s.user;
    if (!user) return false;
    if (s.tenantMenuVisibility?.aplicativos === false) return false;
    if (user.profile === "admin") return true;
    if (user.profile !== "custom") return false;
    if (!user.customProfileEnabled) return false;
    if (!s.hasPermission("custom_apps_manage")) return false;
    const menu = (user.customProfile?.menuPermissions as Record<string, boolean> | undefined) || {};
    return menu.aplicativos !== false;
  });
}

// ── Eventos ────────────────────────────────────────────────────────────────

/** Aviso de mudança nas apps da empresa (sala da empresa). */
export const PANEL_APPS_TENANT_EVENT = (tenantId: number | string): string => `${tenantId}:panelApps`;
/** Aviso de mudança nas apps globais (todas as salas, salas afetadas ou a do superadmin). */
export const PANEL_APPS_GLOBAL_EVENT = "panelApps:global";
/** Uso dentro da app embutida conta como atividade para o controle de inatividade (D16). */
export const USER_ACTIVITY_EVENT = "zpro:user-activity";
