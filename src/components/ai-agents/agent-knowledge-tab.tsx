"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BookOpen, FileText, Library, Link2, ListChecks, Loader2, Pencil, Plus,
  RefreshCw, Trash2, Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  createAiAgentDocumentSource, createAiAgentKnowledge, deleteAiAgentKnowledge,
  deleteAiAgentSource, fetchAiAgentKnowledge, fetchAiAgentSources,
  resyncAiAgentSource, updateAiAgentKnowledge,
  type AiAgentEngineFeature, type AiAgentKnowledge, type AiAgentSource,
  type AiAgentSourceType,
} from "@/services/ai-agents";
import { aiAgentErrorKey, aiAgentErrorKeyFromCode } from "./agent-error";
import { AgentSourceUrlDialog } from "./agent-source-url-dialog";
import { AgentSourceFaqDialog } from "./agent-source-faq-dialog";

interface AgentKnowledgeTabProps {
  agentId: number;
  kbEnabled: boolean;
  onKbEnabledChange: (value: boolean) => void;
  semanticEnabled: boolean;
  onSemanticEnabledChange: (value: boolean) => void;
  // Anunciado pelo servidor. Ausente (servidor antigo ou quem não repassa) =
  // aba igual à anterior
  engineFeatures?: AiAgentEngineFeature[];
}

// Mesmo teto do upload no servidor: barrar aqui evita subir 10MB+ para
// receber 413 no fim
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt";
// Só com `kbJsonMd`: JSON e Markdown entram como documento comum (mesmo
// ícone, mesmo teto de 10MB)
const DOCUMENT_ACCEPT_V6 = `${DOCUMENT_ACCEPT},.json,.md,.markdown`;

const SOURCE_ICONS: Record<AiAgentSourceType, typeof FileText> = {
  document: FileText,
  url: Link2,
  faq: ListChecks,
};

export function AgentKnowledgeTab({
  agentId,
  kbEnabled,
  onKbEnabledChange,
  semanticEnabled,
  onSemanticEnabledChange,
  engineFeatures,
}: AgentKnowledgeTabProps) {
  const t = useTranslations("aiAgents");
  const supportsKbJsonMd =
    Array.isArray(engineFeatures) && engineFeatures.includes("kbJsonMd");

  const [articles, setArticles] = useState<AiAgentKnowledge[]>([]);
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editArticleId, setEditArticleId] = useState<number | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [articleActive, setArticleActive] = useState(true);
  const [savingArticle, setSavingArticle] = useState(false);
  const [deleteArticleId, setDeleteArticleId] = useState<number | null>(null);

  // Fontes importadas: "unavailable" = servidor sem o recurso (rota nova
  // responde 404) → a seção inteira some e a aba fica igual à versão anterior
  const [sources, setSources] = useState<AiAgentSource[]>([]);
  const [sourcesState, setSourcesState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [resyncingId, setResyncingId] = useState<number | null>(null);
  const [deleteSourceId, setDeleteSourceId] = useState<number | null>(null);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAiAgentKnowledge(agentId);
      setArticles(records);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [agentId, t]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const loadSources = useCallback(async () => {
    try {
      const records = await fetchAiAgentSources(agentId);
      setSources(records);
      setSourcesState("ok");
    } catch {
      // Sem toast: servidor antigo (404) simplesmente não tem a seção.
      // Falha depois da 1ª carga mantém a lista já exibida.
      setSourcesState(prev => (prev === "ok" ? "ok" : "unavailable"));
    }
  }, [agentId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleDocumentSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(t("errFileTooLarge"));
      return;
    }
    setUploadingDocument(true);
    try {
      await createAiAgentDocumentSource(agentId, file);
      toast.success(t("sourceAdded"));
      loadSources();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleResyncSource = async (sourceId: number) => {
    setResyncingId(sourceId);
    try {
      await resyncAiAgentSource(agentId, sourceId);
      toast.success(t("sourceResynced"));
      loadSources();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setResyncingId(null);
    }
  };

  const handleDeleteSource = async () => {
    if (!deleteSourceId) return;
    try {
      await deleteAiAgentSource(agentId, deleteSourceId);
      toast.success(t("sourceDeleted"));
      setSources(prev => prev.filter(source => source.id !== deleteSourceId));
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setDeleteSourceId(null);
    }
  };

  const sourceTypeLabel = (type: AiAgentSourceType) => {
    if (type === "url") return t("sourceTypeUrl");
    if (type === "faq") return t("sourceTypeFaq");
    return t("sourceTypeDocument");
  };

  const formatSyncDate = (value?: string | null) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return "";
    }
  };

  const openCreateArticle = () => {
    setEditArticleId(null);
    setArticleTitle("");
    setArticleContent("");
    setArticleActive(true);
    setFormOpen(true);
  };

  const openEditArticle = (article: AiAgentKnowledge) => {
    setEditArticleId(article.id);
    setArticleTitle(article.title || "");
    setArticleContent(article.content);
    setArticleActive(article.isActive !== false);
    setFormOpen(true);
  };

  const handleSaveArticle = async () => {
    if (!articleContent.trim()) {
      toast.error(t("requiredFields"));
      return;
    }
    setSavingArticle(true);
    try {
      const payload = {
        title: articleTitle.trim() || null,
        content: articleContent,
        isActive: articleActive,
      };
      if (editArticleId) {
        await updateAiAgentKnowledge(agentId, editArticleId, payload);
      } else {
        await createAiAgentKnowledge(agentId, payload);
      }
      toast.success(t("articleSaved"));
      setFormOpen(false);
      loadArticles();
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setSavingArticle(false);
    }
  };

  const handleDeleteArticle = async () => {
    if (!deleteArticleId) return;
    try {
      await deleteAiAgentKnowledge(agentId, deleteArticleId);
      toast.success(t("articleDeleted"));
      setArticles(prev => prev.filter(a => a.id !== deleteArticleId));
    } catch (err: unknown) {
      const key = aiAgentErrorKey(err);
      toast.error(key ? t(key) : t("saveError"));
    } finally {
      setDeleteArticleId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ai-agent-kb-enabled">{t("kbEnabled")}</Label>
          <Switch
            id="ai-agent-kb-enabled"
            checked={kbEnabled}
            onCheckedChange={onKbEnabledChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("kbNote")}</p>
      </div>

      {sourcesState === "loading" && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {sourcesState === "ok" && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-agent-semantic-enabled">{t("semanticEnabled")}</Label>
              <Switch
                id="ai-agent-semantic-enabled"
                checked={semanticEnabled}
                onCheckedChange={onSemanticEnabledChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("semanticNote")}</p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <h4 className="flex items-center gap-1.5 text-sm font-medium">
                <Library className="h-4 w-4" />
                {t("sourcesTitle")}
              </h4>
              <p className="text-xs text-muted-foreground">{t("sourcesNote")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={documentInputRef}
                type="file"
                accept={supportsKbJsonMd ? DOCUMENT_ACCEPT_V6 : DOCUMENT_ACCEPT}
                className="hidden"
                onChange={handleDocumentSelected}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={uploadingDocument}
                onClick={() => documentInputRef.current?.click()}
              >
                {uploadingDocument
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Upload className="h-4 w-4" />}
                {t("addDocument")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setUrlDialogOpen(true)}
              >
                <Link2 className="h-4 w-4" />
                {t("addUrl")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFaqDialogOpen(true)}
              >
                <ListChecks className="h-4 w-4" />
                {t("addFaq")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {supportsKbJsonMd ? t("sourceDocHintV6") : t("sourceDocHint")}
            </p>

            {sources.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {t("sourcesEmpty")}
              </p>
            ) : (
              <div className="space-y-2">
                {sources.map(source => {
                  const Icon = SOURCE_ICONS[source.type] || FileText;
                  const isError = source.status === "error";
                  // errorMessage é CÓDIGO ERR_*: sempre traduzir, nunca exibir cru
                  const errorKey = aiAgentErrorKeyFromCode(source.errorMessage);
                  const errorText = errorKey ? t(errorKey) : t("sourceErrorGeneric");
                  const isResyncing = resyncingId === source.id;
                  return (
                    <div
                      key={source.id}
                      className="flex items-start justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{source.name}</span>
                            {isError ? (
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="destructive-soft" tabIndex={0}>
                                      {t("sourceStatusError")}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">{errorText}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Badge variant="success-soft">{t("sourceStatusReady")}</Badge>
                            )}
                            {source.type === "url" && source.syncEnabled && (
                              <Badge variant="secondary">{t("sourceSyncDaily")}</Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {sourceTypeLabel(source.type)}
                            {" · "}
                            {t("sourceChunks", { count: source.chunkCount ?? 0 })}
                            {source.lastSyncAt
                              ? ` · ${t("lastSync", { date: formatSyncDate(source.lastSyncAt) })}`
                              : ""}
                          </p>
                          {source.url && (
                            <p className="truncate text-xs text-muted-foreground">{source.url}</p>
                          )}
                          {isError && (
                            <p className="text-xs text-destructive sm:hidden">{errorText}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {source.type !== "faq" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={isResyncing}
                            onClick={() => handleResyncSource(source.id)}
                            aria-label={t("sourceResync")}
                            title={t("sourceResync")}
                          >
                            {isResyncing
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteSourceId(source.id)}
                          aria-label={t("delete")}
                          title={t("delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        {sourcesState === "ok"
          ? <h4 className="text-sm font-medium">{t("articlesTitle")}</h4>
          : <span />}
        <Button type="button" variant="outline" onClick={openCreateArticle} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("addArticle")}
        </Button>
      </div>

      {formOpen && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>{t("articleTitle")}</Label>
            <Input
              value={articleTitle}
              onChange={e => setArticleTitle(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("articleContent")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={6}
              value={articleContent}
              onChange={e => setArticleContent(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("articleContentHint")}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ai-agent-article-active">{t("articleActive")}</Label>
            <Switch
              id="ai-agent-article-active"
              checked={articleActive}
              onCheckedChange={setArticleActive}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveArticle}
              disabled={savingArticle}
              className="gap-1.5"
            >
              {savingArticle && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t("knowledgeEmpty")}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{t("knowledgeEmptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map(article => (
            <div
              key={article.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {article.title || t("articleUntitled")}
                  </span>
                  <Badge variant={article.isActive !== false ? "default" : "secondary"}>
                    {article.isActive !== false ? t("statusActive") : t("statusInactive")}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{article.content}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditArticle(article)}
                  aria-label={t("edit")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteArticleId(article.id)}
                  aria-label={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={deleteArticleId !== null}
        onOpenChange={o => { if (!o) setDeleteArticleId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("articleDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("articleDeleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteArticle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteSourceId !== null}
        onOpenChange={o => { if (!o) setDeleteSourceId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sourceDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sourceDeleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSource}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentSourceUrlDialog
        open={urlDialogOpen}
        onOpenChange={setUrlDialogOpen}
        agentId={agentId}
        onCreated={loadSources}
      />

      <AgentSourceFaqDialog
        open={faqDialogOpen}
        onOpenChange={setFaqDialogOpen}
        agentId={agentId}
        onCreated={loadSources}
      />
    </div>
  );
}
