"use client";

import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useSocket } from "@/hooks/use-socket";
import { useSocketSupportChat } from "@/hooks/use-socket-support-chat";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { NoProfileBanner } from "@/components/layout/no-profile-banner";
import { useSocketUserPermissions } from "@/hooks/use-socket-user-permissions";
import { useSocketSettings } from "@/hooks/use-socket-settings";
import { useOfflineOnClose } from "@/hooks/use-offline-on-close";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { WebphoneModal } from "@/components/webphone/webphone-modal";
import { WaVoIPInitializer } from "@/components/webphone/wavoip-initializer";
import { NativePushInitializer } from "@/components/native/native-push-initializer";
import { EmailOptOutConfirmDialog } from "@/components/email-marketing/email-optout-confirm-dialog";
import { AsteriskSipProvider } from "@/components/webphone/asterisk-sip-provider";
import { WabaCallProvider } from "@/components/waba-call/waba-call-provider";
import { WabaCallModal } from "@/components/waba-call/waba-call-modal";
// W3-B: Providers de chamada para os BSPs Dialog360 e Gupshup. Renderizados
// ao lado do WabaCallProvider — cada um observa seu proprio canal de socket
// e seus proprios sockets de hijack. Sem interseccao com o fluxo WABA.
import { Dialog360CallProvider } from "@/components/dialog360-call/dialog360-call-provider";
import { Dialog360CallModal } from "@/components/dialog360-call/dialog360-call-modal";
import { GupshupCallProvider } from "@/components/gupshup-call/gupshup-call-provider";
import { GupshupCallModal } from "@/components/gupshup-call/gupshup-call-modal";
import { PrivateCallProvider } from "@/components/private-call/private-call-provider";
import { PrivateCallIncomingModal } from "@/components/private-call/private-call-incoming-modal";
import { PrivateCallActiveModal } from "@/components/private-call/private-call-active-modal";
import dynamic from "next/dynamic";
import { BillingAlertBanner } from "@/components/layout/billing-alert-banner";
import { AiCreditsBanner } from "@/components/layout/ai-credits-banner";
import { MetaRestrictionBanner } from "@/components/layout/meta-restriction-banner";
import { MetaBannedBanner } from "@/components/layout/meta-banned-banner";
import { MetaSendHealthBanner } from "@/components/layout/meta-send-health-banner";
import { AcceptTermsModal } from "@/components/layout/accept-terms-modal";
import { cn } from "@/lib/utils";
import { type PlanFeatures } from "@/lib/plan-capabilities";
import { fetchUser } from "@/services/users";
import { getFaviconUrl } from "@/lib/branding-urls";
import { fetchSettings, fetchPublicColors, fetchPublicColorsDark, fetchTerms } from "@/services/settings";
import { applyBrandColors } from "@/lib/brand-colors";
import { fetchTenantById, fetchTenantByAsaas, fetchTenantBranding, fetchTenantsAcceptTermsList } from "@/services/tenants";
import { fetchPublicBranding, fetchSocketModelNovo } from "@/services/superadmin";
import { useBrandingStore, type SoundTimestamps, type TenantBranding } from "@/stores/branding-store";
import { loadAppFont, applyAvatarShape, type FontSource, type AvatarShape } from "@/lib/load-app-font";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchSupportUsers, fetchUnreadSupportCount } from "@/services/support-chat";
import { useSupportChatStore } from "@/stores/support-chat-store";
import { AppTour } from "@/components/tour/AppTour";
import { PersistentAudioPlayer } from "@/components/layout/persistent-audio-player";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { unlockAudioContext } from "@/lib/notification-audio";
import { setBaseTitle } from "@/lib/tab-title";
import { setBaseFavicon } from "@/lib/favicon-badge";

// Paleta de comandos fora do bundle inicial do layout (só carrega no client).
const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

let brandingLoaded = false;

function updateFaviconLink(timestamp: number, tenantId?: number) {
  // Delega ao favicon-badge (dono único do <link rel=icon>) para que o badge
  // numérico de não lidos coexista com o favicon whitelabel em vez de ser
  // sobrescrito pela URL crua.
  setBaseFavicon(getFaviconUrl(timestamp, tenantId));
}

// Aplica fonte/avatar de um payload de branding (cache OU fetch). Módulo-level
// para ser compartilhada entre o useLayoutEffect cache-first (pré-paint) e o
// fetch fresco do useEffect. loadAppFont é idempotente (substitui o <link> próprio).
function applyTypographyFromPayload(p: { fontFamily?: string; fontWeights?: string; fontSource?: FontSource; avatarShape?: AvatarShape }) {
  if (p.fontFamily && p.fontWeights && p.fontSource) {
    const env = (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_URL) || "";
    loadAppFont({
      family: p.fontFamily,
      weights: p.fontWeights.split(","),
      source: p.fontSource,
      selfHostBaseUrl: `${env.replace(/\/$/, "")}/api/fonts`,
    });
  }
  if (p.avatarShape) applyAvatarShape(p.avatarShape);
}

function trackRecentPage(pathname: string, pathLabels: Record<string, string>, userId: number | string) {
  if (pathname === "/" || pathname === "/home") return;
  // Perfil do contato (/contatos/<id>) não entra em "Páginas recentes": sem rótulo traduzido
  // e cada contato ocuparia uma das vagas.
  if (/^\/contatos\/[^/]+$/.test(pathname)) return;
  const label = pathLabels[pathname] || pathname.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const entry = { name: label, path: pathname, label };
  try {
    const key = `recentPages:${userId}`;
    const stored: { name: string; path: string; label: string }[] = safeJsonParse(localStorage.getItem(key), []);
    const filtered = stored.filter((p) => p.path !== pathname);
    const updated = [entry, ...filtered].slice(0, 5);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* ignore */ }
}

const IDLE_TIMEOUT_SECONDS = 7200; // 2 hours → reload
const USER_REFRESH_MS = 30000;     // 30s user refresh
const IDLE_CHECK_MS = 30000;       // check idle every 30s

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("dashboardLayout");
  const { isAuthenticated } = useAuthGuard();
  const { sidebarCollapsed } = useUIStore();
  const { user, setConfiguracoes, injectTenantSettings, setSupervisorAdmin, setMenuVisibility, setTenantMenuVisibility, setTenantConfigsLoaded, patchUser, setPaymentOverdue, setBillingState, setBillingDaysInfo, setPlanFeatures } = useAuthStore();
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const { setAppName, setLogoTimestamp, setSoundTimestamps, setSocketModelOptimized, setTenantBranding, setTypography } = useBrandingStore();
  const setSupportUsers = useSupportChatStore((s) => s.setSupportUsers);
  const setUnreadSupportCount = useSupportChatStore((s) => s.setUnreadCount);
  useSocket();
  useSocketSupportChat();
  useSocketUserPermissions();
  useSocketSettings();
  // Espelha o "ficar offline" do diálogo de logout ao fechar a última aba/janela
  useOfflineOnClose(isAuthenticated);

  const [showAcceptTermsModal, setShowAcceptTermsModal] = useState(false);

  // Track recent pages navigation
  const pathLabels = useMemo<Record<string, string>>(() => ({
    "/dashboard": t("paths.dashboard"),
    "/atendimento": t("paths.atendimento"),
    "/contatos": t("paths.contatos"),
    "/chat-privado": t("paths.chatPrivado"),
    "/filas": t("paths.filas"),
    "/usuarios": t("paths.usuarios"),
    "/etiquetas": t("paths.etiquetas"),
    "/relatorios": t("paths.relatorios"),
    "/configuracoes": t("paths.configuracoes"),
    "/kanban": t("paths.kanban"),
    "/campanhas": t("paths.campanhas"),
    "/chatbots": t("paths.chatbots"),
    "/integracoes": t("paths.integracoes"),
  }), [t]);
  useEffect(() => {
    if (isAuthenticated && pathname && user?.userId) {
      trackRecentPage(pathname, pathLabels, user.userId);
    }
  }, [pathname, isAuthenticated, pathLabels]);

  // Re-aplica o nome customizado do tenant após cada navegação client-side.
  // O Next.js App Router reaplica o título do generateMetadata (global) em cada troca de rota,
  // sobrescrevendo o document.title setado imperativamente nos useEffects de branding.
  useEffect(() => {
    const tb = useBrandingStore.getState().tenantBranding;
    const name = tb?.customAppName || useBrandingStore.getState().appName;
    if (name) setBaseTitle(name);
  }, [pathname]);

  const idleSecondsRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda as cores carregadas para reaplicar quando o tema mudar
  const brandColorsRef = useRef<Array<Record<string, string>>>([]);
  const brandColorsDarkRef = useRef<Record<string, string>>({});

  // ── Aplica branding do cache ANTES da primeira pintura (elimina flash de SSR) ──────────────
  // FASE 7.8 (B8): cores/fonte/favicon cacheados eram aplicados só em useEffect
  // (pós-paint) → primeira pintura saía com a paleta default e "pulava" para a da
  // marca. Este useLayoutEffect roda antes do paint (CSS vars via style do
  // documentElement, fora do HTML SSR — sem hydration mismatch). 1ª visita sem
  // cache: blocos não fazem nada e o fetch fresco dos useEffects abaixo cobre.
  useLayoutEffect(() => {
    const tId = useAuthStore.getState().user?.tenantId;

    // 1) Paleta de cores cacheada (light/dark) — popula os refs usados pelo guard
    //    de flip de tema e pelo fetch fresco (que reaplica se mudou).
    try {
      const storedColors = localStorage.getItem("storedColors");
      const storedColorsDark = localStorage.getItem("storedColorsDark");
      if (storedColors || storedColorsDark) {
        const cachedColors = storedColors ? (JSON.parse(storedColors) as Array<Record<string, string>>) : [];
        const cachedDark = storedColorsDark ? (JSON.parse(storedColorsDark) as Record<string, string>) : undefined;
        brandColorsRef.current = cachedColors;
        if (cachedDark) brandColorsDarkRef.current = cachedDark;
        // classList "dark" é setada sincronamente pelo script do next-themes — já correta aqui.
        applyBrandColors(cachedColors, document.documentElement.classList.contains("dark"), cachedDark);
      }
    } catch { /* ignore */ }

    // 2) Branding do tenant cacheado (appName + favicon custom têm precedência sobre o global)
    let tenantAppNameApplied = false;
    let tenantFaviconApplied = false;
    try {
      if (tId) {
        const tb = JSON.parse(localStorage.getItem(`zpro-tenant-branding-${tId}`) || "null") as TenantBranding | null;
        if (tb) {
          setTenantBranding(tb);
          if (tb.customAppName) { setAppName(tb.customAppName); setBaseTitle(tb.customAppName); tenantAppNameApplied = true; }
          if (tb.customFaviconTimestamp > 0) { updateFaviconLink(tb.customFaviconTimestamp, tId); tenantFaviconApplied = true; }
        }
      }
    } catch { /* ignore */ }

    // 3) Branding global cacheado (appName fallback, favicon, fonte/avatar, sons)
    try {
      const gb = JSON.parse(localStorage.getItem("zpro-branding") || "null") as { appName?: string; logoTimestamp?: number; soundTimestamps?: SoundTimestamps; fontFamily?: string; fontWeights?: string; fontSource?: FontSource; avatarShape?: AvatarShape } | null;
      if (gb) {
        if (gb.appName && !tenantAppNameApplied) { setAppName(gb.appName); setBaseTitle(gb.appName); }
        // Não aplica o logoTimestamp do cache ao store (setLogoTimestamp): ele
        // alimenta a URL ?t= imutável da logo na sidebar e, se defasado, o browser
        // serve a logo antiga (cache 1 ano) → flash. Favicon segue do cache.
        if (gb.logoTimestamp && !tenantFaviconApplied) { updateFaviconLink(gb.logoTimestamp); }
        if (gb.soundTimestamps) { setSoundTimestamps(gb.soundTimestamps); }
        applyTypographyFromPayload(gb);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load public branding on mount (appName, logoTimestamp) ────────────────
  useEffect(() => {
    if (brandingLoaded) return;
    brandingLoaded = true;

    // Check if tenant has a cached custom appName — if yes, skip global appName to avoid flash
    function tenantHasCachedCustomAppName(): boolean {
      const tId = useAuthStore.getState().user?.tenantId;
      if (!tId) return false;
      try {
        const cached = localStorage.getItem(`zpro-tenant-branding-${tId}`);
        if (cached) return !!(JSON.parse(cached) as TenantBranding).customAppName;
      } catch { /* ignore */ }
      return false;
    }

    // Cache de branding (appName/favicon/sons/fonte) é aplicado PRÉ-PAINT pelo
    // useLayoutEffect acima (FASE 7.8) — aqui fica só o fetch fresco, que
    // reaplica/atualiza o cache se algo mudou no servidor.
    fetchPublicBranding()
      .then(({ data }) => {
        const payload = data as { appName: string; logoTimestamp: number; soundTimestamps?: SoundTimestamps; fontFamily?: string; fontWeights?: string; fontSource?: FontSource; avatarShape?: AvatarShape };
        localStorage.setItem("zpro-branding", JSON.stringify(payload));
        const hasTenant = tenantHasCachedCustomAppName();
        const storeCustom = useBrandingStore.getState().tenantBranding?.customAppName;
        if (payload.appName && !hasTenant && !storeCustom) { setBaseTitle(payload.appName); setAppName(payload.appName); }
        if (payload.logoTimestamp) { setLogoTimestamp(payload.logoTimestamp); updateFaviconLink(payload.logoTimestamp); }
        if (payload.soundTimestamps) { setSoundTimestamps(payload.soundTimestamps); }
        applyTypographyFromPayload(payload);
        if (payload.fontFamily && payload.fontWeights && payload.fontSource && payload.avatarShape) {
          setTypography({
            fontFamily: payload.fontFamily,
            fontWeights: payload.fontWeights,
            fontSource: payload.fontSource,
            avatarShape: payload.avatarShape,
          });
        }
      })
      .catch(() => { toast.warning(t("brandingFailed")); });

    // Sincroniza modelo de socket com o servidor (authoritative) — localStorage é apenas cache
    fetchSocketModelNovo()
      .then(({ data }) => {
        const optimized = !!(data as { isOptimized?: boolean })?.isOptimized;
        localStorage.setItem("socketModelNovo", optimized ? "optimized" : "standard");
        setSocketModelOptimized(optimized);
      })
      .catch(() => {
        // fallback: mantém valor do localStorage (já lido no store init)
      });
  }, [setAppName, setLogoTimestamp, setSocketModelOptimized, t]);

  // ── Load tenant-specific branding (logo, favicon, appName) ────────────────
  useEffect(() => {
    if (!user?.tenantId) return;
    const tenantId = user.tenantId;
    const cacheKey = `zpro-tenant-branding-${tenantId}`;

    // Apply cached tenant branding immediately for logos/favicon (avoid FOUC on images)
    // AppName is applied via useLayoutEffect above to avoid SSR flash; here we only update favicon
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedBranding = JSON.parse(cached) as TenantBranding;
        setTenantBranding(cachedBranding);
        if (cachedBranding.customFaviconTimestamp > 0) {
          updateFaviconLink(cachedBranding.customFaviconTimestamp, tenantId);
        }
      }
    } catch { /* ignore */ }

    fetchTenantBranding(tenantId)
      .then(({ data }) => {
        const tb = data as TenantBranding;
        const branding: TenantBranding = { ...tb, tenantId };
        localStorage.setItem(cacheKey, JSON.stringify(branding));
        setTenantBranding(branding);

        if (tb.customAppName) {
          setBaseTitle(tb.customAppName);
          setAppName(tb.customAppName);
        } else {
          // No tenant appName — re-apply global so it's not stuck at the cached tenant name
          try {
            const stored = localStorage.getItem("zpro-branding");
            if (stored) {
              const { appName } = JSON.parse(stored) as { appName: string };
              if (appName) { setBaseTitle(appName); setAppName(appName); }
            }
          } catch { /* ignore */ }
        }
        if (tb.customFaviconTimestamp > 0) {
          updateFaviconLink(tb.customFaviconTimestamp, tenantId);
        } else {
          // No tenant favicon — restore global favicon
          try {
            const stored = localStorage.getItem("zpro-branding");
            if (stored) {
              const { logoTimestamp } = JSON.parse(stored) as { logoTimestamp: number };
              if (logoTimestamp) updateFaviconLink(logoTimestamp);
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {
        setTenantBranding(null);
      });
  }, [user?.tenantId, setTenantBranding, setAppName]);

  // ── Load public colors on mount ────────────────────────────────────────────
  // Cache de paleta é aplicado PRÉ-PAINT pelo useLayoutEffect acima (FASE 7.8),
  // que também popula brandColorsRef/brandColorsDarkRef. Aqui só o fetch fresco,
  // que reaplica se o servidor tiver paleta diferente da cacheada.
  useEffect(() => {
    // Fetch light + dark palettes in parallel
    Promise.all([
      fetchPublicColors().catch(() => ({ data: [] })),
      fetchPublicColorsDark().catch(() => ({ data: null })),
    ]).then(([lightRes, darkRes]) => {
      const colors = Array.isArray(lightRes.data) ? lightRes.data : [];
      const darkColors = (darkRes.data as { colors?: Record<string, string> } | null)?.colors ?? null;
      brandColorsRef.current = colors;
      if (darkColors && Object.values(darkColors).some((v) => !!v)) {
        brandColorsDarkRef.current = darkColors;
        localStorage.setItem("storedColorsDark", JSON.stringify(darkColors));
      }
      const isDark = document.documentElement.classList.contains("dark");
      applyBrandColors(colors, isDark, brandColorsDarkRef.current);
      localStorage.setItem("storedColors", JSON.stringify(colors));
    });
  }, []);

  // ── Reaplica / remove cores quando o tema muda ────────────────────────────
  // Com o toggle de tema sem reload (P0-9/tarefa 6), este effect é o ÚNICO
  // mecanismo que troca a paleta whitelabel no flip de tema. O guard antigo
  // (`brandColorsRef.length === 0`) pulava a reaplicação quando o tenant só tem
  // paleta DARK (light vazia) — as vars do tema anterior ficavam grudadas.
  // Semântica correta: reaplicar SEMPRE que houver QUALQUER paleta custom;
  // applyBrandColors com paleta vazia apenas limpa os overrides inline e deixa
  // o globals.css assumir — que é exatamente o desejado. Validação whitelabel
  // (3 cenários de paleta: só light / só dark / ambas + tela /customizar) é
  // pós-deploy.
  useEffect(() => {
    const hasLight = brandColorsRef.current.length > 0;
    const hasDark = Object.values(brandColorsDarkRef.current).some((v) => !!v);
    if (!hasLight && !hasDark) return; // sem paleta custom — globals.css cobre os 2 temas
    const isDarkNow = document.documentElement.classList.contains("dark");
    applyBrandColors(brandColorsRef.current, isDarkNow, brandColorsDarkRef.current);
  }, [resolvedTheme]);

  // ── Load configuracoes (tenant settings) ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSettings()
      .then(({ data }) => {
        const arr = Array.isArray(data)
          ? data
          : ((data as Record<string, unknown>)?.settings as { key: string; value: string }[]) || [];
        setConfiguracoes(arr);
      })
      .catch(() => {});
  }, [isAuthenticated, setConfiguracoes]);

  // ── Superadmin: pre-load support chat unread counts ──────────────────────
  useEffect(() => {
    if (!isAuthenticated || user?.profile !== "superadmin") return;
    fetchSupportUsers()
      .then(({ data }) => setSupportUsers(data.users || []))
      .catch(() => {});
  }, [isAuthenticated, user?.profile, setSupportUsers]);

  // ── Tenant users: pre-load support chat unread count on login ─────────────
  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId || user?.profile === "superadmin") return;
    fetchUnreadSupportCount()
      .then(({ data }) => setUnreadSupportCount(data.count ?? 0))
      .catch(() => {});
  }, [isAuthenticated, user?.tenantId, user?.profile, setUnreadSupportCount]);

  // ── Aviso de recurso fora do plano (402 ERR_FEATURE_NOT_IN_PLAN do backend) ──
  useEffect(() => {
    // `id` fixo: várias chamadas gated na mesma tela (funil + IA + agenda) geravam
    // uma pilha de toasts idênticos — com id, o sonner reaproveita um só.
    const handler = () => toast.warning(t("featureNotInPlan"), { id: "zpro-feature-not-in-plan" });
    window.addEventListener("zpro:feature-not-in-plan", handler);
    return () => window.removeEventListener("zpro:feature-not-in-plan", handler);
  }, [t]);

  // ── Aviso de permissão negada (403 ERR_NO_PERMISSION do backend) ──
  useEffect(() => {
    // `id` fixo: a ação em massa manda vários requests em paralelo e cada 403
    // virava um toast próprio — com id, o sonner reaproveita um só.
    const handler = () => toast.error(t("noPermission"), { id: "zpro-no-permission" });
    window.addEventListener("zpro:no-permission", handler);
    return () => window.removeEventListener("zpro:no-permission", handler);
  }, [t]);

  // ── Load supervisorAdmin from tenant data + status/Asaas checks ──────────
  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId) return;
    fetchTenantById(user.tenantId)
      .then(async ({ data }) => {
        const tenantData = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
        const supervisorAdminValue = (tenantData?.supervisorAdmin as string) || "disabled";
        setSupervisorAdmin(supervisorAdminValue);

        // Snapshot de features do plano (o plano é o teto do gating; null => libera tudo).
        setPlanFeatures((tenantData?.planFeatures as PlanFeatures | null) ?? null);

        // Tenant-level ticket visibility settings (not in Settings table, inject into configuracoes)
        injectTenantSettings({
          nullTickets: (tenantData?.nullTickets as string) || "disabled",
          showGroupsForAll: (tenantData?.showGroupsForAll as string) || "disabled",
          showClosedForAll: (tenantData?.showClosedForAll as string) || "disabled",
          chatbotLane: (tenantData?.showChatBot as string) || "disabled",
          semRedis: (tenantData?.noRedis as string) || "disabled",
          forceReason: (tenantData?.forceReason as string) || "disabled",
          allowPause: (tenantData?.allowPause as string) || "disabled",
          useUserBusinessHours: (tenantData?.useUserBusinessHours as string) || "disabled",
          controlFeatures: (tenantData?.controlFeatures as string) || "disabled",
          ticketNulo: (tenantData?.nullTickets as string) || "disabled",
          fixarConexao: (tenantData?.fixConnections as string) || "disabled",
          forcarPendente: (tenantData?.forcePendingUser as string) || "disabled",
          agruparTickets: (tenantData?.groupTickets as string) || "disabled",
          listarPelaUltimaMensagem: (tenantData?.listByLastMessage as string) || "disabled",
          // Ordem da lista de atendimentos: enabled => mais antigos primeiro. Lido no /atendimento
          // como default (seed) do orderAsc; o checkbox local do usuário sobrepõe.
          reverseOrder: (tenantData?.reverseOrder as string) || "disabled",
          // Fallback = default real da coluna no banco ("enabled"). Importante:
          // phone-utils passou a respeitar este gate — fallback "disabled" aqui
          // desligaria a correção do 9º dígito quando o campo não vier no payload.
          validateContact: (tenantData?.validateContact as string) || "enabled",
          // Convenção do 9º dígito BR (legacy = heurística por DDD; always9 = celular sempre com 9)
          brPhoneConvention: (tenantData?.brPhoneConvention as string) || "legacy",
          hearHubApi: (tenantData?.hearHubApi as string) || "disabled",
          ticketsRain: (tenantData?.ticketsRain as string) || "disabled",
          transbordo: (tenantData?.serviceTransfer as string) || "disabled",
          janelaConversa: (tenantData?.forceOpenChatWindow as string) || "disabled",
          esperarProcessamento: (tenantData?.waitProcessExternalInteraction as string) || "disabled",
          carteiraExterna: (tenantData?.walletExternalInteraction as string) || "disabled",
          ignorarStories: (tenantData?.ignoreIgStories as string) || "disabled",
          audioModulo: (tenantData?.audioModule as string) || "disabled",
          pluginAudio: (tenantData?.audioPlugin as string) || "disabled",
          persistirMedia: (tenantData?.baileysMediaPersist as string) || "disabled",
          atualizarNomes: (tenantData?.updateNames as string) || "disabled",
          forcarAdmin: (tenantData?.forceAdmin as string) || "disabled",
          messageListingType: (tenantData?.messageListingType as string) || "default",
          supportChatEnabled: (tenantData?.supportChatEnabled as string) || "disabled",
          videoConferenceProvider: (tenantData?.videoConferenceProvider as string) || "jitsi",
          privacidadeFunil: (tenantData?.funnelPrivacy as string) || "disabled",
          // LGPD: padrão "enabled" — esconde dados de pagamento para perfis user/super
          hidePaymentsFromUsers: (tenantData?.hidePaymentsFromUsers as string) || "enabled",
          // Quando "disabled", esconde a opcao "app Google da plataforma" nos pickers OAuth Google
          enablePlatformGoogleApp: (tenantData?.enablePlatformGoogleApp as string) || "enabled",
          wabaCallRouting: (tenantData?.wabaCallRouting as string) || "broadcast",
          wabaCallFallbackSeconds: String(tenantData?.wabaCallFallbackSeconds ?? 15),
          // Avisos da janela de 24h no topo do chat (default "enabled" = mostra, retrocompat)
          windowTimerBanner: (tenantData?.windowTimerBanner as string) || "enabled",
          wabaTemplateBanner: (tenantData?.wabaTemplateBanner as string) || "enabled",
          wabaTemplateBannerMessage: (tenantData?.wabaTemplateBannerMessage as string) || "",
          windowClosedBanner: (tenantData?.windowClosedBanner as string) || "enabled",
          // Receptivo apenas por fila: pula whatsappAllowed para inbound (lista/visibilidade/push)
          inboundByQueueOnly: (tenantData?.inboundByQueueOnly as string) || "disabled",
          // Supervisor restrito ao canal: super admin-like vê tudo, mas só dos canais atribuídos
          supervisorChannelScoped: (tenantData?.supervisorChannelScoped as string) || "disabled",
          // Aviso cross-canal: pre-check de conversa aberta procura em qualquer canal WhatsApp
          crossChannelTicketCheck: (tenantData?.crossChannelTicketCheck as string) || "disabled",
          // Notificar so atendimento humano: suprime som/popup enquanto o ticket esta no chatbot
          notifyOnlyHumanTickets: (tenantData?.notifyOnlyHumanTickets as string) || "disabled",
          // Reabrir toma posse: define para quem vai o ticket ao reabrir um fechado.
          // Lido no aviso de confirmacao da reabertura (lib/reopen-notices).
          reopenTicketAssignsToActor: (tenantData?.reopenTicketAssignsToActor as string) || "disabled",
          // Modo de senha na criação de usuários (manual | forceChange | invite).
          // Lido no form de /usuarios para esconder o campo senha no modo convite.
          userCreationPasswordMode: (tenantData?.userCreationPasswordMode as string) || "manual",
          // Interruptor do WaVoIP no tenant. Lido pelo gate isWavoipEnabled() do
          // auth-store, que governa TODAS as superfícies WaVoIP. Fallback = default
          // real da coluna ("enabled"): tenant que nunca foi editado não regride.
          wavoipEnabled: (tenantData?.wavoipEnabled as string) || "enabled",
          // Libera o perfil `user` a enviar cobrança. Lido pelo gate canSendCharge()
          // do auth-store, que espelha canProfileSendCharge do backend. Fallback =
          // default real da coluna ("disabled"): backend antigo (sem a coluna) mantém
          // o comportamento atual, em que só admin/super/custom cobram.
          userPaymentsEnabled: (tenantData?.userPaymentsEnabled as string) || "disabled",
          // Grupos nas métricas de tempo dos relatórios. "disabled" apaga as colunas
          // de tempo das linhas de grupo no relatório por parâmetros (o backend já
          // tira os grupos das médias por usuário). Fallback = default real da
          // coluna ("enabled"): backend antigo mantém o comportamento atual.
          groupTimeMetricsEnabled: (tenantData?.groupTimeMetricsEnabled as string) || "enabled",
          // Interruptor dos Créditos de IA no tenant. Lido pelo gate isAiCreditsEnabled()
          // do auth-store, que vem ANTES de qualquer request a /ai-credits/*. FAIL-CLOSED:
          // só "enabled" explícito liga — backend antigo não manda o campo e o recurso
          // fica oculto (menu, faixa, página e seletores), sem nenhuma chamada nova.
          aiCreditsEnabled: tenantData?.aiCreditsEnabled === "enabled" ? "enabled" : "disabled",
          // Limite de aviso de saldo baixo definido pela empresa, em centavos.
          // Vazio = usa o padrão da plataforma (o valor efetivo vem de /ai-credits/status).
          aiCreditsLowBalanceCents:
            tenantData?.aiCreditsLowBalanceCents != null ? String(tenantData.aiCreditsLowBalanceCents) : "",
        });
        setTenantConfigsLoaded(true);

 // Front legado/1784 — ticketsRain, forceReason, postmanLink no localStorage
        localStorage.setItem("ticketsRain", JSON.stringify(tenantData?.ticketsRain ?? null));
        localStorage.setItem("forceReason", JSON.stringify(tenantData?.forceReason ?? null) || "disabled");
        localStorage.setItem("postmanLink", JSON.stringify(tenantData?.postmanLink ?? null) || JSON.stringify("https://www.postman.com/comunidade-zdg/z-pro/collection/s16subg/postman-v3-x-x-x?action=share&creator=25151510"));

 // Front legado — menuVisibility do tenant mesclado com menuPermissions (para user/super)
        // §7.5 + §35.9 Opção B: custom usa customProfile.menuPermissions como source
        const tenantMenuVisibility = ((tenantData?.menuVisibility as unknown[])?.[0] || {}) as Record<string, boolean>;
        // Teto do tenant guardado à parte: os branches abaixo sobrescrevem (boot)
        // e o refreshUser substitui (30s) o `menuVisibility` pelo menuPermissions
        // do usuário — só este mapa preserva o que o superadmin desligou.
        setTenantMenuVisibility(tenantMenuVisibility);
        if (user?.profile === "user" || user?.profile === "super") {
          const menuPermissions = safeJsonParse(localStorage.getItem("menuPermissions"), {} as Record<string, boolean>);
          const merged = { ...tenantMenuVisibility, ...menuPermissions };
          setMenuVisibility(merged);
          localStorage.setItem("menuVisibility", JSON.stringify(merged));
        } else if (user?.profile === "custom") {
          const profileMenu = (user.customProfile?.menuPermissions as Record<string, boolean>) || {};
          const merged = { ...tenantMenuVisibility, ...profileMenu };
          setMenuVisibility(merged);
          localStorage.setItem("menuVisibility", JSON.stringify(merged));
        } else {
          setMenuVisibility(tenantMenuVisibility);
          localStorage.setItem("menuVisibility", JSON.stringify(tenantMenuVisibility));
        }

 // Front legado — empresa inativa → avisa e recarrega
        if (tenantData?.status !== "active") {
          toast.warning(t("companyInactive"));
          setTimeout(() => window.location.reload(), 1000);
          return;
        }

        // Status autoritativo vem do backend (tenant.paymentStatus) — atualizado por
        // webhook do gateway + job de reconciliação (6h). Se o backend disser 'blocked',
        // bloqueamos imediatamente independentemente do cálculo visual abaixo.
        const backendPaymentStatus = (tenantData?.paymentStatus as string) || "active";
        if (backendPaymentStatus === "blocked") {
          setBillingState('blocked');
          setPaymentOverdue(true);
          toast.warning(t("paymentOverdue"));
        }

        // Enriquecimento visual (daysOverdue / daysUntilBlock / boleto) — usa dados
        // do gateway ativo. Para Asaas usamos o endpoint legado fetchTenantByAsaas;
        // para os demais gateways confiamos apenas em backendPaymentStatus acima.
        if (tenantData?.asaas === "enabled" && user?.tenantId && (tenantData?.paymentGateway ?? "asaas") === "asaas") {
          try {
            const asaasRes = await fetchTenantByAsaas(user.tenantId);
            const items = (asaasRes?.data as { data?: { status?: string; dueDate?: string; bankSlipUrl?: string }[] })?.data || [];
            const alertDaysBefore = Number(tenantData?.billingAlertDaysBefore ?? 0);
            const blockDaysAfter = Number(tenantData?.billingBlockDaysAfter ?? 0);

            const overdue = items.find((i) => i.status === "OVERDUE");
            const pending = items.filter((i) => i.status === "PENDING").sort((a, b) =>
              (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
            )[0];
            const invoice = overdue ?? pending ?? null;

            if (invoice) {
              const bankSlipUrl = invoice.bankSlipUrl ?? undefined;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const due = invoice.dueDate ? new Date(invoice.dueDate + "T00:00:00") : null;
              const diffDays = due ? Math.round((due.getTime() - today.getTime()) / 86400000) : null;

              // Tenant bloqueado com fatura ainda PENDENTE (ex.: gate de 1º pagamento,
              // boleto não vencido) — expõe o boleto no banner mesmo sem atraso.
              if (backendPaymentStatus === "blocked" && invoice.status !== "OVERDUE") {
                setBillingDaysInfo({ daysOverdue: 0, bankSlipUrl });
              }

              if (invoice.status === "OVERDUE" && diffDays !== null) {
                const daysOverdue = Math.abs(diffDays);
                if (backendPaymentStatus === "blocked") {
                  setBillingDaysInfo({ daysOverdue, bankSlipUrl });
                } else if (daysOverdue === 0) {
                  setBillingState('due_today');
                  setBillingDaysInfo({ daysOverdue: 0, bankSlipUrl });
                } else {
                  const daysUntilBlock = blockDaysAfter > 0 ? Math.max(0, blockDaysAfter - daysOverdue) : undefined;
                  setBillingState('overdue_warning');
                  setBillingDaysInfo({ daysOverdue, daysUntilBlock, bankSlipUrl });
                }
              } else if (invoice.status === "PENDING" && diffDays !== null) {
                if (alertDaysBefore > 0 && diffDays >= 0 && diffDays <= alertDaysBefore) {
                  setBillingState(diffDays === 0 ? 'due_today' : 'approaching');
                  setBillingDaysInfo({ daysBeforeDue: diffDays, bankSlipUrl });
                }
              }
            }
          } catch { /* silenciar */ }
        }
      })
      .catch(() => {});
  }, [isAuthenticated, user?.tenantId, user?.profile, setSupervisorAdmin, setMenuVisibility, setTenantMenuVisibility, injectTenantSettings, setTenantConfigsLoaded, setPaymentOverdue, setBillingState, setBillingDaysInfo, setPlanFeatures]);

  // ── LGPD terms check ───────────────────────────────────────────────────
  // Superadmin: abre modal se QUALQUER tenant ainda nao aceitou (gate de plataforma).
  //   Backend bulk-update propaga o aceite p/ todos os tenants, entao um clique do
  //   superadmin libera o gate ate um novo tenant ser criado com acceptTerms=false.
 // Outros perfis: check do proprio tenant via /tenantsTerms (comportamento front legado).
  // Comparacao !acceptTerms tolera false/0/null/undefined (Sequelize as vezes
  // serializa boolean como 0/1 dependendo do driver).
  useEffect(() => {
    if (!isAuthenticated) return;
    const isSuperadmin = user?.profile === "superadmin";

    if (isSuperadmin) {
      if (!user?.tenantId) return;
      fetchTenantsAcceptTermsList()
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : [];
          const hasPending = list.some((t) => !t.acceptTerms);
          if (hasPending) {
            toast.warning(t("acceptTerms"));
            setShowAcceptTermsModal(true);
          }
        })
        .catch(() => {});
    } else {
      fetchTerms()
        .then(({ data }) => {
          const termsData = data as { acceptTerms?: boolean | number; message?: string } | null;
          if (termsData && !termsData.acceptTerms) {
            toast.warning(termsData.message || t("acceptTerms"));
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, user?.profile, user?.tenantId, t]);

 // ── Periodic user refresh (30s) — mirror front legado MainLayout atualizarUsuario() ──
  const refreshUser = useCallback(async () => {
    // Lê o user atual via getState() em vez de fechar sobre `user`. CRÍTICO: sem
    // isto, refreshUser dependia de `user?.sipConfig` (objeto recriado a cada
    // patchUser quando SIP habilitado) → identidade do callback mudava → o effect
    // de refresh re-disparava → patchUser → LOOP infinito (gated pela latência do
    // fetchUser, ~poucas vezes/s) que re-renderizava o DashboardLayout sem parar
    // e cascateava para todo o app (flashing/jank, seleção de texto quebrada).
    const currentUser = useAuthStore.getState().user;
    if (!currentUser?.userId) return;
    const profile = currentUser.profile;
    try {
      const { data } = await fetchUser(currentUser.userId);
      if (data && typeof data === "object") {
        const userData = data as Record<string, unknown>;

 // Front legado — profile, menuPermissions, menuVisibility
        if (userData.profile) {
          localStorage.setItem("profile", userData.profile as string);
        }
        if (userData.menuPermissions) {
          localStorage.setItem("menuPermissions", JSON.stringify(userData.menuPermissions));
          if (profile === "user" || profile === "super") {
            const perms = userData.menuPermissions as Record<string, boolean>;
            setMenuVisibility(perms);
            localStorage.setItem("menuVisibility", JSON.stringify(perms));
          }
        }
        // §35.9 Opção B: custom lê menuPermissions do customProfile
        if (profile === "custom" && userData.customProfile) {
          const cp = userData.customProfile as { menuPermissions?: Record<string, boolean> };
          if (cp.menuPermissions) {
            setMenuVisibility(cp.menuPermissions);
            localStorage.setItem("menuVisibility", JSON.stringify(cp.menuPermissions));
          }
        }

 // Front legado — atualiza SIP fields no store e no localStorage
        const sipEnabled = !!userData.sipEnabled;
        const sipServer = userData.sipServer as string | undefined;
        const sipDomain = userData.sipDomain as string | undefined;
        const sipUsername = userData.sipUsername as string | undefined;
        const sipPassword = userData.sipPassword as string | undefined;
        const sipPort = userData.sipPort as number | undefined;
        const sipTransport = userData.sipTransport as "ws" | "wss" | undefined;
        const sipConfig =
          sipEnabled && sipServer && sipUsername && sipPassword
            ? {
                server: sipServer,
                domain: sipDomain || undefined,
                port: sipPort ?? 5060,
                username: sipUsername,
                password: sipPassword,
                transport: sipTransport ?? "wss",
              }
            : currentUser.sipConfig;
        const phone = userData.phone as string | undefined;
        // Propaga menuPermissions atualizadas para o objeto `user` do store (não só
        // para menuVisibility/localStorage). Sem isto, conceder/revogar um menu a um
        // super/user em sessão ativa só valia no gate de página após relogin (o
        // usePageAccess lê user.menuPermissions), gerando "item na sidebar some/aparece
        // em 30s mas a página continua bloqueada/liberada" até o próximo login.
        const nextMenuPermissions = userData.menuPermissions as Record<string, boolean> | undefined;
        // whatsappAllowed/queues eram snapshot do LOGIN e nunca mudavam na sessão:
        // remover um canal/fila do usuário só valia após relogin, deixando os gates
        // client-side (canUserSeeTicket/baseFilteredTickets) comparando contra listas
        // velhas — um canal desassociado continuava visível/notificando via socket.
        // O GET /users/:id (ShowUserService) já retorna ambos; só faltava propagar.
        // Patch SOMENTE quando o conjunto de IDs muda: os gates só consomem ids, e
        // patch incondicional trocaria a identidade dos arrays a cada 30s, refazendo
        // memos/effects que dependem deles (mesma classe do loop do sipConfig acima).
        const idSet = (arr: unknown): string =>
          Array.isArray(arr)
            ? (arr as Array<{ id?: number } | number>)
                .map((x) => (typeof x === "number" ? x : Number(x?.id)))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b)
                .join(",")
            : "";
        const freshWhatsappAllowed = Array.isArray(userData.whatsappAllowed)
          ? (userData.whatsappAllowed as unknown[])
          : undefined;
        const freshQueues = Array.isArray(userData.queues) ? (userData.queues as unknown[]) : undefined;
        const nextWhatsappAllowed =
          freshWhatsappAllowed && idSet(freshWhatsappAllowed) !== idSet(currentUser.whatsappAllowed)
            ? freshWhatsappAllowed
            : undefined;
        const nextQueues =
          freshQueues && idSet(freshQueues) !== idSet(currentUser.queues) ? freshQueues : undefined;
        // `configs` era gravado APENAS no setAuth (login) e nunca no refresh. Como o
        // backend lê `User.configs.supervisorViewDept` DO BANCO a cada request
        // (CanUserAccessTicketServiceZPRO), ligar/desligar "Visualização por
        // Departamento" de um supervisor JÁ LOGADO deixava front e servidor
        // dessincronizados até o relogin — o F5 não resolvia porque o persist do
        // zustand rehidrata o valor velho. Sintoma ao LIGAR: o front não mandava
        // supervisorViewDept no REST (lista vinha com o tenant inteiro), o gate do
        // sino não aplicava a regra e cada clique tomava 403 ERR_NO_TICKET_ACCESS com
        // o card sumindo; ao DESLIGAR, o supervisor ficava cego enquanto o servidor já
        // havia liberado. O GET /users/:id (ShowUserService) já retorna `configs`.
        const rawConfigs = (userData as { configs?: unknown }).configs;
        const freshConfigs =
          rawConfigs && typeof rawConfigs === "object" && !Array.isArray(rawConfigs)
            ? (rawConfigs as NonNullable<typeof currentUser.configs>)
            : undefined; // resposta parcial/null não apaga o que já existe
        const localConfigs = currentUser.configs;
        // patchUser faz merge RASO: passar `configs` substitui o objeto inteiro.
        // `pinnedTickets` e `dashboardLayout` entram no store de forma OTIMISTA
        // (setPinnedTickets/setDashboardLayout ANTES do PUT /users/:id/configs
        // responder), então um refresh caindo nessa janela desfaria o clique do
        // usuário — para esses dois o valor local vence. `filtrosAtendimento` nunca é
        // escrito no store (o /atendimento lê do localStorage) e `isDark` não tem
        // escritor no front Next: neles o valor do servidor é o melhor disponível.
        const mergedConfigs = freshConfigs
          ? {
              ...freshConfigs,
              ...(localConfigs?.pinnedTickets !== undefined
                ? { pinnedTickets: localConfigs.pinnedTickets }
                : {}),
              ...(localConfigs?.dashboardLayout !== undefined
                ? { dashboardLayout: localConfigs.dashboardLayout }
                : {}),
            }
          : undefined;
        // Mesmo cuidado do whatsappAllowed/queues acima: patch SOMENTE quando muda.
        // Patch incondicional trocaria a identidade de `configs` (e do array
        // `pinnedTickets`) a cada 30s, refazendo o memo de ordenação da lista de
        // atendimentos que depende dele.
        const nextConfigs =
          mergedConfigs && JSON.stringify(mergedConfigs) !== JSON.stringify(localConfigs ?? {})
            ? mergedConfigs
            : undefined;
        patchUser({
          sipEnabled, sipServer, sipDomain, sipUsername, sipPassword, sipPort, sipTransport, sipConfig, phone,
          ...(nextMenuPermissions ? { menuPermissions: nextMenuPermissions } : {}),
          ...(nextWhatsappAllowed ? { whatsappAllowed: nextWhatsappAllowed } : {}),
          ...(nextQueues ? { queues: nextQueues } : {}),
          ...(nextConfigs ? { configs: nextConfigs } : {}),
          // Troca de senha obrigatória: cobre flagado→limpo (ex.: trocou em outra
          // aba). O caminho limpo→flagado é coberto pelo 403 no interceptor.
          ...(typeof (userData as { mustChangePassword?: boolean }).mustChangePassword === "boolean"
            ? { mustChangePassword: (userData as { mustChangePassword?: boolean }).mustChangePassword }
            : {}),
        });
        try {
          const local = safeJsonParse(localStorage.getItem("usuario"), {} as Record<string, unknown>);
          localStorage.setItem("usuario", JSON.stringify({
            ...local, sipEnabled, sipServer, sipDomain, sipUsername, sipPassword, sipPort, sipTransport, sipConfig,
            ...(nextWhatsappAllowed ? { whatsappAllowed: nextWhatsappAllowed } : {}),
            ...(nextQueues ? { queues: nextQueues } : {}),
          }));
          if (nextWhatsappAllowed) {
            localStorage.setItem("whatsappAllowed", JSON.stringify(nextWhatsappAllowed));
          }
          if (nextQueues) {
            localStorage.setItem("queues", JSON.stringify(nextQueues));
          }
        } catch { /* ignore */ }
      }
    } catch { /* silently ignore */ }
  }, [setMenuVisibility, patchUser]);

  useEffect(() => {
    if (!isAuthenticated) return;

 // Front legado — atualizarUsuario() imediato ao montar
    refreshUser();

    const scheduleRefresh = () => {
      userTimerRef.current = setTimeout(async () => {
        await refreshUser();
        scheduleRefresh();
      }, USER_REFRESH_MS);
    };

    scheduleRefresh();
    return () => {
      if (userTimerRef.current) clearTimeout(userTimerRef.current);
    };
  }, [isAuthenticated, refreshUser]);

 // ── Notification permission request on first interaction ──
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const requestOnce = () => {
      Notification.requestPermission().catch(() => {});
      unlockAudioContext();
      document.removeEventListener("click", requestOnce);
      document.removeEventListener("keydown", requestOnce);
    };

    document.addEventListener("click", requestOnce, { once: true });
    document.addEventListener("keydown", requestOnce, { once: true });

    return () => {
      document.removeEventListener("click", requestOnce);
      document.removeEventListener("keydown", requestOnce);
    };
  }, [isAuthenticated]);

  // ── Idle timeout: reload after IDLE_TIMEOUT_SECONDS of inactivity ─────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const resetIdle = () => { idleSecondsRef.current = 0; };

    const checkIdle = () => {
      idleSecondsRef.current += IDLE_CHECK_MS / 1000;
      if (idleSecondsRef.current >= IDLE_TIMEOUT_SECONDS) {
        window.location.reload();
        return;
      }
      idleTimerRef.current = setTimeout(checkIdle, IDLE_CHECK_MS);
    };

    document.addEventListener("click", resetIdle);
    document.addEventListener("mousemove", resetIdle);
    document.addEventListener("keypress", resetIdle);

    idleTimerRef.current = setTimeout(checkIdle, IDLE_CHECK_MS);

    return () => {
      document.removeEventListener("click", resetIdle);
      document.removeEventListener("mousemove", resetIdle);
      document.removeEventListener("keypress", resetIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
      {/* Skip-link de acessibilidade: primeiro elemento focável — Tab + Enter pula direto ao conteúdo */}
      <a
        href="#main-scroll"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      {/* On mobile: full width (sidebar is overlay). On desktop: offset by sidebar width */}
      <div className={cn(
        "flex flex-col flex-1 min-h-0 transition-all duration-200",
        "md:ml-64",
        sidebarCollapsed && "md:ml-[68px]"
      )}>
        <Header />
        <NoProfileBanner />
        <BillingAlertBanner />
        <AiCreditsBanner />
        <MetaRestrictionBanner />
        <MetaBannedBanner />
        <MetaSendHealthBanner />
        {/* relative container so full-height pages can use absolute inset-0 */}
        <main className="flex-1 min-h-0 relative">
          {/* normal scroll container — pages that need scrolling use this */}
          <div id="main-scroll" className="absolute inset-0 overflow-auto">
            <div className="p-3 md:p-6 h-full">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
      <AsteriskSipProvider />
      <WebphoneModal />
      <WaVoIPInitializer />
      <NativePushInitializer />
      {/* PLANO_EMAIL_MASSA D6: aviso global de envio manual p/ e-mail descadastrado */}
      <EmailOptOutConfirmDialog />
      <WabaCallProvider />
      <WabaCallModal />
      {/* W3-B: providers Dialog360 / Gupshup — paralelos ao WABA. */}
      <Dialog360CallProvider />
      {/* UI de chamada D360/Gupshup: providers escreviam no store mas nenhum modal
          era montado — chamada recebida não tinha como ser atendida (achado F7.4) */}
      <Dialog360CallModal />
      <GupshupCallProvider />
      <GupshupCallModal />
      <PrivateCallProvider />
      <PrivateCallIncomingModal />
      <PrivateCallActiveModal />
      <CommandPalette />
      <AppTour />
      <PersistentAudioPlayer />
      {showAcceptTermsModal && user?.tenantId && (
        <AcceptTermsModal
          open={true}
          tenantId={user.tenantId}
          onAccepted={() => {
            setShowAcceptTermsModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
