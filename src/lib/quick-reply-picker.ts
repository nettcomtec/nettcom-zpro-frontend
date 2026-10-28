// Seletor de mensagens rápidas ("/") dos diálogos que iniciam conversa (Nova Conversa,
// conversa avulsa do /atendimento e Funil). Só texto entra aqui: arquivos, botões, lista
// e localização dependem do atendimento e continuam sendo enviados pelo chat.
// docs/PLANO_NOVA_CONVERSA_MENSAGENS_RAPIDAS.md (D2, D4, D7).

import type { FastReply } from "@/services/fast-reply";
import { parseQuickReplyTemplate, type QuickReplyTemplateRef } from "@/lib/quick-reply-template";

/** Mesma regra do chat: públicas para todos, privadas só para o dono; `userId` nulo (legado) aparece. */
export function visibleQuickReplies(rows: FastReply[], userId: number | string | null | undefined): FastReply[] {
  return rows.filter((r) => {
    if (r.isPublic) return true;
    if (userId == null) return true;
    if (r.userId == null) return true;
    return String(r.userId) === String(userId);
  });
}

/** Só a rápida de texto com texto de verdade entra na lista do diálogo. */
export function isTextQuickReply(r: FastReply): boolean {
  const mt = r.messageType || "text";
  if (mt !== "text") return false;
  const msg = typeof r.message === "string" ? r.message.trim() : "";
  return msg !== "" && msg !== "null";
}

export interface SlashToken {
  /** Posição do "/" no texto. */
  start: number;
  /** Fim da palavra (exclusivo). */
  end: number;
  /** O que vem depois do "/", até o fim da palavra. */
  query: string;
}

const isSpace = (ch: string) => ch === " " || ch === "\n" || ch === "\t" || ch === "\r";

/**
 * Palavra sob o cursor que começa com "/" no início do campo ou depois de espaço/quebra
 * de linha. O cursor precisa estar depois do "/" (com ele antes do "/" não é atalho).
 * Link ("https://x/y") e "e/ou" não contam: a palavra não começa com "/".
 */
export function findSlashToken(text: string, caret: number): SlashToken | null {
  const value = text || "";
  const pos = Math.max(0, Math.min(caret, value.length));
  let start = pos;
  while (start > 0 && !isSpace(value[start - 1])) start--;
  if (value[start] !== "/" || pos <= start) return null;
  let end = pos;
  while (end < value.length && !isSpace(value[end])) end++;
  return { start, end, query: value.slice(start + 1, end) };
}

const normalizeKey = (key: string | null | undefined) => (key || "").replace(/^\//, "").toLowerCase();

/** "Começa com" antes de "contém", pelo atalho (sem o "/" e sem maiúscula). Busca vazia = todas. */
export function rankQuickReplies(
  rows: FastReply[],
  query: string,
  limit = 50,
): { items: FastReply[]; more: boolean } {
  const q = (query || "").toLowerCase();
  let ordered: FastReply[];
  if (!q) {
    ordered = rows;
  } else {
    const starts: FastReply[] = [];
    const contains: FastReply[] = [];
    for (const r of rows) {
      const key = normalizeKey(r.key);
      if (key.startsWith(q)) starts.push(r);
      else if (key.includes(q)) contains.push(r);
    }
    ordered = starts.concat(contains);
  }
  return { items: ordered.slice(0, limit), more: ordered.length > limit };
}

/** Troca só o "/atalho" pelo texto da rápida; o resto do campo fica como estava. */
export function applyQuickReplyAtToken(
  text: string,
  token: SlashToken,
  replyText: string,
): { text: string; caret: number } {
  const value = text || "";
  const before = value.slice(0, token.start);
  const after = value.slice(token.end);
  return { text: before + replyText + after, caret: before.length + replyText.length };
}

/**
 * Botão "Mensagens rápidas": insere na última posição conhecida do cursor, com um espaço
 * de separação quando a rápida ficaria colada em outra palavra.
 */
export function insertQuickReplyAt(
  text: string,
  caret: number | null | undefined,
  replyText: string,
): { text: string; caret: number } {
  const value = text || "";
  const pos = caret == null ? value.length : Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, pos);
  const after = value.slice(pos);
  const sepBefore = before && !isSpace(before[before.length - 1]) ? " " : "";
  const sepAfter = after && !isSpace(after[0]) ? " " : "";
  const next = before + sepBefore + replyText + sepAfter + after;
  return { text: next, caret: before.length + sepBefore.length + replyText.length };
}

export interface TemplateQuickReplyShortcut {
  id: number;
  key: string;
  ref: QuickReplyTemplateRef;
}

/** Rápidas do tipo Template, como atalhos no topo da lista de templates (canal oficial). */
export function templateQuickReplyRefs(rows: FastReply[]): TemplateQuickReplyShortcut[] {
  return rows.flatMap((r) => {
    if ((r.messageType || "text") !== "template") return [];
    const ref = parseQuickReplyTemplate(r.templateJson);
    return ref ? [{ id: r.id, key: (r.key || "").replace(/^\//, ""), ref }] : [];
  });
}

export type QuickReplyVarWarningKind = "contactData" | "userEmpty" | "ticketEmpty";

export interface QuickReplyVarWarning {
  kind: QuickReplyVarWarningKind;
  /** Como o atendente escreveu ("{{name}}", "{firstName}"), sem repetir. */
  vars: string[];
}

const CONTACT_VARS = new Set(["name", "firstName", "lastName", "email", "businessName", "cpf", "birthdayDate", "kanban"]);
const USER_VARS = new Set(["user", "userEmail"]);
const TICKET_VARS = new Set(["protocol", "ticketId"]);

// Mesmo formato de nome do pupa do servidor (utils/pupaZPRO.ts); a troca lá diferencia
// maiúscula, então só o nome exato conta.
const VAR_REGEX = /\{\{([a-z$_][\w\-$]*)\}\}|\{([a-z$_][\w\-$]*)\}/gi;

/**
 * Avisos de variável que vai sair vazia (ou com outro valor) no envio:
 * - contactData: dado do cadastro com o contato digitado, não escolhido do sistema;
 * - userEmpty: atendente em "Pendente" (o atendimento fica sem dono);
 * - ticketEmpty: protocolo/atendimento nos envios que criam o atendimento depois.
 */
export function quickReplyVarWarnings(
  text: string,
  opts: { contactKnown: boolean; ownerKnown: boolean; ticketVarsEmpty: boolean },
): QuickReplyVarWarning[] {
  const value = text || "";
  if (!value.includes("{")) return [];
  const found: Record<QuickReplyVarWarningKind, string[]> = { contactData: [], userEmpty: [], ticketEmpty: [] };
  const push = (kind: QuickReplyVarWarningKind, raw: string) => {
    if (!found[kind].includes(raw)) found[kind].push(raw);
  };
  VAR_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_REGEX.exec(value)) !== null) {
    const name = m[1] ?? m[2] ?? "";
    const raw = m[0];
    if (CONTACT_VARS.has(name) && !opts.contactKnown) push("contactData", raw);
    else if (USER_VARS.has(name) && !opts.ownerKnown) push("userEmpty", raw);
    else if (TICKET_VARS.has(name) && opts.ticketVarsEmpty) push("ticketEmpty", raw);
  }
  const order: QuickReplyVarWarningKind[] = ["contactData", "userEmpty", "ticketEmpty"];
  return order.filter((k) => found[k].length > 0).map((kind) => ({ kind, vars: found[kind] }));
}
