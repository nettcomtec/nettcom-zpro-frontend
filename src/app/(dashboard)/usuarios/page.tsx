"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/layout/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search, Plus, Pencil, Trash2, Users, Shield, ShieldCheck, User, UserCog, Phone,
  GitBranch, Smartphone, UserX, UserCheck, ChevronRight, Clock, PhoneCall, Loader2, Mail,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { fetchAllUsers, fetchUser, createUser, updateUser, updateUserConfigs, deleteUser, inactivateUser, reactivateUser, updateUserIsOnline, resendUserInvite, type User as UserType } from "@/services/users";
import { fetchCustomProfiles, type CustomProfileItem } from "@/services/custom-profiles";
import Link from "next/link";
import { fetchQueues } from "@/services/queues";
import { fetchWhatsapps } from "@/services/whatsapp";
import { BusinessHoursEditor, getDefaultBusinessHours, validateBusinessHours, type BusinessHour } from "@/components/business-hours-editor";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useAuthStore } from "@/stores/auth-store";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { PhoneInput } from "@/components/ui/phone-input";

// ── Menu permission keys (labels resolved inside component via t()) ─────────
const ALL_MENU_PERMISSION_KEYS = [
  "massa", "grupo", "chat-privado", "kanban", "funil", "tarefas", "agenda", "sessoes",
  "relatorios", "painel-atendimentos", "filas", "equipes", "mensagens-rapidas", "chat-flow",
  "agendamentos", "aniversarios", "fechamento", "etiquetas", "notas",
  "protocolos", "avaliacoes", "horarioAtendimento", "campanhas", "contatos",
  "google-calendar", "agendamento-publico", "email-marketing",
];

const USER_ONLY_PERMS = ["massa", "campanhas", "grupo", "chat-privado", "kanban", "funil", "tarefas", "agenda", "contatos"];

const DEFAULT_MENU: Record<string, boolean> = Object.fromEntries(
  ALL_MENU_PERMISSION_KEYS.map((k) => [k, true])
);

// ── Hierarquia de perfis ────────────────────────────────────────────────────
// Espelho de `USER_PROFILE_RANK_ZPRO` (backend/src/controllers/UserControllerZPRO.ts):
// número MAIOR = mais poder. O `store` responde 403 quando o perfil pedido tem rank
// ACIMA do de quem pede — `super` não cria `admin`, `custom` não cria `super` nem
// `admin`. Sem espelhar isso aqui o Select oferecia "Administrador" a todo mundo e o
// 403 só aparecia no salvar.
// `user` e `custom` empatam em 0 de propósito (igual ao backend): `custom` não é um
// "admin reduzido" — é perfil comum cujas permissões granulares vêm do CustomProfile.
// Perfil desconhecido cai em 0, fail-closed como ATOR.
const PROFILE_RANK_ZPRO: Record<string, number> = {
  superadmin: 3,
  admin: 2,
  super: 1,
  user: 0,
  custom: 0,
};

const getProfileRank = (profile?: string | null): number =>
  PROFILE_RANK_ZPRO[String(profile ?? "")] ?? 0;

// ── Extended user type ─────────────────────────────────────────────────────
interface ExtUser extends UserType {
  blockWavoip?: boolean;
  restrictedUser?: boolean | string;
  sipEnabled?: boolean;
  sipUsername?: string;
  sipPassword?: string;
  sipServer?: string;
  sipDomain?: string;
  sipPort?: number;
  sipTransport?: string;
  businessHours?: BusinessHour[];
  menuPermissions?: Record<string, boolean>;
  customProfileId?: number | null;
  customProfile?: { id: number; name: string } | null;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  profile: string;
  phone: string;
  blockWavoip: boolean;
  restrictedUser: string;
  sipEnabled: boolean;
  sipUsername: string;
  sipPassword: string;
  sipServer: string;
  sipDomain: string;
  sipPort: number;
  sipTransport: "wss" | "ws" | "udp";
  menuPermissions: Record<string, boolean>;
  businessHours: BusinessHour[];
  supervisorViewDept: boolean;
  customProfileId: number | null;
}

const EMPTY_FORM: FormState = {
  name: "", email: "", password: "", profile: "user", phone: "",
  blockWavoip: false, restrictedUser: "disabled",
  sipEnabled: false, sipUsername: "", sipPassword: "", sipServer: "", sipDomain: "", sipPort: 8089, sipTransport: "wss",
  menuPermissions: { ...DEFAULT_MENU },
  businessHours: getDefaultBusinessHours(),
  supervisorViewDept: false,
  customProfileId: null,
};

const CHANNEL_GROUP: Record<string, string> = {
  waba: "meta", instagram: "meta", messenger: "meta",
  baileys: "unofficial", zapo: "unofficial", whatsapp: "unofficial", evo: "unofficial",
  meow: "unofficial", zapi: "unofficial", uazapi: "unofficial",
};

function getChannelGroup(type?: string) {
  if (!type) return "outros";
  return CHANNEL_GROUP[type] ?? "outros";
}

export default function UsuariosPage() {
  const t = useTranslations("usuariosPage");
  const tSessoes = useTranslations("sessoesPage");
  const tBh = useTranslations("businessHoursEditor");
  const tSidebar = useTranslations("layoutSidebar");
  const tCommon = useTranslations("common");
  const tUnsaved = useTranslations("flowBuilderNodeForm");
  const allowed = usePageAccess("usuarios", { adminSuperOnly: true });

  // ── Label maps (inside component so t() is available) ──────────────────
  const menuLabelMap: Record<string, string> = {
    "massa": t("menuMassa"),
    "grupo": t("menuGrupo"),
    "chat-privado": t("menuChatPrivado"),
    "kanban": t("menuKanban"),
    "funil": tSidebar("item.funil"),
    "tarefas": t("menuTarefas"),
    "agenda": tSidebar("item.agenda"),
    "sessoes": t("menuSessoes"),
    "relatorios": t("menuRelatorios"),
    "filas": t("menuFilas"),
    "equipes": t("menuEquipes"),
    "mensagens-rapidas": t("menuMensagensRapidas"),
    "chat-flow": t("menuChatFlow"),
    "agendamentos": t("menuAgendamentos"),
    "aniversarios": t("menuAniversarios"),
    "fechamento": t("menuFechamento"),
    "etiquetas": t("menuEtiquetas"),
    "notas": t("menuNotas"),
    "protocolos": t("menuProtocolos"),
    "avaliacoes": t("menuAvaliacoes"),
    "horarioAtendimento": t("menuHorarioAtendimento"),
    "campanhas": t("menuCampanhas"),
    "email-marketing": tSidebar("item.emailMarketing"),
    "contatos": t("menuContatos"),
    "google-calendar": t("menuGoogleCalendar"),
    "agendamento-publico": tSidebar("item.agendamentoPublico"),
    "painel-atendimentos": tSidebar("item.painelAtendimentos"),
  };

  const ALL_MENU_PERMISSIONS = ALL_MENU_PERMISSION_KEYS.map((key) => ({
    key,
    label: menuLabelMap[key] ?? key,
  }));

  const profileMap: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    admin: { label: t("profileAdmin"), icon: ShieldCheck, variant: "default" },
    super: { label: t("profileSuper"), icon: Shield, variant: "outline" },
    user: { label: t("profileUser"), icon: User, variant: "secondary" },
    custom: { label: t("profileCustom"), icon: UserCog, variant: "outline" },
  };

  function getMenuPermsForProfile(profile: string) {
    if (profile === "user") return ALL_MENU_PERMISSIONS.filter((p) => USER_ONLY_PERMS.includes(p.key));
    return ALL_MENU_PERMISSIONS;
  }

  const { user: loggedUser, patchUser, getConfigValue } = useAuthStore();
  // supervisorAdmin === "enabled" => o `super` é LIMITADO (não age como admin no produto).
  // Quando !== "enabled", o super é "admin-like" e gere a equipe dele. Helper do auth-store.
  const isSupervisorAdminLimited = useAuthStore((s) => s.isSupervisorAdmin());
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());

  // Modo de senha do tenant (manual | forceChange | invite) — /configuracoes/geral.
  // invite: o campo senha some na criação e o usuário define a própria via e-mail.
  const passwordMode = (getConfigValue("userCreationPasswordMode") as string) || "manual";

  const [users, setUsers] = useState<ExtUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExtUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savingQueues, setSavingQueues] = useState(false);
  const [savingWhatsapps, setSavingWhatsapps] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [togglingOnlineId, setTogglingOnlineId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ExtUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; customProfileId?: string }>({});
  // Snapshot do form no momento da abertura do dialog (dirty-guard)
  const dialogSnapshotRef = useRef<string>("");

  // collapsibles
  const [menuOpen, setMenuOpen] = useState(false);
  const [sipOpen, setSipOpen] = useState(false);
  const [bhOpen, setBhOpen] = useState(false);

  // queues/whatsapps modals
  const [queuesModalUser, setQueuesModalUser] = useState<ExtUser | null>(null);
  const [whatsappsModalUser, setWhatsappsModalUser] = useState<ExtUser | null>(null);
  const [allQueues, setAllQueues] = useState<{ id: number; name: string; color: string; isActive?: boolean }[]>([]);
  const [allWhatsapps, setAllWhatsapps] = useState<{ id: number; name: string; type?: string }[]>([]);
  const [selectedQueues, setSelectedQueues] = useState<number[]>([]);
  const [selectedWhatsapps, setSelectedWhatsapps] = useState<number[]>([]);

  // Custom profiles (RBAC templates)
  const [customProfiles, setCustomProfiles] = useState<CustomProfileItem[]>([]);
  const customProfileEnabled = loggedUser?.customProfileEnabled === true;

  // Auto-edição: ninguém muda o próprio perfil/permissões (o backend recusa). Como o
  // form reenviava esses campos a cada salvamento, editar o próprio nome dava erro.
  // Aqui eles viram somente-leitura e ficam fora do payload.
  const isSelfEdit = !!editing && !!loggedUser && editing.id === loggedUser.userId;

  // Espelho EXATO de `canManageUsers`/`canManageOthers` do backend
  // (UserControllerZPRO `store`/`update`/`resendInvite`): admin/super/superadmin, ou
  // `custom` cuja permissão granular `users_manage` esteja ligada. Não checa
  // `customProfileEnabled` porque o backend também não checa nessa expressão — e o gate
  // da página (usePageAccess) já barra `custom` sem a flag antes de chegar aqui.
  // Necessário porque o guard de rota lê `menuPermissions`, não `customPermissions`:
  // um `custom` com a chave de menu `usuarios` alcança a tela SEM ser gestor.
  const canManageUsers =
    ["admin", "super", "superadmin"].includes(loggedUser?.profile ?? "") ||
    (loggedUser?.profile === "custom" &&
      loggedUser?.customProfile?.customPermissions?.users_manage === true);

  // `canManageOwnAccessScope` do backend (UserControllerZPRO.update): gestão MENOS o
  // `super`. Ele fica de fora mesmo sendo gestor, de propósito: a restrição de
  // departamento do supervisor é calculada a partir das FILAS DELE, então deixá-lo
  // reescrever o próprio escopo é deixá-lo desligar a própria restrição — o mesmo vetor
  // já fechado no toggle de `supervisorViewDept`.
  const canManageOwnAccessScope = canManageUsers && loggedUser?.profile !== "super";

  // Auto-edição SEM gestão do próprio escopo => o backend DESCARTA em silêncio os campos
  // de `SELF_PROTECTED_USER_FIELDS_ZPRO` (queues, whatsappAllowed, businessHours,
  // password, email, restrictedUser, blockWavoip e os 6 de SIP): o PUT volta 200, a tela
  // dava toast de sucesso e o valor antigo reaparecia no reload — sucesso falso. Abaixo
  // esses controles somem/desabilitam e os campos ficam fora do payload.
  const selfEditStripsManagedFields = isSelfEdit && !canManageOwnAccessScope;

  // "Visualização por Departamento" é restrição que a GESTÃO impõe ao supervisor — e o backend
  // trata `supervisorViewDept` como chave de privilégio em PUT /users/:id/configs. Regra:
  //   - admin/superadmin: alteram de qualquer usuário, inclusive de si mesmos;
  //   - super admin-like (tenant com supervisorAdmin !== "enabled"): altera de OUTRO usuário,
  //     NUNCA de si mesmo — o backend recusa a auto-edição justamente para o supervisor não
  //     conseguir desligar a própria restrição de departamento (era o furo que o gate fechou);
  //   - demais perfis: nunca.
  // Derivado junto de `editing`/`isSelfEdit` (e não uma vez no mount) porque a resposta muda
  // conforme QUEM está sendo editado — um valor fixo decidiria pelo usuário do diálogo anterior.
  const canEditSupervisorViewDept =
    loggedUser?.profile === "admin" ||
    loggedUser?.profile === "superadmin" ||
    (loggedUser?.profile === "super" && !isSupervisorAdminLimited && !isSelfEdit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchAllUsers();
      setUsers((data?.users || []) as ExtUser[]);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // Load custom profiles (RBAC) — só se feature habilitada no tenant
  useEffect(() => {
    if (!customProfileEnabled) return;
    fetchCustomProfiles()
      .then(setCustomProfiles)
      .catch(() => { /* silencioso */ });
  }, [customProfileEnabled]);

  // Dispatch users status to sidebar badge
  useEffect(() => {
    const active = users.filter(u => u.profile !== "superadmin" && !u.inactive);
    const online = active.filter(u => u.isOnline).length;
    window.dispatchEvent(new CustomEvent("usersStatusUpdate", {
      detail: { online, total: active.length }
    }));
  }, [users]);

  // Captura snapshot do form quando o dialog abre (usado no dirty-guard de fechamento)
  useEffect(() => {
    if (dialogOpen) dialogSnapshotRef.current = JSON.stringify(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable<ExtUser>(users, "name");

  const filtered = sortedData.filter((u) =>
    u.profile !== "superadmin" && (
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, businessHours: getDefaultBusinessHours(), menuPermissions: { ...DEFAULT_MENU } });
    setMenuOpen(false); setSipOpen(false); setBhOpen(true);
    setEmailError(null);
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(u: ExtUser) {
    setEditing(u);
    const rawMenu = u.menuPermissions;
    // Usuário salvo antes da chave "agenda" existir teve o acesso ao Agenda regido
    // por "kanban" — herdar esse valor preserva o acesso efetivo atual; o default
    // `true` do spread concederia Agenda a quem tem Kanban desmarcado.
    const menu = (rawMenu && typeof rawMenu === "object" && !Array.isArray(rawMenu))
      ? { ...DEFAULT_MENU, agenda: rawMenu.kanban === true, ...rawMenu }
      : { ...DEFAULT_MENU };
    const uConfigs = (u as { configs?: { supervisorViewDept?: string } }).configs;
    setForm({
      name: u.name, email: u.email, password: "", profile: u.profile,
      phone: u.phone || "",
      blockWavoip: u.blockWavoip ?? false,
      restrictedUser: (u.restrictedUser === true || u.restrictedUser === "enabled") ? "enabled" : "disabled",
      sipEnabled: u.sipEnabled ?? false,
      sipUsername: u.sipUsername ?? "",
      sipPassword: u.sipPassword ?? "",
      sipServer: u.sipServer ?? "",
      sipDomain: u.sipDomain ?? "",
      sipPort: u.sipPort ?? 8089,
      sipTransport: (["wss", "ws", "udp"].includes(u.sipTransport ?? "") ? (u.sipTransport as "wss" | "ws" | "udp") : "wss"),
      menuPermissions: menu,
      businessHours: Array.isArray(u.businessHours) && u.businessHours.length > 0
        ? u.businessHours : getDefaultBusinessHours(),
      supervisorViewDept: uConfigs?.supervisorViewDept === "enabled",
      customProfileId: (u as { customProfileId?: number | null }).customProfileId ?? null,
    });
    setMenuOpen(false); setSipOpen(false);
    setBhOpen(Array.isArray(u.businessHours) && u.businessHours.length > 0);
    setEmailError(null);
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSave() {
    // Validação inline: marca campos inválidos (borda + mensagem) e foca o primeiro;
    // toast permanece como reforço. Regras inalteradas.
    const errs: { name?: string; email?: string; password?: string; customProfileId?: string } = {};
    if (!form.name.trim()) errs.name = t("errorNameRequired");
    if (!form.email.trim()) errs.email = t("errorEmailRequired");
    if (!editing && !form.password && passwordMode !== "invite") errs.password = t("errorPasswordRequired");
    if (!isSelfEdit && form.profile === "custom" && !form.customProfileId) errs.customProfileId = t("errorCustomProfileRequired");
    setFieldErrors(errs);
    const firstInvalid = (["name", "email", "password", "customProfileId"] as const).find((k) => errs[k]);
    if (firstInvalid) {
      toast.error(errs[firstInvalid] as string);
      const el = document.getElementById(`usuario-field-${firstInvalid}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
      return;
    }
    // Horário de Atendimento só é validado quando ele de fato viaja no payload: na
    // auto-edição sem gestão o editor nem é renderizado (o backend descarta o campo), e
    // validar um valor invisível prenderia o usuário fora de mudar o próprio nome.
    if (!selfEditStripsManagedFields) {
      const bhError = validateBusinessHours(form.businessHours);
      if (bhError === "empty") { toast.error(tBh("validationEmptyTime")); return; }
      if (bhError) { toast.error(tBh("validationFixBeforeSave")); return; }
    }
    setSaving(true);
    try {
      // Só nome/telefone (e foto, por rota própria) são dados que o dono da conta mantém.
      const payload: Record<string, unknown> = {
        name: form.name,
        phone: form.phone || "",
      };
      // Campos que a GESTÃO decide SOBRE a conta. Na auto-edição sem gestão do próprio
      // escopo o backend os remove do body (SELF_PROTECTED_USER_FIELDS_ZPRO), então
      // enviá-los só produziria o sucesso falso que este gate espelha.
      if (!selfEditStripsManagedFields) {
        payload.email = form.email;
        payload.blockWavoip = form.blockWavoip;
        payload.restrictedUser = form.restrictedUser;
        payload.sipEnabled = form.sipEnabled;
        payload.sipUsername = form.sipUsername;
        payload.sipPassword = form.sipPassword;
        payload.sipServer = form.sipServer;
        payload.sipDomain = form.sipDomain.trim();
        payload.sipPort = form.sipPort;
        payload.sipTransport = form.sipTransport;
        payload.businessHours = form.businessHours;
      }
      if (!isSelfEdit) {
        payload.profile = form.profile;
        payload.menuPermissions = form.menuPermissions;
        // RBAC: custom exige customProfileId (validado inline acima); demais perfis zeram
        payload.customProfileId = form.profile === "custom" ? form.customProfileId : null;
      }
      // `password` também está na lista de descarte da auto-edição sem gestão — o caminho
      // legítimo é PUT /users/change-password (tela /trocar-senha), que exige a senha atual.
      if (form.password && !selfEditStripsManagedFields) payload.password = form.password;
      if (editing) {
        await updateUser(editing.id, payload);
        // Gate espelhado do backend (admin/superadmin sempre; super admin-like só em OUTRO
        // usuário, nunca em si mesmo — senão desligaria a própria restrição de departamento).
        // Sem este guard o salvamento tomava 403 aqui, depois do updateUser já ter gravado —
        // erro na tela com a edição parcialmente aplicada. Quando o gate fecha, `configs` não
        // é tocado: `updateUser` não envia essa chave, então o valor gravado permanece.
        if (form.profile === "super" && canEditSupervisorViewDept) {
          await updateUserConfigs(editing.id, {
            supervisorViewDept: form.supervisorViewDept ? "enabled" : "disabled",
          });
        }
        // Atualiza store imediatamente se for o próprio usuário logado
        // (menuPermissions fica de fora: na auto-edição ele nem é enviado).
        // `selfEditStripsManagedFields` corta o patch porque esses dois campos não foram
        // enviados nesse caso — espelhá-los no store faria o app inteiro passar a operar
        // com um valor que o servidor não gravou.
        if (loggedUser && editing.id === loggedUser.userId && !selfEditStripsManagedFields) {
          patchUser({
            restrictedUser: form.restrictedUser,
            blockWavoip: form.blockWavoip,
          });
        }
        toast.success(t("userUpdated"));
      } else {
        const maxAttempts = 3;
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await createUser(payload);
            toast.success(t("userCreated"));
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            const errData =
              (err as { response?: { data?: { error?: string } } })?.response?.data ??
              (err as { data?: { error?: string } })?.data;
            const errMsg = (errData?.error ?? "").toString();
            // O backend responde ERR_NO_PERMISSION_USER_LIMIT; o nome antigo fica aceito.
            if (errMsg === "ERR_NO_PERMISSION_USER_LIMIT" || errMsg === "ERR_USER_LIMIT_USER_CREATION") {
              toast.error(t("userLimitReached"));
              setSaving(false);
              return;
            }
            // Modo convite sem SMTP configurado = erro TERMINAL (retry não resolve)
            if (errMsg === "ERR_INVITE_REQUIRES_SMTP") {
              toast.error(t("inviteRequiresSmtp"));
              setSaving(false);
              return;
            }
            // E-mail duplicado / validação = erro TERMINAL (retry não resolve)
            const isDuplicateEmail =
              errMsg.includes("SequelizeUniqueConstraintError") ||
              errMsg.includes("Validation error") ||
              errMsg.includes("já cadastrado");
            if (isDuplicateEmail) {
              setEmailError(t("emailAlreadyExists"));
              toast.error(t("emailAlreadyExists"));
              setSaving(false);
              return;
            }
            const isRetryable = errMsg.includes("Internal server error");
            if (isRetryable && attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
            break;
          }
        }
        if (lastError) throw lastError;
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdating") : t("errorCreating"));
    } finally {
      setSaving(false);
    }
  }

  async function handleResendInvite() {
    if (!editing || resendingInvite) return;
    setResendingInvite(true);
    try {
      await resendUserInvite(editing.id);
      toast.success(t("resendInviteSuccess"));
    } catch (err) {
      const code =
        ((err as { data?: { error?: string } })?.data?.error ?? "").toString();
      if (code === "ERR_INVITE_REQUIRES_SMTP") {
        toast.error(t("inviteRequiresSmtp"));
      } else {
        toast.error(t("resendInviteError"));
      }
    } finally {
      setResendingInvite(false);
    }
  }

  async function handleDelete() {
    if (!deleting || deletingUser) return;
    setDeletingUser(true);
    try {
      await deleteUser(deleting.id);
      toast.success(t("userRemoved"));
      setDeleting(null);
      load();
    } catch (err) {
      // O backend responde 409 quando o usuario tem registros vinculados que impedem
      // a remocao. Nesse caso o payload vem em `message` (nao em `error`).
      const errData =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data ??
        (err as { data?: { error?: string; message?: string } })?.data;
      const code = (errData?.error ?? errData?.message ?? "").toString();
      toast.error(
        code === "ERR_USER_HAS_LINKED_RECORDS"
          ? t("errorRemovingLinkedRecords")
          : t("errorRemoving")
      );
    }
    finally { setDeletingUser(false); }
  }

  async function handleToggleActive(u: ExtUser) {
    setTogglingId(u.id);
    try {
      if (u.inactive) {
        await reactivateUser(u.id);
        toast.success(t("userReactivated"));
      } else {
        await inactivateUser(u.id);
        toast.success(t("userDeactivated"));
      }
      await load();
    } catch (err) {
      const code = ((err as { data?: { error?: string } })?.data?.error ?? "").toString();
      toast.error(code === "ERR_NO_PERMISSION_USER_LIMIT" ? t("userLimitReached") : t("errorToggleStatus"));
    }
    finally { setTogglingId(null); }
  }

  async function handleToggleOnline(u: ExtUser) {
    setTogglingOnlineId(u.id);
    try {
      await updateUserIsOnline(u.id, !u.isOnline);
      toast.success(!u.isOnline ? t("userOnline") : t("userOffline"));
      await load();
    } catch { toast.error(t("errorToggleOnline")); }
    finally { setTogglingOnlineId(null); }
  }

  const openQueuesModal = async (u: ExtUser) => {
    setQueuesModalUser(u);
    setSelectedQueues((u as { queues?: { id: number }[] }).queues?.map((q) => q.id) || []);
    // Re-semeia dos dados FRESCOS do usuário: a lista da página pode estar defasada
    // (outro admin/aba mexeu depois do load). Salvar com seed velho re-associa
    // silenciosamente o que foi removido (o backend faz destroy+create com a lista
    // enviada). Se o GET falhar (ex.: OUT_RANGE fora do horário), mantém o seed da lista.
    try {
      const { data: fresh } = await fetchUser(u.id);
      const freshQueues = (fresh as { queues?: { id: number }[] } | null)?.queues;
      if (Array.isArray(freshQueues)) setSelectedQueues(freshQueues.map((q) => q.id));
    } catch { /* mantém seed da lista */ }
    try {
      const { data } = await fetchQueues();
      setAllQueues(Array.isArray(data) ? data : (data as { queues?: typeof allQueues })?.queues || []);
    } catch { /* empty */ }
  };

  const saveQueues = async () => {
    if (!queuesModalUser) return;
    setSavingQueues(true);
    try {
      await updateUser(queuesModalUser.id, { queues: selectedQueues } as Record<string, unknown>);
      toast.success(t("queuesUpdated"));
      setQueuesModalUser(null); load();
    } catch { toast.error(t("errorUpdatingQueues")); }
    finally { setSavingQueues(false); }
  };

  const openWhatsappsModal = async (u: ExtUser) => {
    setWhatsappsModalUser(u);
    setSelectedWhatsapps((u as { whatsappAllowed?: { id: number }[] }).whatsappAllowed?.map((w) => w.id) || []);
    // Mesmo racional do openQueuesModal: seed fresco evita re-associar canal removido
    // por outro admin/aba ao salvar (destroy+create no backend usa a lista enviada).
    try {
      const { data: fresh } = await fetchUser(u.id);
      const freshAllowed = (fresh as { whatsappAllowed?: { id: number }[] } | null)?.whatsappAllowed;
      if (Array.isArray(freshAllowed)) setSelectedWhatsapps(freshAllowed.map((w) => w.id));
    } catch { /* mantém seed da lista */ }
    try {
      const { data } = await fetchWhatsapps();
      setAllWhatsapps(Array.isArray(data) ? data : []);
    } catch { /* empty */ }
  };

  const saveWhatsapps = async () => {
    if (!whatsappsModalUser) return;
    setSavingWhatsapps(true);
    try {
      await updateUser(whatsappsModalUser.id, { whatsappAllowed: selectedWhatsapps } as Record<string, unknown>);
      toast.success(t("connectionsUpdated"));
      setWhatsappsModalUser(null); load();
    } catch { toast.error(t("errorUpdatingConnections")); }
    finally { setSavingWhatsapps(false); }
  };

  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  const visibleMenuPerms = getMenuPermsForProfile(form.profile);
  // Com o WaVoIP desligado no tenant não existe o que bloquear por usuário — o
  // checkbox some (o valor já gravado é preservado; religar o recurso o traz de volta).
  const showBlockWavoip = wavoipEnabled && ["user", "super"].includes(form.profile);

  // ── Select de perfil: hierarquia espelhada do backend ────────────────────────
  // Ninguém enxerga degrau ACIMA do próprio (o `store` responde 403 — ver
  // PROFILE_RANK_ZPRO). admin/superadmin continuam vendo tudo que já viam; `super` vê
  // Atendente/Supervisor (+Personalizado); `custom` com gestão vê Atendente
  // (+Personalizado), porque `custom` empata com `user` no degrau 0 e criar `super`
  // também tomaria 403. Ordem de exibição preservada.
  const actorProfileRank = getProfileRank(loggedUser?.profile);
  const allowedProfileKeys = ["user", "super", "admin", "custom"].filter((key) => {
    if (key === "custom" && !customProfileEnabled) return false; // regra que já existia
    return getProfileRank(key) <= actorProfileRank;
  });
  // O valor ATUAL sempre precisa de um item correspondente: sem ele o Select renderiza o
  // trigger vazio (o editado parece "sem perfil") e o filtro viraria armadilha — bastaria
  // o gestor tocar no campo para rebaixar alguém sem querer. O item extra é só exibição.
  const profileSelectKeys =
    allowedProfileKeys.includes(form.profile) || !(form.profile in profileMap)
      ? allowedProfileKeys
      : [...allowedProfileKeys, form.profile];
  // Trava a TROCA (não só a opção) quando o alvo já está acima do ator: rebaixar quem
  // está num degrau superior ao seu também não é decisão dele. Nunca dispara para
  // admin/superadmin — a lista da tela já exclui `superadmin`, então não existe alvo
  // acima deles. O caso "custom com a feature do tenant desligada" NÃO trava: ali o
  // valor só está fora da lista por causa da feature, e o admin segue podendo trocar.
  const profileSelectDisabled = isSelfEdit || getProfileRank(form.profile) > actorProfileRank;

  // Dirty-guard: fechar o dialog (Esc, clique-fora, X ou Cancelar) com alterações
  // não salvas pede confirmação. Salvar fecha direto (setDialogOpen(false) no handleSave).
  const isUserFormDirty = () => JSON.stringify(form) !== dialogSnapshotRef.current;
  const attemptCloseUserDialog = () => {
    if (saving) return;
    if (isUserFormDirty() && !window.confirm(tUnsaved("unsavedChangesDesc"))) return;
    setDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}>
        {customProfileEnabled && (
          <Link href="/usuarios/perfis">
            <Button size="sm" variant="outline">
              <Shield className="mr-2 h-4 w-4" /> {t("manageCustomProfiles")}
            </Button>
          </Link>
        )}
        <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newUser")}</Button>
      </PageHeader>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="pl-9" type="search" name="usuarios-search" autoComplete="off" />
        </div>
        <TableDensityToggle density={density} onChange={updateDensity} />
      </div>

      {loading ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead className="w-16">{t("colId")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colPhone")}</TableHead>
                <TableHead>{t("colProfile")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="w-28">{t("colActions")}</TableHead>
                <TableHead>{t("colLastLogin")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i}>
                  {/* Avatar */}
                  <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  {/* ID */}
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  {/* Name */}
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  {/* Email */}
                  <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                  {/* Phone */}
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  {/* Profile badge */}
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  {/* Status badge */}
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  {/* Action buttons */}
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </TableCell>
                  {/* Last login */}
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[
            { number: 1, title: t("emptyStep1") },
            { number: 2, title: t("emptyStep2") },
            { number: 3, title: t("emptyStep3") },
          ]}
        >
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newUser")}</Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                <SortableTableHead sortKey="email" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colEmail")}</SortableTableHead>
                <TableHead>{t("colPhone")}</TableHead>
                <SortableTableHead sortKey="profile" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colProfile")}</SortableTableHead>
                <TableHead>{t("colQueues")}</TableHead>
                <TableHead>{t("colChannels")}</TableHead>
                <SortableTableHead sortKey="inactive" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                <TableHead>{t("colOnline")}</TableHead>
                <TableHead className="w-28">{t("colActions")}</TableHead>
                <SortableTableHead sortKey="lastLogin" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colLastLogin")}</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const p = profileMap[u.profile] ?? profileMap.user;
                const customName = u.profile === "custom"
                  ? (u.customProfile?.name ?? customProfiles.find((cp) => cp.id === u.customProfileId)?.name ?? null)
                  : null;
                // Auto-edição no contexto da LINHA (o alvo é o usuário desta linha, não o do
                // diálogo de edição) — por isso é derivado aqui dentro do map, e não no mount:
                // um valor fixo decidiria pela pessoa errada em todas as outras linhas.
                const isSelfRow = !!loggedUser && u.id === loggedUser.userId;
                // Filas e Conexões somem quando um `super` é o alvo de si mesmo. O backend
                // DESCARTA `queues` e `whatsappAllowed` nesse caso (o supervisor não tem
                // permissão de gestão sobre si), e o descarte é silencioso: o PUT volta 200, a
                // tela dá toast de sucesso e os valores antigos reaparecem no reload — sucesso
                // falso. O motivo do descarte é o mesmo vetor já fechado no toggle de
                // departamento, só que pela porta das filas: zerando as próprias filas, o gate
                // `supervisorViewDept` cai em skip e devolve ao supervisor o tenant inteiro.
                // Admin/superadmin (e custom com gestão de usuários) seguem vendo os dois
                // botões, inclusive sobre si mesmos; e o `super` continua gerindo filas e
                // canais da EQUIPE dele — só a própria linha perde os gatilhos. Diferente do
                // gate de departamento acima, aqui o backend exclui o `super` seja ele
                // admin-like ou não, então esta condição NÃO olha `isSupervisorAdminLimited`.
                // O fator `canManageUsers` fecha a outra ponta: o guard de rota da página lê
                // `menuPermissions`, não `customPermissions`, então um `custom` com a chave de
                // menu `usuarios` chega aqui SEM `users_manage` — e via os dois botões com o
                // mesmo sucesso falso (em terceiro o PUT nem passa do gate `canManageOthers`;
                // em si mesmo `queues`/`whatsappAllowed` são descartados por ele não ser
                // gestor). A expressão inteira é o espelho de `isSelfRow ?
                // canManageOwnAccessScope : canManageOthers` do UserControllerZPRO.update.
                const canEditRowQueuesAndChannels =
                  canManageUsers && !(loggedUser?.profile === "super" && isSelfRow);
                return (
                  <TableRow key={u.id} className={rowClassName}>
                    <TableCell className={cellClassName}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.profilePicture || ""} alt={u.name} />
                        <AvatarFallback className="text-xs">{getInitials(u.name)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className={cn("text-sm tabular-nums text-muted-foreground", cellClassName)}>{u.id}</TableCell>
                    <TableCell className={cn("font-medium", cellClassName)}>{u.name}</TableCell>
                    <TableCell className={cn("text-sm", cellClassName)}>{u.email}</TableCell>
                    <TableCell className={cn("text-sm", cellClassName)}>
                      {u.phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{u.phone}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={cellClassName}><Badge variant={p.variant}><p.icon className="mr-1 h-3 w-3" />{customName ?? p.label}</Badge></TableCell>
                    <TableCell className={cellClassName}>
                      {(() => {
                        const userQueues = (u.queues || []) as { id: number; name?: string; queue?: string; color?: string }[];
                        if (userQueues.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border bg-muted/40 hover:bg-muted transition-colors"
                                title={t("colQueues")}
                              >
                                <GitBranch className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium tabular-nums">{userQueues.length}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" className="w-64 p-2">
                              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1.5 border-b mb-1.5">
                                {t("colQueues")} ({userQueues.length})
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
                                {userQueues.map((q) => (
                                  <span
                                    key={q.id}
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium border bg-muted"
                                  >
                                    {q.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: q.color }} />}
                                    <span>{q.name || q.queue || `#${q.id}`}</span>
                                  </span>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </TableCell>
                    <TableCell className={cellClassName}>
                      {(() => {
                        const userWpps = (
                          (u as { whatsappAllowed?: { id: number; name?: string }[] }).whatsappAllowed
                          ?? (u.whatsapps as { id: number; name?: string }[] | undefined)
                          ?? []
                        );
                        if (userWpps.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border bg-muted/40 hover:bg-muted transition-colors"
                                title={t("colChannels")}
                              >
                                <Smartphone className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium tabular-nums">{userWpps.length}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" className="w-64 p-2">
                              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1.5 border-b mb-1.5">
                                {t("colChannels")} ({userWpps.length})
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
                                {userWpps.map((w) => (
                                  <span
                                    key={w.id}
                                    className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium border bg-muted"
                                  >
                                    <span>{w.name || `#${w.id}`}</span>
                                  </span>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </TableCell>
                    <TableCell className={cellClassName}>
                      <Badge variant={u.inactive ? "secondary" : "success"}>{u.inactive ? t("statusInactive") : t("statusActive")}</Badge>
                    </TableCell>
                    <TableCell className={cellClassName}>
                      {loggedUser && u.id === loggedUser.userId ? (
                        <span title={t("changeOnlineInToolbar")}>
                          <Badge variant={u.isOnline ? "success" : "secondary"} className="cursor-default">
                            {u.isOnline ? t("statusOnline") : t("statusOffline")}
                          </Badge>
                        </span>
                      ) : (
                        <Switch
                          checked={!!u.isOnline}
                          disabled={togglingOnlineId === u.id}
                          onCheckedChange={() => handleToggleOnline(u)}
                          aria-label={t("colOnline")}
                        />
                      )}
                    </TableCell>
                    <TableCell className={cellClassName}>
                      <div className="flex gap-0.5">
                        {canEditRowQueuesAndChannels && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={t("titleQueues")} onClick={() => openQueuesModal(u)}><GitBranch className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={t("titleConnections")} onClick={() => openWhatsappsModal(u)}><Smartphone className="h-3 w-3" /></Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={tCommon("edit")} aria-label={tCommon("edit")} onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={!u.inactive ? t("titleDeactivate") : t("titleReactivate")} onClick={() => handleToggleActive(u)} disabled={togglingId === u.id}>
                          {togglingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : !u.inactive ? <UserX className="h-3 w-3 text-orange-500" /> : <UserCheck className="h-3 w-3 text-emerald-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={tCommon("delete")} aria-label={tCommon("delete")} onClick={() => setDeleting(u)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-sm tabular-nums whitespace-nowrap", cellClassName)}>
                      {u.lastLogin
                        ? formatDateTime(u.lastLogin, { dateStyle: "short", timeStyle: "short" })
                        : <span className="text-muted-foreground text-xs">{t("lastLoginNever")}</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Dialog: Criar / Editar ── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (v) setDialogOpen(true); else attemptCloseUserDialog(); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            {editing?.inactive && (
              <DialogDescription className="text-orange-500">{t("dialogInactiveWarning")}</DialogDescription>
            )}
          </DialogHeader>

          <form onSubmit={(e) => { e.preventDefault(); if (!saving && !editing?.inactive) handleSave(); }}>
          <div className="space-y-5 py-2">
            {/* Dados Básicos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("labelName")}</Label>
                <Input
                  id="usuario-field-name"
                  value={form.name}
                  aria-invalid={!!fieldErrors.name}
                  className={fieldErrors.name ? "border-destructive focus-visible:ring-destructive" : undefined}
                  onChange={(e) => { setF("name", e.target.value); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined })); }}
                />
                {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelEmail")}</Label>
                {/* E-mail é identidade de login E destino do reset de senha: na auto-edição
                    sem gestão o backend descarta o campo, então aqui ele é só leitura. */}
                <Input
                  id="usuario-field-email"
                  type="email"
                  value={form.email}
                  disabled={selfEditStripsManagedFields}
                  aria-invalid={!!(fieldErrors.email || emailError)}
                  className={(fieldErrors.email || emailError) ? "border-destructive focus-visible:ring-destructive" : undefined}
                  onChange={(e) => {
                    setF("email", e.target.value);
                    if (emailError) setEmailError(null);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                />
                {(fieldErrors.email || emailError) && <p className="text-xs text-destructive">{fieldErrors.email || emailError}</p>}
              </div>
              {/* Senha: sai da tela na auto-edição sem gestão. Por aqui a troca aconteceria
                  SEM exigir a senha atual, por isso o backend descarta o campo; o caminho
                  legítimo é /trocar-senha (PUT /users/change-password). Um input desabilitado
                  seria só um controle morto — some. (O ramo de convite abaixo só existe na
                  CRIAÇÃO, onde não há auto-edição.) */}
              {!selfEditStripsManagedFields && (passwordMode === "invite" && !editing ? (
                <div className="space-y-1.5">
                  <Label>{t("labelPasswordCreate")}</Label>
                  <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2.5">
                    {t("inviteModeNote")}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>{editing ? t("labelPasswordNew") : t("labelPasswordCreate")}</Label>
                  <Input
                    id="usuario-field-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    aria-invalid={!!fieldErrors.password}
                    className={fieldErrors.password ? "border-destructive focus-visible:ring-destructive" : undefined}
                    onChange={(e) => { setF("password", e.target.value); if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined })); }}
                  />
                  {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                  {passwordMode === "forceChange" && (
                    <p className="text-xs text-muted-foreground">{t("forceChangeModeNote")}</p>
                  )}
                </div>
              ))}
              {passwordMode === "invite" && editing && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendingInvite}
                    onClick={handleResendInvite}
                  >
                    {resendingInvite ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    {t("resendInviteButton")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("resendInviteNote")}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("labelPhone")}</Label>
                <PhoneInput value={form.phone} onChange={(v) => setF("phone", v)} placeholder={t("phonePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("labelProfile")}</Label>
                <Select value={form.profile} onValueChange={(v) => setF("profile", v)} disabled={profileSelectDisabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Opções filtradas por hierarquia (rótulos do profileMap, sem texto novo) */}
                    {profileSelectKeys.map((key) => (
                      <SelectItem key={key} value={key}>{profileMap[key].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSelfEdit && (
                  <p className="text-xs text-muted-foreground">{t("selfEditLockedNote")}</p>
                )}
              </div>
              {form.profile === "custom" && customProfileEnabled && (
                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>{t("labelCustomProfile")}</Label>
                    <Link href="/usuarios/perfis" className="text-xs text-primary hover:underline">
                      {t("manageProfilesLink")}
                    </Link>
                  </div>
                  <Select
                    value={form.customProfileId ? String(form.customProfileId) : ""}
                    disabled={isSelfEdit}
                    onValueChange={(v) => {
                      setF("customProfileId", v ? Number(v) : null);
                      if (fieldErrors.customProfileId) setFieldErrors((p) => ({ ...p, customProfileId: undefined }));
                    }}
                  >
                    <SelectTrigger
                      id="usuario-field-customProfileId"
                      aria-invalid={!!fieldErrors.customProfileId}
                      className={fieldErrors.customProfileId ? "border-destructive focus-visible:ring-destructive" : undefined}
                    >
                      <SelectValue placeholder={t("selectProfilePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {customProfiles.length === 0 && (
                        <SelectItem value="__empty__" disabled>
                          {t("noProfilesAvailable")}
                        </SelectItem>
                      )}
                      {customProfiles.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.customProfileId && <p className="text-xs text-destructive">{fieldErrors.customProfileId}</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("labelRestrictedUser")}</Label>
                {/* Máscara de contatos que o admin impõe POR USUÁRIO — o próprio restrito
                    desligava a própria restrição, então o backend descarta o campo na
                    auto-edição sem gestão. Fica visível (o usuário enxerga a restrição que
                    tem) porém travado. */}
                <Select value={form.restrictedUser} onValueChange={(v) => setF("restrictedUser", v)} disabled={selfEditStripsManagedFields}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">{t("optionDisabled")}</SelectItem>
                    <SelectItem value="enabled">{t("optionEnabled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bloquear WaVoIP — bloqueio de discagem que o admin liga POR USUÁRIO; o
                backend descarta o campo na auto-edição sem gestão. Mesmo tratamento das
                permissões de menu logo abaixo: continua visível (mostra o bloqueio que o
                usuário tem) e desabilitado. */}
            {showBlockWavoip && (
              <label className={cn(
                "flex items-center gap-2 text-sm rounded-md border p-3",
                selfEditStripsManagedFields ? "opacity-60" : "cursor-pointer"
              )}>
                <Checkbox checked={form.blockWavoip} disabled={selfEditStripsManagedFields} onCheckedChange={(v) => setF("blockWavoip", !!v)} />
                <div>
                  <p className="font-medium">{t("blockWavoipTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("blockWavoipDesc")}</p>
                </div>
              </label>
            )}

            {/* Visualização por departamento — apenas perfil super; quem altera é admin/superadmin
                ou o super admin-like editando OUTRO usuário (em si mesmo o backend recusa) */}
            {form.profile === "super" && editing && canEditSupervisorViewDept && (
              <label className="flex items-center gap-2 cursor-pointer text-sm rounded-md border p-3">
                <Checkbox checked={form.supervisorViewDept} onCheckedChange={(v) => setF("supervisorViewDept", !!v)} />
                <div>
                  <p className="font-medium">{t("supervisorViewDeptTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("supervisorViewDeptDesc")}</p>
                </div>
              </label>
            )}

            {/* Permissões de Menu */}
            <Collapsible open={menuOpen} onOpenChange={setMenuOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/50">
                <ChevronRight className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-90" : ""}`} />
                {t("menuPermissionsLabel")}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">{t("menuPainelAtendimentosHint")}</p>
                {isSelfEdit && (
                  <p className="text-xs text-muted-foreground mb-2 rounded-md border border-dashed p-2.5">
                    {t("selfEditLockedNote")}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {visibleMenuPerms.map((perm) => (
                    <label
                      key={perm.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2 text-sm",
                        isSelfEdit ? "opacity-60" : "cursor-pointer hover:bg-accent/50"
                      )}
                    >
                      <Checkbox
                        checked={!!form.menuPermissions[perm.key]}
                        disabled={isSelfEdit}
                        onCheckedChange={(v) => setF("menuPermissions", { ...form.menuPermissions, [perm.key]: !!v })}
                      />
                      {perm.label}
                    </label>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Config SIP — credenciais e apontamento do ramal, provisionados pela gestão
                (deixar o dono reescrever servidor/ramal é deixar redirecionar a telefonia
                do tenant). Os 6 campos estão na lista de descarte da auto-edição sem
                gestão, então a seção INTEIRA some: um bloco todo desabilitado — com input
                de senha dentro — seria só peso morto. */}
            {!selfEditStripsManagedFields && (
            <Collapsible open={sipOpen} onOpenChange={setSipOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/50">
                <ChevronRight className={`h-4 w-4 transition-transform ${sipOpen ? "rotate-90" : ""}`} />
                <PhoneCall className="h-4 w-4" />
                {t("sipConfigLabel")}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={form.sipEnabled} onCheckedChange={(v) => setF("sipEnabled", !!v)} />
                  {t("sipEnableLabel")}
                </label>
                <div className="space-y-1.5">
                  <Label>{t("sipTransport")}</Label>
                  <Select
                    value={form.sipTransport}
                    onValueChange={(v) => {
                      const newTransport = v as "wss" | "ws" | "udp";
                      const defaults = { udp: 5060, ws: 5066, wss: 8089 } as const;
                      const currentIsDefault = (Object.values(defaults) as number[]).includes(form.sipPort);
                      setForm((p) => ({
                        ...p,
                        sipTransport: newTransport,
                        sipPort: currentIsDefault ? defaults[newTransport] : p.sipPort,
                      }));
                    }}
                    disabled={!form.sipEnabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wss">{t("sipTransportWss")}</SelectItem>
                      <SelectItem value="ws">{t("sipTransportWs")}</SelectItem>
                      <SelectItem value="udp">{t("sipTransportUdp")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("sipTransportHelp")}</p>
                  {form.sipTransport === "udp" && (
                    <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{t("sipTransportUdpWarning")}</span>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("sipUser")}</Label>
                    <Input value={form.sipUsername} onChange={(e) => setF("sipUsername", e.target.value)} disabled={!form.sipEnabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sipPassword")}</Label>
                    <Input type="password" value={form.sipPassword} onChange={(e) => setF("sipPassword", e.target.value)} disabled={!form.sipEnabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sipServer")}</Label>
                    <Input value={form.sipServer} onChange={(e) => setF("sipServer", e.target.value)} disabled={!form.sipEnabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("sipPort")}</Label>
                    <Input type="number" value={form.sipPort} onChange={(e) => setF("sipPort", Number(e.target.value))} disabled={!form.sipEnabled} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("sipDomain")}</Label>
                    <Input value={form.sipDomain} onChange={(e) => setF("sipDomain", e.target.value)} placeholder={form.sipServer || undefined} disabled={!form.sipEnabled} />
                    <p className="text-xs text-muted-foreground">{t("sipDomainHelp")}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            )}

            {/* Horário de Atendimento — não é agenda de exibição, é GATE DE LOGIN (403
                OUT_RANGE no SessionController). Auto-editável = o usuário ampliava sozinho
                a janela em que consegue entrar, desfazendo a restrição do admin; por isso o
                backend descarta o campo. O editor não tem modo somente-leitura, e mostrá-lo
                editável seria justamente o sucesso falso — a seção some. */}
            {!selfEditStripsManagedFields && (
            <Collapsible open={bhOpen} onOpenChange={setBhOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/50">
                <ChevronRight className={`h-4 w-4 transition-transform ${bhOpen ? "rotate-90" : ""}`} />
                <Clock className="h-4 w-4" />
                {t("businessHoursLabel")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <BusinessHoursEditor value={form.businessHours} onChange={(v) => setF("businessHours", v)} />
              </CollapsibleContent>
            </Collapsible>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={attemptCloseUserDialog} disabled={saving} className="w-full sm:w-auto">{t("btnCancel")}</Button>
            <Button type="submit" disabled={saving || !!editing?.inactive} className="w-full sm:w-auto">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t("btnSaving") : t("btnSave")}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Exclusão ── */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o && !deletingUser) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">{t("deleteConfirmMsg")} <strong>{deleting?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingUser}>{t("btnCancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingUser} className="gap-1">
              {deletingUser && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("btnRemove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Filas ── */}
      <Dialog open={!!queuesModalUser} onOpenChange={(v) => { if (!savingQueues) { if (!v) setQueuesModalUser(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" />{t("queuesModalTitle")} {queuesModalUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedQueues(allQueues.map((q) => q.id))} disabled={savingQueues || !allQueues.length}>{t("selectAll")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedQueues([])} disabled={savingQueues || !selectedQueues.length}>{t("deselectAll")}</Button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto py-2">
            {allQueues.map((q) => (
              <label key={q.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer">
                <Checkbox
                  checked={selectedQueues.includes(q.id)}
                  onCheckedChange={(c) => setSelectedQueues((p) => c ? [...p, q.id] : p.filter((id) => id !== q.id))}
                />
                <span className="text-sm flex items-center gap-2">
                  {q.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: q.color }} />}
                  {q.name}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQueuesModalUser(null)} disabled={savingQueues}>{t("btnCancel")}</Button>
            <Button onClick={saveQueues} disabled={savingQueues}>
              {savingQueues && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingQueues ? t("btnSaving") : t("btnSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Conexões WhatsApp ── */}
      <Dialog open={!!whatsappsModalUser} onOpenChange={(v) => { if (!savingWhatsapps) { if (!v) setWhatsappsModalUser(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />{t("connectionsModalTitle")} {whatsappsModalUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedWhatsapps(allWhatsapps.map((w) => w.id))} disabled={savingWhatsapps || !allWhatsapps.length}>{t("selectAll")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedWhatsapps([])} disabled={savingWhatsapps || !selectedWhatsapps.length}>{t("deselectAll")}</Button>
          </div>
          <div className="space-y-3 max-h-[360px] overflow-y-auto py-2">
            {(["meta", "unofficial", "outros"] as const).map((group) => {
              const items = allWhatsapps
                .filter((w) => getChannelGroup(w.type) === group)
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
              if (!items.length) return null;
              const groupLabel =
                group === "meta"
                  ? tSessoes("channelGroupMeta")
                  : group === "unofficial"
                  ? tSessoes("channelGroupUnofficial")
                  : tSessoes("channelGroupOthers");
              return (
                <div key={group}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1">{groupLabel}</p>
                  {items.map((w) => (
                    <label key={w.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={selectedWhatsapps.includes(w.id)}
                        onCheckedChange={(c) => setSelectedWhatsapps((p) => c ? [...p, w.id] : p.filter((id) => id !== w.id))}
                      />
                      <span className="text-sm">{w.name}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsappsModalUser(null)} disabled={savingWhatsapps}>{t("btnCancel")}</Button>
            <Button onClick={saveWhatsapps} disabled={savingWhatsapps}>
              {savingWhatsapps && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingWhatsapps ? t("btnSaving") : t("btnSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
