"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Code2, Info, LayoutTemplate, Loader2, Monitor,
  Paperclip, Plus, Save, Send, Smartphone, Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";

import { usePageAccess } from "@/hooks/use-page-access";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { UnsavedChangesDialog } from "@/components/configuracoes/unsaved-changes-dialog";
import { EmailHtmlEditor } from "@/components/email-marketing/email-html-editor";
import { EmailTemplateTestDialog } from "@/components/email-marketing/email-template-test-dialog";
import { VisualEmailEditor } from "@/components/email-marketing/visual/visual-email-editor";
import { EmailPreviewFrame } from "@/components/email-marketing/visual/email-preview-frame";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MAX_DESIGN_BYTES, MAX_HTML_BYTES, MOBILE_PREVIEW_WIDTH,
  countDesignIssues, createEmptyDesign, getDesignBytes, isNewerDesign, parseEmailDesign,
  renderEmailHtml, utf8Bytes,
  type EmailDesign,
} from "@/lib/email-design";
import {
  emailTemplateDraftKey, loadEmailTemplateDraft, removeEmailTemplateDraft,
  saveEmailTemplateDraft, type EmailTemplateDraft,
} from "@/lib/email-template-draft";
import {
  createEmailTemplate, fetchEmailEditorCapabilities, fetchEmailTemplate,
  readApiError, updateEmailTemplate,
  type EmailEditorCapabilities, type EmailTemplate, type EmailTemplateAttachment,
} from "@/services/email-marketing";

/**
 * Página do modelo de e-mail (PLANO_EMAIL_EDITOR_VISUAL §5 Passo 4 — D4, D8, D17).
 *
 * `/email-marketing/modelos/novo` cria; `/email-marketing/modelos/<id>` edita. Substitui o
 * antigo diálogo da lista (nome, assunto, anexos e salvar foram movidos para cá).
 *
 * Modos: visual (projeto em blocos, `designJson`) e clássico (HTML). Regras do save:
 *  - visual (ou clássico recém-trocado SEM edição do HTML) → manda o projeto + o HTML renderizado;
 *  - clássico com o HTML editado depois de sair do visual ("desligado") → `designJson: null`;
 *  - demais casos → o campo é OMITIDO (o backend só limpa o projeto se o HTML mudar de fato).
 * Projeto de versão mais nova do editor (ou inválido) abre no clássico e nunca é regravado.
 */

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp3,.ogg,.wav,.mp4,.zip,.ics,.vcf";
const TEMPLATES_LIST_HREF = "/email-marketing";
const TEMPLATE_PAGE_PREFIX = "/email-marketing/modelos/";

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type EditorMode = "visual" | "classic";

interface EditorState {
  name: string;
  subject: string;
  mode: EditorMode;
  /** Projeto visual — guardado também no clássico (voltar sem ter desligado restaura) */
  design: EmailDesign;
  classicHtml: string;
  /** HTML renderizado na troca visual → clássico; null = clássico "nativo" do modelo */
  detachBaseHtml: string | null;
}

type SavePlan =
  | { kind: "design" }
  | { kind: "detach"; html: string }
  | { kind: "html"; html: string };

const EMPTY_STATE: EditorState = {
  name: "",
  subject: "",
  mode: "classic",
  design: createEmptyDesign(),
  classicHtml: "",
  detachBaseHtml: null,
};

function resolveSavePlan(s: EditorState, locked: boolean): SavePlan {
  if (locked) return { kind: "html", html: s.classicHtml };
  if (s.mode === "visual") return { kind: "design" };
  if (s.detachBaseHtml !== null) {
    // Trocou para o clássico e não mexeu no HTML: os blocos continuam valendo
    return s.classicHtml === s.detachBaseHtml
      ? { kind: "design" }
      : { kind: "detach", html: s.classicHtml };
  }
  return { kind: "html", html: s.classicHtml };
}

/** Assinatura do conteúdo que seria salvo (detecção de alterações e do rascunho) */
function contentSignature(s: EditorState, locked: boolean): string {
  const plan = resolveSavePlan(s, locked);
  return JSON.stringify([s.name, s.subject, plan.kind === "design" ? ["d", s.design] : ["h", plan.html]]);
}

function buildDraft(s: EditorState, locked: boolean, baseUpdatedAt: string | null): EmailTemplateDraft {
  const plan = resolveSavePlan(s, locked);
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    baseUpdatedAt,
    name: s.name,
    subject: s.subject,
    mode: plan.kind === "design" ? "visual" : "classic",
    design: plan.kind === "design" ? s.design : null,
    html: plan.kind === "design" ? null : plan.html,
  };
}

/** Estado que o rascunho restauraria sobre o modelo carregado (null = rascunho inutilizável) */
function buildStateFromDraft(
  loaded: EditorState,
  draft: EmailTemplateDraft,
  opts: { allowVisual: boolean }
): EditorState | null {
  const base: EditorState = {
    ...loaded,
    name: typeof draft.name === "string" ? draft.name : "",
    subject: typeof draft.subject === "string" ? draft.subject : "",
  };
  if (draft.mode === "visual") {
    const design = parseEmailDesign(draft.design);
    if (!design) return null;
    if (opts.allowVisual) {
      return { ...base, mode: "visual", design, detachBaseHtml: null };
    }
    // Servidor sem o projeto visual (ou modelo travado): o conteúdo volta como HTML
    return { ...base, mode: "classic", classicHtml: renderEmailHtml(design), detachBaseHtml: null };
  }
  return {
    ...base,
    mode: "classic",
    classicHtml: typeof draft.html === "string" ? draft.html : "",
    // Modelo aberto no visual: o HTML do rascunho só "desliga" os blocos se for diferente
    detachBaseHtml: loaded.mode === "visual" ? renderEmailHtml(loaded.design) : null,
  };
}

/**
 * Id pela URL (não por `useParams`): depois de criar, a URL troca de `novo` para o id via
 * `history.replaceState` sem remontar a página, mas a árvore do roteador continua com o
 * segmento `novo` — um "voltar" do navegador até essa entrada remontaria a página como
 * modelo NOVO. O pathname acompanha a URL real. Lido só na montagem.
 */
function readRouteKey(pathname: string | null): string {
  const last = (pathname || "").split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export default function EmailTemplateEditorPage() {
  const t = useTranslations("emailMarketingPage");
  const tVis = useTranslations("emailVisualEditor");
  const hasAccess = usePageAccess("email-marketing", { allowIfNotSet: true });
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);

  const [routeKey] = useState(() => readRouteKey(pathname));
  const isNewRoute = routeKey === "novo";
  const routeTemplateId = /^\d{1,10}$/.test(routeKey) ? Number(routeKey) : null;

  const [templateId, setTemplateId] = useState<number | null>(routeTemplateId);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [capabilities, setCapabilities] = useState<EmailEditorCapabilities | null>(null);
  const [backendHasDesign, setBackendHasDesign] = useState(false);
  const [designLocked, setDesignLocked] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_STATE);
  const [savedContentSig, setSavedContentSig] = useState(() => contentSignature(EMPTY_STATE, false));
  const [existingAttachments, setExistingAttachments] = useState<EmailTemplateAttachment[]>([]);
  const [savedAttachmentKeys, setSavedAttachmentKeys] = useState("[]");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<"restore" | "empty" | null>(null);
  const [draftOffer, setDraftOffer] = useState<{ draft: EmailTemplateDraft; state: EditorState } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<number | null>(null);

  const loadedRef = useRef(false);
  const suppressDraftRef = useRef(false);
  const flushDraftRef = useRef<() => void>(() => {});

  const ready = !loading && !loadFailed;
  const draftKey = user ? emailTemplateDraftKey(user.tenantId, user.userId, templateId ?? "novo") : null;

  const contentSig = useMemo(() => contentSignature(editor, designLocked), [editor, designLocked]);
  const attachmentKeysSig = useMemo(
    () => JSON.stringify(existingAttachments.map(a => a.key)),
    [existingAttachments]
  );
  const contentDirty = ready && contentSig !== savedContentSig;
  const attachmentsDirty = ready && (newFiles.length > 0 || attachmentKeysSig !== savedAttachmentKeys);
  const dirty = contentDirty || attachmentsDirty;
  const detached =
    editor.mode === "classic" && editor.detachBaseHtml !== null && editor.classicHtml !== editor.detachBaseHtml;
  const deferredClassicHtml = useDeferredValue(editor.classicHtml);

  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
    ],
  };

  // ── Carregamento (uma vez por montagem) ───────────────────────────────────
  useEffect(() => {
    if (!hasAccess || loadedRef.current) return;
    let cancelled = false;
    (async () => {
      if (!isNewRoute && routeTemplateId === null) {
        loadedRef.current = true;
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      const capsPromise = fetchEmailEditorCapabilities();
      let full: EmailTemplate | null = null;
      if (routeTemplateId !== null) {
        try {
          full = await fetchEmailTemplate(routeTemplateId);
        } catch {
          if (cancelled) return;
          loadedRef.current = true;
          setLoadFailed(true);
          setLoading(false);
          toast.error(t("loadError"));
          return;
        }
      }
      const caps = await capsPromise;
      if (cancelled) return;
      loadedRef.current = true;

      // Backend novo = capacidades com design OU Show trazendo a chave designJson
      // (a sonda de capacidades pode ter falhado de forma passageira)
      const showHasDesignKey = !!full && typeof full === "object" && "designJson" in full;
      const backendNew = caps?.design === true || showHasDesignKey;
      const rawDesign = full?.designJson;
      const designPresent = rawDesign !== undefined && rawDesign !== null && rawDesign !== "";
      const parsed = designPresent ? parseEmailDesign(rawDesign) : null;
      const locked = designPresent && (isNewerDesign(rawDesign) || !parsed);

      let initial: EditorState;
      if (full) {
        const base: EditorState = {
          ...EMPTY_STATE,
          name: full.name || "",
          subject: full.subject || "",
          classicHtml: full.html || "",
        };
        initial = parsed && backendNew && !locked
          ? { ...base, mode: "visual", design: parsed }
          : { ...base, mode: "classic" };
      } else {
        // Modelo novo abre no editor visual quando o servidor guarda o projeto (D4)
        initial = { ...EMPTY_STATE, mode: caps?.design ? "visual" : "classic" };
      }

      const atts = Array.isArray(full?.attachments) ? (full?.attachments as EmailTemplateAttachment[]) : [];
      setCapabilities(caps);
      setBackendHasDesign(backendNew);
      setDesignLocked(locked);
      setEditor(initial);
      setSavedContentSig(contentSignature(initial, locked));
      setExistingAttachments(atts);
      setSavedAttachmentKeys(JSON.stringify(atts.map(a => a.key)));
      setNewFiles([]);
      setBaseUpdatedAt(full?.updatedAt ?? null);
      setLoading(false);

      // Rascunho automático (D17): oferece restaurar só se difere do que foi carregado
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const key = emailTemplateDraftKey(currentUser.tenantId, currentUser.userId, routeTemplateId ?? "novo");
        const draft = loadEmailTemplateDraft(key);
        if (draft) {
          const candidate = buildStateFromDraft(initial, draft, { allowVisual: backendNew && !locked });
          if (candidate && contentSignature(candidate, locked) !== contentSignature(initial, locked)) {
            setDraftOffer({ draft, state: candidate });
          } else {
            removeEmailTemplateDraft(key);
          }
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  // ── Rascunho: debounce de 1 s, `pagehide` e desmontagem (voltar do navegador) ──
  useEffect(() => {
    flushDraftRef.current = () => {
      if (suppressDraftRef.current || !ready || draftOffer) return;
      // Usuário lido do store na hora: o logout (clearAuth) apaga os rascunhos e zera o
      // usuário antes de a página desmontar — o flush da desmontagem não pode recriá-los
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;
      if (contentSignature(editor, designLocked) === savedContentSig) return;
      saveEmailTemplateDraft(
        emailTemplateDraftKey(currentUser.tenantId, currentUser.userId, templateId ?? "novo"),
        buildDraft(editor, designLocked, baseUpdatedAt)
      );
    };
  });

  useEffect(() => {
    if (!contentDirty) return;
    const tid = window.setTimeout(() => flushDraftRef.current(), 1000);
    return () => window.clearTimeout(tid);
  }, [contentDirty, contentSig]);

  useEffect(() => {
    const onPageHide = () => flushDraftRef.current();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushDraftRef.current();
    };
  }, []);

  // ── Saída com alterações ──────────────────────────────────────────────────
  useUnsavedChangesGuard({ enabled: dirty, onIntercept: setPendingHref });

  const leaveTo = useCallback((href: string) => {
    // Saída intencional (salvou, descartou ou estava limpo): não regravar rascunho
    suppressDraftRef.current = true;
    router.push(href);
  }, [router]);

  const handleBack = () => {
    if (dirty) setPendingHref(TEMPLATES_LIST_HREF);
    else leaveTo(TEMPLATES_LIST_HREF);
  };

  // ── Edição ────────────────────────────────────────────────────────────────
  const setName = (name: string) => setEditor(prev => ({ ...prev, name }));
  const setSubject = (subject: string) => setEditor(prev => ({ ...prev, subject }));

  const handleDesignChange = useCallback((next: EmailDesign) => {
    setEditor(prev => (prev.design === next ? prev : { ...prev, design: next }));
  }, []);

  const handleClassicChange = useCallback((html: string) => {
    setEditor(prev => (prev.classicHtml === html ? prev : { ...prev, classicHtml: html }));
  }, []);

  const switchToClassic = () => {
    if (editor.mode === "classic") return;
    const html = renderEmailHtml(editor.design);
    setEditor(prev => ({ ...prev, mode: "classic", classicHtml: html, detachBaseHtml: html }));
  };

  const switchToVisual = () => {
    if (editor.mode === "visual" || designLocked || !backendHasDesign) return;
    if (editor.detachBaseHtml !== null) {
      // Veio do visual: sem edição do HTML volta direto; com edição, confirma e restaura os blocos
      if (editor.classicHtml === editor.detachBaseHtml) {
        setEditor(prev => ({ ...prev, mode: "visual", detachBaseHtml: null }));
      } else {
        setReplaceConfirm("restore");
      }
      return;
    }
    if (editor.classicHtml.trim()) {
      setReplaceConfirm("empty");
      return;
    }
    setEditor(prev => ({ ...prev, mode: "visual", design: createEmptyDesign(), detachBaseHtml: null }));
  };

  const confirmReplace = () => {
    const kind = replaceConfirm;
    setReplaceConfirm(null);
    if (kind === "restore") {
      setEditor(prev => ({ ...prev, mode: "visual", detachBaseHtml: null }));
    } else if (kind === "empty") {
      setEditor(prev => ({ ...prev, mode: "visual", design: createEmptyDesign(), detachBaseHtml: null }));
    }
  };

  const restoreDraft = () => {
    if (!draftOffer) return;
    setEditor(draftOffer.state);
    setDraftOffer(null);
  };

  const discardDraft = () => {
    if (draftKey) removeEmailTemplateDraft(draftKey);
    setDraftOffer(null);
  };

  // ── Salvar (devolve o id salvo; null = não salvou) ────────────────────────
  const handleSave = async (): Promise<number | null> => {
    if (saving || !ready) return null;
    const s = editor;
    if (!s.name.trim() || !s.subject.trim()) {
      toast.error(t("requiredFields"));
      return null;
    }

    const plan = resolveSavePlan(s, designLocked);
    let html: string;
    let designJson: EmailDesign | null | undefined;
    if (plan.kind === "design") {
      if (!s.design.blocks.length) {
        toast.error(t("requiredFields"));
        return null;
      }
      const issues = countDesignIssues(s.design);
      if (issues > 0) {
        toast.error(tVis("issuesSummary", { count: issues }));
        return null;
      }
      html = renderEmailHtml(s.design);
      if (utf8Bytes(html) > MAX_HTML_BYTES || getDesignBytes(s.design) > MAX_DESIGN_BYTES) {
        toast.error(tVis("tooLarge"));
        return null;
      }
      designJson = s.design;
    } else {
      html = plan.html;
      if (!html.trim()) {
        toast.error(t("requiredFields"));
        return null;
      }
      designJson = plan.kind === "detach" ? null : undefined;
    }

    const sentSig = contentSignature(s, designLocked);
    const sentFiles = newFiles;
    const previousDraftKey = draftKey;
    setSaving(true);
    try {
      const payload = {
        name: s.name.trim(),
        subject: s.subject.trim(),
        html,
        files: sentFiles,
        ...(designJson !== undefined ? { designJson } : {}),
      };
      const saved = templateId !== null
        ? await updateEmailTemplate(templateId, {
          ...payload,
          keepAttachmentKeys: existingAttachments.map(a => a.key),
        })
        : await createEmailTemplate(payload);

      const savedId = Number(saved?.id) || templateId;

      if (previousDraftKey) removeEmailTemplateDraft(previousDraftKey);
      if (templateId === null && savedId) {
        if (user) removeEmailTemplateDraft(emailTemplateDraftKey(user.tenantId, user.userId, savedId));
        setTemplateId(savedId);
        // Sem router.replace: remontaria a página (perde o diálogo de teste e o desfazer).
        // Só enquanto a URL ainda é a do modelo novo — quem saiu durante o salvamento
        // não pode ter a URL da página seguinte trocada.
        if (window.location.pathname.replace(/\/+$/, "") === `${TEMPLATE_PAGE_PREFIX}novo`) {
          window.history.replaceState(null, "", `${TEMPLATE_PAGE_PREFIX}${savedId}`);
        }
      }

      const savedAttachments = saved?.attachments;
      const nextAttachments = Array.isArray(savedAttachments) ? savedAttachments : existingAttachments;
      setExistingAttachments(nextAttachments);
      setSavedAttachmentKeys(JSON.stringify(nextAttachments.map(a => a.key)));
      setNewFiles(prev => prev.filter(f => !sentFiles.includes(f)));
      setBaseUpdatedAt(saved?.updatedAt ?? null);
      if (plan.kind === "detach") {
        // Blocos desligados e salvos: o modelo passa a ser clássico
        setEditor(prev => (prev.detachBaseHtml === null ? prev : { ...prev, detachBaseHtml: null }));
      }
      setSavedContentSig(sentSig);

      toast.success(t("saved"));
      if (plan.kind === "design" && !(saved && typeof saved === "object" && "designJson" in saved)) {
        toast.warning(tVis("serverNoDesign"));
      }
      return savedId ?? null;
    } catch (err: unknown) {
      const { code } = readApiError(err);
      if (code === "ERR_EMAIL_DESIGN_INVALID" || code === "LIMIT_FIELD_VALUE") {
        toast.error(tVis("tooLarge"));
      } else {
        toast.error(t("saveError"));
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveNow = () => {
    void handleSave();
  };

  // "Enviar teste" usa o modelo gravado: novo ou alterado → salva antes
  const handleTest = async () => {
    let id = templateId;
    if (id === null || dirty) {
      id = await handleSave();
      if (id === null) return;
    }
    setTestTemplateId(id);
    setTestOpen(true);
  };

  if (!hasAccess) return <AccessDenied />;

  const title = isNewRoute && templateId === null ? t("dialogNewTitle") : t("dialogEditTitle");
  const draftTime = (() => {
    const savedAt = draftOffer?.draft.savedAt;
    if (!savedAt || Number.isNaN(new Date(savedAt).getTime())) return "—";
    return formatDateTime(savedAt, { dateStyle: "short", timeStyle: "short" });
  })();

  return (
    <div className="space-y-6">
      <PageHeader title={title} help={pageHelp}>
        <Button variant="outline" onClick={handleBack} className="gap-1.5" aria-label={t("backToTemplates")}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t("backToTemplates")}</span>
        </Button>
        {ready && (
          <>
            <Button variant="outline" onClick={handleTest} disabled={saving} className="gap-1.5">
              <Send className="h-4 w-4" />
              {t("testSend")}
            </Button>
            <Button onClick={saveNow} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("save")}
            </Button>
          </>
        )}
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      ) : loadFailed ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{t("loadError")}</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <div className="space-y-1.5">
                <Label htmlFor="email-template-name">{t("fieldName")}</Label>
                <Input
                  id="email-template-name"
                  value={editor.name}
                  onChange={e => setName(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-template-subject">{t("fieldSubject")}</Label>
                <Input
                  id="email-template-subject"
                  value={editor.subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{t("fieldHtml")}</Label>
                {backendHasDesign && (
                  <div
                    className="inline-flex flex-wrap gap-1 rounded-md border bg-muted/40 p-0.5"
                    role="group"
                    aria-label={t("fieldHtml")}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.mode === "visual" ? "secondary" : "ghost"}
                      aria-pressed={editor.mode === "visual"}
                      disabled={designLocked}
                      onClick={switchToVisual}
                      className="h-8 gap-1.5"
                    >
                      <LayoutTemplate className="h-4 w-4" />
                      {tVis("modeVisual")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.mode === "classic" ? "secondary" : "ghost"}
                      aria-pressed={editor.mode === "classic"}
                      onClick={switchToClassic}
                      className="h-8 gap-1.5"
                    >
                      <Code2 className="h-4 w-4" />
                      {tVis("modeClassic")}
                    </Button>
                  </div>
                )}
              </div>

              {designLocked && (
                <Alert variant="warning-soft">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{tVis("newerDesignNotice")}</AlertDescription>
                </Alert>
              )}
              {editor.mode === "classic" && editor.detachBaseHtml !== null && (
                <Alert variant={detached ? "warning-soft" : "info-soft"}>
                  {detached ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                  <AlertDescription>{tVis("classicDetachNotice")}</AlertDescription>
                </Alert>
              )}

              {editor.mode === "visual" ? (
                <VisualEmailEditor
                  value={editor.design}
                  onChange={handleDesignChange}
                  capabilities={capabilities}
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <EmailHtmlEditor
                      value={editor.classicHtml}
                      onChange={handleClassicChange}
                      minHeightClass="min-h-[360px]"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t("previewTitle")}</span>
                      <div className="inline-flex gap-0.5 rounded-md border p-0.5" role="group" aria-label={t("previewTitle")}>
                        <Button
                          type="button"
                          size="sm"
                          variant={previewDevice === "desktop" ? "secondary" : "ghost"}
                          aria-pressed={previewDevice === "desktop"}
                          onClick={() => setPreviewDevice("desktop")}
                          className="h-7 gap-1.5 px-2 text-xs"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                          {tVis("viewDesktop")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={previewDevice === "mobile" ? "secondary" : "ghost"}
                          aria-pressed={previewDevice === "mobile"}
                          onClick={() => setPreviewDevice("mobile")}
                          className="h-7 gap-1.5 px-2 text-xs"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          {tVis("viewMobile")}
                        </Button>
                      </div>
                    </div>
                    {/* O e-mail fica sempre claro, como na caixa de entrada */}
                    <div className="max-h-[70vh] overflow-auto rounded-md border bg-white">
                      <EmailPreviewFrame
                        html={deferredClassicHtml}
                        width={previewDevice === "mobile" ? MOBILE_PREVIEW_WIDTH : undefined}
                        className="mx-auto"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tVis("previewVariablesNote", { example: "{{firstName}}" })}
                    </p>
                    <p className="text-xs text-muted-foreground">{tVis("footerNote")}</p>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">{t("variablesNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1.5 p-4 sm:p-6">
              <Label>{t("attachments")}</Label>
              <div className="space-y-2">
                {existingAttachments.map(att => (
                  <div key={att.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{att.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(att.size)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={saving}
                      onClick={() => setExistingAttachments(prev => prev.filter(a => a.key !== att.key))}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {newFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={saving}
                      onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline",
                    saving && "pointer-events-none opacity-50"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {t("addAttachment")}
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={saving}
                    accept={ATTACHMENT_ACCEPT}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      const tooBig = files.filter(f => f.size > MAX_ATTACHMENT_BYTES);
                      if (tooBig.length > 0) toast.error(t("attachmentTooBig"));
                      setNewFiles(prev => [...prev, ...files.filter(f => f.size <= MAX_ATTACHMENT_BYTES)]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">{t("attachmentsHint")}</p>
              </div>
            </CardContent>
          </Card>

          <FloatingSaveButton saving={saving} onClick={saveNow} />
        </>
      )}

      <EmailTemplateTestDialog open={testOpen} onOpenChange={setTestOpen} templateId={testTemplateId} />

      {/* Saída com alterações: link interno interceptado ou "Voltar aos modelos" */}
      <UnsavedChangesDialog
        open={pendingHref !== null}
        onOpenChange={open => { if (!open) setPendingHref(null); }}
        onDiscard={() => {
          const href = pendingHref;
          setPendingHref(null);
          if (draftKey) removeEmailTemplateDraft(draftKey);
          if (href) leaveTo(href);
        }}
        onSave={async () => {
          const href = pendingHref;
          const savedId = await handleSave();
          if (savedId !== null) {
            setPendingHref(null);
            if (href) leaveTo(href);
          }
        }}
        saving={saving}
        labels={{
          title: t("unsavedTitle"),
          message: t("unsavedDesc"),
          stay: t("keepEditing"),
          discard: t("discardChanges"),
          save: t("save"),
        }}
      />

      {/* Clássico → visual: substitui o conteúdo atual */}
      <AlertDialog open={replaceConfirm !== null} onOpenChange={open => { if (!open) setReplaceConfirm(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{tVis("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tVis("replaceDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>{tVis("replaceConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rascunho automático (D17) — fechar sem escolher mantém o rascunho para depois */}
      <AlertDialog open={draftOffer !== null} onOpenChange={open => { if (!open) setDraftOffer(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("draftRestoreTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("draftRestoreDesc", { time: draftTime })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>{t("draftDiscard")}</AlertDialogCancel>
            <AlertDialogAction onClick={restoreDraft}>{t("draftRestore")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
