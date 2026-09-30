"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TermsDocRenderer } from "@/components/terms/terms-doc-renderer";
import { performLogout } from "@/components/layout/sidebar";
import { useAuthStore } from "@/stores/auth-store";
import { isNativeApp } from "@/lib/native";
import { cn } from "@/lib/utils";
import type { TermsSection } from "@/lib/terms-doc";
import {
  acceptResellerTerms,
  errorCodeOf,
  fetchMyResellerTerms,
  isBackendMissing,
  type MyResellerTermsResponse,
} from "@/services/reseller-terms";

// PLANO_ACEITE_TERMOS_REVENDA §5.7 — beco-sem-saída do aceite dos termos do
// revendedor (molde /trocar-senha). O use-auth-guard prende aqui o admin com
// `resellerTermsPending` e o backend nega o resto com 403
// ERR_RESELLER_TERMS_PENDING. EXCEÇÃO de página nova (I8): fora de
// PlanCapabilities, menus, sidebar, usePageAccess e sem PageHeader/PageHelp.
//
// Saída SEMPRE por recarga completa (`window.location.replace`): as leituras de
// boot do layout tomaram 403 enquanto o bloqueio durava e não se repetem sozinhas.

const POLL_MS = 30000;
const READ_TOLERANCE_PX = 8;
const LEAVE_DELAY_MS = 700;
const DESCRIPTION_ID = "aceite-termos-description";

type Phase = "loading" | "error" | "pending" | "masterkey" | "leaving";
type PendingVersion = NonNullable<MyResellerTermsResponse["version"]>;

function homeForProfile(profile?: string): string {
  if (profile === "superadmin") return "/assinatura";
  if (profile === "admin" || profile === "super") return "/";
  return "/atendimento";
}

// Chave por versão: leitura de uma versão nunca vale para a seguinte.
function sectionKey(versionId: number, section: TermsSection, index: number): string {
  return `${versionId}:${index}:${section.id || ""}`;
}

// O texto pode ter ~200 mil caracteres: a consulta de 30 s e cada seção lida
// re-renderizam a página, mas o `doc` da mesma versão mantém a referência.
const SectionBody = memo(function SectionBody({ doc }: { doc: TermsSection["doc"] }) {
  return <TermsDocRenderer doc={doc} />;
});

export default function AceiteTermosPage() {
  const t = useTranslations("aceiteTermosPage");
  const tRef = useRef(t);
  tRef.current = t;

  const [phase, setPhase] = useState<Phase>("loading");
  const [version, setVersion] = useState<PendingVersion | null>(null);
  const [readProof, setReadProof] = useState<{ readToken: string; issuedAt: number } | null>(null);
  const [reloginFromServer, setReloginFromServer] = useState(false);
  const [reloginForced, setReloginForced] = useState(false);
  const [readKeys, setReadKeys] = useState<Record<string, true>>({});
  const [activeKey, setActiveKey] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Começa escondido: no app nativo "nova aba" tira a WebView da página e o
  // progresso de leitura se perde (E21). Só aparece depois de confirmar que é web.
  const [hideExternalLink, setHideExternalLink] = useState(true);
  const [attachTick, setAttachTick] = useState(0);
  const [resetTick, setResetTick] = useState(0);

  const aliveRef = useRef(true);
  const leavingRef = useRef(false);
  const requestSeqRef = useRef(0);
  const versionIdRef = useRef<number | null>(null);
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const refCallbacks = useRef<Record<string, (el: HTMLDivElement | null) => void>>({});

  useEffect(() => {
    setHideExternalLink(isNativeApp());
  }, []);

  const leave = useCallback((delayMs = 0) => {
    if (leavingRef.current || !aliveRef.current) return;
    leavingRef.current = true;
    const store = useAuthStore.getState();
    store.patchUser({ resellerTermsPending: false });
    const target = homeForProfile(store.user?.profile);
    if (delayMs > 0) {
      window.setTimeout(() => window.location.replace(target), delayMs);
      return;
    }
    setPhase("leaving");
    window.location.replace(target);
  }, []);

  const showMasterkeyBlocked = useCallback(() => {
    useAuthStore.getState().patchUser({ resellerTermsPending: false });
    setPhase("masterkey");
  }, []);

  const resetReads = useCallback(() => {
    setReadKeys({});
    Object.values(scrollRefs.current).forEach((el) => {
      if (el) el.scrollTop = 0;
    });
    setResetTick((n) => n + 1);
  }, []);

  const load = useCallback(
    async (opts: { background?: boolean; quiet?: boolean } = {}) => {
      if (leavingRef.current || !aliveRef.current) return;
      const seq = ++requestSeqRef.current;
      const hasContent = versionIdRef.current !== null;
      try {
        const { data } = await fetchMyResellerTerms();
        if (leavingRef.current || !aliveRef.current || seq !== requestSeqRef.current) return;

        // Sessão aberta com chave mestra: não bloqueia e não aceita (D11) — o
        // gate responde "não pendente" nela, então este teste vem ANTES.
        if (data?.masterkeySession === true && data.applicable) {
          showMasterkeyBlocked();
          return;
        }
        if (!data?.pending) {
          leave();
          return;
        }

        const next = data.version;
        if (
          !next ||
          !Array.isArray(next.sections) ||
          next.sections.length === 0 ||
          typeof data.readToken !== "string" ||
          typeof data.issuedAt !== "number"
        ) {
          if (!opts.background || !hasContent) setPhase("error");
          return;
        }

        const prevId = versionIdRef.current;
        if (prevId !== next.id) {
          versionIdRef.current = next.id;
          setVersion(next);
          setActiveKey(sectionKey(next.id, next.sections[0], 0));
          if (prevId !== null) {
            resetReads();
            if (!opts.quiet) toast.info(tRef.current("versionChanged"));
          }
        }
        // Token novo a cada consulta: mantém a prova de entrega sempre dentro da validade.
        setReadProof({ readToken: data.readToken, issuedAt: data.issuedAt });
        setReloginFromServer(data.reloginRequired === true);
        if (!useAuthStore.getState().user?.resellerTermsPending) {
          useAuthStore.getState().patchUser({ resellerTermsPending: true });
        }
        setPhase("pending");
      } catch (err) {
        if (leavingRef.current || !aliveRef.current || seq !== requestSeqRef.current) return;
        if (isBackendMissing(err)) {
          leave();
          return;
        }
        // Falha numa consulta de fundo não derruba o diálogo (nem a leitura feita).
        if (!opts.background || !hasContent) setPhase("error");
      }
    },
    [leave, resetReads, showMasterkeyBlocked]
  );

  // Mount + a cada 30 s + ao voltar para a aba: pausar a exigência ou aceitar em
  // outra aba libera esta sem F5 (R14/E20).
  useEffect(() => {
    aliveRef.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ background: true });
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load({ background: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // Ref ESTÁVEL por aba: callback novo a cada render faria o React chamar
  // null/el de novo e o contador de montagem entraria em laço.
  const getScrollRef = useCallback((key: string) => {
    let cb = refCallbacks.current[key];
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        const prev = scrollRefs.current[key];
        if (el) {
          scrollRefs.current[key] = el;
          if (el !== prev) setAttachTick((n) => n + 1);
        } else {
          delete scrollRefs.current[key];
        }
      };
      refCallbacks.current[key] = cb;
    }
    return cb;
  }, []);

  // "Lida" = rolada até o fim. Aba oculta mede clientHeight 0 — nunca conta.
  const checkRead = useCallback((key: string) => {
    const el = scrollRefs.current[key];
    if (!el || el.clientHeight === 0) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - READ_TOLERANCE_PX) {
      setReadKeys((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    }
  }, []);

  // Só a aba ATIVA é medida: ao ativar (depois do layout) e quando o tamanho da
  // área ou do texto muda (aba curta conta ao abrir; rotação/teclado no celular).
  useEffect(() => {
    if (phase !== "pending" || !activeKey) return;
    const el = scrollRefs.current[activeKey];
    if (!el) return;
    // Mede já (o DOM está commitado; ler o tamanho força o layout) e de novo no
    // próximo quadro e após um instante: rAF e ResizeObserver dependem de quadros
    // pintados e não disparam com a aba do navegador em segundo plano — sem isso
    // aba curta podia nunca contar como lida.
    checkRead(activeKey);
    const raf = window.requestAnimationFrame(() => checkRead(activeKey));
    const settle = window.setTimeout(() => checkRead(activeKey), 150);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => checkRead(activeKey));
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      observer?.disconnect();
    };
  }, [phase, activeKey, attachTick, resetTick, checkRead]);

  const sectionKeys = useMemo(
    () => (version ? version.sections.map((section, index) => sectionKey(version.id, section, index)) : []),
    [version]
  );
  const total = sectionKeys.length;
  const readCount = sectionKeys.filter((key) => readKeys[key]).length;
  const allRead = total > 0 && readCount === total;
  const reloginNeeded = reloginFromServer || reloginForced;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // Para a consulta periódica de mandar para a home no meio do logout.
    leavingRef.current = true;
    // setOffline=false: o PUT de "offline" é recusado enquanto o aceite está
    // pendente (mesmo comportamento aceito em /trocar-senha).
    await performLogout(false);
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await load();
    } finally {
      if (aliveRef.current) setRetrying(false);
    }
  };

  const handleAccept = async () => {
    if (!version || !readProof || !allRead || accepting || reloginNeeded || leavingRef.current) return;
    setAccepting(true);
    let keepBusy = false;
    try {
      await acceptResellerTerms({
        versionId: version.id,
        readToken: readProof.readToken,
        issuedAt: readProof.issuedAt,
      });
      keepBusy = true;
      toast.success(t("accepted"));
      leave(LEAVE_DELAY_MS);
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === "ERR_RESELLER_TERMS_VERSION_CHANGED" || code === "ERR_RESELLER_TERMS_READ_TOKEN") {
        toast.error(t("versionChanged"));
        resetReads();
        await load({ quiet: true });
      } else if (code === "ERR_RESELLER_TERMS_RELOGIN") {
        setReloginForced(true);
      } else if (code === "ERR_RESELLER_TERMS_MASTERKEY") {
        showMasterkeyBlocked();
      } else if (code === "ERR_RESELLER_TERMS_NOT_APPLICABLE" || isBackendMissing(err)) {
        leave();
      } else {
        toast.error(t("acceptError"));
      }
    } finally {
      if (!keepBusy && aliveRef.current) setAccepting(false);
    }
  };

  if (phase === "loading" || phase === "leaving") {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {phase === "loading" && <span>{t("loading")}</span>}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("loadError")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={handleRetry} disabled={retrying || loggingOut}>
              {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("retry")}
            </Button>
            <Button variant="outline" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
              {t("logout")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "masterkey") {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <ShieldAlert className="h-6 w-6 text-warning" aria-hidden="true" />
            </div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("masterkeyBlocked")}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => leave()}>
              <ArrowLeft />
              {t("backHome")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sections = version?.sections ?? [];

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          aria-describedby={DESCRIPTION_ID}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="[&>button]:hidden flex flex-col gap-3 w-[calc(100vw-1rem)] max-w-3xl h-[92dvh] max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none p-4"
        >
          {/* Cabeçalho, abas e rodapé são DIV: o seletor [&>button] esconde só o X. */}
          <div className="shrink-0 space-y-1 pe-1">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ScrollText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">{t("title")}</span>
            </DialogTitle>
            <DialogDescription id={DESCRIPTION_ID} className="text-xs sm:text-sm">
              {t("description")}
            </DialogDescription>
          </div>

          <Tabs value={activeKey} onValueChange={setActiveKey} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="w-full shrink-0 flex-nowrap justify-start overflow-x-auto overflow-y-hidden">
              {sections.map((section, index) => {
                const key = sectionKeys[index];
                const isRead = !!readKeys[key];
                return (
                  <TabsTrigger key={key} value={key} className="shrink-0 gap-1.5">
                    {isRead ? (
                      <CheckCircle2 role="img" aria-label={t("sectionRead")} className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <Circle role="img" aria-label={t("sectionUnread")} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    )}
                    <span className="max-w-[12rem] truncate" title={section.title}>
                      {section.title}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {sections.map((section, index) => {
              const key = sectionKeys[index];
              return (
                <TabsContent
                  key={key}
                  value={key}
                  forceMount
                  className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                >
                  <div
                    ref={getScrollRef(key)}
                    onScroll={() => checkRead(key)}
                    tabIndex={0}
                    aria-label={section.title}
                    className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-4"
                  >
                    <SectionBody doc={section.doc} />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>

          <div className="shrink-0 space-y-2 border-t pt-3">
            {reloginNeeded && (
              <div role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                <p className="text-sm font-medium">{t("reloginTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("reloginRequired")}</p>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span className={cn("font-medium", allRead ? "text-success" : "text-foreground")}>
                  {t("progress", { read: readCount, total })}
                </span>
                {!allRead && <span>{t("scrollHint")}</span>}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
                {reloginNeeded ? (
                  <Button className="w-full sm:w-auto" onClick={handleLogout} disabled={loggingOut}>
                    {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                    {t("relogin")}
                  </Button>
                ) : (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={handleAccept}
                    disabled={!allRead || accepting || !readProof || loggingOut}
                  >
                    {accepting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    {t("accept")}
                  </Button>
                )}
                {(!hideExternalLink || !reloginNeeded) && (
                  <div className="flex gap-2">
                    {!hideExternalLink && (
                      <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                        <a href="/contrato" target="_blank" rel="noopener noreferrer">
                          <ExternalLink />
                          {t("openNewTab")}
                        </a>
                      </Button>
                    )}
                    {!reloginNeeded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={handleLogout}
                        disabled={loggingOut || accepting}
                      >
                        <LogOut />
                        {t("logout")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
