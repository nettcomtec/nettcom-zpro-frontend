"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronRight, ExternalLink, Info, Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isNativeApp } from "@/lib/native";
import { useAuthStore } from "@/stores/auth-store";
import {
  PANEL_APP_CATEGORIES,
  USER_ACTIVITY_EVENT,
  getPanelAppIcon,
  isSafeLaunchedPanelAppUrl,
  isSafePanelAppUrl,
  resolvePanelAppCategoryKey,
  type PanelAppNavEntry,
} from "@/lib/panel-apps";

/**
 * App embutida aberta no miolo do painel (D25, §5.5).
 *
 * - Ocupa a área central inteira (receita do /atendimento: `absolute inset-0`), com uma
 *   barra fina: "Categoria › Nome", Recarregar, "Abrir em nova aba" em destaque (no app
 *   nativo, "Abrir no navegador" — D13), e a dica de login/sites que não abrem (D23/D26).
 * - App marcada "não aceita ser aberta no painel" (`embedCheck === "blocked"`) mostra o
 *   aviso com "Abrir em nova aba" no lugar do iframe; dá para tentar mesmo assim.
 * - iframe SÓ com endereço seguro para embutir (`isSafePanelAppUrl(url, "embed")`), com
 *   sandbox fixo SEM navegação do topo (D10) e nada além do endereço gravado — nenhum
 *   token ou dado do painel vai para a app.
 * - Inatividade (D16): a cada 30 s, com a aba visível, a janela com foco e o foco no
 *   iframe, avisa o controle de inatividade do painel.
 * - Sem manter aberta (D15): sair da página desmonta o iframe; ao voltar, recarrega.
 *
 * Fase 2 (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.7), tudo por props opcionais —
 * sem elas o comportamento é o da v1:
 * - `launchedUrl`: o link já montado pelo servidor (dados + ficha) vira o `src`, conferido
 *   por `isSafeLaunchedPanelAppUrl` (inválido = "não pode abrir aqui"). O endereço gravado
 *   (que pode ter variáveis) nunca vai ao iframe nem a outra aba nesse modo.
 * - `onReload`: "Recarregar" lança de novo (ficha nova) em vez de só recarregar o iframe.
 * - `onOpenOutside`: "Abrir em nova aba" lança de novo em outra aba; com `launchedUrl` e
 *   sem ele, o botão não aparece.
 * - `contextLabel`, `extraHints`, `barEnd`: rótulo "Contato"/"Atendimento" no lugar da
 *   categoria, textos a mais na dica e o fim da barra (Fechar) do painel lateral.
 */

export interface PanelAppFrameProps {
  app: PanelAppNavEntry;
  /** Link lançado (até 4096). O pai troca a `key` do quadro a cada lançamento. */
  launchedUrl?: string;
  /** Recarregar = lançar de novo. Promise = botão ocupado até terminar. */
  onReload?: () => void | Promise<unknown>;
  /** Abrir em nova aba = lançar de novo em outra aba (chamado NO clique: a janela abre nele). */
  onOpenOutside?: () => void;
  /** Rótulo antes do nome no lugar da categoria (painel lateral: "Contato", "Atendimento"). */
  contextLabel?: string;
  /** Parágrafos a mais na dica do botão de informação da barra. */
  extraHints?: string[];
  /** Conteúdo no fim da barra (painel lateral: Fechar). */
  barEnd?: React.ReactNode;
}

const IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-storage-access-by-user-activation";

const ACTIVITY_INTERVAL_MS = 30_000;
const LOADING_INDICATOR_MAX_MS = 12_000;

/** Categoria canônica conhecida (fora da lista = "ferramentas"). Sem importar o formulário. */
const canonicalCategory = (category: string | null | undefined): string =>
  category && (PANEL_APP_CATEGORIES as readonly string[]).includes(category) ? category : "ferramentas";

/** Abre a app fora do painel (nova aba / navegador do aparelho). Só endereço seguro. */
export function openPanelAppOutside(url: string): boolean {
  if (!isSafePanelAppUrl(url, "new_tab")) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** "Abrir em nova aba" ou, no app nativo, "Abrir no navegador" (D13). */
export function useIsNativeShell(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}

export function PanelAppFrame({
  app,
  launchedUrl,
  onReload,
  onOpenOutside,
  contextLabel,
  extraHints,
  barEnd,
}: PanelAppFrameProps) {
  const t = useTranslations("panelAppView");
  const tf = useTranslations("panelAppForm");
  const profile = useAuthStore((s) => s.user?.profile);
  const native = useIsNativeShell();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [forceEmbed, setForceEmbed] = useState(false);
  // Fase 2: relançamento em andamento (o pai devolve uma Promise no onReload).
  const [reloadBusy, setReloadBusy] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Outra app aberta na mesma página (navegação entre /ferramentas/<id>): começa do zero.
  useEffect(() => {
    setLoaded(false);
    setForceEmbed(false);
    setReloadKey(0);
  }, [app.id, app.url]);

  // Indicador de carregamento com prazo (alguns sites nunca disparam o load no iframe)
  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setLoaded(true), LOADING_INDICATOR_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, reloadKey]);

  // Fase 2: com o link lançado, ele é o único endereço usado (o gravado pode ter variáveis).
  const launched = typeof launchedUrl === "string";
  const frameSrc = launched ? launchedUrl : app.url;
  const canEmbed = launched ? isSafeLaunchedPanelAppUrl(launchedUrl, "embed") : isSafePanelAppUrl(app.url, "embed");
  const canOpenOutside = onOpenOutside ? true : !launched && isSafePanelAppUrl(app.url, "new_tab");
  const openOutside = () => {
    if (onOpenOutside) {
      onOpenOutside();
      return;
    }
    if (!launched) openPanelAppOutside(app.url);
  };
  const blocked = app.embedCheck === "blocked";
  const showIframe = canEmbed && (!blocked || forceEmbed);

  // D16 — uso dentro da app conta como atividade (eventos do iframe de outra origem
  // não sobem para o painel).
  useEffect(() => {
    if (!showIframe) return;
    const timer = window.setInterval(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        document.activeElement === iframe
      ) {
        document.dispatchEvent(new Event(USER_ACTIVITY_EVENT));
      }
    }, ACTIVITY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [showIframe]);

  const categoryKey = resolvePanelAppCategoryKey(profile, canonicalCategory(app.category));
  // Rótulo do caminho: a categoria do menu do perfil (a que não existe para ele cai em Ferramentas)
  const categoryLabel =
    categoryKey === "ferramentas"
      ? tf("categories.ferramentas")
      : tf(`categories.${canonicalCategory(app.category)}`);
  const Icon = getPanelAppIcon(app.icon);
  const openOutsideLabel = native ? t("openInBrowser") : t("openNewTab");
  const breadcrumbLabel = contextLabel || categoryLabel;

  const reload = () => {
    if (onReload) {
      // Fase 2: lança de novo (ficha nova); o pai troca a `key` quando o link novo chega.
      if (reloadBusy) return;
      const pending: unknown = onReload();
      if (pending && typeof (pending as Promise<unknown>).then === "function") {
        setReloadBusy(true);
        const done = () => {
          if (aliveRef.current) setReloadBusy(false);
        };
        (pending as Promise<unknown>).then(done, done);
      }
      return;
    }
    setLoaded(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Barra da app */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="hidden shrink-0 text-muted-foreground sm:inline">{breadcrumbLabel}</span>
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/70 sm:inline" />
          <h1 className="min-w-0 truncate font-medium" title={app.name}>
            {app.name}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!blocked && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t("hintTitle")}
                  title={t("hintTitle")}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-2 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">{t("hintTitle")}</p>
                <p>{t("hint")}</p>
                <p>{t("loginHint")}</p>
                {extraHints?.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {showIframe && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reload}
              disabled={reloadBusy}
              aria-busy={reloadBusy || undefined}
              className="gap-1.5 px-2"
              aria-label={t("reload")}
              title={t("reload")}
            >
              {reloadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              <span className="hidden md:inline">{t("reload")}</span>
            </Button>
          )}
          {canOpenOutside && (
            <Button
              size="sm"
              onClick={openOutside}
              className="gap-1.5 px-2.5"
              aria-label={openOutsideLabel}
              title={openOutsideLabel}
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">{openOutsideLabel}</span>
            </Button>
          )}
          {barEnd}
        </div>
      </div>

      {/* Aviso do site que não aceita ser aberto no painel, com o iframe forçado */}
      {blocked && forceEmbed && showIframe && (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">{t("blockedWarning")}</span>
        </div>
      )}

      {showIframe ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Indicador por cima (nunca esconde o iframe: site que não avisa o fim do
              carregamento não pode ficar invisível); some no load ou no prazo. */}
          {!loaded && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center" aria-hidden>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </span>
            </div>
          )}
          <iframe
            key={`${app.id}:${reloadKey}`}
            ref={iframeRef}
            src={frameSrc}
            title={app.name}
            className="w-full flex-1 border-0 bg-background"
            sandbox={IFRAME_SANDBOX}
            allow="fullscreen; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-5 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold">{blocked ? t("blockedTitle") : t("cannotEmbedTitle")}</p>
              <p className="text-sm text-muted-foreground">{blocked ? t("blockedWarning") : t("cannotEmbedDesc")}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
              {canOpenOutside && (
                <Button onClick={openOutside} className="gap-1.5">
                  <ExternalLink className="h-4 w-4" />
                  {openOutsideLabel}
                </Button>
              )}
              {blocked && canEmbed && (
                <Button variant="outline" onClick={() => setForceEmbed(true)}>
                  {t("tryHereAnyway")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
