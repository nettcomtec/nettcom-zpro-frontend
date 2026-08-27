/**
 * Taxonomia RBAC — perfil `custom` (frontendNovo).
 * Espelha backend: `backend/src/types/ICustomPermissionsZPRO.ts` (§6.1).
 * Armazenado em `CustomProfile.customPermissions` no tenant — o user apenas referencia via FK.
 */

export interface ICustomPermissions {
  // Atendimentos
  tickets_create: boolean;
  tickets_view_all: boolean;
  tickets_view_chatbot: boolean;
  tickets_assign: boolean;
  tickets_resolve: boolean;
  tickets_delete: boolean;
  tickets_reopen: boolean;
  tickets_copilot: boolean;

  // Contatos
  contacts_create: boolean;
  contacts_edit: boolean;
  contacts_delete: boolean;
  contacts_export: boolean;
  contacts_view_full: boolean;

  // Mensagens
  messages_delete: boolean;
  messages_forward: boolean;

  // Mensagens Rápidas
  quickreplies_manage_public: boolean;

  // Tarefas
  tasks_create: boolean;
  tasks_edit: boolean;
  tasks_delete: boolean;
  tasks_view_all: boolean;

  // Kanban / Funil / Painel
  kanban_manage: boolean;
  funnel_manage: boolean;
  attendance_panel_view_all: boolean;

  // Relatórios
  reports_view: boolean;
  reports_view_all: boolean;
  reports_export: boolean;

  // Configurações
  settings_general: boolean;

  // Demais módulos
  campaigns_manage: boolean;
  queues_manage: boolean;
  groups_manage: boolean;
  mass_send_manage: boolean;
  gallery_view: boolean;
  gallery_manage: boolean;
  catalog_view: boolean;
  // Cobrancas: controla dar BAIXA/cancelar. A leitura e liberada a qualquer
  // perfil — o selo "Pago" precisa aparecer na ficha do ticket para quem atende.
  payments_manage: boolean;
  catalog_manage: boolean;
  private_chat_access: boolean;
  private_chat_audit: boolean;
  scheduled_messages_manage: boolean;
  booking_manage: boolean;
  tags_manage: boolean;
  closure_reasons_manage: boolean;
  business_hours_manage: boolean;
  notes_manage: boolean;
  protocols_manage: boolean;
  chat_flow_manage: boolean;
  ratings_view: boolean;
  notifications_manage: boolean;

  // Serviços admin
  api_service_access: boolean;
  audit_log_view: boolean;

  // VoIP
  voip_wavoip: boolean;
  voip_webphone: boolean;

  // Sessões
  sessions_manage: boolean;

  // Usuários
  users_view: boolean;
  users_manage: boolean;
}

export type PermissionKey = keyof ICustomPermissions;

export const DEFAULT_CUSTOM_PERMISSIONS: ICustomPermissions = {
  tickets_create: false,
  tickets_view_all: false,
  tickets_view_chatbot: false,
  tickets_assign: false,
  tickets_resolve: false,
  tickets_delete: false,
  tickets_reopen: false,
  tickets_copilot: false,
  contacts_create: false,
  contacts_edit: false,
  contacts_delete: false,
  contacts_export: false,
  contacts_view_full: false,
  messages_delete: false,
  messages_forward: false,
  quickreplies_manage_public: false,
  tasks_create: false,
  tasks_edit: false,
  tasks_delete: false,
  tasks_view_all: false,
  kanban_manage: false,
  funnel_manage: false,
  attendance_panel_view_all: false,
  reports_view: false,
  reports_view_all: false,
  reports_export: false,
  settings_general: false,
  campaigns_manage: false,
  queues_manage: false,
  groups_manage: false,
  mass_send_manage: false,
  gallery_view: false,
  gallery_manage: false,
  catalog_view: false,
  payments_manage: false,
  catalog_manage: false,
  private_chat_access: false,
  private_chat_audit: false,
  scheduled_messages_manage: false,
  booking_manage: false,
  tags_manage: false,
  closure_reasons_manage: false,
  business_hours_manage: false,
  notes_manage: false,
  protocols_manage: false,
  chat_flow_manage: false,
  ratings_view: false,
  notifications_manage: false,
  api_service_access: false,
  audit_log_view: false,
  voip_wavoip: false,
  voip_webphone: false,
  sessions_manage: false,
  users_view: false,
  users_manage: false,
};

export const PERMISSION_KEYS: Set<PermissionKey> = new Set(
  Object.keys(DEFAULT_CUSTOM_PERMISSIONS) as PermissionKey[]
);

export const ADMIN_ONLY_ACTIONS: Set<PermissionKey> = new Set<PermissionKey>([
  "tickets_delete",
  "tickets_reopen",
  "contacts_delete",
  "contacts_export",
  "tasks_delete",
  "users_manage",
  "sessions_manage",
  "api_service_access",
]);

export interface CustomProfileSummary {
  id: number;
  name: string;
  description: string | null;
  customPermissions: ICustomPermissions;
  menuPermissions: Record<string, boolean>;
}
