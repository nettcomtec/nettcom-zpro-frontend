import { generateTemplateViaCopilot } from "./copilot";
import { useAuthStore } from "@/stores/auth-store";
import {
  DEFAULT_CUSTOM_PERMISSIONS,
  PERMISSION_KEYS,
  type ICustomPermissions,
} from "@/types/custom-permissions";

export interface ProfileSuggestion {
  name: string;
  description: string;
  customPermissions: ICustomPermissions;
  menuPermissions: Record<string, boolean>;
  rationale: string;
  provider: string;
  model: string;
}

const MENU_KEYS = [
  "atendimento", "contatos", "chat-privado", "campanhas", "email-marketing", "massa", "galeria",
  "grupo", "mensagens-rapidas", "funil", "kanban", "tarefas", "sessoes",
  "equipes", "agendamentos", "aniversarios", "chat-flow", "avaliacoes",
  "etiquetas", "fechamento", "filas", "horarioAtendimento", "notas",
  "protocolos", "relatorios", "usuarios", "logligacao", "painel-atendimentos",
  "wavoip", "dashboard", "auto-resposta", "audit-log", "woocommerce-produtos", "nuvemshop-produtos",
  "facebookComentarios", "instagramComentarios", "instagramMencoes",
  "tiktokComentarios", "youtubeComentarios", "api-service",
  "instagramAutomacao", "google-calendar", "chat-interno-rc", "motivos-pausa",
  "catalogo", "agendamento-publico", "configuracoes", "integracoes-meta",
];

function buildSystemPrompt(): string {
  const permKeys = Array.from(PERMISSION_KEYS).map(k => `  - ${k}`).join("\n");
  // Com o WaVoIP desligado no tenant a chave sai do catálogo oferecido ao modelo —
  // sugerir "wavoip: true" só produziria uma permissão sem efeito (o gate do tenant
  // prevalece sobre menuPermissions).
  const wavoipEnabled = useAuthStore.getState().isWavoipEnabled();
  const menuKeys = MENU_KEYS
    .filter(k => wavoipEnabled || k !== "wavoip")
    .map(k => `  - ${k}`).join("\n");

  return `Voce e um assistente que configura permissoes granulares de um sistema SaaS multi-tenant de atendimento.
Responda APENAS com JSON valido, sem prosa antes ou depois, sem code fences.

Formato exato da resposta:
{
  "name": "<nome curto do perfil, max 60 chars, ex: Atendente Noturno>",
  "description": "<1 frase descrevendo o proposito do perfil, max 240 chars>",
  "customPermissions": { "<chave>": boolean, ... },
  "menuPermissions": { "<chave>": boolean, ... },
  "rationale": "1-2 frases explicando as decisoes"
}

Regras de seguranca (OBRIGATORIAS):
- Default SEGURO: se a descricao NAO mencionar uma permissao, marque false.
- NUNCA ligue estas permissoes salvo pedido EXPLICITO:
  tickets_delete, tickets_reopen, contacts_delete, contacts_export,
  tasks_delete, users_manage, sessions_manage, api_service_access
- "Atende" / "responde tickets" -> tickets_create + tickets_resolve.
  "ve todos os tickets" -> tickets_view_all + menuPermissions.atendimento.
  "transfere" -> tickets_assign.
- "kanban" -> menuPermissions.kanban + kanban_manage se "gerenciar".
- "funil" -> menuPermissions.funil + funnel_manage se "gerenciar".
- "relatorios" -> reports_view; "exportar relatorios" -> reports_export.
- "configuracoes" explicitas -> settings_general.
- contacts_view_full: default TRUE (sem blur) exceto se pedir "dados mascarados".

Chaves validas de customPermissions (use EXATAMENTE estes nomes):
${permKeys}

Chaves validas de menuPermissions:
${menuKeys}
`;
}

function sanitizeCustom(input: unknown): ICustomPermissions {
  const out = { ...DEFAULT_CUSTOM_PERMISSIONS };
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  const target = out as unknown as Record<string, boolean>;
  for (const key of PERMISSION_KEYS) {
    if (src[key] === true) target[key] = true;
  }
  return out;
}

function sanitizeMenu(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of MENU_KEYS) out[k] = false;
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const k of MENU_KEYS) {
    if (src[k] === true) out[k] = true;
  }
  return out;
}

function stripFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export async function suggestProfile(description: string): Promise<ProfileSuggestion> {
  const systemPrompt = buildSystemPrompt();
  const { result, provider, model } = await generateTemplateViaCopilot(systemPrompt, description);
  const clean = stripFences(result);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("ERR_COPILOT_PARSE");
  }
  const name = String(parsed.name ?? "").trim().slice(0, 60);
  const desc = String(parsed.description ?? "").trim().slice(0, 240);
  return {
    name,
    description: desc,
    customPermissions: sanitizeCustom(parsed.customPermissions),
    menuPermissions: sanitizeMenu(parsed.menuPermissions),
    rationale: String(parsed.rationale ?? ""),
    provider,
    model,
  };
}
