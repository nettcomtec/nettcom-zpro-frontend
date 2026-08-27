/**
 * Espelho FRONTEND do registry de capabilities de plano.
 * Fonte da verdade: backend/src/config/PlanCapabilitiesZPRO.ts
 * (mantenha keys / categories / labelKeys / menuRoutes em sincronia).
 *
 * MODELO DE GATING (o plano é o TETO / nível superior):
 *
 *   visível/acessível  ⟺  planAllowsRoute(plano) AND menuVisibility(tenant) AND permissão(user)
 *
 * A camada de plano é ADITIVA: ela só pode RESTRINGIR. As limitações já existentes
 * por tenant (menuVisibility, flags) e por user (menuPermissions, restrictedUser,
 * customProfile) continuam valendo exatamente como antes — o plano entra como um
 * fator AND acima delas. Plano ausente (planFeatures null) => libera tudo
 * (grandfathering: tenants atuais não sofrem regressão).
 */

export interface PlanCapability {
  key: string;
  category: string;
  labelKey: string;
  menuRoutes: string[];
}

export const CAPABILITY_CATEGORIES = [
  "marketing",
  "automation",
  "ai",
  "crm",
  "social",
  "analytics",
  "integrations",
  "communication",
  "channels"
] as const;

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

export const PLAN_CAPABILITIES: PlanCapability[] = [
  { key: "campaigns",       category: "marketing",     labelKey: "planCap.campaigns",       menuRoutes: ["campanhas", "email-marketing"] },
  { key: "bulkSend",        category: "marketing",     labelKey: "planCap.bulkSend",        menuRoutes: ["massa"] },
  { key: "gallery",         category: "marketing",     labelKey: "planCap.gallery",         menuRoutes: ["galeria"] },
  { key: "quickMessages",   category: "marketing",     labelKey: "planCap.quickMessages",   menuRoutes: ["mensagens-rapidas"] },

  { key: "chatflow",        category: "automation",    labelKey: "planCap.chatflow",        menuRoutes: ["chat-flow"] },
  { key: "scheduling",      category: "automation",    labelKey: "planCap.scheduling",      menuRoutes: ["agendamentos"] },
  { key: "birthday",        category: "automation",    labelKey: "planCap.birthday",        menuRoutes: ["aniversarios"] },

  { key: "aiIntegrations",  category: "ai",            labelKey: "planCap.aiIntegrations",  menuRoutes: [] },

  { key: "funnelKanban",    category: "crm",           labelKey: "planCap.funnelKanban",    menuRoutes: ["funil", "kanban"] },
  { key: "tasks",           category: "crm",           labelKey: "planCap.tasks",           menuRoutes: ["tarefas"] },
  { key: "agenda",          category: "crm",           labelKey: "planCap.agenda",          menuRoutes: ["agenda"] },
  { key: "publicBooking",   category: "crm",           labelKey: "planCap.publicBooking",   menuRoutes: ["agendamento-publico"] },
  { key: "productCatalog",  category: "crm",           labelKey: "planCap.productCatalog",  menuRoutes: ["catalogo"] },
  // Cobrança (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md D8.
  // No ENVIO o gate roda DENTRO do handler de template, só depois de detectar que
  // o template é de cobrança (gatear por rota tiraria template normal de quem não
  // tem a cap). A página /cobrancas é exclusiva da capability, então entra aqui
  // como rota de menu. Cap ausente no plano = liberado (grandfathering).
  { key: "payments",        category: "crm",           labelKey: "planCap.payments",        menuRoutes: ["cobrancas"] },

  { key: "socialComments",  category: "social",        labelKey: "planCap.socialComments",  menuRoutes: ["facebook-comentarios", "instagram-comentarios", "instagram-automacao", "tiktok-comentarios", "youtube-comentarios"] },

  { key: "nps",             category: "analytics",     labelKey: "planCap.nps",             menuRoutes: ["avaliacoes"] },
  { key: "reports",         category: "analytics",     labelKey: "planCap.reports",         menuRoutes: ["relatorios", "painel-atendimentos"] },
  { key: "protocols",       category: "analytics",     labelKey: "planCap.protocols",       menuRoutes: ["protocolos"] },
  { key: "callLog",         category: "analytics",     labelKey: "planCap.callLog",         menuRoutes: ["logligacao"] },

  { key: "wavoip",          category: "communication", labelKey: "planCap.wavoip",          menuRoutes: ["wavoip"] },
  { key: "webphoneSip",     category: "communication", labelKey: "planCap.webphoneSip",     menuRoutes: [] },

  { key: "apiExternal",     category: "integrations",  labelKey: "planCap.apiExternal",     menuRoutes: ["api-service"] },
  { key: "woocommerce",     category: "integrations",  labelKey: "planCap.woocommerce",     menuRoutes: ["woocommerce"] },
  { key: "nuvemshop",       category: "integrations",  labelKey: "planCap.nuvemshop",       menuRoutes: ["nuvemshop"] },
  { key: "googleCalendar",  category: "integrations",  labelKey: "planCap.googleCalendar",  menuRoutes: ["google-calendar"] },
  { key: "rocketChat",      category: "integrations",  labelKey: "planCap.rocketChat",      menuRoutes: ["chat-interno-rc"] },

  { key: "metaIntegrations", category: "channels",     labelKey: "planCap.metaIntegrations", menuRoutes: ["integracoes-meta"] }
];

export const CAPABILITY_KEYS: string[] = PLAN_CAPABILITIES.map(c => c.key);

const ROUTE_TO_CAPABILITY: Record<string, string> = PLAN_CAPABILITIES.reduce(
  (acc, c) => {
    c.menuRoutes.forEach(r => { acc[r] = c.key; });
    return acc;
  },
  {} as Record<string, string>
);

/** Snapshot de features do tenant (Tenant.planFeatures). */
export interface PlanFeatures {
  caps?: Record<string, boolean>;
  limits?: {
    maxUsers?: number;
    maxConnections?: number;
    maxQueues?: number;
    allowedChannels?: string[];
    channelConnectionLimits?: Record<string, number>;
  };
}

/** Capability que governa um routeName, ou null se for core (sempre liberado). */
export function capabilityForRoute(routeName: string): string | null {
  return ROUTE_TO_CAPABILITY[routeName] || null;
}

/**
 * O PLANO permite esta capability? (gate de nível superior — o teto).
 * null/ausente => true (grandfathering). caps[key] === false => false. Caso contrário => true.
 * NÃO incorpora tenant/user — esses são fatores AND adicionais avaliados por quem chama.
 */
export function planAllowsCapability(
  planFeatures: PlanFeatures | null | undefined,
  capKey: string
): boolean {
  if (!planFeatures || !planFeatures.caps) return true;
  return planFeatures.caps[capKey] !== false;
}

/** O PLANO permite esta rota do menu? Rota core (sem capability) => sempre true. */
export function planAllowsRoute(
  planFeatures: PlanFeatures | null | undefined,
  routeName: string | undefined
): boolean {
  if (!routeName) return true;
  const cap = capabilityForRoute(routeName);
  if (!cap) return true;
  return planAllowsCapability(planFeatures, cap);
}
