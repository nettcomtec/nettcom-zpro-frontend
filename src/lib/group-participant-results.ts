// Resposta das ações em massa de participantes (adicionar, remover, promover,
// rebaixar): uma entrada por grupo. Backend novo traz `participants` com o
// resultado de cada número e `reason` quando o grupo falhou; backend antigo traz
// só `status`/`message`. Os dois formatos são aceitos.

export const GROUP_ACTION_REASONS = [
  "invite_required",
  "already_in_group",
  "not_allowed",
  "not_on_whatsapp",
  "not_in_group",
  "rejected",
  "session_not_connected",
  "not_admin",
  "group_not_found",
  "timeout",
  "invalid_request",
  "provider_error",
  "unknown",
] as const;

export type GroupActionReason = (typeof GROUP_ACTION_REASONS)[number];

export interface GroupActionSummary {
  groupsTotal: number;
  groupsOk: number;
  participantsApplied: number;
  participantsRejected: number;
  /** motivos das recusas por participante e das falhas de grupo inteiro */
  reasons: { reason: GroupActionReason; count: number }[];
  hasFailures: boolean;
  /** nenhum grupo concluído e nenhum participante aplicado */
  nothingApplied: boolean;
}

const toReason = (value: unknown, fallback: GroupActionReason): GroupActionReason =>
  typeof value === "string" && (GROUP_ACTION_REASONS as readonly string[]).includes(value)
    ? (value as GroupActionReason)
    : fallback;

export function summarizeGroupActionResults(data: unknown): GroupActionSummary {
  const entries = (Array.isArray(data) ? data : []).filter(
    (entry): entry is Record<string, any> => !!entry && typeof entry === "object"
  );
  const counts = new Map<GroupActionReason, number>();
  const count = (reason: GroupActionReason) => counts.set(reason, (counts.get(reason) || 0) + 1);
  let groupsOk = 0;
  let applied = 0;
  let rejected = 0;

  for (const entry of entries) {
    const participants: any[] = Array.isArray(entry.participants) ? entry.participants : [];
    for (const participant of participants) {
      if (participant?.status === "success") applied += 1;
      else if (participant?.status === "error") {
        rejected += 1;
        count(toReason(participant.reason, "rejected"));
      }
    }
    if (entry.status === "error") {
      // Recusa de todos os participantes já entrou na contagem acima.
      if (entry.reason !== "participants_rejected") count(toReason(entry.reason, "unknown"));
    } else {
      groupsOk += 1;
    }
  }

  return {
    groupsTotal: entries.length,
    groupsOk,
    participantsApplied: applied,
    participantsRejected: rejected,
    reasons: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason, total]) => ({ reason, count: total })),
    hasFailures: groupsOk < entries.length || rejected > 0,
    nothingApplied: entries.length > 0 && groupsOk === 0 && applied === 0,
  };
}
