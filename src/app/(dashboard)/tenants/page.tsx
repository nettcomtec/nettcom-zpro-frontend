"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CHANNEL_TYPES as CHANNELS, BETA_CHANNEL_TYPES } from "@/lib/channel-types";
import { setBaseTitle } from "@/lib/tab-title";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Building2, Plus, Search, Pencil, AlertTriangle, FileText, MoreVertical, Trash2, FolderSearch, BarChart3, Trash, ArrowUpRight, ArrowDownLeft, CircleDot, CheckCircle2, Clock, Calendar, Users, MessageSquare, SlidersHorizontal, Globe, Image, Upload, X, ChevronDown, Eye, EyeOff, Info } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  fetchTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  fetchTenantMetrics,
  calculateTenantFilesSize,
  cleanTenantFiles,
  cleanTenantFilesByFilter,
  updateOAuthBulk,
  fetchTenantBranding,
  uploadTenantLogo,
  uploadTenantLogoDark,
  uploadTenantFavicon,
  deleteTenantLogoApi,
  deleteTenantLogoDarkApi,
  deleteTenantFaviconApi,
  updateTenantCustomAppName,
  fetchPaymentGatewayGlobalConfig,
  updatePaymentGatewayGlobalConfig,
  fetchTenantLicensePolicy,
} from "@/services/tenants";
import { getLogoUrl, getLogoDarkUrl, getFaviconUrl } from "@/lib/branding-urls";
import { planAllowsRoute, type PlanFeatures } from "@/lib/plan-capabilities";
import { AcceptTermsModal } from "@/components/layout/accept-terms-modal";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandingStore } from "@/stores/branding-store";
import { TenantTypographyBlock } from "@/components/tenants/tenant-typography-block";

interface Tenant {
  id: number;
  name: string;
  status?: string;
  plan?: string;
  usersCount?: number;
  connectionsCount?: number;
  maxUsers?: number;
  maxConnections?: number;
  galleryQuotaMB?: number | null;
  identity?: string;
  trial?: string;
  trialPeriod?: string;
  asaas?: string;
  asaasToken?: string;
  asaasCustomerId?: string;
  paymentGateway?: string;
  stripeToken?: string;
  stripeCustomerId?: string;
  pagarmeToken?: string;
  pagarmeCustomerId?: string;
  mercadopagoToken?: string;
  mercadopagoCustomerId?: string;
  planFeatures?: PlanFeatures | null;
  menuVisibility?: Record<string, boolean>[];
  allowedChannels?: string[];
  channelConnectionLimits?: Record<string, number>;
  oauthEnabled?: boolean;
  oauthProxyUrl?: string;
  instagramWebhookProxyUrl?: string;
  instagramWebhookProxySecret?: string;
  messengerWebhookProxyUrl?: string;
  messengerWebhookProxySecret?: string;
  videoConferenceProvider?: string;
  hidePaymentsFromUsers?: string;
  enablePlatformGoogleApp?: string;
  userCreationPasswordMode?: string;
  wavoipEnabled?: string;
  billingAlertDaysBefore?: number;
  billingBlockDaysAfter?: number;
  billingAlertMessage?: string;
  customAppName?: string | null;
  customLogoTimestamp?: number;
  customLogoDarkTimestamp?: number;
  customFaviconTimestamp?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface TenantMetrics {
  totalMessages?: {
    sent?: number;
    received?: number;
  };
  tickets?: {
    open?: number;
    closed?: number;
    pending?: number;
    schedule?: number;
  };
  contacts?: {
    total?: number;
  };
}

// Seções de "Menus Visíveis" do tenant. `key` = chave em Tenant.menuVisibility
// (lida por sidebar.isVisible e use-page-access). catKey/labelKey reusam o namespace
// layoutSidebar (já traduzido em todos os locales) — sem duplicar i18n.
const MENU_GROUPS: { catKey: string; items: { key: string; labelKey: string }[] }[] = [
  { catKey: "cat.atendimento", items: [
    { key: "atendimento", labelKey: "item.atendimentos" },
    { key: "chat-privado", labelKey: "item.chatPrivado" },
    { key: "contatos", labelKey: "item.contatos" },
  ] },
  { catKey: "cat.comunicacaoMarketing", items: [
    { key: "campanhas", labelKey: "item.campanhas" },
    { key: "email-marketing", labelKey: "item.emailMarketing" },
    { key: "massa", labelKey: "item.envioEmMassa" },
    { key: "galeria", labelKey: "item.galeria" },
    { key: "mensagens-rapidas", labelKey: "item.mensagensRapidas" },
    { key: "google-calendar", labelKey: "item.googleCalendar" },
    { key: "grupo", labelKey: "item.grupos" },
  ] },
  { catKey: "subgroup.redesSociais", items: [
    { key: "facebook-comentarios", labelKey: "item.facebookComentarios" },
    { key: "instagram-comentarios", labelKey: "item.instagram" },
    { key: "tiktok-comentarios", labelKey: "item.tiktokComentarios" },
    { key: "youtube-comentarios", labelKey: "item.youtubeComentarios" },
    { key: "chat-interno-rc", labelKey: "item.rocketChat" },
  ] },
  { catKey: "cat.gestao", items: [
    { key: "funil", labelKey: "item.funil" },
    { key: "kanban", labelKey: "item.kanban" },
    { key: "tarefas", labelKey: "item.tarefas" },
    { key: "agenda", labelKey: "item.agenda" },
  ] },
  { catKey: "cat.administracao", items: [
    { key: "sessoes", labelKey: "item.canais" },
    { key: "equipes", labelKey: "item.equipes" },
    { key: "usuarios", labelKey: "item.usuarios" },
  ] },
  { catKey: "cat.automacao", items: [
    { key: "agendamentos", labelKey: "item.agendamentos" },
    { key: "aniversarios", labelKey: "item.aniversarios" },
    { key: "chat-flow", labelKey: "item.chatFlow" },
    { key: "instagram-automacao", labelKey: "item.instagramAutomacao" },
  ] },
  { catKey: "cat.gestaoComercial", items: [
    { key: "etiquetas", labelKey: "item.etiquetas" },
    { key: "fechamento", labelKey: "item.fechamento" },
    { key: "motivos-pausa", labelKey: "item.motivosPausa" },
    { key: "filas", labelKey: "item.filas" },
    { key: "horarioAtendimento", labelKey: "item.horarioAtendimento" },
    { key: "notas", labelKey: "item.notas" },
    { key: "woocommerce", labelKey: "item.woocommerce" },
    { key: "nuvemshop", labelKey: "item.nuvemshop" },
    { key: "catalogo", labelKey: "item.catalogo" },
    { key: "cobrancas", labelKey: "item.cobrancas" },
    { key: "agendamento-publico", labelKey: "item.agendamentoPublico" },
    { key: "avaliacoes", labelKey: "item.avaliacoes" },
    { key: "logligacao", labelKey: "item.logLigacoes" },
    { key: "painel-atendimentos", labelKey: "item.painelAtendimentos" },
    { key: "protocolos", labelKey: "item.protocolos" },
    { key: "relatorios", labelKey: "item.relatorios" },
    { key: "wavoip", labelKey: "item.wavoip" },
  ] },
  { catKey: "cat.configuracao", items: [
    { key: "api-service", labelKey: "item.api" },
    { key: "audit-log", labelKey: "item.auditLog" },
    { key: "configuracoes", labelKey: "item.configuracoes" },
    { key: "integracoes-meta", labelKey: "item.integracoesMeta" },
  ] },
];

const ALL_MENU_KEYS: string[] = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.key));

// Default: todos os menus visíveis (não esconde nada de quem já existe — sem regressão).
const DEFAULT_MENU: Record<string, boolean> = Object.fromEntries(
  ALL_MENU_KEYS.map((k) => [k, true])
);

const DEFAULT_CHANNELS = CHANNELS.map((c) => c.value);

const EMPTY: Partial<Tenant> = {
  name: "", status: "active", maxUsers: 5, maxConnections: 3, identity: "",
  trial: "disabled", trialPeriod: "", asaas: "disabled", asaasToken: "", asaasCustomerId: "",
  paymentGateway: "", stripeToken: "", stripeCustomerId: "", pagarmeToken: "", pagarmeCustomerId: "",
  mercadopagoToken: "", mercadopagoCustomerId: "",
  billingAlertDaysBefore: 0, billingBlockDaysAfter: 0, billingAlertMessage: "",
  allowedChannels: DEFAULT_CHANNELS,
  oauthEnabled: true,
  oauthProxyUrl: "https://oauth.techprovider.com.br",
  instagramWebhookProxyUrl: "https://oauth.techprovider.com.br/instagram-webhook",
  instagramWebhookProxySecret: "2f5b5b457e2febbc3c2333e2ebc84df926a45c36f76f3bedc0d1994f749413f1",
  messengerWebhookProxyUrl: "https://oauth.techprovider.com.br/messenger-webhook",
  messengerWebhookProxySecret: "2f5b5b457e2febbc3c2333e2ebc84df926a45c36f76f3bedc0d1994f749413f1",
  videoConferenceProvider: "jitsi",
  hidePaymentsFromUsers: "enabled",
  enablePlatformGoogleApp: "enabled",
  userCreationPasswordMode: "manual",
  wavoipEnabled: "enabled",
};

function normalizeTenants(raw: unknown): Tenant[] {
  if (Array.isArray(raw)) return raw as Tenant[];
  const obj = raw as Record<string, unknown>;
  const arr = obj?.tenants ?? obj?.data;
  return Array.isArray(arr) ? (arr as Tenant[]) : [];
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between py-1 text-sm font-semibold hover:text-primary transition-colors"
        >
          {title}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function TenantsPage() {
  const t = useTranslations("tenantsPage");
  const { user } = useAuthStore();

  // Labels dos "Menus Visíveis" reusam o namespace do sidebar (já traduzido em todos os locales).
  const ts = useTranslations("layoutSidebar");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Tenant>>(EMPTY);
  const [menuVis, setMenuVis] = useState<Record<string, boolean>>(DEFAULT_MENU);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(DEFAULT_CHANNELS);
  const [channelLimits, setChannelLimits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsTenant, setMetricsTenant] = useState<Tenant | null>(null);
  const [metricsData, setMetricsData] = useState<TenantMetrics | null>(null);
  const [actionTenantId, setActionTenantId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "deleteTenant" | "cleanFiles"; tenant: Tenant } | null>(null);
  const [filterCleanDialog, setFilterCleanDialog] = useState<Tenant | null>(null);
  const [filterOlderThanDays, setFilterOlderThanDays] = useState("0");
  const [filterMinSizeMB, setFilterMinSizeMB] = useState("0");
  const [filterCleanRunning, setFilterCleanRunning] = useState(false);
  // errorCount é opcional: backend anterior a esta versão só devolve os 3 primeiros campos
  // (falhas de exclusão iam somadas em skippedCount e ficavam invisíveis no relatório).
  const [filterCleanResult, setFilterCleanResult] = useState<{ deletedCount: number; deletedSizeMB: number; skippedCount: number; errorCount?: number } | null>(null);
  const [showAcceptTerms, setShowAcceptTerms] = useState(false);
  const [bulkOAuthOpen, setBulkOAuthOpen] = useState(false);
  const [bulkOAuth, setBulkOAuth] = useState({
    oauthEnabled: true,
    oauthProxyUrl: "https://oauth.techprovider.com.br",
    instagramWebhookProxyUrl: "https://oauth.techprovider.com.br/instagram-webhook",
    instagramWebhookProxySecret: "2f5b5b457e2febbc3c2333e2ebc84df926a45c36f76f3bedc0d1994f749413f1",
    messengerWebhookProxyUrl: "https://oauth.techprovider.com.br/messenger-webhook",
    messengerWebhookProxySecret: "2f5b5b457e2febbc3c2333e2ebc84df926a45c36f76f3bedc0d1994f749413f1",
  });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showIgSecret, setShowIgSecret] = useState(false);
  const [showMsgrSecret, setShowMsgrSecret] = useState(false);
  const [showBulkIgSecret, setShowBulkIgSecret] = useState(false);
  const [showBulkMsgrSecret, setShowBulkMsgrSecret] = useState(false);
  const [brandingAppName, setBrandingAppName] = useState("");
  const [brandingLogoTs, setBrandingLogoTs] = useState(0);
  const [brandingLogoDarkTs, setBrandingLogoDarkTs] = useState(0);
  const [brandingFaviconTs, setBrandingFaviconTs] = useState(0);
  const [brandingUploading, setBrandingUploading] = useState<string | null>(null);
  // Cobrança no cadastro — config GLOBAL (payment-config.json), não por-tenant.
  const [globalFirstChargeDueDays, setGlobalFirstChargeDueDays] = useState<number>(30);
  const [globalRequirePaymentBeforeAccess, setGlobalRequirePaymentBeforeAccess] = useState(false);
  const [savingBillingGlobal, setSavingBillingGlobal] = useState(false);
  // Licença de empresa única: bloqueia a criação de novas empresas (só a
  // principal loga). Começa em false — enquanto não houver confirmação do
  // servidor, a tela funciona como sempre funcionou.
  const [singleTenantLicense, setSingleTenantLicense] = useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const logoDarkInputRef = React.useRef<HTMLInputElement>(null);
  const faviconInputRef = React.useRef<HTMLInputElement>(null);

  const set = (k: keyof Tenant, v: unknown) => setEditing((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTenants();
      setData(normalizeTenants(res.data));
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // Licença de empresa única (rota aditiva): backend antigo devolve 404 e a
  // tela segue liberada — o servidor continua sendo quem decide no POST.
  // Só superadmin consulta: para os demais a rota responde 403 ERR_NO_PERMISSION,
  // que o interceptor transforma em toast global de permissão negada.
  useEffect(() => {
    if (user?.profile !== "superadmin") return;
    fetchTenantLicensePolicy()
      .then((res) => setSingleTenantLicense(res.data?.singleTenant === true))
      .catch(() => setSingleTenantLicense(false));
  }, [user?.profile]);

  // Carrega a config GLOBAL de cobrança no cadastro (payment-config.json).
  useEffect(() => {
    fetchPaymentGatewayGlobalConfig()
      .then((res) => {
        const cfg = (res.data || {}) as { firstChargeDueDays?: number; requirePaymentBeforeAccess?: boolean };
        setGlobalFirstChargeDueDays(typeof cfg.firstChargeDueDays === "number" ? cfg.firstChargeDueDays : 30);
        setGlobalRequirePaymentBeforeAccess(cfg.requirePaymentBeforeAccess === true);
      })
      .catch(() => { /* mantém defaults */ });
  }, []);

  async function handleSaveBillingGlobal() {
    setSavingBillingGlobal(true);
    try {
      await updatePaymentGatewayGlobalConfig({
        firstChargeDueDays: globalFirstChargeDueDays,
        requirePaymentBeforeAccess: globalRequirePaymentBeforeAccess,
      });
      toast.success(t("billingGlobalSaved"));
    } catch {
      toast.error(t("errorSavingBillingGlobal"));
    } finally {
      setSavingBillingGlobal(false);
    }
  }

  const filtered = data.filter((tenant) =>
    (tenant.name || "").toLowerCase().includes(search.toLowerCase())
  );
  const { sortKey, sortDir, handleSort, sortedData: sortedFiltered } = useSortable(filtered, "name");

  function openCreate() {
    if (singleTenantLicense) {
      toast.error(t("singleTenantBlockedTitle"), { description: t("singleTenantBlockedDesc") });
      return;
    }
    setEditing({ ...EMPTY });
    setMenuVis({ ...DEFAULT_MENU });
    setSelectedChannels([...DEFAULT_CHANNELS]);
    setChannelLimits({});
    setBrandingAppName("");
    setBrandingLogoTs(0);
    setBrandingLogoDarkTs(0);
    setBrandingFaviconTs(0);
    setDialogOpen(true);
  }

  function openEdit(t: Tenant) {
    setEditing({ ...t });
    const mv = t.menuVisibility?.[0] ?? DEFAULT_MENU;
    setMenuVis({ ...DEFAULT_MENU, ...mv });
    setSelectedChannels(t.allowedChannels?.length ? [...t.allowedChannels] : [...DEFAULT_CHANNELS]);
    setChannelLimits(t.channelConnectionLimits ?? {});
    setBrandingAppName(t.customAppName || "");
    setBrandingLogoTs(Number(t.customLogoTimestamp) || 0);
    setBrandingLogoDarkTs(Number(t.customLogoDarkTimestamp) || 0);
    setBrandingFaviconTs(Number(t.customFaviconTimestamp) || 0);
    setDialogOpen(true);
    if (t.id) {
      fetchTenantBranding(t.id).then(({ data }) => {
        const tb = data as { customAppName: string | null; customLogoTimestamp: number; customLogoDarkTimestamp: number; customFaviconTimestamp: number };
        setBrandingAppName(tb.customAppName || "");
        setBrandingLogoTs(Number(tb.customLogoTimestamp) || 0);
        setBrandingLogoDarkTs(Number(tb.customLogoDarkTimestamp) || 0);
        setBrandingFaviconTs(Number(tb.customFaviconTimestamp) || 0);
        syncBrandingToList(t.id!, { customAppName: tb.customAppName ?? null, customLogoTimestamp: tb.customLogoTimestamp, customLogoDarkTimestamp: tb.customLogoDarkTimestamp, customFaviconTimestamp: tb.customFaviconTimestamp });
      }).catch(() => {});
    }
  }

  const toggleChannel = (val: string) => {
    setSelectedChannels((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  };

  function syncBrandingToList(tid: number, patch: Partial<Tenant>) {
    setData(prev => prev.map(t => t.id === tid ? { ...t, ...patch } : t));
    setEditing(prev => prev.id === tid ? { ...prev, ...patch } : prev);
  }

  async function handleBrandingUpload(asset: "logo" | "logoDark" | "favicon", file: File) {
    const tid = editing.id;
    if (!tid) { toast.error(t("brandingSaveFirst")); return; }
    setBrandingUploading(asset);
    try {
      const fn = asset === "logo" ? uploadTenantLogo : asset === "logoDark" ? uploadTenantLogoDark : uploadTenantFavicon;
      const { data } = await fn(tid, file);
      const ts = (data as { timestamp: number }).timestamp || Date.now();
      if (asset === "logo") { setBrandingLogoTs(ts); syncBrandingToList(tid, { customLogoTimestamp: ts }); }
      else if (asset === "logoDark") { setBrandingLogoDarkTs(ts); syncBrandingToList(tid, { customLogoDarkTimestamp: ts }); }
      else { setBrandingFaviconTs(ts); syncBrandingToList(tid, { customFaviconTimestamp: ts }); }
      toast.success(t("brandingUploaded"));
    } catch {
      toast.error(t("brandingUploadError"));
    } finally {
      setBrandingUploading(null);
    }
  }

  async function handleBrandingDelete(asset: "logo" | "logoDark" | "favicon") {
    const tid = editing.id;
    if (!tid) return;
    setBrandingUploading(asset);
    try {
      const fn = asset === "logo" ? deleteTenantLogoApi : asset === "logoDark" ? deleteTenantLogoDarkApi : deleteTenantFaviconApi;
      await fn(tid);
      if (asset === "logo") { setBrandingLogoTs(0); syncBrandingToList(tid, { customLogoTimestamp: 0 }); }
      else if (asset === "logoDark") { setBrandingLogoDarkTs(0); syncBrandingToList(tid, { customLogoDarkTimestamp: 0 }); }
      else { setBrandingFaviconTs(0); syncBrandingToList(tid, { customFaviconTimestamp: 0 }); }
      toast.success(t("brandingDeleted"));
    } catch {
      toast.error(t("brandingDeleteError"));
    } finally {
      setBrandingUploading(null);
    }
  }

  async function handleBrandingAppNameSave() {
    const tid = editing.id;
    if (!tid) return;
    try {
      await updateTenantCustomAppName(tid, brandingAppName);
      syncBrandingToList(tid, { customAppName: brandingAppName || null });

      // Atualiza localStorage cache do tenant editado
      const cacheKey = `zpro-tenant-branding-${tid}`;
      try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          localStorage.setItem(cacheKey, JSON.stringify({ ...parsed, customAppName: brandingAppName || null }));
        }
      } catch { /* ignore */ }

      // Se estiver editando o próprio tenant do usuário logado, atualiza o store de branding
      const storeState = useBrandingStore.getState();
      if (storeState.tenantBranding?.tenantId === tid) {
        storeState.setTenantBranding({ ...storeState.tenantBranding, customAppName: brandingAppName || null });
        if (brandingAppName) {
          setBaseTitle(brandingAppName);
          storeState.setAppName(brandingAppName);
        } else {
          try {
            const gb = JSON.parse(localStorage.getItem("zpro-branding") || "null") as { appName?: string } | null;
            if (gb?.appName) { setBaseTitle(gb.appName); storeState.setAppName(gb.appName); }
          } catch { /* ignore */ }
        }
      }

      toast.success(t("brandingAppNameSaved"));
    } catch {
      toast.error(t("brandingAppNameError"));
    }
  }

  async function handleSave() {
    if (editing.id === 1 && editing.status === "inactive") { toast.error(t("deactivateProtected")); return; }
    if (!editing.name?.trim()) { toast.error(t("errorNameRequired")); return; }
    if (!editing.maxUsers || !editing.maxConnections) { toast.error(t("errorFillMaxFields")); return; }
    const gw = editing.paymentGateway === "stripe" ? "stripe" :
      editing.paymentGateway === "pagarme" ? "pagarme" :
      editing.paymentGateway === "mercadopago" ? "mercadopago" :
      editing.asaas === "enabled" ? "asaas" : "";
    if (gw === "asaas" && (!editing.asaasToken || !editing.asaasCustomerId)) {
      toast.error(t("errorAsaasRequired")); return;
    }
    if (gw === "stripe" && !editing.stripeToken) {
      toast.error(t("errorGatewayTokenRequired")); return;
    }
    if (gw === "pagarme" && !editing.pagarmeToken) {
      toast.error(t("errorGatewayTokenRequired")); return;
    }
    if (gw === "mercadopago" && !editing.mercadopagoToken) {
      toast.error(t("errorGatewayTokenRequired")); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...editing,
        identity: editing.identity !== "" && editing.identity != null ? Number(editing.identity) : null,
        trialPeriod: editing.trialPeriod !== "" && editing.trialPeriod != null ? Number(editing.trialPeriod) : null,
        menuVisibility: [menuVis],
        allowedChannels: selectedChannels,
        channelConnectionLimits: channelLimits,
      };
      // "Nenhum" no seletor de gateway = string vazia. O backend (CreateTenantService)
      // rejeita paymentGateway === "" (valor fora do enum asaas/stripe/pagarme/mercadopago)
      // com ERR_INVALID_PAYMENT_GATEWAY. Na CRIACAO omitimos o campo para cair no default
      // da coluna; o `asaas: "disabled"` que ja acompanha o payload garante que nao ha
      // cobranca (a tela mostra "Nenhum" pois o Select deriva o valor de asaas==="enabled").
      // Na EDICAO mantemos "" para permitir LIMPAR um gateway definido antes.
      if (!editing.id && payload.paymentGateway === "") {
        delete payload.paymentGateway;
      }
      if (editing.id) {
        await updateTenant(editing.id as number, payload as Record<string, unknown>);
        toast.success(t("tenantUpdated"));
      } else {
        const maxAttempts = 3;
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await createTenant(payload as Record<string, unknown>);
            toast.success(t("tenantCreated"));
            lastError = null;
            if (user?.profile === "superadmin") {
              setShowAcceptTerms(true);
            }
            break;
          } catch (err) {
            lastError = err;
            const errData =
              (err as { response?: { data?: { error?: string } } })?.response?.data ??
              (err as { data?: { error?: string } })?.data;
            const errMsg = (errData?.error ?? "").toString();
            const isRetryable =
              errMsg.includes("SequelizeUniqueConstraintError") ||
              errMsg.includes("Validation error") ||
              errMsg.includes("Internal server error") ||
              errMsg.includes("já cadastrado") ||
              errMsg.includes("Já existe");
            if (isRetryable && attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
            break;
          }
        }
        if (lastError) throw lastError;
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      // Licença de empresa única: o servidor recusa a criação (403). Sem esta
      // leitura o cliente via só "erro ao criar" e tentava de novo.
      const errData =
        (err as { response?: { data?: { error?: string } } })?.response?.data ??
        (err as { data?: { error?: string } })?.data;
      if ((errData?.error ?? "").toString() === "ERR_LICENSE_SINGLE_TENANT") {
        setSingleTenantLicense(true);
        setDialogOpen(false);
        toast.error(t("singleTenantBlockedTitle"), { description: t("singleTenantBlockedDesc") });
        return;
      }
      toast.error(editing.id ? t("errorUpdating") : t("errorCreating"));
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteTenant(tenant: Tenant) {
    if (tenant.id === 1) {
      toast.error(t("deleteProtected"));
      return;
    }
    setConfirmDialog({ type: "deleteTenant", tenant });
  }

  async function handleCalculateFiles(tenant: Tenant) {
    try {
      setActionTenantId(tenant.id);
      const response = await calculateTenantFilesSize(tenant.id);
      const mb = response.data?.folderSizeMB ?? 0;
      const size = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
      toast.success(t("filesSize", { size }), {
        description: t("externalStorageNoticeSize"),
        duration: 8000,
      });
    } catch {
      toast.error(t("calculateFilesError"));
    } finally {
      setActionTenantId(null);
    }
  }

  function handleCleanFiles(tenant: Tenant) {
    setConfirmDialog({ type: "cleanFiles", tenant });
  }

  async function executeConfirm() {
    if (!confirmDialog) return;
    const { type, tenant } = confirmDialog;
    setConfirmDialog(null);

    if (type === "deleteTenant") {
      try {
        setActionTenantId(tenant.id);
        await deleteTenant(tenant.id);
        setData((prev) => prev.filter((item) => item.id !== tenant.id));
        toast.success(t("tenantDeleted", { id: tenant.id }));
      } catch (error) {
        const errData =
          (error as { response?: { data?: { error?: string } } })?.response?.data ??
          (error as { data?: { error?: string } })?.data;
        const errMsg = (errData?.error ?? "").toString();
        toast.error(errMsg ? t("tenantDeleteErrorWithMessage", { error: errMsg }) : t("tenantDeleteError"));
      } finally {
        setActionTenantId(null);
      }
    } else {
      try {
        setActionTenantId(tenant.id);
        await cleanTenantFiles(tenant.id);
        toast.success(t("deleteFilesSuccess", { id: tenant.id }));
      } catch {
        toast.error(t("deleteFilesError"));
      } finally {
        setActionTenantId(null);
      }
    }
  }

  function openFilterCleanDialog(tenant: Tenant) {
    setFilterCleanResult(null);
    setFilterOlderThanDays("0");
    setFilterMinSizeMB("0");
    setFilterCleanDialog(tenant);
  }

  async function runFilterClean() {
    if (!filterCleanDialog) return;
    const days = Number(filterOlderThanDays);
    const sizeMB = Number(filterMinSizeMB);
    if (!days && !sizeMB) {
      toast.error(t("cleanByFilterNoFilter"));
      return;
    }
    setFilterCleanRunning(true);
    setFilterCleanResult(null);
    try {
      const { data } = await cleanTenantFilesByFilter(filterCleanDialog.id, {
        olderThanDays: days > 0 ? days : undefined,
        minSizeMB: sizeMB > 0 ? sizeMB : undefined,
      });
      setFilterCleanResult(data);
    } catch {
      toast.error(t("cleanByFilterError"));
    } finally {
      setFilterCleanRunning(false);
    }
  }

  async function handleBulkOAuthSave() {
    setBulkSaving(true);
    try {
      await updateOAuthBulk(bulkOAuth);
      toast.success(t("bulkOAuthSuccess"));
      setBulkOAuthOpen(false);
      load();
    } catch {
      toast.error(t("bulkOAuthError"));
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleOpenMetrics(tenant: Tenant) {
    try {
      setMetricsTenant(tenant);
      setMetricsData(null);
      setMetricsOpen(true);
      setMetricsLoading(true);
      const { data: metrics } = await fetchTenantMetrics(tenant.id);
      setMetricsData(metrics as TenantMetrics);
    } catch {
      toast.error(t("metricsLoadError"));
    } finally {
      setMetricsLoading(false);
    }
  }

  // Aviso de inconsistência: soma dos limites por tipo (canais permitidos) não pode exceder maxConnections.
  const tenantMaxConn = Number(editing.maxConnections) || 0;
  const tenantChannelSum = selectedChannels.reduce((acc, c) => acc + (Number(channelLimits[c]) > 0 ? Number(channelLimits[c]) : 0), 0);
  const showTenantChannelOverflow = tenantMaxConn > 0 && tenantChannelSum > tenantMaxConn;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOAuthOpen(true)} title={t("bulkOAuthBtn")}>
            <Globe className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("bulkOAuthBtn")}</span>
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            disabled={singleTenantLicense}
            title={singleTenantLicense ? t("singleTenantBlockedTitle") : t("newTenant")}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("newTenant")}</span>
          </Button>
        </div>
      </PageHeader>

      {singleTenantLicense && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">{t("singleTenantBlockedTitle")}</span>{" "}
            {t("singleTenantBlockedDesc")}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Building2} title={t("emptyTitle")} description={t("emptyDescription")}>
              <Button
                onClick={openCreate}
                disabled={singleTenantLicense}
                title={singleTenantLicense ? t("singleTenantBlockedTitle") : t("newTenant")}
              >
                <Plus className="mr-2 h-4 w-4" /> {t("newTenant")}
              </Button>
            </EmptyState>
          ) : (
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                  <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                  <SortableTableHead sortKey="status" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                  <SortableTableHead sortKey="planId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colPlan")}</SortableTableHead>
                  <SortableTableHead sortKey="maxUsers" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colUsers")}</SortableTableHead>
                  <SortableTableHead sortKey="maxConnections" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colConnections")}</SortableTableHead>
                  <SortableTableHead sortKey="createdAt" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colCreatedAt")}</SortableTableHead>
                  <TableHead className="w-[80px]">{t("colActions")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sortedFiltered.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="text-muted-foreground font-mono text-sm">{tenant.id}</TableCell>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>
                        <Badge variant={tenant.status === "active" ? "success" : tenant.status === "trial" ? "warning" : "destructive"}>
                          {tenant.status === "active" ? t("statusActive") : tenant.status === "trial" ? "Trial" : (tenant.status as string) || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{(tenant.plan as string) ?? "—"}</TableCell>
                      <TableCell>{tenant.usersCount ?? tenant.maxUsers ?? "—"}</TableCell>
                      <TableCell>{tenant.connectionsCount ?? tenant.maxConnections ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {tenant.createdAt ? formatDateTime(tenant.createdAt as string) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(tenant)}
                            disabled={actionTenantId === tenant.id}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={actionTenantId === tenant.id}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleDeleteTenant(tenant)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("actionDeleteTenant")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCalculateFiles(tenant)}>
                                <FolderSearch className="mr-2 h-4 w-4" />
                                {t("actionCalculateFiles")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenMetrics(tenant)}>
                                <BarChart3 className="mr-2 h-4 w-4" />
                                {t("actionMetrics")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openFilterCleanDialog(tenant)}>
                                <SlidersHorizontal className="mr-2 h-4 w-4" />
                                {t("actionCleanByFilter")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCleanFiles(tenant)} className="text-destructive">
                                <Trash className="mr-2 h-4 w-4" />
                                {t("actionDeleteFiles")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </>
      )}

      {/* Terms Dialog */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> {t("termsTitle")}
            </DialogTitle>
            <DialogDescription>{t("termsDescription")}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="termos">
            <TabsList className="w-full">
              <TabsTrigger value="termos" className="flex-1">{t("tabTerms")}</TabsTrigger>
              <TabsTrigger value="privacidade" className="flex-1">{t("tabPrivacy")}</TabsTrigger>
            </TabsList>
            <TabsContent value="termos">
              <ScrollArea className="h-[50vh] pr-4">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <h3 className="text-base font-semibold text-foreground">Termos e Condições de Uso de Licenciamento</h3>
                  <p><a href="https://zpro.passaportezdg.com.br/termos-e-condicoes-de-uso" target="_blank" rel="noopener noreferrer" className="text-primary underline">Download completo aqui</a></p>
                  <p><strong>Módulo Z-PRO</strong> — Última atualização: 14/01/2026</p>
                  <p>Estes Termos regulam a relação comercial e o licenciamento entre a <strong>BIANCA SANT ANA PEREIRA &amp; CIA LTDA</strong> (ZPRO/LICENCIANTE) e o CLIENTE/LICENCIADO.</p>
                  <p>AO CONTRATAR E UTILIZAR O SISTEMA ZPRO, O CLIENTE DECLARA TER LIDO, COMPREENDIDO E ACEITO INTEGRALMENTE ESTES TERMOS.</p>
                  <h4 className="font-semibold text-foreground mt-2">1. Licença de Uso</h4>
                  <p>O contrato concede ao Cliente uma Licença de Uso não exclusiva, intransferível e temporária do Sistema ZPRO para instalação em servidor (VPS) do próprio Cliente.</p>
                  <h4 className="font-semibold text-foreground mt-2">2. Restrições</h4>
                  <p>É vedado copiar, vender ou distribuir o código-fonte; realizar engenharia reversa; sublicenciar ou transferir arquivos de instalação a terceiros para instalação em infraestrutura própria.</p>
                  <h4 className="font-semibold text-foreground mt-2">3. Responsabilidades</h4>
                  <p>O Cliente é o único responsável por seus funcionários (usuários/atendentes) e por seus clientes finais (Tenants). A ZPRO não possui relação com os Tenants do Cliente.</p>
                  <h4 className="font-semibold text-foreground mt-2">4. APIs Não Oficiais</h4>
                  <p>O uso de APIs Não Oficiais (WWebJS, Baileys, Evolution, etc.) é de total responsabilidade do Cliente, ciente dos riscos de desconexão, perda de mensagens e possíveis banimentos pela Meta.</p>
                  <h4 className="font-semibold text-foreground mt-2">5. Pagamento e Renovação</h4>
                  <p>A licença é anual. A renovação não é automática; o Cliente deve renová-la antes do vencimento para manter o acesso.</p>
                  <p className="text-xs mt-4">Para o texto completo, acesse: <a href="https://zpro.passaportezdg.com.br/termos-e-condicoes-de-uso" target="_blank" rel="noopener noreferrer" className="text-primary underline">zpro.passaportezdg.com.br</a></p>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="privacidade">
              <ScrollArea className="h-[50vh] pr-4">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <h3 className="text-base font-semibold text-foreground">Política de Privacidade</h3>
                  <p>A ZPRO compromete-se a proteger a privacidade dos dados pessoais de seus Clientes e Usuários, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
                  <h4 className="font-semibold text-foreground mt-2">Dados Coletados</h4>
                  <p>Coletamos dados necessários para a prestação do serviço: nome, e-mail, dados de acesso e informações de pagamento.</p>
                  <h4 className="font-semibold text-foreground mt-2">Uso dos Dados</h4>
                  <p>Os dados são utilizados exclusivamente para: prestação e melhoria dos serviços contratados; comunicação sobre o sistema; cumprimento de obrigações legais.</p>
                  <h4 className="font-semibold text-foreground mt-2">Compartilhamento</h4>
                  <p>Não vendemos ou compartilhamos dados pessoais com terceiros, exceto quando exigido por lei ou para processamento de pagamentos por parceiros autorizados.</p>
                  <h4 className="font-semibold text-foreground mt-2">Segurança</h4>
                  <p>Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda ou destruição.</p>
                  <h4 className="font-semibold text-foreground mt-2">Seus Direitos (LGPD)</h4>
                  <p>Você tem direito a: confirmação de tratamento; acesso aos dados; correção de dados inexatos; exclusão; portabilidade; revogação do consentimento.</p>
                  <p className="text-xs mt-4">Dúvidas: entre em contato conosco pelo suporte oficial da ZPRO.</p>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTermsOpen(false)}>{t("btnCancel")}</Button>
            <Button onClick={() => { setTermsOpen(false); setDialogOpen(true); }}>
              {t("btnAcceptTerms")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("labelStatus")} {editing.status === "active" ? t("statusActiveLabel") : t("statusInactiveLabel")}</Label>
              <Switch
                checked={editing.status === "active"}
                onCheckedChange={(v) => {
                  if (!v && editing.id === 1) {
                    toast.error(t("deactivateProtected"));
                    return;
                  }
                  set("status", v ? "active" : "inactive");
                }}
              />
            </div>

            {/* Dados básicos */}
            <div className="space-y-1.5">
              <Label>{t("labelName")}</Label>
              <Input value={editing.name || ""} onChange={(e) => set("name", e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="whitespace-nowrap">
                  {t("labelMaxUsers")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="ml-1 inline-block h-3.5 w-3.5 align-[-2px] text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] text-xs">{t("maxUsersHelp")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input type="number" value={editing.maxUsers ?? ""} onChange={(e) => set("maxUsers", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="whitespace-nowrap">
                  {t("labelMaxConnections")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="ml-1 inline-block h-3.5 w-3.5 align-[-2px] text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] text-xs">{t("maxConnectionsHelp")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input type="number" value={editing.maxConnections ?? ""} onChange={(e) => set("maxConnections", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="whitespace-nowrap">
                  {t("labelGalleryQuota")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="ml-1 inline-block h-3.5 w-3.5 align-[-2px] text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] text-xs">{t("galleryQuotaHelp")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.galleryQuotaMB ?? ""}
                  onChange={(e) => set("galleryQuotaMB", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labelIdentity")}</Label>
              <Input value={editing.identity || ""} onChange={(e) => set("identity", e.target.value)} placeholder={t("identityPlaceholder")} />
            </div>

            <Separator />

            {/* Trial */}
            <CollapsibleSection title={t("trialPeriodTitle")}>
              <div className="flex items-center justify-between rounded-lg border p-3 mb-2">
                <Label>{editing.trial === "enabled" ? t("trialEnabled") : t("trialDisabled")}</Label>
                <Switch
                  checked={editing.trial === "enabled"}
                  onCheckedChange={(v) => set("trial", v ? "enabled" : "disabled")}
                />
              </div>
              {editing.trial === "enabled" && (
                <div className="space-y-1.5">
                  <Label>{t("labelTrialDuration")}</Label>
                  <Input value={editing.trialPeriod || ""} onChange={(e) => set("trialPeriod", e.target.value)} placeholder={t("trialDurationPlaceholder")} />
                </div>
              )}
              {editing.id === 1 && (
                <Alert variant="warning" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{t("tenantIdWarning")}</AlertDescription>
                </Alert>
              )}
            </CollapsibleSection>

            <Separator />

            {/* Gateway de Pagamento */}
            <CollapsibleSection title={t("paymentGatewayTitle")}>
              <div className="space-y-2">
                {/* Banner: como funcionam planos, cobrança e bloqueio */}
                <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-2.5 text-[11px] leading-relaxed text-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
                  <div className="space-y-1">
                    <p className="font-semibold">{t("billingFlowTitle")}</p>
                    <ul className="list-disc pl-3.5 space-y-0.5">
                      <li>{t("billingFlowI0")}</li>
                      <li>{t("billingFlowI1")}</li>
                      <li>{t("billingFlowI2")}</li>
                      <li>{t("billingFlowI3")}</li>
                    </ul>
                  </div>
                </div>

                {/* Cobrança no cadastro — config GLOBAL (afeta todos os tenants / signup público) */}
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      {t("firstChargeGlobalTitle")}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("firstChargeGlobalDesc")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("labelFirstChargeDueDays")}</Label>
                    <Input
                      type="number" min={0} max={365}
                      className="h-8 text-sm"
                      value={globalFirstChargeDueDays}
                      onChange={(e) => setGlobalFirstChargeDueDays(Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
                    />
                    <p className="text-[11px] text-muted-foreground">{t("firstChargeDueDaysHelp")}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-md border bg-background p-2.5">
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs font-semibold">{t("labelRequirePaymentBeforeAccess")}</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t("requirePaymentBeforeAccessHelp")}</p>
                    </div>
                    <Switch
                      checked={globalRequirePaymentBeforeAccess}
                      onCheckedChange={setGlobalRequirePaymentBeforeAccess}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={handleSaveBillingGlobal} disabled={savingBillingGlobal}>
                    {t("saveBillingGlobal")}
                  </Button>
                </div>

                <Separator className="my-1" />

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("labelPaymentGateway")}</Label>
                  <Select
                    value={
                      editing.paymentGateway === "stripe" ? "stripe" :
                      editing.paymentGateway === "pagarme" ? "pagarme" :
                      editing.paymentGateway === "mercadopago" ? "mercadopago" :
                      editing.asaas === "enabled" ? "asaas" : "none"
                    }
                    onValueChange={(v) => {
                      const val = v === "none" ? "" : v;
                      set("paymentGateway", val);
                      set("asaas", v === "asaas" ? "enabled" : "disabled");
                      // Ao sair do Asaas, zera o provisionamento Asaas do tenant para
                      // o gateway efetivo (resolveTenantGateway) parar de cair em Asaas
                      // pela Regra 2 (asaasCustomerId "grudento" vence o global).
                      if (v !== "asaas") {
                        set("asaasCustomerId", "");
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={t("paymentGatewayNone")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("paymentGatewayNone")}</SelectItem>
                      <SelectItem value="asaas">Asaas</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="pagarme">Pagar.me</SelectItem>
                      <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editing.asaas === "enabled" && (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelAsaasToken")}</Label>
                      <Input type="password" value={editing.asaasToken || ""} onChange={(e) => set("asaasToken", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelAsaasCustomerId")}</Label>
                      <Input value={editing.asaasCustomerId || ""} onChange={(e) => set("asaasCustomerId", e.target.value)} />
                    </div>
                  </div>
                )}

                {editing.paymentGateway === "stripe" && (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelStripeToken")}</Label>
                      <Input type="password" value={editing.stripeToken || ""} onChange={(e) => set("stripeToken", e.target.value)} placeholder="sk_live_..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelStripeCustomerId")}</Label>
                      <Input value={editing.stripeCustomerId || ""} onChange={(e) => set("stripeCustomerId", e.target.value)} placeholder="cus_..." />
                    </div>
                  </div>
                )}

                {editing.paymentGateway === "pagarme" && (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelPagarmeToken")}</Label>
                      <Input type="password" value={editing.pagarmeToken || ""} onChange={(e) => set("pagarmeToken", e.target.value)} placeholder="ak_live_..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelPagarmeCustomerId")}</Label>
                      <Input value={editing.pagarmeCustomerId || ""} onChange={(e) => set("pagarmeCustomerId", e.target.value)} placeholder="cus_..." />
                    </div>
                  </div>
                )}

                {editing.paymentGateway === "mercadopago" && (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelMercadopagoToken")}</Label>
                      <Input type="password" value={editing.mercadopagoToken || ""} onChange={(e) => set("mercadopagoToken", e.target.value)} placeholder="APP_USR-..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("labelMercadopagoCustomerId")}</Label>
                      <Input value={editing.mercadopagoCustomerId || ""} onChange={(e) => set("mercadopagoCustomerId", e.target.value)} />
                    </div>
                  </div>
                )}

                <Separator className="my-1" />
                <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs font-semibold">{t("hidePaymentsFromUsersLabel")}</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("hidePaymentsFromUsersDesc")}</p>
                  </div>
                  <Switch
                    checked={(editing.hidePaymentsFromUsers ?? "enabled") === "enabled"}
                    onCheckedChange={(v) => set("hidePaymentsFromUsers", v ? "enabled" : "disabled")}
                  />
                </div>

                {!!editing.paymentGateway && (
                  <>
                    <Separator className="my-1" />
                    <p className="text-xs font-semibold text-muted-foreground">{t("billingAlertTitle")}</p>
                    <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 p-2.5 text-[11px] leading-relaxed text-foreground">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
                      <div className="space-y-1">
                        <p className="font-semibold">{t("billingHelpTitle")}</p>
                        <ul className="list-disc pl-3.5 space-y-0.5">
                          <li>{t("billingHelpAlert")}</li>
                          <li>{t("billingHelpBlock")}</li>
                          <li>{t("billingHelpLifecycle")}</li>
                        </ul>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("billingAlertDaysBeforeLabel")}</Label>
                        <Input
                          type="number" min={0}
                          placeholder={t("billingAlertDaysBeforePlaceholder")}
                          value={editing.billingAlertDaysBefore ?? 0}
                          onChange={(e) => set("billingAlertDaysBefore", Number(e.target.value))}
                          className="h-7 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("billingBlockDaysAfterLabel")}</Label>
                        <Input
                          type="number" min={0}
                          placeholder={t("billingBlockDaysAfterPlaceholder")}
                          value={editing.billingBlockDaysAfter ?? 0}
                          onChange={(e) => set("billingBlockDaysAfter", Number(e.target.value))}
                          className="h-7 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("billingAlertMessageLabel")}</Label>
                      <Input
                        value={editing.billingAlertMessage || ""}
                        onChange={(e) => set("billingAlertMessage", e.target.value)}
                        placeholder={t("billingAlertMessagePlaceholder")}
                      />
                    </div>
                  </>
                )}
              </div>
            </CollapsibleSection>

            <Separator />

            {/* Support Chat */}
            <CollapsibleSection title={t("supportChatTitle")}>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>{editing.supportChatEnabled === "enabled" ? t("supportChatEnabled") : t("supportChatDisabled")}</Label>
                <Switch
                  checked={editing.supportChatEnabled === "enabled"}
                  onCheckedChange={(v) => set("supportChatEnabled", v ? "enabled" : "disabled")}
                />
              </div>
            </CollapsibleSection>

            <Separator />

            {/* Senha de usuários novos (espelho do /configuracoes/geral do tenant) */}
            <CollapsibleSection title={t("userPasswordModeTitle")}>
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs font-semibold">{t("userPasswordModeLabel")}</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("userPasswordModeDesc")}</p>
                </div>
                <Select
                  value={editing.userCreationPasswordMode || "manual"}
                  onValueChange={(v) => set("userCreationPasswordMode", v)}
                >
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t("userPasswordModeManual")}</SelectItem>
                    <SelectItem value="forceChange">{t("userPasswordModeForceChange")}</SelectItem>
                    <SelectItem value="invite">{t("userPasswordModeInvite")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleSection>

            <Separator />

            {/* Menu Visibility */}
            <CollapsibleSection title={t("menuVisibilityTitle")}>
              <div className="mb-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMenuVis(Object.fromEntries(ALL_MENU_KEYS.map((k) => [k, true])))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("selectAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuVis(Object.fromEntries(ALL_MENU_KEYS.map((k) => [k, false])))}
                  className="text-xs font-medium text-muted-foreground hover:underline"
                >
                  {t("deselectAll")}
                </button>
              </div>
              {ALL_MENU_KEYS.some((k) => !planAllowsRoute(editing.planFeatures ?? null, k)) && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{t("menuVisibilityPlanNote")}</span>
                </div>
              )}
              <div className="space-y-4">
                {MENU_GROUPS.map((group) => (
                  <div key={group.catKey} className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ts(group.catKey as Parameters<typeof ts>[0])}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        // O plano é o teto: se a capability da rota não está incluída no
                        // plano do tenant (planFeatures.caps[cap] === false), o menu aparece
                        // travado e desligado aqui — reflexo visual do que o login já enforça
                        // (sidebar + requireFeature). NÃO altera o menuVisibility salvo, então
                        // não fica defasado se o plano for trocado/atualizado depois.
                        const blockedByPlan = !planAllowsRoute(editing.planFeatures ?? null, item.key);
                        return (
                          <label
                            key={item.key}
                            className={`flex items-center gap-2 text-sm ${blockedByPlan ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                          >
                            <Switch
                              checked={blockedByPlan ? false : !!menuVis[item.key]}
                              disabled={blockedByPlan}
                              onCheckedChange={(v) => setMenuVis((p) => ({ ...p, [item.key]: v }))}
                            />
                            <span className="flex flex-wrap items-center gap-1.5">
                              {ts(item.labelKey as Parameters<typeof ts>[0])}
                              {blockedByPlan && (
                                <Badge
                                  variant="warning-soft"
                                  className="text-[10px] px-1.5 py-0 h-4 cursor-default select-none"
                                >
                                  {t("blockedByPlan")}
                                </Badge>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <Separator />

            {/* WaVoIP — interruptor do recurso no tenant.
                Não confundir com o item "WaVoIP" de Menus Visíveis acima: aquele
                esconde apenas a PÁGINA de chamadas; este desliga o recurso inteiro
                (seção do canal, botão do header, chamada no ticket, widget, disparo
                em massa) e é espelhado no backend. */}
            <CollapsibleSection title={t("wavoipTitle")}>
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs font-semibold">{t("wavoipEnabledLabel")}</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("wavoipEnabledDesc")}</p>
                </div>
                <Switch
                  checked={(editing.wavoipEnabled ?? "enabled") === "enabled"}
                  onCheckedChange={(v) => set("wavoipEnabled", v ? "enabled" : "disabled")}
                />
              </div>
              {(editing.wavoipEnabled ?? "enabled") === "disabled" && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-[11px] leading-relaxed text-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{t("wavoipEnabledNote")}</span>
                </div>
              )}
            </CollapsibleSection>

            <Separator />

            {/* Allowed Channels */}
            <CollapsibleSection title={t("allowedChannelsTitle")}>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((ch) => (
                  <label key={ch.value} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedChannels.includes(ch.value)}
                      onCheckedChange={() => toggleChannel(ch.value)}
                    />
                    {t(ch.labelKey as Parameters<typeof t>[0])}
                    {BETA_CHANNEL_TYPES.includes(ch.value) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="warning-soft" className="text-[10px] px-1.5 py-0 h-4 cursor-default select-none">
                              Beta
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="max-w-[200px] text-xs">{t("betaChannelTooltip" as Parameters<typeof t>[0])}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </label>
                ))}
              </div>
            </CollapsibleSection>

            <Separator />

            {/* Channel Connection Limits */}
            <CollapsibleSection title={t("channelLimitsTitle")}>
              <p className="text-xs text-muted-foreground mb-3">{t("channelLimitsHint")}</p>
              {showTenantChannelOverflow && (
                <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground">
                  {t("channelLimitsOverflowWarning", { sum: tenantChannelSum, max: tenantMaxConn })}
                </div>
              )}
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setChannelLimits({})}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("markAllUnlimited")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {CHANNELS.map((ch) => {
                  const limit = Number(channelLimits[ch.value]) || 0;
                  const unlimited = limit <= 0; // 0/ausente = ilimitado
                  return (
                    <div key={ch.value} className="space-y-1">
                      <Label className="text-xs">{t(ch.labelKey as Parameters<typeof t>[0])}</Label>
                      <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={unlimited}
                            onCheckedChange={(v) =>
                              setChannelLimits((prev) => ({ ...prev, [ch.value]: v ? 0 : 1 }))
                            }
                          />
                          {t("channelQtyUnlimited")}
                        </label>
                        <Input
                          type="number"
                          min={1}
                          disabled={unlimited}
                          value={unlimited ? "" : limit}
                          placeholder="—"
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 1);
                            setChannelLimits((prev) => ({ ...prev, [ch.value]: val }));
                          }}
                          className="h-7 w-16 text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <Separator />

            {/* OAuth Proxy (Meta — Embedded Signup, Instagram, Messenger) */}
            <CollapsibleSection title={t("oauthTitle")}>
              <div className="flex items-center justify-between rounded-lg border p-3 mb-2">
                <Label>{editing.oauthEnabled ? t("oauthEnabled") : t("oauthDisabled")}</Label>
                <Switch
                  checked={!!editing.oauthEnabled}
                  onCheckedChange={(v) => set("oauthEnabled", v)}
                />
              </div>
              {editing.oauthEnabled && (
                <div className="space-y-1.5">
                  <Label>{t("labelOauthProxyUrl")}</Label>
                  <Input
                    value={editing.oauthProxyUrl || ""}
                    onChange={(e) => {
                      const base = e.target.value.replace(/\/+$/, "");
                      setEditing((p) => ({
                        ...p,
                        oauthProxyUrl: e.target.value,
                        instagramWebhookProxyUrl: base ? base + "/instagram-webhook" : "",
                        messengerWebhookProxyUrl: base ? base + "/messenger-webhook" : "",
                      }));
                    }}
                    placeholder={t("oauthProxyUrlPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("oauthProxyUrlHint")}</p>
                  <p className="text-xs text-muted-foreground">{t("oauthAutoFillHint")}</p>
                </div>
              )}

              {editing.oauthEnabled && (
                <div className="space-y-3 mt-3">
                  <Separator />
                  <Alert variant="info-soft">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{t("proxySharedChannelsNotice")}</AlertDescription>
                  </Alert>
                  <CollapsibleSection title={t("igProxyTitle")}>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>{t("labelIgProxyUrl")}</Label>
                        <Input
                          value={(editing as any).instagramWebhookProxyUrl || ""}
                          onChange={(e) => set("instagramWebhookProxyUrl", e.target.value)}
                          placeholder={t("igProxyUrlPlaceholder")}
                        />
                        <p className="text-xs text-muted-foreground">{t("igProxyUrlHint")}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("labelIgProxySecret")}</Label>
                        <div className="relative">
                          <Input
                            type={showIgSecret ? "text" : "password"}
                            value={(editing as any).instagramWebhookProxySecret || ""}
                            onChange={(e) => set("instagramWebhookProxySecret", e.target.value)}
                            placeholder={t("igProxySecretPlaceholder")}
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowIgSecret((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showIgSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CollapsibleSection>

                  <Separator />

                  <CollapsibleSection title={t("msgrProxyTitle")}>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>{t("labelMsgrProxyUrl")}</Label>
                        <Input
                          value={(editing as any).messengerWebhookProxyUrl || ""}
                          onChange={(e) => set("messengerWebhookProxyUrl", e.target.value)}
                          placeholder={t("msgrProxyUrlPlaceholder")}
                        />
                        <p className="text-xs text-muted-foreground">{t("msgrProxyUrlHint")}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("labelMsgrProxySecret")}</Label>
                        <div className="relative">
                          <Input
                            type={showMsgrSecret ? "text" : "password"}
                            value={(editing as any).messengerWebhookProxySecret || ""}
                            onChange={(e) => set("messengerWebhookProxySecret", e.target.value)}
                            placeholder={t("msgrProxySecretPlaceholder")}
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowMsgrSecret((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showMsgrSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CollapsibleSection>
                </div>
              )}
            </CollapsibleSection>

            {/* TODO: reativar secao OAuth Google quando app Google da plataforma sair de testes */}
            {false && (
            <>
            <Separator />

            {/* OAuth Google (Gmail / Google Calendar / YouTube) */}
            <CollapsibleSection title={t("oauthGoogleTitle")}>
              <p className="text-xs text-muted-foreground mb-3">{t("oauthGoogleDesc")}</p>
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs font-semibold">{t("enablePlatformGoogleAppLabel")}</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("enablePlatformGoogleAppDesc")}</p>
                </div>
                <Switch
                  checked={(editing.enablePlatformGoogleApp ?? "enabled") === "enabled"}
                  onCheckedChange={(v) => set("enablePlatformGoogleApp", v ? "enabled" : "disabled")}
                />
              </div>
            </CollapsibleSection>
            </>
            )}

            {editing.id && (
              <>
                <Separator />

                {/* Branding por Tenant */}
                <CollapsibleSection title={t("brandingTitle")}>
                  <p className="text-xs text-muted-foreground mb-3">{t("brandingDesc")}</p>

                  {/* App Name */}
                  <div className="space-y-1.5 mb-4">
                    <Label>{t("brandingAppNameLabel")}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={brandingAppName}
                        onChange={(e) => setBrandingAppName(e.target.value)}
                        placeholder={t("brandingAppNamePlaceholder")}
                      />
                      <Button variant="outline" size="sm" onClick={handleBrandingAppNameSave}>
                        {t("brandingAppNameBtn")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("brandingAppNameHint")}</p>
                  </div>

                  {/* Logo */}
                  <div className="grid grid-cols-1 gap-4">
                    {(["logo", "logoDark", "favicon"] as const).map((asset) => {
                      const ts = asset === "logo" ? brandingLogoTs : asset === "logoDark" ? brandingLogoDarkTs : brandingFaviconTs;
                      const labelKey = asset === "logo" ? "brandingLogoLabel" : asset === "logoDark" ? "brandingLogoDarkLabel" : "brandingFaviconLabel";
                      const ref = asset === "logo" ? logoInputRef : asset === "logoDark" ? logoDarkInputRef : faviconInputRef;
                      const previewUrl = ts > 0
                        ? asset === "logo" ? getLogoUrl(ts, editing.id as number)
                          : asset === "logoDark" ? getLogoDarkUrl(ts, editing.id as number)
                          : getFaviconUrl(ts, editing.id as number)
                        : null;
                      return (
                        <div key={asset} className="flex items-center gap-3 rounded-lg border p-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted shrink-0 overflow-hidden">
                            {previewUrl ? (
                              <img src={previewUrl} alt={asset} className="h-full w-full object-contain" />
                            ) : (
                              <Image className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{t(labelKey as Parameters<typeof t>[0])}</p>
                            <p className="text-xs text-muted-foreground">
                              {ts > 0 ? t("brandingCustomActive") : t("brandingUsingGlobal")}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <input
                              ref={ref}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleBrandingUpload(asset, f);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => ref.current?.click()}
                              disabled={brandingUploading === asset}
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                            {ts > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleBrandingDelete(asset)}
                                disabled={brandingUploading === asset}
                              >
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Separator className="my-4" />
                  <TenantTypographyBlock tenantId={editing.id as number} />
                </CollapsibleSection>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("btnCancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? t("btnSaving") : t("btnSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={metricsOpen} onOpenChange={setMetricsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="pb-1">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0 mt-0.5">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-base leading-tight">
                    {metricsTenant?.name ?? "—"}
                  </DialogTitle>
                  {metricsTenant?.status && (
                    <Badge
                      variant={metricsTenant.status === "active" ? "success" : metricsTenant.status === "trial" ? "warning" : "destructive"}
                    >
                      {metricsTenant.status === "active" ? t("statusActive") : metricsTenant.status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t("metricsTitle")}</p>
              </div>
            </div>
          </DialogHeader>

          {metricsLoading ? (
            <div className="space-y-3 py-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4 py-1">

              {/* Total de mensagens — summary strip */}
              {(() => {
                const total = (metricsData?.totalMessages?.sent ?? 0) + (metricsData?.totalMessages?.received ?? 0);
                return (
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t("metricsMessages")}</p>
                        <p className="text-xs text-muted-foreground">{t("metricsTotal")}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">{total.toLocaleString()}</p>
                  </div>
                );
              })()}

              {/* Enviadas / Recebidas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("metricsSent")}</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                    {(metricsData?.totalMessages?.sent ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("metricsReceived")}</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                      <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-300">
                    {(metricsData?.totalMessages?.received ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Tickets */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("metricsTickets")}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-800 dark:bg-sky-950/20">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/50 mb-2">
                      <CircleDot className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <p className="text-xl font-bold tracking-tight">{(metricsData?.tickets?.open ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("metricsOpen")}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted mb-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xl font-bold tracking-tight">{(metricsData?.tickets?.closed ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("metricsClosed")}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 mb-2">
                      <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <p className="text-xl font-bold tracking-tight">{(metricsData?.tickets?.pending ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("metricsPending")}</p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-800 dark:bg-violet-950/20">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50 mb-2">
                      <Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <p className="text-xl font-bold tracking-tight">{(metricsData?.tickets?.schedule ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("metricsScheduled")}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contatos */}
              <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/20">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
                    <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t("metricsContacts")}</p>
                    <p className="text-xs text-muted-foreground">{t("metricsTotal")}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight text-indigo-700 dark:text-indigo-300">
                  {(metricsData?.contacts?.total ?? 0).toLocaleString()}
                </p>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Filter Cleanup Dialog */}
      <Dialog open={!!filterCleanDialog} onOpenChange={(open) => { if (!open) { setFilterCleanDialog(null); setFilterCleanResult(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle>{t("cleanByFilterTitle")}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{filterCleanDialog?.name}</p>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription>{t("cleanByFilterDesc")}</DialogDescription>
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
            {t("externalStorageNoticeAction")}
          </div>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("labelOlderThanDays")}</Label>
              <Input
                type="number"
                min={0}
                value={filterOlderThanDays}
                onChange={(e) => setFilterOlderThanDays(e.target.value)}
                disabled={filterCleanRunning}
              />
              <p className="text-xs text-muted-foreground">{t("filterHintZero")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labelMinSizeMB")}</Label>
              <Input
                type="number"
                min={0}
                value={filterMinSizeMB}
                onChange={(e) => setFilterMinSizeMB(e.target.value)}
                disabled={filterCleanRunning}
              />
              <p className="text-xs text-muted-foreground">{t("filterHintZero")}</p>
            </div>
            {filterCleanResult && (
              <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm">
                {t("cleanByFilterResult", {
                  count: filterCleanResult.deletedCount,
                  size: filterCleanResult.deletedSizeMB >= 1024
                    ? `${(filterCleanResult.deletedSizeMB / 1024).toFixed(2)} GB`
                    : `${filterCleanResult.deletedSizeMB} MB`,
                  skipped: filterCleanResult.skippedCount,
                })}
                {!!filterCleanResult.errorCount && (
                  <p className="mt-1 text-destructive">
                    {t("cleanByFilterErrors", { errors: filterCleanResult.errorCount })}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setFilterCleanDialog(null); setFilterCleanResult(null); }} disabled={filterCleanRunning}>
              {t("btnCancel")}
            </Button>
            <Button onClick={runFilterClean} disabled={filterCleanRunning}>
              {filterCleanRunning ? t("cleanByFilterRunning") : t("cleanByFilterRun")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>
                {confirmDialog?.type === "deleteTenant"
                  ? t("actionDeleteTenant")
                  : t("actionDeleteFiles")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <DialogDescription className="pt-1">
            {confirmDialog?.type === "deleteTenant"
              ? t("confirmDeleteTenant", { id: confirmDialog.tenant.id })
              : t("confirmDeleteFiles", { id: confirmDialog?.tenant.id ?? "" })}
          </DialogDescription>
          {confirmDialog?.type === "cleanFiles" && (
            <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
              {t("externalStorageNoticeAction")}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              {t("btnCancel")}
            </Button>
            <Button variant="destructive" onClick={executeConfirm}>
              {t("btnDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk OAuth Dialog */}
      <Dialog open={bulkOAuthOpen} onOpenChange={setBulkOAuthOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle>{t("bulkOAuthTitle")}</DialogTitle>
                <DialogDescription>{t("bulkOAuthDesc")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t("bulkOAuthWarning")}</AlertDescription>
            </Alert>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{bulkOAuth.oauthEnabled ? t("oauthEnabled") : t("oauthDisabled")}</Label>
              <Switch
                checked={bulkOAuth.oauthEnabled}
                onCheckedChange={(v) => setBulkOAuth((p) => ({ ...p, oauthEnabled: v }))}
              />
            </div>

            {bulkOAuth.oauthEnabled && (
              <>
                <Separator />
                <p className="text-sm font-semibold">{t("oauthTitle")}</p>
                <div className="space-y-1.5">
                  <Label>{t("labelOauthProxyUrl")}</Label>
                  <Input
                    value={bulkOAuth.oauthProxyUrl}
                    onChange={(e) => {
                      const base = e.target.value.replace(/\/+$/, "");
                      setBulkOAuth((p) => ({
                        ...p,
                        oauthProxyUrl: e.target.value,
                        instagramWebhookProxyUrl: base ? base + "/instagram-webhook" : "",
                        messengerWebhookProxyUrl: base ? base + "/messenger-webhook" : "",
                      }));
                    }}
                    placeholder={t("oauthProxyUrlPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("oauthAutoFillHint")}</p>
                </div>
              </>
            )}

            {bulkOAuth.oauthEnabled && (
              <>
                <Separator />
                <Alert variant="info-soft">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{t("proxySharedChannelsNotice")}</AlertDescription>
                </Alert>
                <p className="text-sm font-semibold">{t("igProxyTitle")}</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t("labelIgProxyUrl")}</Label>
                    <Input
                      value={bulkOAuth.instagramWebhookProxyUrl}
                      onChange={(e) => setBulkOAuth((p) => ({ ...p, instagramWebhookProxyUrl: e.target.value }))}
                      placeholder={t("igProxyUrlPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("labelIgProxySecret")}</Label>
                    <div className="relative">
                      <Input
                        type={showBulkIgSecret ? "text" : "password"}
                        value={bulkOAuth.instagramWebhookProxySecret}
                        onChange={(e) => setBulkOAuth((p) => ({ ...p, instagramWebhookProxySecret: e.target.value }))}
                        placeholder={t("igProxySecretPlaceholder")}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBulkIgSecret((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showBulkIgSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-semibold">{t("msgrProxyTitle")}</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t("labelMsgrProxyUrl")}</Label>
                    <Input
                      value={bulkOAuth.messengerWebhookProxyUrl}
                      onChange={(e) => setBulkOAuth((p) => ({ ...p, messengerWebhookProxyUrl: e.target.value }))}
                      placeholder={t("msgrProxyUrlPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("labelMsgrProxySecret")}</Label>
                    <div className="relative">
                      <Input
                        type={showBulkMsgrSecret ? "text" : "password"}
                        value={bulkOAuth.messengerWebhookProxySecret}
                        onChange={(e) => setBulkOAuth((p) => ({ ...p, messengerWebhookProxySecret: e.target.value }))}
                        placeholder={t("msgrProxySecretPlaceholder")}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBulkMsgrSecret((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showBulkMsgrSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOAuthOpen(false)}>{t("btnCancel")}</Button>
            <Button onClick={handleBulkOAuthSave} disabled={bulkSaving}>
              {bulkSaving ? t("bulkOAuthSaving") : t("bulkOAuthApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAcceptTerms && user?.tenantId && (
        <AcceptTermsModal
          open={true}
          tenantId={user.tenantId}
          onAccepted={() => { setShowAcceptTerms(false); load(); }}
        />
      )}
    </div>
  );
}
