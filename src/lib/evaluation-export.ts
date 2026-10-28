import { displayContactIdentity } from "@/lib/contact-identity";
import type { TicketEvaluation } from "@/services/evaluations";

/**
 * Exportação das avaliações (aba Listar de /avaliacoes): regras sem React, para a
 * tela e os testes. O laço de páginas e o arquivo ficam na tela.
 */

/** Tamanho da página buscada pelo export (o servidor novo aceita até 500). */
export const EXPORT_PAGE_SIZE = 500;
/** Páginas buscadas no máximo: 20 × 500 = teto de 10.000 linhas por arquivo. */
export const EXPORT_MAX_PAGES = 20;
export const EXPORT_MAX_ROWS = EXPORT_PAGE_SIZE * EXPORT_MAX_PAGES;

export type EvaluationExportStatus = "answered" | "pending" | "no_response" | "external";

type EvaluationStatusInput = Pick<TicketEvaluation, "type" | "evaluation" | "attempts">;

/**
 * Situação da avaliação. `evaluation` é TEXTO no backend: a nota, a pergunta enviada
 * (pendente ou sem resposta) ou "external".
 * - external: link externo enviado (sem retorno);
 * - answered: a nota é só dígitos (mesmo critério do relatório NPS);
 * - pending: ainda lendo a resposta (`attempts < 2`; o voto tardio ainda conta);
 * - no_response: o resto.
 */
export function evaluationStatus(ev: EvaluationStatusInput): EvaluationExportStatus {
  if (ev.type === "external") return "external";
  if (/^\d+$/.test(String(ev.evaluation ?? "").trim())) return "answered";
  const attempts = Number(ev.attempts);
  if (ev.attempts !== null && ev.attempts !== undefined && Number.isFinite(attempts) && attempts < 2) {
    return "pending";
  }
  return "no_response";
}

/**
 * Servidor novo devolve SEMPRE a chave `userFilter` (null sem filtro). Sem a chave =
 * servidor antigo: ignora o filtro por agente e a busca não filtra.
 */
export function isNewEvaluationsBackend(resp: unknown): boolean {
  return (
    !!resp &&
    typeof resp === "object" &&
    !Array.isArray(resp) &&
    Object.prototype.hasOwnProperty.call(resp, "userFilter")
  );
}

export interface EvaluationExportRow {
  id: number;
  ticketId: number;
  protocol: string;
  contactName: string;
  /** Número/identidade do contato; vazio sem a permissão de exportar contatos. */
  contactIdentity: string;
  agent: string;
  /** Só nas respondidas; nota acima da escala atual sai inteira. */
  score: number | null;
  status: EvaluationExportStatus;
  externalUrl: string;
  sentAt: Date | null;
  /** Só nas respondidas (`updatedAt` da avaliação). */
  answeredAt: Date | null;
  queue: string;
  /** Nome da conexão; nunca o código interno do canal. */
  channel: string;
}

const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

export function buildEvaluationExportRows(
  items: TicketEvaluation[],
  opts: { canSeeNumber: boolean }
): EvaluationExportRow[] {
  return items.map((ev) => {
    const status = evaluationStatus(ev);
    const answered = status === "answered";
    const contact = ev.ticket?.contact ?? null;
    const ticketId = Number(ev.ticketId ?? ev.ticket?.id);
    return {
      id: ev.id,
      ticketId: Number.isFinite(ticketId) ? ticketId : 0,
      protocol: text(ev.ticket?.protocol),
      contactName: text(contact?.name),
      contactIdentity: opts.canSeeNumber ? displayContactIdentity(contact) : "",
      agent: text(ev.user?.name),
      score: answered ? Number(String(ev.evaluation).trim()) : null,
      status,
      externalUrl: text(ev.externalUrl),
      sentAt: toDate(ev.createdAt),
      answeredAt: answered ? toDate(ev.updatedAt) : null,
      queue: text(ev.ticket?.queue?.queue),
      channel: text(ev.ticket?.whatsapp?.name),
    };
  });
}
