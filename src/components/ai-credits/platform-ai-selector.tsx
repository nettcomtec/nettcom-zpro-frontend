"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, KeyRound, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCentsBRL } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import {
  fetchAiCreditsModels,
  type AiCreditsModelsResponse,
  type AiPlatformModelKind,
  type AiPublicModelPrice,
} from "@/services/ai-credits";

// Seletor "Chave própria / IA da plataforma" — reutilizável (agente, conexão, nó
// do fluxo, Copiloto). Quem não tem o recurso não vê nem paga nada: sem
// `isAiCreditsEnabled()` o componente devolve null e NENHUM request sai daqui.
// O catálogo só é buscado com o modo plataforma ativo E `showModel` ligado.

// ── Catálogo em memória do módulo ───────────────────────────────────────────
// Os diálogos que hospedam o seletor abrem e fecham o tempo todo: uma busca por
// sessão de página basta. Guardado por tenant (troca de conta sem recarregar a
// página não herda o catálogo anterior), com validade curta e recarga manual.
// Falha NUNCA é guardada — a próxima abertura tenta de novo.
const CATALOG_TTL_MS = 10 * 60 * 1000;

interface CatalogCacheEntry {
  tenantKey: string;
  loadedAt: number;
  data: AiCreditsModelsResponse;
}

let catalogCache: CatalogCacheEntry | null = null;
let catalogInflight: { tenantKey: string; promise: Promise<AiCreditsModelsResponse> } | null = null;

function currentTenantKey(): string {
  return String(useAuthStore.getState().user?.tenantId ?? "");
}

function readCatalogCache(): AiCreditsModelsResponse | null {
  if (!catalogCache) return null;
  if (catalogCache.tenantKey !== currentTenantKey()) return null;
  if (Date.now() - catalogCache.loadedAt > CATALOG_TTL_MS) return null;
  return catalogCache.data;
}

// Resposta fora do formato vira catálogo vazio em vez de quebrar quem renderiza
function normalizeCatalog(raw: unknown): AiCreditsModelsResponse {
  const body = (raw || {}) as Partial<AiCreditsModelsResponse>;
  const models = Array.isArray(body.models)
    ? body.models.filter(
        (item): item is AiPublicModelPrice =>
          !!item && typeof item.modelId === "string" && item.modelId.trim().length > 0
      )
    : [];
  return {
    defaultModelId: typeof body.defaultModelId === "string" ? body.defaultModelId : null,
    models,
  };
}

/**
 * Catálogo da IA da plataforma (com cache). `force` ignora o cache.
 * O CHAMADOR garante o gate `isAiCreditsEnabled()` antes — esta função sempre
 * faz o request quando não há cache válido.
 */
export function loadPlatformAiCatalog(force = false): Promise<AiCreditsModelsResponse> {
  const tenantKey = currentTenantKey();
  if (!force) {
    const cached = readCatalogCache();
    if (cached) return Promise.resolve(cached);
    if (catalogInflight && catalogInflight.tenantKey === tenantKey) {
      return catalogInflight.promise;
    }
  }
  const promise = fetchAiCreditsModels()
    .then(({ data }) => {
      const normalized = normalizeCatalog(data);
      catalogCache = { tenantKey, loadedAt: Date.now(), data: normalized };
      return normalized;
    })
    .finally(() => {
      if (catalogInflight?.promise === promise) catalogInflight = null;
    });
  catalogInflight = { tenantKey, promise };
  return promise;
}

/**
 * O modelo está no catálogo já carregado? `null` = catálogo desconhecido (ainda
 * não carregou ou falhou): quem valida um save deixa o servidor decidir.
 */
export function isPlatformAiModelAvailable(
  modelId: string | null | undefined,
  kind: AiPlatformModelKind = "chat"
): boolean | null {
  const catalog = readCatalogCache();
  if (!catalog) return null;
  const wanted = String(modelId || "").trim();
  if (!wanted) return false;
  return catalog.models.some(item => item.kind === kind && item.modelId === wanted);
}

/** Gate reativo do recurso, para a tela hospedeira decidir o que esconder. */
export function usePlatformAiEnabled(): boolean {
  return useAuthStore(s => s.isAiCreditsEnabled());
}

// ── Componente ──────────────────────────────────────────────────────────────

export interface PlatformAiSelectorProps {
  /** true = IA da plataforma; false = chave própria */
  value: boolean;
  onChange: (next: boolean) => void;
  /** Mostra o seletor de modelo do catálogo quando o modo plataforma está ativo */
  showModel?: boolean;
  modelKind?: AiPlatformModelKind;
  model?: string;
  onModelChange?: (modelId: string) => void;
  disabled?: boolean;
}

export function PlatformAiSelector({
  value,
  onChange,
  showModel = false,
  modelKind = "chat",
  model,
  onModelChange,
  disabled = false,
}: PlatformAiSelectorProps) {
  const t = useTranslations("platformAiSelector");
  const tCommon = useTranslations("common");
  const tAgents = useTranslations("aiAgents");

  const enabled = usePlatformAiEnabled();
  const canManage = useAuthStore(s => s.canManageAiCredits());

  const [catalog, setCatalog] = useState<AiCreditsModelsResponse | null>(() =>
    readCatalogCache()
  );
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const needsCatalog = enabled && value && showModel;

  const loadCatalog = useCallback((force: boolean) => {
    requestSeq.current += 1;
    const seq = requestSeq.current;
    if (!force) {
      // Cache válido resolve na hora, sem piscar o estado de carregando
      const cached = readCatalogCache();
      if (cached) {
        setCatalog(cached);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    loadPlatformAiCatalog(force)
      .then(data => {
        if (requestSeq.current !== seq) return;
        setCatalog(data);
      })
      .catch(() => {
        // Falha ao carregar nunca quebra a tela hospedeira: a lista fica vazia
        // com o botão de recarregar, e o save segue validado pelo servidor
        if (requestSeq.current !== seq) return;
        setCatalog(null);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!needsCatalog) return;
    loadCatalog(false);
    return () => {
      // Invalida a resposta em voo (desmontou ou saiu do modo plataforma) — e
      // solta o "carregando", que a resposta descartada não vai mais soltar
      requestSeq.current += 1;
      setLoading(false);
    };
  }, [needsCatalog, loadCatalog]);

  if (!enabled) return null;

  const models = (catalog?.models || []).filter(item => item.kind === modelKind);
  const currentModel = String(model || "").trim();
  const selected = models.find(item => item.modelId === currentModel) || null;
  // Modelo atual fora do catálogo: NUNCA trocar sozinho — a lista fica sem
  // seleção e o aviso diz qual modelo não está disponível
  const unknownModel = !!catalog && !loading && currentModel.length > 0 && !selected;

  const priceLabel = (item: AiPublicModelPrice): string | null => {
    const input = Number(item.inputPriceCentsPer1M) || 0;
    const output = Number(item.outputPriceCentsPer1M) || 0;
    // Transcrição e voz são cobradas por minuto/caractere: sem preço por token
    // não há o que mostrar neste formato
    if (input <= 0 && output <= 0) return null;
    // Fração de centavo com 2 casas apareceria como "grátis"
    const money = (cents: number) =>
      formatCentsBRL(cents, { precise: cents > 0 && cents < 1 });
    return t("priceHint", { input: money(input), output: money(output) });
  };

  const selectedPrice = selected ? priceLabel(selected) : null;

  const segmentClass = (active: boolean) =>
    cn(
      "flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-center text-sm leading-tight transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      active
        ? "bg-background font-medium text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label={`${t("ownKey")} / ${t("platform")}`}
        className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          disabled={disabled}
          onClick={() => { if (value) onChange(false); }}
          className={segmentClass(!value)}
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{t("ownKey")}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value}
          disabled={disabled}
          onClick={() => { if (!value) onChange(true); }}
          className={segmentClass(value)}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{t("platform")}</span>
        </button>
      </div>

      {value && (
        <p className="text-xs text-muted-foreground">
          {t("platformNote")}
          {canManage && (
            <>
              {" "}
              {/* Nova aba: o seletor vive dentro de formulários ainda não salvos */}
              <a
                href="/creditos-ia"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                {t("balanceLink")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </p>
      )}

      {value && showModel && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <Label>{t("model")}</Label>
            <button
              type="button"
              onClick={() => loadCatalog(true)}
              disabled={disabled || loading}
              title={tCommon("atualizar")}
              aria-label={tCommon("atualizar")}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <Select
            value={selected ? selected.modelId : ""}
            onValueChange={next => {
              if (next) onModelChange?.(next);
            }}
            disabled={disabled || loading || models.length === 0}
          >
            <SelectTrigger
              aria-invalid={unknownModel || undefined}
              className={cn(unknownModel && "border-amber-500/60")}
            >
              <SelectValue placeholder={loading ? tCommon("loading") : t("model")}>
                {selected ? selected.name || selected.modelId : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {models.map(item => {
                const price = priceLabel(item);
                return (
                  <SelectItem key={item.modelId} value={item.modelId}>
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="break-words">{item.name || item.modelId}</span>
                      {price && (
                        <span className="text-xs text-muted-foreground">{price}</span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {!loading && models.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("noModels")}</p>
          ) : unknownModel ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              <span className="break-all font-mono">{currentModel}</span>
              {" — "}
              {tAgents("errPlatformModelNotAllowed")}
            </p>
          ) : selectedPrice ? (
            <p className="text-xs text-muted-foreground">{selectedPrice}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
