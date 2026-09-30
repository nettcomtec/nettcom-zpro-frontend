"use client";

import { formatDate } from "@/lib/format";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle } from "lucide-react";
import { updateWebhookOrigin, confirmWebhookRevalidation } from "@/services/whatsapp";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Globe, Copy, RefreshCw, Eye, EyeOff, Plus, Trash2, Phone, PhoneCall, Webhook, Loader2,
  Settings, Edit, CheckCircle, AlertCircle, Info, LogIn, LogOut,
  Building2, Camera, Facebook, ShieldCheck, BarChart2, X, Sparkles,
  ImageIcon, Video, FileText, FolderOpen, MessageCircle, Instagram,
  ChevronDown, Stethoscope, Dices, Calculator, Lock
} from "lucide-react";
import { generateRandomPin } from "@/lib/waba-pin";
import { WABA_LIMITS } from "@/lib/waba-text-limits";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { sanitize } from "@/lib/sanitize";
import { formatBulkSendError } from "@/lib/bulk-send-error-format";
import { parseOAuthLicenseError, OAUTH_LICENSE_COOLDOWN_MS } from "@/lib/oauth-license-error";
import { channelCreateErrorKey } from "@/lib/channel-create-error";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { ORDER_DETAILS_BUTTON_TEXT } from "@/lib/order-details";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import { fetchWhatsapps, Whatsapp } from "@/services/whatsapp";
import { resolveChannelForTemplates } from "@/services/channel-templates";
import {
  getMessengerGreetingText, setMessengerGreetingText, deleteMessengerGreetingText,
  listMessengerPersonas, createMessengerPersona, deleteMessengerPersona,
  listMessengerTemplates, createMessengerUtilityTemplate, editMessengerUtilityTemplate, deleteMessengerTemplate,
} from "@/services/messages";
import {
  listTemplates, listTemplatesByWhatsappId, createTemplate, editTemplate, deleteTemplate,
  verifyBms, registerPhone, getPhoneById, requestVerificationCode, verifyCode,
  getProfile, updateProfile,
  configureSIP, enableWabaWebRTCCalling, getWABAData, getWABAAnalytics, getWABATemplateAnalytics, getWABALimitsInfo, getWABASentMessagesCost,
  listActiveAppWabas, createWhatsapp, exchangeEmbeddedSignupCode,
  getInstagramChannelInfo, getFacebookChannelInfo,
  AppWaba, TemplateComponent,
} from "@/services/waba-meta";
import { classifyWabaPhoneStatus, wabaPhoneStatusBadgeClasses, wabaPhoneStatusI18nKey } from "@/lib/waba-phone-quality";
import { fetchTenantById, updateTenantMetaToken } from "@/services/tenants";
import { generateTemplateViaCopilot } from "@/services/copilot";
import { useMetaProxyPopup, type MetaProxyHijackPayload } from "@/hooks/use-meta-proxy-popup";
import { HijackTakeoverDialog } from "@/components/common/hijack-takeover-dialog";
import { DiagnoseModal } from "@/components/sessoes/diagnose-modal";
import { WabaSendHealthNotice } from "@/components/sessoes/waba-send-health-notice";
import { invalidateWabaPinPendingCache } from "@/hooks/use-waba-pin-pending";
import { takeoverRegistry } from "@/lib/registry-hijack";
import { useOAuthProxyDomain } from "@/hooks/use-oauth-proxy-domain";
import { getProxyBaseUrl } from "@/config/oauth-proxy";
import api from "@/lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LEGAL_LANGS, type LegalLang } from "@/lib/legal-langs";
import {
  WhatsAppBusinessMockup,
  InstagramMockup,
  FacebookPageMockup,
} from "@/components/meta/profile-phone-mockup";
import { WabaTemplateMobilePreview } from "@/components/meta/waba-template-mobile-preview";
import { WabaTemplateAiWizard, type WizardAiForm } from "@/components/meta/waba-template-ai-wizard";
import { MessengerTemplatePreview } from "@/components/meta/meta-template-mobile-preview";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: any;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function truncateToken(token: string): string {
  if (!token || token.length <= 35) return token;
  return token.slice(0, 20) + "..." + token.slice(-10);
}

function formatExpiresIn(seconds: number): string {
  if (!seconds) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status?.toUpperCase()) {
    case "APPROVED": return "default";
    case "REJECTED": return "destructive";
    case "PENDING": return "secondary";
    default: return "outline";
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status?.toUpperCase()) {
    case "APPROVED": return "bg-green-100 text-green-800 border-green-200";
    case "REJECTED": return "bg-red-100 text-red-800 border-red-200";
    case "PENDING": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "PAUSED": return "bg-orange-100 text-orange-800 border-orange-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function getCategoryBadgeClass(category: string): string {
  switch (category?.toUpperCase()) {
    case "MARKETING": return "bg-purple-100 text-purple-800";
    case "UTILITY": return "bg-blue-100 text-blue-800";
    case "AUTHENTICATION": return "bg-orange-100 text-orange-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function getTemplatePreview(template: any): string {
  if (!template?.components) return "";
  const body = template.components.find((c: any) => c.type === "BODY");
  return body?.text || "";
}

// Template de cobrança ("Detalhes do pedido"): a Meta o reconhece pelo botão
// ORDER_DETAILS + `display_format` na RAIZ do payload de criação. `display_format`
// não é componente e não tem campo no editor — é derivado do próprio botão, para
// que não exista template com o botão e sem o formato (a Meta recusaria).
function hasOrderDetailsButton(components: any[]): boolean {
  return (components || []).some(
    (c) =>
      c?.type === "BUTTONS" &&
      Array.isArray(c?.buttons) &&
      c.buttons.some((b: any) => String(b?.type || "").toUpperCase() === "ORDER_DETAILS")
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const COPILOT_PROVIDER_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  groq: "Grok",
  claude: "Claude",
  gemini: "Gemini",
};

// Fallback de App ID para criação de template quando o canal WABA selecionado
// não tem appId próprio configurado. Permite que o submit não falhe e o usuário
// edite o valor inline se precisar de um App ID específico.
const FALLBACK_TEMPLATE_APP_ID = "802373889472133";

export default function MetaPage() {
  const t = useTranslations("metaPage");
  const tCommon = useTranslations("common");
  const tHealth = useTranslations("metaHealth");
  // Erros de criacao de canal (limite geral, limite por tipo, tipo nao permitido)
  // reusam as chaves de sessoesPage — mesmo texto da tela /sessoes.
  const tSess = useTranslations("sessoesPage");
  const metaProxy = useMetaProxyPopup();
  const tHijack = useTranslations("channelHijack");
  const [hijackState, setHijackState] = useState<MetaProxyHijackPayload | null>(null);
  const [hijackLoading, setHijackLoading] = useState(false);
  const [hijackPendingRetry, setHijackPendingRetry] = useState<(() => void) | null>(null);

  const handleHijackConfirm = useCallback(async () => {
    if (!hijackState?.identifier || !hijackState?.callbackUrl) {
      toast.error(tHijack("errorToast"));
      setHijackState(null);
      return;
    }
    setHijackLoading(true);
    try {
      await takeoverRegistry({
        channel:     hijackState.channel,
        identifier:  hijackState.identifier,
        callbackUrl: hijackState.callbackUrl,
      });
      toast.success(tHijack("successToast"));
      setHijackState(null);
      if (hijackPendingRetry) {
        const retry = hijackPendingRetry;
        setHijackPendingRetry(null);
        retry();
      }
    } catch {
      toast.error(tHijack("errorToast"));
    } finally {
      setHijackLoading(false);
    }
  }, [hijackState, hijackPendingRetry, tHijack]);
  const { customDomain: oauthCustomDomain } = useOAuthProxyDomain();
  // Tenant.oauthEnabled — quando false (gestão por superadmin) esconde a opção
  // OAuth (Meta Embedded Signup) do seletor de App. Default = true para evitar flicker.
  const [tenantOAuthEnabled, setTenantOAuthEnabled] = useState<boolean>(true);
  const PROXY_URL = tenantOAuthEnabled ? getProxyBaseUrl(oauthCustomDomain) : "";
  // ── User & tab state
  const [tab, setTab] = useState("contas-meta");
  const [user, setUser] = useState<{ tenantId: number; profile: string } | null>(null);

  // ── Config tab
  const [metaToken, setMetaToken] = useState("");
  // Idioma dos links públicos de Política de Privacidade / Termos de Uso (App Review da Meta)
  const [legalLang, setLegalLang] = useState<LegalLang>("pt");
  // PLANO_BSUID_FULL_COMPLIANCE.md / Marco C1 -- toggle de BSUID strict mode.
  const [bsuidStrictMode, setBsuidStrictMode] = useState(false);
  const [savingBsuidStrict, setSavingBsuidStrict] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [wabaVersion, setWabaVersion] = useState("v19.0");
  const [wabaToken, setWabaToken] = useState("");
  const [wabaResponse, setWabaResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Cooldown local quando o backend retorna 429 IP_TEMPORARILY_BANNED ou 403
  // LICENSE_INVALID — alinhado com o circuit breaker do OAuthProxyClient.
  const [oauthCooldownUntil, setOauthCooldownUntil] = useState<number | null>(null);

  // ── Facebook Login
  const [selectedAppWaba, setSelectedAppWaba] = useState<string | null>(null);
  const [appWabaOptions, setAppWabaOptions] = useState<AppWaba[]>([]);
  const [loadingAppWabas, setLoadingAppWabas] = useState(false);
  const [facebookAppId, setFacebookAppId] = useState("");
  const [facebookApiVersion, setFacebookApiVersion] = useState("v19.0");
  const [facebookStatus, setFacebookStatus] = useState<any>(null);
  const [facebookUserInfo, setFacebookUserInfo] = useState<any>(null);
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [loadingFacebook, setLoadingFacebook] = useState(false);
  const [facebookSDKLoaded, setFacebookSDKLoaded] = useState(false);

  // ── WABA Management
  const [wabasList, setWabasList] = useState<any[]>([]);
  const [loadingWABAs, setLoadingWABAs] = useState(false);
  const [loadingPhones, setLoadingPhones] = useState<string | null>(null);
  const [creatingChannels, setCreatingChannels] = useState<Record<string, boolean>>({});
  const [loadingEmbeddedSignup, setLoadingEmbeddedSignup] = useState(false);
  const [embeddedSignupConfigId, setEmbeddedSignupConfigId] = useState("");

  // ── Sub-tabs
  const [facebookSubTab, setFacebookSubTab] = useState("login");

  // ── Instagram
  const [selectedInstagram, setSelectedInstagram] = useState<any>(null);
  const [instagramAccountInfo, setInstagramAccountInfo] = useState<any>(null);
  const [loadingInstagramCheck, setLoadingInstagramCheck] = useState(false);

  // ── Facebook page
  const [selectedFacebook, setSelectedFacebook] = useState<any>(null);
  const [facebookAccountInfo, setFacebookAccountInfo] = useState<any>(null);
  const [loadingFacebookCheck, setLoadingFacebookCheck] = useState(false);

  // ── Facebook templates (UTILITY/MARKETING via /messengerMetaTemplates)
  const [fbTplChannelId, setFbTplChannelId] = useState<number | null>(null);
  const [fbTplList, setFbTplList] = useState<Array<{ id: string; name: string; status: string; category: string; language: string; rejection_reason?: string; components?: Array<any> }>>([]);
  const [fbTplLoading, setFbTplLoading] = useState(false);
  const [fbTplSubTab, setFbTplSubTab] = useState<"list" | "create">("list");
  const [fbTplCreating, setFbTplCreating] = useState(false);
  const [fbTplForm, setFbTplForm] = useState<{
    name: string;
    language: string;
    headerType: "none" | "text" | "image" | "video" | "document";
    headerText: string;
    headerMediaUrl: string;
    body: string;
    examples: string[];
    buttons: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url: string; phone_number: string }>;
    editingId: string | null;
  }>({
    name: "",
    language: "pt_BR",
    headerType: "none",
    headerText: "",
    headerMediaUrl: "",
    body: "",
    examples: [],
    buttons: [],
    editingId: null,
  });
  const fbTplFormVarCount = (fbTplForm.body.match(/\{\{\d+\}\}/g) || []).length;
  const fbTplEmptyForm = {
    name: "",
    language: "pt_BR",
    headerType: "none" as const,
    headerText: "",
    headerMediaUrl: "",
    body: "",
    examples: [] as string[],
    buttons: [] as Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url: string; phone_number: string }>,
    editingId: null,
  };
  const [fbTplDetail, setFbTplDetail] = useState<typeof fbTplList[number] | null>(null);
  const [fbTplDeletingName, setFbTplDeletingName] = useState<string | null>(null);
  const [fbTplDeleteConfirm, setFbTplDeleteConfirm] = useState<{ name: string } | null>(null);

  // ── Messenger — Greeting Text e Personas
  const [msgrGreetingText, setMsgrGreetingText] = useState("");
  const [msgrGreetingLoading, setMsgrGreetingLoading] = useState(false);
  const [msgrPersonas, setMsgrPersonas] = useState<{ id: string; name: string; profile_picture_url?: string }[]>([]);
  const [msgrPersonasLoading, setMsgrPersonasLoading] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaPic, setNewPersonaPic] = useState("");

  // ── Templates tab
  const [templatesTab, setTemplatesTab] = useState("waba");
  const [wabaSubTab, setWabaSubTab] = useState("templates");
  const [selectedWaba, setSelectedWaba] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [filtros, setFiltros] = useState({ status: "all", category: "all", language: "all", search: "" });
  const [sortBy, setSortBy] = useState("name_asc");
  const [groupBy, setGroupBy] = useState("none");
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<any>(null);
  const [loadingDeleteTemplate, setLoadingDeleteTemplate] = useState(false);

  // ── Template create/edit
  const [novoTemplate, setNovoTemplate] = useState<{
    name: string; language: string; category: string; components: TemplateComponent[];
  }>({ name: "", language: "pt_BR", category: "MARKETING", components: [] });
  const [novoTipoComponente, setNovoTipoComponente] = useState("BODY");
  const [isEditing, setIsEditing] = useState(false);
  const [templateIdToEdit, setTemplateIdToEdit] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [appId, setAppId] = useState("");

  // ── Gallery Picker (header media)
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [galleryPickerTarget, setGalleryPickerTarget] = useState<number | null>(null);

  // ── AI Template Generation
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiWizardOpen, setAiWizardOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiModelInfo, setAiModelInfo] = useState<{ provider: string; model: string } | null>(null);
  const [copilotAvailable, setCopilotAvailable] = useState<boolean | null>(null);
  const [aiForm, setAiForm] = useState({
    prompt: "",
    category: "MARKETING",
    language: "pt_BR",
    includeHeader: false,
    headerType: "TEXT",
    includeFooter: false,
    includeButtons: false,
    buttonTypes: [] as string[],
    aiSource: "canal" as "canal" | "copilot",
  });

  // Pre-fetch copilot resolve when dialog/wizard opens — determines availability and pre-loads model info
  useEffect(() => {
    if (!aiDialogOpen && !aiWizardOpen) return;
    let cancelled = false;
    setCopilotAvailable(null);
    api.get<{ provider: string; model: string }>("/copilot/resolve")
      .then(({ data }) => {
        if (cancelled) return;
        setCopilotAvailable(true);
        setAiModelInfo({ provider: data.provider, model: data.model });
      })
      .catch(() => {
        if (cancelled) return;
        setCopilotAvailable(false);
        if (aiForm.aiSource === "copilot") setAiForm((f) => ({ ...f, aiSource: "canal" }));
      });
    return () => { cancelled = true; };
  }, [aiDialogOpen, aiWizardOpen]);

  // ── Phones tab
  const [selectedPhone, setSelectedPhone] = useState<any>(null);
  const [phoneInfo, setPhoneInfo] = useState<any>(null);
  const [loadingPhoneCheck, setLoadingPhoneCheck] = useState(false);
  // Detecta se o número está em modo gerenciado (COEX/SMB/Embedded Signup) — nesses casos
  // os botões "Registrar Telefone" e "Verificar Código" não se aplicam.
  // null = ainda não checado | true = mostra dropdown | false = esconde (mostra badge)
  const [phoneNeedsManualReg, setPhoneNeedsManualReg] = useState<boolean | null>(null);
  const [showPhoneRegistrationModal, setShowPhoneRegistrationModal] = useState(false);
  const [phoneRegistrationData, setPhoneRegistrationData] = useState({
    phoneNumberId: "", wabaId: "", wabaVersion: "v19.0", wabaToken: "", pin: ""
  });
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationData, setVerificationData] = useState({
    phoneNumberId: "", wabaVersion: "v19.0", wabaToken: "", code: "", codeMethod: "SMS", locale: "pt_BR"
  });
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [loadingCodeRequest, setLoadingCodeRequest] = useState(false);
  const [verificationStep, setVerificationStep] = useState<"request" | "verify">("request");
  const [showSIPModal, setShowSIPModal] = useState(false);
  const [sipData, setSipData] = useState({ hostname: "", port: "" });
  const [loadingSIP, setLoadingSIP] = useState(false);
  const [loadingWebRTC, setLoadingWebRTC] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({
    about: "", address: "", description: "", email: "", vertical: "", websites: [""]
  });
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [wabaAdminData, setWabaAdminData] = useState<any>(null);
  const [loadingWabaData, setLoadingWabaData] = useState(false);

  // ── Analytics / Billing
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [analyticsStart, setAnalyticsStart] = useState(thirtyDaysAgo);
  const [analyticsEnd, setAnalyticsEnd] = useState(today);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [templateAnalyticsStart, setTemplateAnalyticsStart] = useState(thirtyDaysAgo);
  const [templateAnalyticsEnd, setTemplateAnalyticsEnd] = useState(today);
  const [templateAnalyticsData, setTemplateAnalyticsData] = useState<any>(null);
  const [loadingTemplateAnalytics, setLoadingTemplateAnalytics] = useState(false);
  const [analyticsTemplateList, setAnalyticsTemplateList] = useState<any[]>([]);
  const [loadingAnalyticsTemplates, setLoadingAnalyticsTemplates] = useState(false);
  const [selectedAnalyticsTemplateIds, setSelectedAnalyticsTemplateIds] = useState<string[]>([]);
  const [limitsInfo, setLimitsInfo] = useState<any>(null);
  const [loadingLimits, setLoadingLimits] = useState(false);
  // Custo de mensagens enviadas (novo modelo por mensagem da Meta — 01/10/2026).
  // Tarifa editável: default R$ 0,0350/msg (service BR); reajustes da Meta não exigem deploy.
  const [sentCostStart, setSentCostStart] = useState(thirtyDaysAgo);
  const [sentCostEnd, setSentCostEnd] = useState(today);
  const [sentCostRate, setSentCostRate] = useState("0.0350");
  const [sentCostData, setSentCostData] = useState<any>(null);
  const [loadingSentCost, setLoadingSentCost] = useState(false);

  // ── Whatsapp store
  const { whatsapps, setWhatsapps } = useWhatsappStore();

  const sdkScriptRef = useRef<HTMLScriptElement | null>(null);

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem("usuario");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      }
    } catch {}
  }, []);

  // Sempre re-hidrata no mount (sem gate por length): o store global pode ter
  // sido populado por outra tela com objetos SEM credenciais (wabaId/bmToken/
  // appId), o que fazia criar/editar/excluir template falhar com "Credenciais
  // WABA incompletas" até um F5. fetchWhatsapps já coalesce/cacheia (TTL 1500ms).
  useEffect(() => {
    fetchWhatsapps()
      .then((r) => setWhatsapps(r.data))
      .catch(() => {});
  }, [setWhatsapps]);

  useEffect(() => {
    if (user?.tenantId) {
      loadTenant();
    }
  }, [user?.tenantId]);

  useEffect(() => {
    loadAppWabas();
    loadLimitsInfo();
  }, []);

  // ─── FB SDK ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (facebookAppId && facebookApiVersion) {
      loadFacebookSDK(facebookAppId, facebookApiVersion);
    }
  }, [facebookAppId, facebookApiVersion]);

  // ─── Popup postMessage listener ───────────────────────────────────────────

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "OAUTH_COMPLETE") return;

      if (data.status === "success") {
        toast.success(data.message || t("channelCreated"));
        // force=true: refetch pós-mutação (canal criado via OAuth) não pode
        // receber o cache TTL 1500ms do fetchWhatsapps.
        fetchWhatsapps(true).then((r) => setWhatsapps(r.data)).catch(() => {});
      } else if (data.status === "error") {
        toast.error(data.message || t("errorOAuth"));
      }
    }

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [setWhatsapps]);

  // ─── Webhook setup popup result listener ──────────────────────────────────

  useEffect(() => {
    function handleWebhookSetup(event: MessageEvent) {
      if (!event.data || event.data.type !== "waba:webhook:setup:success") return;
      toast.success(t("webhookSaved"));
    }
    window.addEventListener("message", handleWebhookSetup);
    return () => window.removeEventListener("message", handleWebhookSetup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando tenant.oauthEnabled === false a opção __PROXY__ é escondida do dropdown.
  // Se a seleção atual era __PROXY__ (carregada antes do fetch resolver), volta para
  // o primeiro AppWaba próprio do tenant ou limpa a seleção.
  useEffect(() => {
    if (!tenantOAuthEnabled && selectedAppWaba === "__PROXY__") {
      const first = appWabaOptions[0];
      if (first) handleAppWabaChange(String(first.id));
      else setSelectedAppWaba(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantOAuthEnabled, selectedAppWaba, appWabaOptions]);

  // ─── Config functions ─────────────────────────────────────────────────────

  async function loadTenant() {
    if (!user?.tenantId) return;
    try {
      const { data } = await fetchTenantById(user.tenantId);
      const d = Array.isArray(data) ? data[0] : data;
      setMetaToken((d as any)?.metaToken || "");
      setLicenseKey((d as any)?.tenantEmail || "");
      // Tenant.oauthEnabled defaulta a true no model — undefined trata como habilitado.
      setTenantOAuthEnabled((d as any)?.oauthEnabled !== false);
      setBsuidStrictMode((d as any)?.bsuidStrictMode === "enabled");
    } catch {
      toast.error(t("errorLoadingTenant"));
    }
  }

  async function handleToggleBsuidStrictMode(checked: boolean) {
    if (!user?.tenantId) return;
    setSavingBsuidStrict(true);
    try {
      await api.put(`/tenantsBsuidStrictMode/${user.tenantId}`, {
        bsuidStrictMode: checked ? "enabled" : "disabled"
      });
      setBsuidStrictMode(checked);
      toast.success(t("bsuidStrictModeUpdated"));
    } catch {
      toast.error(t("errorUpdatingBsuidStrictMode"));
    } finally {
      setSavingBsuidStrict(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t("copiedClipboard"));
    }).catch(() => {
      toast.error(t("errorCopying"));
    });
  }

  function getWebhookUrl() {
    return `${process.env.NEXT_PUBLIC_API_URL}/metaWebhook/${user?.tenantId}`;
  }

  function getWebhookUrlInstagram() {
    return `${process.env.NEXT_PUBLIC_API_URL}/instagramWebhook/${user?.tenantId}`;
  }

  function getWebhookUrlMessenger() {
    return `${process.env.NEXT_PUBLIC_API_URL}/messengerWebhook/${user?.tenantId}`;
  }

  async function saveMetaToken() {
    if (!user?.tenantId) return;
    setLoadingToken(true);
    try {
      await updateTenantMetaToken(user.tenantId, metaToken);
      toast.success(t("tokenSaved"));
    } catch {
      toast.error(t("errorSaveToken"));
    } finally {
      setLoadingToken(false);
    }
  }

  async function generateNewToken() {
    if (!user?.tenantId) return;
    const newToken = generateUUID();
    setLoadingToken(true);
    try {
      await updateTenantMetaToken(user.tenantId, newToken);
      setMetaToken(newToken);
      toast.success(t("newTokenGenerated"));
    } catch {
      toast.error(t("errorGenerateToken"));
    } finally {
      setLoadingToken(false);
    }
  }

  async function checkBM() {
    if (!wabaId || !wabaVersion || !wabaToken) {
      toast.error(t("fillAllFields"));
      return;
    }
    setLoading(true);
    try {
      const { data } = await verifyBms({ wabaId, wabaVersion, wabaToken });
      setWabaResponse(data);
      toast.success(t("verificationSuccess"));
    } catch (err: any) {
      toast.error(t("errorVerifyBm"));
    } finally {
      setLoading(false);
    }
  }

  // ─── Facebook / App WABA ──────────────────────────────────────────────────

  async function loadAppWabas() {
    setLoadingAppWabas(true);
    try {
      const { data } = await listActiveAppWabas();
      const list = Array.isArray(data) ? data : [];
      setAppWabaOptions(list);
      if (list.length > 0) {
        setSelectedAppWaba(String(list[0].id));
        const first = list[0];
        setFacebookAppId(first.appId || "");
        setFacebookApiVersion(first.apiVersion || "v19.0");
        setEmbeddedSignupConfigId(first.configId || "");
      }
    } catch {
      // silent
    } finally {
      setLoadingAppWabas(false);
    }
  }

  function handleAppWabaChange(id: string) {
    setSelectedAppWaba(id);
    if (id === "__PROXY__") {
      setFacebookAppId("");
      setFacebookApiVersion("v19.0");
      setEmbeddedSignupConfigId("");
      return;
    }
    const found = appWabaOptions.find((a) => String(a.id) === id);
    if (found) {
      setFacebookAppId(found.appId || "");
      setFacebookApiVersion(found.apiVersion || "v19.0");
      setEmbeddedSignupConfigId(found.configId || "");
    }
  }

  function restoreSessionIfLoggedIn() {
    if (window.location.protocol !== "https:") return;
    window.FB.getLoginStatus((response: any) => {
      if (response.status === "connected" && response.authResponse) {
        setFacebookStatus(response);
        window.FB.api("/me", { fields: "id,name,email,picture" }, (userInfo: any) => {
          setFacebookUserInfo(userInfo);
        });
      }
    });
  }

  function loadFacebookSDK(appIdValue: string, apiVersion: string) {
    if (window.FB) {
      // SDK já carregado — re-inicializa com o appId/versão atuais (troca de app)
      try { window.FB.init({ appId: appIdValue, cookie: true, xfbml: true, version: apiVersion }); } catch {}
      setFacebookSDKLoaded(true);
      restoreSessionIfLoggedIn();
      return;
    }
    if (sdkScriptRef.current) return;

    window.fbAsyncInit = function () {
      window.FB.init({ appId: appIdValue, cookie: true, xfbml: true, version: apiVersion });
      setFacebookSDKLoaded(true);
      restoreSessionIfLoggedIn();
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    sdkScriptRef.current = script;
  }

  async function loginFacebook() {
    // FB.login só funciona em HTTPS (enforced pelo Facebook desde 2018).
    // Em HTTP (ex.: localhost dev), direcionar o usuário para o fluxo de OAuth do proxy do tenant.
    if (typeof window !== "undefined" && window.location.protocol !== "https:") {
      toast.error(t("httpsRequired"));
      return;
    }
    if (!window.FB) { toast.error(t("loginFacebookSdk")); return; }
    setLoadingFacebook(true);
    setFacebookError(null);
    window.FB.login(
      (response: any) => {
        setLoadingFacebook(false);
        if (response.authResponse) {
          setFacebookStatus(response);
          window.FB.api("/me", { fields: "id,name,email,picture" }, (userInfo: any) => {
            setFacebookUserInfo(userInfo);
          });
          toast.success(t("loginSuccess"));
        } else {
          setFacebookError(t("loginCancelled"));
        }
      },
      {
        scope: "public_profile,whatsapp_business_management,whatsapp_business_messaging,business_management",
        return_scopes: true,
      }
    );
  }

  function logoutFacebook() {
    if (!window.FB) return;
    window.FB.logout(() => {
      setFacebookStatus(null);
      setFacebookUserInfo(null);
      setWabasList([]);
      toast.success(t("logoutSuccess"));
    });
  }

  function checkFacebookStatus() {
    if (typeof window !== "undefined" && window.location.protocol !== "https:") {
      toast.error(t("httpsRequired"));
      return;
    }
    if (!window.FB) { toast.error(t("loginFacebookSdk")); return; }
    setLoadingFacebook(true);
    window.FB.getLoginStatus((response: any) => {
      setLoadingFacebook(false);
      setFacebookStatus(response);
      if (response.status === "connected") {
        window.FB.api("/me", { fields: "id,name,email,picture" }, (userInfo: any) => {
          setFacebookUserInfo(userInfo);
        });
      }
    });
  }

  // Phase 13.a — Meta popup handshake com HTMLs do oauth-proxy
  // O hook abre popup no custom domain (se configurado) ou em oauth.techprovider.com.br,
  // faz handshake postMessage, e invoca callbacks de success/error.
  // Espelha exatamente o que /sessoes/page.tsx faz (linhas 1536-1552).
  function buildMetaCredentials(): {
    apiUrl: string;
    authToken: string | null;
    tenantId: number | null;
    metaToken: string;
    licenseKey: string;
  } {
    // authToken no localStorage eh gravado como JSON string (com aspas), precisa parsear
    let authToken: string | null = null;
    try {
      const rawToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      authToken = rawToken ? JSON.parse(rawToken) : null;
    } catch {
      authToken = null;
    }

    // apiUrl: env var → fallback para window.location.origin (como /sessoes faz)
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

    return {
      apiUrl,
      authToken,
      tenantId: (user?.tenantId as number) ?? null,
      metaToken: metaToken || "",
      // licenseKey vem de fetchTenantById() → tenantEmail, carregado em loadTenant()
      licenseKey: licenseKey || "",
    };
  }

  // Phase 18 — resolve credentials extras de "app proprio" para o popup.
  // Retorna { appWabaId, webhookOrigin } quando o admin escolheu um AppWaba do tenant
  // em vez do proxy ZDG (__PROXY__). Com isso o popup bifurca para:
  //  - GET  /app-waba/:id/public-oauth-config  (pega appId/configId do tenant)
  //  - POST /app-waba/:id/oauth-exchange       (troca code usando appSecret do tenant)
  function resolveOwnAppCtx(): { appWabaId?: number | null; webhookOrigin: "own_app" | "zdg_oauth" } {
    if (selectedAppWaba === "__PROXY__" || !selectedAppWaba) {
      return { webhookOrigin: "zdg_oauth" };
    }
    const selectedApp = appWabaOptions.find((a) => String(a.id) === selectedAppWaba);
    const id = selectedApp ? Number(selectedApp.id) : NaN;
    if (!id || !Number.isFinite(id)) return { webhookOrigin: "zdg_oauth" };
    return { appWabaId: id, webhookOrigin: "own_app" };
  }

  function launchEmbeddedSignup() {
    // Modo proxy (OAuth configurado no tenant): proxy faz o handshake próprio em HTTPS,
    // então não exigimos https na origem nem aplicativo/configId locais.
    const usingProxy = selectedAppWaba === "__PROXY__";
    if (!usingProxy) {
      if (typeof window !== "undefined" && window.location.protocol !== "https:") {
        toast.error(t("httpsRequired"));
        return;
      }
      const selectedApp = appWabaOptions.find((a) => String(a.id) === selectedAppWaba);
      if (!selectedApp) { toast.error(t("selectAppWaba")); return; }
      if (!facebookAppId) { toast.error(t("appIdNotConfigured") || "App ID não configurado"); return; }
      if (!embeddedSignupConfigId) { toast.error(t("configIdNotSet") || "Config ID não configurado"); return; }
    }

    metaProxy.open({
      channel: "waba",
      credentials: { ...buildMetaCredentials(), ...resolveOwnAppCtx() },
      onSuccess: (data) => {
        toast.success(t("wabaConnectSuccess") || "WABA conectado com sucesso");
        // Recarrega listas/estado dependendo do contexto
        if ((data as any)?.wabaId) {
          try { loadWABAs(); } catch { /* ignore */ }
        }
      },
      onError: (msg, hijack, code) => {
        if (hijack) { setHijackState(hijack); return; }
        const key = channelCreateErrorKey(code || msg);
        toast.error(key ? tSess(key) : (msg || t("wabaConnectError") || "Erro ao conectar WABA"));
      },
      onCancelled: () => { /* silencioso — user fechou popup */ },
    });
  }

  function loginInstagramOAuth() {
    const usingProxy = selectedAppWaba === "__PROXY__";
    if (!usingProxy) {
      const selectedApp = appWabaOptions.find((a) => String(a.id) === selectedAppWaba);
      if (!selectedApp) { toast.error(t("selectAppWaba")); return; }
      const instagramAppId = (selectedApp as any).appInstagramId;
      if (!instagramAppId) { toast.error(t("instagramAppIdNotConfigured")); return; }
      if (!(selectedApp as any).appInstagramSecret) { toast.error(t("instagramAppSecretNotConfigured")); return; }
    }

    metaProxy.open({
      channel: "instagram",
      // igViaFacebook: habilita o proxy a redirecionar para o onboarding via
      // Facebook (modo igOnly) quando INSTAGRAM_SIGNUP_VIA_FACEBOOK estiver
      // ativo no proxy — este backend suporta canal Instagram (EAA).
      credentials: { ...buildMetaCredentials(), ...resolveOwnAppCtx(), igViaFacebook: true },
      onSuccess: () => toast.success(t("instagramConnectSuccess") || "Instagram conectado"),
      onError: (msg, hijack, code) => {
        if (hijack) { setHijackState(hijack); return; }
        const key = channelCreateErrorKey(code || msg);
        toast.error(key ? tSess(key) : (msg || t("instagramConnectError") || "Erro ao conectar Instagram"));
      },
      onCancelled: () => { /* silencioso */ },
    });
  }

  function loginFacebookOAuth() {
    const usingProxy = selectedAppWaba === "__PROXY__";
    if (!usingProxy) {
      const selectedApp = appWabaOptions.find((a) => String(a.id) === selectedAppWaba);
      if (!selectedApp) { toast.error(t("selectAppWaba")); return; }
      const appId = (selectedApp as any).appId;
      if (!appId) { toast.error(t("appIdNotConfigured")); return; }
    }

    metaProxy.open({
      channel: "facebook",
      credentials: { ...buildMetaCredentials(), ...resolveOwnAppCtx(), igViaFacebook: true },
      onSuccess: (data) => {
        // O popup também cria canais Instagram (EAA) quando o usuário concede a conta
        // IG no asset selector — payload data.instagram lista os criados.
        const igCount = Array.isArray((data as { instagram?: unknown[] })?.instagram)
          ? ((data as { instagram?: unknown[] }).instagram as unknown[]).length
          : 0;
        toast.success(igCount > 0
          ? (t("messengerConnectSuccessWithInstagram", { count: igCount }) || `Facebook Messenger conectado + ${igCount} Instagram`)
          : (t("messengerConnectSuccess") || "Facebook Messenger conectado"));
      },
      onError: (msg, hijack, code) => {
        if (hijack) { setHijackState(hijack); return; }
        const key = channelCreateErrorKey(code || msg);
        toast.error(key ? tSess(key) : (msg || t("messengerConnectError") || "Erro ao conectar Messenger"));
      },
      onCancelled: () => { /* silencioso */ },
    });
  }

  // Phase 13.b — WABA manual (credenciais coladas via HTML do proxy)
  // + handshake proxy:ready/proxy:credentials para o popup setar webhook
  // primary + coex automaticamente (espelha waba-signup.html).
  async function launchWabaManual() {
    if (oauthCooldownUntil && oauthCooldownUntil > Date.now()) {
      const remaining = Math.ceil((oauthCooldownUntil - Date.now()) / 1000);
      toast.error(tCommon("oauthCooldownRemaining", { seconds: remaining }));
      return;
    }
    try {
      const { data } = await api.get<{ authUrl?: string }>("/wabamanual-oauth/auth-url");
      if (!data?.authUrl) {
        toast.error(t("wabaManualError") || "Erro ao iniciar WABA manual");
        return;
      }
      const callbackOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const sep = data.authUrl.includes("?") ? "&" : "?";
      const authUrlWithOrigin = `${data.authUrl}${sep}callbackOrigin=${encodeURIComponent(callbackOrigin)}`;
      const popup = window.open(authUrlWithOrigin, "waba_manual_proxy", "width=560,height=720,scrollbars=yes,resizable=yes");
      toast.success(t("wabaManualOpened") || "Janela de conexao WABA manual aberta");
      if (!popup) return;

      // Popup esta em oauth.techprovider.com.br — origem canonica do proxy.
      const expectedOrigin = new URL(data.authUrl).origin;
      const handler = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        if (!event.data || event.data.type !== "proxy:ready") return;
        let authToken: string | null = null;
        try {
          const raw = localStorage.getItem("token");
          authToken = raw ? JSON.parse(raw) : null;
        } catch { /* noop */ }
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL || window.location.origin).replace(/\/$/, "");
        try {
          popup.postMessage({
            type:      "proxy:credentials",
            apiUrl,
            authToken,
            tenantId:  (user?.tenantId as number) ?? null,
            metaToken: metaToken || "",
          }, expectedOrigin);
        } catch { /* popup closed */ }
      };
      window.addEventListener("message", handler);

      // Cleanup quando o popup fecha
      const watchdog = setInterval(() => {
        if (popup.closed) {
          clearInterval(watchdog);
          window.removeEventListener("message", handler);
        }
      }, 500);
    } catch (error) {
      const info = parseOAuthLicenseError(error);
      if (info.kind === "banned") {
        toast.error(tCommon("oauthRateLimited"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else if (info.kind === "license") {
        toast.error(tCommon("oauthLicenseInvalid"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else {
        toast.error(t("wabaManualError") || "Erro ao iniciar WABA manual");
      }
    }
  }

  async function graphAPI(endpoint: string, accessToken: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ access_token: accessToken, ...params });
    const res = await fetch(`https://graph.facebook.com/${facebookApiVersion}${endpoint}?${qs}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `Erro HTTP ${res.status}`);
    return data;
  }

  async function loadWABAs() {
    if (!facebookStatus?.authResponse?.accessToken) { toast.error(t("loginFirst")); return; }
    setLoadingWABAs(true);
    try {
      const accessToken = facebookStatus.authResponse.accessToken;
      const bizRes = await graphAPI("/me/businesses", accessToken, { fields: "id,name" });
      const businesses: any[] = bizRes.data || [];
      if (businesses.length === 0) { toast.info(t("noBusinessAccounts")); setWabasList([]); return; }

      const wabaArrays = await Promise.all(
        businesses.map(async (biz: any) => {
          try {
            const wabaRes = await graphAPI(`/${biz.id}/owned_whatsapp_business_accounts`, accessToken, {
              fields: "id,name,account_review_status,message_template_namespace,timezone_id",
            });
            return (wabaRes.data || []).map((w: any) => ({ ...w, businessId: biz.id, businessName: biz.name }));
          } catch {
            return [];
          }
        })
      );
      const allWabas = wabaArrays.flat();
      setWabasList(allWabas);
      if (allWabas.length === 0) toast.info(t("noWabasFound"));
      else toast.success(`${allWabas.length} WABA${allWabas.length > 1 ? "s" : ""} encontrado${allWabas.length > 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(t("errorLoadWabas"));
    } finally {
      setLoadingWABAs(false);
    }
  }

  async function loadPhonesForWABA(wabaIdParam: string) {
    if (!facebookStatus?.authResponse?.accessToken) return;
    setLoadingPhones(wabaIdParam);
    try {
      const res = await graphAPI(`/${wabaIdParam}/phone_numbers`, facebookStatus.authResponse.accessToken, {
        fields: "id,display_phone_number,verified_name,code_verification_status,quality_rating,status,throughput,account_mode",
      });
      const phones = res.data || [];
      setWabasList((prev) => prev.map((w) => (w.id === wabaIdParam ? { ...w, phones, phonesLoaded: true } : w)));
    } catch (err: any) {
      toast.error(t("errorLoadPhoneInfo"));
    } finally {
      setLoadingPhones(null);
    }
  }

  async function createWABAChannel(waba: any, phone: any) {
    const key = `${waba.id}-${phone.id}`;
    setCreatingChannels((prev) => ({ ...prev, [key]: true }));
    try {
      const token = facebookStatus?.authResponse?.accessToken || "";
      await createWhatsapp({
        name: phone.verified_name || phone.display_phone_number,
        type: "waba",
        wabaId: waba.id,
        tokenAPI: token,
        wabaVersion: facebookApiVersion,
        appId: facebookAppId,
        status: "CONNECTED",
      });
      toast.success(`${t("channelCreatedFor")} ${phone.display_phone_number}`);
      // Este fluxo (Login com Facebook -> lista de WABAs) NAO seta webhook
      // automaticamente (diferente do waba-signup e waba-manual). O admin
      // precisa clicar "Revalidar webhook" na sessao para ativar entrega.
      toast.info(t("wabaNeedsWebhookRevalidate") || "Canal criado. Clique em Revalidar webhook na sessao para ativar entrega.", {
        duration: 8000,
      });
      const r = await fetchWhatsapps(true); // pós-mutação: fura cache TTL 1500ms
      setWhatsapps(r.data);
    } catch (err: any) {
      const errKey = channelCreateErrorKey(err?.data?.error || err?.response?.data?.error);
      toast.error(errKey ? tSess(errKey) : t("errorCreateChannel"));
    } finally {
      setCreatingChannels((prev) => ({ ...prev, [key]: false }));
    }
  }

  // ─── Instagram / Facebook account check ──────────────────────────────────

  async function checkInstagramAccount() {
    if (!selectedInstagram) { toast.error(t("errorSelectConn")); return; }
    setLoadingInstagramCheck(true);
    try {
      const conn = whatsapps.find((w) => w.id === Number(selectedInstagram)) as any;
      if (!conn) throw new Error("Conexão não encontrada");
      const { data } = await getInstagramChannelInfo(conn.id);
      setInstagramAccountInfo(data);
    } catch (err: any) {
      toast.error(t("errorLoadInstagram"));
    } finally {
      setLoadingInstagramCheck(false);
    }
  }

  async function handleLoadMsgrGreeting() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    if (!conn?.fbPageId) return;
    setMsgrGreetingLoading(true);
    try {
      const res = await getMessengerGreetingText(conn.fbPageId);
      const greeting = (res.data as any)?.data?.[0]?.greeting?.[0]?.text || "";
      setMsgrGreetingText(greeting);
    } catch {} finally { setMsgrGreetingLoading(false); }
  }

  async function handleSaveMsgrGreeting() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    if (!msgrGreetingText.trim()) { toast.warning(t("fillAllFields")); return; }
    setMsgrGreetingLoading(true);
    try {
      await setMessengerGreetingText({
        tokenApi: conn.fbPageId,
        greetings: [{ locale: "default", text: msgrGreetingText }]
      });
      toast.success(t("savedSuccess"));
    } catch { toast.error(t("errorSendingMessage")); } finally { setMsgrGreetingLoading(false); }
  }

  async function handleDeleteMsgrGreeting() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    setMsgrGreetingLoading(true);
    try {
      await deleteMessengerGreetingText({ tokenApi: conn.fbPageId });
      setMsgrGreetingText("");
      toast.success(t("deletedSuccess"));
    } catch { toast.error(t("errorSendingMessage")); } finally { setMsgrGreetingLoading(false); }
  }

  async function handleLoadMsgrPersonas() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    if (!conn?.fbPageId) return;
    setMsgrPersonasLoading(true);
    try {
      const res = await listMessengerPersonas(conn.fbPageId);
      setMsgrPersonas((res.data as any)?.data || []);
    } catch {} finally { setMsgrPersonasLoading(false); }
  }

  async function handleCreateMsgrPersona() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    if (!newPersonaName.trim()) { toast.warning(t("fillAllFields")); return; }
    setMsgrPersonasLoading(true);
    try {
      await createMessengerPersona({
        tokenApi: conn.fbPageId,
        name: newPersonaName,
        profilePictureUrl: newPersonaPic || undefined
      });
      setNewPersonaName("");
      setNewPersonaPic("");
      await handleLoadMsgrPersonas();
      toast.success(t("savedSuccess"));
    } catch { toast.error(t("errorSendingMessage")); } finally { setMsgrPersonasLoading(false); }
  }

  async function handleDeleteMsgrPersona(personaId: string) {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
    setMsgrPersonasLoading(true);
    try {
      await deleteMessengerPersona({ tokenApi: conn.fbPageId, personaId });
      await handleLoadMsgrPersonas();
      toast.success(t("deletedSuccess"));
    } catch { toast.error(t("errorSendingMessage")); } finally { setMsgrPersonasLoading(false); }
  }

  async function checkFacebookAccount() {
    if (!selectedFacebook) { toast.error(t("errorSelectConn")); return; }
    setLoadingFacebookCheck(true);
    try {
      const conn = whatsapps.find((w) => w.id === Number(selectedFacebook)) as any;
      if (!conn) throw new Error("Conexão não encontrada");
      const { data } = await getFacebookChannelInfo(conn.id);
      setFacebookAccountInfo(data);
    } catch (err: any) {
      toast.error(t("errorLoadFacebook"));
    } finally {
      setLoadingFacebookCheck(false);
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  // Cinto-e-suspensório: resolve as credenciais WABA na hora da ação. Se o
  // objeto do store estiver sem wabaId/bmToken (populado incompleto por outra
  // tela), re-busca /whatsapp furando o cache e re-hidrata o store.
  async function resolveWabaConnCredentials(id: number): Promise<(Whatsapp & {
    tokenAPI?: string; wabaId?: string; bmToken?: string; wabaVersion?: string; appId?: string;
  }) | undefined> {
    const cached = whatsapps.find((w) => w.id === id) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; bmToken?: string; wabaVersion?: string; appId?: string;
    } | undefined;
    if (cached?.wabaId && cached?.bmToken) return cached;
    try {
      const { data } = await fetchWhatsapps(true);
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) setWhatsapps(list);
      const fresh = list.find((w: { id?: number | string }) => Number(w?.id) === id) as (Whatsapp & {
        tokenAPI?: string; wabaId?: string; bmToken?: string; wabaVersion?: string; appId?: string;
      }) | undefined;
      return fresh ?? cached;
    } catch {
      return cached;
    }
  }

  async function loadTemplates() {
    if (!selectedWaba) { toast.error(t("selectWabaFirst")); return; }
    setLoadingTemplates(true);
    try {
      const conn = whatsapps.find((w) => w.id === Number(selectedWaba)) as Whatsapp & { tokenAPI?: string };
      // Logo apos o login o store de sessoes pode estar sem tokenAPI (ainda
      // carregando) — resolve via /whatsapp antes de desistir, evitando a
      // falha "noTokenApi" que so um F5 curava.
      let tokenApi = conn?.tokenAPI;
      if (!tokenApi) {
        const resolved = await resolveChannelForTemplates({ id: Number(selectedWaba), type: "waba" });
        tokenApi = resolved.tokenAPI;
      }
      if (!tokenApi) throw new Error(t("noTokenApi"));
      const { data } = await listTemplates(tokenApi);
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setTemplates(list);
    } catch (err: any) {
      toast.error(t("errorLoadTemplates"));
    } finally {
      setLoadingTemplates(false);
    }
  }

  function filterTemplates() {
    const filtered = templates.filter((t) => {
      if (filtros.status !== "all" && t.status?.toUpperCase() !== filtros.status.toUpperCase()) return false;
      if (filtros.category !== "all" && t.category?.toUpperCase() !== filtros.category.toUpperCase()) return false;
      if (filtros.language !== "all" && t.language !== filtros.language) return false;
      if (filtros.search && !t.name?.toLowerCase().includes(filtros.search.toLowerCase()) && !String(t.id ?? "").includes(filtros.search)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "name_asc": return (a.name ?? "").localeCompare(b.name ?? "");
        case "name_desc": return (b.name ?? "").localeCompare(a.name ?? "");
        case "id_asc": return String(a.id ?? "").localeCompare(String(b.id ?? ""));
        case "id_desc": return String(b.id ?? "").localeCompare(String(a.id ?? ""));
        case "category": return (a.category ?? "").localeCompare(b.category ?? "");
        case "status": return (a.status ?? "").localeCompare(b.status ?? "");
        default: return 0;
      }
    });
  }

  function groupTemplates(list: any[]): { key: string; items: any[] }[] {
    if (groupBy === "none") return [{ key: "", items: list }];
    const map = new Map<string, any[]>();
    list.forEach((t) => {
      const key = groupBy === "status" ? (t.status ?? "—")
        : groupBy === "category" ? (t.category ?? "—")
        : groupBy === "language" ? (t.language ?? "—")
        : "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }

  function viewTemplate(template: any) {
    setTemplateSelecionado(template);
    setShowTemplateModal(true);
  }

  function deleteTemplateConfirm(template: any) {
    setTemplateToDelete(template);
  }

  async function performDeleteTemplate() {
    const template = templateToDelete;
    if (!template) return;
    const conn = await resolveWabaConnCredentials(Number(selectedWaba));
    if (!conn?.wabaId || !conn?.bmToken) {
      toast.error(t("noTokenApi"));
      return;
    }
    setLoadingDeleteTemplate(true);
    try {
      await deleteTemplate({
        wabaId: conn.wabaId,
        wabaVersion: conn.wabaVersion || "v23.0",
        wabaToken: conn.bmToken,
        tenantId: user?.tenantId,
        templateId: template.id,
        templateName: template.name,
      });
      toast.success(t("templateDeleted"));
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== template.id));
      setTemplateToDelete(null);
    } catch (err: any) {
      const metaMsg =
        err?.response?.data?.error?.error_user_msg ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.response?.data?.error;
      toast.error(metaMsg || t("errorDeleteTemplate"));
    } finally {
      setLoadingDeleteTemplate(false);
    }
  }

  function editTemplateAction(template: any) {
    setIsEditing(true);
    setTemplateIdToEdit(template.id);
    const conn = whatsapps.find((w) => w.id === Number(selectedWaba)) as Whatsapp & { appId?: string };
    setAppId(conn?.appId || FALLBACK_TEMPLATE_APP_ID);
    setNovoTemplate({
      name: template.name,
      language: template.language,
      category: template.category,
      components: template.components || [],
    });
    setWabaSubTab("create");
  }

  async function submitCreateTemplate() {
    if (!selectedWaba) { toast.error(t("selectWabaFirst")); return; }
    if (!novoTemplate.name) { toast.error(t("fillTemplateName")); return; }
    setLoadingCreate(true);
    try {
      const conn = await resolveWabaConnCredentials(Number(selectedWaba));
      if (!conn?.wabaId || !conn?.bmToken) { toast.error(t("noTokenApi")); return; }
      const resolvedAppId = (conn?.appId != null && conn.appId !== "") ? conn.appId : (appId || FALLBACK_TEMPLATE_APP_ID);
      if (isEditing) {
        const payload = {
          wabaId: conn?.wabaId,
          wabaVersion: conn?.wabaVersion || "v23.0",
          wabaToken: conn?.bmToken,
          tenantId: user?.tenantId,
          appId: resolvedAppId,
          templateId: templateIdToEdit,
          template: {
            name: novoTemplate.name,
            language: novoTemplate.language,
            category: novoTemplate.category,
            components: novoTemplate.components,
          },
        };
        await editTemplate(payload);
        toast.success(t("templateUpdated"));
      } else {
        const payload = {
          wabaId: conn?.wabaId,
          wabaVersion: conn?.wabaVersion || "v23.0",
          wabaToken: conn?.bmToken,
          tenantId: user?.tenantId,
          appId: resolvedAppId,
          template: {
            name: novoTemplate.name,
            language: novoTemplate.language,
            category: novoTemplate.category,
            // Cobrança: exigido pela Meta na CRIAÇÃO, junto do botão. Não vai na
            // edição — lá o formato já está aprovado e o campo não é editável.
            ...(hasOrderDetailsButton(novoTemplate.components)
              ? { display_format: "ORDER_DETAILS" }
              : {}),
            components: novoTemplate.components,
          },
        };
        await createTemplate(payload);
        toast.success(t("templateCreated"));
      }
      setIsEditing(false);
      setTemplateIdToEdit("");
      setNovoTemplate({ name: "", language: "pt_BR", category: "MARKETING", components: [] });
      setWabaSubTab("templates");
      loadTemplates();
    } catch (err: any) {
      const metaMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.error_user_msg ||
        err?.response?.data?.error?.error_user_title ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.details?.error?.error_user_msg ||
        err?.response?.data?.details?.error?.error_user_title ||
        err?.response?.data?.details?.error?.message ||
        (typeof err?.response?.data?.error === "string" ? err.response.data.error : undefined);
      toast.error(metaMsg || t("errorSaveTemplate"), { duration: 8000 });
    } finally {
      setLoadingCreate(false);
    }
  }

  function addComponent(type: string) {
    const base: TemplateComponent = { type };
    if (type === "HEADER") base.format = "TEXT";
    if (type === "BUTTONS") (base as any).buttons = [];
    setNovoTemplate((prev) => ({ ...prev, components: [...prev.components, base] }));
  }

  function removeComponent(idx: number) {
    setNovoTemplate((prev) => ({ ...prev, components: prev.components.filter((_, i) => i !== idx) }));
  }

  function updateComponent(idx: number, update: Partial<TemplateComponent>) {
    setNovoTemplate((prev) => ({
      ...prev,
      components: prev.components.map((c, i) => (i === idx ? { ...c, ...update } : c)),
    }));
  }

  function handleOpenGalleryPicker(compIdx: number) {
    setGalleryPickerTarget(compIdx);
    setGalleryPickerOpen(true);
  }

  function handlePickGalleryItem(item: GalleryItem) {
    if (galleryPickerTarget === null) return;
    updateComponent(galleryPickerTarget, { example: item.url } as any);
    setGalleryPickerOpen(false);
  }

  function addButton(idx: number) {
    setNovoTemplate((prev) => {
      const comps = [...prev.components];
      const comp = { ...comps[idx] } as any;
      comp.buttons = [...(comp.buttons || []), { type: "QUICK_REPLY", text: "" }];
      comps[idx] = comp;
      return { ...prev, components: comps };
    });
  }

  function removeButton(compIdx: number, btnIdx: number) {
    setNovoTemplate((prev) => {
      const comps = [...prev.components];
      const comp = { ...comps[compIdx] } as any;
      comp.buttons = comp.buttons.filter((_: any, i: number) => i !== btnIdx);
      comps[compIdx] = comp;
      return { ...prev, components: comps };
    });
  }

  function updateButton(compIdx: number, btnIdx: number, update: Record<string, string>) {
    setNovoTemplate((prev) => {
      const comps = [...prev.components];
      const comp = { ...comps[compIdx] } as any;
      comp.buttons = comp.buttons.map((b: any, i: number) => {
        if (i !== btnIdx) return b;
        const merged = { ...b, ...update };
        // Cobrança: a Meta impõe o rótulo do botão ORDER_DETAILS — qualquer outro
        // texto volta como "Invalid parameter" (error_subcode 2388153) e o template
        // nem é criado. O campo fica travado e se preenche ao escolher o tipo.
        if (String(merged.type || "").toUpperCase() === "ORDER_DETAILS") {
          merged.text = ORDER_DETAILS_BUTTON_TEXT;
        }
        return merged;
      });
      comps[compIdx] = comp;
      return { ...prev, components: comps };
    });
  }

  // ─── AI Template Generation ───────────────────────────────────────────────

  // Clampa textos do resultado da IA aos limites oficiais da Meta, preservando
  // intacto tudo que não for texto (header IMAGE/VIDEO com example etc.).
  function clampTemplateComponents(components: any[]): any[] {
    return components.map((comp) => {
      if (!comp || typeof comp !== "object") return comp;
      const c = { ...comp };
      if (c.type === "HEADER" && (c.format === "TEXT" || !c.format)) {
        if (typeof c.text === "string") c.text = c.text.slice(0, WABA_LIMITS.templateHeaderText);
      } else if (c.type === "BODY") {
        if (typeof c.text === "string") c.text = c.text.slice(0, WABA_LIMITS.templateBody);
      } else if (c.type === "FOOTER") {
        if (typeof c.text === "string") c.text = c.text.slice(0, WABA_LIMITS.templateFooter);
      } else if (c.type === "BUTTONS" && Array.isArray(c.buttons)) {
        c.buttons = c.buttons.map((b: any) => {
          if (!b || typeof b !== "object") return b;
          const nb = { ...b };
          if (typeof nb.text === "string") nb.text = nb.text.slice(0, WABA_LIMITS.templateButtonText);
          if (typeof nb.url === "string") nb.url = nb.url.slice(0, WABA_LIMITS.templateUrl);
          if (typeof nb.phone_number === "string") nb.phone_number = nb.phone_number.slice(0, WABA_LIMITS.templatePhone);
          return nb;
        });
      }
      return c;
    });
  }

  async function generateTemplateWithAI(formOverride?: typeof aiForm) {
    const form = formOverride ?? aiForm;
    if (!selectedWaba) { toast.error(t("selectWabaFirst")); return; }
    if (!form.prompt.trim()) { toast.error(t("fillAllFields")); return; }

    const conn = whatsapps.find((w) => w.id === Number(selectedWaba)) as Whatsapp & {
      chatgptApiKey?: string; chatgptModel?: string;
    };

    if (form.aiSource === "canal" && !conn?.chatgptApiKey) {
      toast.error(t("aiNoApiKey"));
      return;
    }

    setAiGenerating(true);
    try {
      const langMap: Record<string, string> = {
        pt_BR: "português brasileiro", en_US: "English", es: "Spanish",
        fr: "French", de: "German", it: "Italian", ja: "Japanese",
        zh_CN: "Chinese", ar: "Arabic", hi: "Hindi", id: "Indonesian",
        ru: "Russian", tr: "Turkish",
      };
      const langLabel = langMap[form.language] || form.language;

      const componentInstructions: string[] = [];
      if (form.includeHeader) {
        if (form.headerType === "TEXT") {
          componentInstructions.push(`- HEADER component: type HEADER, format TEXT, text field (max 60 chars, can use 1 variable {{1}})`);
        } else {
          componentInstructions.push(`- HEADER component: type HEADER, format ${form.headerType}, no text field needed`);
        }
      }
      componentInstructions.push(`- BODY component (required): type BODY, text field (max 1024 chars, use {{1}} {{2}} etc for variables)`);
      if (form.includeFooter) {
        componentInstructions.push(`- FOOTER component: type FOOTER, text field (max 60 chars, no variables allowed)`);
      }
      if (form.includeButtons && form.buttonTypes.length > 0) {
        const btnDescs = form.buttonTypes.map((bt) => {
          if (bt === "QUICK_REPLY") return `QUICK_REPLY button (text max 20 chars)`;
          if (bt === "URL") return `URL button (text max 20 chars, url field with https:// link, optionally ending with /{{1}} for dynamic path)`;
          if (bt === "PHONE_NUMBER") return `PHONE_NUMBER button (text max 20 chars, phone_number field in E.164 format like +5511999999999)`;
          return bt;
        });
        componentInstructions.push(`- BUTTONS component: type BUTTONS, buttons array containing: ${btnDescs.join(", ")} (max 3 buttons total)`);
      }

      const systemPrompt = `You are an expert in Meta WhatsApp Business API template creation. Generate a complete, valid WABA template.

STRICT RULES:
- Template name: lowercase letters, numbers, and underscores ONLY (no spaces, no hyphens, no special chars)
- Category: must be exactly "${form.category}"
- Language: must be exactly "${form.language}"
- All text must be written in ${langLabel}
- BODY text: max 1024 characters, use {{1}}, {{2}}, etc. for dynamic variables (sequential, starting at 1)
- HEADER TEXT: max 60 characters, optional {{1}} variable
- FOOTER text: max 60 characters, NO variables allowed
- Button text: max 20 characters each
- Maximum 3 buttons total
- For AUTHENTICATION category: BODY should contain an OTP/verification code message, you may add a COPY_CODE button
- For UTILITY category: transactional content like order confirmation, shipping updates
- For MARKETING category: promotional content, offers, announcements

REQUIRED COMPONENTS:
${componentInstructions.join("\n")}

Return ONLY a valid JSON object (no markdown, no explanation, no code blocks) with this exact structure:
{
  "name": "template_name_here",
  "language": "${form.language}",
  "category": "${form.category}",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "..." },
    { "type": "BODY", "text": "..." },
    { "type": "FOOTER", "text": "..." },
    { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "..." }] }
  ]
}
Include only the components listed above. Do not add components that were not requested.`;

      const userPrompt = `Create a WhatsApp Business template for this purpose: ${form.prompt}`;

      // Ambas as fontes passam pelo backend: o canal pode ter chatgptBaseUrl
      // customizado (proxy), que só o servidor resolve com segurança (sem CORS
      // nem uso da chave direto no browser).
      const result = await generateTemplateViaCopilot(
        systemPrompt,
        userPrompt,
        form.aiSource === "copilot"
          ? { source: "copilot" }
          : { source: "channel", whatsappId: Number(selectedWaba) }
      );
      let raw = result.result.trim();
      setAiModelInfo({ provider: result.provider, model: result.model });

      // Strip markdown code blocks if present
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        toast.error(t("aiParseError"));
        return;
      }

      setNovoTemplate({
        name: (parsed.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, WABA_LIMITS.templateName),
        language: parsed.language || form.language,
        category: parsed.category || form.category,
        components: Array.isArray(parsed.components) ? clampTemplateComponents(parsed.components) : [],
      });
      setAiDialogOpen(false);
      setWabaSubTab("create");
      toast.success(t("aiSuccess"));
    } catch (err: any) {
      const errMsg = err?.response?.data?.error;
      if (errMsg === "ERR_COPILOT_NO_API_KEY") {
        toast.error(form.aiSource === "canal" ? t("aiNoApiKey") : t("aiCopilotNoApiKey"));
      } else {
        toast.error(t("aiError"));
      }
    } finally {
      setAiGenerating(false);
    }
  }

  // ─── Phone management ─────────────────────────────────────────────────────

  // Probe silencioso: tenta `getPhoneById` quando o número selecionado muda.
  // Usa o resultado pra decidir se mostra o dropdown "Telefone" (Registrar/Verificar):
  // - status PENDING + CLOUD_API → precisa registro manual (mostrar)
  // - webhookOrigin zdg_oauth → COEX/SMB, Meta gerencia (esconder)
  // - Erro (provavelmente sem permissão) → esconder também
  // - Outros status → ja registrado, esconder
  useEffect(() => {
    if (!selectedPhone) { setPhoneNeedsManualReg(null); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaVersion?: string; bmToken?: string;
    };
    // COEX/Embedded Signup: Meta gerencia, /register retorna "not available for SMB businesses".
    if (conn?.webhookOrigin === "zdg_oauth") { setPhoneNeedsManualReg(false); return; }
    if (!conn?.tokenAPI || !conn?.bmToken) { setPhoneNeedsManualReg(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await getPhoneById({
          phoneNumberId: conn.tokenAPI,
          wabaVersion: conn.wabaVersion || "v19.0",
          wabaToken: conn.bmToken,
        });
        if (cancelled) return;
        const d: any = (res as any)?.data ?? res;
        const info = d?.phone_info ?? d;
        const status = String(info?.status || "").toUpperCase();
        const platform = String(info?.platform_type || "").toUpperCase();
        const codeStatus = String(info?.code_verification_status || "").toUpperCase();
        // PENDING ou EXPIRED em CLOUD_API = precisa registrar/renovar PIN.
        // CONNECTED / DISCONNECTED / FLAGGED com code_verification_status != EXPIRED = já registrado.
        const isCloudApi = platform === "" || platform === "CLOUD_API";
        const needs =
          isCloudApi &&
          (status === "PENDING" || codeStatus === "EXPIRED");
        setPhoneNeedsManualReg(needs);
      } catch {
        if (cancelled) return;
        // Erro do Meta (incluindo SMB/COEX) → modo gerenciado, esconder dropdown.
        setPhoneNeedsManualReg(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPhone, whatsapps]);

  async function checkPhone() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    setLoadingPhoneCheck(true);
    try {
      const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
        tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
      };
      const { data } = await getPhoneById({
        phoneNumberId: conn?.tokenAPI,
        wabaVersion: conn?.wabaVersion || "v19.0",
        wabaToken: conn?.bmToken,
      });
      setPhoneInfo(data);
      // Atualiza estado de registro após verificar — cobre EXPIRED que o probe inicial pode ter cacheado
      const info = (data as any)?.phone_info ?? data;
      const status = String(info?.status || "").toUpperCase();
      const platform = String(info?.platform_type || "").toUpperCase();
      const codeStatus = String(info?.code_verification_status || "").toUpperCase();
      const isCloudApi = platform === "" || platform === "CLOUD_API";
      setPhoneNeedsManualReg(isCloudApi && (status === "PENDING" || codeStatus === "EXPIRED"));
    } catch (err: any) {
      toast.error(t("errorLoadPhoneInfo"));
    } finally {
      setLoadingPhoneCheck(false);
    }
  }

  function openPhoneRegistrationModal() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    setPhoneRegistrationData({
      phoneNumberId: conn?.tokenAPI || "",
      wabaId: conn?.wabaId || "",
      wabaVersion: conn?.wabaVersion || "v19.0",
      wabaToken: conn?.bmToken || "",
      pin: "",
    });
    setShowPhoneRegistrationModal(true);
  }

  async function submitPhoneRegistration() {
    setLoadingVerification(true);
    try {
      await registerPhone(phoneRegistrationData);
      toast.success(t("phoneRegistered"));
      // Pin registered — flip o sino "Pendente" imediatamente (Meta status
      // pode levar minutos pra mudar de PENDING pra CONNECTED).
      const pid = phoneRegistrationData.phoneNumberId;
      if (pid) invalidateWabaPinPendingCache({ phoneNumberId: pid, markRegistered: true });
      setPhoneNeedsManualReg(false);
      setShowPhoneRegistrationModal(false);
    } catch (err: any) {
      // Prefere mensagem do backend (já contém error_user_msg do Meta ou aviso COEX/SMB),
      // cai no i18n se backend não enviou nada útil.
      toast.error(formatBulkSendError(err) || t("errorRegisterPhone"));
    } finally {
      setLoadingVerification(false);
    }
  }

  async function openWebhookModal() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    if (oauthCooldownUntil && oauthCooldownUntil > Date.now()) {
      const remaining = Math.ceil((oauthCooldownUntil - Date.now()) / 1000);
      toast.error(tCommon("oauthCooldownRemaining", { seconds: remaining }));
      return;
    }
    try {
      const { data } = await api.get<{ authUrl?: string }>(
        `/wabametaOverrideCallbackUrl/auth-url?whatsappId=${selectedPhone}&mode=primary`
      );
      if (data?.authUrl) {
        window.open(data.authUrl, "waba_webhook_setup", "width=560,height=480,scrollbars=yes,resizable=yes");
      } else {
        toast.error(t("errorSaveWebhook"));
      }
    } catch (error) {
      const info = parseOAuthLicenseError(error);
      if (info.kind === "banned") {
        toast.error(tCommon("oauthRateLimited"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else if (info.kind === "license") {
        toast.error(tCommon("oauthLicenseInvalid"), { duration: 10000 });
        setOauthCooldownUntil(Date.now() + OAUTH_LICENSE_COOLDOWN_MS);
      } else {
        toast.error(t("errorSaveWebhook"));
      }
    }
  }

  async function submitWebhook() {
    // kept for backward compat — not called by frontendNovo (uses openWebhookModal popup)
  }

  // submitWebhookCoex removido: o popup "Configurar Webhook" (mode=primary) agora
  // configura o webhook principal E o secundario (COEX) numa unica submissao.

  // ── Meta webhook revalidation + change origin (Instagram / Messenger / WABA) ──
  const tSessoes = useTranslations("sessoesPage");
  const [originChangeTarget, setOriginChangeTarget] = useState<Whatsapp | null>(null);
  const [originChangeValue, setOriginChangeValue] = useState<"own_app" | "zdg_oauth">("own_app");
  const [originChangeLoading, setOriginChangeLoading] = useState(false);
  const [diagnoseTarget, setDiagnoseTarget] = useState<Whatsapp | null>(null);
  const pendingDiagnoseIdRef = useRef<number | null>(null);

  async function openMetaWebhookPopup(
    type: "waba" | "instagram" | "messenger",
    whatsappId: number
  ) {
    pendingDiagnoseIdRef.current = whatsappId;
    // WABA: o popup faz, numa unica submissao, o webhook PRINCIPAL e o SECUNDARIO
    // (COEX) — o backend anexa os params do coex no state quando mode=primary.
    const loadingId = toast.loading(tSessoes("openingOauthPopup"));
    try {
      const path =
        type === "waba"     ? `/wabametaOverrideCallbackUrl/auth-url?whatsappId=${whatsappId}&mode=primary`
      : type === "instagram"? `/instagramMetaOverrideCallbackUrl/auth-url?whatsappId=${whatsappId}`
      :                       `/messengerMetaOverrideCallbackUrl/auth-url?whatsappId=${whatsappId}`;
      const { data } = await api.get<{ authUrl?: string }>(path);
      toast.dismiss(loadingId);
      if (data?.authUrl) {
        const winName =
          type === "waba"     ? "waba_webhook_setup"
        : type === "instagram"? "instagram_webhook_setup"
        :                       "messenger_webhook_setup";
        window.open(data.authUrl, winName, "width=560,height=480,scrollbars=yes,resizable=yes");
      } else {
        toast.error(t("errorSaveWebhook"));
      }
    } catch {
      toast.dismiss(loadingId);
      toast.error(t("errorSaveWebhook"));
    }
  }

  function openChangeOriginDialog(item: Whatsapp) {
    setOriginChangeTarget(item);
    // Pre-seleciona a origem ATUAL do canal para mostrar o estado atual ao admin.
    // Confirm fica disabled ate ele trocar para a outra opcao (guard `webhookOrigin === originChangeValue`).
    setOriginChangeValue(item.webhookOrigin === "zdg_oauth" ? "zdg_oauth" : "own_app");
  }

  async function confirmChangeOrigin(
    override?: { target: Whatsapp; value: "own_app" | "zdg_oauth" }
  ) {
    const targetCtx = override?.target ?? originChangeTarget;
    const valueCtx  = override?.value  ?? originChangeValue;
    if (!targetCtx) return;
    const targetId = Number(targetCtx.id);
    if (!targetId || !Number.isFinite(targetId)) { setOriginChangeTarget(null); return; }
    const targetName = targetCtx.name;
    const targetType = targetCtx.type as "waba" | "instagram" | "messenger";
    setOriginChangeLoading(true);
    try {
      const { data } = await updateWebhookOrigin(targetId, valueCtx);
      const needsRevalidation = !!data?.needsRevalidation;
      // Refresh local whatsapps list so the UI reflects the new origin
      // (force=true: pós-mutação, fura cache TTL 1500ms)
      try {
        const r = await fetchWhatsapps(true);
        setWhatsapps(r.data);
      } catch {}
      if (needsRevalidation) {
        toast.warning(tSessoes("webhookOriginUpdatedPendingRevalidation", { name: targetName }), {
          action: {
            label: tSessoes("revalidateWebhook"),
            onClick: () => openMetaWebhookPopup(targetType, targetId),
          },
          duration: 10000,
        });
      } else {
        toast.success(tSessoes("webhookOriginUpdated"));
      }
      setOriginChangeTarget(null);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const d      = err?.data   ?? err?.response?.data;
      const code   = d?.error;
      if (status === 403 && code === "LICENSE_INVALID") {
        toast.error(tSessoes("webhookOriginLicenseInvalid"));
      } else if (status === 409 && code === "HIJACK") {
        // Abre HijackTakeoverDialog com retry da troca de origem apos takeover.
        setHijackState({
          channel:      d?.channel      || targetType,
          errorCode:    d?.errorCode    || "ALREADY_REGISTERED",
          apiUrlMasked: d?.existing?.apiUrlMasked || "***",
          registeredAt: d?.existing?.registeredAt ?? null,
          identifier:   d?.identifier   ?? null,
          callbackUrl:  d?.callbackUrl  ?? null,
        });
        setHijackPendingRetry(() => () => confirmChangeOrigin({ target: targetCtx, value: valueCtx }));
        setOriginChangeTarget(null);
      } else if (code === "META_OVERRIDE_FAILED") {
        toast.error(tSessoes("webhookOriginMetaFailed"));
      } else {
        const detail = code ?? err?.message;
        toast.error(detail ? `${tSessoes("webhookOriginUpdateFailed")}: ${detail}` : tSessoes("webhookOriginUpdateFailed"));
      }
    } finally {
      setOriginChangeLoading(false);
    }
  }

  // Limpa flag webhookNeedsRevalidation quando popup fecha com sucesso
  useEffect(() => {
    function onMsg(event: MessageEvent) {
      if (!event.data) return;
      const type = event.data.type;
      const wid = Number(event.data.whatsappId) || pendingDiagnoseIdRef.current;
      if (!wid) return;
      if (
        type === "waba:webhook:setup:success" ||
        type === "instagram:webhook:setup:success" ||
        type === "messenger:webhook:setup:success"
      ) {
        confirmWebhookRevalidation(wid).catch(() => {});
        window.setTimeout(() => {
          const list = useWhatsappStore.getState().whatsapps;
          const ch = list.find((w) => w.id === wid);
          if (ch) setDiagnoseTarget(ch as unknown as Whatsapp);
          pendingDiagnoseIdRef.current = null;
        }, 1500);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    function onHijackMsg(event: MessageEvent) {
      const data = event.data as any;
      if (!data || typeof data.type !== "string") return;
      const m = data.type.match(/^(messenger|instagram)-oauth-hijack$/);
      if (!m) return;
      setHijackState({
        channel:      data.details?.channel    || m[1],
        errorCode:    data.details?.errorCode  || "ALREADY_REGISTERED",
        apiUrlMasked: data.details?.apiUrlMasked || "***",
        registeredAt: data.details?.registeredAt ?? null,
        identifier:   data.identifier   ?? null,
        callbackUrl:  data.callbackUrl  ?? null,
      });
    }
    window.addEventListener("message", onHijackMsg);
    return () => window.removeEventListener("message", onHijackMsg);
  }, []);

  function openSIPModal() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    setShowSIPModal(true);
  }

  async function submitSIP() {
    setLoadingSIP(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    try {
      await configureSIP({
        phoneNumberId: conn?.tokenAPI,
        wabaVersion: conn?.wabaVersion || "v19.0",
        wabaToken: conn?.bmToken,
        sipConfig: { hostname: sipData.hostname, port: sipData.port },
      });
      toast.success(t("sipSaved"));
      setShowSIPModal(false);
    } catch (err: any) {
      toast.error(t("errorSaveSip"));
    } finally {
      setLoadingSIP(false);
    }
  }

  async function handleEnableWebRTCCalling() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaVersion?: string; bmToken?: string;
    };
    if (!conn?.tokenAPI || !conn?.bmToken) { toast.error(t("noPhoneNumberId")); return; }
    setLoadingWebRTC(true);
    try {
      await enableWabaWebRTCCalling({
        phoneNumberId: conn.tokenAPI,
        wabaVersion: conn.wabaVersion || "v19.0",
        wabaToken: conn.bmToken,
      });
      toast.success(t("webrtcCallingEnabled"));
    } catch (err: any) {
      const data = err?.data ?? err?.response?.data;
      const meta = data?.details;
      const metaMsg = meta?.metaMessage;
      const metaCode = meta?.metaCode;
      const detail = metaMsg
        ? metaCode
          ? `(#${metaCode}) ${metaMsg}`
          : metaMsg
        : data?.error || err?.message;
      toast.error(detail ? `${t("errorEnableWebRTC")}: ${detail}` : t("errorEnableWebRTC"));
    } finally {
      setLoadingWebRTC(false);
    }
  }

  async function openProfileModal() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    setLoadingProfile(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    if (!conn?.tokenAPI) { toast.error(t("noPhoneNumberId")); setLoadingProfile(false); return; }
    try {
      const { data } = await getProfile({
        phoneNumberId: conn.tokenAPI,
        wabaVersion: conn.wabaVersion || "v19.0",
        wabaToken: conn.bmToken,
      });
      setCurrentProfile(data);
      setProfileData({
        about: data?.about || "",
        address: data?.address || "",
        description: data?.description || "",
        email: data?.email || "",
        vertical: data?.vertical || "",
        websites: data?.websites || [""],
      });
    } catch {
      setProfileData({ about: "", address: "", description: "", email: "", vertical: "", websites: [""] });
    } finally {
      setLoadingProfile(false);
    }
    setShowProfileModal(true);
  }

  async function submitProfile() {
    setLoadingProfile(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    try {
      await updateProfile({
        phoneNumberId: conn?.tokenAPI,
        wabaVersion: conn?.wabaVersion || "v19.0",
        wabaToken: conn?.bmToken,
        profileData,
      });
      toast.success(t("profileSaved"));
      setShowProfileModal(false);
    } catch (err: any) {
      toast.error(t("errorSaveProfile"));
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadWABADataFn() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    setLoadingWabaData(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    if (!conn?.wabaId || !conn?.bmToken) {
      toast.error(t("noWabaIdOrToken"));
      setLoadingWabaData(false);
      return;
    }
    try {
      const { data } = await getWABAData({
        wabaId: conn.wabaId,
        businessToken: conn.bmToken,
        apiVersion: conn.wabaVersion || "v24.0",
      });
      setWabaAdminData(data);
    } catch (err: any) {
      toast.error(t("errorLoadWabaData"));
    } finally {
      setLoadingWabaData(false);
    }
  }

  async function loadAnalytics() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    if (!conn?.wabaId || !conn?.bmToken) { toast.error(t("noWabaIdOrTokenShort")); return; }
    setLoadingAnalytics(true);
    try {
      const startTs = Math.floor(new Date(analyticsStart).getTime() / 1000);
      // `end` da Meta é exclusivo no fim do dia: new Date("YYYY-MM-DD") = meia-noite UTC, então
      // mandar o end "cru" descartava o dia final inteiro (ex.: end=03/06 00:00 UTC cortava todo o 03/06).
      // Somamos 1 dia pra incluir o último dia completo e bater com o "últimos N dias" do painel da Meta.
      const endDate = new Date(analyticsEnd);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const endTs = Math.floor(endDate.getTime() / 1000);
      const { data } = await getWABAAnalytics({
        wabaId: conn.wabaId,
        businessToken: conn.bmToken,
        apiVersion: conn.wabaVersion || "v24.0",
        start: startTs,
        end: endTs,
        granularity: "DAILY",
        conversationAnalytics: true,
        pricingAnalytics: true,
      });
      setAnalyticsData(data);
    } catch (err: any) {
      // Repassa mensagem do backend (já contém error_user_msg do Meta) ou cai no i18n.
      toast.error(formatBulkSendError(err) || t("errorLoadAnalytics"));
    } finally {
      setLoadingAnalytics(false);
    }
  }

  // Estimativa local de custo das mensagens enviadas (fromMe) do canal — conta no
  // nosso banco, sem chamar a Graph API; a tarifa é aplicada aqui no front.
  async function loadSentCost() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    if (!sentCostStart || !sentCostEnd || sentCostStart > sentCostEnd) { toast.error(t("sentCostInvalidRange")); return; }
    setLoadingSentCost(true);
    try {
      const { data } = await getWABASentMessagesCost({
        whatsappId: Number(selectedPhone),
        startDate: sentCostStart,
        endDate: sentCostEnd,
      });
      setSentCostData(data);
    } catch (err: any) {
      toast.error(formatBulkSendError(err) || t("sentCostLoadError"));
    } finally {
      setLoadingSentCost(false);
    }
  }

  async function loadAnalyticsTemplateList() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & { wabaId?: string };
    if (!conn?.wabaId) { toast.error(t("noWabaId")); return; }
    setLoadingAnalyticsTemplates(true);
    try {
      const tplRes = await listTemplatesByWhatsappId(conn.id as number);
      const raw = tplRes.data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data || []);
      setAnalyticsTemplateList(list);
      setSelectedAnalyticsTemplateIds([]);
      if (list.length === 0) toast.info(t("noTemplatesInConn"));
    } catch (err: any) {
      toast.error(t("errorLoadTemplateList"));
    } finally {
      setLoadingAnalyticsTemplates(false);
    }
  }

  function toggleAnalyticsTemplate(id: string) {
    setSelectedAnalyticsTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 10)
    );
  }

  async function loadTemplateAnalytics() {
    if (!selectedPhone) { toast.error(t("errorSelectConn")); return; }
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      wabaId?: string; wabaVersion?: string; bmToken?: string;
    };
    if (!conn?.wabaId || !conn?.bmToken) { toast.error(t("noWabaIdOrTokenShort")); return; }
    if (selectedAnalyticsTemplateIds.length === 0) { toast.error(t("selectAtLeastOneTemplate")); return; }
    setLoadingTemplateAnalytics(true);
    try {
      const { data } = await getWABATemplateAnalytics({
        wabaId: conn.wabaId,
        businessToken: conn.bmToken,
        apiVersion: conn.wabaVersion || "v19.0",
        start: templateAnalyticsStart,
        end: templateAnalyticsEnd,
        templateIds: selectedAnalyticsTemplateIds,
      });
      setTemplateAnalyticsData(data);
    } catch (err: any) {
      // Surface Meta's error_user_msg (e.g. "Os insights sobre o modelo
      // não foram habilitados para esta conta do WhatsApp Business.")
      // em vez do toast genérico.
      toast.error(formatBulkSendError(err) || t("errorLoadTemplateAnalytics"));
    } finally {
      setLoadingTemplateAnalytics(false);
    }
  }

  async function loadLimitsInfo() {
    setLoadingLimits(true);
    try {
      const { data } = await getWABALimitsInfo();
      setLimitsInfo(data);
    } catch {
      // silent
    } finally {
      setLoadingLimits(false);
    }
  }

  async function requestVerifCode() {
    setLoadingCodeRequest(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaVersion?: string; bmToken?: string;
    };
    try {
      await requestVerificationCode({
        phoneNumberId: conn?.tokenAPI,
        wabaVersion: conn?.wabaVersion || "v19.0",
        wabaToken: conn?.bmToken,
        codeMethod: verificationData.codeMethod,
        locale: verificationData.locale,
      });
      toast.success(t("codeSent"));
      setVerificationStep("verify");
    } catch (err: any) {
      toast.error(formatBulkSendError(err) || t("errorRequestCode"));
    } finally {
      setLoadingCodeRequest(false);
    }
  }

  async function submitVerifyCode() {
    setLoadingVerification(true);
    const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as Whatsapp & {
      tokenAPI?: string; wabaVersion?: string; bmToken?: string;
    };
    try {
      await verifyCode({
        phoneNumberId: conn?.tokenAPI,
        wabaVersion: conn?.wabaVersion || "v19.0",
        wabaToken: conn?.bmToken,
        code: verificationData.code,
      });
      toast.success(t("codeVerified"));
      setShowVerificationModal(false);
    } catch (err: any) {
      toast.error(formatBulkSendError(err) || t("errorVerifyCode"));
    } finally {
      setLoadingVerification(false);
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const wabaConnections = (whatsapps as (typeof whatsapps[0] & { type?: string })[]).filter(
    (w) => w.type === "waba" && !w.isDeleted
  );
  const instagramConnections = (whatsapps as any[]).filter(
    (w) => w.type === "instagram" && w.status === "CONNECTED" && !w.isDeleted
  );
  const facebookConnections = (whatsapps as any[]).filter(
    (w) => w.type === "messenger" && (w as any).fbPageId && !w.isDeleted
  );
  const filteredTemplates = filterTemplates();

  // ─── Facebook templates ────────────────────────────────────────────────────
  const loadFbTemplates = useCallback(async (channelId: number) => {
    setFbTplLoading(true);
    try {
      const { data } = await listMessengerTemplates(channelId);
      setFbTplList((data?.data || []) as typeof fbTplList);
    } catch {
      toast.error(t("fbTpl.loadError"));
      setFbTplList([]);
    } finally {
      setFbTplLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (fbTplChannelId) {
      void loadFbTemplates(fbTplChannelId);
    } else {
      setFbTplList([]);
    }
  }, [fbTplChannelId, loadFbTemplates]);

  // Monta o array de components (HEADER + BODY + BUTTONS) a partir do form estruturado.
  const buildFbTplComponents = (): any[] => {
    const components: any[] = [];
    if (fbTplForm.headerType === "text" && fbTplForm.headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: fbTplForm.headerText.trim() });
    } else if (
      (fbTplForm.headerType === "image" || fbTplForm.headerType === "video" || fbTplForm.headerType === "document") &&
      fbTplForm.headerMediaUrl.trim()
    ) {
      components.push({
        type: "HEADER",
        format: fbTplForm.headerType.toUpperCase(),
        example: { header_handle: [fbTplForm.headerMediaUrl.trim()] },
      });
    }
    components.push({
      type: "BODY",
      text: fbTplForm.body,
      ...(fbTplFormVarCount > 0 ? { example: { body_text: [fbTplForm.examples.slice(0, fbTplFormVarCount)] } } : {}),
    });
    const validButtons = fbTplForm.buttons.filter((b) =>
      b.text.trim() &&
      (b.type === "QUICK_REPLY" || (b.type === "URL" && b.url.trim()) || (b.type === "PHONE_NUMBER" && b.phone_number.trim()))
    );
    if (validButtons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: validButtons.map((b) => {
          if (b.type === "URL") return { type: "URL", text: b.text.trim(), url: b.url.trim() };
          if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone_number.trim() };
          return { type: "QUICK_REPLY", text: b.text.trim() };
        }),
      });
    }
    return components;
  };

  const handleCreateFbTemplate = async () => {
    if (fbTplCreating) return;
    if (!fbTplChannelId) { toast.warning(t("fbTpl.selectChannel")); return; }
    if (!fbTplForm.editingId && !fbTplForm.name.trim()) { toast.warning(t("fbTpl.nameRequired")); return; }
    if (!fbTplForm.body.trim()) { toast.warning(t("fbTpl.bodyRequired")); return; }
    if (fbTplForm.headerType === "text" && !fbTplForm.headerText.trim()) { toast.warning(t("fbTpl.headerTextRequired")); return; }
    if ((fbTplForm.headerType === "image" || fbTplForm.headerType === "video" || fbTplForm.headerType === "document") && !fbTplForm.headerMediaUrl.trim()) {
      toast.warning(t("fbTpl.headerMediaRequired")); return;
    }
    if (fbTplFormVarCount > 0) {
      for (let i = 0; i < fbTplFormVarCount; i++) {
        if (!fbTplForm.examples[i]?.trim()) { toast.warning(t("fbTpl.fillExamples")); return; }
      }
    }
    for (const b of fbTplForm.buttons) {
      if (!b.text.trim()) { toast.warning(t("fbTpl.buttonTextRequired")); return; }
      if (b.type === "URL" && !b.url.trim()) { toast.warning(t("fbTpl.buttonUrlRequired")); return; }
      if (b.type === "PHONE_NUMBER" && !b.phone_number.trim()) { toast.warning(t("fbTpl.buttonPhoneRequired")); return; }
    }
    const channel = facebookConnections.find((w: any) => w.id === fbTplChannelId);
    if (!channel?.fbPageId) { toast.warning(t("fbTpl.pageMissing")); return; }
    setFbTplCreating(true);
    try {
      const components = buildFbTplComponents();
      if (fbTplForm.editingId) {
        await editMessengerUtilityTemplate({
          whatsappId: fbTplChannelId,
          templateId: fbTplForm.editingId,
          template: {
            name: fbTplForm.name,
            language: fbTplForm.language,
            category: "UTILITY",
            components,
          },
        });
        toast.success(t("fbTpl.editedOk"));
      } else {
        await createMessengerUtilityTemplate({
          whatsappId: fbTplChannelId,
          pageId: channel.fbPageId,
          template: {
            name: fbTplForm.name,
            language: fbTplForm.language,
            category: "UTILITY",
            components,
          },
        });
        toast.success(t("fbTpl.createdOk"));
      }
      setFbTplForm({ ...fbTplEmptyForm });
      setFbTplSubTab("list");
      void loadFbTemplates(fbTplChannelId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || err?.message || (fbTplForm.editingId ? t("fbTpl.editError") : t("fbTpl.createError")));
    } finally {
      setFbTplCreating(false);
    }
  };

  const handleDeleteFbTemplate = async (name: string) => {
    if (!fbTplChannelId) return;
    setFbTplDeletingName(name);
    try {
      await deleteMessengerTemplate(fbTplChannelId, name);
      toast.success(t("fbTpl.deleteOk"));
      setFbTplDeleteConfirm(null);
      void loadFbTemplates(fbTplChannelId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t("fbTpl.deleteError"));
    } finally {
      setFbTplDeletingName(null);
    }
  };

  // Converte os components vindos da Meta de volta para o form estruturado (header/body/buttons).
  const parseFbTplToForm = (tpl: typeof fbTplList[number], editing: boolean): typeof fbTplForm => {
    const comps = tpl.components || [];
    const headerComp: any = comps.find((c: any) => c.type === "HEADER");
    const bodyComp: any = comps.find((c: any) => c.type === "BODY");
    const buttonsComp: any = comps.find((c: any) => c.type === "BUTTONS");

    const body = bodyComp?.text || "";
    const exampleArr: string[] = (() => {
      const ex = bodyComp?.example?.body_text;
      return Array.isArray(ex) && Array.isArray(ex[0]) ? (ex[0] as string[]) : [];
    })();

    let headerType: typeof fbTplForm.headerType = "none";
    let headerText = "";
    let headerMediaUrl = "";
    if (headerComp) {
      const fmt = String(headerComp.format || "TEXT").toUpperCase();
      if (fmt === "TEXT") {
        headerType = "text";
        headerText = headerComp.text || "";
      } else if (fmt === "IMAGE" || fmt === "VIDEO" || fmt === "DOCUMENT") {
        headerType = fmt.toLowerCase() as typeof fbTplForm.headerType;
        headerMediaUrl =
          headerComp.example?.header_handle?.[0] ||
          (typeof headerComp.example === "string" ? headerComp.example : "") ||
          "";
      }
    }

    const buttons = (buttonsComp?.buttons || [])
      .map((b: any) => ({
        type: String(b.type || "QUICK_REPLY").toUpperCase() as "QUICK_REPLY" | "URL" | "PHONE_NUMBER",
        text: b.text || "",
        url: b.url || "",
        phone_number: b.phone_number || "",
      }))
      .filter((b: any) => b.type === "QUICK_REPLY" || b.type === "URL" || b.type === "PHONE_NUMBER");

    return {
      name: editing ? tpl.name : tpl.name + "_v2",
      language: tpl.language || "pt_BR",
      headerType,
      headerText,
      headerMediaUrl,
      body,
      examples: exampleArr,
      buttons,
      editingId: editing ? tpl.id : null,
    };
  };

  const handleDuplicateFbTemplate = (tpl: typeof fbTplList[number]) => {
    setFbTplForm(parseFbTplToForm(tpl, false));
    setFbTplSubTab("create");
    toast.info(t("fbTpl.duplicateHint"));
  };

  const handleEditFbTemplate = (tpl: typeof fbTplList[number]) => {
    setFbTplForm(parseFbTplToForm(tpl, true));
    setFbTplSubTab("create");
    setFbTplDetail(null);
    toast.info(t("fbTpl.editHint"));
  };

  const handleNewFbTemplate = () => {
    setFbTplForm({ ...fbTplEmptyForm });
    setFbTplSubTab("create");
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas META"
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contas-meta">{t("tabContasMeta")}</TabsTrigger>
          <TabsTrigger value="config">{t("tabConfig")}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabTemplates")}</TabsTrigger>
        </TabsList>

        {/* ═══════════════ TAB: CONTAS META ═══════════════ */}
        <TabsContent value="contas-meta" className="space-y-4">
          <Tabs value={facebookSubTab} onValueChange={setFacebookSubTab}>
            <div className="overflow-x-auto scrollbar-none -mx-3 md:mx-0 px-3 md:px-0 mb-1">
              <TabsList className="flex h-auto gap-1 w-max">
                <TabsTrigger value="login" className="shrink-0 text-xs md:text-sm">
                  <Facebook className="w-3.5 h-3.5 mr-1 md:w-4 md:h-4" /> {t("subTabLogin")}
                </TabsTrigger>
                <TabsTrigger value="phones" className="shrink-0 text-xs md:text-sm">
                  <MessageCircle className="w-3.5 h-3.5 mr-1 md:w-4 md:h-4" /> {t("subTabPhones")}
                </TabsTrigger>
                <TabsTrigger value="instagram" className="shrink-0 text-xs md:text-sm">
                  <Camera className="w-3.5 h-3.5 mr-1 md:w-4 md:h-4" /> {t("subTabInstagram")}
                </TabsTrigger>
                <TabsTrigger value="facebook" className="shrink-0 text-xs md:text-sm">
                  <Facebook className="w-3.5 h-3.5 mr-1 md:w-4 md:h-4" /> {t("subTabFacebook")}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Login Sub-tab ── */}
            <TabsContent value="login" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" /> {t("appMetaTitle")}
                  </CardTitle>
                  <CardDescription>{t("appMetaDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("labelApp")}</Label>
                      {loadingAppWabas ? (
                        <div className="text-sm text-muted-foreground">{t("loadText")}</div>
                      ) : (
                        <Select value={selectedAppWaba || ""} onValueChange={handleAppWabaChange}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("selectApp")} />
                          </SelectTrigger>
                          <SelectContent>
                            {PROXY_URL && (
                              <SelectItem value="__PROXY__">
                                {t("oauthProxyLabel")} ({PROXY_URL.replace(/^https?:\/\//, "")})
                              </SelectItem>
                            )}
                            {appWabaOptions.map((a) => (
                              <SelectItem key={String(a.id)} value={String(a.id)}>
                                {(a as any).description || a.appId || `App #${a.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {selectedAppWaba === "__PROXY__" && (
                        <p className="text-xs text-muted-foreground mt-1">{t("oauthProxyInfo")}</p>
                      )}
                    </div>
                    {selectedAppWaba !== "__PROXY__" && (
                      <>
                        <div className="space-y-2">
                          <Label>App ID</Label>
                          <Input value={facebookAppId} readOnly className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("labelApiVersion")}</Label>
                          <Input value={facebookApiVersion} readOnly className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("labelConfigId")}</Label>
                          <Input value={embeddedSignupConfigId} readOnly className="bg-muted" />
                        </div>
                      </>
                    )}
                  </div>

                  <Separator />

                  {selectedAppWaba !== "__PROXY__" && (
                    <div className="flex flex-wrap gap-2">
                      {facebookStatus?.status === "connected" ? (
                        <Button variant="destructive" onClick={logoutFacebook} disabled={!facebookSDKLoaded}>
                          <LogOut className="w-4 h-4 mr-2" /> {t("logoutFacebook")}
                        </Button>
                      ) : (
                        <Button onClick={loginFacebook} disabled={loadingFacebook || !facebookSDKLoaded}>
                          <LogIn className="w-4 h-4 mr-2" />
                          {loadingFacebook ? t("loadText") : t("loginFacebook")}
                        </Button>
                      )}
                      <Button variant="outline" onClick={checkFacebookStatus} disabled={!facebookSDKLoaded}>
                        <RefreshCw className="w-4 h-4 mr-2" /> {t("checkStatus")}
                      </Button>
                    </div>
                  )}

                  {selectedAppWaba && (() => {
                    const usingProxy = selectedAppWaba === "__PROXY__";
                    const selectedApp = usingProxy ? null : appWabaOptions.find((a) => String(a.id) === selectedAppWaba);
                    const oauthTypes = [
                      ...(usingProxy || embeddedSignupConfigId ? [{ key: "waba_oauth", label: t("whatsappOAuth"), icon: <MessageCircle className="w-4 h-4" />, action: launchEmbeddedSignup }] : []),
                      ...(usingProxy || (selectedApp as any)?.appInstagramId ? [{ key: "instagram_oauth", label: t("instagramOAuth"), icon: <Instagram className="w-4 h-4" />, action: loginInstagramOAuth }] : []),
                      ...(usingProxy || (selectedApp as any)?.appId ? [{ key: "facebook_oauth", label: t("facebookOAuth"), icon: <Facebook className="w-4 h-4" />, action: loginFacebookOAuth }] : []),
                    ];
                    if (!oauthTypes.length) return null;
                    return (
                      <div className="space-y-1.5 rounded-lg border p-3 bg-muted/30">
                        {oauthTypes.map((ot) => (
                          <div key={ot.key} className="flex items-center justify-between rounded-md px-2 py-1.5">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {ot.icon}
                              {ot.label}
                            </div>
                            <Button size="sm" variant="outline" onClick={ot.action}>
                              {ot.label}
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {!facebookSDKLoaded && facebookAppId && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                      <Info className="w-4 h-4 shrink-0" /> {t("loadingSdk")}
                    </div>
                  )}

                  {facebookError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {facebookError}
                    </div>
                  )}

                  {facebookStatus && (
                    <div className={`flex items-center gap-2 p-3 rounded border text-sm ${facebookStatus.status === "connected" ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                      {facebookStatus.status === "connected" ? (
                        <CheckCircle className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      {t("labelStatus")}: <strong>{facebookStatus.status}</strong>
                    </div>
                  )}

                  {facebookUserInfo && (
                    <Card className="bg-muted/30">
                      <CardContent className="pt-4 space-y-2">
                        <p className="text-sm font-medium">{facebookUserInfo.name}</p>
                        {facebookUserInfo.email && <p className="text-xs text-muted-foreground">{facebookUserInfo.email}</p>}
                        {facebookStatus?.authResponse?.accessToken && (
                          <div className="space-y-1">
                            <Label className="text-xs">Access Token</Label>
                            <div className="flex gap-2">
                              <Input
                                value={truncateToken(facebookStatus.authResponse.accessToken)}
                                readOnly
                                className="bg-muted text-xs font-mono"
                              />
                              <Button variant="outline" size="icon" onClick={() => copyToClipboard(facebookStatus.authResponse.accessToken)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            {facebookStatus.authResponse.expiresIn && (
                              <p className="text-xs text-muted-foreground">
                                {t("labelExpires")}: {formatExpiresIn(facebookStatus.authResponse.expiresIn)}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>

              {/* WABA Management */}
              {facebookStatus?.status === "connected" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" /> {t("manageWabas")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={loadWABAs} disabled={loadingWABAs}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${loadingWABAs ? "animate-spin" : ""}`} />
                      {loadingWABAs ? t("loadText") : t("loadWabas")}
                    </Button>

                    {wabasList.length > 0 && (
                      <div className="space-y-3">
                        {wabasList.map((waba) => (
                          <Card key={waba.id} className="border">
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <CardTitle className="text-base">{waba.name}</CardTitle>
                                  <p className="text-xs text-muted-foreground">ID: {waba.id} | Business: {waba.businessName}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadPhonesForWABA(waba.id)}
                                  disabled={loadingPhones === waba.id}
                                >
                                  <Phone className={`w-3 h-3 mr-1 ${loadingPhones === waba.id ? "animate-spin" : ""}`} />
                                  {waba.phonesLoaded ? t("checkStatus") : t("checkPhone")}
                                </Button>
                              </div>
                            </CardHeader>
                            {waba.phonesLoaded && waba.phones && (
                              <CardContent>
                                {waba.phones.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">{t("noPhones")}</p>
                                ) : (
                                  <div className="space-y-2">
                                    {waba.phones.map((phone: any) => {
                                      const key = `${waba.id}-${phone.id}`;
                                      const alreadyExists = wabaConnections.some(
                                        (w: any) => w.wabaId === waba.id || String(w.id) === String(phone.id)
                                      );
                                      const phoneStatusUpper = String(phone.status || "").toUpperCase();
                                      const cvsUpper = String(phone.code_verification_status || "").toUpperCase();
                                      const phonePinPending =
                                        phoneStatusUpper === "PENDING" ||
                                        cvsUpper === "NOT_VERIFIED" ||
                                        cvsUpper === "EXPIRED";
                                      return (
                                        <div key={phone.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-sm font-medium">{phone.display_phone_number}</p>
                                              {phonePinPending && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
                                                  title={tSessoes("pinPendingTooltipBody")}
                                                >
                                                  {tSessoes("pinPendingBadge")}
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{phone.verified_name} · {phone.status}</p>
                                          </div>
                                          <div className="flex gap-2">
                                            {alreadyExists ? (
                                              <Badge variant="outline" className="text-green-600 border-green-300">
                                                <CheckCircle className="w-3 h-3 mr-1" /> {t("channelCreated")}
                                              </Badge>
                                            ) : (
                                              <Button
                                                size="sm"
                                                onClick={() => createWABAChannel(waba, phone)}
                                                disabled={creatingChannels[key]}
                                              >
                                                <Plus className="w-3 h-3 mr-1" />
                                                {creatingChannels[key] ? t("loadText") : t("createChannel")}
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </CardContent>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Phones Sub-tab ── */}
            <TabsContent value="phones" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" /> {t("wabaPhonesMgmtTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("labelWabaConn")}</Label>
                    <Select value={selectedPhone ? String(selectedPhone) : ""} onValueChange={(v) => { setSelectedPhone(Number(v)); setPhoneInfo(null); setWabaAdminData(null); setCurrentProfile(null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectConnectionPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {wabaConnections.map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name} {w.status ? `(${w.status})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action bar: ação primária em destaque + 3 dropdowns agrupados por contexto */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={checkPhone} disabled={loadingPhoneCheck}>
                      <Phone className="w-4 h-4 mr-2" />
                      {loadingPhoneCheck ? t("loadText") : t("checkPhone")}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className={phoneNeedsManualReg === true ? "border-amber-400 dark:border-amber-700" : undefined}>
                          <Phone className="w-4 h-4 mr-2" />
                          {t("phoneGroupLabel")}
                          {phoneNeedsManualReg === true && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
                            >
                              {tSessoes("pinPendingBadge")}
                            </Badge>
                          )}
                          <ChevronDown className="w-3 h-3 ml-1.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={openPhoneRegistrationModal}>
                          <ShieldCheck className="w-4 h-4 mr-2" /> {t("registerPhone")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { if (!selectedPhone) { toast.error(t("errorSelectConn")); return; } setVerificationData(v => ({ ...v, phoneNumberId: String(selectedPhone) })); setVerificationStep("request"); setShowVerificationModal(true); }}>
                          <CheckCircle className="w-4 h-4 mr-2" /> {t("verifyCode")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="outline" onClick={openWebhookModal} title={tSessoes("revalidateWebhookWabaBothTooltip")}>
                      <Webhook className="w-4 h-4 mr-2" />
                      {t("configWebhook")}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                          <Settings className="w-4 h-4 mr-2" />
                          {t("profileSipGroupLabel")}
                          <ChevronDown className="w-3 h-3 ml-1.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={openProfileModal} disabled={loadingProfile}>
                          <Camera className="w-4 h-4 mr-2" />
                          {loadingProfile ? t("loadText") : t("updateProfileBtn")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={openSIPModal}>
                          <Settings className="w-4 h-4 mr-2" /> {t("configSIP")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleEnableWebRTCCalling} disabled={loadingWebRTC}>
                          <PhoneCall className="w-4 h-4 mr-2" /> {loadingWebRTC ? t("loadText") : t("enableWebRTCCalling")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Tabs defaultValue="operation" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="operation">{t("subTabOperation")}</TabsTrigger>
                      <TabsTrigger value="usage">{t("subTabUsage")}</TabsTrigger>
                      <TabsTrigger value="cost">{t("subTabCost")}</TabsTrigger>
                    </TabsList>

                  <TabsContent value="operation" className="space-y-4">
                  {/* Collapsibles secundários (Info Conexão / Dicas / Dados WABA) */}
                  <div className="space-y-2">
                    {selectedPhone && (() => {
                      const conn = whatsapps.find((w) => w.id === Number(selectedPhone)) as any;
                      return conn ? (
                        <Collapsible defaultOpen>
                          <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full justify-between">
                              <span className="flex items-center gap-2"><Info className="w-4 h-4" /> {t("connInfoTitle")}</span>
                              <ChevronDown className="w-4 h-4 opacity-60" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-2">
                            <Card>
                              <CardContent className="space-y-2 text-sm pt-4">
                                <WabaSendHealthNotice whatsappId={conn.id} variant="panel" />
                                <div className="flex justify-between"><span className="text-muted-foreground shrink-0">{t("labelName")}:</span><span className="ml-2 truncate">{conn.name}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground shrink-0">{t("labelStatus")}:</span><Badge variant="outline">{conn.status}</Badge></div>
                                {conn.wabaId && <div className="flex flex-col gap-0.5"><span className="text-muted-foreground text-xs">WABA ID:</span><span className="font-mono text-xs break-all">{conn.wabaId}</span></div>}
                                {conn.wabaVersion && <div className="flex justify-between"><span className="text-muted-foreground shrink-0">{t("labelApiVersion")}:</span><span>{conn.wabaVersion}</span></div>}
                                <div className="flex justify-between items-center pt-2 border-t">
                                  <span className="text-muted-foreground text-xs">{tSessoes("webhookOriginOwn")}/{tSessoes("webhookOriginZdg")}:</span>
                                  <Badge variant="secondary" className="text-xs">{conn.webhookOrigin === "zdg_oauth" ? tSessoes("webhookOriginZdg") : tSessoes("webhookOriginOwn")}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0 truncate" title={tSessoes("revalidateWebhookWabaBothTooltip")} onClick={() => openMetaWebhookPopup("waba", conn.id)}>
                                    <Webhook className="w-3 h-3 mr-1 shrink-0" /> <span className="truncate">{tSessoes("revalidateWebhookWaba")}</span>
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => openChangeOriginDialog(conn)}>
                                    <Settings className="w-3 h-3 mr-1" /> {tSessoes("changeWebhookOrigin")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => setDiagnoseTarget(conn)}>
                                    <Stethoscope className="w-3 h-3 mr-1" /> {tSessoes("diagnoseConnection")}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null;
                    })()}

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-2"><Info className="w-4 h-4" /> {t("tipsTitle")}</span>
                          <ChevronDown className="w-4 h-4 opacity-60" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <Card className="bg-blue-50 border-blue-200">
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-2">
                              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <div className="text-sm text-blue-800 space-y-1">
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                  <li>{t("tip1")}</li>
                                  <li>{t("tip2")}</li>
                                  <li>{t("tip3")}</li>
                                  <li>{t("tip4")}</li>
                                </ul>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-2"><BarChart2 className="w-4 h-4" /> {t("wabaDataTitle")}</span>
                          <ChevronDown className="w-4 h-4 opacity-60" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-end">
                              <Button size="sm" variant="outline" onClick={loadWABADataFn} disabled={loadingWabaData}>
                                <RefreshCw className={`w-3 h-3 mr-1 ${loadingWabaData ? "animate-spin" : ""}`} />
                                {loadingWabaData ? "..." : t("loadWabas")}
                              </Button>
                            </div>
                          </CardHeader>
                          {wabaAdminData && (
                            <CardContent className="space-y-2 text-sm">
                              {wabaAdminData.name && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelName")}:</span><span className="font-medium truncate">{wabaAdminData.name}</span></div>}
                              {wabaAdminData.currency && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelCurrency")}:</span><span>{wabaAdminData.currency}</span></div>}
                              {wabaAdminData.country && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelCountry")}:</span><span>{wabaAdminData.country}</span></div>}
                              {wabaAdminData.business_verification_status && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground shrink-0">{t("labelVerification")}:</span>
                                  <Badge variant={wabaAdminData.business_verification_status === "verified" ? "default" : "secondary"}>
                                    {wabaAdminData.business_verification_status}
                                  </Badge>
                                </div>
                              )}
                              {wabaAdminData.owner_business_info?.name && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelBusiness")}:</span><span className="truncate">{wabaAdminData.owner_business_info.name}</span></div>}
                            </CardContent>
                          )}
                        </Card>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  {/* Grid principal: Status do Telefone + Mockup (sempre visíveis) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      {phoneInfo && (
                        <Card>
                          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> {t("phoneStatusTitle")}</CardTitle></CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {phoneInfo.display_phone_number && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelNumber")}:</span><span className="font-medium">{phoneInfo.display_phone_number}</span></div>}
                            {phoneInfo.verified_name && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelVerifiedName")}:</span><span>{phoneInfo.verified_name}</span></div>}
                            {phoneInfo.platform_type && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelPlatform")}:</span><Badge variant="outline">{phoneInfo.platform_type}</Badge></div>}
                            {phoneInfo.quality_rating && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelQuality")}:</span><Badge variant={phoneInfo.quality_rating === "GREEN" ? "default" : phoneInfo.quality_rating === "YELLOW" ? "secondary" : "destructive"}>{phoneInfo.quality_rating}</Badge></div>}
                            {phoneInfo.status && (() => {
                              const sev = classifyWabaPhoneStatus(phoneInfo.status);
                              const key = wabaPhoneStatusI18nKey(phoneInfo.status);
                              const label = key === "unknown" ? phoneInfo.status : tHealth(`status.${key}`);
                              const isNeutral = sev === "ok" || sev === "other";
                              return (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground shrink-0">{tHealth("phoneStatusLabel")}:</span>
                                  {isNeutral
                                    ? <Badge variant="outline">{label}</Badge>
                                    : <Badge className={wabaPhoneStatusBadgeClasses(phoneInfo.status)}>{label}</Badge>}
                                </div>
                              );
                            })()}
                            {phoneInfo.code_verification_status && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelVerification")}:</span><Badge variant={phoneInfo.code_verification_status === "VERIFIED" ? "default" : "secondary"}>{phoneInfo.code_verification_status}</Badge></div>}
                            {phoneInfo.id && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">ID:</span><span className="font-mono text-xs break-all text-right">{phoneInfo.id}</span></div>}
                            {phoneInfo.webhook_configuration && (phoneInfo.webhook_configuration.phone_number || phoneInfo.webhook_configuration.application) && (
                              <div className="pt-2 mt-2 border-t space-y-1.5">
                                <div className="text-xs font-medium text-muted-foreground">{t("labelWebhookConfig")}</div>
                                {phoneInfo.webhook_configuration.phone_number && (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-muted-foreground text-xs">{t("labelWebhookPhoneNumber")}:</span>
                                    <span className="font-mono text-xs break-all">{phoneInfo.webhook_configuration.phone_number}</span>
                                  </div>
                                )}
                                {phoneInfo.webhook_configuration.application && (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-muted-foreground text-xs">{t("labelWebhookApplication")}:</span>
                                    <span className="font-mono text-xs break-all">{phoneInfo.webhook_configuration.application}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    <div className="space-y-4">
                      {(wabaAdminData || currentProfile || phoneInfo) && (
                        <Card>
                          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> {t("profilePreviewTitle")}</CardTitle></CardHeader>
                          <CardContent className="py-4">
                            <WhatsAppBusinessMockup
                              data={{
                                name: phoneInfo?.verified_name || wabaAdminData?.name,
                                phone: phoneInfo?.display_phone_number,
                                about: currentProfile?.about,
                                description: currentProfile?.description,
                                email: currentProfile?.email,
                                vertical: currentProfile?.vertical,
                                address: currentProfile?.address,
                                websites: currentProfile?.websites,
                                currency: wabaAdminData?.currency,
                                country: wabaAdminData?.country,
                                id: wabaAdminData?.id,
                                verified: phoneInfo?.code_verification_status === "VERIFIED",
                              }}
                            />
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                  </TabsContent>

                  <TabsContent value="usage" className="space-y-4">

                  {/* ── Uso e Faturamento ── */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart2 className="w-4 h-4" /> {t("billingTitle")}
                        </CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input type="date" value={analyticsStart} onChange={(e) => setAnalyticsStart(e.target.value)} className="h-8 text-xs w-36" />
                          <span className="text-xs text-muted-foreground">{t("untilText")}</span>
                          <Input type="date" value={analyticsEnd} onChange={(e) => setAnalyticsEnd(e.target.value)} className="h-8 text-xs w-36" />
                          <Button size="sm" variant="outline" onClick={loadAnalytics} disabled={loadingAnalytics}>
                            <RefreshCw className={`w-3 h-3 mr-1 ${loadingAnalytics ? "animate-spin" : ""}`} />
                            {loadingAnalytics ? "..." : t("loadWabas")}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {analyticsData && (() => {
                      const flattenDataPoints = (payload: any): any[] => {
                        if (!payload) return [];
                        if (Array.isArray(payload.data)) {
                          return payload.data.flatMap((item: any) => Array.isArray(item?.data_points) ? item.data_points : []);
                        }
                        if (Array.isArray(payload.data_points)) return payload.data_points;
                        return [];
                      };
                      const fmtDate = (ts: any) => {
                        const n = Number(ts);
                        return n ? formatDate(new Date(n * 1000)) : "—";
                      };
                      const fmtCost = (v: any) => {
                        const n = Number(v);
                        if (!isFinite(n)) return "—";
                        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
                      };
                      const convPoints = flattenDataPoints(analyticsData.conversation_analytics)
                        .slice()
                        .sort((a: any, b: any) => (Number(b.start) || 0) - (Number(a.start) || 0));
                      const pricingPoints = flattenDataPoints(analyticsData.pricing_analytics)
                        .slice()
                        .sort((a: any, b: any) => (Number(b.start) || 0) - (Number(a.start) || 0));
                      const pricingTotals = pricingPoints.reduce(
                        (acc: { volume: number; cost: number; hasCost: boolean }, p: any) => {
                          acc.volume += Number(p.volume) || 0;
                          const c = Number(p.cost);
                          if (isFinite(c)) { acc.cost += c; acc.hasCost = true; }
                          return acc;
                        },
                        { volume: 0, cost: 0, hasCost: false }
                      );
                      return (
                        <CardContent className="space-y-4">
                          {convPoints.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t("conversationsByType")}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead><tr className="bg-muted"><th className="p-2 border text-left">{t("labelPeriod")}</th><th className="p-2 border text-left">{t("labelType")}</th><th className="p-2 border text-right">{t("labelConversations")}</th><th className="p-2 border text-right">{t("labelCost")}</th></tr></thead>
                                  <tbody>
                                    {convPoints.map((p: any, i: number) => (
                                      <tr key={i} className="border-b hover:bg-muted/50">
                                        <td className="p-2 border">{fmtDate(p.start)} – {fmtDate(p.end)}</td>
                                        <td className="p-2 border"><Badge variant="outline" className="text-xs">{p.conversation_category || p.conversation_type || p.type || "—"}</Badge></td>
                                        <td className="p-2 border text-right font-medium">{p.conversation ?? p.volume ?? 0}</td>
                                        <td className="p-2 border text-right">{fmtCost(p.cost)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {pricingPoints.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t("pricesByCategory")}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead><tr className="bg-muted"><th className="p-2 border text-left">{t("labelPeriod")}</th><th className="p-2 border text-left">{t("labelCountry")}</th><th className="p-2 border text-left">{t("colCategory")}</th><th className="p-2 border text-right">{t("labelVolume")}</th><th className="p-2 border text-right">{t("labelCost")}</th></tr></thead>
                                  <tbody>
                                    {pricingPoints.map((p: any, i: number) => (
                                      <tr key={i} className="border-b hover:bg-muted/50">
                                        <td className="p-2 border">{fmtDate(p.start)} – {fmtDate(p.end)}</td>
                                        <td className="p-2 border">{p.country || "—"}</td>
                                        <td className="p-2 border"><Badge variant="outline" className="text-xs">{p.pricing_category || p.category || p.pricing_type || "—"}</Badge></td>
                                        <td className="p-2 border text-right font-medium">{p.volume ?? 0}</td>
                                        <td className="p-2 border text-right">{fmtCost(p.cost)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-muted/60 font-semibold">
                                      <td className="p-2 border" colSpan={3}>{t("colTotal")}</td>
                                      <td className="p-2 border text-right">{pricingTotals.volume}</td>
                                      <td className="p-2 border text-right">{pricingTotals.hasCost ? fmtCost(pricingTotals.cost) : "—"}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground mt-2">{t("pricingVolumeHint")}</p>
                            </div>
                          )}
                          {convPoints.length === 0 && pricingPoints.length === 0 && (
                            <p className="text-sm text-muted-foreground">{t("noBillingData")}</p>
                          )}
                        </CardContent>
                      );
                    })()}
                  </Card>

                  {/* ── Métricas de Templates ── */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart2 className="w-4 h-4" /> {t("analyticsTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Step 1: load template list */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={loadAnalyticsTemplateList} disabled={loadingAnalyticsTemplates}>
                          <RefreshCw className={`w-3 h-3 mr-1 ${loadingAnalyticsTemplates ? "animate-spin" : ""}`} />
                          {loadingAnalyticsTemplates ? t("loadText") : t("loadWabas")}
                        </Button>
                        <span className="text-xs text-muted-foreground">{t("selectTemplatesHint")}</span>
                      </div>

                      {/* Template checkbox list */}
                      {analyticsTemplateList.length > 0 && (
                        <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
                          {analyticsTemplateList.map((tpl: any) => {
                            const id = String(tpl.id || tpl.templateId || "");
                            const checked = selectedAnalyticsTemplateIds.includes(id);
                            return (
                              <label key={id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                                <input type="checkbox" checked={checked} onChange={() => toggleAnalyticsTemplate(id)} className="w-3 h-3" />
                                <span className="truncate">{tpl.name || id}</span>
                                {tpl.status && <Badge variant="outline" className="text-xs ml-auto shrink-0">{tpl.status}</Badge>}
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Date range + load metrics */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input type="date" value={templateAnalyticsStart} onChange={(e) => setTemplateAnalyticsStart(e.target.value)} className="h-8 text-xs w-36" />
                        <span className="text-xs text-muted-foreground">{t("untilText")}</span>
                        <Input type="date" value={templateAnalyticsEnd} onChange={(e) => setTemplateAnalyticsEnd(e.target.value)} className="h-8 text-xs w-36" />
                        <Button size="sm" variant="outline" onClick={loadTemplateAnalytics} disabled={loadingTemplateAnalytics || selectedAnalyticsTemplateIds.length === 0}>
                          <RefreshCw className={`w-3 h-3 mr-1 ${loadingTemplateAnalytics ? "animate-spin" : ""}`} />
                          {loadingTemplateAnalytics ? "..." : `Carregar Métricas${selectedAnalyticsTemplateIds.length > 0 ? ` (${selectedAnalyticsTemplateIds.length})` : ""}`}
                        </Button>
                      </div>
                    </CardContent>
                    {templateAnalyticsData && (
                      <CardContent className="pt-0">
                        {Array.isArray(templateAnalyticsData.data) && templateAnalyticsData.data.length > 0 ? (
                          <div className="space-y-2">
                            {templateAnalyticsData.data.map((tpl: any, i: number) => {
                              const tplName = analyticsTemplateList.find((t: any) => String(t.id) === String(tpl.template_id))?.name;
                              return (
                                <div key={i} className="border rounded p-3 space-y-2">
                                  <p className="text-xs font-semibold">{tplName || tpl.template_id || `Template ${i + 1}`}</p>
                                  {(tpl.data_points || []).length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs border-collapse">
                                        <thead><tr className="bg-muted"><th className="p-1.5 border text-left">{t("colDate")}</th><th className="p-1.5 border text-right">{t("colSent")}</th><th className="p-1.5 border text-right">{t("colDelivered")}</th><th className="p-1.5 border text-right">{t("colRead")}</th><th className="p-1.5 border text-right">{t("colClicks")}</th></tr></thead>
                                        <tbody>
                                          {(tpl.data_points || []).map((dp: any, j: number) => (
                                            <tr key={j} className="border-b hover:bg-muted/50">
                                              <td className="p-1.5 border">{dp.start ? formatDate(new Date(dp.start * 1000)) : "—"}</td>
                                              <td className="p-1.5 border text-right font-medium">{dp.sent ?? "—"}</td>
                                              <td className="p-1.5 border text-right">{dp.delivered ?? "—"}</td>
                                              <td className="p-1.5 border text-right">{dp.read ?? "—"}</td>
                                              <td className="p-1.5 border text-right">{dp.clicked ?? "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">{t("noDataPoints")}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("noTemplateMetrics")}</p>
                        )}
                      </CardContent>
                    )}
                  </Card>

                  {/* ── Limites de Envio ── */}
                  {limitsInfo && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> {t("sendingLimits")}
                        </CardTitle>
                        <CardDescription className="text-xs">{limitsInfo.api_limitation_note}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted">
                                <th className="text-left p-2 border">{t("colTierName")}</th>
                                <th className="text-left p-2 border">{t("colUniqueCustomers")}</th>
                                <th className="text-left p-2 border">{t("colDescription")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(limitsInfo.messaging_tiers || []).map((tier: any, i: number) => (
                                <tr key={i} className="border-b hover:bg-muted/50">
                                  <td className="p-2 border font-mono">{tier.tier}</td>
                                  <td className="p-2 border font-medium">{tier.unique_customers_24h ?? t("unlimited")}</td>
                                  <td className="p-2 border text-muted-foreground">{tier.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {limitsInfo.quality_rating_info?.description}{" "}
                          <a href={limitsInfo.documentation_url} target="_blank" rel="noreferrer" className="underline">{t("officialDocs")}</a>
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  </TabsContent>

                  <TabsContent value="cost" className="space-y-4">

                  {/* ── Custo de Mensagens Enviadas (novo modelo por mensagem, 01/10/2026) ── */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Calculator className="w-4 h-4" /> {t("sentCostTitle")}
                        </CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input type="date" value={sentCostStart} onChange={(e) => setSentCostStart(e.target.value)} className="h-8 text-xs w-36" />
                          <span className="text-xs text-muted-foreground">{t("untilText")}</span>
                          <Input type="date" value={sentCostEnd} onChange={(e) => setSentCostEnd(e.target.value)} className="h-8 text-xs w-36" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("sentCostRateLabel")}</span>
                            <Input type="number" step="0.0001" min="0" value={sentCostRate} onChange={(e) => setSentCostRate(e.target.value)} className="h-8 text-xs w-24" />
                          </div>
                          <Button size="sm" variant="outline" onClick={loadSentCost} disabled={loadingSentCost}>
                            <RefreshCw className={`w-3 h-3 mr-1 ${loadingSentCost ? "animate-spin" : ""}`} />
                            {loadingSentCost ? "..." : t("sentCostCalcBtn")}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="text-xs">{t("sentCostHint")}</CardDescription>
                    </CardHeader>
                    {sentCostData && (() => {
                      const rate = Number(String(sentCostRate).replace(",", ".")) || 0;
                      const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
                      const fmtDay = (d: string) => {
                        const [y, m, dd] = String(d).split("-");
                        return y && m && dd ? `${dd}/${m}/${y}` : d;
                      };
                      const total = Number(sentCostData.total) || 0;
                      const failed = Number(sentCostData.failed) || 0;
                      const linkedDelivered = Number(sentCostData.linkedDelivered) || 0;
                      const byDay = Array.isArray(sentCostData.byDay) ? sentCostData.byDay : [];
                      const byType = Array.isArray(sentCostData.byMediaType) ? sentCostData.byMediaType : [];
                      const bySendType = Array.isArray(sentCostData.bySendType) ? sentCostData.bySendType : [];
                      const avoidableSendTypes = ["chat", "bot", "schedule"];
                      const avoidableCount = bySendType.reduce((acc: number, st: any) => acc + (avoidableSendTypes.includes(String(st.sendType)) ? (Number(st.count) || 0) : 0), 0);
                      return (
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="border rounded p-3">
                              <p className="text-[11px] text-muted-foreground">{t("sentCostTotalMsgs")}</p>
                              <p className="text-lg font-semibold">{total}</p>
                            </div>
                            <div className="border rounded p-3">
                              <p className="text-[11px] text-muted-foreground">{t("sentCostRateLabel")}</p>
                              <p className="text-lg font-semibold">{fmtBRL(rate)}</p>
                            </div>
                            <div className="border rounded p-3">
                              <p className="text-[11px] text-muted-foreground">{t("sentCostEstimatedTotal")}</p>
                              <p className="text-lg font-semibold">{fmtBRL(total * rate)}</p>
                            </div>
                          </div>
                          {linkedDelivered > 0 && (
                            <div className="border rounded p-3 bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] text-muted-foreground">{t("sentCostLinkedDelivered")}</p>
                                <p className="text-[11px] leading-snug text-muted-foreground">{t("sentCostLinkedDeliveredHint", { count: linkedDelivered })}</p>
                              </div>
                              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{fmtBRL(linkedDelivered * rate)}</p>
                            </div>
                          )}
                          {failed > 0 && (
                            <p className="text-[11px] leading-snug text-muted-foreground">{t("sentCostFailedNote", { count: failed })}</p>
                          )}
                          {byDay.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t("sentCostByDay")}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead><tr className="bg-muted"><th className="p-2 border text-left">{t("colDate")}</th><th className="p-2 border text-right">{t("sentCostColMessages")}</th><th className="p-2 border text-right">{t("labelCost")}</th></tr></thead>
                                  <tbody>
                                    {byDay.map((d: any, i: number) => (
                                      <tr key={i} className="border-b hover:bg-muted/50">
                                        <td className="p-2 border">{fmtDay(d.day)}</td>
                                        <td className="p-2 border text-right font-medium">{d.count}</td>
                                        <td className="p-2 border text-right">{fmtBRL((Number(d.count) || 0) * rate)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-muted/60 font-semibold">
                                      <td className="p-2 border">{t("colTotal")}</td>
                                      <td className="p-2 border text-right">{total}</td>
                                      <td className="p-2 border text-right">{fmtBRL(total * rate)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}
                          {byType.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t("sentCostByType")}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead><tr className="bg-muted"><th className="p-2 border text-left">{t("labelType")}</th><th className="p-2 border text-right">{t("sentCostColMessages")}</th><th className="p-2 border text-right">{t("labelCost")}</th></tr></thead>
                                  <tbody>
                                    {byType.map((mt: any, i: number) => (
                                      <tr key={i} className="border-b hover:bg-muted/50">
                                        <td className="p-2 border"><Badge variant="outline" className="text-xs">{mt.mediaType || "—"}</Badge></td>
                                        <td className="p-2 border text-right font-medium">{mt.count}</td>
                                        <td className="p-2 border text-right">{fmtBRL((Number(mt.count) || 0) * rate)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {bySendType.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{t("sentCostBySendType")}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead><tr className="bg-muted"><th className="p-2 border text-left">{t("sentCostColOrigin")}</th><th className="p-2 border text-right">{t("sentCostColMessages")}</th><th className="p-2 border text-right">{t("labelCost")}</th></tr></thead>
                                  <tbody>
                                    {bySendType.map((st: any, i: number) => (
                                      <tr key={i} className="border-b hover:bg-muted/50">
                                        <td className="p-2 border"><Badge variant="outline" className="text-xs">{st.sendType || "—"}</Badge></td>
                                        <td className="p-2 border text-right font-medium">{st.count}</td>
                                        <td className="p-2 border text-right">{fmtBRL((Number(st.count) || 0) * rate)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-emerald-50 dark:bg-emerald-950/30 font-semibold">
                                      <td className="p-2 border">{t("sentCostAvoidable")}</td>
                                      <td className="p-2 border text-right">{avoidableCount}</td>
                                      <td className="p-2 border text-right">{fmtBRL(avoidableCount * rate)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground mt-2">{t("sentCostAvoidableHint")}</p>
                            </div>
                          )}
                          {byDay.length === 0 && (
                            <p className="text-sm text-muted-foreground">{t("noBillingData")}</p>
                          )}
                        </CardContent>
                      );
                    })()}
                  </Card>
                  </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Instagram Sub-tab ── */}
            <TabsContent value="instagram" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5" /> {t("instagramAccountsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {instagramConnections.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {t("noInstagramConn")}
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Select value={selectedInstagram ? String(selectedInstagram) : ""} onValueChange={(v) => { setSelectedInstagram(Number(v)); setInstagramAccountInfo(null); }}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t("selectConnectionPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {instagramConnections.map((w) => (
                              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={checkInstagramAccount} disabled={loadingInstagramCheck}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {loadingInstagramCheck ? t("loadText") : t("verifyAccount")}
                        </Button>
                      </div>

                      {selectedInstagram && (() => {
                        const conn = instagramConnections.find((w) => w.id === Number(selectedInstagram)) as any;
                        return conn ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-muted/30">
                              <CardHeader><CardTitle className="text-sm">{t("connInfoTitle")}</CardTitle></CardHeader>
                              <CardContent className="text-sm space-y-2">
                                <div className="flex justify-between"><span className="text-muted-foreground shrink-0">{t("labelName")}:</span><span className="ml-2 truncate">{conn.name}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground shrink-0">{t("labelStatus")}:</span><Badge variant="outline">{conn.status}</Badge></div>
                                {conn.wabaId && <div className="flex flex-col gap-0.5"><span className="text-muted-foreground text-xs">ID:</span><span className="font-mono text-xs break-all">{conn.wabaId}</span></div>}
                                <div className="flex justify-between items-center pt-2 border-t">
                                  <span className="text-muted-foreground text-xs">{tSessoes("webhookOriginOwn")}/{tSessoes("webhookOriginZdg")}:</span>
                                  <Badge variant="secondary" className="text-xs">{conn.webhookOrigin === "zdg_oauth" ? tSessoes("webhookOriginZdg") : tSessoes("webhookOriginOwn")}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => openMetaWebhookPopup("instagram", conn.id)}>
                                    <Webhook className="w-3 h-3 mr-1" /> {tSessoes("revalidateWebhook")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => openChangeOriginDialog(conn)}>
                                    <Settings className="w-3 h-3 mr-1" /> {tSessoes("changeWebhookOrigin")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => setDiagnoseTarget(conn)}>
                                    <Stethoscope className="w-3 h-3 mr-1" /> {tSessoes("diagnoseConnection")}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>

                            {instagramAccountInfo && (
                              <Card>
                                <CardHeader><CardTitle className="text-sm">{t("instagramAccountsTitle")}</CardTitle></CardHeader>
                                <CardContent className="py-4">
                                  <InstagramMockup
                                    data={{
                                      username: instagramAccountInfo.username,
                                      name: instagramAccountInfo.name,
                                      bio: instagramAccountInfo.biography,
                                      profilePicUrl: instagramAccountInfo.profile_picture_url,
                                      followersCount: instagramAccountInfo.followers_count,
                                      followingCount: instagramAccountInfo.follows_count,
                                      mediaCount: instagramAccountInfo.media_count,
                                      website: instagramAccountInfo.website,
                                      id: instagramAccountInfo.id,
                                      isVerified: instagramAccountInfo.is_verified,
                                    }}
                                  />
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        ) : null;
                      })()}

                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-2 text-blue-800 text-xs">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium mb-1">{t("tipsTitle")}</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li>{t("instagramTip1")}</li>
                                <li>{t("instagramTip2")}</li>
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Facebook Page Sub-tab ── */}
            <TabsContent value="facebook" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Facebook className="w-5 h-5" /> {t("facebookPagesTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {facebookConnections.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {t("noFacebookConn")}
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Select value={selectedFacebook ? String(selectedFacebook) : ""} onValueChange={(v) => { setSelectedFacebook(Number(v)); setFacebookAccountInfo(null); }}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t("selectConnectionPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {facebookConnections.map((w) => (
                              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={checkFacebookAccount} disabled={loadingFacebookCheck}>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {loadingFacebookCheck ? t("loadText") : t("verifyPage")}
                        </Button>
                      </div>

                      {selectedFacebook && (() => {
                        const conn = facebookConnections.find((w) => w.id === Number(selectedFacebook)) as any;
                        return conn ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="bg-muted/30">
                              <CardHeader><CardTitle className="text-sm">{t("connInfoTitle")}</CardTitle></CardHeader>
                              <CardContent className="text-sm space-y-2">
                                <div className="flex justify-between"><span className="text-muted-foreground">{t("labelName")}:</span><span>{conn.name}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">{t("labelStatus")}:</span><Badge variant="outline">{conn.status}</Badge></div>
                                {conn.fbPageId && <div className="flex flex-col gap-0.5"><span className="text-muted-foreground text-xs">Page ID:</span><span className="font-mono text-xs break-all">{conn.fbPageId}</span></div>}
                                <div className="flex justify-between items-center pt-2 border-t">
                                  <span className="text-muted-foreground text-xs">{tSessoes("webhookOriginOwn")}/{tSessoes("webhookOriginZdg")}:</span>
                                  <Badge variant="secondary" className="text-xs">{conn.webhookOrigin === "zdg_oauth" ? tSessoes("webhookOriginZdg") : tSessoes("webhookOriginOwn")}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => openMetaWebhookPopup("messenger", conn.id)}>
                                    <Webhook className="w-3 h-3 mr-1" /> {tSessoes("revalidateWebhook")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => openChangeOriginDialog(conn)}>
                                    <Settings className="w-3 h-3 mr-1" /> {tSessoes("changeWebhookOrigin")}
                                  </Button>
                                  <Button size="sm" variant="outline" className="flex-1 min-w-0" onClick={() => setDiagnoseTarget(conn)}>
                                    <Stethoscope className="w-3 h-3 mr-1" /> {tSessoes("diagnoseConnection")}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>

                            {facebookAccountInfo && (
                              <Card>
                                <CardHeader><CardTitle className="text-sm">{t("facebookPagesTitle")}</CardTitle></CardHeader>
                                <CardContent className="py-4">
                                  <FacebookPageMockup
                                    data={{
                                      name: facebookAccountInfo.name,
                                      category: facebookAccountInfo.category,
                                      about: facebookAccountInfo.about,
                                      website: facebookAccountInfo.website,
                                      phone: facebookAccountInfo.phone,
                                      email: facebookAccountInfo.email,
                                      location: facebookAccountInfo.location
                                        ? [facebookAccountInfo.location.street, facebookAccountInfo.location.city, facebookAccountInfo.location.country].filter(Boolean).join(", ")
                                        : undefined,
                                      pictureUrl: facebookAccountInfo.picture?.data?.url,
                                      coverUrl: facebookAccountInfo.cover?.source,
                                      followersCount: facebookAccountInfo.followers_count,
                                      likesCount: facebookAccountInfo.fan_count,
                                      id: facebookAccountInfo.id,
                                      isVerified: facebookAccountInfo.verification_status === "verified",
                                    }}
                                  />
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        ) : null;
                      })()}

                      {selectedFacebook && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Greeting Text */}
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <MessageCircle className="w-4 h-4" /> {t("messengerGreeting.title")}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">{t("messengerGreeting.description")}</p>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <Textarea
                                value={msgrGreetingText}
                                onChange={(e) => setMsgrGreetingText(e.target.value)}
                                placeholder={t("messengerGreeting.placeholder")}
                                maxLength={160}
                                rows={3}
                                className="text-sm"
                              />
                              <p className="text-[10px] text-muted-foreground text-right">{msgrGreetingText.length}/160</p>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={handleLoadMsgrGreeting} disabled={msgrGreetingLoading}>
                                  {msgrGreetingLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                  {t("load")}
                                </Button>
                                <Button size="sm" onClick={handleSaveMsgrGreeting} disabled={msgrGreetingLoading}>
                                  {msgrGreetingLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                  {t("save")}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={handleDeleteMsgrGreeting} disabled={msgrGreetingLoading}>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  {t("delete")}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Personas */}
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> {t("messengerPersonas.title")}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">{t("messengerPersonas.description")}</p>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <Button size="sm" variant="outline" onClick={handleLoadMsgrPersonas} disabled={msgrPersonasLoading} className="w-full">
                                {msgrPersonasLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                {t("messengerPersonas.loadList")}
                              </Button>
                              {msgrPersonas.length > 0 && (
                                <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-1">
                                  {msgrPersonas.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-muted/60 rounded">
                                      {p.profile_picture_url ? (
                                        <img src={p.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                                          {p.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                      )}
                                      <span className="text-xs flex-1 truncate">{p.name}</span>
                                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteMsgrPersona(p.id)}>
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="border-t pt-2 space-y-1">
                                <Label className="text-xs">{t("messengerPersonas.addNew")}</Label>
                                <Input
                                  value={newPersonaName}
                                  onChange={(e) => setNewPersonaName(e.target.value)}
                                  placeholder={t("messengerPersonas.namePlaceholder")}
                                  className="h-8 text-sm"
                                />
                                <Input
                                  value={newPersonaPic}
                                  onChange={(e) => setNewPersonaPic(e.target.value)}
                                  placeholder={t("messengerPersonas.picPlaceholder")}
                                  className="h-8 text-sm"
                                />
                                <Button size="sm" onClick={handleCreateMsgrPersona} disabled={msgrPersonasLoading || !newPersonaName.trim()} className="w-full">
                                  {msgrPersonasLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                                  {t("create")}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-2 text-blue-800 text-xs">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium mb-1">{t("tipsTitle")}</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li>{t("facebookTip1")}</li>
                                <li>{t("facebookTip2")}</li>
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ═══════════════ TAB: CONFIG ═══════════════ */}
        <TabsContent value="config" className="space-y-4">
          {/* Webhook URLs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5" /> {t("webhookUrlsTitle")}
              </CardTitle>
              <CardDescription>{t("webhookUrlsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "WABA (WhatsApp Business API)", getUrl: getWebhookUrl },
                { label: "Instagram", getUrl: getWebhookUrlInstagram },
                { label: "Messenger (Facebook)", getUrl: getWebhookUrlMessenger },
              ].map(({ label, getUrl }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-sm">{label}</Label>
                  <div className="flex gap-2">
                    <Input value={getUrl()} readOnly className="bg-muted font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(getUrl())}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Links públicos de Política de Privacidade / Termos de Uso para o App Review da Meta */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" /> {t("legalLinksTitle")}
              </CardTitle>
              <CardDescription>{t("legalLinksDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm">{t("legalLinksLanguage")}</Label>
                <Select value={legalLang} onValueChange={(v) => setLegalLang(v as LegalLang)}>
                  <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEGAL_LANGS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const suffix = legalLang === "pt" ? "" : `?lang=${legalLang}`;
                const openPreview = (url: string) => {
                  const w = 900;
                  const h = 700;
                  const left = Math.max(0, (window.screen.width - w) / 2);
                  const top = Math.max(0, (window.screen.height - h) / 2);
                  window.open(url, "legal-preview", `width=${w},height=${h},left=${left},top=${top}`);
                };
                return [
                  { label: t("privacyPolicyLink"), url: `${origin}/politica-de-privacidade${suffix}` },
                  { label: t("termsLink"), url: `${origin}/termos-de-uso${suffix}` },
                  { label: t("dataDeletionLink"), url: `${origin}/politica-de-privacidade${suffix}#data-deletion` },
                ].map(({ label, url }) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-sm">{label}</Label>
                    <div className="flex gap-2">
                      <Input value={url} readOnly className="bg-muted font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(url)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => openPreview(url)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("legalLinksPreview")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ));
              })()}
              <p className="text-xs text-muted-foreground">{t("legalLinksHint")}</p>
            </CardContent>
          </Card>

          {/* BSUID Strict Mode (PLANO_BSUID_FULL_COMPLIANCE.md) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> {t("bsuidStrictModeTitle")}
              </CardTitle>
              <CardDescription>{t("bsuidStrictModeDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-sm font-medium">{t("bsuidStrictMode")}</Label>
                  <p className="text-xs text-muted-foreground">{t("bsuidStrictModeHint")}</p>
                </div>
                <Switch
                  checked={bsuidStrictMode}
                  disabled={savingBsuidStrict}
                  onCheckedChange={handleToggleBsuidStrictMode}
                />
              </div>
            </CardContent>
          </Card>

          {/* Meta Token */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> {t("metaTokenTitle")}
              </CardTitle>
              <CardDescription>{t("metaTokenDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type={showMetaToken ? "text" : "password"}
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  placeholder={t("tokenPlaceholder")}
                  className="flex-1 font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => setShowMetaToken(!showMetaToken)}>
                  {showMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(metaToken)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveMetaToken} disabled={loadingToken}>
                  {loadingToken ? t("loadText") : t("saveToken")}
                </Button>
                <Button variant="outline" onClick={generateNewToken} disabled={loadingToken}>
                  <RefreshCw className="w-4 h-4 mr-2" /> {t("generateNewToken")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* BM Verification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> {t("wabaVerificationTitle")}
              </CardTitle>
              <CardDescription>{t("wabaVerificationDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>WABA ID</Label>
                  <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="1234567890" />
                </div>
                <div className="space-y-1">
                  <Label>{t("labelApiVersion")}</Label>
                  <Input value={wabaVersion} onChange={(e) => setWabaVersion(e.target.value)} placeholder="v19.0" />
                </div>
                <div className="space-y-1">
                  <Label>WABA Token</Label>
                  <Input value={wabaToken} onChange={(e) => setWabaToken(e.target.value)} placeholder="EAAxxxx..." type="password" />
                </div>
              </div>
              <Button onClick={checkBM} disabled={loading}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {loading ? t("loadText") : t("verifyBm")}
              </Button>
              {wabaResponse && (
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> {t("numbersFound")}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(wabaResponse.data || [wabaResponse]).map((phone: any, i: number) => (
                      <div key={i} className="border rounded p-2 text-sm space-y-1">
                        {phone.display_phone_number && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelNumber")}:</span><span className="font-medium">{phone.display_phone_number}</span></div>}
                        {phone.verified_name && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelName")}:</span><span>{phone.verified_name}</span></div>}
                        {phone.quality_rating && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelQuality")}:</span><Badge variant="outline">{phone.quality_rating}</Badge></div>}
                        {phone.status && (() => {
                          const sev = classifyWabaPhoneStatus(phone.status);
                          const key = wabaPhoneStatusI18nKey(phone.status);
                          const label = key === "unknown" ? phone.status : tHealth(`status.${key}`);
                          const isNeutral = sev === "ok" || sev === "other";
                          return (
                            <div className="flex justify-between gap-2">
                              <span className="text-muted-foreground shrink-0">{tHealth("phoneStatusLabel")}:</span>
                              {isNeutral
                                ? <Badge variant="outline">{label}</Badge>
                                : <Badge className={wabaPhoneStatusBadgeClasses(phone.status)}>{label}</Badge>}
                            </div>
                          );
                        })()}
                        {phone.code_verification_status && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">{t("labelVerification")}:</span><Badge variant={phone.code_verification_status === "VERIFIED" ? "default" : "secondary"}>{phone.code_verification_status}</Badge></div>}
                        {phone.id && <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">ID:</span><span className="font-mono text-xs break-all text-right">{phone.id}</span></div>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ TAB: TEMPLATES ═══════════════ */}
        <TabsContent value="templates" className="space-y-4">
          <Tabs value={templatesTab} onValueChange={setTemplatesTab}>
            <TabsList>
              <TabsTrigger value="waba">{t("wabaTemplatesTab")}</TabsTrigger>
              <TabsTrigger value="facebook">{t("facebookTemplatesTab")}</TabsTrigger>
            </TabsList>

            {/* ── WABA Templates ── */}
            <TabsContent value="waba" className="space-y-4">
              <Tabs value={wabaSubTab} onValueChange={(v) => {
                if (v === "templates" && isEditing) {
                  setIsEditing(false);
                  setTemplateIdToEdit("");
                  setNovoTemplate({ name: "", language: "pt_BR", category: "MARKETING", components: [] });
                }
                setWabaSubTab(v);
              }}>
                <TabsList>
                  <TabsTrigger value="templates">{t("templateListTab")}</TabsTrigger>
                  <TabsTrigger value="create">
                    {isEditing ? t("editTemplateTab") : t("createTemplateTab")}
                  </TabsTrigger>
                </TabsList>

                {/* Template List */}
                <TabsContent value="templates" className="space-y-4">
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-48 space-y-1">
                          <Label>{t("labelWabaConn")}</Label>
                          <Select value={selectedWaba ? String(selectedWaba) : ""} onValueChange={(v) => { setSelectedWaba(Number(v)); setTemplates([]); }}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("selectConnection")} />
                            </SelectTrigger>
                            <SelectContent>
                              {wabaConnections.map((w) => (
                                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={loadTemplates} disabled={loadingTemplates}>
                          <RefreshCw className={`w-4 h-4 mr-2 ${loadingTemplates ? "animate-spin" : ""}`} />
                          {loadingTemplates ? t("loadText") : t("loadWabas")}
                        </Button>
                      </div>

                      {templates.length > 0 && (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Select value={filtros.status} onValueChange={(v) => setFiltros((f) => ({ ...f, status: v }))}>
                              <SelectTrigger><SelectValue placeholder={t("labelStatus")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                                <SelectItem value="APPROVED">Aprovado</SelectItem>
                                <SelectItem value="PENDING">Pendente</SelectItem>
                                <SelectItem value="REJECTED">Rejeitado</SelectItem>
                                <SelectItem value="PAUSED">Pausado</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={filtros.category} onValueChange={(v) => setFiltros((f) => ({ ...f, category: v }))}>
                              <SelectTrigger><SelectValue placeholder={t("labelCategory")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("allCategories")}</SelectItem>
                                <SelectItem value="MARKETING">Marketing</SelectItem>
                                <SelectItem value="UTILITY">Utilidade</SelectItem>
                                <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={filtros.language} onValueChange={(v) => setFiltros((f) => ({ ...f, language: v }))}>
                              <SelectTrigger><SelectValue placeholder={t("labelLanguage")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("allLanguages")}</SelectItem>
                                <SelectItem value="pt_BR">Português (BR)</SelectItem>
                                <SelectItem value="en_US">English (US)</SelectItem>
                                <SelectItem value="es">Español</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={t("searchByName")}
                              value={filtros.search}
                              onChange={(e) => setFiltros((f) => ({ ...f, search: e.target.value }))}
                            />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Select value={sortBy} onValueChange={setSortBy}>
                              <SelectTrigger><SelectValue placeholder={t("sortBy")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="name_asc">{t("sortNameAZ")}</SelectItem>
                                <SelectItem value="name_desc">{t("sortNameZA")}</SelectItem>
                                <SelectItem value="id_asc">{t("sortIdAsc")}</SelectItem>
                                <SelectItem value="id_desc">{t("sortIdDesc")}</SelectItem>
                                <SelectItem value="category">{t("sortCategory")}</SelectItem>
                                <SelectItem value="status">{t("sortStatus")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={groupBy} onValueChange={setGroupBy}>
                              <SelectTrigger><SelectValue placeholder={t("groupBy")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t("groupNone")}</SelectItem>
                                <SelectItem value="status">{t("groupStatus")}</SelectItem>
                                <SelectItem value="category">{t("groupCategory")}</SelectItem>
                                <SelectItem value="language">{t("groupLanguage")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <p className="text-xs text-muted-foreground">{filteredTemplates.length} {t("filteredCount")} {templates.length}</p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {loadingTemplates ? (
                    <div className="text-center py-8 text-muted-foreground">{t("loadText")}</div>
                  ) : filteredTemplates.length === 0 && templates.length > 0 ? (
                    <div className="text-center py-8 text-muted-foreground">{t("noTemplatesInConn")}</div>
                  ) : (
                    <div className="space-y-6">
                      {groupTemplates(filteredTemplates).map(({ key, items }) => (
                        <div key={key || "__all__"}>
                          {groupBy !== "none" && (
                            <div className="flex items-center gap-2 mb-3">
                              <h3 className="text-sm font-semibold text-foreground">{key}</h3>
                              <span className="text-xs text-muted-foreground">({items.length})</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {items.map((template) => (
                              <Card key={template.id} className="flex flex-col">
                                <CardHeader className="pb-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <CardTitle className="text-sm truncate">{template.name}</CardTitle>
                                      <p className="text-xs text-muted-foreground">{template.language}</p>
                                      {template.id && <p className="text-xs text-muted-foreground font-mono">ID: {template.id}</p>}
                                    </div>
                                    <Badge className={`text-xs shrink-0 ${getStatusBadgeClass(template.status)}`}>
                                      {template.status}
                                    </Badge>
                                  </div>
                                </CardHeader>
                                <CardContent className="flex-1 space-y-2">
                                  <Badge className={`text-xs ${getCategoryBadgeClass(template.category)}`}>
                                    {template.category}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground line-clamp-3">
                                    {getTemplatePreview(template) || t("previewTitle")}
                                  </p>
                                </CardContent>
                                <div className="p-4 pt-0 flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => viewTemplate(template)} className="flex-1">
                                    <Eye className="w-3 h-3 mr-1" /> Ver
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => editTemplateAction(template)}>
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => deleteTemplateConfirm(template)} className="text-red-600 hover:text-red-700">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Template Create/Edit */}
                <TabsContent value="create" className="space-y-4">
                  {/* AI Generate Button */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAiWizardOpen(true)}
                      disabled={!selectedWaba}
                    >
                      <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                      {t("aiWizardBtn")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAiForm((f) => ({ ...f, category: novoTemplate.category, language: novoTemplate.language }));
                        setAiDialogOpen(true);
                      }}
                      disabled={!selectedWaba}
                    >
                      <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
                      {t("aiGenerateBtn")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{t("basicInfoTitle")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1">
                            <Label>{t("labelWabaConn")}</Label>
                            <Select value={selectedWaba ? String(selectedWaba) : ""} onValueChange={(v) => { setSelectedWaba(Number(v)); const conn = whatsapps.find((w) => w.id === Number(v)) as any; setAppId(conn?.appId || FALLBACK_TEMPLATE_APP_ID); }}>
                              <SelectTrigger><SelectValue placeholder={t("selectConnection")} /></SelectTrigger>
                              <SelectContent>
                                {wabaConnections.map((w) => (
                                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>App ID</Label>
                            <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="App ID do Facebook" />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("labelTemplateName")}</Label>
                            <Input
                              value={novoTemplate.name}
                              onChange={(e) => setNovoTemplate((t) => ({ ...t, name: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                              placeholder="meu_template"
                              maxLength={WABA_LIMITS.templateName}
                            />
                            <p className="text-xs text-muted-foreground">{t("templateNameHint")}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label>{t("labelLanguage")}</Label>
                              <Select value={novoTemplate.language} onValueChange={(v) => setNovoTemplate((t) => ({ ...t, language: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pt_BR">Português (BR)</SelectItem>
                                  <SelectItem value="en_US">English (US)</SelectItem>
                                  <SelectItem value="es">Español</SelectItem>
                                  <SelectItem value="fr">Français</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>{t("labelCategory")}</Label>
                              <Select value={novoTemplate.category} onValueChange={(v) => setNovoTemplate((t) => ({ ...t, category: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MARKETING">Marketing</SelectItem>
                                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{t("componentsTitle")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex gap-2">
                            <Select value={novoTipoComponente} onValueChange={setNovoTipoComponente}>
                              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="HEADER">{t("typeHeader")}</SelectItem>
                                <SelectItem value="BODY">{t("typeBody")}</SelectItem>
                                <SelectItem value="FOOTER">{t("typeFooter")}</SelectItem>
                                <SelectItem value="BUTTONS">{t("typeButtons")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={() => addComponent(novoTipoComponente)}>
                              <Plus className="w-4 h-4 mr-1" /> {t("addComponent")}
                            </Button>
                          </div>

                          {novoTemplate.components.map((comp, idx) => (
                            <Card key={idx} className="bg-muted/20">
                              <CardContent className="pt-3 pb-3 space-y-3">
                                <div className="flex items-center justify-between">
                                  <Badge variant="secondary">{comp.type}</Badge>
                                  <Button variant="ghost" size="icon" onClick={() => removeComponent(idx)} className="h-6 w-6 text-red-500">
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>

                                {comp.type === "HEADER" && (
                                  <>
                                    <Select value={comp.format || "TEXT"} onValueChange={(v) => updateComponent(idx, { format: v })}>
                                      <SelectTrigger><SelectValue placeholder="Formato" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="TEXT">{t("formatText")}</SelectItem>
                                        <SelectItem value="IMAGE">{t("formatImage")}</SelectItem>
                                        <SelectItem value="VIDEO">{t("formatVideo")}</SelectItem>
                                        <SelectItem value="DOCUMENT">{t("formatDocument")}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {(comp.format === "TEXT" || !comp.format) && (
                                      <>
                                        <Input
                                          value={comp.text || ""}
                                          onChange={(e) => updateComponent(idx, { text: e.target.value })}
                                          placeholder={t("placeholderHeaderText")}
                                          maxLength={WABA_LIMITS.templateHeaderText}
                                        />
                                        <div className="-mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span>{t("headerTextHint", { max: WABA_LIMITS.templateHeaderText })}</span>
                                          <span>{(comp.text || "").length}/{WABA_LIMITS.templateHeaderText}</span>
                                        </div>
                                      </>
                                    )}
                                    {(comp.format === "IMAGE" || comp.format === "VIDEO" || comp.format === "DOCUMENT") && (
                                      <div className="flex gap-2 items-center">
                                        <Input
                                          value={(comp as any).example || ""}
                                          onChange={(e) => updateComponent(idx, { example: e.target.value } as any)}
                                          placeholder={t("headerMediaUrlPlaceholder")}
                                          className="flex-1"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleOpenGalleryPicker(idx)}
                                          title={t("pickFromGallery")}
                                        >
                                          <FolderOpen className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </>
                                )}

                                {(comp.type === "BODY" || comp.type === "FOOTER") && (
                                  <>
                                    <Textarea
                                      value={comp.text || ""}
                                      onChange={(e) => updateComponent(idx, { text: e.target.value })}
                                      placeholder={comp.type === "BODY" ? t("placeholderBodyText") : t("placeholderFooterText")}
                                      maxLength={comp.type === "BODY" ? WABA_LIMITS.templateBody : WABA_LIMITS.templateFooter}
                                      rows={comp.type === "BODY" ? 4 : 2}
                                    />
                                    <p className="text-[10px] text-muted-foreground text-right">{(comp.text || "").length}/{comp.type === "BODY" ? WABA_LIMITS.templateBody : WABA_LIMITS.templateFooter}</p>
                                  </>
                                )}

                                {comp.type === "BUTTONS" && (
                                  <div className="space-y-2">
                                    {((comp as any).buttons || []).map((btn: any, btnIdx: number) => (
                                      <div key={btnIdx} className="flex gap-2 items-center">
                                        <Select value={btn.type} onValueChange={(v) => updateButton(idx, btnIdx, { type: v })}>
                                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="QUICK_REPLY">{t("btnTypeQuickReply")}</SelectItem>
                                            <SelectItem value="URL">{t("btnTypeUrl")}</SelectItem>
                                            <SelectItem value="PHONE_NUMBER">{t("btnTypePhone")}</SelectItem>
                                            <SelectItem value="OTP">{t("btnTypeOtp")}</SelectItem>
                                            <SelectItem value="ORDER_DETAILS">{t("btnTypeOrderDetails")}</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        {/* Cobrança: o rótulo é imposto pela Meta (error_subcode 2388153).
                                            Vira selo travado em vez de campo de texto — campo vazio ou com
                                            outro texto fazia a criação do template ser recusada. */}
                                        {btn.type === "ORDER_DETAILS" ? (
                                          <div
                                            className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                                            title={t("orderDetailsBtnTextLocked")}
                                          >
                                            <Lock className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{btn.text || ORDER_DETAILS_BUTTON_TEXT}</span>
                                          </div>
                                        ) : (
                                          <Input
                                            value={btn.text}
                                            onChange={(e) => updateButton(idx, btnIdx, { text: e.target.value })}
                                            placeholder={t("placeholderButtonText")}
                                            maxLength={WABA_LIMITS.templateButtonText}
                                            className="flex-1"
                                          />
                                        )}
                                        {btn.type === "URL" && (
                                          <Input
                                            value={btn.url || ""}
                                            onChange={(e) => updateButton(idx, btnIdx, { url: e.target.value })}
                                            placeholder="https://..."
                                            maxLength={WABA_LIMITS.templateUrl}
                                            className="flex-1"
                                          />
                                        )}
                                        {btn.type === "PHONE_NUMBER" && (
                                          <Input
                                            value={btn.phone_number || ""}
                                            onChange={(e) => updateButton(idx, btnIdx, { phone_number: e.target.value })}
                                            placeholder="+55..."
                                            maxLength={WABA_LIMITS.templatePhone}
                                            className="flex-1"
                                          />
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => removeButton(idx, btnIdx)} className="text-red-500 h-8 w-8">
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button variant="outline" size="sm" onClick={() => addButton(idx)}>
                                      <Plus className="w-3 h-3 mr-1" /> {t("addButton")}
                                    </Button>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}

                          {/* Cobrança: o que a Meta exige e o formulário não tem como
                              impor sozinho vira nota/aviso — nada trava o envio. */}
                          {hasOrderDetailsButton(novoTemplate.components) && (
                            <div className="space-y-2">
                              <div className="flex gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-2">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                                <p className="text-xs text-muted-foreground">{t("orderDetailsTplNote")}</p>
                              </div>
                              <div className="flex gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-2">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                                <p className="text-xs text-muted-foreground">{t("orderDetailsBtnTextLocked")}</p>
                              </div>
                              {novoTemplate.category === "AUTHENTICATION" && (
                                <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                  <p className="text-xs text-muted-foreground">{t("orderDetailsTplCategoryWarn")}</p>
                                </div>
                              )}
                              {novoTemplate.components.some((c) => c.type === "HEADER" && c.format === "VIDEO") && (
                                <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                  <p className="text-xs text-muted-foreground">{t("orderDetailsTplHeaderWarn")}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Button onClick={submitCreateTemplate} disabled={loadingCreate} className="flex-1">
                              {loadingCreate ? t("loadText") : isEditing ? t("saveTemplate") : t("createTemplateTab")}
                            </Button>
                            {isEditing && (
                              <Button variant="outline" onClick={() => { setIsEditing(false); setTemplateIdToEdit(""); setNovoTemplate({ name: "", language: "pt_BR", category: "MARKETING", components: [] }); }}>
                                {t("cancelBtn")}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Mobile Preview */}
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <WabaTemplateMobilePreview template={novoTemplate} />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ── Facebook Templates ── */}
            <TabsContent value="facebook" className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
                    <Info className="w-4 h-4 shrink-0" />
                    {t("fbTemplatesInfo")}
                  </div>
                  <div>
                    <Label className="text-xs">{t("fbTpl.channelLabel")}</Label>
                    <Select value={fbTplChannelId ? String(fbTplChannelId) : ""} onValueChange={(v) => setFbTplChannelId(Number(v))}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder={t("fbTpl.channelPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {facebookConnections.length === 0 ? (
                          <SelectItem value="__empty__" disabled>{t("fbTpl.noChannels")}</SelectItem>
                        ) : facebookConnections.map((w: any) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name || `#${w.id}`} <span className="text-xs text-muted-foreground ml-1">— {w.fbPageId}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {fbTplChannelId && (
                <Tabs value={fbTplSubTab} onValueChange={(v) => setFbTplSubTab(v as "list" | "create")}>
                  <TabsList>
                    <TabsTrigger value="list">{t("fbTpl.tabList")}</TabsTrigger>
                    <TabsTrigger value="create">{t("fbTpl.tabCreate")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="list" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{t("fbTpl.listHint")}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => fbTplChannelId && loadFbTemplates(fbTplChannelId)} disabled={fbTplLoading}>
                          <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (fbTplLoading ? "animate-spin" : "")} />
                          {t("fbTpl.refresh")}
                        </Button>
                        <Button size="sm" onClick={handleNewFbTemplate}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          {t("fbTpl.newTemplate")}
                        </Button>
                      </div>
                    </div>
                    {fbTplLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t("fbTpl.loading")}
                      </div>
                    ) : fbTplList.length === 0 ? (
                      <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{t("fbTpl.empty")}</CardContent></Card>
                    ) : (
                      <div className="space-y-2">
                        {fbTplList.map((tpl) => {
                          const body = tpl.components?.find((c) => c.type === "BODY")?.text || "";
                          return (
                            <Card key={tpl.id}>
                              <CardContent className="pt-3 pb-3 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm">{tpl.name}</span>
                                  <Badge className={getStatusBadgeClass(tpl.status)}>{tpl.status}</Badge>
                                  <Badge className={getCategoryBadgeClass(tpl.category)}>{tpl.category}</Badge>
                                  <Badge variant="outline">{tpl.language}</Badge>
                                  {tpl.rejection_reason && (
                                    <Badge variant="destructive" className="text-[10px]">{tpl.rejection_reason}</Badge>
                                  )}
                                  <div className="ml-auto flex items-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setFbTplDetail(tpl)} title={t("fbTpl.viewDetails")}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditFbTemplate(tpl)} title={t("fbTpl.edit")}>
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicateFbTemplate(tpl)} title={t("fbTpl.duplicate")}>
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setFbTplDeleteConfirm({ name: tpl.name })} title={t("fbTpl.delete")} disabled={fbTplDeletingName === tpl.name}>
                                      {fbTplDeletingName === tpl.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </Button>
                                  </div>
                                </div>
                                {body && (
                                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-muted/30 rounded p-2">{body}</p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="create" className="space-y-3">
                    <div className="grid lg:grid-cols-2 gap-4 items-start">
                    <Card>
                      <CardContent className="pt-4 space-y-3">
                        {fbTplForm.editingId && (
                          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                            <Edit className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{t("fbTpl.editingBanner")} <span className="font-mono font-semibold">{fbTplForm.name}</span>. {t("fbTpl.editingImmutable")}</span>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">{t("fbTpl.formName")} *</Label>
                          <Input
                            value={fbTplForm.name}
                            onChange={(e) => setFbTplForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="confirmacao_agendamento"
                            maxLength={WABA_LIMITS.templateName}
                            className="mt-1 h-9 text-sm font-mono"
                            disabled={!!fbTplForm.editingId}
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">{t("fbTpl.nameHint")}</p>
                        </div>
                        <div>
                          <Label className="text-xs">{t("fbTpl.formLanguage")} *</Label>
                          <Select value={fbTplForm.language} onValueChange={(v) => setFbTplForm((p) => ({ ...p, language: v }))} disabled={!!fbTplForm.editingId}>
                            <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pt_BR">pt_BR — Português (Brasil)</SelectItem>
                              <SelectItem value="en_US">en_US — English (US)</SelectItem>
                              <SelectItem value="es_ES">es_ES — Español</SelectItem>
                              <SelectItem value="es_LA">es_LA — Español (LatAm)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* HEADER */}
                        <div className="space-y-2 border-t pt-3">
                          <Label className="text-xs font-semibold">{t("fbTpl.headerLabel")}</Label>
                          <Select value={fbTplForm.headerType} onValueChange={(v) => setFbTplForm((p) => ({ ...p, headerType: v as typeof p.headerType }))}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t("fbTpl.headerNone")}</SelectItem>
                              <SelectItem value="text">{t("fbTpl.headerText")}</SelectItem>
                              <SelectItem value="image">{t("fbTpl.headerImage")}</SelectItem>
                              <SelectItem value="video">{t("fbTpl.headerVideo")}</SelectItem>
                              <SelectItem value="document">{t("fbTpl.headerDocument")}</SelectItem>
                            </SelectContent>
                          </Select>
                          {fbTplForm.headerType === "text" && (
                            <>
                              <Input
                                value={fbTplForm.headerText}
                                onChange={(e) => setFbTplForm((p) => ({ ...p, headerText: e.target.value }))}
                                placeholder={t("fbTpl.headerTextPlaceholder")}
                                maxLength={WABA_LIMITS.templateHeaderText}
                                className="h-9 text-sm"
                              />
                              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                <span>{t("headerTextHint", { max: WABA_LIMITS.templateHeaderText })}</span>
                                <span>{fbTplForm.headerText.length}/{WABA_LIMITS.templateHeaderText}</span>
                              </div>
                            </>
                          )}
                          {(fbTplForm.headerType === "image" || fbTplForm.headerType === "video" || fbTplForm.headerType === "document") && (
                            <div className="space-y-1">
                              <Input
                                value={fbTplForm.headerMediaUrl}
                                onChange={(e) => setFbTplForm((p) => ({ ...p, headerMediaUrl: e.target.value }))}
                                placeholder="https://..."
                                className="h-9 text-sm"
                              />
                              <p className="text-[11px] text-muted-foreground">{t("fbTpl.headerMediaHint")}</p>
                            </div>
                          )}
                        </div>

                        {/* BODY */}
                        <div className="border-t pt-3">
                          <Label className="text-xs font-semibold">{t("fbTpl.formBody")} *</Label>
                          <Textarea
                            value={fbTplForm.body}
                            onChange={(e) => setFbTplForm((p) => ({ ...p, body: e.target.value }))}
                            placeholder={"Ola {{1}}, seu agendamento esta confirmado para {{2}} as {{3}}h."}
                            maxLength={WABA_LIMITS.templateBody}
                            rows={5}
                            className="mt-1 text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground text-right">{fbTplForm.body.length}/{WABA_LIMITS.templateBody}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{t("fbTpl.bodyHint")}</p>
                        </div>
                        {fbTplFormVarCount > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs">{t("fbTpl.examplesLabel")} ({fbTplFormVarCount})</Label>
                            {Array.from({ length: fbTplFormVarCount }).map((_, i) => (
                              <Input
                                key={i}
                                value={fbTplForm.examples[i] || ""}
                                onChange={(e) => setFbTplForm((p) => {
                                  const ex = [...p.examples];
                                  ex[i] = e.target.value;
                                  return { ...p, examples: ex };
                                })}
                                placeholder={`{{${i + 1}}} — exemplo`}
                                className="h-8 text-sm"
                              />
                            ))}
                            <p className="text-[11px] text-muted-foreground">{t("fbTpl.examplesHint")}</p>
                          </div>
                        )}

                        {/* BUTTONS */}
                        <div className="space-y-2 border-t pt-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">{t("fbTpl.buttonsLabel")}</Label>
                            {fbTplForm.buttons.length < 3 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setFbTplForm((p) => ({ ...p, buttons: [...p.buttons, { type: "QUICK_REPLY", text: "", url: "", phone_number: "" }] }))}
                              >
                                <Plus className="h-3 w-3 mr-1" /> {t("fbTpl.addButton")}
                              </Button>
                            )}
                          </div>
                          {fbTplForm.buttons.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">{t("fbTpl.buttonsHint")}</p>
                          ) : (
                            fbTplForm.buttons.map((btn, i) => (
                              <div key={i} className="space-y-1.5 rounded border p-2 bg-muted/20">
                                <div className="flex items-center gap-1.5">
                                  <Select
                                    value={btn.type}
                                    onValueChange={(v) => setFbTplForm((p) => {
                                      const bs = [...p.buttons];
                                      bs[i] = { ...bs[i], type: v as "QUICK_REPLY" | "URL" | "PHONE_NUMBER" };
                                      return { ...p, buttons: bs };
                                    })}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="QUICK_REPLY">{t("fbTpl.btnQuickReply")}</SelectItem>
                                      <SelectItem value="URL">{t("fbTpl.btnUrl")}</SelectItem>
                                      <SelectItem value="PHONE_NUMBER">{t("fbTpl.btnPhone")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={btn.text}
                                    onChange={(e) => setFbTplForm((p) => {
                                      const bs = [...p.buttons];
                                      bs[i] = { ...bs[i], text: e.target.value };
                                      return { ...p, buttons: bs };
                                    })}
                                    placeholder={t("fbTpl.btnTextPlaceholder")}
                                    maxLength={25}
                                    className="h-8 text-xs flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                    onClick={() => setFbTplForm((p) => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                {btn.type === "URL" && (
                                  <Input
                                    value={btn.url}
                                    onChange={(e) => setFbTplForm((p) => {
                                      const bs = [...p.buttons];
                                      bs[i] = { ...bs[i], url: e.target.value };
                                      return { ...p, buttons: bs };
                                    })}
                                    placeholder="https://..."
                                    maxLength={WABA_LIMITS.templateUrl}
                                    className="h-8 text-xs"
                                  />
                                )}
                                {btn.type === "PHONE_NUMBER" && (
                                  <Input
                                    value={btn.phone_number}
                                    onChange={(e) => setFbTplForm((p) => {
                                      const bs = [...p.buttons];
                                      bs[i] = { ...bs[i], phone_number: e.target.value };
                                      return { ...p, buttons: bs };
                                    })}
                                    placeholder="+5511999999999"
                                    maxLength={WABA_LIMITS.templatePhone}
                                    className="h-8 text-xs"
                                  />
                                )}
                              </div>
                            ))
                          )}
                        </div>

                        <DialogFooter className="!justify-end">
                          <Button variant="outline" onClick={() => { setFbTplForm({ ...fbTplEmptyForm }); setFbTplSubTab("list"); }} disabled={fbTplCreating}>{t("cancelBtn")}</Button>
                          <Button onClick={handleCreateFbTemplate} disabled={fbTplCreating}>
                            {fbTplCreating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                            {fbTplForm.editingId ? t("fbTpl.submitEdit") : t("fbTpl.submitCreate")}
                          </Button>
                        </DialogFooter>
                      </CardContent>
                    </Card>
                    <Card className="lg:sticky lg:top-4">
                      <CardHeader>
                        <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <MessengerTemplatePreview channel="messenger" template={{ components: buildFbTplComponents() }} />
                      </CardContent>
                    </Card>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Facebook Template — Detalhes */}
      <Dialog open={!!fbTplDetail} onOpenChange={(o) => !o && setFbTplDetail(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{fbTplDetail?.name}</DialogTitle>
          </DialogHeader>
          {fbTplDetail && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className={getStatusBadgeClass(fbTplDetail.status)}>{fbTplDetail.status}</Badge>
                <Badge className={getCategoryBadgeClass(fbTplDetail.category)}>{fbTplDetail.category}</Badge>
                <Badge variant="outline">{fbTplDetail.language}</Badge>
                {fbTplDetail.rejection_reason && (
                  <Badge variant="destructive">{fbTplDetail.rejection_reason}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                ID: <span className="font-mono">{fbTplDetail.id}</span>
              </div>
              <Separator />
              <MessengerTemplatePreview channel="messenger" template={fbTplDetail} />
              {fbTplDetail.components?.map((comp: any, idx: number) => (
                <Card key={idx} className="bg-muted/20">
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <Badge variant="secondary" className="text-[10px]">{comp.type}</Badge>
                    {comp.text && <p className="text-sm whitespace-pre-wrap break-words">{comp.text}</p>}
                    {comp.format && comp.format !== "TEXT" && (
                      <p className="text-xs text-muted-foreground">{t("labelFormat")}: {comp.format}</p>
                    )}
                    {comp.example?.body_text && Array.isArray(comp.example.body_text) && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("fbTpl.exampleValuesLabel")}</span>
                        <div className="flex flex-wrap gap-1">
                          {(comp.example.body_text[0] || []).map((v: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-mono">
                              {"{{" + (i + 1) + "}}"} = {v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {comp.type === "BUTTONS" && Array.isArray(comp.buttons) && comp.buttons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {comp.buttons.map((b: any, bi: number) => (
                          <Badge key={bi} variant="outline" className="text-[10px]">
                            {b.text || b.type}
                            {b.url ? ` → ${b.url}` : ""}
                            {b.phone_number ? ` → ${b.phone_number}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFbTplDetail(null)}>{t("cancelBtn")}</Button>
            {fbTplDetail && (
              <Button variant="outline" onClick={() => handleEditFbTemplate(fbTplDetail)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> {t("fbTpl.edit")}
              </Button>
            )}
            {fbTplDetail && (
              <Button onClick={() => { handleDuplicateFbTemplate(fbTplDetail); setFbTplDetail(null); }}>
                <Copy className="h-3.5 w-3.5 mr-1" /> {t("fbTpl.duplicate")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facebook Template — Confirmar delete */}
      <Dialog open={!!fbTplDeleteConfirm} onOpenChange={(o) => !o && setFbTplDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> {t("fbTpl.deleteConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("fbTpl.deleteConfirmBody")}{" "}
              <span className="font-mono font-semibold">{fbTplDeleteConfirm?.name}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFbTplDeleteConfirm(null)} disabled={!!fbTplDeletingName}>{t("cancelBtn")}</Button>
            <Button
              variant="destructive"
              onClick={() => fbTplDeleteConfirm && handleDeleteFbTemplate(fbTplDeleteConfirm.name)}
              disabled={!!fbTplDeletingName}
            >
              {fbTplDeletingName ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              {t("fbTpl.deleteConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template View Dialog */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template: {templateSelecionado?.name}</DialogTitle>
          </DialogHeader>
          {templateSelecionado && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Badge className={getStatusBadgeClass(templateSelecionado.status)}>{templateSelecionado.status}</Badge>
                  <Badge className={getCategoryBadgeClass(templateSelecionado.category)}>{templateSelecionado.category}</Badge>
                  <Badge variant="outline">{templateSelecionado.language}</Badge>
                </div>
                {templateSelecionado.components?.map((comp: any, i: number) => (
                  <Card key={i} className="bg-muted/20">
                    <CardContent className="pt-3 pb-3">
                      <Badge variant="secondary" className="mb-2">{comp.type}</Badge>
                      {comp.text && <p className="text-sm mt-1">{comp.text}</p>}
                      {comp.format && comp.format !== "TEXT" && <p className="text-xs text-muted-foreground">{t("labelFormat")}: {comp.format}</p>}
                      {comp.buttons && (
                        <div className="mt-2 space-y-1">
                          {comp.buttons.map((btn: any, bi: number) => (
                            <div key={bi} className="text-xs bg-background text-foreground border rounded px-2 py-1">
                              [{btn.type}] {btn.text}{btn.url ? ` → ${btn.url}` : ""}{btn.phone_number ? ` → ${btn.phone_number}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <WabaTemplateMobilePreview template={templateSelecionado} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>{t("cancelBtn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirm Dialog */}
      <Dialog
        open={!!templateToDelete}
        onOpenChange={(o) => { if (!o && !loadingDeleteTemplate) setTemplateToDelete(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {t("deleteTemplateConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="break-words">
              {t("deleteTemplateConfirmMessage", { name: templateToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={loadingDeleteTemplate}
            >
              {t("cancelBtn")}
            </Button>
            <Button
              variant="destructive"
              onClick={performDeleteTemplate}
              disabled={loadingDeleteTemplate}
            >
              {loadingDeleteTemplate ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {t("deleteTemplate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone Registration Dialog */}
      <Dialog open={showPhoneRegistrationModal} onOpenChange={setShowPhoneRegistrationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("registerPhoneTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: "phoneNumberId", label: "Phone Number ID" },
              { key: "wabaId", label: "WABA ID" },
              { key: "wabaVersion", label: t("labelApiVersion") },
              { key: "wabaToken", label: "Token WABA", type: "password" },
              { key: "pin", label: t("labelPinOptional") },
            ].map(({ key, label, type }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                {key === "pin" ? (
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={(phoneRegistrationData as any)[key]}
                      onChange={(e) => setPhoneRegistrationData((d) => ({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-shrink-0"
                      title={tSessoes("registerPinGenerate")}
                      onClick={() => setPhoneRegistrationData((d) => ({ ...d, pin: generateRandomPin() }))}
                    >
                      <Dices className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">{tSessoes("registerPinGenerate")}</span>
                    </Button>
                  </div>
                ) : (
                  <Input
                    type={type || "text"}
                    value={(phoneRegistrationData as any)[key]}
                    onChange={(e) => setPhoneRegistrationData((d) => ({ ...d, [key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhoneRegistrationModal(false)}>{t("cancelBtn")}</Button>
            <Button onClick={submitPhoneRegistration} disabled={loadingVerification}>
              {loadingVerification ? t("loadText") : t("registerPhone")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Code Dialog */}
      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("verificationCodeTitle")}</DialogTitle>
          </DialogHeader>
          {verificationStep === "request" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Phone Number ID</Label>
                <Input value={verificationData.phoneNumberId} onChange={(e) => setVerificationData((d) => ({ ...d, phoneNumberId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("labelMethod")}</Label>
                <Select value={verificationData.codeMethod} onValueChange={(v) => setVerificationData((d) => ({ ...d, codeMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="VOICE">Voice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Locale</Label>
                <Input value={verificationData.locale} onChange={(e) => setVerificationData((d) => ({ ...d, locale: e.target.value }))} placeholder="pt_BR" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowVerificationModal(false)}>{t("cancelBtn")}</Button>
                <Button onClick={requestVerifCode} disabled={loadingCodeRequest}>
                  {loadingCodeRequest ? t("loadText") : t("sendBtn")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("verificationCodeTitle")}: {verificationData.codeMethod}</p>
              <div className="space-y-1">
                <Label>{t("labelCode")}</Label>
                <Input
                  value={verificationData.code}
                  onChange={(e) => setVerificationData((d) => ({ ...d, code: e.target.value }))}
                  placeholder="123456"
                  maxLength={6}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVerificationStep("request")}>{t("cancelBtn")}</Button>
                <Button onClick={submitVerifyCode} disabled={loadingVerification}>
                  {loadingVerification ? t("loadText") : t("verifyCode")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Webhook dialogs removed — setup now handled via oauth-proxy popup (Phase 18) */}

      {/* SIP Config Dialog */}
      <Dialog open={showSIPModal} onOpenChange={setShowSIPModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="w-4 h-4" /> {t("configSipTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Hostname</Label>
              <Input value={sipData.hostname} onChange={(e) => setSipData((d) => ({ ...d, hostname: e.target.value }))} placeholder="sip.example.com" />
            </div>
            <div className="space-y-1">
              <Label>{t("labelSipDomain")}</Label>
              <Input value={sipData.port} onChange={(e) => setSipData((d) => ({ ...d, port: e.target.value }))} placeholder="5060" type="number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSIPModal(false)}>{t("cancelBtn")}</Button>
            <Button onClick={submitSIP} disabled={loadingSIP}>
              {loadingSIP ? t("loadText") : t("saveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Edit Dialog */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Camera className="w-4 h-4" /> {t("editProfileTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: "about", label: t("labelProfileAbout"), placeholder: t("placeholderProfileAbout") },
              { key: "address", label: t("labelProfileAddress"), placeholder: t("placeholderProfileAddress") },
              { key: "description", label: t("labelProfileAbout"), placeholder: t("placeholderProfileAbout") },
              { key: "email", label: t("labelProfileEmail"), placeholder: t("placeholderProfileEmail") },
              { key: "vertical", label: t("labelProfileName"), placeholder: "Ex: RETAIL, EDUCATION, ..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                {key === "description" || key === "about" ? (
                  <Textarea
                    value={(profileData as any)[key]}
                    onChange={(e) => setProfileData((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={(profileData as any)[key]}
                    onChange={(e) => setProfileData((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                )}
              </div>
            ))}
            <div className="space-y-2">
              <Label>{t("labelProfileWebsite")}</Label>
              {profileData.websites.map((site, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={site}
                    onChange={(e) => setProfileData((d) => ({ ...d, websites: d.websites.map((s, j) => j === i ? e.target.value : s) }))}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  {profileData.websites.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setProfileData((d) => ({ ...d, websites: d.websites.filter((_, j) => j !== i) }))}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              {profileData.websites.length < 2 && (
                <Button variant="outline" size="sm" onClick={() => setProfileData((d) => ({ ...d, websites: [...d.websites, ""] }))}>
                  <Plus className="w-3 h-3 mr-1" /> {t("labelProfileWebsite")}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileModal(false)}>{t("cancelBtn")}</Button>
            <Button onClick={submitProfile} disabled={loadingProfile}>
              {loadingProfile ? t("loadText") : t("saveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Template Wizard (multi-etapa: segmento → campanha → opções → detalhes) */}
      <WabaTemplateAiWizard
        open={aiWizardOpen}
        onOpenChange={setAiWizardOpen}
        generating={aiGenerating}
        copilotAvailable={copilotAvailable}
        onGenerate={async (form: WizardAiForm) => {
          setAiForm(form);
          await generateTemplateWithAI(form);
          setAiWizardOpen(false);
        }}
      />

      {/* AI Template Generation Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              {t("aiDialogTitle")}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{t("aiDialogDesc")}</p>
          </DialogHeader>

          <div className="space-y-4">
            {/* AI Source selector */}
            <div className="space-y-1">
              <Label>{t("aiSourceLabel")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={copilotAvailable === false}
                  onClick={() => setAiForm((f) => ({ ...f, aiSource: "copilot" }))}
                  title={copilotAvailable === false ? t("aiCopilotNoApiKey") : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                    copilotAvailable === false
                      ? "border-border opacity-40 cursor-not-allowed"
                      : aiForm.aiSource === "copilot"
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                        : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">{t("aiSourceCopilot")}</span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {copilotAvailable === false ? t("aiCopilotInactive") : t("aiSourceCopilotDesc")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiForm((f) => ({ ...f, aiSource: "canal" }))}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
                    aiForm.aiSource === "canal"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-medium">{t("aiSourceCanal")}</span>
                  <span className="text-xs text-muted-foreground text-center leading-tight">{t("aiSourceCanalDesc")}</span>
                </button>
              </div>
              {/* Model info badge */}
              {(() => {
                let provider: string | null = null;
                let model: string | null = null;
                if (aiForm.aiSource === "copilot" && aiModelInfo) {
                  provider = aiModelInfo.provider;
                  model = aiModelInfo.model;
                } else if (aiForm.aiSource === "canal" && selectedWaba) {
                  const conn = whatsapps.find((w) => w.id === Number(selectedWaba)) as Whatsapp & { chatgptModel?: string };
                  provider = "openai";
                  model = conn?.chatgptModel || "gpt-3.5-turbo";
                }
                if (!provider) return null;
                const providerLabel = COPILOT_PROVIDER_LABELS[provider] ?? provider;
                return (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>{t("aiModelUsing")} <span className="font-medium text-foreground">{providerLabel}</span> <span className="text-muted-foreground/70">({model})</span></span>
                  </div>
                );
              })()}
            </div>

            {/* Prompt */}
            <div className="space-y-1">
              <Label>{t("aiPromptLabel")} *</Label>
              <Textarea
                value={aiForm.prompt}
                onChange={(e) => setAiForm((f) => ({ ...f, prompt: e.target.value }))}
                placeholder={t("aiPromptPlaceholder")}
                rows={4}
              />
            </div>

            {/* Category + Language */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("labelCategory")}</Label>
                <Select value={aiForm.category} onValueChange={(v) => setAiForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("labelLanguage")}</Label>
                <Select value={aiForm.language} onValueChange={(v) => setAiForm((f) => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (BR)</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="zh_CN">中文</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                    <SelectItem value="id">Bahasa Indonesia</SelectItem>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="tr">Türkçe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Components to include */}
            <div className="space-y-3">
              <Label>{t("aiComponentsLabel")}</Label>

              {/* Header */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiForm.includeHeader}
                    onChange={(e) => setAiForm((f) => ({ ...f, includeHeader: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">{t("aiIncludeHeader")}</span>
                </label>
                {aiForm.includeHeader && (
                  <div className="ml-6 space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("aiHeaderType")}</Label>
                    <Select value={aiForm.headerType} onValueChange={(v) => setAiForm((f) => ({ ...f, headerType: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TEXT">{t("formatText")}</SelectItem>
                        <SelectItem value="IMAGE">{t("formatImage")}</SelectItem>
                        <SelectItem value="VIDEO">{t("formatVideo")}</SelectItem>
                        <SelectItem value="DOCUMENT">{t("formatDocument")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Footer */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiForm.includeFooter}
                  onChange={(e) => setAiForm((f) => ({ ...f, includeFooter: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">{t("aiIncludeFooter")}</span>
              </label>

              {/* Buttons */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiForm.includeButtons}
                    onChange={(e) => setAiForm((f) => ({ ...f, includeButtons: e.target.checked, buttonTypes: e.target.checked ? f.buttonTypes : [] }))}
                    className="rounded"
                  />
                  <span className="text-sm">{t("aiIncludeButtons")}</span>
                </label>
                {aiForm.includeButtons && (
                  <div className="ml-6 space-y-2">
                    <p className="text-xs text-muted-foreground">{t("aiButtonTypesLabel")}</p>
                    {[
                      { value: "QUICK_REPLY", label: t("aiBtnQuickReply") },
                      { value: "URL", label: t("aiBtnUrl") },
                      { value: "PHONE_NUMBER", label: t("aiBtnPhone") },
                    ].map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aiForm.buttonTypes.includes(value)}
                          onChange={(e) => setAiForm((f) => ({
                            ...f,
                            buttonTypes: e.target.checked
                              ? [...f.buttonTypes, value]
                              : f.buttonTypes.filter((t) => t !== value),
                          }))}
                          className="rounded"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>
              {t("cancelBtn")}
            </Button>
            <Button onClick={() => generateTemplateWithAI()} disabled={aiGenerating} className="bg-purple-600 hover:bg-purple-700 text-white">
              {aiGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {(() => {
                    const info = aiModelInfo;
                    if (!info) return t("aiGenerating");
                    const providerLabel = COPILOT_PROVIDER_LABELS[info.provider] ?? info.provider;
                    return `${t("aiGenerating")} ${providerLabel} (${info.model})`;
                  })()}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t("aiGenerateAction")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gallery Picker Dialog ── */}
      <GalleryPickerWithUploadDialog
        open={galleryPickerOpen}
        onOpenChange={setGalleryPickerOpen}
        onPick={handlePickGalleryItem}
        {...wabaHeaderFormatToGalleryParams(
          galleryPickerTarget != null ? novoTemplate.components[galleryPickerTarget]?.format : undefined
        )}
      />

      <HijackTakeoverDialog
        open={hijackState !== null}
        details={hijackState}
        loading={hijackLoading}
        onCancel={() => { if (!hijackLoading) setHijackState(null); }}
        onConfirm={handleHijackConfirm}
      />

      <DiagnoseModal
        open={diagnoseTarget !== null}
        onOpenChange={(open) => { if (!open) setDiagnoseTarget(null); }}
        whatsappId={diagnoseTarget?.id ?? null}
        channelName={diagnoseTarget?.name}
        channelType={diagnoseTarget?.type}
        onReconnect={() => {
          if (diagnoseTarget) {
            const t = diagnoseTarget.type as "waba" | "instagram" | "messenger";
            if (t === "waba" || t === "instagram" || t === "messenger") {
              openMetaWebhookPopup(t, diagnoseTarget.id);
            }
          }
        }}
      />

      {/* Dialog de alteracao de origem do canal (Meta) — compartilhado entre WABA/IG/Messenger */}
      <Dialog open={originChangeTarget !== null} onOpenChange={(open) => { if (!open && !originChangeLoading) setOriginChangeTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tSessoes("changeWebhookOrigin")}</DialogTitle>
            <DialogDescription>{tSessoes("changeWebhookOriginDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              {tSessoes("channel")}: <span className="font-semibold text-foreground">{originChangeTarget?.name}</span>
            </div>
            <RadioGroup value={originChangeValue} onValueChange={(v) => setOriginChangeValue(v as "own_app" | "zdg_oauth")}>
              <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                   onClick={() => setOriginChangeValue("own_app")}>
                <RadioGroupItem value="own_app" id="meta-origin-own" className="mt-1" />
                <label htmlFor="meta-origin-own" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">{tSessoes("webhookOriginOwnFull")}</div>
                  <div className="text-xs text-muted-foreground">{tSessoes("webhookOriginOwnHint")}</div>
                </label>
              </div>
              <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                   onClick={() => setOriginChangeValue("zdg_oauth")}>
                <RadioGroupItem value="zdg_oauth" id="meta-origin-zdg" className="mt-1" />
                <label htmlFor="meta-origin-zdg" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">{tSessoes("webhookOriginZdgFull")}</div>
                  <div className="text-xs text-muted-foreground">{tSessoes("webhookOriginZdgHint")}</div>
                </label>
              </div>
            </RadioGroup>
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{tSessoes("changeWebhookOriginWarning")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={originChangeLoading} onClick={() => setOriginChangeTarget(null)}>
              {tSessoes("cancel")}
            </Button>
            <Button
              disabled={originChangeLoading || originChangeTarget?.webhookOrigin === originChangeValue}
              onClick={() => confirmChangeOrigin()}
            >
              {originChangeLoading ? tSessoes("saving") : tSessoes("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
