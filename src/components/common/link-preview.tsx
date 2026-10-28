"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Eye, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

// Prévia de link SÓ por clique (bolhas do atendimento, janela do link, chat interno e
// chat de suporte). Buscar sozinho fazia o servidor acessar todo link que aparecia na
// tela, e link de uso único (acesso, pagamento, confirmação) deixava de valer para quem
// o recebeu. Sem clique, a bolha mostra só o domínio, tirado do próprio texto; prévia
// já guardada neste navegador (mesma chave das versões anteriores) aparece direto.

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  hostname?: string;
}

export type LinkPreviewStatus = "idle" | "loading" | "ready" | "empty";

interface PreviewEntry {
  status: LinkPreviewStatus;
  data: LinkPreviewData | null;
}

const CACHE_PREFIX = "lp_cache_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
// Mesmo filtro da rota (com \b: "500px" ou "Forbidden Fruit" são títulos de verdade).
const ERROR_TITLE = /^(404|403|500|502|503|page not found|not found|access denied|forbidden|error)\b/i;

const IDLE: PreviewEntry = { status: "idle", data: null };
const LOADING: PreviewEntry = { status: "loading", data: null };
const EMPTY: PreviewEntry = { status: "empty", data: null };

export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// O link do texto chega cru ("https://X.com") e o da janela vem do navegador
// ("https://x.com/"): a chave normalizada faz os dois dividirem a mesma prévia.
function previewKey(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

// Título que só repete o domínio é o que a rota devolve para PDF, imagem ou página sem
// título: não é prévia, e guardá-la esconderia o botão por 24 h.
export function hasLinkPreviewContent(data: LinkPreviewData | null | undefined): data is LinkPreviewData {
  if (!data) return false;
  const title = (data.title || "").trim();
  if (title && ERROR_TITLE.test(title)) return false;
  if (data.image || data.description) return true;
  if (!title) return false;
  // Comparação exata: a rota repete o domínio em minúsculas; "GitHub.com" é título de verdade.
  return title !== (data.hostname || linkHostname(data.url || ""));
}

function readCache(key: string): LinkPreviewData | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LinkPreviewData; ts: number };
    if (!(Date.now() - ts <= CACHE_TTL_MS)) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return hasLinkPreviewContent(data) ? data : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: LinkPreviewData) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // cota cheia ou armazenamento bloqueado
  }
}

// Estado por link, dividido por todas as bolhas e pela janela: um clique carrega o mesmo
// link em toda a tela, e a busca termina e fica guardada mesmo se a bolha sumir (o
// servidor já acessou o endereço; descartar faria o próximo clique acessar de novo).
const entries = new Map<string, PreviewEntry>();
const listeners = new Map<string, Set<() => void>>();

function getEntry(key: string, rawUrl: string): PreviewEntry {
  let entry = entries.get(key);
  if (!entry) {
    const cached = readCache(key) ?? (rawUrl !== key ? readCache(rawUrl) : null);
    entry = cached ? { status: "ready", data: cached } : IDLE;
    entries.set(key, entry);
  }
  return entry;
}

function setEntry(key: string, entry: PreviewEntry) {
  entries.set(key, entry);
  listeners.get(key)?.forEach((notify) => notify());
}

// "Sem prévia" volta a oferecer o botão depois de um tempo: a falha pode ser de rede ou
// do site naquela hora, e sem isso o link ficaria travado até recarregar a página.
const EMPTY_RETRY_MS = 2 * 60 * 1000;

function markEmpty(key: string) {
  setEntry(key, EMPTY);
  setTimeout(() => {
    if (entries.get(key) === EMPTY) setEntry(key, IDLE);
  }, EMPTY_RETRY_MS);
}

function loadPreview(key: string, rawUrl: string) {
  const current = getEntry(key, rawUrl);
  if (current.status === "loading" || current.status === "ready") return;
  setEntry(key, LOADING);
  fetch(`/api/link-preview?url=${encodeURIComponent(key)}`)
    .then((r) => r.json())
    .then((d: LinkPreviewData) => {
      if (hasLinkPreviewContent(d)) {
        writeCache(key, d);
        setEntry(key, { status: "ready", data: d });
      } else {
        markEmpty(key);
      }
    })
    .catch(() => markEmpty(key));
}

// Só para os testes: cada caso começa sem o estado do anterior.
export function resetLinkPreviewMemory() {
  entries.clear();
}

export function useLinkPreview(url: string) {
  const key = previewKey(url);
  const subscribe = useCallback(
    (notify: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(notify);
      return () => {
        set!.delete(notify);
        if (set!.size === 0) listeners.delete(key);
      };
    },
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => getEntry(key, url),
    () => IDLE,
  );
  const load = useCallback(() => loadPreview(key, url), [key, url]);
  return { data: entry.data, status: entry.status, load };
}

// No toque a dica não aparece (celular, PWA, app e notebook com tela de toque): o 1º
// toque abre o aviso com o botão de confirmar, em vez de buscar direto.
function isTouchClick(e: MouseEvent): boolean {
  if ((e.nativeEvent as PointerEvent).pointerType === "touch") return true;
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function LinkPreviewLoadButton({ onLoad, className }: { onLoad: () => void; className?: string }) {
  const t = useTranslations("linkPreview");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <PopoverAnchor asChild>
            <TooltipTrigger asChild>
              <button
                ref={buttonRef}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isTouchClick(e)) setConfirmOpen(true);
                  else onLoad();
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-1 font-medium hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current",
                  className,
                )}
              >
                <Eye className="h-3 w-3" />
                {t("show")}
              </button>
            </TooltipTrigger>
          </PopoverAnchor>
          <TooltipContent side="top" className="max-w-[260px]">
            {t("showHint")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="top"
        className="w-64 space-y-3 p-3 text-xs"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        // Sem PopoverTrigger o Radix não sabe para onde devolver o foco ao fechar.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          buttonRef.current?.focus();
        }}
      >
        <p className="text-muted-foreground">{t("showHint")}</p>
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => {
            setConfirmOpen(false);
            onLoad();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          {t("show")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

const SIZES = {
  md: { width: "max-w-[280px]", image: "h-[140px]" },
  sm: { width: "max-w-[260px]", image: "h-[120px]" },
  xs: { width: "max-w-[240px]", image: "h-[100px]" },
} as const;

interface LinkPreviewCardProps {
  url: string;
  // Sem onOpen, o card e o domínio abrem o link em nova aba.
  onOpen?: (url: string) => void;
  size?: keyof typeof SIZES;
  className?: string;
}

// Duplo clique no chat interno responde a mensagem: dentro da prévia, não.
const stopDoubleClick = (e: MouseEvent) => e.stopPropagation();

export function LinkPreviewCard({ url, onOpen, size = "md", className }: LinkPreviewCardProps) {
  const t = useTranslations("linkPreview");
  const { data, status, load } = useLinkPreview(url);
  const sizes = SIZES[size];
  const open = () => (onOpen ? onOpen(url) : window.open(url, "_blank", "noopener,noreferrer"));

  if (status === "ready" && data) {
    const body = (
      <>
        {data.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            alt=""
            className={cn("w-full object-cover", sizes.image)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="p-2 space-y-0.5">
          {data.hostname && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{data.hostname}</p>
          )}
          {data.title && <p className="text-xs font-semibold line-clamp-2 leading-snug">{data.title}</p>}
          {data.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{data.description}</p>}
        </div>
      </>
    );
    const cardClass = cn(
      "mt-2 block rounded-lg border bg-muted/20 overflow-hidden hover:bg-muted/30 transition-colors",
      sizes.width,
      className,
    );
    if (onOpen) {
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={open}
          onDoubleClick={stopDoubleClick}
          onKeyDown={(e) => e.key === "Enter" && open()}
          className={cn(cardClass, "cursor-pointer")}
        >
          {body}
        </div>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={stopDoubleClick}
        className={cardClass}
      >
        {body}
      </a>
    );
  }

  return (
    <div
      onDoubleClick={stopDoubleClick}
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-black/10 dark:bg-white/10 px-2 py-1 text-[11px] leading-tight",
        sizes.width,
        className,
      )}
    >
      <Link2 className="h-3 w-3 shrink-0 opacity-60" />
      {/* Link de verdade (copiar endereço, clique do meio); no atendimento o clique abre a janela. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          if (onOpen) {
            e.preventDefault();
            onOpen(url);
          }
        }}
        className="min-w-[4.5rem] flex-1 truncate text-start opacity-75 hover:underline underline-offset-2"
      >
        {linkHostname(url)}
      </a>
      {status === "loading" ? (
        <span className="flex shrink-0 items-center gap-1 opacity-70">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("loading")}
        </span>
      ) : status === "empty" ? (
        <span className="shrink-0 opacity-60">{t("unavailable")}</span>
      ) : (
        <LinkPreviewLoadButton onLoad={load} />
      )}
    </div>
  );
}
