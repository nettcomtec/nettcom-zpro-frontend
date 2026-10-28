import {
  CalendarClock,
  DoorOpen,
  HeartHandshake,
  LifeBuoy,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type {
  AiAgentTemplateAgentInput,
  AiAgentTemplateTarget,
} from "@/services/ai-agents";

/**
 * Modelos prontos de agente de IA (v7 —
 * docs/PLANO_AGENTES_IA_BASE_COMPARTILHADA_MODELOS.md §5.8 e §5.13).
 *
 * Catálogo e montador PUROS, sem texto literal: todo texto vem do namespace
 * `aiAgentTemplates` dos 13 locales (o tradutor entra por parâmetro). Nada
 * aqui é guardado como agente oculto — o modelo só vira agente quando o
 * servidor cria (`POST /ai-agents/from-template`).
 *
 * Regras que a validação dos locales garante (§9.4):
 * - textos longos (instruções, perguntas e respostas de exemplo) são lidos por
 *   `t.raw` (sem parse ICU); os curtos por `t`;
 * - o marcador da empresa (`companyToken`) é idêntico dentro das instruções e
 *   dos artigos de cada idioma;
 * - a descrição da ferramenta de transferir da equipe COMPLETA cabe em 1.500
 *   caracteres em cada idioma (o destino humano vai PRIMEIRO, porque o corte
 *   é no fim).
 */

export type AiAgentTemplateId =
  | "reception"
  | "sales"
  | "support"
  | "billing"
  | "scheduling"
  | "post_sale";

export interface AiAgentTemplateDef {
  id: AiAgentTemplateId;
  icon: LucideIcon;
  // Só a recepção não é especialista: ela faz a triagem da equipe.
  specialist: boolean;
}

export const AI_AGENT_TEMPLATES: AiAgentTemplateDef[] = [
  { id: "reception", icon: DoorOpen, specialist: false },
  { id: "sales", icon: ShoppingCart, specialist: true },
  { id: "support", icon: LifeBuoy, specialist: true },
  { id: "billing", icon: Wallet, specialist: true },
  { id: "scheduling", icon: CalendarClock, specialist: true },
  { id: "post_sale", icon: HeartHandshake, specialist: true },
];

export const AI_AGENT_SPECIALIST_TEMPLATES: AiAgentTemplateDef[] =
  AI_AGENT_TEMPLATES.filter((tpl) => tpl.specialist);

export const TEAM_TRIAGE_ID: AiAgentTemplateId = "reception";
export const TEMPLATE_FAQ_COUNT = 3;
export const TEMPLATE_MEMORY_COUNT = 2;

// Tetos do `sanitizeRoutingTargets` do backend (CreateAiAgentServiceZPRO.ts):
// rótulo 80, descrição 200. Cortar aqui evita que o servidor corte diferente.
const TARGET_LABEL_MAX = 80;
const TARGET_DESCRIPTION_MAX = 200;
const ARTICLE_TITLE_MAX = 255;

// Chave do destino humano — a MESMA em todo agente criado por modelo.
export const TEMPLATE_HUMAN_TARGET_KEY = "human";

/**
 * Forma mínima do tradutor do next-intl que o montador usa: `t` para os textos
 * curtos (com parse ICU) e `t.raw` para os longos (sem parse).
 */
export interface AiAgentTemplateTranslator {
  (key: string, values?: Record<string, string | number>): string;
  raw: (key: string) => unknown;
}

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

const replaceCompany = (text: string, token: string, company: string): string =>
  token ? text.split(token).join(company) : text;

const cut = (text: string, max: number): string => text.trim().slice(0, max);

export const isAiAgentTemplateId = (value: unknown): value is AiAgentTemplateId =>
  AI_AGENT_TEMPLATES.some((tpl) => tpl.id === value);

/**
 * Lista de modelos que o lote vai criar, na ordem do catálogo.
 * - Um agente: só o 1º id válido.
 * - Equipe: a recepção SEMPRE (fixa) + os especialistas marcados.
 */
export function resolveTemplateSelection(
  ids: AiAgentTemplateId[],
  team: boolean
): AiAgentTemplateId[] {
  const valid = ids.filter(isAiAgentTemplateId);
  if (!team) return valid.length > 0 ? [valid[0]] : [];
  const specialists = new Set(
    valid.filter((id) => id !== TEAM_TRIAGE_ID)
  );
  return [
    TEAM_TRIAGE_ID,
    ...AI_AGENT_SPECIALIST_TEMPLATES.map((tpl) => tpl.id).filter((id) =>
      specialists.has(id)
    ),
  ];
}

/**
 * Monta os agentes do lote para `createAiAgentsFromTemplate`.
 *
 * - `companyName` é OBRIGATÓRIO (R5-3): substitui o marcador do idioma nas
 *   instruções e nos artigos — o marcador nunca chega ao cliente.
 * - Destino humano SEMPRE primeiro (C5), com a fila de emergência obrigatória
 *   (R5-1): sem destino o agente ficaria sem ferramenta nenhuma.
 * - Equipe (R5-2): a recepção passa para cada especialista marcado, e cada
 *   especialista passa direto para cada OUTRO especialista — sem volta à
 *   recepção (1 troca por mudança de assunto; teto de 3 por atendimento).
 */
export function buildTemplateAgents({
  t,
  ids,
  team,
  companyName,
  fallbackQueueId,
}: {
  t: AiAgentTemplateTranslator;
  ids: AiAgentTemplateId[];
  team: boolean;
  companyName: string;
  fallbackQueueId: number;
}): AiAgentTemplateAgentInput[] {
  const selection = resolveTemplateSelection(ids, team);
  const company = companyName.trim();
  const token = asText(t.raw("companyToken"));
  const withCompany = (text: string) => replaceCompany(text, token, company);

  const humanTarget: AiAgentTemplateTarget = {
    key: TEMPLATE_HUMAN_TARGET_KEY,
    label: cut(t("humanTargetLabel"), TARGET_LABEL_MAX),
    description: cut(t("humanTargetWhen"), TARGET_DESCRIPTION_MAX),
    type: "queue",
    queueId: fallbackQueueId,
  };

  const specialistsInLot = team
    ? selection.filter((id) => id !== TEAM_TRIAGE_ID)
    : [];

  const agentTarget = (id: AiAgentTemplateId): AiAgentTemplateTarget => ({
    key: `to_${id}`,
    label: cut(t(`${id}.name`), TARGET_LABEL_MAX),
    description: cut(t(`${id}.routeWhen`), TARGET_DESCRIPTION_MAX),
    type: "ai_agent",
    aiAgentRef: id,
  });

  return selection.map((id) => {
    const routingTargets: AiAgentTemplateTarget[] = [humanTarget];
    if (team) {
      // Recepção → todos os especialistas; especialista → os OUTROS.
      for (const other of specialistsInLot) {
        if (other === id) continue;
        routingTargets.push(agentTarget(other));
      }
    }

    const memoryFields = Array.from(
      { length: TEMPLATE_MEMORY_COUNT },
      (_, index) => ({
        name: t(`${id}.mem${index + 1}Name`),
        description: t(`${id}.mem${index + 1}Desc`),
      })
    );

    const articles = Array.from({ length: TEMPLATE_FAQ_COUNT }, (_, index) => ({
      title: cut(
        withCompany(asText(t.raw(`${id}.faq${index + 1}Q`))),
        ARTICLE_TITLE_MAX
      ),
      content: withCompany(asText(t.raw(`${id}.faq${index + 1}A`))).trim(),
    })).filter((article) => article.content.length > 0);

    return {
      ref: id,
      name: t(`${id}.name`),
      description: t(`${id}.description`),
      systemPrompt: withCompany(asText(t.raw(`${id}.instructions`))).trim(),
      transferMessage: t("transferMessage"),
      memoryEnabled: true,
      memoryFields,
      routingTargets,
      articles,
    };
  });
}
