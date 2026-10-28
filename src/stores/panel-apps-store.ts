import { useMemo } from "react";
import { create } from "zustand";
import { useAuthStore } from "./auth-store";
import { fetchMyPanelApps, type PanelAppNoticeVersions } from "@/services/panel-apps";
import {
  selectContextPanelApps,
  selectMenuPanelApps,
  selectVisiblePanelApps,
  type PanelAppLaunchEcho,
  type PanelAppNavEntry,
  type PanelAppPlacement,
} from "@/lib/panel-apps";

/**
 * Apps do usuário logado (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md §5.3 e
 * docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.5).
 *
 * - SEM persistir: o menu não mostra apps antes do 1º GET (aceito).
 * - FORA do `resetAllStores` (Ag1-4/Ag2-A1): `customProfileSettingsChanged` reseta a
 *   empresa inteira e apagaria o menu e a app aberta. Limpo só no `clearAuth`.
 * - `ownerKey` (`${tenantId}:${userId}`) + `generation`: resposta de outro dono ou de
 *   busca antiga é descartada (Ag2-B2).
 * - 404 = backend antigo → lista vazia, terminal. 5xx/rede/429 → mantém a lista atual e
 *   tenta de novo em 5 s, 15 s, 60 s, depois a cada 5 min (Ag1-10/Ag2-M3).
 *
 * Fase 2:
 * - O `/mine` vai sempre com `?launch=1`. `launchSupported` liga no 1º eco da sessão e só
 *   volta a falso com `ERR_PANEL_APP_LAUNCH_DISABLED`/`_NOT_READY`, 404 sem código no
 *   lançamento (backend antigo) ou no `clear` (Ag2-8c) — erro passageiro nunca esconde
 *   o "Abrir em…".
 * - `useVisiblePanelApps`/`getVisiblePanelAppsSnapshot` devolvem SÓ apps de menu (os
 *   consumidores da v1 não mudam — Ag1-9); "Abrir em…" usa `useContextPanelApps`.
 * - `sheet`: o painel lateral da app aberta pelo contato/atendimento (D2). Não persiste.
 */

export type PanelAppsStatus = "idle" | "loading" | "ready" | "unavailable";

/** App aberta no painel lateral (D2): o link já lançado e o contexto, para Recarregar. */
export interface PanelAppSheetState {
  app: PanelAppNavEntry;
  placement: Exclude<PanelAppPlacement, "menu">;
  /** Link final validado (`isSafeLaunchedPanelAppUrl`) ou o endereço da app sem variável. */
  url: string;
  expiresAt: string | null;
  contactId?: number;
  ticketId?: number;
  /** Atendimento pelo qual a tela chegou ao contato (Recarregar/nova aba repetem a dica). */
  ticketIdHint?: number;
  /** Muda a cada abertura/relançamento: `key` do iframe (recarrega a app). */
  openedAt: number;
}

interface PanelAppsState {
  apps: PanelAppNavEntry[];
  status: PanelAppsStatus;
  ownerKey: string | null;
  generation: number;
  /** Fase 2 ligada no servidor (eco visto nesta sessão). */
  launchSupported: boolean;
  sheet: PanelAppSheetState | null;
  /** `force` refaz mesmo com a lista pronta; `versions` = `v` dos avisos de socket, por escopo. */
  fetch: (opts?: { force?: boolean; versions?: PanelAppNoticeVersions }) => Promise<void>;
  clear: () => void;
  /** Eco da gestão (`GET /panel-apps`, `/panel-apps-global`) também liga a fase 2. */
  noteLaunchEcho: (echo: PanelAppLaunchEcho | null | undefined) => void;
  /** Lançamento recusado por fase desligada/ausente: esconde as ações da fase 2. */
  setLaunchUnsupported: () => void;
  openSheet: (sheet: Omit<PanelAppSheetState, "openedAt">) => void;
  closeSheet: () => void;
}

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];
const EMPTY: PanelAppNavEntry[] = [];

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let requestSeq = 0;

const clearRetry = () => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
};

const currentOwnerKey = (): string | null => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user?.tenantId || !user?.userId) return null;
  return `${user.tenantId}:${user.userId}`;
};

export const usePanelAppsStore = create<PanelAppsState>((set, get) => ({
  apps: EMPTY,
  status: "idle",
  ownerKey: null,
  generation: 0,
  launchSupported: false,
  sheet: null,

  fetch: async (opts) => {
    const key = currentOwnerKey();
    if (!key) return;

    if (get().ownerKey !== key) {
      clearRetry();
      retryAttempt = 0;
      set({
        apps: EMPTY,
        status: "idle",
        ownerKey: key,
        generation: get().generation + 1,
        launchSupported: false,
        sheet: null,
      });
    }

    const { status } = get();
    if (!opts?.force && (status === "loading" || status === "ready")) return;

    clearRetry();
    const generation = get().generation;
    const seq = ++requestSeq;
    // Lista já carregada continua "ready" durante a recarga (menu e app aberta não piscam).
    if (status !== "ready") set({ status: "loading" });

    const isCurrent = () =>
      seq === requestSeq && get().generation === generation && get().ownerKey === key && currentOwnerKey() === key;

    try {
      const { apps, launch } = await fetchMyPanelApps(opts?.versions, { launch: true });
      if (!isCurrent()) return;
      retryAttempt = 0;
      set(launch ? { apps, status: "ready", launchSupported: true } : { apps, status: "ready" });
    } catch (err) {
      if (!isCurrent()) return;
      const httpStatus = (err as { status?: number } | null)?.status;
      if (httpStatus === 404) {
        // Backend sem a rota: menu de hoje, sem nova tentativa.
        set({ apps: EMPTY, status: "ready" });
        return;
      }
      if (httpStatus === 401 || httpStatus === 402 || httpStatus === 403) {
        // Sessão, permissão ou empresa bloqueada por pagamento: quem resolve é o fluxo de
        // login/pagamento; nada a repetir aqui.
        if (get().status !== "ready") set({ status: "unavailable" });
        return;
      }
      if (get().status !== "ready") set({ status: "unavailable" });
      const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (currentOwnerKey() !== key) return;
        void get().fetch({ force: true });
      }, delay);
    }
  },

  clear: () => {
    clearRetry();
    retryAttempt = 0;
    requestSeq += 1;
    set((s) => ({
      apps: EMPTY,
      status: "idle",
      ownerKey: null,
      generation: s.generation + 1,
      launchSupported: false,
      sheet: null,
    }));
  },

  noteLaunchEcho: (echo) => {
    if (echo && typeof echo.v === "number" && echo.v >= 1 && !get().launchSupported) set({ launchSupported: true });
  },

  setLaunchUnsupported: () => {
    if (get().launchSupported || get().sheet) set({ launchSupported: false, sheet: null });
  },

  openSheet: (sheet) => {
    set({ sheet: { ...sheet, openedAt: Date.now() } });
  },

  closeSheet: () => {
    if (get().sheet) set({ sheet: null });
  },
}));

/**
 * Lista VISÍVEL das apps DO MENU (sidebar, busca rápida, visualizador, recentes): só do
 * dono atual, passada pelo seletor único (`selectVisiblePanelApps`, D30) e só com as apps
 * que aparecem no menu (app só de contato/atendimento fica de fora — Ag1-9).
 */
export function useVisiblePanelApps(): { apps: PanelAppNavEntry[]; status: PanelAppsStatus } {
  const apps = usePanelAppsStore((s) => s.apps);
  const ownerKey = usePanelAppsStore((s) => s.ownerKey);
  const status = usePanelAppsStore((s) => s.status);
  const userKey = useAuthStore((s) => (s.user?.tenantId && s.user?.userId ? `${s.user.tenantId}:${s.user.userId}` : null));
  const tenantMenuVisibility = useAuthStore((s) => s.tenantMenuVisibility);
  const isOwner = !!ownerKey && ownerKey === userKey;
  const visible = useMemo(
    () => (isOwner ? selectMenuPanelApps(selectVisiblePanelApps(apps, tenantMenuVisibility)) : EMPTY),
    [isOwner, apps, tenantMenuVisibility]
  );
  return { apps: visible, status: isOwner ? status : "idle" };
}

/** Mesma lista fora de componente (ex.: rótulo dos Recentes no layout). */
export function getVisiblePanelAppsSnapshot(): { apps: PanelAppNavEntry[]; status: PanelAppsStatus } {
  const { apps, ownerKey, status } = usePanelAppsStore.getState();
  const key = currentOwnerKey();
  if (!ownerKey || ownerKey !== key) return { apps: EMPTY, status: "idle" };
  return {
    apps: selectMenuPanelApps(selectVisiblePanelApps(apps, useAuthStore.getState().tenantMenuVisibility)),
    status,
  };
}

/**
 * Apps da ação "Abrir em…" do contato (`contact`) ou do atendimento (`ticket`): só com a
 * fase 2 ligada (`launchSupported`), do dono atual, depois do seletor único (D30) e só as
 * da empresa com o lugar marcado. Lista vazia = a ação não aparece.
 */
export function useContextPanelApps(placement: Exclude<PanelAppPlacement, "menu">): {
  apps: PanelAppNavEntry[];
  launchSupported: boolean;
} {
  const apps = usePanelAppsStore((s) => s.apps);
  const ownerKey = usePanelAppsStore((s) => s.ownerKey);
  const launchSupported = usePanelAppsStore((s) => s.launchSupported);
  const userKey = useAuthStore((s) => (s.user?.tenantId && s.user?.userId ? `${s.user.tenantId}:${s.user.userId}` : null));
  const tenantMenuVisibility = useAuthStore((s) => s.tenantMenuVisibility);
  const isOwner = !!ownerKey && ownerKey === userKey;
  const visible = useMemo(
    () =>
      isOwner && launchSupported
        ? selectContextPanelApps(selectVisiblePanelApps(apps, tenantMenuVisibility), placement)
        : EMPTY,
    [isOwner, launchSupported, apps, tenantMenuVisibility, placement]
  );
  return { apps: visible, launchSupported: isOwner && launchSupported };
}
