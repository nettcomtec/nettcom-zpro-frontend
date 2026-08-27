import api from "@/lib/api";

export interface Contact {
  id: number;
  name: string;
  number: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  birthdayDate?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  observations?: string;
  profilePicUrl?: string;
  tags?: { id: number; name: string; tag?: string; color: string }[];
  wallets?: unknown[];
  extraInfo?: Record<string, unknown>[];
  lid?: string;
  isLid?: boolean;
  bloquearContato?: boolean;
  bloquearChatbot?: boolean;
  blocked?: boolean;
  chatbotBlocked?: boolean;
  messengerId?: string;
  instagramPK?: string;
  hubWhatsapp?: string;
  telegramId?: string;
  webchatId?: string;
  mercadolivreId?: string;
  linkedinId?: string;
  youtubeChannelId?: string;
  tiktokId?: string;
  hubMercadolivre?: string;
  hubTiktok?: string;
  hubLikedin?: string;
  hubOlx?: string;
  hubYoutube?: string;
  hubIfood?: string;
  hubTwitter?: string;
  hubSms?: string;
  hubTelegram?: string;
  hubWidget?: string;
  hubWebchat?: string;
  hubEmail?: string;
  kanban?: number;
  queueId?: number | null;
  queue?: string | { id: number; queue?: string; color?: string } | null;
  queueColor?: string | null;
  wallet?: string | { id: number; name: string } | null;
  cidade?: string;
  estado?: string;
  cep?: string;
  bsuid?: string | null;
  username?: string | null;
  parentBsuid?: string | null;
}

export interface ContactPayload {
  name: string;
  number: string;
  email?: string;
  cpf?: string;
  birthdayDate?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  observations?: string;
  tags?: number[];
  wallets?: number[];
  queueId?: number | null;
  extraInfo?: { name: string; value: string }[];
  cidade?: string;
  estado?: string;
  cep?: string;
  messengerId?: string;
  instagramPK?: string;
  hubWhatsapp?: string;
  lid?: string;
  isLid?: boolean;
  telegramId?: string;
  webchatId?: string;
  mercadolivreId?: string;
  linkedinId?: string;
  youtubeChannelId?: string;
  tiktokId?: string;
  hubMercadolivre?: string;
  hubTiktok?: string;
  hubLikedin?: string;
  hubOlx?: string;
  hubYoutube?: string;
  hubIfood?: string;
  hubTwitter?: string;
  hubSms?: string;
  hubTelegram?: string;
  hubWidget?: string;
  hubWebchat?: string;
  hubEmail?: string;
}

export async function fetchContacts(params?: { searchParam?: string; pageNumber?: number; pageSize?: number; tagId?: number; walletId?: number; queueId?: number; smartSearch?: boolean }) {
  const { walletId, smartSearch = true, ...rest } = params || { searchParam: "", pageNumber: 1 };
  const queryParams: Record<string, unknown> = { ...rest, smartSearch };
  if (walletId != null) queryParams.walletId = { id: walletId };
  return api.get("/contacts", { params: queryParams });
}

export async function fetchContact(contactId: number) {
  return api.get(`/contacts/${contactId}`);
}

export async function createContact(data: ContactPayload) {
  return api.post("/contacts", data);
}

// Payload PARCIAL: o endpoint PUT /contacts/:id faz update parcial e preserva os
// campos omitidos. `kanban` não faz parte de ContactPayload mas é aceito pelo
// controller. Omitir `number` (ex.: no save de kanban) evita a reformatação de
// número no backend, que pode dar 409 deixando o kanban já salvo.
export async function updateContact(
  contactId: number,
  data: Partial<ContactPayload> & { kanban?: number | null }
) {
  return api.put(`/contacts/${contactId}`, data);
}

export async function deleteContact(contactId: number) {
  return api.delete(`/contacts/${contactId}`);
}

export async function forceDeleteContact(contactId: number) {
  return api.delete(`/contactsforce/${contactId}`);
}

export async function importContacts(
  file: File,
  options?: { tagIds?: number[]; walletId?: number; queueId?: number | null; validateContact?: boolean; addTags?: boolean }
) {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.tagIds?.length) {
    formData.append("tags", options.tagIds.join(","));
  }
  if (options?.walletId != null) {
    formData.append("wallets", String(options.walletId));
  }
  if (options?.queueId != null) {
    formData.append("queueId", String(options.queueId));
  }
  if (options?.validateContact !== undefined) {
    formData.append("validContact", String(options.validateContact));
  }
  if (options?.addTags !== undefined) {
    formData.append("addTags", String(options.addTags));
  }
  // /contacts/upload (e NÃO /contacts/import): /contacts/import é o importador
  // da agenda do aparelho — ignora arquivo/tags/carteira/fila e sempre exige
  // uma sessão venom viva (400 ERR_WAPP_NOT_INITIALIZED_2 em canal baileys,
  // mesmo conectado e mesmo sem validação marcada).
  return api.post("/contacts/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
}

export async function exportContacts(params?: {
  mode?: "all" | "filtered";
  searchParam?: string;
  walletId?: number;
  tagId?: number;
  smartSearch?: boolean;
}) {
  return api.post<{ downloadLink: string }>("/contacts/export", params || {});
}

export async function exportContactsCount(params?: {
  searchParam?: string;
  walletId?: number;
  tagId?: number;
  smartSearch?: boolean;
}) {
  return api.post<{ all: number; filtered: number }>("/contacts/export/count", params || {});
}

export type UpdateBehavior =
  | "always"
  | "never"
  | "never_if_empty_file"
  | "only_if_empty_system"
  | "ignore";

export interface ColumnMapping {
  columnIndex: number;
  field: string;
  updateBehavior: UpdateBehavior;
}

export interface SmartImportConfig {
  columnMappings: ColumnMapping[];
  defaultCountryCode?: string;
  defaultAreaCode?: string;
  tagIds?: number[];
  walletId?: number;
  queueId?: number | null;
  addTags?: boolean;
  validateContact?: boolean;
  hasHeader?: boolean;
  /** Token de divisor CSV/TXT: semicolon | comma | tab | pipe (ausente = auto no backend) */
  delimiter?: string;
}

export interface PreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  /** Token do divisor usado pelo backend no parse (só CSV/TXT; ausente em backend antigo) */
  delimiter?: string;
}

export interface SmartImportResult {
  imported: number;
  updated: number;
  failed: number;
  total: number;
}

export async function importPreview(
  file: File,
  delimiter?: string
): Promise<PreviewResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (delimiter && delimiter !== "auto") formData.append("delimiter", delimiter);
  const { data } = await api.post<PreviewResult>(
    "/contacts/import-preview",
    formData,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
  );
  return data;
}

export async function smartImportContacts(
  file: File,
  config: SmartImportConfig
): Promise<SmartImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("config", JSON.stringify(config));
  const { data } = await api.post<SmartImportResult>(
    "/contacts/smart-import",
    formData,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
  );
  return data;
}

export async function syncContacts() {
  return api.post("/contacts/sync");
}

export async function syncContactGroups() {
  return api.post("/groups/sync");
}

export interface DuplicateCleanupPairResult {
  status: "consolidated" | "skipped" | "error";
  detail?: string;
  primaryId: number;
  duplicateId: number;
}

export interface DuplicateCleanupResult {
  removedContacts?: { contactId: number; number: string }[];
  groups?: number;
  consolidated?: number;
  skipped?: number;
  errors?: number;
  results?: DuplicateCleanupPairResult[];
}

export async function removeDuplicateContacts(): Promise<DuplicateCleanupResult> {
  const { data } = await api.post("/contactsDeleteDuplicate");
  return (data ?? {}) as DuplicateCleanupResult;
}

export async function groupContactLid(): Promise<DuplicateCleanupResult> {
  const { data } = await api.post("/contactsCheckLid");
  return (data ?? {}) as DuplicateCleanupResult;
}

export async function checkNinthDigit(): Promise<DuplicateCleanupResult> {
  const { data } = await api.post("/contactsGroupDuplicate");
  return (data ?? {}) as DuplicateCleanupResult;
}

export async function removeContactProfilePicture(contactId: number) {
  return api.post(`/contactsRemovePicture/${contactId}`);
}

export async function updateContactBlock(contactId: number, data: { number: string; bloquearContato?: boolean; bloquearChatbot?: boolean }) {
  const body: { number: string; blocked?: boolean; chatbotBlocked?: boolean } = { number: data.number };
  if (data.bloquearContato !== undefined) body.blocked = data.bloquearContato;
  if (data.bloquearChatbot !== undefined) body.chatbotBlocked = data.bloquearChatbot;
  return api.put(`/contacts/${contactId}`, body);
}

// sortKey/sortDir vao pro servidor: a ordenacao da tabela vale sobre TODO o
// resultado, nao so sobre os 40 contatos da pagina carregada.
export type BirthdaySortKey = "name" | "number" | "birthdayDate" | "age" | "daysUntil";

export async function fetchBirthdayContacts(params?: { searchParam?: string; pageNumber?: number; smartSearch?: boolean; month?: string; sortKey?: BirthdaySortKey; sortDir?: "asc" | "desc" }) {
  const { smartSearch = true, ...rest } = params || { pageNumber: 1 };
  return api.get("/contactsBirthday/", { params: { ...rest, smartSearch } });
}

// Auditoria de datas de aniversario: valores que precisam de atencao.
// "possiblySwapped" so aparece com swapCheck: data valida cujo dia <= 12 pode
// ter dia/mes trocados por importacao antiga; usuario confirma ou troca.
export type BirthdayAuditCategory =
  | "nonCanonical"
  | "ambiguous"
  | "noYear"
  | "implausible"
  | "unparseable"
  | "possiblySwapped";

export interface BirthdayAuditCandidate {
  iso: string; // YYYY-MM-DD
  day: number;
  month: number; // 1-12
  year: number;
}

export interface BirthdayAuditItem {
  contactId: number;
  name: string;
  number: string;
  profilePicUrl: string | null;
  raw: string;
  category: BirthdayAuditCategory;
  suggestion: string | null;
  candidates: BirthdayAuditCandidate[];
  day: number | null;
  month: number | null;
  year: number | null;
  age: number | null;
}

export interface BirthdayAuditResult {
  items: BirthdayAuditItem[];
  counts: Record<string, number>;
  total: number;
  truncated: boolean;
}

export async function auditBirthdayDates(swapCheck = false) {
  return api.get<BirthdayAuditResult>("/contacts/birthday-audit", {
    params: swapCheck ? { swapCheck: "true" } : undefined,
  });
}

export async function fixBirthdayDates(fixes: { contactId: number; birthdayDate: string | null }[]) {
  return api.post("/contacts/birthday-audit/fix", { fixes });
}

export interface WhatsappOption {
  label: string;
  value: number;
  type: string;
  tokenAPI?: string | null;
  fbPageId?: string | null;
}

export async function sendBirthdayMessage(whatsapp: WhatsappOption) {
  return api.post("/messages/sendBirthday", { whatsapp });
}

export async function updateContactTags(contactId: number, tags: number[]) {
  return api.put(`/contact-tags/${contactId}`, { tags });
}

export async function updateContactWallet(contactId: number, wallets: number[]) {
  return api.put(`/contact-wallet/${contactId}`, { wallets });
}

export async function updateContactLidFromContactId(contactId: number) {
  return api.post(`/contactsUpdateLidFromContactId/${contactId}`);
}

export async function updateContactName(contactId: number, name: string) {
  return api.post(`/contactsUpdateName/${contactId}`, { name });
}

export async function updateContactNumber(contactId: number, number: string) {
  return api.post(`/contactsUpdateNumber/${contactId}`, { number });
}

export async function migrateContact(contactId: number) {
  return api.post("/contactMigrate", { contactId });
}
