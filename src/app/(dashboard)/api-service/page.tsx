"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Globe, RefreshCw, Plus, Pencil, Trash2, Copy, Key,
  ExternalLink, Check, AlertTriangle, ChevronDown, ChevronRight,
  BookOpen, Play, Send, FlaskConical, Clock,
  Layers2, ArrowDownAZ, Building2,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchApiConfigs,
  createApiConfig,
  updateApiConfig,
  renewApiToken,
  deleteApiConfig,
  type ApiConfig,
} from "@/services/api-config";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { fetchTenantById } from "@/services/tenants";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { AccessDenied } from "@/components/layout/access-denied";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_SESSION_TYPES = ["whatsapp", "waba", "dialog360", "gupshup", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi", "hub", "telegram", "instagram", "messenger", "webchat", "email", "webmail"];

const apiBaseUrl =
  (typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "") ||
  "http://localhost:3101";

function buildIntegrationUrl(apiId: number): string {
  return `${apiBaseUrl}/v2/api/external/${apiId}`;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  waba: "Waba",
  dialog360: "Dialog360",
  gupshup: "Gupshup",
  baileys: "Baileys",
  zapo: "Zapo",
  whatsapp: "WWEBJS",
  evo: "Evolution",
  evogo: "Evolution Go",
  meow: "Wuzapi",
  zapi: "Z-API",
  uazapi: "Uazapi",
  hub: "Hub",
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Webchat",
  email: "Email",
  webmail: "Email",
};

type ApiSortMode = "default" | "alpha" | "grouped" | "byProvider";

const API_PROVIDER_GROUPS: { key: string; labelKey: string; types: string[] }[] = [
  { key: "meta", labelKey: "channelGroupMeta", types: ["waba", "dialog360", "gupshup", "instagram", "messenger"] },
  { key: "unofficial", labelKey: "channelGroupUnofficial", types: ["baileys", "zapo", "whatsapp", "evo", "evogo", "meow", "zapi", "uazapi"] },
  { key: "outros", labelKey: "channelGroupOthers", types: ["telegram", "webchat", "hub", "email", "webmail", "mercadolivre"] },
  { key: "generic", labelKey: "apiGroupGeneric", types: [] },
];

function getApiProviderGroup(cat: ApiRouteCategory) {
  if (!cat.channelTypes || cat.channelTypes.length === 0) return API_PROVIDER_GROUPS[3];
  const t = cat.channelTypes[0];
  return API_PROVIDER_GROUPS.find((g) => g.types.includes(t)) ?? API_PROVIDER_GROUPS[2];
}

function getApiPrimaryType(cat: ApiRouteCategory) {
  return cat.channelTypes?.[0] || "generic";
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  POST: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

// ─── Types ────────────────────────────────────────────────────────────────────

const apiFormSchema = z.object({
  name: z.string().min(1),
  sessionId: z.string().min(1),
  isActive: z.boolean(),
});

type ApiFormValues = z.infer<typeof apiFormSchema>;

interface ApiQueryParam {
  key: string;
  desc: string;
  defaultValue?: string;
  required?: boolean;
}

interface ApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  name: string;
  description?: string;
  bodyType?: "json" | "formdata";
  params?: ApiQueryParam[];
  bodyExample?: string;
  channelTypes?: string[];
}

interface ApiRouteCategory {
  name: string;
  emoji: string;
  routes: ApiRoute[];
  channelTypes?: string[];
}

// ─── API Docs Data ─────────────────────────────────────────────────────────────

const API_DOCS: ApiRouteCategory[] = [
  {
    name: "Mensagens",
    emoji: "📨",
    routes: [
      {
        method: "GET", path: "/params/", name: "SendMessageParams",
        description: "Enviar mensagem via query params (GET). Útil para integrações simples sem body. É a única rota do catálogo que não aceita o token no header Authorization: o token vai obrigatoriamente no parâmetro bearertoken.",
        params: [
          { key: "body", desc: "Texto da mensagem", required: true, defaultValue: "Olá!" },
          { key: "number", desc: "Número do destinatário (5511999999999)", required: true, defaultValue: "5511999999999" },
          { key: "externalKey", desc: "Chave única de controle", required: true, defaultValue: "chave-001" },
          { key: "bearertoken", desc: "Token da API — obrigatório nesta rota (o header Authorization é ignorado)", required: true },
        ],
      },
      {
        method: "POST", path: "/", name: "SendMessageAPIText",
        description: "Enviar mensagem de texto. Abre ou reutiliza ticket existente. O campo number carrega o ID da plataforma do canal do token: telefone (família WhatsApp), IGSID (Instagram), PSID (Messenger), telegramId (Telegram). O canal e-mail também exige number (ou bsuid) e usa email como destinatário e subject como assunto. Aceita ticketId opcional — usado apenas quando consistente com o contato/canal do ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ body: "A mensagem desejada", number: "5511999999999", externalKey: "chave-001", isClosed: false }, null, 2),
      },
      {
        method: "POST", path: "/", name: "SendMessageAPIFile",
        description: "Enviar arquivo via multipart/form-data (imagem, documento, vídeo).",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  media      → arquivo (tipo: file)\n  body       → texto da mensagem\n  number     → 5511999999999\n  externalKey → chave-001\n  isClosed   → false",
      },
      {
        method: "POST", path: "/url", name: "SendMessageAPIFileURL",
        description: "Enviar mídia a partir de URL pública (imagem, documento).",
        bodyType: "json",
        bodyExample: JSON.stringify({ mediaUrl: "https://exemplo.com/imagem.png", body: "A mensagem desejada", number: "5511999999999", externalKey: "chave-001", isClosed: false }, null, 2),
      },
      {
        method: "POST", path: "/voice", name: "SendMessageAPIVoice",
        description: "Enviar áudio/mensagem de voz via URL pública (.ogg, .mp3).",
        bodyType: "json",
        bodyExample: JSON.stringify({ audio: "https://exemplo.com/audio.ogg", number: "5511999999999", externalKey: "chave-001", isClosed: false }, null, 2),
      },
      {
        method: "POST", path: "/base64", name: "SendMessageAPITextBase64",
        description: "Enviar arquivo codificado em Base64 junto com mensagem.",
        bodyType: "json",
        bodyExample: JSON.stringify({ body: "A mensagem desejada", number: "5511999999999", base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAUA...", mimeType: "image/png", fileName: "exemplo", isClosed: false }, null, 2),
      },
      {
        method: "GET", path: "/getMessageByMessageId", name: "GetMessageByMessageId",
        description: "Buscar mensagem pelo ID retornado pela Meta (wamid).",
        params: [{ key: "messageId", desc: "ID da mensagem (ex: wamid.xxxxx)", required: true, defaultValue: "wamid.xxxxx" }],
      },
    ],
  },
  {
    name: "Envio por Ticket (Omnichannel)",
    emoji: "🎯",
    routes: [
      {
        method: "POST", path: "/sendMessageByTicket", name: "SendMessageByTicketText",
        description: "Enviar texto livre usando o ticketId como identificador da conversa — em QUALQUER canal do tenant (WhatsApp, Instagram, Messenger, Telegram, Webchat, E-mail, Hub, Mercado Livre...). O canal é resolvido pelo próprio ticket; o token vale para qualquer ticket do tenant. Ticket fechado exige reopen: true (senão 409 ERR_TICKET_CLOSED). Resposta inclui ticketId efetivo, messageId e delivered (webchat).",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, body: "Olá! Como posso ajudar?", externalKey: "chave-001", reopen: false, isClosed: false }, null, 2),
      },
      {
        method: "POST", path: "/sendMessageByTicket", name: "SendMessageByTicketFile",
        description: "Enviar arquivo por ticketId via multipart/form-data (imagem, vídeo, áudio, documento — conforme o canal suportar).",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  media       → arquivo (tipo: file)\n  ticketId    → 1262\n  body        → legenda/texto opcional\n  externalKey → chave-001\n  reopen      → false\n  isClosed    → false",
      },
      {
        method: "POST", path: "/sendMessageByTicket", name: "SendMessageByTicketMediaUrl",
        description: "Enviar mídia por ticketId a partir de URL pública (o backend baixa a URL; esquema http/https, sem redirect, hosts internos bloqueados).",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, mediaUrl: "https://exemplo.com/imagem.png", body: "Legenda opcional", externalKey: "chave-001" }, null, 2),
      },
      {
        method: "POST", path: "/sendMessageByTicket", name: "SendMessageByTicketBase64",
        description: "Enviar arquivo em Base64 por ticketId (mimeType obrigatório; fileName opcional, sem caminhos).",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, body: "Legenda opcional", base64Data: "iVBORw0KGgoAAAANSUhEUgAAAAUA...", mimeType: "image/png", fileName: "exemplo", externalKey: "chave-001" }, null, 2),
      },
    ],
  },
  {
    name: "Mensagens em Grupo",
    emoji: "👥",
    routes: [
      {
        method: "POST", path: "/group", name: "SendGroupMessageAPIText",
        description: "Enviar mensagem de texto para grupo do WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ body: "A mensagem desejada", number: "12356818915189153", externalKey: "chave-001", isClosed: false }, null, 2),
      },
      {
        method: "POST", path: "/group", name: "SendGroupMessageAPIFile",
        description: "Enviar arquivo para grupo via multipart/form-data. Um arquivo por requisição.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  media      → arquivo único (tipo: file, apenas 1 por requisição)\n  body       → texto da mensagem\n  number     → 12356818915189153 (ID do grupo)\n  externalKey → chave-001\n  isClosed   → false",
      },
      {
        method: "POST", path: "/groupMediaUrl", name: "SendMessageAPIFileURLGroup",
        description: "Enviar mídia por URL para grupo do WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ mediaUrl: "https://exemplo.com/imagem.png", body: "A mensagem desejada", number: "12356818915189153", externalKey: "chave-001", isClosed: false }, null, 2),
      },
    ],
  },
  {
    name: "Templates WABA",
    emoji: "📋",
    routes: [
      {
        method: "POST", path: "/template", name: "SendTemplateWaba",
        description: "Enviar template aprovado do WhatsApp Business API (WABA). A resposta retorna o ticketId do atendimento criado/reutilizado.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", isClosed: false, templateData: { messaging_product: "whatsapp", to: "5511999999999", type: "template", template: { name: "hello_world", language: { code: "pt_BR" } } } }, null, 2),
      },
      {
        method: "POST", path: "/templateBody", name: "SendTemplateWabaBody",
        description: "Enviar template WABA com parâmetros de body personalizados. A resposta retorna o ticketId do atendimento criado/reutilizado.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", isClosed: false, templateData: { messaging_product: "whatsapp", to: "5511999999999", type: "template", template: { name: "hello_world", language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: "valor1" }] }] } } }, null, 2),
      },
      {
        method: "POST", path: "/templateMarketingBody", name: "SendTemplateWabaMarketing",
        description: "Enviar template de marketing WABA com componentes de header e body. A resposta retorna o ticketId do atendimento criado/reutilizado.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", isClosed: false, templateData: { messaging_product: "whatsapp", to: "5511999999999", type: "template", template: { name: "nome_template_marketing", language: { code: "pt_BR" }, components: [{ type: "header", parameters: [{ type: "image", image: { link: "https://exemplo.com/img.png" } }] }, { type: "body", parameters: [{ type: "text", text: "valor1" }] }] } } }, null, 2),
      },
    ],
  },
  {
    name: "Interativo Waba",
    emoji: "🔘",
    channelTypes: ["waba"],
    routes: [
      {
        method: "POST", path: "/sendButtonWABA", name: "SendButtonWABA",
        description: "Enviar mensagem com botões interativos (até 3) via WABA. Exige canal do tipo WhatsApp Business API (waba): canais Dialog360 e Gupshup respondem 400 ERR_CHANNEL_WABA_REQUIRED.",
        bodyType: "json",
        channelTypes: ["waba"],
        bodyExample: JSON.stringify({ number: "5511999999999", message: "Escolha uma opção:", button1: "Opção 1", button2: "Opção 2", button3: "Opção 3", ticketId: 1262 }, null, 2),
      },
      {
        method: "POST", path: "/sendListWABA", name: "SendListWABA",
        description: "Enviar lista interativa com seções e itens selecionáveis via WABA. Exige canal do tipo WhatsApp Business API (waba): canais Dialog360 e Gupshup respondem 400 ERR_CHANNEL_WABA_REQUIRED.",
        bodyType: "json",
        channelTypes: ["waba"],
        bodyExample: JSON.stringify({ number: "5511999999999", header: "Menu Principal", body: "Escolha uma opção:", footer: "Selecione uma opção", button_text: "Ver opções", sections: [{ title: "Seção 1", rows: [{ id: "1", title: "Opção 1", description: "Desc 1" }, { id: "2", title: "Opção 2", description: "Desc 2" }] }], ticketId: 1262 }, null, 2),
      },
    ],
  },
  {
    name: "Contatos",
    emoji: "👤",
    routes: [
      {
        method: "POST", path: "/createContact", name: "CreateContact",
        description: "Criar um novo contato no sistema. Endereço opcional: cep (até 20 caracteres), logradouro (rua), numeroEndereco, complemento, bairro e cidade (até 255 cada) e estado (até 100). Os textos são aparados e o que passar do limite é cortado, sem erro; o estado é gravado como veio. A resposta traz o contato com os 7 campos de endereço (cep, logradouro, numeroEndereco, complemento, bairro, cidade, estado).",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Nome Completo", number: "5511999999999", email: "contato@email.com", cpf: "000.000.000-00", firstName: "Nome", lastName: "Sobrenome", businessName: "Empresa", birthdayDate: "01/01/1990", cep: "01310-100", logradouro: "Avenida Paulista", numeroEndereco: "1000", complemento: "Sala 101", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP" }, null, 2),
      },
      {
        method: "POST", path: "/showcontact", name: "ShowContact",
        description: "Buscar dados de um contato pelo número do WhatsApp. A resposta traz o endereço do contato: cep, logradouro, numeroEndereco, complemento, bairro, cidade e estado.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/updateContact", name: "UpdateContact",
        description: "Atualizar dados de um contato existente. Endereço: cep (até 20 caracteres), logradouro (rua), numeroEndereco, complemento, bairro e cidade (até 255 cada) e estado (até 100), aparados e cortados no limite, sem erro; o estado é gravado como veio. Em cada campo de endereço, \"\" ou null apaga o valor e campo ausente fica como está. A resposta traz o contato com os 7 campos de endereço.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Nome Atualizado", number: "5511999999999", email: "novo@email.com", cpf: "000.000.000-00", firstName: "Nome", lastName: "Sobrenome", businessName: "Empresa", birthdayDate: "01/01/1990", kanban: 2, cep: "01310-100", logradouro: "Avenida Paulista", numeroEndereco: "1000", complemento: "Sala 101", bairro: "Bela Vista", cidade: "São Paulo", estado: "SP" }, null, 2),
      },
      {
        method: "POST", path: "/blockContact", name: "BlockContact",
        description: "Bloquear ou desbloquear um contato.",
        bodyType: "json",
        bodyExample: JSON.stringify({ contactId: 1, blocked: true }, null, 2),
      },
      {
        method: "POST", path: "/contacts/search", name: "SearchContacts",
        description: "Buscar contatos com filtros avançados (texto, tag, wallet, bloqueado e endereço). addressBairro e addressCidade buscam por \"contém\", sem diferenciar acento e maiúsculas. addressUfs aceita as siglas das 27 UFs em texto separado por vírgula (\"SP,RJ\") ou em lista ([\"SP\", \"RJ\"]) e acha também o estado gravado por extenso (ex.: \"São Paulo\"); UF pedida sem nenhuma sigla válida devolve lista vazia. Resposta: { success, data, pagination: { page, limit, total, totalPages, hasMore }, meta: { addressFilter } }; cada contato de data traz id, number, name, email, blocked, cep, logradouro, numeroEndereco, complemento, bairro, cidade, estado, tags e wallets. meta.addressFilter false indica servidor sem as colunas de endereço: os filtros de endereço foram ignorados.",
        bodyType: "json",
        bodyExample: JSON.stringify({ searchParam: "", page: 1, limit: 40, tagId: null, walletId: null, blocked: false, addressBairro: "Bela Vista", addressCidade: "São Paulo", addressUfs: "SP,RJ" }, null, 2),
      },
      {
        method: "POST", path: "/updateContactKanban", name: "UpdateContactKanban",
        description: "Atualizar o kanban (carteira) de um contato.",
        bodyType: "json",
        bodyExample: JSON.stringify({ contactId: 1, kanban: 2 }, null, 2),
      },
      {
        method: "POST", path: "/updateContactWallet", name: "UpdateContactWallet",
        description: "Definir as wallets (carteiras) de um contato. A lista enviada substitui a atual: para tirar uma wallet, reenvie apenas as que devem permanecer; walletIds: [] (ou walletId: null) descarteiriza o contato.",
        bodyType: "json",
        bodyExample: JSON.stringify({ contactId: 1, walletId: 2 }, null, 2),
      },
      {
        method: "GET", path: "/getContactExtraInfo", name: "GetContactExtraInfo",
        description: "Buscar campos personalizados (extraInfo) de um contato.",
        params: [{ key: "contactId", desc: "ID do contato", required: true, defaultValue: "1" }],
      },
      {
        method: "POST", path: "/updateContactExtraInfo", name: "UpdateContactExtraInfo",
        description: "Atualizar campos personalizados de um contato.",
        bodyType: "json",
        bodyExample: JSON.stringify({ contactId: 1, extraInfo: [{ name: "Campo 1", value: "Valor 1" }, { name: "Campo 2", value: "Valor 2" }] }, null, 2),
      },
      {
        method: "POST", path: "/findduplicatecontacts", name: "FindDuplicateContacts",
        description: "Listar pares de contatos duplicados (variantes do 9º dígito BR / colisões) candidatos a mesclagem. Sem paginação: use limit para ampliar o lote. O limit é aplicado antes do filtro matchKinds.",
        bodyType: "json",
        bodyExample: JSON.stringify({ limit: 500, matchKinds: ["nine_digit_variant", "cross_collision"] }, null, 2),
      },
      {
        method: "POST", path: "/mergecontacts", name: "MergeContacts",
        description: "Mesclar contatos duplicados em lote. Cada par indica o contato principal e o duplicado, por id (primaryId/duplicateId) ou por número (primaryNumber/duplicateNumber).",
        bodyType: "json",
        bodyExample: JSON.stringify({ pairs: [{ primaryId: 1, duplicateId: 2 }, { primaryNumber: "5511999999999", duplicateNumber: "551199999999" }] }, null, 2),
      },
      {
        method: "POST", path: "/unmergecontacts", name: "UnmergeContacts",
        description: "Desfazer a mesclagem de contatos previamente mesclados. Informe duplicateIds (ids dos contatos duplicados) ou mergeLogIds (ids dos registros de mesclagem). Um dos dois é obrigatório.",
        bodyType: "json",
        bodyExample: JSON.stringify({ duplicateIds: [2] }, null, 2),
      },
    ],
  },
  {
    name: "Tickets",
    emoji: "🎫",
    routes: [
      {
        method: "POST", path: "/createTicket", name: "CreateTicket",
        description: "Criar ticket de atendimento. Suporta WhatsApp e Webmail.",
        bodyType: "json",
        bodyExample: JSON.stringify({ body: "Mensagem inicial", number: "5511999999999", externalKey: "chave-001", userId: 1, status: "pending", queueId: null, kanbanId: null, chatFlowId: null, reasonId: null, value: null }, null, 2),
      },
      {
        method: "POST", path: "/createTicket", name: "CreateTicketWebmail",
        description: "Criar ticket via canal Webmail (email).",
        bodyType: "json",
        bodyExample: JSON.stringify({ body: "Mensagem via email", email: "contato@exemplo.com", channelId: 17841443941506797, externalKey: "chave-001", userId: 1, status: "pending", name: "Nome do Contato" }, null, 2),
      },
      {
        method: "POST", path: "/createTicket", name: "CreateTicketFile",
        description: "Criar ticket enviando um arquivo (multipart/form-data). Suporta imagem, documento e outros formatos.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  media       → arquivo a ser enviado (tipo: file)\n  body        → texto da mensagem inicial\n  number      → 5511999999999\n  externalKey → chave-001\n  userId      → 1\n  status      → pending\n  queueId     → 1 (opcional)\n  kanbanId    → 1 (opcional)\n  chatFlowId  → 10 (opcional)\n  channelId   → (opcional, para webmail)\n  email       → (opcional, para webmail)\n  name        → (opcional, para webmail)",
      },
      {
        method: "POST", path: "/updatequeue", name: "SetQueue",
        description: "Definir ou alterar a fila de atendimento de um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 4, queueId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/updatetag", name: "SetTag",
        description: "Substituir as tags do contato do ticket pela tag informada. Atenção: as demais tags do contato são removidas, e o efeito vale para todos os tickets desse contato. Para acrescentar sem remover, use /addTag.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 4, tag: 1 }, null, 2),
      },
      {
        method: "POST", path: "/updateticketinfo", name: "SetTicketInfo",
        description: "Atualizar informações completas de um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, userId: 1, status: "pending", queueId: null, typebotStatus: false, chatgptStatus: false, dialogflowStatus: false, difyStatus: false, n8nStatus: false, chatFlowId: null }, null, 2),
      },
      {
        method: "POST", path: "/showticket", name: "ShowTicketInformation",
        description: "Buscar informações de um ticket aberto do contato. Só considera tickets com status open: contato sem ticket aberto responde 404, mesmo tendo histórico. Havendo mais de um aberto, não há garantia de que seja o mais recente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/showticketchatbot", name: "ShowTicketInformationChatBot",
        description: "Buscar o primeiro ticket do contato que tenha fluxo de chatbot vinculado, independente do status. Ticket fechado com fluxo também é retornado; ticket aberto sem fluxo responde 404.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/showallticket", name: "ShowAllTicketInformation",
        description: "Buscar todos os tickets de um contato pelo número.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/showAllMessages", name: "ShowAllMessages",
        description: "Listar todas as mensagens de um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticket: "123" }, null, 2),
      },
      {
        method: "POST", path: "/updateTicketChannel", name: "UpdateTicketChannel",
        description: "Alterar o canal (WhatsApp) de um ticket existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, whatsappId: 1, channel: "whatsapp" }, null, 2),
      },
      {
        method: "POST", path: "/createNotes", name: "CreateNotes",
        description: "Criar uma nota interna em um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ notes: "Conteúdo da nota", ticketId: 1262, userId: 1, idFront: "ID_UNICA_NOTA_001" }, null, 2),
      },
      {
        method: "POST", path: "/updateNote", name: "UpdateNote",
        description: "Atualizar o conteúdo de uma nota existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ noteId: 1, notes: "Conteúdo atualizado" }, null, 2),
      },
      {
        method: "GET", path: "/listNotes", name: "ListNotes",
        description: "Listar todas as notas de um ticket.",
        params: [{ key: "ticketId", desc: "ID do ticket", required: true, defaultValue: "1262" }],
      },
      {
        method: "POST", path: "/addTag", name: "AddTag",
        description: "Adicionar uma ou mais tags a um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 4, tagId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/removeTag", name: "RemoveTag",
        description: "Remover uma ou mais tags de um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 4, tagId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/addTagContact", name: "AddTagContact",
        description: "Adicionar uma ou mais tags diretamente a um CONTATO, sem precisar de ticket. Informe contactId OU number. Mantém as tags existentes.",
        bodyType: "json",
        bodyExample: JSON.stringify({ contactId: 123, tagId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/removeTagContact", name: "RemoveTagContact",
        description: "Remover uma ou mais tags diretamente de um CONTATO, sem precisar de ticket. Informe contactId OU number.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", tagIds: [1, 2] }, null, 2),
      },
      {
        method: "POST", path: "/sendPresence", name: "SendPresence",
        description: "Enviar estado de presença (digitando, gravando, etc).",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, state: "typing" }, null, 2),
      },
    ],
  },
  {
    name: "Oportunidades",
    emoji: "💼",
    routes: [
      {
        method: "POST", path: "/createOpportunity", name: "CreateOpportunity",
        description: "Criar nova oportunidade vinculada a um contato.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", contactName: "Nome do Contato", email: "contato@email.com", name: "Nome da Oportunidade", value: 10000.00, status: "open", pipelineId: 16, stageId: 7, responsibleId: 1, closingForecast: "2024-12-31", description: "Descrição da oportunidade" }, null, 2),
      },
      {
        method: "POST", path: "/deleteOpportunity", name: "DeleteOpportunity",
        description: "Excluir uma oportunidade pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({ opportunityId: 19 }, null, 2),
      },
      {
        method: "POST", path: "/updateOpportunity", name: "UpdateOpportunity",
        description: "Atualizar dados de uma oportunidade existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ opportunityId: 30, name: "Nome Atualizado", value: 500.00, status: "open", pipelineId: 16, stageId: 7, responsibleId: 1, closingForecast: "2024-12-31", description: "Descrição atualizada" }, null, 2),
      },
    ],
  },
  {
    name: "Usuários",
    emoji: "👥",
    routes: [
      {
        method: "POST", path: "/createUser", name: "CreateUser",
        description: "Criar um novo usuário no sistema.",
        bodyType: "json",
        bodyExample: JSON.stringify({ email: "usuario@example.com", password: "senha123", name: "Nome do Usuário", profile: "user" }, null, 2),
      },
      {
        method: "POST", path: "/updateUser", name: "UpdateUser",
        description: "Atualizar dados de um usuário existente: nome, email, senha, perfil, filas, canais permitidos, permissões de menu, ramal SIP, horário de atendimento e usuário restrito. Só userId é obrigatório; campos ausentes ficam inalterados. Perfil superadmin é recusado com 403.",
        bodyType: "json",
        bodyExample: JSON.stringify({ userId: 1, name: "Nome Atualizado", email: "novoemail@example.com" }, null, 2),
      },
      {
        method: "GET", path: "/listUsers", name: "ListUsers",
        description: "Listar usuários com paginação e busca opcional.",
        params: [
          { key: "pageNumber", desc: "Número da página", required: true, defaultValue: "1" },
          { key: "searchParam", desc: "Busca (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/getUserStatus", name: "GetUserStatus",
        description: "Buscar o status atual de um usuário.",
        params: [{ key: "userId", desc: "ID do usuário", required: true, defaultValue: "1" }],
      },
    ],
  },
  {
    name: "Listagens",
    emoji: "📊",
    routes: [
      { method: "GET", path: "/listChannels", name: "ListChannels", description: "Listar todos os canais de comunicação disponíveis." },
      { method: "GET", path: "/listSessions", name: "ListSessions", description: "Listar todas as sessões WhatsApp do tenant." },
      { method: "GET", path: "/getAllSessionApis", name: "GetAllSessionApis", description: "Listar todas as APIs de sessão configuradas." },
      {
        method: "GET", path: "/listTickets", name: "ListTickets",
        description: "Listar tickets com filtros de status, fila e canal.",
        params: [
          { key: "pageNumber", desc: "Número da página", required: true, defaultValue: "1" },
          { key: "status", desc: "open, pending ou closed — obrigatório (sem ele a rota responde 404)", required: true, defaultValue: "open" },
          { key: "searchParam", desc: "Busca textual (opcional)", required: false },
          { key: "queuesIds", desc: "IDs das filas (opcional). Só é aplicado às filas do usuário vinculado à API; fora delas o filtro é ignorado e a lista volta completa", required: false },
          { key: "whatsappIds", desc: "IDs dos canais (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/listOpportunities", name: "ListOpportunities",
        description: "Listar oportunidades com paginação e filtros.",
        params: [
          { key: "page", desc: "Número da página", required: true, defaultValue: "1" },
          { key: "limit", desc: "Limite por página", required: true, defaultValue: "40" },
          { key: "status", desc: "open, win, lose (opcional)", required: false },
          { key: "pipelineId", desc: "ID do pipeline (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/listContacts", name: "ListContacts",
        description: "Listar contatos com paginação e filtros. Cada contato traz o endereço: cep, logradouro, numeroEndereco, complemento, bairro, cidade e estado.",
        params: [
          { key: "pageNumber", desc: "Número da página", required: true, defaultValue: "1" },
          { key: "searchParam", desc: "Busca textual (opcional)", required: false },
          { key: "walletId", desc: "ID da wallet (opcional)", required: false },
          { key: "tagId", desc: "ID da tag (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/listTags", name: "ListTags",
        description: "Listar tags disponíveis.",
        params: [{ key: "isActive", desc: "true lista só as tags ativas; omitido (ou false) lista todas", required: false, defaultValue: "true" }],
      },
      { method: "GET", path: "/listQueues", name: "ListQueues", description: "Listar todas as filas de atendimento." },
    ],
  },
  {
    name: "Canais e Sessões",
    emoji: "🔌",
    routes: [
      {
        method: "POST", path: "/showChannel", name: "ShowChannelInformation",
        description: "Buscar informações de um canal pelo número.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/showChannelById", name: "ShowChannelInformationById",
        description: "Buscar informações de um canal pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({ id: 43 }, null, 2),
      },
      {
        method: "POST", path: "/listGroupInfo", name: "ListGroupsInfo",
        description: "Listar grupos e participantes da sessão WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ listGroups: true, listParticipants: true }, null, 2),
      },
      {
        method: "POST", path: "/createtSession", name: "CreateSession",
        description: "Criar uma nova sessão/instância WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Minha Instância", status: "DISCONNECTED", type: "baileys" }, null, 2),
      },
      {
        method: "POST", path: "/deleteSession", name: "DeleteSession",
        description: "Excluir uma sessão WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/startSession", name: "StartSession",
        description: "Iniciar/conectar uma sessão WhatsApp.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/qrCodeSession", name: "ShowQrCode",
        description: "Obter o QR Code de uma sessão para conexão.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/requestNewQrCodeSession", name: "RequestNewQrCode",
        description: "Solicitar novo QR Code para uma sessão.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1 }, null, 2),
      },
    ],
  },
  {
    name: "Mensagens Avançadas",
    emoji: "📍",
    routes: [
      {
        method: "POST", path: "/sendLocation", name: "SendLocation",
        description: "Enviar localização geográfica para um contato. O destinatário vem de number; ticketId é opcional e só vincula a mensagem ao ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", latitude: -23.5505, longitude: -46.6333, name: "São Paulo", address: "Av. Paulista, 1000", ticketId: 1262 }, null, 2),
      },
      {
        method: "POST", path: "/sendVcard", name: "SendVcard",
        description: "Enviar contato (vCard). O destinatário vem de number; ticketId é opcional e só vincula a mensagem ao ticket. Dentro de contact, os campos fullName, wuid e phoneNumber são obrigatórios.",
        bodyType: "json",
        bodyExample: JSON.stringify({ number: "5511999999999", contact: { fullName: "Nome Contato", wuid: "5511888888888", phoneNumber: "5511888888888", organization: "Empresa Exemplo", email: "contato@email.com" }, ticketId: 1262 }, null, 2),
      },
      {
        method: "GET", path: "/searchMessages", name: "SearchMessages",
        description: "Buscar mensagens por texto dentro de um ticket.",
        params: [
          { key: "ticketId", desc: "ID do ticket", required: true, defaultValue: "1262" },
          { key: "searchParam", desc: "Texto para busca", required: true, defaultValue: "olá" },
        ],
      },
    ],
  },
  {
    name: "Kanban",
    emoji: "🗂️",
    routes: [
      { method: "GET", path: "/listKanban", name: "ListKanban", description: "Listar todos os kanbans do tenant." },
      {
        method: "POST", path: "/createKanban", name: "CreateKanban",
        description: "Criar um novo kanban. Esta rota não define cor: o kanban nasce sem cor e ela só pode ser ajustada pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Kanban 1", position: 1 }, null, 2),
      },
      {
        method: "POST", path: "/updateKanban/:id", name: "UpdateKanban",
        description: "Atualizar um kanban existente. Esta rota não altera a cor: a cor atual é preservada e só pode ser ajustada pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Kanban Atualizado", position: 2 }, null, 2),
      },
      {
        method: "POST", path: "/deleteKanban/:id", name: "DeleteKanban",
        description: "Excluir um kanban pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Tags CRUD",
    emoji: "🏷️",
    routes: [
      {
        method: "POST", path: "/createTag", name: "CreateTag",
        description: "Criar uma nova tag. O nome da tag vai no campo tag. tag e color são obrigatórios.",
        bodyType: "json",
        bodyExample: JSON.stringify({ tag: "Tag Nova", color: "#FF5733", isActive: true }, null, 2),
      },
      {
        method: "POST", path: "/updateTagData/:id", name: "UpdateTagData",
        description: "Atualizar dados de uma tag existente. O nome da tag vai no campo tag.",
        bodyType: "json",
        bodyExample: JSON.stringify({ tag: "Tag Atualizada", color: "#33A1FF", isActive: true }, null, 2),
      },
      {
        method: "POST", path: "/deleteTag/:id", name: "DeleteTag",
        description: "Excluir uma tag pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Motivos (Reasons)",
    emoji: "📌",
    routes: [
      { method: "GET", path: "/listReasons", name: "ListReasons", description: "Listar motivos de encerramento de atendimento." },
      {
        method: "POST", path: "/createReason", name: "CreateReason",
        description: "Criar um novo motivo de encerramento. Esta rota não define cor: o motivo nasce sem cor e ela só pode ser ajustada pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Resolvido" }, null, 2),
      },
      {
        method: "POST", path: "/updateReason/:id", name: "UpdateReason",
        description: "Atualizar um motivo existente. Esta rota não altera a cor: a cor atual é preservada e só pode ser ajustada pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Resolvido (atualizado)" }, null, 2),
      },
      {
        method: "POST", path: "/deleteReason/:id", name: "DeleteReason",
        description: "Excluir um motivo pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Filas CRUD",
    emoji: "📥",
    routes: [
      {
        method: "POST", path: "/createQueueData", name: "CreateQueueData",
        description: "Criar uma nova fila de atendimento. O nome da fila vai no campo queue, único obrigatório. Cor e responsável não são definidos por esta rota: a fila nasce sem cor e vinculada ao usuário dono do token.",
        bodyType: "json",
        bodyExample: JSON.stringify({ queue: "Fila Suporte", isActive: true, businessHours: [], messageBusinessHours: "Estamos fora do horário de atendimento." }, null, 2),
      },
      {
        method: "POST", path: "/updateQueueData/:id", name: "UpdateQueueData",
        description: "Atualizar uma fila de atendimento existente. O nome da fila vai no campo queue. Atenção: esta rota zera a cor da fila e refaz o vínculo com o usuário dono do token; para preservar a cor, edite pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({ queue: "Fila Suporte Atualizada", isActive: true, businessHours: [], messageBusinessHours: "Estamos fora do horário de atendimento." }, null, 2),
      },
      {
        method: "POST", path: "/deleteQueueData/:id", name: "DeleteQueueData",
        description: "Excluir uma fila de atendimento pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Campanhas",
    emoji: "📢",
    routes: [
      {
        method: "POST", path: "/campaign/create", name: "CampaignCreate",
        description: "Criar uma nova campanha de disparo. Campos obrigatórios: name e sessionId (ou whatsappId). Informe message1/message2/message3 (ou message) — ou, para WABA, templateName + templateLanguage. start e delay têm default (agora e 20s). Esta rota não anexa mídia: a campanha nasce só com texto e o arquivo precisa ser anexado pelo painel.",
        bodyType: "json",
        bodyExample: JSON.stringify({
          name: "Campanha Promo",
          sessionId: 1,
          message1: "Olá {{name}}!",
          message2: "Olá {{name}}, tudo bem?",
          message3: "Oi {{name}}!",
          start: "2026-05-01 10:00",
          delay: 20,
          sendTimeWindowEnabled: false,
          sendTimeStart: null,
          sendTimeEnd: null
        }, null, 2),
      },
      {
        method: "GET", path: "/campaign/list", name: "CampaignList",
        description: "Listar campanhas com paginação. Esta rota não filtra por status.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
        ],
      },
      {
        method: "POST", path: "/campaign/update/:campaignId", name: "CampaignUpdate",
        description: "Atualizar dados de uma campanha. Só é aceito enquanto a campanha estiver em pending, scheduled, paused ou canceled; em processing ou finished a rota responde 404. O texto vai em message1/message2/message3 e a variável é {{name}}. O status não é editável aqui: use start, cancel, pause ou resume.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Campanha Atualizada", message1: "Nova mensagem {{name}}!" }, null, 2),
      },
      {
        method: "POST", path: "/campaign/duplicate/:campaignId", name: "CampaignDuplicate",
        description: "Duplicar uma campanha existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/start/:campaignId", name: "CampaignStart",
        description: "Iniciar o disparo de uma campanha.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/cancel/:campaignId", name: "CampaignCancel",
        description: "Cancelar uma campanha em andamento.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/pause/:campaignId", name: "CampaignPause",
        description: "Pausar uma campanha em andamento.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/resume/:campaignId", name: "CampaignResume",
        description: "Retomar uma campanha pausada.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/skip/:campaignId", name: "CampaignSkip",
        description: "Pular para o próximo contato da campanha.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "GET", path: "/campaign/report/:campaignId", name: "CampaignReport",
        description: "Obter relatório de envios de uma campanha.",
      },
      {
        method: "POST", path: "/campaign/delete/:campaignId", name: "CampaignDelete",
        description: "Excluir uma campanha.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "GET", path: "/campaign/contacts/:campaignId", name: "CampaignContactsList",
        description: "Listar contatos de uma campanha.",
      },
      {
        method: "POST", path: "/campaign/contacts/add/:campaignId", name: "CampaignContactsAdd",
        description: "Adicionar contatos a uma campanha. Aceita 3 formatos: (1) array de IDs [{ id }], (2) array com number/name (cria ou reusa o contato), (3) objeto { contactsIds: [1,2,3] }.",
        bodyType: "json",
        bodyExample: JSON.stringify([
          { name: "Contato 1", number: "5511999990001" },
          { id: 42 }
        ], null, 2),
      },
      {
        method: "POST", path: "/campaign/contacts/remove/:campaignId/:contactId", name: "CampaignContactsRemove",
        description: "Remover um contato de uma campanha.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/campaign/contacts/removeAll/:campaignId", name: "CampaignContactsRemoveAll",
        description: "Remover todos os contatos de uma campanha.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Envio em Lote",
    emoji: "🚀",
    routes: [
      {
        method: "POST", path: "/bulkFastMessage", name: "BulkFastMessage",
        description: "Disparo rápido para lista de números sem criar tickets. Só funciona em canais whatsapp, baileys e zapo, e whatsappType é obrigatório.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  whatsappId   → ID da sessão\n  whatsappType → whatsapp, baileys ou zapo (obrigatório)\n  arrayNumbers → 5511999999999,5511888888888 (lista separada por vírgula)\n  groups       → false\n  message      → Texto da mensagem\n  min          → 3 (intervalo mínimo em segundos)\n  max          → 8 (intervalo máximo em segundos)\n  media        → arquivo (opcional)\n  mediaLocal   → true (obrigatório ao enviar o arquivo)",
      },
      {
        method: "POST", path: "/bulkSendMessage", name: "BulkSendMessage",
        description: "Disparo em lote criando tickets para cada contato. whatsappType é obrigatório.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  whatsappId   → ID da sessão\n  whatsappType → whatsapp, baileys, zapo, meow, evo, evogo, zapi ou uazapi (obrigatório)\n  arrayNumbers → 5511999999999,5511888888888 (lista separada por vírgula)\n  groups       → false\n  message      → Texto da mensagem\n  min          → 3 (intervalo mínimo em segundos)\n  max          → 8 (intervalo máximo em segundos)\n  media        → arquivo (opcional; por URL use media=true + mediaUrl)\n  mediaLocal   → true (obrigatório ao enviar o arquivo)",
      },
      {
        method: "POST", path: "/bulkSendMessageWithVariable", name: "BulkSendMessageWithVariable",
        description: "Disparo com registro de lote, um destinatário por chamada. A substituição das variáveis é feita pelo integrador: o texto enviado em message sai literalmente como está.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  whatsappId     → ID da sessão\n  whatsappType   → whatsapp, baileys, zapo, meow, evo, evogo, zapi ou uazapi (obrigatório)\n  number         → 5511999999999\n  message        → Olá João, seu pedido chegou (já interpolado)\n  min            → 3 (intervalo mínimo em segundos)\n  max            → 8 (intervalo máximo em segundos)\n  dataInput      → linhas do lote (opcional; só dimensiona o relatório)\n  bulkDispatchId → id devolvido na 1ª chamada (opcional; agrupa o relatório)",
      },
      {
        method: "POST", path: "/bulkIndividual", name: "BulkIndividual",
        description: "Disparo individual de mensagem a um único número. whatsappType é obrigatório.",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  whatsappId   → ID da sessão\n  whatsappType → whatsapp, baileys, zapo, meow, evo, evogo, zapi, uazapi, waba, gupshup ou dialog360 (obrigatório)\n  number       → 5511999999999\n  message      → Texto da mensagem\n  media        → arquivo (opcional)\n  mediaLocal   → true (obrigatório ao enviar o arquivo; whatsapp, baileys e zapo)",
      },
      {
        method: "GET", path: "/bulkDispatch/list", name: "BulkDispatchList",
        description: "Listar registros de disparos em lote. Disparos de SMS em massa (dispatchType \"sms\") não têm canal (whatsapp null) e vêm sem a lista de números (metadata.contacts); o detalhe traz a lista.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
          { key: "status", desc: "pending, processing, completed, failed ou cancelled (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/bulkDispatch/show/:id", name: "BulkDispatchShow",
        description: "Buscar detalhes de um disparo em lote pelo ID.",
      },
      {
        method: "POST", path: "/bulkDispatch/update/:id", name: "BulkDispatchUpdate",
        description: "Atualizar status de um disparo em lote. Disparos de SMS em massa (dispatchType \"sms\") são controlados pelo servidor e respondem 400 ERR_SMS_BULK_READONLY por aqui.",
        bodyType: "json",
        bodyExample: JSON.stringify({ status: "cancelled", cancellationReason: "Motivo do cancelamento" }, null, 2),
      },
      {
        method: "POST", path: "/bulkDispatch/incrementProgress/:id", name: "BulkDispatchIncrementProgress",
        description: "Incrementar o progresso de um disparo em lote. Disparos de SMS em massa (dispatchType \"sms\") são controlados pelo servidor e respondem 400 ERR_SMS_BULK_READONLY.",
        bodyType: "json",
        bodyExample: JSON.stringify({ success: true, error: null }, null, 2),
      },
    ],
  },
  {
    name: "Gerenciamento de Grupos",
    emoji: "👥",
    routes: [
      {
        method: "POST", path: "/group/list", name: "GroupList",
        description: "Listar grupos do WhatsApp da sessão.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1 }, null, 2),
      },
      {
        method: "POST", path: "/group/showById", name: "GroupShowById",
        description: "Buscar informações de um grupo pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupId: "12345678901@g.us" }, null, 2),
      },
      {
        method: "POST", path: "/group/create", name: "GroupCreate",
        description: "Criar um ou mais grupos no WhatsApp. titles aceita texto ou lista e cria um grupo por título; number é o participante inicial (um só). A resposta traz apenas o status por título, sem o ID do grupo: para obter o ID, chame /group/list logo depois e localize o grupo pelo nome.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, titles: ["Grupo de Suporte"], number: "5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/group/listParticipants", name: "GroupListParticipants",
        description: "Listar participantes de um ou mais grupos.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"] }, null, 2),
      },
      {
        method: "POST", path: "/group/addParticipant", name: "GroupAddParticipant",
        description: "Adicionar participante(s) a um ou mais grupos. Em geral exige que o número conectado seja administrador (a não ser que o grupo permita que qualquer membro adicione). A resposta traz um item por grupo: { groupId, status, message?, reason?, providerStatus?, participants? }. Nos canais por QR Code (Baileys e Zapo), participants traz cada número: { participant, jid, status (success, error ou unknown), code, reason }; reason do número: invite_required (a pessoa só entra por convite), already_in_group, not_allowed, not_on_whatsapp ou rejected. Se todos os números forem recusados, o grupo vem com status error, message ERR_GROUP_PARTICIPANTS_REJECTED e reason participants_rejected. Nas demais falhas, reason do grupo: session_not_connected, not_admin, group_not_found, timeout, invalid_request (por exemplo participants vazio, com message ERR_GROUP_PARTICIPANTS_REQUIRED), provider_error (com providerStatus, o status HTTP do provedor) ou unknown.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], participants: ["5511777777777"] }, null, 2),
      },
      {
        method: "POST", path: "/group/removeParticipant", name: "GroupRemoveParticipant",
        description: "Remover participante(s) de um ou mais grupos. Requer que o número conectado seja administrador do grupo. A resposta traz um item por grupo: { groupId, status, message?, reason?, providerStatus?, participants? }. Nos canais por QR Code (Baileys e Zapo), participants traz cada número: { participant, jid, status (success, error ou unknown), code, reason }; reason do número: not_in_group (o número não está no grupo) ou rejected. Se todos os números forem recusados, o grupo vem com status error, message ERR_GROUP_PARTICIPANTS_REJECTED e reason participants_rejected. Nas demais falhas, reason do grupo: session_not_connected, not_admin, group_not_found, timeout, invalid_request (por exemplo participants vazio, com message ERR_GROUP_PARTICIPANTS_REQUIRED), provider_error (com providerStatus, o status HTTP do provedor) ou unknown.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], participants: ["5511777777777"] }, null, 2),
      },
      {
        method: "POST", path: "/group/promote", name: "GroupPromote",
        description: "Promover participante(s) a administrador do grupo. Requer que o número conectado seja administrador do grupo. A resposta traz um item por grupo: { groupId, status, message?, reason?, providerStatus?, participants? }. Nos canais por QR Code (Baileys e Zapo), participants traz cada número: { participant, jid, status (success, error ou unknown), code, reason }; reason do número: not_in_group (o número não está no grupo) ou rejected. Se todos os números forem recusados, o grupo vem com status error, message ERR_GROUP_PARTICIPANTS_REJECTED e reason participants_rejected. Nas demais falhas, reason do grupo: session_not_connected, not_admin, group_not_found, timeout, invalid_request (por exemplo participants vazio, com message ERR_GROUP_PARTICIPANTS_REQUIRED), provider_error (com providerStatus, o status HTTP do provedor) ou unknown.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], participants: ["5511777777777"] }, null, 2),
      },
      {
        method: "POST", path: "/group/demote", name: "GroupDemote",
        description: "Rebaixar administrador(es) a participante comum. Requer que o número conectado seja administrador do grupo. A resposta traz um item por grupo: { groupId, status, message?, reason?, providerStatus?, participants? }. Nos canais por QR Code (Baileys e Zapo), participants traz cada número: { participant, jid, status (success, error ou unknown), code, reason }; reason do número: not_in_group (o número não está no grupo) ou rejected. Se todos os números forem recusados, o grupo vem com status error, message ERR_GROUP_PARTICIPANTS_REJECTED e reason participants_rejected. Nas demais falhas, reason do grupo: session_not_connected, not_admin, group_not_found, timeout, invalid_request (por exemplo participants vazio, com message ERR_GROUP_PARTICIPANTS_REQUIRED), provider_error (com providerStatus, o status HTTP do provedor) ou unknown.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], participants: ["5511777777777"] }, null, 2),
      },
      {
        method: "POST", path: "/group/changeTitle", name: "GroupChangeTitle",
        description: "Alterar o nome/título de um grupo.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], title: "Novo Nome do Grupo" }, null, 2),
      },
      {
        method: "POST", path: "/group/changeDescription", name: "GroupChangeDescription",
        description: "Alterar a descrição de um grupo.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], description: "Nova descrição do grupo" }, null, 2),
      },
      {
        method: "POST", path: "/group/setAdminsOnly", name: "GroupSetAdminsOnly",
        description: "Configurar se apenas admins podem enviar mensagens.",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupIds: ["12345678901@g.us"], adminsOnly: true }, null, 2),
      },
      {
        method: "POST", path: "/group/getInviteLink", name: "GroupGetInviteLink",
        description: "Obter o link de convite de um grupo. Requer que o número conectado seja administrador do grupo. Disponível nos canais por QR Code (Baileys e Zapo); em outros canais responde com inviteCode nulo. Resposta: { groupId, inviteCode, inviteLink } e, quando não houver código, um campo adicional reason (not_admin, group_not_found, timeout, channel_not_supported ou unknown).",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupId: "12345678901@g.us" }, null, 2),
      },
      {
        method: "POST", path: "/group/revokeInviteLink", name: "GroupRevokeInviteLink",
        description: "Revogar o link de convite atual do grupo e gerar um novo. Requer que o número conectado seja administrador. O link anterior deixa de funcionar imediatamente. Disponível nos canais por QR Code (Baileys e Zapo).",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupId: "12345678901@g.us" }, null, 2),
      },
      {
        method: "POST", path: "/group/changePicture", name: "GroupChangePicture",
        description: "Alterar a foto de perfil de um grupo (multipart/form-data).",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  picture    → arquivo de imagem (tipo: file)\n  whatsappId → ID da sessão\n  groupIds   → ID(s) do grupo, separados por vírgula (12345678901@g.us,98765432109@g.us)",
      },
      {
        method: "POST", path: "/group/leave", name: "GroupLeave",
        description: "Sair de um grupo (somente canal WABA oficial — outros tipos retornam ERR_LEAVE_GROUP_WABA_ONLY).",
        bodyType: "json",
        bodyExample: JSON.stringify({ whatsappId: 1, groupId: "12345678901@g.us" }, null, 2),
      },
    ],
  },
  {
    name: "Agendamentos",
    emoji: "📅",
    routes: [
      {
        method: "POST", path: "/appointment/create", name: "AppointmentCreate",
        description: "Criar um novo agendamento. A data vai em startAt (obrigatória). Esta rota não define responsável: o agendamento nasce sem atendente vinculado.",
        bodyType: "json",
        bodyExample: JSON.stringify({ title: "Reunião", description: "Alinhamento de projeto", contactId: 1, contactName: "João Silva", contactPhone: "5511999999999", whatsappId: 1, startAt: "2025-01-15T14:30:00", endAt: "2025-01-15T15:30:00", status: "pending", notes: "Detalhes do agendamento" }, null, 2),
      },
      {
        method: "GET", path: "/appointment/list", name: "AppointmentList",
        description: "Listar agendamentos com filtros.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
          { key: "status", desc: "pending, confirmed, cancelled ou completed (opcional)", required: false },
          { key: "startFrom", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "startTo", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "search", desc: "Busca no título e no nome do contato (opcional)", required: false },
        ],
      },
      {
        method: "GET", path: "/appointment/show/:id", name: "AppointmentShow",
        description: "Buscar detalhes de um agendamento pelo ID.",
      },
      {
        method: "POST", path: "/appointment/update/:id", name: "AppointmentUpdate",
        description: "Atualizar um agendamento existente. Para remarcar, use startAt (e endAt): campo com outro nome é descartado sem erro.",
        bodyType: "json",
        bodyExample: JSON.stringify({ startAt: "2025-01-16T10:00:00", endAt: "2025-01-16T11:00:00", title: "Reunião Atualizada", status: "confirmed", notes: "Novos detalhes" }, null, 2),
      },
      {
        method: "POST", path: "/appointment/delete/:id", name: "AppointmentDelete",
        description: "Excluir um agendamento.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/scheduleReminder/create", name: "ScheduleReminderCreate",
        description: "Criar um lembrete automático para agendamentos. O lembrete não tem data própria: ele dispara hoursBeforeEvent horas antes de cada agendamento. hoursBeforeEvent e messageType (message ou waba_template) são obrigatórios.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Lembrete de consulta", description: "Aviso enviado antes do agendamento", hoursBeforeEvent: 24, messageType: "message", messageContent: "Lembrete: sua consulta é amanhã!", whatsappId: 1, active: true }, null, 2),
      },
      {
        method: "GET", path: "/scheduleReminder/list", name: "ScheduleReminderList",
        description: "Listar lembretes agendados. Devolve todos os lembretes do tenant, do mais recente para o mais antigo. Sem paginação e sem filtros.",
      },
      {
        method: "POST", path: "/scheduleReminder/update/:id", name: "ScheduleReminderUpdate",
        description: "Atualizar um lembrete agendado. Campos aceitos: name, description, hoursBeforeEvent, messageType, messageContent, whatsappId e active. Campo com outro nome é descartado sem erro.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Lembrete de consulta", hoursBeforeEvent: 12, messageType: "message", messageContent: "Mensagem atualizada", whatsappId: 1, active: true }, null, 2),
      },
      {
        method: "POST", path: "/scheduleReminder/delete/:id", name: "ScheduleReminderDelete",
        description: "Excluir um lembrete agendado.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/scheduleReminder/toggle/:id", name: "ScheduleReminderToggle",
        description: "Alternar o estado de um lembrete: a cada chamada ele inverte entre ativo e inativo. Não recebe corpo e não é idempotente, então repetir a chamada volta ao estado anterior.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Dashboard",
    emoji: "📊",
    routes: [
      {
        method: "GET", path: "/dash/ticketsAndTimes", name: "DashTicketsAndTimes",
        description: "Estatísticas gerais do período: quantidade de atendimentos, demanda ativa e receptiva, tempos médios e novos contatos. Por padrão considera apenas atendimentos individuais.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsChannels", name: "DashTicketsChannels",
        description: "Tickets agrupados por canal de comunicação.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsEvolution", name: "DashTicketsEvolution",
        description: "Evolução diária/mensal do volume de tickets.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsEvolutionByValue", name: "DashTicketsEvolutionByValue",
        description: "Evolução de tickets por valor (CRM).",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsEvolutionChannelsName", name: "DashTicketsEvolutionChannelsName",
        description: "Evolução de tickets por nome de canal.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsPerUser", name: "DashTicketsPerUser",
        description: "Tickets atribuídos por usuário/atendente.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsUser", name: "DashTicketsUser",
        description: "Resumo de tickets por usuário com métricas.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsQueue", name: "DashTicketsQueue",
        description: "Tickets agrupados por fila de atendimento.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsStatus", name: "DashTicketsStatus",
        description: "Tickets agrupados por status (aberto, pendente, encerrado).",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
      {
        method: "GET", path: "/dash/ticketsReasons", name: "DashTicketsReasons",
        description: "Tickets agrupados por motivo de encerramento.",
        params: [
          { key: "startDate", desc: "Data inicial (YYYY-MM-DD)", required: false },
          { key: "endDate", desc: "Data final (YYYY-MM-DD)", required: false },
          { key: "isGroup", desc: "true traz somente grupos; ausente ou false traz somente atendimentos individuais (não há valor que some os dois)", required: false, defaultValue: "false" },
        ],
      },
    ],
  },
  {
    name: "CRM Pipeline",
    emoji: "🔁",
    routes: [
      {
        method: "POST", path: "/pipeline/create", name: "PipelineCreate",
        description: "Criar um novo pipeline de CRM. O pipeline só tem nome: não existe campo de descrição.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Pipeline de Vendas" }, null, 2),
      },
      {
        method: "GET", path: "/pipeline/list", name: "PipelineList",
        description: "Listar os pipelines do tenant, com paginação.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
        ],
      },
      { method: "GET", path: "/pipeline/show/:id", name: "PipelineShow", description: "Buscar detalhes de um pipeline pelo ID." },
      {
        method: "POST", path: "/pipeline/update/:id", name: "PipelineUpdate",
        description: "Atualizar um pipeline existente. O pipeline só tem nome: não existe campo de descrição.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Pipeline Atualizado" }, null, 2),
      },
      {
        method: "POST", path: "/pipeline/delete/:id", name: "PipelineDelete",
        description: "Excluir um pipeline. Só é aceito quando o pipeline não tem nenhuma etapa, oportunidade ou ação vinculada; caso contrário a rota responde 500. Apague as etapas e oportunidades antes.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "POST", path: "/stage/create", name: "StageCreate",
        description: "Criar uma etapa (stage) em um pipeline.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Prospecção", pipelineId: 1, order: 1, color: "#4A90E2" }, null, 2),
      },
      { method: "GET", path: "/stage/list", name: "StageList", description: "Listar etapas de um pipeline.", params: [{ key: "pipelineId", desc: "ID do pipeline", required: true, defaultValue: "1" }] },
      { method: "GET", path: "/stage/show/:id", name: "StageShow", description: "Buscar detalhes de uma etapa pelo ID." },
      {
        method: "POST", path: "/stage/update/:id", name: "StageUpdate",
        description: "Atualizar uma etapa existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Negociação", order: 2, color: "#E24A4A" }, null, 2),
      },
      {
        method: "POST", path: "/stage/delete/:id", name: "StageDelete",
        description: "Excluir uma etapa de pipeline. Só é aceito quando a etapa não tem oportunidade nem ação apontando para ela; caso contrário a rota responde 500. Mova as oportunidades antes.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Tickets Avançados",
    emoji: "🎟️",
    routes: [
      {
        method: "POST", path: "/showTicketById", name: "ShowTicketById",
        description: "Buscar dados completos de um ticket pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262 }, null, 2),
      },
      {
        method: "POST", path: "/ticket/pause/start/:ticketId", name: "StartTicketPause",
        description: "Iniciar pausa em um ticket (para controle de SLA).",
        bodyType: "json",
        bodyExample: JSON.stringify({ pauseReason: "Aguardando retorno do cliente" }, null, 2),
      },
      {
        method: "POST", path: "/ticket/pause/end/:ticketId", name: "EndTicketPause",
        description: "Encerrar pausa de um ticket.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "GET", path: "/ticket/pause/logs/:ticketId", name: "ListTicketPauseLogs",
        description: "Listar histórico de pausas de um ticket.",
      },
      {
        method: "GET", path: "/listTicketEvaluations", name: "ListTicketEvaluations",
        description: "Listar avaliações de atendimento.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
          { key: "search", desc: "Busca textual (opcional)", required: false },
          { key: "startDate", desc: "Data inicial (opcional)", required: false },
          { key: "endDate", desc: "Data final (opcional)", required: false },
          { key: "evaluation", desc: "Filtrar por nota (opcional)", required: false },
        ],
      },
      {
        method: "POST", path: "/sendEvaluation", name: "SendEvaluation",
        description: "Enviar a pesquisa de satisfação para um atendimento e registrar a avaliação pendente (a nota do cliente é capturada automaticamente). Informe ticketId OU number (usa o ticket aberto do contato). Respeita o modo configurado (escala nativa ou link externo). Recusa grupos e canais sem suporte; retorna 409 se já houver avaliação pendente do contato (use force para reenviar).",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, body: "", externalKey: "", force: false }, null, 2),
      },
      {
        method: "POST", path: "/ticket/share", name: "TicketShareCreate",
        description: "Compartilhar um ticket com outros usuários. Os usuários que ganham acesso vão em userIdArray. Um ticket só aceita um convite de compartilhamento: repetir a chamada responde 400.",
        bodyType: "json",
        bodyExample: JSON.stringify({ ticketId: 1262, userIdArray: [2], inviteUrl: "" }, null, 2),
      },
      {
        method: "GET", path: "/ticket/share/:ticketId", name: "TicketShareShow",
        description: "Buscar compartilhamentos de um ticket.",
      },
    ],
  },
  {
    name: "To-Do List",
    emoji: "✅",
    routes: [
      {
        method: "POST", path: "/todo/create", name: "TodoCreate",
        description: "Criar uma nova tarefa no to-do list.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Ligar para o cliente", description: "Retornar sobre a proposta enviada", limitDate: "2026-06-15", owner: "João Silva", ownerId: 1, status: "pending", priority: "high", comments: "Cliente pediu retorno pela manhã" }, null, 2),
      },
      {
        method: "GET", path: "/todo/list", name: "TodoList",
        description: "Listar todas as tarefas do to-do list do tenant (mais recentes primeiro). Não aceita filtros — retorna todas.",
      },
      {
        method: "POST", path: "/todo/update/:id", name: "TodoUpdate",
        description: "Atualizar uma tarefa existente.",
        bodyType: "json",
        bodyExample: JSON.stringify({ name: "Tarefa atualizada", status: "finished", priority: "medium" }, null, 2),
      },
      {
        method: "POST", path: "/todo/delete/:id", name: "TodoDelete",
        description: "Excluir uma tarefa.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
      {
        method: "GET", path: "/todo/logs/:userId", name: "TodoLogs",
        description: "Buscar histórico de tarefas de um usuário.",
      },
    ],
  },
  {
    name: "Galeria",
    emoji: "🖼️",
    routes: [
      {
        method: "GET", path: "/gallery/list", name: "GalleryList",
        description: "Listar arquivos da galeria do tenant, com paginação fixa de 20 itens por página.",
        params: [
          { key: "pageNumber", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "searchParam", desc: "Busca por nome do arquivo ou descrição (opcional)", required: false },
          { key: "fileType", desc: "image, pdf, video, audio, document, archive ou other — aceita lista separada por vírgula (opcional)", required: false },
        ],
      },
      {
        method: "POST", path: "/gallery/upload", name: "GalleryUpload",
        description: "Fazer upload de arquivo(s) para a galeria (máx. 10 arquivos, 500MB).",
        bodyType: "formdata",
        bodyExample: "Campos (form-data):\n  files → arquivo(s) (tipo: file, até 10 arquivos)",
      },
      {
        method: "POST", path: "/gallery/delete/:id", name: "GalleryDelete",
        description: "Excluir um arquivo da galeria pelo ID.",
        bodyType: "json",
        bodyExample: JSON.stringify({}, null, 2),
      },
    ],
  },
  {
    name: "Listagens Utilitárias",
    emoji: "🔍",
    routes: [
      { method: "GET", path: "/listFastReplies", name: "ListFastReplies", description: "Listar respostas rápidas configuradas." },
      { method: "GET", path: "/listAutoReplies", name: "ListAutoReplies", description: "Listar respostas automáticas configuradas." },
      { method: "GET", path: "/listChatFlows", name: "ListChatFlows", description: "Listar fluxos de chatbot configurados." },
    ],
  },
  {
    name: "WaVoIP e Chamadas",
    emoji: "📞",
    routes: [
      {
        method: "GET", path: "/wavoip/calls", name: "WavoipCallList",
        description: "Listar chamadas WaVoIP do tenant.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
          { key: "startDate", desc: "Data inicial (opcional)", required: false },
          { key: "endDate", desc: "Data final (opcional)", required: false },
          { key: "phone", desc: "Filtrar por telefone (opcional)", required: false },
          { key: "direction", desc: "Sentido da chamada (opcional)", required: false },
          { key: "callStatus", desc: "Situação da chamada (opcional)", required: false },
          { key: "userId", desc: "Filtrar por usuário (opcional)", required: false },
          { key: "ticketId", desc: "Filtrar por atendimento (opcional)", required: false },
          { key: "queueId", desc: "Filtrar por fila (opcional)", required: false },
          { key: "contactId", desc: "Filtrar por contato (opcional)", required: false },
        ],
      },
      { method: "GET", path: "/wavoip/calls/:id", name: "WavoipCallShow", description: "Buscar detalhes de uma chamada WaVoIP pelo ID." },
      {
        method: "GET", path: "/callLog/list", name: "CallLogList",
        description: "Listar logs de chamadas do sistema. Esta rota não filtra por período: para recorte por data use /wavoip/calls.",
        params: [
          { key: "page", desc: "Número da página", required: false, defaultValue: "1" },
          { key: "limit", desc: "Itens por página", required: false, defaultValue: "20" },
          { key: "orderBy", desc: "Campo de ordenação (padrão createdAt)", required: false },
          { key: "orderDirection", desc: "ASC ou DESC (padrão DESC)", required: false },
        ],
      },
      { method: "GET", path: "/callLog/show/:id", name: "CallLogShow", description: "Buscar detalhes de um log de chamada pelo ID." },
    ],
  },
  {
    name: "Interativo Não Oficial",
    emoji: "⚡",
    channelTypes: ["baileys"],
    routes: [
      {
        method: "POST", path: "/sendInteractive/baileys/quickReply", name: "BaileysQuickReply",
        description: "Enviar botões de resposta rápida (Quick Reply) via Baileys. Exige canal do tipo baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Escolha uma opção:" }, footer: { text: "Rodapé opcional" }, buttons: [{ display_text: "Opção 1", id: "op1" }, { display_text: "Opção 2", id: "op2" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/baileys/singleSelect", name: "BaileysSingleSelect",
        description: "Enviar lista de seleção única com seções e itens via Baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Escolha uma opção:" }, footer: { text: "Rodapé opcional" }, list: { title: "Ver opções", sections: [{ title: "Seção 1", rows: [{ id: "1", title: "Item 1", description: "Descrição" }, { id: "2", title: "Item 2" }] }] } }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/baileys/pixButton", name: "BaileysPixButton",
        description: "Enviar botão PIX com chave copia-e-cola via Baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, pixType: "EVP", pixKey: "chave-aleatoria-uuid", pixName: "Nome Beneficiário", bodyText: "Pague com PIX:" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/baileys/ctaCopy", name: "BaileysCtaCopy",
        description: "Enviar botão CTA de copiar código (ex: cupom, código de rastreio) via Baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Copie seu código de rastreio:" }, footer: { text: "Válido por 24h" }, displayText: "Copiar código", copyCode: "BR123456789" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/baileys/ctaUrl", name: "BaileysCtaUrl",
        description: "Enviar botão CTA de abrir URL via Baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Acesse nosso site:" }, footer: { text: "Clique para visitar" }, displayText: "Visitar site", url: "https://exemplo.com" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/baileys/ctaCall", name: "BaileysCtaCall",
        description: "Enviar botão CTA de ligar (link tel:) via Baileys.",
        bodyType: "json",
        channelTypes: ["baileys"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Precisa de ajuda?" }, footer: { text: "Ligue para nós" }, displayText: "Ligar agora", phoneNumber: "+5511999999999" }, null, 2),
      },
    ],
  },
  {
    name: "Interativo Zapo",
    emoji: "🔘",
    channelTypes: ["zapo"],
    routes: [
      {
        method: "POST", path: "/sendInteractive/zapo/quickReply", name: "ZapoQuickReply",
        description: "Enviar botões de resposta rápida (Quick Reply) via Zapo (até 3 botões). Exige canal do tipo zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Escolha uma opção:" }, footer: { text: "Rodapé opcional" }, buttons: [{ display_text: "Opção 1", id: "op1" }, { display_text: "Opção 2", id: "op2" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/singleSelect", name: "ZapoSingleSelect",
        description: "Enviar lista de seleção única com seções e itens via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Escolha uma opção:" }, footer: { text: "Rodapé opcional" }, list: { title: "Ver opções", sections: [{ title: "Seção 1", rows: [{ id: "1", title: "Item 1", description: "Descrição" }, { id: "2", title: "Item 2" }] }] } }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/pixButton", name: "ZapoPixButton",
        description: "Enviar botão PIX com chave copia-e-cola via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, pixType: "EVP", pixKey: "chave-aleatoria-uuid", pixName: "Nome Beneficiário", bodyText: "Pague com PIX:" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/ctaCopy", name: "ZapoCtaCopy",
        description: "Enviar botão CTA de copiar código (ex: cupom, código de rastreio) via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Copie seu código de rastreio:" }, footer: { text: "Válido por 24h" }, displayText: "Copiar código", copyCode: "BR123456789" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/ctaUrl", name: "ZapoCtaUrl",
        description: "Enviar botão CTA de abrir URL via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Acesse nosso site:" }, footer: { text: "Clique para visitar" }, displayText: "Visitar site", url: "https://exemplo.com" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/ctaCall", name: "ZapoCtaCall",
        description: "Enviar botão CTA de ligar (link tel:) via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, body: { text: "Precisa de ajuda?" }, footer: { text: "Ligue para nós" }, displayText: "Ligar agora", phoneNumber: "+5511999999999" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/zapo/poll", name: "ZapoPoll",
        description: "Enviar enquete com múltiplas opções via Zapo.",
        bodyType: "json",
        channelTypes: ["zapo"],
        bodyExample: JSON.stringify({ ticketId: 1262, name: "Qual sua preferência?", options: ["Opção A", "Opção B", "Opção C"], selectableCount: 1 }, null, 2),
      },
    ],
  },
  {
    name: "Interativo UazAPI",
    emoji: "🎛️",
    channelTypes: ["uazapi"],
    routes: [
      {
        method: "POST", path: "/sendInteractive/uazapi/button", name: "UazapiButton",
        description: "Enviar botões de resposta rápida via UazAPI (até 3 opções). Exige canal do tipo uazapi.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, text: "Escolha uma opção:", choices: ["Opção 1", "Opção 2", "Opção 3"], footerText: "Rodapé opcional", imageButton: "https://exemplo.com/img.png" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/list", name: "UazapiList",
        description: "Enviar lista de opções com botão de abertura via UazAPI. Exige canal do tipo uazapi.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, text: "Escolha uma opção:", choices: ["Item 1", "Item 2", "Item 3", "Item 4"], listButton: "Ver opções", footerText: "Selecione uma opção" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/poll", name: "UazapiPoll",
        description: "Enviar enquete com múltiplas opções via UazAPI. Exige canal do tipo uazapi.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, text: "Qual sua preferência?", choices: ["Opção A", "Opção B", "Opção C"], selectableCount: 1 }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/carousel", name: "UazapiCarousel",
        description: "Enviar carrossel de cards com botões via UazAPI.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, text: "Confira nossas opções:", carousel: [{ text: "Produto A", image: "https://exemplo.com/a.png", buttons: [{ text: "Ver detalhes", type: "REPLY" }] }, { text: "Produto B", image: "https://exemplo.com/b.png", buttons: [{ text: "Comprar", type: "URL" }] }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/pixButton", name: "UazapiPixButton",
        description: "Enviar botão PIX nativo via UazAPI.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, pixType: "EVP", pixKey: "chave-aleatoria-uuid", pixName: "Nome Beneficiário" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/locationButton", name: "UazapiLocationButton",
        description: "Enviar botão de compartilhar localização via UazAPI.",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, text: "Por favor, compartilhe sua localização:" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/uazapi/requestPayment", name: "UazapiRequestPayment",
        description: "Enviar cobrança interativa via UazAPI. Obrigatórios: ticketId e amount. Opcionais: PIX (pixType, pixKey, pixName), boleto (boletoCode), link de pagamento (paymentLink) e anexo (fileUrl, fileName).",
        bodyType: "json",
        channelTypes: ["uazapi"],
        bodyExample: JSON.stringify({ ticketId: 1262, amount: 150.00, title: "Pedido #001", text: "Sua cobrança está pronta:", footer: "Vencimento em 3 dias", itemName: "Produto X", invoiceNumber: "NF-001", pixType: "EVP", pixKey: "chave-aleatoria-uuid", pixName: "Nome Beneficiário", paymentLink: "https://pagamento.exemplo.com/001", boletoCode: "34191790010104351004791020150008291070026000", fileUrl: "https://exemplo.com/boleto.pdf", fileName: "boleto.pdf" }, null, 2),
      },
    ],
  },
  {
    name: "Interativo Instagram",
    emoji: "📷",
    channelTypes: ["instagram"],
    routes: [
      {
        method: "POST", path: "/sendInteractive/instagram/quickReply", name: "InstagramQuickReply",
        description: "Enviar Quick Reply via Instagram DM. Suporta texto e tipo user_phone_number.",
        bodyType: "json",
        channelTypes: ["instagram"],
        bodyExample: JSON.stringify({ ticketId: 1262, message: "Escolha uma opção:", quickReplies: [{ content_type: "text", title: "Sim", payload: "YES" }, { content_type: "text", title: "Não", payload: "NO" }, { content_type: "user_phone_number" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/instagram/buttonTemplate", name: "InstagramButtonTemplate",
        description: "Enviar Button Template via Instagram DM (até 3 botões postback/web_url).",
        bodyType: "json",
        channelTypes: ["instagram"],
        bodyExample: JSON.stringify({ ticketId: 1262, message: "Selecione uma ação:", buttons: [{ type: "postback", title: "Comprar", payload: "BUY" }, { type: "web_url", title: "Visitar site", url: "https://exemplo.com" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/instagram/genericTemplate", name: "InstagramGenericTemplate",
        description: "Enviar Generic Template (carrossel de cards com imagem, título e botões) via Instagram DM.",
        bodyType: "json",
        channelTypes: ["instagram"],
        bodyExample: JSON.stringify({ ticketId: 1262, elements: [{ title: "Produto 1", subtitle: "Descrição", image_url: "https://exemplo.com/img.jpg", buttons: [{ type: "postback", title: "Ver", payload: "PROD_1" }] }] }, null, 2),
      },
      {
        method: "POST", path: "/instagram/iceBreakers", name: "InstagramIceBreakers",
        description: "Gerenciar Ice Breakers do Instagram (perguntas iniciais). action: get | set | delete.",
        bodyType: "json",
        channelTypes: ["instagram"],
        bodyExample: JSON.stringify({ action: "set", iceBreakers: [{ question: "Qual o horário?", payload: "HOURS" }, { question: "Vocês fazem entrega?", payload: "DELIVERY" }] }, null, 2),
      },
      {
        method: "POST", path: "/instagram/persistentMenu", name: "InstagramPersistentMenu",
        description: "Gerenciar Persistent Menu do Instagram. action: get | set | delete.",
        bodyType: "json",
        channelTypes: ["instagram"],
        bodyExample: JSON.stringify({ action: "set", composerInputDisabled: false, menuItems: [{ type: "postback", title: "Menu", payload: "MAIN_MENU" }, { type: "web_url", title: "Site", url: "https://exemplo.com" }] }, null, 2),
      },
    ],
  },
  {
    name: "Interativo Messenger",
    emoji: "💬",
    channelTypes: ["messenger"],
    routes: [
      {
        method: "POST", path: "/sendInteractive/messenger/quickReply", name: "MessengerQuickReply",
        description: "Enviar Quick Reply via Messenger. Suporta texto e tipo user_phone_number.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, message: "Escolha uma opção:", quickReplies: [{ content_type: "text", title: "Sim", payload: "YES" }, { content_type: "text", title: "Não", payload: "NO" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/buttonTemplate", name: "MessengerButtonTemplate",
        description: "Enviar Button Template via Messenger (até 3 botões postback/web_url).",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, message: "Selecione:", buttons: [{ type: "postback", title: "Opção 1", payload: "OPT_1" }, { type: "web_url", title: "Visitar", url: "https://exemplo.com" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/genericTemplate", name: "MessengerGenericTemplate",
        description: "Enviar Generic Template (carrossel de cards) via Messenger.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, elements: [{ title: "Card 1", subtitle: "Subtítulo", image_url: "https://exemplo.com/img.jpg", buttons: [{ type: "postback", title: "Ação", payload: "ACT" }] }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/mediaTemplate", name: "MessengerMediaTemplate",
        description: "Enviar Media Template (imagem/vídeo) com botões via Messenger. URL externa é convertida em attachment_id automaticamente.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, mediaType: "image", mediaUrl: "https://exemplo.com/imagem.jpg", buttons: [{ type: "postback", title: "Comprar", payload: "BUY" }] }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/receiptTemplate", name: "MessengerReceiptTemplate",
        description: "Enviar Receipt Template (recibo de compra) via Messenger.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, receipt: { recipient_name: "João Silva", order_number: "ORD-001", currency: "BRL", payment_method: "PIX", summary: { total_cost: 150.00 }, elements: [{ title: "Produto A", price: 100.00, quantity: 1 }, { title: "Produto B", price: 50.00, quantity: 1 }] } }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/messageTag", name: "MessengerMessageTag",
        description: "Enviar mensagem fora da janela de 24h com Message Tag (ex: POST_PURCHASE_UPDATE, ACCOUNT_UPDATE, CONFIRMED_EVENT_UPDATE, HUMAN_AGENT).",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, message: "Seu pedido foi aprovado.", tag: "POST_PURCHASE_UPDATE" }, null, 2),
      },
      {
        method: "POST", path: "/sendInteractive/messenger/customerFeedback", name: "MessengerCustomerFeedback",
        description: "Enviar Customer Feedback Template (CSAT/NPS/CES) via Messenger. Requer business_privacy_url.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ ticketId: 1262, title: "Avalie sua experiência", subtitle: "Opcional", business_privacy_url: "https://exemplo.com/privacidade", expires_in_days: 7, feedback_screens: [{ questions: [{ id: "CSAT", type: "csat", title: "Como foi nosso atendimento?" }] }] }, null, 2),
      },
      {
        method: "POST", path: "/messenger/greeting", name: "MessengerGreeting",
        description: "Gerenciar Greeting Text da página do Messenger. action: get | set | delete.",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ action: "set", greetings: [{ locale: "default", text: "Olá! Como podemos ajudar?" }] }, null, 2),
      },
      {
        method: "POST", path: "/messenger/personas", name: "MessengerPersonas",
        description: "Gerenciar Personas da página do Messenger. action: list | create | delete. Para create, informe name e profilePictureUrl; para delete, informe personaId (o id vem do retorno de list).",
        bodyType: "json",
        channelTypes: ["messenger"],
        bodyExample: JSON.stringify({ action: "create", name: "Atendente Ana", profilePictureUrl: "https://exemplo.com/ana.jpg" }, null, 2),
      },
    ],
  },
];

// ─── CopyField ────────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("apiServicePage");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyError"));
    }
  };

  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md break-all font-mono select-all">{value}</code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("copy")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── TokenPrefix ──────────────────────────────────────────────────────────────

function TokenPrefix({ prefix }: { prefix?: string | null }) {
  const t = useTranslations("apiServicePage");
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("prefixColumn")}</span>
      <code className="block text-xs bg-muted px-3 py-2 rounded-md font-mono break-all text-muted-foreground">
        {prefix ? `${prefix}...` : "—"}
      </code>
    </div>
  );
}

// ─── ApiCard ──────────────────────────────────────────────────────────────────

function ApiCard({
  api, onEdit, onDelete, onRenewToken,
}: {
  api: ApiConfig;
  onEdit: (api: ApiConfig) => void;
  onDelete: (api: ApiConfig) => void;
  onRenewToken: (api: ApiConfig) => void;
}) {
  const t = useTranslations("apiServicePage");
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{api.name}</h3>
              <Badge variant="outline" className="text-[10px] shrink-0">#{api.sessionId}</Badge>
              {api.isActive
                ? <Badge variant="success" className="text-[10px]">{t("active")}</Badge>
                : <Badge variant="destructive" className="text-[10px]">{t("inactive")}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRenewToken(api)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("generateNewToken")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(api)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("edit")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(api)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("delete")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <CopyField label={t("integrationUrl")} value={buildIntegrationUrl(api.id)} />
          <TokenPrefix prefix={api.apiTokenPrefix} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── GroupedApiList ───────────────────────────────────────────────────────────

function GroupedApiList({
  apis, sessions, onEdit, onDelete, onRenewToken,
}: {
  apis: ApiConfig[];
  sessions: Whatsapp[];
  onEdit: (api: ApiConfig) => void;
  onDelete: (api: ApiConfig) => void;
  onRenewToken: (api: ApiConfig) => void;
}) {
  const t = useTranslations("apiServicePage");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(API_PROVIDER_GROUPS.map((g) => g.key)));

  const sessionById = useMemo(() => {
    const map: Record<number, Whatsapp> = {};
    for (const s of sessions) map[s.id] = s;
    return map;
  }, [sessions]);

  const grouped = useMemo(() => {
    const map: Record<string, ApiConfig[]> = {};
    for (const api of apis) {
      const type = sessionById[api.sessionId]?.type || "";
      const providerKey =
        API_PROVIDER_GROUPS.find((g) => g.types.includes(type))?.key ||
        API_PROVIDER_GROUPS[2].key;
      if (!map[providerKey]) map[providerKey] = [];
      map[providerKey].push(api);
    }
    return map;
  }, [apis, sessionById]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupKeys = Object.keys(grouped);

  if (groupKeys.length === 0) return null;

  // If all in one type, no need to group
  if (groupKeys.length === 1) {
    return (
      <div className="space-y-4">
        {apis.map((api) => (
          <ApiCard key={api.id} api={api} onEdit={onEdit} onDelete={onDelete} onRenewToken={onRenewToken} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {API_PROVIDER_GROUPS.filter((pg) => grouped[pg.key]?.length).map((pg) => {
        const label = t(pg.labelKey as Parameters<typeof t>[0]);
        const isOpen = openGroups.has(pg.key);
        const groupApis = grouped[pg.key];
        return (
          <div key={pg.key} className="border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
              onClick={() => toggleGroup(pg.key)}
            >
              <span className="font-medium text-sm flex-1">{label}</span>
              <Badge variant="outline" className="text-[10px]">{groupApis.length} {t("apisCount")}</Badge>
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isOpen && (
              <div className="border-t p-3 space-y-3 bg-muted/10">
                {groupApis.map((api) => (
                  <ApiCard key={api.id} api={api} onEdit={onEdit} onDelete={onDelete} onRenewToken={onRenewToken} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SandboxModal ─────────────────────────────────────────────────────────────

interface SandboxState {
  route: ApiRoute;
  api: ApiConfig;
}

interface SandboxResponse {
  status: number;
  body: string;
  ok: boolean;
  durationMs: number;
}

function SandboxModal({ sandbox, sandboxToken, onClose }: { sandbox: SandboxState; sandboxToken: string; onClose: () => void }) {
  const t = useTranslations("apiServicePage");
  const { resolvedTheme } = useTheme();
  const { route, api } = sandbox;
  const baseUrl = buildIntegrationUrl(api.id);
  const fullUrl = `${baseUrl}${route.path}`;

  const defaultParams = (route.params || []).map((p) => ({
    key: p.key,
    value: p.defaultValue || "",
    enabled: true,
  }));

  const [bodyText, setBodyText] = useState(route.bodyExample || "");
  const [queryParams, setQueryParams] = useState(defaultParams);
  const [response, setResponse] = useState<SandboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (str: string) => {
    const bytes = new Blob([str]).size;
    return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  };

  const durationClass = (ms: number) =>
    ms < 200
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      : ms < 1000
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";

  const buildUrl = () => {
    if (route.method === "GET" && queryParams.length > 0) {
      const qs = queryParams
        .filter((p) => p.enabled && p.key && p.value)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join("&");
      return qs ? `${fullUrl}?${qs}` : fullUrl;
    }
    return fullUrl;
  };

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    const start = Date.now();
    try {
      const url = buildUrl();
      const headers: Record<string, string> = { Authorization: `Bearer ${sandboxToken}` };
      let body: BodyInit | undefined;
      if (route.method !== "GET" && route.bodyType === "json" && bodyText.trim()) {
        headers["Content-Type"] = "application/json";
        body = bodyText;
      }
      const res = await fetch(url, { method: route.method, headers, body });
      const durationMs = Date.now() - start;
      let responseText = "";
      try {
        const json = await res.json();
        responseText = JSON.stringify(json, null, 2);
      } catch {
        responseText = await res.text();
      }
      setResponse({ status: res.status, body: responseText, ok: res.ok, durationMs });
    } catch (err) {
      const durationMs = Date.now() - start;
      setResponse({ status: 0, body: err instanceof Error ? err.message : t("sandboxUnknownError"), ok: false, durationMs });
    } finally {
      setLoading(false);
    }
  };

  const isFormdata = route.bodyType === "formdata";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {t("sandboxTitle")} — {route.name}
          </DialogTitle>
          <DialogDescription>
            {t("sandboxApiLabel")}: <strong>{api.name}</strong>
            &nbsp;|&nbsp;
            {t("sandboxTokenLabel")}: <code className="text-xs bg-muted px-1 rounded">{sandboxToken.slice(0, 12)}…</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">{t("sandboxUrl")}</Label>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-[11px] font-bold shrink-0 ${METHOD_COLORS[route.method] || ""}`}>
                {route.method}
              </span>
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all">{buildUrl()}</code>
            </div>
          </div>

          {queryParams.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">{t("sandboxQueryParams")}</Label>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                {queryParams.map((param, idx) => (
                  <div key={param.key} className="flex items-center gap-2">
                    <Switch
                      checked={param.enabled}
                      onCheckedChange={(v) => setQueryParams((prev) => prev.map((p, i) => i === idx ? { ...p, enabled: v } : p))}
                      className="h-4 w-7"
                    />
                    <code className="text-[11px] font-mono bg-muted px-2 py-1 rounded w-36 shrink-0">{param.key}</code>
                    <Input
                      value={param.value}
                      onChange={(e) => setQueryParams((prev) => prev.map((p, i) => i === idx ? { ...p, value: e.target.value } : p))}
                      className="h-8 text-xs font-mono"
                      placeholder={param.key}
                      disabled={!param.enabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {route.method !== "GET" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                {isFormdata ? t("sandboxBodyFormdata") : t("sandboxBodyJson")}
              </Label>
              {isFormdata ? (
                <div className="border rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground font-mono whitespace-pre">
                  {route.bodyExample}
                </div>
              ) : (
                <Textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="font-mono text-xs min-h-[160px] resize-y"
                  placeholder='{ "key": "value" }'
                  spellCheck={false}
                />
              )}
            </div>
          )}

          <Button onClick={handleSend} disabled={loading || isFormdata} className="w-full">
            {loading
              ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{t("sandboxSending")}</>
              : <><Send className="mr-2 h-4 w-4" />{t("sandboxSend")}</>}
          </Button>

          {isFormdata && (
            <p className="text-xs text-muted-foreground text-center">{t("sandboxFormdataNote")}</p>
          )}

          {response && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs uppercase text-muted-foreground">{t("sandboxResponse")}</Label>
                <Badge variant={response.ok ? "success" : "destructive"} className="text-[10px]">
                  {response.status || t("sandboxNetworkError")}
                </Badge>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1", durationClass(response.durationMs))}>
                  <Clock className="h-2.5 w-2.5" />{response.durationMs}ms
                </span>
                {response.body && (
                  <span className="text-[11px] text-muted-foreground">{formatSize(response.body)}</span>
                )}
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={copyResponse}>
                  {copied
                    ? <><Check className="h-3 w-3 mr-1" />{t("sandboxCopied")}</>
                    : <><Copy className="h-3 w-3 mr-1" />{t("sandboxCopyResponse")}</>}
                </Button>
              </div>
              {response.body ? (
                <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto text-[11px]">
                  <SyntaxHighlighter
                    language="json"
                    style={resolvedTheme === "dark" ? oneDark : oneLight}
                    customStyle={{ margin: 0, fontSize: "11px", borderRadius: 0, padding: "12px" }}
                    wrapLongLines
                  >
                    {response.body}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">{t("sandboxNoBody")}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("sandboxClose")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RouteItem ────────────────────────────────────────────────────────────────

function RouteItem({
  route, baseUrl, sandboxApi, onTest,
}: {
  route: ApiRoute;
  baseUrl: string;
  sandboxApi: ApiConfig | null;
  onTest: (route: ApiRoute) => void;
}) {
  const t = useTranslations("apiServicePage");
  const [expanded, setExpanded] = useState(false);
  const fullPath = `${baseUrl}${route.path}`;
  const hasDetails = !!(route.params?.length || route.bodyExample);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 text-left min-w-0"
          onClick={() => hasDetails && setExpanded(!expanded)}
        >
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${METHOD_COLORS[route.method] || ""}`}>
            {route.method}
          </span>
          <code className="text-xs font-mono flex-1 truncate">{route.path}</code>
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{route.name}</span>
          {hasDetails && (expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />)}
        </button>
        {sandboxApi && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 shrink-0 text-primary hover:text-primary"
                onClick={() => onTest(route)}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("sandboxTestWith", { name: sandboxApi.name })}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          {route.description && <p className="text-xs text-muted-foreground">{route.description}</p>}
          <code className="text-[11px] font-mono bg-muted px-2 py-1 rounded break-all select-all">{fullPath}</code>

          {route.params && route.params.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{t("sandboxQueryParams")}</span>
              <div className="grid gap-1.5">
                {route.params.map((p) => (
                  <div key={p.key} className="flex items-start gap-2 text-xs">
                    <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px] shrink-0">{p.key}</code>
                    {p.required && <span className="text-destructive text-[10px] shrink-0 mt-0.5">{t("required")}</span>}
                    <span className="text-muted-foreground">{p.desc}</span>
                    {p.defaultValue && (
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                        {t("exampleShort")}: <code>{p.defaultValue}</code>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {route.bodyExample && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                {route.bodyType === "formdata" ? t("sandboxBodyFormdata") : t("sandboxBodyJson")}
              </span>
              <pre className="text-[11px] font-mono bg-muted p-2 rounded overflow-x-auto whitespace-pre">{route.bodyExample}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ApiDocsSection ───────────────────────────────────────────────────────────

function ApiDocsSection({ apis, sessions }: { apis: ApiConfig[]; sessions: Whatsapp[] }) {
  const t = useTranslations("apiServicePage");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [sandboxApiId, setSandboxApiId] = useState<string>("");
  const [sandboxToken, setSandboxToken] = useState<string>("");
  const [sandboxState, setSandboxState] = useState<SandboxState | null>(null);
  const [sortMode, setSortMode] = useState<ApiSortMode>("alpha");
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());

  const sessionById = useMemo(() => {
    const map: Record<number, Whatsapp> = {};
    for (const s of sessions) map[s.id] = s;
    return map;
  }, [sessions]);

  const sandboxApi = useMemo(() => apis.find((a) => String(a.id) === sandboxApiId) || null, [apis, sandboxApiId]);
  const sandboxChannelType = useMemo(
    () => (sandboxApi ? sessionById[sandboxApi.sessionId]?.type || null : null),
    [sandboxApi, sessionById]
  );
  const baseUrl = sandboxApi ? buildIntegrationUrl(sandboxApi.id) : `${apiBaseUrl}/v2/api/external/{ApiID}`;

  const visibleCategories = useMemo(
    () =>
      API_DOCS.filter((cat) => {
        if (!cat.channelTypes) return true;
        if (!sandboxChannelType) return true;
        return cat.channelTypes.includes(sandboxChannelType);
      })
        // Interruptor do WaVoIP no tenant: some com os endpoints /wavoip/* da doc
        // (o backend responde 402 neles). Só as rotas WaVoIP — /callLog/* fica, pois
        // é alimentado por SIP, WABA, Dialog360 e Gupshup, não por WaVoIP.
        .map((cat) =>
          wavoipEnabled
            ? cat
            : { ...cat, routes: cat.routes.filter((r) => !r.path.startsWith("/wavoip")) }
        )
        .filter((cat) => cat.routes.length > 0),
    [sandboxChannelType, wavoipEnabled]
  );

  const sortedCategories = useMemo(() => {
    const arr = [...visibleCategories];
    if (sortMode === "alpha") {
      arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    } else if (sortMode === "grouped") {
      arr.sort((a, b) => {
        const ta = getApiPrimaryType(a);
        const tb = getApiPrimaryType(b);
        const tc = ta.localeCompare(tb, "pt-BR");
        return tc !== 0 ? tc : a.name.localeCompare(b.name, "pt-BR");
      });
    } else if (sortMode === "byProvider") {
      arr.sort((a, b) => {
        const pa = API_PROVIDER_GROUPS.indexOf(getApiProviderGroup(a));
        const pb = API_PROVIDER_GROUPS.indexOf(getApiProviderGroup(b));
        return pa !== pb ? pa - pb : a.name.localeCompare(b.name, "pt-BR");
      });
    }
    return arr;
  }, [visibleCategories, sortMode]);

  const toggleCategory = (name: string) => setOpenCategories((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const expandAll = () => setOpenCategories(new Set(sortedCategories.map((c) => c.name)));
  const collapseAll = () => setOpenCategories(new Set());

  const totalEndpoints = sortedCategories.reduce((acc, c) => acc + c.routes.length, 0);

  const renderCategory = (category: ApiRouteCategory) => {
    const isOpen = openCategories.has(category.name);
    return (
      <div key={category.name} className="border rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/50 transition-colors font-medium text-sm"
          onClick={() => toggleCategory(category.name)}
        >
          <span>{category.emoji}</span>
          <span className="flex-1">{category.name}</span>
          {category.channelTypes && !sandboxChannelType && (
            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400">
              {category.channelTypes.map((ct) => SESSION_TYPE_LABELS[ct] || ct).join(" / ")} only
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{category.routes.length}</Badge>
          {isOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {isOpen && (
          <div className="border-t p-2 space-y-1.5 bg-muted/10">
            {category.routes.map((route, idx) => (
              <RouteItem
                key={`${route.name}-${idx}`}
                route={route}
                baseUrl={baseUrl}
                sandboxApi={sandboxApi}
                onTest={(r) => {
                  if (!sandboxToken) {
                    toast.error(t("sandboxTokenRequired"));
                    return;
                  }
                  setSandboxState({ route: r, api: sandboxApi! });
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const groupedContent = useMemo(() => {
    if (sortMode === "grouped") {
      const groups: Record<string, ApiRouteCategory[]> = {};
      for (const cat of sortedCategories) {
        const key = getApiPrimaryType(cat);
        (groups[key] = groups[key] || []).push(cat);
      }
      return Object.entries(groups).map(([type, items]) => ({
        key: type,
        label: type === "generic" ? t("apiGroupGeneric") : (SESSION_TYPE_LABELS[type] || type),
        items,
      }));
    }
    if (sortMode === "byProvider") {
      return API_PROVIDER_GROUPS.map((pg) => ({
        key: pg.key,
        label: t(pg.labelKey as Parameters<typeof t>[0]),
        items: sortedCategories.filter((c) => getApiProviderGroup(c).key === pg.key),
      })).filter((g) => g.items.length > 0);
    }
    return null;
  }, [sortMode, sortedCategories, t]);

  return (
    <>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">{t("routesDocs")}</h3>
              <Badge variant="secondary" className="text-[10px]">{totalEndpoints} endpoints</Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={expandAll}>{t("expandAll")}</Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={collapseAll}>{t("collapseAll")}</Button>
            </div>
          </div>

          {/* Sandbox Selector */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t("sandboxTitle")}</span>
              {sandboxApi && (
                <Badge variant="outline" className="text-[10px] text-primary border-primary">
                  {t("sandboxActive", { name: sandboxApi.name })}
                </Badge>
              )}
              {sandboxChannelType && (
                <Badge variant="secondary" className="text-[10px]">
                  {SESSION_TYPE_LABELS[sandboxChannelType] || sandboxChannelType}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("sandboxDescription")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <SearchableSelect
                options={apis.map((a) => ({ value: String(a.id), label: `${a.name} (ID: ${a.id})` }))}
                value={sandboxApiId}
                onValueChange={setSandboxApiId}
                placeholder={t("sandboxSelectApi")}
                className="h-8 text-xs w-full sm:max-w-xs"
                clearable
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("sandboxPasteDesc")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={sandboxToken}
                onChange={(e) => setSandboxToken(e.target.value)}
                placeholder={t("sandboxPastePlaceholder")}
                className="h-8 text-xs font-mono w-full sm:max-w-xs"
                type="password"
                autoComplete="off"
              />
              {sandboxToken && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSandboxToken("")}>
                  {t("sandboxClear")}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("baseUrl")}: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{baseUrl}</code>
            <br />
            {t("authVia")} <code className="bg-muted px-1.5 py-0.5 rounded font-mono">Authorization: Bearer {"{token}"}</code>
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">{t("viewMode")}</span>
            {(["default","alpha","grouped","byProvider"] as ApiSortMode[]).map((m) => {
              const labels: Record<ApiSortMode, { label: string; icon: React.ReactNode }> = {
                default:    { label: t("sortDefault"),      icon: <Layers2 className="w-3 h-3" /> },
                alpha:      { label: t("sortAlpha"),        icon: <ArrowDownAZ className="w-3 h-3" /> },
                grouped:    { label: t("sortGrouped"),      icon: <Layers2 className="w-3 h-3" /> },
                byProvider: { label: t("sortByProvider"),   icon: <Building2 className="w-3 h-3" /> },
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

          <div className="space-y-4">
            {groupedContent ? (
              groupedContent.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </h4>
                    <span className="text-[10px] text-muted-foreground">({group.items.length})</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map(renderCategory)}
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-2">
                {sortedCategories.map(renderCategory)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {sandboxState && sandboxToken && <SandboxModal sandbox={sandboxState} sandboxToken={sandboxToken} onClose={() => setSandboxState(null)} />}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiServicePage() {
  const t = useTranslations("apiServicePage");
  const allowed = usePageAccess("api-service", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [sessions, setSessions] = useState<Whatsapp[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiConfig | null>(null);
  const [deleting, setDeleting] = useState<ApiConfig | null>(null);
  const [renewTarget, setRenewTarget] = useState<ApiConfig | null>(null);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [postmanLink, setPostmanLink] = useState<string>("");

  useEffect(() => {
    fetchTenantById(0)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const link = (list[0] as Record<string, unknown> | undefined)?.postmanLink;
        if (typeof link === "string") setPostmanLink(link);
      })
      .catch(() => { /* silent — fallback to default in handleDownloadPostman */ });
  }, []);

  const form = useForm<ApiFormValues>({
    resolver: zodResolver(apiFormSchema),
    defaultValues: { name: "", sessionId: "", isActive: true },
  });

  const loadApis = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchApiConfigs();
      setApis(data?.apis || []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await fetchWhatsapps();
      const arr = Array.isArray(data) ? data : [];
      setSessions(arr.filter((w) => ALLOWED_SESSION_TYPES.includes(w.type)));
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    loadApis();
    loadSessions();
  }, [loadApis, loadSessions]);

  const selectedSessionType = useMemo(() => {
    const sid = form.watch("sessionId");
    if (!sid) return null;
    return sessions.find((s) => s.id === Number(sid))?.type || null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("sessionId"), sessions]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", sessionId: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (api: ApiConfig) => {
    setEditing(api);
    form.reset({ name: api.name, sessionId: String(api.sessionId), isActive: api.isActive });
    setDialogOpen(true);
  };

  const onSubmit = async (values: ApiFormValues) => {
    try {
      const payload = { name: values.name, sessionId: Number(values.sessionId), isActive: values.isActive };
      if (editing) {
        const { data } = await updateApiConfig(editing.id, payload);
        setApis((prev) => prev.map((a) => (a.id === editing.id ? data : a)));
        toast.success(t("apiUpdated"));
        setDialogOpen(false);
      } else {
        const { data } = await createApiConfig(payload);
        const { plainToken: newToken, ...apiData } = data;
        setApis((prev) => [...prev, apiData as ApiConfig]);
        toast.success(t("apiCreated"));
        setDialogOpen(false);
        if (newToken) setPlainToken(newToken);
      }
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleRenewToken = async () => {
    if (!renewTarget) return;
    try {
      const { data } = await renewApiToken(renewTarget.id);
      const { plainToken: newToken, ...apiData } = data;
      setApis((prev) => prev.map((a) => (a.id === renewTarget.id ? (apiData as ApiConfig) : a)));
      toast.success(t("tokenRenewed"));
      setRenewTarget(null);
      if (newToken) setPlainToken(newToken);
    } catch {
      toast.error(t("errorRenewToken"));
    }
  };

  const copyPlainToken = async () => {
    if (!plainToken) return;
    try {
      await navigator.clipboard.writeText(plainToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 3000);
    } catch {
      toast.error(t("copyError"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteApiConfig(deleting.id);
      setApis((prev) => prev.filter((a) => a.id !== deleting.id));
      toast.success(t("apiRemoved", { name: deleting.name }));
      setDeleting(null);
    } catch {
      toast.error(t("errorRemove"));
    }
  };

  const handleDownloadPostman = () => {
    const link = postmanLink.trim() || "https://www.postman.com/comunidade-zdg/z-pro/collection/s16subg/postman-v3-x-x-x?action=share&creator=25151510";
    window.open(link, "_blank");
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 min-w-0">
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
              { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1")] },
            ],
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPostman} title="Postman">
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Postman</span>
            </Button>
            <Button variant="outline" size="sm" onClick={loadApis} disabled={loading} title={t("refresh")}>
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </Button>
            <Button size="sm" onClick={openCreate} title={t("newApi")}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("newApi")}</span>
            </Button>
          </div>
        </PageHeader>

        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Key className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">{t("securityBanner")}</p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : apis.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            steps={[
              { number: 1, title: t("emptyStep1") },
              { number: 2, title: t("emptyStep2") },
              { number: 3, title: t("emptyStep3") },
            ]}
          >
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newApi")}</Button>
          </EmptyState>
        ) : (
          <GroupedApiList apis={apis} sessions={sessions} onEdit={openEdit} onDelete={setDeleting} onRenewToken={setRenewTarget} />
        )}

        <Separator />
        <ApiDocsSection apis={apis} sessions={sessions} />

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editing ? t("editApi") : t("newApi")}</DialogTitle>
              <DialogDescription>{editing ? t("editApiDescription") : t("newApiDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t("labelName")} *</Label>
                <Input {...form.register("name")} placeholder={t("namePlaceholder")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{t("nameRequired")}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("labelSession")} *</Label>
                <SearchableSelect
                  options={sessions.map((s) => ({ value: String(s.id), label: `${s.name} (${s.type})` }))}
                  value={form.watch("sessionId")}
                  onValueChange={(v) => form.setValue("sessionId", v, { shouldValidate: true })}
                  placeholder={t("selectSession")}
                  disabled={!!editing}
                />
                {form.formState.errors.sessionId && <p className="text-xs text-destructive">{t("sessionRequired")}</p>}
                {!!editing && <p className="text-xs text-muted-foreground">{t("sessionCannotChange")}</p>}
              </div>

              {selectedSessionType === "waba" && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold">{t("wabaImportantInfo")}</span>
                  </div>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">{t("wabaInfo1")}</p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">{t("wabaInfo2")}</p>
                </div>
              )}

              {["telegram", "instagram", "messenger", "webchat", "hub", "email", "webmail"].includes(selectedSessionType ?? "") && (
                <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold">{t("restrictedChannelInfo")}</span>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">{t("restrictedChannelInfo1")}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">{t("restrictedChannelInfo2")}</p>
                </div>
              )}

              {editing && (
                <div className="flex items-center gap-3">
                  <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
                  <Label>{t("apiActive")}</Label>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? t("saving") : t("save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Renew Token */}
        <Dialog open={!!renewTarget} onOpenChange={() => setRenewTarget(null)}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> {t("generateNewToken")}</DialogTitle>
              <DialogDescription>{t("renewTokenDescription")}</DialogDescription>
            </DialogHeader>
            <p className="py-2 text-sm text-muted-foreground">{t("renewTokenConfirm", { name: renewTarget?.name ?? "" })}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenewTarget(null)}>{t("cancel")}</Button>
              <Button variant="destructive" onClick={handleRenewToken}>{t("generateNewToken")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{t("confirmDelete")}</DialogTitle>
              <DialogDescription>{t("actionCannotBeUndone")}</DialogDescription>
            </DialogHeader>
            <p className="py-2 text-sm text-muted-foreground">{t("deleteConfirm", { name: deleting?.name ?? "" })}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
              <Button variant="destructive" onClick={handleDelete}>{t("remove")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* One-time token reveal */}
        <Dialog open={!!plainToken} onOpenChange={(open) => { if (!open) setPlainToken(null); }}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                {t("tokenOneTimeTitle")}
              </DialogTitle>
              <DialogDescription>{t("tokenOneTimeDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-2">{t("tokenOneTimeWarning")}</p>
                <code className="block text-xs font-mono bg-white dark:bg-black/40 px-3 py-2 rounded border break-all select-all">
                  {plainToken}
                </code>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={copyPlainToken}>
                {tokenCopied ? <><Check className="mr-2 h-4 w-4" />{t("copied")}</> : <><Copy className="mr-2 h-4 w-4" />{t("copyNow")}</>}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPlainToken(null)}>{t("tokenOneTimeClose")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
