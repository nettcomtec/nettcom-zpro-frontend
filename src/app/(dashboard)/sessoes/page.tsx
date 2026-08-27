"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitize } from "@/lib/sanitize";
import {
  CHATGPT_MODELS, OPENAI_VOICES,
  GROK_MODELS, GEMINI_MODELS, DEEPSEEK_MODELS,
  QWEN_MODELS, CLAUDE_MODELS, OLLAMA_MODELS,
} from "@/lib/openai-models";
import { getProxyBaseUrl, OAUTH_PROXY_URL, getGoogleCanonicalCallbackUrl } from "@/config/oauth-proxy";
import { useOAuthProxyDomain } from "@/hooks/use-oauth-proxy-domain";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/layout/page-header";
import { KeywordChipsInput } from "@/components/keyword-chips-input";
import { WabaConnectionQualityBadge } from "@/components/atendimento/waba-connection-quality-badge";
import { fetchWabaPhoneQualityRating } from "@/lib/waba-phone-quality";
import { Dialog360ConnectionQualityBadge } from "@/components/atendimento/dialog360-connection-quality-badge";
import { GupshupConnectionQualityBadge } from "@/components/atendimento/gupshup-connection-quality-badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
// AlertDialog built inline with Dialog below
import {
  Plus,
  Pencil,
  Trash2,
  Plug,
  Unplug,
  QrCode,
  Wifi,
  WifiOff,
  Loader2,
  AlertTriangle,
  Star,
  XCircle,
  X,
  MoreVertical,
  RefreshCw,
  Bot,
  ListOrdered,
  User,
  Scan,
  Lock,
  Phone,
  Timer,
  MessageSquare,
  ChevronDown,
  ArrowDownAZ,
  Tag,
  Layers2,
  Building2,
  Signal,
  Instagram,
  Facebook,
  MessageCircle,
  CheckCircle2,
  PhoneCall,
  ArrowLeftRight,
  Download,
  Copy,
  Code,
  Play,
  BookOpen,
  GalleryHorizontalEnd,  ShieldCheck,
  Cloud,
  Home,
  HelpCircle,
  Stethoscope,
  Info,
  GitFork,
  Sparkles,
  Infinity as InfinityIcon,
  Server,
  FlaskConical,
  History,
  Users,
  Link2,
  Unlink,
  KeyRound,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { parseOAuthLicenseError, OAUTH_LICENSE_COOLDOWN_MS } from "@/lib/oauth-license-error";
import { EmptyState } from "@/components/layout/empty-state";

import {
  fetchWhatsapps,
  createWhatsapp,
  updateWhatsapp,
  deleteWhatsapp,
  requestNewQrCode,
  connectSession,
  disconnectSession,
  revalidateSession,
  getBaileysCredsStatus,
  setDefaultWhatsapp,
  closeAllOpenTickets,
  closeAllPendingTickets,
  setHubWebhookAgain,
  setEvoWebhookAgain,
  setEvoGoWebhookAgain,
  setMeowWebhookAgain,
  setZapiWebhookAgain,
  setUazapiWebhookAgain,
  setInstagramWebhookAgain,
  setMessengerWebhookAgain,
  removeProfilePicture,
  refreshMetaProfilePic,
  checkLicenseProxy,
  refreshActivationTicket,
  fetchCATStatus,
  updateWebhookOrigin,
  confirmWebhookRevalidation,
  updateBaileysLib,
  updateBaileysAuthStore,
  migrateBaileysToZapo,
  type Whatsapp,
  type BaileysLib,
  type BaileysAuthStore,
} from "@/services/whatsapp";
import { fetchQueues } from "@/services/queues";
import { transferAllTicketsChannel } from "@/services/tickets";
import { fetchAllUsers } from "@/services/users";
import { fetchChatFlows } from "@/services/chatflow";
import { fetchSettings } from "@/services/settings";
import { fetchAppWooCommerces, registerWooCommerceWebhooks, fetchAppNuvemshops, registerNuvemshopWebhooks } from "@/services/superadmin";
import api from "@/lib/api";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { DiagnoseModal } from "@/components/sessoes/diagnose-modal";
import { FarewellMediaManager, FAREWELL_MEDIA_TYPES } from "@/components/sessoes/farewell-media-manager";
import { InactivityConfigManager } from "@/components/sessoes/inactivity-config-manager";
import { FarewellTemplateManager, FAREWELL_TEMPLATE_TYPES } from "@/components/sessoes/farewell-template-manager";
import { RegisterPinDialog } from "@/components/sessoes/register-pin-dialog";
import { WabaPinPendingBadge } from "@/components/sessoes/waba-pin-pending-badge";
import { useWabaPinPending } from "@/hooks/use-waba-pin-pending";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { listActiveAppWabas, exchangeEmbeddedSignupCode, requestSmbAppDataSync, type AppWaba } from "@/services/waba-meta";
import { fetchTenantById, updateTenantWebsocketToken } from "@/services/tenants";
import { getWebchatWidget, verifyWebchatConfig, buildDirectLinkUrl } from "@/services/webchat";
import { useSortable } from "@/hooks/use-sortable";
import { useWaLinkPopup } from "@/hooks/use-wa-link-popup";
import { type WabaTemplate } from "@/services/messages";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { requestUazapiHistorySync } from "@/services/uazapi-interactive";
import { takeoverRegistry } from "@/lib/registry-hijack";
import { OpenAIBaseUrlField } from "@/components/copilot/openai-base-url-field";
import type { MetaProxyHijackPayload } from "@/hooks/use-meta-proxy-popup";
import { HijackTakeoverDialog } from "@/components/common/hijack-takeover-dialog";
import { Dialog360CreateChannelDialog } from "@/components/sessoes/dialog360-create-channel-dialog";
import { GupshupCreateChannelDialog } from "@/components/sessoes/gupshup-create-channel-dialog";
import { getGupshupChannel } from "@/services/gupshup";
import { BspWebhookInfoCard } from "@/components/sessoes/bsp-webhook-info-card";
import { GupshupChannelDataEditor } from "@/components/sessoes/gupshup-channel-data-editor";
import { Dialog360ChannelDataEditor } from "@/components/sessoes/dialog360-channel-data-editor";

declare global {
  interface Window { FB: any; fbAsyncInit: any; }
}

// ─── Types ────────────────────────────────────────────────
interface QueueOpt {
  id: number;
  name: string;
  queue?: string;
}
interface UserOpt {
  id: number;
  name: string;
}
interface ChatFlow {
  id: number;
  name: string;
  // Integridade do card: fluxo inativo vinculado a canal = bot silencioso
  isActive?: boolean;
}
interface HubOption {
  label: string;
  value: string;
}
type SmtpConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user?: string; pass?: string };
  from?: string;
  replyTo?: string;
  imap?: {
    host?: string;
    port?: number;
    tls?: boolean;
    user?: string;
    pass?: string;
    mailbox?: string;
    keepalive?: boolean;
    checkInterval?: number;
  };
  oauth2?: { client_id?: string; client_secret?: string; redirect_uri?: string; access_token?: string };
  provider?: string;
  rejectUnauthorized?: boolean;
};

// ─── Channel Logos ────────────────────────────────────────
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
  waba_oauth: "/waba-logo.png",
  instagram_oauth: "/instagram-logo.png",
  facebook_oauth: "/facebook-logo.png",
  messenger_oauth: "/messenger-logo.png",
};

function getChannelLogo(type?: string): string {
  if (!type) return "/nopicture.png";
  const key = type.toLowerCase();
  if (CHANNEL_LOGOS[key]) return CHANNEL_LOGOS[key];
  if (key.startsWith("hub")) return CHANNEL_LOGOS["hub"];
  return `/${key}-logo.png`;
}

// ─── Constants ────────────────────────────────────────────
const CHANNEL_TYPES: { labelKey: string; value: string; group: string }[] = [
  // META (Oficial)
  { labelKey: "channelTypeWaba", value: "waba", group: "meta" },
  // Meta Oficial — BSPs alternativos (abaixo de WABA)
  { labelKey: "channelTypeDialog360", value: "dialog360", group: "meta" },
  { labelKey: "channelTypeGupshup", value: "gupshup", group: "meta" },
  // Whatsapp Não Oficiais
  { labelKey: "channelTypeBaileys", value: "baileys", group: "unofficial" },
  // Pseudo-tipo de criação (front-only): vira type=baileys + baileysLib=infiniteapi
  { labelKey: "channelTypeInfinite", value: "infinite", group: "unofficial" },
  { labelKey: "channelTypeWwebjs", value: "whatsapp", group: "unofficial" },
  { labelKey: "channelTypeEvo", value: "evo", group: "unofficial" },
  { labelKey: "channelTypeEvogo", value: "evogo", group: "unofficial" },
  { labelKey: "channelTypeMeow", value: "meow", group: "unofficial" },
  { labelKey: "channelTypeZapi", value: "zapi", group: "unofficial" },
  { labelKey: "channelTypeZapo", value: "zapo", group: "unofficial" },
  { labelKey: "channelTypeUazapi", value: "uazapi", group: "unofficial" },
  // Outros
  { labelKey: "channelTypeTelegram", value: "telegram", group: "outros" },
  { labelKey: "channelTypeWebmail", value: "webmail", group: "outros" },
  { labelKey: "channelTypeEmail", value: "email", group: "outros" },
  { labelKey: "channelTypeWebchat", value: "webchat", group: "outros" },
  { labelKey: "channelTypeHub", value: "hub", group: "outros" },
  { labelKey: "channelTypeMercadoLivre", value: "mercadolivre", group: "outros" },
  { labelKey: "channelTypeOLX", value: "olx", group: "outros" },
  { labelKey: "channelTypeLinkedIn", value: "linkedin", group: "outros" },
  { labelKey: "channelTypeYouTube", value: "youtube", group: "outros" },
  { labelKey: "channelTypeTikTok", value: "tiktok", group: "outros" },
  { labelKey: "channelTypeWooCommerce", value: "woocommerce", group: "outros" },
  { labelKey: "channelTypeNuvemshop", value: "nuvemshop", group: "outros" },
];

// Settings keys for AI integrations (mirrors Vue's listarConfiguracoes)
interface IntegrationSettings {
  chatgpt: boolean;
  typebot: boolean;
  dify: boolean;
  n8n: boolean;
  ollama: boolean;
  lm: boolean;
  grok: boolean;
  gemini: boolean;
  deepseek: boolean;
  qwen: boolean;
  claude: boolean;
  dialogflow: boolean;
}

// Types that support AI integrations
const AI_SUPPORTED_TYPES = [
  "whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup",
  "instagram","messenger","telegram","webchat","mercadolivre","olx","linkedin",
];
function supportsAI(type: string) {
  return AI_SUPPORTED_TYPES.includes(type) || type.includes("hub");
}

const QR_TYPES = ["baileys", "zapo", "whatsapp", "meow", "evo", "evogo", "zapi", "uazapi"];

const WAVOIP_CARD_TYPES = ["whatsapp", "baileys", "meow", "evo", "evogo", "uazapi", "zapi"];

function isQrType(type: string) {
  return QR_TYPES.includes(type);
}
function isHubType(type: string) {
  return type.includes("hub");
}

// ─── Session Status Badge ──────────────────────────────────
function SessionStatusBadge({ status }: { status: string }) {
  const isConnected = status === "CONNECTED";
  const isConnecting = status === "qrcode" || status === "PAIRING" || status === "CONNECTING";

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold",
      isConnected && "bg-success/10 text-success",
      isConnecting && "bg-warning/10 text-warning",
      !isConnected && !isConnecting && "bg-destructive/10 text-destructive",
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        isConnected && "bg-success animate-pulse",
        isConnecting && "bg-warning animate-ping",
        !isConnected && !isConnecting && "bg-destructive",
      )} />
      {status}
    </span>
  );
}

// ─── Activation Ticket Badge (CAT) ──────────────────────────
// So exibe quando ha algo acionavel pelo admin:
// - Nao ativado (sem CAT emitido)
// - Expirado (cron nao conseguiu renovar; canal bloqueado)
// "Expirando em breve" NAO eh exibido — cron renova 96h antes e o frontend
// dispara refresh silencioso ao carregar /sessoes, cobrindo o gap.
const CAT_ERROR_KEYS: Record<string, "activationTicketErrorProxyUnreachable" | "activationTicketErrorLicenseInvalid" | "activationTicketErrorNoPid"> = {
  proxy_unreachable: "activationTicketErrorProxyUnreachable",
  license_invalid:   "activationTicketErrorLicenseInvalid",
  no_pid:            "activationTicketErrorNoPid",
};

// Janela pos-criacao (espelha CREATION_GRACE_MS do backend) em que um canal
// ainda-sem-CAT nao exibe "Nao ativado" — o ticket esta sendo emitido
// (criacao best-effort + boot/cron/lazy). Evita alarme falso no canal novo.
const CAT_CREATION_GRACE_MS = 30 * 60 * 1000; // 30 min

function ActivationTicketBadge({ item, onRenew }: { item: Whatsapp; onRenew?: (item: Whatsapp) => void }) {
  const t = useTranslations("sessoesPage");
  // Canais zdg_oauth nao usam CAT — proxy valida licenca antes de rotear.
  // Hide o badge inteiro independente de expiresAt residual de migracao.
  if (item.webhookOrigin === "zdg_oauth") return null;

  const expiresAt = item.activationTicketExpiresAt;

  if (!expiresAt) {
    const errKey = item.activationTicketError ? CAT_ERROR_KEYS[item.activationTicketError] : null;
    // Canal recem-criado sem erro persistente: CAT ainda esta sendo emitido.
    // Nao exibir "Nao ativado" dentro da janela de criacao (alarme falso).
    // Erros reais (errKey) sempre aparecem, mesmo na janela.
    if (!errKey && item.createdAt) {
      const createdMs = new Date(item.createdAt).getTime();
      if (!Number.isNaN(createdMs) && Date.now() - createdMs < CAT_CREATION_GRACE_MS) {
        return null;
      }
    }
    if (errKey) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[10px] text-warning mt-0.5 inline-flex items-center gap-1 cursor-help">
                <ShieldCheck className="w-3 h-3" />
                <span>{t("activationTicketNotActivated")}</span>
                <HelpCircle className="w-3 h-3" />
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {t(errKey)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
        <ShieldCheck className="w-3 h-3 text-muted-foreground" />
        <span>{t("activationTicketNotActivated")}</span>
      </p>
    );
  }

  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs > 0) return null;

  return (
    <span className="text-[10px] mt-0.5 inline-flex items-center gap-2 text-destructive flex-wrap">
      <span className="inline-flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" />
        {t("activationTicketExpired")}
      </span>
      {onRenew && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRenew(item); }}
          className="text-[10px] underline underline-offset-2 hover:text-destructive/80 cursor-pointer"
        >
          {t("renewActivationTicket")}
        </button>
      )}
    </span>
  );
}

// ─── Status Icon ──────────────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  if (status === "CONNECTED") return <Wifi className="w-6 h-6 text-success" />;
  if (status === "DISCONNECTED") return <WifiOff className="w-6 h-6 text-destructive" />;
  if (status === "PASSKEY") return <KeyRound className="w-6 h-6 text-violet-500" />;
  if (status === "qrcode") return <Scan className="w-6 h-6 text-info" />;
  if (status === "OPENING") return <Loader2 className="w-6 h-6 text-warning animate-spin" />;
  if (status === "PAIRING" || status === "TIMEOUT")
    return <AlertTriangle className="w-6 h-6 text-warning" />;
  return <WifiOff className="w-6 h-6 text-muted-foreground" />;
}

// ─── Self-heal da foto de perfil Meta ─────────────────────
// A profile_picture_url que a Meta devolve (waba/instagram/messenger) e uma URL
// assinada temporaria que expira em algumas horas. Quando expira, a <img> falha:
// em vez de apagar a foto do banco (removeProfilePicture, que exigia reconectar),
// pedimos ao backend uma URL nova. O backend persiste e emite whatsappSession,
// que atualiza o card sozinho. Dedup por id (30s) evita tempestade de re-fetch
// caso a URL nova tambem falhe rapido.
const META_PIC_TYPES = ["waba", "instagram", "messenger"];
const metaPicRefreshInFlight = new Set<number>();
function selfHealMetaProfilePic(id: number) {
  if (!id || metaPicRefreshInFlight.has(id)) return;
  metaPicRefreshInFlight.add(id);
  refreshMetaProfilePic(id)
    .catch(() => {})
    .finally(() => {
      setTimeout(() => metaPicRefreshInFlight.delete(id), 30000);
    });
}

// ─── Status Label ─────────────────────────────────────────
function StatusLabel({ item, onRenewActivation }: { item: Whatsapp; onRenewActivation?: (item: Whatsapp) => void }) {
  const t = useTranslations("sessoesPage");
  const { status, type } = item;

  if (status === "qrcode") {
    return (
      <div>
        <p className="font-medium text-sm">{t("waitingQrCode")}</p>
        <p className="text-xs text-muted-foreground">{t("clickQrCodeBtn")}</p>
      </div>
    );
  }

  if (status === "PASSKEY") {
    return (
      <div>
        <p className="font-medium text-sm text-violet-600 dark:text-violet-400">{t("passkeyStatusTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("passkeyStatusHint")}</p>
      </div>
    );
  }

  if (status === "DISCONNECTED") {
    const hint =
      type === "whatsapp" || type === "baileys"
        ? t("connectToStart")
        : type === "zapo"
        ? t("zapoConnectHint")
        : type === "waba"
        ? t("checkWabaSettings")
        : type === "telegram"
        ? t("checkTelegramToken")
        : t("checkChannelSettings");
    return (
      <div>
        <p className="font-medium text-sm text-destructive">{t("disconnected")}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {CAT_CHANNEL_TYPES.includes(item.type) && <ActivationTicketBadge item={item} onRenew={onRenewActivation} />}
      </div>
    );
  }

  if (status === "CONNECTED") {
    let connInfo = "";
    if (isHubType(type) || type === "whatsapp" || type === "baileys" || type === "zapo") {
      connInfo = item.number || "Carregando...";
    } else if (type === "evo") {
      connInfo = item.number || item.wabaId || "";
    } else if (type === "evogo") {
      connInfo = item.number || item.wabaId || "";
    } else if (type === "waba") {
      connInfo = item.number || item.wabaId || "";
    } else if (type === "instagram" || type === "messenger") {
      connInfo = item.tokenAPI || "";
    } else if (type === "telegram") {
      connInfo = [item.name, item.number || item.wabaId].filter((v, i, a) => v && a.indexOf(v) === i).join(" · ");
    } else if (type === "webmail" || type === "email") {
      connInfo = item.smtpConfig?.auth?.user || item.smtpConfig?.from || item.smtpConfig?.oauth2?.client_id || "";
    } else if (type === "webchat") {
      connInfo = item.wabaId || "";
    } else {
      const parts = [item.number, item.wabaId].filter(Boolean);
      connInfo = parts.length === 2 && parts[0] === parts[1] ? parts[0]! : parts.join(" | ");
    }

    const hasProfilePic =
      item.profilePic &&
      item.profilePic !== "disabled" &&
      !item.profilePic.includes("nopicture.png") &&
      (item.profilePic.startsWith("http") || item.profilePic.startsWith("/"));

    const pushname = item.phone && (item.phone.pushname || item.phone.name);

    return (
      <div>
        {connInfo && (
          <p className="text-xs text-muted-foreground break-all">{connInfo}</p>
        )}
        {CAT_CHANNEL_TYPES.includes(item.type) && <ActivationTicketBadge item={item} onRenew={onRenewActivation} />}
        {(hasProfilePic || pushname) && (
          <div className="flex items-center gap-2 mt-1">
            {hasProfilePic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.profilePic!}
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-border"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  // Phase 16 — Google avatars podem falhar intermitentemente; nao auto-remover
                  const isGoogleAvatar =
                    !!item.profilePic &&
                    (item.profilePic.includes("googleusercontent.com") || item.profilePic.includes("ggpht.com"));
                  // Meta (waba/instagram/messenger): URL assinada expirou → re-busca
                  // uma nova em vez de apagar (nao exige reconectar).
                  if (item.id && META_PIC_TYPES.includes(item.type)) {
                    selfHealMetaProfilePic(item.id);
                  } else if (item.id && !isGoogleAvatar) {
                    removeProfilePicture(item.id).catch(() => {});
                  }
                }}
              />
            ) : isHubType(type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getChannelLogo(type)}
                alt={type}
                className="w-8 h-8 rounded-full object-contain flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <MessageSquare className="w-8 h-8 text-success flex-shrink-0" />
            )}
            {pushname && (
              <span className="text-sm font-medium truncate">{pushname}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (status === "PAIRING" || status === "TIMEOUT") {
    return (
      <div>
        <p className="font-medium text-sm text-warning">{t("connectionLost")}</p>
        <p className="text-xs text-muted-foreground">
          {t("ensureCellphone")}
        </p>
      </div>
    );
  }

  if (status === "OPENING") {
    return (
      <div>
        <p className="font-medium text-sm">{t("establishing")}</p>
        <p className="text-xs text-muted-foreground">{t("mayTakeAWhile")}</p>
      </div>
    );
  }

  return null;
}

const TRANSFER_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow", "waba", "dialog360", "gupshup", "instagram", "mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "nuvemshop"];

// Canais que usam Channel Activation Ticket (CAT) — indicador de validade e
// botao "Renovar Ativacao" aplicam so para estes tipos.
// type="whatsapp" usa biblioteca wwebjs; type="baileys" usa baileys.
const CAT_CHANNEL_TYPES = ["waba", "dialog360", "gupshup", "instagram", "messenger", "evolution", "evo", "evogo", "zapi", "uazapi", "meow", "baileys", "zapo", "whatsapp"];

// Dias antes da expiracao em que o botao manual de renovacao aparece.
// O cron ja renova 48h antes automaticamente; botao manual cobre casos de falha.
const CAT_RENEW_WINDOW_DAYS = 3;

// Decide se exibe o botao "Renovar Ativacao". Nao exibimos quando o CAT esta
// saudavel — cron cuida sozinho. Exibimos so quando precisa de acao.
function needsActivationAction(item: Whatsapp): boolean {
  if (item.webhookOrigin === "zdg_oauth") return false;
  const expiresAt = item.activationTicketExpiresAt;
  if (!expiresAt) return true; // nao ativado ainda
  const exp = new Date(expiresAt).getTime();
  const now = Date.now();
  if (exp <= now) return true; // expirado
  const diffDays = (exp - now) / (24 * 60 * 60 * 1000);
  return diffDays < CAT_RENEW_WINDOW_DAYS; // expira em breve
}
const TRANSFER_CHANNEL_OPTIONS_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow", "waba"];
const BETA_CHANNEL_TYPES = ["mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "nuvemshop", "dialog360", "gupshup", "zapo"];

// ─── Session Card ─────────────────────────────────────────
function SessionCard({
  item,
  queues,
  users,
  chatFlows,
  onEdit,
  onDelete,
  onConnect,
  onDisconnect,
  onQrCode,
  onSetDefault,
  onCloseOpen,
  onClosePending,
  onWebhook,
  onWavoip,
  onTransferChannel,
  onGenerateWidget,
  onRefreshActivationTicket,
  onChangeOrigin,
  onRegisterWooWebhooks,
  onDiagnose,
  onRegisterPin,
  onShowWebhookInfo,
  onWaLink,
  onUnlinkHybrid,
  allChannels,
  isRegisteringWoo = false,
  isConnecting = false,
  isQrLoading = false,
  isDisconnecting = false,
}: {
  item: Whatsapp;
  queues: QueueOpt[];
  users: UserOpt[];
  chatFlows: ChatFlow[];
  onEdit: (item: Whatsapp) => void;
  onDelete: (item: Whatsapp) => void;
  onConnect: (item: Whatsapp) => void;
  onDisconnect: (item: Whatsapp) => void;
  onQrCode: (item: Whatsapp) => void;
  onSetDefault: (item: Whatsapp) => void;
  onCloseOpen: (item: Whatsapp) => void;
  onClosePending: (item: Whatsapp) => void;
  onWebhook: (item: Whatsapp, action: string) => void;
  onWavoip: (item: Whatsapp) => void;
  onTransferChannel: (item: Whatsapp) => void;
  onGenerateWidget?: (item: Whatsapp) => void;
  onRefreshActivationTicket: (item: Whatsapp) => void;
  onChangeOrigin: (item: Whatsapp) => void;
  onRegisterWooWebhooks?: (item: Whatsapp) => void;
  onDiagnose?: (item: Whatsapp) => void;
  onRegisterPin?: (item: Whatsapp) => void;
  onShowWebhookInfo?: (item: Whatsapp) => void;
  onWaLink?: (item: Whatsapp) => void;
  onUnlinkHybrid?: (item: Whatsapp) => void;
  allChannels?: Whatsapp[];
  isRegisteringWoo?: boolean;
  isConnecting?: boolean;
  isQrLoading?: boolean;
  isDisconnecting?: boolean;
}) {
  const t = useTranslations("sessoesPage");
  const tOpenai = useTranslations("openaiBaseUrl");
  const { pending: wabaPinPending } = useWabaPinPending({
    type: item.type,
    tokenAPI: item.tokenAPI,
    bmToken: item.bmToken,
    wabaVersion: item.wabaVersion,
    webhookOrigin: item.webhookOrigin,
  });
  // Coexistência: itens de sync do app só fazem sentido se o número ainda está
  // no app WhatsApp Business (is_on_biz_app) — em Cloud API puro a Graph retorna
  // 131000. Mesmo fetch/cache (5min) do badge de qualidade, sem request extra.
  const [wabaIsCoex, setWabaIsCoex] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (item.type !== "waba" || item.status !== "CONNECTED") {
      setWabaIsCoex(false);
      return;
    }
    fetchWabaPhoneQualityRating({
      bmToken: item.bmToken,
      tokenAPI: item.tokenAPI,
      wabaId: item.wabaId,
      phoneHint: item.number,
      wabaVersion: item.wabaVersion,
    }).then((res) => {
      if (!cancelled) setWabaIsCoex(res.is_on_biz_app === true);
    });
    return () => {
      cancelled = true;
    };
  }, [item.type, item.status, item.bmToken, item.tokenAPI, item.wabaId, item.number, item.wabaVersion]);
  const showQrBtn = isQrType(item.type) && item.status === "qrcode";
  const showNewQrBtn = isQrType(item.type) && item.status === "DISCONNECTED";
  // Passkey nativo (Evolution Go): quando a conta esta travada por passkey, o canal
  // fica em status 'PASSKEY' e o botao abre o mesmo modal (painel passkey no lugar do QR).
  const showPasskeyBtn = item.type === "evogo" && item.status === "PASSKEY";
  // Botao "WhatsApp Web" (Passkey Linker) acompanha o botao de QR; quando o par
  // aparece, os dois dividem a mesma linha do footer (flex-1).
  const showWaLinkBtn =
    (showQrBtn || showNewQrBtn) &&
    ["baileys", "meow", "uazapi", "evo", "evogo"].includes(item.type) &&
    !!onWaLink;
  const showConnectBtn =
    item.status === "DISCONNECTED" &&
    !isQrType(item.type) &&
    !isHubType(item.type);
  const showDisconnectBtn =
    ["OPENING", "CONNECTED", "PAIRING", "TIMEOUT"].includes(item.status) &&
    !isHubType(item.type);

  // P4 — Revalidar sessão: reconectar baileys/zapo reaproveitando os creds salvos
  // (sem QR). Só para canal DESCONECTADO; busca lazy se há creds para
  // habilitar/esmaecer o botão (sem creds → só "Solicitar QR").
  const showRevalidateBtn = (item.type === "baileys" || item.type === "zapo") && (item.status === "DISCONNECTED" || item.status === "TIMEOUT");
  const [revalCredsKnown, setRevalCredsKnown] = useState(false);
  const [revalHasCreds, setRevalHasCreds] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  useEffect(() => {
    if (!showRevalidateBtn) {
      setRevalCredsKnown(false);
      setRevalHasCreds(false);
      return;
    }
    let cancelled = false;
    setRevalCredsKnown(false);
    getBaileysCredsStatus(item.id)
      .then((res) => {
        if (cancelled) return;
        setRevalHasCreds(Boolean(res.data?.hasCreds));
        setRevalCredsKnown(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRevalHasCreds(false);
        setRevalCredsKnown(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showRevalidateBtn, item.id]);

  async function handleRevalidateClick() {
    setRevalidating(true);
    try {
      await revalidateSession(item.id);
      toast.success(t("revalidatingSession"));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(t("noCredsRevalidate"));
        setRevalHasCreds(false);
      } else {
        toast.error(t("errorConnecting"));
      }
    } finally {
      setRevalidating(false);
    }
  }

  // Link direto do WebChat — probe de capacidade: backend antigo não devolve
  // a chave webchatConfig no GET; sem ela o item nem é renderizado.
  const rawWebchatConfig =
    item.type === "webchat"
      ? (item as unknown as Record<string, unknown>).webchatConfig
      : undefined;
  // Exige wabaId: o backend resolve /chat/:wabaId só pela coluna uuid — sem ela
  // a URL daria 404, então o item não aparece (canal webchat normal sempre tem).
  const showDirectLinkItem =
    item.type === "webchat" && rawWebchatConfig !== undefined && !!item.wabaId;
  const directLinkEnabled =
    !!rawWebchatConfig &&
    typeof rawWebchatConfig === "object" &&
    (rawWebchatConfig as { directLinkEnabled?: boolean }).directLinkEnabled === true;

  async function handleCopyDirectLink() {
    if (!item.wabaId) return;
    try {
      await navigator.clipboard.writeText(buildDirectLinkUrl(item.wabaId));
      toast.success(t("directLinkCopied"));
    } catch {
      toast.error(t("directLinkCopyError"));
    }
  }

  const updatedAt = (() => {
    try {
      return format(parseISO(item.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return item.updatedAt;
    }
  })();

  // Quando preenchido, o canal foi desativado pelo sistema (falhas seguidas de
  // conexao) e nao pela Contingencia manual — muda o texto do badge "Inativo".
  const autoDisabledAt = (() => {
    if (!item.autoDisabledAt) return "";
    try {
      return format(parseISO(item.autoDisabledAt), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return String(item.autoDisabledAt);
    }
  })();

  // Modo hibrido (F1): WABA com hybridMode ativo ganha badge "Hibrido";
  // o canal apontado por linkedChannelId de algum WABA hibrido ganha "Transporte".
  const isHybridWaba =
    item.type === "waba" && !!item.hybridMode && item.hybridMode !== "disabled";
  const hybridLinkedChannel = isHybridWaba
    ? (allChannels || []).find((c) => c.id === item.linkedChannelId)
    : undefined;
  const hybridParent = (allChannels || []).find(
    (c) =>
      c.id !== item.id &&
      c.type === "waba" &&
      !!c.hybridMode &&
      c.hybridMode !== "disabled" &&
      c.linkedChannelId === item.id
  );

  // Rótulo legível do tipo do canal (para o tooltip do ícone no avatar).
  const channelTypeInfo = CHANNEL_TYPES.find((c) => c.value === item.type);
  const channelTypeLabel = channelTypeInfo
    ? t(channelTypeInfo.labelKey as Parameters<typeof t>[0])
    : item.type;
  // Só sobrepõe o badge do tipo quando há foto de perfil real — sem foto, o
  // próprio avatar já é o logo do tipo (evita logo idêntico sobre logo).
  const hasRealProfilePic =
    !!item.profilePic &&
    item.profilePic !== "disabled" &&
    !item.profilePic.includes("nopicture.png") &&
    (item.profilePic.startsWith("http") || item.profilePic.startsWith("/"));

  // Integridade: referências persistidas do canal que envelheceram — fluxo de
  // bot excluído/inativo, fila/atendente padrão excluídos. As listas por props
  // são vivas (fetch completo da página), então ausência = registro deletado.
  const integrityIssues: string[] = [];
  if (item.chatFlowId) {
    const flowRef = chatFlows.find((f) => f.id === Number(item.chatFlowId));
    if (!flowRef) integrityIssues.push(t("integrityFlowDeleted", { id: Number(item.chatFlowId) }));
    else if (flowRef.isActive === false) integrityIssues.push(t("integrityFlowInactive", { id: Number(item.chatFlowId) }));
  }
  if (item.queueId && !queues.some((q) => q.id === Number(item.queueId))) {
    integrityIssues.push(t("integrityQueueDeleted", { id: Number(item.queueId) }));
  }
  if (item.userId && !users.some((u) => u.id === Number(item.userId))) {
    integrityIssues.push(t("integrityUserDeleted", { id: Number(item.userId) }));
  }
  if (item.queueIdImportMessages && !queues.some((q) => q.id === Number(item.queueIdImportMessages))) {
    integrityIssues.push(t("integrityImportQueueDeleted", { id: Number(item.queueIdImportMessages) }));
  }

  return (
    <Card id={`session-card-${item.id}`} data-channel-id={item.id} className="flex flex-col scroll-mt-24">
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              item.profilePic &&
              item.profilePic !== "disabled" &&
              !item.profilePic.includes("nopicture.png") &&
              (item.profilePic.startsWith("http") || item.profilePic.startsWith("/"))
                ? item.profilePic
                : getChannelLogo(item.type)
            }
            alt={item.name || item.type}
            className="w-10 h-10 rounded-full object-cover"
            /* Phase 16 — Google avatars (lh3.googleusercontent.com) exigem
               no-referrer para nao serem bloqueados */
            referrerPolicy="no-referrer"
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              // Phase 16 — Para URLs do Google (lh3.googleusercontent.com / yt3.ggpht.com),
              // NAO auto-remover: pode ser falha intermitente de CDN. So fallback visual.
              const isGoogleAvatar =
                !!item.profilePic &&
                (item.profilePic.includes("googleusercontent.com") || item.profilePic.includes("ggpht.com"));
              const wasRealProfilePic =
                !!item.profilePic &&
                item.profilePic !== "disabled" &&
                !item.profilePic.includes("nopicture.png") &&
                (item.profilePic.startsWith("http") || item.profilePic.startsWith("/"));
              const fallback = getChannelLogo(item.type);
              if (img.src !== fallback) img.src = fallback;
              if (wasRealProfilePic && item.id) {
                // Meta (waba/instagram/messenger): a profile_picture_url assinada
                // expirou → re-busca uma URL nova (self-heal) em vez de apagar a
                // foto. O backend persiste + emite socket, o card se atualiza.
                if (META_PIC_TYPES.includes(item.type)) {
                  selfHealMetaProfilePic(item.id);
                } else if (!isGoogleAvatar) {
                  removeProfilePicture(item.id).catch(() => {});
                }
              }
            }}
          />
          {/* Ícone do tipo do canal — badge no canto inferior-direito do avatar,
              visível por cima da foto de perfil. */}
          {hasRealProfilePic && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getChannelLogo(item.type)}
                alt={item.type}
                title={channelTypeLabel}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full object-contain bg-background ring-2 ring-background"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-bold text-base leading-tight line-clamp-2 break-words"
            title={item.name}
          >
            {item.name}
          </p>
          <p className="text-xs text-muted-foreground">
            #{item.id} &middot; {item.type}
          </p>
        </div>
        {/* Badges agrupados em container que quebra linha (max 45% da largura)
            para nunca esmagar o nome do canal — ex.: WABA com badge Pendente */}
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 flex-shrink-0 max-w-[45%]">
          {integrityIssues.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle
                    aria-label={t("integrityBadge")}
                    className="w-3.5 h-3.5 text-destructive flex-shrink-0 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium">{t("integrityTooltipTitle")}</p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {integrityIssues.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs opacity-80">{t("integrityFix")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.chatgptBaseUrl && item.chatgptBaseUrl.trim() && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Server className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 flex-shrink-0 opacity-80" />
                </TooltipTrigger>
                <TooltipContent>{tOpenai("customBadgeChannelTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.type === "waba" && item.status === "CONNECTED" && (
            <WabaConnectionQualityBadge
              bmToken={item.bmToken}
              tokenAPI={item.tokenAPI}
              wabaId={item.wabaId}
              phoneHint={item.number}
              wabaVersion={item.wabaVersion}
              loadingLabel={t("qualityLoading")}
              tooltipTitle={t("qualityTitle")}
              tooltipBody={t("qualityBody")}
              asIcon
              showPlatform
              platformCoexLabel={t("coexBadgeLabel")}
              platformCloudLabel={t("cloudApiBadgeLabel")}
              platformCoexTooltip={t("coexBadgeTooltip")}
              platformCloudTooltip={t("cloudApiBadgeTooltip")}
            />
          )}
          {item.type === "dialog360" && item.status === "CONNECTED" && (
            <Dialog360ConnectionQualityBadge
              channelId={item.id}
              phoneHint={item.number}
              loadingLabel={t("qualityLoading")}
              tooltipTitle={t("qualityTitle")}
              tooltipBody={t("qualityBody")}
              asIcon
            />
          )}
          {item.type === "gupshup" && item.status === "CONNECTED" && (
            <GupshupConnectionQualityBadge
              whatsappId={item.id}
              phoneHint={item.number}
              loadingLabel={t("qualityLoading")}
              tooltipTitle={t("qualityTitle")}
              tooltipBody={t("qualityBody")}
              asIcon
            />
          )}
          {BETA_CHANNEL_TYPES.includes(item.type) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FlaskConical className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 opacity-80" />
                </TooltipTrigger>
                <TooltipContent>{t("betaChannelTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.type === "baileys" && (() => {
            const lib = (item.baileysLib as "fork" | "v7" | "infiniteapi" | undefined) || "fork";
            const cfg = lib === "v7"
              ? { Icon: Sparkles, cls: "text-emerald-500 dark:text-emerald-400", tip: t("baileysLibBadgeV7Tooltip") }
              : lib === "infiniteapi"
                ? { Icon: InfinityIcon, cls: "text-violet-500 dark:text-violet-400", tip: t("baileysLibBadgeInfiniteTooltip") }
                : { Icon: GitFork, cls: "text-slate-500 dark:text-slate-400", tip: t("baileysLibBadgeForkTooltip") };
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <cfg.Icon className={`w-3.5 h-3.5 flex-shrink-0 opacity-80 ${cfg.cls}`} />
                  </TooltipTrigger>
                  <TooltipContent>{cfg.tip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          {item.type === "waba" && (
            <WabaPinPendingBadge
              type={item.type}
              tokenAPI={item.tokenAPI}
              bmToken={item.bmToken}
              wabaVersion={item.wabaVersion}
              webhookOrigin={item.webhookOrigin}
              asIcon
              onClick={onRegisterPin ? () => onRegisterPin(item) : undefined}
            />
          )}
          {["waba", "instagram", "messenger"].includes(item.type) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {item.webhookOrigin === "zdg_oauth" ? (
                    <Cloud className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 flex-shrink-0 opacity-70" />
                  ) : (
                    <Home className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0 opacity-70" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {item.webhookOrigin === "zdg_oauth" ? t("webhookOriginZdgFull") : t("webhookOriginOwnFull")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Phase 16 — Mesmo padrao para canais Google (youtube/email/webmail).
              Cloud = app da plataforma (camadas 2/3). Home = app proprio do cliente (camada 1). */}
          {["youtube", "webmail", "email"].includes(item.type) && (() => {
            const hasOwnGoogleApp =
              item.type === "youtube"
                ? false /* AppYouTube nao vem no item — defaulta para plataforma */
                : !!item.smtpConfig?.oauth2?.client_id;
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {hasOwnGoogleApp ? (
                      <Home className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 flex-shrink-0 opacity-70" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 flex-shrink-0 opacity-70" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {hasOwnGoogleApp ? (t("ownAppBadge" as any) || "App proprio") : (t("platformAppBadge" as any) || "App da plataforma")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })()}
          {item.isDefault && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Star className="w-4 h-4 text-warning fill-warning flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent>{t("defaultChannel")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Pencil className="w-4 h-4 mr-2" />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetDefault(item)}>
              <Star className="w-4 h-4 mr-2" />
              {item.isDefault ? t("unsetDefault") : t("setDefault")}
            </DropdownMenuItem>
            {showRevalidateBtn && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleRevalidateClick}
                  disabled={!revalHasCreds || revalidating || !revalCredsKnown}
                  title={revalCredsKnown && !revalHasCreds ? t("noCredsRevalidate") : undefined}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("revalidateSession")}
                </DropdownMenuItem>
              </>
            )}
            {["baileys", "meow", "uazapi", "evo", "evogo"].includes(item.type) && onWaLink && (
              <>
                {!showRevalidateBtn && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => onWaLink(item)}>
                  <Link2 className="w-4 h-4 mr-2" />
                  {t("connectViaWhatsappWeb")}
                </DropdownMenuItem>
              </>
            )}
            {item.type === "webchat" && onGenerateWidget && (
              <>
                <DropdownMenuSeparator />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <DropdownMenuItem
                          onClick={() => onGenerateWidget(item)}
                          disabled={item.status !== "CONNECTED"}
                          className="w-full"
                        >
                          <Code className="w-4 h-4 mr-2" />
                          {t("generateWidget")}
                          {item.status !== "CONNECTED" && (
                            <AlertTriangle className="w-4 h-4 ml-auto text-warning" />
                          )}
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    {item.status !== "CONNECTED" && (
                      <TooltipContent side="left">
                        <p>{t("widgetRequiresConnection")}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {showDirectLinkItem && (
              <>
                {!onGenerateWidget && <DropdownMenuSeparator />}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <DropdownMenuItem
                          onClick={handleCopyDirectLink}
                          disabled={!directLinkEnabled}
                          className="w-full"
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          {t("copyDirectLink")}
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    {!directLinkEnabled && (
                      <TooltipContent side="left">
                        <p>{t("directLinkOffHint")}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {(isHubType(item.type) || item.type.includes("evo") || item.type.includes("meow") || item.type === "zapi" || item.type === "uazapi" || item.type === "waba" || item.type === "dialog360" || item.type === "gupshup" || item.type === "instagram" || item.type === "messenger") && (
              <>
                <DropdownMenuSeparator />
                {isHubType(item.type) && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "hub")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookHub")}
                  </DropdownMenuItem>
                )}
                {item.type.includes("evo") && item.type !== "evogo" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "evo")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookEvo")}
                  </DropdownMenuItem>
                )}
                {item.type === "evogo" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "evogo")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookEvogo")}
                  </DropdownMenuItem>
                )}
                {item.type.includes("meow") && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "meow")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookMeow")}
                  </DropdownMenuItem>
                )}
                {item.type === "zapi" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "zapi")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookZapi")}
                  </DropdownMenuItem>
                )}
                {item.type === "uazapi" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "uazapi")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookUazapi")}
                  </DropdownMenuItem>
                )}
                {item.type === "waba" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "waba")} title={t("revalidateWebhookWabaBothTooltip")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookWaba")}
                  </DropdownMenuItem>
                )}
                {item.type === "waba" && wabaIsCoex && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "smbsynchistory")}>
                    <History className="w-4 h-4 mr-2" />
                    {t("smbSyncHistory")}
                  </DropdownMenuItem>
                )}
                {item.type === "waba" && wabaIsCoex && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "smbsynccontacts")}>
                    <Users className="w-4 h-4 mr-2" />
                    {t("smbSyncContacts")}
                  </DropdownMenuItem>
                )}
                {item.type === "instagram" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "instagram")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookInstagram")}
                  </DropdownMenuItem>
                )}
                {item.type === "messenger" && (
                  <DropdownMenuItem onClick={() => onWebhook(item, "messenger")}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t("revalidateWebhookMessenger")}
                  </DropdownMenuItem>
                )}
                {(item.type === "dialog360" || item.type === "gupshup") && onShowWebhookInfo && (
                  <DropdownMenuItem onClick={() => onShowWebhookInfo(item)}>
                    <Info className="w-4 h-4 mr-2" />
                    Mostrar webhook info
                  </DropdownMenuItem>
                )}
                {CAT_CHANNEL_TYPES.includes(item.type) && needsActivationAction(item) && (
                  <DropdownMenuItem onClick={() => onRefreshActivationTicket(item)}>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    {t("renewActivationTicket")}
                  </DropdownMenuItem>
                )}
                {["waba", "instagram", "messenger"].includes(item.type) && (
                  <DropdownMenuItem onClick={() => onChangeOrigin(item)}>
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    {t("changeWebhookOrigin")}
                    <span className="ml-auto text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5">
                      {(item as any).webhookOrigin === "zdg_oauth"
                        ? t("webhookOriginZdg")
                        : t("webhookOriginOwn")}
                    </span>
                  </DropdownMenuItem>
                )}
                {["waba", "instagram", "messenger"].includes(item.type) && onDiagnose && (
                  <DropdownMenuItem onClick={() => onDiagnose(item)}>
                    <Stethoscope className="w-4 h-4 mr-2" />
                    {t("diagnoseConnection")}
                  </DropdownMenuItem>
                )}
                {item.type === "waba" && onRegisterPin && (
                  <DropdownMenuItem onClick={() => onRegisterPin(item)}>
                    <ShieldCheck className={`w-4 h-4 mr-2 ${wabaPinPending === true ? "text-warning" : ""}`} />
                    <span>{t("registerPin")}</span>
                    {wabaPinPending === true && (
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-warning/10 text-warning border-warning/30"
                      >
                        {t("pinPendingBadge")}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                )}
              </>
            )}
            {(item.type === "woocommerce" || item.type === "nuvemshop") && onRegisterWooWebhooks && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { if (isRegisteringWoo) { e.preventDefault(); return; } onRegisterWooWebhooks(item); }}
                  disabled={isRegisteringWoo}
                >
                  {isRegisteringWoo
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <RefreshCw className="w-4 h-4 mr-2" />}
                  {isRegisteringWoo ? t("registeringWooWebhooks") : t("registerWooWebhooks")}
                </DropdownMenuItem>
              </>
            )}
            {TRANSFER_CHANNEL_TYPES.includes(item.type) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onTransferChannel(item)}>
                  <ArrowLeftRight className="w-4 h-4 mr-2" />
                  {t("transferChannel")}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCloseOpen(item)}>
              <XCircle className="w-4 h-4 mr-2" />
              {t("closeOpenTickets")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onClosePending(item)}>
              <Timer className="w-4 h-4 mr-2" />
              {t("closePendingTickets")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(item)} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator />

      <CardContent className="flex-1 pt-3 pb-2">
        <div className="flex items-start gap-3">
          <StatusIcon status={item.status} />
          <div className="flex-1 min-w-0">
            <SessionStatusBadge status={item.status} />
            <StatusLabel item={item} onRenewActivation={onRefreshActivationTicket} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t("updatedAt")} {updatedAt}</p>
        <div className="flex gap-1 mt-2 flex-wrap">
          {item.chatFlowId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Bot className="w-3 h-3" />
                    ChatFlow
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {chatFlows.find((cf) => cf.id === item.chatFlowId)?.name ?? `ID: ${item.chatFlowId}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.queueId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <ListOrdered className="w-3 h-3" />
                    {t("queue")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {queues.find((q) => q.id === item.queueId)?.name ?? queues.find((q) => q.id === item.queueId)?.queue ?? `ID: ${item.queueId}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.userId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <User className="w-3 h-3" />
                    {t("user")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {users.find((u) => u.id === item.userId)?.name ?? `ID: ${item.userId}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {item.isActive === false && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs text-warning">
                    <Lock className="w-3 h-3" />
                    {t("inactive")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {item.autoDisabledAt
                    ? t("inactiveTooltipAuto", { date: autoDisabledAt })
                    : t("inactiveTooltipManual")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isHybridWaba && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs text-violet-600 dark:text-violet-400">
                    <ArrowLeftRight className="w-3 h-3" />
                    {t("hybridBadge")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {item.hybridMode === "coexistence"
                    ? t("hybridModeCoexistence")
                    : t("hybridModeTwoNumbers")}
                  {hybridLinkedChannel
                    ? ` · ${hybridLinkedChannel.name}`
                    : item.linkedChannelId
                      ? ` · ID: ${item.linkedChannelId}`
                      : ""}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isHybridWaba && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onUnlinkHybrid?.(item)}
                    aria-label={t("hybridUnlinkTooltip")}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                  >
                    <Unlink className="w-3 h-3" />
                    {t("hybridUnlink")}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("hybridUnlinkTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hybridParent && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="gap-1 text-xs text-violet-600 dark:text-violet-400">
                    <Link2 className="w-3 h-3" />
                    {t("hybridTransportBadge")}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {t("hybridTransportTooltip", { name: hybridParent.name })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="pt-3 pb-3 flex gap-2 flex-wrap justify-center">
        {showQrBtn && (
          <Button size="sm" variant="outline" onClick={() => onQrCode(item)} className={cn("gap-1", showWaLinkBtn && "flex-1 min-w-0 px-2")}>
            <QrCode className="w-4 h-4" />
            {t("viewQrCode")}
          </Button>
        )}
        {showNewQrBtn && (
          <Button size="sm" variant="outline" onClick={() => onQrCode(item)} className={cn("gap-1", showWaLinkBtn && "flex-1 min-w-0 px-2")} disabled={isQrLoading}>
            {isQrLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <QrCode className="w-4 h-4" />
            }
            {t("newQrCode")}
          </Button>
        )}
        {showWaLinkBtn && (
          <Button size="sm" variant="outline" onClick={() => onWaLink(item)} className="gap-1 flex-1 min-w-0 px-2">
            <Link2 className="w-4 h-4" />
            {t("connectViaWhatsappWebShort")}
          </Button>
        )}
        {showPasskeyBtn && (
          <Button size="sm" variant="outline" onClick={() => onQrCode(item)} className="gap-1 text-violet-600 dark:text-violet-400">
            <KeyRound className="w-4 h-4" />
            {t("passkeyConnectBtn")}
          </Button>
        )}
        {showConnectBtn && (
          <Button size="sm" variant="default" onClick={() => onConnect(item)} className="gap-1" disabled={isConnecting}>
            {isConnecting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plug className="w-4 h-4" />
            }
            {t("connect")}
          </Button>
        )}
        {item.status === "OPENING" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-warning" />
            {t("connecting")}
          </div>
        )}
        {showDisconnectBtn && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDisconnect(item)}
            className="gap-1"
            disabled={isDisconnecting}
          >
            {isDisconnecting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Unplug className="w-4 h-4" />
            }
            {t("disconnect")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// ─── WaVoIP Tokens Modal ───────────────────────────────────
function WavoipTokensModal({
  item,
  statuses,
  loading,
  onClose,
  onCheckStatus,
}: {
  item: Whatsapp | null;
  statuses: Record<string, string>;
  loading: Record<string, boolean>;
  onClose: () => void;
  onCheckStatus: (item: Whatsapp) => void;
}) {
  const t = useTranslations("wavoip");

  if (!item) return null;

  const tokens = item.wavoipToken
    ? item.wavoipToken.split(",").map((tk) => tk.trim()).filter(Boolean)
    : [];

  function openQr(token: string) {
    window.open(`https://devices.wavoip.com/${token}/whatsapp/qr-image`, "_blank", "width=600,height=700");
  }

  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <PhoneCall className="w-5 h-5" />
            {t("tokensModal.title", { name: item.name })}
          </DialogTitle>
        </DialogHeader>

        {/* Informações importantes */}
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-semibold mb-1">{t("tokensModal.importantInfo")}</p>
          <p className="mb-1">{t("tokensModal.otherApiInfo", { type: item.type })}</p>
          <ul className="list-disc pl-4 space-y-0.5 text-xs">
            <li>{t("tokensModal.systemQrCode")}</li>
            <li>{t("tokensModal.wavoipQrCode")}</li>
          </ul>
          <p className="mt-1 text-xs" dangerouslySetInnerHTML={{ __html: sanitize(t("tokensModal.note"), { ALLOWED_TAGS: ["strong"] }) }} />
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {tokens.map((token, idx) => {
            const status = statuses[token];
            const isLoading = loading[token];
            const isOpen = status === "open";
            const isDisconnected = status && status !== "open";

            return (
              <div key={token} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t("tokensModal.tokenLabel", { index: idx + 1 })}</p>
                    <p className="text-xs text-muted-foreground break-all">{token}</p>
                  </div>
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
                  ) : isOpen ? (
                    <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
                  ) : status ? (
                    <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
                  ) : null}
                </div>

                {isDisconnected && (
                  <div className="rounded bg-destructive text-destructive-foreground p-2 text-xs">
                    <p className="font-semibold">{t("tokensModal.disconnected")}</p>
                    <p dangerouslySetInnerHTML={{ __html: sanitize(t("tokensModal.disconnectedMessage"), { ALLOWED_TAGS: ["strong"] }) }} />
                    {item.type !== "baileys" && (
                      <p className="mt-1" dangerouslySetInnerHTML={{ __html: sanitize(t("tokensModal.rememberSystemQr"), { ALLOWED_TAGS: ["strong"] }) }} />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 text-destructive-foreground hover:text-destructive-foreground hover:bg-white/20 h-7 text-xs gap-1"
                      onClick={() => openQr(token)}
                    >
                      <QrCode className="w-3 h-3" />
                      {t("tokensModal.openQrCodeButton")}
                    </Button>
                  </div>
                )}

                {isOpen && (
                  <div className="rounded bg-success text-success-foreground p-2 text-xs">
                    <p className="font-semibold">{t("tokensModal.connected")}</p>
                    <p>{t("tokensModal.connectedMessage")}</p>
                  </div>
                )}

                {!status && !isLoading && (
                  <p className="text-xs text-muted-foreground">{t("tokensModal.checkStatusMessage")}</p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onCheckStatus(item)} disabled={anyLoading} className="gap-1">
            <RefreshCw className={cn("w-4 h-4", anyLoading && "animate-spin")} />
            {t("tokensModal.updateStatus")}
          </Button>
          <Button variant="ghost" onClick={onClose} className="text-destructive hover:text-destructive">
            {t("tokensModal.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QR Code Modal ─────────────────────────────────────────
const QR_VALIDITY_SECONDS = 45;

function QrCodeModal({
  open,
  onClose,
  channel,
  onRequestNew,
  isLoadingNewQr = false,
}: {
  open: boolean;
  onClose: () => void;
  channel: Whatsapp | null;
  onRequestNew: (channel: Whatsapp) => void;
  isLoadingNewQr?: boolean;
}) {
  const t = useTranslations("sessoesPage");
  const [remainingTime, setRemainingTime] = useState(QR_VALIDITY_SECONDS);
  const [showCountdown, setShowCountdown] = useState(false);
  const [forceQrMode, setForceQrMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [disablingPairing, setDisablingPairing] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiresAtRef = useRef<number | null>(null);
  const prevQrRef = useRef<string | undefined>(undefined);
  const prevWppPassRef = useRef<string | undefined>(undefined);

  const isPairingMode = !!channel?.wppUser && !forceQrMode;
  const isMeowOrUazapi = channel?.type === "meow" || channel?.type === "uazapi";

  // Desativa o modo pairing limpando wppUser no backend e solicita um novo QR.
  // Usado quando o canal foi previamente configurado com numero para pairing
  // e o usuario quer reconectar via QR sem precisar abrir o dialog de edicao.
  const disablePairingAndUseQr = useCallback(async () => {
    if (!channel || disablingPairing) return;
    setDisablingPairing(true);
    try {
      await updateWhatsapp(channel.id, { wppUser: "" });
      try { await requestNewQrCode(channel.id); } catch { /* QR pode chegar via socket */ }
      setForceQrMode(true);
    } catch {
      toast.error(t("errorRequestingQr"));
    } finally {
      setDisablingPairing(false);
    }
  }, [channel, disablingPairing, t]);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setShowCountdown(false);
    setRemainingTime(QR_VALIDITY_SECONDS);
    expiresAtRef.current = null;
  }, []);

  const startCountdown = useCallback((onExpire: () => void) => {
    stopCountdown();
    setShowCountdown(true);
    setRemainingTime(QR_VALIDITY_SECONDS);
    expiresAtRef.current = Date.now() + QR_VALIDITY_SECONDS * 1000;
    countdownRef.current = setInterval(() => {
      const rem = Math.max(0, Math.floor(((expiresAtRef.current ?? 0) - Date.now()) / 1000));
      setRemainingTime(rem);
      if (rem <= 0) { stopCountdown(); onExpire(); }
    }, 300);
  }, [stopCountdown]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      stopCountdown();
      setForceQrMode(false);
      setConnected(false);
      prevQrRef.current = undefined;
      prevWppPassRef.current = undefined;
    }
  }, [open, stopCountdown]);

  // Detect CONNECTED → brief success then close
  useEffect(() => {
    if (!open || !channel || connected) return;
    if (channel.status === "CONNECTED") {
      stopCountdown();
      setConnected(true);
      setTimeout(onClose, 2000);
    }
  }, [channel?.status, open, connected, stopCountdown, onClose]);

  // Start/restart countdown when qrcode or wppPass changes
  useEffect(() => {
    if (!open || !channel) return;
    // Passkey: o qrcode carrega JSON de estado (nao um QR que expira) — nao inicia
    // o countdown de renovacao (que re-chamaria FetchQRCode e reiniciaria a cerimonia).
    if (channel.status === "PASSKEY") return;
    const qrChanged = channel.qrcode && channel.qrcode !== prevQrRef.current;
    const passChanged = channel.wppPass && channel.wppPass !== prevWppPassRef.current;
    prevQrRef.current = channel.qrcode;
    prevWppPassRef.current = channel.wppPass;
    if (qrChanged || passChanged) {
      startCountdown(() => { if (channel) onRequestNew(channel); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.qrcode, channel?.wppPass, open]);

  // Cleanup on unmount
  useEffect(() => () => stopCountdown(), [stopCountdown]);

  if (!channel) return null;

  function renderBody() {
    if (!channel) return null;

    // Success
    if (connected) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[220px] gap-3">
          <div className="w-16 h-16 rounded-full bg-success flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-success-foreground" />
          </div>
          <p className="text-success font-semibold">{t("qrConnected")}</p>
        </div>
      );
    }

    // Passkey nativo (Evolution Go): a cerimonia WebAuthn roda na aba do WhatsApp
    // Web (a extensao Passkey Linker conduz). Aqui so abrimos a openUrl e, quando o
    // servidor devolve o codigo (stage 'confirmation'), exibimos p/ conferencia.
    // Tokens do tema (o container do modal usa bg-card; so o QR mantem fundo branco).
    if (channel.status === "PASSKEY") {
      let pk: { stage?: string; openUrl?: string; code?: string } = {};
      try { pk = JSON.parse(channel.qrcode || "{}"); } catch { pk = {}; }
      const stage = String(pk.stage || "").toLowerCase();
      const hasCode = !!pk.code && stage === "confirmation";
      return (
        <div className="flex flex-col items-center gap-4 min-h-[220px] justify-center text-center px-2">
          <div className="w-14 h-14 rounded-full bg-violet-500/15 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-violet-500" />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("passkeyModalTitle")}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{t("passkeyModalDesc")}</p>
          {hasCode ? (
            <div className="w-full">
              <p className="text-xs text-muted-foreground mb-1">{t("passkeyCodeLabel")}</p>
              <div className="text-2xl font-bold font-mono tracking-widest text-foreground bg-muted rounded-lg py-3">{pk.code}</div>
              <p className="text-[11px] text-muted-foreground mt-2">{t("passkeyConfirmHint")}</p>
            </div>
          ) : pk.openUrl ? (
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => window.open(pk.openUrl, "_blank", "noopener,noreferrer")} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <Link2 className="w-4 h-4" /> {t("passkeyOpenWaWeb")}
              </Button>
              <p className="text-[11px] text-muted-foreground max-w-xs">{t("passkeyExtensionHint")}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <p className="text-xs text-muted-foreground">{t("passkeyWaiting")}</p>
            </div>
          )}
        </div>
      );
    }

    // Meow / Uazapi — raw image URL
    if (isMeowOrUazapi) {
      return channel.qrcode
        ? <img src={channel.qrcode} alt="QR Code" className="w-64 h-64 object-contain bg-white p-2 rounded-md" /> // eslint-disable-line @next/next/no-img-element
        : <div className="flex flex-col items-center gap-2 py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{t("waitingQrCode")}</p></div>;
    }

    // Pairing mode — waiting for code
    if (isPairingMode && !channel.wppPass) {
      return (
        <div className="flex flex-col items-center gap-3 min-h-[220px] justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("pairingWaiting")}</p>
          <button
            type="button"
            onClick={disablePairingAndUseQr}
            disabled={disablingPairing}
            className="text-xs text-primary underline hover:opacity-70 transition-opacity disabled:opacity-50 disabled:no-underline"
          >
            {disablingPairing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t("switchToQrCode")}
          </button>
        </div>
      );
    }

    // Pairing mode — code received → show blocks
    if (isPairingMode && channel.wppPass) {
      const chars = channel.wppPass.replace(/[\s-]/g, "").split("");
      return (
        <div className="text-center w-full py-2">
          <p className="text-sm font-semibold mb-4 text-foreground">{t("pairingInsert")}</p>
          <div className="flex items-center justify-center gap-1.5 mb-5 flex-wrap">
            {chars.map((char, idx) => (
              <React.Fragment key={idx}>
                {idx === 4 && <span className="text-xl font-bold text-muted-foreground px-0.5">-</span>}
                <div className="w-10 h-12 flex items-center justify-center text-xl font-bold font-mono bg-muted border-2 border-border rounded-lg text-foreground">
                  {char}
                </div>
              </React.Fragment>
            ))}
          </div>
          <button
            type="button"
            onClick={disablePairingAndUseQr}
            disabled={disablingPairing}
            className="text-xs text-primary underline hover:opacity-70 transition-opacity disabled:opacity-50 disabled:no-underline"
          >
            {disablingPairing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t("switchToQrCode")}
          </button>
        </div>
      );
    }

    // Standard QR code
    if (channel.qrcode) {
      if (channel.qrcode.startsWith("data:")) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={channel.qrcode} alt="QR Code" className="w-64 h-64 object-contain bg-white p-2 rounded-md" />;
      }
      if (/^[A-Za-z0-9+/]+=*$/.test(channel.qrcode)) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={`data:image/png;base64,${channel.qrcode}`} alt="QR Code" className="w-64 h-64 object-contain bg-white p-2 rounded-md" />;
      }
      return <div className="bg-white p-3 rounded-md" style={{ colorScheme: "light" }}><QRCodeSVG value={channel.qrcode} size={256} bgColor="#ffffff" fgColor="#000000" /></div>;
    }

    // Waiting for QR
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("waitingQrCode")}</p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">{channel.status === "PASSKEY" ? t("passkeyModalTitle") : "QR Code"} — {channel.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4 bg-card border border-border rounded-lg px-4 min-h-[240px] justify-center">
          {renderBody()}
        </div>

        {/* Countdown timer */}
        {showCountdown && channel.status !== "PASSKEY" && (channel.qrcode || channel.wppPass) && !connected && (
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{t("qrExpiresIn")}</p>
            <p className={cn(
              "text-3xl font-bold tabular-nums",
              remainingTime <= 10 ? "text-destructive" : remainingTime <= 20 ? "text-warning" : "text-success"
            )}>
              {remainingTime}s
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("qrAutoRenew")}</p>
          </div>
        )}

        {!connected && (
          <p className="text-sm text-muted-foreground text-center">{t("qrCodeProblems")}</p>
        )}

        <DialogFooter className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => onRequestNew(channel)} className="gap-1" disabled={connected || isLoadingNewQr}>
            {isLoadingNewQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t("newQrCode")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Form helpers ─────────────────────────────────────────
function Field({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

/**
 * WavoipTokenInput — entrada de múltiplos tokens WaVoIP como chips.
 * Persiste como string separada por vírgula (formato esperado pelo backend),
 * mas a UX é "digite e pressione Enter" para cada token.
 */
function WavoipTokenInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("sessoesPage");
  const [input, setInput] = useState("");
  const tokens = (value || "").split(",").map((s) => s.trim()).filter(Boolean);

  const add = (raw: string) => {
    const tk = raw.trim();
    if (!tk) return;
    if (tokens.includes(tk)) { setInput(""); return; }
    onChange([...tokens, tk].join(","));
    setInput("");
  };
  const remove = (tk: string) => onChange(tokens.filter((s) => s !== tk).join(","));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder={t("wavoipTokenPlaceholder")}
        />
        <Button type="button" variant="outline" onClick={() => add(input)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tokens.map((tk) => (
            <Badge key={tk} variant="secondary" className="gap-1 max-w-full">
              <span className="truncate max-w-[180px] font-mono text-xs">{tk}</span>
              <button
                type="button"
                onClick={() => remove(tk)}
                className="hover:text-destructive shrink-0"
                aria-label={t("wavoipTokenRemove")}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  id, label, description, checked, onCheckedChange,
}: {
  id: string; label: string; description: string;
  checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium leading-snug">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5 flex-shrink-0" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold text-primary border-b border-border pb-1 mb-2 mt-4">
      {children}
    </p>
  );
}

function CollapseSection({
  title, defaultOpen = false, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full text-sm font-semibold text-primary border-b border-border pb-1 mb-2 hover:opacity-80 transition-opacity"
        >
          <span>{title}</span>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200 flex-shrink-0"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 data-[state=closed]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const WABA_VERSIONS = ["v17.0", "v18.0", "v19.0", "v20.0", "v21.0", "v22.0", "v23.0", "v24.0", "v25.0", "v26.0"];

// Baileys import date helpers: backend stores "dd/MM/yyyy HH:mm" in importOldMessages / importRecentMessages
function formatImportDateTime(date: string, time: string): string {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} ${time || "00:00"}`;
}

function parseImportDateTime(val: string | null | undefined): { date: string; time: string } {
  if (!val) return { date: "", time: "" };
  try {
    if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
      const [datePart, timePart = "00:00"] = val.split(" ");
      const [day, month, year] = datePart.split("/");
      return { date: `${year}-${month}-${day}`, time: timePart.slice(0, 5) };
    }
    const [datePart, timePart = "00:00"] = val.split(/T| /);
    return { date: datePart.slice(0, 10), time: timePart.slice(0, 5) };
  } catch {
    return { date: "", time: "" };
  }
}

function emptyForm(): Omit<Partial<Whatsapp>, "messageQueue"> & { smtpConfig?: SmtpConfig; messageQueue?: string } {
  return {
    name: "",
    type: "waba_oauth" as Whatsapp["type"],
    isDefault: false,
    chatFlowId: null,
    queueId: null,
    wabaCallQueueId: null,
    userId: null,
    hybridMode: "disabled",
    linkedChannelId: null,
    baileysLib: "v7",
    baileysAuthStore: "files",
    tokenAPI: "",
    wabaId: "",
    bmToken: "",
    wabaVersion: "v21.0",
    appId: "",
    tokenTelegram: "",
    rescueWindow: "disabled",
    rescueWindowMessage: "",
    queuePositionEnabled: "inherit",
    queuePositionMessage: "",
    queuePositionAvgMinutes: null,
    importMessages: false,
    importOldMessagesGroups: false,
    closedTicketsPostImported: false,
    importStartDate: "",
    importStartTime: "",
    importEndDate: "",
    importEndTime: "",
    wppUser: "",
    wavoipToken: "",
    smtpConfig: {
      host: "",
      port: 465,
      secure: true,
      auth: { user: "", pass: "" },
      from: "",
      replyTo: "",
      imap: { host: "", port: 993, tls: true },
      oauth2: { client_id: "", client_secret: "", redirect_uri: "" },
    },
    messageQueue: undefined,
    // Feature toggles — defaults mirror Vue's ModalWhatsapp
    farewellMessage: "",
    farewellMediaUrls: [] as string[],
    farewellTemplate: null as any,
    sendEvaluation: "disabled",
    inactivityConfig: null as any,
    transcribeAudio: "disabled",
    transcribeAudioJson: "",
    selfDistribute: "disabled",
    destroyMessage: "disabled",
    birthdayDate: "disabled",
    birthdayDateMessage: "",
    birthdayDateHour: "",
    birthdayDateTemplate: "",
    ignoreBussinesHours: "disabled",
    autoReassign: "disabled",
    autoReassignStatus: "open,pending",
    autoReassignMethod: "R",
    autoReassignIntervalMinutes: 5,
    disableExternalIntegration: "disabled",
    waitProcessExternalInteraction: "enabled",
    webPush: "disabled",
    isActive: true,
    closeKeyWord: "",
    proxyUrl: "",
    proxyUser: "",
    proxyPass: "",
  };
}

// ─── Channel Modal ─────────────────────────────────────────
function ChannelModal({
  open,
  onClose,
  initial,
  queues,
  users,
  chatFlows,
  onSaved,
  onHijack,
  onAutoConnect,
  onSpecialChannelType,
  integrationSettings,
  existingChannels,
}: {
  open: boolean;
  onClose: () => void;
  initial: Whatsapp | null;
  queues: QueueOpt[];
  users: UserOpt[];
  chatFlows: ChatFlow[];
  onSaved: () => void;
  onHijack?: (payload: MetaProxyHijackPayload, retry?: () => Promise<void>) => void;
  onAutoConnect?: (whatsappId: number) => void;
  onSpecialChannelType?: (type: "dialog360" | "gupshup") => void;
  integrationSettings: IntegrationSettings;
  existingChannels: Whatsapp[];
}) {
  const t = useTranslations("sessoesPage");
  const tErrors = useTranslations("errors");
  const tHijack = useTranslations("channelHijack");
  const tCommon = useTranslations("common");
  const tGpt = useTranslations("chatGptPage");
  const isEdit = !!(initial?.id);
  const profilePicHeader = isEdit && initial?.profilePic &&
    initial.profilePic !== "disabled" &&
    !initial.profilePic.includes("nopicture.png") &&
    (initial.profilePic.startsWith("http") || initial.profilePic.startsWith("/"))
    ? initial.profilePic
    : null;
  type FormType = Omit<Partial<Whatsapp>, "messageQueue"> & { smtpConfig?: SmtpConfig; messageQueue?: string; emailSignature?: string };
  const [form, setForm] = useState<FormType>(emptyForm());
  // Validacao inline do submit: espelha os 4 gates do handleSubmit (toast permanece).
  // Chave por campo -> mensagem; o erro some ao digitar no campo e trocar o tipo de
  // canal limpa todos (o form re-renderiza outro conjunto de campos).
  type ChannelFormErrors = { name?: string; type?: string; tokenAPI?: string; linkedChannelId?: string; bdHeaderLink?: string };
  const [formErrors, setFormErrors] = useState<ChannelFormErrors>({});
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const wabaTokenFieldRef = useRef<HTMLInputElement>(null);
  const linkedChannelFieldRef = useRef<HTMLDivElement>(null);
  const bdHeaderLinkFieldRef = useRef<HTMLInputElement>(null);
  const clearFormError = (key: keyof ChannelFormErrors) =>
    setFormErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const focusInvalidField = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch { /* noop */ }
    el.focus({ preventScroll: true });
  };
  const [showPairingCode, setShowPairingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthCooldownUntil, setOauthCooldownUntil] = useState<number | null>(null);
  const [hijackState, setHijackState] = useState<MetaProxyHijackPayload | null>(null);
  const [hijackLoading, setHijackLoading] = useState(false);
  // Checagem visual de licenca — modal exibido ao criar canal direto (nao-OAuth),
  // como paridade com o gate do popup OAuth. status: "checking" (spinner) ->
  // "success" (flash breve, prossegue a criacao) OU "error" (bloqueia, nao cria).
  const [licenseCheck, setLicenseCheck] = useState<{
    open: boolean;
    status: "checking" | "success" | "error";
    message: string;
  }>({ open: false, status: "checking", message: "" });
  // Popup do gate de licenca (canal direto) aberto e aguardando resultado — trava o
  // botao Salvar enquanto a checagem acontece na janela do proxy (fora do app).
  const [licenseGating, setLicenseGating] = useState(false);
  const [uazapiHistorySyncNumber, setUazapiHistorySyncNumber] = useState("");
  const [uazapiHistorySyncLimit, setUazapiHistorySyncLimit] = useState(50);
  const [uazapiHistorySyncLoading, setUazapiHistorySyncLoading] = useState(false);
  // F7.7 — selector lib Baileys (admin/superadmin, somente em edição de canal baileys)
  const [baileysLibSelected, setBaileysLibSelected] = useState<BaileysLib>(
    (initial?.baileysLib as BaileysLib) || "fork"
  );
  const [baileysLibSaving, setBaileysLibSaving] = useState(false);
  const [baileysLibConfirmOpen, setBaileysLibConfirmOpen] = useState(false);
  // Escolha "InfiniteAPI" no seletor de tipo (pseudo-tipo, só na criação): o
  // canal é salvo como type=baileys + baileysLib=infiniteapi. Flag controla
  // apenas a exibição do Select de tipo e do bloco lib/armazenamento.
  const [infiniteChoice, setInfiniteChoice] = useState(false);
  // Armazenamento do auth state (files | sqlite) — somente lib infiniteapi.
  const [authStoreSelected, setAuthStoreSelected] = useState<BaileysAuthStore>(
    (initial?.baileysAuthStore as BaileysAuthStore) || "files"
  );
  const [authStoreSaving, setAuthStoreSaving] = useState(false);
  // PLANO_ZAPO §13 (F12) — migração baileys→zapo sem novo QR (edição apenas).
  const [zapoMigrateSaving, setZapoMigrateSaving] = useState(false);
  const [zapoMigrateConfirmOpen, setZapoMigrateConfirmOpen] = useState(false);
  const userProfile = useAuthStore((s) => s.user?.profile);
  const canEditBaileysLib = userProfile === "admin" || userProfile === "superadmin";
  const [hubOptions, setHubOptions] = useState<HubOption[]>([]);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, unknown> | null>(null);
  // Tenant-level toggle (superadmin /tenants): quando "disabled", esconde a opcao
  // "Usar app Google da plataforma" e forca o tenant a configurar app proprio.
  const platformGoogleAppEnabled =
    useAuthStore((s) => s.getConfigValue("enablePlatformGoogleApp")) !== "disabled";
  // Gate unico do WaVoIP (plano + interruptor do tenant). Desligado => a secao de
  // token some do formulario. O wavoipToken ja salvo NAO e apagado: o form e semeado
  // com `initial` e reenviado no payload, entao religar o recurso restaura tudo.
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  // Phase 16 — Toggle "App Google da plataforma" vs "App proprio".
  // TODO: quando app Google da plataforma sair de testes, restaurar inicializacao baseada em
  // credenciais e o useEffect que forca true quando platformGoogleAppEnabled=false
  const [useOwnGoogleApp, setUseOwnGoogleApp] = useState<boolean>(true);

  // ── Integration config status (per channel type requiring pre-config)
  const [integrationConfigured, setIntegrationConfigured] = useState<Record<string, boolean>>({});

  // ── Meta OAuth
  const [metaToken, setMetaToken] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [appWabaList, setAppWabaList] = useState<AppWaba[]>([]);
  const [selectedAppWabaId, setSelectedAppWabaId] = useState<string>("");
  const [manualWabaVersion, setManualWabaVersion] = useState(false);
  const [wabaManualConnected, setWabaManualConnected] = useState(false);
  const [facebookSDKLoaded, setFacebookSDKLoaded] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [oauthFailed, setOauthFailed] = useState(false);
  const [allowedChannels, setAllowedChannels] = useState<string[] | null>(null);
  // F12: null em allowedChannels significa DUAS coisas ("sem restrição" e
  // "ainda não carregou/fetch falhou") — o bloco de migração p/ zapo precisa
  // distinguir p/ não renderizar fail-open durante o fetch.
  const [tenantChannelsLoaded, setTenantChannelsLoaded] = useState(false);
  const [channelConnectionLimits, setChannelConnectionLimits] = useState<Record<string, number>>({});
  const [tenantOauthProxyUrl, setTenantOauthProxyUrl] = useState<string>("");
  // Tenant.oauthEnabled — quando false, esconder a opção OAuth (Meta Embedded Signup)
  // do seletor de app. Default = true para evitar flicker antes do fetch resolver.
  const [tenantOAuthEnabled, setTenantOAuthEnabled] = useState<boolean>(true);
  // Phase 12 — tenant's configured OAuth white-label CNAME (null if not set)
  const { customDomain: oauthCustomDomain } = useOAuthProxyDomain();
  const sdkScriptRef = useRef<HTMLScriptElement | null>(null);
  const proxyPopupRef = useRef<Window | null>(null);
  // Popup do gate de licenca (canal direto) — ref proprio, isolado do proxyPopupRef
  // dos fluxos Meta, para nao colidir com o listener de mensagens `proxy:*`.
  const licenseGatePopupRef = useRef<Window | null>(null);
  // Cleanup do gate de licenca em andamento (remove listener + timers). Guardado em
  // ref para ser acionado se o modal desmontar com o popup ainda aberto.
  const licenseGateCleanupRef = useRef<(() => void) | null>(null);
  const licenseKeyRef = useRef(licenseKey);
  useEffect(() => { licenseKeyRef.current = licenseKey; }, [licenseKey]);
  // Rede de seguranca: se o form desmontar com o popup de licenca aberto, remove o
  // listener/timers imperativos e fecha a janela (evita handlers orfaos).
  useEffect(() => () => {
    licenseGateCleanupRef.current?.();
    if (licenseGatePopupRef.current && !licenseGatePopupRef.current.closed) {
      licenseGatePopupRef.current.close();
    }
    licenseGatePopupRef.current = null;
  }, []);

  // ── Birthday WABA template picker state
  const [bdMediaFile, setBdMediaFile] = useState<File | null>(null);
  const [bdTplList, setBdTplList] = useState<WabaTemplate[]>([]);
  const [bdSelectedTpl, setBdSelectedTpl] = useState<WabaTemplate | null>(null);
  const [bdTplVars, setBdTplVars] = useState<Array<{ key: string; label: string; value: string }>>([]);
  const [bdTplSearch, setBdTplSearch] = useState("");
  const [bdTplLoading, setBdTplLoading] = useState(false);
  const [bdGalleryOpen, setBdGalleryOpen] = useState(false);
  const bdSavedVarValuesRef = useRef<Record<string, string>>({});
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  // Phase 12 — PROXY_URL respects tenant's oauthCustomDomain (CNAME white-label).
  // getProxyBaseUrl returns https://oauth.techprovider.com.br or https://${customDomain}.
  // Quando tenant.oauthEnabled === false (gestão por superadmin), PROXY_URL fica vazio
  // e todos os checks `PROXY_URL ? ...` escondem a opção OAuth do tenant.
  const PROXY_URL = tenantOAuthEnabled ? getProxyBaseUrl(oauthCustomDomain) : "";
  const usingProxy = PROXY_URL !== "" && selectedAppWabaId === "__PROXY__";
  const selectedAppWaba = usingProxy ? null : (appWabaList.find((a) => String(a.id) === selectedAppWabaId) ?? null);
  const isOAuthType = ["waba_oauth", "instagram_oauth", "facebook_oauth"].includes(form.type as string);

  useEffect(() => {
    if (!open) {
      // Reset launch state when modal closes so button is never stuck on reopen
      setLaunching(false);
      setWabaManualConnected(false);
      if (proxyPopupRef.current && !proxyPopupRef.current.closed) {
        proxyPopupRef.current.close();
      }
      proxyPopupRef.current = null;
      if (licenseGatePopupRef.current && !licenseGatePopupRef.current.closed) {
        licenseGatePopupRef.current.close();
      }
      licenseGateCleanupRef.current?.();
      licenseGatePopupRef.current = null;
      return;
    }
    if (open) {
      if (initial) {
        const initStart = parseImportDateTime((initial as any)?.importOldMessages);
        const initEnd = parseImportDateTime((initial as any)?.importRecentMessages);
        setForm({
          ...emptyForm(),
          ...initial,
          messageQueue: (initial as any)?.queueIdImportMessages ? String((initial as any).queueIdImportMessages) : undefined,
          importStartDate: initStart.date,
          importStartTime: initStart.time,
          importEndDate: initEnd.date,
          importEndTime: initEnd.time,
        });
      } else {
        setForm(emptyForm());
      }
      // F7.7 — sincronizar os selects de lib Baileys / auth store, que são useState
      // separados do `form`. O initializer do useState só roda no 1o mount; sem este
      // reset, editar um canal salvo como v7/infiniteapi carregava o default stale
      // (fork/files) em vez do estado salvo.
      setBaileysLibSelected((initial?.baileysLib as BaileysLib) || "fork");
      setAuthStoreSelected((initial?.baileysAuthStore as BaileysAuthStore) || "files");
      setInfiniteChoice(false);
      // Abrir/reabrir o modal nunca herda erros de validacao da sessao anterior
      setFormErrors({});
      const rawVer = initial?.wabaVersion || "";
      const strippedVer = rawVer.replace(/^v/i, "");
      setManualWabaVersion(!!strippedVer && !["17.0","18.0","19.0","20.0","21.0","22.0","23.0","24.0","25.0"].includes(strippedVer));
      setShowPairingCode(false);
      // Load AppWaba list when dialog opens
      listActiveAppWabas()
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : [];
          setAppWabaList(list);
          // Auto-select proxy option if PROXY_URL is configured E o tenant tem oauthEnabled.
          // tenantOAuthEnabled pode ainda estar no default (true) quando o fetch do tenant
          // não resolveu — o efeito abaixo resolve a corrida resetando a seleção quando
          // tenantOAuthEnabled vira false.
          const proxyUrl = (process.env.NEXT_PUBLIC_OAUTH_PROXY_URL || "").replace(/\/$/, "");
          if (proxyUrl && tenantOAuthEnabled) {
            setSelectedAppWabaId("__PROXY__");
          } else if (list.length > 0) {
            setSelectedAppWabaId(String(list[0].id));
          }
        })
        .catch(() => { toast.error(tErrors("loadFailed")); });
      // Load metaToken, allowedChannels and oauthProxyUrl from tenant
      try {
        const stored = localStorage.getItem("usuario");
        if (stored) {
          const u = JSON.parse(stored);
          if (u?.tenantId) {
            fetchTenantById(u.tenantId)
              .then(({ data }) => {
                const d = Array.isArray(data) ? data[0] : data;
                setMetaToken((d as any)?.metaToken || "");
                setLicenseKey((d as any)?.tenantEmail || "");
                const allowed = (d as any)?.allowedChannels;
                setAllowedChannels(Array.isArray(allowed) && allowed.length > 0 ? allowed : null);
                setTenantChannelsLoaded(true);
                const limits = (d as any)?.channelConnectionLimits;
                setChannelConnectionLimits(limits && typeof limits === "object" ? limits : {});
                // Tenant.oauthEnabled defaulta a true no model — undefined trata como habilitado.
                const oauthEnabled = (d as any)?.oauthEnabled !== false;
                setTenantOAuthEnabled(oauthEnabled);
                const oauthUrl = (d as any)?.oauthProxyUrl || "";
                setTenantOauthProxyUrl(oauthEnabled ? oauthUrl : "");
                // Track which channel types have their required integration configured
                setIntegrationConfigured((prev) => ({
                  ...prev,
                  evo: !!(d as any)?.evoHost,
                  zapi: !!(d as any)?.zapiHost,
                  uazapi: !!(d as any)?.uazapiHost,
                  hub: !!(d as any)?.hubToken,
                  dialog360: !!((d as any)?.dialog360PartnerId && (d as any)?.dialog360PartnerApiKey),
                  gupshup: !!((d as any)?.gupshupPartnerEmail && (d as any)?.gupshupPartnerPassword),
                }));
              })
              .catch(() => { toast.error(tErrors("loadFailed")); });
          }
        }
      } catch {}
      // Check integration configs for mercadolivre, olx, linkedin (best-effort; errors silently ignored)
      // Also fetch global providers — a channel type is considered configured if a global provider exists for it
      Promise.all([
        api.get("/app-mercadolivre").catch(() => ({ data: [] })),
        api.get("/app-olx").catch(() => ({ data: [] })),
        api.get("/app-linkedin").catch(() => ({ data: [] })),
        api.get("/globalProviderConfig/public", { params: { status: "active" } }).catch(() => ({ data: [] })),
        api.get("/app-youtube").catch(() => ({ data: [] })),
        api.get("/app-tiktok").catch(() => ({ data: [] })),
        api.get("/app-woocommerce").catch(() => ({ data: [] })),
      ]).then(([ml, olx, li, gp, yt, tt, woo]) => {
        const hasData = (d: unknown) => Array.isArray(d) ? (d as unknown[]).length > 0 : !!(d && typeof d === "object");
        // Build a set of channel types covered by active global providers
        // Backend retorna { host, type } (ListPublicGlobalProviderConfigService mapeia providerType→type
        // e o endpoint /globalProviderConfig/public chamado acima filtra por status=active no service).
        const gpList: { type?: string }[] = Array.isArray(gp.data) ? gp.data : [];
        const activeGpTypes = new Set(
          gpList.map((p) => p.type).filter(Boolean)
        );
        setIntegrationConfigured((prev) => ({
          ...prev,
          evo: prev.evo || activeGpTypes.has("evo"),
          zapi: prev.zapi || activeGpTypes.has("zapi"),
          uazapi: prev.uazapi || activeGpTypes.has("uazapi"),
          hub: prev.hub || activeGpTypes.has("hub"),
          dialog360: prev.dialog360 || activeGpTypes.has("dialog360_partner") || activeGpTypes.has("dialog360"),
          gupshup: prev.gupshup || activeGpTypes.has("gupshup_partner") || activeGpTypes.has("gupshup"),
          // wuzapi uses global provider type "wuzapi" but has no separate tenant channel type in CHANNEL_TYPES
          mercadolivre: hasData(ml.data),
          olx: hasData(olx.data),
          linkedin: hasData(li.data),
          youtube: hasData(yt.data),
          tiktok: hasData(tt.data),
          woocommerce: hasData(woo.data),
        }));
      });
    }
  }, [open, initial]);

  // Reset launching when OAuth type changes (e.g. switching between waba/instagram/facebook)
  useEffect(() => {
    setLaunching(false);
    setOauthFailed(false);
    if (proxyPopupRef.current && !proxyPopupRef.current.closed) {
      proxyPopupRef.current.close();
    }
    proxyPopupRef.current = null;
  }, [form.type]);

  // Load FB SDK when waba_oauth is selected
  useEffect(() => {
    if (form.type === "waba_oauth" && selectedAppWaba?.appId) {
      if (window.FB) {
        window.FB.init({ appId: selectedAppWaba.appId, cookie: true, xfbml: true, version: (selectedAppWaba as any).apiVersion || "v19.0" });
        setFacebookSDKLoaded(true);
      } else if (!sdkScriptRef.current) {
        window.fbAsyncInit = () => {
          window.FB.init({ appId: selectedAppWaba.appId, cookie: true, xfbml: true, version: (selectedAppWaba as any).apiVersion || "v19.0" });
          setFacebookSDKLoaded(true);
        };
        const script = document.createElement("script");
        script.src = "https://connect.facebook.net/en_US/sdk.js";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
        sdkScriptRef.current = script;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, selectedAppWabaId]);

  // Resolve a corrida entre fetch do tenant e auto-seleção: se tenant.oauthEnabled === false,
  // não pode haver __PROXY__ selecionado (a opção foi escondida do dropdown).
  useEffect(() => {
    if (!tenantOAuthEnabled && selectedAppWabaId === "__PROXY__") {
      setSelectedAppWabaId(appWabaList[0] ? String(appWabaList[0].id) : "");
    }
  }, [tenantOAuthEnabled, selectedAppWabaId, appWabaList]);

  // Listen for OAuth popup callback (same-origin)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_COMPLETE") return;
      setLaunching(false);
      if (event.data.status === "success") {
        toast.success(event.data.message || t("oauthSuccess"));
        const targetId = (event.data.whatsappId as number | undefined) ?? initial?.id;
        onSaved();
        onClose();
        if (targetId && onAutoConnect) {
          onAutoConnect(targetId);
        }
      } else if (event.data.status === "error") {
        toast.error(event.data.message || t("oauthError"));
        setOauthFailed(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  // Phase 13.c — Listen for postMessage from OAuth Proxy popup.
  // When oauthCustomDomain is set, Meta flows open a /meta-frame wrapper at
  // the custom domain (which embeds the canonical signup HTML in an iframe).
  // In that case the event.origin is the custom domain; otherwise it's canonical.
  useEffect(() => {
    function handleProxyMessage(event: MessageEvent) {
      if (event.origin !== OAUTH_PROXY_URL) return;
      const metaExpectedOrigin = OAUTH_PROXY_URL;
      const { type, error, data: msgData, hijack: msgHijack } = (event.data || {}) as { type?: string; error?: string; data?: any; hijack?: any };
      if (type === "proxy:ready") {
        const popup = proxyPopupRef.current;
        if (!popup || popup.closed) return;
        const sendCredentials = () => {
          const p = proxyPopupRef.current;
          if (!p || p.closed) return;
          const rawToken = localStorage.getItem("token");
          const authToken = rawToken ? JSON.parse(rawToken) : null;
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
          const rawUser = localStorage.getItem("usuario");
          const tenantId = selectedAppWaba?.tenantId ?? (rawUser ? (JSON.parse(rawUser)?.tenantId ?? null) : null);
          const key = licenseKeyRef.current;
          if (!key) {
            setTimeout(sendCredentials, 200);
            return;
          }
          const appWabaId = !usingProxy && selectedAppWaba?.id ? Number(selectedAppWaba.id) : null;
          p.postMessage(
            {
              type:          "proxy:credentials",
              apiUrl,
              authToken,
              tenantId,
              metaToken,
              licenseKey:    key,
              webhookOrigin: usingProxy ? 'zdg_oauth' : 'own_app',
              appWabaId,
              // Capability gate: backend desta build suporta canal Instagram (EAA)
              // criado a partir do asset selector do facebook-signup.
              igViaFacebook: true,
            },
            metaExpectedOrigin
          );
        };
        sendCredentials();
        // When using proxy mode, the popup handles exchange itself via /api/exchange-waba
      } else if (type === "proxy:success") {
        toast.success(t("waChannelCreated"));
        setLaunching(false);
        proxyPopupRef.current = null;
        onSaved();
        onClose();
        if (msgHijack && onHijack) {
          onHijack({
            channel:      msgHijack.channel      || (form.type as string) || "instagram",
            errorCode:    msgHijack.errorCode    || "ALREADY_REGISTERED",
            apiUrlMasked: msgHijack.existing?.apiUrlMasked || "***",
            registeredAt: msgHijack.existing?.registeredAt ?? null,
            identifier:   msgHijack.identifier  || null,
            callbackUrl:  msgHijack.callbackUrl || null,
          });
        }
      } else if (type === "proxy:cancelled") {
        toast.info(t("waOauthCancelled"));
        setLaunching(false);
        proxyPopupRef.current = null;
      } else if (type === "proxy:error") {
        setLaunching(false);
        proxyPopupRef.current = null;
        if (msgHijack && onHijack) {
          const retryPayload = msgHijack.retryCreate;
          const retryFn: (() => Promise<void>) | undefined = retryPayload
            ? async () => {
                try {
                  await createWhatsapp(retryPayload);
                  toast.success(t("waChannelCreated"));
                  onSaved();
                  onClose();
                } catch (e: any) {
                  const errCode = e?.data?.error || e?.response?.data?.error || e?.message || "";
                  toast.error(errCode || t("errorSaving"));
                }
              }
            : undefined;
          onHijack({
            channel:      msgHijack.channel      || (form.type as string) || "waba",
            errorCode:    msgHijack.errorCode    || "ALREADY_REGISTERED",
            apiUrlMasked: msgHijack.existing?.apiUrlMasked || "***",
            registeredAt: msgHijack.existing?.registeredAt ?? null,
            identifier:   msgHijack.identifier  || null,
            callbackUrl:  msgHijack.callbackUrl || null,
          }, retryFn);
        } else {
          toast.error(error || t("waOauthError"));
          setOauthFailed(true);
        }
      }
    }
    window.addEventListener("message", handleProxyMessage);
    return () => window.removeEventListener("message", handleProxyMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppWabaId, selectedAppWaba, metaToken, oauthCustomDomain]);

  // WABA manual: recebe credenciais do popup após onboarding bem-sucedido
  useEffect(() => {
    async function handleWabaManual(event: MessageEvent) {
      if (!event.data) return;
      if (event.data.type === "waba:manual:error") {
        const err = event.data.payload?.error;
        toast.error(err || t("wabaManualError"));
        return;
      }
      if (event.data.type !== "waba:manual:success") return;
      const p = event.data.payload || {};
      // Fluxo novo (popup callback): payload traz whatsappId — buscar dados do canal
      // criado para popular o form. Preserva compatibilidade com payload antigo
      // (phoneId/wabaId/bmToken inline) caso venha de outro caller.
      if (p.whatsappId) {
        // O canal ja foi criado no backend (POST relay). Atualiza a lista
        // e fecha o modal para evitar que o usuario clique "Salvar" e crie
        // um segundo canal.
        try { onSaved(); } catch { /* nao critico */ }
        toast.success(t("wabaManualOpened"));
        onClose();
        return;
      }
      // Compat — payload inline (legado)
      setField("tokenAPI", p.phoneId || "");
      setField("wabaId", p.wabaId || "");
      setField("bmToken", p.bmToken || "");
      setField("wabaVersion", p.apiVersion || "v21.0");
      setField("appId", p.appId || "");
      setWabaManualConnected(true);
    }
    window.addEventListener("message", handleWabaManual);
    return () => window.removeEventListener("message", handleWabaManual);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listener dos popups de setup de webhook (WABA / Instagram / Messenger — Fluxo A)
  useEffect(() => {
    function handleWebhookSetup(event: MessageEvent) {
      if (!event.data) return;
      const type = event.data.type;
      if (
        type === "waba:webhook:setup:success" ||
        type === "instagram:webhook:setup:success" ||
        type === "messenger:webhook:setup:success"
      ) {
        toast.success(t("webhookRevalidated"));

        // Popup concluiu registro no proxy + override Meta. Limpa flag
        // webhookNeedsRevalidation no canal correspondente (se identificavel).
        // UI no SessoesPage tem listener dedicado que atualiza o state.
        const wid = Number(event.data.whatsappId);
        if (wid) {
          confirmWebhookRevalidation(wid).catch(() => {});
        }
      }
    }
    window.addEventListener("message", handleWebhookSetup);
    return () => window.removeEventListener("message", handleWebhookSetup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.type?.includes("hub")) {
      api
        .get("/hub-channel/")
        .then((res) => {
          const data = Array.isArray(res.data) ? res.data : [];
          setHubOptions(
            data.map((h: Record<string, unknown>) => ({
              label: String(h.name || h.label || h.id),
              value: String(h.id || h.value),
            }))
          );
        })
        .catch(() => { toast.error(tErrors("loadFailed")); });
    }
  }, [form.type]);

  // ── Birthday WABA template: restore state when editing an existing channel
  useEffect(() => {
    if (!open) {
      setBdMediaFile(null);
      setBdTplList([]);
      setBdSelectedTpl(null);
      setBdTplVars([]);
      setBdTplSearch("");
      setBdGalleryOpen(false);
      bdSavedVarValuesRef.current = {};
      return;
    }
    if (initial?.birthdayDateTemplate) {
      try {
        const saved = JSON.parse(initial.birthdayDateTemplate as string);
        if (saved._tplSnapshot) {
          const savedVals: Record<string, string> = {};
          (saved.components || []).forEach((comp: any) => {
            if (comp.type === "HEADER" && comp.value) savedVals["header_link"] = comp.value;
            if (comp.type === "BODY") {
              (comp.variables || []).forEach((v: string, i: number) => {
                savedVals[`variable_${i + 1}`] = v;
              });
              (comp.parameters || []).forEach((p: any) => {
                if (p.name) savedVals[`named_variable_${p.name}`] = p.text || "";
              });
            }
          });
          bdSavedVarValuesRef.current = savedVals;
          setBdSelectedTpl(saved._tplSnapshot);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Birthday WABA template: extract vars when template selected
  useEffect(() => {
    // Trocar/limpar o template invalida o erro inline do header de midia
    clearFormError("bdHeaderLink");
    if (!bdSelectedTpl) { setBdTplVars([]); return; }
    const saved = bdSavedVarValuesRef.current;
    const vars: Array<{ key: string; label: string; value: string }> = [];
    bdSelectedTpl.components?.forEach((comp) => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE") {
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: saved["header_link"] || "" });
      }
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        const named = [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
        named.forEach((m) => {
          if (!vars.some((v) => v.key === `named_variable_${m[1]}`)) {
            vars.push({ key: `named_variable_${m[1]}`, label: `{{${m[1]}}}`, value: saved[`named_variable_${m[1]}`] || "" });
          }
        });
        const positional = [...comp.text.matchAll(/\{\{(\d+)\}\}/g)];
        positional.forEach((m) => {
          if (!vars.some((v) => v.key === `variable_${m[1]}`)) {
            vars.push({ key: `variable_${m[1]}`, label: t("birthdayVarPositional", { number: m[1] }), value: saved[`variable_${m[1]}`] || "" });
          }
        });
      }
    });
    setBdTplVars(vars);
    bdSavedVarValuesRef.current = {};
  }, [bdSelectedTpl]);

  // ── Birthday WABA template: sync config JSON to form field
  useEffect(() => {
    if (!bdSelectedTpl) return;
    const components: any[] = [];
    const headerComp = bdSelectedTpl.components?.find((c) => c.type === "HEADER");
    if (headerComp) {
      const headerLinkVar = bdTplVars.find((v) => v.key === "header_link");
      if (headerLinkVar?.value) {
        components.push({ type: "HEADER", format: headerComp.format, value: headerLinkVar.value });
      }
    }
    const positionalVars = bdTplVars.filter((v) => v.key.startsWith("variable_"));
    const namedVars = bdTplVars.filter((v) => v.key.startsWith("named_variable_"));
    if (positionalVars.length > 0) {
      const variables = [...positionalVars]
        .sort((a, b) => parseInt(a.key.replace("variable_", "")) - parseInt(b.key.replace("variable_", "")))
        .map((v) => v.value);
      components.push({ type: "BODY", variables });
    } else if (namedVars.length > 0) {
      components.push({ type: "BODY", parameters: namedVars.map((v) => ({ type: "text", text: v.value, name: v.key.replace("named_variable_", "") })) });
    }
    setForm((prev) => ({
      ...prev,
      birthdayDateTemplate: JSON.stringify({ name: bdSelectedTpl.name, language: bdSelectedTpl.language, components, _tplSnapshot: bdSelectedTpl }),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bdSelectedTpl, bdTplVars]);

  async function loadBdTemplates() {
    const type = ((form as any).type || "").toLowerCase();
    const isBsp = type === "dialog360" || type === "gupshup";
    const tokenAPI = (form as any).tokenAPI || "";
    if (!isBsp && !tokenAPI) { toast.warning(t("wabaTokenMissing")); return; }
    setBdTplLoading(true);
    try {
      const { getTemplatesForChannel } = await import("@/services/channel-templates");
      const res = await getTemplatesForChannel({ id: (form as any).id, type, tokenAPI, appId: (form as any).appId });
      const list = (Array.isArray(res) ? res : (res as { data?: WabaTemplate[] })?.data || []) as WabaTemplate[];
      setBdTplList([...list].sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())));
    } catch { toast.error(t("birthdayTemplateLoadError")); }
    finally { setBdTplLoading(false); }
  }

  function clearBdTemplate() {
    setBdSelectedTpl(null);
    setBdTplVars([]);
    setForm((prev) => ({ ...prev, birthdayDateTemplate: "" }));
  }

  function pickBdGalleryItem(item: GalleryItem) {
    clearFormError("bdHeaderLink");
    setBdTplVars((prev) => prev.map((v) => v.key === "header_link" ? { ...v, value: item.url } : v));
    setBdGalleryOpen(false);
  }

  function setField<K extends keyof FormType>(key: K, value: FormType[K]) {
    // Validacao inline: erro do campo some ao digitar; trocar o tipo de canal
    // (equivale a trocar de "aba" do form) limpa todos os erros marcados.
    const k = key as string;
    if (k === "type") setFormErrors((prev) => (Object.keys(prev).length ? {} : prev));
    else if (k === "name" || k === "tokenAPI" || k === "linkedChannelId") clearFormError(k);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setSmtpField(key: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      smtpConfig: { ...(prev.smtpConfig || {}), [key]: value },
    }));
  }

  function setSmtpAuthField(key: string, value: string) {
    // Phase 16 — usa prev (functional update); chamadas em sequencia (ex: setSmtpAuthField + setSmtpImapField)
    // precisam ler estado atualizado, nao o snapshot do render.
    setForm((prev) => {
      const smtp = prev.smtpConfig || {};
      const auth = smtp.auth || {};
      return {
        ...prev,
        smtpConfig: { ...smtp, auth: { ...auth, [key]: value } },
      };
    });
  }

  function setSmtpImapField(key: string, value: unknown) {
    setForm((prev) => {
      const smtp = prev.smtpConfig || {};
      const imap = smtp.imap || {};
      return {
        ...prev,
        smtpConfig: { ...smtp, imap: { ...imap, [key]: value } },
      };
    });
  }

  function setSmtpOAuth2Field(key: string, value: string) {
    // Usa prev (functional update) — chamadas em sequencia (ex: limpar client_id E
    // client_secret) precisam ler o estado atualizado, nao o snapshot do render.
    setForm((prev) => {
      const smtp = prev.smtpConfig || {};
      const oauth2 = smtp.oauth2 || {};
      return {
        ...prev,
        smtpConfig: { ...smtp, oauth2: { ...oauth2, [key]: value } },
      };
    });
  }

  // ── Dynamic channel types (adds Meta OAuth options based on AppWaba config or proxy)
  // OAuth channels come first in the Meta group: waba_oauth, instagram_oauth, facebook_oauth, then the rest
  const allChannelTypes = [
    ...(PROXY_URL || appWabaList.some((a) => (a as any).configId)
      ? [{ labelKey: "channelTypeWabaOauth", value: "waba_oauth", group: "meta" }]
      : []),
    ...(PROXY_URL || appWabaList.some((a) => (a as any).appInstagramId)
      ? [{ labelKey: "channelTypeInstagramOauth", value: "instagram_oauth", group: "meta" }]
      : []),
    ...(PROXY_URL || appWabaList.some((a) => a.appId)
      ? [{ labelKey: "channelTypeFacebookOauth", value: "facebook_oauth", group: "meta" }]
      : []),
    ...CHANNEL_TYPES,
  ];
  // Filter by tenant's allowedChannels (null = no restriction).
  // "infinite" é pseudo-tipo de criação de baileys — segue a permissão de baileys.
  const channelTypes = allowedChannels
    ? allChannelTypes.filter((ct) => allowedChannels.includes(ct.value === "infinite" ? "baileys" : ct.value))
    : allChannelTypes;

  // Phase 13.c — Builds the Meta popup URL. With customDomain, opens the
  // /meta-frame wrapper (which embeds the canonical signup HTML in an iframe,
  // so FB SDK keeps running on oauth.techprovider.com.br but the popup address bar shows
  // the tenant domain). Without customDomain, opens the canonical directly.
  // Meta channels sempre no host canonico (oauth.techprovider.com.br).
  function buildMetaPopupUrl(channel: "waba" | "instagram" | "facebook"): string {
    const cb = encodeURIComponent(window.location.origin);
    return `${OAUTH_PROXY_URL}/${channel}-signup?callbackOrigin=${cb}`;
  }

  function launchWhatsAppOAuth() {
    setOauthFailed(false);
    if (usingProxy) {
      setLaunching(true);
      const popup = window.open(buildMetaPopupUrl("waba"), "waba-proxy-signup", "width=600,height=700");
      proxyPopupRef.current = popup;
      return;
    }
    if (!selectedAppWaba?.configId) { toast.error(t("configIdNotSet")); return; }
    setLaunching(true);
    const popup = window.open(buildMetaPopupUrl("waba"), "waba-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    if (!popup) { toast.error(t("popupBlocked")); setLaunching(false); return; }
    proxyPopupRef.current = popup;
  }

  function launchInstagramOAuth() {
    setOauthFailed(false);
    setLaunching(true);
    const popup = window.open(buildMetaPopupUrl("instagram"), "instagram-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    if (!popup) { toast.error(t("popupBlocked")); setLaunching(false); return; }
    proxyPopupRef.current = popup;
  }

  function launchFacebookOAuth() {
    setOauthFailed(false);
    setLaunching(true);
    const popup = window.open(buildMetaPopupUrl("facebook"), "facebook-oauth", "width=600,height=700,scrollbars=yes,resizable=yes");
    if (!popup) { toast.error(t("popupBlocked")); setLaunching(false); return; }
    proxyPopupRef.current = popup;
  }

  async function handleUazapiHistorySync() {
    if (!initial?.id || !uazapiHistorySyncNumber.trim()) return;
    setUazapiHistorySyncLoading(true);
    try {
      await requestUazapiHistorySync(initial.id, { number: uazapiHistorySyncNumber.trim(), limit: uazapiHistorySyncLimit });
      toast.success(t("uazapiHistorySyncSuccess"));
    } catch {
      toast.error(t("uazapiHistorySyncError"));
    } finally {
      setUazapiHistorySyncLoading(false);
    }
  }

  // F7.7 — aplicar troca de lib Baileys + forcar QR-scan novo.
  // Quando troca v7 -> fork, o backend dispara DELETE preventivo das entradas
  // v7-only em BaileysSessions. Em qualquer transicao, derrubamos a sessao
  // (disconnect) e reconectamos (gera novo QR) para garantir auth state limpo.
  async function handleBaileysLibConfirm() {
    if (!initial?.id) {
      setBaileysLibConfirmOpen(false);
      return;
    }
    const currentLib = (initial.baileysLib as BaileysLib) || "fork";
    if (baileysLibSelected === currentLib) {
      setBaileysLibConfirmOpen(false);
      return;
    }
    setBaileysLibSaving(true);
    try {
      // Backend ja mata o wbot antigo em memoria + limpa entradas v7-only se
      // for rollback v7 -> fork (UpdateBaileysLibService). Aqui basta disparar
      // o connect para iniciar nova sessao com a lib resolvida.
      await updateBaileysLib(initial.id, baileysLibSelected);
      try {
        await connectSession(initial.id);
      } catch { /* nao bloqueante: operador pode iniciar manual depois */ }
      toast.success(t("baileysLibChangedSuccess"));
      setBaileysLibConfirmOpen(false);
    } catch (err: any) {
      const code = err?.response?.data?.error || err?.message;
      toast.error(code ? `${t("baileysLibChangeError")}: ${code}` : t("baileysLibChangeError"));
    } finally {
      setBaileysLibSaving(false);
    }
  }

  // Troca de armazenamento do auth state em edicao: PATCH atomico + reconnect.
  // files -> sqlite migra o estado legado na proxima conexao (sem novo QR);
  // sqlite -> files copia os creds de volta para o Postgres antes do update.
  async function handleBaileysAuthStoreApply() {
    if (!initial?.id) return;
    const current = (initial.baileysAuthStore as BaileysAuthStore) || "files";
    if (authStoreSelected === current) return;
    setAuthStoreSaving(true);
    try {
      await updateBaileysAuthStore(initial.id, authStoreSelected);
      try {
        await connectSession(initial.id);
      } catch { /* nao bloqueante: operador pode iniciar manual depois */ }
      toast.success(t("baileysAuthStoreChangedSuccess"));
    } catch (err: any) {
      const code = err?.response?.data?.error || err?.message;
      toast.error(code ? `${t("baileysAuthStoreChangeError")}: ${code}` : t("baileysAuthStoreChangeError"));
    } finally {
      setAuthStoreSaving(false);
    }
  }

  // PLANO_ZAPO §13 (F12) — migração baileys→zapo sem novo QR. O backend faz
  // tudo (teardown sem logout, conversão do auth state, flip do type e
  // reconexão); o 200 só volta com o canal já CONNECTED como zapo — em falha
  // o backend restaura a conexão anterior sozinho.
  async function handleZapoMigrateConfirm() {
    if (!initial?.id) {
      setZapoMigrateConfirmOpen(false);
      return;
    }
    setZapoMigrateSaving(true);
    try {
      await migrateBaileysToZapo(initial.id);
      toast.success(t("zapoMigrateSuccess"));
      setZapoMigrateConfirmOpen(false);
      onSaved();
      onClose();
    } catch (err: any) {
      // O interceptor da api rejeita com error.response — o payload fica em
      // err.data (não err.response.data). Códigos internos viram mensagem
      // i18n; desconhecidos caem no genérico.
      const code: string | undefined =
        err?.data?.message || err?.response?.data?.message || err?.message;
      const codeKeyMap: Record<string, string> = {
        ERR_ZAPO_MIGRATE_NOT_PAIRED: "zapoMigrateErrNotPaired",
        ERR_ZAPO_MIGRATE_LICENSE_INVALID: "zapoMigrateErrLicense",
        ERR_ZAPO_MIGRATE_CAT_UNAVAILABLE: "zapoMigrateErrProxy",
        ERR_CHANNEL_TYPE_NOT_ALLOWED: "zapoMigrateErrNotAllowed",
        ERR_NO_PERMISSION_CHANNEL_TYPE_LIMIT: "zapoMigrateErrNotAllowed",
        ERR_ZAPO_MIGRATE_START_FAILED: "zapoMigrateErrStartFailed",
        ERR_ZAPO_MIGRATE_IN_PROGRESS: "zapoMigrateErrInProgress",
      };
      const mapped = code ? codeKeyMap[code] : undefined;
      toast.error(mapped ? t(mapped) : t("zapoMigrateError"));
    } finally {
      setZapoMigrateSaving(false);
    }
  }

  async function handleSubmit() {
    // Gates com validacao inline: alem do toast (mantido), cada gate marca o campo
    // correspondente (borda destructive + mensagem) e foca o primeiro invalido.
    if (!form.name || !form.type) {
      const msg = t("fillNameAndType");
      setFormErrors({
        ...(!form.name ? { name: msg } : {}),
        ...(!form.type ? { type: msg } : {}),
      });
      focusInvalidField(!form.name ? nameFieldRef.current : typeTriggerRef.current);
      toast.error(msg);
      return;
    }

    // WABA: tokenAPI = phone_number_id (numerico, ate 64 chars).
    // Bloqueia access token "EAAxxx..." colado por engano antes de bater no backend.
    if (form.type === "waba" && form.tokenAPI) {
      const pid = String(form.tokenAPI).trim();
      if (!/^\d+$/.test(pid) || pid.length > 64) {
        setFormErrors({ tokenAPI: t("wabaInvalidPhoneNumberId") });
        focusInvalidField(wabaTokenFieldRef.current);
        toast.error(t("wabaInvalidPhoneNumberId"));
        return;
      }
    }

    // Modo hibrido (F1): coexistencia exige canal de transporte vinculado
    if (form.type === "waba" && form.hybridMode === "coexistence" && !form.linkedChannelId) {
      setFormErrors({ linkedChannelId: t("hybridLinkedRequired") });
      focusInvalidField(
        (linkedChannelFieldRef.current?.querySelector("button") as HTMLElement | null) ?? linkedChannelFieldRef.current
      );
      toast.error(t("hybridLinkedRequired"));
      return;
    }

    // Template de aniversário: header de mídia exige URL http(s) — texto comum vira
    // image.link e a Meta rejeita (#100) no disparo. Placeholder {{...}} é aceito.
    const bdHeader = bdSelectedTpl?.components?.find((c) => c.type === "HEADER");
    if (bdHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(bdHeader.format || "")) {
      const urlVal = (bdTplVars.find((v) => v.key === "header_link")?.value || "").trim();
      if (!isValidHttpUrl(urlVal) && !/\{\{.+\}\}/.test(urlVal)) {
        setFormErrors({ bdHeaderLink: tErrors("invalidMediaHeaderUrl") });
        focusInvalidField(bdHeaderLinkFieldRef.current);
        toast.error(tErrors("invalidMediaHeaderUrl"));
        return;
      }
    }

    // Todos os gates passaram — limpa residuos de tentativas anteriores
    setFormErrors((prev) => (Object.keys(prev).length ? {} : prev));

    // Canal novo (nao-OAuth): abrir o popup do oauth-proxy que valida a licenca
    // VISUALMENTE fora do app (paridade com o popup OAuth do WABA) ANTES de criar.
    // Se a licenca for negada, nada e criado — nunca create-then-delete. Edicao nao
    // provisiona recurso novo -> segue direto.
    if (!isEdit) {
      void runLicenseGateThenSave();
      return;
    }
    await performSave();
  }

  // Gate de licenca (canal direto/nao-OAuth): abre o popup do oauth-proxy que faz a
  // checagem de licenca VISUALMENTE, FORA do app (paridade com o popup OAuth do WABA).
  // A janela roda /license-gate no proxy, recebe apiUrl+licenseKey por postMessage
  // (handshake license:ready -> license:credentials), chama /api/check-license e
  // devolve license:ok / license:error. Se valida -> performSave(); se negada -> nao
  // cria. Fallback ao modal interno quando o popup e bloqueado pelo navegador OU o
  // proxy ainda nao tem a pagina nova (timeout sem license:ready) — zero regressao
  // em skew de deploy, mantendo o enforcement pelo backend/proxy.
  async function runLicenseGateThenSave() {
    const proxyBase = getProxyBaseUrl(oauthCustomDomain);
    const url = `${proxyBase}/license-gate?callbackOrigin=${encodeURIComponent(window.location.origin)}`;
    const popup = window.open(url, "zpro-license-gate", "width=600,height=700,scrollbars=yes,resizable=yes");
    if (!popup) {
      // Popup bloqueado pelo navegador -> mantem o enforcement pelo caminho interno.
      await runLicenseGateFallback();
      return;
    }
    licenseGatePopupRef.current = popup;
    setLicenseGating(true);

    let settled = false;
    let readyReceived = false;
    let readyTimer = 0;
    let closedTimer = 0;

    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      if (readyTimer) window.clearTimeout(readyTimer);
      if (closedTimer) window.clearInterval(closedTimer);
      licenseGatePopupRef.current = null;
      licenseGateCleanupRef.current = null;
      setLicenseGating(false);
    };

    const onMsg = (event: MessageEvent) => {
      if (event.origin !== proxyBase) return;
      const { type, error } = (event.data || {}) as { type?: string; error?: string };
      if (type === "license:ready") {
        readyReceived = true;
        if (readyTimer) { window.clearTimeout(readyTimer); readyTimer = 0; }
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
        const rawUser = localStorage.getItem("usuario");
        const tenantId = rawUser ? (JSON.parse(rawUser)?.tenantId ?? null) : null;
        popup.postMessage(
          { type: "license:credentials", apiUrl, licenseKey: licenseKeyRef.current, tenantId, channel: form.type },
          proxyBase
        );
      } else if (type === "license:ok") {
        if (settled) return;
        settled = true;
        cleanup();
        // NAO fechar o popup aqui: o /license-gate exibe o resultado da validacao
        // por ~2s e SE AUTO-FECHA (paridade com o popup WABA). Fechar agora mataria
        // esse retorno visual. cleanup() ja anulou licenseGatePopupRef, entao o
        // onClose() do performSave nao force-fecha a janela antes do tempo.
        void performSave();
      } else if (type === "license:error") {
        if (settled) return;
        settled = true;
        cleanup();
        // Idem: deixa o popup mostrar a falha por ~2s antes de se auto-fechar. O
        // toast carrega a mensagem detalhada no app depois que a janela some.
        toast.error(error || t("licenseCheckFailed"));
      }
    };
    window.addEventListener("message", onMsg);
    licenseGateCleanupRef.current = cleanup;

    // Sem license:ready em ~6s = proxy sem a pagina nova (404) -> fecha e usa o
    // caminho interno (backend/proxy), preservando o enforcement.
    readyTimer = window.setTimeout(() => {
      if (settled || readyReceived) return;
      settled = true;
      cleanup();
      try { popup.close(); } catch { /* noop */ }
      void runLicenseGateFallback();
    }, 6000);

    // Usuario fechou a janela sem concluir -> cancela silenciosamente (nao cria).
    closedTimer = window.setInterval(() => {
      if (settled) return;
      if (popup.closed) {
        settled = true;
        cleanup();
      }
    }, 500);
  }

  // Fallback do gate: checagem via backend (mesmo verifyLicenseAtProxy) exibida no
  // modal interno. Usado quando o popup do proxy nao esta disponivel (bloqueado /
  // proxy desatualizado). Mantem exatamente o comportamento anterior.
  async function runLicenseGateFallback() {
    setLicenseCheck({ open: true, status: "checking", message: "" });
    try {
      await checkLicenseProxy();
      setLicenseCheck((s) => ({ ...s, status: "success" }));
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setLicenseCheck({ open: false, status: "checking", message: "" });
      await performSave();
    } catch (licErr: any) {
      const msg = licErr?.response?.data?.message || licErr?.message || "";
      setLicenseCheck({ open: true, status: "error", message: msg });
    }
  }

  // Criacao/atualizacao propriamente dita. Chamado apos o gate de licenca (canal
  // novo) ou direto (edicao / retry pos-takeover de hijack).
  async function performSave() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      // Remove apenas undefined — strings vazias são enviadas para limpar valores opcionais no backend
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });
      // Normaliza wabaVersion: remove prefixo "v" antes de enviar ao backend (backend faz v${wabaVersion})
      if (payload.wabaVersion) {
        payload.wabaVersion = (payload.wabaVersion as string).replace(/^v/i, "");
      }

      // Baileys import: converter campos de UI (split date/time + messageQueue)
      // para os campos que o backend espera (importOldMessages, importRecentMessages, queueIdImportMessages)
      const importStartDate = payload.importStartDate as string | undefined;
      const importStartTime = payload.importStartTime as string | undefined;
      const importEndDate = payload.importEndDate as string | undefined;
      const importEndTime = payload.importEndTime as string | undefined;
      const messageQueue = payload.messageQueue as string | undefined;

      if (importStartDate) {
        payload.importOldMessages = formatImportDateTime(importStartDate, importStartTime || "00:00");
      }
      if (importEndDate) {
        payload.importRecentMessages = formatImportDateTime(importEndDate, importEndTime || "23:59");
      }
      if (messageQueue) {
        payload.queueIdImportMessages = Number(messageQueue);
      }
      delete payload.importStartDate;
      delete payload.importStartTime;
      delete payload.importEndDate;
      delete payload.importEndTime;
      delete payload.messageQueue;

      let savedId: number | null = isEdit && initial?.id ? initial.id : null;
      if (isEdit && initial?.id) {
        await updateWhatsapp(initial.id, payload);
        toast.success(t("channelUpdated"));
      } else {
        const res = await createWhatsapp(payload);
        savedId = (res?.data as any)?.id ?? null;
        const createdType = infiniteChoice && form.type === "baileys" ? "infinite" : form.type;
        const typeLabel = t(CHANNEL_TYPES.find(c => c.value === createdType)?.labelKey as any || "channelCreated");
        toast.success(t("channelCreatedType", { type: typeLabel }));
      }

      if (bdMediaFile && savedId) {
        const fmData = new FormData();
        fmData.append("medias", bdMediaFile);
        fmData.append("type", form.type as string);
        await updateWhatsapp(savedId, fmData);
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      // api.ts interceptor rejects with error.response, so .status/.data are direct
      const e = err as any;
      const status = e?.status ?? e?.response?.status;
      const d      = e?.data   ?? e?.response?.data;
      if (status === 409 && d?.hijack) {
        setHijackState({
          channel:      d.channel      || "waba",
          errorCode:    d.errorCode    || "ALREADY_REGISTERED",
          apiUrlMasked: d.existing?.apiUrlMasked || "***",
          registeredAt: d.existing?.registeredAt ?? null,
          identifier:   d.identifier  || null,
          callbackUrl:  d.callbackUrl  || null,
        });
        return;
      }
      const errCode = d?.error || d?.message || "";
      // Canal de biblioteca (evo/evogo/meow/zapi/uazapi) sem host+token cadastrados:
      // o backend barra a criacao e o rotulo do tipo vem da propria lista da UI.
      const libLabelKey = CHANNEL_TYPES.find(c => c.value === form.type)?.labelKey;
      const msg = errCode === "ERR_NO_PERMISSION_CONNECTIONS_LIMIT"
        ? t("errorConnectionsLimit")
        : errCode === "ERR_NO_PERMISSION_CHANNEL_TYPE_LIMIT"
        ? t("errorChannelTypeLimit")
        : errCode === "ERR_CHANNEL_TYPE_NOT_ALLOWED"
        ? t("errorChannelTypeNotAllowed")
        : errCode === "ERR_CHANNEL_LIB_NOT_CONFIGURED"
        ? t("errorChannelLibNotConfigured", {
            type: libLabelKey ? t(libLabelKey as any) : String(form.type || "")
          })
        : errCode === "ERR_WABA_INVALID_PHONE_NUMBER_ID"
        ? t("wabaInvalidPhoneNumberId")
        : errCode || t("errorSaving");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleHijackConfirm() {
    if (!hijackState?.identifier || !hijackState?.callbackUrl) {
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
      // Retentar criacao do canal apos takeover (licenca ja validada nesta submissao)
      await performSave();
    } catch {
      toast.error(tHijack("errorToast"));
    } finally {
      setHijackLoading(false);
    }
  }

  const type = form.type || "";
  const smtp = form.smtpConfig || {};
  const smtpAuth = smtp.auth || {};
  const smtpOAuth2 = smtp.oauth2 || {};
  const smtpImap = smtp.imap || {};
  const isGmailProvider = !!(smtp.host && smtp.host.toLowerCase().includes("gmail"));

  // Phase 16 — App Google: "plataforma" (default, useOwnGoogleApp=false) vs
  // "proprio" (useOwnGoogleApp=true). state controlado, nao derivado.
  const useGlobalGoogleApp = !useOwnGoogleApp;

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg overflow-y-auto overflow-x-hidden max-h-[90vh] sm:max-h-[85vh] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profilePicHeader ?? getChannelLogo(!isEdit && infiniteChoice && type === "baileys" ? "infinite" : type)}
                alt={type}
                className={profilePicHeader ? "w-8 h-8 object-cover rounded-full" : "w-8 h-8 object-contain"}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            {isEdit ? t("editChannel") : t("newChannel")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <Field label={t("channelType")}>
            <Select
              value={!isEdit && infiniteChoice && type === "baileys" ? "infinite" : type}
              onValueChange={(v) => {
                // Dialog360/Gupshup: form genérico não basta — exige onboarding via popup
                // (Partner API key issuance). Redireciona para o dialog dedicado.
                if (!isEdit && (v === "dialog360" || v === "gupshup") && onSpecialChannelType) {
                  onClose();
                  onSpecialChannelType(v);
                  return;
                }
                // InfiniteAPI: pseudo-tipo de criação — o canal é salvo como
                // baileys + baileysLib=infiniteapi (mesmo payload de um baileys
                // com a lib trocada; nada muda no backend).
                if (v === "infinite") {
                  setInfiniteChoice(true);
                  setField("type", "baileys");
                  setField("baileysLib", "infiniteapi");
                  return;
                }
                if (infiniteChoice) {
                  // Saiu da escolha InfiniteAPI: volta lib/store ao default de canal novo
                  setInfiniteChoice(false);
                  setField("baileysLib", "v7");
                  setField("baileysAuthStore", "files");
                }
                setField("type", v);
                // Phase 16 — webmail e Gmail-only: pre-popular host/port/secure SMTP+IMAP
                if (v === "webmail" && !form.smtpConfig?.host) {
                  setSmtpField("host", "smtp.gmail.com");
                  setSmtpField("port", 465);
                  setSmtpField("secure", true);
                  setSmtpImapField("host", "imap.gmail.com");
                  setSmtpImapField("port", 993);
                  setSmtpImapField("tls", true);
                }
              }}
              disabled={isEdit}
            >
              <SelectTrigger
                ref={typeTriggerRef}
                aria-invalid={formErrors.type ? true : undefined}
                className={formErrors.type ? "border-destructive hover:border-destructive focus:border-destructive focus:ring-destructive/20" : undefined}
              >
                <SelectValue placeholder={t("selectType")} />
              </SelectTrigger>
              <SelectContent>
                {(["meta", "unofficial", "outros"] as const).map((group) => {
                  const items = channelTypes.filter((ct) => ct.group === group);
                  if (!items.length) return null;
                  const groupLabelKey = group === "meta" ? "channelGroupMeta" : group === "unofficial" ? "channelGroupUnofficial" : "channelGroupOthers";
                  return (
                    <SelectGroup key={group}>
                      <SelectLabel className="bg-muted text-muted-foreground text-xs uppercase tracking-wider px-3 py-1.5 mb-0.5">{t(groupLabelKey as Parameters<typeof t>[0])}</SelectLabel>
                      {items.map((ct) => {
                        // "infinite" é pseudo-tipo de baileys: limite/uso contam como baileys
                        const limitType = ct.value === "infinite" ? "baileys" : ct.value;
                        const typeLimit = channelConnectionLimits[limitType];
                        const typeCount = existingChannels.filter((w) => w.type === limitType).length;
                        const atLimit = !!(typeLimit && typeLimit > 0 && typeCount >= typeLimit);
                        const INTEGRATION_REQUIRED_TYPES = ["evo", "evogo", "zapi", "uazapi", "hub", "mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "dialog360", "gupshup"];
                        const needsIntegration = INTEGRATION_REQUIRED_TYPES.includes(ct.value);
                        const integrationMissing = needsIntegration && !integrationConfigured[ct.value];
                        return (
                          <SelectItem key={ct.value} value={ct.value} disabled={atLimit && !initial?.id}>
                            <span className="flex items-center gap-2">
                              {t(ct.labelKey as Parameters<typeof t>[0])}
                              {BETA_CHANNEL_TYPES.includes(ct.value) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 cursor-default select-none bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                        Beta
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      <p className="max-w-[200px] text-xs">{t("betaChannelTooltip")}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {integrationMissing && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      <p className="max-w-[200px] text-xs">{t("channelTypeIntegrationWarning")}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {typeLimit && typeLimit > 0 ? (
                                atLimit ? (
                                  <span className="ml-auto text-[10px] font-semibold text-destructive">
                                    {t("channelTypeAtLimit")}
                                  </span>
                                ) : (
                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    {t("channelTypeUsage", { used: typeCount, max: typeLimit })}
                                  </span>
                                )
                              ) : null}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
            {formErrors.type && (
              <p className="mt-1 text-xs text-destructive">{formErrors.type}</p>
            )}
          </Field>

          {/* ── Meta OAuth Panel */}
          {isOAuthType && (
            <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
              {/* App selector */}
              <div className="space-y-1.5">
                <Label>{t("metaApp")}</Label>
                <SearchableSelect
                  options={[
                    ...(PROXY_URL ? [{ value: "__PROXY__", label: `${t("oauthProxyLabel")} (${PROXY_URL.replace(/^https?:\/\//, "")})` }] : []),
                    ...appWabaList.map((a) => ({ value: String(a.id), label: (a as any).description || a.appId || `${t("oauthAppFallback")} #${a.id}` })),
                  ]}
                  value={selectedAppWabaId}
                  onValueChange={(v) => { setSelectedAppWabaId(v); setFacebookSDKLoaded(false); sdkScriptRef.current = null; }}
                  placeholder={t("selectApp")}
                />
                {usingProxy && (
                  <p className="text-xs text-muted-foreground">
                    {t("oauthProxyInfo")}
                  </p>
                )}
                {selectedAppWaba && (
                  <p className="text-xs text-muted-foreground">
                    {t("oauthAppIdLabel")}: <span className="font-mono">{selectedAppWaba.appId}</span>
                    {(selectedAppWaba as any).apiVersion && ` · ${(selectedAppWaba as any).apiVersion}`}
                  </p>
                )}
              </div>

              {/* Launch button */}
              {form.type === "waba_oauth" && (
                <Button
                  type="button"
                  className="w-full gap-2"
                  disabled={launching || (!usingProxy && !selectedAppWaba)}
                  onClick={launchWhatsAppOAuth}
                >
                  <MessageCircle className="h-4 w-4" />
                  {launching ? t("processing") : t("connectWhatsAppOAuth")}
                </Button>
              )}
              {form.type === "instagram_oauth" && (
                <Button
                  type="button"
                  className="w-full gap-2"
                  disabled={launching || (!usingProxy && !selectedAppWaba)}
                  onClick={launchInstagramOAuth}
                >
                  <Instagram className="h-4 w-4" />
                  {launching ? t("waiting") : t("connectInstagramOAuth")}
                </Button>
              )}
              {form.type === "facebook_oauth" && (
                <Button
                  type="button"
                  className="w-full gap-2"
                  disabled={launching || (!usingProxy && !selectedAppWaba)}
                  onClick={launchFacebookOAuth}
                >
                  <Facebook className="h-4 w-4" />
                  {launching ? t("waiting") : t("connectFacebookOAuth")}
                </Button>
              )}
              {/* OAuth Progress Stepper */}
              {(() => {
                const appSelected = !!selectedAppWabaId;
                const step1: "done" | "pending" = appSelected ? "done" : "pending";
                const step2: "active" | "pending" | "error" = oauthFailed ? "error" : launching ? "active" : "pending";
                const step3: "active" | "pending" | "error" = oauthFailed ? "error" : launching ? "active" : "pending";

                const StepCircle = ({ status, num }: { status: string; num: number }) => {
                  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
                  if (status === "active") return (
                    <span className="h-5 w-5 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                      <RefreshCw className="h-2.5 w-2.5 text-primary animate-spin" />
                    </span>
                  );
                  if (status === "error") return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
                  return (
                    <span className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-[10px] font-bold text-muted-foreground/50 shrink-0">
                      {num}
                    </span>
                  );
                };

                return (
                  <div className="rounded-lg border bg-background px-4 py-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("oauthProgressTitle")}</p>
                    <div className="flex items-center gap-2">
                      <StepCircle status={step1} num={1} />
                      <span className={cn("text-xs flex-1", step1 === "done" ? "text-success font-medium" : "text-muted-foreground")}>{t("oauthStep1")}</span>
                    </div>
                    <div className="ml-2.5 w-0.5 h-3 bg-border" />
                    <div className="flex items-center gap-2">
                      <StepCircle status={step2} num={2} />
                      <span className={cn("text-xs flex-1",
                        step2 === "active" ? "text-primary font-medium" :
                        step2 === "error" ? "text-destructive font-medium" :
                        "text-muted-foreground"
                      )}>
                        {step2 === "active" ? t("oauthStep2Active") : step2 === "error" ? t("oauthStepFailed") : t("oauthStep2")}
                      </span>
                    </div>
                    <div className="ml-2.5 w-0.5 h-3 bg-border" />
                    <div className="flex items-center gap-2">
                      <StepCircle status={step3} num={3} />
                      <span className={cn("text-xs flex-1",
                        step3 === "active" ? "text-primary font-medium" :
                        step3 === "error" ? "text-destructive font-medium" :
                        "text-muted-foreground"
                      )}>
                        {step3 === "active" ? t("oauthStep3Active") : step3 === "error" ? t("oauthStepFailed") : t("oauthStep3")}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <p className="text-xs text-muted-foreground">
                {t("oauthWindowInfo")}
              </p>
            </div>
          )}

          {!isOAuthType && <>
          {/* Pairing code toggle */}
          {(type === "whatsapp" || type === "baileys" || type === "zapo" || type === "meow") &&
            form.status !== "CONNECTED" && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={showPairingCode}
                  onCheckedChange={setShowPairingCode}
                  id="pairing-toggle"
                />
                <Label htmlFor="pairing-toggle" className="cursor-pointer text-sm">
                  {t("usePairingCode")}
                </Label>
              </div>
            )}

          {showPairingCode &&
            (type === "whatsapp" || type === "baileys" || type === "zapo" || type === "meow") && (
              <Field label={t("exactNumber")}>
                <Input
                  type="tel"
                  placeholder="Ex: 5511999999999"
                  value={(form.wppUser as string) || ""}
                  onChange={(e) => setField("wppUser", e.target.value)}
                />
              </Field>
            )}

          {/* Meow/Evo optional wppUser */}
          {(type === "meow" || type === "evo" || type === "evogo") && !showPairingCode && (
            <Field label={t("pairingNumberOptional")}>
              <Input
                type="tel"
                placeholder="Ex: 5511999999999"
                value={(form.wppUser as string) || ""}
                onChange={(e) => setField("wppUser", e.target.value)}
              />
            </Field>
          )}

          {/* QR Types info box */}
          {isQrType(type) && (
            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">{t("qrTypeAttention")}</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>{t("qrTypeRule1")}</li>
                <li>{t("qrTypeRule2")}</li>
                <li>{t("qrTypeRule3")}</li>
              </ul>
            </div>
          )}

          {/* WABA info */}
          {type === "waba" && (
            <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground">
              <p className="font-semibold mb-1 text-info">{t("wabaTitle")}</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>{t("wabaRule1")}</li>
                <li>{t("wabaRule2")}</li>
                <li>{t("wabaRule3")}</li>
                <li>{t("wabaRule4")}</li>
                <li>{t("wabaRule5")}</li>
              </ul>
            </div>
          )}

          {/* Name */}
          <Field label={t("channelName")}>
            <Input
              ref={nameFieldRef}
              value={(form.name as string) || ""}
              onChange={(e) => setField("name", e.target.value)}
              disabled={isEdit && (type === "evo" || type === "evogo")}
              placeholder={t("channelNamePlaceholder")}
              error={formErrors.name}
              aria-invalid={formErrors.name ? true : undefined}
            />
            {(type === "evo" || type === "evogo") && isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                {t(type === "evogo" ? "evogoNameNote" : "evoNameNote")}
              </p>
            )}
          </Field>

          {/* isDefault */}
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.isDefault}
              onCheckedChange={(v) => setField("isDefault", v)}
              id="isDefault"
            />
            <Label htmlFor="isDefault" className="cursor-pointer text-sm">
              {t("defaultChannelLabel")}
            </Label>
          </div>

          {/* WABA */}
          {type === "waba" && (
            <CollapseSection title={t("wabaConfigSection")} defaultOpen={true}>
              {/* Phase 13.b — quick connect via oauth-proxy waba-manual form */}
              {!isEdit && (
                <div className="rounded-md border border-success/30 bg-success/5 p-3 mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs flex-1">
                    <div className="font-medium">{t("wabaManualQuickTitle")}</div>
                    <p className="text-muted-foreground mt-0.5">{t("wabaManualQuickDesc")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (oauthCooldownUntil && oauthCooldownUntil > Date.now()) {
                        const remaining = Math.ceil((oauthCooldownUntil - Date.now()) / 1000);
                        toast.error(tCommon("oauthCooldownRemaining", { seconds: remaining }));
                        return;
                      }
                      try {
                        const { data } = await api.get<{ authUrl?: string }>(
                          "/wabamanual-oauth/auth-url"
                        );
                        if (data?.authUrl) {
                          window.open(
                            data.authUrl,
                            "waba_manual_proxy",
                            "width=560,height=720,scrollbars=yes,resizable=yes"
                          );
                          toast.success(t("wabaManualOpened"));
                          // Channel appears via socket after creation
                        } else {
                          toast.error(t("wabaManualError"));
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
                          toast.error(t("wabaManualError"));
                        }
                      }
                    }}
                  >
                    {t("wabaManualConnect")}
                  </Button>
                </div>
              )}
              {(isEdit || wabaManualConnected) && (
                <>
                  <Field label={t("phoneRecipientId")}>
                    <Input
                      ref={wabaTokenFieldRef}
                      value={(form.tokenAPI as string) || ""}
                      onChange={(e) => setField("tokenAPI", e.target.value)}
                      placeholder="Ex: 123456789012345"
                      error={formErrors.tokenAPI}
                      aria-invalid={formErrors.tokenAPI ? true : undefined}
                    />
                  </Field>
                  <Field label={t("wabaIdBmId")}>
                    <Input
                      value={(form.wabaId as string) || ""}
                      onChange={(e) => setField("wabaId", e.target.value)}
                      placeholder="Ex: 123456789012345"
                    />
                  </Field>
                  <Field label={t("bmTokenPermanent")}>
                    <Input
                      value={(form.bmToken as string) || ""}
                      onChange={(e) => setField("bmToken", e.target.value)}
                      placeholder="EAABs..."
                    />
                  </Field>
                  <Field label={t("apiVersionLabel")}>
                    <div className="space-y-2">
                      <Select
                        value={manualWabaVersion ? "manual" : (() => { const v = (form.wabaVersion as string) || ""; if (!v) return "v21.0"; return /^v/i.test(v) ? v : `v${v}`; })()}
                        onValueChange={(v) => {
                          if (v === "manual") {
                            setManualWabaVersion(true);
                            setField("wabaVersion", "");
                          } else {
                            setManualWabaVersion(false);
                            setField("wabaVersion", v);
                          }
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WABA_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                          <SelectItem value="manual">{t("enterManually")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {manualWabaVersion && (
                        <Input
                          value={(form.wabaVersion as string) || ""}
                          onChange={(e) => setField("wabaVersion", e.target.value)}
                          placeholder="ex: v27.0"
                          className="font-mono text-sm"
                          autoFocus
                        />
                      )}
                    </div>
                  </Field>
                  <Field label={t("wabaAppIdOptional")}>
                    <Input
                      value={(form.appId as string) || ""}
                      onChange={(e) => setField("appId", e.target.value)}
                      placeholder="Opcional"
                    />
                  </Field>
                </>
              )}
            </CollapseSection>
          )}

          {/* Modo hibrido (F1 — PLANO_WABA_HIBRIDO_PINGPONG): roteia parte do
              trafego WABA por um canal vinculado. Persistido no mesmo submit. */}
          {type === "waba" && (
            <CollapseSection
              title={t("hybridModeSection")}
              defaultOpen={!!form.hybridMode && form.hybridMode !== "disabled"}
            >
              <Field label={t("hybridModeLabel")}>
                <Select
                  value={(form.hybridMode as string) || "disabled"}
                  onValueChange={(v) => {
                    // Mudar o modo hibrido re-contextualiza a exigencia de vinculo
                    clearFormError("linkedChannelId");
                    setForm((prev) => {
                      const linked = existingChannels.find((c) => c.id === prev.linkedChannelId);
                      // Limpa vinculo incompativel: disabled nao usa vinculo;
                      // coexistence so aceita transporte de aparelho conectado (QR)
                      const clearLinked =
                        v === "disabled" ||
                        (v === "coexistence" && !!linked && !HYBRID_TRANSPORT_TYPES.includes(linked.type as string));
                      return {
                        ...prev,
                        hybridMode: v,
                        linkedChannelId: clearLinked ? null : prev.linkedChannelId,
                      };
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{t("hybridModeDisabled")}</SelectItem>
                    <SelectItem value="two_numbers">{t("hybridModeTwoNumbers")}</SelectItem>
                    <SelectItem value="coexistence">{t("hybridModeCoexistence")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{t("hybridModeHint")}</p>
              </Field>
              {!!form.hybridMode && form.hybridMode !== "disabled" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t("hybridRiskWarning")}</span>
                </div>
              )}
              {!!form.hybridMode && form.hybridMode !== "disabled" && (
                <Field label={t("hybridLinkedChannel")}>
                  <div ref={linkedChannelFieldRef}>
                    <SearchableSelect
                      options={[
                        { value: "__none__", label: t("none") },
                        ...existingChannels
                          .filter((c) => c.id !== initial?.id)
                          .filter((c) => (form.hybridMode === "coexistence" ? HYBRID_TRANSPORT_TYPES.includes(c.type as string) : true))
                          .map((c) => ({ value: String(c.id), label: `${c.name} (${c.type})` })),
                      ]}
                      value={form.linkedChannelId != null ? String(form.linkedChannelId) : "__none__"}
                      onValueChange={(v) =>
                        setField("linkedChannelId", v === "__none__" ? null : Number(v))
                      }
                      placeholder={t("hybridLinkedChannelPlaceholder")}
                      triggerClassName={formErrors.linkedChannelId ? "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20" : undefined}
                    />
                  </div>
                  {formErrors.linkedChannelId && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.linkedChannelId}</p>
                  )}
                  {form.hybridMode === "coexistence" && (
                    <p className="text-xs text-muted-foreground mt-1">{t("hybridLinkedCoexNote")}</p>
                  )}
                </Field>
              )}
            </CollapseSection>
          )}

          {/* Z-API / UaZapi */}
          {(type === "zapi" || type === "uazapi") && (
            <CollapseSection title={type === "zapi" ? "Z-API" : "UaZapi"} defaultOpen={true}>
              <Field label="API Token">
                <Input
                  value={(form.tokenAPI as string) || ""}
                  onChange={(e) => setField("tokenAPI", e.target.value)}
                  placeholder="Token da API"
                />
              </Field>
              <Field label="Number ID (Instance ID)">
                <Input
                  value={(form.wabaId as string) || ""}
                  onChange={(e) => setField("wabaId", e.target.value)}
                  placeholder={t("numberInstancePlaceholder")}
                />
              </Field>
            </CollapseSection>
          )}

          {/* Queue / ChatFlow / User — ChatFlow oculto para youtube/woocommerce/webmail/email/tiktok */}
          <CollapseSection title={t("assignments")} defaultOpen={false}>
            {type !== "youtube" && type !== "woocommerce" && type !== "nuvemshop" && type !== "webmail" && type !== "email" && type !== "tiktok" && (
              <Field label={t("chatFlowBot")}>
                <SearchableSelect
                  options={[{ value: "__none__", label: t("none") }, ...chatFlows.map((cf) => ({ value: String(cf.id), label: cf.name }))]}
                  value={form.chatFlowId != null ? String(form.chatFlowId) : "__none__"}
                  onValueChange={(v) =>
                    setField("chatFlowId", v === "__none__" ? null : Number(v))
                  }
                  placeholder={isEdit ? t("selectChatFlow") : t("availableAfterCreate")}
                  disabled={!isEdit}
                />
              </Field>
            )}

            <Field label={t("queue")}>
              <SearchableSelect
                options={[{ value: "__none__", label: t("none_f") }, ...queues.map((q) => ({ value: String(q.id), label: q.name || q.queue || String(q.id) }))]}
                value={form.queueId != null ? String(form.queueId) : "__none__"}
                onValueChange={(v) =>
                  setField("queueId", v === "__none__" ? null : Number(v))
                }
                placeholder={isEdit ? t("selectQueue") : t("availableAfterCreate")}
                disabled={!isEdit}
              />
            </Field>

            <Field label={t("user")}>
              <SearchableSelect
                options={[{ value: "__none__", label: t("none") }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
                value={form.userId != null ? String(form.userId) : "__none__"}
                onValueChange={(v) =>
                  setField("userId", v === "__none__" ? null : Number(v))
                }
                placeholder={isEdit ? t("selectUser") : t("availableAfterCreate")}
                disabled={!isEdit}
              />
            </Field>

            {(typeof form.type === "string" && (form.type.includes("waba") || form.type === "dialog360" || form.type === "gupshup")) && (
              <Field label={t("wabaCallQueue")}>
                <SearchableSelect
                  options={[{ value: "__none__", label: t("none_f") }, ...queues.map((q) => ({ value: String(q.id), label: q.name || q.queue || String(q.id) }))]}
                  value={form.wabaCallQueueId != null ? String(form.wabaCallQueueId) : "__none__"}
                  onValueChange={(v) =>
                    setField("wabaCallQueueId", v === "__none__" ? null : Number(v))
                  }
                  placeholder={isEdit ? t("selectQueue") : t("availableAfterCreate")}
                  disabled={!isEdit}
                />
              </Field>
            )}
          </CollapseSection>

          {/* Hub selector */}
          {isHubType(type) && (
            <CollapseSection title={t("hubNotificame")} defaultOpen={false}>
              <Field label={t("selectHub")}>
                <SearchableSelect
                  options={hubOptions.map((h) => ({ value: h.value, label: h.label }))}
                  value={(form.wabaId as string) || ""}
                  onValueChange={(v) => setField("wabaId", v)}
                  placeholder={t("selectHubPlaceholder")}
                />
              </Field>
            </CollapseSection>
          )}

          {/* Baileys/Zapo import */}
          {(type === "baileys" || type === "zapo") && (
            <CollapseSection title={t("messageImport")} defaultOpen={false}>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!form.importMessages}
                  onCheckedChange={(v) => setField("importMessages", v)}
                  id="importMessages"
                />
                <Label htmlFor="importMessages" className="cursor-pointer text-sm">
                  {t("importOldMessages")}
                </Label>
              </div>

              {form.importMessages && (
                <div className="space-y-3 pl-4 border-l-2 border-border ml-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!form.importOldMessagesGroups}
                      onCheckedChange={(v) => setField("importOldMessagesGroups", v)}
                      id="importGroups"
                    />
                    <Label htmlFor="importGroups" className="cursor-pointer text-sm">
                      {t("importGroupMessages")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!form.closedTicketsPostImported}
                      onCheckedChange={(v) => setField("closedTicketsPostImported", v)}
                      id="closeAfterImport"
                    />
                    <Label htmlFor="closeAfterImport" className="cursor-pointer text-sm">
                      {t("closeAfterImport")}
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("importStartDate")}>
                      <Input
                        type="date"
                        value={(form.importStartDate as string) || ""}
                        onChange={(e) => setField("importStartDate", e.target.value)}
                      />
                    </Field>
                    <Field label={t("importStartTime")}>
                      <Input
                        type="time"
                        value={(form.importStartTime as string) || ""}
                        onChange={(e) => setField("importStartTime", e.target.value)}
                      />
                    </Field>
                    <Field label={t("importEndDate")}>
                      <Input
                        type="date"
                        value={(form.importEndDate as string) || ""}
                        onChange={(e) => setField("importEndDate", e.target.value)}
                      />
                    </Field>
                    <Field label={t("importEndTime")}>
                      <Input
                        type="time"
                        value={(form.importEndTime as string) || ""}
                        onChange={(e) => setField("importEndTime", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label={t("importQueueLabel")}>
                    <SearchableSelect
                      options={queues.map((q) => ({ value: String(q.id), label: q.name || q.queue || String(q.id) }))}
                      value={String(form.messageQueue ?? "")}
                      onValueChange={(v) => setField("messageQueue", v as any)}
                      placeholder={t("selectQueue")}
                    />
                  </Field>
                  <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground">
                    <strong>{t("qrTypeAttention")}</strong> {t("importAttentionDesc")}
                  </div>
                </div>
              )}
            </CollapseSection>
          )}

          {/* F7.7 — Baileys lib selector (admin/superadmin). Em create, o valor
              entra no payload do form submit (sem PATCH/QR-scan). Em edit, dispara
              PATCH atomico + connectSession para forçar QR-scan novo. */}
          {type === "baileys" && canEditBaileysLib && (
            <CollapseSection
              key={!isEdit && infiniteChoice ? "infinite" : "baileys"}
              title={!isEdit && infiniteChoice ? t("channelTypeInfinite") : t("baileysLibTitle")}
              defaultOpen={!isEdit && infiniteChoice}
            >
              {/* Escolha InfiniteAPI no tipo: lib já fixada — a seção fica só com
                  o armazenamento da sessão, sem os textos de escolha de lib. */}
              {(isEdit || !infiniteChoice) && (
                <p className="text-xs text-muted-foreground mb-2 break-words">{t("baileysLibDescription")}</p>
              )}
              <div className="space-y-3 min-w-0">
                {(isEdit || !infiniteChoice) && (
                <Field label={t("baileysLibLabel")}>
                  <Select
                    value={isEdit ? baileysLibSelected : ((form.baileysLib as BaileysLib) || "fork")}
                    onValueChange={(v) => {
                      if (isEdit) {
                        setBaileysLibSelected(v as BaileysLib);
                      } else {
                        setField("baileysLib", v as BaileysLib);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Fork DESCONTINUADO no front: nao aparece na criacao nem na
                          edicao de canais v7/infiniteapi. So permanece visivel para
                          canais que JA estao em fork — para nao quebrar a exibicao e
                          permitir migra-los p/ v7/infiniteapi (sem volta). Novas
                          sessoes: apenas v7 ou infiniteapi. */}
                      {isEdit && ((initial?.baileysLib as BaileysLib) || "fork") === "fork" && (
                        <SelectItem value="fork">{t("baileysLibFork")}</SelectItem>
                      )}
                      <SelectItem value="v7">{t("baileysLibV7")}</SelectItem>
                      <SelectItem value="infiniteapi">{t("baileysLibInfiniteapi")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                )}
                {(isEdit || !infiniteChoice) && (
                <p className="text-xs text-muted-foreground break-words">
                  {(isEdit ? baileysLibSelected : (form.baileysLib as BaileysLib) || "fork") === "fork" && t("baileysLibForkDesc")}
                  {(isEdit ? baileysLibSelected : (form.baileysLib as BaileysLib) || "fork") === "v7" && t("baileysLibV7Desc")}
                  {(isEdit ? baileysLibSelected : (form.baileysLib as BaileysLib) || "fork") === "infiniteapi" && t("baileysLibInfiniteapiDesc")}
                </p>
                )}
                {(isEdit
                  ? ((initial?.baileysLib as BaileysLib) || "fork") === "infiniteapi"
                  : ((form.baileysLib as BaileysLib) || "fork") === "infiniteapi") && (
                  <div className={cn("space-y-2 min-w-0", (isEdit || !infiniteChoice) && "border-t pt-3")}>
                    <Field label={t("baileysAuthStoreLabel")}>
                      <Select
                        value={isEdit ? authStoreSelected : ((form.baileysAuthStore as BaileysAuthStore) || "files")}
                        onValueChange={(v) => {
                          if (isEdit) {
                            setAuthStoreSelected(v as BaileysAuthStore);
                          } else {
                            setField("baileysAuthStore", v as BaileysAuthStore);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="files">{t("baileysAuthStoreFiles")}</SelectItem>
                          <SelectItem value="sqlite">{t("baileysAuthStoreSqlite")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <p className="text-xs text-muted-foreground break-words">{t("baileysAuthStoreDesc")}</p>
                    {isEdit && authStoreSelected !== (((initial?.baileysAuthStore as BaileysAuthStore) || "files")) && (
                      <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground break-words">
                        {t("baileysAuthStoreApplyWarning")}
                      </div>
                    )}
                    {isEdit && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          authStoreSaving
                          || authStoreSelected === (((initial?.baileysAuthStore as BaileysAuthStore) || "files"))
                        }
                        onClick={handleBaileysAuthStoreApply}
                      >
                        {authStoreSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {t("baileysAuthStoreApply")}
                      </Button>
                    )}
                  </div>
                )}
                {isEdit && ((initial?.baileysLib as BaileysLib) || "fork") === "v7"
                  && baileysLibSelected === "fork" && (
                  <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground break-words">
                    <strong>{t("baileysLibRollbackWarningTitle")}</strong>{" "}
                    {t("baileysLibRollbackWarningDesc")}
                  </div>
                )}
                {isEdit && baileysLibSelected !== (((initial?.baileysLib as BaileysLib) || "fork")) && (
                  <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground break-words">
                    <strong>{t("baileysLibQrWarningTitle")}</strong>{" "}
                    {t("baileysLibQrWarningDesc")}
                  </div>
                )}
                {isEdit && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      baileysLibSaving
                      || baileysLibSelected === (((initial?.baileysLib as BaileysLib) || "fork"))
                    }
                    onClick={() => setBaileysLibConfirmOpen(true)}
                  >
                    {baileysLibSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {t("baileysLibApply")}
                  </Button>
                )}
                {/* PLANO_ZAPO §13 (F12) — migração p/ zapo mantendo a sessão
                    (sem novo QR). Só em edição, e só quando o tenant permite o
                    canal zapo (lista vazia/ausente = sem restrição). Fail-closed
                    enquanto o tenant não carregou (evita flicker + 400). */}
                {isEdit && (userProfile === "superadmin" ||
                  (tenantChannelsLoaded && (!allowedChannels || allowedChannels.includes("zapo")))) && (
                  <div className="space-y-2 min-w-0 border-t pt-3">
                    <p className="text-sm font-medium">{t("zapoMigrateTitle")}</p>
                    <p className="text-xs text-muted-foreground break-words">{t("zapoMigrateDesc")}</p>
                    <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground break-words">
                      <strong>{t("zapoMigrateWarningTitle")}</strong>{" "}
                      {t("zapoMigrateWarningDesc")}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={zapoMigrateSaving}
                      onClick={() => setZapoMigrateConfirmOpen(true)}
                    >
                      {zapoMigrateSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t("zapoMigrateAction")}
                    </Button>
                  </div>
                )}
              </div>

              <Dialog
                open={baileysLibConfirmOpen}
                onOpenChange={(o) => {
                  if (!baileysLibSaving) setBaileysLibConfirmOpen(o);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("baileysLibConfirmTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("baileysLibConfirmDescription", {
                        from: (initial?.baileysLib as BaileysLib) || "fork",
                        to: baileysLibSelected
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground space-y-1">
                    <p>{t("baileysLibConfirmWarning1")}</p>
                    <p>{t("baileysLibConfirmWarning2")}</p>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={baileysLibSaving}
                      onClick={() => setBaileysLibConfirmOpen(false)}
                    >
                      {t("baileysLibConfirmCancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={baileysLibSaving}
                      onClick={handleBaileysLibConfirm}
                    >
                      {baileysLibSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t("baileysLibConfirmAction")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Confirmação da migração p/ zapo (F12) */}
              <Dialog
                open={zapoMigrateConfirmOpen}
                onOpenChange={(o) => {
                  if (!zapoMigrateSaving) setZapoMigrateConfirmOpen(o);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("zapoMigrateConfirmTitle")}</DialogTitle>
                    <DialogDescription>{t("zapoMigrateConfirmDescription")}</DialogDescription>
                  </DialogHeader>
                  <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground space-y-1">
                    <p>{t("zapoMigrateConfirmWarning1")}</p>
                    <p>{t("zapoMigrateConfirmWarning2")}</p>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={zapoMigrateSaving}
                      onClick={() => setZapoMigrateConfirmOpen(false)}
                    >
                      {t("baileysLibConfirmCancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={zapoMigrateSaving}
                      onClick={handleZapoMigrateConfirm}
                    >
                      {zapoMigrateSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t("zapoMigrateConfirmAction")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CollapseSection>
          )}

          {/* UazAPI — Importar Histórico (apenas ao editar) */}
          {type === "uazapi" && isEdit && (
            <CollapseSection title={t("uazapiHistorySync")} defaultOpen={false}>
              <p className="text-xs text-muted-foreground mb-2">{t("uazapiHistorySyncDesc")}</p>
              <div className="space-y-2">
                <Field label={t("uazapiHistorySyncNumber")}>
                  <Input
                    value={uazapiHistorySyncNumber}
                    onChange={(e) => setUazapiHistorySyncNumber(e.target.value)}
                    placeholder={t("uazapiHistorySyncNumberPlaceholder")}
                  />
                </Field>
                <Field label={t("uazapiHistorySyncLimit")}>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={uazapiHistorySyncLimit}
                    onChange={(e) => setUazapiHistorySyncLimit(Number(e.target.value) || 50)}
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  disabled={uazapiHistorySyncLoading || !uazapiHistorySyncNumber.trim()}
                  onClick={handleUazapiHistorySync}
                >
                  {uazapiHistorySyncLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("uazapiHistorySyncBtn")}
                </Button>
              </div>
            </CollapseSection>
          )}

          {/* Telegram */}
          {type === "telegram" && (
            <CollapseSection title="Telegram" defaultOpen={false}>
              <Field label={t("telegramBotToken")}>
                <Input
                  value={(form.tokenTelegram as string) || ""}
                  onChange={(e) => setField("tokenTelegram", e.target.value)}
                  placeholder="123456789:ABCdef..."
                />
              </Field>
            </CollapseSection>
          )}

          {/* WaVoIP Token — QR types + waba */}
          {wavoipEnabled && ["whatsapp","baileys","meow","evo","evogo","uazapi","zapi","waba","dialog360","gupshup"].includes(type) && (
            <CollapseSection title={t("wavoipSection")} defaultOpen={false}>
              <Field
                label={
                  <span className="flex items-center gap-1.5">
                    {t("wavoipTokenLabel")}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t("wavoipTokenTooltip")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                }
              >
                <WavoipTokenInput
                  value={(form.wavoipToken as string) || ""}
                  onChange={(v) => setField("wavoipToken", v)}
                />
              </Field>
            </CollapseSection>
          )}

          {/* WebMail / Email (IMAP/SMTP) — SMTP */}
          {(type === "webmail" || type === "email") && (
            <>
              {/* OAuth2 — apenas Gmail (type='webmail'). Phase 16 — exibido ANTES do SMTP. */}
              {/* TODO: quando app Google da plataforma sair de testes, restaurar condicao
                  "platformGoogleAppEnabled" no guard abaixo para esconder secao quando disabled */}
              {type === "webmail" && (
              <CollapseSection title={t("oauth2Section")} defaultOpen={false}>
                {/* TODO: reativar selector de app quando app Google da plataforma sair de testes */}
                {false && platformGoogleAppEnabled && (
                  <div className="rounded-md border border-border bg-card p-3 mb-3 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="googleAppMode"
                        checked={!useOwnGoogleApp}
                        onChange={() => {
                          setUseOwnGoogleApp(false);
                          // Limpa credenciais do app proprio ao voltar para plataforma
                          setSmtpOAuth2Field("client_id", "");
                          setSmtpOAuth2Field("client_secret", "");
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{t("googleAppPlatform" as any) || "Usar app Google da plataforma (recomendado)"}</div>
                        <div className="text-xs text-muted-foreground">{t("googleAppPlatformHint" as any) || "Conexao instantanea — sem cadastro no Google Cloud."}</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="googleAppMode"
                        checked={useOwnGoogleApp}
                        onChange={() => {
                          setUseOwnGoogleApp(true);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{t("googleAppOwn" as any) || "Usar meu proprio app Google"}</div>
                        <div className="text-xs text-muted-foreground">{t("googleAppOwnHint" as any) || "Quota separada, controle total. Voce precisa criar um projeto no Google Cloud Console."}</div>
                      </div>
                    </label>
                  </div>
                )}

                {/* Info box — only when "proprio" */}
                {!useGlobalGoogleApp && (
                  <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground space-y-2 mb-2">
                    <p className="font-semibold text-info">{t("oauth2HowTo")}</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Acesse{" "}
                        <a
                          href="https://console.cloud.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium text-info"
                        >
                          https://console.cloud.google.com
                        </a>
                      </li>
                      <li>Crie um projeto ou selecione um existente</li>
                      <li>Habilite a Gmail API</li>
                      <li>Crie credenciais OAuth2 (tipo: Aplicativo Web)</li>
                      <li>Configure as URLs autorizadas de redirecionamento</li>
                      <li>Copie o Client ID e Client Secret para os campos abaixo</li>
                    </ol>
                  </div>
                )}

                {/* Gmail OAuth2 notice */}
                {isGmailProvider && !useGlobalGoogleApp && (
                  <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-foreground mb-2">
                    <p className="font-semibold">{t("oauth2GmailTitle")}</p>
                    <p>{t("oauth2GmailDesc")}</p>
                  </div>
                )}

                {!useGlobalGoogleApp && (
                  <>
                    <Field label="Client ID">
                      <Input
                        value={String(smtpOAuth2.client_id || "")}
                        onChange={(e) => setSmtpOAuth2Field("client_id", e.target.value)}
                        placeholder="*.apps.googleusercontent.com"
                      />
                    </Field>
                    <Field label="Client Secret">
                      <Input
                        value={String(smtpOAuth2.client_secret || "")}
                        onChange={(e) => setSmtpOAuth2Field("client_secret", e.target.value)}
                        placeholder="GOCSPX-..."
                      />
                    </Field>
                  </>
                )}
                <Field label="Redirect URI">
                  <Input
                    /* Phase 16 — Google nao aceita custom domain nas Authorized Redirect URIs.
                       Sempre canonical, independente de oauthCustomDomain. */
                    value={getGoogleCanonicalCallbackUrl()}
                    readOnly
                    className="bg-muted cursor-not-allowed font-mono text-xs"
                  />
                </Field>

                {smtpOAuth2.access_token && (
                  <div className="rounded-md bg-success/10 border border-success/30 p-2 text-xs text-success">
                    <span className="font-semibold">{t("oauth2TokenOk")}</span>
                  </div>
                )}

                {/* Configurar OAuth2 button — funciona em create e edit.
                    Em create, salva o canal primeiro para obter o id. */}
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="w-full mt-1"
                  disabled={useOwnGoogleApp && (!smtpOAuth2.client_id?.trim() || !smtpOAuth2.client_secret)}
                  onClick={async () => {
                    let whatsappId = initial?.id ?? null;

                    // Phase 16 — em create, persistir primeiro para obter o id antes do OAuth
                    if (!whatsappId) {
                      if (!form.name || !form.type) {
                        toast.error(t("fillNameAndType"));
                        return;
                      }
                      try {
                        const payload: Record<string, unknown> = { ...form };
                        Object.keys(payload).forEach((k) => {
                          if (payload[k] === undefined) delete payload[k];
                        });
                        const createRes = await createWhatsapp(payload);
                        whatsappId = (createRes?.data as any)?.id ?? null;
                        if (!whatsappId) {
                          toast.error(t("oauth2StartError"));
                          return;
                        }
                        toast.success(t("channelCreated"));
                        // Notifica o pai para recarregar a lista, mas mantem o modal aberto
                        // para permitir o user concluir o OAuth no popup.
                        try { onSaved(); } catch { /* nao critico */ }
                      } catch (err: any) {
                        const msg = err?.response?.data?.message || err?.message || t("oauth2StartError");
                        toast.error(msg);
                        return;
                      }
                    }

                    try {
                      const res = await api.get(`/gauth/gmail/${whatsappId}/start`);
                      const authUrl = (res.data as { authUrl?: string })?.authUrl;
                      if (authUrl) {
                        // Sem noopener: o popup precisa de window.opener para postMessage de volta
                        // ao modal e disparar o auto-connect quando OAuth completa.
                        const w = 600;
                        const h = 700;
                        const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
                        const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
                        window.open(
                          authUrl,
                          "gmail_oauth",
                          `width=${w},height=${h},left=${left},top=${top},popup=yes`
                        );
                      } else {
                        toast.error(t("oauth2AuthError"));
                      }
                    } catch (err: unknown) {
                      const msg =
                        (err as { response?: { data?: { message?: string; error?: string } } })
                          ?.response?.data?.message ||
                        (err as { response?: { data?: { error?: string } } })
                          ?.response?.data?.error ||
                        t("oauth2StartError");
                      toast.error(msg);
                    }
                  }}
                >
                  {t("oauth2ConfigureBtn")}
                </Button>
              </CollapseSection>
              )}

              <CollapseSection title={t("smtpSection")} defaultOpen={false}>
                {/* Email remetente — auto-detecta SMTP+IMAP ao sair do campo */}
                <div className="flex items-end gap-2">
                  <Field label={t("smtpUserLabel")} className="flex-1">
                    <Input
                      value={String(smtpAuth.user || "")}
                      onChange={(e) => {
                        setSmtpAuthField("user", e.target.value);
                        // Mantem user e from sincronizados
                        setSmtpField("from", e.target.value);
                      }}
                      onBlur={async (e) => {
                        // Phase 16 — webmail e SEMPRE Gmail (incluindo Workspace com dominio proprio)
                        // — nao roda autodetect que pode chutar hosts errados.
                        if (type === "webmail") {
                          setSmtpField("host", "smtp.gmail.com");
                          setSmtpField("port", 465);
                          setSmtpField("secure", true);
                          setSmtpImapField("host", "imap.gmail.com");
                          setSmtpImapField("port", 993);
                          setSmtpImapField("tls", true);
                          setSmtpImapField("user", String(e.target.value || ""));
                          return;
                        }
                        // Phase 16 — type=email: auto-detect no blur quando email valido (poupa clicar "Detectar")
                        const email = String(e.target.value || "").trim();
                        if (!email || !email.includes("@") || smtp.host) return;
                        try {
                          const res = await api.post(
                            `/wbot-imap/${initial?.id || 0}/autodetect`,
                            { email }
                          );
                          const data = (res.data as any)?.data;
                          if (data) {
                            setSmtpField("host", data.smtp.host);
                            setSmtpField("port", data.smtp.port);
                            setSmtpField("secure", data.smtp.secure);
                            setSmtpImapField("host", data.imap.host);
                            setSmtpImapField("port", data.imap.port);
                            setSmtpImapField("tls", data.imap.tls);
                            setSmtpImapField("user", email);
                            if (smtpAuth.pass) setSmtpImapField("pass", String(smtpAuth.pass || ""));
                          }
                        } catch { /* silencioso no blur */ }
                      }}
                      placeholder="seu@email.com"
                    />
                  </Field>
                  {/* Phase 16 — botao Detectar so para type=email; webmail e sempre Gmail */}
                  {type !== "webmail" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const email = String(smtpAuth.user || smtp.from || "").trim();
                        if (!email) {
                          toast.error(t("autodetectEmptyEmail" as any) || "Preencha o email primeiro");
                          return;
                        }
                        if (!email.includes("@")) {
                          toast.error(t("autodetectInvalidEmail" as any) || "Email invalido");
                          return;
                        }
                        const res = await api.post(
                          `/wbot-imap/${initial?.id || 0}/autodetect`,
                          { email }
                        );
                        const data = (res.data as any)?.data;
                        if (data) {
                          setSmtpField("host", data.smtp.host);
                          setSmtpField("port", data.smtp.port);
                          setSmtpField("secure", data.smtp.secure);
                          setSmtpImapField("host", data.imap.host);
                          setSmtpImapField("port", data.imap.port);
                          setSmtpImapField("tls", data.imap.tls);
                          // Espelha user/pass para IMAP automaticamente
                          setSmtpImapField("user", String(smtpAuth.user || ""));
                          setSmtpImapField("pass", String(smtpAuth.pass || ""));
                          // Phase 16 — confidence "low" = sugestao baseada em convencao, user deve verificar
                          if (data.confidence === "low") {
                            toast.warning(
                              t("autodetectLowConfidence" as any) ||
                                `${t("autodetectSuccess", { provider: data.provider })} — verifique os dados em SMTP avancado`
                            );
                          } else {
                            toast.success(t("autodetectSuccess", { provider: data.provider }));
                          }
                        } else {
                          toast.warning(t("autodetectFailureManual" as any) || "Provedor nao detectado — preencha manualmente em SMTP avancado");
                        }
                      } catch {
                        toast.warning(t("autodetectFailureManual" as any) || "Provedor nao detectado — preencha manualmente em SMTP avancado");
                      }
                    }}
                  >
                    {t("autodetectBtn")}
                  </Button>
                  )}
                </div>

                {/* Senha de app com tooltip explicativo */}
                <Field label={
                  <span className="inline-flex items-center gap-1">
                    {t("smtpAppPasswordLabel" as any) || "Senha de aplicativo"}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs space-y-1.5">
                          <p className="font-semibold">{t("smtpAppPasswordHowToTitle" as any) || "Como criar uma senha de aplicativo"}</p>
                          {isGmailProvider ? (
                            <>
                              <p>{t("smtpAppPasswordGmailIntro" as any) || "Gmail exige senha de app para SMTP (a senha normal nao funciona)."}</p>
                              <ol className="list-decimal list-inside space-y-0.5">
                                <li>{t("smtpAppPasswordGmailStep1" as any) || "Acesse myaccount.google.com/apppasswords"}</li>
                                <li>{t("smtpAppPasswordGmailStep2" as any) || "Crie um app: Mail / Outro (nome livre)"}</li>
                                <li>{t("smtpAppPasswordGmailStep3" as any) || "Copie a senha de 16 caracteres gerada"}</li>
                                <li>{t("smtpAppPasswordGmailStep4" as any) || "Verificacao em 2 etapas precisa estar ativa"}</li>
                              </ol>
                            </>
                          ) : (
                            <p>{t("smtpAppPasswordGenericHint" as any) || "Muitos provedores exigem uma senha especifica de app (diferente da senha normal). Procure por \"senha de app\" ou \"app password\" nas configuracoes da sua conta de email."}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                }>
                  <Input
                    type="password"
                    value={String(smtpAuth.pass || "")}
                    onChange={(e) => {
                      setSmtpAuthField("pass", e.target.value);
                      // Mantem pass do IMAP em sincronia
                      setSmtpImapField("pass", e.target.value);
                    }}
                    placeholder="••••••••••••••••"
                  />
                </Field>

                {isGmailProvider && (
                  <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground space-y-1">
                    <p className="font-semibold text-info">{t("smtpGmailDetected")}</p>
                    <p>{t("smtpGmailDesc")}</p>
                  </div>
                )}

                {/* Avancado: host/port/secure/replyTo — escondido por default */}
                <CollapseSection title={t("smtpAdvancedLabel" as any) || "SMTP avancado"} defaultOpen={false}>
                  <Field label={t("smtpServerLabel")}>
                    <Input
                      value={String(smtp.host || "")}
                      onChange={(e) => setSmtpField("host", e.target.value)}
                      placeholder="Ex: smtp.gmail.com"
                    />
                  </Field>
                  <Field label={t("smtpPortLabel")}>
                    <Input
                      type="number"
                      value={String(smtp.port || "")}
                      onChange={(e) => setSmtpField("port", Number(e.target.value))}
                      placeholder="Ex: 465"
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!smtp.secure}
                      onCheckedChange={(v) => setSmtpField("secure", v)}
                      id="smtpSecure"
                    />
                    <Label htmlFor="smtpSecure" className="cursor-pointer text-sm">
                      {t("smtpSecureLabel")}
                    </Label>
                  </div>
                  <Field label={t("smtpFromLabel")}>
                    <Input
                      value={String(smtp.from || "")}
                      onChange={(e) => setSmtpField("from", e.target.value)}
                      placeholder="Nome Empresa <noreply@empresa.com>"
                    />
                  </Field>
                  <Field label={t("smtpReplyToLabel")}>
                    <Input
                      value={String(smtp.replyTo || "")}
                      onChange={(e) => setSmtpField("replyTo", e.target.value)}
                      placeholder="resposta@empresa.com"
                    />
                  </Field>
                </CollapseSection>

                {isEdit && initial?.id && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={smtpTesting}
                      onClick={async () => {
                        setSmtpTesting(true);
                        try {
                          await api.post(`/wbot-email/smtp/${initial.id}/test`);
                          toast.success(t("smtpTestSuccess"));
                        } catch {
                          toast.error(t("smtpTestError"));
                        } finally {
                          setSmtpTesting(false);
                        }
                      }}
                    >
                      {smtpTesting && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      {t("smtpTestBtn")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={statusChecking}
                      onClick={async () => {
                        setStatusChecking(true);
                        try {
                          const res = await api.get(`/wbot-email/listen/${initial.id}/connection-status`);
                          const payload = res.data as Record<string, unknown>;
                          let inner = (payload?.data ?? payload) as unknown;
                          if (typeof inner === "string") {
                            try { inner = JSON.parse(inner); } catch { /* keep as-is */ }
                          }
                          setConnectionStatus(inner as Record<string, unknown>);
                        } catch {
                          toast.error(t("smtpStatusError"));
                          setConnectionStatus(null);
                        } finally {
                          setStatusChecking(false);
                        }
                      }}
                    >
                      {statusChecking && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      {t("smtpStatusBtn")}
                    </Button>
                  </div>
                )}

                {connectionStatus && typeof connectionStatus === "object" && !Array.isArray(connectionStatus) && (
                  <div className="rounded-md bg-muted/50 border p-3 text-xs space-y-2">
                    <p className="font-semibold text-foreground">{t("smtpStatusTitle")}</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(connectionStatus).map(([k, v]) => {
                        const isDate = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
                        const isBool = typeof v === "boolean";
                        const display = isDate
                          ? formatDateTime(new Date(v as string))
                          : isBool
                          ? (v ? "✓" : "✗")
                          : String(v ?? "—");
                        const color = isBool
                          ? v
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-background text-foreground border-border";
                        return (
                          <div key={k} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${color}`}>
                            <span className="text-muted-foreground">{k}:</span>
                            <span className="font-medium">{display}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CollapseSection>

              {/* IMAP — apenas canal email */}
              {type === "email" && (
                <CollapseSection title={t("imapSection")} defaultOpen={false}>
                  <div className="flex flex-col gap-2 mb-2">
                    <div className="flex items-end gap-2">
                      <Field label={t("autodetectSection")} className="flex-1">
                        <Input
                          value={String(smtp.from || smtpAuth.user || "")}
                          onChange={(e) => setSmtpField("from", e.target.value)}
                          placeholder={t("autodetectEmailPlaceholder")}
                        />
                      </Field>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const email = String(smtp.from || smtpAuth.user || "").trim();
                            if (!email) return;
                            const res = await api.post(
                              `/wbot-imap/${initial?.id || 0}/autodetect`,
                              { email }
                            );
                            const data = (res.data as any)?.data;
                            if (data) {
                              setSmtpField("host", data.smtp.host);
                              setSmtpField("port", data.smtp.port);
                              setSmtpField("secure", data.smtp.secure);
                              setSmtpImapField("host", data.imap.host);
                              setSmtpImapField("port", data.imap.port);
                              setSmtpImapField("tls", data.imap.tls);
                              toast.success(
                                t("autodetectSuccess", { provider: data.provider })
                              );
                            } else {
                              toast.error(t("autodetectFailure"));
                            }
                          } catch {
                            toast.error(t("autodetectFailure"));
                          }
                        }}
                      >
                        {t("autodetectBtn")}
                      </Button>
                    </div>
                  </div>
                  <Field label={t("imapHostLabel")}>
                    <Input
                      value={String(smtpImap.host || "")}
                      onChange={(e) => setSmtpImapField("host", e.target.value)}
                      placeholder="Ex: imap.gmail.com"
                    />
                  </Field>
                  <Field label={t("imapPortLabel")}>
                    <Input
                      type="number"
                      value={String(smtpImap.port || 993)}
                      onChange={(e) => setSmtpImapField("port", Number(e.target.value))}
                      placeholder="993"
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={smtpImap.tls !== false}
                      onCheckedChange={(v) => setSmtpImapField("tls", v)}
                      id="imapTls"
                    />
                    <Label htmlFor="imapTls" className="cursor-pointer text-sm">
                      {t("imapTlsLabel")}
                    </Label>
                  </div>
                  <div className="flex items-end gap-2">
                    <Field label={t("imapUserLabel")} className="flex-1">
                      <Input
                        value={String(smtpImap.user || "")}
                        onChange={(e) => setSmtpImapField("user", e.target.value)}
                        placeholder="usuario@dominio.com"
                      />
                    </Field>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSmtpImapField("user", String(smtpAuth.user || ""));
                        setSmtpImapField("pass", String(smtpAuth.pass || ""));
                      }}
                    >
                      {t("imapUseSameAsSmtpBtn")}
                    </Button>
                  </div>
                  <Field label={t("imapPassLabel")}>
                    <Input
                      type="password"
                      value={String(smtpImap.pass || "")}
                      onChange={(e) => setSmtpImapField("pass", e.target.value)}
                      placeholder="********"
                    />
                  </Field>
                  <Field label={t("imapMailboxLabel")}>
                    <Input
                      value={String(smtpImap.mailbox || "INBOX")}
                      onChange={(e) => setSmtpImapField("mailbox", e.target.value)}
                      placeholder="INBOX"
                    />
                  </Field>
                  <Field label={t("imapCheckIntervalLabel")}>
                    <Input
                      type="number"
                      min={10}
                      value={String(smtpImap.checkInterval || 30)}
                      onChange={(e) =>
                        setSmtpImapField("checkInterval", Number(e.target.value))
                      }
                      placeholder="30"
                    />
                  </Field>

                  {isEdit && initial?.id && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const res = await api.post(
                              `/wbot-imap/${initial.id}/test-imap`
                            );
                            const data = (res.data as any)?.data;
                            if (data?.success) toast.success(t("imapTestSuccess"));
                            else toast.error(t("imapTestError") + ": " + (data?.error || ""));
                          } catch {
                            toast.error(t("imapTestError"));
                          }
                        }}
                      >
                        {t("imapTestBtn")}
                      </Button>
                    </div>
                  )}
                </CollapseSection>
              )}

              {/* Avancado — apenas canal email */}
              {type === "email" && (
                <CollapseSection title={t("emailAdvancedSection")} defaultOpen={false}>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={(smtp as any).rejectUnauthorized !== false}
                      onCheckedChange={(v) =>
                        setSmtpField("rejectUnauthorized" as any, v)
                      }
                      id="rejectUnauthorized"
                    />
                    <Label htmlFor="rejectUnauthorized" className="cursor-pointer text-sm">
                      {t("rejectUnauthorizedLabel")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={smtpImap.keepalive !== false}
                      onCheckedChange={(v) => setSmtpImapField("keepalive", v)}
                      id="imapKeepalive"
                    />
                    <Label htmlFor="imapKeepalive" className="cursor-pointer text-sm">
                      {t("keepaliveLabel")}
                    </Label>
                  </div>
                  <Field label={t("emailSignatureLabel")}>
                    <textarea
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={String(form.emailSignature || "")}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, emailSignature: e.target.value }))
                      }
                      placeholder="<p>Atenciosamente,<br/>Equipe</p>"
                    />
                  </Field>
                </CollapseSection>
              )}

            </>
          )}

          {/* Instagram */}
          {type === "instagram" && (
            <CollapseSection title="Instagram" defaultOpen={false}>
              <Field label={t("instagramPageId")}>
                <Input
                  value={(form.tokenAPI as string) || ""}
                  onChange={(e) => setField("tokenAPI", e.target.value)}
                  placeholder="Ex: 123456789012345"
                />
              </Field>
              <Field label={t("instagramToken")}>
                <Input
                  value={(form.bmToken as string) || ""}
                  onChange={(e) => setField("bmToken", e.target.value)}
                  placeholder="EAABs..."
                />
              </Field>
              <Field label={t("instagramWabaToken")}>
                <Input
                  value={(form.wabaId as string) || ""}
                  onChange={(e) => setField("wabaId", e.target.value)}
                  placeholder="Ex: 123456789012345"
                />
              </Field>
              <Field label={t("apiVersionLabel")}>
                <div className="space-y-2">
                  <Select
                    value={manualWabaVersion ? "manual" : (() => { const v = (form.wabaVersion as string) || ""; if (!v) return "v21.0"; return /^v/i.test(v) ? v : `v${v}`; })()}
                    onValueChange={(v) => {
                      if (v === "manual") {
                        setManualWabaVersion(true);
                        setField("wabaVersion", "");
                      } else {
                        setManualWabaVersion(false);
                        setField("wabaVersion", v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WABA_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      <SelectItem value="manual">{t("enterManually")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {manualWabaVersion && (
                    <Input
                      value={(form.wabaVersion as string) || ""}
                      onChange={(e) => setField("wabaVersion", e.target.value)}
                      placeholder="ex: v27.0"
                      className="font-mono text-sm"
                      autoFocus
                    />
                  )}
                </div>
              </Field>
            </CollapseSection>
          )}

          {/* Messenger */}
          {type === "messenger" && (
            <CollapseSection title="Messenger" defaultOpen={false}>
              <Field label={t("messengerPageId")}>
                <Input
                  value={(form.tokenAPI as string) || ""}
                  onChange={(e) => setField("tokenAPI", e.target.value)}
                  placeholder="Ex: 123456789012345"
                />
              </Field>
              <Field label={t("messengerToken")}>
                <Input
                  value={(form.bmToken as string) || ""}
                  onChange={(e) => setField("bmToken", e.target.value)}
                  placeholder="EAABs..."
                />
              </Field>
              <Field label={t("apiVersionLabel")}>
                <div className="space-y-2">
                  <Select
                    value={manualWabaVersion ? "manual" : (() => { const v = (form.wabaVersion as string) || ""; if (!v) return "v21.0"; return /^v/i.test(v) ? v : `v${v}`; })()}
                    onValueChange={(v) => {
                      if (v === "manual") {
                        setManualWabaVersion(true);
                        setField("wabaVersion", "");
                      } else {
                        setManualWabaVersion(false);
                        setField("wabaVersion", v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WABA_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      <SelectItem value="manual">{t("enterManually")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {manualWabaVersion && (
                    <Input
                      value={(form.wabaVersion as string) || ""}
                      onChange={(e) => setField("wabaVersion", e.target.value)}
                      placeholder="ex: v27.0"
                      className="font-mono text-sm"
                      autoFocus
                    />
                  )}
                </div>
              </Field>
            </CollapseSection>
          )}

          {/* BSP Webhook Info — config manual no painel (Customer Account) */}
          {isEdit && (type === "dialog360" || type === "gupshup") && initial?.id && (
            <CollapseSection title="Configurar webhook no painel BSP" defaultOpen={false}>
              <BspWebhookInfoCard
                channelType={type as "dialog360" | "gupshup"}
                whatsappId={Number(initial.id)}
              />
            </CollapseSection>
          )}

          {/* Editar dados do app Gupshup (src.name/appName, App ID, token, numero,
              phoneNumberId, wabaId) pos-criacao — corrige dado errado sem SQL. */}
          {isEdit && type === "gupshup" && initial?.id && (
            <CollapseSection title="Editar dados do app Gupshup" defaultOpen={false}>
              <GupshupChannelDataEditor whatsappId={Number(initial.id)} />
            </CollapseSection>
          )}

          {/* Editar dados do canal Dialog360 (apiKey, phoneNumberId, wabaIdMeta)
              pos-criacao — corrige dado errado sem SQL. */}
          {isEdit && type === "dialog360" && initial?.id && (
            <CollapseSection title="Editar dados do canal Dialog360" defaultOpen={false}>
              <Dialog360ChannelDataEditor whatsappId={Number(initial.id)} />
            </CollapseSection>
          )}

          {/* Rescue Window — Meta 24h channels (WABA, Instagram, Messenger) */}
          {(type === "waba" || type === "dialog360" || type === "gupshup" || type === "instagram" || type === "messenger") && (
            <CollapseSection title={t("rescueWindowLabel")} defaultOpen={false}>
              <Field label={t("rescueWindowLabel")}>
                <Select
                  value={(form.rescueWindow as string) || "disabled"}
                  onValueChange={(v) => setField("rescueWindow", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{t("disabledLabel")}</SelectItem>
                    <SelectItem value="enabled">{t("enabledLabel")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.rescueWindow === "enabled" && (
                <Field label={t("rescueWindowMsg")}>
                  <Textarea
                    value={(form.rescueWindowMessage as string) || ""}
                    onChange={(e) => setField("rescueWindowMessage", e.target.value)}
                    placeholder="Mensagem enviada automaticamente na janela de resgate..."
                    rows={3}
                  />
                </Field>
              )}
            </CollapseSection>
          )}


          {/* WooCommerce config */}
          {type === "woocommerce" && (
            <CollapseSection title={t("woocommerceSection")} defaultOpen={false}>
              <Field label={t("woocommerceStoreUrl")}>
                <Input
                  value={(form.wabaId as string) || ""}
                  onChange={(e) => setField("wabaId", e.target.value)}
                  placeholder="https://minha-loja.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("woocommerceStoreUrlHint")}</p>
              </Field>
              <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground">
                {t("woocommerceNote")}
              </div>
            </CollapseSection>
          )}

          {/* Nuvemshop config — wabaId guarda o store_id da loja */}
          {type === "nuvemshop" && (
            <CollapseSection title={t("nuvemshopSection")} defaultOpen={false}>
              <Field label={t("nuvemshopStoreId")}>
                <Input
                  value={(form.wabaId as string) || ""}
                  onChange={(e) => setField("wabaId", e.target.value)}
                  placeholder="123456"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("nuvemshopStoreIdHint")}</p>
              </Field>
              <div className="rounded-md bg-info/10 border border-info/30 p-3 text-xs text-foreground">
                {t("nuvemshopNote")}
              </div>
            </CollapseSection>
          )}

          {/* Farewell Message */}
          {(["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","messenger","webchat","mercadolivre","olx","linkedin","youtube","tiktok","woocommerce","nuvemshop","telegram"].includes(type) || isHubType(type)) && (
            <CollapseSection title={t("farewellSection")} defaultOpen={false}>
              <Field label={t("farewellLabel")}>
                <Textarea
                  value={(form.farewellMessage as string) || ""}
                  onChange={(e) => setField("farewellMessage", e.target.value)}
                  placeholder={t("farewellPlaceholder")}
                  rows={3}
                />
              </Field>
              {(FAREWELL_MEDIA_TYPES.includes(type) || isHubType(type)) && (
                <FarewellMediaManager
                  urls={form.farewellMediaUrls as string[] | undefined}
                  onChange={(next) => setField("farewellMediaUrls", next)}
                />
              )}
              {FAREWELL_TEMPLATE_TYPES.includes(type) && (
                <FarewellTemplateManager
                  whatsapp={{
                    id: initial?.id,
                    type,
                    tokenAPI: (form.tokenAPI as string) || undefined,
                    appId: (form.appId as string) || undefined,
                  }}
                  value={form.farewellTemplate as any}
                  onChange={(next) => setField("farewellTemplate", next)}
                />
              )}
            </CollapseSection>
          )}

          {(["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","messenger","webchat","mercadolivre","olx","linkedin","youtube","tiktok","woocommerce","nuvemshop","telegram"].includes(type) || isHubType(type)) && (
            <CollapseSection title={t("inactivitySection")} defaultOpen={false}>
              <InactivityConfigManager
                value={form.inactivityConfig as any}
                onChange={(next) => setField("inactivityConfig", next)}
                channelType={type}
                chatFlows={chatFlows}
              />
            </CollapseSection>
          )}

          {/* ChatGPT */}
          {integrationSettings.chatgpt && supportsAI(type) && (
            <CollapseSection title="ChatGPT" defaultOpen={false}>
              <Field label="ChatGPT API Key">
                <Input
                  value={(form.chatgptApiKey as string) || ""}
                  onChange={(e) => setField("chatgptApiKey", e.target.value)}
                  placeholder="sk-..."
                />
              </Field>
              <OpenAIBaseUrlField
                value={(form.chatgptBaseUrl as string) || ""}
                onChange={(v) => setField("chatgptBaseUrl", v)}
                context="channel"
              />
              <Field label="Organization Key (opcional)">
                <Input
                  value={(form.chatgptOrganizationId as string) || ""}
                  onChange={(e) => setField("chatgptOrganizationId", e.target.value)}
                  placeholder="org-..."
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.chatgptOff as string) || ""}
                  onChange={(e) => setField("chatgptOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.chatgptPrompt as string) || ""}
                  onChange={(e) => setField("chatgptPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label="Assistant ID (opcional)">
                <Input
                  value={(form.assistantId as string) || ""}
                  onChange={(e) => setField("assistantId", e.target.value)}
                  placeholder="asst_..."
                />
              </Field>
              {(form.assistantId as string)?.trim() && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{tGpt("assistantMigrationTitle")}</AlertTitle>
                  <AlertDescription>{tGpt("assistantMigrationDesc")}</AlertDescription>
                </Alert>
              )}
              <Field label="ChatGPT Model">
                <Input
                  list="chatgpt-model-list"
                  value={(form.chatgptModel as string) || ""}
                  onChange={(e) => setField("chatgptModel", e.target.value)}
                  placeholder="gpt-4o-mini"
                />
                <datalist id="chatgpt-model-list">
                  {CHATGPT_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Modelos com visão (analisa imagens): <code>gpt-4o-mini</code>, <code>gpt-4o</code>, <code>gpt-4-turbo</code>. Outros aceitam texto. Você pode digitar um modelo customizado.
                </p>
              </Field>
              <Field label="Voice Model">
                <Input
                  list="chatgpt-voice-list"
                  value={(form.chatgptVoiceModel as string) || ""}
                  onChange={(e) => setField("chatgptVoiceModel", e.target.value)}
                  placeholder="alloy"
                />
                <datalist id="chatgpt-voice-list">
                  {OPENAI_VOICES.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Vozes aceitas pela OpenAI: {OPENAI_VOICES.join(", ")}. Custom permitido — confirme no docs da OpenAI antes.
                </p>
              </Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.chatgptVoice === "enabled"}
                  onCheckedChange={(v) => setField("chatgptVoice", v ? "enabled" : "disabled")}
                  id="chatgptVoice"
                />
                <Label htmlFor="chatgptVoice" className="cursor-pointer text-sm">
                  Resposta por voz (ChatGPT Voice)
                </Label>
              </div>
            </CollapseSection>
          )}

          {/* Typebot */}
          {integrationSettings.typebot && supportsAI(type) && (
            <CollapseSection title="Typebot" defaultOpen={false}>
              <Field label="URL do Typebot">
                <Input
                  value={(form.typebotUrl as string) || ""}
                  onChange={(e) => setField("typebotUrl", e.target.value)}
                  placeholder="https://typebot.io/..."
                />
              </Field>
              <Field label="Nome do fluxo">
                <Input
                  value={(form.typebotName as string) || ""}
                  onChange={(e) => setField("typebotName", e.target.value)}
                  placeholder="Nome do bot"
                />
              </Field>
              <Field label={t("restartWord")}>
                <Input
                  value={(form.typebotRestart as string) || ""}
                  onChange={(e) => setField("typebotRestart", e.target.value)}
                  placeholder="Ex: #reiniciar"
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.typebotOff as string) || ""}
                  onChange={(e) => setField("typebotOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
              <Field label={t("unknownMessage")}>
                <Input
                  value={(form.typebotUnknowMessage as string) || ""}
                  onChange={(e) => setField("typebotUnknowMessage", e.target.value)}
                  placeholder={t("unknownMessagePlaceholder")}
                />
              </Field>
              {(type === "waba" || type === "dialog360" || type === "gupshup" || type === "webchat") && (
                <Field label={t("buttonChoiceMsg")}>
                  <Input
                    value={(form.typebotButtonChoiceMessage as string) || ""}
                    onChange={(e) => setField("typebotButtonChoiceMessage", e.target.value)}
                    placeholder={t("buttonChoiceMsgPlaceholder")}
                  />
                </Field>
              )}
              {(type === "waba" || type === "dialog360" || type === "gupshup" || type === "instagram" || type === "messenger" || type === "webchat") && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.isButton === "enabled"}
                    onCheckedChange={(v) => setField("isButton", v ? "enabled" : "disabled")}
                    id="typebotIsButton"
                  />
                  <Label htmlFor="typebotIsButton" className="cursor-pointer text-sm">
                    {t("useInteractiveButtons")}
                  </Label>
                </div>
              )}
            </CollapseSection>
          )}

          {/* Dify — no messenger */}
          {integrationSettings.dify && (["whatsapp","meow","evo","evogo","zapi","uazapi","baileys","zapo","waba","dialog360","gupshup","instagram","webchat","mercadolivre","olx","linkedin","telegram"].includes(type) || isHubType(type)) && (
            <CollapseSection title="Dify" defaultOpen={false}>
              {/* difyKey — not shown for instagram */}
              {(["whatsapp","meow","evo","evogo","zapi","uazapi","baileys","zapo","waba","dialog360","gupshup","webchat"].includes(type) || isHubType(type)) && (
                <Field label="Chave da API Dify">
                  <Input
                    value={(form.difyKey as string) || ""}
                    onChange={(e) => setField("difyKey", e.target.value)}
                    placeholder="app-..."
                  />
                </Field>
              )}
              <Field label="URL do Dify">
                <Input
                  value={(form.difyUrl as string) || ""}
                  onChange={(e) => setField("difyUrl", e.target.value)}
                  placeholder="https://api.dify.ai/v1"
                />
              </Field>
              <Field label="Tipo do Dify">
                <Select
                  value={(form.difyType as string) || ""}
                  onValueChange={(v) => setField("difyType", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agente</SelectItem>
                    <SelectItem value="textGenerator">Gerador de Texto</SelectItem>
                    <SelectItem value="chatBot">ChatBot</SelectItem>
                    <SelectItem value="workflow">Workflow</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("restartWord")}>
                <Input
                  value={(form.difyRestart as string) || ""}
                  onChange={(e) => setField("difyRestart", e.target.value)}
                  placeholder="Ex: #reiniciar"
                />
              </Field>
              {/* difyOff — not shown for instagram or messenger */}
              {(["whatsapp","meow","evo","evogo","zapi","uazapi","baileys","zapo","waba","dialog360","gupshup","webchat"].includes(type) || isHubType(type)) && (
                <Field label={t("stopWord")}>
                  <Input
                    value={(form.difyOff as string) || ""}
                    onChange={(e) => setField("difyOff", e.target.value)}
                    placeholder="Ex: #sair"
                  />
                </Field>
              )}
            </CollapseSection>
          )}

          {/* N8N — no messenger */}
          {integrationSettings.n8n && (["whatsapp","meow","evo","evogo","zapi","uazapi","baileys","zapo","waba","dialog360","gupshup","instagram","webchat","telegram"].includes(type) || isHubType(type)) && (
            <CollapseSection title="N8N" defaultOpen={false}>
              <Field label="URL do Webhook N8N">
                <Input
                  value={(form.n8nUrl as string) || ""}
                  onChange={(e) => setField("n8nUrl", e.target.value)}
                  placeholder="https://n8n.example.com/webhook/..."
                />
              </Field>
            </CollapseSection>
          )}

          {/* Webhook do Canal */}
          <CollapseSection title={t("channelWebhookSection")} defaultOpen={false}>
            <ToggleRow
              id="channelWebhook"
              label={t("channelWebhookEnabled")}
              description={t("channelWebhookEnabledDesc")}
              checked={(form.channelWebhook as string) === "enabled"}
              onCheckedChange={(v) => setField("channelWebhook", v ? "enabled" : "disabled")}
            />
            {(form.channelWebhook as string) === "enabled" && (
              <>
                <Field label={t("channelWebhookUrl")}>
                  <Input
                    value={(form.channelWebhookUrl as string) || ""}
                    onChange={(e) => setField("channelWebhookUrl", e.target.value)}
                    placeholder="https://example.com/webhook"
                  />
                </Field>
                <ToggleRow
                  id="channelWebhookMessage"
                  label={t("channelWebhookMessage")}
                  description={t("channelWebhookMessageDesc")}
                  checked={(form.channelWebhookMessage as string) === "enabled"}
                  onCheckedChange={(v) => setField("channelWebhookMessage", v ? "enabled" : "disabled")}
                />
              </>
            )}
          </CollapseSection>

          {/* PIX — apenas canais que enviam botão PIX (Baileys, Zapo e UazAPI) */}
          {(type === "baileys" || type === "zapo" || type === "uazapi") && (
            <CollapseSection title={t("pixSection")} defaultOpen={false}>
              <p className="text-xs text-muted-foreground">{t("pixDefaultDesc")}</p>
              <Field label={t("pixDefaultTypeLabel")}>
                <Select
                  value={(form.pixDefaultType as string) || "EVP"}
                  onValueChange={(v) => setField("pixDefaultType", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EVP">EVP (aleatória)</SelectItem>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("pixDefaultKeyLabel")}>
                <Input
                  value={(form.pixDefaultKey as string) || ""}
                  onChange={(e) => setField("pixDefaultKey", e.target.value)}
                  placeholder={t("pixDefaultKeyPlaceholder")}
                />
              </Field>
              <Field label={t("pixDefaultNameLabel")}>
                <Input
                  value={(form.pixDefaultName as string) || ""}
                  onChange={(e) => setField("pixDefaultName", e.target.value)}
                  placeholder={t("pixDefaultNamePlaceholder")}
                />
              </Field>
              <Field label={t("pixDefaultMessage")}>
                <Textarea
                  value={(form.pixDefaultMessage as string) || ""}
                  onChange={(e) => setField("pixDefaultMessage", e.target.value)}
                  placeholder={t("pixDefaultMessagePlaceholder")}
                  rows={3}
                />
              </Field>
            </CollapseSection>
          )}

          {/* Ollama */}
          {integrationSettings.ollama && supportsAI(type) && (
            <CollapseSection title="Ollama" defaultOpen={false}>
              <Field label="URL do Ollama">
                <Input
                  value={(form.ollamaUrl as string) || ""}
                  onChange={(e) => setField("ollamaUrl", e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="ollama-model-list"
                  value={(form.ollamaModel as string) || ""}
                  onChange={(e) => setField("ollamaModel", e.target.value)}
                  placeholder="llama3.3"
                />
                <datalist id="ollama-model-list">
                  {OLLAMA_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Lista comuns; depende do que está instalado no servidor Ollama. Custom permitido.
                </p>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.ollamaPrompt as string) || ""}
                  onChange={(e) => setField("ollamaPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.ollamaOff as string) || ""}
                  onChange={(e) => setField("ollamaOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* LM Studio */}
          {integrationSettings.lm && supportsAI(type) && (
            <CollapseSection title="LM Studio" defaultOpen={false}>
              <Field label="URL do LM Studio">
                <Input
                  value={(form.lmUrl as string) || ""}
                  onChange={(e) => setField("lmUrl", e.target.value)}
                  placeholder="http://localhost:1234/v1"
                />
              </Field>
              <Field label="Modelo">
                <Input
                  value={(form.lmModel as string) || ""}
                  onChange={(e) => setField("lmModel", e.target.value)}
                  placeholder="local-model"
                />
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.lmPrompt as string) || ""}
                  onChange={(e) => setField("lmPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.lmOff as string) || ""}
                  onChange={(e) => setField("lmOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* Grok */}
          {integrationSettings.grok && supportsAI(type) && (
            <CollapseSection title="Grok (xAI)" defaultOpen={false}>
              <Field label="API Key Grok">
                <Input
                  type="password"
                  autoComplete="off"
                  value={(form.grokUrl as string) || ""}
                  onChange={(e) => setField("grokUrl", e.target.value)}
                  placeholder="xai-..."
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="grok-model-list"
                  value={(form.grokModel as string) || ""}
                  onChange={(e) => setField("grokModel", e.target.value)}
                  placeholder="grok-3"
                />
                <datalist id="grok-model-list">
                  {GROK_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.grokPrompt as string) || ""}
                  onChange={(e) => setField("grokPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.grokOff as string) || ""}
                  onChange={(e) => setField("grokOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* Gemini */}
          {integrationSettings.gemini && supportsAI(type) && (
            <CollapseSection title="Gemini (Google)" defaultOpen={false}>
              <Field label="API Key Gemini">
                <Input
                  type="password"
                  autoComplete="off"
                  value={(form.geminiUrl as string) || ""}
                  onChange={(e) => setField("geminiUrl", e.target.value)}
                  placeholder="AIza..."
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="gemini-model-list"
                  value={(form.geminiModel as string) || ""}
                  onChange={(e) => setField("geminiModel", e.target.value)}
                  placeholder="gemini-2.0-flash-001"
                />
                <datalist id="gemini-model-list">
                  {GEMINI_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.geminiPrompt as string) || ""}
                  onChange={(e) => setField("geminiPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.geminiOff as string) || ""}
                  onChange={(e) => setField("geminiOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* DeepSeek */}
          {integrationSettings.deepseek && supportsAI(type) && (
            <CollapseSection title="DeepSeek" defaultOpen={false}>
              <Field label="API Key DeepSeek">
                <Input
                  type="password"
                  autoComplete="off"
                  value={(form.deepseekUrl as string) || ""}
                  onChange={(e) => setField("deepseekUrl", e.target.value)}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="deepseek-model-list"
                  value={(form.deepseekModel as string) || ""}
                  onChange={(e) => setField("deepseekModel", e.target.value)}
                  placeholder="deepseek-chat"
                />
                <datalist id="deepseek-model-list">
                  {DEEPSEEK_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.deepseekPrompt as string) || ""}
                  onChange={(e) => setField("deepseekPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.deepseekOff as string) || ""}
                  onChange={(e) => setField("deepseekOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* Qwen — no instagram, no messenger */}
          {integrationSettings.qwen && (["whatsapp","meow","evo","evogo","zapi","uazapi","baileys","zapo","waba","dialog360","gupshup","telegram","webchat"].includes(type) || isHubType(type)) && (
            <CollapseSection title="Qwen (Alibaba)" defaultOpen={false}>
              <Field label="API Key Qwen">
                <Input
                  type="password"
                  autoComplete="off"
                  value={(form.qwenUrl as string) || ""}
                  onChange={(e) => setField("qwenUrl", e.target.value)}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="qwen-model-list"
                  value={(form.qwenModel as string) || ""}
                  onChange={(e) => setField("qwenModel", e.target.value)}
                  placeholder="qwen-max"
                />
                <datalist id="qwen-model-list">
                  {QWEN_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.qwenPrompt as string) || ""}
                  onChange={(e) => setField("qwenPrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.qwenOff as string) || ""}
                  onChange={(e) => setField("qwenOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* Claude */}
          {integrationSettings.claude && supportsAI(type) && (
            <CollapseSection title="Claude (Anthropic)" defaultOpen={false}>
              <Field label="API Key Claude">
                <Input
                  type="password"
                  autoComplete="off"
                  value={(form.claudeUrl as string) || ""}
                  onChange={(e) => setField("claudeUrl", e.target.value)}
                  placeholder="sk-ant-..."
                />
              </Field>
              <Field label="Modelo">
                <Input
                  list="claude-model-list"
                  value={(form.claudeModel as string) || ""}
                  onChange={(e) => setField("claudeModel", e.target.value)}
                  placeholder="claude-sonnet-4-5-20250929"
                />
                <datalist id="claude-model-list">
                  {CLAUDE_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Prompt">
                <Textarea
                  value={(form.claudePrompt as string) || ""}
                  onChange={(e) => setField("claudePrompt", e.target.value)}
                  placeholder={t("assistantPlaceholder")}
                  rows={4}
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.claudeOff as string) || ""}
                  onChange={(e) => setField("claudeOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
            </CollapseSection>
          )}

          {/* Dialogflow (only whatsapp/baileys/zapo) */}
          {integrationSettings.dialogflow && (type === "whatsapp" || type === "baileys" || type === "zapo") && (
            <CollapseSection title="Dialogflow" defaultOpen={false}>
              <Field label="Project ID">
                <Input
                  value={(form.dialogflowProjectId as string) || ""}
                  onChange={(e) => setField("dialogflowProjectId", e.target.value)}
                  placeholder="meu-projeto-dialogflow"
                />
              </Field>
              <Field label="Idioma">
                <Input
                  value={(form.dialogflowLanguage as string) || ""}
                  onChange={(e) => setField("dialogflowLanguage", e.target.value)}
                  placeholder="pt-BR"
                />
              </Field>
              <Field label={t("stopWord")}>
                <Input
                  value={(form.dialogflowOff as string) || ""}
                  onChange={(e) => setField("dialogflowOff", e.target.value)}
                  placeholder="Ex: #sair"
                />
              </Field>
              <Field label={t("jsonFileNameLabel")}>
                <Input
                  value={(form.dialogflowJsonFilename as string) || ""}
                  onChange={(e) => setField("dialogflowJsonFilename", e.target.value)}
                  placeholder="credentials.json"
                />
              </Field>
              <Field label={t("jsonCredentialsLabel")}>
                <Textarea
                  value={(form.dialogflowJson as string) || ""}
                  onChange={(e) => setField("dialogflowJson", e.target.value)}
                  placeholder='{"type": "service_account", ...}'
                  rows={5}
                />
              </Field>
            </CollapseSection>
          )}

          {/* ── Features / Toggles ─────────────────────── */}
          {type !== "webmail" && type !== "email" && (
            <CollapseSection title={t("channelFeatures")} defaultOpen={false}>

              {/* sendEvaluation — all except webmail */}
              {(["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","webchat","mercadolivre","olx","linkedin"].includes(type) || isHubType(type)) && (
                <ToggleRow
                  id="sendEvaluation"
                  label={t("enableAutoEvaluation")}
                  description={t("enableAutoEvaluationDesc")}
                  checked={form.sendEvaluation === "enabled"}
                  onCheckedChange={(v) => setField("sendEvaluation", v ? "enabled" : "disabled")}
                />
              )}

              {/* transcribeAudio */}
              {(["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","webchat","mercadolivre","olx","linkedin","youtube","tiktok","woocommerce","nuvemshop"].includes(type) || isHubType(type)) && (
                <>
                  <ToggleRow
                    id="transcribeAudio"
                    label={t("enableAudioTranscription")}
                    description={t("enableAudioTranscriptionDesc")}
                    checked={form.transcribeAudio === "enabled"}
                    onCheckedChange={(v) => setField("transcribeAudio", v ? "enabled" : "disabled")}
                  />
                  {form.transcribeAudio === "enabled" && (
                    <Field label={t("credentialsJson")}>
                      <Textarea
                        value={(form.transcribeAudioJson as string) || ""}
                        onChange={(e) => setField("transcribeAudioJson", e.target.value)}
                        placeholder='{"type": "service_account", ...}'
                        rows={3}
                      />
                    </Field>
                  )}
                </>
              )}

              {/* selfDistribute */}
              {(["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","webchat","mercadolivre","olx","linkedin","youtube","tiktok","woocommerce","nuvemshop"].includes(type) || isHubType(type)) && (
                <>
                  <ToggleRow
                    id="selfDistribute"
                    label={t("enableAutoDistribute")}
                    description={t("enableAutoDistributeDesc")}
                    checked={form.selfDistribute === "enabled"}
                    onCheckedChange={(v) => setField("selfDistribute", v ? "enabled" : "disabled")}
                  />
                  <p className="text-xs text-muted-foreground -mt-2 mb-3 ml-1 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                    {t("selfDistributeAutoDistNote")}
                  </p>
                </>
              )}

              {/* destroyMessage — QR types only */}
              {["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi"].includes(type) && (
                <ToggleRow
                  id="destroyMessage"
                  label={t("enableMessageDestruction")}
                  description={t("enableMessageDestructionDesc")}
                  checked={form.destroyMessage === "enabled"}
                  onCheckedChange={(v) => setField("destroyMessage", v ? "enabled" : "disabled")}
                />
              )}

              {/* birthdayDate */}
              {["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram"].includes(type) && (
                <>
                  <ToggleRow
                    id="birthdayDate"
                    label={t("enableBirthdayMsg")}
                    description={t("enableBirthdayMsgDesc")}
                    checked={form.birthdayDate === "enabled"}
                    onCheckedChange={(v) => setField("birthdayDate", v ? "enabled" : "disabled")}
                  />
                  {form.birthdayDate === "enabled" && (
                    <div className="pl-4 border-l-2 border-border ml-2 space-y-3">
                      <SectionTitle>{t("birthdayMsgTitle")}</SectionTitle>

                      {(type === "waba" || type === "dialog360" || type === "gupshup") ? (
                        /* WABA / Dialog360 / Gupshup: template picker */
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" />
                            {t("birthdayWabaTemplate")}
                          </p>

                          {!bdSelectedTpl ? (
                            /* Template list */
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Input
                                  value={bdTplSearch}
                                  onChange={(e) => setBdTplSearch(e.target.value)}
                                  placeholder={t("birthdayTemplateSearchPlaceholder")}
                                  className="h-8 text-sm flex-1"
                                  onFocus={() => { if (bdTplList.length === 0) loadBdTemplates(); }}
                                />
                                <Button type="button" variant="outline" size="sm" onClick={loadBdTemplates} disabled={bdTplLoading} className="h-8 shrink-0">
                                  {bdTplLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                              {bdTplLoading ? (
                                <p className="text-xs text-muted-foreground text-center py-2">{t("birthdayTemplateLoading")}</p>
                              ) : bdTplList.length === 0 ? (
                                <Button type="button" variant="outline" size="sm" onClick={loadBdTemplates} className="w-full h-8 text-xs">
                                  {t("birthdaySelectTemplate")}
                                </Button>
                              ) : (() => {
                                const filtered = bdTplList.filter((tp) => !bdTplSearch || tp.name.toLowerCase().includes(bdTplSearch.toLowerCase()));
                                return filtered.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-2">{t("birthdayTemplateEmpty")}</p>
                                ) : (
                                  <div className="max-h-44 overflow-y-auto border rounded-lg divide-y">
                                    {filtered.map((tp) => (
                                      <button
                                        key={`${tp.name}-${tp.language}`}
                                        type="button"
                                        onClick={() => setBdSelectedTpl(tp)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                                      >
                                        <p className="font-medium truncate">{tp.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{tp.language}{tp.status && <span className="ml-2 text-success">{tp.status}</span>}</p>
                                        {tp.components?.find((c) => c.type === "BODY")?.text && (
                                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tp.components!.find((c) => c.type === "BODY")!.text}</p>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            /* Template selected: preview + vars */
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold truncate flex-1">{bdSelectedTpl.name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{bdSelectedTpl.language}</span>
                                <Button type="button" variant="ghost" size="sm" onClick={clearBdTemplate} className="h-6 text-xs px-2 shrink-0">
                                  {t("birthdayChangeTemplate")}
                                </Button>
                              </div>

                              {/* WhatsApp-style preview */}
                              <div className="bg-[#e5ddd5] dark:bg-[#1a1a2e] rounded-lg p-2.5">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-2.5 max-w-[90%] ml-auto space-y-1">
                                  {bdSelectedTpl.components?.find((c) => c.type === "HEADER") && (() => {
                                    const hdr = bdSelectedTpl.components!.find((c) => c.type === "HEADER")!;
                                    const hdrLinkVar = bdTplVars.find((v) => v.key === "header_link");
                                    if (hdr.format === "TEXT" && hdr.text) return <p className="font-bold text-xs text-gray-900 dark:text-gray-100">{hdr.text}</p>;
                                    if (hdr.format === "IMAGE") return hdrLinkVar?.value
                                      ? <img src={hdrLinkVar.value} alt="header" className="w-full rounded object-cover max-h-24" />
                                      : <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">{t("birthdayHeaderImagePreview")}</div>;
                                    if (hdr.format === "VIDEO") return <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">{t("birthdayHeaderVideoPreview")}</div>;
                                    if (hdr.format === "DOCUMENT") return <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">{t("birthdayHeaderDocumentPreview")}</div>;
                                    return null;
                                  })()}
                                  {bdSelectedTpl.components?.find((c) => c.type === "BODY")?.text && (() => {
                                    let text = bdSelectedTpl.components!.find((c) => c.type === "BODY")!.text!;
                                    bdTplVars.filter((v) => v.key.startsWith("variable_") || v.key.startsWith("named_variable_")).forEach((v) => {
                                      if (v.key.startsWith("variable_")) {
                                        const n = v.key.replace("variable_", "");
                                        text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                                      } else {
                                        const name = v.key.replace("named_variable_", "");
                                        text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), v.value || `{{${name}}}`);
                                      }
                                    });
                                    return <p className="text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-100">{text}</p>;
                                  })()}
                                  {bdSelectedTpl.components?.find((c) => c.type === "FOOTER")?.text && (
                                    <p className="text-xs text-gray-400">{bdSelectedTpl.components!.find((c) => c.type === "FOOTER")!.text}</p>
                                  )}
                                  {bdSelectedTpl.components?.find((c) => c.type === "BUTTONS")?.buttons && (
                                    <div className="border-t border-gray-200 dark:border-gray-600 pt-1 space-y-0.5">
                                      {bdSelectedTpl.components!.find((c) => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
                                        <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 dark:border-gray-600 rounded">{btn.text}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Variables */}
                              {bdTplVars.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">{t("birthdayTemplateVarsTitle")}</p>
                                  {bdTplVars.map((v) => (
                                    <div key={v.key} className="flex items-center gap-2">
                                      <Label className="text-xs w-28 shrink-0">{v.label}</Label>
                                      <Input
                                        ref={v.key === "header_link" ? bdHeaderLinkFieldRef : undefined}
                                        value={v.value}
                                        onChange={(e) => {
                                          if (v.key === "header_link") clearFormError("bdHeaderLink");
                                          setBdTplVars((prev) => prev.map((tv) => tv.key === v.key ? { ...tv, value: e.target.value } : tv));
                                        }}
                                        className="h-7 text-xs flex-1"
                                        placeholder={v.label}
                                        error={v.key === "header_link" ? formErrors.bdHeaderLink : undefined}
                                        aria-invalid={v.key === "header_link" && formErrors.bdHeaderLink ? true : undefined}
                                      />
                                      {v.key === "header_link" && (
                                        <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" title={t("birthdayPickFromGallery")} onClick={() => setBdGalleryOpen(true)}>
                                          <GalleryHorizontalEnd className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Non-WABA: plain text */
                        <Field label={t("birthdayMsgLabel")}>
                          <Textarea
                            value={(form.birthdayDateMessage as string) || ""}
                            onChange={(e) => setField("birthdayDateMessage", e.target.value)}
                            placeholder="Seja bem vindo {{name}}"
                            rows={3}
                          />
                        </Field>
                      )}

                      <Field label={t("birthdayMsgHour")}>
                        <Input
                          type="time"
                          value={(form.birthdayDateHour as string) || ""}
                          onChange={(e) => setField("birthdayDateHour", e.target.value)}
                        />
                      </Field>
                      {type !== "waba" && (
                        <Field label={t("birthdayMediaNote")}>
                          {initial?.birthdayDateFileName && (
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("birthdayMediaCurrentFile")}: {String(initial.birthdayDateFileName).slice(0, 30)}
                            </p>
                          )}
                          <Input
                            type="file"
                            onChange={(e) => setBdMediaFile(e.target.files?.[0] ?? null)}
                            className="h-9 text-sm"
                          />
                        </Field>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ignoreBussinesHours — all (3 modos: disabled | enabled | queueOnly) */}
              <div className="py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="ignoreBussinesHours" className="text-sm font-medium leading-snug">
                    {t("ignoreBusinessHoursMode")}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs whitespace-pre-line">
                        {t("ignoreBusinessHoursTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={
                    form.ignoreBussinesHours === "enabled" || form.ignoreBussinesHours === "queueOnly"
                      ? (form.ignoreBussinesHours as string)
                      : "disabled"
                  }
                  onValueChange={(v) => setField("ignoreBussinesHours", v)}
                >
                  <SelectTrigger id="ignoreBussinesHours" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{t("ignoreBusinessHoursModeDisabled")}</SelectItem>
                    <SelectItem value="enabled">{t("ignoreBusinessHoursModeEnabled")}</SelectItem>
                    <SelectItem value="queueOnly">{t("ignoreBusinessHoursModeQueueOnly")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground break-words">
                  {form.ignoreBussinesHours === "enabled"
                    ? t("ignoreBusinessHoursModeEnabledDesc")
                    : form.ignoreBussinesHours === "queueOnly"
                    ? t("ignoreBusinessHoursModeQueueOnlyDesc")
                    : t("ignoreBusinessHoursModeDisabledDesc")}
                </p>
              </div>

              {/* autoReassign — all */}
              <ToggleRow
                id="autoReassign"
                label={t("autoReassignLabel")}
                description={t("autoReassignDesc")}
                checked={form.autoReassign === "enabled"}
                onCheckedChange={(v) => setField("autoReassign", v ? "enabled" : "disabled")}
              />
              {form.autoReassign === "enabled" && (
                <div className="ml-4 pl-4 border-l space-y-3">
                  <Field label={t("autoReassignStatusLabel")}>
                    <div className="flex gap-4">
                      {["open", "pending", "closed"].map((s) => {
                        const statuses = ((form.autoReassignStatus as string) || "open,pending")
                          .split(",").map((x: string) => x.trim());
                        return (
                          <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={statuses.includes(s)}
                              onChange={(e) => {
                                const current = ((form.autoReassignStatus as string) || "").split(",").map((x: string) => x.trim()).filter(Boolean);
                                const next = e.target.checked
                                  ? [...new Set([...current, s])]
                                  : current.filter((x: string) => x !== s);
                                setField("autoReassignStatus", next.join(","));
                              }}
                            />
                            {t(`status_${s}`)}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label={t("autoReassignMethodLabel")}>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={(form.autoReassignMethod as string) || "R"}
                      onChange={(e) => setField("autoReassignMethod", e.target.value)}
                    >
                      <option value="R">{t("autoReassignMethodRandom")}</option>
                      <option value="B">{t("autoReassignMethodBalanced")}</option>
                      <option value="S">{t("autoReassignMethodSequential")}</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(form.autoReassignMethod as string) === "B"
                        ? t("autoReassignMethodBalancedDesc")
                        : (form.autoReassignMethod as string) === "S"
                        ? t("autoReassignMethodSequentialDesc")
                        : t("autoReassignMethodRandomDesc")}
                    </p>
                  </Field>
                  <Field label={t("autoReassignIntervalLabel")}>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-24"
                        value={(form.autoReassignIntervalMinutes as number) ?? 30}
                        onChange={(e) => setField("autoReassignIntervalMinutes", Number(e.target.value))}
                      />
                      <span className="text-sm text-muted-foreground">{t("autoReassignIntervalUnit")}</span>
                    </div>
                  </Field>
                  <p className="text-xs text-muted-foreground mt-2 pl-3 border-l-2 border-amber-300 dark:border-amber-700/50">
                    {t("autoReassignAutoDistNote")}
                  </p>
                </div>
              )}

              {/* queuePositionEnabled — tri-state inherit/enabled/disabled */}
              {(["whatsapp","baileys","zapo","waba","dialog360","gupshup","instagram","messenger","webchat","telegram","evo","evogo","zapi","uazapi","meow"].includes(type) || isHubType(type)) && (
                <>
                  <div className="flex items-start justify-between gap-3 py-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-sm font-medium leading-snug">{t("queuePositionSection")}</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-muted-foreground hover:text-foreground">
                                <HelpCircle className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm text-xs leading-relaxed">
                              {t.raw("queuePositionTooltip") as string}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("queuePositionEnabledHint")}</p>
                    </div>
                    <Select
                      value={(form.queuePositionEnabled as string) || "inherit"}
                      onValueChange={(v) => setField("queuePositionEnabled", v)}
                    >
                      <SelectTrigger className="w-[140px] flex-shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">{t("queuePositionInherit")}</SelectItem>
                        <SelectItem value="enabled">{t("queuePositionStateEnabled")}</SelectItem>
                        <SelectItem value="disabled">{t("queuePositionStateDisabled")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.queuePositionEnabled === "enabled" && (
                    <div className="ml-4 pl-4 border-l space-y-3">
                      <Field label={t("queuePositionAvgLabel")}>
                        <Input
                          type="number"
                          min={1}
                          max={600}
                          value={
                            form.queuePositionAvgMinutes === null || form.queuePositionAvgMinutes === undefined
                              ? ""
                              : String(form.queuePositionAvgMinutes)
                          }
                          onChange={(e) =>
                            setField(
                              "queuePositionAvgMinutes",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                          placeholder={t("queuePositionAvgPlaceholder")}
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t("queuePositionAvgHint")}</p>
                      </Field>
                      <Field label={t("queuePositionMessageLabel")}>
                        <Textarea
                          value={(form.queuePositionMessage as string) || ""}
                          onChange={(e) => setField("queuePositionMessage", e.target.value)}
                          placeholder={t.raw("queuePositionMessagePlaceholder") as string}
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t.raw("queuePositionPlaceholdersHint") as string}</p>
                      </Field>
                    </div>
                  )}
                </>
              )}

              {/* disableExternalIntegration — all (exceto youtube/woocommerce/tiktok, sem integracoes externas) */}
              {type !== "youtube" && type !== "woocommerce" && type !== "nuvemshop" && type !== "tiktok" && (
                <ToggleRow
                  id="disableExternalIntegration"
                  label={t("enableAutoShutdown")}
                  description={t("enableAutoShutdownDesc")}
                  checked={form.disableExternalIntegration === "enabled"}
                  onCheckedChange={(v) => setField("disableExternalIntegration", v ? "enabled" : "disabled")}
                />
              )}

              {/* waitProcessExternalInteraction — all */}
              <ToggleRow
                id="waitProcessExternalInteraction"
                label={t("enableProcessingWait")}
                description={t("enableProcessingWaitDesc")}
                checked={form.waitProcessExternalInteraction === "enabled"}
                onCheckedChange={(v) => setField("waitProcessExternalInteraction", v ? "enabled" : "disabled")}
              />

              {/* webPush — all */}
              <ToggleRow
                id="webPush"
                label={t("enableWebPush")}
                description={t("enableWebPushDesc")}
                checked={form.webPush === "enabled"}
                onCheckedChange={(v) => setField("webPush", v ? "enabled" : "disabled")}
              />

              {/* isActive (Contingência) — todos os tipos. Em waba/instagram o toggle
                  ficava escondido, mas o badge "Inativo" aparecia no card e o canal
                  podia ser auto-desativado pelo breaker: sem controle na tela, só um
                  UPDATE no banco reativava. A descrição muda porque nesses canais o
                  recebimento (webhook) continua — o que para é o envio. */}
              <ToggleRow
                id="isActive"
                label={t("contingency")}
                description={
                  type === "waba" || type === "instagram" || type === "messenger"
                    ? t("contingencyDescMeta")
                    : t("contingencyDesc")
                }
                checked={form.isActive !== false}
                onCheckedChange={(v) => setField("isActive", v)}
              />

              {/* closeKeyWord — all except webmail */}
              <Field label={t("closeKeyword")}>
                <KeywordChipsInput
                  value={(form.closeKeyWord as string) || ""}
                  onChange={(v) => setField("closeKeyWord", v)}
                  placeholder="Ex: desligar"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("closeKeywordDesc")}
                </p>
              </Field>
            </CollapseSection>
          )}

          {/* Proxy — QR types when not connected */}
          {["whatsapp","baileys","zapo","meow","evo","evogo","uazapi"].includes(type) && form.status !== "CONNECTED" && (
            <CollapseSection title={t("additionalSettings")} defaultOpen={false}>
              <Field label={t("proxyUrlLabel")}>
                <Input
                  value={(form.proxyUrl as string) || ""}
                  onChange={(e) => setField("proxyUrl", e.target.value)}
                  placeholder="socks5://ip:porta"
                />
              </Field>
              <Field label={t("proxyUserLabel")}>
                <Input
                  value={(form.proxyUser as string) || ""}
                  onChange={(e) => setField("proxyUser", e.target.value)}
                  placeholder="usuario"
                />
              </Field>
              <Field label={t("proxyPassLabel")}>
                <Input
                  type="password"
                  value={(form.proxyPass as string) || ""}
                  onChange={(e) => setField("proxyPass", e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
            </CollapseSection>
          )}
          </>}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading || launching}>
            {t("cancel")}
          </Button>
          {!isOAuthType && (
            <Button onClick={handleSubmit} disabled={loading || licenseCheck.open || licenseGating} className="gap-1">
              {(loading || licenseCheck.open || licenseGating) && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? t("saveChanges") : t("createChannel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Birthday WABA template gallery picker */}
    <GalleryPickerWithUploadDialog
      open={bdGalleryOpen}
      onOpenChange={setBdGalleryOpen}
      onPick={pickBdGalleryItem}
      {...wabaHeaderFormatToGalleryParams(
        bdSelectedTpl?.components?.find((c) => c.type === "HEADER")?.format
      )}
    />

    {/* Hijack takeover WABA — 409 durante criacao do canal */}
    <HijackTakeoverDialog
      open={hijackState !== null}
      details={hijackState}
      loading={hijackLoading}
      onCancel={() => { if (!hijackLoading) setHijackState(null); }}
      onConfirm={handleHijackConfirm}
    />

    {/* Checagem visual de licenca — canais diretos (nao-OAuth) antes de criar.
        Paridade com o gate do popup OAuth: valida no proxy e so cria se valida. */}
    <Dialog
      open={licenseCheck.open}
      onOpenChange={(o) => {
        // So permite fechar manualmente no estado de erro (nunca durante o check).
        if (!o && licenseCheck.status === "error") {
          setLicenseCheck({ open: false, status: "checking", message: "" });
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[420px]"
        onInteractOutside={(e) => { if (licenseCheck.status !== "error") e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (licenseCheck.status !== "error") e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" />
            {t("licenseCheckTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center gap-3 py-6">
          {licenseCheck.status === "checking" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium">{t("licenseCheckVerifying")}</p>
              <p className="text-xs text-muted-foreground">{t("licenseCheckWaiting")}</p>
            </>
          )}
          {licenseCheck.status === "success" && (
            <>
              <CheckCircle2 className="w-10 h-10 text-success" />
              <p className="text-sm font-medium">{t("licenseCheckValid")}</p>
            </>
          )}
          {licenseCheck.status === "error" && (
            <>
              <XCircle className="w-10 h-10 text-destructive" />
              <p className="text-sm font-medium">{t("licenseCheckFailed")}</p>
              {licenseCheck.message && (
                <p className="text-xs text-muted-foreground break-words">{licenseCheck.message}</p>
              )}
              <p className="text-xs text-muted-foreground">{t("licenseCheckBlocked")}</p>
            </>
          )}
        </div>
        {licenseCheck.status === "error" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLicenseCheck({ open: false, status: "checking", message: "" })}
            >
              {t("licenseCheckClose")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────
const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  chatgpt: false, typebot: false, dify: false, n8n: false,
  ollama: false, lm: false, grok: false, gemini: false,
  deepseek: false, qwen: false, claude: false, dialogflow: false,
};

type SortMode = "default" | "alpha" | "byType" | "grouped" | "byProvider" | "byStatus" | "hybrid";

const PROVIDER_GROUPS: { key: string; labelKey: string; types: string[] }[] = [
  { key: "meta", labelKey: "channelGroupMeta", types: ["waba_oauth", "instagram_oauth", "facebook_oauth", "waba", "instagram", "instagram_oauth", "messenger", "messenger_oauth", "dialog360", "gupshup"] },
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

// Tipos de canal (aparelho conectado por QR) que podem transportar o modo híbrido
// coexistência — espelha HYBRID_TRANSPORT_TYPES do backend.
const HYBRID_TRANSPORT_TYPES = ["baileys", "zapo", "whatsapp", "meow", "evo", "evogo", "zapi", "uazapi"];

export default function SessoesPage() {
  const allowed = usePageAccess("sessoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const t = useTranslations("sessoesPage");
  const tErrors = useTranslations("errors");
  const tHijack = useTranslations("channelHijack");
  const waLink = useWaLinkPopup();
  const [channels, setChannels] = useState<Whatsapp[]>([]);
  const [catStatus, setCatStatus] = useState<{
    mode: "disabled" | "monitor" | "enforce";
    graceRemainingDays: number | null;
    needsAttention: number;
    withoutCat: number;
    expired: number;
    expiringSoon: number;
    withoutCatList: { id: number; name: string; type: string }[];
    expiredList: { id: number; name: string; type: string }[];
    expiringSoonList: { id: number; name: string; type: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState<QueueOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [chatFlows, setChatFlows] = useState<ChatFlow[]>([]);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(DEFAULT_INTEGRATION_SETTINGS);
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const { sortedData: sortedChannels } = useSortable(
    channels as unknown as Record<string, unknown>[],
    "name"
  );

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  // Dialog360/Gupshup: fluxo de onboarding usa dialog dedicado (popup OAuth + manual)
  // ao invés do form genérico — replaceOrphanId deleta canal vazio pré-existente
  // após onboarding bem-sucedido (caso usuário tenha criado via form genérico antes).
  const [dialog360CreateOpen, setDialog360CreateOpen] = useState(false);
  const [gupshupCreateOpen, setGupshupCreateOpen] = useState(false);
  const [replaceOrphanId, setReplaceOrphanId] = useState<number | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Whatsapp | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrChannel, setQrChannel] = useState<Whatsapp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Whatsapp | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [unlinkHybridTarget, setUnlinkHybridTarget] = useState<Whatsapp | null>(null);
  const [unlinkingHybrid, setUnlinkingHybrid] = useState(false);
  const [wavoipItem, setWavoipItem] = useState<Whatsapp | null>(null);
  const [wavoipStatuses, setWavoipStatuses] = useState<Record<string, string>>({});
  const [wavoipLoading, setWavoipLoading] = useState<Record<string, boolean>>({});
  const [transferTarget, setTransferTarget] = useState<Whatsapp | null>(null);
  const [transferNewChannelId, setTransferNewChannelId] = useState<string>("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [diagnoseTarget, setDiagnoseTarget] = useState<Whatsapp | null>(null);
  const [registerPinTarget, setRegisterPinTarget] = useState<Whatsapp | null>(null);
  const [webhookInfoTarget, setWebhookInfoTarget] = useState<Whatsapp | null>(null);
  const pendingDiagnoseIdRef = useRef<number | null>(null);

  // Connect loading — id do canal sendo conectado (license check + connect em andamento)
  const [connectingId, setConnectingId] = useState<number | null>(null);
  // Disconnect loading — id do canal sendo desconectado
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  // Phase 16 — YouTube: dialog "qual app usar?" antes de abrir popup OAuth.
  const [ytAppChoiceItem, setYtAppChoiceItem] = useState<Whatsapp | null>(null);
  // Tenant-level toggle (superadmin /tenants): quando "disabled", esconde a opcao
  // "Usar app Google da plataforma" e bypassa o dialog de escolha do YouTube.
  const platformGoogleAppEnabled =
    useAuthStore((s) => s.getConfigValue("enablePlatformGoogleApp")) !== "disabled";
  // QR loading — id do canal verificando licenca antes de gerar novo QR
  const [qrLoadingId, setQrLoadingId] = useState<number | null>(null);

  // Hijack takeover — mostrado quando o proxy retorna 409 (canal ja vinculado a outra instalacao)
  const [hijackState, setHijackState] = useState<MetaProxyHijackPayload | null>(null);
  const [hijackLoading, setHijackLoading] = useState(false);
  const [hijackPendingRetry, setHijackPendingRetry] = useState<(() => void) | null>(null);

  // Widget generation (webchat)
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [widgetSandboxOpen, setWidgetSandboxOpen] = useState(false);
  const [widgetCode, setWidgetCode] = useState("");
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetCopying, setWidgetCopying] = useState(false);
  const [websocketToken, setWebsocketToken] = useState("");
  const sandboxIframeRef = useRef<HTMLIFrameElement>(null);
  const [widgetPendingItem, setWidgetPendingItem] = useState<Whatsapp | null>(null);
  const [enableMenuButtons, setEnableMenuButtons] = useState(false);

  const { user, hasPermission } = useAuthStore();

  // Criar/editar/excluir canal exige sessions_manage no backend (whatsappRoutesZPRO).
  // Sem esconder o CTA aqui, um perfil custom sem a permission só descobriria o 403
  // DENTRO do popup do oauth-proxy, fora do app — sem toast e sem explicação.
  // Perfis legados mantêm o comportamento de sempre (hasPermission => true).
  const canManageSessions =
    user?.profile !== "custom" || hasPermission("sessions_manage");
  const tenantId = user?.tenantId;
  const [tenantMetaToken, setTenantMetaToken] = useState("");

  // Auto-reconnect via query param (toast "Reconectar" no header redireciona pra ca)
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoReconnectTriggered = useRef(false);

  // `force = true` fura o cache/coalescing TTL 1500ms do fetchWhatsapps —
  // usar APENAS em refetch imediato pós-mutação (mount/polling ficam sem force).
  const loadChannels = useCallback(async (force = false) => {
    try {
      const { data } = await fetchWhatsapps(force);
      const list = Array.isArray(data) ? data : [];
      setChannels(list);
      // Self-healing: gupshup/dialog360 sem profilePic ou com nome autogerado
      // → dispara enrich no backend (best-effort, não bloqueia).
      const stale = list.filter(
        (c: any) =>
          (c.type === "gupshup" || c.type === "dialog360") &&
          (!c.profilePic || /^(Gupshup|Dialog360)\s/.test(c.name || ""))
      );
      for (const c of stale) {
        api
          .post(`/bsp/enrich-profile/${c.id}`)
          .catch(() => {
            // silencioso — boot scan no backend cobre o caso de falha
          });
      }
    } catch {
      toast.error(t("errorLoadingChannels"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCATStatus = useCallback(async () => {
    try {
      const { data } = await fetchCATStatus();
      setCatStatus({
        mode: data.mode,
        graceRemainingDays: data.graceRemainingDays,
        needsAttention: data.needsAttention,
        withoutCat: data.channels.withoutCat,
        expired: data.channels.expired,
        expiringSoon: data.channels.expiringSoon,
        withoutCatList: data.channels.withoutCatList ?? [],
        expiredList: data.channels.expiredList ?? [],
        expiringSoonList: data.channels.expiringSoonList ?? [],
      });
    } catch {
      // Silencioso — se falhar, nao mostra banner
    }
  }, []);

  const scrollToChannel = useCallback((id: number) => {
    const el = document.getElementById(`session-card-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 2000);
  }, []);

  useEffect(() => {
    loadChannels();
    loadCATStatus();

    fetchQueues()
      .then(({ data }) => setQueues(data as QueueOpt[]))
      .catch(() => { toast.error(tErrors("loadFailed")); });

    fetchAllUsers()
      .then((res) => {
        const raw = (res.data?.users || []) as UserOpt[];
        setUsers(raw.map((u: UserOpt) => ({ id: u.id, name: u.name })));
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });

    fetchChatFlows()
      .then((res) => {
        const raw = Array.isArray(res.data)
          ? res.data
          : (res.data as { chatFlow?: ChatFlow[]; chatFlows?: ChatFlow[] })?.chatFlow
            ?? (res.data as { chatFlows?: ChatFlow[] })?.chatFlows
            ?? [];
        setChatFlows(
          raw
            .map((c: ChatFlow) => ({ id: c.id, name: c.name, isActive: (c as { isActive?: boolean }).isActive }))
            .sort((a: ChatFlow, b: ChatFlow) => a.name.localeCompare(b.name, "pt-BR"))
        );
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });

    if (tenantId) {
      fetchTenantById(tenantId)
        .then(({ data }) => {
          const d = Array.isArray(data) ? data[0] : data;
          setTenantMetaToken((d as any)?.metaToken || "");
          setWebsocketToken((d as any)?.websocketToken || "");
        })
        .catch(() => {});
    }

    fetchSettings()
      .then(({ data }) => {
        const settings: { key: string; value: string }[] = Array.isArray(data)
          ? data
          : (data as { settings?: { key: string; value: string }[] })?.settings || [];
        const get = (key: string) => settings.find((s) => s.key === key)?.value === "enabled";
        setIntegrationSettings({
          chatgpt: get("chatgpt"),
          typebot: get("typebot"),
          dify: get("dify"),
          n8n: get("n8n"),
          ollama: get("ollama"),
          lm: get("lm"),
          grok: get("grok"),
          gemini: get("gemini"),
          deepseek: get("deepseek"),
          qwen: get("qwen"),
          claude: get("claude"),
          dialogflow: get("dialogflow"),
        });
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, [loadChannels]);

  // Dispatch sessions status update to sidebar badge
  useEffect(() => {
    if (channels.length > 0) {
      const online = channels.filter(w => w.status === "CONNECTED").length;
      window.dispatchEvent(new CustomEvent("sessionsStatusUpdate", {
        detail: { online, total: channels.length }
      }));
    }
  }, [channels]);

  // Auto-trigger OAuth quando vier do toast "Reconectar" do header
  // (?reconnect=gmail&id=N ou ?reconnect=youtube&id=N).
  // Para canais Meta (waba/instagram/messenger) e demais OAuth de canal
  // (mercadolivre/linkedin/tiktok/olx): apenas scroll + highlight no card,
  // ja que a reconexao exige botao do usuario (Embedded Signup do FB SDK
  // ou popup OAuth proprio do canal).
  const SCROLL_ONLY_RECONNECT_SERVICES = new Set([
    "waba",
    "instagram",
    "messenger",
    "mercadolivre",
    "linkedin",
    "tiktok",
    "olx",
  ]);
  useEffect(() => {
    if (autoReconnectTriggered.current) return;
    if (loading) return;
    if (!channels.length) return;
    const reconnectSvc = searchParams.get("reconnect");
    const idStr = searchParams.get("id");
    if (!reconnectSvc) return;
    const id = idStr ? Number(idStr) : NaN;
    if (!id || Number.isNaN(id)) return;
    const channel = channels.find((c) => c.id === id);
    if (!channel) return;

    if (SCROLL_ONLY_RECONNECT_SERVICES.has(reconnectSvc)) {
      autoReconnectTriggered.current = true;
      scrollToChannel(id);
      router.replace("/sessoes");
      return;
    }

    if (reconnectSvc !== "gmail" && reconnectSvc !== "youtube") return;
    autoReconnectTriggered.current = true;

    (async () => {
      try {
        if (reconnectSvc === "gmail") {
          const { data } = await api.get(`/gauth/gmail/${id}/start`);
          const authUrl = (data as { authUrl?: string })?.authUrl;
          if (authUrl) {
            const w = 600, h = 700;
            const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
            const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
            window.open(authUrl, "gmail_oauth", `width=${w},height=${h},left=${left},top=${top},popup=yes`);
          } else {
            toast.error(t("oauth2AuthError"));
          }
        } else {
          const { data } = await api.get(`/yt-oauth/auth-url/${id}`);
          const authUrl = (data as { authUrl?: string })?.authUrl;
          if (authUrl) {
            window.open(authUrl, "youtube_oauth", "width=600,height=700");
          } else {
            toast.error(t("oauth2AuthError"));
          }
        }
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          t("oauth2StartError");
        toast.error(msg);
      } finally {
        router.replace("/sessoes");
      }
    })();
  }, [loading, channels, searchParams, router, t, scrollToChannel]);

  // Silent auto-refresh do CAT — cobre o gap de ate 6h entre o ticket entrar
  // na janela de expiracao e o cron backend rodar. Feito so no client que
  // abrir /sessoes (nao sobrecarrega o proxy) e so uma vez por canal por
  // sessao de pagina (ref persiste ate reload).
  const silentCatRefreshedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!channels.length) return;
    const now = Date.now();
    const threshold = CAT_RENEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const expiring = channels.filter((w) => {
      if (silentCatRefreshedRef.current.has(w.id)) return false;
      if (!CAT_CHANNEL_TYPES.includes(String(w.type))) return false;
      if (w.webhookOrigin === "zdg_oauth") return false;
      const exp = w.activationTicketExpiresAt;
      if (!exp) return false;
      const diffMs = new Date(exp).getTime() - now;
      if (diffMs <= 0) return false;
      return diffMs < threshold;
    });
    if (!expiring.length) return;
    expiring.forEach((w, idx) => {
      silentCatRefreshedRef.current.add(w.id);
      setTimeout(() => {
        refreshActivationTicket(w.id)
          .then(({ data }) => {
            setChannels((prev) =>
              prev.map((c) =>
                c.id === w.id
                  ? {
                      ...c,
                      activationTicketExpiresAt: data?.activationTicketExpiresAt ?? c.activationTicketExpiresAt,
                      activationTicketPid: data?.activationTicketPid ?? c.activationTicketPid,
                    }
                  : c
              )
            );
          })
          .catch(() => {});
      }, idx * 400);
    });
  }, [channels]);

  // Keep qrChannel in sync with channels list (for status updates)
  useEffect(() => {
    if (qrChannel) {
      const updated = channels.find((c) => c.id === qrChannel.id);
      if (updated) setQrChannel(updated);
    }
  }, [channels, qrChannel]);

  // Poll channels every 3s while QR modal is open so it auto-closes on CONNECTED
  useEffect(() => {
    if (!qrModalOpen) return;
    const interval = setInterval(loadChannels, 3000);
    return () => clearInterval(interval);
  }, [qrModalOpen, loadChannels]);

  // Real-time session status updates via socket (mirrors Vue: ${tenantId}:whatsappSession)
  useEffect(() => {
    if (!tenantId) return;
    const socket = getSocket();
    const handleSession = (data: { action: string; session: Partial<Whatsapp> & { id: number } }) => {
      if (data.action !== "update" || !data.session?.id) return;
      setChannels((prev) =>
        prev.map((c) => c.id === data.session.id ? { ...c, ...data.session } : c)
      );
    };
    // Phase 16 — escuta erros detalhados de StartWhatsAppSession (ex: SMTP host obrigatorio)
    const handleSessionError = (data: { whatsappId: number; type: string; error: string }) => {
      if (!data?.error) return;
      const channel = (data.type || "canal").toUpperCase();
      toast.error(`${channel}: ${data.error}`);
    };
    // Migracao para SQLite abortada no backend -> canal revertido para 'files'
    // (sessao preservada, sem novo QR). Toast informativo + reflete no toggle local.
    const handleAuthStoreFallback = (data: { whatsappId: number }) => {
      toast.warning(t("baileysAuthStoreFallbackKeptFiles"));
      if (data?.whatsappId) {
        setChannels((prev) =>
          prev.map((c) => c.id === data.whatsappId ? { ...c, baileysAuthStore: "files" } : c)
        );
      }
    };
    socket.on(`${tenantId}:whatsappSession`, handleSession);
    socket.on(`${tenantId}:whatsappSessionError`, handleSessionError);
    socket.on(`${tenantId}:baileysAuthStoreFallback`, handleAuthStoreFallback);
    return () => {
      socket.off(`${tenantId}:whatsappSession`, handleSession);
      socket.off(`${tenantId}:whatsappSessionError`, handleSessionError);
      socket.off(`${tenantId}:baileysAuthStoreFallback`, handleAuthStoreFallback);
    };
  }, [tenantId]);

  // Listener de popup OAuth Meta — limpa flag webhookNeedsRevalidation no state
  // local quando o popup fecha com sucesso (backend ja e notificado via
  // confirmWebhookRevalidation pelo ChannelModal).
  useEffect(() => {
    function onPopupMsg(event: MessageEvent) {
      if (!event.data) return;
      const type = event.data.type;
      if (
        type === "waba:webhook:setup:success" ||
        type === "instagram:webhook:setup:success" ||
        type === "messenger:webhook:setup:success"
      ) {
        const wid = Number(event.data.whatsappId) || pendingDiagnoseIdRef.current;
        if (wid) {
          setChannels((prev) =>
            prev.map((w) => w.id === wid ? { ...w, webhookNeedsRevalidation: false } : w)
          );
          // Auto-diagnose: aguarda commit no proxy + Meta antes de pulsar Graph API
          window.setTimeout(() => {
            setChannels((prev) => {
              const ch = prev.find((w) => w.id === wid) || null;
              if (ch) setDiagnoseTarget(ch);
              return prev;
            });
            pendingDiagnoseIdRef.current = null;
          }, 1500);
        }
      }
    }
    window.addEventListener("message", onPopupMsg);
    return () => window.removeEventListener("message", onPopupMsg);
  }, []);

  // Listener compartilhado para hijack do registry em popups OAuth dos canais
  // ML / OLX / LinkedIn / TikTok. Backend retorna HTML com `postMessage` shape
  // `{ type: "X-oauth-hijack", details, identifier, callbackUrl }` quando
  // detecta que o canal ja esta registrado em outra instalacao do zpro.
  useEffect(() => {
    function onHijackMsg(event: MessageEvent) {
      const data = event.data as any;
      if (!data || typeof data.type !== "string") return;
      const m = data.type.match(/^(ml|olx|linkedin|tiktok|messenger|instagram)-oauth-hijack$/);
      if (!m) return;
      const channelMap: Record<string, string> = {
        ml: "mercadolivre", olx: "olx", linkedin: "linkedin", tiktok: "tiktok",
        messenger: "messenger", instagram: "instagram",
      };
      setHijackState({
        channel:      channelMap[m[1]] || data.details?.channel || "",
        errorCode:    data.details?.errorCode    || "ALREADY_REGISTERED",
        apiUrlMasked: data.details?.apiUrlMasked || "***",
        registeredAt: data.details?.registeredAt ?? null,
        identifier:   data.identifier   ?? null,
        callbackUrl:  data.callbackUrl  ?? null,
      });
      // Apos confirmar takeover, recarrega canais — usuario provavelmente
      // precisa reabrir o popup OAuth para finalizar a conexao com tokens
      // (servico salva tokens antes do registry, entao o canal pode ficar
      // CONNECTED imediatamente em alguns casos).
      setHijackPendingRetry(() => () => loadChannels(true));
    }
    window.addEventListener("message", onHijackMsg);
    return () => window.removeEventListener("message", onHijackMsg);
  }, []);

  // Listener page-level pra gupshup:manual:success / dialog360:manual:success.
  // O dialog dedicado já escuta, mas se o usuario fechar antes do popup terminar,
  // o canal seria criado e a lista nao recarregaria. Aqui pegamos no nivel da
  // pagina e disparamos loadChannels() incondicionalmente.
  useEffect(() => {
    function onManualSuccess(event: MessageEvent) {
      const data = event.data as {
        type?: string;
        payload?: { whatsappId?: number; error?: string };
      };
      if (!data?.type) return;
      if (
        data.type === "gupshup:manual:success" ||
        data.type === "dialog360:manual:success"
      ) {
        loadChannels(true);
      }
    }
    window.addEventListener("message", onManualSuccess);
    return () => window.removeEventListener("message", onManualSuccess);
  }, []);

  // Detecta token Meta expirado (Messenger/IG/WABA) — mostra toast acionavel
  // para admin revalidar webhook. Backend emite esse evento quando detecta
  // 401/OAuthException code 190/102 nas chamadas Graph.
  useEffect(() => {
    if (!tenantId) return;
    const socket = getSocket();
    const handleTokenExpired = (data: {
      whatsappId: number;
      channel: "messenger" | "instagram" | "waba";
      message: string;
    }) => {
      const channel = channels.find((c) => c.id === data.whatsappId);
      const channelName = channel?.name || `#${data.whatsappId}`;
      toast.error(
        t("tokenExpiredToast", { name: channelName }),
        {
          duration: 10000,
          action: {
            label: t("revalidateWebhook"),
            onClick: () => {
              if (channel) {
                handleWebhook(channel, data.channel);
              }
            },
          },
        }
      );
    };
    socket.on(`${tenantId}:whatsapp:tokenExpired`, handleTokenExpired);
    return () => { socket.off(`${tenantId}:whatsapp:tokenExpired`, handleTokenExpired); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, channels]);

  function handleEdit(item: Whatsapp) {
    setSelectedChannel(item);
    setModalOpen(true);
  }

  function handleNew() {
    setSelectedChannel(null);
    setModalOpen(true);
  }

  async function handleHijackConfirm() {
    if (!hijackState?.identifier || !hijackState?.callbackUrl) {
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
  }

  async function handleConnect(item: Whatsapp) {
    setConnectingId(item.id);
    try {

    // Dialog360/Gupshup órfãos (criados via form genérico antes do gate): Whatsapp
    // existe mas falta a linha em Dialog360Channels/GupshupChannels com apiKey/appToken.
    // Dialog360: tokenAPI é setado pelo onboarding, ausência = órfão.
    // Gupshup: confirma via GET /gupshup/channels/{whatsappId} (404 = sem GupshupChannel).
    if (item.type === "dialog360" && !item.tokenAPI) {
      setReplaceOrphanId(item.id);
      setDialog360CreateOpen(true);
      setConnectingId(null);
      return;
    }
    if (item.type === "gupshup") {
      try {
        await getGupshupChannel(item.id);
      } catch (err: any) {
        if (err?.status === 404 || err?.response?.status === 404) {
          setReplaceOrphanId(item.id);
          setGupshupCreateOpen(true);
          setConnectingId(null);
          return;
        }
      }
    }

    // Instagram: conectar = registrar webhook no proxy (valida licenca no backend)
    if (item.type === "instagram") {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const tenantIdVal = user?.tenantId;
      try {
        await setInstagramWebhookAgain({
          wabaId: item.wabaId,
          tokenAPI: item.tokenAPI,
          wabaVersion: item.wabaVersion || "v19.0",
          wabaToken: item.bmToken,
          overrideCallbackUri: `${apiUrl}/instagramWebhook/${tenantIdVal}`,
          verifyToken: tenantMetaToken,
          facebookPageId: item.fbPageId && item.fbPageId !== item.tokenAPI ? item.fbPageId : undefined,
        });
        toast.success(t("connectingChannel"));
        setTimeout(loadChannels, 1500);
      } catch (err: any) {
        // api.ts interceptor rejects with error.response (Axios Response object), so .status/.data direct
        const status = err?.status ?? err?.response?.status;
        const d      = err?.data   ?? err?.response?.data;
        if (status === 409) {
          setHijackState({
            channel:      d?.channel      || "instagram",
            errorCode:    d?.errorCode    || "ALREADY_REGISTERED",
            apiUrlMasked: d?.existing?.apiUrlMasked || "***",
            registeredAt: d?.existing?.registeredAt ?? null,
            identifier:   d?.identifier  || item.wabaId || item.tokenAPI || null,
            callbackUrl:  d?.callbackUrl || `${apiUrl}/instagramWebhook/${tenantIdVal}` || null,
          });
          setHijackPendingRetry(() => () => handleConnect(item));
          return;
        }
        const detail = d?.error || err?.message;
        toast.error(detail ? `${t("errorConnecting")}: ${detail}` : t("errorConnecting"));
      }
      return;
    }

    // Messenger: conectar = registrar webhook no proxy (valida licenca no backend)
    if (item.type === "messenger") {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const tenantIdVal = user?.tenantId;
      try {
        await setMessengerWebhookAgain({
          wabaId: (item as any).fbPageId || item.wabaId,
          wabaVersion: item.wabaVersion || "v19.0",
          wabaToken: item.bmToken,
          overrideCallbackUri: `${apiUrl}/messengerWebhook/${tenantIdVal}`,
          verifyToken: tenantMetaToken,
        });
        toast.success(t("connectingChannel"));
        setTimeout(loadChannels, 1500);
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status;
        const d      = err?.data   ?? err?.response?.data;
        if (status === 409) {
          setHijackState({
            channel:      d?.channel      || "messenger",
            errorCode:    d?.errorCode    || "ALREADY_REGISTERED",
            apiUrlMasked: d?.existing?.apiUrlMasked || "***",
            registeredAt: d?.existing?.registeredAt ?? null,
            identifier:   d?.identifier  || (item as any).fbPageId || item.wabaId || null,
            callbackUrl:  d?.callbackUrl || `${apiUrl}/messengerWebhook/${tenantIdVal}` || null,
          });
          setHijackPendingRetry(() => () => handleConnect(item));
          return;
        }
        const detail = d?.error || err?.message;
        toast.error(detail ? `${t("errorConnecting")}: ${detail}` : t("errorConnecting"));
      }
      return;
    }

    // LinkedIn usa OAuth — abrir URL de autorizacao (licenca validada no backend via oauthInit)
    if (item.type === "linkedin") {
      try {
        const { data } = await api.get(`/linkedin-oauth/auth-url/${item.id}`);
        if (data?.authUrl) {
          window.open(data.authUrl, "linkedin_oauth", "width=600,height=700");
          toast.success(t("linkedinOauthOpened" as any) || "Janela de autorizacao LinkedIn aberta");
          setTimeout(loadChannels, 5000);
        } else {
          toast.error(t("linkedinOauthError" as any) || "Erro ao gerar URL OAuth LinkedIn.");
        }
      } catch {
        toast.error(t("linkedinOauthError" as any) || "Erro ao conectar com LinkedIn. Verifique se o App LinkedIn esta configurado em /app-linkedin.");
      }
      return;
    }

    // Mercado Livre usa OAuth — abrir URL de autorizacao (licenca validada via oauthInit)
    if (item.type === "mercadolivre") {
      try {
        const { data } = await api.get(`/ml-oauth/auth-url/${item.id}`);
        if (data?.authUrl) {
          window.open(data.authUrl, "_blank", "width=600,height=700");
          toast.success(t("mlOauthOpened" as any) || "Janela de autorizacao ML aberta");
          setTimeout(loadChannels, 5000);
        } else {
          toast.error(t("mlOauthError" as any) || "Erro ao gerar URL OAuth ML. Verifique a configuracao do App Mercado Livre.");
        }
      } catch {
        toast.error(t("mlOauthError" as any) || "Erro ao conectar com Mercado Livre. Verifique se o App ML esta configurado.");
      }
      return;
    }

    // OLX usa OAuth — abrir URL de autorizacao (licenca validada via oauthInit)
    if (item.type === "olx") {
      try {
        const { data } = await api.get(`/olx-oauth/auth-url/${item.id}`);
        if (data?.authUrl) {
          window.open(data.authUrl, "olx_oauth", "width=600,height=700");
          toast.success(t("olxOauthOpened" as any) || "Janela de autorizacao OLX aberta");
          setTimeout(loadChannels, 5000);
        } else {
          toast.error(t("olxOauthError" as any) || "Erro ao gerar URL OAuth OLX.");
        }
      } catch {
        toast.error(t("olxOauthError" as any) || "Erro ao conectar com OLX. Verifique se o App OLX esta configurado em /app-olx.");
      }
      return;
    }

    // YouTube usa OAuth — Phase 16: abre dialog para escolher app (plataforma vs proprio).
    // Se o tenant desativou platform via /tenants, vai direto pro app proprio sem dialog.
    if (item.type === "youtube") {
      if (!platformGoogleAppEnabled) {
        try {
          const { data } = await api.get(`/yt-oauth/auth-url/${item.id}`);
          if (data?.authUrl) {
            window.open(data.authUrl, "youtube_oauth", "width=600,height=700");
            toast.success(t("ytOauthOpened" as any) || "Janela de autorizacao YouTube aberta");
            setTimeout(loadChannels, 5000);
          } else {
            toast.error(t("ytOauthError" as any) || "Erro ao conectar com YouTube. Verifique se o App YouTube esta configurado em /app-youtube.");
          }
        } catch {
          toast.error(t("ytOauthError" as any) || "Erro ao conectar com YouTube. Verifique se o App YouTube esta configurado em /app-youtube.");
        } finally {
          setConnectingId(null);
        }
        return;
      }
      setYtAppChoiceItem(item);
      setConnectingId(null); // dialog vai retomar quando user escolher
      return;
    }

    // TikTok usa OAuth — abrir URL de autorizacao (licenca validada via oauthInit)
    if (item.type === "tiktok") {
      try {
        const { data } = await api.get(`/tt-oauth/auth-url/${item.id}`);
        if (data?.authUrl) {
          window.open(data.authUrl, "tiktok_oauth", "width=600,height=700");
          toast.success(t("ttOauthOpened" as any) || "Janela de autorizacao TikTok aberta");
          setTimeout(loadChannels, 5000);
        } else {
          toast.error(t("ttOauthError" as any) || "Erro ao gerar URL OAuth TikTok.");
        }
      } catch {
        toast.error(t("ttOauthError" as any) || "Erro ao conectar com TikTok. Verifique se o App TikTok esta configurado em /app-tiktok.");
      }
      return;
    }

    // Todos os demais canais (evo, meow, zapi, uazapi, waba, telegram, etc.):
    // verificar licenca no proxy antes de iniciar a conexao
    try {
      await checkLicenseProxy();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      return;
    }

    try {
      await connectSession(item.id);
      toast.success(t("connectingChannel"));
      setTimeout(loadChannels, 1500);
    } catch {
      toast.error(t("errorConnecting"));
    }

    } finally {
      setConnectingId(null);
    }
  }

  async function handleDisconnect(item: Whatsapp) {
    setDisconnectingId(item.id);
    try {
      await disconnectSession(item.id);
      toast.success(t("channelDisconnected"));
      setTimeout(loadChannels, 1500);
    } catch {
      toast.error(t("errorDisconnecting"));
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleQrCode(item: Whatsapp) {
    setQrLoadingId(item.id);
    try {
      await checkLicenseProxy();
    } catch (licErr: any) {
      const msg = (licErr as any)?.response?.data?.message || (licErr as any)?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      setQrLoadingId(null);
      return;
    }
    setQrLoadingId(null);
    try {
      await requestNewQrCode(item.id);
    } catch {
      // QR may arrive via socket even if request fails
    }
    setQrChannel(item);
    setQrModalOpen(true);
    setTimeout(loadChannels, 2000);
  }

  async function handleSetDefault(item: Whatsapp) {
    // Toggle: se já é o padrão, desmarca (tenant fica sem canal padrão); senão, marca.
    const makeDefault = !item.isDefault;
    try {
      await setDefaultWhatsapp(item.id, makeDefault);
      toast.success(makeDefault ? t("channelSetDefault") : t("channelUnsetDefault"));
      loadChannels(true);
    } catch {
      toast.error(t("errorSetDefault"));
    }
  }

  async function handleCloseOpen(item: Whatsapp) {
    try {
      await closeAllOpenTickets(item.id);
      toast.success(t("openTicketsClosed"));
    } catch {
      toast.error(t("errorClosingOpenTickets"));
    }
  }

  async function handleClosePending(item: Whatsapp) {
    try {
      await closeAllPendingTickets(item.id);
      toast.success(t("pendingTicketsClosed"));
    } catch {
      toast.error(t("errorClosingPendingTickets"));
    }
  }

  // Dialog state para alterar origem do canal
  const [originChangeTarget, setOriginChangeTarget] = useState<Whatsapp | null>(null);
  const [originChangeValue, setOriginChangeValue] = useState<"own_app" | "zdg_oauth">("own_app");
  const [originChangeLoading, setOriginChangeLoading] = useState(false);
  // Trava de re-clique no menu "Registrar Webhooks" (canal woocommerce). Guarda o
  // id do Whatsapp em registro pra desabilitar so o item daquele card especifico.
  const [registeringWooId, setRegisteringWooId] = useState<number | null>(null);

  function handleChangeOrigin(item: Whatsapp) {
    setOriginChangeTarget(item);
    // Pre-seleciona a origem ATUAL do canal para mostrar o estado atual ao admin.
    // Confirm fica disabled ate ele trocar para a outra opcao.
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
    setOriginChangeLoading(true);
    try {
      const { data } = await updateWebhookOrigin(targetId, valueCtx);
      const needsRevalidation = !!data?.needsRevalidation;
      setChannels((prev) =>
        prev.map((w) => w.id === targetId
          ? { ...w, webhookOrigin: originChangeValue, webhookNeedsRevalidation: needsRevalidation }
          : w)
      );
      if (needsRevalidation) {
        toast.warning(t("webhookOriginUpdatedPendingRevalidation", { name: targetName }), {
          action: {
            label: t("revalidateWebhook"),
            onClick: () => {
              const channel = channels.find((c) => c.id === targetId);
              if (channel) handleRevalidateByChannel(channel);
            },
          },
          duration: 10000,
        });
      } else {
        toast.success(t("webhookOriginUpdated"));
      }
      setOriginChangeTarget(null);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const d      = err?.data   ?? err?.response?.data;
      const code   = d?.error;
      // Tenta extrair a mensagem real da Meta de dentro de `detail` (que vem
      // como string JSON do Graph API, ex: {"message":"Any of the pages_*..."})
      const extractMetaMessage = (raw: unknown): string => {
        if (!raw) return "";
        if (typeof raw === "object" && (raw as any)?.message) return String((raw as any).message);
        if (typeof raw !== "string") return "";
        try {
          const parsed = JSON.parse(raw);
          return parsed?.message || raw;
        } catch {
          return raw;
        }
      };
      if (status === 403 && code === "LICENSE_INVALID") {
        toast.error(t("webhookOriginLicenseInvalid"));
      } else if (status === 409 && code === "HIJACK") {
        // Abre o dialog de takeover reutilizando o fluxo existente.
        // Retry executa a propria troca de origem apos o takeover concluir.
        setHijackState({
          channel:      d?.channel      || "waba",
          errorCode:    d?.errorCode    || "ALREADY_REGISTERED",
          apiUrlMasked: d?.existing?.apiUrlMasked || "***",
          registeredAt: d?.existing?.registeredAt ?? null,
          identifier:   d?.identifier   ?? null,
          callbackUrl:  d?.callbackUrl  ?? null,
        });
        setHijackPendingRetry(() => () => confirmChangeOrigin());
        setOriginChangeTarget(null);
      } else if (status === 403 && code === "MISSING_PAGE_SCOPES") {
        // Token do canal nao tem scopes de Page (pages_messaging, pages_show_list,
        // pages_manage_metadata). Unica saida e reconectar via OAuth — oferecer
        // botao de revalidar webhook que ja dispara o popup OAuth correto por canal.
        toast.error(t("webhookOriginMissingPageScopes"), {
          action: {
            label: t("revalidateWebhook"),
            onClick: () => {
              const channel = channels.find((c) => c.id === targetId);
              if (channel) handleRevalidateByChannel(channel);
            },
          },
          duration: 12000,
        });
      } else if (code === "META_OVERRIDE_FAILED") {
        const metaMsg = extractMetaMessage(d?.detail);
        toast.error(metaMsg ? `${t("webhookOriginMetaFailed")}: ${metaMsg}` : t("webhookOriginMetaFailed"));
      } else if (code === "PROXY_UNREACHABLE") {
        toast.error(t("webhookOriginProxyUnreachable"));
      } else if (!status && (err?.code === "ERR_NETWORK" || err?.message === "Network Error")) {
        // Sem status nem body — backend inalcancavel, gateway cortou ou CORS bloqueou
        // a leitura da resposta de erro. Mensagem dedicada com hint de diagnostico.
        toast.error(t("webhookOriginNetworkError"));
      } else {
        // Erro estruturado generico — prioriza detail (mensagem humana) sobre code
        const detail = (typeof d?.detail === "string" && d.detail) || code || err?.message;
        toast.error(detail ? `${t("webhookOriginUpdateFailed")}: ${detail}` : t("webhookOriginUpdateFailed"));
      }
    } finally {
      setOriginChangeLoading(false);
    }
  }

  /**
   * Atalho do menu da sessao para registrar webhooks WooCommerce. Resolve a
   * AppWooCommerce.id pela storeUrl (= Whatsapp.wabaId no canal woocommerce)
   * e dispara o mesmo endpoint que /configuracoes/app-woocommerce usa.
   */
  async function handleRegisterWooWebhooks(item: Whatsapp) {
    if (registeringWooId === item.id) return; // ja em andamento — ignora re-clique
    setRegisteringWooId(item.id);
    // Toast persistente substitui o feedback no menu (Radix fecha o dropdown
    // ao clicar no item, entao spinner inline fica invisivel).
    const tid = toast.loading(t("registeringWooWebhooks"));
    try {
      if (item.type === "nuvemshop") {
        const { data } = await fetchAppNuvemshops();
        const list = Array.isArray(data) ? data : ((data as any)?.data || (data as any)?.items || []);
        const storeKey = String((item as any).wabaId || "");
        const target = (list as any[]).find((c) => String(c.storeId || "") === storeKey);
        if (!target?.id) {
          toast.error(t("wooConfigNotFound"), { id: tid });
          return;
        }
        const { data: regData } = await registerNuvemshopWebhooks(target.id);
        if (regData?.ok) {
          toast.success(t("wooWebhooksRegistered", { count: regData.registered || 0 }), { id: tid });
          if (regData?.proxyRegistered === false) {
            toast.warning(t("wooWebhooksProxyMissing"), { duration: 12000 });
          }
        } else {
          toast.error(t("wooWebhooksError"), { id: tid });
        }
        return;
      }
      const { data } = await fetchAppWooCommerces();
      const list = Array.isArray(data) ? data : ((data as any)?.data || (data as any)?.items || []);
      const wabaUrl = String((item as any).wabaId || "").replace(/\/$/, "").toLowerCase();
      const target = (list as any[]).find((c) =>
        String(c.storeUrl || "").replace(/\/$/, "").toLowerCase() === wabaUrl
      );
      if (!target?.id) {
        toast.error(t("wooConfigNotFound"), { id: tid });
        return;
      }
      const { data: regData } = await registerWooCommerceWebhooks(target.id);
      if (regData?.ok) {
        toast.success(t("wooWebhooksRegistered", { count: regData.webhooks?.length || 0 }), { id: tid });
        if (regData?.proxyRegistered === false) {
          toast.warning(t("wooWebhooksProxyMissing"), { duration: 12000 });
        }
      } else {
        toast.error(t("wooWebhooksError"), { id: tid });
      }
    } catch (err: any) {
      // 409 HIJACK: shop ja registrado em outra instalacao. Abre HijackTakeoverDialog
      // — mesmo dialog reutilizado dos canais Meta. Apos confirmar, retry da
      // funcao executa o registro de novo (agora ja apropriado este install).
      const status = err?.response?.status;
      const d = err?.response?.data;
      if (status === 409 && d?.hijack) {
        toast.dismiss(tid);
        setHijackState({
          channel:      d.channel      || "woocommerce",
          errorCode:    d.errorCode    || "SHOP_ALREADY_REGISTERED",
          apiUrlMasked: d.existing?.apiUrlMasked || "***",
          registeredAt: d.existing?.registeredAt ?? null,
          identifier:   d.identifier   ?? null,
          callbackUrl:  d.callbackUrl  ?? null,
        });
        setHijackPendingRetry(() => () => handleRegisterWooWebhooks(item));
        return;
      }
      toast.error(err?.response?.data?.message || t("wooWebhooksError"), { id: tid });
    } finally {
      setRegisteringWooId(null);
    }
  }

  /**
   * Dispara o popup OAuth apropriado conforme o tipo do canal (waba/instagram/
   * messenger), reusando os mesmos handlers que abrem o popup direto dos cards.
   */
  function handleRevalidateByChannel(item: Whatsapp) {
    const type = String(item.type).toLowerCase();
    if (type === "waba") {
      handleWebhook(item, "waba");
    } else if (type === "instagram") {
      handleWebhook(item, "instagram");
    } else if (type === "messenger") {
      handleWebhook(item, "messenger");
    }
  }

  async function handleRefreshActivationTicket(item: Whatsapp) {
    try {
      await checkLicenseProxy();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      return;
    }

    try {
      const { data } = await refreshActivationTicket(item.id);
      // Atualizar canal na lista local
      setChannels((prev) =>
        prev.map((w) =>
          w.id === item.id
            ? {
                ...w,
                activationTicketExpiresAt: data?.activationTicketExpiresAt ?? w.activationTicketExpiresAt,
                activationTicketPid:       data?.activationTicketPid       ?? w.activationTicketPid,
                activationTicketError:     null,
              }
            : w
        )
      );
      toast.success(t("activationTicketRenewed"));
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const detail = err?.data?.error ?? err?.response?.data?.error ?? err?.message;
      if (status === 403) {
        toast.error(t("activationTicketLicenseInvalid"));
      } else {
        toast.error(detail ? `${t("activationTicketRenewFailed")}: ${detail}` : t("activationTicketRenewFailed"));
      }
    }
  }

  async function handleWebhook(item: Whatsapp, action: string) {
    // Coexistencia: solicita sync de historico/contatos do WhatsApp Business App
    // (POST smb_app_data) — dados chegam em minutos via webhooks history/smb_app_state_sync
    if (action === "smbsynchistory" || action === "smbsynccontacts") {
      try {
        await requestSmbAppDataSync({
          whatsappId: item.id,
          syncType: action === "smbsynchistory" ? "history" : "smb_app_state_sync",
        });
        toast.success(t("smbSyncRequested"));
      } catch (err: any) {
        const detail = err?.data?.error ?? err?.response?.data?.error ?? err?.message;
        toast.error(detail ? `${t("smbSyncFailed")}: ${detail}` : t("smbSyncFailed"));
      }
      return;
    }

    // License check serverside antes de qualquer revalidacao de webhook
    try {
      await checkLicenseProxy();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      return;
    }

    // Loading spinner enquanto o backend chama o proxy e devolve o authUrl.
    // Popup OAuth (waba/instagram/messenger) tem delay perceptivel
    // entre o click e o window.open — o toast dismisse logo antes de abrir.
    const isOauthPopup = ["waba", "instagram", "messenger"].includes(action);
    const loadingToastId = isOauthPopup ? toast.loading(t("openingOauthPopup")) : null;
    if (isOauthPopup) pendingDiagnoseIdRef.current = item.id;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const tenantIdVal = user?.tenantId;
    try {
      if (action === "hub") await setHubWebhookAgain(item as unknown as Record<string, unknown>);
      else if (action === "evo") await setEvoWebhookAgain(item.wabaId || "", item as unknown as Record<string, unknown>);
      else if (action === "evogo") await setEvoGoWebhookAgain(item.wabaId || "", item as unknown as Record<string, unknown>);
      else if (action === "meow") await setMeowWebhookAgain(item.wabaId || "", item as unknown as Record<string, unknown>);
      else if (action === "zapi") await setZapiWebhookAgain(item.wabaId || "", item as unknown as Record<string, unknown>);
      else if (action === "uazapi") await setUazapiWebhookAgain(item.wabaId || "", item as unknown as Record<string, unknown>);
      else if (action === "waba") {
        // Fluxo A (popup OAuth) — mesma UX de /configuracoes/meta. O popup faz, numa
        // unica submissao (uma validacao de licenca), o webhook PRINCIPAL e o
        // SECUNDARIO (COEX) — o backend anexa os params do coex no state (mode=primary).
        const { data } = await api.get<{ authUrl?: string }>(
          `/wabametaOverrideCallbackUrl/auth-url?whatsappId=${item.id}&mode=primary`
        );
        if (loadingToastId) toast.dismiss(loadingToastId);
        if (data?.authUrl) {
          window.open(data.authUrl, "waba_webhook_setup", "width=560,height=480,scrollbars=yes,resizable=yes");
          return; // toast e disparado pelo listener postMessage
        } else {
          toast.error(t("errorRevalidatingWebhook"));
          return;
        }
      }
      else if (action === "instagram") {
        // Fluxo A (popup OAuth) — igual WABA. Backend nao toca bmToken.
        const { data } = await api.get<{ authUrl?: string }>(
          `/instagramMetaOverrideCallbackUrl/auth-url?whatsappId=${item.id}`
        );
        if (loadingToastId) toast.dismiss(loadingToastId);
        if (data?.authUrl) {
          window.open(data.authUrl, "instagram_webhook_setup", "width=560,height=480,scrollbars=yes,resizable=yes");
          return; // toast via listener postMessage
        } else {
          toast.error(t("errorRevalidatingWebhook"));
          return;
        }
      }
      else if (action === "messenger") {
        const { data } = await api.get<{ authUrl?: string }>(
          `/messengerMetaOverrideCallbackUrl/auth-url?whatsappId=${item.id}`
        );
        if (loadingToastId) toast.dismiss(loadingToastId);
        if (data?.authUrl) {
          window.open(data.authUrl, "messenger_webhook_setup", "width=560,height=480,scrollbars=yes,resizable=yes");
          return;
        } else {
          toast.error(t("errorRevalidatingWebhook"));
          return;
        }
      }
      if (loadingToastId) toast.dismiss(loadingToastId);
      toast.success(t("webhookRevalidated"));
    } catch (err: any) {
      if (loadingToastId) toast.dismiss(loadingToastId);
      // api.ts interceptor rejects with error.response (Axios Response object), so .status/.data direct
      const status = err?.status ?? err?.response?.status;
      const d      = err?.data   ?? err?.response?.data;
      if (status === 409 && (action === "instagram" || action === "messenger")) {
        const cbUrl = action === "instagram"
          ? `${apiUrl}/instagramWebhook/${tenantIdVal}`
          : `${apiUrl}/messengerWebhook/${tenantIdVal}`;
        setHijackState({
          channel:      d?.channel      || action,
          errorCode:    d?.errorCode    || "ALREADY_REGISTERED",
          apiUrlMasked: d?.existing?.apiUrlMasked || "***",
          registeredAt: d?.existing?.registeredAt ?? null,
          identifier:   d?.identifier  || (action === "messenger" ? (item as any).fbPageId || item.wabaId : item.wabaId || item.tokenAPI) || null,
          callbackUrl:  d?.callbackUrl || cbUrl || null,
        });
        setHijackPendingRetry(() => () => handleWebhook(item, action));
        return;
      }
      const detail = d?.error || err?.message;
      toast.error(detail ? `${t("errorRevalidatingWebhook")}: ${detail}` : t("errorRevalidatingWebhook"));
    }
  }

  function handleWavoip(item: Whatsapp) {
    setWavoipStatuses({});
    setWavoipLoading({});
    setWavoipItem(item);
  }

  function handleGenerateWidget(item: Whatsapp) {
    if (!tenantId || !websocketToken) {
      toast.error(t("widgetNoToken"));
      return;
    }
    setEnableMenuButtons(false);
    setWidgetPendingItem(item);
  }

  async function handleConfirmGenerate() {
    if (!widgetPendingItem || !tenantId) return;

    // License check serverside antes de gerar o widget
    try {
      await checkLicenseProxy();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      setWidgetPendingItem(null);
      return;
    }

    const wabaId = widgetPendingItem.wabaId || String(widgetPendingItem.id);
    setWidgetPendingItem(null);
    setWidgetLoading(true);
    try {
      const response = await getWebchatWidget(tenantId, wabaId, websocketToken, enableMenuButtons);
      const blob = response.data as Blob;

      // Download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `webchat-widget-${tenantId}-${wabaId}.js`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Show code in modal
      const text = await blob.text();
      setWidgetCode(text);
      setWidgetModalOpen(true);
      toast.success(t("widgetGenerated"));
    } catch {
      toast.error(t("widgetError"));
    } finally {
      setWidgetLoading(false);
    }
  }

  async function handleCopyWidgetCode() {
    setWidgetCopying(true);
    try {
      await navigator.clipboard.writeText(widgetCode);
      toast.success(t("widgetCopied"));
    } catch {
      toast.error(t("widgetCopyError"));
    } finally {
      setWidgetCopying(false);
    }
  }

  function handleOpenSandbox() {
    setWidgetSandboxOpen(true);
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
  }

  async function handleCheckWavoipStatus(item: Whatsapp) {
    if (!item.wavoipToken) return;
    const tokens = item.wavoipToken.split(",").map((tk) => tk.trim()).filter(Boolean);
    for (const token of tokens) {
      setWavoipLoading((prev) => ({ ...prev, [token]: true }));
      try {
        const res = await fetch(`https://devices.wavoip.com/${token}/whatsapp/all_info`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        const status = String(json?.result?.status ?? json?.status ?? json?.data?.status ?? "").toLowerCase().trim();
        setWavoipStatuses((prev) => ({ ...prev, [token]: status || "error" }));
      } catch {
        setWavoipStatuses((prev) => ({ ...prev, [token]: "error" }));
      } finally {
        setWavoipLoading((prev) => ({ ...prev, [token]: false }));
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeletingChannel(true);
    try {
      await deleteWhatsapp(deleteTarget.id);
      const typeLabel = t(CHANNEL_TYPES.find(c => c.value === deleteTarget.type)?.labelKey as any || "channelDeleted");
      toast.success(t("channelDeletedType", { type: typeLabel }));
      loadChannels(true);
    } catch {
      toast.error(t("errorDeletingChannel"));
    } finally {
      setDeletingChannel(false);
      setDeleteTarget(null);
    }
  }

  async function handleUnlinkHybrid() {
    if (!unlinkHybridTarget) return;
    setUnlinkingHybrid(true);
    try {
      // Envia type (canal WABA) junto dos campos híbridos: o controller de update
      // faz whatsappData.type.includes('hub_') e quebrava com payload sem type
      // (o backend também tem guard, mas isso mantém compatível sem rebuild do back).
      await updateWhatsapp(unlinkHybridTarget.id, {
        type: unlinkHybridTarget.type,
        hybridMode: "disabled",
        linkedChannelId: null,
      });
      toast.success(t("hybridUnlinkSuccess"));
      loadChannels(true);
    } catch {
      toast.error(t("hybridUnlinkError"));
    } finally {
      setUnlinkingHybrid(false);
      setUnlinkHybridTarget(null);
    }
  }

  async function handleTransferChannel() {
    if (!transferTarget) return;
    if (!transferNewChannelId) {
      toast.error(t("transferChannelNoChannel"));
      return;
    }
    const newChannel = channels.find((c) => String(c.id) === transferNewChannelId);
    if (!newChannel) return;
    setTransferLoading(true);
    try {
      await transferAllTicketsChannel({
        whatsappId: transferTarget.id,
        newWhatsappId: newChannel.id,
        channel: transferTarget.type,
        newChannel: newChannel.type,
        tenantId: transferTarget.tenantId as number,
      });
      toast.success(t("transferChannelQueued"));
      setTransferTarget(null);
      setTransferNewChannelId("");
    } catch {
      toast.error(t("transferChannelError"));
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleRequestNewQr(channel: Whatsapp) {
    setQrLoadingId(channel.id);
    try {
      await checkLicenseProxy();
    } catch (licErr: any) {
      const msg = (licErr as any)?.response?.data?.message || (licErr as any)?.message;
      toast.error(msg ? `${t("licenseCheckFailed")}: ${msg}` : t("licenseCheckFailed"));
      setQrLoadingId(null);
      return;
    }
    setQrLoadingId(null);
    try {
      await requestNewQrCode(channel.id);
      toast.success(t("newQrRequested"));
      setQrChannel(channel);
      setQrModalOpen(true);
      setTimeout(loadChannels, 2000);
    } catch {
      toast.error(t("errorRequestingQr"));
    }
  }

  // Conectar via WhatsApp Web (baileys): abre o popup do conector, importa as
  // credenciais e o canal conecta sem QR. O status chega pelo socket; o
  // loadChannels() no onSuccess e apenas reforco.
  function handleWaLink(item: Whatsapp) {
    // Evolution: o import via WhatsApp Web depende do sidecar injector configurado
    // (Configuracoes -> Evolution). Indica proativamente antes de abrir o fluxo.
    if (item.type === "evo") {
      toast.info(t("waLinkEvoNeedsInjector"));
    }
    // Evolution Go: idem, com o sidecar proprio (Configuracoes -> Evolution Go).
    if (item.type === "evogo") {
      toast.info(t("waLinkEvoGoNeedsInjector"));
    }
    waLink.open({
      whatsappId: item.id,
      onSuccess: () => {
        toast.success(t("waLinkSuccess"));
        loadChannels(true);
      },
      onError: (code) => {
        if (code === "POPUP_BLOCKED") {
          toast.error(t("waLinkPopupBlocked"));
        } else if (code === "LICENSE") {
          toast.error(t("waLinkLicenseError"));
        } else if (code === "INIT_FAILED") {
          toast.error(t("waLinkInitError"));
        } else {
          toast.error(t("waLinkImportError"));
        }
      },
      onCancelled: () => {
        toast.info(t("waLinkCancelled"));
      },
    });
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            ],
          }}
        >
          <Button onClick={handleNew} className="gap-1" disabled={!canManageSessions}>
            <Plus className="w-4 h-4" />
            {t("addChannel")}
          </Button>
        </PageHeader>

        {/* Banner CAT status — so aparece quando ha canais precisando de atencao
            ou proximos da transicao monitor->enforce */}
        {catStatus && catStatus.needsAttention > 0 && (
          <div className={cn(
            "rounded-md border p-3 text-sm flex items-start gap-2",
            catStatus.expired > 0 || catStatus.withoutCat > 0
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
          )}>
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold mb-0.5">
                {t("catBannerTitle", { count: catStatus.needsAttention })}
              </div>
              <div className="text-xs opacity-90">
                {catStatus.withoutCat > 0 && <span className="mr-3">{t("catBannerWithoutCat", { count: catStatus.withoutCat })}</span>}
                {catStatus.expired > 0 && <span className="mr-3">{t("catBannerExpired", { count: catStatus.expired })}</span>}
                {catStatus.expiringSoon > 0 && <span>{t("catBannerExpiringSoon", { count: catStatus.expiringSoon })}</span>}
              </div>
              {(catStatus.withoutCatList.length > 0 || catStatus.expiredList.length > 0 || catStatus.expiringSoonList.length > 0) && (
                <div className="mt-2 space-y-1">
                  {catStatus.withoutCatList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-medium opacity-80">{t("catBannerListWithoutCat")}</span>
                      {catStatus.withoutCatList.map((c) => (
                        <button
                          key={`wc-${c.id}`}
                          type="button"
                          onClick={() => scrollToChannel(c.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-[11px] hover:bg-current/10 transition-colors"
                          title={`#${c.id} · ${c.type}`}
                        >
                          <span className="font-medium truncate max-w-[180px]">{c.name || `#${c.id}`}</span>
                          <span className="opacity-70">#{c.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {catStatus.expiredList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-medium opacity-80">{t("catBannerListExpired")}</span>
                      {catStatus.expiredList.map((c) => (
                        <button
                          key={`exp-${c.id}`}
                          type="button"
                          onClick={() => scrollToChannel(c.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-[11px] hover:bg-current/10 transition-colors"
                          title={`#${c.id} · ${c.type}`}
                        >
                          <span className="font-medium truncate max-w-[180px]">{c.name || `#${c.id}`}</span>
                          <span className="opacity-70">#{c.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {catStatus.expiringSoonList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] font-medium opacity-80">{t("catBannerListExpiringSoon")}</span>
                      {catStatus.expiringSoonList.map((c) => (
                        <button
                          key={`soon-${c.id}`}
                          type="button"
                          onClick={() => scrollToChannel(c.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-[11px] hover:bg-current/10 transition-colors"
                          title={`#${c.id} · ${c.type}`}
                        >
                          <span className="font-medium truncate max-w-[180px]">{c.name || `#${c.id}`}</span>
                          <span className="opacity-70">#{c.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {catStatus.mode === "monitor" && catStatus.graceRemainingDays !== null && (
                <div className="text-xs opacity-75 mt-1">
                  {t("catBannerGraceRemaining", { days: Math.max(0, Math.ceil(catStatus.graceRemainingDays)) })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sort / Group toolbar */}
        {!loading && channels.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">{t("viewMode")}</span>
            {(["default","alpha","byType","grouped","byProvider","byStatus","hybrid"] as SortMode[]).map((m) => {
              const labels: Record<SortMode, { label: string; icon: React.ReactNode }> = {
                default:    { label: t("sortDefault"),      icon: <Layers2 className="w-3 h-3" /> },
                alpha:      { label: t("sortAlpha"),        icon: <ArrowDownAZ className="w-3 h-3" /> },
                byType:     { label: t("sortByType"),       icon: <Tag className="w-3 h-3" /> },
                grouped:    { label: t("sortGrouped"),      icon: <Layers2 className="w-3 h-3" /> },
                byProvider: { label: t("sortByProvider"),   icon: <Building2 className="w-3 h-3" /> },
                byStatus:   { label: t("sortByStatus"),     icon: <Signal className="w-3 h-3" /> },
                hybrid:     { label: t("sortHybrid"),       icon: <Link2 className="w-3 h-3" /> },
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
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t("noChannelConfigured")}
            description={t("noChannelDescription")}
            steps={[
              { number: 1, title: t("emptyStep1") },
              { number: 2, title: t("emptyStep2") },
              { number: 3, title: t("emptyStep3") },
            ]}
          >
            <Button onClick={handleNew} className="gap-1" disabled={!canManageSessions}>
              <Plus className="w-4 h-4" />
              {t("addChannel")}
            </Button>
          </EmptyState>
        ) : (() => {
          const sorted = [...(sortedChannels as unknown as Whatsapp[])].sort((a, b) => {
            if (sortMode === "alpha") return a.name.localeCompare(b.name, "pt-BR");
            if (sortMode === "byType" || sortMode === "grouped") {
              const tc = a.type.localeCompare(b.type, "pt-BR");
              return tc !== 0 ? tc : a.name.localeCompare(b.name, "pt-BR");
            }
            if (sortMode === "byProvider") {
              const pa = PROVIDER_GROUPS.indexOf(getProviderGroup(a.type));
              const pb = PROVIDER_GROUPS.indexOf(getProviderGroup(b.type));
              return pa !== pb ? pa - pb : a.name.localeCompare(b.name, "pt-BR");
            }
            if (sortMode === "byStatus") {
              const sa = STATUS_GROUPS.indexOf(getStatusGroup(a.status));
              const sb = STATUS_GROUPS.indexOf(getStatusGroup(b.status));
              const ia = sa === -1 ? STATUS_GROUPS.length : sa;
              const ib = sb === -1 ? STATUS_GROUPS.length : sb;
              return ia !== ib ? ia - ib : a.name.localeCompare(b.name, "pt-BR");
            }
            return 0;
          });

          if (sortMode === "grouped") {
            const groups = sorted.reduce<Record<string, Whatsapp[]>>((acc, ch) => {
              const key = ch.type || "outros";
              (acc[key] = acc[key] || []).push(ch);
              return acc;
            }, {});
            const typeLabel = (type: string) => {
              const found = CHANNEL_TYPES.find((c) => c.value === type);
              return found ? t(found.labelKey as Parameters<typeof t>[0]) : type;
            };

            return (
              <div className="space-y-6">
                {Object.entries(groups).map(([t, items]) => (
                  <div key={t}>
                    <div className="flex items-center gap-2 mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getChannelLogo(t)}
                        alt={t}
                        className="w-5 h-5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {typeLabel(t)}
                      </h3>
                      <span className="text-xs text-muted-foreground">({items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {items.map((ch) => (
                        <SessionCard
                          key={ch.id}
                          item={ch}
                          queues={queues}
                          users={users}
                          chatFlows={chatFlows}
                          allChannels={channels}
                          onEdit={handleEdit}
                          onDelete={setDeleteTarget}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          onQrCode={handleQrCode}
                          onSetDefault={handleSetDefault}
                          onCloseOpen={handleCloseOpen}
                          onClosePending={handleClosePending}
                          onWebhook={handleWebhook}
                          onWavoip={handleWavoip}
                          onTransferChannel={setTransferTarget}
                          onGenerateWidget={handleGenerateWidget}
                          onRefreshActivationTicket={handleRefreshActivationTicket}
                          onChangeOrigin={handleChangeOrigin}
                          onRegisterWooWebhooks={handleRegisterWooWebhooks}
                          onDiagnose={setDiagnoseTarget}
                          onRegisterPin={setRegisterPinTarget}
                          onShowWebhookInfo={setWebhookInfoTarget}
                          onWaLink={handleWaLink}
                          onUnlinkHybrid={setUnlinkHybridTarget}
                          isRegisteringWoo={registeringWooId === ch.id}
                          isConnecting={connectingId === ch.id}
                          isQrLoading={qrLoadingId === ch.id}
                          isDisconnecting={disconnectingId === ch.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          if (sortMode === "byProvider") {
            return (
              <div className="space-y-6">
                {PROVIDER_GROUPS.map((pg) => {
                  const items = sorted.filter((ch) => getProviderGroup(ch.type).key === pg.key);
                  if (!items.length) return null;
                  return (
                    <div key={pg.key}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          {t(pg.labelKey as Parameters<typeof t>[0])}
                        </h3>
                        <span className="text-xs text-muted-foreground">({items.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((ch) => (
                          <SessionCard
                            key={ch.id}
                            item={ch}
                            queues={queues}
                            users={users}
                            chatFlows={chatFlows}
                            allChannels={channels}
                            onEdit={handleEdit}
                            onDelete={setDeleteTarget}
                            onConnect={handleConnect}
                            onDisconnect={handleDisconnect}
                            onQrCode={handleQrCode}
                            onSetDefault={handleSetDefault}
                            onCloseOpen={handleCloseOpen}
                            onClosePending={handleClosePending}
                            onWebhook={handleWebhook}
                            onWavoip={handleWavoip}
                            onTransferChannel={setTransferTarget}
                            onGenerateWidget={handleGenerateWidget}
                          onRefreshActivationTicket={handleRefreshActivationTicket}
                          onChangeOrigin={handleChangeOrigin}
                          onRegisterWooWebhooks={handleRegisterWooWebhooks}
                          onDiagnose={setDiagnoseTarget}
                          onRegisterPin={setRegisterPinTarget}
                          onShowWebhookInfo={setWebhookInfoTarget}
                          onWaLink={handleWaLink}
                          onUnlinkHybrid={setUnlinkHybridTarget}
                          isRegisteringWoo={registeringWooId === ch.id}
                          isConnecting={connectingId === ch.id}
                          isQrLoading={qrLoadingId === ch.id}
                          isDisconnecting={disconnectingId === ch.id}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (sortMode === "byStatus") {
            const statusGroups = STATUS_GROUPS.map((sg) => ({
              ...sg,
              items: sorted.filter((ch) => (ch.status || "").toLowerCase() === sg.key),
            })).filter((sg) => sg.items.length > 0);
            const unknown = sorted.filter((ch) => !STATUS_GROUPS.some((sg) => sg.key === (ch.status || "").toLowerCase()));
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {sg.items.map((ch) => (
                        <SessionCard
                          key={ch.id}
                          item={ch}
                          queues={queues}
                          users={users}
                          chatFlows={chatFlows}
                          allChannels={channels}
                          onEdit={handleEdit}
                          onDelete={setDeleteTarget}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          onQrCode={handleQrCode}
                          onSetDefault={handleSetDefault}
                          onCloseOpen={handleCloseOpen}
                          onClosePending={handleClosePending}
                          onWebhook={handleWebhook}
                          onWavoip={handleWavoip}
                          onTransferChannel={setTransferTarget}
                          onGenerateWidget={handleGenerateWidget}
                          onRefreshActivationTicket={handleRefreshActivationTicket}
                          onChangeOrigin={handleChangeOrigin}
                          onRegisterWooWebhooks={handleRegisterWooWebhooks}
                          onDiagnose={setDiagnoseTarget}
                          onRegisterPin={setRegisterPinTarget}
                          onShowWebhookInfo={setWebhookInfoTarget}
                          onWaLink={handleWaLink}
                          onUnlinkHybrid={setUnlinkHybridTarget}
                          isRegisteringWoo={registeringWooId === ch.id}
                          isConnecting={connectingId === ch.id}
                          isQrLoading={qrLoadingId === ch.id}
                          isDisconnecting={disconnectingId === ch.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {unknown.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("statusGroupDisconnected" as Parameters<typeof t>[0])}
                      </h3>
                      <span className="text-xs text-muted-foreground">({unknown.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {unknown.map((ch) => (
                        <SessionCard
                          key={ch.id}
                          item={ch}
                          queues={queues}
                          users={users}
                          chatFlows={chatFlows}
                          allChannels={channels}
                          onEdit={handleEdit}
                          onDelete={setDeleteTarget}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                          onQrCode={handleQrCode}
                          onSetDefault={handleSetDefault}
                          onCloseOpen={handleCloseOpen}
                          onClosePending={handleClosePending}
                          onWebhook={handleWebhook}
                          onWavoip={handleWavoip}
                          onTransferChannel={setTransferTarget}
                          onGenerateWidget={handleGenerateWidget}
                          onRefreshActivationTicket={handleRefreshActivationTicket}
                          onChangeOrigin={handleChangeOrigin}
                          onRegisterWooWebhooks={handleRegisterWooWebhooks}
                          onDiagnose={setDiagnoseTarget}
                          onRegisterPin={setRegisterPinTarget}
                          onShowWebhookInfo={setWebhookInfoTarget}
                          onWaLink={handleWaLink}
                          onUnlinkHybrid={setUnlinkHybridTarget}
                          isRegisteringWoo={registeringWooId === ch.id}
                          isConnecting={connectingId === ch.id}
                          isQrLoading={qrLoadingId === ch.id}
                          isDisconnecting={disconnectingId === ch.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (sortMode === "hybrid") {
            // Agrupa cada WABA hibrido junto do(s) seu(s) canal(is) de transporte
            // (linkedChannelId). Papeis mutuamente exclusivos: WABA nunca e
            // transporte e vice-versa. Demais canais caem em "rest".
            const renderCard = (ch: Whatsapp, keyPrefix: string) => (
              <SessionCard
                key={`${keyPrefix}${ch.id}`}
                item={ch}
                queues={queues}
                users={users}
                chatFlows={chatFlows}
                allChannels={channels}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onQrCode={handleQrCode}
                onSetDefault={handleSetDefault}
                onCloseOpen={handleCloseOpen}
                onClosePending={handleClosePending}
                onWebhook={handleWebhook}
                onWavoip={handleWavoip}
                onTransferChannel={setTransferTarget}
                onGenerateWidget={handleGenerateWidget}
                onRefreshActivationTicket={handleRefreshActivationTicket}
                onChangeOrigin={handleChangeOrigin}
                onRegisterWooWebhooks={handleRegisterWooWebhooks}
                onDiagnose={setDiagnoseTarget}
                onRegisterPin={setRegisterPinTarget}
                onShowWebhookInfo={setWebhookInfoTarget}
                onWaLink={handleWaLink}
                onUnlinkHybrid={setUnlinkHybridTarget}
                isRegisteringWoo={registeringWooId === ch.id}
                isConnecting={connectingId === ch.id}
                isQrLoading={qrLoadingId === ch.id}
                isDisconnecting={disconnectingId === ch.id}
              />
            );

            const hybridWabas = sorted.filter(
              (ch) => ch.type === "waba" && !!ch.hybridMode && ch.hybridMode !== "disabled"
            );
            const clusters = hybridWabas.map((waba) => ({
              waba,
              members: [
                waba,
                ...sorted.filter((ch) => ch.id !== waba.id && ch.id === waba.linkedChannelId),
              ],
            }));
            const clusteredIds = new Set(clusters.flatMap((c) => c.members.map((m) => m.id)));
            const rest = sorted.filter((ch) => !clusteredIds.has(ch.id));
            const modeLabel = (mode?: string | null) =>
              mode === "coexistence" ? t("hybridModeCoexistence") : t("hybridModeTwoNumbers");

            return (
              <div className="space-y-6">
                {clusters.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("hybridViewEmpty")}</p>
                )}
                {clusters.map(({ waba, members }) => (
                  <div
                    key={`hyb-${waba.id}`}
                    className="rounded-xl border border-dashed border-muted-foreground/30 p-3"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {waba.name}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {t("hybridBadge")} · {modeLabel(waba.hybridMode as string)} ({members.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {members.map((ch) => renderCard(ch, `hyb-${waba.id}-`))}
                    </div>
                  </div>
                ))}
                {rest.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("hybridViewRest")}
                      </h3>
                      <span className="text-xs text-muted-foreground">({rest.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {rest.map((ch) => renderCard(ch, "rest-"))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sorted.map((ch) => (
                <SessionCard
                  key={ch.id}
                  item={ch}
                  queues={queues}
                  users={users}
                  chatFlows={chatFlows}
                  allChannels={channels}
                  onEdit={handleEdit}
                  onDelete={setDeleteTarget}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onQrCode={handleQrCode}
                  onSetDefault={handleSetDefault}
                  onCloseOpen={handleCloseOpen}
                  onClosePending={handleClosePending}
                  onWebhook={handleWebhook}
                  onWavoip={handleWavoip}
                  onTransferChannel={setTransferTarget}
                  onGenerateWidget={handleGenerateWidget}
                  onRefreshActivationTicket={handleRefreshActivationTicket}
                  onChangeOrigin={handleChangeOrigin}
                          onRegisterWooWebhooks={handleRegisterWooWebhooks}
                          onDiagnose={setDiagnoseTarget}
                          onRegisterPin={setRegisterPinTarget}
                          onShowWebhookInfo={setWebhookInfoTarget}
                          onWaLink={handleWaLink}
                          onUnlinkHybrid={setUnlinkHybridTarget}
                          isRegisteringWoo={registeringWooId === ch.id}
                  isConnecting={connectingId === ch.id}
                  isQrLoading={qrLoadingId === ch.id}
                  isDisconnecting={disconnectingId === ch.id}
                />
              ))}
            </div>
          );
        })()}

        {/* Channel create/edit modal */}
        <ChannelModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initial={selectedChannel}
          queues={queues}
          users={users}
          chatFlows={chatFlows}
          onSaved={() => loadChannels(true)}
          onHijack={(payload, retry) => {
            setHijackState(payload);
            setHijackPendingRetry(retry ? () => retry : null);
          }}
          onAutoConnect={(whatsappId) => {
            const ch = channels.find((c) => c.id === whatsappId) || selectedChannel;
            if (ch) handleConnect(ch);
          }}
          onSpecialChannelType={(t) => {
            setReplaceOrphanId(null);
            if (t === "dialog360") setDialog360CreateOpen(true);
            else if (t === "gupshup") setGupshupCreateOpen(true);
          }}
          integrationSettings={integrationSettings}
          existingChannels={channels}
        />

        {/* Dialog360 onboarding (popup OAuth + manual) — usado tanto para criar
            quanto para "Conectar" canais órfãos. Após onCreated, deleta órfão
            (se houver) e recarrega lista. */}
        <Dialog360CreateChannelDialog
          open={dialog360CreateOpen}
          onOpenChange={(o) => {
            setDialog360CreateOpen(o);
            if (!o) setReplaceOrphanId(null);
          }}
          onCreated={async () => {
            if (replaceOrphanId) {
              try { await deleteWhatsapp(replaceOrphanId); } catch { /* ignore */ }
              setReplaceOrphanId(null);
            }
            loadChannels(true);
          }}
          defaultName={
            replaceOrphanId
              ? channels.find((c) => c.id === replaceOrphanId)?.name || ""
              : ""
          }
        />

        <GupshupCreateChannelDialog
          open={gupshupCreateOpen}
          onOpenChange={(o) => {
            setGupshupCreateOpen(o);
            if (!o) setReplaceOrphanId(null);
          }}
          onCreated={async () => {
            if (replaceOrphanId) {
              try { await deleteWhatsapp(replaceOrphanId); } catch { /* ignore */ }
              setReplaceOrphanId(null);
            }
            loadChannels(true);
          }}
          defaultName={
            replaceOrphanId
              ? channels.find((c) => c.id === replaceOrphanId)?.name || ""
              : ""
          }
        />

        {/* QR Code modal */}
        <QrCodeModal
          open={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
          channel={qrChannel}
          onRequestNew={handleRequestNewQr}
          isLoadingNewQr={qrLoadingId === qrChannel?.id}
        />

        {/* Delete confirm dialog */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o && !deletingChannel) setDeleteTarget(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("deleteChannelTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("deleteChannelMessage", { name: deleteTarget?.name ?? "" })}
            </p>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t("deleteChannelOrphanWarning")}
              </p>
            </div>
            {deleteTarget?.type === "webchat" &&
              ((deleteTarget as unknown as Record<string, unknown>).webchatConfig as
                | { directLinkEnabled?: boolean }
                | null
                | undefined)?.directLinkEnabled === true && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t("deleteDirectLinkWarning")}
                  </p>
                </div>
              )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingChannel}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deletingChannel}
                className="gap-1"
              >
                {deletingChannel && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Hybrid unlink confirm dialog */}
        <Dialog
          open={!!unlinkHybridTarget}
          onOpenChange={(o) => {
            if (!o && !unlinkingHybrid) setUnlinkHybridTarget(null);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("hybridUnlinkTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("hybridUnlinkMessage", { name: unlinkHybridTarget?.name ?? "" })}
            </p>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setUnlinkHybridTarget(null)}
                disabled={unlinkingHybrid}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleUnlinkHybrid}
                disabled={unlinkingHybrid}
                className="gap-1"
              >
                {unlinkingHybrid && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("hybridUnlink")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Channel transfer dialog */}
        <Dialog
          open={!!transferTarget}
          onOpenChange={(o) => {
            if (!o) { setTransferTarget(null); setTransferNewChannelId(""); }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("transferChannelTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t("transferChannelDesc1")}</p>
              <p>{t("transferChannelDesc2")}</p>
              <p>{t("transferChannelDesc3")}</p>
            </div>
            <div className="mt-2">
              <Select value={transferNewChannelId} onValueChange={setTransferNewChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("transferChannelSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {channels
                    .filter((c) => TRANSFER_CHANNEL_OPTIONS_TYPES.includes(c.type) && c.id !== transferTarget?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setTransferTarget(null); setTransferNewChannelId(""); }}>
                {t("cancel")}
              </Button>
              <Button onClick={handleTransferChannel} disabled={transferLoading}>
                {transferLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("transferChannelConfirmBtn")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* WaVoIP Tokens Modal */}
        <WavoipTokensModal
          item={wavoipItem}
          statuses={wavoipStatuses}
          loading={wavoipLoading}
          onClose={() => setWavoipItem(null)}
          onCheckStatus={handleCheckWavoipStatus}
        />

        {/* Widget Options Dialog (webchat) */}
        <Dialog open={!!widgetPendingItem} onOpenChange={(o) => !o && setWidgetPendingItem(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("generateWidget")} — {widgetPendingItem?.name}</DialogTitle>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="sessoes-enableMenuButtons"
                checked={enableMenuButtons}
                onCheckedChange={(v) => setEnableMenuButtons(!!v)}
              />
              <div className="space-y-0.5">
                <label htmlFor="sessoes-enableMenuButtons" className="text-sm font-medium leading-none cursor-pointer">
                  {t("enableMenuButtons")}
                </label>
                <p className="text-xs text-muted-foreground">{t("enableMenuButtonsDesc")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWidgetPendingItem(null)}>
                {t("cancelBtn")}
              </Button>
              <Button onClick={handleConfirmGenerate} disabled={widgetLoading}>
                <Download className={`mr-2 h-4 w-4 ${widgetLoading ? "animate-pulse" : ""}`} />
                {widgetLoading ? t("widgetGenerating") : t("generateWidget")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Widget Code Modal (webchat) */}
        <Dialog open={widgetModalOpen} onOpenChange={setWidgetModalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("widgetModalTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button onClick={handleCopyWidgetCode} disabled={widgetCopying} variant="outline">
                  <Copy className="mr-2 h-4 w-4" />
                  {widgetCopying ? t("widgetCopying") : t("widgetCopyCode")}
                </Button>
                <Button onClick={handleOpenSandbox} variant="outline">
                  <Play className="mr-2 h-4 w-4" />
                  {t("widgetSandbox")}
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
        <Dialog open={widgetSandboxOpen} onOpenChange={setWidgetSandboxOpen}>
          <DialogContent className="max-w-5xl w-[95vw] h-[95vh] max-h-[95vh] flex flex-col p-4">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{t("widgetSandboxTitle")}</DialogTitle>
            </DialogHeader>
            <iframe
              ref={sandboxIframeRef}
              className="flex-1 w-full rounded-lg border bg-white min-h-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="Widget Sandbox"
            />
          </DialogContent>
        </Dialog>

        {/* Phase 16 — YouTube: dialog "qual app usar" antes do popup OAuth */}
        <Dialog open={ytAppChoiceItem !== null} onOpenChange={(o) => { if (!o) setYtAppChoiceItem(null); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
            <DialogHeader>
              <DialogTitle>{t("ytChooseAppTitle" as any) || "Qual app Google usar?"}</DialogTitle>
              <DialogDescription className="whitespace-normal break-words">
                {t("ytChooseAppDesc" as any) || "Escolha qual app Google sera usado para autorizar este canal YouTube."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* TODO: reativar botao de app da plataforma quando sair de testes */}
              {false && (
              <Button
                variant="default"
                className="w-full justify-start h-auto py-3 whitespace-normal text-left"
                onClick={async () => {
                  const item = ytAppChoiceItem;
                  if (!item) return;
                  setYtAppChoiceItem(null);
                  try {
                    setConnectingId(item.id);
                    const { data } = await api.get(`/yt-oauth/auth-url/${item.id}?forceGlobal=true`);
                    if (data?.authUrl) {
                      window.open(data.authUrl, "youtube_oauth", "width=600,height=700");
                      toast.success(t("ytOauthOpened" as any) || "Janela de autorizacao YouTube aberta");
                      setTimeout(loadChannels, 5000);
                    } else {
                      toast.error(t("ytOauthError" as any) || "Erro ao gerar URL OAuth YouTube.");
                    }
                  } catch {
                    toast.error(t("ytOauthError" as any) || "Erro ao conectar com YouTube.");
                  } finally {
                    setConnectingId(null);
                  }
                }}
              >
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold">{t("googleAppPlatform" as any) || "Usar app Google da plataforma"}</span>
                  <span className="text-xs opacity-80 font-normal">{t("googleAppPlatformHint" as any) || "Conexao instantanea — sem cadastro no Google Cloud."}</span>
                </div>
              </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 whitespace-normal text-left"
                onClick={async () => {
                  const item = ytAppChoiceItem;
                  if (!item) return;
                  setYtAppChoiceItem(null);
                  try {
                    setConnectingId(item.id);
                    const { data } = await api.get(`/yt-oauth/auth-url/${item.id}`);
                    if (data?.authUrl) {
                      window.open(data.authUrl, "youtube_oauth", "width=600,height=700");
                      toast.success(t("ytOauthOpened" as any) || "Janela de autorizacao YouTube aberta");
                      setTimeout(loadChannels, 5000);
                    } else {
                      toast.error(t("ytOauthError" as any) || "Erro ao conectar com YouTube. Verifique se o App YouTube esta configurado em /app-youtube.");
                    }
                  } catch {
                    toast.error(t("ytOauthError" as any) || "Erro ao conectar com YouTube. Verifique se o App YouTube esta configurado em /app-youtube.");
                  } finally {
                    setConnectingId(null);
                  }
                }}
              >
                <div className="flex flex-col items-start text-left">
                  <span className="font-semibold">{t("googleAppOwn" as any) || "Usar meu proprio app Google"}</span>
                  <span className="text-xs opacity-80 font-normal">{t("googleAppOwnHint" as any) || "Quota separada, controle total. Voce precisa criar um projeto no Google Cloud Console."}</span>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setYtAppChoiceItem(null)}>
                {t("cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Hijack takeover — 409 canal ja vinculado a outra instalacao */}
        <HijackTakeoverDialog
          open={hijackState !== null}
          details={hijackState}
          loading={hijackLoading}
          onCancel={() => { if (!hijackLoading) { setHijackState(null); setHijackPendingRetry(null); } }}
          onConfirm={handleHijackConfirm}
        />

        <DiagnoseModal
          open={diagnoseTarget !== null}
          onOpenChange={(open) => { if (!open) setDiagnoseTarget(null); }}
          whatsappId={diagnoseTarget?.id ?? null}
          channelName={diagnoseTarget?.name}
          channelType={diagnoseTarget?.type}
          onRevalidated={(needsRevalidation) => {
            if (diagnoseTarget) {
              setChannels((prev) =>
                prev.map((w) => w.id === diagnoseTarget.id
                  ? { ...w, webhookNeedsRevalidation: needsRevalidation }
                  : w
                )
              );
            }
          }}
          onReconnect={() => {
            if (diagnoseTarget) {
              const action = diagnoseTarget.type === "waba" ? "waba"
                : diagnoseTarget.type === "instagram" ? "instagram"
                : "messenger";
              handleWebhook(diagnoseTarget, action);
            }
          }}
        />

        <RegisterPinDialog
          channel={registerPinTarget}
          open={registerPinTarget !== null}
          onOpenChange={(open) => { if (!open) setRegisterPinTarget(null); }}
          onSuccess={() => loadChannels(true)}
        />

        {/* Webhook info popup — Dialog360/Gupshup (Customer Account precisa
            configurar webhook manualmente no painel do BSP) */}
        <Dialog open={webhookInfoTarget !== null} onOpenChange={(open) => { if (!open) setWebhookInfoTarget(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Webhook info — {webhookInfoTarget?.name}</DialogTitle>
              <DialogDescription>
                URL pra colar no painel BSP + eventos a marcar + passo a passo.
              </DialogDescription>
            </DialogHeader>
            {webhookInfoTarget && (webhookInfoTarget.type === "dialog360" || webhookInfoTarget.type === "gupshup") && (
              <BspWebhookInfoCard
                channelType={webhookInfoTarget.type as "dialog360" | "gupshup"}
                whatsappId={Number(webhookInfoTarget.id)}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setWebhookInfoTarget(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de alteracao de origem do canal (Meta) */}
        <Dialog open={originChangeTarget !== null} onOpenChange={(open) => { if (!open && !originChangeLoading) setOriginChangeTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("changeWebhookOrigin")}</DialogTitle>
              <DialogDescription>
                {t("changeWebhookOriginDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground">
                {t("channel")}: <span className="font-semibold text-foreground">{originChangeTarget?.name}</span>
              </div>
              <RadioGroup value={originChangeValue} onValueChange={(v) => setOriginChangeValue(v as "own_app" | "zdg_oauth")}>
                <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                     onClick={() => setOriginChangeValue("own_app")}>
                  <RadioGroupItem value="own_app" id="origin-own" className="mt-1" />
                  <label htmlFor="origin-own" className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm">{t("webhookOriginOwnFull")}</div>
                    <div className="text-xs text-muted-foreground">{t("webhookOriginOwnHint")}</div>
                  </label>
                </div>
                <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                     onClick={() => setOriginChangeValue("zdg_oauth")}>
                  <RadioGroupItem value="zdg_oauth" id="origin-zdg" className="mt-1" />
                  <label htmlFor="origin-zdg" className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm">{t("webhookOriginZdgFull")}</div>
                    <div className="text-xs text-muted-foreground">{t("webhookOriginZdgHint")}</div>
                  </label>
                </div>
              </RadioGroup>
              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{t("changeWebhookOriginWarning")}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={originChangeLoading} onClick={() => setOriginChangeTarget(null)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={originChangeLoading || (originChangeTarget as Whatsapp | null)?.webhookOrigin === originChangeValue}
                onClick={() => confirmChangeOrigin()}
              >
                {originChangeLoading ? t("saving") : t("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
