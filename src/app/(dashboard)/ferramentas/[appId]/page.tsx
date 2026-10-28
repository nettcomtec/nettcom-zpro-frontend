"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, AppWindow, ExternalLink, Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { usePanelAppsStore, useVisiblePanelApps } from "@/stores/panel-apps-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  PANEL_APP_LAUNCH_ERROR_CODES,
  getPanelAppIcon,
  isSafeLaunchedPanelAppUrl,
  isSafePanelAppUrl,
  type PanelAppNavEntry,
} from "@/lib/panel-apps";
import { launchPanelApp } from "@/services/panel-apps";
import {
  handlePanelAppLaunchError,
  openLaunchedUrlOutside,
  openPanelAppLaunch,
  readPanelAppLiveMode,
} from "@/lib/panel-app-launch";
import { PanelAppFrame, openPanelAppOutside, useIsNativeShell } from "@/components/panel-apps/panel-app-frame";

/**
 * Lançamento pelo menu (fase 2). `appKey` = app + endereço do lançamento (resultado de
 * outra app ou de outro endereço nunca é mostrado); `launchedAt` = relógio do aparelho.
 */
type MenuLaunchState =
  | { status: "loading" }
  | { status: "error"; appKey: string; messageKey: string }
  | { status: "ready"; appKey: string; url: string; launchedAt: number; seq: number; used: boolean };

const menuLaunchAppKey = (app: Pick<PanelAppNavEntry, "id" | "url">): string => `${app.id}|${app.url}`;

/**
 * O link lançado ao abrir a página serve ao 1º "Abrir" da app "nova aba" por 2 minutos
 * (a ficha vale 5): a aba abre direto no toque, sem janela vazia e sem 2º toque no iPhone.
 * Depois disso, ou já usado, o "Abrir" lança de novo.
 */
const MENU_LAUNCH_REUSE_MS = 120_000;

/** Chave do texto do erro (`panelAppLaunch.*`) — mesma regra do aviso da lib. */
function launchErrorMessageKey(err: unknown, code: string): string {
  if ((PANEL_APP_LAUNCH_ERROR_CODES as readonly string[]).includes(code)) return `errors.${code}`;
  // 404 sem código = servidor sem a rota (backend da v1).
  if ((err as { status?: number } | null)?.status === 404 && !code) return "errors.ERR_PANEL_APP_LAUNCH_DISABLED";
  return "errors.generic";
}

/**
 * App do menu com variáveis no endereço (`needsLaunch`, fase 2 §5.7): o link com os dados
 * de quem abre e a ficha é montado pelo servidor ao abrir a página (e a cada F5 — o menu
 * não tem contexto) e no Recarregar, nos dois modos. O endereço gravado (com as variáveis
 * cruas) nunca vai ao iframe nem a outra aba.
 *
 * - O lançamento depende só de `app.id`/`app.url`: o store troca a lista a cada aviso de
 *   socket e lançar a cada aviso recarregaria a app (Ag1-9). Resposta de lançamento antigo
 *   (outra app, página que saiu) é descartada.
 * - Erro: o aviso e os efeitos ficam com `handlePanelAppLaunchError` (servidor sem a fase
 *   2 desliga as ações; app sumida relê a lista); a tela mostra o motivo e "Tentar de
 *   novo" — nada relança sozinho.
 */
function LaunchedPanelAppView({ app }: { app: PanelAppNavEntry }) {
  const t = useTranslations("panelAppView");
  const tLaunch = useTranslations("panelAppLaunch");
  const native = useIsNativeShell();
  const [state, setState] = useState<MenuLaunchState>({ status: "loading" });

  // Versões mais novas da app e do tradutor sem refazer o lançamento.
  const appRef = useRef(app);
  const tLaunchRef = useRef(tLaunch);
  useEffect(() => {
    appRef.current = app;
    tLaunchRef.current = tLaunch;
  });
  const seqRef = useRef(0);

  const launch = useCallback(async (mode: "open" | "reload"): Promise<void> => {
    const target = appRef.current;
    const appKey = menuLaunchAppKey(target);
    const seq = ++seqRef.current;
    if (mode === "open") setState((prev) => (prev.status === "loading" ? prev : { status: "loading" }));
    try {
      const result = await launchPanelApp(target.id, { placement: "menu", liveMode: readPanelAppLiveMode() });
      if (seq !== seqRef.current) return;
      if (!isSafeLaunchedPanelAppUrl(result.url, "new_tab")) throw new Error("ERR_PANEL_APP_URL_INVALID");
      setState({ status: "ready", appKey, url: result.url, launchedAt: Date.now(), seq, used: false });
    } catch (err) {
      if (seq !== seqRef.current) return;
      const code = handlePanelAppLaunchError(err, tLaunchRef.current);
      const messageKey = launchErrorMessageKey(err, code);
      // Recarregar que falha mantém a app aberta (o aviso já apareceu).
      setState((prev) =>
        mode === "reload" && prev.status === "ready" && prev.appKey === appKey
          ? prev
          : { status: "error", appKey, messageKey }
      );
    }
  }, []);

  useEffect(() => {
    void launch("open");
    return () => {
      seqRef.current += 1;
    };
  }, [app.id, app.url, launch]);

  // Resultado de outra app/endereço (entre a troca e o novo lançamento) = carregando.
  const currentAppKey = menuLaunchAppKey(app);
  const view: MenuLaunchState = state.status !== "loading" && state.appKey !== currentAppKey ? { status: "loading" } : state;

  // "Abrir em nova aba" da app embutida: lança de novo em outra aba (chamado no clique).
  const openOutside = () => {
    void openPanelAppLaunch({ app, placement: "menu", forceNewTab: true, t: tLaunch });
  };

  // "Abrir" da app "nova aba": o link desta abertura ainda novo abre direto no toque;
  // senão lança de novo (a lib abre a janela no clique).
  const openNow = () => {
    if (view.status === "ready" && !view.used && Date.now() - view.launchedAt < MENU_LAUNCH_REUSE_MS) {
      if (openLaunchedUrlOutside(view.url)) {
        setState({ ...view, used: true });
        return;
      }
    }
    void openPanelAppLaunch({ app, placement: "menu", t: tLaunch });
  };

  const Icon = getPanelAppIcon(app.icon);

  if (view.status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold break-words">{app.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("launching")}
          </p>
        </div>
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className="space-y-6">
        <div className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-warning/40 bg-warning/10 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <div className="space-y-1">
            <h1 className="font-semibold break-words">{app.name}</h1>
            <p className="text-sm font-medium">{t("launchFailedTitle")}</p>
            <p className="text-sm text-muted-foreground">{tLaunch(view.messageKey)}</p>
          </div>
          <Button variant="outline" onClick={() => void launch("open")} className="gap-1.5">
            <RotateCw className="h-4 w-4" />
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (app.openMode === "new_tab") {
    return (
      <div className="space-y-6">
        <div className="mx-auto mt-6 w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold break-words">{app.name}</h1>
            <p className="text-sm text-muted-foreground">{t("newTabDesc")}</p>
          </div>
          <Button onClick={openNow} className="gap-1.5">
            <ExternalLink className="h-4 w-4" />
            {native ? t("openInBrowser") : t("openApp")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PanelAppFrame
      key={view.seq}
      app={app}
      launchedUrl={view.url}
      onReload={() => launch("reload")}
      onOpenOutside={openOutside}
      extraHints={[t("launchedHint")]}
    />
  );
}

/**
 * App aberta no painel: `/ferramentas/<id>` (D25, §5.5).
 *
 * Quem vê é decidido pelo backend (`/panel-apps/mine`) e pelo seletor único do store
 * (`useVisiblePanelApps`, que já tira as apps da empresa com o interruptor do /tenants
 * desligado — D30). App fora da lista (apagada, desativada, sem acesso, link antigo dos
 * Recentes) = "aplicativo indisponível", nunca a URL. App com variáveis no endereço
 * (`needsLaunch`) abre pelo lançamento (`LaunchedPanelAppView`); a sem variável, como na v1.
 */
export default function PanelAppViewPage() {
  const t = useTranslations("panelAppView");
  const params = useParams();
  const rawParam = params?.appId;
  const rawId = typeof rawParam === "string" ? rawParam : "";
  const appId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;

  const { apps, status } = useVisiblePanelApps();
  const native = useIsNativeShell();
  const userKey = useAuthStore((s) => (s.user?.tenantId && s.user?.userId ? `${s.user.tenantId}:${s.user.userId}` : ""));

  const app = useMemo(
    () => (Number.isInteger(appId) && appId > 0 ? apps.find((a) => a.id === appId) : undefined),
    [apps, appId]
  );

  // Link direto antes de o layout buscar as apps: pede a lista (sem efeito se já está
  // carregando ou pronta — o store descarta a chamada repetida).
  useEffect(() => {
    if (userKey && status === "idle") void usePanelAppsStore.getState().fetch();
  }, [status, userKey]);

  const retry = () => {
    void usePanelAppsStore.getState().fetch({ force: true });
  };

  if (app) {
    if (app.needsLaunch === true) return <LaunchedPanelAppView app={app} />;
    if (app.openMode === "new_tab") {
      const Icon = getPanelAppIcon(app.icon);
      const canOpen = isSafePanelAppUrl(app.url, "new_tab");
      return (
        <div className="space-y-6">
          <div className="mx-auto mt-6 w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold break-words">{app.name}</h1>
              <p className="text-sm text-muted-foreground">
                {canOpen ? t("newTabDesc") : t("cannotOpenDesc")}
              </p>
            </div>
            {canOpen && (
              <Button onClick={() => openPanelAppOutside(app.url)} className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                {native ? t("openInBrowser") : t("openApp")}
              </Button>
            )}
          </div>
        </div>
      );
    }
    return <PanelAppFrame app={app} />;
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-[60dvh] w-full" />
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="space-y-6">
        <div className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-warning/40 bg-warning/10 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <div className="space-y-1">
            <p className="font-semibold">{t("loadFailedTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
          </div>
          <Button variant="outline" onClick={retry} className="gap-1.5">
            <RotateCw className="h-4 w-4" />
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EmptyState icon={AppWindow} title={t("unavailableTitle")} description={t("unavailableDesc")}>
        <Button asChild variant="outline">
          <Link href="/">{t("backHome")}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
