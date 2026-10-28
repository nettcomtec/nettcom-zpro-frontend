import { toast } from "sonner";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { getNativePlatform, isNativeApp } from "@/lib/native";
import {
  PANEL_APP_LAUNCH_ERROR_CODES,
  isSafeLaunchedPanelAppUrl,
  isSafePanelAppUrl,
  type PanelAppNavEntry,
  type PanelAppPlacement,
} from "@/lib/panel-apps";
import { launchPanelApp } from "@/services/panel-apps";
import { useLiveModeStore } from "@/stores/live-mode-store";
import { usePanelAppsStore } from "@/stores/panel-apps-store";
import { useTicketStore } from "@/stores/ticket-store";

/**
 * Abrir uma app pelo contato, pelo atendimento ou pelo menu com variáveis
 * (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.5, D2).
 *
 * - App SEM variável (`needsLaunch` falso): abre o endereço gravado, como na v1, sem
 *   chamada nova (§5.0).
 * - App COM variável: `POST /panel-apps/:id/launch` com SÓ ids (o `ticket.whatsapp` do
 *   store tem tokens — 4.9 item 8); o modo ao vivo vai junto (D8).
 * - Embutida pelo contato/atendimento: painel lateral (`openSheet`) com o link validado.
 *   Nova aba (app "nova aba", menu, ou "Abrir em nova aba"): fora do app nativo, a janela
 *   vazia abre NO CLIQUE (`window.open` depois de `await` é bloqueado), sem `noopener`
 *   (com ele o `window.open` devolve null); depois do lançamento `opener = null` e
 *   `location.replace`. Janela recusada = aviso com "Abrir" (2º gesto). App nativo: nunca
 *   pré-abre; Android manda o `window.open` ao navegador do sistema; iOS sem gesto não abre
 *   → aviso com "Abrir".
 * - `ERR_PANEL_APP_LAUNCH_DISABLED`/`_NOT_READY` e 404 SEM código (backend da v1) desligam
 *   as ações da fase 2 na sessão (`setLaunchUnsupported`).
 * - Painel lateral: só o ÚLTIMO clique vale. A resposta que chega depois de outro clique, de
 *   outra página ou (no /atendimento) de outro atendimento na tela é descartada — nunca a
 *   app com os dados de um cliente por cima da tela de outro (D2).
 */

/** Tradutor do namespace `panelAppLaunch` (`useTranslations("panelAppLaunch")`). */
export type PanelAppLaunchTranslator = (key: string, values?: Record<string, string | number>) => string;

export interface OpenPanelAppLaunchArgs {
  app: PanelAppNavEntry;
  placement: PanelAppPlacement;
  contactId?: number;
  ticketId?: number;
  /** Só no contato: atendimento pelo qual a tela chegou a ele (`?ticketId=` do perfil). */
  ticketIdHint?: number;
  /**
   * Nova aba mesmo sendo app embutida ("Abrir em nova aba" do painel lateral e do
   * visualizador). Pelo MENU a abertura aqui é sempre nova aba: a embutida do menu abre
   * na página `/ferramentas/<id>`, que lança sozinha.
   */
  forceNewTab?: boolean;
  t: PanelAppLaunchTranslator;
}

/** sheet = painel lateral aberto; tab = nova aba aberta; pending = aviso com "Abrir"; busy = clique repetido. */
export type OpenPanelAppLaunchResult = "sheet" | "tab" | "pending" | "busy" | "error";

const READY_TOAST_MS = 30_000;
const inflight = new Set<string>();

// Retrato do clique que abre o painel lateral (ver topo): número do clique, página e, no
// /atendimento, o atendimento na tela.
const ATENDIMENTO_PATH = /^\/atendimento(\/|$)/;
let sheetLaunchSeq = 0;

interface SheetLaunchStamp {
  seq: number;
  path: string;
  ticketId: number | null;
}

const currentPath = (): string => (typeof window !== "undefined" ? window.location.pathname : "");

const currentScreenTicketId = (): number | null => {
  const id = Number(useTicketStore.getState().currentTicket?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const stampSheetLaunch = (): SheetLaunchStamp => {
  const path = currentPath();
  return { seq: ++sheetLaunchSeq, path, ticketId: ATENDIMENTO_PATH.test(path) ? currentScreenTicketId() : null };
};

const isSheetLaunchCurrent = (stamp: SheetLaunchStamp): boolean => {
  if (stamp.seq !== sheetLaunchSeq) return false;
  const path = currentPath();
  if (path !== stamp.path) return false;
  return !ATENDIMENTO_PATH.test(path) || currentScreenTicketId() === stamp.ticketId;
};

/** Modo ao vivo ligado agora (lido no clique). */
export function readPanelAppLiveMode(): boolean {
  const state = useLiveModeStore.getState();
  return state.envEnabled === true && state.active === true;
}

/** Abre o link LANÇADO fora do painel (2º gesto, nova aba ou navegador do aparelho). */
export function openLaunchedUrlOutside(url: string): boolean {
  if (!isSafeLaunchedPanelAppUrl(url, "new_tab")) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Código do erro do lançamento (corpo do backend ou o `Error` da própria tela). */
export function panelAppLaunchErrorCode(err: unknown): string {
  const code = getBackendErrorCode(err);
  if (code) return code;
  return err instanceof Error && /^ERR_[A-Z_]+$/.test(err.message) ? err.message : "";
}

/**
 * Trata o erro do lançamento: desliga a fase 2 quando o servidor não a tem, relê a lista
 * quando a app sumiu e mostra o aviso traduzido. Devolve o código (vazio = desconhecido).
 */
export function handlePanelAppLaunchError(err: unknown, t: PanelAppLaunchTranslator): string {
  const status = (err as { status?: number } | null)?.status;
  const code = panelAppLaunchErrorCode(err);
  const oldBackend = status === 404 && !code;
  if (code === "ERR_PANEL_APP_LAUNCH_DISABLED" || code === "ERR_PANEL_APP_LAUNCH_NOT_READY" || oldBackend) {
    usePanelAppsStore.getState().setLaunchUnsupported();
  }
  if (code === "ERR_PANEL_APP_NOT_FOUND") {
    void usePanelAppsStore.getState().fetch({ force: true });
  }
  const known = (PANEL_APP_LAUNCH_ERROR_CODES as readonly string[]).includes(code);
  const key = oldBackend ? "errors.ERR_PANEL_APP_LAUNCH_DISABLED" : known ? `errors.${code}` : "errors.generic";
  toast.error(t(key));
  return code;
}

const offerOpen = (url: string, t: PanelAppLaunchTranslator): void => {
  toast.message(t("readyTitle"), {
    description: t("readyDesc"),
    duration: READY_TOAST_MS,
    action: { label: t("open"), onClick: () => void openLaunchedUrlOutside(url) },
  });
};

/** Nova aba de um link já pronto (com a janela pré-aberta no clique, quando houver). */
const deliverToTab = (url: string, preOpened: Window | null, t: PanelAppLaunchTranslator): OpenPanelAppLaunchResult => {
  if (preOpened && !preOpened.closed) {
    try {
      preOpened.opener = null;
      preOpened.location.replace(url);
      return "tab";
    } catch {
      try {
        preOpened.close();
      } catch {
        // janela já fechada
      }
    }
  }
  if (isNativeApp() && getNativePlatform() === "android") {
    // Android abre o window.open no navegador do sistema, mesmo sem gesto.
    window.open(url, "_blank");
    return "tab";
  }
  offerOpen(url, t);
  return "pending";
};

/** Abre a app (ver regras no topo). Nunca lança: erro vira aviso e "error". */
export async function openPanelAppLaunch(args: OpenPanelAppLaunchArgs): Promise<OpenPanelAppLaunchResult> {
  const { app, placement, contactId, ticketId, forceNewTab, t } = args;
  const ticketIdHint = placement === "contact" ? args.ticketIdHint : undefined;
  const asTab = forceNewTab === true || app.openMode === "new_tab" || placement === "menu";
  const sheetPlacement = placement === "menu" ? null : placement;
  // Todo clique que abre o painel lateral (com ou sem variável) passa à frente dos anteriores.
  const sheetStamp = !asTab && sheetPlacement ? stampSheetLaunch() : null;

  // App sem variável: o endereço gravado, como na v1 (sem dado do cliente, sem registro).
  if (app.needsLaunch !== true) {
    if (asTab || !sheetPlacement) {
      if (!isSafePanelAppUrl(app.url, "new_tab")) {
        toast.error(t("errors.ERR_PANEL_APP_URL_INVALID"));
        return "error";
      }
      window.open(app.url, "_blank", "noopener,noreferrer");
      return "tab";
    }
    if (!isSafePanelAppUrl(app.url, "embed")) {
      toast.error(t("errors.ERR_PANEL_APP_URL_INVALID"));
      return "error";
    }
    usePanelAppsStore
      .getState()
      .openSheet({ app, placement: sheetPlacement, url: app.url, expiresAt: null, contactId, ticketId, ticketIdHint });
    return "sheet";
  }

  const key = `${app.id}:${placement}:${contactId ?? ""}:${ticketId ?? ""}:${asTab ? 1 : 0}`;
  if (inflight.has(key)) return "busy";
  inflight.add(key);

  // Janela vazia no CLIQUE (fora do app nativo): depois do await o navegador bloquearia.
  let preOpened: Window | null = null;
  if (asTab && !isNativeApp()) {
    try {
      preOpened = window.open("about:blank", "_blank");
    } catch {
      preOpened = null;
    }
  }

  try {
    const result = await launchPanelApp(app.id, {
      placement,
      contactId: placement === "menu" ? undefined : contactId,
      ticketId: placement === "ticket" ? ticketId : undefined,
      ticketIdHint,
      liveMode: readPanelAppLiveMode(),
    });
    if (!isSafeLaunchedPanelAppUrl(result.url, asTab ? "new_tab" : "embed")) {
      throw new Error("ERR_PANEL_APP_URL_INVALID");
    }
    if (!asTab && sheetPlacement) {
      // Outro clique, outra página ou outro atendimento na tela desde o clique: descarta.
      if (!sheetStamp || !isSheetLaunchCurrent(sheetStamp)) return "busy";
      usePanelAppsStore.getState().openSheet({
        app,
        placement: sheetPlacement,
        url: result.url,
        expiresAt: result.expiresAt,
        contactId,
        ticketId,
        ticketIdHint,
      });
      return "sheet";
    }
    return deliverToTab(result.url, preOpened, t);
  } catch (err) {
    if (preOpened) {
      try {
        preOpened.close();
      } catch {
        // janela já fechada
      }
    }
    handlePanelAppLaunchError(err, t);
    return "error";
  } finally {
    inflight.delete(key);
  }
}

/**
 * "Recarregar" do painel lateral: lança de novo (ficha nova) e troca o link; app sem
 * variável só recarrega o iframe. Painel fechado no meio = nada muda.
 */
export async function relaunchPanelAppSheet(t: PanelAppLaunchTranslator): Promise<OpenPanelAppLaunchResult> {
  const sheet = usePanelAppsStore.getState().sheet;
  if (!sheet) return "error";
  if (sheet.app.needsLaunch !== true) {
    usePanelAppsStore.getState().openSheet({ ...sheet });
    return "sheet";
  }
  const key = `${sheet.app.id}:${sheet.placement}:${sheet.contactId ?? ""}:${sheet.ticketId ?? ""}:0`;
  if (inflight.has(key)) return "busy";
  inflight.add(key);
  try {
    const result = await launchPanelApp(sheet.app.id, {
      placement: sheet.placement,
      contactId: sheet.contactId,
      ticketId: sheet.placement === "ticket" ? sheet.ticketId : undefined,
      ticketIdHint: sheet.placement === "contact" ? sheet.ticketIdHint : undefined,
      liveMode: readPanelAppLiveMode(),
    });
    if (!isSafeLaunchedPanelAppUrl(result.url, "embed")) throw new Error("ERR_PANEL_APP_URL_INVALID");
    const current = usePanelAppsStore.getState().sheet;
    // Fechado ou trocado por outra app enquanto lançava: não reabre.
    if (!current || current.app.id !== sheet.app.id || current.openedAt !== sheet.openedAt) return "busy";
    usePanelAppsStore.getState().openSheet({ ...current, url: result.url, expiresAt: result.expiresAt });
    return "sheet";
  } catch (err) {
    handlePanelAppLaunchError(err, t);
    return "error";
  } finally {
    inflight.delete(key);
  }
}
