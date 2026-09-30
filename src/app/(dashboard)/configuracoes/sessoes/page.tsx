"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { getProxyBaseUrl, OAUTH_PROXY_URL } from "@/config/oauth-proxy";
import { useOAuthProxyDomain } from "@/hooks/use-oauth-proxy-domain";
import { channelCreateErrorKey } from "@/lib/channel-create-error";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Wifi, WifiOff, Loader2, QrCode, Star, Trash2, RefreshCw, TriangleAlert,
  Plus, MessageCircle, Instagram, Facebook, Download,
  ArrowDownAZ, Tag, Layers2, Building2, Signal,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  fetchWhatsapps,
  deleteWhatsapp,
  disconnectSession,
  setDefaultWhatsapp,
  resetBaileysConnection,
} from "@/services/whatsapp";
import { listActiveAppWabas, exchangeEmbeddedSignupCode, type AppWaba } from "@/services/waba-meta";
import { useWhatsappStore, type WhatsApp as Whatsapp } from "@/stores/whatsapp-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchTenantById } from "@/services/tenants";
import { getWebchatWidget } from "@/services/webchat";
import { useAuthStore } from "@/stores/auth-store";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: any;
  }
}

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

const CHANNEL_LOGOS: Record<string, string> = {
  baileys: "/baileys-logo.png",
  whatsapp: "/whatsapp-logo.png",
  waba: "/waba-logo.png",
  evo: "/evo-logo.png",
  evogo: "/evogo-logo.png",
  meow: "/meow-logo.png",
  telegram: "/telegram-logo.png",
  instagram: "/instagram-logo.png",
  facebook: "/facebook-logo.png",
  messenger: "/messenger-logo.png",
  webchat: "/webchat-logo.png",
  uazapi: "/uazapi-logo.png",
  zapi: "/zapi-logo.png",
  zapo: "/zapo-logo.png",
  webmail: "/webmail-logo.png",
  email: "/email-logo.png",
  hub: "/hub-logo.png",
  hub_telegram: "/hub_telegram-logo.png",
  hub_instagram: "/hub_instagram-logo.png",
  hub_facebook: "/hub_facebook-logo.png",
  hub_whatsapp: "/hub_whatsapp-logo.png",
  hub_whatsapp_business_account: "/hub_whatsapp_business_account-logo.png",
  hub_email: "/hub_email-logo.png",
  hub_sms: "/hub_sms-logo.png",
  hub_webchat: "/hub_webchat-logo.png",
  hub_widget: "/hub_widget-logo.png",
  hub_twitter: "/hub_twitter-logo.png",
  hub_linkedin: "/hub_linkedin-logo.png",
  hub_youtube: "/hub_youtube-logo.png",
  hub_olx: "/hub_olx-logo.png",
  hub_ifood: "/hub_ifood-logo.png",
  linkedin: "/linkedin-logo.png",
  mercadolivre: "/hub_mercadolivre-logo.png",
  hub_mercadolivre: "/hub_mercadolivre-logo.png",
  hub_mercado_livre: "/hub_mercado_livre-logo.png",
  hub_ticktok: "/hub_ticktok-logo.png",
  olx: "/olx-logo.png",
  youtube: "/youtube-logo.png",
  tiktok: "/tiktok-logo.png",
  woocommerce: "/woocommerce-logo.png",
  nuvemshop: "/nuvemshop-logo.png",
};

function getChannelLogo(type?: string): string | null {
  if (!type) return null;
  const key = type.toLowerCase();
  if (CHANNEL_LOGOS[key]) return CHANNEL_LOGOS[key];
  if (key.startsWith("hub")) return CHANNEL_LOGOS["hub"];
  return null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "CONNECTED") return <Wifi className="h-8 w-8 text-green-500" />;
  if (status === "DISCONNECTED") return <WifiOff className="h-8 w-8 text-red-500" />;
  if (status === "OPENING") return <Loader2 className="h-8 w-8 text-green-600 animate-spin" />;
  if (status === "qrcode") return <QrCode className="h-8 w-8 text-blue-500" />;
  if (["PAIRING", "TIMEOUT"].includes(status)) return <TriangleAlert className="h-8 w-8 text-red-400" />;
  return <WifiOff className="h-8 w-8 text-muted-foreground" />;
}

function StatusDescription({ item, t }: { item: Whatsapp; t: (key: string) => string }) {
  const { status, type, number, tokenAPI, wabaId } = item;

  if (status === "qrcode") {
    return (
      <div>
        <p className="font-medium text-sm">{t("statusQrcode")}</p>
        <p className="text-xs text-muted-foreground">{t("statusQrcodeDesc")}</p>
      </div>
    );
  }
  if (status === "DISCONNECTED") {
    return (
      <div>
        <p className="font-medium text-sm">{t("statusDisconnected")}</p>
        {(type === "whatsapp" || type === "baileys" || type === "zapo") && (
          <p className="text-xs text-muted-foreground">{t("statusDisconnectedBaileys")}</p>
        )}
        {type === "waba" && <p className="text-xs text-muted-foreground">{t("statusDisconnectedWaba")}</p>}
        {type === "telegram" && <p className="text-xs text-muted-foreground">{t("statusDisconnectedTelegram")}</p>}
        {type === "instagram" && <p className="text-xs text-muted-foreground">{t("statusDisconnectedInstagram")}</p>}
      </div>
    );
  }
  if (status === "CONNECTED") {
    if (type === "waba") {
      return (
        <div>
          <p className="font-medium text-sm">{t("statusConnectedWaba")}</p>
          {tokenAPI && <p className="text-xs text-muted-foreground font-mono">{tokenAPI}</p>}
        </div>
      );
    }
    if (type === "meow" || type === "evo" || type === "evogo") {
      return (
        <div>
          <p className="font-medium text-sm">{t("statusConnected")}</p>
          {(number || wabaId) && (
            <p className="text-xs text-muted-foreground">{number}{wabaId ? ` || ${wabaId}` : ""}</p>
          )}
        </div>
      );
    }
    return (
      <div>
        <p className="font-medium text-sm">{t("statusConnected")}</p>
        {number && <p className="text-xs text-muted-foreground">{number}</p>}
        {item.phone && (item.phone.pushname || item.phone.name) && (
          <p className="text-xs text-muted-foreground">{item.phone.pushname || item.phone.name}</p>
        )}
      </div>
    );
  }
  if (["PAIRING", "TIMEOUT"].includes(status)) {
    return (
      <div>
        <p className="font-medium text-sm">{t("statusPairing")}</p>
        <p className="text-xs text-muted-foreground">{t("statusPairingDesc")}</p>
      </div>
    );
  }
  if (status === "OPENING") {
    return (
      <div>
        <p className="font-medium text-sm">{t("statusOpening")}</p>
        <p className="text-xs text-muted-foreground">{t("statusOpeningDesc")}</p>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">{status}</p>;
}

type ConfirmAction = { type: "delete" | "disconnect" | "reset"; item: Whatsapp } | null;

type SortMode = "default" | "alpha" | "byType" | "grouped" | "byProvider" | "byStatus";

const PROVIDER_GROUPS: { key: string; labelKey: string; types: string[] }[] = [
  // Meta Oficial: WABA direto + BSPs alternativos (Dialog360 / Gupshup) abaixo de waba.
  { key: "meta", labelKey: "channelGroupMeta", types: ["waba_oauth", "waba", "dialog360", "gupshup", "instagram_oauth", "facebook_oauth", "instagram", "messenger", "messenger_oauth"] },
  { key: "unofficial", labelKey: "channelGroupUnofficial", types: ["baileys", "zapo", "whatsapp", "evo", "evogo", "meow", "zapi", "uazapi"] },
  { key: "outros", labelKey: "channelGroupOthers", types: ["telegram", "webmail", "email", "webchat", "hub"] },
];
function getProviderGroup(type: string) {
  return PROVIDER_GROUPS.find((g) => g.types.includes(type) || (type?.startsWith("hub") && g.key === "outros")) ?? PROVIDER_GROUPS[2];
}

const STATUS_GROUPS: { key: string; labelKey: string; color: string }[] = [
  { key: "connected",    labelKey: "statusGroupConnected",    color: "#22c55e" },
  { key: "qrcode",       labelKey: "statusGroupQrcode",       color: "#3b82f6" },
  { key: "pairing",      labelKey: "statusGroupPairing",      color: "#f59e0b" },
  { key: "connecting",   labelKey: "statusGroupConnecting",   color: "#f59e0b" },
  { key: "opening",      labelKey: "statusGroupOpening",      color: "#f59e0b" },
  { key: "timeout",      labelKey: "statusGroupTimeout",      color: "#f97316" },
  { key: "disconnected", labelKey: "statusGroupDisconnected", color: "#ef4444" },
];
function getStatusGroup(status: string) {
  const key = (status || "").toLowerCase();
  return STATUS_GROUPS.find((g) => g.key === key) ?? { key, labelKey: "statusGroupDisconnected", color: "#ef4444" };
}

export default function ConfigSessoesPage() {
  const t = useTranslations("configSessoesPage");
  const tw = useTranslations("webchatPage");
  // Erros de criacao de canal do popup OAuth reusam as chaves de sessoesPage.
  const tSess = useTranslations("sessoesPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const { whatsapps: channels, setWhatsapps, removeWhatsapp: removeWhatsappFromStore } = useWhatsappStore();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const sortedChannels = React.useMemo(() => {
    const list = [...channels];
    if (sortMode === "alpha") {
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
    }
    if (sortMode === "byType" || sortMode === "grouped") {
      return list.sort((a, b) => {
        const tc = (a.type || "").localeCompare(b.type || "", "pt-BR");
        return tc !== 0 ? tc : (a.name || "").localeCompare(b.name || "", "pt-BR");
      });
    }
    if (sortMode === "byProvider") {
      return list.sort((a, b) => {
        const pa = PROVIDER_GROUPS.indexOf(getProviderGroup(a.type || ""));
        const pb = PROVIDER_GROUPS.indexOf(getProviderGroup(b.type || ""));
        return pa !== pb ? pa - pb : (a.name || "").localeCompare(b.name || "", "pt-BR");
      });
    }
    if (sortMode === "byStatus") {
      return list.sort((a, b) => {
        const sa = STATUS_GROUPS.indexOf(getStatusGroup(a.status));
        const sb = STATUS_GROUPS.indexOf(getStatusGroup(b.status));
        const ia = sa === -1 ? STATUS_GROUPS.length : sa;
        const ib = sb === -1 ? STATUS_GROUPS.length : sb;
        return ia !== ib ? ia - ib : (a.name || "").localeCompare(b.name || "", "pt-BR");
      });
    }
    return list;
  }, [channels, sortMode]);

  // ── Widget generation
  const [widgetDialogItem, setWidgetDialogItem] = useState<Whatsapp | null>(null);
  const [enableMenuButtons, setEnableMenuButtons] = useState(false);
  const [generatingWidget, setGeneratingWidget] = useState(false);
  const [websocketToken, setWebsocketToken] = useState<string>("");

  const openWidgetDialog = useCallback(async (item: Whatsapp) => {
    setWidgetDialogItem(item);
    setEnableMenuButtons(false);
    try {
      const res = await fetchTenantById(tenantId);
      const tenant = Array.isArray(res.data) ? res.data[0] : res.data;
      setWebsocketToken((tenant as Record<string, string>)?.websocketToken || "");
    } catch {
      setWebsocketToken("");
    }
  }, [tenantId]);

  const handleGenerateWidget = useCallback(async () => {
    if (!widgetDialogItem?.wabaId) return;
    setGeneratingWidget(true);
    try {
      const response = await getWebchatWidget(tenantId, widgetDialogItem.wabaId, websocketToken, enableMenuButtons);
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `webchat-widget-${tenantId}-${widgetDialogItem.wabaId}.js`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(tw("successWidget"));
      setWidgetDialogItem(null);
    } catch {
      toast.error(tw("errorWidget"));
    } finally {
      setGeneratingWidget(false);
    }
  }, [widgetDialogItem, tenantId, websocketToken, enableMenuButtons, tw]);

  // ── Add Channel (Meta OAuth)
  const [appWabaList, setAppWabaList] = useState<AppWaba[]>([]);
  const [selectedAppWabaId, setSelectedAppWabaId] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [facebookSDKLoaded, setFacebookSDKLoaded] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const sdkScriptRef = useRef<HTMLScriptElement | null>(null);
  const proxyPopupRef = useRef<Window | null>(null);

  // Phase 12 — respects tenant's oauthCustomDomain when set, falls back to oauth.techprovider.com.br
  const { customDomain: oauthCustomDomain } = useOAuthProxyDomain();
  const PROXY_URL = getProxyBaseUrl(oauthCustomDomain);

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const usingProxy = PROXY_URL !== "" && selectedAppWabaId === "__PROXY__";
  const appWaba = usingProxy ? null : (appWabaList.find((a) => String(a.id) === selectedAppWabaId) ?? null);
  const canWhatsApp = usingProxy || !!appWaba?.configId;
  const canInstagram = usingProxy || !!(appWaba as any)?.appInstagramId;
  const canFacebook = usingProxy || !!appWaba?.appId;

  const setBusy = (id: number, val: boolean) =>
    setActionLoading((prev) => ({ ...prev, [id]: val }));

  const loadChannels = useCallback(async () => {
    try {
      const { data } = await fetchWhatsapps();
      setWhatsapps(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoadSessions"));
    } finally {
      setLoading(false);
    }
  }, [setWhatsapps]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // ── Load AppWaba list on mount
  useEffect(() => {
    listActiveAppWabas()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setAppWabaList(list);
        // Auto-select proxy option if PROXY_URL is configured
        if (PROXY_URL) {
          setSelectedAppWabaId("__PROXY__");
        } else if (list.length > 0) {
          setSelectedAppWabaId(String(list[0].id));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for OAuth popup callbacks (same-origin)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_COMPLETE") return;
      if (event.data.status === "success") {
        toast.success(event.data.message || t("channelCreated"));
        loadChannels();
        setShowAddDialog(false);
      } else if (event.data.status === "error") {
        toast.error(event.data.message || t("errorOAuth"));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [loadChannels]);

  // Phase 13.c — Listen for postMessage from the OAuth Proxy popup.
  // With oauthCustomDomain, the popup is a /meta-frame wrapper at the custom
  // domain (iframe wraps the canonical signup HTML). Without it, popup opens
  // directly on the canonical proxy.
  useEffect(() => {
    function handleProxyMessage(event: MessageEvent) {
      if (event.origin !== OAUTH_PROXY_URL) return;
      const metaExpectedOrigin = OAUTH_PROXY_URL;
      const { type, error, errorCode } = (event.data || {}) as { type?: string; error?: string; errorCode?: string | null; data?: unknown };
      if (type === "proxy:ready") {
        const popup = proxyPopupRef.current;
        if (!popup || popup.closed) return;
        const rawToken = localStorage.getItem("token");
        const authToken = rawToken ? JSON.parse(rawToken) : null;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
        const appWabaId = !usingProxy && appWaba?.id ? Number(appWaba.id) : null;
        popup.postMessage(
          { type: "proxy:credentials", apiUrl, authToken, tenantId: appWaba?.tenantId ?? null, webhookOrigin: usingProxy ? 'zdg_oauth' : 'own_app', appWabaId },
          metaExpectedOrigin
        );
        // When using proxy mode, button is shown immediately after load signal — no extra wait needed
      } else if (type === "proxy:success") {
        toast.success(t("whatsappChannelCreated"));
        loadChannels();
        setShowAddDialog(false);
        setAddingChannel(false);
        proxyPopupRef.current = null;
      } else if (type === "proxy:cancelled") {
        toast.info(t("whatsappOAuthCancelled"));
        setAddingChannel(false);
        proxyPopupRef.current = null;
      } else if (type === "proxy:error") {
        // Proxy novo manda errorCode; proxy antigo so a mensagem — mesmo mapa.
        const key = channelCreateErrorKey(errorCode || error);
        toast.error(key ? tSess(key) : (error || t("errorWhatsappOAuth")));
        setAddingChannel(false);
        proxyPopupRef.current = null;
      }
    }
    window.addEventListener("message", handleProxyMessage);
    return () => window.removeEventListener("message", handleProxyMessage);
  }, [selectedAppWabaId, appWaba, loadChannels, t, tSess, oauthCustomDomain]);

  function buildMetaPopupUrl(channel: "waba" | "instagram" | "facebook"): string {
    const cb = encodeURIComponent(window.location.origin);
    return `${OAUTH_PROXY_URL}/${channel}-signup?callbackOrigin=${cb}`;
  }

  // ── Reload FB SDK when selected app changes (needed for WhatsApp Embedded Signup)
  useEffect(() => {
    if (canWhatsApp && appWaba) {
      // If SDK already loaded for a different appId, reinit
      if (window.FB) {
        window.FB.init({
          appId: appWaba.appId,
          cookie: true,
          xfbml: true,
          version: (appWaba as any).apiVersion || "v19.0",
        });
        setFacebookSDKLoaded(true);
      } else {
        loadFacebookSDK();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppWabaId]);

  function loadFacebookSDK() {
    if (window.FB) { setFacebookSDKLoaded(true); return; }
    if (sdkScriptRef.current) return;
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: appWaba!.appId,
        cookie: true,
        xfbml: true,
        version: appWaba!.apiVersion || "v19.0",
      });
      setFacebookSDKLoaded(true);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    sdkScriptRef.current = script;
  }

  function launchWhatsAppOAuth() {
    if (usingProxy) {
      setAddingChannel(true);
      const popup = window.open(buildMetaPopupUrl("waba"), "waba-proxy-signup", "width=600,height=700");
      proxyPopupRef.current = popup;
      return;
    }
    if (appWaba?.configId) {
      setAddingChannel(true);
      const popup = window.open(buildMetaPopupUrl("waba"), "waba-proxy-signup", "width=600,height=700");
      proxyPopupRef.current = popup;
      return;
    }
    // Default: direct FB SDK flow
    if (!isHttps) {
      toast.error(t("whatsappOAuthRequiresHttps"));
      return;
    }
    if (!window.FB) { toast.error(t("facebookSdkNotLoaded")); return; }
    setAddingChannel(true);
    window.FB.login(
      (response: any) => {
        if (response.authResponse?.code) {
          exchangeEmbeddedSignupCode({ code: response.authResponse.code })
            .then(() => {
              toast.success(t("whatsappChannelCreated"));
              loadChannels();
              setShowAddDialog(false);
            })
            .catch((err: any) => {
              toast.error(err?.response?.data?.message || t("errorWhatsappOAuth"));
            })
            .finally(() => setAddingChannel(false));
        } else {
          toast.info(t("whatsappOAuthCancelled"));
          setAddingChannel(false);
        }
      },
      {
        config_id: appWaba!.configId,
        response_type: "code",
        override_default_response_type: true,
        // whatsapp_business_app_onboarding: habilita onboarding de numero que ja
        // esta no app WhatsApp Business (coexistencia) com opt-in de compartilhar
        // o historico de conversas — mesmo featureType usado no oauth-proxy
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      }
    );
  }

  async function launchInstagramOAuth() {
    window.open(buildMetaPopupUrl("instagram"), "instagram-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
  }

  async function launchFacebookOAuth() {
    window.open(buildMetaPopupUrl("facebook"), "facebook-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
  }

  const handleConfirm = useCallback(async () => {
    if (!confirm) return;
    const { type, item } = confirm;
    setBusy(item.id, true);
    setConfirm(null);
    try {
      if (type === "delete") {
        await deleteWhatsapp(item.id);
        removeWhatsappFromStore(item.id);
        toast.success(t("successDeleted"));
      } else if (type === "disconnect") {
        await disconnectSession(item.id);
        toast.success(t("successDisconnected"));
      } else if (type === "reset") {
        const res = await resetBaileysConnection(item.id);
        if ((res.data as { success?: boolean })?.success) {
          toast.success(t("baileysReset"));
          await loadChannels();
        } else {
          toast.error(t("errorBaileysReset"));
        }
      }
    } catch {
      toast.error(t("errorAction"));
    } finally {
      setBusy(item.id, false);
    }
  }, [confirm, loadChannels]);

  const handleSetDefault = useCallback(async (item: Whatsapp) => {
    setBusy(item.id, true);
    try {
      await setDefaultWhatsapp(item.id);
      await loadChannels();
      toast.success(t("defaultSessionSet"));
    } catch {
      toast.error(t("errorSetDefault"));
    } finally {
      setBusy(item.id, false);
    }
  }, [loadChannels]);

  const confirmLabels: Record<string, { title: string; description: (name: string) => string; action: string }> = {
    delete: { title: t("confirmDeleteTitle"), description: (n) => t("confirmDeleteDesc", { name: n }), action: t("confirmDeleteAction") },
    disconnect: { title: t("confirmDisconnectTitle"), description: (n) => t("confirmDisconnectDesc", { name: n }), action: t("confirmDisconnectAction") },
    reset: { title: t("confirmResetTitle"), description: (n) => t("confirmResetDesc", { name: n }), action: t("confirmResetAction") },
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("pageTitle")}
          description={t("pageDescription")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            ],
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      >
        <Button variant="outline" onClick={loadChannels}>
          <RefreshCw className="mr-2 h-4 w-4" /> {t("refreshBtn")}
        </Button>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("addChannelBtn")}
        </Button>
      </PageHeader>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">{t("viewMode")}</span>
            {(["default","alpha","byType","grouped","byProvider","byStatus"] as SortMode[]).map((m) => {
              const labels: Record<SortMode, { label: string; icon: React.ReactNode }> = {
                default:    { label: t("sortDefault"),    icon: <Layers2 className="w-3 h-3" /> },
                alpha:      { label: t("sortAlpha"),      icon: <ArrowDownAZ className="w-3 h-3" /> },
                byType:     { label: t("sortByType"),     icon: <Tag className="w-3 h-3" /> },
                grouped:    { label: t("sortGrouped"),    icon: <Layers2 className="w-3 h-3" /> },
                byProvider: { label: t("sortByProvider"), icon: <Building2 className="w-3 h-3" /> },
                byStatus:   { label: t("sortByStatus"),   icon: <Signal className="w-3 h-3" /> },
              };
              return (
                <Button
                  key={m}
                  size="sm"
                  variant={sortMode === m ? "default" : "outline"}
                  className="gap-1 h-7 text-xs px-2"
                  onClick={() => setSortMode(m)}
                >
                  {labels[m].icon}{labels[m].label}
                </Button>
              );
            })}
          </div>
        {(() => {
          const renderCard = (item: Whatsapp) => {
            const busy = actionLoading[item.id] ?? false;
            const canDisconnect =
              ["OPENING", "CONNECTED", "PAIRING", "TIMEOUT"].includes(item.status) &&
              !item.type?.includes("hub");

            return (
              <Card key={item.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {item.profilePic &&
                    item.profilePic !== "disabled" &&
                    !item.profilePic.includes("nopicture.png") &&
                    (item.profilePic.startsWith("http") || item.profilePic.startsWith("/")) ? (
                      <img
                        src={item.profilePic}
                        alt={t("profileImgAlt")}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : getChannelLogo(item.type) ? (
                      <img
                        src={getChannelLogo(item.type)!}
                        alt={item.type}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold">
                        {item.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{item.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">#{item.id} · {item.type}</p>
                    </div>
                    {item.isDefault && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pb-2">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={item.status} />
                    <StatusDescription item={item} t={t} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("updatedAtLabel")}: {item.updatedAt ? formatDate(item.updatedAt) : "—"}
                  </p>
                  <Badge
                    variant={item.status === "CONNECTED" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {item.status}
                  </Badge>
                </CardContent>

                <CardFooter className="flex flex-wrap gap-2 pt-2 border-t">
                  {item.type === "webchat" && item.wabaId && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => openWidgetDialog(item)}
                      title={tw("generateWidget")}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {tw("generateWidget")}
                    </Button>
                  )}
                  {canDisconnect && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setConfirm({ type: "disconnect", item })}
                    >
                      {t("disconnectBtn")}
                    </Button>
                  )}
                  {item.type === "baileys" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm({ type: "reset", item })}
                      title={t("resetBaileysTitle")}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !!item.isDefault}
                    onClick={() => handleSetDefault(item)}
                    title={t("setDefaultTitle")}
                  >
                    <Star className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setConfirm({ type: "delete", item })}
                    className="text-destructive hover:text-destructive ml-auto"
                    title={t("deleteTitle")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardFooter>
              </Card>
            );
          };

          // Agrupado: por type (com logo do canal no header do grupo)
          if (sortMode === "grouped") {
            const groups = sortedChannels.reduce<Record<string, Whatsapp[]>>((acc, ch) => {
              const key = ch.type || "outros";
              (acc[key] = acc[key] || []).push(ch);
              return acc;
            }, {});
            return (
              <div className="space-y-6">
                {Object.entries(groups).map(([type, items]) => (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getChannelLogo(type) ?? ""}
                        alt={type}
                        className="w-5 h-5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {type}
                      </h3>
                      <span className="text-xs text-muted-foreground">({items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map((ch) => renderCard(ch))}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          // Por provedor: META Oficial / Não Oficiais / Outros
          if (sortMode === "byProvider") {
            return (
              <div className="space-y-6">
                {PROVIDER_GROUPS.map((pg) => {
                  const items = sortedChannels.filter((ch) => getProviderGroup(ch.type || "").key === pg.key);
                  if (!items.length) return null;
                  return (
                    <div key={pg.key}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          {t(pg.labelKey as Parameters<typeof t>[0])}
                        </h3>
                        <span className="text-xs text-muted-foreground">({items.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((ch) => renderCard(ch))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          // Por status: Conectado / QR / Desconectado / ...
          if (sortMode === "byStatus") {
            const statusGroups = STATUS_GROUPS.map((sg) => ({
              ...sg,
              items: sortedChannels.filter((ch) => (ch.status || "").toLowerCase() === sg.key),
            })).filter((sg) => sg.items.length > 0);
            const unknown = sortedChannels.filter((ch) => !STATUS_GROUPS.some((sg) => sg.key === (ch.status || "").toLowerCase()));
            return (
              <div className="space-y-6">
                {statusGroups.map((sg) => (
                  <div key={sg.key}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sg.color }} />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t(sg.labelKey as Parameters<typeof t>[0])}
                      </h3>
                      <span className="text-xs text-muted-foreground">({sg.items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sg.items.map((ch) => renderCard(ch))}
                    </div>
                  </div>
                ))}
                {unknown.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-muted-foreground/40" />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("statusGroupDisconnected" as Parameters<typeof t>[0])}
                      </h3>
                      <span className="text-xs text-muted-foreground">({unknown.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {unknown.map((ch) => renderCard(ch))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // Default / alpha / byType: grid plano
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedChannels.map((item) => renderCard(item))}
            </div>
          );
        })()}
        </>
      )}

      {/* ── Add Channel Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => !addingChannel && setShowAddDialog(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addMetaDialogTitle")}</DialogTitle>
          </DialogHeader>

          {appWabaList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {t("noMetaApp")}
            </p>
          ) : (
            <div className="space-y-4 py-2">
              {/* Seletor de App */}
              <div className="space-y-1.5">
                <Label>{t("metaAppLabel")}</Label>
                <Select
                  value={selectedAppWabaId}
                  onValueChange={(v) => {
                    setSelectedAppWabaId(v);
                    setFacebookSDKLoaded(false);
                    sdkScriptRef.current = null;
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("metaAppPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROXY_URL && (
                      <SelectItem value="__PROXY__">
                        🔒 OAuth Proxy ({PROXY_URL.replace(/^https?:\/\//, "")})
                      </SelectItem>
                    )}
                    {appWabaList.map((a) => (
                      <SelectItem key={String(a.id)} value={String(a.id)}>
                        {(a as any).description || a.appId || `App #${a.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {usingProxy && (
                  <p className="text-xs text-muted-foreground">
                    Credenciais gerenciadas pelo proxy — nenhuma configuração local necessária.
                  </p>
                )}
                {appWaba && (
                  <p className="text-xs text-muted-foreground">
                    App ID: <span className="font-mono">{appWaba.appId}</span>
                    {(appWaba as any).apiVersion && ` · ${(appWaba as any).apiVersion}`}
                  </p>
                )}
              </div>

              {/* Botões OAuth do app selecionado */}
              {(appWaba || usingProxy) && (
                <div className="grid gap-2">
                  {canWhatsApp && (
                    <button
                      onClick={launchWhatsAppOAuth}
                      disabled={addingChannel || (!usingProxy && !isHttps)}
                      className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 shrink-0">
                        <MessageCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">WhatsApp OAuth</p>
                        <p className="text-xs text-muted-foreground">
                          {(!usingProxy && !isHttps) ? t("requiresHttps") : addingChannel ? t("processing") : t("embeddedSignup")}
                        </p>
                      </div>
                    </button>
                  )}

                  {canInstagram && (
                    <button
                      onClick={launchInstagramOAuth}
                      disabled={addingChannel}
                      className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 shrink-0">
                        <Instagram className="h-5 w-5 text-pink-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Instagram OAuth</p>
                        <p className="text-xs text-muted-foreground">{t("instagramOAuthDesc")}</p>
                      </div>
                    </button>
                  )}

                  {canFacebook && (
                    <button
                      onClick={launchFacebookOAuth}
                      disabled={addingChannel}
                      className="flex items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                        <Facebook className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Facebook OAuth</p>
                        <p className="text-xs text-muted-foreground">{t("facebookOAuthDesc")}</p>
                      </div>
                    </button>
                  )}

                  {!canWhatsApp && !canInstagram && !canFacebook && (
                    <p className="text-sm text-muted-foreground">
                      {t("noOAuthOptions")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={addingChannel}>
              {t("closeBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Widget generation dialog */}
      <Dialog open={!!widgetDialogItem} onOpenChange={(o) => !o && setWidgetDialogItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tw("generateWidget")} — {widgetDialogItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              id="sessoes-enableMenuButtons"
              checked={enableMenuButtons}
              onCheckedChange={(v) => setEnableMenuButtons(!!v)}
            />
            <div className="space-y-0.5">
              <label htmlFor="sessoes-enableMenuButtons" className="text-sm font-medium leading-none cursor-pointer">
                {tw("enableMenuButtons")}
              </label>
              <p className="text-xs text-muted-foreground">{tw("enableMenuButtonsDesc")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetDialogItem(null)} disabled={generatingWidget}>
              {t("confirmNo")}
            </Button>
            <Button onClick={handleGenerateWidget} disabled={generatingWidget}>
              <Download className={`mr-2 h-4 w-4 ${generatingWidget ? "animate-pulse" : ""}`} />
              {generatingWidget ? tw("generating") : tw("generateWidget")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation dialog */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm ? confirmLabels[confirm.type].title : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {confirm ? confirmLabels[confirm.type].description(confirm.item.name) : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>{t("confirmNo")}</Button>
            <Button
              variant={confirm?.type === "delete" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {confirm ? confirmLabels[confirm.type].action : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
