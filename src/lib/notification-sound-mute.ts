import { useAuthStore } from "@/stores/auth-store";

/**
 * Som das notificações só para o usuário logado (botão de som do topo,
 * components/layout/notification-sound-toggle.tsx).
 *
 * Grava em `User.configs.notificationSoundMute` — espelho de
 * backend/src/helpers/NotificationSoundPolicyZPRO.ts, que aplica a mesma escolha ao push
 * (navegador/PWA e app). Mudar um exige o outro.
 *   - "none"   som ligado (padrão; chave ausente ou valor desconhecido = igual);
 *   - "groups" mensagem e atendimento de GRUPO chegam sem som;
 *   - "all"    nenhum som de notificação (atendimento, chat interno e suporte).
 *
 * Silencia só o SOM: o aviso do navegador, o push e o sino continuam. O toque de chamada
 * (lib/call-ringtone.ts) nunca entra. A empresa manda: com "Notificações sonoras" desligada em
 * /configuracoes/geral nada toca, e o botão fica travado.
 */
export type NotificationSoundMuteMode = "none" | "groups" | "all";

export const NOTIFICATION_SOUND_MUTE_CONFIG_KEY = "notificationSoundMute";

/** Aviso entre abas do mesmo navegador (evento `storage`). */
export const NOTIFICATION_SOUND_MUTE_SYNC_KEY = "zpro:notificationSoundMuteSync";

export function normalizeNotificationSoundMuteMode(value: unknown): NotificationSoundMuteMode {
  return value === "groups" || value === "all" ? value : "none";
}

export function getMyNotificationSoundMuteMode(): NotificationSoundMuteMode {
  const configs = useAuthStore.getState().user?.configs as Record<string, unknown> | undefined;
  return normalizeNotificationSoundMuteMode(configs?.[NOTIFICATION_SOUND_MUTE_CONFIG_KEY]);
}

/** O usuário logado desligou este som? `group` = mensagem ou atendimento de grupo. */
export function isNotificationSoundMutedForMe(opts?: { group?: boolean }): boolean {
  const mode = getMyNotificationSoundMuteMode();
  return mode === "all" || (mode === "groups" && opts?.group === true);
}

/**
 * "Notificações sonoras" da empresa desligada. Semântica invertida legada: "enabled" = som
 * LIGADO. Chave ausente (superadmin, empresa sem a linha) = não desligada.
 */
export function isTenantNotificationSoundOff(value: string | undefined | null): boolean {
  return value != null && value !== "enabled";
}

/** Atendimento do payload do socket é de grupo (a linha do atendimento ou o contato). */
export function isGroupTicketPayload(ticket: unknown): boolean {
  if (!ticket || typeof ticket !== "object") return false;
  const tk = ticket as { isGroup?: unknown; contact?: { isGroup?: unknown } | null };
  return tk.isGroup === true || tk.contact?.isGroup === true;
}

// O refresh de 30 s do usuário (layout do dashboard) não pode trazer de volta o valor de antes
// do clique: resposta de leitura que começou antes de uma gravação terminar (nesta aba, ou
// avisada por outra aba) pode ter lido o banco antigo, então o valor local vence nela. Relógio
// monotônico: acertar a hora do aparelho não estica nem encurta a proteção.
let writesInFlight = 0;
let lastWriteSettledAt = Number.NEGATIVE_INFINITY;

export function notificationSoundMuteClock(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function beginNotificationSoundMuteWrite(): void {
  writesInFlight += 1;
}

export function endNotificationSoundMuteWrite(): void {
  writesInFlight = Math.max(0, writesInFlight - 1);
  lastWriteSettledAt = notificationSoundMuteClock();
}

/** Outra aba gravou (aviso pelo evento `storage`, que só sai depois da gravação). */
export function noteNotificationSoundMuteExternalWrite(): void {
  lastWriteSettledAt = notificationSoundMuteClock();
}

/** `true` = a leitura que começou em `readStartedAt` não pode trocar o valor local. */
export function shouldKeepLocalNotificationSoundMute(readStartedAt: number): boolean {
  return writesInFlight > 0 || lastWriteSettledAt >= readStartedAt;
}
