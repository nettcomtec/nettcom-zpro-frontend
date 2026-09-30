import api, { BACKGROUND_REQUEST } from "@/lib/api";

// PLANO_CRM_CONTATO — Fase 3 (Relacionamento). Contrato espelhado em
// backend/src/services/RelationshipServices/* e backend/src/routes/relationshipRoutesZPRO.ts.
// Rotas aditivas atrás de requireFeature("relationship") (402 sem a capacidade no plano).
// Erros no formato `{ error: "ERR_…" }`.

export interface RelationshipType {
  id: number;
  name: string;
  color: string | null;
  isActive: boolean;
  order: number;
  /** true quando há registros usando o tipo (excluir vira desativar) */
  inUse: boolean;
}

export interface RelationshipAttachmentInfo {
  /** posição no registro — usada no download e na remoção */
  index: number;
  name: string;
  size: number;
  mimeType: string;
}

export interface RelationshipItem {
  id: number;
  contactId: number;
  ticketId: number | null;
  type: { id: number; name: string; color: string | null; isActive: boolean } | null;
  /** responsável pela ação */
  user: { id: number; name: string } | null;
  createdBy: { id: number; name: string } | null;
  description: string;
  notes: string | null;
  /** ISO */
  occurredAt: string;
  attachments: RelationshipAttachmentInfo[];
  /** o usuário atual pode editar/excluir este registro (autor ou gestor — D23) */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipListResponse {
  items: RelationshipItem[];
  /** null = fim */
  nextCursor: string | null;
  /** o usuário atual gerencia tipos e registros de outros (D23/D26) */
  canManage: boolean;
}

export interface RelationshipFormValues {
  typeId: number;
  description: string;
  notes?: string | null;
  /** ISO */
  occurredAt: string;
  /** responsável; ausente = usuário atual */
  userId?: number | null;
  ticketId?: number | null;
}

// ---- Tipos ----

export async function fetchRelationshipTypes(options?: { includeInactive?: boolean; background?: boolean }) {
  return api.get<RelationshipType[]>("/relationship-types", {
    params: options?.includeInactive ? { includeInactive: "true" } : undefined,
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

export async function createRelationshipType(data: { name: string; color?: string | null; order?: number }) {
  return api.post<RelationshipType>("/relationship-types", data);
}

export async function updateRelationshipType(
  id: number,
  data: Partial<{ name: string; color: string | null; isActive: boolean; order: number }>
) {
  return api.put<RelationshipType>(`/relationship-types/${id}`, data);
}

/** Tipo em uso é desativado em vez de apagado: resposta `{ deactivated: true }`. */
export async function deleteRelationshipType(id: number) {
  return api.delete<{ deleted?: boolean; deactivated?: boolean }>(`/relationship-types/${id}`);
}

/** Cria os tipos sugeridos com os nomes no idioma de quem clica; nomes já existentes são ignorados. */
export async function createSuggestedRelationshipTypes(names: string[]) {
  return api.post<RelationshipType[]>("/relationship-types/suggested", { names });
}

// ---- Registros ----

export async function fetchRelationships(
  contactId: number,
  options?: { cursor?: string | null; limit?: number; ticketId?: number | null; background?: boolean }
) {
  const params: Record<string, string | number> = { contactId };
  if (options?.cursor) params.cursor = options.cursor;
  if (options?.limit) params.limit = options.limit;
  if (options?.ticketId) params.ticketHint = options.ticketId;
  return api.get<RelationshipListResponse>("/relationships", {
    params,
    ...(options?.background ? BACKGROUND_REQUEST : {})
  });
}

const toFormData = (values: Record<string, unknown>, files?: File[]): FormData => {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) return;
    form.append(key, value === null ? "" : String(value));
  });
  (files || []).forEach(file => form.append("files", file));
  return form;
};

// Até 5 anexos de 10 MB: o corte padrão de 30 s do axios derrubaria o envio em conexão lenta
// (e o registro seria gravado com a tela acusando erro).
const UPLOAD_TIMEOUT_MS = 300000;

export async function createRelationship(contactId: number, values: RelationshipFormValues, files?: File[]) {
  return api.post<RelationshipItem>("/relationships", toFormData({ contactId, ...values }, files), {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: UPLOAD_TIMEOUT_MS
  });
}

/** Anexo a remover: índice atual + nome e tamanho, conferidos no backend antes de apagar. */
export interface RelationshipAttachmentRef {
  index: number;
  name: string;
  size: number;
}

const hintParams = (ticketHint?: number | null) => (ticketHint ? { params: { ticketHint } } : {});

/** `removeAttachments`: anexos atuais a remover. Total final ≤ 5 anexos. */
export async function updateRelationship(
  id: number,
  values: Partial<RelationshipFormValues> & { removeAttachments?: RelationshipAttachmentRef[] },
  files?: File[],
  ticketHint?: number | null
) {
  const { removeAttachments, ...rest } = values;
  const payload: Record<string, unknown> = { ...rest };
  if (removeAttachments && removeAttachments.length > 0) payload.removeAttachments = JSON.stringify(removeAttachments);
  return api.put<RelationshipItem>(`/relationships/${id}`, toFormData(payload, files), {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: UPLOAD_TIMEOUT_MS,
    ...hintParams(ticketHint)
  });
}

export async function deleteRelationship(id: number, ticketHint?: number | null) {
  return api.delete(`/relationships/${id}`, hintParams(ticketHint));
}

/** Download autenticado (o front nunca usa URL estática do anexo). */
export async function downloadRelationshipAttachment(id: number, index: number, ticketHint?: number | null) {
  return api.get<Blob>(`/relationships/${id}/attachments/${index}`, {
    responseType: "blob",
    ...hintParams(ticketHint)
  });
}

export const RELATIONSHIP_MAX_FILES = 5;
export const RELATIONSHIP_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Teto de descrição e observações (mesmo do backend). */
export const RELATIONSHIP_TEXT_MAX_CHARS = 5000;
export const RELATIONSHIP_ACCEPT =
  ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv,.txt";
