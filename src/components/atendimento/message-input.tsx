"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Smile, Paperclip, Send, Mic, Square, X, Image as ImageIcon,
  FileText, MapPin, Contact2, MessageSquareQuote,
  Video, MoreVertical, Sticker, FileImage, PenLine,
  Sparkles, CalendarClock, Mail, Settings2, Loader2, Bot, LayoutGrid,
  LayoutList, MousePointerClick, Link2, Navigation, Workflow,
  Reply, BookOpen, Ghost, AtSign, Zap, ChevronRight, Plus, Trash2,
  BarChart2, MessageSquare, ExternalLink, Menu, Search,
  Package, ShoppingCart, ShieldCheck, GalleryHorizontalEnd, Layers,
  Receipt, Phone, List, Tag, FolderOpen, Forward, Clock,
  StickyNote, CheckCircle2, Copy, Info, ChevronDown, Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import UazapiInteractiveDialog from "./uazapi-interactive-dialog";
import { sendUazapiMenu } from "@/services/uazapi-interactive";
import { sendEvoGoMenu } from "@/services/evogo-interactive";
import { ProductPickerDialog } from "./product-picker-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import type { Message } from "@/stores/ticket-store";
import { useTicketStore } from "@/stores/ticket-store";
import { useAuthStore } from "@/stores/auth-store";
import { useChatDraftStore } from "@/stores/chat-draft-store";
import { fetchGallery, fetchGalleryBlob, getGalleryPreviewUrl, type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { matchesAllTerms } from "@/lib/text-search";
import { handleTicketAccessDenied } from "@/lib/ticket-access-denied";
import { listMedia, getMediaComments, type InstagramMedia, type InstagramComment } from "@/services/instagram";
import { listPagePosts, getPostComments, type FacebookPost, type FacebookComment } from "@/services/facebook";
import {
  GenericTemplateBuilder, buildGenericElements, hasValidGenericElement, emptyGenericElement,
  type GenericTemplateElement,
} from "./generic-template-builder";
import { fetchContacts, type Contact } from "@/services/contacts";
import { createGoogleMeetLink } from "@/services/google-calendar";
import { createTicketNote } from "@/services/notes";
import {
  fetchMessages, fetchQuickReplies, sendTypingIndicator, sendStopTypingIndicator, sendRecordingIndicator,
  sendEmailWebmail, listHubTemplates, sendHubTemplate,
  sendGhostMessage, sendMentionMessage, sendMentionAllMessage, sendButtonMessage,
  listMentionParticipants, type MentionParticipant,
  sendInteractiveQuickReply, sendInteractiveSingleSelect, sendInteractiveCatalog,
  sendInteractiveCarousel, sendInteractiveCTAButtons, sendInteractiveMenuText, sendInteractivePoll,
  sendInteractivePixButton,
  sendInteractiveCtaCopy, sendInteractiveCtaUrl, sendInteractiveCtaCall,
  sendWabaButtons, sendWabaList, sendWabaCTAURL, sendWabaReplyButtons,
  sendWabaAddress, sendWabaLocationRequest, sendWabaLocationMsg, sendWabaFlow,
  sendWabaTemplateComponents,
  sendWabaTemplateMsg, getWabaTemplates, type WabaTemplate,
  // (filtro de categoria importado abaixo)
  sendLocation, sendVcard,
  sendWabaSingleProduct, sendWabaMultiProduct, sendWabaCatalog, sendWabaTemplateAuth, sendWabaTemplateCarousel,
  sendInstagramQuickReply, sendInstagramGenericTemplate, sendInstagramHumanAgentText, sendInstagramPrivateReply,
  sendInstagramButtonTemplate,
  getInstagramIceBreakers, setInstagramIceBreakers, deleteInstagramIceBreakers,
  getInstagramPersistentMenu, setInstagramPersistentMenu, deleteInstagramPersistentMenu,
  sendMessengerQuickReply, sendMessengerGenericTemplate, sendMessengerButtonTemplate, sendMessengerPrivateReply,
  sendMessengerMediaTemplate, sendMessengerReceiptTemplate, sendMessengerMessageTag,
  sendMessengerCustomerFeedback,
  listMessengerTemplates, sendMessengerTemplateByName,
} from "@/services/messages";
import { resolveChannelForTemplates } from "@/services/channel-templates";
import { convertWebmBlobToMp3 } from "@/lib/audio-webm-to-mp3";
import {
  formatMaxFileSize,
  filterIncomingChatFiles,
  namePastedFile,
  shouldDeferPasteToText,
  PASTE_MAX_FILES,
  CHAT_MAX_FILE_SIZE,
  type ChatFileRejection,
  type ChatFileRejectionReason,
} from "@/lib/chat-upload-validation";
import { buildEmailReplyInfo } from "@/lib/email-reply";
// W3-B: hook agnóstico de BSP — adicionado em paralelo aos sendWaba* legados.
// Os call sites WABA permanecem inalterados (zero regressão). O hook fica
// disponível para futuros call sites que precisem rotear por whatsapp.type
// (Dialog360 / Gupshup) sem reescrever a UX existente.
import { useChannelSender, type ChannelSenderSet } from "@/hooks/use-channel-sender";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useReadableToneColor } from "@/hooks/use-readable-tone-color";
import { normalizeBrPhone } from "@/lib/phone-utils";
import { EMOJI_CATEGORIES } from "@/lib/emoji-data";
import { CopilotPanel } from "@/components/atendimento/copilot-panel";
import {
  TemplateCategorySelect,
  type TemplateCategoryFilter,
  matchTemplateCategory,
} from "@/components/atendimento/template-category-filter";
import { suggestReply } from "@/services/copilot";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { checkFileForChannel, checkGalleryItemForChannel } from "@/lib/channel-file-limits";
import { buildSignedBody } from "@/lib/signature";
import { WABA_LIMITS } from "@/lib/waba-text-limits";
// Cobranca (template ORDER_DETAILS) — caminho paralelo (D0 do plano).
// Nada aqui roda para template comum/marketing/auth/carrossel/catalogo.
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  computeTotal,
  formatCentsBRL,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { templateBodyHasVariables } from "@/utils/template-builder";

type WabaModalType =
  | "" | "buttons" | "list" | "templates" | "ctaurl"
  | "replybuttons" | "address" | "locationreq" | "location" | "flow"
  | "singleproduct" | "multiproduct" | "catalog" | "templateauth" | "carousel";

type GroupModalType = "" | "ghost" | "mention" | "interactive";
type InteractiveType = "quickReply" | "singleSelect" | "ctaButtons" | "menuText" | "poll" | "catalog" | "carousel" | "pixButton" | "ctaCopy" | "ctaUrl" | "ctaCall";

type HeaderType = "text" | "image" | "video" | "document";

interface QuickReply {
  id: number;
  key: string;
  message: string;
  media?: string;
  mediasJson?: string;
  voice?: string;
  userId?: number;
  isPublic?: boolean;
  messageType?: "text" | "buttons" | "list" | "template";
  buttonsJson?: string;
  listJson?: string;
  templateJson?: string;
}

interface MessageInputProps {
  ticketId: number;
  ticketStatus?: string;
  channelType?: string;
  ticket?: Record<string, unknown>;
  replyTo: Message | null;
  onClearReply: () => void;
  onSendText: (text: string, quotedMsg?: Message, opts?: { forceLinked?: boolean }) => void;
  onSendMedia: (file: File, caption: string, quotedMsg?: Message, isSticker?: boolean) => void;
  onSendLocation: (lat: number, lng: number, name?: string, address?: string) => void;
  onScheduleMessage?: () => void;
  onMultiForward?: () => void;
  onOpenEmailModal?: () => void;
  disabled?: boolean;
  userName?: string | null;
  signatureEnabled?: boolean;
  onToggleSignature?: (enabled: boolean) => void;
  detailOpen?: boolean;
}

// ── Helper: Header form section (shared by CTA URL, Reply Buttons, Flow) ─────
function HeaderSection({
  headerType, setHeaderType, headerText, setHeaderText, headerLink, setHeaderLink, t,
}: {
  headerType: HeaderType; setHeaderType: (v: HeaderType) => void;
  headerText: string; setHeaderText: (v: string) => void;
  headerLink: string; setHeaderLink: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{t("headerType")}</Label>
      <Select value={headerType} onValueChange={(v) => setHeaderType(v as HeaderType)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="text">{t("text")}</SelectItem>
          <SelectItem value="image">{t("image")}</SelectItem>
          <SelectItem value="video">{t("video")}</SelectItem>
          <SelectItem value="document">{t("document")}</SelectItem>
        </SelectContent>
      </Select>
      {headerType === "text" ? (
        <Input
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder={t("headerTextPlaceholder")}
          className="h-8 text-xs"
          maxLength={WABA_LIMITS.headerText}
        />
      ) : (
        <Input
          value={headerLink}
          onChange={(e) => setHeaderLink(e.target.value)}
          placeholder={t("mediaUrlPlaceholder")}
          className="h-8 text-xs"
        />
      )}
    </div>
  );
}

// Janela de atendimento da Meta (customer service window). É SEMPRE 24h e é ela que
// libera texto livre — a janela de 72h dos anúncios (Free Entry Point) só define
// gratuidade, não permissão. Ver docs/PLANO_JANELA_FEP_72H.md.
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

const COPILOT_PROVIDER_LABELS: Record<string, string> = {
  openai: "ChatGPT",
  groq: "Grok",
  claude: "Claude",
  gemini: "Gemini",
};

// Cobranca: codigo do backend (AppError -> { error: "ERR_ORDER_DETAILS_*" }) para
// a chave i18n do namespace `orderDetails`. Codigo fora do mapa cai no fallback
// generico com o codigo anexado (util para suporte).
const ORDER_DETAILS_ERROR_KEYS: Record<string, string> = {
  ERR_ORDER_DETAILS_TOTAL_INVALID: "errorTotalZero",
  ERR_ORDER_DETAILS_PAYMENT_REQUIRED: "errorPaymentRequired",
  ERR_ORDER_DETAILS_PIX_CODE_REQUIRED: "errorPixRequired",
  ERR_ORDER_DETAILS_PIX_CRC: "errorPixInvalid",
  ERR_ORDER_DETAILS_PIX_INVALID: "errorPixInvalid",
  ERR_ORDER_DETAILS_PIX_MISMATCH: "errorPixMismatch",
  ERR_ORDER_DETAILS_PIX_KEY_MISMATCH: "errorPixKeyMismatch",
  ERR_ORDER_DETAILS_PIX_NOT_ALLOWED: "errorPixNotAllowed",
  ERR_ORDER_DETAILS_LINK_INVALID: "errorLinkInvalid",
  ERR_ORDER_DETAILS_BOLETO_INVALID: "errorBoletoInvalid",
  ERR_ORDER_DETAILS_ITEM_QUANTITY: "errorQuantity",
  ERR_ORDER_DETAILS_ITEM_AMOUNT: "errorAmount",
  ERR_ORDER_DETAILS_SUBTOTAL_MISMATCH: "errorTotalMismatch",
  ERR_ORDER_DETAILS_AMOUNT_MISMATCH: "errorTotalMismatch",
  ERR_ORDER_DETAILS_EXPIRATION_TOO_SOON: "errorExpirationTooSoon",
  ERR_ORDER_DETAILS_EXPIRATION_DESCRIPTION_REQUIRED: "errorExpirationDescription",
  ERR_ORDER_DETAILS_NOT_ALLOWED: "errorNotAllowed",
  ERR_ORDER_DETAILS_FEATURE_DISABLED: "errorNotAllowed",
};

export function MessageInput({
  ticketId,
  ticketStatus = "open",
  channelType,
  ticket,
  replyTo,
  onClearReply,
  onSendText,
  onSendMedia,
  onSendLocation,
  onScheduleMessage,
  onMultiForward,
  onOpenEmailModal,
  disabled,
  userName,
  signatureEnabled = true,
  onToggleSignature,
  detailOpen = false,
}: MessageInputProps) {
  const t = useTranslations("messageInput");
  const tR = useTranslations("rewriteIa");
  const tS = useTranslations("summarizeIa");
  const tC = useTranslations("copilot");
  const tWaba = useTranslations("inputMensagem");
  const tChat = useTranslations("atendimentoChat");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  // W3-B: senders BSP-agnostico — disponivel para call sites que precisem
  // rotear envio por whatsapp.type (waba | dialog360 | gupshup). As chamadas
  // sendWaba* legadas (UX existente WABA) permanecem inalteradas.
  const senders: ChannelSenderSet = useChannelSender(
    (ticket?.whatsapp as { type?: string } | undefined)?.type,
  );
  const { isLiveMode } = useLiveMode();
  const { user, getConfigValue } = useAuthStore();
  // Boolean derivado (não o objeto planFeatures) para servir de dep de efeito sem
  // re-disparar quando o snapshot do plano é regravado com o mesmo conteúdo.
  const hasAiFeature = useAuthStore((s) => s.hasFeature("aiIntegrations"));
  // Cobranca: o formulario ja se bloqueia sozinho (OrderDetailsFields), mas o
  // botao de envio precisa acompanhar — senao continua clicavel para so falhar
  // com 403 no backend.
  const canSendCharge = useAuthStore((s) => s.canSendCharge());
  const chatgptAtivo = getConfigValue("chatgptAtivo") === "enabled";
  const copilotEnabled = getConfigValue("copilot") === "enabled";
  const copilotRewriteAlwaysVisible = copilotEnabled && getConfigValue("copilotRewriteAlwaysVisible") === "enabled";
  const copilotAutoSuggest = copilotEnabled && getConfigValue("copilotAutoSuggest") === "enabled";
  const whatsapp = ticket?.whatsapp as { chatgptApiKey?: string; chatgptModel?: string; pixDefaultKey?: string; pixDefaultType?: string; pixDefaultName?: string; pixDefaultMessage?: string } | undefined;
  const tenantId = user?.tenantId;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";
  const ch = (channelType || "").toLowerCase();
  const isWebmail = ch === "webmail" || ch === "email";
  const isWaba = ch === "waba";
  const isGupshup = ch === "gupshup";
  const isDialog360 = ch === "dialog360";
  // BSPs (Gupshup / Dialog360) compartilham os mesmos formatos do WABA Meta —
  // gates de UI usam isWabaLike pra liberar templates, buttons, list, etc.
  const isWabaLike = isWaba || isGupshup || isDialog360;
  const isWebchat = ch === "webchat" || ch.includes("webchat");
  const isHub = ch.includes("hub");
  const isInstagram = ch === "instagram";
  const isMessenger = ch === "messenger";
  const isBaileys = ch === "baileys";
  const isEvo = (ch === "evo" || ch === "evolution");
  const isEvoGo = ch === "evogo";
  const isZapi = ch.includes("zapi") && !ch.includes("uazapi");
  const isUazapi = ch.includes("uazapi");
  const isZapo = ch === "zapo";
  const isDefaultWpp = ch === "whatsapp";
  const isNonWabaWpp = isBaileys || isEvo || isEvoGo || isZapi || isUazapi || isZapo || isDefaultWpp;
  const isHubEmail = ch === "hub_email";
  const isHubWaba = ch === "hub_whatsapp_business_account";
  const isEmailChannel = isWebmail || isHubEmail; // canais que só enviam email

  // Extract ticket data
  const ticketData = ticket as { whatsapp?: { tokenAPI?: string; id?: number }; contact?: { number?: string; instagramPK?: string | number; messengerId?: string | number }; whatsappId?: number; isGroup?: boolean; lastMessageReceived?: string | number } | undefined;

  const isGroup = !!ticketData?.isGroup;
  const supportsGhostMention = isNonWabaWpp && isGroup;
  // Autocomplete @menção inline (estilo WhatsApp). Por ora só canais que enviam
  // sem wabaId: Baileys, Zapo e whatsapp-web.js. Evolution precisa de wabaId (TODO).
  const supportsInlineMention = isGroup && (isBaileys || isZapo || isDefaultWpp);
  // .includes (e não ===): a imagem Docker Hub é buildada com o placeholder
  // __ZPRO_INTERACTIVE_BAILEYS__ nesta env, substituído por true/false pelo
  // docker-entrypoint.sh no startup. Comparação === com o literal inlined seria
  // constant-foldada pelo minifier (vira !1) e o placeholder sumiria do bundle.
  const isInteractiveBaileysEnabled = (process.env.NEXT_PUBLIC_INTERACTIVE_BAILEYS || 'false').includes('true');
  const supportsInteractive = (isBaileys || isZapo) && isInteractiveBaileysEnabled; // cta/menu/poll (+catalogo/carousel so baileys) — requer NEXT_PUBLIC_INTERACTIVE_BAILEYS=true
  const supportsInteractiveCore = isBaileys || isZapo; // Botoes / Lista / Botao PIX — liberado por default no WSocket fork
  const supportsSticker = ["whatsapp", "baileys", "meow", "evo", "evogo", "zapi", "uazapi", "zapo", "instagram", "waba", "gupshup", "dialog360"].includes(ch);
  const supportsTyping = isDefaultWpp || isBaileys || isEvo || isEvoGo || isZapo || ch === "meow" || ch === "uazapi";
  const supportsAudio = !isWebchat;
  const supportsFiles = true;
  const supportsAttachmentWithCaption = !isHub && !isInstagram;
  const supportsQuickReplies = !isHub;
  const tokenApi = ticketData?.whatsapp?.tokenAPI || "";
  // Instagram contacts store IGSID in instagramPK (number is null for Instagram)
  // Messenger contacts store PSID in messengerId
  const _contact = ticketData?.contact as any;
  const contactFrom = (
    (_contact?.instagramPK ? String(_contact.instagramPK) : null) ||
    (_contact?.messengerId ? String(_contact.messengerId) : null) ||
    _contact?.number ||
    ""
  );
  const whatsappId = ticketData?.whatsapp?.id ?? ticketData?.whatsappId ?? 0;

  // ── Auto-cura do tokenAPI do canal ───────────────────────────────────────
  // O ticket vindo da LISTA (/tickets) traz whatsapp = {id, name} apenas — so o
  // ShowTicketService (/tickets/:id) devolve tokenAPI. Enquanto o ticket aberto
  // esta nesse estado (aceitar pelo card da lista, fetch do detalhe falhando,
  // transferencia de canal por socket, sessoes ainda carregando pos-login) todo
  // envio WABA abortava com "wabaTokenNotFound" ate re-selecionar o ticket.
  // Resolve o token pelo /whatsapp e guarda pro payload de envio.
  // Ref e nao state: os handlers leem o valor no MESMO tick em que o curam.
  // Chaveado por whatsappId pra nunca vazar token de um canal pro ticket de outro.
  const healedTokenRef = React.useRef<{ whatsappId: number; token: string } | null>(null);
  const getHealedToken = useCallback(() => {
    const healed = healedTokenRef.current;
    return healed && whatsappId && healed.whatsappId === whatsappId ? healed.token : "";
  }, [whatsappId]);
  // Best-effort: devolve "" se nao conseguir resolver — o caller decide abortar.
  // Custo zero quando o ticket ja tem o token (retorna na hora, sem refetch).
  const ensureWabaToken = useCallback(async (): Promise<string> => {
    if (tokenApi) return tokenApi;
    const cached = getHealedToken();
    if (cached) return cached;
    if (!whatsappId) return "";
    try {
      const resolved = await resolveChannelForTemplates({ id: whatsappId, type: "waba" });
      const token = resolved.tokenAPI || "";
      if (token) healedTokenRef.current = { whatsappId, token };
      return token;
    } catch { return ""; }
  }, [tokenApi, getHealedToken, whatsappId]);

  // Cura em background pros handlers que montam o payload de forma SINCRONA (igBase,
  // Instagram/Messenger): eles nao tem ponto de await pra chamar ensureWabaToken.
  // O atraso mantem o custo zero no caminho normal — o detalhe (/tickets/:id) chega
  // antes, tokenApi vira truthy e o efeito e limpo sem gastar request; so o ticket
  // que ficou REALMENTE preso na versao magra paga o /whatsapp.
  React.useEffect(() => {
    if (tokenApi || !whatsappId) return;
    if (!isWabaLike && !isInstagram && !isMessenger) return;
    const timer = setTimeout(() => { void ensureWabaToken(); }, 1000);
    return () => clearTimeout(timer);
  }, [tokenApi, whatsappId, isWabaLike, isInstagram, isMessenger, ensureWabaToken]);

  // ── Janela de 24 horas (WABA / Hub / Instagram / Messenger) ──────────────
  // Vue: desabilitarInput — canal waba/hub: desabilita se última mensagem > 24h
  const windowChannels = isWabaLike || isHub || isInstagram || ch === "messenger";
  const [windowClosed, setWindowClosed] = React.useState(false);
  const [windowRemainingMs, setWindowRemainingMs] = React.useState<number | null>(null);
  const skewWarnedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!windowChannels) { setWindowClosed(false); setWindowRemainingMs(null); return; }
    const raw = ticketData?.lastMessageReceived;
    if (!raw) { setWindowClosed(true); setWindowRemainingMs(null); return; }
    const lastMsg = new Date(typeof raw === "number" ? raw : Number(raw));
    const expiresAt = lastMsg.getTime() + WINDOW_24H_MS;
    const update = () => {
      // `lastMessageReceived` é gravado com o relógio do SERVIDOR e o Date.now() daqui
      // é o do NAVEGADOR. Com os dois dessincronizados o valor bruto passa de 24h (um
      // cliente viu "Tempo restante: 33h" numa janela de 24h). O teto mantém o banner
      // honesto: não existe janela maior que 24h para texto livre.
      const rawRemaining = expiresAt - Date.now();
      const remaining = Math.min(rawRemaining, WINDOW_24H_MS);
      if (rawRemaining > WINDOW_24H_MS && skewWarnedRef.current !== ticketId) {
        // Uma vez por ticket (o intervalo roda a cada 1s): o clamp esconde o sintoma,
        // então sem isto o relógio torto ficaria invisível — e ele também fecha a
        // janela cedo demais, gerando 131047 no envio.
        skewWarnedRef.current = ticketId;
        console.warn(
          `[janela24h] relogios dessincronizados: lastMessageReceived esta ~${Math.round((rawRemaining - WINDOW_24H_MS) / 60000)}min a frente deste navegador (ticket ${ticketId}). Conferir a hora do servidor e a da maquina do operador.`
        );
      }
      setWindowClosed(remaining <= 0);
      setWindowRemainingMs(remaining > 0 ? remaining : null);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [windowChannels, ticketData?.lastMessageReceived]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modo híbrido disponível: canal WABA em coexistência, com canal vinculado CONNECTED.
  // Habilita a oferta de "enviar pela conexão vinculada" quando a janela 24h fecha.
  const hybridLinkedReady = useWhatsappStore((s) => {
    if (!isWaba) return false;
    const w = s.whatsapps.find((x) => x.id === whatsappId);
    if (!w || w.hybridMode !== "coexistence" || !w.linkedChannelId) return false;
    const linked = s.whatsapps.find((x) => x.id === w.linkedChannelId);
    return !!linked && linked.status === "CONNECTED";
  });

  // Janela 24h fechada + híbrido pronto: a caixa continua utilizável, mas SÓ TEXTO
  // desvia pela conexão vinculada (os handlers de mídia/interativo do backend não
  // aceitam forceLinked — iriam pro caminho oficial e a Meta rejeitaria).
  const hybridTextOnly = windowClosed && hybridLinkedReady;

  // Botão "Enviar template" do banner de janela fechada: `text-warning` cru fica
  // ilegível no tema claro (âmbar sobre âmbar, ~2:1). O controle de luminância
  // mantém a matiz da marca e só escurece/clareia até 4.5:1 contra o fundo real —
  // bg-warning/10 do banner + hover:bg-warning/10 do botão (~0.19 de opacidade).
  const readableWarning = useReadableToneColor("warning", 0.19);

  // ── Guard: disabled ───────────────────────────────────────────────────
  // windowClosed: waba/hub/instagram/messenger desabilita após 24h sem resposta.
  // Exceção: coexistência com canal vinculado CONNECTED — o texto segue enviável
  // pela conexão vinculada (hybridTextOnly), então a caixa não trava.
  // Declarado aqui, e não junto do JSX, porque stageFiles lê isDisabled: um const
  // depois do useCallback quebraria em TDZ na avaliação do array de deps.
  const isDisabled = disabled || ticketStatus === "closed" || (windowClosed && !hybridLinkedReady);

  // Janela 24h fechou — apaga rascunho preso (texto inenviavel mantido na caixa).
  // Exceção: com híbrido disponível o texto AINDA é enviável (pela conexão vinculada),
  // então não apagamos o rascunho.
  React.useEffect(() => {
    if (!windowChannels || !windowClosed || !ticketId || hybridLinkedReady) return;
    if (text) setText("");
    useChatDraftStore.getState().clearDraft(ticketId);
  }, [windowChannels, windowClosed, ticketId, hybridLinkedReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatWindowRemaining = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    if (m > 0) return `${m}m ${pad(s)}s`;
    return `${s}s`;
  };
  // tokenApi do payload cai no token curado quando o ticket aberto veio sem ele:
  // o backend resolve o canal por `where: { tokenAPI: tokenApi }` e responderia
  // ERR_WHATSAPP_TENANTID com string vazia.
  const wabaBase = useCallback(() => ({
    read: 1, fromMe: true, mediaUrl: "",
    from: normalizeBrPhone(contactFrom), tokenApi: tokenApi || getHealedToken(), ticketId,
    idFront: `front-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }), [contactFrom, tokenApi, ticketId, getHealedToken]);

  // bspBase — payload comum para Gupshup/Dialog360. Os controllers backend
  // (Gupshup loadSendContext, Dialog360 prepareChannel) exigem ticketId; o guard
  // sendGupshupChannelGuard / sendDialog360ChannelGuard injeta req.whatsapp via
  // whatsappId. Mantém wabaBase intacto pra preservar fluxo WABA.
  const bspBase = useCallback(() => ({
    ...wabaBase(),
    whatsappId,
  }), [wabaBase, whatsappId]);

  const applySignature = useCallback((msg: string) => {
    if (!signatureEnabled || !userName?.trim() || !msg.trim()) return msg;
    // Só WhatsApp entende *texto* como negrito; demais canais vão só com o nome.
    return buildSignedBody(userName, msg, ch);
  }, [signatureEnabled, userName, ch]);

  // ── Core state ────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  // Persist unsent draft per ticket via chat-draft-store (localStorage-backed).
  // The store hydrates from localStorage on init so the ticket list and the
  // input share the same draft state without race conditions. On a ticket
  // switch we only LOAD (skipping the save branch) so the previous ticket's
  // text still in memory is never written under the new ticket's key.
  const setDraftStore = useChatDraftStore((s) => s.setDraft);
  const draftPrevTicketIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ticketId) return;
    if (draftPrevTicketIdRef.current !== ticketId) {
      setText(useChatDraftStore.getState().getDraft(ticketId));
      draftPrevTicketIdRef.current = ticketId;
      return;
    }
    setDraftStore(ticketId, text);
  }, [ticketId, text, setDraftStore]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchDevice(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteModel, setRewriteModel] = useState<string | null>(null);
  const [rewriteProvider, setRewriteProvider] = useState<string | null>(null);
  const [rewriteBackup, setRewriteBackup] = useState<string | null>(null);
  const [rewriteSources, setRewriteSources] = useState<{
    copilot: { available: boolean; provider?: string; model?: string };
    channel: { available: boolean; provider?: string; model?: string };
  }>({ copilot: { available: false }, channel: { available: false } });
  const [rewriteSource, setRewriteSource] = useState<"copilot" | "channel" | "auto">(() => {
    if (typeof window === "undefined") return "auto";
    const saved = window.localStorage.getItem("copilot:rewriteSource");
    return saved === "copilot" || saved === "channel" ? saved : "auto";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("copilot:rewriteSource", rewriteSource);
  }, [rewriteSource]);

  // Pre-fetch the copilot resolved config (provider/model + sources availability)
  // so the first rewrite already displays the correct model and the source picker
  // knows whether to render.
  useEffect(() => {
    if (!ticketId) return;
    // Plano sem IA: nem faz a chamada — este GET é automático (roda a cada ticket
    // aberto) e o 402 aparecia como "Este recurso não está incluído no seu plano"
    // sem o usuário ter pedido nada. `hasAiFeature` está nas deps porque o snapshot
    // do plano chega assíncrono no boot: quando chegar, reavalia e busca.
    if (!hasAiFeature) return;
    let cancelled = false;
    api.get<{
      provider: string | null;
      model: string | null;
      sources?: {
        copilot: { available: boolean; provider?: string; model?: string };
        channel: { available: boolean; provider?: string; model?: string };
      };
    }>(`/copilot/resolve`, { params: { ticketId }, ...BACKGROUND_REQUEST })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.provider) setRewriteProvider(data.provider);
        if (data.model) setRewriteModel(data.model);
        if (data.sources) setRewriteSources(data.sources);
      })
      .catch(() => { /* silencioso — fallback mostra "com IA" */ });
    return () => { cancelled = true; };
  }, [ticketId, hasAiFeature]);

  // Reflect provider/model when user picks an explicit source (so loading overlay matches).
  useEffect(() => {
    if (rewriteSource === "auto") return;
    const src = rewriteSources[rewriteSource];
    if (src?.provider) setRewriteProvider(src.provider);
    if (src?.model) setRewriteModel(src.model);
  }, [rewriteSource, rewriteSources]);
  const [rewritePopoverOpen, setRewritePopoverOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  // Permite abrir o copilot de fora (toast PA-16 dispara este evento global).
  useEffect(() => {
    const handler = () => setCopilotOpen(true);
    window.addEventListener("copilot:open", handler);
    return () => window.removeEventListener("copilot:open", handler);
  }, []);
  const [autoSuggestion, setAutoSuggestion] = useState("");
  const [autoSuggesting, setAutoSuggesting] = useState(false);
  const [autoSuggestionDismissed, setAutoSuggestionDismissed] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState("");
  const [summaryResultOpen, setSummaryResultOpen] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [noteFilePreview, setNoteFilePreview] = useState<string | null>(null);
  const [noteDropActive, setNoteDropActive] = useState(false);
  const [noteGalleryOpen, setNoteGalleryOpen] = useState(false);
  const [noteGalleryItems, setNoteGalleryItems] = useState<GalleryItem[]>([]);
  const [noteGalleryLoading, setNoteGalleryLoading] = useState(false);
  const [noteGallerySearch, setNoteGallerySearch] = useState("");
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const [summarizeForm, setSummarizeForm] = useState({
    period: "7d",
    sender: "all",
    type: "geral",
    max: "100",
    dest: "input",
  });
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [filteredReplies, setFilteredReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyHighlight, setQuickReplyHighlight] = useState(0);
  const quickReplyActiveRef = useRef<HTMLButtonElement | null>(null);
  const [pendingQrMedias, setPendingQrMedias] = useState<string[]>([]); // filenames
  const [pendingQrVoice, setPendingQrVoice] = useState(false);
  // Mensagem rápida estruturada (botões/lista) preparada (append) — enviada ao clicar em Enviar.
  const [pendingStructured, setPendingStructured] = useState<{ reply: QuickReply; mt: "buttons" | "list" } | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ file: File; url: string } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resize textarea whenever text changes programmatically (e.g. AI rewrite)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
  }, [text]);

  // Auto-suggest: reset e refetch quando muda o ticket OU quando chega nova
  // mensagem do cliente (para que novas sugestões apareçam sem precisar sair
  // e voltar ao ticket).
  const lastInboundMessageId = useTicketStore((s) => {
    const msgs = s.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m.fromMe && (!ticketId || m.ticketId === ticketId)) return m.id;
    }
    return null;
  });

  useEffect(() => {
    setAutoSuggestion("");
    setAutoSuggestionDismissed(false);
    if (!copilotAutoSuggest || !ticketId) return;
    let cancelled = false;
    setAutoSuggesting(true);
    suggestReply(ticketId).then((result) => {
      if (!cancelled) setAutoSuggestion(result.suggestion);
    }).catch(() => {
      // silently fail — auto-suggest is optional
    }).finally(() => {
      if (!cancelled) setAutoSuggesting(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, copilotAutoSuggest, lastInboundMessageId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Estado local para parar typing quando usuario para de digitar / muda de ticket / fecha aba.
  // Backend ja faz debounce de 150ms; aqui garantimos que o "stop" sempre seja enviado.
  const typingActiveRef = useRef<boolean>(false);
  // Envia "composing" só na transição parado→digitando e renova a cada 8s
  // (a presença expira ~10s no WhatsApp) — evita 1 POST por tecla.
  const lastTypingSentAtRef = useRef<number>(0);
  const lastTicketIdRef = useRef<number | null>(null);
  const ticketRef = useRef<Record<string, unknown> | undefined>(undefined);

  // ── WABA modal state ──────────────────────────────────────────────────
  const [wabaModal, setWabaModal] = useState<WabaModalType>("");
  const closeWaba = () => setWabaModal("");

  // ── Group / Interactive modal state ───────────────────────────────────
  const [groupModal, setGroupModal] = useState<GroupModalType>("");
  const closeGroup = () => setGroupModal("");

  // Ghost message
  const [ghostBody, setGhostBody] = useState("");

  // Mention message
  const [mentionBody, setMentionBody] = useState("");
  const [mentionType, setMentionType] = useState<"all" | "specific">("all");
  const [mentionParticipants, setMentionParticipants] = useState("");

  // ── Inline @mention (estilo WhatsApp) ────────────────────────────────────
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [mentionListData, setMentionListData] = useState<MentionParticipant[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionFetchedRef = useRef(false);
  // numero (só dígitos) -> userId (JID) selecionado no picker
  const selectedMentionsRef = useRef<Map<string, string>>(new Map());

  // Interactive message (Baileys)
  const [interactiveType, setInteractiveType] = useState<InteractiveType>("quickReply");
  const [interactiveBody, setInteractiveBody] = useState("");
  const [interactiveFooter, setInteractiveFooter] = useState("");
  const [interactiveHeaderTitle, setInteractiveHeaderTitle] = useState("");
  // Quick Reply & CTA buttons
  const [interactiveButtons, setInteractiveButtons] = useState<{ display_text: string; id: string; url?: string; type?: "url" | "call" | "copy"; phoneNumber?: string; copyText?: string }[]>([]);
  const [btnText, setBtnText] = useState(""); const [btnId, setBtnId] = useState(""); const [btnUrl, setBtnUrl] = useState("");
  const [ctaBtnType, setCtaBtnType] = useState<"url" | "call" | "copy">("url");
  // Single Select list
  const [listTitle, setListTitle] = useState("");
  const [listSections, setListSections] = useState<{ title: string; rows: { id: string; title: string; description?: string }[] }[]>([]);
  const [secTitle, setSecTitle] = useState(""); const [rowId, setRowId] = useState(""); const [rowTitle, setRowTitle] = useState(""); const [rowDesc, setRowDesc] = useState("");
  const [pendingRows, setPendingRows] = useState<Record<number, { title: string; id: string; desc: string }>>({});
  // Poll
  const [pollName, setPollName] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollSelectable, setPollSelectable] = useState(1);
  // PIX button
  const [pixKey, setPixKey] = useState("");
  const [pixType, setPixType] = useState<"CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP">("EVP");
  const [pixName, setPixName] = useState("");
  // CTA Copy / URL / Call
  const [ctaDisplayText, setCtaDisplayText] = useState("");
  const [ctaCopyCode, setCtaCopyCode] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaPhone, setCtaPhone] = useState("");
  // Menu text
  const [menuTitle, setMenuTitle] = useState("");
  const [menuOptions, setMenuOptions] = useState<string[]>([""]);
  // Catalog
  const [catalogDisplayText, setCatalogDisplayText] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [catalogProductIds, setCatalogProductIds] = useState("");
  // Carousel cards (InfiniteAPI nativeCarousel): título + imagem + texto + rodapé + botões (2–10 cartões)
  const CAROUSEL_MAX_CARDS = 10;
  const emptyCarouselCard = () => ({ title: "", mediaUrl: "", body: "", footer: "", collapsed: false, buttons: [{ display_text: "", id: "" }] });
  const [carouselCards, setCarouselCards] = useState<{ title: string; mediaUrl: string; body: string; footer: string; collapsed: boolean; buttons: { display_text: string; id: string }[] }[]>([emptyCarouselCard()]);
  // Galeria de imagens p/ o card do carrossel
  const [carGalleryOpen, setCarGalleryOpen] = useState(false);
  const [carGalleryItems, setCarGalleryItems] = useState<GalleryItem[]>([]);
  const [carGalleryLoading, setCarGalleryLoading] = useState(false);
  const [carGallerySearch, setCarGallerySearch] = useState("");
  const [carGalleryTarget, setCarGalleryTarget] = useState<number | null>(null);

  // Buttons
  const [wBtn, setWBtn] = useState({ msg: "", b1: "", b2: "", b3: "" });
  // List
  const [wList, setWList] = useState({
    header: "", body: "", btnText: "", footer: "",
    sections: [{ title: "", rows: [{ title: "", desc: "" }] }],
  });
  // CTA URL
  const [wCta, setWCta] = useState<{
    headerType: HeaderType; headerText: string; headerLink: string;
    body: string; btnText: string; btnUrl: string; footer: string;
  }>({ headerType: "text", headerText: "", headerLink: "", body: "", btnText: "", btnUrl: "", footer: "" });
  // Reply Buttons
  const [wRb, setWRb] = useState<{
    headerType: HeaderType; headerText: string; headerLink: string;
    body: string; footer: string; buttons: { id: string; title: string }[];
  }>({ headerType: "text", headerText: "", headerLink: "", body: "", footer: "", buttons: [{ id: "1", title: "" }, { id: "2", title: "" }, { id: "3", title: "" }] });
  // Address
  const [wAddr, setWAddr] = useState<{
    street1: string; street2: string; city: string; state: string;
    zip: string; country: string; type: "HOME" | "WORK";
  }>({ street1: "", street2: "", city: "", state: "", zip: "", country: "", type: "HOME" });
  // Location Request
  const [wLocReq, setWLocReq] = useState({ msg: "" });
  // Location
  const [wLoc, setWLoc] = useState({ lat: "", lng: "", name: "", addr: "" });
  // Flow
  const [wFlow, setWFlow] = useState<{
    headerType: HeaderType; headerText: string; headerLink: string;
    body: string; footer: string; flowId: string; flowName: string;
    flowCta: string; flowToken: string; action: "navigate" | "data_exchange"; payload: string;
  }>({
    headerType: "text", headerText: "", headerLink: "",
    body: "", footer: "", flowId: "", flowName: "",
    flowCta: "", flowToken: "", action: "navigate", payload: "",
  });
  // WABA product/catalog/auth modals
  const [wSingleProduct, setWSingleProduct] = useState({ catalogId: "", productId: "", body: "" });
  const [wMultiProduct, setWMultiProduct] = useState({ catalogId: "", body: "", header: "", footer: "", sectionTitle: "", productIds: "" });
  const [wCatalog, setWCatalog] = useState({ catalogId: "", thumbnailProductId: "", body: "" });
  const [wTemplateAuth, setWTemplateAuth] = useState({ templateName: "", language: "pt_BR", otpCode: "" });
  const [wCarousel, setWCarousel] = useState({ templateName: "", language: "pt_BR", cardsJson: "" });
  // Instagram interactive modals
  const [igModal, setIgModal] = useState<"" | "quickreply" | "generictemplate" | "humanagenttext" | "privatereply" | "buttontemplate" | "icebreakers" | "persistentmenu">("");
  const closeIg = () => setIgModal("");
  const [igQr, setIgQr] = useState({ message: "", replies: [{ title: "", payload: "" }] });
  const [igGeneric, setIgGeneric] = useState<{ elements: GenericTemplateElement[] }>({ elements: [emptyGenericElement()] });
  const [igText, setIgText] = useState("");
  const [igPrivate, setIgPrivate] = useState({ commentId: "", message: "" });
  const [igPrivateMedia, setIgPrivateMedia] = useState<InstagramMedia[]>([]);
  const [igPrivateComments, setIgPrivateComments] = useState<InstagramComment[]>([]);
  const [igPrivateSelectedMedia, setIgPrivateSelectedMedia] = useState("");
  const [igPrivateLoading, setIgPrivateLoading] = useState(false);
  const [igBtn, setIgBtn] = useState({ message: "", buttons: [{ type: "postback", title: "", payload: "" }] });
  const [igIceBreakers, setIgIceBreakers] = useState<{ question: string; payload: string }[]>([{ question: "", payload: "" }]);
  const [igIceBreakersLoading, setIgIceBreakersLoading] = useState(false);
  const [igMenu, setIgMenu] = useState<{ type: string; title: string; payload: string; url: string }[]>([{ type: "postback", title: "", payload: "", url: "" }]);
  const [igMenuLoading, setIgMenuLoading] = useState(false);
  // Messenger interactive modals
  const [msgrModal, setMsgrModal] = useState<"" | "quickreply" | "generictemplate" | "buttontemplate" | "privatereply" | "mediatemplate" | "receipttemplate" | "messagetag" | "feedback" | "approvedtemplate">("");
  const closeMsgr = () => setMsgrModal("");
  const [msgrQr, setMsgrQr] = useState({ message: "", replies: [{ title: "", payload: "" }] });
  const [msgrGeneric, setMsgrGeneric] = useState<{ elements: GenericTemplateElement[] }>({ elements: [emptyGenericElement()] });
  const [msgrApproved, setMsgrApproved] = useState<{
    templates: Array<{ id: string; name: string; status: string; category: string; language: string; components: Array<{ type: string; text?: string; format?: string }> }>;
    loading: boolean;
    selectedName: string;
    selectedLanguage: string;
    variables: string[];
  }>({ templates: [], loading: false, selectedName: "", selectedLanguage: "", variables: [] });
  const [msgrBtn, setMsgrBtn] = useState({ message: "", buttons: [{ type: "postback", title: "", payload: "" }] });
  const [msgrPrivate, setMsgrPrivate] = useState({ commentId: "", postId: "", message: "" });
  const [msgrPrivatePosts, setMsgrPrivatePosts] = useState<FacebookPost[]>([]);
  const [msgrPrivateComments, setMsgrPrivateComments] = useState<FacebookComment[]>([]);
  const [msgrPrivateSelectedPost, setMsgrPrivateSelectedPost] = useState("");
  const [msgrPrivateLoading, setMsgrPrivateLoading] = useState(false);
  // Loading centralizado para modais Instagram/Messenger — evita duplo clique no botao Enviar
  const [modalSending, setModalSending] = useState(false);
  const [msgrMedia, setMsgrMedia] = useState<{ mediaType: 'image' | 'video'; mediaUrl: string; buttons: { type: string; title: string; payload?: string; url?: string }[] }>({
    mediaType: 'image',
    mediaUrl: '',
    buttons: [{ type: 'postback', title: '', payload: '' }]
  });
  const [msgrMediaGalleryOpen, setMsgrMediaGalleryOpen] = useState(false);
  const [msgrReceipt, setMsgrReceipt] = useState({
    recipientName: '',
    orderNumber: '',
    currency: 'BRL',
    paymentMethod: '',
    totalCost: '',
    items: [{ title: '', price: '', quantity: '1' }]
  });
  const [msgrTag, setMsgrTag] = useState<{ tag: string; message: string }>({
    tag: 'ACCOUNT_UPDATE',
    message: ''
  });
  const [msgrFeedback, setMsgrFeedback] = useState<{
    title: string;
    subtitle: string;
    questionType: 'csat' | 'nps' | 'ces';
    questionTitle: string;
    expiresInDays: string;
    privacyUrl: string;
  }>({
    title: '',
    subtitle: '',
    questionType: 'csat',
    questionTitle: '',
    expiresInDays: '',
    privacyUrl: ''
  });

  // Templates
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<TemplateCategoryFilter>("all");
  // templateVars: { key: variable key, label: display label, value: user input }
  const [templateVars, setTemplateVars] = useState<{ key: string; label: string; value: string; filename?: string }[]>([]);
  // Cobranca (ORDER_DETAILS): estado proprio, isolado de templateVars. So e lido
  // quando o template selecionado e de cobranca — template comum nunca toca nele.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const isOrderDetailsSelected = useMemo(() => isOrderDetailsTemplate(selectedTemplate), [selectedTemplate]);

  // Hub template modal
  const [hubTemplateModal, setHubTemplateModal] = useState(false);
  const [hubTemplates, setHubTemplates] = useState<WabaTemplate[]>([]);
  const [loadingHubTemplates, setLoadingHubTemplates] = useState(false);
  const [selectedHubTemplate, setSelectedHubTemplate] = useState<WabaTemplate | null>(null);
  const [hubTemplateSearch, setHubTemplateSearch] = useState("");

  // Email modal
  const [emailModal, setEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailAttachments, setEmailAttachments] = useState<{ filename: string; content: string; contentType?: string }[]>([]);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const emailFileRef = useRef<HTMLInputElement>(null);

  // Gallery picker modal
  const [galleryModal, setGalleryModal] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryCaptions, setGalleryCaptions] = useState<Record<number, string>>({});
  const [gallerySelected, setGallerySelected] = useState<GalleryItem[]>([]);
  const [gallerySending, setGallerySending] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<"all" | "image" | "video" | "audio" | "document">("all");
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);

  // Template header gallery picker
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);

  // Caption dialog for single-file attachment
  const [captionModal, setCaptionModal] = useState(false);
  const [captionFile, setCaptionFile] = useState<File | null>(null);
  const [captionText, setCaptionText] = useState("");

  // Location dialog
  const [locationModal, setLocationModal] = useState(false);
  const [locLat, setLocLat] = useState("");
  const [locLng, setLocLng] = useState("");
  const [locName, setLocName] = useState("");
  const [locAddr, setLocAddr] = useState("");
  const [sendingLocation, setSendingLocation] = useState(false);

  // vCard dialog
  const [vcardModal, setVcardModal] = useState(false);
  const [uazapiInteractiveOpen, setUazapiInteractiveOpen] = useState(false);
  const [vcardFullName, setVcardFullName] = useState("");
  const [vcardPhone, setVcardPhone] = useState("");
  const [sendingVcard, setSendingVcard] = useState(false);
  const [vcardSearch, setVcardSearch] = useState("");
  const [vcardSearchResults, setVcardSearchResults] = useState<Contact[]>([]);
  const [vcardSearchLoading, setVcardSearchLoading] = useState(false);

  // Sticker file input
  const stickerInputRef = useRef<HTMLInputElement>(null);

  // Sticker gallery picker
  const [stickerGalleryOpen, setStickerGalleryOpen] = useState(false);
  const [stickerGalleryItems, setStickerGalleryItems] = useState<GalleryItem[]>([]);
  const [stickerGalleryLoading, setStickerGalleryLoading] = useState(false);
  const [stickerGallerySearch, setStickerGallerySearch] = useState("");
  const [stickerGallerySendingId, setStickerGallerySendingId] = useState<number | null>(null);
  const [stickerGalleryPage, setStickerGalleryPage] = useState(1);
  const [stickerGalleryHasMore, setStickerGalleryHasMore] = useState(false);
  const [stickerGalleryLoadingMore, setStickerGalleryLoadingMore] = useState(false);

  const openStickerGallery = () => {
    setStickerGallerySearch("");
    setStickerGalleryItems([]);
    setStickerGalleryHasMore(false);
    setStickerGalleryPage(1);
    setStickerGalleryOpen(true);
  };

  const loadMoreStickerGallery = async () => {
    if (stickerGalleryLoadingMore || !stickerGalleryHasMore) return;
    setStickerGalleryLoadingMore(true);
    try {
      const nextPage = stickerGalleryPage + 1;
      const { data, hasMore } = await fetchGallery({
        fileType: "image",
        pageNumber: nextPage,
        searchParam: stickerGallerySearch || undefined,
      });
      setStickerGalleryItems((prev) => [...prev, ...data]);
      setStickerGalleryHasMore(hasMore);
      setStickerGalleryPage(nextPage);
    } catch {
      toast.error(t("errorLoadingGallery"));
    } finally {
      setStickerGalleryLoadingMore(false);
    }
  };

  // Debounced page-1 fetch on open + search change (server-side search).
  useEffect(() => {
    if (!stickerGalleryOpen) return;
    const delay = stickerGallerySearch ? 300 : 0;
    const tid = setTimeout(async () => {
      setStickerGalleryLoading(true);
      try {
        const { data, hasMore } = await fetchGallery({
          fileType: "image",
          pageNumber: 1,
          searchParam: stickerGallerySearch || undefined,
        });
        setStickerGalleryItems(data);
        setStickerGalleryHasMore(hasMore);
        setStickerGalleryPage(1);
      } catch {
        toast.error(t("errorLoadingGallery"));
      } finally {
        setStickerGalleryLoading(false);
      }
    }, delay);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerGalleryOpen, stickerGallerySearch]);

  const handleStickerFromGallery = async (item: GalleryItem) => {
    setStickerGallerySendingId(item.id);
    try {
      const blob = await fetchGalleryBlob(item);
      const ext = item.name.split(".").pop() || "webp";
      const file = new File([blob], item.name || `sticker.${ext}`, { type: blob.type || "image/webp" });
      setStickerGalleryOpen(false);
      setStickerGallerySearch("");
      onSendMedia(file, "", undefined, true);
    } catch {
      toast.error(t("errorSendingGalleryFile"));
    } finally {
      setStickerGallerySendingId(null);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchQuickReplies().then(({ data }) => {
      const all: QuickReply[] = Array.isArray(data) ? data : [];
      const uid = user?.userId;
      // Públicas aparecem para todos; privadas só para o dono.
      // Se userId for null na mensagem (dado legado), exibe para quem está logado.
      const filtered = all.filter((r) => {
        if (r.isPublic) return true;
        if (uid == null) return true;
        if (r.userId == null) return true;
        return String(r.userId) === String(uid);
      });
      setQuickReplies(filtered);
    }).catch(() => {});
  }, [user?.userId]);

  const filterRepliesByChannel = useCallback((replies: QuickReply[]) =>
    replies.filter((r) => {
      const mt = r.messageType ?? "text";
      if (mt === "text") return true;
      if (mt === "buttons") return isBaileys || isZapo || isUazapi || isEvoGo || isWabaLike || isHubWaba;
      if (mt === "list")    return isBaileys || isZapo || isUazapi || isEvoGo || isWabaLike || isHubWaba;
      if (mt === "template") return isWabaLike || isHubWaba;
      return true;
    }),
  [isBaileys, isZapo, isUazapi, isEvoGo, isWabaLike, isHubWaba]);

  useEffect(() => {
    if (text.startsWith("/")) {
      const search = text.slice(1).toLowerCase();
      const byText = search.length === 0
        ? quickReplies
        : quickReplies.filter((r) => {
            const key = (r.key || "").replace(/^\//, "").toLowerCase();
            return key.includes(search);
          });
      const matches = filterRepliesByChannel(byText);
      setFilteredReplies(matches);
      setShowQuickReplies(matches.length > 0);
      setQuickReplyHighlight(0);
    } else {
      setShowQuickReplies(false);
    }
  }, [text, quickReplies, filterRepliesByChannel]);

  // Mantém o item destacado (setas ↑/↓) visível dentro da lista de respostas rápidas.
  useEffect(() => {
    if (showQuickReplies) quickReplyActiveRef.current?.scrollIntoView({ block: "nearest" });
  }, [quickReplyHighlight, showQuickReplies]);

  // Parse template variables when selection changes
  useEffect(() => {
    // Cobranca: a ficha e zerada a cada troca de template. O botao ORDER_DETAILS
    // nao vira variavel — os dados vem do formulario proprio, nao de templateVars.
    if (selectedTemplate) setOrderDetailsValue(emptyOrderDetails());
    if (!selectedTemplate) { setTemplateVars([]); return; }
    const vars: { key: string; label: string; value: string; filename?: string }[] = [];
    selectedTemplate.components?.forEach((comp) => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE") {
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: "" });
      }
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        // WABA conta variáveis por componente (header e body têm numeração independente).
        // Por isso prefixamos as keys com header_/body_ para não colidir {{1}} entre eles.
        const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
        const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
        // Named variables {{nome}}, {{cidade}}, etc.
        const named = [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
        named.forEach((m) => {
          const k = `${keyPrefix}named_variable_${m[1]}`;
          if (!vars.some((v) => v.key === k)) {
            vars.push({ key: k, label: labelPrefix + t("namedVariableLabel", { name: `{{${m[1]}}}` }), value: "" });
          }
        });
        // Positional variables {{1}}, {{2}}, etc.
        const positional = [...comp.text.matchAll(/\{\{(\d+)\}\}/g)];
        positional.forEach((m) => {
          const k = `${keyPrefix}variable_${m[1]}`;
          if (!vars.some((v) => v.key === k)) {
            vars.push({ key: k, label: labelPrefix + t("positionalVariableLabel", { number: m[1] }), value: "" });
          }
        });
      }
      // Button variables (COPY_CODE needs coupon, URL with {{1}} needs suffix)
      if (comp.type === "BUTTONS" && comp.buttons) {
        comp.buttons.forEach((btn: Record<string, unknown>, idx: number) => {
          const btnType = btn.type as string;
          const btnUrl = btn.url as string | undefined;
          if (btnType === "COPY_CODE") {
            vars.push({ key: `button_${idx}`, label: t("buttonVariableLabel", { index: idx + 1 }), value: "" });
          } else if (btnType === "OTP" && !templateBodyHasVariables(selectedTemplate.components || [])) {
            // Botão OTP exige parâmetro no envio. Com variável no corpo o backend usa o
            // próprio código digitado ali; sem variável não há de onde derivar e a Meta
            // recusa com 131008 — então o campo é pedido aqui.
            vars.push({ key: `button_${idx}`, label: t("buttonVariableLabel", { index: idx + 1 }), value: "" });
          } else if (btnType === "URL" && btnUrl && /\{\{1\}\}/.test(btnUrl) && !/otp_type=|\/otp\//i.test(btnUrl)) {
            // Botões OTP (templates de autenticação) têm URL .../otp/code/?otp_type=...&code=otp{{1}};
            // o valor é o próprio código de verificação (variável do BODY) e é injetado no backend.
            // Por isso não criamos um campo extra obrigatório aqui.
            vars.push({ key: `button_${idx}`, label: t("buttonVariableLabel", { index: idx + 1 }), value: "" });
          }
        });
      }
    });
    setTemplateVars(vars);
  }, [selectedTemplate]);

  // ── Core handlers ─────────────────────────────────────────────────────
  // Para o estado de typing imediatamente. Idempotente: só envia se estava ativo.
  const stopTyping = useCallback((targetTicketId?: number, targetTicket?: Record<string, unknown>) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    const tid = targetTicketId ?? lastTicketIdRef.current ?? ticketId;
    const tk = targetTicket ?? ticketRef.current ?? (ticket as Record<string, unknown> | undefined);
    if (!tid || !tk) return;
    const contact = (tk as { contact?: Record<string, unknown> })?.contact;
    const whatsapp = (tk as { whatsapp?: { id?: number } })?.whatsapp;
    if (!supportsTyping || !contact || !whatsapp?.id) return;
    sendStopTypingIndicator(tid, tk).catch(() => {});
  }, [ticketId, ticket, supportsTyping]);

  const handleTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const tc = ticket as Record<string, unknown> | undefined;
    const contact = tc?.contact as Record<string, unknown> | undefined;
    const whatsapp = tc?.whatsapp as Record<string, unknown> | undefined;
    if (supportsTyping && contact?.number && whatsapp?.id) {
      const now = Date.now();
      if (!typingActiveRef.current || now - lastTypingSentAtRef.current >= 8000) {
        sendTypingIndicator(ticketId, ticket).catch(() => {});
        lastTypingSentAtRef.current = now;
      }
      typingActiveRef.current = true;
      lastTicketIdRef.current = ticketId;
      ticketRef.current = tc;
    }
    // Apos 3s sem digitar, envia "paused" pra parar o indicador no destinatario.
    typingTimeoutRef.current = setTimeout(() => { stopTyping(); }, 3000);
  }, [ticketId, ticket, supportsTyping, stopTyping]);

  // Para typing ao trocar de ticket ou desmontar (alt+tab, navegacao, fechar aba).
  useEffect(() => {
    return () => { stopTyping(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Para typing quando a aba e ocultada/fechada — destinatario nao fica vendo "digitando..."
  // depois que o operador trocou de janela ou minimizou.
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState !== "visible") stopTyping(); };
    const handleBeforeUnload = () => { stopTyping(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [stopTyping]);

  // ── Inline @mention helpers ───────────────────────────────────────────────
  // Reset ao trocar de ticket.
  useEffect(() => {
    mentionFetchedRef.current = false;
    selectedMentionsRef.current = new Map();
    setMentionListData([]);
    setMentionPickerOpen(false);
    setMentionAtIndex(null);
    setMentionQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  // Detecta um token "@query" ativo (não precedido por caractere de palavra,
  // sem quebra de linha) terminando no cursor.
  const getActiveMention = (value: string, caret: number): { at: number; query: string } | null => {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return null;
    const before = at === 0 ? "" : value[at - 1];
    if (before && !/\s/.test(before)) return null; // evita e-mails / meio de palavra
    const query = upto.slice(at + 1);
    if (query.includes("\n") || query.length > 30) return null;
    return { at, query };
  };

  const ensureMentionParticipants = useCallback(async () => {
    if (mentionFetchedRef.current || !supportsInlineMention) return;
    const groupNumber = ticketData?.contact?.number;
    if (!groupNumber || !whatsappId) return;
    mentionFetchedRef.current = true;
    setMentionLoading(true);
    try {
      const { data } = await listMentionParticipants({ channel: ch, ticket: groupNumber, whatsappId });
      setMentionListData(data?.participants ?? []);
    } catch {
      mentionFetchedRef.current = false; // permite retry no próximo "@"
    } finally {
      setMentionLoading(false);
    }
  }, [supportsInlineMention, ch, whatsappId, ticketData?.contact?.number]);

  const updateMentionPicker = (value: string, caret: number) => {
    if (!supportsInlineMention) return;
    const active = getActiveMention(value, caret);
    if (!active) {
      setMentionPickerOpen(false);
      setMentionAtIndex(null);
      return;
    }
    setMentionAtIndex(active.at);
    setMentionQuery(active.query);
    setMentionHighlight(0);
    setMentionPickerOpen(true);
    ensureMentionParticipants();
  };

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const list = !q
      ? mentionListData
      : mentionListData.filter((p) => {
          const nameMatch = (p.name || "").toLowerCase().includes(q);
          const numMatch =
            qDigits.length > 0 &&
            (p.number || p.userId).replace(/\D/g, "").includes(qDigits);
          return nameMatch || numMatch;
        });
    return list.slice(0, 50);
  }, [mentionListData, mentionQuery]);

  const selectMention = (p: MentionParticipant) => {
    if (mentionAtIndex === null) return;
    // Em grupo identificado por LID o userId é o @lid — o token do texto usa o
    // telefone (number) para o destinatário ler o número, e o LID segue no envio.
    const numero = p.number || p.userId.replace(/\D/g, "") || p.userId;
    selectedMentionsRef.current.set(numero, p.userId);
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, mentionAtIndex);
    const after = text.slice(caret);
    const token = `@${numero} `;
    const newText = before + token + after;
    setText(newText);
    setMentionPickerOpen(false);
    setMentionAtIndex(null);
    setMentionQuery("");
    const newCaret = (before + token).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(newCaret, newCaret);
    });
  };

  const handleSend = useCallback(() => {
    // Para o typing assim que envia — destinatario nao deve ver "digitando" depois da msg chegar.
    stopTyping();
    // Janela 24h fechada + híbrido: só texto desvia pela conexão vinculada.
    // Mídia/estruturado iriam pro caminho oficial e a Meta rejeitaria (131047).
    if (hybridTextOnly && (files.length > 0 || pendingStructured || pendingQrMedias.length > 0)) {
      toast.warning(t("hybridLinkedTextOnly"));
      return;
    }
    // Mensagem rápida estruturada preparada (botões/lista): dispara o envio interativo.
    // O corpo (body) vem do que estiver na caixa de texto — editável, igual à legenda da mídia.
    if (pendingStructured) {
      const { reply, mt } = pendingStructured;
      sendStructuredQuickReply(reply, mt, text.trim());
      setPendingStructured(null);
      setText(""); onClearReply(); textareaRef.current?.focus();
      return;
    }
    if (files.length > 0) {
      const caption = applySignature(text.trim());
      files.forEach((file) => { onSendMedia(file, caption, replyTo ?? undefined); });
      setFiles([]); setText(""); onClearReply(); textareaRef.current?.focus();
      cancelPendingQrMedia();
      return;
    }
    const trimmed = text.trim();
    // Send text (if any)
    if (trimmed) {
      // Menção inline (estilo WhatsApp): se houver tokens @<numero> ainda
      // presentes no texto, envia pelo endpoint de menção (carrega o array
      // mentions). Caso contrário, fluxo normal de texto.
      let inlineMentions: string[] = [];
      if (supportsInlineMention && selectedMentionsRef.current.size > 0) {
        selectedMentionsRef.current.forEach((userId, numero) => {
          if (new RegExp(`@${numero}(?!\\d)`).test(trimmed)) inlineMentions.push(userId);
        });
      }
      if (inlineMentions.length > 0) {
        const idFront = `front-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const bodyToSend = applySignature(trimmed);
        // Bolha otimista imediata (igual ao envio normal). Como o backend `inline`
        // preserva o body verbatim, o chat:create reconcilia esta msg por body.
        const store = useTicketStore.getState() as any;
        store.addMessage?.({
          id: idFront, stableKey: idFront, body: bodyToSend, fromMe: true,
          read: true, mediaType: "chat", ack: 0, status: "pending",
          createdAt: new Date().toISOString(),
        });
        sendMentionMessage({
          body: bodyToSend,
          ticket: ticket as Record<string, unknown>,
          channel: ch,
          whatsappId,
          participants: inlineMentions,
          inline: true,
        })
          .then(() => { selectedMentionsRef.current = new Map(); })
          .catch(() => {
            // Mantém a bolha e marca falha (ack -1) — igual ao padrão dos demais envios.
            const s = useTicketStore.getState() as any;
            s.setMessages?.((s.messages as Message[]).map((m: Message) => (m.id === idFront ? { ...m, ack: -1 } : m)));
            toast.error(t("errorSendingMention"));
          });
      } else {
        // Janela fechada + híbrido: roteia o texto pela conexão vinculada (mesmo
        // comportamento do botão "Enviar pela conexão vinculada" do banner).
        onSendText(applySignature(trimmed), replyTo ?? undefined, hybridTextOnly ? { forceLinked: true } : undefined);
      }
    }
    // Send pending quick-reply media as SEPARATE messages with a small delay between each
    if (pendingQrMedias.length > 0 && tenantId) {
      const filenames = [...pendingQrMedias];
      const isVoice = pendingQrVoice;
      const sendSequentially = async () => {
        for (let i = 0; i < filenames.length; i++) {
          if (i > 0) await new Promise((resolve) => setTimeout(resolve, 500));
          const filename = filenames[i];
          const mediaUrl = `${apiBaseUrl}/public/${tenantId}/fastreply/${filename}`;
          try {
            const resp = await fetch(mediaUrl);
            if (!resp.ok) throw new Error("fetch failed");
            const blob = await resp.blob();
            const mime = blob.type || (isVoice ? "audio/mpeg" : "application/octet-stream");
            const file = new File([blob], filename, { type: mime });
            onSendMedia(file, "", replyTo ?? undefined);
          } catch {
            toast.error(t("errorLoadingQuickReplyMedia"));
          }
        }
      };
      sendSequentially();
      cancelPendingQrMedia();
    }
    if (!trimmed && pendingQrMedias.length === 0) return;
    setText(""); onClearReply(); textareaRef.current?.focus();
  }, [text, files, replyTo, pendingQrMedias, pendingQrVoice, pendingStructured, tenantId, onSendText, onSendMedia, onClearReply, applySignature, supportsInlineMention, ch, whatsappId, ticket, t, hybridTextOnly]);

  // Envio forçado pela conexão vinculada (janela 24h fechada + híbrido). Reusa onSendText.
  const handleSendViaLinked = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(applySignature(trimmed), replyTo ?? undefined, { forceLinked: true });
    setText(""); onClearReply(); textareaRef.current?.focus();
  }, [text, onSendText, applySignature, replyTo, onClearReply]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Picker de @menção aberto: setas navegam, Enter/Tab seleciona, Esc fecha.
    if (mentionPickerOpen && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionHighlight((h) => (h + 1) % filteredMentions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionHighlight((h) => (h - 1 + filteredMentions.length) % filteredMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(filteredMentions[mentionHighlight] ?? filteredMentions[0]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionPickerOpen(false); setMentionAtIndex(null); return; }
    }
    // Dropdown de respostas rápidas aberto: setas navegam, Enter/Tab escolhe (Esc fecha, tratado abaixo).
    if (showQuickReplies && filteredReplies.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setQuickReplyHighlight((h) => (h + 1) % filteredReplies.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setQuickReplyHighlight((h) => (h - 1 + filteredReplies.length) % filteredReplies.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleQuickReplySelect(filteredReplies[quickReplyHighlight] ?? filteredReplies[0]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !isTouchDevice) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") {
      if (mentionPickerOpen) { setMentionPickerOpen(false); setMentionAtIndex(null); return; }
      if (showQuickReplies) { setShowQuickReplies(false); return; }
      if (replyTo) onClearReply();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Instagram so suporta image/video/audio — usuario pode burlar accept="image/*" pelo seletor.
    if (isInstagram) {
      const prefix = (file.type || "").split("/")[0];
      if (!["image", "video", "audio"].includes(prefix)) {
        toast.error(tChat("instagramDocNotAllowed"));
        return;
      }
    }
    if (isWabaLike) {
      const err = checkFileForChannel(channelType, file);
      if (err) {
        if (err.reason === "type") {
          toast.error(tWaba("wabaErrors.invalidFileType", { fileName: file.name }));
        } else {
          toast.error(tWaba("wabaErrors.fileSizeExceededDetail", { fileName: file.name, maxSize: err.maxSizeMB, fileSize: err.fileSizeMB }));
        }
        return;
      }
    } else {
      const maxSize = Math.floor(1.9 * 1024 * 1024 * 1024);
      if (file.size > maxSize) {
        toast.error(t("fileTooLarge", { size: "1.9GB" }));
        return;
      }
    }
    setFiles((prev) => [...prev, file].slice(0, 30));
  };

  const handleConfirmCaption = () => {
    if (!captionFile) return;
    onSendMedia(captionFile, applySignature(captionText), replyTo ?? undefined);
    setCaptionModal(false);
    setCaptionFile(null);
    setCaptionText("");
    setText(""); onClearReply();
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;
    const MAX_FILES = 30;
    const MAX_TOTAL_SIZE = Math.floor(1.9 * 1024 * 1024 * 1024);
    // Instagram so suporta image/video/audio — descartar documentos antes de stagear.
    const filteredNewFiles = isInstagram
      ? newFiles.filter((f) => {
          const prefix = (f.type || "").split("/")[0];
          if (["image", "video", "audio"].includes(prefix)) return true;
          toast.error(tChat("instagramDocNotAllowed"));
          return false;
        })
      : newFiles;
    if (filteredNewFiles.length === 0) { e.target.value = ""; return; }
    let validFiles: File[];
    if (isWabaLike) {
      validFiles = [];
      filteredNewFiles.forEach((f) => {
        const err = checkFileForChannel(channelType, f);
        if (err) {
          if (err.reason === "type") {
            toast.error(tWaba("wabaErrors.invalidFileType", { fileName: f.name }));
          } else {
            toast.error(tWaba("wabaErrors.fileSizeExceededDetail", { fileName: f.name, maxSize: err.maxSizeMB, fileSize: err.fileSizeMB }));
          }
        } else {
          validFiles.push(f);
        }
      });
    } else {
      const currentSize = files.reduce((s, f) => s + f.size, 0);
      let running = currentSize;
      validFiles = [];
      for (const f of filteredNewFiles) {
        if (files.length + validFiles.length >= MAX_FILES) break;
        if (running + f.size > MAX_TOTAL_SIZE) continue;
        validFiles.push(f);
        running += f.size;
      }
      if (validFiles.length < filteredNewFiles.length)
        toast.warning(t("someFilesIgnoredTotal", { max: MAX_FILES, size: "1.9GB" }));
    }
    if (validFiles.length > 0)
      setFiles((prev) => [...prev, ...validFiles].slice(0, MAX_FILES));
    e.target.value = "";
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  // Despacha a mensagem rápida estruturada (botões / lista) pelo canal correto.
  // Chamada a partir do handleSend (ao clicar em Enviar), não na seleção.
  // bodyOverride = corpo editado na caixa de texto. Reusa os mesmos senders dos
  // modais (sendWabaButtons/List, senders BSP, interactive baileys, uazapi-menu).
  const sendStructuredQuickReply = async (reply: QuickReply, mt: "buttons" | "list", bodyOverride?: string) => {
    // Mesma cura dos modais WABA: aqui o payload sai do wabaBase() sem passar por
    // nenhum guard, entao um ticket ainda sem tokenAPI (aceito pelo card da lista)
    // mandaria tokenApi vazio e o backend responderia ERR_WHATSAPP_TENANTID.
    if (isWaba && !(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    const rawBody = (bodyOverride !== undefined
      ? bodyOverride
      : (reply.message && reply.message !== "null" ? reply.message : "")
    ).trim();
    try {
      if (mt === "buttons") {
        let parsed: { title?: string; footer?: string; buttons?: { id?: string; title?: string }[] } = {};
        try { parsed = reply.buttonsJson ? JSON.parse(reply.buttonsJson) : {}; } catch {}
        const titles = (parsed.buttons || [])
          .map((b) => (b?.title || "").trim())
          .filter(Boolean)
          .slice(0, 3);
        if (titles.length === 0) { toast.warning(t("button1Required")); return; }
        // Botões reply do WhatsApp exigem corpo não-vazio; usa o título do cartão como fallback.
        const body = applySignature(rawBody || (parsed.title || "").trim() || " ");
        const footer = (parsed.footer || "").trim();
        if (isWaba) {
          const payload: Record<string, string> = {};
          titles.forEach((tt, i) => { payload[`button${i + 1}`] = tt; });
          await sendWabaButtons({ ...wabaBase(), body, ...payload });
        } else if (isGupshup) {
          await senders.sendButton({ ...bspBase(), bodyText: body, buttons: titles.map((tt, i) => ({ id: `btn${i + 1}`, title: tt })) });
        } else if (isDialog360) {
          const payload: Record<string, string> = {};
          titles.forEach((tt, i) => { payload[`button${i + 1}`] = tt; });
          await senders.sendButton({ ...bspBase(), message: body, ...payload });
        } else if (isBaileys || isZapo) {
          await sendInteractiveQuickReply({
            channel: ch, ticket: ticket as Record<string, unknown>, whatsappId,
            body: { text: body },
            footer: footer ? { text: footer } : undefined,
            buttons: titles.map((tt, i) => ({ display_text: tt, id: `btn${i + 1}` })),
          });
        } else if (isUazapi) {
          await sendUazapiMenu(Number(ticketId), { type: "button", text: body, choices: titles, footerText: footer || undefined });
        } else if (isEvoGo) {
          await sendEvoGoMenu(Number(ticketId), { type: "button", text: body, choices: titles, footerText: footer || undefined });
        }
        toast.success(t("interactiveMessageSent"));
        return;
      }

      // mt === "list"
      let parsed: { title?: string; footer?: string; buttonText?: string; sections?: { title?: string; rows?: { id?: string; title?: string; description?: string }[] }[] } = {};
      try { parsed = reply.listJson ? JSON.parse(reply.listJson) : {}; } catch {}
      const buttonText = (parsed.buttonText || "").trim();
      const listHeader = (parsed.title || "").trim();
      // Seções com títulos crus (WABA/BSP aceitam título vazio); ajustes por canal abaixo.
      const sections = (parsed.sections || [])
        .map((sec, si) => ({
          title: (sec?.title || "").trim(),
          rows: (sec?.rows || [])
            .filter((r) => (r?.title || "").trim())
            .map((r, ri) => ({
              id: r?.id || `s${si + 1}r${ri + 1}`,
              title: (r?.title || "").trim(),
              description: (r?.description || "").trim(),
            })),
        }))
        .filter((s) => s.rows.length > 0);
      if (!buttonText || sections.length === 0) { toast.warning(t("fillMsgListTitleSection")); return; }
      const body = applySignature(rawBody || listHeader || " ");
      const footer = (parsed.footer || "").trim();
      if (isWaba) {
        await sendWabaList({ ...wabaBase(), body, header: listHeader, footer, button_text: buttonText, sectionsJson: JSON.stringify(sections) });
      } else if (isGupshup) {
        await senders.sendList({ ...bspBase(), bodyText: body, headerText: listHeader, footerText: footer, buttonText, sections });
      } else if (isDialog360) {
        await senders.sendList({ ...bspBase(), body, header: listHeader, footer, button_text: buttonText, sections });
      } else if (isBaileys || isZapo) {
        // Baileys/Zapo descartam seções com título vazio; garante um título não-vazio.
        const baileysSections = sections.map((s) => ({ ...s, title: s.title || listHeader || buttonText }));
        await sendInteractiveSingleSelect({
          channel: ch, ticket: ticket as Record<string, unknown>, whatsappId,
          body: { text: body },
          footer: footer ? { text: footer } : undefined,
          list: { title: buttonText, sections: baileysSections },
        });
      } else if (isUazapi) {
        // Uazapi reconstrói seções a partir de marcadores "[Título]" intercalados nas choices.
        const choices: string[] = [];
        sections.forEach((s) => {
          if (s.title) choices.push(`[${s.title}]`);
          s.rows.forEach((r) => choices.push(r.title));
        });
        await sendUazapiMenu(Number(ticketId), { type: "list", text: body, choices, listButton: buttonText, footerText: footer || undefined });
      } else if (isEvoGo) {
        // Evolution Go reconstrói seções a partir de marcadores "[Título]" intercalados nas choices (igual uazapi).
        const choices: string[] = [];
        sections.forEach((s) => {
          if (s.title) choices.push(`[${s.title}]`);
          s.rows.forEach((r) => choices.push(r.title));
        });
        await sendEvoGoMenu(Number(ticketId), { type: "list", text: body, choices, listButton: buttonText, footerText: footer || undefined });
      }
      toast.success(t("interactiveMessageSent"));
    } catch {
      toast.error(t(isZapo ? "errorSendingInteractiveMessageZapo" : "errorSendingInteractiveMessage"));
    }
  };

  const handleQuickReplySelect = (reply: QuickReply) => {
    setShowQuickReplies(false);
    const mt = reply.messageType ?? "text";
    // Botões / lista: prepara (append) a mensagem interativa em vez de enviar na hora.
    // O corpo vai pra caixa de texto (editável, igual à legenda da mídia) e o envio
    // só acontece ao clicar em Enviar. Canais sem path interativo (hub_waba etc.)
    // caem no comportamento de texto abaixo.
    if ((mt === "buttons" || mt === "list") && (isWaba || isGupshup || isDialog360 || isBaileys || isZapo || isUazapi || isEvoGo)) {
      cancelPendingQrMedia(); // descarta mídia de uma seleção anterior — não se mistura com estruturada
      setPendingStructured({ reply, mt });
      setText(reply.message && reply.message !== "null" ? reply.message : "");
      textareaRef.current?.focus();
      return;
    }
    // Troca de intenção: se havia uma estruturada preparada, descarta.
    setPendingStructured(null);
    // Same as Vue: if message is literally "null", don't put in input.
    // Mesmo sem texto precisa limpar a caixa: o que está lá é o token "/atalho"
    // da própria busca — sem isso ele seguiria junto como mensagem de texto.
    setText(reply.message && reply.message !== "null" ? reply.message : "");
    // Resolve media filenames — prefer mediasJson (multiple), fallback to media (single)
    let filenames: string[] = [];
    if (reply.mediasJson) {
      try {
        const parsed = JSON.parse(reply.mediasJson);
        if (Array.isArray(parsed) && parsed.length > 0) filenames = parsed;
      } catch {}
    }
    if (filenames.length === 0 && reply.media) {
      filenames = [reply.media];
    }
    if (filenames.length > 0) {
      setPendingQrMedias(filenames);
      setPendingQrVoice(reply.voice === "enabled");
    }
    textareaRef.current?.focus();
  };

  const cancelPendingQrMedia = () => {
    setPendingQrMedias([]);
    setPendingQrVoice(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji); textareaRef.current?.focus();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    const filtered = isInstagram
      ? droppedFiles.filter((f) => {
          const prefix = (f.type || "").split("/")[0];
          if (["image", "video", "audio"].includes(prefix)) return true;
          toast.error(tChat("instagramDocNotAllowed"));
          return false;
        })
      : droppedFiles;
    if (filtered.length > 0) setFiles((prev) => [...prev, ...filtered].slice(0, 5));
  }, [isInstagram, tChat]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  // Um toast POR RAZÃO, não por arquivo: colar uma pasta com 5 anexos inválidos
  // empilhava 5 toasts idênticos e cobria a caixa de texto. O primeiro arquivo de
  // cada grupo é quem dá nome à mensagem.
  const reportStagingRejections = useCallback((rejected: ChatFileRejection[]) => {
    if (rejected.length === 0) return;
    const firstByReason = new Map<ChatFileRejectionReason, ChatFileRejection>();
    for (const r of rejected) if (!firstByReason.has(r.reason)) firstByReason.set(r.reason, r);
    for (const [reason, r] of firstByReason) {
      const name = r.file.name;
      switch (reason) {
        case "channelNoFile":
          toast.error(t("channelNoFileSupport"));
          break;
        case "type":
          toast.error(t("fileTypeNotAllowed", { name }));
          break;
        case "channelNoDoc":
          // Instagram já tem uma mensagem própria, mais específica que a genérica.
          toast.error(isInstagram ? tChat("instagramDocNotAllowed") : t("channelNoDocument"));
          break;
        case "channelType":
          // Chave neutra, e não wabaErrors.invalidFileType ("...para WABA"): como
          // checkFileForChannel agora roda em todo canal restrito, esta razão também
          // dispara em Messenger (ex.: .csv, fora da tabela dele).
          toast.error(t("fileTypeNotSupportedChannel", { name }));
          break;
        case "channelSize":
          toast.error(tWaba("wabaErrors.fileSizeExceededDetail", {
            fileName: name,
            maxSize: r.maxSizeMB ?? "",
            fileSize: r.fileSizeMB ?? "",
          }));
          break;
        case "size":
          toast.error(t("fileTooLargeNamed", { name, size: formatMaxFileSize() }));
          break;
        case "cap":
          toast.warning(t("someFilesIgnoredTotal", { max: PASTE_MAX_FILES, size: formatMaxFileSize() }));
          break;
      }
    }
  }, [t, tChat, tWaba, isInstagram]);

  // Glue único entre uma origem de arquivo (colar) e o staging. A POLÍTICA inteira
  // (cap, canal text-only, mime, canal sem documento, limites do canal, teto
  // genérico) mora em filterIncomingChatFiles — aqui fica só o que depende de React.
  const stageFiles = useCallback((incoming: File[]): number => {
    if (incoming.length === 0) return 0;
    if (isDisabled) return 0;
    // Janela 24h fechada + conexão vinculada: o textarea NÃO fica disabled por
    // desenho, então sem este guard o arquivo stageia e o handleSend trava a
    // caixa inteira (o return de lá vem antes do envio de texto e não limpa files).
    if (hybridTextOnly) { toast.warning(t("hybridLinkedTextOnly")); return 0; }
    const { accepted, rejected } = filterIncomingChatFiles(incoming, {
      channelType,
      maxFiles: PASTE_MAX_FILES,
      maxBytes: CHAT_MAX_FILE_SIZE,
      currentCount: files.length,
    });
    reportStagingRejections(rejected);
    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted].slice(0, PASTE_MAX_FILES));
    return accepted.length;
  }, [isDisabled, hybridTextOnly, channelType, files, t, reportStagingRejections]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // clipboardData.files (e não .items): é o caminho anunciado no fix do Firefox
    // 116 e o mesmo já usado em chat-privado e no drawer do suporte.
    const pasted = Array.from(e.clipboardData?.files ?? []);
    // Excel/Word no Windows publicam CF_DIB junto com o texto e o Blink expõe o
    // bitmap como item de arquivo (no macOS um `else if` evita isso, por isso o
    // bug não reproduz em Mac). Sem este guard, colar um intervalo do Excel anexa
    // um print e engole o texto.
    if (shouldDeferPasteToText(Array.from(e.clipboardData?.types ?? []), pasted)) return;
    // preventDefault TEM de ser síncrono e vir antes de qualquer await: logo após
    // o dispatch o Blink faz SetAccessPolicy(kNumb) e tanto o preventDefault
    // quanto a leitura de clipboardData viram no-op.
    e.preventDefault();
    const now = Date.now();
    stageFiles(pasted.map((f) => namePastedFile(f, now)));
  }, [stageFiles]);

  const startRecording = async () => {
    try {
      if (supportsTyping) sendRecordingIndicator(ticketId, ticket as Record<string, unknown>).catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        // Always exit the recording UI here — covers normal stop AND external
        // interruptions (e.g., iOS rotation interrupts the audio session and
        // the browser stops the recorder for us). Without this, recording
        // state stayed true while the recorder was already dead.
        setRecording(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          const mp3Blob = await convertWebmBlobToMp3(blob);
          const file = new File([mp3Blob], `audio_${Date.now()}.mp3`, { type: "audio/mpeg" });
          const url = URL.createObjectURL(mp3Blob);
          setAudioPreview({ file, url });
        } catch { toast.error(t("audioConversionFailed")); }
      };
      // Detect track ended externally (audio session interruption on mobile,
      // device unplug, permission revoked) and stop the recorder so onstop
      // runs and the UI exits cleanly.
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (recorder.state !== "inactive") {
            try { recorder.stop(); } catch { /* already stopped */ }
          }
        };
      });
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch { toast.error(t("micPermissionDenied")); }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stream.getTracks().forEach((tr) => tr.stop());
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const sendAudioPreview = () => {
    if (!audioPreview) return;
    onSendMedia(audioPreview.file, "", replyTo ?? undefined);
    URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
    onClearReply();
  };

  const discardAudioPreview = () => {
    if (!audioPreview) return;
    URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Gallery handlers ──────────────────────────────────────────────────
  const handleOpenGallery = () => {
    setGallerySelected([]);
    setGalleryCaptions({});
    setGallerySearch("");
    setGalleryFilter("all");
    setGalleryItems([]);
    setGalleryHasMore(false);
    setGalleryPage(1);
    setGalleryModal(true);
  };

  const loadMoreGallery = async () => {
    if (galleryLoadingMore || !galleryHasMore) return;
    setGalleryLoadingMore(true);
    try {
      const nextPage = galleryPage + 1;
      const { data, hasMore } = await fetchGallery({
        pageNumber: nextPage,
        searchParam: gallerySearch || undefined,
        fileType: galleryFilter === "all" ? undefined : galleryFilter,
      });
      setGalleryItems((prev) => [...prev, ...data]);
      setGalleryHasMore(hasMore);
      setGalleryPage(nextPage);
    } catch {
      toast.error(t("errorLoadingGallery"));
    } finally {
      setGalleryLoadingMore(false);
    }
  };

  // Debounced page-1 fetch on open + search/filter change (server-side).
  useEffect(() => {
    if (!galleryModal) return;
    const delay = gallerySearch ? 300 : 0;
    const tid = setTimeout(async () => {
      setLoadingGallery(true);
      try {
        const { data, hasMore } = await fetchGallery({
          pageNumber: 1,
          searchParam: gallerySearch || undefined,
          fileType: galleryFilter === "all" ? undefined : galleryFilter,
        });
        setGalleryItems(data);
        setGalleryHasMore(hasMore);
        setGalleryPage(1);
      } catch {
        toast.error(t("errorLoadingGallery"));
      } finally {
        setLoadingGallery(false);
      }
    }, delay);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryModal, gallerySearch, galleryFilter]);

  const handleSendGalleryFile = async () => {
    if (!gallerySelected.length) return;
    setGallerySending(true);
    try {
      for (const item of gallerySelected) {
        const blob = await fetchGalleryBlob(item);
        const mimeType = item.type || blob.type || "application/octet-stream";
        const file = new File([blob], item.name, { type: mimeType });
        const caption = galleryCaptions[item.id] ?? "";
        onSendMedia(file, applySignature(caption), replyTo ?? undefined);
      }
      setGalleryModal(false);
      setGallerySelected([]);
      setGalleryCaptions({});
      onClearReply();
    } catch { toast.error(t("errorSendingGalleryFile")); }
    finally { setGallerySending(false); }
  };

  // ── Template header gallery picker ───────────────────────────────────
  const pickTplGalleryItem = (item: GalleryItem) => {
    setTemplateVars((prev) =>
      prev.map((v) => v.key === "header_link" ? { ...v, value: item.url, filename: item.name } : v)
    );
    setTplGalleryOpen(false);
  };

  // ── WABA send handlers ────────────────────────────────────────────────
  const handleSendWabaButtons = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    const msgTrimmed = wBtn.msg.trim();
    if (!msgTrimmed) { toast.warning(t("typeMessage")); return; }
    if (msgTrimmed.length > 60) { toast.warning(t("msgMaxChars")); return; }
    if (!wBtn.b1.trim()) { toast.warning(t("button1Required")); return; }
    const filledButtons = [wBtn.b1, wBtn.b2, wBtn.b3].filter((b) => b.trim());
    if (new Set(filledButtons).size !== filledButtons.length) {
      toast.warning(t("duplicateButtonTitles")); return;
    }
    const buttonPayload: Record<string, string> = {};
    filledButtons.forEach((b, i) => { buttonPayload[`button${i + 1}`] = b; });
    const signedMsg = applySignature(msgTrimmed);
    try {
      if (isGupshup) {
        await senders.sendButton({
          ...bspBase(),
          bodyText: signedMsg,
          buttons: filledButtons.map((title, i) => ({ id: `btn${i + 1}`, title })),
        });
      } else if (isDialog360) {
        await senders.sendButton({ ...bspBase(), message: signedMsg, ...buttonPayload });
      } else {
        await sendWabaButtons({ ...wabaBase(), body: signedMsg, ...buttonPayload });
      }
      toast.success(t("wabaButtonsSent"));
      setWBtn({ msg: "", b1: "", b2: "", b3: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaButtons")); }
  };

  const handleSendWabaList = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wList.body.trim() || !wList.header.trim()) { toast.warning(t("fillHeaderAndMessage")); return; }
    try {
      const sectionsPayload = wList.sections
        .map((sec, si) => ({
          title: sec.title,
          rows: sec.rows
            .filter(r => r.title.trim())
            .map((r, ri) => ({ id: `s${si + 1}r${ri + 1}`, title: r.title, description: r.desc })),
        }))
        .filter(s => s.rows.length > 0);
      const signedBody = applySignature(wList.body);
      if (isGupshup) {
        await senders.sendList({
          ...bspBase(),
          bodyText: signedBody,
          headerText: wList.header,
          footerText: wList.footer,
          buttonText: wList.btnText,
          sections: sectionsPayload,
        });
      } else if (isDialog360) {
        await senders.sendList({
          ...bspBase(),
          body: signedBody,
          header: wList.header,
          footer: wList.footer,
          button_text: wList.btnText,
          sections: sectionsPayload,
        });
      } else {
        await sendWabaList({
          ...wabaBase(),
          body: signedBody,
          header: wList.header,
          footer: wList.footer,
          button_text: wList.btnText,
          sectionsJson: JSON.stringify(sectionsPayload),
        });
      }
      toast.success(t("wabaListSent"));
      setWList({ header: "", body: "", btnText: "", footer: "", sections: [{ title: "", rows: [{ title: "", desc: "" }] }] });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaList")); }
  };

  const handleOpenTemplates = async () => {
    setWabaModal("templates");
    setSelectedTemplate(null);
    setTemplateSearch("");
    if (wabaTemplates.length > 0) return;
    setLoadingTemplates(true);
    try {
      // WABA lista por tokenAPI, e o ticket pode chegar sem ele (veio da lista,
      // sessoes ainda carregando pos-login) — ensureWabaToken resolve via /whatsapp
      // antes de desistir, evitando o "wabaTokenNotFound" que so um F5 curava. O
      // token curado fica no ref, entao o ENVIO logo em seguida ja o encontra.
      // BSPs (Gupshup/Dialog360) listam por whatsappId, entao nao precisam.
      const effectiveTokenApi = isGupshup || isDialog360 ? tokenApi : await ensureWabaToken();
      if (!effectiveTokenApi && !(isGupshup || isDialog360)) { toast.warning(t("wabaTokenNotFound")); return; }
      // BSPs (Gupshup/Dialog360) usam suas próprias APIs de templates;
      // useChannelSender já injeta o getTemplates correto por canal.
      const list = senders?.getTemplates
        ? await senders.getTemplates(
            isGupshup || isDialog360 ? whatsappId : effectiveTokenApi,
          )
        : await getWabaTemplates(effectiveTokenApi);
      setWabaTemplates([...list].sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())));
    } catch (err: any) {
      const data = err?.response?.data;
      const upstreamStatus = data?.upstreamStatus ?? err?.response?.status;
      const reason = data?.message || data?.error || err?.message;
      toast.error(`${t("errorLoadingTemplates")}${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}${reason ? `: ${reason}` : ""}`);
    }
    finally { setLoadingTemplates(false); }
  };

  const handleSendWabaTemplate = async () => {
    // Gupshup/Dialog360 enviam por whatsappId (não usam tokenAPI)
    const effectiveTokenApi = isGupshup || isDialog360 ? tokenApi : await ensureWabaToken();
    if (!effectiveTokenApi && !(isGupshup || isDialog360)) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!selectedTemplate) { toast.warning(t("selectTemplate")); return; }
    const emptyRequired = templateVars.find((v) => !v.value.trim());
    if (emptyRequired) { toast.warning(t("fillRequired", { label: emptyRequired.label })); return; }
    const headerLinkCheck = templateVars.find((v) => v.key === "header_link");
    if (headerLinkCheck && !isValidHttpUrl(headerLinkCheck.value)) { toast.error(tErrors("invalidMediaHeaderUrl")); return; }
    // Cobranca (ORDER_DETAILS): validacao espelhada do backend antes do POST.
    // Template comum nao entra neste branch — segue exatamente o caminho de antes.
    const isOrderDetails = isOrderDetailsTemplate(selectedTemplate);
    if (isOrderDetails) {
      const orderError = validateOrderDetails(orderDetailsValue);
      if (orderError) { toast.warning(tOrder(orderError)); return; }
    }
    try {
      const base = wabaBase();
      const components: Record<string, unknown>[] = [];

      // Build HEADER component
      const headerComp = selectedTemplate.components?.find((c) => c.type === "HEADER");
      if (headerComp) {
        if (headerComp.format === "TEXT") {
          const headerPositional = templateVars.filter((v) => v.key.startsWith("header_variable_"));
          const headerNamed = templateVars.filter((v) => v.key.startsWith("header_named_variable_"));
          if (headerPositional.length > 0) {
            const variables: string[] = [];
            headerPositional.sort((a, b) => parseInt(a.key.replace("header_variable_", "")) - parseInt(b.key.replace("header_variable_", "")))
              .forEach((v, i) => { variables[i] = v.value; });
            components.push({ type: "HEADER", format: "TEXT", variables });
          } else if (headerNamed.length > 0) {
            components.push({
              type: "HEADER",
              format: "TEXT",
              parameters: headerNamed.map((v) => ({ type: "text", text: v.value, name: v.key.replace("header_named_variable_", "") })),
            });
          }
        } else {
          const headerLinkVar = templateVars.find((v) => v.key === "header_link");
          if (headerLinkVar?.value) {
            components.push({
              type: "HEADER",
              format: headerComp.format,
              value: headerLinkVar.value,
              // filename só é usado pelo backend no header de DOCUMENT (título do arquivo no WhatsApp).
              // Quando ausente, o backend deriva o nome a partir do basename da URL.
              ...(headerComp.format === "DOCUMENT" && headerLinkVar.filename
                ? { filename: headerLinkVar.filename }
                : {}),
            });
          }
        }
      }

      // Build BODY component
      const positionalVars = templateVars.filter((v) => v.key.startsWith("body_variable_"));
      const namedVars = templateVars.filter((v) => v.key.startsWith("body_named_variable_"));
      if (positionalVars.length > 0) {
        const variables: string[] = [];
        positionalVars.sort((a, b) => parseInt(a.key.replace("body_variable_", "")) - parseInt(b.key.replace("body_variable_", "")))
          .forEach((v, i) => { variables[i] = v.value; });
        components.push({ type: "BODY", variables });
      } else if (namedVars.length > 0) {
        const parameters = namedVars.map((v) => ({
          type: "text",
          text: v.value,
          name: v.key.replace("body_named_variable_", ""),
        }));
        components.push({ type: "BODY", parameters });
      }

      // Build BUTTONS component for buttons that require variable input
      const buttonVars = templateVars.filter((v) => v.key.startsWith("button_"));
      if (buttonVars.length > 0) {
        const buttonsComp = selectedTemplate.components?.find((c) => c.type === "BUTTONS");
        if (buttonsComp?.buttons) {
          const buttonParams: Record<string, unknown>[] = [];
          buttonsComp.buttons.forEach((btn: Record<string, unknown>, idx: number) => {
            const btnType = btn.type as string;
            const btnUrl = btn.url as string | undefined;
            const varEntry = buttonVars.find((v) => v.key === `button_${idx}`);
            if (btnType === "COPY_CODE" && varEntry) {
              buttonParams.push({
                type: "button",
                sub_type: "copy_code",
                index: String(idx),
                parameters: [{ type: "coupon_code", coupon_code: varEntry.value }],
              });
            } else if (btnType === "OTP" && varEntry) {
              // A Meta espera o botão OTP no formato de botão de URL (o link .../otp/code/
              // recebe o código como parâmetro), não um sub_type "otp".
              buttonParams.push({
                type: "button",
                sub_type: "url",
                index: String(idx),
                parameters: [{ type: "text", text: varEntry.value }],
              });
            } else if (btnType === "URL" && btnUrl && /\{\{1\}\}/.test(btnUrl) && !/otp_type=|\/otp\//i.test(btnUrl) && varEntry) {
              buttonParams.push({
                type: "button",
                sub_type: "url",
                index: String(idx),
                parameters: [{ type: "text", text: varEntry.value }],
              });
            }
          });
          if (buttonParams.length > 0) {
            components.push({ type: "BUTTONS", buttons: buttonParams });
          }
        }
      }

      // body deve ser JSON.stringify do array de componentes original do template
      // O backend faz JSON.parse(body) para processar as variáveis
      const templateBodyJson = JSON.stringify(selectedTemplate.components || []);
      // Campo NOVO e opcional. O front nao monta o botao: envia os dados amigaveis
      // (centavos) e o backend gera reference_id, monta e revalida o componente.
      const orderDetailsField = isOrderDetails
        ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
        : {};
      if (isGupshup) {
        await senders.sendTemplate({
          ...bspBase(),
          name: selectedTemplate.name,
          language: selectedTemplate.language,
          components,
          // Mesmo array de components do ramo WABA (contrato do dataJson):
          // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
          dataJson: JSON.stringify(components),
          templateComponents: templateBodyJson,
          ...orderDetailsField,
        });
      } else if (isDialog360) {
        await senders.sendTemplate({
          ...bspBase(),
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          components,
          // Mesmo array de components do ramo WABA (contrato do dataJson):
          // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
          dataJson: JSON.stringify(components),
          templateComponents: templateBodyJson,
          ...orderDetailsField,
        });
      } else {
        await sendWabaTemplateComponents({
          ...base,
          from: normalizeBrPhone(contactFrom),
          phone_number_id: effectiveTokenApi,
          language: selectedTemplate.language,
          templateName: selectedTemplate.name,
          body: templateBodyJson,
          mediaType: "templates",
          sendType: "templates",
          components,
          dataJson: JSON.stringify(components),
          scheduleDate: null,
          quotedMsg: null,
          ...orderDetailsField,
        });
      }
      toast.success(t("wabaTemplateSent"));
      setSelectedTemplate(null);
      setTemplateVars([]);
      setOrderDetailsValue(emptyOrderDetails());
      closeWaba();
    } catch (err) {
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      // Cobranca: o backend recusa com ERR_ORDER_DETAILS_* (400/403) e a mensagem
      // precisa chegar ao operador. Template comum mantem o toast generico de antes.
      if (isOrderDetails) {
        // O interceptor de api.ts rejeita com a RESPOSTA (nao com o AxiosError),
        // entao o corpo chega em `err.data` — ler so `err.response.data` deixava
        // TODO motivo de recusa (CRC do Pix, valor divergente, permissao) cair no
        // toast generico e o mapa acima nunca era consultado. Le as duas formas
        // para nao depender do formato do interceptor.
        type OrderErrBody = { message?: string; error?: string; code?: string };
        const data =
          (err as { data?: OrderErrBody })?.data ||
          (err as { response?: { data?: OrderErrBody } })?.response?.data;
        const status =
          (err as { status?: number })?.status ??
          (err as { response?: { status?: number } })?.response?.status;
        const reason = data?.error || data?.code || data?.message;
        const mapped = reason ? ORDER_DETAILS_ERROR_KEYS[reason] : undefined;
        if (mapped) { toast.error(tOrder(mapped)); return; }
        // Gate de cobranca do backend (403): "sem permissao" diz o que fazer;
        // o codigo cru, nao.
        if (reason === "ERR_NO_PERMISSION" || (!reason && status === 403)) {
          toast.error(tOrder("errorNotAllowed"));
          return;
        }
        // 402 fora do plano: o interceptor global ja avisa — nao duplicar o toast.
        if (reason === "ERR_FEATURE_NOT_IN_PLAN") return;
        toast.error(reason ? `${tOrder("errorSendFailed")}: ${reason}` : tOrder("errorSendFailed"));
        return;
      }
      // Template comum: o backend recusa antes do POST (guard de componente faltando)
      // ou repassa o motivo da Meta. Sem ler o corpo, todo caso virava o mesmo toast
      // generico e o operador nao sabia o que corrigir.
      type SendErrBody = { error?: string; code?: string; message?: string };
      const sendErr =
        (err as { data?: SendErrBody })?.data ||
        (err as { response?: { data?: SendErrBody } })?.response?.data;
      const sendCode = sendErr?.error || sendErr?.code;
      if (sendCode === "ERR_ORDER_DETAILS_REQUIRED") {
        toast.error(t("templateNeedsOrderDetails"));
        return;
      }
      if (sendCode === "ERR_TEMPLATE_BUTTON_PARAM_REQUIRED") {
        toast.error(t("templateNeedsButtonValue"));
        return;
      }
      if (sendErr?.message) {
        toast.error(`${t("errorSendingWabaTemplate")}: ${sendErr.message}`);
        return;
      }
      toast.error(t("errorSendingWabaTemplate"));
    }
  };

  const handleSendWabaCTAURL = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wCta.body.trim() || !wCta.btnUrl.trim() || !wCta.btnText.trim()) {
      toast.warning(t("fillMsgTextUrl")); return;
    }
    try {
      const header = wCta.headerType === "text"
        ? (wCta.headerText ? { type: "text", text: wCta.headerText } : undefined)
        : (wCta.headerLink ? { type: wCta.headerType, link: wCta.headerLink } : undefined);
      const signedBody = applySignature(wCta.body);
      if (isGupshup) {
        await senders.sendCTAURL({
          ...bspBase(),
          bodyText: signedBody,
          buttonText: wCta.btnText,
          url: wCta.btnUrl,
          footerText: wCta.footer || "",
          ...(wCta.headerText ? { headerText: wCta.headerText } : {}),
        });
      } else if (isDialog360) {
        await senders.sendCTAURL({
          ...bspBase(),
          body: signedBody,
          displayText: wCta.btnText,
          url: wCta.btnUrl,
          footer: wCta.footer || "",
          ...(header ? { header } : {}),
        });
      } else {
        await sendWabaCTAURL({
          ...wabaBase(),
          body: signedBody,
          buttonText: wCta.btnText,
          buttonURL: wCta.btnUrl,
          footer: wCta.footer || "",
          ...(header ? { header } : {}),
        });
      }
      toast.success(t("wabaCtaSent"));
      setWCta({ headerType: "text", headerText: "", headerLink: "", body: "", btnText: "", btnUrl: "", footer: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaCta")); }
  };

  const handleSendWabaReplyButtons = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    const validButtons = wRb.buttons.filter((b) => b.title.trim());
    if (!wRb.body.trim() || validButtons.length === 0) {
      toast.warning(t("fillMsgAndButton")); return;
    }
    try {
      const header = wRb.headerType === "text"
        ? (wRb.headerText ? { type: "text", text: wRb.headerText } : undefined)
        : (wRb.headerLink ? { type: wRb.headerType, link: wRb.headerLink } : undefined);
      const signedBody = applySignature(wRb.body);
      if (isGupshup) {
        await senders.sendReplyButtons({
          ...bspBase(),
          bodyText: signedBody,
          footerText: wRb.footer || "",
          buttons: validButtons.map((b, i) => ({ id: b.id || `btn${i + 1}`, title: b.title })),
          ...(wRb.headerText ? { headerText: wRb.headerText } : {}),
        });
      } else if (isDialog360) {
        await senders.sendReplyButtons({
          ...bspBase(),
          body: signedBody,
          footer: wRb.footer || "",
          buttons: validButtons,
          headerType: wRb.headerType,
          ...(wRb.headerText ? { headerText: wRb.headerText } : {}),
          ...(wRb.headerLink ? { headerMediaLink: wRb.headerLink } : {}),
        });
      } else {
        await sendWabaReplyButtons({
          ...wabaBase(),
          body: signedBody,
          footer: wRb.footer || "",
          buttons: validButtons,
          ...(header ? { header } : {}),
        });
      }
      toast.success(t("wabaReplyButtonsSent"));
      setWRb({ headerType: "text", headerText: "", headerLink: "", body: "", footer: "", buttons: [{ id: "1", title: "" }, { id: "2", title: "" }, { id: "3", title: "" }] });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaReplyButtons")); }
  };

  const handleSendWabaAddress = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wAddr.street1 || !wAddr.city || !wAddr.state || !wAddr.zip || !wAddr.country) {
      toast.warning(t("fillAddressFields")); return;
    }
    try {
      const addressValues = {
        street_1: wAddr.street1, street_2: wAddr.street2,
        city: wAddr.city, state: wAddr.state, zip: wAddr.zip,
        country: wAddr.country, type: wAddr.type,
      };
      if (isGupshup) {
        await senders.sendAddress({
          ...bspBase(),
          bodyText: `${wAddr.street1}, ${wAddr.city} - ${wAddr.state}, ${wAddr.zip}, ${wAddr.country}`,
          country: wAddr.country,
          values: addressValues,
        });
      } else if (isDialog360) {
        await senders.sendAddress({
          ...bspBase(),
          body: `${wAddr.street1}, ${wAddr.city} - ${wAddr.state}, ${wAddr.zip}, ${wAddr.country}`,
          country: wAddr.country,
          values: addressValues,
        });
      } else {
        await sendWabaAddress({ ...wabaBase(), addressData: addressValues });
      }
      toast.success(t("wabaAddressSent"));
      setWAddr({ street1: "", street2: "", city: "", state: "", zip: "", country: "", type: "HOME" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaAddress")); }
  };

  const handleSendWabaLocationReq = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wLocReq.msg.trim()) { toast.warning(t("typeLocationRequestMsg")); return; }
    try {
      const signed = applySignature(wLocReq.msg);
      if (isGupshup) {
        await senders.sendLocationRequest({ ...bspBase(), bodyText: signed });
      } else if (isDialog360) {
        await senders.sendLocationRequest({ ...bspBase(), body: signed });
      } else {
        await sendWabaLocationRequest({ ...wabaBase(), body: signed });
      }
      toast.success(t("wabaLocationReqSent"));
      setWLocReq({ msg: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaLocationReq")); }
  };

  const handleSendWabaLocation = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    const lat = parseFloat(wLoc.lat); const lng = parseFloat(wLoc.lng);
    if (isNaN(lat) || isNaN(lng)) { toast.warning(t("invalidLatLng")); return; }
    try {
      const locPayload = {
        latitude: lat, longitude: lng,
        name: wLoc.name || undefined,
        address: wLoc.addr || undefined,
      };
      if (isGupshup || isDialog360) {
        await senders.sendLocation({ ...bspBase(), ...locPayload });
      } else {
        await sendWabaLocationMsg({ ...wabaBase(), ...locPayload });
      }
      toast.success(t("locationSent"));
      setWLoc({ lat: "", lng: "", name: "", addr: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingLocation")); }
  };

  const handleSendWabaFlow = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wFlow.body.trim() || !wFlow.flowCta.trim()) {
      toast.warning(t("fillMsgAndCta")); return;
    }
    try {
      const header = wFlow.headerType === "text"
        ? (wFlow.headerText ? { type: "text", text: wFlow.headerText } : undefined)
        : (wFlow.headerLink ? { type: wFlow.headerType, link: wFlow.headerLink } : undefined);
      let flowActionPayload: unknown = undefined;
      if (wFlow.payload.trim()) {
        try { flowActionPayload = JSON.parse(wFlow.payload); } catch { toast.warning(t("flowPayloadInvalidJson")); return; }
      }
      const signedBody = applySignature(wFlow.body);
      if (isGupshup) {
        await senders.sendFlow({
          ...bspBase(),
          bodyText: signedBody,
          footerText: wFlow.footer || "",
          flowId: wFlow.flowId || undefined,
          flowCta: wFlow.flowCta,
          flowToken: wFlow.flowToken || undefined,
          flowAction: wFlow.action,
          flowActionPayload,
          ...(wFlow.headerText ? { headerText: wFlow.headerText } : {}),
        });
      } else if (isDialog360) {
        await senders.sendFlow({
          ...bspBase(),
          body: signedBody,
          footer: wFlow.footer || "",
          flowId: wFlow.flowId || undefined,
          flowCta: wFlow.flowCta,
          flowToken: wFlow.flowToken || undefined,
          flowAction: wFlow.action,
          flowActionPayload,
          mode: "published",
          ...(header ? { header } : {}),
        });
      } else {
        await sendWabaFlow({
          ...wabaBase(),
          body: signedBody,
          footer: wFlow.footer || "",
          flowId: wFlow.flowId || undefined,
          flowName: wFlow.flowName || undefined,
          flowCta: wFlow.flowCta,
          flowToken: wFlow.flowToken || undefined,
          flowAction: wFlow.action,
          flowActionPayload,
          ...(header ? { header } : {}),
        });
      }
      toast.success(t("wabaFlowSent"));
      setWFlow({ headerType: "text", headerText: "", headerLink: "", body: "", footer: "", flowId: "", flowName: "", flowCta: "", flowToken: "", action: "navigate", payload: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingWabaFlow")); }
  };

  // ── WABA product/catalog/auth handlers ───────────────────────────────
  // Helper para adicionar msg optimistic no store (usado por handlers Instagram/Messenger QR, Button Template, etc.)
  const addOptimisticMsg = (idFront: string, body: string, mediaType: string = 'chat', extra?: Record<string, any>) => {
    const storeAny = useTicketStore.getState() as any;
    const optimistic: Message = {
      id: idFront,
      stableKey: idFront,
      body,
      fromMe: true,
      read: true,
      mediaType: mediaType as any,
      ack: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      ...(extra || {}),
    } as any;
    if (typeof storeAny.addMessage === 'function') {
      storeAny.addMessage(optimistic);
    }
  };

  // Remove uma msg otimista (ex.: falha no envio) — espelha o cleanup do envio normal.
  const removeOptimisticMsg = (idFront: string) => {
    const storeAny = useTicketStore.getState() as any;
    if (typeof storeAny.setMessages === 'function') {
      storeAny.setMessages((storeAny.messages as Message[]).filter((m) => m.id !== idFront));
    }
  };

  // Instagram/Messenger enviam pelo mesmo Whatsapp.tokenAPI — cai no token curado
  // quando o ticket aberto veio na versao magra da lista (igual ao wabaBase).
  const igBase = useCallback(() => ({
    from: contactFrom, tokenApi: tokenApi || getHealedToken(), ticketId,
    idFront: `front-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }), [contactFrom, tokenApi, ticketId, getHealedToken]);

  const handleSendWabaSingleProduct = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wSingleProduct.catalogId.trim() || !wSingleProduct.productId.trim()) { toast.warning(t("fillAllFields")); return; }
    try {
      if (isGupshup) {
        await senders.sendSingleProduct({
          ...bspBase(),
          bodyText: wSingleProduct.body || undefined,
          catalogId: wSingleProduct.catalogId,
          productId: wSingleProduct.productId,
        });
      } else if (isDialog360) {
        await senders.sendSingleProduct({
          ...bspBase(),
          catalogId: wSingleProduct.catalogId,
          productRetailerId: wSingleProduct.productId,
          body: wSingleProduct.body || undefined,
        });
      } else {
        await sendWabaSingleProduct({ ...wabaBase(), message: wSingleProduct.body || undefined, catalogId: wSingleProduct.catalogId, productId: wSingleProduct.productId });
      }
      toast.success(t("messageSent"));
      setWSingleProduct({ catalogId: "", productId: "", body: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendWabaMultiProduct = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wMultiProduct.catalogId.trim() || !wMultiProduct.productIds.trim() || !wMultiProduct.header.trim() || !wMultiProduct.body.trim()) { toast.warning(t("fillAllFields")); return; }
    try {
      const sections = [{ title: wMultiProduct.sectionTitle || "Produtos", product_items: wMultiProduct.productIds.split(",").map((id) => ({ product_retailer_id: id.trim() })).filter((p) => p.product_retailer_id) }];
      if (isGupshup) {
        await senders.sendMultiProduct({
          ...bspBase(),
          bodyText: wMultiProduct.body || undefined,
          headerText: wMultiProduct.header || undefined,
          footerText: wMultiProduct.footer || undefined,
          catalogId: wMultiProduct.catalogId,
          sections,
        });
      } else if (isDialog360) {
        await senders.sendMultiProduct({
          ...bspBase(),
          body: wMultiProduct.body || undefined,
          headerText: wMultiProduct.header || undefined,
          footer: wMultiProduct.footer || undefined,
          catalogId: wMultiProduct.catalogId,
          sections,
        });
      } else {
        await sendWabaMultiProduct({ ...wabaBase(), message: wMultiProduct.body || undefined, header: wMultiProduct.header || undefined, footer: wMultiProduct.footer || undefined, catalogId: wMultiProduct.catalogId, sections });
      }
      toast.success(t("messageSent"));
      setWMultiProduct({ catalogId: "", body: "", header: "", footer: "", sectionTitle: "", productIds: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendWabaCatalog = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wCatalog.catalogId.trim() || !wCatalog.body.trim()) { toast.warning(t("fillAllFields")); return; }
    try {
      if (isGupshup) {
        await senders.sendCatalog({
          ...bspBase(),
          bodyText: wCatalog.body || undefined,
          catalogId: wCatalog.catalogId,
          thumbnailProductId: wCatalog.thumbnailProductId || undefined,
        });
      } else if (isDialog360) {
        await senders.sendCatalog({
          ...bspBase(),
          body: wCatalog.body || undefined,
          thumbnailProductRetailerId: wCatalog.thumbnailProductId || undefined,
        });
      } else {
        await sendWabaCatalog({ ...wabaBase(), message: wCatalog.body || undefined, catalogId: wCatalog.catalogId, thumbnailProductId: wCatalog.thumbnailProductId || undefined });
      }
      toast.success(t("messageSent"));
      setWCatalog({ catalogId: "", thumbnailProductId: "", body: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendWabaTemplateAuth = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wTemplateAuth.templateName.trim() || !wTemplateAuth.otpCode.trim()) { toast.warning(t("fillAllFields")); return; }
    try {
      if (isGupshup) {
        await senders.sendTemplateAuth({
          ...bspBase(),
          name: wTemplateAuth.templateName,
          language: wTemplateAuth.language,
          otpCode: wTemplateAuth.otpCode,
        });
      } else if (isDialog360) {
        await senders.sendTemplateAuth({
          ...bspBase(),
          templateName: wTemplateAuth.templateName,
          languageCode: wTemplateAuth.language,
          otpCode: wTemplateAuth.otpCode,
        });
      } else {
        await sendWabaTemplateAuth({ ...wabaBase(), templateName: wTemplateAuth.templateName, language: wTemplateAuth.language, otp_code: wTemplateAuth.otpCode });
      }
      toast.success(t("messageSent"));
      setWTemplateAuth({ templateName: "", language: "pt_BR", otpCode: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendWabaTemplateCarousel = async () => {
    if (!(await ensureWabaToken())) { toast.warning(t("wabaTokenNotFound")); return; }
    if (!wCarousel.templateName.trim() || !wCarousel.cardsJson.trim()) { toast.warning(t("fillAllFields")); return; }
    let cards: unknown;
    try { cards = JSON.parse(wCarousel.cardsJson); } catch { toast.warning(t("flowPayloadInvalidJson")); return; }
    try {
      if (isGupshup) {
        await senders.sendTemplateCarousel({
          ...bspBase(),
          name: wCarousel.templateName,
          language: wCarousel.language,
          cards,
        });
      } else if (isDialog360) {
        await senders.sendTemplateCarousel({
          ...bspBase(),
          templateName: wCarousel.templateName,
          languageCode: wCarousel.language,
          cards,
        });
      } else {
        await sendWabaTemplateCarousel({ ...wabaBase(), templateName: wCarousel.templateName, language: wCarousel.language, cards });
      }
      toast.success(t("messageSent"));
      setWCarousel({ templateName: "", language: "pt_BR", cardsJson: "" });
      closeWaba();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  // ── Instagram interactive handlers ────────────────────────────────────
  const handleSendIgQuickReply = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validReplies = igQr.replies.filter((r) => r.title.trim());
    if (!igQr.message.trim() || validReplies.length === 0) { toast.warning(t("fillMsgAndButton")); return; }
    try {
      await sendInstagramQuickReply({ ...igBase(), message: igQr.message, quickReplies: validReplies });
      toast.success(t("messageSent"));
      setIgQr({ message: "", replies: [{ title: "", payload: "" }] });
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendIgGenericTemplate = async () => {
    if (modalSending) return;
    if (!hasValidGenericElement(igGeneric.elements)) { toast.warning(t("genericTemplate.needCard")); return; }
    setModalSending(true);
    const base = igBase();
    const els = buildGenericElements(igGeneric.elements);
    const titles = (els as any[]).map((e) => e.title).filter(Boolean).join(", ");
    addOptimisticMsg(base.idFront, `GenericTemplate: ${titles}`, 'templates', { dataJson: JSON.stringify({ elements: els }) });
    try {
      const res = await sendInstagramGenericTemplate({ ...base, elements: els });
      // Fora das 24h o backend reenvia o conteudo como texto via HUMAN_AGENT (ate 7 dias).
      if ((res as any)?.data?.fallback === "human_agent") {
        toast.info(t("genericTemplate.sentAsText"));
      } else {
        toast.success(t("messageSent"));
      }
      setIgGeneric({ elements: [emptyGenericElement()] });
      closeIg();
    } catch (err: any) {
      removeOptimisticMsg(base.idFront);
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      const code = err?.response?.data?.error;
      if (code === "ERR_INSTAGRAM_OUTSIDE_WINDOW") {
        toast.error(t("genericTemplate.outsideWindow"));
      } else {
        toast.error(code || err?.response?.data?.message || t("errorSendingMessage"));
      }
    } finally { setModalSending(false); }
  };

  // Fora da janela de 24h: envia TEXTO via HUMAN_AGENT (ate 7 dias) em vez de card,
  // ja que o card nunca e entregue como card fora da janela.
  const handleSendIgText = async () => {
    if (modalSending) return;
    const text = igText.trim();
    if (!text) { toast.warning(t("igText.needText")); return; }
    setModalSending(true);
    const base = igBase();
    addOptimisticMsg(base.idFront, text, 'text');
    try {
      await sendInstagramHumanAgentText({ ...base, message: text });
      toast.success(t("messageSent"));
      setIgText("");
      closeIg();
    } catch (err: any) {
      removeOptimisticMsg(base.idFront);
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      const code = err?.response?.data?.error;
      if (code === "ERR_INSTAGRAM_OUTSIDE_WINDOW") {
        toast.error(t("genericTemplate.outsideWindow"));
      } else {
        toast.error(code || err?.response?.data?.message || t("errorSendingMessage"));
      }
    } finally { setModalSending(false); }
  };

  const handleSendIgPrivateReply = async () => {
    if (modalSending) return;
    setModalSending(true);
    if (!igPrivate.commentId.trim() || !igPrivate.message.trim()) { toast.warning(t("fillAllFields")); return; }
    try {
      await sendInstagramPrivateReply({ ...igBase(), commentId: igPrivate.commentId, message: igPrivate.message });
      toast.success(t("messageSent"));
      setIgPrivate({ commentId: "", message: "" });
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendIgButtonTemplate = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validBtns = igBtn.buttons.filter(b => b.title.trim());
    if (!igBtn.message.trim() || validBtns.length === 0) { toast.warning(t("fillMsgAndButton")); return; }
    try {
      await sendInstagramButtonTemplate({ ...igBase(), message: igBtn.message, buttons: validBtns });
      toast.success(t("messageSent"));
      setIgBtn({ message: "", buttons: [{ type: "postback", title: "", payload: "" }] });
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleOpenIgIceBreakers = async () => {
    setIgIceBreakersLoading(true);
    setIgModal("icebreakers");
    try {
      const res = await getInstagramIceBreakers(tokenApi);
      const items = res.data?.data?.[0]?.ice_breakers?.[0]?.call_to_actions || [];
      if (items.length > 0) setIgIceBreakers(items.map((x: any) => ({ question: x.question || "", payload: x.payload || "" })));
    } catch {} finally { setIgIceBreakersLoading(false); }
  };

  const handleSaveIgIceBreakers = async () => {
    if (modalSending) return;
    setModalSending(true);
    const valid = igIceBreakers
      .filter(ib => ib.question.trim())
      .map(ib => ({ question: ib.question.trim(), payload: ib.payload?.trim() || ib.question.trim() }));
    if (valid.length === 0) { toast.warning(t("fillAllFields")); return; }
    try {
      await setInstagramIceBreakers({ tokenApi, iceBreakers: valid });
      toast.success(t("savedSuccess"));
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleDeleteIgIceBreakers = async () => {
    if (modalSending) return;
    setModalSending(true);
    try {
      await deleteInstagramIceBreakers({ tokenApi });
      toast.success(t("deletedSuccess"));
      setIgIceBreakers([{ question: "", payload: "" }]);
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleOpenIgPersistentMenu = async () => {
    setIgMenuLoading(true);
    setIgModal("persistentmenu");
    try {
      const res = await getInstagramPersistentMenu(tokenApi);
      const items = res.data?.data?.[0]?.persistent_menu?.[0]?.call_to_actions || [];
      if (items.length > 0) setIgMenu(items.map((x: any) => ({ type: x.type || "postback", title: x.title || "", payload: x.payload || "", url: x.url || "" })));
    } catch {} finally { setIgMenuLoading(false); }
  };

  const handleSaveIgPersistentMenu = async () => {
    if (modalSending) return;
    setModalSending(true);
    const valid = igMenu.filter(m => m.title.trim());
    if (valid.length === 0) { toast.warning(t("fillAllFields")); return; }
    try {
      await setInstagramPersistentMenu({ tokenApi, menuItems: valid });
      toast.success(t("savedSuccess"));
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleDeleteIgPersistentMenu = async () => {
    if (modalSending) return;
    setModalSending(true);
    try {
      await deleteInstagramPersistentMenu({ tokenApi });
      toast.success(t("deletedSuccess"));
      setIgMenu([{ type: "postback", title: "", payload: "", url: "" }]);
      closeIg();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  // ── Messenger interactive handlers ────────────────────────────────────
  const handleSendMsgrQuickReply = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validReplies = msgrQr.replies.filter((r) => r.title.trim());
    if (!msgrQr.message.trim() || validReplies.length === 0) { toast.warning(t("fillMsgAndButton")); return; }
    const base = igBase();
    const optTitles = validReplies.map(r => r.title).join(', ');
    addOptimisticMsg(base.idFront, `QR: ${msgrQr.message}${optTitles ? ' | ' + optTitles : ''}`, 'button');
    try {
      await sendMessengerQuickReply({ ...base, message: msgrQr.message, quickReplies: validReplies });
      toast.success(t("messageSent"));
      setMsgrQr({ message: "", replies: [{ title: "", payload: "" }] });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendMsgrGenericTemplate = async () => {
    if (modalSending) return;
    if (!hasValidGenericElement(msgrGeneric.elements)) { toast.warning(t("genericTemplate.needCard")); return; }
    setModalSending(true);
    const base = igBase();
    const els = buildGenericElements(msgrGeneric.elements);
    const titles = (els as any[]).map((e) => e.title).filter(Boolean).join(", ");
    addOptimisticMsg(base.idFront, `GenericTemplate: ${titles}`, 'templates', { dataJson: JSON.stringify({ elements: els }) });
    try {
      await sendMessengerGenericTemplate({ ...base, elements: els });
      toast.success(t("messageSent"));
      setMsgrGeneric({ elements: [emptyGenericElement()] });
      closeMsgr();
    } catch (err: any) {
      removeOptimisticMsg(base.idFront);
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      toast.error(err?.response?.data?.error || err?.response?.data?.message || t("errorSendingMessage"));
    } finally { setModalSending(false); }
  };

  const loadMsgrApprovedTemplates = useCallback(async () => {
    if (!whatsappId) return;
    setMsgrApproved((p) => ({ ...p, loading: true }));
    try {
      const { data } = await listMessengerTemplates(whatsappId);
      const all: Array<{ id: string; name: string; status: string; category: string; language: string; components: Array<{ type: string; text?: string; format?: string }> }> = data?.data || [];
      const approved = all.filter((tpl) => tpl.status === "APPROVED");
      setMsgrApproved((p) => ({ ...p, templates: approved, loading: false }));
    } catch {
      setMsgrApproved((p) => ({ ...p, loading: false }));
      toast.error(t("approvedTemplate.loadError"));
    }
  }, [whatsappId, t]);

  useEffect(() => {
    if (msgrModal === "approvedtemplate") {
      void loadMsgrApprovedTemplates();
    }
  }, [msgrModal, loadMsgrApprovedTemplates]);

  const msgrApprovedSelected = msgrApproved.templates.find(
    (tpl) => tpl.name === msgrApproved.selectedName && (!msgrApproved.selectedLanguage || tpl.language === msgrApproved.selectedLanguage)
  );
  const msgrApprovedBodyText = msgrApprovedSelected?.components.find((c) => c.type === "BODY")?.text || "";
  const msgrApprovedVarCount = (msgrApprovedBodyText.match(/\{\{\d+\}\}/g) || []).length;
  const msgrApprovedPreview = msgrApprovedBodyText.replace(/\{\{(\d+)\}\}/g, (_m, idx) => {
    const i = parseInt(idx, 10) - 1;
    const v = msgrApproved.variables[i];
    return v ? v : `{{${idx}}}`;
  });

  const handleSendMsgrTemplateByName = async () => {
    if (modalSending) return;
    if (!msgrApprovedSelected) { toast.warning(t("approvedTemplate.selectFirst")); return; }
    for (let i = 0; i < msgrApprovedVarCount; i++) {
      if (!msgrApproved.variables[i]?.trim()) { toast.warning(t("approvedTemplate.fillAllVars")); return; }
    }
    setModalSending(true);
    try {
      await sendMessengerTemplateByName({
        ...igBase(),
        templateName: msgrApprovedSelected.name,
        language: msgrApprovedSelected.language,
        variables: msgrApproved.variables.slice(0, msgrApprovedVarCount),
      });
      toast.success(t("messageSent"));
      setMsgrApproved((p) => ({ ...p, selectedName: "", selectedLanguage: "", variables: [] }));
      closeMsgr();
    } catch (err) {
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      toast.error(t("errorSendingMessage"));
    } finally {
      setModalSending(false);
    }
  };

  const handleSendMsgrButtonTemplate = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validBtns = msgrBtn.buttons
      .filter((b) => b.title.trim())
      .map(b => {
        if (b.type === 'web_url') {
          return { type: 'web_url', title: b.title, url: b.payload || '' };
        }
        return { type: 'postback', title: b.title, payload: b.payload?.trim() || b.title.trim() };
      });
    if (!msgrBtn.message.trim() || validBtns.length === 0) { toast.warning(t("fillMsgAndButton")); setModalSending(false); return; }
    const base = igBase();
    // Encode button metadata no body: title>>>>url (web_url) ou title (postback default)
    const btnTitles = validBtns.map((b: any) =>
      b.type === 'web_url' && b.url ? `${b.title}>>>>${b.url}` : b.title
    ).join(' | ');
    addOptimisticMsg(base.idFront, `ButtonTemplate: ${msgrBtn.message}${btnTitles ? ' | ' + btnTitles : ''}`, 'button');
    try {
      await sendMessengerButtonTemplate({ ...base, message: msgrBtn.message, buttons: validBtns });
      toast.success(t("messageSent"));
      setMsgrBtn({ message: "", buttons: [{ type: "postback", title: "", payload: "" }] });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendMsgrPrivateReply = async () => {
    if (modalSending) return;
    setModalSending(true);
    if (!msgrPrivate.message.trim() || (!msgrPrivate.commentId.trim() && !msgrPrivate.postId.trim())) { toast.warning(t("fillAllFields")); return; }
    try {
      await sendMessengerPrivateReply({ ...igBase(), message: msgrPrivate.message, commentId: msgrPrivate.commentId || undefined, postId: msgrPrivate.postId || undefined });
      toast.success(t("messageSent"));
      setMsgrPrivate({ commentId: "", postId: "", message: "" });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const pickMsgrMediaGalleryItem = (item: GalleryItem) => {
    setMsgrMedia(p => ({ ...p, mediaUrl: item.url }));
    setMsgrMediaGalleryOpen(false);
  };

  const handleSendMsgrMediaTemplate = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validBtns = msgrMedia.buttons
      .filter(b => b.title.trim())
      .map(b => ({
        type: b.type,
        title: b.title,
        ...(b.type === 'postback' ? { payload: b.payload?.trim() || b.title.trim() } : { url: b.url })
      }));
    if (!msgrMedia.mediaUrl.trim() || validBtns.length === 0) { toast.warning(t("fillAllFields")); return; }
    const base = igBase();
    const btnTitles = validBtns.map(b => b.title).join(' | ');
    addOptimisticMsg(base.idFront, `MediaTemplate: ${msgrMedia.mediaType} | ${msgrMedia.mediaUrl}${btnTitles ? ' | ' + btnTitles : ''}`, 'templates');
    try {
      await sendMessengerMediaTemplate({
        ...base,
        mediaType: msgrMedia.mediaType,
        mediaUrl: msgrMedia.mediaUrl,
        buttons: validBtns
      });
      toast.success(t("messageSent"));
      setMsgrMedia({ mediaType: 'image', mediaUrl: '', buttons: [{ type: 'postback', title: '', payload: '' }] });
      closeMsgr();
    } catch (err: any) {
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      const apiErr = err?.response?.data?.error || err?.data?.error;
      if (typeof apiErr === 'string' && apiErr.includes('MEDIA_URL_EXTERNAL')) {
        toast.error(t("mediaTemplate.errorExternalUrl"), { duration: 6000 });
      } else {
        toast.error(t("errorSendingMessage"));
      }
    }
  };

  const handleSendMsgrReceiptTemplate = async () => {
    if (modalSending) return;
    setModalSending(true);
    const validItems = msgrReceipt.items.filter(i => i.title.trim() && i.price);
    if (!msgrReceipt.recipientName.trim() || !msgrReceipt.orderNumber.trim() || !msgrReceipt.paymentMethod.trim() || !msgrReceipt.totalCost || validItems.length === 0) {
      toast.warning(t("fillAllFields"));
      return;
    }
    const base = igBase();
    const itemsLine = validItems.map(i => `${i.title} (${i.quantity || 1}x ${i.price} ${msgrReceipt.currency})`).join('; ');
    addOptimisticMsg(base.idFront, `Receipt: ${msgrReceipt.orderNumber} | ${msgrReceipt.recipientName} | ${msgrReceipt.currency} ${msgrReceipt.totalCost} | ${msgrReceipt.paymentMethod} | ${itemsLine}`, 'templates');
    try {
      await sendMessengerReceiptTemplate({
        ...base,
        receipt: {
          recipient_name: msgrReceipt.recipientName,
          order_number: msgrReceipt.orderNumber,
          currency: msgrReceipt.currency,
          payment_method: msgrReceipt.paymentMethod,
          summary: { total_cost: parseFloat(msgrReceipt.totalCost) },
          elements: validItems.map(i => ({
            title: i.title,
            price: parseFloat(i.price),
            quantity: parseInt(i.quantity || '1', 10)
          }))
        }
      });
      toast.success(t("messageSent"));
      setMsgrReceipt({ recipientName: '', orderNumber: '', currency: 'BRL', paymentMethod: '', totalCost: '', items: [{ title: '', price: '', quantity: '1' }] });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendMsgrMessageTag = async () => {
    if (modalSending) return;
    setModalSending(true);
    if (!msgrTag.message.trim() || !msgrTag.tag) { toast.warning(t("fillAllFields")); return; }
    const base = igBase();
    addOptimisticMsg(base.idFront, `[${msgrTag.tag}] ${msgrTag.message}`, 'text');
    try {
      await sendMessengerMessageTag({
        ...base,
        tag: msgrTag.tag,
        message: msgrTag.message
      });
      toast.success(t("messageSent"));
      setMsgrTag({ tag: 'ACCOUNT_UPDATE', message: '' });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  const handleSendMsgrCustomerFeedback = async () => {
    if (modalSending) return;
    setModalSending(true);
    if (!msgrFeedback.title.trim() || !msgrFeedback.questionTitle.trim()) {
      toast.warning(t("fillAllFields"));
      setModalSending(false);
      return;
    }
    const base = igBase();
    const bodyText = `CustomerFeedback: ${msgrFeedback.title}${msgrFeedback.subtitle ? ' | ' + msgrFeedback.subtitle : ''} | ${msgrFeedback.questionType.toUpperCase()}: ${msgrFeedback.questionTitle}`;
    addOptimisticMsg(base.idFront, bodyText, 'templates');
    try {
      await sendMessengerCustomerFeedback({
        ...base,
        title: msgrFeedback.title,
        subtitle: msgrFeedback.subtitle || undefined,
        business_privacy_url: msgrFeedback.privacyUrl || undefined,
        expires_in_days: msgrFeedback.expiresInDays ? parseInt(msgrFeedback.expiresInDays, 10) : undefined,
        feedback_screens: [{
          questions: [{
            id: msgrFeedback.questionType.toUpperCase(),
            type: msgrFeedback.questionType,
            title: msgrFeedback.questionTitle
            // score_label e score_option sao normalizados no backend conforme o tipo
          }]
        }]
      });
      toast.success(t("messageSent"));
      setMsgrFeedback({ title: '', subtitle: '', questionType: 'csat', questionTitle: '', expiresInDays: '', privacyUrl: '' });
      closeMsgr();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMessage")); } finally { setModalSending(false); }
  };

  // ── Location / vCard / Video Conference / Sticker handlers ───────────
  const handleSendLocationDialog = async () => {
    const lat = parseFloat(locLat);
    const lng = parseFloat(locLng);
    if (isNaN(lat) || isNaN(lng)) { toast.warning(t("invalidLatLng")); return; }
    setSendingLocation(true);
    try {
      await sendLocation(ticketId, { latitude: lat, longitude: lng, name: locName || undefined, address: locAddr || undefined });
      toast.success(t("locationSent"));
      setLocationModal(false);
      setLocLat(""); setLocLng(""); setLocName(""); setLocAddr("");
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingLocation")); }
    finally { setSendingLocation(false); }
  };

  const handleSendVcard = async () => {
    if (!vcardFullName.trim() || !vcardPhone.trim()) { toast.warning(t("fillNameAndPhone")); return; }
    const digits = vcardPhone.replace(/\D/g, "");
    setSendingVcard(true);
    try {
      await sendVcard(ticketId, { fullName: vcardFullName.trim(), phoneNumber: vcardPhone.trim(), wuid: digits });
      toast.success(t("contactSent"));
      setVcardModal(false);
      setVcardFullName(""); setVcardPhone(""); setVcardSearch(""); setVcardSearchResults([]);
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingContact")); }
    finally { setSendingVcard(false); }
  };

  useEffect(() => {
    if (!vcardSearch.trim()) { setVcardSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setVcardSearchLoading(true);
      try {
        const res = await fetchContacts({ searchParam: vcardSearch.trim(), pageNumber: 1 });
        const contacts: Contact[] = res.data?.contacts ?? res.data ?? [];
        setVcardSearchResults(contacts.slice(0, 8));
      } catch { setVcardSearchResults([]); }
      finally { setVcardSearchLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [vcardSearch]);

  const handleVideoConference = async () => {
    const provider = getConfigValue("videoConferenceProvider") ?? "jitsi";
    if (provider === "google_meet") {
      try {
        const { data } = await createGoogleMeetLink();
        onSendText(applySignature(data.meetLink));
        toast.success(t("googleMeetLinkSent"));
      } catch {
        toast.error(t("errorCreatingMeetLink"));
      }
    } else {
      const rand = () => Math.random().toString(36).slice(2, 10);
      const link = `https://meet.jit.si/${rand()}/${rand()}`;
      onSendText(applySignature(link));
    }
  };

  const handleStickerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onSendMedia(file, "", undefined, true);
    e.target.value = "";
  };

  // ── Group / Interactive handlers ──────────────────────────────────────
  const ticketForPayload = ticket as Record<string, unknown>;

  const handleSendGhost = async () => {
    if (!ghostBody.trim()) { toast.warning(t("typeGhostMessage")); return; }
    const idFront = `front-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const bodyToSend = applySignature(ghostBody);
    // Bolha otimista imediata; o ghost preserva o body, então o chat:create reconcilia por body.
    addOptimisticMsg(idFront, bodyToSend);
    try {
      await sendGhostMessage({ body: bodyToSend, ticket: ticketForPayload, channel: ch, whatsappId });
      toast.success(t("ghostMessageSent"));
      setGhostBody(""); closeGroup();
    } catch (err) {
      removeOptimisticMsg(idFront);
      if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return;
      toast.error(t("errorSendingGhostMessage"));
    }
  };

  const handleSendMention = async () => {
    if (!mentionBody.trim()) { toast.warning(t("typeMessage")); return; }
    try {
      if (mentionType === "all") {
        await sendMentionAllMessage({ body: applySignature(mentionBody), ticket: ticketForPayload, channel: ch, whatsappId });
      } else {
        const participants = mentionParticipants.split(",").map((p) => p.trim()).filter(Boolean);
        if (participants.length === 0) { toast.warning(t("provideAtLeastOneParticipant")); return; }
        await sendMentionMessage({ body: applySignature(mentionBody), ticket: ticketForPayload, channel: ch, whatsappId, participants });
      }
      toast.success(t("mentionMessageSent"));
      setMentionBody(""); setMentionParticipants(""); closeGroup();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingMention")); }
  };

  const resetInteractive = () => {
    setInteractiveBody(""); setInteractiveFooter(""); setInteractiveHeaderTitle("");
    setInteractiveButtons([]); setBtnText(""); setBtnId(""); setBtnUrl(""); setCtaBtnType("url");
    setListTitle(""); setListSections([]); setSecTitle(""); setRowId(""); setRowTitle(""); setRowDesc(""); setPendingRows({});
    setPollName(""); setPollOptions(["", ""]); setPollSelectable(1);
    setMenuTitle(""); setMenuOptions([""]);
    setCatalogDisplayText(""); setCatalogId(""); setCatalogProductIds("");
    setCarouselCards([emptyCarouselCard()]);
    setPixKey(""); setPixType("EVP"); setPixName("");
    setCtaDisplayText(""); setCtaCopyCode(""); setCtaUrl(""); setCtaPhone("");
  };

  const baseInteractivePayload = () => ({
    channel: ch, ticket: ticketForPayload, whatsappId,
  });

  const openCarGallery = async (cardIndex: number) => {
    setCarGalleryTarget(cardIndex);
    setCarGallerySearch("");
    setCarGalleryLoading(true);
    setCarGalleryOpen(true);
    try {
      const result = await fetchGallery({ fileType: "image", pageNumber: 1 });
      setCarGalleryItems(result.data);
    } catch { /* ignore */ } finally { setCarGalleryLoading(false); }
  };

  const pickCarGalleryItem = (item: GalleryItem) => {
    if (carGalleryTarget === null) return;
    // Fecha a galeria (Dialog filho) no proximo frame (rAF), nao sincronamente no clique:
    // em touch, desmontar o filho no mesmo clique faz o Radix fechar o Dialog pai junto.
    requestAnimationFrame(() => {
      setCarouselCards((prev) => prev.map((c, i) => (i === carGalleryTarget ? { ...c, mediaUrl: item.url } : c)));
      setCarGalleryOpen(false);
      setCarGalleryTarget(null);
    });
  };

  const handleSendInteractive = async () => {
    try {
      switch (interactiveType) {
        case "quickReply": {
          const buttons = interactiveButtons.filter((b) => b.display_text.trim());
          if (!interactiveBody.trim() || buttons.length === 0) { toast.warning(t("fillMsgAndButton")); return; }
          await sendInteractiveQuickReply({ ...baseInteractivePayload(), body: { text: interactiveBody }, footer: interactiveFooter ? { text: interactiveFooter } : undefined, buttons });
          break;
        }
        case "singleSelect": {
          if (!interactiveBody.trim() || !listTitle.trim() || listSections.length === 0) { toast.warning(t("fillMsgListTitleSection")); return; }
          await sendInteractiveSingleSelect({ ...baseInteractivePayload(), body: { text: interactiveBody }, footer: interactiveFooter ? { text: interactiveFooter } : undefined, list: { title: listTitle, sections: listSections } });
          break;
        }
        case "ctaButtons": {
          // Backend sendCTAButtons exige { type, text, url|phoneNumber|copyText } (whitelist url/call/copy).
          // Mapeamos só aqui; o estado segue com display_text (compartilhado c/ quickReply, intacto).
          const ctaBtns = interactiveButtons
            .filter((b) => {
              if (!b.display_text.trim()) return false;
              const bt = b.type || "url";
              if (bt === "call") return !!b.phoneNumber?.trim();
              if (bt === "copy") return !!b.copyText?.trim();
              return !!b.url?.trim();
            })
            .map((b) => {
              const bt = b.type || "url";
              if (bt === "call") return { type: "call", text: b.display_text, phoneNumber: b.phoneNumber! };
              if (bt === "copy") return { type: "copy", text: b.display_text, copyText: b.copyText! };
              return { type: "url", text: b.display_text, url: b.url! };
            });
          if (!interactiveBody.trim() || ctaBtns.length === 0) { toast.warning(t("fillMsgAndButtonWithUrl")); return; }
          await sendInteractiveCTAButtons({ ...baseInteractivePayload(), body: { text: interactiveBody }, footer: interactiveFooter ? { text: interactiveFooter } : undefined, buttons: ctaBtns });
          break;
        }
        case "menuText": {
          const opts = menuOptions.filter((o) => o.trim());
          if (!interactiveBody.trim() || opts.length === 0) { toast.warning(t("fillMsgAndOption")); return; }
          await sendInteractiveMenuText({ ...baseInteractivePayload(), title: menuTitle || undefined, text: interactiveBody, options: opts, footer: interactiveFooter || undefined });
          break;
        }
        case "poll": {
          const opts = pollOptions.filter((o) => o.trim());
          if (!pollName.trim() || opts.length < 2) { toast.warning(t("pollNameAndOptions")); return; }
          if (opts.length > 12) { toast.warning(t("pollMaxOptions")); return; }
          await sendInteractivePoll({ ...baseInteractivePayload(), name: pollName, options: opts, selectableCount: pollSelectable });
          break;
        }
        case "catalog": {
          if (!catalogDisplayText.trim() || !catalogId.trim() || !catalogProductIds.trim()) { toast.warning(t("fillAllCatalogFields")); return; }
          const productIds = catalogProductIds.split(",").map((id) => id.trim()).filter(Boolean);
          await sendInteractiveCatalog({ ...baseInteractivePayload(), body: { text: interactiveBody }, footer: interactiveFooter ? { text: interactiveFooter } : undefined, catalog: { display_text: catalogDisplayText, catalog_id: catalogId, product_retailer_ids: productIds } });
          break;
        }
        case "carousel": {
          // Cada card no formato do backend (nativeCarousel): header{title,mediaUrl} + body{text} + footer{text} + buttons(quick_reply)
          const cards = carouselCards
            .map((c) => {
              const buttons = c.buttons
                .filter((b) => b.display_text.trim())
                .map((b) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: b.display_text.trim(), id: (b.id || b.display_text).trim() }) }));
              const header: Record<string, string> = {};
              if (c.title.trim()) header.title = c.title.trim();
              if (c.mediaUrl.trim()) header.mediaUrl = c.mediaUrl.trim();
              const card: Record<string, unknown> = { body: { text: c.body.trim() }, buttons };
              if (Object.keys(header).length) card.header = header;
              if (c.footer.trim()) card.footer = { text: c.footer.trim() };
              return { card, hasContent: !!(c.body.trim() || c.mediaUrl.trim() || buttons.length), hasImage: !!c.mediaUrl.trim(), hasButton: buttons.length > 0 };
            })
            .filter((x) => x.hasContent);
          if (cards.length < 2) { toast.warning(t("carouselMinCardsWarn")); return; }
          if (cards.length > CAROUSEL_MAX_CARDS) { toast.warning(t("carouselMaxCardsWarn", { max: CAROUSEL_MAX_CARDS })); return; }
          if (cards.some((x) => !x.hasImage)) { toast.warning(t("carouselCardNeedsImageWarn")); return; }
          if (cards.some((x) => !x.hasButton)) { toast.warning(t("fillCardTextAndButton")); return; }
          await sendInteractiveCarousel({
            ...baseInteractivePayload(),
            ...(interactiveBody.trim() ? { body: { text: interactiveBody.trim() } } : {}),
            ...(interactiveFooter.trim() ? { footer: { text: interactiveFooter.trim() } } : {}),
            carousel: cards.map((x) => x.card),
          });
          break;
        }
        case "pixButton": {
          if (!pixKey.trim()) { toast.warning(t("pixKeyRequired")); return; }
          await sendInteractivePixButton({
            ...baseInteractivePayload(),
            pixKey: pixKey.trim(),
            pixType,
            pixName: pixName.trim() || undefined,
            bodyText: interactiveBody.trim() || undefined,
          });
          break;
        }
        case "ctaCopy": {
          if (!interactiveBody.trim() || !ctaDisplayText.trim() || !ctaCopyCode.trim()) { toast.warning(t("ibCtaCopyFillWarn")); return; }
          await sendInteractiveCtaCopy({
            ...baseInteractivePayload(),
            body: { text: interactiveBody },
            footer: interactiveFooter ? { text: interactiveFooter } : undefined,
            displayText: ctaDisplayText.trim(),
            copyCode: ctaCopyCode.trim(),
          });
          break;
        }
        case "ctaUrl": {
          if (!interactiveBody.trim() || !ctaDisplayText.trim() || !ctaUrl.trim()) { toast.warning(t("ibCtaUrlFillWarn")); return; }
          await sendInteractiveCtaUrl({
            ...baseInteractivePayload(),
            body: { text: interactiveBody },
            footer: interactiveFooter ? { text: interactiveFooter } : undefined,
            displayText: ctaDisplayText.trim(),
            url: ctaUrl.trim(),
          });
          break;
        }
        case "ctaCall": {
          if (!interactiveBody.trim() || !ctaDisplayText.trim() || !ctaPhone.trim()) { toast.warning(t("ibCtaCallFillWarn")); return; }
          await sendInteractiveCtaCall({
            ...baseInteractivePayload(),
            body: { text: interactiveBody },
            footer: interactiveFooter ? { text: interactiveFooter } : undefined,
            displayText: ctaDisplayText.trim(),
            phoneNumber: ctaPhone.trim(),
          });
          break;
        }
      }
      toast.success(t("interactiveMessageSent"));
      resetInteractive(); closeGroup();
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t(isZapo ? "errorSendingInteractiveMessageZapo" : "errorSendingInteractiveMessage")); }
  };

  // ── Email (webmail / hub_email) handler ──────────────────────────────
  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      toast.warning(t("fillEmailFields")); return;
    }
    setLoadingEmail(true);
    try {
      const cc = emailCc.split(",").map((s) => s.trim()).filter(Boolean);
      const bcc = emailBcc.split(",").map((s) => s.trim()).filter(Boolean);
      // Headers de threading SMTP — preserva conversa no cliente do destinatário.
      // Prioriza a mensagem em replyTo (clicada explicitamente); senão, último inbound com emailMetadata.
      const replyInfo = buildEmailReplyInfo(useTicketStore.getState().messages, replyTo);
      await sendEmailWebmail(whatsappId, {
        to: emailTo.trim(),
        subject: emailSubject.trim(),
        text: emailBody,
        ticketId: ticketId,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        ...(emailAttachments.length > 0 ? { attachments: emailAttachments } : {}),
        ...(replyInfo.inReplyTo && { inReplyTo: replyInfo.inReplyTo }),
        ...(replyInfo.references && { references: replyInfo.references }),
      });
      toast.success(t("emailSent"));
      setEmailModal(false);
      setEmailTo(""); setEmailCc(""); setEmailBcc(""); setEmailSubject(""); setEmailBody(""); setEmailAttachments([]);
    } catch { toast.error(t("errorSendingEmail")); }
    finally { setLoadingEmail(false); }
  };

  const handleEmailAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = (reader.result as string).split(",")[1] || "";
        setEmailAttachments((prev) => [...prev, { filename: file.name, content, contentType: file.type || undefined }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // ── Hub WABA template handlers ────────────────────────────────────────
  const handleOpenHubTemplates = async () => {
    setHubTemplateModal(true);
    setSelectedHubTemplate(null);
    setHubTemplateSearch("");
    if (hubTemplates.length > 0) return;
    setLoadingHubTemplates(true);
    try {
      const { data } = await listHubTemplates({ whatsappId });
      const list: WabaTemplate[] = Array.isArray(data) ? data : [];
      // Filter: no VIDEO/IMAGE/DOCUMENT headers, no {{}} variables (matches Vue buscarTemplateWabaHub)
      const filtered = list.filter((tmpl) => {
        const hasMediaHeader = tmpl.components?.some((c) =>
          c.type === "HEADER" && ["VIDEO", "IMAGE", "DOCUMENT"].includes(c.format || "")
        );
        const hasVars = tmpl.components?.some((c) => c.text?.includes("{{"));
        return !hasMediaHeader && !hasVars;
      });
      setHubTemplates(filtered);
    } catch { toast.error(t("errorLoadingHubTemplates")); }
    finally { setLoadingHubTemplates(false); }
  };

  const handleSendHubTemplate = async () => {
    if (!selectedHubTemplate) { toast.warning(t("selectTemplate")); return; }
    try {
      await sendHubTemplate({
        whatsappId,
        recipientNumber: contactFrom,
        templateName: selectedHubTemplate.name,
        language: selectedHubTemplate.language,
        components: [],
        ticketId,
        body: JSON.stringify(selectedHubTemplate.components || []),
        read: 1,
        fromMe: true,
        mediaUrl: "",
        mediaType: "templates",
        sendType: "templates",
      });
      toast.success(t("hubTemplateSent"));
      setSelectedHubTemplate(null);
      setHubTemplateModal(false);
    } catch (err) { if (handleTicketAccessDenied(err, useTicketStore.getState().currentTicket?.id ?? 0, tChat("noTicketAccess"))) return; toast.error(t("errorSendingHubTemplate")); }
  };

  // ── AI Rewrite ────────────────────────────────────────────────────────
  const handleRewrite = async (style: "profissional" | "simpatico" | "marketing" | "ortografia") => {
    if (!text.trim()) { toast.warning(tR("warning1")); return; }
    setRewriting(true);
    try {
      const sourceParam = rewriteSource === "auto" ? undefined : rewriteSource;
      const { data } = await api.post<{ rewritten: string; model: string; provider: string; source?: string }>("/copilot/rewrite", {
        text,
        style,
        ticketId,
        ...(sourceParam ? { source: sourceParam } : {}),
      });
      const rewritten = data.rewritten;
if (data.model) setRewriteModel(data.model);
      if (data.provider) setRewriteProvider(data.provider);
      setRewriteBackup(text);
      setText(rewritten);
      const styleLabel = tR(style === "profissional" ? "pro" : style === "simpatico" ? "simp" : style === "marketing" ? "marketing" : "ortografia");
      toast.success(`${tR("warning3")} ${styleLabel}`, {
        action: { label: tR("desfazer"), onClick: () => { setText(text); setRewriteBackup(null); toast.info(tR("warning4")); } },
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) { toast.error(tR("warning2")); } else { toast.error(tR("error1")); }
    } finally {
      setRewriting(false);
    }
  };

  const applyNoteFile = (file: File | null) => {
    setNoteFile(file);
    if (!file) { setNoteFilePreview(null); return; }
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setNoteFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setNoteFilePreview(null);
    }
  };

  const handleNoteFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyNoteFile(e.target.files?.[0] ?? null);
  };

  const handleNotePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    applyNoteFile(file);
  };

  const handleNoteDragOver = (e: React.DragEvent) => { e.preventDefault(); setNoteDropActive(true); };
  const handleNoteDragLeave = () => setNoteDropActive(false);
  const handleNoteDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setNoteDropActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) applyNoteFile(file);
  };

  const handleOpenNoteGallery = async () => {
    setNoteGalleryOpen(true);
    if (noteGalleryItems.length > 0) return;
    setNoteGalleryLoading(true);
    try {
      const res = await fetchGallery();
      setNoteGalleryItems(res.data);
    } catch { /* silently ignore */ }
    finally { setNoteGalleryLoading(false); }
  };

  const handleSelectGalleryForNote = async (item: GalleryItem) => {
    // Fecha a galeria (Dialog filho) no proximo frame (rAF), nao sincronamente no clique:
    // em touch, desmontar o filho no mesmo clique faz o Radix fechar o Dialog pai (nota) junto.
    requestAnimationFrame(() => setNoteGalleryOpen(false));
    try {
      const blob = await fetchGalleryBlob(item);
      const file = new File([blob], item.name, { type: item.type || blob.type || "application/octet-stream" });
      applyNoteFile(file);
    } catch { toast.error(t("noteError")); }
  };

  const resetNoteDialog = () => {
    setNoteText("");
    setNoteFile(null);
    setNoteFilePreview(null);
    if (noteFileInputRef.current) noteFileInputRef.current.value = "";
  };

  const handleCreateNote = async () => {
    const body = noteText.trim();
    if ((!body && !noteFile) || !ticketId || noteSaving) return;
    setNoteSaving(true);
    try {
      await createTicketNote({ content: body, ticketId, idFront: crypto.randomUUID(), file: noteFile ?? undefined });
      toast.success(t("noteAdded"));
      resetNoteDialog();
      setNoteModal(false);
    } catch {
      toast.error(t("noteError"));
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSummarize = async () => {

    const daysMap: Record<string, number> = { "1d": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30 };
    const cutoff = summarizeForm.period !== "all"
      ? Date.now() - (daysMap[summarizeForm.period] ?? 7) * 24 * 60 * 60 * 1000
      : 0;
    const maxCount = summarizeForm.max !== "all" ? Number(summarizeForm.max) : 500;
    // Collect up to 3x maxCount to account for sender filter reducing results; hard cap 500
    const collectTarget = Math.min(maxCount * 3, 500);

    setSummarizing(true);

    try {
      // Fetch messages paginated from API (page 1 = most recent, DESC order)
      const collected: Message[] = [];
      let page = 1;
      let keepFetching = true;

      while (keepFetching) {
        const res = await fetchMessages(ticketId, { pageNumber: page, markAsRead: false });
        const data = res.data as { messages?: Message[]; hasMore?: boolean };
        const batch = (data.messages ?? []) as Message[];

        if (!batch.length) break;

        for (const msg of batch) {
          if (!msg.body?.trim() || msg.isDeleted || msg.mediaType === "notes") continue;
          // Messages arrive ASC within each page; skip old ones instead of stopping
          if (cutoff > 0 && new Date(msg.createdAt).getTime() < cutoff) continue;
          collected.push(msg);
          if (collected.length >= collectTarget) {
            keepFetching = false;
            break;
          }
        }

        // Pages go newest→oldest; if the newest msg in this page is older than cutoff, stop
        if (cutoff > 0 && batch.length > 0) {
          const newestInPage = batch[batch.length - 1];
          if (new Date(newestInPage.createdAt).getTime() < cutoff) keepFetching = false;
        }

        if (!data.hasMore) break;
        page++;
      }

      // Apply sender filter
      let filtered = collected;
      if (summarizeForm.sender === "contact") filtered = filtered.filter((m) => !m.fromMe);
      if (summarizeForm.sender === "me") filtered = filtered.filter((m) => m.fromMe);

      if (!filtered.length) {
        toast.warning(tS("noMessages"));
        setSummarizing(false);
        return;
      }

      // API returns DESC (newest first) — reverse to chronological for the prompt
      filtered = [...filtered].reverse();

      // Apply max: take the last N (most recent) after chronological sort
      if (filtered.length > maxCount) filtered = filtered.slice(-maxCount);

      const conversation = filtered.map((m) => {
        const d = new Date(m.createdAt);
        const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
        const sender = m.fromMe ? tS("agentLabel") : tS("contactLabel");
        return `[${time}] ${sender}: ${m.body}`;
      }).join("\n");

      const { data: aiData } = await api.post<{ summary: string }>("/copilot/summarize", {
        conversation,
        type: summarizeForm.type,
        ticketId,
      });
      const summary = aiData.summary;

      setSummarizeOpen(false);
      if (summarizeForm.dest === "input") {
        setText(summary);
        toast.success(tS("inserted"));
      } else {
        setSummaryResult(summary);
        setSummaryResultOpen(true);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) { toast.error(tS("noApiKey")); } else { toast.error(tS("error")); }
    } finally {
      setSummarizing(false);
    }
  };

  if (isEmailChannel) {
    return (
      <div className="border-t p-3">
        <input ref={emailFileRef} type="file" className="hidden" multiple onChange={handleEmailAttachment} />
        <div className="flex items-center justify-center max-w-3xl mx-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const contactEmail = (ticket as { contact?: { email?: string } })?.contact?.email ?? "";
                    setEmailTo(contactEmail);
                    // Pré-preenche subject com "Re: <último assunto>" para preservar thread SMTP.
                    const replyInfo = buildEmailReplyInfo(useTicketStore.getState().messages, replyTo);
                    if (replyInfo.subject) setEmailSubject(replyInfo.subject);
                    setEmailModal(true);
                  }}
                  disabled={isDisabled}
                >
                  <Mail className="h-4 w-4" /> {t("writeEmail")}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{t("sendEmailToContact")}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Email compose dialog */}
        <Dialog open={emailModal} onOpenChange={(open) => { if (!open) setEmailModal(false); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> {t("newEmail")}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">{t("emailTo")}</Label>
                <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder={t("emailToPlaceholder")} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">{t("emailCc")}</Label>
                <Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder={t("emailCcPlaceholder")} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">{t("emailBcc")}</Label>
                <Input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder={t("emailBccPlaceholder")} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">{t("emailSubject")}</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder={t("emailSubjectPlaceholder")} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">{t("emailMessage")}</Label>
                <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={6} className="mt-1 text-sm" placeholder={t("emailMessagePlaceholder")} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">{t("attachments")}</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => emailFileRef.current?.click()}>
                    <Paperclip className="h-3 w-3 mr-1" /> {t("addFile")}
                  </Button>
                </div>
                {emailAttachments.length > 0 && (
                  <div className="space-y-1">
                    {emailAttachments.map((att, i) => (
                      <div key={i} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                        <span className="truncate max-w-[80%]">{att.filename}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEmailAttachments((p) => p.filter((_, j) => j !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailModal(false)}>{t("cancel")}</Button>
              <Button onClick={handleSendEmail} disabled={loadingEmail}>
                {loadingEmail ? t("sending") : t("sendEmail")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Banner "use templates" do canal WABA: tenant pode desligar e/ou customizar o texto
  // (windowTimerBanner / wabaTemplateBanner são injetados via injectTenantSettings no layout)
  const wabaTemplateBannerText = (getConfigValue("wabaTemplateBannerMessage") || "").trim();
  const WabaTemplateBanner = isWaba && getConfigValue("wabaTemplateBanner") !== "disabled" ? (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
      <Settings2 className="h-3.5 w-3.5 shrink-0" />
      <span>{wabaTemplateBannerText || t("wabaBanner")}</span>
    </div>
  ) : null;

  if (recording) {
    return (
      <div className="border-t bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-end gap-1 h-10" aria-hidden>
              {[...Array(12)].map((_, i) => (
                <div key={i} className="w-1.5 rounded-full bg-destructive/90 animate-pulse min-h-[6px]"
                  style={{ height: `${32 + Math.sin((i + recordingTime) * 0.4) * 24}%`, maxHeight: "100%", animationDelay: `${i * 0.06}s` }} />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t("recordingAudio")}</p>
              <p className="text-lg font-mono tabular-nums text-muted-foreground">{fmtTime(recordingTime)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={cancelRecording} className="gap-1.5">
                <X className="h-4 w-4 text-destructive" /> {t("cancel")}
              </Button>
              <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5" onClick={stopRecording}>
                <Square className="h-4 w-4 fill-current" /> {t("stopRecording")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (audioPreview) {
    return (
      <div className="border-t bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <p className="text-sm font-medium mb-3">{t("listenBeforeSend")}</p>
          <audio controls src={audioPreview.url} className="w-full mb-3" />
          <div className="flex items-center gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={discardAudioPreview} className="gap-1.5">
              <X className="h-4 w-4 text-destructive" /> {t("audioPreviewDiscard")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={sendAudioPreview}>
              <Send className="h-4 w-4" /> {t("audioPreviewSend")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Filtered templates ────────────────────────────────────────────────
  const filteredTemplates = wabaTemplates.filter((tp) => {
    if (!matchTemplateCategory(tp, templateCategoryFilter)) return false;
    if (templateSearch && !tp.name.toLowerCase().includes(templateSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="border-t pb-[env(safe-area-inset-bottom)]" onDrop={handleDrop} onDragOver={handleDragOver}>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      <input ref={multiFileInputRef} type="file" className="hidden" multiple onChange={handleMultiFileChange} />
      <input ref={stickerInputRef} type="file" className="hidden" accept="image/webp,image/gif,image/*" onChange={handleStickerFile} />

      {/* Sticker gallery picker dialog */}
      <Dialog open={stickerGalleryOpen} onOpenChange={(o) => { setStickerGalleryOpen(o); if (!o) setStickerGallerySearch(""); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle><Sticker className="inline mr-2 h-4 w-4" />{t("stickerFromGallery")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("searchGalleryPlaceholder")}
            value={stickerGallerySearch}
            onChange={(e) => setStickerGallerySearch(e.target.value)}
            className="mb-2"
          />
          {stickerGalleryLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          ) : stickerGalleryItems.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-10">{t("noImagesInGallery")}</p>
          ) : (
            <ScrollArea className="h-[360px] pr-2">
              <div className="grid grid-cols-4 gap-2">
                {stickerGalleryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleStickerFromGallery(item)}
                    disabled={stickerGallerySendingId !== null}
                    className="relative aspect-square rounded-md border overflow-hidden hover:border-primary transition-colors cursor-pointer disabled:opacity-50 bg-muted"
                    title={item.name}
                  >
                    {stickerGallerySendingId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
                        <Loader2 className="animate-spin h-5 w-5 text-white" />
                      </div>
                    )}
                    <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              {stickerGalleryHasMore && (
                <div className="flex justify-center pt-3 pb-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadMoreStickerGallery}
                    disabled={stickerGalleryLoadingMore}
                  >
                    {stickerGalleryLoadingMore && <Loader2 className="animate-spin h-3 w-3 mr-1.5" />}
                    {t("loadMore")}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {WabaTemplateBanner}

      {windowClosed && getConfigValue("windowClosedBanner") !== "disabled" && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/30 text-foreground text-xs">
          <span className="text-base leading-none">⏳</span>
          <div className="flex-1 min-w-0">
            <span className="font-medium">{t("windowClosed")}</span>
            <span className="text-muted-foreground ml-1">{isInstagram ? t("windowClosedDescInstagram") : hybridLinkedReady ? t("hybridWindowClosedDesc") : t("windowClosedDesc")}</span>
          </div>
          {hybridLinkedReady && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-success/40 text-success hover:bg-success/10 hover:text-success"
              onClick={handleSendViaLinked}
              disabled={!text.trim()}
              title={t("hybridSendViaLinkedTooltip")}
            >
              <Route className="mr-1 h-3 w-3" /> {t("hybridSendViaLinked")}
            </Button>
          )}
          {isWabaLike && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              style={readableWarning ? { color: readableWarning, borderColor: `${readableWarning}66` } : undefined}
              onClick={handleOpenTemplates}
            >
              <BookOpen className="mr-1 h-3 w-3" /> {t("sendTemplate")}
            </Button>
          )}
          {isInstagram && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              onClick={() => { setIgText(""); setIgModal("humanagenttext"); }}
            >
              <MessageSquare className="mr-1 h-3 w-3" /> {t("igText.button")}
            </Button>
          )}
          {isMessenger && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              style={readableWarning ? { color: readableWarning, borderColor: `${readableWarning}66` } : undefined}
              onClick={() => setMsgrModal("generictemplate")}
            >
              <Layers className="mr-1 h-3 w-3" /> {t("sendTemplate")}
            </Button>
          )}
        </div>
      )}

      {!windowClosed && windowChannels && windowRemainingMs !== null && getConfigValue("windowTimerBanner") !== "disabled" && (
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 border-b text-xs text-foreground",
            windowRemainingMs < 60 * 60 * 1000
              ? "bg-warning/10 border-warning/30 [&>svg]:text-warning"
              : "bg-success/10 border-success/30 [&>svg]:text-success"
          )}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{t("windowOpen")}</span>
          <span className="opacity-80">
            {t("windowOpenRemaining", { time: formatWindowRemaining(windowRemainingMs) })}
          </span>
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <div className="h-8 w-1 rounded bg-primary" />
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-medium text-primary", isLiveMode && !replyTo.fromMe && "live-blur-text")}>{replyTo.fromMe ? t("you") : replyTo.contact?.name || t("contact")}</p>
            <p className={cn("text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>{replyTo.body}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClearReply}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 overflow-x-auto">
          {files.map((file, i) => {
            const isImage = file.type.startsWith("image/");
            const isVideo = file.type.startsWith("video/");
            const isAudio = file.type.startsWith("audio/");
            const sizeLabel = file.size >= 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)}MB`
              : `${(file.size / 1024).toFixed(0)}KB`;
            return (
              <div key={i} className="relative shrink-0 group">
                {isImage ? (
                  /* Image thumbnail */
                  <div className="relative rounded-md overflow-hidden border bg-background w-16 h-16">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5">
                      <span className="text-[9px] text-white leading-none truncate block">{sizeLabel}</span>
                    </div>
                  </div>
                ) : (
                  /* Non-image file chip */
                  <div className="flex items-center gap-1.5 rounded-md bg-background border px-2 py-2 text-xs h-16 w-32">
                    <div className="shrink-0 text-muted-foreground">
                      {isVideo ? <Video className="h-5 w-5" /> : isAudio ? <Mic className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block max-w-full truncate font-medium leading-tight">{file.name}</span>
                      <span className="text-muted-foreground text-[10px]">{sizeLabel}</span>
                    </div>
                  </div>
                )}
                {/* Remove button */}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
                  onClick={() => removeFile(i)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Mensagem rápida estruturada preparada (botões/lista) — enviada ao clicar em Enviar */}
      {pendingStructured && (
        <div className="px-4 pb-1 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
            {pendingStructured.mt === "buttons"
              ? <MousePointerClick className="h-3 w-3 shrink-0" />
              : <LayoutList className="h-3 w-3 shrink-0" />}
            <span className="max-w-[180px] truncate font-medium">
              /{(pendingStructured.reply.key || "").replace(/^\//, "")}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-info hover:text-destructive" onClick={() => setPendingStructured(null)}>
            <X className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">{t("quickReplyMediaPending")}</span>
        </div>
      )}

      {/* Pending quick-reply media indicator */}
      {pendingQrMedias.length > 0 && (
        <div className="px-4 pb-1 flex items-center gap-2 flex-wrap">
          {pendingQrMedias.map((filename, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 px-2 py-1 text-xs text-blue-700 dark:text-blue-300">
              {pendingQrVoice ? <Mic className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />}
              <span className="max-w-[150px] truncate">{filename}</span>
            </div>
          ))}
          <Button variant="ghost" size="icon" className="h-5 w-5 text-info hover:text-destructive" onClick={cancelPendingQrMedia}>
            <X className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">{t("quickReplyMediaPending")}</span>
        </div>
      )}

      <div className="px-3 pt-2 pb-0 sm:p-3 relative">
        {showQuickReplies && (
          <>
            {/* Overlay to close on click outside */}
            <div className="fixed inset-0 z-[9]" onClick={() => { setShowQuickReplies(false); }} />
            <div className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border bg-popover shadow-lg z-10 max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground">{t("quickRepliesTooltip")}</span>
                  <span className="hidden sm:inline text-[10px] text-muted-foreground/70 truncate">{t("quickReplyKeyboardHint")}</span>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowQuickReplies(false); textareaRef.current?.focus(); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {filteredReplies.map((r, i) => (
                  <button key={r.id} onClick={() => handleQuickReplySelect(r)}
                    ref={i === quickReplyHighlight ? quickReplyActiveRef : undefined}
                    onMouseEnter={() => setQuickReplyHighlight(i)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-start gap-2 border-b last:border-b-0",
                      i === quickReplyHighlight ? "bg-accent" : "hover:bg-accent"
                    )}>
                    <div className="flex flex-col items-start gap-1 shrink-0 pt-0.5">
                      <Badge variant="secondary" className="text-[10px]">/{(r.key || "").replace(/^\//, "")}</Badge>
                      {r.media && (
                        <Badge variant="outline" className="text-[10px] text-info border-info/40">
                          {r.voice === "enabled" ? t("quickReplyAudioBadge") : t("quickReplyMediaBadge")}
                        </Badge>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 line-clamp-4 whitespace-pre-wrap break-words leading-snug">{r.message}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Auto-suggest banner */}
        {copilotAutoSuggest && !autoSuggestionDismissed && (autoSuggesting || autoSuggestion) && (
          <div className="max-w-3xl mx-auto w-full">
            <div className="flex items-start gap-2 rounded-lg border border-violet-300/60 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-700/50 px-3 py-2 text-sm">
              <Bot className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-0.5">{tC("autoSuggestBanner")}</p>
                {autoSuggesting
                  ? <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{tC("autoSuggestLoading")}</p>
                  : <p className="text-xs text-foreground line-clamp-2">{autoSuggestion}</p>
                }
              </div>
              {!autoSuggesting && autoSuggestion && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-2 text-xs shrink-0 bg-violet-600 hover:bg-violet-700"
                  onClick={() => { setText(autoSuggestion); setAutoSuggestionDismissed(true); textareaRef.current?.focus(); }}
                >
                  {tC("autoSuggestUse")}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setAutoSuggestionDismissed(true)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <div className={cn("flex flex-col gap-1.5 max-w-3xl mx-auto", !detailOpen && "sm:flex-row sm:items-end sm:gap-2")}>
          {/* Text area — row 1 on mobile, center on desktop */}
          <div className={cn("order-1 flex flex-col gap-0.5", !detailOpen && "sm:order-2 sm:flex-1")}>
            <div className="relative">
            {rewriting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-background/80 border border-violet-400/40">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                <span className="text-xs text-violet-600">
                  {tR("rewriting")} com {rewriteProvider ? COPILOT_PROVIDER_LABELS[rewriteProvider] ?? rewriteProvider : "IA"}{rewriteModel ? ` (${rewriteModel})` : ""}...
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { const v = e.target.value; setText(v); handleTyping(); updateMentionPicker(v, e.target.selectionStart ?? v.length); }}
              onKeyDown={handleKeyDown}
              onClick={(e) => { if (supportsInlineMention) { const el = e.currentTarget; updateMentionPicker(el.value, el.selectionStart ?? el.value.length); } }}
              onPaste={handlePaste}
              onBlur={() => { stopTyping(); setMentionPickerOpen(false); }}
              placeholder={windowClosed ? (hybridLinkedReady ? t("hybridWindowClosedPlaceholder") : t("windowClosed24h")) : isDisabled ? t("ticketClosed") : t("typeMessage")}
              disabled={isDisabled || rewriting}
              rows={1}
              className={cn(
                "w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[36px] max-h-[120px] disabled:opacity-50",
                text.trim().length > 0 && "pr-8"
              )}
              style={{ height: "auto", overflowY: "hidden" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                const newHeight = Math.min(target.scrollHeight, 120);
                target.style.height = `${newHeight}px`;
                target.style.overflowY = target.scrollHeight > 120 ? "auto" : "hidden";
              }}
            />

            {/* Autocomplete de @menção (estilo WhatsApp) — só grupos Baileys/wweb */}
            {supportsInlineMention && mentionPickerOpen && (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-72 max-w-[90vw] overflow-hidden rounded-lg border bg-popover shadow-lg">
                <div className="max-h-56 overflow-y-auto py-1">
                  {mentionLoading && filteredMentions.length === 0 ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("mentionPickerLoading")}
                    </div>
                  ) : filteredMentions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">{t("mentionPickerNoMembers")}</div>
                  ) : (
                    filteredMentions.map((p, i) => {
                      // Sem telefone conhecido e identificado por LID: mostra só o
                      // nome — o LID cru não diz nada para quem está atendendo.
                      const num = p.number || (p.userId.includes("@lid") ? "" : p.userId.replace(/\D/g, ""));
                      const initials = (p.name || num || "?").trim().slice(0, 2).toUpperCase();
                      return (
                        <button
                          key={p.userId}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectMention(p); }}
                          onMouseEnter={() => setMentionHighlight(i)}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                            i === mentionHighlight ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                            {initials}
                          </span>
                          <span className="flex min-w-0 flex-1 items-baseline gap-1">
                            <span className="truncate font-medium">{p.name || num}</span>
                            {p.name && num ? <span className="shrink-0 text-xs text-muted-foreground">{num}</span> : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Pencil / AI rewrite button inside textarea */}
            {text.trim().length > 0 && !isDisabled && (
              <Popover open={rewritePopoverOpen} onOpenChange={setRewritePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 bottom-1.5 h-6 w-6 rounded-md text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
                    disabled={rewriting}
                    title={tR("title")}
                  >
                    {rewriting
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <PenLine className="h-3 w-3" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-56 p-1">
                  {rewriteSources.copilot.available && rewriteSources.channel.available && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">{tR("source")}</p>
                      <div className="flex gap-1 px-1 pb-1">
                        {(["copilot", "channel"] as const).map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => setRewriteSource(src)}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                              rewriteSource === src
                                ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                                : "text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {src === "copilot" ? <Bot className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
                            {src === "copilot" ? tR("sourceCopilot") : tR("sourceChannel")}
                          </button>
                        ))}
                      </div>
                      <Separator className="mb-1" />
                    </>
                  )}
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">{tR("estilos")}</p>
                  <Separator className="mb-1" />
                  {([
                    { key: "profissional", icon: <PenLine className="h-4 w-4 text-blue-600" />, label: tR("pro"), desc: tR("prodesc") },
                    { key: "simpatico",    icon: <Smile    className="h-4 w-4 text-green-600" />, label: tR("simp"), desc: tR("simpdesc") },
                    { key: "marketing",    icon: <Sparkles className="h-4 w-4 text-orange-500" />, label: tR("marketing"), desc: tR("marketingdesc") },
                    { key: "ortografia",   icon: <FileText className="h-4 w-4 text-purple-600" />, label: tR("ortografia"), desc: tR("ortografiadesc") },
                  ] as const).map(({ key, icon, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={rewriting}
                      onClick={() => { handleRewrite(key); setRewritePopoverOpen(false); }}
                      className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <span className="mt-0.5 shrink-0">{icon}</span>
                      <div>
                        <p className="text-sm font-medium leading-none">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            </div>

            {text.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-muted-foreground">{t("charCount", { count: text.length })}</span>
                <span className="text-[10px] text-muted-foreground">{t("enterToSend")}</span>
              </div>
            )}
          </div>

          {/* Buttons row — row 2 on mobile; dissolves to left+right on desktop (when detail closed) */}
          <div className={cn("order-2 flex items-center justify-between", !detailOpen && "sm:contents")}>
          {/* Left toolbar */}
          <TooltipProvider>
            <div className={cn("flex gap-0.5 shrink-0", !detailOpen && "sm:order-1")}>
              {/* Emoji picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={isDisabled} aria-label={tWaba("labels.emoji")}>
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <div className="flex border-b overflow-x-auto scrollbar-none">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                      <button key={i} onClick={() => setEmojiCategory(i)}
                        className={`flex-shrink-0 px-1.5 py-1.5 text-lg transition-colors ${i === emojiCategory ? "border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-8 gap-0.5 p-2 max-h-52 overflow-y-auto">
                    {EMOJI_CATEGORIES[emojiCategory].emojis.map((e) => (
                      <button key={e} onClick={() => handleEmojiSelect(e)} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-lg">
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Attachment menu */}
              {supportsFiles && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" disabled={isDisabled || hybridTextOnly} aria-label={t("noteAttach")}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel>{t("sendMenu")}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => { fileInputRef.current!.accept = "image/*"; fileInputRef.current!.click(); }}>
                      <ImageIcon className="mr-2 h-4 w-4" /> {t("sendImage")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { fileInputRef.current!.accept = "video/*"; fileInputRef.current!.click(); }}>
                      <Video className="mr-2 h-4 w-4" /> {t("sendVideo")}
                    </DropdownMenuItem>
                    {supportsAttachmentWithCaption && (
                      <DropdownMenuItem onClick={() => { fileInputRef.current!.accept = "*/*"; fileInputRef.current!.click(); }}>
                        <FileText className="mr-2 h-4 w-4" /> {t("sendDocument")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => { multiFileInputRef.current!.accept = "*/*"; multiFileInputRef.current!.click(); }}>
                      <FileImage className="mr-2 h-4 w-4" /> {t("sendMultipleFiles")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOpenGallery}>
                      <FileImage className="mr-2 h-4 w-4" /> {t("fromGallery")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocationModal(true)}>
                      <MapPin className="mr-2 h-4 w-4" /> {t("locationItem")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setVcardModal(true)}>
                      <Contact2 className="mr-2 h-4 w-4" /> {t("contactItem")}
                    </DropdownMenuItem>
                    {(isUazapi || isEvoGo) && (
                      <DropdownMenuItem onClick={() => setUazapiInteractiveOpen(true)}>
                        <LayoutGrid className="mr-2 h-4 w-4" /> {t("uazapiInteractive")}
                      </DropdownMenuItem>
                    )}
                    {supportsInteractiveCore && (
                      <DropdownMenuItem onClick={() => { setInteractiveType("quickReply"); setGroupModal("interactive"); }}>
                        <LayoutGrid className="mr-2 h-4 w-4" /> {t("ibMenu")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleVideoConference}>
                      <Video className="mr-2 h-4 w-4" /> {t("videoConference")}
                    </DropdownMenuItem>
                    {supportsSticker && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Sticker className="mr-2 h-4 w-4" /> {t("sticker")}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => stickerInputRef.current!.click()}>
                            <FileImage className="mr-2 h-4 w-4" /> {t("stickerFromPC")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={openStickerGallery}>
                            <ImageIcon className="mr-2 h-4 w-4" /> {t("stickerFromGallery")}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Quick reply shortcut */}
              {supportsQuickReplies && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" disabled={isDisabled}
                      onClick={() => {
                        setText("/");
                        const compatible = filterRepliesByChannel(quickReplies);
                        setFilteredReplies(compatible);
                        setShowQuickReplies(compatible.length > 0);
                        setQuickReplyHighlight(0);
                        textareaRef.current?.focus();
                      }}>
                      <MessageSquareQuote className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("quickRepliesTooltip")}</TooltipContent>
                </Tooltip>
              )}

              {/* Rewrite AI button — always visible when copilotRewriteAlwaysVisible */}
              {copilotRewriteAlwaysVisible && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
                          disabled={rewriting || isDisabled}
                        >
                          {rewriting
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <PenLine className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        {rewriteSources.copilot.available && rewriteSources.channel.available && (
                          <>
                            <DropdownMenuLabel className="text-xs">{tR("source")}</DropdownMenuLabel>
                            <div className="flex gap-1 px-1 pb-1">
                              {(["copilot", "channel"] as const).map((src) => (
                                <button
                                  key={src}
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); setRewriteSource(src); }}
                                  className={cn(
                                    "flex-1 flex items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                                    rewriteSource === src
                                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                                      : "text-muted-foreground hover:bg-accent",
                                  )}
                                >
                                  {src === "copilot" ? <Bot className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
                                  {src === "copilot" ? tR("sourceCopilot") : tR("sourceChannel")}
                                </button>
                              ))}
                            </div>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuLabel className="text-xs">{tR("estilos")}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleRewrite("profissional")} disabled={rewriting}>
                          <PenLine className="mr-2 h-4 w-4 text-blue-600" /> {tR("pro")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRewrite("simpatico")} disabled={rewriting}>
                          <Smile className="mr-2 h-4 w-4 text-green-600" /> {tR("simp")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRewrite("marketing")} disabled={rewriting}>
                          <Sparkles className="mr-2 h-4 w-4 text-orange-500" /> {tR("marketing")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRewrite("ortografia")} disabled={rewriting}>
                          <FileText className="mr-2 h-4 w-4 text-purple-600" /> {tR("ortografia")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TooltipTrigger>
                  <TooltipContent>{tR("title")}</TooltipContent>
                </Tooltip>
              )}

              {/* More options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={isDisabled && !(windowClosed && (isWabaLike || isInstagram || isMessenger))} aria-label={t("moreOptions")}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" collisionPadding={8} className="w-56 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
                  {onMultiForward && (
                    <DropdownMenuItem onClick={onMultiForward}>
                      <Forward className="mr-2 h-4 w-4" /> {t("multiForward")}
                    </DropdownMenuItem>
                  )}
                  {onScheduleMessage && (
                    <DropdownMenuItem onClick={onScheduleMessage}>
                      <CalendarClock className="mr-2 h-4 w-4" /> {t("scheduleMessage")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => { setNoteText(""); setNoteModal(true); }}>
                    <StickyNote className="mr-2 h-4 w-4 text-yellow-600" /> {t("createNote")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setProductPickerOpen(true)}>
                    <Package className="mr-2 h-4 w-4 text-amber-500" /> {t("insertProduct")}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={rewriting}>
                      {rewriting
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Sparkles className="mr-2 h-4 w-4" />}
                      {t("rewriteWithAI")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {rewriteSources.copilot.available && rewriteSources.channel.available && (
                        <>
                          <DropdownMenuLabel className="text-xs">{tR("source")}</DropdownMenuLabel>
                          <div className="flex gap-1 px-1 pb-1">
                            {(["copilot", "channel"] as const).map((src) => (
                              <button
                                key={src}
                                type="button"
                                onClick={(e) => { e.preventDefault(); setRewriteSource(src); }}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                                  rewriteSource === src
                                    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                                    : "text-muted-foreground hover:bg-accent",
                                )}
                              >
                                {src === "copilot" ? <Bot className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
                                {src === "copilot" ? tR("sourceCopilot") : tR("sourceChannel")}
                              </button>
                            ))}
                          </div>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => handleRewrite("profissional")} disabled={rewriting}>
                        <PenLine className="mr-2 h-4 w-4" /> {t("professional")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRewrite("simpatico")} disabled={rewriting}>
                        <Smile className="mr-2 h-4 w-4" /> {t("friendly")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRewrite("marketing")} disabled={rewriting}>
                        <Sparkles className="mr-2 h-4 w-4" /> {t("marketing")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRewrite("ortografia")} disabled={rewriting}>
                        <FileText className="mr-2 h-4 w-4" /> {t("fixSpelling")}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* ── Summarize with AI ── */}
                  <DropdownMenuItem onClick={() => setSummarizeOpen(true)} disabled={summarizing}>
                    {summarizing
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <BookOpen className="mr-2 h-4 w-4 text-indigo-500" />}
                    {tS("btnLabel")}
                  </DropdownMenuItem>

                  {/* ── Copiloto ── */}
                  {copilotEnabled && (
                    <DropdownMenuItem onClick={() => setCopilotOpen(true)}>
                      <Bot className="mr-2 h-4 w-4 text-violet-500" />
                      {tC("title")}
                    </DropdownMenuItem>
                  )}

                  {/* ── Grupo: mensagem fantasma, menção ── */}
                  {supportsGhostMention && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("groupLabel")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setGroupModal("ghost")} disabled={isDisabled}>
                        <Ghost className="mr-2 h-4 w-4" /> {t("ghostMessage")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupModal("mention")} disabled={isDisabled}>
                        <AtSign className="mr-2 h-4 w-4" /> {t("mentionParticipant")}
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* ── Baileys/Zapo: interativos core (botoes / lista / pix) ── */}
                  {supportsInteractiveCore && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{t("interactiveLabel")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => { setInteractiveType("quickReply"); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <MousePointerClick className="mr-2 h-4 w-4" /> Quick Reply
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setInteractiveType("singleSelect"); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <LayoutList className="mr-2 h-4 w-4" /> Lista (Select)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setInteractiveType("pixButton"); setPixKey(whatsapp?.pixDefaultKey || ""); setPixType((whatsapp?.pixDefaultType as typeof pixType) || "EVP"); setPixName(whatsapp?.pixDefaultName || ""); setInteractiveBody(whatsapp?.pixDefaultMessage || ""); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <Receipt className="mr-2 h-4 w-4" /> Botão PIX
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* ── Baileys/Zapo: extras (cta/menu/poll; catalogo/carousel so baileys) — env-gated ── */}
                  {supportsInteractive && (
                    <>
                      <DropdownMenuItem onClick={() => { setInteractiveType("ctaButtons"); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <ExternalLink className="mr-2 h-4 w-4" /> CTA Buttons
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setInteractiveType("menuText"); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <Menu className="mr-2 h-4 w-4" /> Menu de texto
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setInteractiveType("poll"); setGroupModal("interactive"); }} disabled={isDisabled}>
                        <BarChart2 className="mr-2 h-4 w-4" /> {t("poll")}
                      </DropdownMenuItem>
                      {!isZapo && (
                        <DropdownMenuItem onClick={() => { setInteractiveType("catalog"); setGroupModal("interactive"); }} disabled={isDisabled}>
                          <MessageSquare className="mr-2 h-4 w-4" /> {t("catalog")}
                        </DropdownMenuItem>
                      )}
                      {!isZapo && (
                        <DropdownMenuItem onClick={() => { setInteractiveType("carousel"); setGroupModal("interactive"); }} disabled={isDisabled}>
                          <Zap className="mr-2 h-4 w-4" /> {t("carousel")}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                  {/* ── Hub WABA template ── */}
                  {isHubWaba && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-blue-600 dark:text-blue-400">{t("hubWabaLabel")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleOpenHubTemplates} disabled={isDisabled}>
                        <BookOpen className="mr-2 h-4 w-4" /> {t("hubTemplates")}
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* ── WABA / Dialog360 / Gupshup specific options ── */}
                  {isWabaLike && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-blue-600 dark:text-blue-400">{t("wabaLabel")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleOpenTemplates}>
                        <BookOpen className="mr-2 h-4 w-4" /> {t("wabaTemplates")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("buttons")} disabled={isDisabled || hybridTextOnly}>
                        <MousePointerClick className="mr-2 h-4 w-4" /> {t("wabaButtons")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("list")} disabled={isDisabled || hybridTextOnly}>
                        <LayoutList className="mr-2 h-4 w-4" /> {t("wabaList")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("ctaurl")} disabled={isDisabled || hybridTextOnly}>
                        <Link2 className="mr-2 h-4 w-4" /> {t("wabaCta")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("replybuttons")} disabled={isDisabled || hybridTextOnly}>
                        <Reply className="mr-2 h-4 w-4" /> {t("wabaReplyButtons")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setWabaModal("location")} disabled={isDisabled || hybridTextOnly}>
                        <MapPin className="mr-2 h-4 w-4" /> {t("wabaLocation")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("locationreq")} disabled={isDisabled || hybridTextOnly}>
                        <Navigation className="mr-2 h-4 w-4" /> {t("wabaLocationReq")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("address")} disabled={isDisabled || hybridTextOnly}>
                        <Contact2 className="mr-2 h-4 w-4" /> {t("wabaAddress")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("flow")} disabled={isDisabled || hybridTextOnly}>
                        <Workflow className="mr-2 h-4 w-4" /> {t("wabaFlow")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-blue-500 dark:text-blue-400">{t("wabaProduct.catalog")}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setWabaModal("singleproduct")} disabled={isDisabled || hybridTextOnly}>
                        <Package className="mr-2 h-4 w-4" /> {t("wabaProduct.singleProduct")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("multiproduct")} disabled={isDisabled || hybridTextOnly}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> {t("wabaProduct.multiProduct")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setWabaModal("catalog")} disabled={isDisabled || hybridTextOnly}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> {t("wabaProduct.catalog")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setWabaModal("carousel")} disabled={isDisabled || hybridTextOnly}>
                        <GalleryHorizontalEnd className="mr-2 h-4 w-4" /> {t("wabaTemplateCarousel.title")}
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* ── Instagram specific options ── */}
                  {isInstagram && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-pink-600 dark:text-pink-400">Instagram</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => { setIgText(""); setIgModal("humanagenttext"); }} disabled={isDisabled && !windowClosed}>
                        <MessageSquare className="mr-2 h-4 w-4" /> {t("igText.button")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIgModal("quickreply")} disabled={isDisabled && !windowClosed}>
                        <Zap className="mr-2 h-4 w-4" /> {t("instagramQuickReply.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIgModal("buttontemplate")} disabled={isDisabled && !windowClosed}>
                        <MousePointerClick className="mr-2 h-4 w-4" /> {t("igButtonTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIgModal("generictemplate")} disabled={isDisabled && !windowClosed}>
                        <Layers className="mr-2 h-4 w-4" /> {t("genericTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        setIgModal("privatereply");
                        setIgPrivateLoading(true);
                        setIgPrivateMedia([]); setIgPrivateComments([]); setIgPrivateSelectedMedia("");
                        try {
                          const res = await listMedia(whatsappId);
                          setIgPrivateMedia((res.data as any)?.data || res.data || []);
                        } catch {} finally { setIgPrivateLoading(false); }
                      }} disabled={isDisabled && !windowClosed}>
                        <Reply className="mr-2 h-4 w-4" /> {t("privateReply.title")}
                      </DropdownMenuItem>
                      {/* Ice Breakers e Persistent Menu ocultos no frontend — apenas backend exposto */}
                    </>
                  )}

                  {/* ── Messenger specific options ── */}
                  {isMessenger && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-blue-700 dark:text-blue-300">Messenger</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setMsgrModal("quickreply")} disabled={isDisabled && !windowClosed}>
                        <Zap className="mr-2 h-4 w-4" /> {t("messengerQuickReply.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("approvedtemplate")} disabled={isDisabled && !windowClosed}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> {t("approvedTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("generictemplate")} disabled={isDisabled && !windowClosed}>
                        <Layers className="mr-2 h-4 w-4" /> {t("genericTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("buttontemplate")} disabled={isDisabled && !windowClosed}>
                        <MousePointerClick className="mr-2 h-4 w-4" /> {t("buttonTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("mediatemplate")} disabled={isDisabled && !windowClosed}>
                        <ImageIcon className="mr-2 h-4 w-4" /> {t("mediaTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("receipttemplate")} disabled={isDisabled && !windowClosed}>
                        <Receipt className="mr-2 h-4 w-4" /> {t("receiptTemplate.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        setMsgrModal("privatereply");
                        setMsgrPrivateLoading(true);
                        setMsgrPrivatePosts([]); setMsgrPrivateComments([]); setMsgrPrivateSelectedPost("");
                        try {
                          const res = await listPagePosts(whatsappId);
                          setMsgrPrivatePosts((res.data as any)?.data || []);
                        } catch {} finally { setMsgrPrivateLoading(false); }
                      }} disabled={isDisabled && !windowClosed}>
                        <Reply className="mr-2 h-4 w-4" /> {t("privateReply.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("messagetag")} disabled={isDisabled}>
                        <Tag className="mr-2 h-4 w-4" /> {t("messageTag.title")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgrModal("feedback")} disabled={isDisabled && !windowClosed}>
                        <BarChart2 className="mr-2 h-4 w-4" /> {t("customerFeedback.title")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Signature toggle */}
              {userName != null && userName !== "" && onToggleSignature && (
                <div className="flex items-center gap-1.5 shrink-0 ml-1 pl-1 border-l border-border">
                  <Switch id="sig-toggle-inline" checked={signatureEnabled} onCheckedChange={onToggleSignature} className="scale-90" />
                  <Label htmlFor="sig-toggle-inline" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                    {signatureEnabled ? t("signatureEnabled") : t("signatureDisabled")}
                  </Label>
                </div>
              )}
            </div>
          </TooltipProvider>

          {/* Send / Record */}
          <div className={cn("flex items-center gap-0.5 shrink-0", !detailOpen && "sm:order-3")}>
            {(text.trim() || files.length > 0 || pendingStructured || pendingQrMedias.length > 0) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" className="h-9 w-9" onClick={handleSend} disabled={isDisabled}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("sendMessage")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!recording && supportsAudio && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={startRecording} disabled={isDisabled || hybridTextOnly}>
                      <Mic className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("recordAudio")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          </div>{/* end buttons-row */}
        </div>
      </div>

      {/* ── WABA Modals (single Dialog, content switches by type) ── */}
      <Dialog open={!!wabaModal} onOpenChange={(open) => { if (!open) closeWaba(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">

          {/* ── BUTTONS ── */}
          {wabaModal === "buttons" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> {t("sendWabaButtonsTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={wBtn.msg} onChange={(e) => setWBtn((p) => ({ ...p, msg: e.target.value }))} placeholder={t("mainMessagePlaceholder")} className="mt-1 text-sm" rows={3} maxLength={WABA_LIMITS.body} />
                  <p className="text-[10px] text-muted-foreground text-right">{wBtn.msg.length}/{WABA_LIMITS.body}</p>
                </div>
                {(["b1", "b2", "b3"] as const).map((k, i) => (
                  <div key={k}>
                    <Label className="text-xs">{t("buttonN", { n: i + 1 })} {i === 0 ? "*" : `(${t("optional")})`}</Label>
                    <Input value={wBtn[k]} onChange={(e) => setWBtn((p) => ({ ...p, [k]: e.target.value }))} placeholder={t("buttonNPlaceholder", { n: i + 1 })} className="mt-1 h-8 text-sm" maxLength={20} />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaButtons}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── LIST ── */}
          {wabaModal === "list" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><LayoutList className="h-4 w-4" /> {t("sendWabaListTitle")}</DialogTitle></DialogHeader>
              <div className="overflow-y-auto max-h-[60vh] space-y-3 py-2 pr-1">
                <div>
                  <Label className="text-xs">{t("headerRequired")}</Label>
                  <Input value={wList.header} onChange={(e) => setWList((p) => ({ ...p, header: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.headerText} />
                </div>
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={wList.body} onChange={(e) => setWList((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={2} maxLength={WABA_LIMITS.listBody} />
                  <p className="text-[10px] text-muted-foreground text-right">{wList.body.length}/{WABA_LIMITS.listBody}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("buttonActionText")}</Label>
                  <Input value={wList.btnText} onChange={(e) => setWList((p) => ({ ...p, btnText: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.listButton} />
                </div>
                <div>
                  <Label className="text-xs">{t("footer")}</Label>
                  <Input value={wList.footer} onChange={(e) => setWList((p) => ({ ...p, footer: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.footer} />
                  <p className="text-[10px] text-muted-foreground text-right">{wList.footer.length}/{WABA_LIMITS.footer}</p>
                </div>
                {wList.sections.map((sec, si) => (
                  <div key={si} className="border rounded-md p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={sec.title}
                        onChange={(e) => setWList((p) => { const sections = p.sections.map((s, idx) => idx === si ? { ...s, title: e.target.value } : s); return { ...p, sections }; })}
                        placeholder={t("sectionTitleN", { n: si + 1 })}
                        className="h-7 text-xs flex-1"
                        maxLength={WABA_LIMITS.sectionTitle}
                      />
                      {wList.sections.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => setWList((p) => ({ ...p, sections: p.sections.filter((_, idx) => idx !== si) }))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("listItemsUpTo10")}</Label>
                      {sec.rows.map((row, ri) => (
                        <div key={ri} className="flex items-center gap-2">
                          <div className="grid grid-cols-2 gap-2 flex-1">
                            <Input
                              value={row.title}
                              onChange={(e) => setWList((p) => { const sections = p.sections.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, ridx) => ridx === ri ? { ...r, title: e.target.value } : r) } : s); return { ...p, sections }; })}
                              placeholder={t("titleN", { n: ri + 1 })}
                              className="h-7 text-xs"
                              maxLength={WABA_LIMITS.rowTitle}
                            />
                            <Input
                              value={row.desc}
                              onChange={(e) => setWList((p) => { const sections = p.sections.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, ridx) => ridx === ri ? { ...r, desc: e.target.value } : r) } : s); return { ...p, sections }; })}
                              placeholder={t("descN", { n: ri + 1 })}
                              className="h-7 text-xs"
                              maxLength={WABA_LIMITS.rowDescription}
                            />
                          </div>
                          {sec.rows.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => setWList((p) => { const sections = p.sections.map((s, idx) => idx === si ? { ...s, rows: s.rows.filter((_, ridx) => ridx !== ri) } : s); return { ...p, sections }; })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {/* Meta: máx. 10 linhas SOMADAS entre todas as seções (não 10 por seção) */}
                      {wList.sections.reduce((a, s) => a + s.rows.length, 0) < WABA_LIMITS.maxRowsTotal && (
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => setWList((p) => { const sections = p.sections.map((s, idx) => idx === si ? { ...s, rows: [...s.rows, { title: "", desc: "" }] } : s); return { ...p, sections }; })}>
                          <Plus className="h-3.5 w-3.5" /> {t("addListItem")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {wList.sections.length < WABA_LIMITS.maxSections && wList.sections.reduce((a, s) => a + s.rows.length, 0) < WABA_LIMITS.maxRowsTotal && (
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => setWList((p) => ({ ...p, sections: [...p.sections, { title: "", rows: [{ title: "", desc: "" }] }] }))}>
                    <Plus className="h-3.5 w-3.5" /> {t("addSection")}
                  </Button>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaList}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── TEMPLATES ── */}
          {wabaModal === "templates" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> {t("wabaTemplatesTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                {!selectedTemplate ? (
                  <>
                    <div className="flex gap-2">
                      <Input value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder={t("searchTemplatePlaceholder")} className="h-8 text-sm flex-1" />
                      <TemplateCategorySelect
                        value={templateCategoryFilter}
                        onChange={setTemplateCategoryFilter}
                        size="sm"
                        className="w-36 shrink-0"
                      />
                    </div>
                    {loadingTemplates ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t("loadingTemplates")}</p>
                    ) : filteredTemplates.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t("noTemplateFound")}</p>
                    ) : (
                      <div className="h-[300px] overflow-y-auto" style={{ overflowX: "hidden" }}>
                        <div className="space-y-1" style={{ width: "100%", maxWidth: "100%" }}>
                          {filteredTemplates.map((tp) => (
                            <button
                              key={`${tp.name}-${tp.language}`}
                              onClick={() => setSelectedTemplate(tp)}
                              className="w-full text-left p-2.5 rounded-lg border text-sm transition-colors hover:bg-accent border-transparent cursor-pointer overflow-hidden"
                              style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                            >
                              <p className="font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.name}</p>
                              <p className="text-xs text-muted-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {tp.language}
                                {tp.status && <span className="ml-2 text-emerald-600">{tp.status}</span>}
                                {tp.category && <span className="ml-2 uppercase">· {tp.category}</span>}
                              </p>
                              {tp.components?.find((c) => c.type === "BODY")?.text && (
                                <p className="text-xs text-muted-foreground mt-0.5" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {tp.components.find((c) => c.type === "BODY")?.text}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setSelectedTemplate(null)} className="text-xs text-primary hover:underline">← {t("back")}</button>
                      <span className="text-sm font-semibold">{selectedTemplate.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{selectedTemplate.language}</span>
                    </div>

                    {/* Preview do template estilo WhatsApp */}
                    <div className="bg-[#e5ddd5] rounded-lg p-3">
                      <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
                        {/* Header */}
                        {selectedTemplate.components?.find((c) => c.type === "HEADER") && (() => {
                          const hdr = selectedTemplate.components!.find((c) => c.type === "HEADER")!;
                          if (hdr.format === "TEXT" && hdr.text) {
                            let rendered = hdr.text;
                            templateVars
                              .filter((v) => v.key.startsWith("header_variable_") || v.key.startsWith("header_named_variable_"))
                              .forEach((v) => {
                                const n = v.key.startsWith("header_variable_")
                                  ? v.key.replace("header_variable_", "")
                                  : v.key.replace("header_named_variable_", "");
                                rendered = rendered.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                              });
                            return <p className="font-bold text-sm text-gray-900">{rendered}</p>;
                          }
                          if (hdr.format === "IMAGE") return <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">{t("templateImagePreview")}</div>;
                          if (hdr.format === "VIDEO") return <div className="h-24 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">{t("templateVideoPreview")}</div>;
                          if (hdr.format === "DOCUMENT") return <div className="h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">{t("templateDocumentPreview")}</div>;
                          return null;
                        })()}

                        {/* Body */}
                        {selectedTemplate.components?.find((c) => c.type === "BODY")?.text && (() => {
                          let text = selectedTemplate.components!.find((c) => c.type === "BODY")!.text!;
                          templateVars.filter((v) => v.key.startsWith("body_variable_") || v.key.startsWith("body_named_variable_")).forEach((v) => {
                            if (v.key.startsWith("body_variable_")) {
                              const n = v.key.replace("body_variable_", "");
                              text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                            } else {
                              const name = v.key.replace("body_named_variable_", "");
                              text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), v.value || `{{${name}}}`);
                            }
                          });
                          return <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>;
                        })()}

                        {/* Footer */}
                        {selectedTemplate.components?.find((c) => c.type === "FOOTER")?.text && (
                          <p className="text-xs text-gray-400">{selectedTemplate.components.find((c) => c.type === "FOOTER")!.text}</p>
                        )}

                        {/* Total da cobranca — so aparece no template ORDER_DETAILS */}
                        {isOrderDetailsSelected && (
                          <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-xs text-gray-700">
                            <span>{tOrder("totalLabel")}</span>
                            <span className="font-semibold">{formatCentsBRL(computeTotal(orderDetailsValue))}</span>
                          </div>
                        )}

                        {/* Buttons */}
                        {selectedTemplate.components?.find((c) => c.type === "BUTTONS")?.buttons && (
                          <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
                            {selectedTemplate.components!.find((c) => c.type === "BUTTONS")!.buttons!.map((btn, i) => {
                              const hasVar = templateVars.some((v) => v.key === `button_${i}`);
                              const varEntry = hasVar ? templateVars.find((v) => v.key === `button_${i}`) : null;
                              return (
                                <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">
                                  {btn.text}
                                  {hasVar && varEntry?.value && (
                                    <span className="ml-1 text-gray-400">({varEntry.value})</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Campos de variáveis */}
                    {templateVars.length > 0 ? (
                      <div className="space-y-2 mt-1">
                        <p className="text-xs font-medium text-muted-foreground">{t("fillVariables")}</p>
                        {templateVars.map((v) => (
                          <div key={v.key} className="flex items-center gap-2">
                            <Label className="text-xs w-28 shrink-0">{v.label}</Label>
                            <Input
                              value={v.value}
                              onChange={(e) => setTemplateVars((prev) => prev.map((tv) => tv.key === v.key ? { ...tv, value: e.target.value, ...(tv.key === "header_link" ? { filename: undefined } : {}) } : tv))}
                              className="h-7 text-sm flex-1"
                              placeholder={v.label}
                            />
                            {v.key === "header_link" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                title={t("pickFromGallery")}
                                onClick={() => setTplGalleryOpen(true)}
                              >
                                <GalleryHorizontalEnd className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : isOrderDetailsSelected ? null : (
                      <p className="text-xs text-muted-foreground text-center">{t("noVariablesReadyToSend")}</p>
                    )}

                    {/* Ficha de cobranca — branch novo, so para template ORDER_DETAILS */}
                    {isOrderDetailsSelected && (
                      <div className="mt-1 space-y-2 rounded-lg border p-2.5">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-3.5 w-3.5 text-primary shrink-0" />
                          <p className="text-xs font-medium">{tOrder("sectionTitle")}</p>
                        </div>
                        <p className="text-[11px] leading-snug text-muted-foreground">{tOrder("sectionHint")}</p>
                        {/* key por template: os campos de valor sao nao-controlados
                            (defaultValue), entao trocar de template precisa remontar
                            o formulario para nao exibir o valor do template anterior. */}
                        <OrderDetailsFields
                          key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                          value={orderDetailsValue}
                          onChange={setOrderDetailsValue}
                          compact
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button
                  onClick={handleSendWabaTemplate}
                  disabled={!selectedTemplate || (isOrderDetailsSelected && !canSendCharge)}
                >
                  {t("sendTemplate")}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── CTA URL ── */}
          {wabaModal === "ctaurl" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> {t("sendWabaCtaTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <HeaderSection
                  headerType={wCta.headerType} setHeaderType={(v) => setWCta((p) => ({ ...p, headerType: v }))}
                  headerText={wCta.headerText} setHeaderText={(v) => setWCta((p) => ({ ...p, headerText: v }))}
                  headerLink={wCta.headerLink} setHeaderLink={(v) => setWCta((p) => ({ ...p, headerLink: v }))}
                  t={t}
                />
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={wCta.body} onChange={(e) => setWCta((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={3} maxLength={WABA_LIMITS.body} />
                  <p className="text-[10px] text-muted-foreground text-right">{wCta.body.length}/{WABA_LIMITS.body}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("buttonTextRequired")}</Label>
                  <Input value={wCta.btnText} onChange={(e) => setWCta((p) => ({ ...p, btnText: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.buttonTitle} />
                </div>
                <div>
                  <Label className="text-xs">{t("buttonUrlRequired")}</Label>
                  <Input value={wCta.btnUrl} onChange={(e) => setWCta((p) => ({ ...p, btnUrl: e.target.value }))} placeholder="https://" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("footer")}</Label>
                  <Input value={wCta.footer} onChange={(e) => setWCta((p) => ({ ...p, footer: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.footer} />
                  <p className="text-[10px] text-muted-foreground text-right">{wCta.footer.length}/{WABA_LIMITS.footer}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaCTAURL}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── REPLY BUTTONS ── */}
          {wabaModal === "replybuttons" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Reply className="h-4 w-4" /> {t("wabaReplyButtonsTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <HeaderSection
                  headerType={wRb.headerType} setHeaderType={(v) => setWRb((p) => ({ ...p, headerType: v }))}
                  headerText={wRb.headerText} setHeaderText={(v) => setWRb((p) => ({ ...p, headerText: v }))}
                  headerLink={wRb.headerLink} setHeaderLink={(v) => setWRb((p) => ({ ...p, headerLink: v }))}
                  t={t}
                />
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={wRb.body} onChange={(e) => setWRb((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={3} maxLength={WABA_LIMITS.body} />
                  <p className="text-[10px] text-muted-foreground text-right">{wRb.body.length}/{WABA_LIMITS.body}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("footer")}</Label>
                  <Input value={wRb.footer} onChange={(e) => setWRb((p) => ({ ...p, footer: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.footer} />
                  <p className="text-[10px] text-muted-foreground text-right">{wRb.footer.length}/{WABA_LIMITS.footer}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("buttonsMax3")}</Label>
                  {wRb.buttons.map((btn, i) => (
                    <Input key={i} value={btn.title}
                      onChange={(e) => setWRb((p) => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...p, buttons }; })}
                      placeholder={`${t("buttonN", { n: i + 1 })}${i === 0 ? " *" : ` (${t("optional")})`}`}
                      className="h-8 text-sm" maxLength={WABA_LIMITS.buttonTitle} />
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaReplyButtons}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── ADDRESS ── */}
          {wabaModal === "address" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Contact2 className="h-4 w-4" /> {t("sendWabaAddressTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("street1Required")}</Label>
                  <Input value={wAddr.street1} onChange={(e) => setWAddr((p) => ({ ...p, street1: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("street2")}</Label>
                  <Input value={wAddr.street2} onChange={(e) => setWAddr((p) => ({ ...p, street2: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t("cityRequired")}</Label>
                    <Input value={wAddr.city} onChange={(e) => setWAddr((p) => ({ ...p, city: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("state")}</Label>
                    <Input value={wAddr.state} onChange={(e) => setWAddr((p) => ({ ...p, state: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t("zipCode")}</Label>
                    <Input value={wAddr.zip} onChange={(e) => setWAddr((p) => ({ ...p, zip: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("countryRequired")}</Label>
                    <Input value={wAddr.country} onChange={(e) => setWAddr((p) => ({ ...p, country: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("type")}</Label>
                  <Select value={wAddr.type} onValueChange={(v) => setWAddr((p) => ({ ...p, type: v as "HOME" | "WORK" }))}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOME">{t("residential")}</SelectItem>
                      <SelectItem value="WORK">{t("commercial")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaAddress}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── LOCATION REQUEST ── */}
          {wabaModal === "locationreq" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Navigation className="h-4 w-4" /> {t("requestLocationTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("locationRequestMsgRequired")}</Label>
                  <Textarea value={wLocReq.msg} onChange={(e) => setWLocReq({ msg: e.target.value })} placeholder={t("locationRequestMsgPlaceholder")} className="mt-1 text-sm" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaLocationReq}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── LOCATION ── */}
          {wabaModal === "location" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {t("sendWabaLocationTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t("latitudeRequired")}</Label>
                    <Input value={wLoc.lat} onChange={(e) => setWLoc((p) => ({ ...p, lat: e.target.value }))} placeholder="-23.5505" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("longitudeRequired")}</Label>
                    <Input value={wLoc.lng} onChange={(e) => setWLoc((p) => ({ ...p, lng: e.target.value }))} placeholder="-46.6333" className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("locationName")}</Label>
                  <Input value={wLoc.name} onChange={(e) => setWLoc((p) => ({ ...p, name: e.target.value }))} placeholder={t("locationNamePlaceholder")} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("address")}</Label>
                  <Input value={wLoc.addr} onChange={(e) => setWLoc((p) => ({ ...p, addr: e.target.value }))} placeholder={t("fullAddressOptional")} className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaLocation}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── FLOW ── */}
          {wabaModal === "flow" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Workflow className="h-4 w-4" /> {t("sendWabaFlowTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <HeaderSection
                  headerType={wFlow.headerType} setHeaderType={(v) => setWFlow((p) => ({ ...p, headerType: v }))}
                  headerText={wFlow.headerText} setHeaderText={(v) => setWFlow((p) => ({ ...p, headerText: v }))}
                  headerLink={wFlow.headerLink} setHeaderLink={(v) => setWFlow((p) => ({ ...p, headerLink: v }))}
                  t={t}
                />
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={wFlow.body} onChange={(e) => setWFlow((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={2} maxLength={WABA_LIMITS.body} />
                  <p className="text-[10px] text-muted-foreground text-right">{wFlow.body.length}/{WABA_LIMITS.body}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("footer")}</Label>
                  <Input value={wFlow.footer} onChange={(e) => setWFlow((p) => ({ ...p, footer: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.footer} />
                  <p className="text-[10px] text-muted-foreground text-right">{wFlow.footer.length}/{WABA_LIMITS.footer}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Flow ID</Label>
                    <Input value={wFlow.flowId} onChange={(e) => setWFlow((p) => ({ ...p, flowId: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Flow Name</Label>
                    <Input value={wFlow.flowName} onChange={(e) => setWFlow((p) => ({ ...p, flowName: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("ctaButtonTextRequired")}</Label>
                  <Input value={wFlow.flowCta} onChange={(e) => setWFlow((p) => ({ ...p, flowCta: e.target.value }))} placeholder={t("ctaButtonPlaceholder")} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.buttonTitle} />
                </div>
                <div>
                  <Label className="text-xs">Flow Token</Label>
                  <Input value={wFlow.flowToken} onChange={(e) => setWFlow((p) => ({ ...p, flowToken: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("action")}</Label>
                  <Select value={wFlow.action} onValueChange={(v) => setWFlow((p) => ({ ...p, action: v as "navigate" | "data_exchange" }))}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="navigate">navigate</SelectItem>
                      <SelectItem value="data_exchange">data_exchange</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("actionPayloadJson")}</Label>
                  <Textarea value={wFlow.payload} onChange={(e) => setWFlow((p) => ({ ...p, payload: e.target.value }))} placeholder={'{"screen": "tela1", "data": {}}'} className="mt-1 text-xs font-mono" rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaFlow}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── SINGLE PRODUCT ── */}
          {wabaModal === "singleproduct" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> {t("wabaProduct.singleProduct")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("wabaProduct.catalogId")} *</Label>
                  <Input value={wSingleProduct.catalogId} onChange={(e) => setWSingleProduct((p) => ({ ...p, catalogId: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.productId")} *</Label>
                  <Input value={wSingleProduct.productId} onChange={(e) => setWSingleProduct((p) => ({ ...p, productId: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("messageRequired")} ({t("optional")})</Label>
                  <Textarea value={wSingleProduct.body} onChange={(e) => setWSingleProduct((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={2} maxLength={WABA_LIMITS.body} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaSingleProduct}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── MULTI PRODUCT ── */}
          {wabaModal === "multiproduct" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> {t("wabaProduct.multiProduct")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("wabaProduct.catalogId")} *</Label>
                  <Input value={wMultiProduct.catalogId} onChange={(e) => setWMultiProduct((p) => ({ ...p, catalogId: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.header")} *</Label>
                  <Input value={wMultiProduct.header} onChange={(e) => setWMultiProduct((p) => ({ ...p, header: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.headerText} />
                </div>
                <div>
                  <Label className="text-xs">{t("messageRequired")} *</Label>
                  <Textarea value={wMultiProduct.body} onChange={(e) => setWMultiProduct((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={2} maxLength={WABA_LIMITS.body} />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.sectionTitle")} ({t("optional")})</Label>
                  <Input value={wMultiProduct.sectionTitle} onChange={(e) => setWMultiProduct((p) => ({ ...p, sectionTitle: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.sectionTitle} />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.productId")}s * (separados por vírgula)</Label>
                  <Input value={wMultiProduct.productIds} onChange={(e) => setWMultiProduct((p) => ({ ...p, productIds: e.target.value }))} placeholder="id1,id2,id3" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.footer")} ({t("optional")})</Label>
                  <Input value={wMultiProduct.footer} onChange={(e) => setWMultiProduct((p) => ({ ...p, footer: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={WABA_LIMITS.footer} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaMultiProduct}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── CATALOG MESSAGE ── */}
          {wabaModal === "catalog" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> {t("wabaProduct.catalog")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("wabaProduct.catalogId")} *</Label>
                  <Input value={wCatalog.catalogId} onChange={(e) => setWCatalog((p) => ({ ...p, catalogId: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaProduct.thumbnailProduct")} ({t("optional")})</Label>
                  <Input value={wCatalog.thumbnailProductId} onChange={(e) => setWCatalog((p) => ({ ...p, thumbnailProductId: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("messageRequired")} *</Label>
                  <Textarea value={wCatalog.body} onChange={(e) => setWCatalog((p) => ({ ...p, body: e.target.value }))} className="mt-1 text-sm" rows={2} maxLength={WABA_LIMITS.body} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaCatalog}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── TEMPLATE AUTH ── */}
          {wabaModal === "templateauth" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> {t("wabaTemplateAuth.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("wabaTemplateAuth.templateName")} *</Label>
                  <Input value={wTemplateAuth.templateName} onChange={(e) => setWTemplateAuth((p) => ({ ...p, templateName: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaTemplateAuth.language")}</Label>
                  <Input value={wTemplateAuth.language} onChange={(e) => setWTemplateAuth((p) => ({ ...p, language: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="pt_BR" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaTemplateAuth.otpCode")} *</Label>
                  <Input value={wTemplateAuth.otpCode} onChange={(e) => setWTemplateAuth((p) => ({ ...p, otpCode: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="123456" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaTemplateAuth}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── TEMPLATE CAROUSEL ── */}
          {wabaModal === "carousel" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><GalleryHorizontalEnd className="h-4 w-4" /> {t("wabaTemplateCarousel.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
                <div>
                  <Label className="text-xs">{t("wabaTemplateAuth.templateName")} *</Label>
                  <Input value={wCarousel.templateName} onChange={(e) => setWCarousel((p) => ({ ...p, templateName: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaTemplateAuth.language")}</Label>
                  <Input value={wCarousel.language} onChange={(e) => setWCarousel((p) => ({ ...p, language: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="pt_BR" />
                </div>
                <div>
                  <Label className="text-xs">{t("wabaTemplateCarousel.cards")} (JSON) *</Label>
                  <Textarea value={wCarousel.cardsJson} onChange={(e) => setWCarousel((p) => ({ ...p, cardsJson: e.target.value }))} className="mt-1 text-xs font-mono" rows={5} placeholder={'[{"headerMediaId":"...","buttons":[{"type":"quick_reply","text":"Sim"}]}]'} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeWaba}>{t("cancel")}</Button>
                <Button onClick={handleSendWabaTemplateCarousel}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>

      {/* ── Instagram Interactive Modals ── */}
      <Dialog open={!!igModal} onOpenChange={(open) => { if (!open) closeIg(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">

          {/* ── INSTAGRAM QUICK REPLY ── */}
          {igModal === "quickreply" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> {t("instagramQuickReply.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={igQr.message} onChange={(e) => setIgQr((p) => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("instagramQuickReply.addOption")} (máx. 13)</Label>
                  {igQr.replies.map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      {(r as any).content_type === "user_phone_number" ? (
                        <div className="flex-1 h-8 flex items-center px-2 bg-info/10 rounded text-xs text-info border border-info/30">
                          <Phone className="h-3 w-3 mr-1" /> {t("instagramQuickReply.phoneOption")}
                        </div>
                      ) : (
                        <Input value={r.title} onChange={(e) => setIgQr((p) => { const replies = [...p.replies]; replies[i] = { ...replies[i], title: e.target.value }; return { ...p, replies }; })} placeholder={t("instagramQuickReply.optionPlaceholder")} className="h-8 text-sm flex-1" maxLength={20} />
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setIgQr((p) => ({ ...p, replies: p.replies.filter((_, j) => j !== i) }))} disabled={igQr.replies.length === 1}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  {igQr.replies.length < 13 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setIgQr((p) => ({ ...p, replies: [...p.replies, { title: "", payload: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> {t("instagramQuickReply.addOption")}
                    </Button>
                  )}
                  {igQr.replies.length < 13 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8 text-info border-info/40" onClick={() => setIgQr((p) => ({ ...p, replies: [...p.replies, { content_type: "user_phone_number", title: "", payload: "" } as any] }))}>
                      <Phone className="h-3 w-3 mr-1" /> {t("instagramQuickReply.addPhoneOption")}
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSendIgQuickReply} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── INSTAGRAM GENERIC TEMPLATE ── */}
          {igModal === "generictemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> {t("genericTemplate.title")}</DialogTitle></DialogHeader>
              <div className="max-h-[55vh] overflow-y-auto py-2 pr-1">
                <GenericTemplateBuilder channel="instagram" value={igGeneric.elements} onChange={(els) => setIgGeneric({ elements: els })} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSendIgGenericTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── INSTAGRAM TEXT (HUMAN_AGENT, fora da janela de 24h) ── */}
          {igModal === "humanagenttext" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {t("igText.title")}</DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <p className="text-xs text-muted-foreground mb-2">{t("igText.help")}</p>
                <Textarea
                  value={igText}
                  onChange={(e) => setIgText(e.target.value)}
                  rows={4}
                  className="text-sm"
                  placeholder={t("igText.placeholder")}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSendIgText} disabled={modalSending || !igText.trim()}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── INSTAGRAM PRIVATE REPLY ── */}
          {igModal === "privatereply" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Reply className="h-4 w-4" /> {t("privateReply.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                {igPrivateLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <>
                    {/* Seleção de post */}
                    {igPrivateMedia.length > 0 && !igPrivate.commentId && (
                      <div>
                        <Label className="text-xs">{t("privateReply.selectPost")}</Label>
                        <div className="mt-1 space-y-1 max-h-36 overflow-y-auto border rounded p-1">
                          {igPrivateMedia.slice(0, 10).map(m => (
                            <button key={m.id} type="button"
                              className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 flex items-center gap-2 ${igPrivateSelectedMedia === m.id ? 'bg-muted' : ''}`}
                              onClick={async () => {
                                setIgPrivateSelectedMedia(m.id);
                                setIgPrivateLoading(true);
                                try {
                                  const res = await getMediaComments(m.id, whatsappId);
                                  setIgPrivateComments((res.data as any)?.data || []);
                                } catch {} finally { setIgPrivateLoading(false); }
                              }}>
                              {m.media_url && <img src={m.media_url} alt="" className="w-7 h-7 object-cover rounded flex-shrink-0" />}
                              <span className="truncate">{m.caption?.substring(0, 60) || m.media_type} — {new Date(m.timestamp).toLocaleDateString('pt-BR')}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lista de comentários */}
                    {igPrivateComments.length > 0 && !igPrivate.commentId && (
                      <div>
                        <Label className="text-xs">{t("privateReply.selectComment")}</Label>
                        <div className="mt-1 space-y-1 max-h-36 overflow-y-auto border rounded p-1">
                          {igPrivateComments.map(c => (
                            <button key={c.id} type="button"
                              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 flex flex-col"
                              onClick={() => setIgPrivate(p => ({ ...p, commentId: c.id }))}>
                              <span className="font-medium">@{c.username}</span>
                              <span className="text-muted-foreground truncate">{c.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comentário selecionado ou campo manual */}
                    {igPrivate.commentId ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                        <span className="flex-1 truncate">{t("privateReply.commentId")}: {igPrivate.commentId}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIgPrivate(p => ({ ...p, commentId: "" }))}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <div>
                        <Label className="text-xs">{t("privateReply.commentId")} ({t("privateReply.orPaste")})</Label>
                        <Input value={igPrivate.commentId} onChange={(e) => setIgPrivate((p) => ({ ...p, commentId: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="17858893269000001" />
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">{t("messageRequired")}</Label>
                      <Textarea value={igPrivate.message} onChange={(e) => setIgPrivate((p) => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSendIgPrivateReply} disabled={modalSending || !igPrivate.commentId || !igPrivate.message.trim()}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {igModal === "buttontemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> {t("igButtonTemplate.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={igBtn.message} onChange={(e) => setIgBtn(p => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} maxLength={640} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("igButtonTemplate.buttons")} (máx. 3)</Label>
                  {igBtn.buttons.map((b, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input value={b.title} onChange={(e) => setIgBtn(p => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...p, buttons }; })} placeholder={t("igButtonTemplate.buttonTitle")} className="h-8 text-sm flex-1" maxLength={20} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setIgBtn(p => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))} disabled={igBtn.buttons.length === 1}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  {igBtn.buttons.length < 3 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setIgBtn(p => ({ ...p, buttons: [...p.buttons, { type: "postback", title: "", payload: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> {t("igButtonTemplate.addButton")}
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSendIgButtonTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {igModal === "icebreakers" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> {t("igIceBreakers.title")}</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">{t("igIceBreakers.description")}</p>
              <div className="space-y-2 py-2 overflow-y-auto flex-1">
                {igIceBreakersLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : igIceBreakers.map((ib, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={ib.question} onChange={(e) => setIgIceBreakers(prev => { const next = [...prev]; next[i] = { ...next[i], question: e.target.value }; return next; })} placeholder={t("igIceBreakers.question")} className="h-8 text-sm flex-1" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setIgIceBreakers(prev => prev.filter((_, j) => j !== i))} disabled={igIceBreakers.length === 1}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
                {igIceBreakers.length < 4 && !igIceBreakersLoading && (
                  <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setIgIceBreakers(p => [...p, { question: "", payload: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> {t("igIceBreakers.add")}
                  </Button>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="destructive" size="sm" onClick={handleDeleteIgIceBreakers} disabled={modalSending}>{t("igIceBreakers.delete")}</Button>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSaveIgIceBreakers} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("save")}</Button>
              </DialogFooter>
            </>
          )}

          {igModal === "persistentmenu" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><List className="h-4 w-4" /> {t("igPersistentMenu.title")}</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">{t("igPersistentMenu.description")}</p>
              <div className="space-y-2 py-2 overflow-y-auto flex-1">
                {igMenuLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : igMenu.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={item.title} onChange={(e) => setIgMenu(prev => { const next = [...prev]; next[i] = { ...next[i], title: e.target.value }; return next; })} placeholder={t("igPersistentMenu.itemTitle")} className="h-8 text-sm flex-1" maxLength={30} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setIgMenu(prev => prev.filter((_, j) => j !== i))} disabled={igMenu.length === 1}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
                {igMenu.length < 3 && !igMenuLoading && (
                  <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setIgMenu(p => [...p, { type: "postback", title: "", payload: "", url: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> {t("igPersistentMenu.add")}
                  </Button>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="destructive" size="sm" onClick={handleDeleteIgPersistentMenu} disabled={modalSending}>{t("igPersistentMenu.delete")}</Button>
                <Button variant="outline" onClick={closeIg}>{t("cancel")}</Button>
                <Button onClick={handleSaveIgPersistentMenu} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("save")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Messenger Interactive Modals ── */}
      <Dialog open={!!msgrModal} onOpenChange={(open) => { if (!open) closeMsgr(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">

          {/* ── MESSENGER QUICK REPLY ── */}
          {msgrModal === "quickreply" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> {t("messengerQuickReply.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={msgrQr.message} onChange={(e) => setMsgrQr((p) => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("messengerQuickReply.addOption")} (máx. 13)</Label>
                  {msgrQr.replies.map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input value={r.title} onChange={(e) => setMsgrQr((p) => { const replies = [...p.replies]; replies[i] = { ...replies[i], title: e.target.value }; return { ...p, replies }; })} placeholder={t("messengerQuickReply.optionPlaceholder")} className="h-8 text-sm flex-1" maxLength={20} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMsgrQr((p) => ({ ...p, replies: p.replies.filter((_, j) => j !== i) }))} disabled={msgrQr.replies.length === 1}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  {msgrQr.replies.length < 13 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setMsgrQr((p) => ({ ...p, replies: [...p.replies, { title: "", payload: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> {t("messengerQuickReply.addOption")}
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrQuickReply} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── MESSENGER APPROVED TEMPLATE (utility/marketing by name) ── */}
          {msgrModal === "approvedtemplate" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {t("approvedTemplate.title")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("approvedTemplate.selectLabel")} *</Label>
                  {msgrApproved.loading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("approvedTemplate.loading")}
                    </div>
                  ) : msgrApproved.templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{t("approvedTemplate.empty")}</p>
                  ) : (
                    <Select
                      value={msgrApproved.selectedName ? `${msgrApproved.selectedName}::${msgrApproved.selectedLanguage}` : ""}
                      onValueChange={(v) => {
                        const [name, lang] = v.split("::");
                        setMsgrApproved((p) => ({ ...p, selectedName: name, selectedLanguage: lang, variables: [] }));
                      }}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder={t("approvedTemplate.selectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {msgrApproved.templates.map((tpl) => (
                          <SelectItem key={`${tpl.id}`} value={`${tpl.name}::${tpl.language}`}>
                            <span className="font-mono text-xs">{tpl.name}</span>
                            <span className="ml-2 text-[10px] text-muted-foreground">{tpl.language} • {tpl.category}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {msgrApprovedSelected && msgrApprovedBodyText && (
                  <>
                    <div className="bg-muted/40 rounded p-2 text-xs whitespace-pre-wrap break-words">
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("approvedTemplate.bodyOriginal")}</span>
                      {msgrApprovedBodyText}
                    </div>

                    {msgrApprovedVarCount > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs">{t("approvedTemplate.variablesLabel")}</Label>
                        {Array.from({ length: msgrApprovedVarCount }).map((_, i) => (
                          <Input
                            key={i}
                            value={msgrApproved.variables[i] || ""}
                            onChange={(e) => setMsgrApproved((p) => {
                              const vars = [...p.variables];
                              vars[i] = e.target.value;
                              return { ...p, variables: vars };
                            })}
                            placeholder={`{{${i + 1}}}`}
                            className="h-8 text-sm"
                          />
                        ))}
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded p-2 text-xs whitespace-pre-wrap break-words">
                      <span className="block text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1">{t("approvedTemplate.preview")}</span>
                      {msgrApprovedPreview}
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrTemplateByName} disabled={modalSending || !msgrApprovedSelected}>
                  {modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── MESSENGER GENERIC TEMPLATE ── */}
          {msgrModal === "generictemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> {t("genericTemplate.title")}</DialogTitle></DialogHeader>
              <div className="max-h-[55vh] overflow-y-auto py-2 pr-1">
                <GenericTemplateBuilder channel="messenger" value={msgrGeneric.elements} onChange={(els) => setMsgrGeneric({ elements: els })} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrGenericTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── MESSENGER BUTTON TEMPLATE ── */}
          {msgrModal === "buttontemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> {t("buttonTemplate.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("buttonTemplate.messageText")} *</Label>
                  <Textarea value={msgrBtn.message} onChange={(e) => setMsgrBtn((p) => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} maxLength={640} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("buttonTemplate.buttons")} (máx. 3)</Label>
                  {msgrBtn.buttons.map((btn, i) => (
                    <div key={i} className="border rounded p-2 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Select value={btn.type} onValueChange={(v) => setMsgrBtn((p) => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], type: v }; return { ...p, buttons }; })}>
                          <SelectTrigger className="h-8 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="postback">{t("buttonTemplate.postback")}</SelectItem>
                            <SelectItem value="web_url">{t("buttonTemplate.webUrl")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 ml-auto" onClick={() => setMsgrBtn((p) => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))} disabled={msgrBtn.buttons.length === 1}><X className="h-3 w-3" /></Button>
                      </div>
                      <Input value={btn.title} onChange={(e) => setMsgrBtn((p) => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...p, buttons }; })} placeholder={t("buttonTemplate.buttons")} className="h-8 text-sm" maxLength={20} />
                      <Input value={btn.payload} onChange={(e) => setMsgrBtn((p) => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], payload: e.target.value }; return { ...p, buttons }; })} placeholder={btn.type === "web_url" ? "https://..." : t("buttonTemplate.postback")} className="h-8 text-sm" />
                    </div>
                  ))}
                  {msgrBtn.buttons.length < 3 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setMsgrBtn((p) => ({ ...p, buttons: [...p.buttons, { type: "postback", title: "", payload: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> {t("genericTemplate.addButton")}
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrButtonTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── MESSENGER PRIVATE REPLY ── */}
          {msgrModal === "privatereply" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Reply className="h-4 w-4" /> {t("privateReply.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs">{t("privateReply.commentId")} (ou Post ID)</Label>
                  <Input value={msgrPrivate.commentId} onChange={(e) => setMsgrPrivate((p) => ({ ...p, commentId: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="Comment ID" />
                </div>
                <div>
                  <Label className="text-xs">Post ID ({t("optional")})</Label>
                  <Input value={msgrPrivate.postId} onChange={(e) => setMsgrPrivate((p) => ({ ...p, postId: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="Post ID" />
                </div>

                {/* Seleção de post do Facebook */}
                {msgrPrivateLoading ? (
                  <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : msgrPrivatePosts.length > 0 && !msgrPrivate.commentId && !msgrPrivate.postId && (
                  <div>
                    <Label className="text-xs">{t("privateReply.selectPost")}</Label>
                    <div className="mt-1 space-y-1 max-h-36 overflow-y-auto border rounded p-1">
                      {msgrPrivatePosts.slice(0, 10).map(p => (
                        <button key={p.id} type="button"
                          className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 flex items-center gap-2 ${msgrPrivateSelectedPost === p.id ? 'bg-muted' : ''}`}
                          onClick={async () => {
                            setMsgrPrivateSelectedPost(p.id);
                            setMsgrPrivateLoading(true);
                            try {
                              const res = await getPostComments(p.id, whatsappId);
                              setMsgrPrivateComments((res.data as any)?.data || []);
                            } catch {} finally { setMsgrPrivateLoading(false); }
                          }}>
                          {p.full_picture && <img src={p.full_picture} alt="" className="w-7 h-7 object-cover rounded flex-shrink-0" />}
                          <span className="truncate">{p.message?.substring(0, 60) || p.story || '(sem texto)'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista de comentários */}
                {msgrPrivateComments.length > 0 && !msgrPrivate.commentId && (
                  <div>
                    <Label className="text-xs">{t("privateReply.selectComment")}</Label>
                    <div className="mt-1 space-y-1 max-h-36 overflow-y-auto border rounded p-1">
                      {msgrPrivateComments.map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 flex flex-col"
                          onClick={() => setMsgrPrivate(p => ({ ...p, commentId: c.id, postId: "" }))}>
                          <span className="font-medium">{c.from?.name || 'anonimo'}</span>
                          <span className="text-muted-foreground truncate">{c.message}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Indicador do selecionado */}
                {(msgrPrivate.commentId || msgrPrivate.postId) && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                    <span className="flex-1 truncate">{msgrPrivate.commentId ? `${t("privateReply.commentId")}: ${msgrPrivate.commentId}` : `Post: ${msgrPrivate.postId}`}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMsgrPrivate(p => ({ ...p, commentId: "", postId: "" }))}><X className="h-3 w-3" /></Button>
                  </div>
                )}

                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={msgrPrivate.message} onChange={(e) => setMsgrPrivate((p) => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrPrivateReply} disabled={modalSending || !msgrPrivate.message.trim() || (!msgrPrivate.commentId && !msgrPrivate.postId)}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {msgrModal === "mediatemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> {t("mediaTemplate.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div>
                  <Label className="text-xs">{t("mediaTemplate.mediaType")}</Label>
                  <select value={msgrMedia.mediaType}
                    onChange={(e) => setMsgrMedia(p => ({ ...p, mediaType: e.target.value as 'image' | 'video' }))}
                    className="mt-1 w-full h-8 px-2 text-sm border rounded bg-background">
                    <option value="image">{t("mediaTemplate.image")}</option>
                    <option value="video">{t("mediaTemplate.video")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("mediaTemplate.mediaUrl")} *</Label>
                  <div className="flex gap-2">
                    <Input value={msgrMedia.mediaUrl} onChange={(e) => setMsgrMedia(p => ({ ...p, mediaUrl: e.target.value }))} className="mt-1 h-8 text-sm flex-1" placeholder="https://..." />
                    <Button type="button" variant="outline" size="sm" className="mt-1 h-8 shrink-0" onClick={() => setMsgrMediaGalleryOpen(true)} title={t("pickFromGallery")}>
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("igButtonTemplate.buttons")} (máx. 3)</Label>
                  {msgrMedia.buttons.map((b, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input value={b.title} onChange={(e) => setMsgrMedia(p => { const buttons = [...p.buttons]; buttons[i] = { ...buttons[i], title: e.target.value }; return { ...p, buttons }; })} placeholder={t("igButtonTemplate.buttonTitle")} className="h-8 text-sm flex-1" maxLength={20} />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMsgrMedia(p => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))} disabled={msgrMedia.buttons.length === 1}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  {msgrMedia.buttons.length < 3 && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setMsgrMedia(p => ({ ...p, buttons: [...p.buttons, { type: "postback", title: "", payload: "" }] }))}>
                      <Plus className="h-3 w-3 mr-1" /> {t("igButtonTemplate.addButton")}
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrMediaTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {msgrModal === "receipttemplate" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> {t("receiptTemplate.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{t("receiptTemplate.recipientName")} *</Label>
                    <Input value={msgrReceipt.recipientName} onChange={(e) => setMsgrReceipt(p => ({ ...p, recipientName: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("receiptTemplate.orderNumber")} *</Label>
                    <Input value={msgrReceipt.orderNumber} onChange={(e) => setMsgrReceipt(p => ({ ...p, orderNumber: e.target.value }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("receiptTemplate.currency")} *</Label>
                    <Input value={msgrReceipt.currency} onChange={(e) => setMsgrReceipt(p => ({ ...p, currency: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="BRL" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("receiptTemplate.paymentMethod")} *</Label>
                    <Input value={msgrReceipt.paymentMethod} onChange={(e) => setMsgrReceipt(p => ({ ...p, paymentMethod: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="PIX, Visa ****" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t("receiptTemplate.totalCost")} *</Label>
                  <Input type="number" value={msgrReceipt.totalCost} onChange={(e) => setMsgrReceipt(p => ({ ...p, totalCost: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("receiptTemplate.items")}</Label>
                  {msgrReceipt.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_50px_auto] gap-1 items-center">
                      <Input value={it.title} onChange={(e) => setMsgrReceipt(p => { const items = [...p.items]; items[i] = { ...items[i], title: e.target.value }; return { ...p, items }; })} placeholder={t("receiptTemplate.itemTitle")} className="h-8 text-sm" />
                      <Input type="number" value={it.price} onChange={(e) => setMsgrReceipt(p => { const items = [...p.items]; items[i] = { ...items[i], price: e.target.value }; return { ...p, items }; })} placeholder="0.00" className="h-8 text-sm" />
                      <Input type="number" value={it.quantity} onChange={(e) => setMsgrReceipt(p => { const items = [...p.items]; items[i] = { ...items[i], quantity: e.target.value }; return { ...p, items }; })} placeholder="1" className="h-8 text-sm" />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMsgrReceipt(p => ({ ...p, items: p.items.filter((_, j) => j !== i) }))} disabled={msgrReceipt.items.length === 1}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setMsgrReceipt(p => ({ ...p, items: [...p.items, { title: "", price: "", quantity: "1" }] }))}>
                    <Plus className="h-3 w-3 mr-1" /> {t("receiptTemplate.addItem")}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrReceiptTemplate} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {msgrModal === "messagetag" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> {t("messageTag.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("messageTag.deprecationWarning")}</p>
                <div>
                  <Label className="text-xs">{t("messageTag.selectTag")} *</Label>
                  <select value={msgrTag.tag}
                    onChange={(e) => setMsgrTag(p => ({ ...p, tag: e.target.value }))}
                    className="mt-1 w-full h-8 px-2 text-sm border rounded bg-background">
                    <option value="ACCOUNT_UPDATE">ACCOUNT_UPDATE — {t("messageTag.accountUpdate")}</option>
                    <option value="CONFIRMED_EVENT_UPDATE">CONFIRMED_EVENT_UPDATE — {t("messageTag.confirmedEvent")}</option>
                    <option value="HUMAN_AGENT">HUMAN_AGENT — {t("messageTag.humanAgent")}</option>
                    <option value="POST_PURCHASE_UPDATE">POST_PURCHASE_UPDATE — {t("messageTag.postPurchase")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("messageRequired")} *</Label>
                  <Textarea value={msgrTag.message} onChange={(e) => setMsgrTag(p => ({ ...p, message: e.target.value }))} className="mt-1 text-sm" rows={4} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrMessageTag} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}

          {msgrModal === "feedback" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart2 className="h-4 w-4" /> {t("customerFeedback.title")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 overflow-y-auto flex-1">
                <p className="text-xs text-muted-foreground">{t("customerFeedback.description")}</p>
                <div>
                  <Label className="text-xs">{t("customerFeedback.mainTitle")} *</Label>
                  <Input value={msgrFeedback.title} onChange={(e) => setMsgrFeedback(p => ({ ...p, title: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={80} placeholder={t("customerFeedback.mainTitlePlaceholder")} />
                </div>
                <div>
                  <Label className="text-xs">{t("customerFeedback.subtitle")}</Label>
                  <Input value={msgrFeedback.subtitle} onChange={(e) => setMsgrFeedback(p => ({ ...p, subtitle: e.target.value }))} className="mt-1 h-8 text-sm" maxLength={80} />
                </div>
                <div>
                  <Label className="text-xs">{t("customerFeedback.questionType")} *</Label>
                  <select value={msgrFeedback.questionType}
                    onChange={(e) => setMsgrFeedback(p => ({ ...p, questionType: e.target.value as any }))}
                    className="mt-1 w-full h-8 px-2 text-sm border rounded bg-background">
                    <option value="csat">CSAT — {t("customerFeedback.csatDesc")}</option>
                    <option value="nps">NPS — {t("customerFeedback.npsDesc")}</option>
                    <option value="ces">CES — {t("customerFeedback.cesDesc")}</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">{t("customerFeedback.question")} *</Label>
                  <Input value={msgrFeedback.questionTitle} onChange={(e) => setMsgrFeedback(p => ({ ...p, questionTitle: e.target.value }))} className="mt-1 h-8 text-sm" placeholder={t("customerFeedback.questionPlaceholder")} />
                </div>
                <div>
                  <Label className="text-xs">{t("customerFeedback.privacyUrl")}</Label>
                  <Input value={msgrFeedback.privacyUrl} onChange={(e) => setMsgrFeedback(p => ({ ...p, privacyUrl: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="https://seusite.com/privacidade" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t("customerFeedback.privacyUrlHelp")}</p>
                </div>
                <div>
                  <Label className="text-xs">{t("customerFeedback.expires")}</Label>
                  <Input type="number" value={msgrFeedback.expiresInDays} onChange={(e) => setMsgrFeedback(p => ({ ...p, expiresInDays: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="7" min="1" max="30" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeMsgr}>{t("cancel")}</Button>
                <Button onClick={handleSendMsgrCustomerFeedback} disabled={modalSending}>{modalSending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t("send")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Grupo (ghost, mention) ── */}
      <Dialog open={groupModal === "ghost" || groupModal === "mention"} onOpenChange={(open) => { if (!open) closeGroup(); }}>
        <DialogContent className="max-w-md">
          {groupModal === "ghost" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Ghost className="h-4 w-4" /> {t("ghostMessageTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">{t("ghostMessageDesc")}</p>
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={ghostBody} onChange={(e) => setGhostBody(e.target.value)} rows={4} className="mt-1 text-sm" placeholder={t("ghostMessagePlaceholder")} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeGroup}>{t("cancel")}</Button>
                <Button onClick={handleSendGhost}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}
          {groupModal === "mention" && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><AtSign className="h-4 w-4" /> {t("mentionParticipantsTitle")}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs">{t("mentionType")}</Label>
                  <Select value={mentionType} onValueChange={(v) => setMentionType(v as "all" | "specific")}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allParticipants")}</SelectItem>
                      <SelectItem value="specific">{t("specificParticipants")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {mentionType === "specific" && (
                  <div>
                    <Label className="text-xs">{t("numbersCommaSeparated")}</Label>
                    <Input value={mentionParticipants} onChange={(e) => setMentionParticipants(e.target.value)} className="mt-1 h-8 text-sm" placeholder="5511999990000,5511888880000" />
                  </div>
                )}
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={mentionBody} onChange={(e) => setMentionBody(e.target.value)} rows={3} className="mt-1 text-sm" placeholder={t("typeMessagePlaceholder")} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeGroup}>{t("cancel")}</Button>
                <Button onClick={handleSendMention}>{t("send")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Caption (legenda do arquivo) ── */}
      <Dialog open={captionModal} onOpenChange={(open) => { if (!open) { setCaptionModal(false); setCaptionFile(null); setCaptionText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> {t("sendFileTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {captionFile && (
              <div className="flex items-center gap-2 rounded border px-3 py-2 bg-muted/30">
                {captionFile.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(captionFile)} alt={captionFile.name} className="h-16 w-16 rounded object-cover shrink-0" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{captionFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(captionFile.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">{t("captionOptional")}</Label>
              <Input
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleConfirmCaption(); } }}
                placeholder={t("addCaptionPlaceholder")}
                className="mt-1 h-8 text-sm"
                maxLength={WABA_LIMITS.caption}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCaptionModal(false); setCaptionFile(null); setCaptionText(""); }}>{t("cancel")}</Button>
            <Button onClick={handleConfirmCaption}>{t("send")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Gallery picker ── */}
      <Dialog open={galleryModal} onOpenChange={(open) => { if (!open) { setGalleryModal(false); setGallerySelected([]); setGalleryCaptions({}); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileImage className="h-4 w-4" /> {t("fileGalleryTitle")}
              {gallerySelected.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {gallerySelected.length} {gallerySelected.length === 1 ? t("selected") : t("selectedPlural")}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2 min-h-0">
            <div className="flex gap-2 shrink-0">
              <Input
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder={t("searchGalleryPlaceholder")}
                className="h-8 text-sm flex-1"
              />
              <Select value={galleryFilter} onValueChange={(v) => setGalleryFilter(v as typeof galleryFilter)}>
                <SelectTrigger className="h-8 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="image">{t("images")}</SelectItem>
                  <SelectItem value="video">{t("videos")}</SelectItem>
                  <SelectItem value="audio">{t("audios")}</SelectItem>
                  <SelectItem value="document">{t("documents")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Grid de arquivos ── */}
            {loadingGallery ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("loadingGallery")}</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {galleryItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t("noFileFound")}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {galleryItems.map((item) => {
                        const mtype = (item.type || "").toLowerCase();
                        const isImg = mtype.startsWith("image/");
                        const isVid = mtype.startsWith("video/");
                        const isAud = mtype.startsWith("audio/");
                        const selIdx = gallerySelected.findIndex((s) => s.id === item.id);
                        const isSelected = selIdx !== -1;
                        const channelErr = checkGalleryItemForChannel(channelType, item);
                        const blockedLabel = channelErr
                          ? channelErr.reason === "type"
                            ? t("galleryItemTypeBlocked")
                            : t("galleryItemSizeBlocked", { max: channelErr.maxSizeMB })
                          : undefined;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!!channelErr}
                            title={blockedLabel}
                            onClick={() => {
                              if (channelErr) return;
                              setGallerySelected((prev) =>
                                isSelected ? prev.filter((s) => s.id !== item.id) : [...prev, item]
                              );
                            }}
                            className={`relative rounded-lg border-2 overflow-hidden transition-all text-left ${channelErr ? "opacity-40 cursor-not-allowed border-transparent" : isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/30"}`}
                          >
                            {isImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "96px", objectFit: "cover" }} />
                            ) : isVid ? (
                              <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                                <Video className="h-8 w-8 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                              </div>
                            ) : isAud ? (
                              <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                                <Mic className="h-8 w-8 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                              </div>
                            ) : (
                              <div className="w-full h-24 bg-muted flex flex-col items-center justify-center gap-1">
                                <FileText className="h-8 w-8 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground px-1 truncate w-full text-center">{item.name}</span>
                              </div>
                            )}
                            {channelErr && (
                              <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
                                <span className="text-[9px] bg-destructive/90 text-destructive-foreground px-1.5 py-0.5 rounded-t font-medium truncate max-w-[95%]">
                                  {blockedLabel}
                                </span>
                              </div>
                            )}
                            {isSelected && !channelErr && (
                              <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow">
                                <span className="text-[10px] text-primary-foreground font-bold">{selIdx + 1}</span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {galleryHasMore && (
                      <div className="flex justify-center pt-3 pb-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={loadMoreGallery}
                          disabled={galleryLoadingMore}
                        >
                          {galleryLoadingMore && <Loader2 className="animate-spin h-3 w-3 mr-1.5" />}
                          {t("loadMore")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Preview e legendas dos itens selecionados ── */}
            {gallerySelected.length > 0 && (
              <div className="shrink-0 border-t pt-3 space-y-3 max-h-64 overflow-y-auto">
                {gallerySelected.map((item) => {
                  const mtype = (item.type || "").toLowerCase();
                  const isImg = mtype.startsWith("image/");
                  const isVid = mtype.startsWith("video/");
                  const isAud = mtype.startsWith("audio/");
                  return (
                    <div key={item.id} className="flex gap-3 items-start">
                      {/* thumbnail / preview */}
                      <div className="shrink-0 w-20 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                        {isImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        ) : isVid ? (
                          <Video className="h-6 w-6 text-muted-foreground" />
                        ) : isAud ? (
                          <Mic className="h-6 w-6 text-muted-foreground" />
                        ) : (
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      {/* name + caption */}
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                        <Input
                          value={galleryCaptions[item.id] ?? ""}
                          onChange={(e) =>
                            setGalleryCaptions((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={t("captionOptional")}
                          className="h-7 text-xs"
                        />
                      </div>
                      {/* remove */}
                      <button
                        type="button"
                        onClick={() => setGallerySelected((prev) => prev.filter((s) => s.id !== item.id))}
                        className="shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGalleryModal(false)}>{t("cancel")}</Button>
            <Button onClick={handleSendGalleryFile} disabled={gallerySelected.length === 0 || gallerySending}>
              {gallerySending
                ? t("sending")
                : gallerySelected.length > 1
                  ? `${t("send")} (${gallerySelected.length})`
                  : t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Hub WABA Templates ── */}
      <Dialog open={hubTemplateModal} onOpenChange={(open) => { if (!open) { setHubTemplateModal(false); setSelectedHubTemplate(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> {t("hubWabaTemplatesTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={hubTemplateSearch} onChange={(e) => setHubTemplateSearch(e.target.value)} placeholder={t("searchTemplatePlaceholder")} className="h-8 text-sm" />
            {loadingHubTemplates ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("loadingTemplates")}</p>
            ) : hubTemplates.filter((tmpl) => !hubTemplateSearch || tmpl.name.toLowerCase().includes(hubTemplateSearch.toLowerCase())).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("noTemplateFound")}</p>
            ) : (
              <div className="h-[300px] overflow-y-auto" style={{ overflowX: "hidden" }}>
                <div className="space-y-1" style={{ width: "100%", maxWidth: "100%" }}>
                  {hubTemplates
                    .filter((tmpl) => !hubTemplateSearch || tmpl.name.toLowerCase().includes(hubTemplateSearch.toLowerCase()))
                    .map((tp) => (
                      <button
                        key={`${tp.name}-${tp.language}`}
                        onClick={() => setSelectedHubTemplate(tp)}
                        className={`w-full text-left p-2.5 rounded-lg border text-sm transition-colors hover:bg-accent overflow-hidden ${selectedHubTemplate?.name === tp.name ? "border-primary bg-accent" : "border-transparent"}`}
                        style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
                      >
                        <p className="font-medium" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.name}</p>
                        <p className="text-xs text-muted-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.language}</p>
                        {tp.components?.find((c) => c.type === "BODY")?.text && (
                          <p className="text-xs text-muted-foreground mt-0.5" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {tp.components.find((c) => c.type === "BODY")?.text}
                          </p>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {selectedHubTemplate && (
              <div className="bg-[#e5ddd5] rounded-lg p-3">
                <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
                  {selectedHubTemplate.components?.find((c) => c.type === "HEADER")?.text && (
                    <p className="font-bold text-sm text-gray-900">{selectedHubTemplate.components!.find((c) => c.type === "HEADER")!.text}</p>
                  )}
                  {selectedHubTemplate.components?.find((c) => c.type === "BODY")?.text && (
                    <p className="text-sm whitespace-pre-wrap text-gray-800">{selectedHubTemplate.components!.find((c) => c.type === "BODY")!.text}</p>
                  )}
                  {selectedHubTemplate.components?.find((c) => c.type === "FOOTER")?.text && (
                    <p className="text-xs text-gray-400">{selectedHubTemplate.components!.find((c) => c.type === "FOOTER")!.text}</p>
                  )}
                  {selectedHubTemplate.components?.find((c) => c.type === "BUTTONS")?.buttons && (
                    <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
                      {selectedHubTemplate.components!.find((c) => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
                        <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">{btn.text}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHubTemplateModal(false); setSelectedHubTemplate(null); }}>{t("cancel")}</Button>
            <Button onClick={handleSendHubTemplate} disabled={!selectedHubTemplate}>{t("sendTemplate")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Interactive (Baileys/Zapo) ── */}
      <Dialog open={groupModal === "interactive"} onOpenChange={(open) => { if (!open) { closeGroup(); resetInteractive(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {interactiveType === "quickReply" && "Quick Reply"}
              {interactiveType === "singleSelect" && t("singleSelectList")}
              {interactiveType === "ctaButtons" && "CTA Buttons"}
              {interactiveType === "menuText" && t("textMenu")}
              {interactiveType === "poll" && t("poll")}
              {interactiveType === "catalog" && t("catalog")}
              {interactiveType === "carousel" && t("carousel")}
              {interactiveType === "pixButton" && t("ibPixTitle")}
              {interactiveType === "ctaCopy" && t("ibCtaCopyTitle")}
              {interactiveType === "ctaUrl" && t("ibCtaUrlTitle")}
              {interactiveType === "ctaCall" && t("ibCtaCallTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Beta warning — compactado em ícone + tooltip p/ economizar espaço */}
            <div className="flex justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300">
                      <Info className="h-3.5 w-3.5" /> {t("ibBetaWarningLabel")}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug"><p>{t("ibBetaWarning")}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Type selector */}
            <div>
              <Label className="text-xs">{t("type")}</Label>
              <Select value={interactiveType} onValueChange={(v) => { setInteractiveType(v as InteractiveType); resetInteractive(); }}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quickReply">Quick Reply</SelectItem>
                  <SelectItem value="singleSelect">{t("singleSelectList")}</SelectItem>
                  <SelectItem value="pixButton">{t("ibPixTitle")}</SelectItem>
                  <SelectItem value="ctaCopy">{t("ibCtaCopyTitle")}</SelectItem>
                  <SelectItem value="ctaUrl">{t("ibCtaUrlTitle")}</SelectItem>
                  <SelectItem value="ctaCall">{t("ibCtaCallTitle")}</SelectItem>
                  {isInteractiveBaileysEnabled && <SelectItem value="ctaButtons">CTA Buttons</SelectItem>}
                  {isInteractiveBaileysEnabled && <SelectItem value="menuText">{t("textMenu")}</SelectItem>}
                  {isInteractiveBaileysEnabled && <SelectItem value="poll">{t("poll")}</SelectItem>}
                  {isInteractiveBaileysEnabled && !isZapo && <SelectItem value="catalog">{t("catalog")}</SelectItem>}
                  {isInteractiveBaileysEnabled && !isZapo && <SelectItem value="carousel">{t("carousel")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {/* Shared fields: body & footer (not for poll/carousel/pixButton) */}
            {interactiveType !== "poll" && interactiveType !== "carousel" && interactiveType !== "pixButton" && (
              <>
                <div>
                  <Label className="text-xs">{t("messageRequired")}</Label>
                  <Textarea value={interactiveBody} onChange={(e) => setInteractiveBody(e.target.value)} rows={3} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("footerOptional")}</Label>
                  <Input value={interactiveFooter} onChange={(e) => setInteractiveFooter(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
              </>
            )}

            {/* Quick Reply buttons */}
            {interactiveType === "quickReply" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">{t("buttons")}</Label>
                {interactiveButtons.map((b, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="text-xs flex-1">{b.display_text}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setInteractiveButtons((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                {interactiveButtons.length < 3 && (
                  <div className="flex gap-1">
                    <Input value={btnText} onChange={(e) => setBtnText(e.target.value)} placeholder={t("buttonText")} className="h-7 text-xs" />
                    <Input value={btnId} onChange={(e) => setBtnId(e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                    <Button size="sm" className="h-7 px-2" onClick={() => { if (btnText.trim()) { setInteractiveButtons((p) => [...p, { display_text: btnText, id: btnId || btnText }]); setBtnText(""); setBtnId(""); } }}><Plus className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            )}

            {/* CTA Buttons */}
            {interactiveType === "ctaButtons" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">{t("buttonsWithUrl")}</Label>
                {interactiveButtons.map((b, i) => {
                  const bt = b.type || "url";
                  const val = bt === "call" ? b.phoneNumber : bt === "copy" ? b.copyText : b.url;
                  const icon = bt === "call" ? "📞" : bt === "copy" ? "📋" : "🌐";
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-xs flex-1">{icon} {b.display_text} → {val}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setInteractiveButtons((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  );
                })}
                <div className="flex gap-1">
                  <select value={ctaBtnType} onChange={(e) => { setCtaBtnType(e.target.value as "url" | "call" | "copy"); setBtnUrl(""); }} className="h-7 text-xs rounded-md border bg-background px-1">
                    <option value="url">🌐 {t("ctaTypeUrl")}</option>
                    <option value="call">📞 {t("ctaTypeCall")}</option>
                    <option value="copy">📋 {t("ctaTypeCopy")}</option>
                  </select>
                  <Input value={btnText} onChange={(e) => setBtnText(e.target.value)} placeholder={t("buttonText")} className="h-7 text-xs" />
                  <Input value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} placeholder={t("ctaButtonValuePlaceholder")} className="h-7 text-xs" />
                  <Button size="sm" className="h-7 px-2" onClick={() => { if (btnText.trim() && btnUrl.trim()) { setInteractiveButtons((p) => [...p, { display_text: btnText, id: btnText, type: ctaBtnType, url: ctaBtnType === "url" ? btnUrl : undefined, phoneNumber: ctaBtnType === "call" ? btnUrl : undefined, copyText: ctaBtnType === "copy" ? btnUrl : undefined }]); setBtnText(""); setBtnUrl(""); } }}><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
            )}

            {/* Single Select */}
            {interactiveType === "singleSelect" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("listButtonTextRequired")}</Label>
                  <Input value={listTitle} onChange={(e) => setListTitle(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("viewOptionsPlaceholder")} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">{t("sections")}</Label>
                  {listSections.length === 0 && (
                    <p className="text-[10px] text-muted-foreground italic">{t("ibListNoSections")}</p>
                  )}
                  {listSections.map((sec, si) => {
                    const pending = pendingRows[si] || { title: "", id: "", desc: "" };
                    const setPending = (next: Partial<typeof pending>) =>
                      setPendingRows((p) => ({ ...p, [si]: { ...pending, ...next } }));
                    return (
                      <div key={si} className="border rounded p-2 space-y-1.5 bg-muted/20">
                        <div className="flex items-center gap-1">
                          <Input
                            value={sec.title}
                            onChange={(e) => setListSections((p) => p.map((s, j) => j === si ? { ...s, title: e.target.value } : s))}
                            placeholder={`${t("section")} ${si + 1}`}
                            className="h-7 text-xs font-medium flex-1"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                            setListSections((p) => p.filter((_, j) => j !== si));
                            setPendingRows((p) => { const n = { ...p }; delete n[si]; return n; });
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        {sec.rows.length > 0 && (
                          <div className="space-y-0.5 pl-1">
                            {sec.rows.map((r, ri) => (
                              <div key={ri} className="flex items-center justify-between gap-1 text-[11px] bg-background rounded px-1.5 py-0.5">
                                <div className="flex-1 min-w-0 truncate">
                                  <span className="font-medium">{r.title}</span>
                                  {r.description && <span className="text-muted-foreground"> — {r.description}</span>}
                                </div>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setListSections((p) => p.map((s, j) => j === si ? { ...s, rows: s.rows.filter((_, k) => k !== ri) } : s))}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Input
                            value={pending.title}
                            onChange={(e) => setPending({ title: e.target.value })}
                            placeholder={t("ibListRowTitlePh")}
                            className="h-7 text-xs flex-1"
                          />
                          <Input
                            value={pending.id}
                            onChange={(e) => setPending({ id: e.target.value })}
                            placeholder={t("ibListRowIdPh")}
                            className="h-7 text-xs w-16"
                          />
                          <Input
                            value={pending.desc}
                            onChange={(e) => setPending({ desc: e.target.value })}
                            placeholder={t("ibListRowDescPh")}
                            className="h-7 text-xs w-20"
                          />
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0" onClick={() => {
                            if (!pending.title.trim()) { toast.warning(t("ibListRowTitleRequired")); return; }
                            setListSections((p) => p.map((s, j) => j === si ? { ...s, rows: [...s.rows, { id: pending.id || pending.title, title: pending.title, description: pending.desc || undefined }] } : s));
                            setPendingRows((p) => ({ ...p, [si]: { title: "", id: "", desc: "" } }));
                          }}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setListSections((p) => [...p, { title: "", rows: [] }])}>
                    <Plus className="h-3 w-3 mr-1" /> {t("ibListNewSection")}
                  </Button>
                </div>
              </div>
            )}

            {/* Menu Text */}
            {interactiveType === "menuText" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("menuTitleOptional")}</Label>
                  <Input value={menuTitle} onChange={(e) => setMenuTitle(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <Label className="text-xs font-medium">{t("options")}</Label>
                {menuOptions.map((o, i) => (
                  <div key={i} className="flex gap-1">
                    <Input value={o} onChange={(e) => setMenuOptions((p) => p.map((v, j) => j === i ? e.target.value : v))} className="h-7 text-xs flex-1" placeholder={`${t("option")} ${i + 1}`} />
                    {menuOptions.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMenuOptions((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMenuOptions((p) => [...p, ""])}><Plus className="h-3 w-3 mr-1" /> {t("addOption")}</Button>
              </div>
            )}

            {/* Poll */}
            {interactiveType === "poll" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("pollNameRequired")}</Label>
                  <Input value={pollName} onChange={(e) => setPollName(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("pollQuestionPlaceholder")} />
                </div>
                <div>
                  <Label className="text-xs">{t("selectableMin1")}</Label>
                  <Input type="number" min={1} max={12} value={pollSelectable} onChange={(e) => setPollSelectable(Number(e.target.value))} className="mt-1 h-8 text-sm w-20" />
                </div>
                <Label className="text-xs font-medium">{t("optionsMin2Max12")}</Label>
                {pollOptions.map((o, i) => (
                  <div key={i} className="flex gap-1">
                    <Input value={o} onChange={(e) => setPollOptions((p) => p.map((v, j) => j === i ? e.target.value : v))} className="h-7 text-xs flex-1" placeholder={`${t("option")} ${i + 1}`} />
                    {pollOptions.length > 2 && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPollOptions((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                ))}
                {pollOptions.length < 12 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPollOptions((p) => [...p, ""])}><Plus className="h-3 w-3 mr-1" /> {t("addOption")}</Button>}
              </div>
            )}

            {/* Catalog */}
            {interactiveType === "catalog" && (
              <div className="space-y-2">
                <div><Label className="text-xs">{t("buttonTextRequired")}</Label><Input value={catalogDisplayText} onChange={(e) => setCatalogDisplayText(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("viewCatalogPlaceholder")} /></div>
                <div><Label className="text-xs">{t("catalogIdRequired")}</Label><Input value={catalogId} onChange={(e) => setCatalogId(e.target.value)} className="mt-1 h-8 text-sm" /></div>
                <div><Label className="text-xs">{t("productIdsCommaSeparated")}</Label><Input value={catalogProductIds} onChange={(e) => setCatalogProductIds(e.target.value)} className="mt-1 h-8 text-sm" placeholder="prod1,prod2" /></div>
              </div>
            )}

            {/* Carousel */}
            {interactiveType === "carousel" && (
              <div className="space-y-2">
                {/* Topo do carrossel (payload: text, footer) */}
                <div className="space-y-1">
                  <Label className="text-xs">{t("text")}</Label>
                  <Input value={interactiveBody} onChange={(e) => setInteractiveBody(e.target.value)} placeholder={t("carouselTopTextPlaceholder")} className="h-7 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("footer")}</Label>
                  <Input value={interactiveFooter} onChange={(e) => setInteractiveFooter(e.target.value)} placeholder={t("carouselTopFooterPlaceholder")} className="h-7 text-xs" />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label className="text-xs font-medium">{t("cards")}</Label>
                  <span className="text-[11px] text-muted-foreground">{carouselCards.length}/{CAROUSEL_MAX_CARDS}</span>
                </div>
                {carouselCards.map((card, ci) => (
                  card.collapsed ? (
                    /* Card minimizado */
                    <div key={ci} className="flex items-center gap-2 border rounded px-2 py-1 bg-muted/40">
                      {card.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.mediaUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : null}
                      <span className="text-xs font-medium truncate flex-1">{t("cardLabel")} {ci + 1}{card.title ? ` — ${card.title}` : ""}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title={t("editCard")} onClick={() => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, collapsed: false } : c)))}><ChevronDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title={t("duplicateCard")} disabled={carouselCards.length >= CAROUSEL_MAX_CARDS} onClick={() => setCarouselCards((p) => (p.length >= CAROUSEL_MAX_CARDS ? p : [...p.slice(0, ci + 1), { ...card, buttons: card.buttons.map((b) => ({ ...b })), collapsed: true }, ...p.slice(ci + 1)]))}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title={t("removeCard")} disabled={carouselCards.length <= 1} onClick={() => setCarouselCards((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== ci)))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <div key={ci} className="border rounded p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{t("cardLabel")} {ci + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-5 w-5" title={t("duplicateCard")} disabled={carouselCards.length >= CAROUSEL_MAX_CARDS} onClick={() => setCarouselCards((p) => (p.length >= CAROUSEL_MAX_CARDS ? p : [...p.slice(0, ci + 1), { ...card, buttons: card.buttons.map((b) => ({ ...b })), collapsed: false }, ...p.slice(ci + 1)]))}><Copy className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" title={t("removeCard")} disabled={carouselCards.length <= 1} onClick={() => setCarouselCards((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== ci)))}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                      {/* Ordem do payload: title, body, footer, imageUrl, buttons */}
                      <Input value={card.title} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, title: e.target.value } : c)))} placeholder={t("cardTitlePlaceholder")} className="h-7 text-xs" />
                      <Textarea value={card.body} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, body: e.target.value } : c)))} placeholder={t("cardText")} className="text-xs min-h-[52px]" />
                      <Input value={card.footer} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, footer: e.target.value } : c)))} placeholder={t("cardFooterPlaceholder")} className="h-7 text-xs" />
                      {/* Imagem: URL ou galeria */}
                      <div className="flex gap-1">
                        <Input value={card.mediaUrl} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, mediaUrl: e.target.value } : c)))} placeholder={t("cardImageUrlPlaceholder")} className="h-7 text-xs flex-1 min-w-0" />
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" title={t("templateGalleryTitle")} onClick={() => openCarGallery(ci)}><GalleryHorizontalEnd className="h-3.5 w-3.5" /></Button>
                      </div>
                      {card.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.mediaUrl} alt={`${t("cardLabel")} ${ci + 1}`} className="h-14 w-auto rounded border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : null}
                      {card.buttons.map((btn, bi) => (
                        <div key={bi} className="flex gap-1">
                          <Input value={btn.display_text} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, buttons: c.buttons.map((b, k) => (k === bi ? { ...b, display_text: e.target.value } : b)) } : c)))} placeholder={t("carouselButtonPlaceholder")} className="h-7 text-xs flex-1" />
                          <Input value={btn.id} onChange={(e) => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, buttons: c.buttons.map((b, k) => (k === bi ? { ...b, id: e.target.value } : b)) } : c)))} placeholder="ID" className="h-7 text-xs w-20" />
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={card.buttons.length <= 1} onClick={() => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, buttons: c.buttons.filter((_, k) => k !== bi) } : c)))}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] w-full" disabled={card.buttons.length >= 3} onClick={() => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, buttons: [...c.buttons, { display_text: "", id: "" }] } : c)))}>+ {t("carouselButtonPlaceholder")}</Button>
                      {/* Salvar/minimizar card */}
                      <Button size="sm" variant="secondary" className="h-7 text-xs w-full" disabled={!card.body.trim() && !card.mediaUrl.trim() && !card.title.trim()} onClick={() => setCarouselCards((p) => p.map((c, j) => (j === ci ? { ...c, collapsed: true } : c)))}><CheckCircle2 className="h-3 w-3 mr-1" /> {t("saveCard")}</Button>
                    </div>
                  )
                ))}
                <Button size="sm" variant="outline" className="h-7 text-xs w-full" disabled={carouselCards.length >= CAROUSEL_MAX_CARDS} onClick={() => setCarouselCards((p) => (p.length >= CAROUSEL_MAX_CARDS ? p : [...p, emptyCarouselCard()]))}>+ {t("addCard")}</Button>
              </div>
            )}

            {/* PIX Button */}
            {interactiveType === "pixButton" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("ibPixKeyType")}</Label>
                  <Select value={pixType} onValueChange={(v) => setPixType(v as typeof pixType)}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CPF">{t("ibPixTypeCpf")}</SelectItem>
                      <SelectItem value="CNPJ">{t("ibPixTypeCnpj")}</SelectItem>
                      <SelectItem value="PHONE">{t("ibPixTypePhone")}</SelectItem>
                      <SelectItem value="EMAIL">{t("ibPixTypeEmail")}</SelectItem>
                      <SelectItem value="EVP">{t("ibPixTypeRandom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("ibPixKeyLabel")}</Label>
                  <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibPixKeyPlaceholder")} />
                </div>
                <div>
                  <Label className="text-xs">{t("ibPixNameLabel")}</Label>
                  <Input value={pixName} onChange={(e) => setPixName(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{t("ibPixExtraMsg")}</Label>
                  <Textarea value={interactiveBody} onChange={(e) => setInteractiveBody(e.target.value)} rows={2} className="mt-1 text-sm" placeholder={t("ibPixExtraMsgPlaceholder")} />
                </div>
                <p className="text-[10px] text-muted-foreground">{t("ibPixHelp")}</p>
              </div>
            )}

            {/* CTA Copy — copia e cola */}
            {interactiveType === "ctaCopy" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("ibCtaBtnTextLabel")}</Label>
                  <Input value={ctaDisplayText} onChange={(e) => setCtaDisplayText(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaCopyDisplayPh")} />
                </div>
                <div>
                  <Label className="text-xs">{t("ibCtaCopyCodeLabel")}</Label>
                  <Input value={ctaCopyCode} onChange={(e) => setCtaCopyCode(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaCopyCodePlaceholder")} />
                </div>
                <p className="text-[10px] text-muted-foreground">{t("ibCtaCopyHelp")}</p>
              </div>
            )}

            {/* CTA URL */}
            {interactiveType === "ctaUrl" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("ibCtaBtnTextLabel")}</Label>
                  <Input value={ctaDisplayText} onChange={(e) => setCtaDisplayText(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaUrlDisplayPh")} />
                </div>
                <div>
                  <Label className="text-xs">{t("ibCtaUrlLabel")}</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaUrlPlaceholder")} />
                </div>
              </div>
            )}

            {/* CTA Call */}
            {interactiveType === "ctaCall" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">{t("ibCtaBtnTextLabel")}</Label>
                  <Input value={ctaDisplayText} onChange={(e) => setCtaDisplayText(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaCallDisplayPh")} />
                </div>
                <div>
                  <Label className="text-xs">{t("ibCtaCallPhoneLabel")}</Label>
                  <Input value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} className="mt-1 h-8 text-sm" placeholder={t("ibCtaCallPhonePlaceholder")} />
                </div>
                <p className="text-[10px] text-muted-foreground">{t("ibCtaCallHelp")}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { closeGroup(); resetInteractive(); }}>{t("cancel")}</Button>
            <Button onClick={handleSendInteractive} disabled={interactiveType === "carousel" && carouselCards.length < 2}>{t("send")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: UazAPI interactive ── */}
      <UazapiInteractiveDialog
        open={uazapiInteractiveOpen}
        onOpenChange={setUazapiInteractiveOpen}
        ticketId={Number(ticketId)}
        defaultPixKey={whatsapp?.pixDefaultKey || undefined}
        defaultPixType={(whatsapp?.pixDefaultType as "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP") || undefined}
        defaultPixName={whatsapp?.pixDefaultName || undefined}
        defaultPixMessage={whatsapp?.pixDefaultMessage || undefined}
      />

      {/* Galeria p/ imagem do card do carrossel */}
      <Dialog open={carGalleryOpen} onOpenChange={(v) => { setCarGalleryOpen(v); if (!v) setCarGalleryTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GalleryHorizontalEnd className="h-4 w-4" /> {t("templateGalleryTitle")}
              {carGalleryTarget !== null ? <span className="text-xs font-normal text-muted-foreground">— {t("cardLabel")} {carGalleryTarget + 1}</span> : null}
            </DialogTitle>
          </DialogHeader>
          <Input value={carGallerySearch} onChange={(e) => setCarGallerySearch(e.target.value)} placeholder={t("searchGalleryPlaceholder")} className="h-8 text-sm" />
          {carGalleryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("loadingGallery")}</p>
          ) : (() => {
            const filtered = carGalleryItems.filter((it) => it.type.startsWith("image/") && matchesAllTerms(it.name, carGallerySearch));
            return filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("noFileFound")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {filtered.map((item) => (
                  <button key={item.id} onClick={() => pickCarGalleryItem(item)} className="group relative rounded-lg border overflow-hidden hover:border-primary transition-colors bg-muted" title={item.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" className="w-full h-20 object-cover" />
                  </button>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: WooCommerce product picker ── */}
      <ProductPickerDialog
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        whatsappId={whatsappId || null}
        ticketId={ticketId || null}
        onInsert={(payload) => {
          setText((prev) => (prev ? `${prev}\n${payload}` : payload));
          textareaRef.current?.focus();
        }}
        onStageMedia={async (imageUrl, caption) => {
          // Catálogo interno (modo Inserir): estagia a imagem como File + legenda no texto,
          // para sair como 1 mensagem imagem+legenda pelo caminho de mídia normal.
          try {
            const url =
              imageUrl.startsWith("http") || imageUrl.startsWith("blob:") || imageUrl.startsWith("data:")
                ? imageUrl
                : `${apiBaseUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const mimeType = blob.type || "image/jpeg";
            const ext = (mimeType.split("/")[1] || "jpg").split("+")[0];
            const file = new File([blob], `produto_${Date.now()}.${ext}`, { type: mimeType });
            setFiles((prev) => [...prev, file]);
            if (caption) setText((prev) => (prev ? `${prev}\n${caption}` : caption));
            textareaRef.current?.focus();
          } catch {
            toast.error(t("productStageError"));
            if (caption) setText((prev) => (prev ? `${prev}\n${caption}` : caption));
          }
        }}
      />

      {/* ── Dialog: Enviar Localização ── */}
      <Dialog open={locationModal} onOpenChange={(open) => { if (!open) setLocationModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {t("sendLocationTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t("latitudeRequired")}</Label>
                <Input value={locLat} onChange={(e) => setLocLat(e.target.value)} placeholder="-23.5505" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t("longitudeRequired")}</Label>
                <Input value={locLng} onChange={(e) => setLocLng(e.target.value)} placeholder="-46.6333" className="h-8 text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("locationNameOptional")}</Label>
              <Input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder={t("locationNamePlaceholder")} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("addressOptional")}</Label>
              <Input value={locAddr} onChange={(e) => setLocAddr(e.target.value)} placeholder={t("addressPlaceholder")} className="h-8 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationModal(false)}>{t("cancel")}</Button>
            <Button onClick={handleSendLocationDialog} disabled={sendingLocation}>
              {sendingLocation ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Resumir Conversa com IA ── */}
      <Dialog open={summarizeOpen} onOpenChange={(open) => { if (!summarizing) setSummarizeOpen(open); }}>
        <DialogContent className="max-w-md">
          {summarizing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/90 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{tS("generating")}</p>
            </div>
          )}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" /> {tS("dialogTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{tS("periodoLabel")}</Label>
                <Select value={summarizeForm.period} onValueChange={(v) => setSummarizeForm((f) => ({ ...f, period: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">{tS("periodo1d")}</SelectItem>
                    <SelectItem value="3d">{tS("periodo3d")}</SelectItem>
                    <SelectItem value="7d">{tS("periodo7d")}</SelectItem>
                    <SelectItem value="14d">{tS("periodo14d")}</SelectItem>
                    <SelectItem value="30d">{tS("periodo30d")}</SelectItem>
                    <SelectItem value="all">{tS("periodoAll")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tS("senderLabel")}</Label>
                <Select value={summarizeForm.sender} onValueChange={(v) => setSummarizeForm((f) => ({ ...f, sender: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tS("senderAll")}</SelectItem>
                    <SelectItem value="contact">{tS("senderContact")}</SelectItem>
                    <SelectItem value="me">{tS("senderMe")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tS("typeLabel")}</Label>
                <Select value={summarizeForm.type} onValueChange={(v) => setSummarizeForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">{tS("typeGeral")}</SelectItem>
                    <SelectItem value="pontos">{tS("typePontos")}</SelectItem>
                    <SelectItem value="proximos">{tS("typeProximos")}</SelectItem>
                    <SelectItem value="sentimento">{tS("typeSentimento")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tS("maxLabel")}</Label>
                <Select value={summarizeForm.max} onValueChange={(v) => setSummarizeForm((f) => ({ ...f, max: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">{tS("max50")}</SelectItem>
                    <SelectItem value="100">{tS("max100")}</SelectItem>
                    <SelectItem value="200">{tS("max200")}</SelectItem>
                    <SelectItem value="all">{tS("maxAll")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">{tS("destLabel")}</Label>
              <Select value={summarizeForm.dest} onValueChange={(v) => setSummarizeForm((f) => ({ ...f, dest: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="input">{tS("destInput")}</SelectItem>
                  <SelectItem value="view">{tS("destView")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummarizeOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSummarize} disabled={summarizing} className="gap-2">
              {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              {summarizing ? tS("generating") : tS("btnGenerate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Resultado do resumo ── */}
      <Dialog open={summaryResultOpen} onOpenChange={setSummaryResultOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" /> {tS("resultTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap pr-2">{summaryResult}</p>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(summaryResult); toast.success(tS("copied")); }}>
              {tS("copyBtn")}
            </Button>
            <Button onClick={() => { setText(summaryResult); setSummaryResultOpen(false); toast.success(tS("inserted")); }}>
              {tS("insertBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Criar Nota ── */}
      <Dialog open={noteModal} onOpenChange={(open) => { if (!noteSaving) { setNoteModal(open); if (!open) resetNoteDialog(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-yellow-600" /> {t("createNote")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div
              className={cn(
                "relative rounded-md transition-colors",
                noteDropActive && "ring-2 ring-primary bg-primary/5"
              )}
              onDragOver={handleNoteDragOver}
              onDragLeave={handleNoteDragLeave}
              onDrop={handleNoteDrop}
            >
              {noteDropActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md">
                  <p className="text-xs text-primary font-medium">{t("noteAttach")}</p>
                </div>
              )}
              <Textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onPaste={handleNotePaste}
                placeholder={t("notePlaceholder")}
                rows={5}
                className="resize-none text-sm"
              />
            </div>
            {noteFilePreview ? (
              <img src={noteFilePreview} alt="" className="max-h-32 rounded border object-contain" />
            ) : noteFile ? (
              <p className="text-xs text-muted-foreground truncate">{noteFile.name}</p>
            ) : null}
            <div className="flex gap-2 items-center">
              <input
                ref={noteFileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleNoteFileChange}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => noteFileInputRef.current?.click()}>
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{noteFile ? t("noteRemoveAttach") : t("noteAttach")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={handleOpenNoteGallery}>
                      <FileImage className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("fromGallery")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {noteFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => { setNoteFile(null); setNoteFilePreview(null); if (noteFileInputRef.current) noteFileInputRef.current.value = ""; }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteModal(false)} disabled={noteSaving}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreateNote} disabled={noteSaving || (!noteText.trim() && !noteFile)} className="gap-2">
              {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              {t("saveNote")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Galeria para Nota ── */}
      <Dialog open={noteGalleryOpen} onOpenChange={setNoteGalleryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileImage className="h-4 w-4" /> {t("fromGallery")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={noteGallerySearch}
                onChange={(e) => setNoteGallerySearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-8 text-sm pl-7"
              />
            </div>
            <ScrollArea className="h-[55vh]">
              {noteGalleryLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pr-2">
                  {noteGalleryItems
                    .filter((it) => matchesAllTerms(it.name, noteGallerySearch))
                    .map((item) => {
                      const isImg = (item.type || "").startsWith("image/");
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectGalleryForNote(item)}
                          className="relative rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all aspect-square bg-muted/30 flex items-center justify-center"
                        >
                          {isImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={getGalleryPreviewUrl(item)} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-1 p-2 text-center">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                              <span className="text-[10px] truncate w-full">{item.name}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  {noteGalleryItems.length === 0 && (
                    <p className="col-span-3 text-center text-sm text-muted-foreground py-6">{t("noGalleryItems")}</p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Copiloto ── */}
      {copilotOpen && (
        <CopilotPanel
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          ticketId={ticketId}
          currentText={text}
          onUseSuggestion={(s) => { setText(s); }}
        />
      )}

      {/* ── Dialog: Enviar Contato (vCard) ── */}
      <Dialog open={vcardModal} onOpenChange={(open) => { if (!open) { setVcardModal(false); setVcardSearch(""); setVcardSearchResults([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Contact2 className="h-4 w-4" /> {t("sendVcardTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {/* Contact search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={vcardSearch}
                onChange={(e) => setVcardSearch(e.target.value)}
                placeholder={t("vcardSearchPlaceholder")}
                className="h-8 text-sm pl-7"
              />
              {vcardSearchLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {vcardSearchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border divide-y">
                {vcardSearchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    onClick={() => { setVcardFullName(c.name); setVcardPhone(c.number); setVcardSearch(""); setVcardSearchResults([]); }}
                  >
                    <div className="font-medium leading-none">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.number}</div>
                  </button>
                ))}
              </div>
            )}
            {vcardSearch.trim() && !vcardSearchLoading && vcardSearchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">{t("vcardNoResults")}</p>
            )}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">{t("vcardOrManual")}</span>
              <Separator className="flex-1" />
            </div>
            <div>
              <Label className="text-xs">{t("fullNameRequired")}</Label>
              <Input value={vcardFullName} onChange={(e) => setVcardFullName(e.target.value)} placeholder={t("fullNamePlaceholder")} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("phoneWithAreaCode")}</Label>
              <Input value={vcardPhone} onChange={(e) => setVcardPhone(e.target.value)} placeholder="+5511999990000" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVcardModal(false); setVcardSearch(""); setVcardSearchResults([]); }}>{t("cancel")}</Button>
            <Button onClick={handleSendVcard} disabled={sendingVcard}>
              {sendingVcard ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Template header gallery picker ── */}
      <GalleryPickerWithUploadDialog
        open={tplGalleryOpen}
        onOpenChange={setTplGalleryOpen}
        onPick={pickTplGalleryItem}
        {...wabaHeaderFormatToGalleryParams(
          selectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
        )}
      />

      {/* Galeria para Messenger Media Template */}
      <GalleryPickerWithUploadDialog
        open={msgrMediaGalleryOpen}
        onOpenChange={setMsgrMediaGalleryOpen}
        onPick={pickMsgrMediaGalleryItem}
        {...wabaHeaderFormatToGalleryParams(msgrMedia.mediaType === "video" ? "VIDEO" : "IMAGE")}
      />
    </div>
  );
}
