/**
 * Fonte ÚNICA dos links das abas do hub de configurações (/configuracoes).
 *
 * Módulo PURO (dados, sem hooks/JSX): extraído de buildTabGroups em
 * app/(dashboard)/configuracoes/layout.tsx e consumido por:
 *   1. o próprio layout do hub (que resolve os labels i18n via namespace
 *      "configLayout" e mantém o gate asaasOnly com o estado do tenant);
 *   2. o CommandPalette (Ctrl+K), que indexa estes links num grupo
 *      "Configurações" apenas para o perfil admin (mesmo gate do layout).
 *
 * Labels: links de produto/marca (SMTP, Typebot, Meta, ...) usam `label`
 * literal — não traduzem. Links com texto de UI usam `labelKey` (chave do
 * namespace "configLayout"). Exatamente um dos dois é preenchido.
 */
import type * as React from "react";
import {
  Settings, Webhook, MessageSquare, Bot, Brain, Globe, Cpu, Zap,
  Phone, Mail, CreditCard, Server, AlertCircle,
  Tag, Variable, MessageCircle, Network, Key, Calendar, Layers,
  TrendingUp, FileDown,
  Linkedin, ShoppingBag, Youtube, Music2,
} from "lucide-react";

export type ConfigTabKey = "gerais" | "bots-ia" | "integracoes" | "apps" | "crm" | "sessoes";

export interface ConfigLinkDef {
  /** Chave i18n no namespace "configLayout" (labels de UI traduzíveis). */
  labelKey?: string;
  /** Label literal (nomes de produto/marca — não traduz). */
  label?: string;
  href: string;
  icon: React.ElementType;
  /** Só exibe quando o Asaas está habilitado no tenant (gate resolvido pelo consumidor). */
  asaasOnly?: boolean;
}

export interface ConfigTabDef {
  key: ConfigTabKey;
  /** Chave i18n no namespace "configLayout" para o label da aba. */
  labelKey: string;
  links: ConfigLinkDef[];
}

export const CONFIG_TAB_GROUPS: ConfigTabDef[] = [
  {
    key: "gerais",
    labelKey: "tabGerais",
    links: [
      { labelKey: "linkGeral", href: "/configuracoes/geral", icon: Settings },
      { label: "SMTP", href: "/configuracoes/smtp", icon: Mail },
      { label: "A2F", href: "/configuracoes/a2f", icon: Key },
      { labelKey: "linkImportarHistorico", href: "/configuracoes/importar-historico", icon: FileDown },
      { labelKey: "linkPagamentos", href: "/configuracoes/pagamentos", icon: CreditCard, asaasOnly: true },
    ],
  },
  {
    key: "bots-ia",
    labelKey: "tabBotsIA",
    links: [
      { labelKey: "linkBotsEIa", href: "/configuracoes/bots-e-ia", icon: Brain },
      { labelKey: "linkCopilot", href: "/configuracoes/copilot", icon: Bot },
      { label: "Typebot", href: "/configuracoes/typebot", icon: Bot },
      { label: "ChatGPT", href: "/configuracoes/chat-gpt", icon: Brain },
      { label: "Grok", href: "/configuracoes/grok", icon: Zap },
      { label: "Gemini", href: "/configuracoes/gemini", icon: Brain },
      { label: "Qwen", href: "/configuracoes/qwen", icon: Brain },
      { label: "Claude", href: "/configuracoes/claude", icon: Brain },
      { label: "DeepSeek", href: "/configuracoes/deepseek", icon: Brain },
      { label: "N8N", href: "/configuracoes/n8n", icon: Network },
      { label: "Dify", href: "/configuracoes/dify", icon: Layers },
      { label: "Ollama", href: "/configuracoes/ollama", icon: Cpu },
      { label: "LM Studio", href: "/configuracoes/lm", icon: Cpu },
      { label: "Dialogflow", href: "/configuracoes/dialogflow", icon: Brain },
    ],
  },
  {
    key: "integracoes",
    labelKey: "tabIntegracoes",
    links: [
      { label: "Meta", href: "/configuracoes/meta", icon: Globe },
      { label: "BSP", href: "/configuracoes/bsp", icon: Globe },
      { labelKey: "linkConversoes", href: "/configuracoes/conversoes", icon: TrendingUp },
      { label: "Webhooks", href: "/configuracoes/webhooks", icon: Webhook },
      { label: "Webchat", href: "/configuracoes/webchat", icon: MessageCircle },
      { label: "Google Calendar", href: "/configuracoes/google-calendar", icon: Calendar },
      { label: "Z-API", href: "/configuracoes/zapi", icon: Globe },
      { label: "UazAPI", href: "/configuracoes/uazapi", icon: Globe },
      { label: "Evolution API", href: "/configuracoes/evolution", icon: Globe },
      { label: "Evolution Go", href: "/configuracoes/evolution-go", icon: Globe },
      { label: "WuzAPI", href: "/configuracoes/wuzapi", icon: Globe },
      { label: "Hub", href: "/configuracoes/hub", icon: Globe },
      { label: "Rocket.Chat", href: "/configuracoes/rocketchat", icon: MessageSquare },
      { label: "SMS", href: "/configuracoes/sms", icon: MessageSquare },
      { label: "GroqCloud", href: "/configuracoes/groqcloud", icon: Cpu },
      { label: "VAPI", href: "/configuracoes/vapi", icon: Phone },
    ],
  },
  {
    key: "apps",
    labelKey: "tabApps",
    links: [
      { label: "LinkedIn", href: "/configuracoes/app-linkedin", icon: Linkedin },
      { label: "Mercado Livre", href: "/configuracoes/app-mercadolivre", icon: ShoppingBag },
      { label: "OLX", href: "/configuracoes/app-olx", icon: Tag },
      { label: "RocketChat", href: "/configuracoes/app-rocketchat", icon: MessageSquare },
      { label: "TikTok", href: "/configuracoes/app-tiktok", icon: Music2 },
      { label: "WooCommerce", href: "/configuracoes/app-woocommerce", icon: ShoppingBag },
      { label: "Nuvemshop", href: "/configuracoes/app-nuvemshop", icon: ShoppingBag },
      { label: "Google", href: "/configuracoes/app-google", icon: Globe },
      { label: "YouTube", href: "/configuracoes/youtube", icon: Youtube },
      // Phase 16 — oculto: substituido por App Google. Pagina/rota mantida para compat legacy.
      // { label: "YouTube (legado)", href: "/configuracoes/app-youtube", icon: Youtube },
    ],
  },
  {
    key: "crm",
    labelKey: "tabCRM",
    links: [
      { label: "Lanes", href: "/configuracoes/lanes", icon: Layers },
      { labelKey: "linkMotivos", href: "/configuracoes/motivos", icon: AlertCircle },
      { labelKey: "linkVariaveis", href: "/configuracoes/variaveis", icon: Variable },
    ],
  },
  {
    key: "sessoes",
    labelKey: "tabSessoes",
    links: [
      { labelKey: "linkSessoes", href: "/configuracoes/sessoes", icon: Server },
    ],
  },
];
