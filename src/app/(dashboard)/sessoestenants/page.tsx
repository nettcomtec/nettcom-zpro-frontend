"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { KeywordChipsInput } from "@/components/keyword-chips-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useSortable } from "@/hooks/use-sortable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Wifi, MoreVertical, Trash2, RefreshCw, ChevronDown, ChevronRight, WifiOff, Activity, Layers, ShieldCheck, Plus, Pencil, Loader2, QrCode, ShieldAlert, Info, Star, XCircle, Timer, ArrowLeftRight, Stethoscope, Code, AlertTriangle, Download, Copy, Link2, Link2Off } from "lucide-react";
import { LidConsolidationDialog } from "@/components/configuracoes/lid-consolidation-dialog";
import { DiagnoseModal } from "@/components/sessoes/diagnose-modal";
import { FarewellMediaManager, FAREWELL_MEDIA_TYPES } from "@/components/sessoes/farewell-media-manager";
import { RegisterPinDialog } from "@/components/sessoes/register-pin-dialog";
import { BspWebhookInfoCard } from "@/components/sessoes/bsp-webhook-info-card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  fetchWhatsappsByTenant, deleteWhatsappTenant, createWhatsappTenant, updateWhatsappTenant,
  showWhatsappTenantSession, connectWhatsappTenantSession, requestQrCodeTenant, disconnectWhatsappTenantSession,
  setDefaultWhatsappTenant, closeAllOpenTenant, closeAllPendingTenant, transferChannelTenant,
  updateWebhookOriginTenant, refreshActivationTicketTenant, getMetaWebhookAuthUrlTenant,
  revalidateProviderWebhookTenant, getWidgetTenant,
  revalidateWhatsappTenantSession, getTenantBaileysCredsStatus,
} from "@/services/superadmin";
import { QRCodeSVG } from "qrcode.react";
import { fetchTenants } from "@/services/tenants";
import type { Whatsapp } from "@/services/whatsapp";
import { buildDirectLinkUrl } from "@/services/webchat";

// ─── Types ────────────────────────────────────────────────

interface Session {
  id: number;
  name: string;
  type: string;
  status: string;
  tenantId?: number;
  tenantName?: string;
  number?: string;
  isDefault?: boolean;
  proxyUrl?: string;
  proxyUser?: string;
  proxyPass?: string;
  tokenAPI?: string;
  wabaId?: string;
  bmToken?: string;
  wabaVersion?: string;
  appId?: string;
  tokenTelegram?: string;
  wppUser?: string;
  wavoipToken?: string;
  smtpConfig?: SmtpConfig;
  farewellMessage?: string;
  farewellMediaUrls?: string[];
  closeKeyWord?: string;
  sendEvaluation?: string;
  transcribeAudio?: string;
  transcribeAudioJson?: string;
  selfDistribute?: string;
  destroyMessage?: string;
  ignoreBussinesHours?: string;
  autoReassign?: string;
  autoReassignStatus?: string;
  autoReassignMethod?: string;
  autoReassignIntervalMinutes?: number;
  disableExternalIntegration?: string;
  waitProcessExternalInteraction?: string;
  webPush?: string;
  isActive?: boolean;
  channelWebhook?: string;
  channelWebhookUrl?: string;
  channelWebhookMessage?: string;
  rescueWindow?: string;
  rescueWindowMessage?: string;
  webhookOrigin?: string;
  webhookNeedsRevalidation?: boolean;
  activationTicketExpiresAt?: string | null;
  activationTicketPid?: string | null;
  // WebChat: link direto (undefined = backend antigo sem o campo — probe de capacidade)
  webchatConfig?: { directLinkEnabled?: boolean; [key: string]: unknown };
}

type SmtpConfig = {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user?: string; pass?: string };
  from?: string;
  replyTo?: string;
  imap?: { host?: string; port?: number; tls?: boolean };
  oauth2?: { client_id?: string; client_secret?: string; redirect_uri?: string };
};

interface TenantOption { id: number; name: string }
type GroupBy = "none" | "tenant" | "provider";

// ─── Constants ────────────────────────────────────────────

const BETA_CHANNEL_TYPES = ["mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "nuvemshop"];
// ── Tipos para ações de canal (espelha /sessoes) ──
const TRANSFER_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow", "waba", "dialog360", "gupshup", "instagram", "mercadolivre", "olx", "linkedin", "youtube", "tiktok", "woocommerce", "nuvemshop"];
const TRANSFER_CHANNEL_OPTIONS_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow", "waba"];
const CAT_CHANNEL_TYPES = ["waba", "dialog360", "gupshup", "instagram", "messenger", "evolution", "evo", "evogo", "zapi", "uazapi", "meow", "baileys", "zapo", "whatsapp"];
const CAT_RENEW_WINDOW_DAYS = 7;
function isHubType(type: string) {
  return type.includes("hub");
}
function needsActivationAction(item: Session): boolean {
  if (item.webhookOrigin === "zdg_oauth") return false;
  const expiresAt = item.activationTicketExpiresAt;
  if (!expiresAt) return true; // nao ativado ainda
  const exp = new Date(expiresAt).getTime();
  const now = Date.now();
  if (exp <= now) return true; // expirado
  const diffDays = (exp - now) / (24 * 60 * 60 * 1000);
  return diffDays < CAT_RENEW_WINDOW_DAYS; // expira em breve
}
const QR_TYPES = ["baileys", "zapo", "whatsapp", "meow", "evo", "evogo", "zapi", "uazapi"];
const WAVOIP_TYPES = ["whatsapp", "baileys", "meow", "evo", "evogo", "uazapi", "zapi"];
const META_RESCUE_TYPES = ["waba", "instagram", "messenger"];
const FAREWELL_TYPES = ["whatsapp","baileys","zapo","meow","evo","evogo","zapi","uazapi","waba","dialog360","gupshup","instagram","messenger","webchat","mercadolivre","olx","linkedin","youtube","tiktok","woocommerce","nuvemshop","telegram"];
const WABA_VERSIONS = ["v17.0","v18.0","v19.0","v20.0","v21.0","v22.0","v23.0","v24.0","v25.0","v26.0"];

const CHANNEL_GROUPS: { group: string; labelKey: string; types: { value: string; labelKey: string }[] }[] = [
  {
    group: "meta",
    labelKey: "channelGroupMeta",
    types: [
      { value: "waba", labelKey: "channelTypeWaba" },
      { value: "instagram", labelKey: "channelTypeInstagram" },
      { value: "messenger", labelKey: "channelTypeMessenger" },
    ],
  },
  {
    group: "unofficial",
    labelKey: "channelGroupUnofficial",
    types: [
      { value: "baileys", labelKey: "channelTypeBaileys" },
      { value: "whatsapp", labelKey: "channelTypeWwebjs" },
      { value: "evo", labelKey: "channelTypeEvo" },
      { value: "evogo", labelKey: "channelTypeEvogo" },
      { value: "meow", labelKey: "channelTypeMeow" },
      { value: "zapi", labelKey: "channelTypeZapi" },
      { value: "zapo", labelKey: "channelTypeZapo" },
      { value: "uazapi", labelKey: "channelTypeUazapi" },
    ],
  },
  {
    group: "outros",
    labelKey: "channelGroupOthers",
    types: [
      { value: "telegram", labelKey: "channelTypeTelegram" },
      { value: "webmail", labelKey: "channelTypeWebmail" },
      { value: "webchat", labelKey: "channelTypeWebchat" },
      { value: "hub", labelKey: "channelTypeHub" },
      { value: "mercadolivre", labelKey: "channelTypeMercadoLivre" },
      { value: "olx", labelKey: "channelTypeOLX" },
      { value: "linkedin", labelKey: "channelTypeLinkedIn" },
      { value: "youtube", labelKey: "channelTypeYouTube" },
      { value: "tiktok", labelKey: "channelTypeTikTok" },
      { value: "woocommerce", labelKey: "channelTypeWooCommerce" },
      { value: "nuvemshop", labelKey: "channelTypeNuvemshop" },
    ],
  },
];

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  CONNECTED: "success",
  DISCONNECTED: "destructive",
  OPENING: "warning",
  qrcode: "warning",
};

// ─── Empty form ────────────────────────────────────────────

function emptyForm() {
  return {
    name: "",
    type: "baileys",
    tenantId: "",
    isDefault: false,
    // Credentials
    tokenAPI: "",
    wabaId: "",
    bmToken: "",
    wabaVersion: "v21.0",
    appId: "",
    tokenTelegram: "",
    wppUser: "",
    wavoipToken: "",
    // SMTP
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: true,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpReplyTo: "",
    smtpImapHost: "",
    smtpImapPort: "993",
    smtpImapTls: true,
    smtpOAuth2ClientId: "",
    smtpOAuth2ClientSecret: "",
    // Meta rescue
    rescueWindow: "disabled",
    rescueWindowMessage: "",
    // Farewell
    farewellMessage: "",
    farewellMediaUrls: [] as string[],
    // Features
    closeKeyWord: "",
    sendEvaluation: "disabled",
    transcribeAudio: "disabled",
    transcribeAudioJson: "",
    selfDistribute: "disabled",
    destroyMessage: "disabled",
    ignoreBussinesHours: "disabled",
    autoReassign: "disabled",
    autoReassignStatus: "open,pending",
    autoReassignMethod: "R",
    autoReassignIntervalMinutes: 5,
    disableExternalIntegration: "disabled",
    waitProcessExternalInteraction: "enabled",
    webPush: "disabled",
    isActive: true,
    // Webhook
    channelWebhook: "disabled",
    channelWebhookUrl: "",
    channelWebhookMessage: "disabled",
    // Proxy
    proxyUrl: "",
    proxyUser: "",
    proxyPass: "",
    // Pairing toggle
    usePairingCode: false,
  };
}
type FormState = ReturnType<typeof emptyForm>;

// ─── CollapseSection ──────────────────────────────────────

function CollapseSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full text-sm font-semibold text-primary border-b border-border pb-1 mb-2 hover:opacity-80 transition-opacity"
        >
          <span>{title}</span>
          <ChevronDown className="w-4 h-4 transition-transform duration-200 flex-shrink-0" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 data-[state=closed]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ id, label, desc, checked, onCheckedChange }: { id: string; label: string; desc?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div>
        <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
    </div>
  );
}

// ─── Channel actions (mesmas ações de /sessoes, cross-tenant) ──────

interface ChannelActions {
  onSetDefault: (s: Session) => void;
  onCloseOpen: (s: Session) => void;
  onClosePending: (s: Session) => void;
  onWebhook: (s: Session, action: string) => void;
  onChangeOrigin: (s: Session) => void;
  onDiagnose: (s: Session) => void;
  onRegisterPin: (s: Session) => void;
  onShowWebhookInfo: (s: Session) => void;
  onTransferChannel: (s: Session) => void;
  onRefreshActivation: (s: Session) => void;
  onGenerateWidget: (s: Session) => void;
  onCopyDirectLink: (s: Session) => void;
  onToggleDirectLink: (s: Session) => void;
}

// ─── Revalidar sessão (item de dropdown, cross-tenant) ─────
// Componente próprio porque as linhas da tabela são renderizadas em map() e
// hooks não podem ser chamados dentro do map. Busca lazy se há creds para
// habilitar/esmaecer (sem creds → só QR).
function RevalidateTenantSessionMenuItem({
  session,
  tS,
}: {
  session: Session;
  tS: ReturnType<typeof useTranslations>;
}) {
  const [credsKnown, setCredsKnown] = useState(false);
  const [hasCreds, setHasCreds] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCredsKnown(false);
    getTenantBaileysCredsStatus(session.id)
      .then((res) => {
        if (cancelled) return;
        setHasCreds(Boolean(res.data?.hasCreds));
        setCredsKnown(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasCreds(false);
        setCredsKnown(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  async function handle() {
    setRevalidating(true);
    try {
      await revalidateWhatsappTenantSession(session.id);
      toast.success(tS("revalidatingSession"));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(tS("noCredsRevalidate"));
        setHasCreds(false);
      } else {
        toast.error(tS("errorConnecting"));
      }
    } finally {
      setRevalidating(false);
    }
  }

  return (
    <DropdownMenuItem
      onClick={handle}
      disabled={!hasCreds || revalidating || !credsKnown}
      title={credsKnown && !hasCreds ? tS("noCredsRevalidate") : undefined}
    >
      <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateSession")}
    </DropdownMenuItem>
  );
}

// ─── SessionsTable ────────────────────────────────────────

function SessionsTable({ sessions, t, onDelete, onEdit, onConnect, onViewQr, onDisconnect, actions }: {
  sessions: Session[];
  t: ReturnType<typeof useTranslations>;
  onDelete: (s: Session) => void;
  onEdit: (s: Session) => void;
  onConnect: (s: Session) => void;
  onViewQr: (s: Session) => void;
  onDisconnect: (s: Session) => void;
  actions: ChannelActions;
}) {
  const tS = useTranslations("sessoesPage");
  const { sortKey, sortDir, handleSort, sortedData } = useSortable(sessions, "name");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-16">{t("colId")}</SortableTableHead>
          <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
          <SortableTableHead sortKey="type" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colType")}</SortableTableHead>
          <SortableTableHead sortKey="number" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colNumber")}</SortableTableHead>
          <SortableTableHead sortKey="tenantId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTenant")}</SortableTableHead>
          <SortableTableHead sortKey="status" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
          <SortableTableHead sortKey="isDefault" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDefault")}</SortableTableHead>
          <SortableTableHead sortKey="proxyUrl" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colProxy")}</SortableTableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="text-muted-foreground text-xs">{s.id}</TableCell>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <Badge variant="secondary" className="capitalize">{s.type || "whatsapp"}</Badge>
                {BETA_CHANNEL_TYPES.includes(s.type) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 cursor-default select-none bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">Beta</Badge>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="max-w-[200px] text-xs">{t("betaChannelTooltip" as Parameters<typeof t>[0])}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </span>
            </TableCell>
            <TableCell className="text-sm">{s.number || "—"}</TableCell>
            <TableCell className="text-sm">{s.tenantName || s.tenantId || "—"}</TableCell>
            <TableCell><Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>{s.status}</Badge></TableCell>
            <TableCell>{s.isDefault && <Badge variant="success">{t("default")}</Badge>}</TableCell>
            <TableCell>
              {s.proxyUrl ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                        <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                        <span className="max-w-[140px] truncate">{s.proxyUrl}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs space-y-0.5">
                      <p><span className="font-medium">{t("proxyColUrl")}:</span> {s.proxyUrl}</p>
                      {s.proxyUser && <p><span className="font-medium">{t("proxyColUser")}:</span> {s.proxyUser}</p>}
                      {s.proxyPass && <p><span className="font-medium">{t("proxyColPass")}:</span> {"•".repeat(s.proxyPass.length)}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : <span className="text-muted-foreground text-xs">—</span>}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
                  <DropdownMenuItem onClick={() => onEdit(s)}>
                    <Pencil className="mr-2 h-4 w-4" /> {t("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onSetDefault(s)}>
                    <Star className="mr-2 h-4 w-4" /> {tS("setDefault")}
                  </DropdownMenuItem>
                  {QR_TYPES.includes(s.type) && s.status !== "CONNECTED" && (
                    <DropdownMenuItem onClick={() => onConnect(s)}>
                      <QrCode className="mr-2 h-4 w-4" /> {t("requestQrCode")}
                    </DropdownMenuItem>
                  )}
                  {QR_TYPES.includes(s.type) && s.status === "qrcode" && (
                    <DropdownMenuItem onClick={() => onViewQr(s)}>
                      <QrCode className="mr-2 h-4 w-4" /> {t("viewQrCode")}
                    </DropdownMenuItem>
                  )}
                  {QR_TYPES.includes(s.type) && s.status === "CONNECTED" && (
                    <DropdownMenuItem onClick={() => onDisconnect(s)}>
                      <WifiOff className="mr-2 h-4 w-4" /> {t("disconnectSession")}
                    </DropdownMenuItem>
                  )}
                  {(s.type === "baileys" || s.type === "zapo") && (s.status === "DISCONNECTED" || s.status === "TIMEOUT") && (
                    <RevalidateTenantSessionMenuItem session={s} tS={tS} />
                  )}

                  {/* Webchat widget */}
                  {s.type === "webchat" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => actions.onGenerateWidget(s)} disabled={s.status !== "CONNECTED"}>
                        <Code className="mr-2 h-4 w-4" /> {tS("generateWidget")}
                        {s.status !== "CONNECTED" && <AlertTriangle className="ml-auto h-4 w-4 text-warning" />}
                      </DropdownMenuItem>
                      {/* Link direto — só quando o backend expõe webchatConfig (probe de capacidade) */}
                      {s.webchatConfig !== undefined && (
                        <>
                          <DropdownMenuItem
                            onClick={() => actions.onCopyDirectLink(s)}
                            disabled={s.webchatConfig?.directLinkEnabled !== true}
                            title={s.webchatConfig?.directLinkEnabled !== true ? tS("directLinkOffHint") : undefined}
                          >
                            <Copy className="mr-2 h-4 w-4" /> {tS("copyDirectLink")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => actions.onToggleDirectLink(s)}>
                            {s.webchatConfig?.directLinkEnabled === true ? (
                              <><Link2Off className="mr-2 h-4 w-4" /> {tS("directLinkDisable")}</>
                            ) : (
                              <><Link2 className="mr-2 h-4 w-4" /> {tS("directLinkEnable")}</>
                            )}
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}

                  {/* Webhooks / diagnóstico / origem / PIN / BSP info / ativação */}
                  {(isHubType(s.type) || s.type === "evo" || s.type === "evogo" || s.type.includes("meow") || s.type === "zapi" || s.type === "uazapi" || s.type === "waba" || s.type === "dialog360" || s.type === "gupshup" || s.type === "instagram" || s.type === "messenger") && (
                    <>
                      <DropdownMenuSeparator />
                      {isHubType(s.type) && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "hub")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookHub")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "evo" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "evo")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookEvo")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "evogo" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "evogo")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookEvogo")}
                        </DropdownMenuItem>
                      )}
                      {s.type.includes("meow") && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "meow")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookMeow")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "zapi" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "zapi")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookZapi")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "uazapi" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "uazapi")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookUazapi")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "waba" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "waba")} title={tS("revalidateWebhookWabaBothTooltip")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookWaba")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "instagram" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "instagram")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookInstagram")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "messenger" && (
                        <DropdownMenuItem onClick={() => actions.onWebhook(s, "messenger")}>
                          <RefreshCw className="mr-2 h-4 w-4" /> {tS("revalidateWebhookMessenger")}
                        </DropdownMenuItem>
                      )}
                      {(s.type === "dialog360" || s.type === "gupshup") && (
                        <DropdownMenuItem onClick={() => actions.onShowWebhookInfo(s)}>
                          <Info className="mr-2 h-4 w-4" /> {tS("showWebhookInfo")}
                        </DropdownMenuItem>
                      )}
                      {CAT_CHANNEL_TYPES.includes(s.type) && needsActivationAction(s) && (
                        <DropdownMenuItem onClick={() => actions.onRefreshActivation(s)}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> {tS("renewActivationTicket")}
                        </DropdownMenuItem>
                      )}
                      {["waba", "instagram", "messenger"].includes(s.type) && (
                        <DropdownMenuItem onClick={() => actions.onChangeOrigin(s)}>
                          <ArrowLeftRight className="mr-2 h-4 w-4" /> {tS("changeWebhookOrigin")}
                          <span className="ml-auto text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5">
                            {s.webhookOrigin === "zdg_oauth" ? tS("webhookOriginZdg") : tS("webhookOriginOwn")}
                          </span>
                        </DropdownMenuItem>
                      )}
                      {["waba", "instagram", "messenger"].includes(s.type) && (
                        <DropdownMenuItem onClick={() => actions.onDiagnose(s)}>
                          <Stethoscope className="mr-2 h-4 w-4" /> {tS("diagnoseConnection")}
                        </DropdownMenuItem>
                      )}
                      {s.type === "waba" && (
                        <DropdownMenuItem onClick={() => actions.onRegisterPin(s)}>
                          <ShieldCheck className="mr-2 h-4 w-4" /> {tS("registerPin")}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* Transferência de canal */}
                  {TRANSFER_CHANNEL_TYPES.includes(s.type) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => actions.onTransferChannel(s)}>
                        <ArrowLeftRight className="mr-2 h-4 w-4" /> {tS("transferChannel")}
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => actions.onCloseOpen(s)}>
                    <XCircle className="mr-2 h-4 w-4" /> {tS("closeOpenTickets")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onClosePending(s)}>
                    <Timer className="mr-2 h-4 w-4" /> {tS("closePendingTickets")}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(s)}>
                    <Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GroupCard({ label, sublabel, sessions, t, onDelete, onEdit, onConnect, onViewQr, onDisconnect, actions }: {
  label: string; sublabel?: string; sessions: Session[];
  t: ReturnType<typeof useTranslations>;
  onDelete: (s: Session) => void; onEdit: (s: Session) => void;
  onConnect: (s: Session) => void; onViewQr: (s: Session) => void;
  onDisconnect: (s: Session) => void;
  actions: ChannelActions;
}) {
  const [open, setOpen] = useState(true);
  const connected = sessions.filter((s) => s.status === "CONNECTED").length;
  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">{label}</CardTitle>
              {sublabel && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{sublabel}</span>}
            </div>
            <span className="text-xs text-muted-foreground">{sessions.length} {t("sessions")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">{connected} {t("statConnected")}</Badge>
            {sessions.length - connected > 0 && <Badge variant="secondary" className="text-xs">{sessions.length - connected} offline</Badge>}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-0 overflow-x-auto border-t">
          <SessionsTable sessions={sessions} t={t} onDelete={onDelete} onEdit={onEdit} onConnect={onConnect} onViewQr={onViewQr} onDisconnect={onDisconnect} actions={actions} />
        </CardContent>
      )}
    </Card>
  );
}

// ─── Channel Modal ────────────────────────────────────────

function ChannelModal({ open, onClose, editing, tenants, onSaved }: {
  open: boolean;
  onClose: () => void;
  editing: Session | null;
  tenants: TenantOption[];
  onSaved: () => void;
}) {
  const tPage = useTranslations("sessoestenantsPage");
  const tS = useTranslations("sessoesPage");

  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [manualWabaVersion, setManualWabaVersion] = useState(false);

  const isEdit = !!editing;
  const type = form.type;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const smtp = (editing.smtpConfig || {}) as SmtpConfig;
      const auth = smtp.auth || {};
      const imap = smtp.imap || {};
      const oauth2 = smtp.oauth2 || {};
      setForm({
        ...emptyForm(),
        name: editing.name || "",
        type: editing.type || "baileys",
        tenantId: String(editing.tenantId || ""),
        isDefault: editing.isDefault || false,
        tokenAPI: editing.tokenAPI || "",
        wabaId: editing.wabaId || "",
        bmToken: editing.bmToken || "",
        wabaVersion: editing.wabaVersion || "v21.0",
        appId: editing.appId || "",
        tokenTelegram: editing.tokenTelegram || "",
        wppUser: editing.wppUser || "",
        wavoipToken: editing.wavoipToken || "",
        smtpHost: smtp.host || "",
        smtpPort: String(smtp.port || "465"),
        smtpSecure: smtp.secure !== false,
        smtpUser: String(auth.user || ""),
        smtpPass: String(auth.pass || ""),
        smtpFrom: smtp.from || "",
        smtpReplyTo: smtp.replyTo || "",
        smtpImapHost: imap.host || "",
        smtpImapPort: String(imap.port || "993"),
        smtpImapTls: imap.tls !== false,
        smtpOAuth2ClientId: oauth2.client_id || "",
        smtpOAuth2ClientSecret: oauth2.client_secret || "",
        rescueWindow: editing.rescueWindow || "disabled",
        rescueWindowMessage: editing.rescueWindowMessage || "",
        farewellMessage: editing.farewellMessage || "",
        farewellMediaUrls: Array.isArray(editing.farewellMediaUrls) ? editing.farewellMediaUrls : [],
        closeKeyWord: editing.closeKeyWord || "",
        sendEvaluation: editing.sendEvaluation || "disabled",
        transcribeAudio: editing.transcribeAudio || "disabled",
        transcribeAudioJson: editing.transcribeAudioJson || "",
        selfDistribute: editing.selfDistribute || "disabled",
        destroyMessage: editing.destroyMessage || "disabled",
        ignoreBussinesHours: editing.ignoreBussinesHours || "disabled",
        autoReassign: editing.autoReassign || "disabled",
        autoReassignStatus: editing.autoReassignStatus || "open,pending",
        autoReassignMethod: editing.autoReassignMethod || "R",
        autoReassignIntervalMinutes: editing.autoReassignIntervalMinutes ?? 5,
        disableExternalIntegration: editing.disableExternalIntegration || "disabled",
        waitProcessExternalInteraction: editing.waitProcessExternalInteraction || "enabled",
        webPush: editing.webPush || "disabled",
        isActive: editing.isActive !== false,
        channelWebhook: editing.channelWebhook || "disabled",
        channelWebhookUrl: editing.channelWebhookUrl || "",
        channelWebhookMessage: editing.channelWebhookMessage || "disabled",
        proxyUrl: editing.proxyUrl || "",
        proxyUser: editing.proxyUser || "",
        proxyPass: editing.proxyPass || "",
        usePairingCode: false,
      });
    } else {
      setForm(emptyForm());
    }
    setManualWabaVersion(false);
  }, [open, editing]);

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggle(k: keyof FormState) {
    setForm(f => ({ ...f, [k]: f[k] === "enabled" ? "disabled" : "enabled" }));
  }

  function buildPayload(): Record<string, unknown> {
    const smtp: SmtpConfig = {
      host: form.smtpHost || undefined,
      port: form.smtpPort ? Number(form.smtpPort) : undefined,
      secure: form.smtpSecure,
      auth: { user: form.smtpUser || undefined, pass: form.smtpPass || undefined },
      from: form.smtpFrom || undefined,
      replyTo: form.smtpReplyTo || undefined,
      imap: {
        host: form.smtpImapHost || undefined,
        port: form.smtpImapPort ? Number(form.smtpImapPort) : undefined,
        tls: form.smtpImapTls,
      },
      oauth2: {
        client_id: form.smtpOAuth2ClientId || undefined,
        client_secret: form.smtpOAuth2ClientSecret || undefined,
      },
    };

    return {
      name: form.name,
      type: form.type,
      tenantId: Number(form.tenantId),
      isDefault: form.isDefault,
      tokenAPI: form.tokenAPI || undefined,
      wabaId: form.wabaId || undefined,
      bmToken: form.bmToken || undefined,
      wabaVersion: form.wabaVersion || undefined,
      appId: form.appId || undefined,
      tokenTelegram: form.tokenTelegram || undefined,
      wppUser: form.wppUser || undefined,
      wavoipToken: form.wavoipToken || undefined,
      smtpConfig: type === "webmail" ? smtp : undefined,
      rescueWindow: form.rescueWindow,
      rescueWindowMessage: form.rescueWindowMessage || undefined,
      farewellMessage: form.farewellMessage || undefined,
      farewellMediaUrls: Array.isArray(form.farewellMediaUrls) ? form.farewellMediaUrls : [],
      closeKeyWord: form.closeKeyWord || undefined,
      sendEvaluation: form.sendEvaluation,
      transcribeAudio: form.transcribeAudio,
      transcribeAudioJson: form.transcribeAudioJson || undefined,
      selfDistribute: form.selfDistribute,
      destroyMessage: form.destroyMessage,
      ignoreBussinesHours: form.ignoreBussinesHours,
      autoReassign: form.autoReassign,
      autoReassignStatus: form.autoReassignStatus,
      autoReassignMethod: form.autoReassignMethod,
      autoReassignIntervalMinutes: form.autoReassignIntervalMinutes,
      disableExternalIntegration: form.disableExternalIntegration,
      waitProcessExternalInteraction: form.waitProcessExternalInteraction,
      webPush: form.webPush,
      isActive: form.isActive,
      channelWebhook: form.channelWebhook,
      channelWebhookUrl: form.channelWebhookUrl || undefined,
      channelWebhookMessage: form.channelWebhookMessage,
      proxyUrl: form.proxyUrl || undefined,
      proxyUser: form.proxyUser || undefined,
      proxyPass: form.proxyPass || undefined,
    };
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error(tPage("fieldNameRequired")); return; }
    if (!form.tenantId) { toast.error(tPage("fieldTenantRequired")); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit && editing) {
        await updateWhatsappTenant(editing.id, payload);
        toast.success(tPage("sessionUpdated"));
      } else {
        await createWhatsappTenant(payload);
        toast.success(tPage("sessionCreated"));
      }
      onSaved();
      onClose();
    } catch {
      toast.error(isEdit ? tPage("errorUpdating") : tPage("errorCreating"));
    } finally {
      setSaving(false);
    }
  }

  const isQr = QR_TYPES.includes(type);
  const isWavoip = WAVOIP_TYPES.includes(type);
  const isMetaRescue = META_RESCUE_TYPES.includes(type);
  const isFarewell = FAREWELL_TYPES.includes(type) || type.includes("hub");
  const isWebmail = type === "webmail";

  const autoReassignStatuses = (form.autoReassignStatus || "").split(",").map(s => s.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? tPage("editSession") : tPage("newSession")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">

          {/* ── Tenant ── */}
          <Field label={`${tPage("fieldTenant")} *`}>
            <Select value={form.tenantId} onValueChange={v => setField("tenantId", v)} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder={tPage("selectTenant")} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(ten => (
                  <SelectItem key={ten.id} value={String(ten.id)}>{ten.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* ── Type ── */}
          <Field label={tS("channelType")}>
            <Select value={form.type} onValueChange={v => setField("type", v)}>
              <SelectTrigger>
                <SelectValue placeholder={tS("selectType")} />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_GROUPS.map(({ group, labelKey, types }) => (
                  <SelectGroup key={group}>
                    <SelectLabel className="bg-muted/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1.5 -mx-1 pointer-events-none">{tS(labelKey as Parameters<typeof tS>[0])}</SelectLabel>
                    {types.map(ct => (
                      <SelectItem key={ct.value} value={ct.value}>
                        <span className="flex items-center gap-2">
                          {tS(ct.labelKey as Parameters<typeof tS>[0])}
                          {BETA_CHANNEL_TYPES.includes(ct.value) && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">Beta</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* ── Name ── */}
          <Field label={`${tS("channelName")} *`}>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder={tS("channelNamePlaceholder")} />
          </Field>

          {/* ── Is Default ── */}
          <ToggleRow id="isDefault" label={tS("defaultChannelLabel")} checked={form.isDefault} onCheckedChange={v => setField("isDefault", v)} />

          {/* ──────────── QR Types: pairing ──────────── */}
          {(type === "baileys" || type === "zapo" || type === "whatsapp" || type === "meow") && (
            <CollapseSection title={tS("usePairingCode")} defaultOpen={false}>
              <ToggleRow id="usePairingCode" label={tS("usePairingCode")} checked={form.usePairingCode} onCheckedChange={v => setField("usePairingCode", v)} />
              {form.usePairingCode && (
                <Field label={tS("exactNumber")}>
                  <Input type="tel" value={form.wppUser} onChange={e => setField("wppUser", e.target.value)} placeholder="5511999999999" />
                </Field>
              )}
              <div className="rounded-md bg-muted/50 border p-3 text-xs mt-2">
                <p className="font-semibold mb-1">{tS("qrTypeAttention")}</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{tS("qrTypeRule1")}</li>
                  <li>{tS("qrTypeRule2")}</li>
                  <li>{tS("qrTypeRule3")}</li>
                </ul>
              </div>
            </CollapseSection>
          )}

          {(type === "meow" || type === "evo") && !form.usePairingCode && (
            <CollapseSection title={tS("pairingNumberOptional")} defaultOpen={false}>
              <Field label={tS("pairingNumberOptional")}>
                <Input type="tel" value={form.wppUser} onChange={e => setField("wppUser", e.target.value)} placeholder="5511999999999" />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Telegram ──────────── */}
          {type === "telegram" && (
            <CollapseSection title="Telegram" defaultOpen={true}>
              <Field label={tS("telegramBotToken")}>
                <Input value={form.tokenTelegram} onChange={e => setField("tokenTelegram", e.target.value)} placeholder="123456789:ABCdef..." />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── WABA ──────────── */}
          {type === "waba" && (
            <CollapseSection title={tS("wabaConfigSection")} defaultOpen={true}>
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800">
                <p className="font-semibold mb-1">{tS("wabaTitle")}</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{tS("wabaRule1")}</li>
                  <li>{tS("wabaRule2")}</li>
                  <li>{tS("wabaRule4")}</li>
                  <li>{tS("wabaRule5")}</li>
                </ul>
              </div>
              <Field label={tS("phoneRecipientId")}>
                <Input value={form.tokenAPI} onChange={e => setField("tokenAPI", e.target.value)} placeholder="Ex: 123456789012345" />
              </Field>
              <Field label={tS("wabaIdBmId")}>
                <Input value={form.wabaId} onChange={e => setField("wabaId", e.target.value)} placeholder="Ex: 987654321098765" />
              </Field>
              <Field label={tS("bmTokenPermanent")}>
                <Input value={form.bmToken} onChange={e => setField("bmToken", e.target.value)} placeholder="EAABs..." />
              </Field>
              <Field label={tS("apiVersionLabel")}>
                <Select
                  value={manualWabaVersion ? "manual" : (form.wabaVersion || "v21.0")}
                  onValueChange={v => {
                    if (v === "manual") { setManualWabaVersion(true); setField("wabaVersion", ""); }
                    else { setManualWabaVersion(false); setField("wabaVersion", v); }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WABA_VERSIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    <SelectItem value="manual">{tS("enterManually")}</SelectItem>
                  </SelectContent>
                </Select>
                {manualWabaVersion && (
                  <Input className="mt-1.5" value={form.wabaVersion} onChange={e => setField("wabaVersion", e.target.value)} placeholder="ex: v27.0" />
                )}
              </Field>
              <Field label={tS("wabaAppIdOptional")}>
                <Input value={form.appId} onChange={e => setField("appId", e.target.value)} placeholder={tS("none")} />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Instagram ──────────── */}
          {type === "instagram" && (
            <CollapseSection title="Instagram" defaultOpen={true}>
              <Field label={tS("instagramPageId")}>
                <Input value={form.tokenAPI} onChange={e => setField("tokenAPI", e.target.value)} placeholder="Ex: 123456789012345" />
              </Field>
              <Field label={tS("instagramToken")}>
                <Input value={form.bmToken} onChange={e => setField("bmToken", e.target.value)} placeholder="EAABs..." />
              </Field>
              <Field label={tS("instagramWabaToken")}>
                <Input value={form.wabaId} onChange={e => setField("wabaId", e.target.value)} />
              </Field>
              <Field label={tS("apiVersionLabel")}>
                <Select
                  value={manualWabaVersion ? "manual" : (form.wabaVersion || "v21.0")}
                  onValueChange={v => {
                    if (v === "manual") { setManualWabaVersion(true); setField("wabaVersion", ""); }
                    else { setManualWabaVersion(false); setField("wabaVersion", v); }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WABA_VERSIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    <SelectItem value="manual">{tS("enterManually")}</SelectItem>
                  </SelectContent>
                </Select>
                {manualWabaVersion && (
                  <Input className="mt-1.5" value={form.wabaVersion} onChange={e => setField("wabaVersion", e.target.value)} placeholder="ex: v27.0" />
                )}
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Messenger ──────────── */}
          {type === "messenger" && (
            <CollapseSection title="Messenger" defaultOpen={true}>
              <Field label={tS("messengerPageId")}>
                <Input value={form.tokenAPI} onChange={e => setField("tokenAPI", e.target.value)} placeholder="Ex: 123456789012345" />
              </Field>
              <Field label={tS("messengerToken")}>
                <Input value={form.bmToken} onChange={e => setField("bmToken", e.target.value)} placeholder="EAABs..." />
              </Field>
              <Field label={tS("apiVersionLabel")}>
                <Select
                  value={manualWabaVersion ? "manual" : (form.wabaVersion || "v21.0")}
                  onValueChange={v => {
                    if (v === "manual") { setManualWabaVersion(true); setField("wabaVersion", ""); }
                    else { setManualWabaVersion(false); setField("wabaVersion", v); }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WABA_VERSIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    <SelectItem value="manual">{tS("enterManually")}</SelectItem>
                  </SelectContent>
                </Select>
                {manualWabaVersion && (
                  <Input className="mt-1.5" value={form.wabaVersion} onChange={e => setField("wabaVersion", e.target.value)} placeholder="ex: v27.0" />
                )}
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Z-API / UaZapi ──────────── */}
          {(type === "zapi" || type === "uazapi") && (
            <CollapseSection title={type === "zapi" ? "Z-API" : "UaZapi"} defaultOpen={true}>
              <Field label={tPage("apiTokenLabel")}>
                <Input value={form.tokenAPI} onChange={e => setField("tokenAPI", e.target.value)} placeholder="Token" />
              </Field>
              <Field label={tS("numberInstancePlaceholder")}>
                <Input value={form.wabaId} onChange={e => setField("wabaId", e.target.value)} placeholder={tS("numberInstancePlaceholder")} />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── WooCommerce ──────────── */}
          {type === "woocommerce" && (
            <CollapseSection title="WooCommerce" defaultOpen={true}>
              <Field label={tS("woocommerceStoreUrl" as Parameters<typeof tS>[0])} hint={tS("woocommerceStoreUrlHint" as Parameters<typeof tS>[0])}>
                <Input value={form.wabaId} onChange={e => setField("wabaId", e.target.value)} placeholder="https://minha-loja.com" />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Nuvemshop ──────────── */}
          {type === "nuvemshop" && (
            <CollapseSection title="Nuvemshop" defaultOpen={true}>
              <Field label={tS("nuvemshopStoreId" as Parameters<typeof tS>[0])} hint={tS("nuvemshopStoreIdHint" as Parameters<typeof tS>[0])}>
                <Input value={form.wabaId} onChange={e => setField("wabaId", e.target.value)} placeholder="123456" />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── WebMail / SMTP ──────────── */}
          {isWebmail && (
            <>
              <CollapseSection title={tS("smtpSection")} defaultOpen={true}>
                <Field label={tS("smtpServerLabel")}>
                  <Input value={form.smtpHost} onChange={e => setField("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
                </Field>
                <Field label={tS("smtpPortLabel")}>
                  <Input type="number" value={form.smtpPort} onChange={e => setField("smtpPort", e.target.value)} placeholder="465" />
                </Field>
                <ToggleRow id="smtpSecure" label={tS("smtpSecureLabel")} checked={form.smtpSecure} onCheckedChange={v => setField("smtpSecure", v)} />
                <Field label={tS("smtpUserLabel")}>
                  <Input value={form.smtpUser} onChange={e => setField("smtpUser", e.target.value)} placeholder="seu@email.com" />
                </Field>
                <Field label={tS("smtpPassLabel")}>
                  <Input type="password" value={form.smtpPass} onChange={e => setField("smtpPass", e.target.value)} />
                </Field>
                <Field label={tS("smtpFromLabel")}>
                  <Input value={form.smtpFrom} onChange={e => setField("smtpFrom", e.target.value)} placeholder="Nome Empresa <noreply@empresa.com>" />
                </Field>
                <Field label={tS("smtpReplyToLabel")}>
                  <Input value={form.smtpReplyTo} onChange={e => setField("smtpReplyTo", e.target.value)} placeholder="resposta@empresa.com" />
                </Field>
              </CollapseSection>

              <CollapseSection title="IMAP" defaultOpen={false}>
                <Field label={tS("smtpServerLabel")}>
                  <Input value={form.smtpImapHost} onChange={e => setField("smtpImapHost", e.target.value)} placeholder="imap.gmail.com" />
                </Field>
                <Field label={tS("smtpPortLabel")}>
                  <Input type="number" value={form.smtpImapPort} onChange={e => setField("smtpImapPort", e.target.value)} placeholder="993" />
                </Field>
                <ToggleRow id="smtpImapTls" label={tPage("imapTlsLabel")} checked={form.smtpImapTls} onCheckedChange={v => setField("smtpImapTls", v)} />
              </CollapseSection>

              <CollapseSection title={tS("oauth2Section")} defaultOpen={false}>
                <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800">
                  <p className="font-semibold">{tS("oauth2HowTo")}</p>
                </div>
                <Field label={tPage("oauth2ClientIdLabel")}>
                  <Input value={form.smtpOAuth2ClientId} onChange={e => setField("smtpOAuth2ClientId", e.target.value)} placeholder="*.apps.googleusercontent.com" />
                </Field>
                <Field label={tPage("oauth2ClientSecretLabel")}>
                  <Input value={form.smtpOAuth2ClientSecret} onChange={e => setField("smtpOAuth2ClientSecret", e.target.value)} placeholder="GOCSPX-..." />
                </Field>
              </CollapseSection>
            </>
          )}

          {/* ──────────── Meta Rescue Window ──────────── */}
          {isMetaRescue && (
            <CollapseSection title={tS("rescueWindowLabel")} defaultOpen={false}>
              <Field label={tS("rescueWindowLabel")}>
                <Select value={form.rescueWindow} onValueChange={v => setField("rescueWindow", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{tS("disabledLabel")}</SelectItem>
                    <SelectItem value="enabled">{tS("enabledLabel")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.rescueWindow === "enabled" && (
                <Field label={tS("rescueWindowMsg")}>
                  <Textarea value={form.rescueWindowMessage} onChange={e => setField("rescueWindowMessage", e.target.value)} rows={3} />
                </Field>
              )}
            </CollapseSection>
          )}

          {/* ──────────── WaVoIP ──────────── */}
          {isWavoip && (
            <CollapseSection title={tS("wavoipSection")} defaultOpen={false}>
              <Field label={tS("wavoipTokenLabel")}>
                <Input value={form.wavoipToken} onChange={e => setField("wavoipToken", e.target.value)} placeholder={tS("wavoipTokenPlaceholder")} />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Farewell ──────────── */}
          {isFarewell && (
            <CollapseSection title={tS("farewellSection")} defaultOpen={false}>
              <Field label={tS("farewellLabel")}>
                <Textarea value={form.farewellMessage} onChange={e => setField("farewellMessage", e.target.value)} placeholder={tS("farewellPlaceholder")} rows={3} />
              </Field>
              {(FAREWELL_MEDIA_TYPES.includes(type) || type.includes("hub")) && (
                <FarewellMediaManager
                  urls={form.farewellMediaUrls}
                  onChange={(next) => setField("farewellMediaUrls", next)}
                />
              )}
            </CollapseSection>
          )}

          {/* ──────────── Channel Webhook ──────────── */}
          <CollapseSection title={tS("channelWebhookSection")} defaultOpen={false}>
            <ToggleRow
              id="channelWebhook"
              label={tS("channelWebhookEnabled")}
              desc={tS("channelWebhookEnabledDesc")}
              checked={form.channelWebhook === "enabled"}
              onCheckedChange={() => toggle("channelWebhook")}
            />
            {form.channelWebhook === "enabled" && (
              <>
                <Field label={tS("channelWebhookUrl")}>
                  <Input value={form.channelWebhookUrl} onChange={e => setField("channelWebhookUrl", e.target.value)} placeholder="https://example.com/webhook" />
                </Field>
                <ToggleRow
                  id="channelWebhookMessage"
                  label={tS("channelWebhookMessage")}
                  desc={tS("channelWebhookMessageDesc")}
                  checked={form.channelWebhookMessage === "enabled"}
                  onCheckedChange={() => toggle("channelWebhookMessage")}
                />
              </>
            )}
          </CollapseSection>

          {/* ──────────── Features ──────────── */}
          {!isWebmail && (
            <CollapseSection title={tS("channelFeatures")} defaultOpen={false}>
              <ToggleRow id="sendEvaluation" label={tS("enableAutoEvaluation")} desc={tS("enableAutoEvaluationDesc")} checked={form.sendEvaluation === "enabled"} onCheckedChange={() => toggle("sendEvaluation")} />
              <ToggleRow id="transcribeAudio" label={tS("enableAudioTranscription")} desc={tS("enableAudioTranscriptionDesc")} checked={form.transcribeAudio === "enabled"} onCheckedChange={() => toggle("transcribeAudio")} />
              {form.transcribeAudio === "enabled" && (
                <Field label={tS("credentialsJson")}>
                  <Textarea value={form.transcribeAudioJson} onChange={e => setField("transcribeAudioJson", e.target.value)} placeholder='{"type": "service_account", ...}' rows={3} />
                </Field>
              )}
              <ToggleRow id="selfDistribute" label={tS("enableAutoDistribute")} desc={tS("enableAutoDistributeDesc")} checked={form.selfDistribute === "enabled"} onCheckedChange={() => toggle("selfDistribute")} />
              {isQr && (
                <ToggleRow id="destroyMessage" label={tS("enableMessageDestruction")} desc={tS("enableMessageDestructionDesc")} checked={form.destroyMessage === "enabled"} onCheckedChange={() => toggle("destroyMessage")} />
              )}
              {/* ignoreBussinesHours — 3 modos: disabled | enabled | queueOnly */}
              <div className="py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="ignoreBussinesHours" className="text-sm font-medium leading-snug">
                    {tS("ignoreBusinessHoursMode")}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs whitespace-pre-line">
                        {tS("ignoreBusinessHoursTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={form.ignoreBussinesHours === "enabled" || form.ignoreBussinesHours === "queueOnly" ? (form.ignoreBussinesHours as string) : "disabled"}
                  onValueChange={v => setField("ignoreBussinesHours", v)}
                >
                  <SelectTrigger id="ignoreBussinesHours" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{tS("ignoreBusinessHoursModeDisabled")}</SelectItem>
                    <SelectItem value="enabled">{tS("ignoreBusinessHoursModeEnabled")}</SelectItem>
                    <SelectItem value="queueOnly">{tS("ignoreBusinessHoursModeQueueOnly")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground break-words">
                  {form.ignoreBussinesHours === "enabled"
                    ? tS("ignoreBusinessHoursModeEnabledDesc")
                    : form.ignoreBussinesHours === "queueOnly"
                    ? tS("ignoreBusinessHoursModeQueueOnlyDesc")
                    : tS("ignoreBusinessHoursModeDisabledDesc")}
                </p>
              </div>

              {/* Auto Reassign */}
              <ToggleRow id="autoReassign" label={tS("autoReassignLabel")} desc={tS("autoReassignDesc")} checked={form.autoReassign === "enabled"} onCheckedChange={() => toggle("autoReassign")} />
              {form.autoReassign === "enabled" && (
                <div className="ml-4 pl-4 border-l space-y-3 mt-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">{tS("autoReassignStatusLabel")}</Label>
                    <div className="flex gap-4">
                      {(["open","pending","closed"] as const).map(s => (
                        <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoReassignStatuses.includes(s)}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...new Set([...autoReassignStatuses, s])]
                                : autoReassignStatuses.filter(x => x !== s);
                              setField("autoReassignStatus", next.join(","));
                            }}
                          />
                          {tS(`status_${s}` as Parameters<typeof tS>[0])}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Field label={tS("autoReassignMethodLabel")}>
                    <select value={form.autoReassignMethod} onChange={e => setField("autoReassignMethod", e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="R">{tS("autoReassignMethodRandom")}</option>
                      <option value="B">{tS("autoReassignMethodBalanced")}</option>
                      <option value="S">{tS("autoReassignMethodSequential")}</option>
                    </select>
                  </Field>
                  <Field label={tS("autoReassignIntervalLabel")}>
                    <div className="flex items-center gap-2">
                      <Input type="number" min={1} className="w-24" value={form.autoReassignIntervalMinutes} onChange={e => setField("autoReassignIntervalMinutes", Number(e.target.value))} />
                      <span className="text-sm text-muted-foreground">{tS("autoReassignIntervalUnit")}</span>
                    </div>
                  </Field>
                </div>
              )}

              <ToggleRow id="disableExternalIntegration" label={tS("enableAutoShutdown")} desc={tS("enableAutoShutdownDesc")} checked={form.disableExternalIntegration === "enabled"} onCheckedChange={() => toggle("disableExternalIntegration")} />
              <ToggleRow id="waitProcessExternalInteraction" label={tS("enableProcessingWait")} desc={tS("enableProcessingWaitDesc")} checked={form.waitProcessExternalInteraction === "enabled"} onCheckedChange={() => toggle("waitProcessExternalInteraction")} />
              <ToggleRow id="webPush" label={tS("enableWebPush")} desc={tS("enableWebPushDesc")} checked={form.webPush === "enabled"} onCheckedChange={() => toggle("webPush")} />
              {type !== "waba" && type !== "instagram" && (
                <ToggleRow id="isActive" label={tS("contingency")} desc={tS("contingencyDesc")} checked={form.isActive} onCheckedChange={v => setField("isActive", v)} />
              )}
              <Field label={tS("closeKeyword")} hint={tS("closeKeywordDesc")}>
                <KeywordChipsInput value={form.closeKeyWord || ""} onChange={v => setField("closeKeyWord", v)} placeholder="Ex: desligar" />
              </Field>
            </CollapseSection>
          )}

          {/* ──────────── Proxy (QR types) ──────────── */}
          {isQr && (
            <CollapseSection title={tS("additionalSettings")} defaultOpen={false}>
              <Field label={tS("proxyUrlLabel")}>
                <Input value={form.proxyUrl} onChange={e => setField("proxyUrl", e.target.value)} placeholder="socks5://ip:porta" />
              </Field>
              <Field label={tS("proxyUserLabel")}>
                <Input value={form.proxyUser} onChange={e => setField("proxyUser", e.target.value)} placeholder="usuario" />
              </Field>
              <Field label={tS("proxyPassLabel")}>
                <Input type="password" value={form.proxyPass} onChange={e => setField("proxyPass", e.target.value)} />
              </Field>
            </CollapseSection>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{tPage("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? tPage("save") : tPage("newSession")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────

interface QrSessionData { id: number; name: string; type: string; status: string; qrcode?: string }

const TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CHANNEL_GROUPS.flatMap(g => g.types.map(ct => [ct.value, ct.labelKey]))
);

export default function SessoesTenantPage() {
  const t = useTranslations("sessoestenantsPage");
  const tS = useTranslations("sessoesPage");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [qrSession, setQrSession] = useState<QrSessionData | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrNewLoading, setQrNewLoading] = useState(false);
  const qrPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [lidConsolidationOpen, setLidConsolidationOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await fetchWhatsappsByTenant();
      const raw: any[] = Array.isArray(data) ? data : data?.whatsapps || [];
      setSessions(raw.map(s => ({
        ...s,
        tenantName: s.tenantName || s.tenant?.name || s.tenant?.email || undefined,
      })));
    } catch { toast.error(t("errorLoading")); }
    finally { setLoading(false); }
  }

  async function loadTenants() {
    try {
      const { data } = await fetchTenants(1, 200);
      const list = Array.isArray(data) ? data : data?.tenants || [];
      setTenants(list.map((ten: { id: number; name?: string; email?: string }) => ({
        id: ten.id,
        name: ten.name || ten.email || String(ten.id),
      })));
    } catch { toast.error(t("errorLoadingTenants")); }
  }

  useEffect(() => { load(); loadTenants(); }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      const online = sessions.filter(s => s.status === "CONNECTED").length;
      window.dispatchEvent(new CustomEvent("sessionsTenantStatusUpdate", { detail: { online, total: sessions.length } }));
    }
  }, [sessions]);

  async function handleDelete(s: Session) {
    // Webchat com link direto ativo: avisar que links/QR distribuídos morrem com o canal
    const directLinkOn = s.type === "webchat" && s.webchatConfig?.directLinkEnabled === true;
    const confirmMsg = directLinkOn
      ? `${t("confirmDelete", { name: s.name })}\n\n${tS("deleteDirectLinkWarning")}`
      : t("confirmDelete", { name: s.name });
    if (!confirm(confirmMsg)) return;
    try {
      await deleteWhatsappTenant(s.id);
      toast.success(t("sessionDeleted"));
      load();
    } catch { toast.error(t("errorDeleting")); }
  }

  function startQrPoll(id: number) {
    if (qrPollRef.current) clearInterval(qrPollRef.current);
    qrPollRef.current = setInterval(async () => {
      try {
        const { data } = await showWhatsappTenantSession(id);
        setQrSession(data);
        if (data.status === "CONNECTED") {
          clearInterval(qrPollRef.current!);
          qrPollRef.current = null;
          load();
        }
      } catch {}
    }, 2500);
  }

  function stopQrPoll() {
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
  }

  async function handleConnect(s: Session) {
    try {
      await connectWhatsappTenantSession(s.id);
      toast.success(t("connectingChannel"));
      const { data } = await showWhatsappTenantSession(s.id);
      setQrSession(data);
      setQrDialogOpen(true);
      startQrPoll(s.id);
    } catch { toast.error(t("errorRequestQr")); }
  }

  async function handleViewQr(s: Session) {
    setQrLoading(true);
    setQrDialogOpen(true);
    try {
      const { data } = await showWhatsappTenantSession(s.id);
      setQrSession(data);
      if (data.status !== "CONNECTED") startQrPoll(s.id);
    } catch { toast.error(t("errorViewQr")); }
    finally { setQrLoading(false); }
  }

  async function handleQrNew() {
    if (!qrSession) return;
    setQrNewLoading(true);
    try {
      await requestQrCodeTenant(qrSession.id);
      startQrPoll(qrSession.id);
    } catch { toast.error(t("errorRequestQr")); }
    finally { setQrNewLoading(false); }
  }

  function handleQrClose() {
    stopQrPoll();
    setQrDialogOpen(false);
    setQrSession(null);
    load();
  }

  async function handleDisconnect(s: Session) {
    try {
      await disconnectWhatsappTenantSession(s.id);
      toast.success(t("sessionDisconnected"));
      load();
    } catch { toast.error(t("errorDisconnecting")); }
  }

  // ─── Estado das ações de canal (cross-tenant) ───
  const [diagnoseTarget, setDiagnoseTarget] = useState<Session | null>(null);
  const [registerPinTarget, setRegisterPinTarget] = useState<Session | null>(null);
  const [webhookInfoTarget, setWebhookInfoTarget] = useState<Session | null>(null);
  const [originChangeTarget, setOriginChangeTarget] = useState<Session | null>(null);
  const [originChangeValue, setOriginChangeValue] = useState<"own_app" | "zdg_oauth">("own_app");
  const [originChangeLoading, setOriginChangeLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Session | null>(null);
  const [transferNewChannelId, setTransferNewChannelId] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [widgetPendingItem, setWidgetPendingItem] = useState<Session | null>(null);
  const [enableMenuButtons, setEnableMenuButtons] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [widgetCode, setWidgetCode] = useState("");
  const [widgetCopying, setWidgetCopying] = useState(false);

  // Listener do popup OAuth Meta (waba/instagram/messenger) — reload + toast no sucesso.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const type = (ev?.data && (ev.data as { type?: string }).type) || "";
      if (
        type === "waba:webhook:setup:success" ||
        type === "instagram:webhook:setup:success" ||
        type === "messenger:webhook:setup:success"
      ) {
        toast.success(tS("webhookRevalidated"));
        load();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSetDefault(s: Session) {
    try {
      await setDefaultWhatsappTenant(s.id);
      toast.success(tS("channelSetDefault"));
      load();
    } catch { toast.error(tS("errorSetDefault")); }
  }

  async function handleCloseOpen(s: Session) {
    try {
      await closeAllOpenTenant(s.id);
      toast.success(tS("openTicketsClosed"));
    } catch { toast.error(tS("errorClosingOpenTickets")); }
  }

  async function handleClosePending(s: Session) {
    try {
      await closeAllPendingTenant(s.id);
      toast.success(tS("pendingTicketsClosed"));
    } catch { toast.error(tS("errorClosingPendingTickets")); }
  }

  // Revalidação de webhook — provider (evo/evogo/meow/zapi/uazapi/hub) + Meta (popup OAuth).
  async function handleWebhook(s: Session, action: string) {
    const isOauthPopup = ["waba", "instagram", "messenger"].includes(action);
    if (isOauthPopup) {
      // WABA: o popup faz, numa unica submissao, o webhook PRINCIPAL e o SECUNDARIO
      // (COEX) — o backend anexa os params do coex no state quando mode=primary.
      const loadingId = toast.loading(tS("openingOauthPopup"));
      try {
        const kind = action as "waba" | "instagram" | "messenger";
        const { data } = await getMetaWebhookAuthUrlTenant(s.id, kind);
        toast.dismiss(loadingId);
        if (data?.authUrl) {
          window.open(data.authUrl, `meta_webhook_setup_${action}`, "width=560,height=480,scrollbars=yes,resizable=yes");
        } else {
          toast.error(tS("errorRevalidatingWebhook"));
        }
      } catch (err: any) {
        toast.dismiss(loadingId);
        const detail = err?.response?.data?.error || err?.response?.data?.detail || err?.message;
        toast.error(detail ? `${tS("errorRevalidatingWebhook")}: ${detail}` : tS("errorRevalidatingWebhook"));
      }
      return;
    }
    // Provider (evo/evogo/meow/zapi/uazapi/hub) — body = canal completo.
    try {
      const provider = action as "evo" | "evogo" | "meow" | "zapi" | "uazapi" | "hub";
      await revalidateProviderWebhookTenant(s.id, provider, s as unknown as Record<string, unknown>);
      toast.success(tS("webhookRevalidated"));
    } catch { toast.error(tS("errorRevalidatingWebhook")); }
  }

  function handleChangeOrigin(s: Session) {
    setOriginChangeTarget(s);
    setOriginChangeValue(s.webhookOrigin === "zdg_oauth" ? "zdg_oauth" : "own_app");
  }

  async function confirmChangeOrigin() {
    if (!originChangeTarget) return;
    setOriginChangeLoading(true);
    try {
      const { data } = await updateWebhookOriginTenant(originChangeTarget.id, originChangeValue);
      setSessions(prev => prev.map(w => w.id === originChangeTarget.id
        ? { ...w, webhookOrigin: originChangeValue, webhookNeedsRevalidation: !!data?.needsRevalidation }
        : w));
      if (data?.needsRevalidation) {
        toast.warning(tS("webhookOriginUpdatedPendingRevalidation", { name: originChangeTarget.name }));
      } else {
        toast.success(tS("webhookOriginUpdated"));
      }
      setOriginChangeTarget(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message;
      toast.error(detail ? `${tS("webhookOriginUpdateFailed")}: ${detail}` : tS("webhookOriginUpdateFailed"));
    } finally {
      setOriginChangeLoading(false);
    }
  }

  async function handleRefreshActivation(s: Session) {
    try {
      const { data } = await refreshActivationTicketTenant(s.id);
      setSessions(prev => prev.map(w => w.id === s.id
        ? { ...w, activationTicketExpiresAt: data?.activationTicketExpiresAt ?? w.activationTicketExpiresAt, activationTicketPid: data?.activationTicketPid ?? w.activationTicketPid }
        : w));
      toast.success(tS("activationTicketRenewed"));
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) toast.error(tS("activationTicketLicenseInvalid"));
      else {
        const detail = err?.response?.data?.error || err?.message;
        toast.error(detail ? `${tS("activationTicketRenewFailed")}: ${detail}` : tS("activationTicketRenewFailed"));
      }
    }
  }

  async function handleTransferChannel() {
    if (!transferTarget) return;
    if (!transferNewChannelId) { toast.error(tS("transferChannelNoChannel")); return; }
    const newChannel = sessions.find(c => String(c.id) === transferNewChannelId);
    if (!newChannel) return;
    setTransferLoading(true);
    try {
      await transferChannelTenant({
        whatsappId: transferTarget.id,
        newWhatsappId: newChannel.id,
        channel: transferTarget.type,
        newChannel: newChannel.type,
      });
      toast.success(tS("transferChannelQueued"));
      setTransferTarget(null);
      setTransferNewChannelId("");
    } catch { toast.error(tS("transferChannelError")); }
    finally { setTransferLoading(false); }
  }

  function handleGenerateWidget(s: Session) {
    setEnableMenuButtons(false);
    setWidgetPendingItem(s);
  }

  async function handleConfirmGenerate() {
    if (!widgetPendingItem) return;
    const item = widgetPendingItem;
    setWidgetPendingItem(null);
    setWidgetLoading(true);
    try {
      const response = await getWidgetTenant(item.id, enableMenuButtons);
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `webchat-widget-${item.tenantId}-${item.wabaId || item.id}.js`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const text = await blob.text();
      setWidgetCode(text);
      setWidgetModalOpen(true);
      toast.success(tS("widgetGenerated"));
    } catch { toast.error(tS("widgetError")); }
    finally { setWidgetLoading(false); }
  }

  async function handleCopyWidgetCode() {
    setWidgetCopying(true);
    try {
      await navigator.clipboard.writeText(widgetCode);
      toast.success(tS("widgetCopied"));
    } catch { toast.error(tS("widgetCopyError")); }
    finally { setWidgetCopying(false); }
  }

  // ─── Link direto do WebChat (cross-tenant) ───
  async function handleCopyDirectLink(s: Session) {
    if (!s.wabaId) { toast.error(tS("directLinkCopyError")); return; }
    try {
      await navigator.clipboard.writeText(buildDirectLinkUrl(s.wabaId));
      toast.success(tS("directLinkCopied"));
    } catch { toast.error(tS("directLinkCopyError")); }
  }

  async function handleToggleDirectLink(s: Session) {
    const current: NonNullable<Session["webchatConfig"]> = s.webchatConfig || {};
    const nextEnabled = current.directLinkEnabled !== true;
    // Ativar sem wabaId geraria uma URL /chat/ que o backend não resolve (404):
    // o canal webchat criado via create cross-tenant pode nascer sem o uuid.
    if (nextEnabled && !s.wabaId) { toast.error(tS("directLinkUpdateError")); return; }
    try {
      // O backend faz merge raso defensivo, mas enviamos o objeto completo.
      // tenantId no body é obrigatório: o service cross-tenant busca por { id, tenantId }.
      const { data } = await updateWhatsappTenant(s.id, {
        tenantId: s.tenantId,
        webchatConfig: { ...current, directLinkEnabled: nextEnabled },
      });
      const updatedConfig = (data?.webchatConfig ?? { ...current, directLinkEnabled: nextEnabled }) as Session["webchatConfig"];
      setSessions(prev => prev.map(w => w.id === s.id ? { ...w, webchatConfig: updatedConfig } : w));
      toast.success(tS("directLinkUpdated"));
    } catch { toast.error(tS("directLinkUpdateError")); }
  }

  const channelActions: ChannelActions = {
    onSetDefault: handleSetDefault,
    onCloseOpen: handleCloseOpen,
    onClosePending: handleClosePending,
    onWebhook: handleWebhook,
    onChangeOrigin: handleChangeOrigin,
    onDiagnose: setDiagnoseTarget,
    onRegisterPin: setRegisterPinTarget,
    onShowWebhookInfo: setWebhookInfoTarget,
    onTransferChannel: setTransferTarget,
    onRefreshActivation: handleRefreshActivation,
    onGenerateWidget: handleGenerateWidget,
    onCopyDirectLink: handleCopyDirectLink,
    onToggleDirectLink: handleToggleDirectLink,
  };

  const stats = useMemo(() => ({
    total: sessions.length,
    connected: sessions.filter(s => s.status === "CONNECTED").length,
    disconnected: sessions.filter(s => s.status === "DISCONNECTED").length,
    other: sessions.filter(s => s.status !== "CONNECTED" && s.status !== "DISCONNECTED").length,
  }), [sessions]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    if (groupBy === "tenant") {
      const map = new Map<string | number, { label: string; sublabel: string; sessions: Session[] }>();
      for (const s of sessions) {
        const k = s.tenantId ?? "unknown";
        if (!map.has(k)) map.set(k, {
          label: s.tenantName || String(s.tenantId) || "—",
          sublabel: s.tenantId ? `ID ${s.tenantId}` : "",
          sessions: [],
        });
        map.get(k)!.sessions.push(s);
      }
      return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    }
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const raw = s.type || "whatsapp";
      const k = raw.startsWith("hub") ? "hub" : raw;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, sessions]) => {
        const labelKey = TYPE_LABEL_MAP[type];
        const label = labelKey ? tS(labelKey as Parameters<typeof tS>[0]) : type;
        return { label, sublabel: "", sessions };
      });
  }, [sessions, groupBy]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-36 sm:w-44 h-9">
              <Layers className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={t("groupBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("groupByNone")}</SelectItem>
              <SelectItem value="tenant">{t("groupByTenant")}</SelectItem>
              <SelectItem value="provider">{t("groupByProvider")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} title={t("refresh")}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("refresh")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLidConsolidationOpen(true)}
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            title={t("lidConsolidationButton")}
          >
            <ShieldAlert className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("lidConsolidationButton")}</span>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} title={t("newSession")}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("newSession")}</span>
          </Button>
        </div>
      </PageHeader>

      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted"><Wifi className="h-4 w-4 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">{t("statTotal")}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-success/10"><Wifi className="h-4 w-4 text-success" /></div>
            <div><p className="text-2xl font-bold text-success">{stats.connected}</p><p className="text-xs text-muted-foreground">{t("statConnected")}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10"><WifiOff className="h-4 w-4 text-destructive" /></div>
            <div><p className="text-2xl font-bold text-destructive">{stats.disconnected}</p><p className="text-xs text-muted-foreground">{t("statDisconnected")}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-warning/10"><Activity className="h-4 w-4 text-warning" /></div>
            <div><p className="text-2xl font-bold text-warning">{stats.other}</p><p className="text-xs text-muted-foreground">{t("statOther")}</p></div>
          </CardContent></Card>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Wifi} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : groups ? (
        <div className="space-y-3">
          {groups.map(({ label, sublabel, sessions: items }) => (
            <GroupCard key={label + sublabel} label={label} sublabel={sublabel} sessions={items} t={t} onDelete={handleDelete} onEdit={s => { setEditing(s); setDialogOpen(true); }} onConnect={handleConnect} onViewQr={handleViewQr} onDisconnect={handleDisconnect} actions={channelActions} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <SessionsTable sessions={sessions} t={t} onDelete={handleDelete} onEdit={s => { setEditing(s); setDialogOpen(true); }} onConnect={handleConnect} onViewQr={handleViewQr} onDisconnect={handleDisconnect} actions={channelActions} />
          </CardContent>
        </Card>
      )}

      <ChannelModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        tenants={tenants}
        onSaved={load}
      />

      {/* ─── QR Code Dialog ─── */}
      <Dialog open={qrDialogOpen} onOpenChange={v => { if (!v) handleQrClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary">{t("qrCodeTitle")}{qrSession ? ` — ${qrSession.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4 bg-white dark:bg-white rounded-lg px-4 min-h-[240px] justify-center">
            {qrLoading ? (
              <><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{t("qrCodeWaiting")}</p></>
            ) : qrSession?.status === "CONNECTED" ? (
              <p className="text-sm font-semibold text-success">{t("qrCodeConnected")}</p>
            ) : qrSession?.qrcode ? (
              (() => {
                const qr = qrSession.qrcode;
                if (qr.startsWith("data:")) return <img src={qr} alt="QR Code" className="w-64 h-64 object-contain bg-white p-1 rounded" />;
                if (/^[A-Za-z0-9+/]+=*$/.test(qr)) return <img src={`data:image/png;base64,${qr}`} alt="QR Code" className="w-64 h-64 object-contain bg-white p-1 rounded" />;
                return <div className="bg-white p-2 rounded" style={{ colorScheme: "light" }}><QRCodeSVG value={qr} size={256} bgColor="#ffffff" fgColor="#000000" /></div>;
              })()
            ) : (
              <><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{t("qrCodeWaiting")}</p></>
            )}
          </div>
          <p className="text-sm text-muted-foreground text-center">{t("qrCodeDesc")}</p>
          <DialogFooter className="flex gap-2 justify-center">
            <Button variant="outline" onClick={handleQrNew} disabled={qrNewLoading || qrSession?.status === "CONNECTED"}>
              {qrNewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("qrCodeNewBtn")}
            </Button>
            <Button variant="ghost" onClick={handleQrClose}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LidConsolidationDialog open={lidConsolidationOpen} onOpenChange={setLidConsolidationOpen} />

      {/* ─── Diagnóstico de saúde (Meta) ─── */}
      <DiagnoseModal
        open={diagnoseTarget !== null}
        onOpenChange={(open) => { if (!open) setDiagnoseTarget(null); }}
        whatsappId={diagnoseTarget?.id ?? null}
        channelName={diagnoseTarget?.name}
        channelType={diagnoseTarget?.type}
        crossTenant
        onRevalidated={(needsRevalidation) => {
          if (diagnoseTarget) {
            setSessions(prev => prev.map(w => w.id === diagnoseTarget.id ? { ...w, webhookNeedsRevalidation: needsRevalidation } : w));
          }
        }}
        onReconnect={() => {
          if (diagnoseTarget) {
            const action = diagnoseTarget.type === "waba" ? "waba" : diagnoseTarget.type === "instagram" ? "instagram" : "messenger";
            handleWebhook(diagnoseTarget, action);
          }
        }}
      />

      {/* ─── Registrar PIN (WABA) ─── */}
      <RegisterPinDialog
        channel={registerPinTarget as unknown as Whatsapp}
        open={registerPinTarget !== null}
        onOpenChange={(open) => { if (!open) setRegisterPinTarget(null); }}
        onSuccess={() => load()}
      />

      {/* ─── Webhook info BSP (Dialog360/Gupshup) ─── */}
      <Dialog open={webhookInfoTarget !== null} onOpenChange={(open) => { if (!open) setWebhookInfoTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tS("showWebhookInfo")} — {webhookInfoTarget?.name}</DialogTitle>
          </DialogHeader>
          {webhookInfoTarget && (webhookInfoTarget.type === "dialog360" || webhookInfoTarget.type === "gupshup") && (
            <BspWebhookInfoCard
              channelType={webhookInfoTarget.type as "dialog360" | "gupshup"}
              whatsappId={Number(webhookInfoTarget.id)}
              crossTenant
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebhookInfoTarget(null)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Alterar origem do webhook (Meta) ─── */}
      <Dialog open={originChangeTarget !== null} onOpenChange={(open) => { if (!open && !originChangeLoading) setOriginChangeTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tS("changeWebhookOrigin")}</DialogTitle>
            <DialogDescription>{tS("changeWebhookOriginDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              {tS("channel")}: <span className="font-semibold text-foreground">{originChangeTarget?.name}</span>
            </div>
            <RadioGroup value={originChangeValue} onValueChange={(v) => setOriginChangeValue(v as "own_app" | "zdg_oauth")}>
              <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50" onClick={() => setOriginChangeValue("own_app")}>
                <RadioGroupItem value="own_app" id="origin-own" className="mt-1" />
                <label htmlFor="origin-own" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">{tS("webhookOriginOwnFull")}</div>
                  <div className="text-xs text-muted-foreground">{tS("webhookOriginOwnHint")}</div>
                </label>
              </div>
              <div className="flex items-start space-x-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50" onClick={() => setOriginChangeValue("zdg_oauth")}>
                <RadioGroupItem value="zdg_oauth" id="origin-zdg" className="mt-1" />
                <label htmlFor="origin-zdg" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">{tS("webhookOriginZdgFull")}</div>
                  <div className="text-xs text-muted-foreground">{tS("webhookOriginZdgHint")}</div>
                </label>
              </div>
            </RadioGroup>
            <div className="text-xs text-warning flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{tS("changeWebhookOriginWarning")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={originChangeLoading} onClick={() => setOriginChangeTarget(null)}>{tS("cancel")}</Button>
            <Button disabled={originChangeLoading || originChangeTarget?.webhookOrigin === originChangeValue} onClick={() => confirmChangeOrigin()}>
              {originChangeLoading ? tS("saving") : tS("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transferência de canal ─── */}
      <Dialog open={!!transferTarget} onOpenChange={(o) => { if (!o) { setTransferTarget(null); setTransferNewChannelId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tS("transferChannelTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{tS("transferChannelDesc1")}</p>
            <p>{tS("transferChannelDesc2")}</p>
            <p>{tS("transferChannelDesc3")}</p>
          </div>
          <div className="mt-2">
            <Select value={transferNewChannelId} onValueChange={setTransferNewChannelId}>
              <SelectTrigger><SelectValue placeholder={tS("transferChannelSelectPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {sessions
                  .filter((c) => TRANSFER_CHANNEL_OPTIONS_TYPES.includes(c.type) && c.id !== transferTarget?.id && c.tenantId === transferTarget?.tenantId)
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setTransferTarget(null); setTransferNewChannelId(""); }}>{tS("cancel")}</Button>
            <Button onClick={handleTransferChannel} disabled={transferLoading}>
              {transferLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tS("transferChannelConfirmBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Widget webchat: opções ─── */}
      <Dialog open={!!widgetPendingItem} onOpenChange={(o) => !o && setWidgetPendingItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tS("generateWidget")} — {widgetPendingItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox id="sessoestenants-enableMenuButtons" checked={enableMenuButtons} onCheckedChange={(v) => setEnableMenuButtons(!!v)} />
            <div className="space-y-0.5">
              <label htmlFor="sessoestenants-enableMenuButtons" className="text-sm font-medium leading-none cursor-pointer">{tS("enableMenuButtons")}</label>
              <p className="text-xs text-muted-foreground">{tS("enableMenuButtonsDesc")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetPendingItem(null)}>{tS("cancelBtn")}</Button>
            <Button onClick={handleConfirmGenerate} disabled={widgetLoading}>
              <Download className={`mr-2 h-4 w-4 ${widgetLoading ? "animate-pulse" : ""}`} />
              {widgetLoading ? tS("widgetGenerating") : tS("generateWidget")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Widget webchat: código ─── */}
      <Dialog open={widgetModalOpen} onOpenChange={setWidgetModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tS("widgetModalTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button onClick={handleCopyWidgetCode} disabled={widgetCopying} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              {widgetCopying ? tS("widgetCopying") : tS("widgetCopyCode")}
            </Button>
            <Textarea value={widgetCode} readOnly className="font-mono text-xs min-h-[300px]" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
