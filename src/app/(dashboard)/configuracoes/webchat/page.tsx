"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { DirectLinkPreview } from "@/components/webchat/direct-link-preview";
import {
  MessageCircle,
  RefreshCw,
  Copy,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  Play,
  Link as LinkIcon,
  QrCode,
  Palette,
  Eye,
  Code,
  ChevronDown,
  ClipboardList,
  Type,
  Save,
  Loader2,
  HelpCircle,
  Images,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { fetchTenantById, updateTenantWebsocketToken } from "@/services/tenants";
import {
  verifyWebchatConfig,
  getWebchatWidget,
  buildDirectLinkUrl,
  WEBCHAT_DEFAULT_COLOR,
  WEBCHAT_PRECHAT_FIELDS,
  type WebchatDirectConfig,
} from "@/services/webchat";
import { fetchWhatsapps, updateWhatsapp, type Whatsapp } from "@/services/whatsapp";
import { useAuthStore } from "@/stores/auth-store";

interface ChannelOption {
  label: string;
  value: string;
  status: string;
  /** id numérico do canal — necessário para o PUT /whatsapp/:id. */
  id: number;
  /**
   * Probe de capacidade (PLANO_WEBCHAT_URL §7): true quando o objeto do canal
   * no GET trouxe a chave webchatConfig (backend novo, mesmo que null).
   * Backend antigo → a seção de link direto não renderiza (sem erro).
   */
  hasWebchatConfig: boolean;
  /** Config salva no backend (null = backend novo sem config gravada ainda). */
  webchatConfig: WebchatDirectConfig | null;
  /**
   * wabaId real do canal (uuid). O backend resolve /chat/:wabaId SÓ por esta
   * coluna — sem ela a URL/QR do link direto dariam 404, então a seção não
   * renderiza (canais webchat via create cross-tenant podem nascer sem uuid).
   */
  wabaId: string;
}

// ─── Link direto (PLANO_WEBCHAT_URL F2/F3) — estado local do formulário ──────

const PAGE_LABEL_KEYS = [
  "start",
  "formTitle",
  "connecting",
  "reconnecting",
  "unavailable",
  "retry",
  "send",
] as const;
type PageLabelKey = (typeof PAGE_LABEL_KEYS)[number];

interface WebchatConfigForm {
  title: string;
  color: string;
  logoUrl: string;
  welcomeMessage: string;
  placeholder: string;
  preChatEnabled: boolean;
  preChatFields: string[];
  preChatRequired: string[];
  privacyText: string;
  privacyUrl: string;
  labels: Record<PageLabelKey, string>;
}

/** Inicializa o formulário a partir do webchatConfig salvo (merge com defaults). */
function configToForm(cfg: WebchatDirectConfig | null): WebchatConfigForm {
  const c = cfg ?? {};
  const pre = c.preChatForm ?? undefined;
  const savedLabels = c.labels ?? undefined;
  const preFields = pre?.fields;
  const preRequired = pre?.required;
  const fields = Array.isArray(preFields)
    ? preFields.filter((f) => WEBCHAT_PRECHAT_FIELDS.includes(f))
    : [...WEBCHAT_PRECHAT_FIELDS];
  const required = Array.isArray(preRequired)
    ? preRequired.filter((f) => WEBCHAT_PRECHAT_FIELDS.includes(f))
    : ["name"];
  const labelValue = (k: PageLabelKey): string => {
    const v = savedLabels?.[k];
    return typeof v === "string" ? v : "";
  };
  return {
    title: typeof c.title === "string" ? c.title : "",
    color: typeof c.color === "string" && c.color ? c.color : WEBCHAT_DEFAULT_COLOR,
    logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : "",
    welcomeMessage: typeof c.welcomeMessage === "string" ? c.welcomeMessage : "",
    placeholder: typeof c.placeholder === "string" ? c.placeholder : "",
    preChatEnabled: pre?.enabled === true,
    preChatFields: fields,
    preChatRequired: required.filter((r) => fields.includes(r)),
    privacyText: typeof c.privacyText === "string" ? c.privacyText : "",
    privacyUrl: typeof c.privacyUrl === "string" ? c.privacyUrl : "",
    labels: {
      start: labelValue("start"),
      formTitle: labelValue("formTitle"),
      connecting: labelValue("connecting"),
      reconnecting: labelValue("reconnecting"),
      unavailable: labelValue("unavailable"),
      retry: labelValue("retry"),
      send: labelValue("send"),
    },
  };
}

/**
 * Monta o objeto COMPLETO de webchatConfig para o PUT: parte do salvo no GET
 * (preserva chaves futuras do backend — o merge do back é raso) e aplica o
 * formulário. Campos vazios viram null (= usar o default do backend).
 */
function montarConfigCompleta(
  saved: WebchatDirectConfig | null,
  form: WebchatConfigForm,
  directLinkEnabled: boolean
): WebchatDirectConfig {
  const labels: Record<string, string> = {};
  PAGE_LABEL_KEYS.forEach((k) => {
    const v = form.labels[k].trim();
    if (v) labels[k] = v;
  });
  const fields = WEBCHAT_PRECHAT_FIELDS.filter((f) => form.preChatFields.includes(f));
  // Normaliza cor/URLs no cliente para um valor inválido não fazer o backend
  // rejeitar (400) o PUT inteiro — os demais campos salvam; inválido vira null
  // (= usar o default). O backend revalida como defesa em profundidade.
  const color = form.color.trim();
  const validColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null;
  const logoUrl = form.logoUrl.trim();
  const validLogoUrl = /^https?:\/\//i.test(logoUrl) ? logoUrl : null;
  const privacyUrl = form.privacyUrl.trim();
  const validPrivacyUrl = /^https?:\/\//i.test(privacyUrl) ? privacyUrl : null;
  return {
    ...(saved ?? {}),
    directLinkEnabled,
    title: form.title.trim() || null,
    color: validColor,
    logoUrl: validLogoUrl,
    welcomeMessage: form.welcomeMessage.trim() || null,
    placeholder: form.placeholder.trim() || null,
    preChatForm: {
      ...(saved?.preChatForm ?? {}),
      enabled: form.preChatEnabled,
      fields,
      required: fields.filter((f) => form.preChatRequired.includes(f)),
    },
    privacyText: form.privacyText.trim() || null,
    privacyUrl: validPrivacyUrl,
    labels: Object.keys(labels).length > 0 ? labels : null,
  };
}

// Logo da galeria pode vir com URL relativa; a página pública do link direto
// precisa de URL absoluta (o sanitizador do backend exige http/https).
function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function WebchatPage() {
  const t = useTranslations("webchatPage");
  const tCommon = useTranslations("common");
  const tChat = useTranslations("atendimentoChat");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;

  const [loading, setLoading] = useState(true);
  const [loadingToken, setLoadingToken] = useState(false);
  const [loadingWidget, setLoadingWidget] = useState(false);
  const [copying, setCopying] = useState(false);

  const [webchatConfigurado, setWebchatConfigurado] = useState(false);
  const [wssUrlFuncionando, setWssUrlFuncionando] = useState(false);
  const [backendWssFuncionando, setBackendWssFuncionando] = useState(false);
  const [modo, setModo] = useState<"backend" | "wss_legacy" | "ambos" | "nenhum">("nenhum");

  const [websocketToken, setWebsocketToken] = useState("");
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [enableMenuButtons, setEnableMenuButtons] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [widgetCode, setWidgetCode] = useState("");
  const sandboxIframeRef = useRef<HTMLIFrameElement>(null);

  // Link direto (PLANO_WEBCHAT_URL F2/F3)
  const [configForm, setConfigForm] = useState<WebchatConfigForm>(() => configToForm(null));
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Aba ativa da personalização: a pré-visualização segue a aba (editar o
  // formulário inicial mostra a tela do formulário; o resto mostra a conversa).
  const [configTab, setConfigTab] = useState("appearance");
  const [previewMode, setPreviewMode] = useState<"draft" | "live">("draft");

  useEffect(() => {
    const load = async () => {
      try {
        const [tenantRes, configRes, whatsappsRes] = await Promise.all([
          fetchTenantById(tenantId),
          verifyWebchatConfig(),
          fetchWhatsapps(),
        ]);

        const tenant = Array.isArray(tenantRes.data) ? tenantRes.data[0] : tenantRes.data;
        setWebsocketToken((tenant as Record<string, string>)?.websocketToken || "");

        setWebchatConfigurado(configRes.data.configurado);
        setWssUrlFuncionando(configRes.data.wssUrlFuncionando);
        setBackendWssFuncionando(configRes.data.backendWssFuncionando ?? false);
        setModo(configRes.data.modo ?? "nenhum");

        const sessions: Whatsapp[] = Array.isArray(whatsappsRes.data)
          ? whatsappsRes.data
          : (whatsappsRes.data as { whatsapps?: Whatsapp[] })?.whatsapps || [];

        const webchatSessions = sessions
          .filter((w) => w.type === "webchat" && !("isDeleted" in w && w.isDeleted))
          .map((w) => {
            // Campo novo fora da interface Whatsapp — ler via cast (probe §7:
            // chave presente no GET = backend novo; ausente = backend antigo).
            const rawConfig = (w as unknown as Record<string, unknown>).webchatConfig;
            return {
              label: w.name,
              value: w.wabaId || String(w.id),
              status: w.status,
              id: w.id,
              hasWebchatConfig: rawConfig !== undefined,
              webchatConfig: (rawConfig ?? null) as WebchatDirectConfig | null,
              wabaId: w.wabaId || "",
            };
          });

        setChannelOptions(webchatSessions);
      } catch {
        toast.error(t("errorLoad"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  // ── Link direto: derivados do canal selecionado ────────────────────────────
  const selectedOption = channelOptions.find((o) => o.value === selectedChannel);
  // Probe de capacidade: algum canal com a chave webchatConfig = backend novo.
  const directLinkCapable = channelOptions.some((o) => o.hasWebchatConfig);
  // Exige wabaId real: o backend resolve /chat/:wabaId só pela coluna uuid.
  const directLinkAvailable =
    !!selectedOption && selectedOption.hasWebchatConfig && !!selectedOption.wabaId;
  const savedConfig = selectedOption?.webchatConfig ?? null;
  const directLinkEnabled = savedConfig?.directLinkEnabled === true;
  const directLinkUrl = selectedOption?.wabaId
    ? buildDirectLinkUrl(selectedOption.wabaId)
    : "";

  // Re-inicializa o formulário ao trocar de canal (estado local ← config salva).
  useEffect(() => {
    const opt = channelOptions.find((o) => o.value === selectedChannel);
    setConfigForm(configToForm(opt?.webchatConfig ?? null));
    setHelpOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel]);

  // Atualiza o objeto do canal em memória após um PUT bem-sucedido.
  const aplicarConfigLocal = useCallback((wabaId: string, cfg: WebchatDirectConfig) => {
    setChannelOptions((prev) =>
      prev.map((o) =>
        o.value === wabaId ? { ...o, webchatConfig: cfg, hasWebchatConfig: true } : o
      )
    );
  }, []);

  const alternarLinkDireto = useCallback(
    async (novoValor: boolean) => {
      const opt = channelOptions.find((o) => o.value === selectedChannel);
      if (!opt || savingToggle) return;
      setSavingToggle(true);
      try {
        // Objeto completo a partir do salvo no GET (merge raso defensivo no back).
        const payload: WebchatDirectConfig = {
          ...(opt.webchatConfig ?? {}),
          directLinkEnabled: novoValor,
        };
        await updateWhatsapp(opt.id, { webchatConfig: payload });
        aplicarConfigLocal(opt.value, payload);
        toast.success(t("configSaveSuccess"));
      } catch {
        toast.error(t("configSaveError"));
      } finally {
        setSavingToggle(false);
      }
    },
    [channelOptions, selectedChannel, savingToggle, aplicarConfigLocal]
  );

  const salvarConfig = useCallback(async () => {
    const opt = channelOptions.find((o) => o.value === selectedChannel);
    if (!opt || savingConfig) return;
    setSavingConfig(true);
    try {
      const payload = montarConfigCompleta(
        opt.webchatConfig,
        configForm,
        opt.webchatConfig?.directLinkEnabled === true
      );
      await updateWhatsapp(opt.id, { webchatConfig: payload });
      aplicarConfigLocal(opt.value, payload);
      setConfigForm(configToForm(payload));
      toast.success(t("configSaveSuccess"));
    } catch {
      toast.error(t("configSaveError"));
    } finally {
      setSavingConfig(false);
    }
  }, [channelOptions, selectedChannel, savingConfig, configForm, aplicarConfigLocal]);

  const copiarLinkDireto = useCallback(async () => {
    if (!directLinkUrl) return;
    setCopyingLink(true);
    try {
      await navigator.clipboard.writeText(directLinkUrl);
      toast.success(t("directLinkCopied"));
    } catch {
      toast.error(t("directLinkCopyError"));
    } finally {
      setCopyingLink(false);
    }
  }, [directLinkUrl]);

  const alternarPreChatField = useCallback((field: string, checked: boolean) => {
    setConfigForm((prev) => {
      const fields = checked
        ? WEBCHAT_PRECHAT_FIELDS.filter((f) => f === field || prev.preChatFields.includes(f))
        : prev.preChatFields.filter((f) => f !== field);
      return {
        ...prev,
        preChatFields: fields,
        preChatRequired: prev.preChatRequired.filter((f) => fields.includes(f)),
      };
    });
  }, []);

  const alternarPreChatRequired = useCallback((field: string, checked: boolean) => {
    setConfigForm((prev) => ({
      ...prev,
      preChatRequired: checked
        ? WEBCHAT_PRECHAT_FIELDS.filter((f) => f === field || prev.preChatRequired.includes(f))
        : prev.preChatRequired.filter((f) => f !== field),
    }));
  }, []);

  const gerarNovoToken = useCallback(async () => {
    setLoadingToken(true);
    try {
      const novoToken = crypto.randomUUID();
      await updateTenantWebsocketToken(tenantId, novoToken);
      setWebsocketToken(novoToken);
      toast.success(t("successToken"));
    } catch {
      toast.error(t("errorToken"));
    } finally {
      setLoadingToken(false);
    }
  }, [tenantId]);

  const gerarWidget = useCallback(async () => {
    if (!selectedChannel) return;
    setLoadingWidget(true);
    try {
      const response = await getWebchatWidget(tenantId, selectedChannel, websocketToken, enableMenuButtons);
      const blob = response.data as Blob;

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `webchat-widget-${tenantId}-${selectedChannel}.js`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Show code in modal
      const text = await blob.text();
      setWidgetCode(text);
      setShowModal(true);

      toast.success(t("successWidget"));
    } catch {
      toast.error(t("errorWidget"));
    } finally {
      setLoadingWidget(false);
    }
  }, [tenantId, selectedChannel, websocketToken]);

  const copiarCodigo = useCallback(async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(widgetCode);
      toast.success(t("successCopy"));
    } catch {
      toast.error(t("errorCopy"));
    } finally {
      setCopying(false);
    }
  }, [widgetCode]);

  const abrirSandbox = useCallback(() => {
    setShowSandbox(true);
    setTimeout(() => {
      const iframe = sandboxIframeRef.current;
      if (!iframe) return;
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Sandbox</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .sandbox-info { text-align: center; color: #666; }
    .sandbox-info h2 { color: #333; margin-bottom: 8px; }
    .sandbox-info p { font-size: 14px; }
  </style>
</head>
<body>
  <div class="sandbox-info">
    <h2>Sandbox do Widget</h2>
    <p>O widget aparece no canto inferior direito.</p>
  </div>
  <script>${widgetCode}<\/script>
</body>
</html>`;
      iframe.srcdoc = html;
    }, 100);
  }, [widgetCode]);

  const getBannerVariant = () => {
    if (!webchatConfigurado) return "warning";
    if (!wssUrlFuncionando) return "error";
    return "success";
  };

  const bannerVariant = getBannerVariant();
  const showMigrationNotice = webchatConfigurado && (modo === "wss_legacy" || modo === "ambos");

  const preChatFieldLabels: Record<string, string> = {
    name: t("preChatFieldName"),
    email: t("preChatFieldEmail"),
    phone: t("preChatFieldPhone"),
    cpf: t("preChatFieldCpf"),
  };

  const pageTextLabels: Record<PageLabelKey, string> = {
    start: t("pageTextStart"),
    formTitle: t("pageTextFormTitle"),
    connecting: t("pageTextConnecting"),
    reconnecting: t("pageTextReconnecting"),
    unavailable: t("pageTextUnavailable"),
    retry: t("pageTextRetry"),
    send: t("pageTextSend"),
  };

  const botaoSalvarConfig = (
    <Button onClick={salvarConfig} disabled={savingConfig || savingToggle}>
      {savingConfig ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Save className="mr-2 h-4 w-4" />
      )}
      {tCommon("save")}
    </Button>
  );

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      />

      {/* ── Duas colunas em telas largas: config do widget | link direto ── */}
      <div
        className={`grid max-w-2xl grid-cols-1 items-start gap-6 xl:max-w-6xl ${
          directLinkCapable ? "xl:grid-cols-2" : ""
        }`}
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Banner */}
          <Alert
            className={
              bannerVariant === "success"
                ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                : bannerVariant === "error"
                ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                : "border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
            }
          >
            {bannerVariant === "success" && <CheckCircle className="h-4 w-4" />}
            {bannerVariant === "error" && <XCircle className="h-4 w-4" />}
            {bannerVariant === "warning" && <AlertTriangle className="h-4 w-4" />}
            <AlertDescription>
              {webchatConfigurado && wssUrlFuncionando && (
                <>
                  {t("statusOk")}
                  <br />
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${backendWssFuncionando ? "bg-green-500" : "bg-red-500"}`} />
                    {t("statusBackendWss")}: {backendWssFuncionando ? t("statusActive") : t("statusInactive")}
                  </span>
                  {(modo === "wss_legacy" || modo === "ambos") && (
                    <span className="flex items-center gap-1.5 mt-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                      {t("statusLegacyWss")}: {t("statusActive")}
                    </span>
                  )}
                  <br />
                  {t("statusWssGenerate")}
                </>
              )}
              {webchatConfigurado && !wssUrlFuncionando && (
                <>
                  {t("statusWssDown")}
                  <br />
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                    {t("statusBackendWss")}: {t("statusInactive")}
                  </span>
                  {t("statusWssDownHint")}
                </>
              )}
              {!webchatConfigurado && (
                <>
                  {t("statusNotConfigured")}
                  <br />
                  {t("statusNotConfiguredHint")}
                </>
              )}
            </AlertDescription>
          </Alert>

          {/* Migration Notice */}
          {showMigrationNotice && (
            <Alert className="border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{t("migrationTitle")}</strong>
                <br />
                {t("migrationDesc")}
                {modo === "ambos" && (
                  <>
                    <br />
                    {t("migrationBothActive")}
                  </>
                )}
                {modo === "wss_legacy" && !backendWssFuncionando && (
                  <>
                    <br />
                    {t("migrationLegacyOnly")}
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Token de Autenticação */}
          <div className="space-y-2">
            <Label>{t("tokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                value={websocketToken}
                onChange={() => {}}
                readOnly
                placeholder={t("tokenPlaceholder")}
                className="flex-1 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={gerarNovoToken}
                disabled={loadingToken || !webchatConfigurado}
                title={t("tokenRegenerate")}
              >
                <RefreshCw className={`h-4 w-4 ${loadingToken ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("tokenWarning")}
            </p>
          </div>

          {/* Seleção de Canal */}
          <div className="space-y-2">
            <Label>{t("channelLabel")}</Label>
            <Select
              value={selectedChannel}
              onValueChange={setSelectedChannel}
              disabled={!webchatConfigurado || !wssUrlFuncionando}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("channelPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {t("channelEmpty")}
                  </SelectItem>
                ) : (
                  channelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${opt.status === "CONNECTED" ? "bg-green-500" : "bg-red-500"}`} />
                        {opt.label}
                        {opt.status !== "CONNECTED" && (
                          <span className="text-xs text-muted-foreground">({t("channelDisconnected")})</span>
                        )}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Opções do Widget */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              id="enableMenuButtons"
              checked={enableMenuButtons}
              onCheckedChange={(v) => setEnableMenuButtons(!!v)}
              disabled={!webchatConfigurado || !wssUrlFuncionando}
            />
            <div className="space-y-0.5">
              <label htmlFor="enableMenuButtons" className="text-sm font-medium leading-none cursor-pointer">
                {t("enableMenuButtons")}
              </label>
              <p className="text-xs text-muted-foreground">{t("enableMenuButtonsDesc")}</p>
            </div>
          </div>

          {/* Botão Gerar Widget */}
          {(() => {
            const sel = channelOptions.find((o) => o.value === selectedChannel);
            const isDisconnected = selectedChannel && sel && sel.status !== "CONNECTED";
            const isDisabled =
              !webchatConfigurado ||
              !wssUrlFuncionando ||
              !selectedChannel ||
              loadingWidget ||
              !!isDisconnected;
            return (
              <div className="flex items-center gap-3">
                <Button onClick={gerarWidget} disabled={isDisabled}>
                  <Download className={`mr-2 h-4 w-4 ${loadingWidget ? "animate-pulse" : ""}`} />
                  {loadingWidget ? t("generating") : t("generateWidget")}
                </Button>
                {isDisconnected && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">{t("channelDisconnected")}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("widgetRequiresConnection")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── Coluna direita: formas de uso + link direto (PLANO_WEBCHAT_URL F2) ──
          Renderiza apenas com backend novo (algum canal com a chave webchatConfig). */}
      {directLinkCapable && (
        <div className="space-y-6 xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" /> {t("directLinkSectionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Code className="h-4 w-4 shrink-0" /> {t("embedOptionTitle")}
                </p>
                <p className="text-xs text-muted-foreground">{t("embedOptionDesc")}</p>
              </div>
              <div className="space-y-1 rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <LinkIcon className="h-4 w-4 shrink-0" /> {t("directLinkOptionTitle")}
                </p>
                <p className="text-xs text-muted-foreground">{t("directLinkOptionDesc")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Link direto do canal selecionado (probe de capacidade §7) ── */}
        {directLinkAvailable && selectedOption && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 min-w-0">
                <LinkIcon className="h-5 w-5 shrink-0" />
                <span className="truncate min-w-0">
                  {t("directLinkOptionTitle")}
                  <span className="font-normal text-muted-foreground"> — {selectedOption.label}</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle do link direto (salva imediatamente) */}
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="directLinkToggle" className="cursor-pointer">
                    {t("directLinkToggle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("directLinkToggleDesc")}</p>
                </div>
                <Switch
                  id="directLinkToggle"
                  checked={directLinkEnabled}
                  onCheckedChange={alternarLinkDireto}
                  disabled={savingToggle}
                />
              </div>

              {directLinkEnabled ? (
                <>
                  {/* URL pública + copiar */}
                  <div className="space-y-2">
                    <Label>{t("directLinkUrlLabel")}</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={directLinkUrl}
                        onChange={() => {}}
                        readOnly
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={copiarLinkDireto}
                        disabled={copyingLink}
                        className="shrink-0"
                      >
                        <Copy className="mr-2 h-4 w-4" /> {t("directLinkCopy")}
                      </Button>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <QrCode className="h-4 w-4" /> {t("directLinkQr")}
                    </p>
                    <div className="rounded-md bg-white p-3" style={{ colorScheme: "light" }}>
                      <QRCodeSVG
                        value={directLinkUrl}
                        size={180}
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                      {t("directLinkQrHint")}
                    </p>
                  </div>

                  {/* Ajuda colapsável */}
                  <Collapsible open={helpOpen} onOpenChange={setHelpOpen} className="rounded-lg border">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 p-3 text-sm font-medium"
                      >
                        <span className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 shrink-0" /> {t("directLinkHelpTitle")}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${helpOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="list-disc space-y-2 border-t p-3 pl-8 text-xs text-muted-foreground">
                        <li>{t("directLinkHelpParams")}</li>
                        <li>{t("directLinkHelpExamples")}</li>
                        <li>{t("directLinkHelpDevice")}</li>
                        <li>{t("directLinkHelpWebview")}</li>
                        <li>{t("directLinkHelpUnread")}</li>
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t("directLinkDisabledHint")}</p>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      )}

      {/* ── Personalização do link direto (F3) em abas — logo abaixo do card do
          widget: o span de 2 linhas deixa cada coluna fluir sem buraco. ── */}
      {directLinkAvailable && selectedOption && (
        <>
          <Card className="xl:col-start-1 xl:row-start-2 xl:row-span-2">
            <CardContent className="space-y-4 pt-6">
              <Tabs value={configTab} onValueChange={setConfigTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="appearance" className="gap-1.5">
                    <Palette className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("appearanceTitle")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="prechat" className="gap-1.5">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("preChatTitle")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="texts" className="gap-1.5">
                    <Type className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("pageTextsTitle")}</span>
                  </TabsTrigger>
                </TabsList>

                {/* ── Aparência (só a página do link direto — F3) ── */}
                <TabsContent value="appearance" className="space-y-4 pt-4">
                  <p className="text-xs text-muted-foreground">{t("appearanceDesc")}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wcAppearanceTitle">{t("appearanceTitleLabel")}</Label>
                  <Input
                    id="wcAppearanceTitle"
                    value={configForm.title}
                    onChange={(e) => setConfigForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder={t("appearanceTitlePlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wcAppearanceColor">{t("appearanceColorLabel")}</Label>
                  <div className="flex gap-2">
                    <input
                      id="wcAppearanceColor"
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(configForm.color)
                          ? configForm.color
                          : WEBCHAT_DEFAULT_COLOR
                      }
                      onChange={(e) => setConfigForm((p) => ({ ...p, color: e.target.value }))}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                    />
                    <Input
                      value={configForm.color}
                      onChange={(e) => setConfigForm((p) => ({ ...p, color: e.target.value }))}
                      className="flex-1 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wcAppearanceLogo">{t("appearanceLogoLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="wcAppearanceLogo"
                    type="url"
                    value={configForm.logoUrl}
                    onChange={(e) => setConfigForm((p) => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="https://"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setGalleryOpen(true)}
                    title={tChat("galleryPickerTitle")}
                  >
                    <Images className="h-4 w-4" />
                  </Button>
                </div>
                {configForm.logoUrl && /^https?:\/\//i.test(configForm.logoUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={configForm.logoUrl}
                    alt=""
                    className="h-10 w-auto max-w-[120px] rounded border object-contain bg-background"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wcAppearanceWelcome">{t("appearanceWelcomeLabel")}</Label>
                <Textarea
                  id="wcAppearanceWelcome"
                  rows={3}
                  value={configForm.welcomeMessage}
                  onChange={(e) => setConfigForm((p) => ({ ...p, welcomeMessage: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{t("appearanceWelcomeDesc")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wcAppearancePlaceholder">{t("appearancePlaceholderLabel")}</Label>
                <Input
                  id="wcAppearancePlaceholder"
                  value={configForm.placeholder}
                  onChange={(e) => setConfigForm((p) => ({ ...p, placeholder: e.target.value }))}
                />
              </div>
                </TabsContent>

                {/* ── Formulário inicial (pré-chat) ── */}
                <TabsContent value="prechat" className="space-y-4 pt-4">
                  <p className="text-xs text-muted-foreground">{t("preChatDesc")}</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <Label htmlFor="wcPreChatEnable" className="cursor-pointer">
                  {t("preChatEnable")}
                </Label>
                <Switch
                  id="wcPreChatEnable"
                  checked={configForm.preChatEnabled}
                  onCheckedChange={(v) => setConfigForm((p) => ({ ...p, preChatEnabled: v }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("preChatFields")}</Label>
                  <div className="space-y-2">
                    {WEBCHAT_PRECHAT_FIELDS.map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <Checkbox
                          id={`wcPreChatField-${field}`}
                          checked={configForm.preChatFields.includes(field)}
                          onCheckedChange={(v) => alternarPreChatField(field, !!v)}
                        />
                        <label
                          htmlFor={`wcPreChatField-${field}`}
                          className="cursor-pointer text-sm"
                        >
                          {preChatFieldLabels[field]}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("preChatRequired")}</Label>
                  <div className="space-y-2">
                    {WEBCHAT_PRECHAT_FIELDS.map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <Checkbox
                          id={`wcPreChatRequired-${field}`}
                          checked={configForm.preChatRequired.includes(field)}
                          onCheckedChange={(v) => alternarPreChatRequired(field, !!v)}
                          disabled={!configForm.preChatFields.includes(field)}
                        />
                        <label
                          htmlFor={`wcPreChatRequired-${field}`}
                          className={`text-sm ${configForm.preChatFields.includes(field) ? "cursor-pointer" : "text-muted-foreground"}`}
                        >
                          {preChatFieldLabels[field]}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wcPrivacyText">{t("preChatPrivacyText")}</Label>
                <Textarea
                  id="wcPrivacyText"
                  rows={3}
                  value={configForm.privacyText}
                  onChange={(e) => setConfigForm((p) => ({ ...p, privacyText: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{t("preChatPrivacyTextDesc")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wcPrivacyUrl">{t("preChatPrivacyUrl")}</Label>
                <Input
                  id="wcPrivacyUrl"
                  type="url"
                  value={configForm.privacyUrl}
                  onChange={(e) => setConfigForm((p) => ({ ...p, privacyUrl: e.target.value }))}
                  placeholder="https://"
                />
              </div>
                </TabsContent>

                {/* ── Textos da página pública (labels) ── */}
                <TabsContent value="texts" className="space-y-4 pt-4">
                  <p className="text-xs text-muted-foreground">{t("pageTextsDesc")}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PAGE_LABEL_KEYS.map((k) => (
                  <div key={k} className="space-y-2">
                    <Label htmlFor={`wcPageText-${k}`}>{pageTextLabels[k]}</Label>
                    <Input
                      id={`wcPageText-${k}`}
                      value={configForm.labels[k]}
                      onChange={(e) =>
                        setConfigForm((p) => ({
                          ...p,
                          labels: { ...p.labels, [k]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
                </TabsContent>
              </Tabs>

              {botaoSalvarConfig}
            </CardContent>
          </Card>

          {/* ── Pré-visualização: rascunho ao vivo (React) ou página publicada ── */}
          <Card className="xl:col-start-2 xl:row-start-3">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" /> {t("previewTitle")}
                </CardTitle>
                <Tabs
                  value={previewMode}
                  onValueChange={(v) => setPreviewMode(v as "draft" | "live")}
                >
                  <TabsList>
                    <TabsTrigger value="draft">{t("previewModeDraft")}</TabsTrigger>
                    <TabsTrigger value="live">{t("previewModeLive")}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <CardDescription className="text-xs">
                {previewMode === "draft" ? t("previewDraftHint") : t("previewHint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewMode === "draft" ? (
                <DirectLinkPreview
                  channelName={selectedOption.label}
                  title={configForm.title}
                  color={configForm.color}
                  logoUrl={configForm.logoUrl}
                  welcomeMessage={configForm.welcomeMessage}
                  placeholder={configForm.placeholder}
                  preChatEnabled={configForm.preChatEnabled}
                  preChatFields={configForm.preChatFields}
                  preChatRequired={configForm.preChatRequired}
                  privacyText={configForm.privacyText}
                  privacyUrl={configForm.privacyUrl}
                  labelFormTitle={configForm.labels.formTitle}
                  labelStart={configForm.labels.start}
                  showPreChat={configTab === "prechat"}
                />
              ) : directLinkEnabled ? (
                <iframe
                  key={directLinkUrl}
                  src={directLinkUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  className="mx-auto h-[600px] w-full max-w-[420px] rounded-lg border bg-white"
                  title={t("previewTitle")}
                />
              ) : (
                <p className="text-xs text-muted-foreground">{t("previewUnavailable")}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </div>

      {/* Modal com código do widget */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("modalTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={copiarCodigo} disabled={copying} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                {copying ? t("copying") : t("copyCode")}
              </Button>
              <Button onClick={abrirSandbox} variant="outline">
                <Play className="mr-2 h-4 w-4" />
                {t("sandbox")}
              </Button>
            </div>
            <Textarea
              value={widgetCode}
              readOnly
              className="font-mono text-xs min-h-[300px]"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Widget Sandbox */}
      <Dialog open={showSandbox} onOpenChange={setShowSandbox}>
        <DialogContent className="max-w-5xl w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-4">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t("sandboxTitle")}</DialogTitle>
          </DialogHeader>
          <iframe
            ref={sandboxIframeRef}
            className="flex-1 w-full rounded-lg border bg-white min-h-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Widget Sandbox"
          />
        </DialogContent>
      </Dialog>

      {/* Galeria (escolher ou enviar imagem) para o logotipo do link direto */}
      <GalleryPickerWithUploadDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        galleryFileType="image"
        uploadAccept="image/*"
        onPick={(item) => setConfigForm((p) => ({ ...p, logoUrl: toAbsoluteUrl(item.url) }))}
      />
    </div>
  );
}
