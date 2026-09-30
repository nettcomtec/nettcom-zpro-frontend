"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, Check, Loader2, MessageSquare, Mic, RefreshCw, Save, Search, Volume2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AiPlatformModelKind } from "@/services/ai-credits";
import {
  syncAiPlatformModels,
  updateAiPlatformSettings,
  type AiPlatformCatalogModel,
  type AiPlatformSettings,
  type AiPlatformSyncedModel,
} from "@/services/ai-platform";
import {
  INVALID_FIELD_CLASS,
  aiPlatformSaveErrorKey,
  numberToInput,
  parseDecimalInput,
  type AiPlatformCardProps,
} from "./connection-card";

// A lista sincronizada pode passar de 300 modelos: a tabela mostra um lote por vez.
const PAGE_SIZE = 50;
const NONE = "__none__";

interface SoldDraft {
  model: AiPlatformCatalogModel;
  input: string;
  output: string;
  // transcrição: US$ por minuto; voz: US$ por 1 milhão de caracteres
  aux: string;
}

function auxValueOf(model: AiPlatformCatalogModel): number | undefined {
  if (model.kind === "transcription") return model.perMinuteUsd;
  if (model.kind === "speech") return model.perMillionCharsUsd;
  return undefined;
}

function usdToInput(value: number | undefined): string {
  const n = Number(value);
  return Number.isFinite(n) ? numberToInput(n, 6) : "";
}

function draftFrom(model: AiPlatformCatalogModel): SoldDraft {
  return {
    model,
    input: usdToInput(model.inputUsdPer1M),
    output: usdToInput(model.outputUsdPer1M),
    aux: usdToInput(auxValueOf(model)),
  };
}

// O que vai em `models` é SÓ o formato do catálogo — sem `activatable`/`reason` da lista ao vivo.
function toCatalogModel(model: AiPlatformCatalogModel | AiPlatformSyncedModel): AiPlatformCatalogModel {
  const base: AiPlatformCatalogModel = {
    modelId: model.modelId,
    name: model.name,
    provider: model.provider,
    kind: model.kind,
    inputUsdPer1M: Number(model.inputUsdPer1M) || 0,
    outputUsdPer1M: Number(model.outputUsdPer1M) || 0,
    vision: model.vision === true,
  };
  if (model.kind === "transcription" && model.perMinuteUsd != null) base.perMinuteUsd = Number(model.perMinuteUsd);
  if (model.kind === "speech" && model.perMillionCharsUsd != null) base.perMillionCharsUsd = Number(model.perMillionCharsUsd);
  return base;
}

function snapshotOf(
  drafts: SoldDraft[],
  defaultModelId: string | null,
  transcriptionModelId: string | null,
  speechModelId: string | null
): string {
  // Ordenado por id: desmarcar e marcar de novo o mesmo modelo não conta como alteração.
  return JSON.stringify({
    models: drafts
      .map((d) => [d.model.modelId, d.input, d.output, d.aux])
      .sort((a, b) => a[0].localeCompare(b[0])),
    defaultModelId,
    transcriptionModelId,
    speechModelId,
  });
}

function savedModelsOf(settings: AiPlatformSettings): AiPlatformCatalogModel[] {
  return Array.isArray(settings.models) ? settings.models : [];
}

export function ModelsCard({ settings, onSaved }: AiPlatformCardProps) {
  const t = useTranslations("aiPlatformPage");
  const tCredits = useTranslations("aiCreditsPage");

  const [sold, setSold] = useState<SoldDraft[]>(() => savedModelsOf(settings).map(draftFrom));
  const [defaultModelId, setDefaultModelId] = useState<string | null>(settings.defaultModelId ?? null);
  const [transcriptionModelId, setTranscriptionModelId] = useState<string | null>(settings.transcriptionModelId ?? null);
  const [speechModelId, setSpeechModelId] = useState<string | null>(settings.speechModelId ?? null);

  // Linhas da tabela: os modelos salvos + (depois de sincronizar) a lista AO VIVO do
  // serviço. A ordem só muda ao sincronizar — marcar/desmarcar não faz a linha pular.
  const [pool, setPool] = useState<AiPlatformSyncedModel[]>(() =>
    savedModelsOf(settings).map((m) => ({ ...m, activatable: true }))
  );
  const [embeddingAvailable, setEmbeddingAvailable] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const soldById = useMemo(() => {
    const map = new Map<string, SoldDraft>();
    sold.forEach((d) => map.set(d.model.modelId, d));
    return map;
  }, [sold]);

  const savedSnapshot = useMemo(
    () =>
      snapshotOf(
        savedModelsOf(settings).map(draftFrom),
        settings.defaultModelId ?? null,
        settings.transcriptionModelId ?? null,
        settings.speechModelId ?? null
      ),
    [settings]
  );
  const dirty = savedSnapshot !== snapshotOf(sold, defaultModelId, transcriptionModelId, speechModelId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q)
    );
  }, [pool, search]);
  const visible = filtered.slice(0, limit);

  const soldOfKind = (kind: AiPlatformModelKind) => sold.filter((d) => d.model.kind === kind).map((d) => d.model);
  const chatModels = soldOfKind("chat");
  const transcriptionModels = soldOfKind("transcription");
  const speechModels = soldOfKind("speech");

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data } = await syncAiPlatformModels();
      const live = Array.isArray(data?.models) ? data.models : [];
      const liveById = new Map(live.map((m) => [m.modelId, m]));
      const soldIds = new Set(sold.map((d) => d.model.modelId));
      // Vendidos no topo (com o veredito ao vivo de "pode ser vendido"), depois o resto.
      const top: AiPlatformSyncedModel[] = sold.map((d) => {
        const liveModel = liveById.get(d.model.modelId);
        return {
          ...d.model,
          activatable: liveModel ? liveModel.activatable : true,
          reason: liveModel?.reason,
        };
      });
      setPool([...top, ...live.filter((m) => !soldIds.has(m.modelId))]);
      setEmbeddingAvailable(data?.embeddingAvailable !== false);
      setLimit(PAGE_SIZE);
    } catch {
      toast.error(t("testFail"));
    } finally {
      setSyncing(false);
    }
  };

  const toggleSold = (row: AiPlatformSyncedModel, checked: boolean) => {
    const id = row.modelId;
    if (checked) {
      if (!row.activatable || soldById.has(id)) return;
      setSold((prev) => [...prev, draftFrom(toCatalogModel(row))]);
      // Primeiro modelo do tipo já entra como escolhido — evita salvar sem modelo padrão.
      if (row.kind === "chat" && !defaultModelId) setDefaultModelId(id);
      if (row.kind === "transcription" && !transcriptionModelId) setTranscriptionModelId(id);
      if (row.kind === "speech" && !speechModelId) setSpeechModelId(id);
      return;
    }
    setSold((prev) => prev.filter((d) => d.model.modelId !== id));
    if (defaultModelId === id) setDefaultModelId(null);
    if (transcriptionModelId === id) setTranscriptionModelId(null);
    if (speechModelId === id) setSpeechModelId(null);
  };

  const setDraftField = (id: string, field: "input" | "output" | "aux", value: string) => {
    setSold((prev) => prev.map((d) => (d.model.modelId === id ? { ...d, [field]: value } : d)));
    setInvalid((prev) => {
      const key = `${id}:${field}`;
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    const errors = new Set<string>();
    const models: AiPlatformCatalogModel[] = sold.map((d) => {
      const id = d.model.modelId;
      const input = parseDecimalInput(d.input);
      const output = parseDecimalInput(d.output);
      if (input === null || input < 0) errors.add(`${id}:input`);
      if (output === null || output < 0) errors.add(`${id}:output`);
      const next: AiPlatformCatalogModel = {
        ...toCatalogModel(d.model),
        inputUsdPer1M: input ?? 0,
        outputUsdPer1M: output ?? 0,
      };
      if (d.model.kind !== "chat") {
        delete next.perMinuteUsd;
        delete next.perMillionCharsUsd;
        if (d.aux.trim()) {
          const aux = parseDecimalInput(d.aux);
          if (aux === null || aux < 0) errors.add(`${id}:aux`);
          else if (d.model.kind === "transcription") next.perMinuteUsd = aux;
          else next.perMillionCharsUsd = aux;
        }
      }
      return next;
    });

    setInvalid(errors);
    if (errors.size > 0) {
      toast.error(t("err_ERR_AI_PLATFORM_INVALID_SETTINGS"));
      return;
    }

    const has = (id: string | null, kind: AiPlatformModelKind) =>
      !!id && models.some((m) => m.modelId === id && m.kind === kind);

    setSaving(true);
    try {
      const { data } = await updateAiPlatformSettings({
        models,
        defaultModelId: has(defaultModelId, "chat") ? defaultModelId : null,
        transcriptionModelId: has(transcriptionModelId, "transcription") ? transcriptionModelId : null,
        speechModelId: has(speechModelId, "speech") ? speechModelId : null,
      });
      onSaved(data);
      setSold(savedModelsOf(data).map(draftFrom));
      setDefaultModelId(data.defaultModelId ?? null);
      setTranscriptionModelId(data.transcriptionModelId ?? null);
      setSpeechModelId(data.speechModelId ?? null);
      toast.success(t("saved"));
    } catch (err: unknown) {
      toast.error(t(aiPlatformSaveErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const kindIcon = (kind: AiPlatformModelKind) => {
    if (kind === "transcription") {
      return <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("transcriptionModel")} />;
    }
    if (kind === "speech") {
      return <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("speechModel")} />;
    }
    return <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
  };

  const renderModelSelect = (
    id: string,
    label: string,
    note: string | null,
    value: string | null,
    options: AiPlatformCatalogModel[],
    onChange: (next: string | null) => void
  ) => {
    const current = value && options.some((m) => m.modelId === value) ? value : NONE;
    return (
      <div className="min-w-0 space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={current}
          onValueChange={(v) => onChange(v === NONE ? null : v)}
          disabled={saving || options.length === 0}
        >
          <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("fallbackNone")}</SelectItem>
            {options.map((m) => (
              <SelectItem key={m.modelId} value={m.modelId}>{m.name || m.modelId}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">{t("syncNote")}</p>
          <Button variant="outline" onClick={() => void handleSync()} disabled={syncing || saving} className="gap-1.5">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("sync")}
          </Button>
        </div>

        {embeddingAvailable === false && (
          <Alert variant="warning-soft">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("embeddingMissing")}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {renderModelSelect("ai-platform-default-model", t("defaultModel"), t("defaultModelNote"), defaultModelId, chatModels, setDefaultModelId)}
          {renderModelSelect("ai-platform-transcription-model", t("transcriptionModel"), null, transcriptionModelId, transcriptionModels, setTranscriptionModelId)}
          {renderModelSelect("ai-platform-speech-model", t("speechModel"), t("speechModelNote"), speechModelId, speechModels, setSpeechModelId)}
        </div>

        {pool.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            {t("noModels")}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_SIZE); }}
                  placeholder={t("searchModel")}
                  aria-label={t("searchModel")}
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary" className="gap-1 font-normal tabular-nums" title={t("sold")}>
                <Check className="h-3 w-3" />
                {sold.length}
              </Badge>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[64px] whitespace-nowrap">{t("sold")}</TableHead>
                    <TableHead>{t("colModel")}</TableHead>
                    <TableHead className="w-[130px] whitespace-nowrap">{t("colInput")}</TableHead>
                    <TableHead className="w-[130px] whitespace-nowrap">{t("colOutput")}</TableHead>
                    <TableHead className="w-[150px]" />
                    <TableHead className="w-[90px] whitespace-nowrap text-center">{t("colVision")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {tCredits("empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((row) => {
                      const draft = soldById.get(row.modelId) ?? null;
                      const isSold = draft !== null;
                      const locked = !row.activatable && !isSold;
                      const auxCaption =
                        row.kind === "transcription"
                          ? tCredits("pricesPerMinute")
                          : row.kind === "speech"
                            ? tCredits("pricesPerMillionChars")
                            : null;
                      return (
                        <TableRow key={row.modelId} className={cn(locked && "opacity-60")}>
                          <TableCell>
                            <Checkbox
                              checked={isSold}
                              disabled={locked || saving}
                              onCheckedChange={(v) => toggleSold(row, v === true)}
                              aria-label={`${t("sold")}: ${row.name || row.modelId}`}
                            />
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {kindIcon(row.kind)}
                              <span className="truncate font-medium" title={row.name || row.modelId}>
                                {row.name || row.modelId}
                              </span>
                            </div>
                            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate font-mono text-[11px] text-muted-foreground" title={row.modelId}>
                                {row.modelId}
                              </span>
                              {!row.activatable && (
                                <Badge variant="warning-soft" className="h-4 px-1.5 py-0 text-[10px] font-normal">
                                  {t("notActivatable")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {draft ? (
                              <Input
                                inputMode="decimal"
                                value={draft.input}
                                onChange={(e) => setDraftField(row.modelId, "input", e.target.value)}
                                aria-label={`${t("colInput")}: ${row.name || row.modelId}`}
                                aria-invalid={invalid.has(`${row.modelId}:input`) || undefined}
                                className={cn("h-8", invalid.has(`${row.modelId}:input`) && INVALID_FIELD_CLASS)}
                                disabled={saving}
                              />
                            ) : (
                              <span className="text-muted-foreground">{usdToInput(row.inputUsdPer1M) || "—"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {draft ? (
                              <Input
                                inputMode="decimal"
                                value={draft.output}
                                onChange={(e) => setDraftField(row.modelId, "output", e.target.value)}
                                aria-label={`${t("colOutput")}: ${row.name || row.modelId}`}
                                aria-invalid={invalid.has(`${row.modelId}:output`) || undefined}
                                className={cn("h-8", invalid.has(`${row.modelId}:output`) && INVALID_FIELD_CLASS)}
                                disabled={saving}
                              />
                            ) : (
                              <span className="text-muted-foreground">{usdToInput(row.outputUsdPer1M) || "—"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {auxCaption && (
                              <div className="space-y-1">
                                <p className="text-[10px] leading-tight text-muted-foreground">{auxCaption} (US$)</p>
                                {draft ? (
                                  <Input
                                    inputMode="decimal"
                                    value={draft.aux}
                                    onChange={(e) => setDraftField(row.modelId, "aux", e.target.value)}
                                    aria-label={`${auxCaption}: ${row.name || row.modelId}`}
                                    aria-invalid={invalid.has(`${row.modelId}:aux`) || undefined}
                                    className={cn("h-8", invalid.has(`${row.modelId}:aux`) && INVALID_FIELD_CLASS)}
                                    disabled={saving}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">{usdToInput(auxValueOf(row)) || "—"}</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.vision ? (
                              <Check className="mx-auto h-4 w-4 text-success" aria-label={t("colVision")} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{Math.min(limit, filtered.length)} / {filtered.length}</span>
              {filtered.length > limit && (
                <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  {tCredits("loadMore")}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleSave()} disabled={saving || syncing || !dirty} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ModelsCard;
