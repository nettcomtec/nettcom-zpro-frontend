"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft, Check, Copy, ExternalLink, Eye, Inbox, Info, ListChecks, Palette, Pencil, RotateCw, Save, Send, Share2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/layout/access-denied";
import { UnsavedChangesDialog } from "@/components/configuracoes/unsaved-changes-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useAuthStore } from "@/stores/auth-store";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { cn } from "@/lib/utils";
import {
  FORM_LIMITS,
  FORM_RESERVED_FIELD_KEYS,
  FORM_SUBMISSION_STATUSES,
  FORM_THEME_DEFAULTS,
  computeFormContactRule,
  generateFieldKey,
  isFormChannelTypeAccepted,
  isFormEmailChannelType,
  isFormOfficialChannelType,
  isFormPhoneChannelType,
  isReservedHiddenParam,
  isValidFormSlug,
  normalizeFormSlug,
  type FormConfig,
  type FormDetail,
  type FormField,
  type FormFieldOption,
  type FormMapTo,
  type FormTheme,
} from "@/lib/forms";
import {
  checkFormSlug,
  createForm,
  fetchForm,
  fetchForms,
  formDetailToConfig,
  getFormErrorDetails,
  getRequestStatus,
  updateForm,
} from "@/services/forms";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchQueues } from "@/services/queues";
import { fetchTags } from "@/services/tags";
import { fetchChatFlows } from "@/services/chatflow";
import { fetchAiAgents } from "@/services/ai-agents";
import { fetchPipelines, fetchStages } from "@/services/funnel";
import { FieldsTab } from "@/components/forms/editor/fields-tab";
import { AppearanceTab } from "@/components/forms/editor/appearance-tab";
import { OnSubmitTab, type OnSubmitInvalidKey } from "@/components/forms/editor/on-submit-tab";
import { FormPreview } from "@/components/forms/editor/form-preview";
import { FormSlugField } from "@/components/forms/editor/slug-field";
import { useFormSlugCheck } from "@/components/forms/editor/use-form-slug";
import { ShareTab } from "@/components/forms/share-tab";
import { ResponsesTab, type ResponsesStatusFilter } from "@/components/forms/responses-tab";
import {
  FIELD_KEY_RE,
  HIDDEN_PARAM_RE,
  FieldNote,
  InfoHint,
  NoticeBox,
  formErrorKey,
  fromEditorFields,
  hasEmptyTemplateVar,
  isHexColor,
  isHttpsUrl,
  makeFieldUid,
  randomSlugSuffix,
  toEditorFields,
  useCopyFeedback,
  useFormsPageHelp,
  type EditorField,
  type FormChannelOption,
  type FormFlowOption,
  type FormNamedOption,
  type FormStageOption,
} from "@/components/forms/editor/form-editor-shared";

/**
 * Editor do formulário (`/formularios/<id>`; `/formularios/new` cria) —
 * docs/PLANO_FORMULARIOS_ATENDIMENTO.md §5.9. Mesmo acesso da lista (ver a casca dela).
 */
export default function FormEditorPage() {
  const allowed = usePageAccess("formularios", { adminSuperOnly: true, allowIfNotSet: true });
  if (!allowed) return <AccessDenied />;
  return <FormEditorContent />;
}

type EditorTab = "fields" | "appearance" | "onSubmit" | "share" | "responses";
const EDITOR_TABS: EditorTab[] = ["fields", "appearance", "onSubmit", "share", "responses"];

type LoadState = "loading" | "ready" | "notFound" | "denied" | "unavailable" | "schemaMissing" | "notInPlan" | "error";

type Draft = Omit<FormConfig, "fields"> & { fields: EditorField[] };

type OptionalThemeKey = "logoUrl" | "coverUrl" | "title" | "description" | "submitLabel" | "successMessage" | "redirectUrl";
const OPTIONAL_THEME_KEYS: OptionalThemeKey[] = [
  "logoUrl", "coverUrl", "title", "description", "submitLabel", "successMessage", "redirectUrl",
];

const LIST_HREF = "/formularios";

const asRows = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const src = payload as { data?: unknown; rows?: unknown; chatFlow?: unknown } | null;
  const inner = src?.data ?? src?.rows ?? src?.chatFlow;
  return Array.isArray(inner) ? (inner as T[]) : [];
};

const positiveId = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ── Normalização do que vai ao servidor ──────────────────────────────────────
const cleanMapTo = (mapTo: FormMapTo): FormMapTo => {
  if (mapTo.kind === "custom") return { kind: "custom", name: mapTo.name.trim() };
  if (mapTo.kind === "contact") return { kind: "contact", field: mapTo.field };
  return { kind: "none" };
};

const cleanOption = (option: FormFieldOption): FormFieldOption => {
  const out: FormFieldOption = { id: option.id, label: option.label.trim() };
  if (option.queueId) out.queueId = option.queueId;
  if (option.tagIds && option.tagIds.length > 0) out.tagIds = [...option.tagIds];
  return out;
};

const cleanField = (field: FormField): FormField => {
  const out: FormField = {
    key: field.key.trim(),
    type: field.type,
    label: field.label.trim(),
    required: field.type === "hidden" ? false : field.required,
    mapTo: cleanMapTo(field.mapTo),
  };
  const placeholder = field.placeholder?.trim();
  if (placeholder) out.placeholder = placeholder;
  const helpText = field.helpText?.trim();
  if (helpText) out.helpText = helpText;
  if (field.width === "half") out.width = "half";
  if ((field.type === "select" || field.type === "multiselect") && field.options) out.options = field.options.map(cleanOption);
  if (field.type === "number") {
    if (typeof field.min === "number") out.min = field.min;
    if (typeof field.max === "number") out.max = field.max;
  }
  if ((field.type === "text" || field.type === "textarea") && field.maxLength) out.maxLength = field.maxLength;
  const checkboxText = field.checkboxText?.trim();
  if (field.type === "checkbox" && checkboxText) out.checkboxText = checkboxText;
  if (field.type === "hidden") {
    const hiddenParam = field.hiddenParam?.trim();
    if (hiddenParam) out.hiddenParam = hiddenParam;
    const hiddenDefault = field.hiddenDefault?.trim();
    if (hiddenDefault) out.hiddenDefault = hiddenDefault;
  }
  return out;
};

const cleanTheme = (theme: FormTheme): FormTheme => {
  const out: FormTheme = {
    primaryColor: theme.primaryColor,
    backgroundColor: theme.backgroundColor,
    colorScheme: theme.colorScheme,
    radius: theme.radius,
    width: theme.width,
  };
  OPTIONAL_THEME_KEYS.forEach((key) => {
    const value = theme[key]?.trim();
    if (value) out[key] = value;
  });
  return out;
};

/** Configuração que vai ao servidor: sem ids da tela, textos aparados e referências que o modo não usa zeradas. */
const buildPayload = (draft: Draft): FormConfig => ({
  name: draft.name.trim(),
  slug: normalizeFormSlug(draft.slug),
  isActive: draft.isActive,
  whatsappId: draft.whatsappId,
  emailFallbackWhatsappId: draft.emailFallbackWhatsappId,
  destinationMode: draft.destinationMode,
  queueId: draft.queueId,
  chatFlowId: draft.destinationMode === "chatflow" ? draft.chatFlowId : null,
  aiAgentId: draft.destinationMode === "ai_agent" ? draft.aiAgentId : null,
  tagIds: [...draft.tagIds],
  opportunityPipelineId: draft.opportunityPipelineId,
  opportunityStageId: draft.opportunityPipelineId !== null ? draft.opportunityStageId : null,
  confirmationEnabled: draft.confirmationEnabled,
  confirmationText: draft.confirmationText && draft.confirmationText.trim() ? draft.confirmationText.trim() : null,
  confirmationTemplate: draft.confirmationTemplate || null,
  confirmationEmailSubject: draft.confirmationEmailSubject?.trim() || null,
  fields: fromEditorFields(draft.fields).map(cleanField),
  theme: cleanTheme(draft.theme),
  acceptExternalPosts: draft.acceptExternalPosts,
  dailyLimit: draft.dailyLimit,
  minFillSeconds: draft.minFillSeconds,
});

const signatureOf = (draft: Draft): string => JSON.stringify(buildPayload(draft));

/** Rascunho a partir do salvo, mantendo o id de tela dos campos que já estavam na tela (pela chave). */
const draftFromConfig = (config: FormConfig, previous?: EditorField[]): Draft => {
  const uidByKey = new Map((previous ?? []).map((f) => [f.key, f._uid] as const));
  const fields = toEditorFields(config.fields).map((f) => {
    const uid = uidByKey.get(f.key);
    return uid ? { ...f, _uid: uid } : f;
  });
  return {
    ...config,
    tagIds: [...config.tagIds],
    theme: { ...FORM_THEME_DEFAULTS, ...config.theme },
    fields,
  };
};

const makeNewDraft = (labels: { name: string; phone: string }): Draft => {
  const nameKey = generateFieldKey([]);
  const phoneKey = generateFieldKey([nameKey]);
  return {
    name: "",
    slug: "",
    isActive: true,
    whatsappId: null,
    emailFallbackWhatsappId: null,
    destinationMode: "queue",
    queueId: null,
    chatFlowId: null,
    aiAgentId: null,
    tagIds: [],
    opportunityPipelineId: null,
    opportunityStageId: null,
    confirmationEnabled: false,
    confirmationText: null,
    confirmationTemplate: null,
    confirmationEmailSubject: null,
    fields: [
      {
        _uid: makeFieldUid(),
        key: nameKey,
        type: "text",
        label: labels.name,
        required: true,
        mapTo: { kind: "contact", field: "name" },
      },
      {
        _uid: makeFieldUid(),
        key: phoneKey,
        type: "phone",
        label: labels.phone,
        required: true,
        mapTo: { kind: "contact", field: "number" },
      },
    ],
    theme: { ...FORM_THEME_DEFAULTS },
    acceptExternalPosts: false,
    dailyLimit: FORM_LIMITS.dailyLimitDefault,
    minFillSeconds: FORM_LIMITS.minFillSecondsDefault,
  };
};

interface EditorOptions {
  channels: FormChannelOption[];
  queues: FormNamedOption[];
  tags: FormNamedOption[];
  flows: FormFlowOption[];
  agents: FormNamedOption[];
  pipelines: FormNamedOption[];
}

const EMPTY_OPTIONS: EditorOptions = { channels: [], queues: [], tags: [], flows: [], agents: [], pipelines: [] };

interface ValidationIssue {
  message: string;
  tab: EditorTab | null;
  fieldErrors?: Record<string, string>;
  invalid?: Partial<Record<OnSubmitInvalidKey, boolean>>;
  focusName?: boolean;
}

function FormEditorContent() {
  const t = useTranslations("formsPage");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pageHelp = useFormsPageHelp();
  const { copiedId, copy } = useCopyFeedback();
  const canUseFlows = useAuthStore((s) => s.hasFeature("chatflow"));
  const canUseAgents = useAuthStore((s) => s.hasFeature("aiAgents"));
  const canUseFunnel = useAuthStore((s) => s.hasFeature("funnelKanban"));

  // A rota é lida uma vez: depois de criar, o endereço vira /formularios/<id> sem remontar.
  const [routeKey] = useState(() => String(params?.id ?? ""));
  const isNewRoute = routeKey === "new";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [formId, setFormId] = useState<number | null>(null);
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedSig, setSavedSig] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<EditorTab>("fields");
  const [initialStatus, setInitialStatus] = useState<ResponsesStatusFilter | null>(null);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Partial<Record<OnSubmitInvalidKey, boolean>>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [options, setOptions] = useState<EditorOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [stagesByPipeline, setStagesByPipeline] = useState<Record<number, FormStageOption[]>>({});
  const [stagesLoadingId, setStagesLoadingId] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const [formLimit, setFormLimit] = useState<{ reached: boolean; max: number }>({ reached: false, max: FORM_LIMITS.maxFormsPerTenant });
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const currentSigRef = useRef("");

  const savedSlug = detail?.slug ?? "";
  const slugCheck = useFormSlugCheck(formId, savedSlug);

  const currentSig = useMemo(() => (draft ? signatureOf(draft) : ""), [draft]);
  currentSigRef.current = currentSig;
  const ready = loadState === "ready" && draft !== null;
  // Novo sem nada mexido não pede confirmação para sair (a assinatura salva é a do modelo inicial).
  const dirty = ready && currentSig !== savedSig;

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // ── Carga do formulário (uma vez por montagem) ─────────────────────────────
  const loadForm = useCallback(async () => {
    setLoadState("loading");
    if (isNewRoute) {
      // Sonda leve: servidor sem a rota (versão antiga) ou banco sem as tabelas avisam
      // antes de a pessoa montar o formulário inteiro.
      try {
        const list = await fetchForms();
        setFormLimit({ reached: list.forms.length >= list.maxForms, max: list.maxForms });
      } catch (err) {
        const status = getRequestStatus(err);
        const code = getBackendErrorCode(err);
        if (code === "ERR_NO_PERMISSION" || status === 403) return setLoadState("denied");
        if (code === "ERR_FORMS_SCHEMA_MISSING") return setLoadState("schemaMissing");
        if (status === 402) return setLoadState("notInPlan");
        if (status === 404) return setLoadState("unavailable");
      }
      const fresh = makeNewDraft({ name: t("fields.defaultNameLabel"), phone: t("fields.defaultPhoneLabel") });
      setDraft(fresh);
      setSavedSig(signatureOf(fresh));
      setLoadState("ready");
      return;
    }
    const id = positiveId(routeKey);
    if (id === null) {
      setLoadState("notFound");
      return;
    }
    try {
      const loaded = await fetchForm(id);
      const next = draftFromConfig(formDetailToConfig(loaded));
      setFormId(loaded.id);
      setDetail(loaded);
      setDraft(next);
      setSavedSig(signatureOf(next));
      setSlugTouched(true);
      setLoadState("ready");
    } catch (err) {
      const status = getRequestStatus(err);
      const code = getBackendErrorCode(err);
      if (code === "ERR_FORM_NOT_FOUND") setLoadState("notFound");
      else if (code === "ERR_NO_PERMISSION" || status === 403) setLoadState("denied");
      else if (code === "ERR_FORMS_SCHEMA_MISSING") setLoadState("schemaMissing");
      else if (status === 402) setLoadState("notInPlan");
      else if (status === 404) setLoadState("unavailable");
      else setLoadState("error");
    }
  }, [isNewRoute, routeKey, t]);

  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    const requestedTab = searchParams?.get("tab");
    const requestedStatus = searchParams?.get("status");
    if (!isNewRoute && requestedTab && (EDITOR_TABS as string[]).includes(requestedTab)) {
      setTab(requestedTab as EditorTab);
    }
    if (
      requestedStatus &&
      (requestedStatus === "pending" || (FORM_SUBMISSION_STATUSES as readonly string[]).includes(requestedStatus))
    ) {
      setInitialStatus(requestedStatus as ResponsesStatusFilter);
    }
    void loadForm();
  }, [isNewRoute, loadForm, searchParams]);

  // ── Opções (canais, filas, etiquetas, fluxos, agentes, funis) ───────────────
  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    const [channels, queues, tags, flows, agents, pipelines] = await Promise.all([
      fetchWhatsapps()
        .then((res) =>
          asRows<Record<string, unknown>>(res?.data)
            .filter((c) => c && c.isDeleted !== true && isFormChannelTypeAccepted(c.type))
            .map((c) => ({
              id: Number(c.id),
              name: String(c.name ?? c.id),
              type: String(c.type ?? ""),
              status: String(c.status ?? ""),
              tokenAPI: typeof c.tokenAPI === "string" ? c.tokenAPI : undefined,
            }))
        )
        .catch(() => null),
      fetchQueues()
        .then((res) => res.data.map((q) => ({ id: q.id, name: q.name || `#${q.id}` })))
        .catch(() => null),
      fetchTags()
        .then((res) => res.data.map((tag) => ({ id: tag.id, name: tag.name || `#${tag.id}` })))
        .catch(() => null),
      canUseFlows
        ? fetchChatFlows()
            .then((res) =>
              asRows<Record<string, unknown>>(res?.data).map((f) => ({
                id: Number(f.id),
                name: String(f.name ?? f.id),
                isActive: !!(f.isActive || f.status),
              }))
            )
            .catch(() => null)
        : Promise.resolve([] as FormFlowOption[]),
      canUseAgents
        ? fetchAiAgents()
            .then((list) => list.filter((a) => a.isActive && !a.kbOnly).map((a) => ({ id: a.id, name: a.name })))
            .catch(() => null)
        : Promise.resolve([] as FormNamedOption[]),
      canUseFunnel
        ? fetchPipelines(undefined, { background: true })
            .then((res) =>
              asRows<Record<string, unknown>>(res?.data).map((p) => ({ id: Number(p.id), name: String(p.name ?? p.id) }))
            )
            .catch(() => null)
        : Promise.resolve([] as FormNamedOption[]),
    ]);
    setOptions((prev) => ({
      channels: channels ?? prev.channels,
      queues: queues ?? prev.queues,
      tags: tags ?? prev.tags,
      flows: flows ?? prev.flows,
      agents: agents ?? prev.agents,
      pipelines: pipelines ?? prev.pipelines,
    }));
    setOptionsLoading(false);
  }, [canUseFlows, canUseAgents, canUseFunnel]);

  useEffect(() => {
    if (loadState === "ready") void loadOptions();
    // Só na 1ª vez que a tela fica pronta; recargas explícitas chamam loadOptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState === "ready"]);

  // Etapas do funil escolhido (uma consulta por funil).
  const pipelineId = draft?.opportunityPipelineId ?? null;
  useEffect(() => {
    if (!pipelineId || !canUseFunnel || stagesByPipeline[pipelineId]) return;
    let cancelled = false;
    setStagesLoadingId(pipelineId);
    fetchStages({ pipelineId }, { background: true })
      .then((res) => {
        if (cancelled) return;
        const rows = asRows<Record<string, unknown>>(res?.data)
          .map((s) => ({ id: Number(s.id), name: String(s.name ?? s.id), pipelineId: Number(s.pipelineId ?? pipelineId) }))
          .filter((s) => s.pipelineId === pipelineId);
        setStagesByPipeline((prev) => ({ ...prev, [pipelineId]: rows }));
      })
      .catch(() => {
        if (!cancelled) setStagesByPipeline((prev) => ({ ...prev, [pipelineId]: [] }));
      })
      .finally(() => {
        if (!cancelled) setStagesLoadingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pipelineId, canUseFunnel, stagesByPipeline]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const mainChannel = draft ? options.channels.find((c) => c.id === draft.whatsappId) ?? null : null;
  const channelKnown = !!draft && (draft.whatsappId === null || mainChannel !== null);
  const mainIsPhone = !!mainChannel && isFormPhoneChannelType(mainChannel.type);
  const contactRule = computeFormContactRule(
    mainChannel?.type,
    mainIsPhone && !!draft && draft.emailFallbackWhatsappId !== null
  );
  const savedFields = useMemo(() => detail?.fields ?? [], [detail]);
  const savedKeys = useMemo(() => new Set(savedFields.map((f) => f.key)), [savedFields]);
  const previewFields = draft?.fields ?? [];
  const draftHiddenParams = useMemo(
    () => (draft?.fields ?? []).filter((f) => f.type === "hidden" && !!f.hiddenParam).map((f) => String(f.hiddenParam)),
    [draft?.fields]
  );
  const nameSuggestion = draft ? normalizeFormSlug(draft.name) : "";
  const slugSuggestion = isValidFormSlug(nameSuggestion) ? nameSuggestion : "";
  const savedLink = origin && savedSlug ? `${origin}/f/${savedSlug}` : "";

  // ── Edição ──────────────────────────────────────────────────────────────────
  const patchDraft = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const handleConfigPatch = (patch: Partial<FormConfig>) => {
    setInvalid((prev) => {
      const next = { ...prev };
      if ("whatsappId" in patch) delete next.channel;
      if ("emailFallbackWhatsappId" in patch || "whatsappId" in patch) delete next.fallback;
      if ("queueId" in patch) delete next.queue;
      if ("tagIds" in patch) delete next.tags;
      if ("opportunityPipelineId" in patch) delete next.pipeline;
      if ("chatFlowId" in patch || "destinationMode" in patch) delete next.flow;
      if ("aiAgentId" in patch || "destinationMode" in patch) delete next.agent;
      if ("queueId" in patch || "destinationMode" in patch || "emailFallbackWhatsappId" in patch) delete next.fallbackQueue;
      if ("opportunityStageId" in patch || "opportunityPipelineId" in patch) delete next.stage;
      if ("confirmationTemplate" in patch || "whatsappId" in patch) delete next.template;
      return next;
    });
    // `fields` nunca vem por aqui (a aba Campos tem o próprio caminho).
    const rest: Partial<FormConfig> = { ...patch };
    delete rest.fields;
    patchDraft(rest as Partial<Draft>);
  };

  const handleFieldsChange = (next: EditorField[]) => {
    if (!draft) return;
    const before = new Map(draft.fields.map((f) => [f._uid, f] as const));
    const after = new Map(next.map((f) => [f._uid, f] as const));
    setFieldErrors((errs) => {
      let changed = false;
      const out: Record<string, string> = {};
      Object.entries(errs).forEach(([uid, reason]) => {
        // Campo mexido (ou removido) perde a marca de erro.
        if (after.has(uid) && before.get(uid) === after.get(uid)) out[uid] = reason;
        else changed = true;
      });
      return changed ? out : errs;
    });
    patchDraft({ fields: next });
  };

  const handleNameChange = (value: string) => {
    if (!draft) return;
    const patch: Partial<Draft> = { name: value };
    // Formulário novo: o endereço acompanha o nome até a pessoa mexer nele.
    if (formId === null && !slugTouched) {
      const suggested = normalizeFormSlug(value);
      patch.slug = suggested;
      slugCheck.check(suggested);
    }
    patchDraft(patch);
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    patchDraft({ slug: value });
    slugCheck.check(value);
  };

  const handleSlugBlur = () => {
    if (!draft) return;
    const normalized = normalizeFormSlug(draft.slug);
    if (normalized !== draft.slug) {
      patchDraft({ slug: normalized });
      slugCheck.check(normalized);
    }
  };

  const applySlugSuggestion = () => {
    if (!slugSuggestion) return;
    setSlugTouched(formId !== null);
    patchDraft({ slug: slugSuggestion });
    slugCheck.check(slugSuggestion);
  };

  // ── Conferência antes de salvar (o servidor repete; aqui o erro aponta o lugar) ──
  const validate = (d: Draft): ValidationIssue | null => {
    if (!d.name.trim()) return { message: t("errors.ERR_FORM_NAME_REQUIRED"), tab: null, focusName: true };

    const errs: Record<string, string> = {};
    const seenKeys = new Map<string, number>();
    d.fields.forEach((f) => seenKeys.set(f.key, (seenKeys.get(f.key) ?? 0) + 1));
    const contactTargets = new Map<string, number>();
    d.fields.forEach((f) => {
      if (f.mapTo.kind === "contact") contactTargets.set(f.mapTo.field, (contactTargets.get(f.mapTo.field) ?? 0) + 1);
    });
    d.fields.forEach((f) => {
      let reason: string | null = null;
      if (!FIELD_KEY_RE.test(f.key)) reason = "key";
      else if (FORM_RESERVED_FIELD_KEYS.includes(f.key)) reason = "keyReserved";
      else if ((seenKeys.get(f.key) ?? 0) > 1) reason = "keyTaken";
      else if (!f.label.trim()) reason = "label";
      else if ((f.type === "select" || f.type === "multiselect") && (f.options ?? []).length === 0) reason = "optionsRequired";
      else if ((f.type === "select" || f.type === "multiselect") && (f.options ?? []).some((o) => !o.label.trim()))
        reason = "optionLabel";
      else if (f.type === "number" && typeof f.min === "number" && typeof f.max === "number" && f.min > f.max)
        reason = "range";
      else if (f.type === "hidden" && f.hiddenParam && !HIDDEN_PARAM_RE.test(f.hiddenParam)) reason = "hiddenParam";
      else if (f.type === "hidden" && f.hiddenParam && isReservedHiddenParam(f.hiddenParam)) reason = "hiddenParamReserved";
      else if (f.mapTo.kind === "custom" && !f.mapTo.name.trim()) reason = "customName";
      else if (f.mapTo.kind === "contact" && (contactTargets.get(f.mapTo.field) ?? 0) > 1) reason = "contactFieldTaken";
      if (reason) errs[f._uid] = reason;
    });
    const errorCount = Object.keys(errs).length;
    if (errorCount > 0) {
      return { message: t("fields.invalidSummary", { count: errorCount }), tab: "fields", fieldErrors: errs };
    }

    // Identidade exigida pelo canal. Sem canal é rascunho (o servidor também só confere com
    // canal); com o canal desconhecido (apagado, lista sem carregar) o servidor decide.
    if (channelKnown && d.whatsappId !== null) {
      const phone = d.fields.find((f) => f.mapTo.kind === "contact" && f.mapTo.field === "number");
      const email = d.fields.find((f) => f.mapTo.kind === "contact" && f.mapTo.field === "email");
      if (contactRule === "phone" && (!phone || !phone.required))
        return { message: t("errors.ERR_FORM_IDENTITY_PHONE_REQUIRED"), tab: "fields" };
      if (contactRule === "email" && (!email || !email.required))
        return { message: t("errors.ERR_FORM_IDENTITY_EMAIL_REQUIRED"), tab: "fields" };
      if (contactRule === "phoneOrEmail" && !phone) return { message: t("errors.ERR_FORM_IDENTITY_PHONE_REQUIRED"), tab: "fields" };
      if (contactRule === "phoneOrEmail" && !email) return { message: t("errors.ERR_FORM_IDENTITY_EMAIL_REQUIRED"), tab: "fields" };
    }

    const mainIsEmail = !!mainChannel && isFormEmailChannelType(mainChannel.type);
    if (mainIsEmail && d.destinationMode !== "queue")
      return { message: t("errors.ERR_FORM_DESTINATION_CHANNEL"), tab: "onSubmit" };
    if (d.destinationMode === "chatflow" && !d.chatFlowId)
      return { message: t("onSubmit.flowRequired"), tab: "onSubmit", invalid: { flow: true } };
    if (d.destinationMode === "ai_agent" && !d.aiAgentId)
      return { message: t("onSubmit.agentRequired"), tab: "onSubmit", invalid: { agent: true } };
    if (d.destinationMode !== "queue" && d.emailFallbackWhatsappId !== null && !d.queueId)
      return { message: t("errors.ERR_FORM_FALLBACK_QUEUE_REQUIRED"), tab: "onSubmit", invalid: { fallbackQueue: true } };
    if (d.opportunityPipelineId !== null && !d.opportunityStageId)
      return { message: t("onSubmit.stageRequired"), tab: "onSubmit", invalid: { stage: true } };
    const mainIsOfficial = !!mainChannel && isFormOfficialChannelType(mainChannel.type);
    if (d.confirmationEnabled && mainIsOfficial && hasEmptyTemplateVar(d.confirmationTemplate))
      return { message: t("onSubmit.templateVarsRequired"), tab: "onSubmit", invalid: { template: true } };

    const theme = d.theme;
    const badUrl = (["logoUrl", "coverUrl", "redirectUrl"] as const).some((k) => {
      const v = theme[k]?.trim();
      return !!v && !isHttpsUrl(v);
    });
    if (badUrl) return { message: t("appearance.httpsOnly"), tab: "appearance" };
    if (!isHexColor(theme.primaryColor) || !isHexColor(theme.backgroundColor))
      return { message: t("appearance.colorInvalid"), tab: "appearance" };

    if (!Number.isInteger(d.dailyLimit) || d.dailyLimit < FORM_LIMITS.dailyLimitMin || d.dailyLimit > FORM_LIMITS.dailyLimitMax)
      return { message: t("share.dailyLimitInvalid", { max: FORM_LIMITS.dailyLimitMax }), tab: formId ? "share" : null };
    if (!Number.isInteger(d.minFillSeconds) || d.minFillSeconds < 0 || d.minFillSeconds > FORM_LIMITS.minFillSecondsMax)
      return { message: t("share.minFillInvalid", { max: FORM_LIMITS.minFillSecondsMax }), tab: formId ? "share" : null };

    // Endereço: o novo sem endereço escolhido nasce do nome; o escolhido tem de estar livre.
    const slug = normalizeFormSlug(d.slug);
    if ((formId !== null || slugTouched) && !isValidFormSlug(slug))
      return { message: t("errors.ERR_FORM_SLUG_INVALID"), tab: formId ? "share" : null };
    if ((formId !== null || slugTouched) && slugCheck.state === "taken")
      return { message: t("errors.ERR_FORM_SLUG_TAKEN"), tab: formId ? "share" : null };
    return null;
  };

  /** Endereço do formulário novo: o escolhido, ou o nome com sufixo até achar um livre. */
  const resolveNewSlug = async (payload: FormConfig): Promise<string> => {
    if (slugTouched && isValidFormSlug(payload.slug)) return payload.slug;
    let base = normalizeFormSlug(payload.slug || payload.name).slice(0, FORM_LIMITS.slugMax - 8).replace(/-+$/, "");
    if (!isValidFormSlug(base)) base = `form-${randomSlugSuffix()}`;
    const candidates = [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`, `${base}-${randomSlugSuffix(4)}`];
    for (const candidate of candidates) {
      if (!isValidFormSlug(candidate)) continue;
      try {
        const res = await checkFormSlug(candidate, null);
        if (res.available) return candidate;
      } catch {
        // Sem a conferência, o servidor decide (409 se estiver em uso).
        return candidate;
      }
    }
    return `${base}-${randomSlugSuffix(6)}`;
  };

  const applySaved = (saved: FormDetail, sentSig: string) => {
    const nextDraft = draftFromConfig(formDetailToConfig(saved), draft?.fields);
    setDetail(saved);
    setFormId(saved.id);
    setSavedSig(signatureOf(nextDraft));
    // Quem continuou editando durante o envio não perde o que digitou.
    if (currentSigRef.current === sentSig) setDraft(nextDraft);
    setSlugTouched(true);
    slugCheck.reset();
    setFieldErrors({});
    setInvalid({});
  };

  const handleSaveError = (err: unknown) => {
    const code = getBackendErrorCode(err);
    const status = getRequestStatus(err);
    // "Sem permissão" e "fora do plano" já têm aviso geral do painel.
    if (code === "ERR_NO_PERMISSION" || status === 402) return;
    if (!code && status === 404) {
      toast.error(t("unavailable"));
      return;
    }
    if (code === "ERR_FORM_FIELDS_INVALID" && draft) {
      const details = getFormErrorDetails(err);
      const key = typeof details?.key === "string" ? details.key : "";
      const reason = typeof details?.reason === "string" && details.reason ? details.reason : "generic";
      const field = draft.fields.find((f) => f.key === key);
      if (field) {
        setFieldErrors({ [field._uid]: reason });
        setSelectedUid(field._uid);
        setTab("fields");
        setMobileView("edit");
        toast.error(t("errors.fieldInvalidNamed", { label: field.label.trim() || field.key }));
        return;
      }
      setTab("fields");
    }
    if (code === "ERR_FORM_SLUG_TAKEN" || code === "ERR_FORM_SLUG_INVALID") {
      slugCheck.setState(code === "ERR_FORM_SLUG_TAKEN" ? "taken" : "invalid");
      if (formId !== null) setTab("share");
    }
    if (code === "ERR_FORM_IDENTITY_PHONE_REQUIRED" || code === "ERR_FORM_IDENTITY_EMAIL_REQUIRED") setTab("fields");
    if (code === "ERR_FORM_INVALID_REFERENCE") {
      // Algo foi apagado em outra tela: as listas voltam do servidor (o item some ou aparece
      // como não encontrado) e o aviso aponta onde está.
      void loadOptions();
      const details = getFormErrorDetails(err);
      const ref = typeof details?.ref === "string" ? details.ref : "";
      if ((ref === "optionQueue" || ref === "optionTags") && draft) {
        const key = typeof details?.key === "string" ? details.key : "";
        const field = draft.fields.find((f) => f.key === key);
        if (field) {
          setFieldErrors({ [field._uid]: ref });
          setSelectedUid(field._uid);
          setTab("fields");
          setMobileView("edit");
          toast.error(t(`errors.ref.${ref}`, { label: field.label.trim() || field.key }));
          return;
        }
      }
      const invalidByRef: Record<string, OnSubmitInvalidKey> = {
        channel: "channel",
        fallback: "fallback",
        queue: "queue",
        chatFlow: "flow",
        aiAgent: "agent",
        pipeline: "pipeline",
        stage: "stage",
        tags: "tags",
      };
      const invalidKey = invalidByRef[ref];
      setTab("onSubmit");
      setMobileView("edit");
      if (invalidKey) {
        setInvalid({ [invalidKey]: true });
        toast.error(t(`errors.ref.${ref}`));
        return;
      }
    }
    if (code === "ERR_FORM_DESTINATION_CHANNEL" || code === "ERR_FORM_FALLBACK_QUEUE_REQUIRED") {
      setTab("onSubmit");
      setMobileView("edit");
      if (code === "ERR_FORM_FALLBACK_QUEUE_REQUIRED") setInvalid({ fallbackQueue: true });
    }
    toast.error(t(formErrorKey(code)));
  };

  const handleSave = async (): Promise<boolean> => {
    if (!draft || saving) return false;
    const issue = validate(draft);
    if (issue) {
      if (issue.fieldErrors) {
        setFieldErrors(issue.fieldErrors);
        const first = draft.fields.find((f) => issue.fieldErrors?.[f._uid]);
        if (first) setSelectedUid(first._uid);
      }
      if (issue.invalid) setInvalid(issue.invalid);
      if (issue.tab) setTab(issue.tab);
      setMobileView("edit");
      if (issue.focusName) nameInputRef.current?.focus();
      toast.error(issue.message);
      return false;
    }
    setSaving(true);
    const sentSig = currentSigRef.current;
    const creating = formId === null;
    try {
      const payload = buildPayload(draft);
      let saved: FormDetail;
      if (formId === null) {
        payload.slug = await resolveNewSlug(payload);
        try {
          saved = await createForm(payload);
        } catch (err) {
          // Endereço escolhido sozinho e tomado nesse meio-tempo: uma nova tentativa com sufixo.
          if (getBackendErrorCode(err) !== "ERR_FORM_SLUG_TAKEN" || slugTouched) throw err;
          saved = await createForm({ ...payload, slug: `${payload.slug.slice(0, FORM_LIMITS.slugMax - 7)}-${randomSlugSuffix(6)}` });
        }
      } else {
        saved = await updateForm(formId, payload);
      }
      applySaved(saved, sentSig);
      if (creating) {
        // Sem router.replace: remontaria a página e perderia o que está na tela.
        if (window.location.pathname.replace(/\/+$/, "") === `${LIST_HREF}/new`) {
          window.history.replaceState(null, "", `${LIST_HREF}/${saved.id}`);
        }
        setTab("share");
        toast.success(t("created"));
      } else {
        toast.success(t("saved"));
      }
      return true;
    } catch (err) {
      handleSaveError(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Saída com alterações ────────────────────────────────────────────────────
  useUnsavedChangesGuard({ enabled: dirty && !saving, onIntercept: setPendingHref });

  const handleBack = () => {
    if (dirty) setPendingHref(LIST_HREF);
    else router.push(LIST_HREF);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const title = formId !== null ? detail?.name || t("editTitle") : t("newForm");

  const headerActions = (
    <>
      <Button variant="outline" onClick={handleBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Button>
      {ready && (
        <Button onClick={() => void handleSave()} disabled={saving || (!dirty && formId !== null)} className="gap-1.5">
          <Save className="h-4 w-4" />
          {saving ? t("saving") : formId === null ? t("create") : t("save")}
        </Button>
      )}
    </>
  );

  if (loadState !== "ready" || !draft) {
    const notice =
      loadState === "notFound" ? (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p className="text-sm">{t("notFound")}</p>
        </NoticeBox>
      ) : loadState === "unavailable" ? (
        <NoticeBox icon={Info} tone="info">
          <p className="text-sm">{t("unavailable")}</p>
        </NoticeBox>
      ) : loadState === "schemaMissing" ? (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p className="text-sm">{t("schemaMissing")}</p>
        </NoticeBox>
      ) : loadState === "notInPlan" ? (
        <NoticeBox icon={Info} tone="info">
          <p className="text-sm">{t("notInPlan")}</p>
        </NoticeBox>
      ) : loadState === "error" ? (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>{t("loadFailed")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadForm()} className="shrink-0 gap-1.5">
            <RotateCw className="h-3.5 w-3.5" />
            {t("retry")}
          </Button>
        </div>
      ) : null;
    return (
      <div className="space-y-6">
        <PageHeader title={isNewRoute ? t("newForm") : t("editTitle")} description={t("editorDescription")} help={pageHelp}>
          <Button variant="outline" onClick={() => router.push(LIST_HREF)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Button>
        </PageHeader>
        {loadState === "denied" ? (
          <AccessDenied />
        ) : loadState === "loading" ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-10 w-full max-w-lg" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="hidden h-96 w-full lg:block" />
            </div>
          </div>
        ) : (
          notice
        )}
      </div>
    );
  }

  const showPreview = tab !== "responses";
  const warnings = detail?.warnings ?? [];
  const tabTrigger = (value: EditorTab, Icon: typeof ListChecks, labelKey: string, disabled = false) => (
    <TabsTrigger value={value} disabled={disabled} className="gap-1.5 text-xs sm:text-sm">
      <Icon className="h-4 w-4" />
      {t(labelKey)}
      {value === "fields" && Object.keys(fieldErrors).length > 0 && (
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
      )}
      {value === "onSubmit" && Object.keys(invalid).length > 0 && (
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
      )}
    </TabsTrigger>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={t("editorDescription")} help={pageHelp}>
        {headerActions}
      </PageHeader>

      {formId === null && formLimit.reached && (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p>{t("limitReached", { max: formLimit.max })}</p>
        </NoticeBox>
      )}

      {warnings.length > 0 && (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p className="font-medium">{t("warnings.title")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{t(`warnings.${w}`)}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{t("warnings.lastSaveNote")}</p>
        </NoticeBox>
      )}

      {/* ── Nome, situação e endereço ── */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:p-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="form-editor-name">{t("nameLabel")}</Label>
              <InfoHint text={t("nameHint")} />
            </div>
            <Input
              id="form-editor-name"
              ref={nameInputRef}
              value={draft.name}
              maxLength={FORM_LIMITS.nameMax}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <div className="flex items-center gap-2 sm:pt-6">
            <Switch
              id="form-editor-active"
              checked={draft.isActive}
              onCheckedChange={(v) => patchDraft({ isActive: v })}
            />
            <Label htmlFor="form-editor-active" className="cursor-pointer">
              {draft.isActive ? t("activeOn") : t("activeOff")}
            </Label>
            <InfoHint text={t("activeHint")} />
          </div>
          {formId === null ? (
            <div className="sm:col-span-2">
              <FormSlugField
                value={draft.slug}
                onChange={handleSlugChange}
                onBlur={handleSlugBlur}
                state={slugCheck.state}
                linkBase={origin ? `${origin}/f/` : "/f/"}
                suggestion={slugTouched ? slugSuggestion : ""}
                onUseSuggestion={applySlugSuggestion}
              />
              {!slugTouched && slugCheck.state === "taken" && (
                <FieldNote tone="warning">{t("slugAutoSuffixNote")}</FieldNote>
              )}
              <FieldNote>{t("slugNewNote")}</FieldNote>
            </div>
          ) : (
            savedLink && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2">
                <span className="text-xs text-muted-foreground">{t("share.link")}:</span>
                <a
                  href={savedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 max-w-full truncate font-mono text-xs text-primary hover:underline"
                >
                  {savedLink}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    void copy("header-link", savedLink).then((ok) => {
                      if (ok) toast.success(t("list.copied"));
                    });
                  }}
                  aria-label={t("list.copyLink")}
                  title={t("list.copyLink")}
                >
                  {copiedId === "header-link" ? <Check className="text-success" /> : <Copy />}
                </Button>
                <a
                  href={savedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t("share.openLink")}
                  title={t("share.openLink")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as EditorTab);
          setMobileView("edit");
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1">
            {tabTrigger("fields", ListChecks, "tabs.fields")}
            {tabTrigger("appearance", Palette, "tabs.appearance")}
            {tabTrigger("onSubmit", Send, "tabs.onSubmit")}
            {tabTrigger("share", Share2, "tabs.share", formId === null)}
            {tabTrigger("responses", Inbox, "tabs.responses", formId === null)}
          </TabsList>
          {showPreview && (
            <div className="flex rounded-md border p-0.5 lg:hidden" role="group" aria-label={t("appearance.preview")}>
              <Button
                type="button"
                size="sm"
                variant={mobileView === "edit" ? "secondary" : "ghost"}
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setMobileView("edit")}
                aria-pressed={mobileView === "edit"}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("mobileEdit")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mobileView === "preview" ? "secondary" : "ghost"}
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setMobileView("preview")}
                aria-pressed={mobileView === "preview"}
              >
                <Eye className="h-3.5 w-3.5" />
                {t("mobilePreview")}
              </Button>
            </div>
          )}
        </div>
        {formId === null && <FieldNote>{t("tabs.lockedUntilSaved")}</FieldNote>}

        <div className={cn("grid gap-6", showPreview && "lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]")}>
          <div className={cn("min-w-0", showPreview && mobileView === "preview" && "hidden lg:block")}>
            <TabsContent value="fields" className="mt-0">
              <Card>
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <FieldsTab
                    fields={draft.fields}
                    onChange={handleFieldsChange}
                    selectedUid={selectedUid}
                    onSelect={setSelectedUid}
                    savedKeys={savedKeys}
                    contactRule={contactRule}
                    hasChannel={draft.whatsappId !== null}
                    queues={options.queues}
                    tags={options.tags}
                    destinationMode={draft.destinationMode}
                    fieldErrors={fieldErrors}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0">
              <Card>
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <AppearanceTab
                    theme={draft.theme}
                    onChange={(theme) => patchDraft({ theme })}
                    formName={draft.name}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="onSubmit" className="mt-0">
              <OnSubmitTab
                config={buildPayloadForTab(draft)}
                fields={draft.fields}
                onChange={handleConfigPatch}
                channels={options.channels}
                queues={options.queues}
                flows={options.flows}
                agents={options.agents}
                tags={options.tags}
                pipelines={options.pipelines}
                stages={pipelineId ? stagesByPipeline[pipelineId] ?? [] : []}
                stagesLoading={stagesLoadingId !== null}
                optionsLoading={optionsLoading}
                canUseFlows={canUseFlows}
                canUseAgents={canUseAgents}
                canUseFunnel={canUseFunnel}
                savedWhatsappId={detail?.whatsappId ?? null}
                savedTemplate={detail?.confirmationTemplate ?? null}
                invalid={invalid}
              />
            </TabsContent>

            {formId !== null && (
              <TabsContent value="share" className="mt-0">
                <ShareTab
                  savedSlug={savedSlug}
                  savedName={detail?.name ?? draft.name}
                  savedIsActive={detail?.isActive ?? draft.isActive}
                  savedFields={savedFields}
                  hasChannel={(detail?.whatsappId ?? null) !== null}
                  dirty={dirty}
                  draftHiddenParams={draftHiddenParams}
                  slug={draft.slug}
                  onSlugChange={handleSlugChange}
                  onSlugBlur={handleSlugBlur}
                  slugState={slugCheck.state}
                  slugSuggestion={slugSuggestion}
                  onUseSuggestion={applySlugSuggestion}
                  acceptExternalPosts={draft.acceptExternalPosts}
                  onAcceptExternalPostsChange={(v) => patchDraft({ acceptExternalPosts: v })}
                  dailyLimit={draft.dailyLimit}
                  onDailyLimitChange={(v) => patchDraft({ dailyLimit: v })}
                  minFillSeconds={draft.minFillSeconds}
                  onMinFillSecondsChange={(v) => patchDraft({ minFillSeconds: v })}
                  formId={detail?.id ?? null}
                />
              </TabsContent>
            )}

            {formId !== null && (
              <TabsContent value="responses" className="mt-0">
                <ResponsesTab formId={formId} formSlug={savedSlug} fields={savedFields} initialStatus={initialStatus} />
              </TabsContent>
            )}
          </div>

          {showPreview && (
            <aside
              className={cn(
                "min-w-0 lg:sticky lg:top-0 lg:self-start",
                mobileView === "edit" && "hidden lg:block"
              )}
            >
              <FormPreview
                name={draft.name}
                slug={draft.slug}
                fields={previewFields}
                theme={draft.theme}
                contactRule={contactRule}
                className="h-[75dvh] lg:h-[calc(100dvh-8rem)]"
              />
            </aside>
          )}
        </div>
      </Tabs>

      {dirty && tab !== "responses" && (
        <FloatingSaveButton saving={saving} onClick={() => void handleSave()} />
      )}

      <UnsavedChangesDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
        onDiscard={() => {
          const href = pendingHref;
          setPendingHref(null);
          if (href) router.push(href);
        }}
        onSave={async () => {
          const href = pendingHref;
          const ok = await handleSave();
          if (ok) {
            setPendingHref(null);
            if (href) router.push(href);
          }
        }}
        saving={saving}
        labels={{
          title: t("unsavedTitle"),
          message: t("unsavedBody"),
          stay: t("keepEditing"),
          discard: t("discardChanges"),
          save: t("save"),
        }}
      />
    </div>
  );
}

/** A aba "Ao enviar" recebe a configuração com os campos já sem os ids da tela. */
function buildPayloadForTab(draft: Draft): FormConfig {
  return { ...draft, fields: fromEditorFields(draft.fields) };
}
