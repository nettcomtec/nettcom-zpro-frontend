import { create } from "zustand";
import { persist } from "zustand/middleware";
import { disconnectSocket } from "@/lib/socket";
import { resetAllStores } from "./reset-all-stores";
import { safeJsonParse } from "@/lib/safe-json-parse";
import {
  type CustomProfileSummary,
  type ICustomPermissions,
  type PermissionKey,
} from "@/types/custom-permissions";
import { planAllowsCapability, type PlanFeatures } from "@/lib/plan-capabilities";

const IDB_NAME = "zpro-auth";
const IDB_VERSION = 1;
const IDB_STORE = "session";

function openAuthDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e: any) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function setCurrentTenantInDB(tenantId: number): void {
  if (typeof window === "undefined" || !window.indexedDB) return;
  openAuthDB()
    .then((db) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ tenantId }, "current");
    })
    .catch(() => {});
}

function clearCurrentTenantFromDB(): void {
  if (typeof window === "undefined" || !window.indexedDB) return;
  openAuthDB()
    .then((db) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete("current");
    })
    .catch(() => {});
}

/** Personalização do /dashboard, persistida por usuário em User.configs.dashboardLayout. */
export interface DashboardLayout {
  order: string[];       // ordem dos blocos (seções)
  statsOrder: string[];  // ordem dos cards de indicadores dentro do bloco "stats"
  hidden: string[];      // ids ocultos (blocos ou cards)
}

export interface UserData {
  token: string;
  username: string;
  email: string;
  profile: string;
  userId: number;
  tenantId: number;
  queues: unknown[];
  blockWavoip: boolean;
  // SIP — flat fields returned by backend login
  sipEnabled?: boolean;
  sipServer?: string;
  sipPort?: number;
  sipUsername?: string;
  sipPassword?: string;
  sipTransport?: "ws" | "wss" | "udp";
  whatsappAllowed: unknown[];
  isOnline?: boolean;
  restrictedUser?: string | boolean; // 'enabled' | 'disabled' | boolean
  menuPermissions?: Record<string, boolean>;
  configs?: {
    filtrosAtendimento?: unknown;
    isDark?: boolean;
    pinnedTickets?: number[];
    supervisorViewDept?: string;
    dashboardLayout?: DashboardLayout;
  };
  // Constructed from flat SIP fields in setAuth
  sipConfig?: {
    server: string;
    port: number;
    username: string;
    password: string;
    transport: "ws" | "wss" | "udp";
  };
  wavoipTokens?: { token: string; inboxName: string }[];
  profilePicture?: string;
  phone?: string;
  // RBAC — perfil custom
  customProfileId?: number | null;
  customProfile?: CustomProfileSummary | null;
  customProfileEnabled?: boolean;
  // Troca de senha obrigatória (modo forceChange do tenant)
  mustChangePassword?: boolean;
}

export interface Configuracao {
  key: string;
  value: string;
}

interface AuthState {
  token: string | null;
  user: UserData | null;
  isAdmin: boolean;
  isSuporte: boolean;
  isAuthenticated: boolean;
  menuVisibility: Record<string, boolean>;
  blockedRoutes: string[];
  configuracoes: Configuracao[];
  supervisorAdmin: string; // 'enabled' | 'disabled'
  /** True after fetchTenantById completes and injectTenantSettings is called */
  tenantConfigsLoaded: boolean;
  /** True when tenant has at least one OVERDUE Asaas payment — locks navigation to payment settings */
  paymentOverdue: boolean;
  /** Smart Billing: current billing alert state */
  billingState: 'ok' | 'approaching' | 'due_today' | 'overdue_warning' | 'blocked';
  billingDaysInfo: { daysBeforeDue?: number; daysOverdue?: number; daysUntilBlock?: number; bankSlipUrl?: string };
  /** Snapshot das features do plano do tenant (Tenant.planFeatures). null => grandfathering (libera tudo). */
  planFeatures: PlanFeatures | null;

  setAuth: (data: UserData) => void;
  clearAuth: () => void;
  setMenuVisibility: (visibility: Record<string, boolean>) => void;
  setBlockedRoutes: (routes: string[]) => void;
  setConfiguracoes: (configuracoes: Configuracao[]) => void;
  /** Merges tenant-level key-value pairs into configuracoes (they are not in the Settings table) */
  injectTenantSettings: (settings: Record<string, string>) => void;
  setSupervisorAdmin: (value: string) => void;
  setTenantConfigsLoaded: (value: boolean) => void;
  getConfigValue: (key: string) => string | undefined;
  isRestrictedUser: () => boolean;
  isSupervisorAdmin: () => boolean;
  /** LGPD: tenant pode esconder dados de pagamento de usuários comuns. Default = enabled (esconde) */
  canViewPayments: () => boolean;
  /** Syncs SIP and other fields updated by Vue's atualizarUsuario() into the store */
  syncUserFromLocalStorage: () => void;
  /** Merges partial fields into user (used by refreshUser to update SIP config) */
  patchUser: (fields: Partial<UserData>) => void;
  setProfilePicture: (url: string) => void;
  setPinnedTickets: (ids: number[]) => void;
  /** Persiste o layout do dashboard no store + cache local (o backend recebe via updateUserConfigs). */
  setDashboardLayout: (layout: DashboardLayout) => void;
  setPaymentOverdue: (value: boolean) => void;
  setBillingState: (state: 'ok' | 'approaching' | 'due_today' | 'overdue_warning' | 'blocked') => void;
  setBillingDaysInfo: (info: { daysBeforeDue?: number; daysOverdue?: number; daysUntilBlock?: number; bankSlipUrl?: string }) => void;
  /** §6.2: gate de ação por permission key. Respeita ADMIN_ONLY_ACTIONS para super. */
  hasPermission: (key: PermissionKey) => boolean;
  /** Define o snapshot de features do plano (injetado ao carregar o tenant). */
  setPlanFeatures: (pf: PlanFeatures | null) => void;
  /** Gate de capability por PLANO (o teto). Superadmin e plano ausente => true. */
  hasFeature: (capKey: string) => boolean;
  /** Gate ÚNICO do WaVoIP: plano (teto) AND interruptor do tenant. */
  isWavoipEnabled: () => boolean;
  /** Gate ÚNICO do envio de cobrança (template ORDER_DETAILS). Espelha o backend. */
  canSendCharge: () => boolean;
}

const DEFAULT_FILTERS = {
  searchParam: "",
  pageNumber: 1,
  status: ["open", "pending"],
  showAll: false,
  count: null,
  queuesIds: [],
  whatsappIds: [],
  selectedUser: [],
  withUnreadMessages: false,
  isNotAssignedUser: false,
  includeNotQueueDefined: true,
  // extended fields
  includeClosed: false,
  orderAsc: false,
  selectedTagId: "",
  selectedKanbanId: "",
  isReversed: false,
  sortByAnswered: false,
  density: "comfortable",
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAdmin: false,
      isSuporte: false,
      isAuthenticated: false,
      menuVisibility: {},
      blockedRoutes: [],
      configuracoes: [],
      supervisorAdmin: "disabled",
      tenantConfigsLoaded: false,
      paymentOverdue: false,
      billingState: 'ok' as const,
      billingDaysInfo: {},
      planFeatures: null,

      setAuth: (data) => {
        // BUGFIX: `isSuporte` antes usava `email.includes("@")` — verdadeiro pra
        // QUALQUER email — fazendo `isAdmin` ser true pra todo mundo. Resultado:
        // atendente comum bypassava filtros de canal/permissao em telas que
        // usavam `isAdmin` do store (ex.: /contatos cSessionsOptions).
        // Suporte/admin sao papeis server-side; nao adivinhar no client.
        const isSuporte = false;
        const isAdmin = data.profile === "admin" || data.profile === "superadmin";

        // Construct sipConfig from flat SIP fields returned by backend login
        const sipConfig =
          data.sipEnabled && data.sipServer && data.sipUsername && data.sipPassword
            ? {
                server: data.sipServer,
                port: data.sipPort ?? 5060,
                username: data.sipUsername,
                password: data.sipPassword,
                transport: (data.sipTransport ?? "wss") as "ws" | "wss" | "udp",
              }
            : data.sipConfig ?? undefined;

        const enrichedData: UserData = { ...data, sipConfig };

        if (typeof window !== "undefined") {
          localStorage.setItem("token", JSON.stringify(data.token));
          localStorage.setItem("username", data.username);
          localStorage.setItem("profile", data.profile);
          localStorage.setItem("userId", String(data.userId));
          localStorage.setItem("usuario", JSON.stringify(enrichedData));
          localStorage.setItem("queues", JSON.stringify(data.queues));
          localStorage.setItem("bloquearWavoip", JSON.stringify(data.blockWavoip));
          localStorage.setItem("whatsappAllowed", JSON.stringify(data.whatsappAllowed));
          localStorage.setItem(
            "filtrosAtendimento",
            JSON.stringify(data.configs?.filtrosAtendimento || DEFAULT_FILTERS)
          );
          // Set lightweight cookie for Next.js middleware auth check
          const secureFlag = window.location.protocol === "https:" ? "Secure; " : "";
          document.cookie = `zpro_auth=1; path=/; ${secureFlag}SameSite=Lax; max-age=86400`;
          // Persist tenantId in IndexedDB so the service worker can validate push notifications
          setCurrentTenantInDB(data.tenantId);
        }

        set({
          token: data.token,
          user: enrichedData,
          isAdmin,
          isSuporte,
          isAuthenticated: true,
        });
      },

      clearAuth: () => {
        disconnectSocket();
        resetAllStores();
        // Higiene multi-tenant: limpa o cache de modulo do fetchWhatsapps (TTL 1,5s)
        // para que um login seguinte na mesma aba nao veja a lista do tenant anterior.
        // Import dinamico: estatico criaria ciclo auth-store -> whatsapp -> api -> auth-store.
        import("@/services/whatsapp").then((m) => m.clearWhatsappsCache()).catch(() => {});
        if (typeof window !== "undefined") {
          // Clear middleware auth cookie
          const secureFlag = window.location.protocol === "https:" ? "Secure; " : "";
          document.cookie = `zpro_auth=; path=/; ${secureFlag}max-age=0`;
          localStorage.removeItem("token");
          localStorage.removeItem("username");
          localStorage.removeItem("profile");
          localStorage.removeItem("userId");
          localStorage.removeItem("usuario");
          localStorage.removeItem("queues");
          localStorage.removeItem("bloquearWavoip");
          localStorage.removeItem("whatsappAllowed");
          localStorage.removeItem("filtrosAtendimento");
          localStorage.removeItem("menuVisibility");
          localStorage.removeItem("dashboardChartPanels");
          localStorage.removeItem("dashboardLayout");
          localStorage.removeItem("configuracoes");
          localStorage.removeItem("supervisorAdmin");
          localStorage.removeItem("sipConfig");
          localStorage.removeItem("sipRegistration");
          // Clear tenantId from IndexedDB so the service worker stops showing push notifications for this tenant
          clearCurrentTenantFromDB();
        }
        set({
          token: null,
          user: null,
          isAdmin: false,
          isSuporte: false,
          isAuthenticated: false,
          menuVisibility: {},
          blockedRoutes: [],
          configuracoes: [],
          supervisorAdmin: "disabled",
          tenantConfigsLoaded: false,
          paymentOverdue: false,
          billingState: 'ok',
          billingDaysInfo: {},
          planFeatures: null,
        });
      },

      setMenuVisibility: (visibility) => set({ menuVisibility: visibility }),
      setBlockedRoutes: (routes) => set({ blockedRoutes: routes }),

      setConfiguracoes: (configuracoes) => {
        // Merge instead of replace: new keys overwrite existing ones, but keys
        // not present in the new array (e.g. tenant keys already injected via
        // injectTenantSettings) are preserved. This prevents a blink when
        // fetchSettings() resolves before fetchTenantById().
        const current = get().configuracoes;
        const newKeys = new Set(configuracoes.map((c) => c.key));
        const preserved = current.filter((c) => !newKeys.has(c.key));
        const merged = [...configuracoes, ...preserved];
        set({ configuracoes: merged });
        if (typeof window !== "undefined") {
          localStorage.setItem("configuracoes", JSON.stringify(merged));
        }
      },

      injectTenantSettings: (settings) => {
        const current = get().configuracoes;
        const keys = Object.keys(settings);
        const filtered = current.filter((c: Configuracao) => !keys.includes(c.key));
        const newEntries = keys.map((k) => ({ key: k, value: settings[k] }));
        const merged = [...filtered, ...newEntries];
        set({ configuracoes: merged });
        if (typeof window !== "undefined") {
          localStorage.setItem("configuracoes", JSON.stringify(merged));
        }
      },

      setSupervisorAdmin: (value) => {
        set({ supervisorAdmin: value });
        if (typeof window !== "undefined") {
          localStorage.setItem("supervisorAdmin", JSON.stringify(value));
        }
      },

      setTenantConfigsLoaded: (value) => set({ tenantConfigsLoaded: value }),
      setPaymentOverdue: (value) => set({ paymentOverdue: value }),
      setBillingState: (state) => set({ billingState: state }),
      setBillingDaysInfo: (info) => set({ billingDaysInfo: info }),

      getConfigValue: (key: string): string | undefined => {
        // Use get() to avoid circular reference; fallback to localStorage
        const configuracoes = get().configuracoes;
        const fromState = configuracoes.find((c: Configuracao) => c.key === key);
        if (fromState) return fromState.value;
        if (typeof window !== "undefined") {
          {
            const stored = safeJsonParse(localStorage.getItem("configuracoes"), [] as Configuracao[]);
            return stored.find((c: Configuracao) => c.key === key)?.value;
          }
        }
        return undefined;
      },

      isRestrictedUser: (): boolean => {
        const r = get().user?.restrictedUser;
        return r === true || r === "enabled";
      },

      isSupervisorAdmin: (): boolean => {
        // supervisorAdmin === 'enabled' means super user is LIMITED (not admin-like)
        return get().supervisorAdmin === "enabled";
      },

      canViewPayments: (): boolean => {
        // LGPD: dados de pagamento são privados do contratante. Apenas admin/superadmin
        // veem por padrão. Tenant pode liberar para todos via setting hidePaymentsFromUsers.
        const profile = get().user?.profile;
        if (profile === "admin" || profile === "superadmin") return true;
        const value = get().getConfigValue("hidePaymentsFromUsers");
        const hide = (value ?? "enabled") === "enabled";
        return !hide;
      },

      setProfilePicture: (url: string) => {
        const current = get().user;
        if (!current) return;
        const updated = { ...current, profilePicture: url };
        set({ user: updated });
        if (typeof window !== "undefined") {
          localStorage.setItem("usuario", JSON.stringify(updated));
        }
      },

      setPinnedTickets: (ids: number[]) => {
        const current = get().user;
        if (!current) return;
        const updated = { ...current, configs: { ...current.configs, pinnedTickets: ids } };
        set({ user: updated });
        if (typeof window !== "undefined") {
          localStorage.setItem("usuario", JSON.stringify(updated));
        }
      },

      setDashboardLayout: (layout: DashboardLayout) => {
        const current = get().user;
        if (!current) return;
        const updated = { ...current, configs: { ...current.configs, dashboardLayout: layout } };
        set({ user: updated });
        if (typeof window !== "undefined") {
          localStorage.setItem("usuario", JSON.stringify(updated));
        }
      },

      syncUserFromLocalStorage: () => {
        if (typeof window === "undefined") return;
        try {
          const raw = localStorage.getItem("usuario");
          if (!raw) return;
          const local = JSON.parse(raw) as Partial<UserData> & Record<string, unknown>;
          const current = get().user;
          if (!current) return;
          const sipConfig =
            local.sipEnabled && local.sipServer && local.sipUsername && local.sipPassword
              ? {
                  server: local.sipServer as string,
                  port: (local.sipPort as number) ?? 5060,
                  username: local.sipUsername as string,
                  password: local.sipPassword as string,
                  transport: ((local.sipTransport as string) ?? "wss") as "ws" | "wss" | "udp",
                }
              : current.sipConfig;
          set({
            user: {
              ...current,
              sipEnabled: (local.sipEnabled as boolean | undefined) ?? current.sipEnabled,
              sipConfig,
              blockWavoip: (local.blockWavoip as boolean | undefined) ?? current.blockWavoip,
              restrictedUser: (local.restrictedUser as string | boolean | undefined) ?? current.restrictedUser,
            },
          });
        } catch { /* ignore */ }
      },

      patchUser: (fields) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...fields } : state.user,
        })),

      hasPermission: (key: PermissionKey): boolean => {
        const { user } = get();
        if (!user) return false;
        const { profile } = user;

        // As restrições de perfil personalizado se aplicam APENAS ao `custom`.
        // Demais perfis (superadmin, admin, super, user) seguem regras legadas —
        // gates específicos continuam vivendo nos componentes que sempre os tinham.
        if (profile !== "custom") return true;

        if (!user.customProfileEnabled) return false;
        const perms = user.customProfile?.customPermissions as unknown as ICustomPermissions | undefined;
        return perms?.[key] === true;
      },

      setPlanFeatures: (pf) => set({ planFeatures: pf ?? null }),

      hasFeature: (capKey: string): boolean => {
        const { user, planFeatures } = get();
        // Superadmin opera fora do escopo de tenant — nunca limitado por plano.
        if (user?.profile === "superadmin") return true;
        // planFeatures null => grandfathering (libera tudo). O plano é o TETO; as
        // checagens de menuVisibility (tenant) e permissão (user) seguem por cima via AND.
        return planAllowsCapability(planFeatures, capKey);
      },

      /**
       * Gate ÚNICO de TODAS as superfícies WaVoIP (seção do canal, botão do header,
       * chamada no ticket, widget flutuante, disparo em massa, página de chamadas).
       *
       * Composição por AND de duas camadas, na ordem do modelo de gating do projeto:
       *   plano (o TETO, planFeatures.caps.wavoip)  AND  interruptor do tenant
       *   (coluna Tenant.wavoipEnabled, injetada em `configuracoes`).
       *
       * Por que NÃO usar menuVisibility.wavoip como interruptor: aquele mapa é
       * sobrescrito pelo menuPermissions do próprio usuário no refresh de 30s
       * (layout.tsx), cujo default já traz wavoip:true — o toggle seria inerte para
       * user/super/custom. E menuVisibility é JSONB que middleware nenhum lê, então
       * não haveria como espelhar o gate no backend.
       *
       * Superadmin => true (opera fora do escopo de tenant). Os pontos de render que
       * não valem para superadmin já carregam o próprio `!isSuperAdmin`; este gate
       * compõe por AND com eles e nunca LIGA WaVoIP para superadmin.
       *
       * `tenantConfigsLoaded` fecha a janela entre o login e a volta do fetch do
       * tenant: sem ele o default "enabled" ligaria o WaVoIP por um instante — tempo
       * suficiente para o WaVoIPInitializer injetar o SDK do CDN.
       */
      isWavoipEnabled: (): boolean => {
        const { user, tenantConfigsLoaded } = get();
        if (user?.profile === "superadmin") return true;
        if (!tenantConfigsLoaded) return false;
        if (!get().hasFeature("wavoip")) return false;
        return get().getConfigValue("wavoipEnabled") !== "disabled";
      },

      /**
       * Gate ÚNICO do envio de cobrança (template ORDER_DETAILS). Espelha
       * `canProfileSendCharge` do backend (D8 — docs/PLANO_TEMPLATE_ORDER_DETAILS.md).
       *
       * NÃO usar `hasPermission` como gate aqui: aquele helper devolve true para
       * TODO perfil não-custom, então liberaria justamente o `user` que o backend
       * recusa com 403 — o formulário abriria e a recusa só apareceria no envio.
       *
       * O interruptor do tenant (`Tenant.userPaymentsEnabled`, injetado em
       * `configuracoes` pelo layout) vale só para `user`: admin, super, superadmin
       * e custom com `payments_manage` cobram independente dele.
       *
       * `tenantConfigsLoaded` fecha a janela entre o login e a volta do fetch do
       * tenant — sem isso o `user` de um tenant SEM o interruptor veria a cobrança
       * liberada por um instante.
       */
      canSendCharge: (): boolean => {
        const { user, tenantConfigsLoaded } = get();
        const profile = user?.profile;
        if (!profile) return false;
        if (profile === "superadmin" || profile === "admin" || profile === "super") return true;
        if (profile === "custom") return get().hasPermission("payments_manage");
        if (profile !== "user") return false;
        if (!tenantConfigsLoaded) return false;
        return get().getConfigValue("userPaymentsEnabled") === "enabled";
      },
    }),
    {
      name: "zpro-auth",
      partialize: (state) => {
        let safeUser = state.user;
        if (safeUser) {
          const { sipPassword, sipConfig, ...rest } = safeUser as UserData & Record<string, unknown>;
          void sipPassword;
          void sipConfig;
          safeUser = rest as UserData;
        }
        return {
          token: state.token,
          user: safeUser,
          isAdmin: state.isAdmin,
          isSuporte: state.isSuporte,
          isAuthenticated: state.isAuthenticated,
          configuracoes: state.configuracoes,
          supervisorAdmin: state.supervisorAdmin,
          menuVisibility: state.menuVisibility,
          tenantConfigsLoaded: state.tenantConfigsLoaded,
          planFeatures: state.planFeatures,
        };
      },
    }
  )
);
