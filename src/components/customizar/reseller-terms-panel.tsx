"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, Copy, ExternalLink, Eye, Loader2, Plus,
  RotateCcw, Save, Send, Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TermsRichEditor } from "@/components/terms/terms-rich-editor";
import { TermsDocRenderer } from "@/components/terms/terms-doc-renderer";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  TERMS_MAX_CHARS, TERMS_MAX_SECTIONS, TERMS_MAX_TITLE,
  countTermsChars, emptyTermsDoc, newSectionId,
  type TermsDocNode, type TermsSection,
} from "@/lib/terms-doc";
import {
  errorCodeOf, fetchResellerTermsAdmin, fetchResellerTermsVersion, isBackendMissing,
  publishResellerTermsVersion, saveResellerTermsDraft, setResellerTermsRequired,
  type ResellerTermsAdminResponse, type ResellerTermsVersionFull, type ResellerTermsVersionSummary,
} from "@/services/reseller-terms";

// PLANO_ACEITE_TERMOS_REVENDA §5.6.2 — aba "Termos" de /customizar (superadmin).
// Rascunho e versões vivem no servidor. Depois de salvar/publicar, o conteúdo
// devolvido pelo servidor passa a ser a fonte (ele reconstrói o documento e
// pode trocar ids de seção).

type LoadState = "loading" | "ready" | "missing" | "error";
type PublishKind = "" | "relevant" | "correction";

const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

function safeDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTime(date, DATE_TIME_OPTS);
}

function normalizeSections(input: unknown): TermsSection[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TermsSection[] = [];
  for (const raw of input.slice(0, TERMS_MAX_SECTIONS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<TermsSection>;
    let id = typeof item.id === "string" && item.id ? item.id : newSectionId();
    while (seen.has(id)) id = newSectionId();
    seen.add(id);
    // Documento sem bloco quebraria o editor (o schema exige ao menos um).
    const doc =
      item.doc &&
      typeof item.doc === "object" &&
      item.doc.type === "doc" &&
      Array.isArray(item.doc.content) &&
      item.doc.content.length > 0
        ? (item.doc as TermsDocNode)
        : emptyTermsDoc();
    out.push({ id, title: typeof item.title === "string" ? item.title : "", doc });
  }
  return out;
}

function IconAction({
  label, onClick, disabled, className, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span: o tooltip continua funcionando com o botão desabilitado */}
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", className)}
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ResellerTermsPanel() {
  const t = useTranslations("resellerTermsPanel");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [required, setRequired] = useState(false);
  const [versions, setVersions] = useState<ResellerTermsVersionSummary[]>([]);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [sections, setSections] = useState<TermsSection[]>([]);
  const [activeId, setActiveId] = useState("");
  // Muda quando o conteúdo vem de fora (carga/servidor) → o editor recarrega.
  const [editorEpoch, setEditorEpoch] = useState(0);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingRequired, setSavingRequired] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishKind, setPublishKind] = useState<PublishKind>("");
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewVersionNumber, setViewVersionNumber] = useState<number | null>(null);
  const [viewData, setViewData] = useState<ResellerTermsVersionFull | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const viewRequestRef = useRef(0);

  const [origin, setOrigin] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const buildDefaultSections = useCallback(
    (): TermsSection[] => [
      { id: newSectionId(), title: t("defaultSectionTerms"), doc: emptyTermsDoc() },
      { id: newSectionId(), title: t("defaultSectionPrivacy"), doc: emptyTermsDoc() },
      { id: newSectionId(), title: t("defaultSectionSupport"), doc: emptyTermsDoc() },
      { id: newSectionId(), title: t("defaultSectionMaintenance"), doc: emptyTermsDoc() },
    ],
    [t]
  );

  const replaceSections = useCallback((next: TermsSection[], keepIndexOf?: string) => {
    const previous = sectionsRef.current;
    const index = keepIndexOf ? previous.findIndex((s) => s.id === keepIndexOf) : 0;
    sectionsRef.current = next;
    setSections(next);
    setActiveId(next[Math.max(0, Math.min(index, next.length - 1))]?.id ?? "");
    setEditorEpoch((n) => n + 1);
  }, []);

  const applyAdminMeta = useCallback((data: ResellerTermsAdminResponse) => {
    setRequired(data?.required === true);
    setVersions(Array.isArray(data?.versions) ? data.versions : []);
    setDraftUpdatedAt(data?.draftUpdatedAt ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const { data } = await fetchResellerTermsAdmin();
      applyAdminMeta(data);
      const draft = normalizeSections(data?.draftSections);
      replaceSections(draft.length ? draft : buildDefaultSections());
      setLoadState("ready");
    } catch (err) {
      setLoadState(isBackendMissing(err) ? "missing" : "error");
    }
  }, [applyAdminMeta, buildDefaultSections, replaceSections]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId]
  );
  const activeSectionId = activeSection?.id ?? "";
  const activeIndex = activeSection ? sections.indexOf(activeSection) : -1;
  const activeSectionIdRef = useRef(activeSectionId);
  activeSectionIdRef.current = activeSectionId;

  const charCount = useMemo(() => countTermsChars(sections), [sections]);
  const overLimit = charCount > TERMS_MAX_CHARS;
  const missingTitle = sections.some((s) => !s.title.trim());
  const busy = savingDraft || publishing;
  const canSubmit = sections.length > 0 && !overLimit && !missingTitle && !busy;
  const isFirstPublication = versions.length === 0;
  const publicUrl = origin ? `${origin}/contrato` : "/contrato";

  const notifyError = useCallback(
    (err: unknown) => {
      const code = errorCodeOf(err);
      // O interceptor já avisa permissão negada.
      if (code === "ERR_NO_PERMISSION") return;
      if (code === "ERR_RESELLER_TERMS_INVALID") {
        toast.error(t("invalidContent"));
      } else if (code === "ERR_RESELLER_TERMS_TOO_LARGE") {
        toast.error(t("tooLarge"));
      } else if (code === "ERR_RESELLER_TERMS_NOTHING_PUBLISHED") {
        toast.error(t("nothingPublished"));
      } else if (code === "ERR_RESELLER_TERMS_NO_CHANGES") {
        toast.info(t("noChanges"));
      } else if (isBackendMissing(err)) {
        toast.error(t("serverOutdated"));
      } else {
        toast.error(tErrors("saveFailed"));
      }
    },
    [t, tErrors]
  );

  // Conteúdo do servidor vira a fonte — só se nada foi digitado durante a
  // requisição (senão o que o usuário digitou nesse meio-tempo se perderia).
  const adoptServerSections = useCallback(
    (serverSections: unknown, sent: TermsSection[]) => {
      if (sectionsRef.current !== sent) return;
      const next = normalizeSections(serverSections);
      if (!next.length) return;
      const sameShape =
        next.length === sent.length &&
        next.every(
          (s, i) =>
            s.id === sent[i].id &&
            s.title === sent[i].title &&
            JSON.stringify(s.doc) === JSON.stringify(sent[i].doc)
        );
      if (sameShape) return;
      // Mantém a POSIÇÃO da seção aberta (o id pode ter mudado no servidor).
      replaceSections(next, activeSectionIdRef.current);
    },
    [replaceSections]
  );

  function updateActiveDoc(doc: TermsDocNode) {
    const id = activeSectionId;
    if (!id) return;
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, doc } : s)));
  }

  function updateActiveTitle(title: string) {
    const id = activeSectionId;
    if (!id) return;
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function addSection() {
    if (sections.length >= TERMS_MAX_SECTIONS) return;
    const section: TermsSection = { id: newSectionId(), title: "", doc: emptyTermsDoc() };
    setSections((prev) => (prev.length >= TERMS_MAX_SECTIONS ? prev : [...prev, section]));
    setActiveId(section.id);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  function moveSection(id: string, direction: -1 | 1) {
    setSections((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function confirmRemoveSection() {
    const id = removeTargetId;
    setRemoveTargetId(null);
    if (!id || sections.length <= 1) return;
    const index = sections.findIndex((s) => s.id === id);
    if (index < 0) return;
    const next = sections.filter((s) => s.id !== id);
    setSections(next);
    if (id === activeSectionId) {
      setActiveId(next[Math.min(index, next.length - 1)]?.id ?? "");
    }
  }

  async function handleSaveDraft() {
    if (!canSubmit) return;
    const sent = sectionsRef.current;
    setSavingDraft(true);
    try {
      const { data } = await saveResellerTermsDraft(sent);
      setDraftUpdatedAt(data?.draftUpdatedAt ?? new Date().toISOString());
      adoptServerSections(data?.draftSections, sent);
      toast.success(t("draftSaved"));
    } catch (err) {
      notifyError(err);
    } finally {
      setSavingDraft(false);
    }
  }

  function openPublishDialog() {
    if (!canSubmit) return;
    setPublishKind(isFirstPublication ? "relevant" : "");
    setPublishOpen(true);
  }

  async function handlePublish() {
    if (!canSubmit) return;
    const kind: PublishKind = isFirstPublication ? "relevant" : publishKind;
    if (!kind) return;
    const sent = sectionsRef.current;
    setPublishing(true);
    try {
      const { data } = await publishResellerTermsVersion({
        sections: sent,
        requiresReaccept: kind === "relevant",
      });
      setPublishOpen(false);
      toast.success(t("published", { version: data?.version ?? "" }));
      // A publicação grava o mesmo conteúdo como rascunho: relê do servidor.
      try {
        const { data: admin } = await fetchResellerTermsAdmin();
        applyAdminMeta(admin);
        adoptServerSections(admin?.draftSections, sent);
      } catch {
        if (data && typeof data.version === "number") {
          setVersions((prev) => [data, ...prev.filter((v) => v.id !== data.id)]);
        }
      }
    } catch (err) {
      if (errorCodeOf(err) === "ERR_RESELLER_TERMS_NO_CHANGES") setPublishOpen(false);
      notifyError(err);
    } finally {
      setPublishing(false);
    }
  }

  async function handleToggleRequired(next: boolean) {
    const previous = required;
    setRequired(next);
    setSavingRequired(true);
    try {
      const { data } = await setResellerTermsRequired(next);
      const saved = typeof data?.required === "boolean" ? data.required : next;
      setRequired(saved);
      toast.success(saved ? t("requiredOn") : t("requiredOff"));
    } catch (err) {
      setRequired(previous);
      notifyError(err);
    } finally {
      setSavingRequired(false);
    }
  }

  function handleCopyLink() {
    const url = publicUrl;
    const fallback = () => linkInputRef.current?.select();
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      fallback();
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("linkCopied")))
      .catch(fallback);
  }

  async function handleViewVersion(version: ResellerTermsVersionSummary) {
    const requestId = ++viewRequestRef.current;
    setViewVersionNumber(version.version);
    setViewData(null);
    setViewLoading(true);
    setViewOpen(true);
    try {
      const { data } = await fetchResellerTermsVersion(version.id);
      if (viewRequestRef.current !== requestId) return;
      setViewData(data);
    } catch {
      if (viewRequestRef.current !== requestId) return;
      setViewOpen(false);
      toast.error(t("loadError"));
    } finally {
      if (viewRequestRef.current === requestId) setViewLoading(false);
    }
  }

  if (loadState === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tCommon("loading")}
      </div>
    );
  }

  if (loadState === "missing") {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("serverOutdated")}</AlertDescription>
      </Alert>
    );
  }

  if (loadState === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{t("loadError")}</span>
          <Button type="button" size="sm" variant="outline" onClick={load}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const draftSavedLabel = safeDateTime(draftUpdatedAt);
  const removeTarget = removeTargetId ? sections.find((s) => s.id === removeTargetId) : undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              {/* Lista de seções */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("sectionsTitle")}</p>
                <ul className="space-y-1">
                  {sections.map((section, index) => {
                    const active = section.id === activeSectionId;
                    const untitled = !section.title.trim();
                    return (
                      <li
                        key={section.id}
                        className={cn(
                          "flex items-center gap-0.5 rounded-md border px-1.5",
                          active ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveId(section.id)}
                          aria-current={active ? "true" : undefined}
                          className="min-w-0 flex-1 truncate py-2 text-left text-sm"
                          title={untitled ? t("titleRequired") : section.title}
                        >
                          <span className="mr-1 tabular-nums text-muted-foreground">{index + 1}.</span>
                          <span className={cn(untitled && "text-destructive")}>
                            {untitled ? "—" : section.title}
                          </span>
                        </button>
                        <IconAction
                          label={t("moveUp")}
                          onClick={() => moveSection(section.id, -1)}
                          disabled={busy || index === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label={t("moveDown")}
                          onClick={() => moveSection(section.id, 1)}
                          disabled={busy || index === sections.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label={t("removeSection")}
                          onClick={() => setRemoveTargetId(section.id)}
                          disabled={busy || sections.length <= 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconAction>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addSection}
                  disabled={busy || sections.length >= TERMS_MAX_SECTIONS}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("addSection")}
                </Button>
                {sections.length >= TERMS_MAX_SECTIONS && (
                  <p className="text-xs text-muted-foreground">{t("maxSectionsReached")}</p>
                )}
              </div>

              {/* Seção ativa */}
              {activeSection && (
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reseller-terms-section-title">
                      {t("sectionTitleLabel")}
                      {activeIndex >= 0 && (
                        <span className="ml-1 tabular-nums text-muted-foreground">({activeIndex + 1})</span>
                      )}
                    </Label>
                    <Input
                      id="reseller-terms-section-title"
                      ref={titleInputRef}
                      value={activeSection.title}
                      maxLength={TERMS_MAX_TITLE}
                      placeholder={t("sectionTitlePlaceholder")}
                      onChange={(e) => updateActiveTitle(e.target.value)}
                      aria-invalid={!activeSection.title.trim()}
                    />
                    {!activeSection.title.trim() && (
                      <p className="text-xs text-destructive">{t("titleRequired")}</p>
                    )}
                  </div>
                  <TermsRichEditor
                    value={activeSection.doc}
                    onChange={updateActiveDoc}
                    resetKey={`${activeSectionId}:${editorEpoch}`}
                  />
                </div>
              )}
            </div>

            {/* Tamanho + ações */}
            <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    overLimit ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {t("charCount", {
                    count: formatNumber(charCount),
                    max: formatNumber(TERMS_MAX_CHARS),
                  })}
                </p>
                {overLimit && <p className="text-xs text-destructive">{t("tooLarge")}</p>}
                {/* A seção aberta já avisa embaixo do título; aqui, só as outras. */}
                {sections.some((s) => s.id !== activeSectionId && !s.title.trim()) && (
                  <p className="text-xs text-destructive">{t("titleRequired")}</p>
                )}
                {draftSavedLabel && (
                  <p className="text-xs text-muted-foreground">
                    {t("draftSavedAt", { date: draftSavedLabel })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={!canSubmit}>
                  {savingDraft ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-3.5 w-3.5" />
                  )}
                  {t("saveDraft")}
                </Button>
                <Button type="button" onClick={openPublishDialog} disabled={!canSubmit}>
                  <Send className="mr-2 h-3.5 w-3.5" />
                  {t("publish")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exigência + link público */}
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="reseller-terms-required" className="text-sm font-medium">
                    {t("requiredLabel")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isFirstPublication && !required
                      ? t("requiredNeedsVersion")
                      : required
                        ? t("requiredOn")
                        : t("requiredOff")}
                  </p>
                </div>
                <Switch
                  id="reseller-terms-required"
                  checked={required}
                  onCheckedChange={handleToggleRequired}
                  disabled={savingRequired || (isFirstPublication && !required)}
                />
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-800 dark:text-amber-200/90">{t("requiredNote")}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reseller-terms-public-link">{t("publicLinkLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="reseller-terms-public-link"
                  ref={linkInputRef}
                  readOnly
                  value={publicUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 font-mono text-xs"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={handleCopyLink}
                      aria-label={t("copyLink")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("copyLink")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="outline" size="icon" className="shrink-0">
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label={t("openLink")}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("openLink")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Versões publicadas */}
        <Card>
          <CardHeader>
            <CardTitle>{t("versionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noVersions")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("versionCol")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t("dateCol")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t("authorCol")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t("typeCol")}</TableHead>
                    <TableHead className="whitespace-nowrap text-right">{t("charsCol")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-medium tabular-nums">{version.version}</TableCell>
                      <TableCell className="whitespace-nowrap">{safeDateTime(version.createdAt)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate" title={version.publishedByName || undefined}>
                        {version.publishedByName || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={version.requiresReaccept ? "warning-soft" : "info-soft"}>
                          {version.requiresReaccept ? t("typeRelevant") : t("typeCorrection")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(Number(version.charCount) || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewVersion(version)}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {t("view")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Publicar */}
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!publishing) setPublishOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("publishTitle")}</DialogTitle>
          </DialogHeader>
          <RadioGroup
            value={isFirstPublication ? "relevant" : publishKind}
            onValueChange={(value) => setPublishKind(value as PublishKind)}
            className="gap-2"
          >
            <label
              htmlFor="reseller-terms-publish-relevant"
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
            >
              <RadioGroupItem value="relevant" id="reseller-terms-publish-relevant" className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t("publishRelevant")}</span>
                <span className="text-xs text-muted-foreground">{t("publishRelevantDesc")}</span>
              </span>
            </label>
            {!isFirstPublication && (
              <label
                htmlFor="reseller-terms-publish-correction"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <RadioGroupItem value="correction" id="reseller-terms-publish-correction" className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{t("publishCorrection")}</span>
                  <span className="text-xs text-muted-foreground">{t("publishCorrectionDesc")}</span>
                </span>
              </label>
            )}
          </RadioGroup>
          {isFirstPublication && (
            <p className="text-xs text-muted-foreground">{t("publishFirstNote")}</p>
          )}
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-800 dark:text-amber-200/90">{t("publishImmutableNote")}</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishOpen(false)}
              disabled={publishing}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handlePublish}
              disabled={publishing || !canSubmit || (!isFirstPublication && !publishKind)}
            >
              {publishing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("publishConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover seção */}
      <AlertDialog
        open={removeTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null);
        }}
      >
        <AlertDialogContent aria-describedby={undefined} className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeSectionConfirm")}</AlertDialogTitle>
            {removeTarget?.title.trim() && (
              <p className="break-words text-sm text-muted-foreground">{removeTarget.title}</p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={confirmRemoveSection}
            >
              {t("removeSection")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ver versão */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>{t("viewVersionTitle", { version: viewVersionNumber ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {viewLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tCommon("loading")}
              </div>
            ) : viewData ? (
              <TermsDocRenderer sections={viewData.sections} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export default ResellerTermsPanel;
