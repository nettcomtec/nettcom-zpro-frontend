// Formulários públicos que abrem atendimento (docs/PLANO_FORMULARIOS_ATENDIMENTO.md §5.2).
// ESPELHO de backend/src/services/FormServices/FormRulesZPRO.ts — mudar um exige o outro
// (tetos, tipos, destinos de contato, validação do envio, slug, canais aceitos).
// Aqui também ficam os contratos entre a página pública, a prévia do editor e o código
// de embutir (mensagens do iframe).

// ── Tetos ────────────────────────────────────────────────────────────────────
export const FORM_LIMITS = {
  maxFormsPerTenant: 100,
  maxFields: 50,
  maxOptions: 50,
  maxTagIds: 50,
  nameMax: 120,
  slugMin: 3,
  slugMax: 80,
  labelMax: 200,
  placeholderMax: 120,
  helpTextMax: 300,
  optionLabelMax: 120,
  checkboxTextMax: 500,
  customNameMax: 60,
  textMax: 500,
  textareaMax: 5000,
  hiddenMax: 200,
  emailMax: 254,
  answersMaxBytes: 32 * 1024,
  dailyLimitMin: 1,
  dailyLimitMax: 10000,
  dailyLimitDefault: 500,
  minFillSecondsMax: 60,
  minFillSecondsDefault: 3,
  confirmationTextMax: 2000,
  emailSubjectMax: 200,
  themeTitleMax: 120,
  themeDescriptionMax: 1000,
  themeSubmitLabelMax: 40,
  themeSuccessMessageMax: 500,
  urlMax: 2048,
  exportPageSize: 500,
  exportMaxRows: 10000,
} as const;

// ── Tipos ────────────────────────────────────────────────────────────────────
export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "multiselect",
  "checkbox",
  "hidden",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_BASE_CONTACT_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "email",
  "number",
  "cpf",
  "birthdayDate",
  "businessName",
] as const;

// Mesmas 7 chaves do bloco de endereço do contato (backend helpers/ContactAddressFieldsZPRO.ts).
export const FORM_ADDRESS_CONTACT_FIELDS = [
  "cep",
  "logradouro",
  "numeroEndereco",
  "complemento",
  "bairro",
  "cidade",
  "estado",
] as const;

export const FORM_CONTACT_FIELDS: string[] = [
  ...FORM_BASE_CONTACT_FIELDS,
  ...FORM_ADDRESS_CONTACT_FIELDS,
];

export type FormMapTo =
  | { kind: "none" }
  | { kind: "contact"; field: string }
  | { kind: "custom"; name: string };

export interface FormFieldOption {
  id: string;
  label: string;
  queueId?: number | null;
  tagIds?: number[];
}

export interface FormField {
  key: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  width?: "full" | "half";
  options?: FormFieldOption[];
  mapTo: FormMapTo;
  min?: number;
  max?: number;
  maxLength?: number;
  checkboxText?: string;
  hiddenParam?: string;
  hiddenDefault?: string;
}

export interface PublicFormField {
  key: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  width?: "full" | "half";
  options?: Array<{ id: string; label: string }>;
  min?: number;
  max?: number;
  maxLength?: number;
  checkboxText?: string;
  hiddenParam?: string;
  hiddenDefault?: string;
  identity?: "phone" | "email";
}

export const FORM_DESTINATION_MODES = ["queue", "chatflow", "ai_agent"] as const;
export type FormDestinationMode = (typeof FORM_DESTINATION_MODES)[number];

export const FORM_SUBMISSION_STATUSES = [
  "received",
  "processing",
  "processed",
  "failed",
  "suspect",
  "skipped",
] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const FORM_SOURCES = ["page", "embed", "external", "api"] as const;
export type FormSource = (typeof FORM_SOURCES)[number];

export type FormContactRule = "phone" | "email" | "phoneOrEmail";

export interface FormAnswer {
  k: string;
  l: string;
  t: FormFieldType;
  v: string | number | boolean | string[];
  o?: string[];
}

// ── Canais aceitos como destino (D9) ─────────────────────────────────────────
export const FORM_PHONE_CHANNEL_TYPES = [
  "baileys",
  "zapo",
  "whatsapp",
  "evo",
  "evogo",
  "zapi",
  "uazapi",
  "meow",
  "waba",
  "waba_oauth",
  "dialog360",
  "gupshup",
];
export const FORM_OFFICIAL_CHANNEL_TYPES = ["waba", "waba_oauth", "dialog360", "gupshup"];

const lowerType = (type: unknown): string => String(type || "").trim().toLowerCase();

export const isFormPhoneChannelType = (type: unknown): boolean =>
  FORM_PHONE_CHANNEL_TYPES.includes(lowerType(type));

export const isFormEmailChannelType = (type: unknown): boolean => {
  const value = lowerType(type);
  return value === "webmail" || value === "email";
};

export const isFormChannelTypeAccepted = (type: unknown): boolean =>
  isFormPhoneChannelType(type) || isFormEmailChannelType(type);

export const isFormOfficialChannelType = (type: unknown): boolean =>
  FORM_OFFICIAL_CHANNEL_TYPES.includes(lowerType(type));

export const computeFormContactRule = (
  mainChannelType: unknown,
  hasEmailFallback: boolean
): FormContactRule => {
  if (isFormEmailChannelType(mainChannelType)) return "email";
  return hasEmailFallback ? "phoneOrEmail" : "phone";
};

// ── Tema (D14) ───────────────────────────────────────────────────────────────
export interface FormTheme {
  logoUrl?: string;
  coverUrl?: string;
  primaryColor: string;
  backgroundColor: string;
  colorScheme: "light" | "dark" | "auto";
  radius: "none" | "small" | "large";
  width: "narrow" | "wide";
  title?: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  redirectUrl?: string;
}

export const FORM_THEME_DEFAULTS: FormTheme = {
  primaryColor: "#4f46e5",
  backgroundColor: "#f8fafc",
  colorScheme: "auto",
  radius: "small",
  width: "narrow",
};

// ── Erros ────────────────────────────────────────────────────────────────────
// Códigos do backend; a tela de gestão traduz por formsPage.errors.<código>.
export const FORM_ERROR_CODES = [
  "ERR_FORM_NOT_FOUND",
  "ERR_FORM_SLUG_TAKEN",
  "ERR_FORM_SLUG_INVALID",
  "ERR_FORM_LIMIT",
  "ERR_FORM_NAME_REQUIRED",
  "ERR_FORM_FIELDS_INVALID",
  "ERR_FORM_IDENTITY_PHONE_REQUIRED",
  "ERR_FORM_IDENTITY_EMAIL_REQUIRED",
  "ERR_FORM_INVALID_REFERENCE",
  "ERR_FORM_DESTINATION_CHANNEL",
  "ERR_FORM_FALLBACK_QUEUE_REQUIRED",
  "ERR_FORM_INVALID",
  "ERR_FORM_CONTACT_REQUIRED",
  "ERR_FORM_EXTERNAL_DISABLED",
  "ERR_FORM_RENDER_EXPIRED",
  "ERR_FORM_TOO_LARGE",
  "ERR_FORM_DAILY_LIMIT",
  "ERR_FORMS_SCHEMA_MISSING",
  "ERR_FORM_NO_CHANNEL",
  "ERR_FORM_CONTACT_BLOCKED",
  "ERR_FORM_SUBMISSION_NOT_FOUND",
  "ERR_FORM_SUBMISSION_BUSY",
  "ERR_FORM_MIGRATED_UNPROCESSED",
  "ERR_FORM_ID_OR_SLUG_REQUIRED",
  "ERR_FORM_TICKET_NOT_OPENED",
  "ERR_FORM_PROCESS_FAILED",
] as const;

export type FormFieldErrorCode =
  | "required"
  | "tooLong"
  | "invalidEmail"
  | "invalidPhone"
  | "invalidNumber"
  | "outOfRange"
  | "invalidDate"
  | "invalidOption"
  | "mustAccept";

// ── Slug (D13) ───────────────────────────────────────────────────────────────
export const normalizeFormSlug = (raw: unknown): string => {
  const base = String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base.slice(0, FORM_LIMITS.slugMax).replace(/-$/g, "");
};

export const isValidFormSlug = (slug: unknown): boolean => {
  const value = String(slug ?? "");
  return (
    value.length >= FORM_LIMITS.slugMin &&
    value.length <= FORM_LIMITS.slugMax &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
};

// Chaves que o envio usa para outra coisa (espelho do backend: o salvar recusa campo
// com essas chaves — reason "keyReserved").
export const FORM_RESERVED_FIELD_KEYS = ["hp_website", "rendertoken", "mode", "ref", "embed", "lang", "sent", "error"];

// Parâmetros da própria página pública (?embed=1&lang=…&ref=…&sent=1&error=…): campo oculto
// com um desses nomes leria o parâmetro da página (espelho do backend: reason
// "hiddenParamReserved"; comparação sem diferenciar maiúsculas).
export const FORM_RESERVED_HIDDEN_PARAMS = ["embed", "ref", "lang", "sent", "error"];

export const isReservedHiddenParam = (param: unknown): boolean =>
  FORM_RESERVED_HIDDEN_PARAMS.indexOf(String(param ?? "").trim().toLowerCase()) !== -1;

// ── Chaves e ids gerados pela tela ───────────────────────────────────────────
const randomToken = (size: number): string => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(size);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < size; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

// Chave do campo: imutável depois de criada (é o nome no envio externo/API e a chave das
// respostas gravadas).
export const generateFieldKey = (existing: string[]): string => {
  let key = `f_${randomToken(6)}`;
  while (existing.includes(key)) key = `f_${randomToken(6)}`;
  return key;
};

export const generateOptionId = (existing: string[]): string => {
  let id = `o_${randomToken(5)}`;
  while (existing.includes(id)) id = `o_${randomToken(5)}`;
  return id;
};

// ── Destino de contato por tipo de campo ─────────────────────────────────────
const TEXT_LIKE_TYPES: FormFieldType[] = ["text", "textarea", "select", "hidden"];

export const isContactFieldAllowedForType = (field: string, type: FormFieldType): boolean => {
  if (field === "number") return type === "phone";
  if (field === "email") return type === "email";
  if (field === "birthdayDate") return type === "date";
  if (!FORM_CONTACT_FIELDS.includes(field)) return false;
  return TEXT_LIKE_TYPES.includes(type);
};

// ── Validação do envio (mesma regra do backend) ──────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRealDate = (value: string): boolean => {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= last;
};

export type FormAnswerInput = string | number | boolean | string[] | null | undefined;

// Valida as respostas na página antes do envio (o backend repete a mesma regra).
// Devolve os erros por chave; o envio só sai sem erro.
export const validateFormAnswers = (
  fields: PublicFormField[],
  values: Record<string, FormAnswerInput>,
  contactRule: FormContactRule
): { errors: Record<string, FormFieldErrorCode>; contactMissing: boolean } => {
  const errors: Record<string, FormFieldErrorCode> = {};
  let phone = "";
  let email = "";
  fields.forEach((field) => {
    const value = values[field.key];
    if (field.type === "hidden") return;
    if (field.type === "checkbox") {
      if (field.required && value !== true) errors[field.key] = "mustAccept";
      return;
    }
    if (field.type === "multiselect") {
      const list = Array.isArray(value) ? value : [];
      if (field.required && list.length === 0) errors[field.key] = "required";
      return;
    }
    const text = value === null || value === undefined ? "" : String(value).trim();
    if (!text) {
      if (field.required) errors[field.key] = "required";
      return;
    }
    const max =
      field.type === "textarea"
        ? field.maxLength || FORM_LIMITS.textareaMax
        : field.type === "email"
          ? FORM_LIMITS.emailMax
          : field.maxLength || FORM_LIMITS.textMax;
    if (text.length > max) {
      errors[field.key] = "tooLong";
      return;
    }
    if (field.type === "email") {
      if (!EMAIL_RE.test(text.toLowerCase())) errors[field.key] = "invalidEmail";
      else if (field.identity === "email") email = text;
      return;
    }
    if (field.type === "phone") {
      const digits = text.replace(/\D/g, "").length;
      if (digits < 8 || digits > 15) errors[field.key] = "invalidPhone";
      else if (field.identity === "phone") phone = text;
      return;
    }
    if (field.type === "number") {
      const n = Number(text.replace(",", "."));
      if (!Number.isFinite(n)) errors[field.key] = "invalidNumber";
      else if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        errors[field.key] = "outOfRange";
      }
      return;
    }
    if (field.type === "date") {
      if (!isRealDate(text)) errors[field.key] = "invalidDate";
      return;
    }
    if (field.type === "select") {
      if (!(field.options || []).some((o) => o.id === text)) errors[field.key] = "invalidOption";
    }
  });
  // Nas regras "phone"/"email" o campo de identidade é obrigatório (o "required" acima já
  // aponta). Com a reserva de e-mail ("phoneOrEmail") basta um dos dois.
  const hasFieldError = Object.keys(errors).length > 0;
  const contactMissing =
    !hasFieldError &&
    ((contactRule === "phone" && !phone) ||
      (contactRule === "email" && !email) ||
      (contactRule === "phoneOrEmail" && !phone && !email));
  return { errors, contactMissing };
};

// Telefone enviado pela página: sempre com "+" (o PhoneInput devolve os dígitos com o
// DDI). Sem o "+", o backend aplicaria o país da Região e um número estrangeiro de 10–11
// dígitos viraria brasileiro.
export const toInternationalPhone = (digitsWithCountry: string): string => {
  const digits = String(digitsWithCountry || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

// ── Textos da página pública (lib/form-strings.ts implementa nos 13 idiomas) ─
export const FORM_STRING_KEYS = [
  "submit",
  "sending",
  "sentTitle",
  "sentBody",
  "continue",
  "required",
  "invalidEmail",
  "invalidPhone",
  "invalidNumber",
  "outOfRange",
  "invalidDate",
  "chooseOne",
  "chooseAtLeastOne",
  "mustAccept",
  "tooLong",
  "invalidOption",
  "selectPlaceholder",
  "optional",
  "contactRequiredPhone",
  "contactRequiredEmail",
  "contactRequiredAny",
  "unavailableTitle",
  "unavailableBody",
  "tooMany",
  "dailyLimit",
  "expired",
  "externalDisabled",
  "errorGeneric",
  "phoneSearch",
  "phoneNoResults",
] as const;
export type FormStringKey = (typeof FORM_STRING_KEYS)[number];
export type FormStrings = Record<FormStringKey, string>;

// ── Contratos da API (gestão) ────────────────────────────────────────────────
export type FormChannelWarning =
  | "noChannel"
  | "channelDeleted"
  | "channelTypeInvalid"
  | "channelDisconnected"
  | null;

export interface FormChannelSummary {
  id: number;
  name: string;
  type: string;
  status: string;
}

export interface FormListItem {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  destinationMode: FormDestinationMode;
  channel: FormChannelSummary | null;
  submissions24h: number;
  submissionsTotal: number;
  pendingCount: number;
  failedCount: number;
  suspectCount: number;
  lastSubmissionAt: string | null;
  dailyLimit: number;
  // Envios que contam no teto de 24 h (sem os da API e sem os suspeitos) — é este que se
  // compara com dailyLimit. Ausente em backend sem o campo.
  dailyLimitCount?: number;
  channelWarning: FormChannelWarning;
}

export interface FormListResponse {
  forms: FormListItem[];
  maxForms: number;
}

export type FormWarning =
  | "noChannel"
  | "channelDeleted"
  | "channelTypeInvalid"
  | "channelDisconnected"
  | "fallbackDeleted"
  | "queueDeleted"
  | "chatFlowDeleted"
  | "aiAgentDeleted"
  | "tagsDeleted"
  | "stageDeleted"
  | "officialWithoutTemplate";

export interface FormConfig {
  name: string;
  slug: string;
  isActive: boolean;
  whatsappId: number | null;
  emailFallbackWhatsappId: number | null;
  destinationMode: FormDestinationMode;
  queueId: number | null;
  chatFlowId: number | null;
  aiAgentId: number | null;
  tagIds: number[];
  opportunityPipelineId: number | null;
  opportunityStageId: number | null;
  confirmationEnabled: boolean;
  confirmationText: string | null;
  confirmationTemplate: string | null;
  confirmationEmailSubject: string | null;
  fields: FormField[];
  theme: FormTheme;
  acceptExternalPosts: boolean;
  dailyLimit: number;
  minFillSeconds: number;
}

export interface FormDetail extends FormConfig {
  id: number;
  createdAt: string;
  updatedAt: string;
  warnings: FormWarning[];
}

/** Resultado da confirmação ao cliente (ausente/null = sem confirmação ou sem resultado). */
export type FormConfirmationOutcome = "sent" | "skipped" | "failed";

export interface FormSubmissionItem {
  id: number;
  createdAt: string;
  /** Última mudança do envio (posse, passo): é por ele que o servidor vê o envio parado. */
  updatedAt?: string | null;
  status: FormSubmissionStatus;
  errorCode: string | null;
  source: FormSource;
  contact: { id: number; name: string } | null;
  ticketId: number | null;
  answers: FormAnswer[];
  confirmation?: FormConfirmationOutcome | null;
}

export interface FormSubmissionsResponse {
  submissions: FormSubmissionItem[];
  count: number;
  hasMore: boolean;
}

// ── Contratos da API pública ─────────────────────────────────────────────────
export interface PublicFormRegion {
  country: string;
  currency: string;
  language: string;
  languageConfigured: boolean;
}

export interface PublicFormRenderToken {
  issuedAt: number;
  nonce: string;
  sig: string;
}

export interface PublicFormDefinition {
  slug: string;
  name: string;
  fields: PublicFormField[];
  theme: FormTheme;
  contactRule: FormContactRule;
}

export interface PublicFormView {
  form: PublicFormDefinition;
  region: PublicFormRegion | null;
  renderToken: PublicFormRenderToken;
  /** Tempo mínimo de preenchimento (s): a página espera esse tempo desde que recebeu o código antes de enviar. */
  minFillSeconds?: number;
}

export interface PublicFormSubmitPayload {
  answers: Record<string, FormAnswerInput>;
  renderToken: PublicFormRenderToken;
  mode: "page" | "embed";
  hp_website: string;
  ref?: string;
}

export interface PublicFormSubmitResponse {
  ok: boolean;
  redirectUrl?: string | null;
}

// ── Renderer compartilhado (página pública + prévia do editor) ───────────────
// components/forms/public-form-renderer.tsx implementa; a prévia do editor passa
// mode "preview" (nunca envia).
export interface PublicFormRendererProps {
  form: PublicFormDefinition;
  strings: FormStrings;
  mode: "page" | "embed" | "preview";
  // País padrão do seletor de telefone (ISO2, pela Região). Sem valor, BR.
  defaultCountry?: string;
  // Valores dos campos ocultos lidos da URL (hiddenParam) ou do padrão.
  hiddenValues?: Record<string, string>;
  // Erros vindos do servidor (details.fields) por chave.
  serverErrors?: Record<string, FormFieldErrorCode>;
  submitting?: boolean;
  // Envio já validado pela página; o renderer só coleta e valida no cliente.
  onSubmit?: (answers: Record<string, FormAnswerInput>) => void;
}

// ── Iframe (código de embutir) ───────────────────────────────────────────────
export const FORM_EMBED_MESSAGE_RESIZE = "form-embed:resize";
export const FORM_EMBED_MESSAGE_REDIRECT = "form-embed:redirect";

const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const jsString = (value: string): string => JSON.stringify(value).replace(/</g, "\\u003c");

// Código de embutir com script INLINE (nada para o cliente baixar e hospedar): monta o
// iframe com ?embed=1&ref=<origem+caminho da página-mãe> e repassa só os parâmetros dos
// campos ocultos configurados no momento da cópia (campo oculto novo pede copiar de novo).
export const buildFormEmbedSnippet = (args: {
  panelOrigin: string;
  slug: string;
  title: string;
  hiddenParams: string[];
}): string => {
  const origin = args.panelOrigin.replace(/\/+$/, "");
  const boxId = `form-embed-${args.slug}`;
  const src = `${origin}/f/${args.slug}`;
  const params = jsString(JSON.stringify(args.hiddenParams.filter((p) => /^[A-Za-z0-9_]{1,40}$/.test(p))));
  return [
    `<div id="${escapeAttr(boxId)}"></div>`,
    "<script>",
    "(function(){",
    `var origin=${jsString(origin)},slug=${jsString(args.slug)},base=${jsString(src)};`,
    `var box=document.getElementById(${jsString(boxId)});if(!box)return;`,
    `var keep=JSON.parse(${params});var q=new URLSearchParams(location.search);var out=new URLSearchParams();`,
    `out.set("embed","1");out.set("ref",(location.origin+location.pathname).slice(0,500));`,
    `keep.forEach(function(k){var v=q.get(k);if(v)out.set(k,v.slice(0,200));});`,
    `var f=document.createElement("iframe");f.src=base+"?"+out.toString();f.title=${jsString(args.title)};`,
    `f.loading="lazy";f.style.cssText="width:100%;border:0;min-height:420px;display:block";box.appendChild(f);`,
    "window.addEventListener(\"message\",function(e){",
    "if(e.origin!==origin||!e.data||e.data.slug!==slug)return;",
    // A altura mínima só segura o espaço até a 1ª medida: depois vale a altura real (a tela
    // de "enviado" é curta e deixaria um vão em branco no site).
    `if(e.data.type===${jsString(FORM_EMBED_MESSAGE_RESIZE)}){var h=Number(e.data.height)||0;f.style.minHeight="0";f.style.height=Math.max(200,Math.min(5000,h))+"px";}`,
    `if(e.data.type===${jsString(FORM_EMBED_MESSAGE_REDIRECT)}&&/^https:\\/\\//.test(String(e.data.url||"")))location.href=e.data.url;`,
    "});",
    "})();",
    "</script>",
  ].join("\n");
};

// Alternativa sem script (sites que bloqueiam script): altura fixa, sem repassar UTM.
export const buildFormIframeOnlySnippet = (args: { panelOrigin: string; slug: string; title: string }): string => {
  const origin = args.panelOrigin.replace(/\/+$/, "");
  return `<iframe src="${escapeAttr(`${origin}/f/${args.slug}?embed=1`)}" title="${escapeAttr(args.title)}" style="width:100%;border:0;min-height:640px" loading="lazy"></iframe>`;
};

// Endereço de envio para o HTML próprio do site / sistema sem token (D3, D18).
export const buildFormSubmitEndpoint = (apiBase: string, slug: string): string =>
  `${apiBase.replace(/\/+$/, "")}/forms-public/${slug}/submit`;

// HTML de exemplo (campos pela chave + armadilha). Só para o admin copiar e adaptar.
export const buildFormExternalHtmlExample = (args: {
  apiBase: string;
  slug: string;
  fields: Array<Pick<FormField, "key" | "type" | "label" | "required" | "options">>;
  // Texto do botão no idioma da tela (formsPage.share.htmlSubmit).
  submitLabel: string;
}): string => {
  const lines: string[] = [
    `<form action="${escapeAttr(buildFormSubmitEndpoint(args.apiBase, args.slug))}" method="POST">`,
  ];
  args.fields.forEach((field) => {
    if (field.type === "hidden") {
      lines.push(`  <input type="hidden" name="${escapeAttr(field.key)}" value="">`);
      return;
    }
    const required = field.required ? " required" : "";
    lines.push(`  <label>${escapeAttr(field.label)}`);
    if (field.type === "textarea") {
      lines.push(`    <textarea name="${escapeAttr(field.key)}"${required}></textarea>`);
    } else if (field.type === "select") {
      lines.push(`    <select name="${escapeAttr(field.key)}"${required}>`);
      (field.options || []).forEach((option) => {
        lines.push(`      <option value="${escapeAttr(option.id)}">${escapeAttr(option.label)}</option>`);
      });
      lines.push("    </select>");
    } else if (field.type === "multiselect") {
      (field.options || []).forEach((option) => {
        lines.push(
          `    <input type="checkbox" name="${escapeAttr(field.key)}" value="${escapeAttr(option.id)}"> ${escapeAttr(option.label)}`
        );
      });
    } else if (field.type === "checkbox") {
      lines.push(`    <input type="checkbox" name="${escapeAttr(field.key)}" value="true"${required}>`);
    } else {
      const inputType =
        field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
      lines.push(`    <input type="${inputType}" name="${escapeAttr(field.key)}"${required}>`);
    }
    lines.push("  </label>");
  });
  lines.push('  <input type="text" name="hp_website" value="" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">');
  lines.push(`  <button type="submit">${escapeAttr(args.submitLabel)}</button>`);
  lines.push("</form>");
  return lines.join("\n");
};
