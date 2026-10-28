import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth-store";
import {
  beginNotificationSoundMuteWrite,
  endNotificationSoundMuteWrite,
  isGroupTicketPayload,
  isNotificationSoundMutedForMe,
  isTenantNotificationSoundOff,
  normalizeNotificationSoundMuteMode,
  noteNotificationSoundMuteExternalWrite,
  notificationSoundMuteClock,
  shouldKeepLocalNotificationSoundMute,
} from "@/lib/notification-sound-mute";
import { playNotificationSound } from "@/lib/notification-audio";

/**
 * Botão de som do topo (lib/notification-sound-mute.ts, espelho de
 * backend/src/helpers/NotificationSoundPolicyZPRO.ts): som ligado, grupos sem som ou tudo
 * sem som, só para o usuário logado.
 */
function setMode(mode: unknown) {
  useAuthStore.setState({
    user: { userId: 7, tenantId: 1, profile: "user", whatsappAllowed: [], configs: { notificationSoundMute: mode } },
  } as never);
}

describe("escolha do som do usuário", () => {
  afterEach(() => {
    useAuthStore.setState({ user: null } as never);
  });

  it("valor fora da lista vale como som ligado", () => {
    expect(normalizeNotificationSoundMuteMode(undefined)).toBe("none");
    expect(normalizeNotificationSoundMuteMode("ALL")).toBe("none");
    expect(normalizeNotificationSoundMuteMode(true)).toBe("none");
    expect(normalizeNotificationSoundMuteMode("groups")).toBe("groups");
    expect(normalizeNotificationSoundMuteMode("all")).toBe("all");
  });

  it("som ligado: nada é silenciado", () => {
    setMode("none");
    expect(isNotificationSoundMutedForMe()).toBe(false);
    expect(isNotificationSoundMutedForMe({ group: true })).toBe(false);
  });

  it("grupos sem som: só o aviso de grupo fica mudo", () => {
    setMode("groups");
    expect(isNotificationSoundMutedForMe({ group: true })).toBe(true);
    expect(isNotificationSoundMutedForMe({ group: false })).toBe(false);
    // Chat Privado e suporte não dizem que são grupo: continuam tocando.
    expect(isNotificationSoundMutedForMe()).toBe(false);
  });

  it("tudo sem som: qualquer aviso fica mudo", () => {
    setMode("all");
    expect(isNotificationSoundMutedForMe()).toBe(true);
    expect(isNotificationSoundMutedForMe({ group: false })).toBe(true);
    expect(isNotificationSoundMutedForMe({ group: true })).toBe(true);
  });

  it("sem usuário logado: som ligado", () => {
    useAuthStore.setState({ user: null } as never);
    expect(isNotificationSoundMutedForMe({ group: true })).toBe(false);
  });

  it("som da empresa: só 'enabled' é ligado, chave ausente não trava", () => {
    expect(isTenantNotificationSoundOff("enabled")).toBe(false);
    expect(isTenantNotificationSoundOff(undefined)).toBe(false);
    expect(isTenantNotificationSoundOff(null)).toBe(false);
    expect(isTenantNotificationSoundOff("disabled")).toBe(true);
  });

  it("grupo pelo atendimento ou pelo contato do atendimento", () => {
    expect(isGroupTicketPayload({ id: 1, isGroup: true })).toBe(true);
    expect(isGroupTicketPayload({ id: 1, isGroup: false, contact: { isGroup: true } })).toBe(true);
    expect(isGroupTicketPayload({ id: 1, isGroup: false, contact: { isGroup: false } })).toBe(false);
    expect(isGroupTicketPayload({ id: 1 })).toBe(false);
    expect(isGroupTicketPayload(null)).toBe(false);
    expect(isGroupTicketPayload("1")).toBe(false);
  });
});

describe("refresh de 30 s não desfaz o clique", () => {
  let now = 0;

  beforeEach(() => {
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leitura anterior a uma gravação mantém o valor local; leitura posterior vale o servidor", () => {
    now = 1_000;
    const readBeforeClick = notificationSoundMuteClock();
    beginNotificationSoundMuteWrite();
    // Gravação em andamento: nenhuma leitura troca o valor local.
    expect(shouldKeepLocalNotificationSoundMute(readBeforeClick)).toBe(true);
    now = 1_100;
    expect(shouldKeepLocalNotificationSoundMute(notificationSoundMuteClock())).toBe(true);

    now = 1_200;
    endNotificationSoundMuteWrite();
    // Começou antes de a gravação terminar (pode ter lido o banco antigo), mesmo voltando tarde.
    now = 60_000;
    expect(shouldKeepLocalNotificationSoundMute(readBeforeClick)).toBe(true);
    // Começou depois: o servidor já tem a escolha.
    expect(shouldKeepLocalNotificationSoundMute(1_201)).toBe(false);
  });

  it("escolha feita em outra aba protege a leitura que já estava no ar", () => {
    now = 100_000;
    const readInFlight = notificationSoundMuteClock();
    now = 100_500;
    noteNotificationSoundMuteExternalWrite();
    expect(shouldKeepLocalNotificationSoundMute(readInFlight)).toBe(true);
    expect(shouldKeepLocalNotificationSoundMute(100_501)).toBe(false);
  });

  it("término a mais não deixa a gravação presa como em andamento", () => {
    now = 200_000;
    endNotificationSoundMuteWrite();
    endNotificationSoundMuteWrite();
    expect(shouldKeepLocalNotificationSoundMute(200_001)).toBe(false);
  });
});

describe("playNotificationSound respeita a escolha", () => {
  let audioContexts = 0;
  let audios = 0;

  beforeEach(() => {
    audioContexts = 0;
    audios = 0;
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        constructor() {
          audioContexts++;
        }
        decodeAudioData() {
          return Promise.reject(new Error("sem áudio no teste"));
        }
      },
    );
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          audios++;
        }
        play() {
          return Promise.resolve();
        }
      },
    );
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sem rede no teste"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null } as never);
  });

  it("tudo sem som: não chega a tocar", async () => {
    setMode("all");
    await playNotificationSound("/som.mp3");
    expect(audioContexts + audios).toBe(0);
  });

  it("grupos sem som: grupo não toca, conversa comum toca", async () => {
    setMode("groups");
    await playNotificationSound("/som.mp3", { group: true });
    expect(audioContexts + audios).toBe(0);
    await playNotificationSound("/som.mp3", { group: false });
    expect(audioContexts + audios).toBeGreaterThan(0);
  });
});
