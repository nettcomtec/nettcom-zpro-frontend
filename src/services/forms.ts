import api, { BACKGROUND_REQUEST } from "@/lib/api";
import {
  FORM_LIMITS,
  FORM_THEME_DEFAULTS,
  type FormConfig,
  type FormDetail,
  type FormField,
  type FormFieldOption,
  type FormListResponse,
  type FormSubmissionItem,
  type FormSubmissionsResponse,
  type FormSubmissionStatus,
  type FormTheme,
  type FormWarning,
} from "@/lib/forms";

// Gestão dos formulários (docs/PLANO_FORMULARIOS_ATENDIMENTO.md §5.5). Todas as rotas
// exigem login, o recurso de plano "forms" e perfil de gestor (admin, supervisor ou
// personalizado com "Gerenciar formulários"). As cargas automáticas da tela vão com
// BACKGROUND_REQUEST: o aviso de "recurso fora do plano" só faz sentido em ação pedida.

/** Base da API (a mesma do `lib/api.ts`): usada no endereço de envio externo. */
export function getFormsApiBase(): string {
  return String(api.defaults.baseURL || "").replace(/\/+$/, "");
}

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toIdOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toIdList = (value: unknown): number[] => {
  const out: number[] = [];
  asArray<unknown>(value).forEach((item) => {
    const n = toIdOrNull(item);
    if (n !== null && !out.includes(n)) out.push(n);
  });
  return out;
};

const toTextOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

// O template da confirmação é gravado como texto (JSON do seletor). Servidor que devolva
// o objeto já lido continua funcionando.
const toTemplateText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() ? value : null;
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeTheme = (value: unknown): FormTheme => {
  const raw = value && typeof value === "object" ? (value as Partial<FormTheme>) : {};
  return { ...FORM_THEME_DEFAULTS, ...raw };
};

const normalizeFields = (value: unknown): FormField[] =>
  asArray<FormField>(value)
    .filter((field) => field && typeof field === "object" && typeof field.key === "string")
    .map((field): FormField => ({
      ...field,
      label: typeof field.label === "string" ? field.label : "",
      required: field.required === true,
      mapTo: field.mapTo && typeof field.mapTo === "object" ? field.mapTo : { kind: "none" },
      ...(Array.isArray(field.options)
        ? {
            options: field.options.map((option): FormFieldOption => ({
              ...option,
              label: typeof option?.label === "string" ? option.label : "",
              queueId: toIdOrNull(option?.queueId),
              tagIds: toIdList(option?.tagIds),
            })),
          }
        : {}),
    }));

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

function normalizeFormDetail(raw: unknown): FormDetail {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = toIdOrNull(src.id);
  if (id === null) throw new Error("ERR_FORM_INVALID_RESPONSE");
  const mode = src.destinationMode;
  return {
    id,
    name: typeof src.name === "string" ? src.name : "",
    slug: typeof src.slug === "string" ? src.slug : "",
    isActive: src.isActive !== false,
    whatsappId: toIdOrNull(src.whatsappId),
    emailFallbackWhatsappId: toIdOrNull(src.emailFallbackWhatsappId),
    destinationMode: mode === "chatflow" || mode === "ai_agent" ? mode : "queue",
    queueId: toIdOrNull(src.queueId),
    chatFlowId: toIdOrNull(src.chatFlowId),
    aiAgentId: toIdOrNull(src.aiAgentId),
    tagIds: toIdList(src.tagIds),
    opportunityPipelineId: toIdOrNull(src.opportunityPipelineId),
    opportunityStageId: toIdOrNull(src.opportunityStageId),
    confirmationEnabled: src.confirmationEnabled === true,
    confirmationText: toTextOrNull(src.confirmationText),
    confirmationTemplate: toTemplateText(src.confirmationTemplate),
    confirmationEmailSubject: toTextOrNull(src.confirmationEmailSubject),
    fields: normalizeFields(src.fields),
    theme: normalizeTheme(src.theme),
    acceptExternalPosts: src.acceptExternalPosts === true,
    dailyLimit: clampInt(src.dailyLimit, FORM_LIMITS.dailyLimitMin, FORM_LIMITS.dailyLimitMax, FORM_LIMITS.dailyLimitDefault),
    minFillSeconds: clampInt(src.minFillSeconds, 0, FORM_LIMITS.minFillSecondsMax, FORM_LIMITS.minFillSecondsDefault),
    createdAt: typeof src.createdAt === "string" ? src.createdAt : "",
    updatedAt: typeof src.updatedAt === "string" ? src.updatedAt : "",
    warnings: asArray<FormWarning>(src.warnings).filter((w) => typeof w === "string"),
  };
}

/** Configuração gravável a partir do formulário lido (sem id, datas e avisos). */
export function formDetailToConfig(detail: FormDetail): FormConfig {
  return {
    name: detail.name,
    slug: detail.slug,
    isActive: detail.isActive,
    whatsappId: detail.whatsappId,
    emailFallbackWhatsappId: detail.emailFallbackWhatsappId,
    destinationMode: detail.destinationMode,
    queueId: detail.queueId,
    chatFlowId: detail.chatFlowId,
    aiAgentId: detail.aiAgentId,
    tagIds: [...detail.tagIds],
    opportunityPipelineId: detail.opportunityPipelineId,
    opportunityStageId: detail.opportunityStageId,
    confirmationEnabled: detail.confirmationEnabled,
    confirmationText: detail.confirmationText,
    confirmationTemplate: detail.confirmationTemplate,
    confirmationEmailSubject: detail.confirmationEmailSubject,
    fields: detail.fields,
    theme: { ...detail.theme },
    acceptExternalPosts: detail.acceptExternalPosts,
    dailyLimit: detail.dailyLimit,
    minFillSeconds: detail.minFillSeconds,
  };
}

export async function fetchForms(): Promise<FormListResponse> {
  const { data } = await api.get("/forms", BACKGROUND_REQUEST);
  const maxForms = Number(data?.maxForms);
  return {
    forms: asArray(data?.forms),
    maxForms: Number.isInteger(maxForms) && maxForms > 0 ? maxForms : FORM_LIMITS.maxFormsPerTenant,
  };
}

/** Endereço livre? `excludeId` = o próprio formulário (o endereço dele conta como livre). */
export async function checkFormSlug(
  slug: string,
  excludeId?: number | null
): Promise<{ available: boolean; normalized: string }> {
  const params: Record<string, string | number> = { slug };
  if (excludeId) params.excludeId = excludeId;
  const { data } = await api.get("/forms/slug-check", { params, ...BACKGROUND_REQUEST });
  return {
    available: data?.available === true,
    normalized: typeof data?.normalized === "string" ? data.normalized : slug,
  };
}

export async function fetchForm(id: number): Promise<FormDetail> {
  const { data } = await api.get(`/forms/${id}`, BACKGROUND_REQUEST);
  return normalizeFormDetail(data?.form);
}

export async function createForm(config: FormConfig): Promise<FormDetail> {
  const { data } = await api.post("/forms", config);
  return normalizeFormDetail(data?.form);
}

export async function updateForm(id: number, config: FormConfig): Promise<FormDetail> {
  const { data } = await api.put(`/forms/${id}`, config);
  return normalizeFormDetail(data?.form);
}

/** PUT parcial: chave ausente do corpo mantém o valor gravado (ex.: só { isActive }). */
export async function patchForm(id: number, patch: Partial<FormConfig>): Promise<FormDetail> {
  const { data } = await api.put(`/forms/${id}`, patch);
  return normalizeFormDetail(data?.form);
}

/** Apaga o formulário e as respostas dele (o cartão nos atendimentos continua). */
export async function deleteForm(id: number): Promise<void> {
  await api.delete(`/forms/${id}`);
}

export interface FormSubmissionsQuery {
  page: number;
  limit: number;
  /** Instante ISO 8601 (início do dia escolhido, no fuso de quem consulta). */
  from?: string;
  /** Instante ISO 8601 (fim do dia escolhido, no fuso de quem consulta). */
  to?: string;
  /** Uma situação ou várias separadas por vírgula (ex.: "received,processing"). */
  status?: FormSubmissionStatus | string;
}

export async function fetchFormSubmissions(
  formId: number,
  query: FormSubmissionsQuery
): Promise<FormSubmissionsResponse> {
  const params: Record<string, string | number> = {
    page: Math.max(1, Math.floor(query.page)),
    limit: Math.max(1, Math.min(FORM_LIMITS.exportPageSize, Math.floor(query.limit))),
  };
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.status) params.status = query.status;
  const { data } = await api.get(`/forms/${formId}/submissions`, { params, ...BACKGROUND_REQUEST });
  return {
    submissions: asArray<FormSubmissionItem>(data?.submissions),
    count: Number(data?.count) || 0,
    hasMore: data?.hasMore === true,
  };
}

/** "Tentar de novo" (falhou/preso) e "Abrir atendimento" (suspeito). Devolve o estado final. */
export async function retryFormSubmission(
  formId: number,
  submissionId: number
): Promise<FormSubmissionItem | null> {
  const { data } = await api.post(`/forms/${formId}/submissions/${submissionId}/retry`);
  const submission = data?.submission;
  return submission && typeof submission === "object" ? (submission as FormSubmissionItem) : null;
}

// ── Leitura dos erros (o interceptor rejeita com o response: corpo em `err.data`) ──

/** Status HTTP do erro, nos dois formatos que chegam ao catch. */
export function getRequestStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; response?: { status?: unknown } | null };
  const status = typeof e.status === "number" ? e.status : e.response?.status;
  return typeof status === "number" ? status : null;
}

/** `details` do corpo do erro (ex.: { key, reason } no ERR_FORM_FIELDS_INVALID). */
export function getFormErrorDetails(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { data?: unknown; response?: { data?: unknown } | null };
  for (const body of [e.data, e.response?.data]) {
    if (!body || typeof body !== "object") continue;
    const details = (body as { details?: unknown }).details;
    if (details && typeof details === "object") return details as Record<string, unknown>;
  }
  return null;
}
