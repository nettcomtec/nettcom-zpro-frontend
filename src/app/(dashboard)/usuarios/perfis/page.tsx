"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Sparkles, Loader2, ArrowLeft, Info, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { suggestProfile } from "@/services/copilot-profile-suggest";

import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCustomProfiles,
  createCustomProfile,
  updateCustomProfile,
  deleteCustomProfile,
  type CustomProfileItem,
} from "@/services/custom-profiles";
import {
  DEFAULT_CUSTOM_PERMISSIONS,
  PERMISSION_KEYS,
  type ICustomPermissions,
  type PermissionKey,
} from "@/types/custom-permissions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

// Grupos de menuPermissions — ordem alfabética dentro de cada grupo
const MENU_GROUPS: { id: string; keys: string[] }[] = [
  {
    id: "main",
    keys: [
      "atendimento",
      "chat-interno-rc",
      "chat-privado",
      "contatos",
      "mensagens-rapidas",
      "painel-atendimentos",
      "tarefas",
      "wavoip",
    ].sort(),
  },
  {
    id: "organization",
    keys: [
      "agenda",
      "agentes-ia",
      "campanhas",
      "email-marketing",
      "funil",
      "galeria",
      "google-calendar",
      "grupo",
      "kanban",
      "massa",
    ].sort(),
  },
  {
    id: "configuration",
    keys: [
      "agendamentos",
      "agendamento-publico",
      "aniversarios",
      "auto-resposta",
      "avaliacoes",
      "chat-flow",
      "etiquetas",
      "fechamento",
      "filas",
      "horarioAtendimento",
      "motivos-pausa",
      "notas",
      "protocolos",
    ].sort(),
  },
  {
    id: "reports",
    keys: ["audit-log", "dashboard", "logligacao", "relatorios"].sort(),
  },
  {
    id: "channels",
    keys: ["api-service", "catalogo", "cobrancas", "integracoes-meta", "sessoes", "woocommerce-produtos", "nuvemshop-produtos"].sort(),
  },
  {
    id: "social",
    keys: [
      "facebookComentarios",
      "instagramComentarios",
      "instagramAutomacao",
      "instagramMencoes",
      "tiktokComentarios",
      "youtubeComentarios",
    ].sort(),
  },
  {
    id: "admin",
    keys: ["configuracoes", "creditos-ia", "equipes", "usuarios"].sort(),
  },
];

const MENU_PERMISSION_KEYS = MENU_GROUPS.flatMap((g) => g.keys);

/**
 * Chave de menu -> permissões que a página REALMENTE exige para funcionar.
 *
 * Existe porque as duas listas são independentes: a chave de menu só faz o item
 * aparecer e a rota abrir; quem libera os dados é a permission, enforçada no backend
 * (`requirePermission` nas rotas). Marcar só o menu abre uma tela que devolve 403 em
 * tudo — foi o que aconteceu com Dashboard (sem `reports_view`) e com o diálogo de
 * contatos da Campanha (sem `campaigns_manage`).
 *
 * Só entram aqui as chaves cuja página fica INÚTIL sem a permission (o gate está num
 * GET ou na ação central da tela).
 */
const MENU_REQUIRES: Partial<Record<string, PermissionKey[]>> = {
  dashboard: ["reports_view"],
  relatorios: ["reports_view"],
  "painel-atendimentos": ["reports_view"],
  "audit-log": ["audit_log_view"],
  "api-service": ["api_service_access"],
  avaliacoes: ["ratings_view"],
  galeria: ["gallery_view"],
  catalogo: ["catalog_view"],
  // payments_manage e o que o backend exige em WhatsappPaymentController para dar
  // baixa/cancelar. A LEITURA e liberada a qualquer perfil (o selo "Pago" precisa
  // aparecer na ficha do ticket para quem so atende).
  cobrancas: ["payments_manage"],
  campanhas: ["campaigns_manage"],
  "email-marketing": ["campaigns_manage"],
  massa: ["mass_send_manage"],
  grupo: ["groups_manage"],
  equipes: ["groups_manage"],
  filas: ["queues_manage"],
  etiquetas: ["tags_manage"],
  fechamento: ["closure_reasons_manage"],
  protocolos: ["protocols_manage"],
  notas: ["notes_manage"],
  "chat-flow": ["chat_flow_manage"],
  "auto-resposta": ["chat_flow_manage"],
  "agentes-ia": ["ai_agents_manage"],
  "creditos-ia": ["ai_credits_manage"],
  "agendamento-publico": ["booking_manage"],
  funil: ["funnel_manage"],
  agenda: ["scheduled_messages_manage"],
  sessoes: ["sessions_manage"],
  "integracoes-meta": ["sessions_manage"],
  usuarios: ["users_manage"],
  configuracoes: ["settings_general"],
  horarioAtendimento: ["business_hours_manage"],
};
// `contatos`, `tarefas` e `kanban` NÃO entram: a listagem desses GETs não é gateada,
// então um perfil só-leitura é legítimo — avisar ali seria orientação errada.

/**
 * Chave de menu -> OUTRA chave de menu exigida pela página. Vazio hoje: `funil` e
 * `agenda` passaram a aceitar a própria chave como principal no usePageAccess
 * (`kanban` ficou só como alias legado de concessão), então marcar só a chave da
 * página já dá acesso — o aviso de dependência viraria orientação errada.
 */
const MENU_REQUIRES_MENU: Partial<Record<string, string[]>> = {};

// Grupos de customPermissions — ordem alfabética dentro de cada grupo
const PERMISSION_GROUPS: { id: string; keys: PermissionKey[] }[] = [
  {
    id: "tickets",
    keys: (
      [
        "tickets_assign",
        "tickets_copilot",
        "tickets_create",
        "tickets_delete",
        "tickets_reopen",
        "tickets_resolve",
        "tickets_view_all",
        "tickets_view_chatbot",
      ] as PermissionKey[]
    ).sort(),
  },
  {
    id: "contacts",
    keys: (
      [
        "contacts_create",
        "contacts_delete",
        "contacts_edit",
        "contacts_export",
        "contacts_view_full",
      ] as PermissionKey[]
    ).sort(),
  },
  {
    id: "messages",
    keys: (
      ["messages_delete", "messages_forward", "quickreplies_manage_public"] as PermissionKey[]
    ).sort(),
  },
  {
    id: "tasks",
    keys: (
      ["tasks_create", "tasks_delete", "tasks_edit", "tasks_view_all"] as PermissionKey[]
    ).sort(),
  },
  {
    id: "kanbanFunnel",
    keys: (
      ["attendance_panel_view_all", "funnel_manage", "kanban_manage", "relationship_manage"] as PermissionKey[]
    ).sort(),
  },
  {
    id: "reports",
    keys: (["reports_export", "reports_view", "reports_view_all"] as PermissionKey[]).sort(),
  },
  {
    id: "settings",
    keys: (["settings_general"] as PermissionKey[]).sort(),
  },
  {
    id: "modules",
    keys: (
      [
        "ai_agents_manage",
        "ai_credits_manage",
        "booking_manage",
        "business_hours_manage",
        "campaigns_manage",
        "catalog_manage",
        "catalog_view",
        "chat_flow_manage",
        "closure_reasons_manage",
        "gallery_manage",
        "gallery_view",
        "groups_manage",
        "mass_send_manage",
        "notes_manage",
        "notifications_manage",
        // Sem esta caixa a permission ficava impossível de conceder: o backend
        // (WhatsappPaymentController) só aceita custom com ela em true, e o aviso de
        // dependência do menu Cobranças apontava para algo que a tela não oferecia.
        "payments_manage",
        "private_chat_access",
        "private_chat_audit",
        "protocols_manage",
        "queues_manage",
        "ratings_view",
        "scheduled_messages_manage",
        "tags_manage",
      ] as PermissionKey[]
    ).sort(),
  },
  {
    id: "admin",
    keys: (
      ["api_service_access", "audit_log_view", "sessions_manage", "users_manage", "users_view"] as PermissionKey[]
    ).sort(),
  },
  {
    id: "voip",
    keys: (["voip_wavoip", "voip_webphone"] as PermissionKey[]).sort(),
  },
];

const ALL_PERMISSION_KEYS_FLAT = PERMISSION_GROUPS.flatMap((g) => g.keys);

// Ícone (i) com tooltip explicando o que o gate faz. Fica FORA do <label> para
// que clicar nele não alterne o checkbox.
function GateInfo({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={text}
          className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-left leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export default function CustomProfilesPage() {
  const t = useTranslations("customProfiles");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [profiles, setProfiles] = useState<CustomProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomProfileItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Gate: apenas admin/superadmin acessam
  useEffect(() => {
    if (user && user.profile !== "admin" && user.profile !== "superadmin") {
      router.replace("/");
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomProfiles();
      setProfiles(data);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: CustomProfileItem) => {
    setEditing(p);
    setDialogOpen(true);
  };
  const onDelete = async (p: CustomProfileItem) => {
    if (p.usersCount > 0) {
      toast.error(t("deleteBlocked", { count: p.usersCount }));
      return;
    }
    if (!confirm(t("confirmDelete", { name: p.name }))) return;
    try {
      await deleteCustomProfile(p.id);
      toast.success(t("deleteSuccess"));
      void load();
    } catch {
      toast.error(t("deleteError"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("help.description")}
        help={{
          description: t("help.description"),
          sections: [
            {
              title: t("help.s0.title"),
              items: [t("help.s0.i0"), t("help.s0.i1"), t("help.s0.i2")],
            },
            {
              title: t("help.s1.title"),
              items: [t("help.s1.i0"), t("help.s1.i1"), t("help.s1.i2")],
            },
            {
              title: t("help.s2.title"),
              items: [t("help.s2.i0"), t("help.s2.i1")],
            },
          ],
        }}
      >
        <Link href="/usuarios">
          <Button size="sm" variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToUsers")}
          </Button>
        </Link>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />
          {t("new")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : profiles.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {t("empty")}
        </Card>
      ) : (
        <div className="grid gap-3">
          {profiles.map((p) => (
            <Card key={p.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                {p.description && (
                  <div className="text-sm text-muted-foreground truncate">
                    {p.description}
                  </div>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Users className="h-3 w-3" />
                  {t("usersCount", { count: p.usersCount })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(p)}
                  disabled={p.usersCount > 0}
                  title={p.usersCount > 0 ? t("deleteBlocked", { count: p.usersCount }) : ""}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProfileFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initial={editing}
        onSaved={() => {
          setDialogOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function ProfileFormDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: CustomProfileItem | null;
  onSaved: () => void;
}) {
  const t = useTranslations("customProfiles");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customPermissions, setCustomPermissions] = useState<ICustomPermissions>(DEFAULT_CUSTOM_PERMISSIONS);
  const [menuPermissions, setMenuPermissions] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Interruptor do WaVoIP no tenant: some com a chave de menu "wavoip" e com a
  // permissão "voip_wavoip". `voip_webphone` (SIP) permanece — não é WaVoIP.
  // Os valores já gravados no perfil não são tocados; religar o recurso os revela.
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  // Créditos de IA: mesmo molde, FAIL-CLOSED — a chave de menu "creditos-ia" e a
  // permissão "ai_credits_manage" só aparecem com o recurso ligado na empresa.
  const aiCreditsEnabled = useAuthStore((s) => s.isAiCreditsEnabled());
  const menuGroups = useMemo(() => {
    const hiddenMenus: string[] = [];
    if (!wavoipEnabled) hiddenMenus.push("wavoip");
    if (!aiCreditsEnabled) hiddenMenus.push("creditos-ia");
    if (hiddenMenus.length === 0) return MENU_GROUPS;
    return MENU_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => !hiddenMenus.includes(k)) }))
      .filter((g) => g.keys.length > 0);
  }, [wavoipEnabled, aiCreditsEnabled]);
  const permissionGroups = useMemo(() => {
    const hiddenPerms: PermissionKey[] = [];
    if (!wavoipEnabled) hiddenPerms.push("voip_wavoip");
    if (!aiCreditsEnabled) hiddenPerms.push("ai_credits_manage");
    if (hiddenPerms.length === 0) return PERMISSION_GROUPS;
    return PERMISSION_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => !hiddenPerms.includes(k)) }))
      .filter((g) => g.keys.length > 0);
  }, [wavoipEnabled, aiCreditsEnabled]);

  // Copiloto §26
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRationale, setAiRationale] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setCustomPermissions({
        ...DEFAULT_CUSTOM_PERMISSIONS,
        ...(initial?.customPermissions ?? {}),
      });
      setMenuPermissions(initial?.menuPermissions ?? {});
      setAiPrompt("");
      setAiRationale("");
    }
  }, [open, initial]);

  const onSuggest = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      toast.error(t("ai.promptRequired"));
      return;
    }
    setAiLoading(true);
    setAiRationale("");
    try {
      const suggestion = await suggestProfile(prompt);
      if (!name && suggestion.name) setName(suggestion.name);
      if (!description && suggestion.description) setDescription(suggestion.description);
      setCustomPermissions(suggestion.customPermissions);
      setMenuPermissions(suggestion.menuPermissions);
      setAiRationale(suggestion.rationale);
      toast.success(t("ai.applied"));
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      if (e?.response?.status === 422 && e.response?.data?.error === "ERR_COPILOT_NO_API_KEY") {
        toast.error(t("ai.errorNoApiKey"));
      } else if (e?.message === "ERR_COPILOT_PARSE") {
        toast.error(t("ai.errorParse"));
      } else {
        toast.error(t("ai.errorGeneric"));
      }
    } finally {
      setAiLoading(false);
    }
  };

  const togglePerm = (key: PermissionKey, value: boolean) => {
    setCustomPermissions((prev) => ({ ...prev, [key]: value }));
  };
  const toggleMenu = (key: string, value: boolean) => {
    setMenuPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const selectAllMenu = () => {
    const next: Record<string, boolean> = {};
    for (const k of MENU_PERMISSION_KEYS) next[k] = true;
    setMenuPermissions(next);
  };
  const deselectAllMenu = () => {
    const next: Record<string, boolean> = {};
    for (const k of MENU_PERMISSION_KEYS) next[k] = false;
    setMenuPermissions(next);
  };
  const selectAllPerms = () => {
    const next = { ...customPermissions };
    for (const key of PERMISSION_KEYS) {
      (next as unknown as Record<string, boolean>)[key] = true;
    }
    setCustomPermissions(next);
  };
  const deselectAllPerms = () => {
    setCustomPermissions({ ...DEFAULT_CUSTOM_PERMISSIONS });
  };

  const setMenuGroup = (keys: string[], value: boolean) => {
    setMenuPermissions((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = value;
      return next;
    });
  };
  const setPermsGroup = (keys: PermissionKey[], value: boolean) => {
    setCustomPermissions((prev) => {
      const next = { ...prev };
      const target = next as unknown as Record<string, boolean>;
      for (const k of keys) target[k] = value;
      return next;
    });
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        customPermissions,
        menuPermissions,
      };
      if (initial) {
        await updateCustomProfile(initial.id, payload);
        toast.success(t("updateSuccess"));
      } else {
        await createCustomProfile(payload);
        toast.success(t("createSuccess"));
      }
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {initial ? t("edit") : t("new")}
          </DialogTitle>
        </DialogHeader>

        <TooltipProvider delayDuration={150}>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Copiloto — sugerir perfil com IA */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("ai.title")}
            </div>
            <p className="text-xs text-muted-foreground">{t("ai.description")}</p>
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={t("ai.placeholder")}
              rows={3}
              disabled={aiLoading}
            />
            <div className="flex items-center justify-between">
              {aiRationale ? (
                <p className="text-xs text-muted-foreground flex-1 mr-2 italic">{aiRationale}</p>
              ) : <span />}
              <Button size="sm" onClick={onSuggest} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? (
                  <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> {t("ai.loading")}</>
                ) : (
                  <><Sparkles className="mr-2 h-3 w-3" /> {t("ai.action")}</>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">{t("form.name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">{t("form.description")}</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} rows={2} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">{t("form.visibility")}</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selectAllMenu}>
                  {t("form.selectAll")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={deselectAllMenu}>
                  {t("form.deselectAll")}
                </Button>
              </div>
            </div>
            {menuGroups.map((group) => (
              <div key={group.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{t(`menuGroups.${group.id}`)}</div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMenuGroup(group.keys, true)}>
                      {t("form.selectAll")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMenuGroup(group.keys, false)}>
                      {t("form.deselectAll")}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {group.keys.map((key) => {
                    // Só alerta quando a chave está LIGADA e falta dependência — assim
                    // o aviso é sempre acionável e não polui o formulário inteiro.
                    const missingPerms = menuPermissions[key] === true
                      ? (MENU_REQUIRES[key] ?? []).filter((p) => customPermissions[p] !== true)
                      : [];
                    const missingMenus = menuPermissions[key] === true
                      ? (MENU_REQUIRES_MENU[key] ?? []).filter((m) => menuPermissions[m] !== true)
                      : [];
                    return (
                    <div key={key} className="flex flex-col gap-0.5 text-sm">
                      <div className="flex items-start gap-1.5">
                        <label className="flex min-w-0 flex-1 items-start gap-2 cursor-pointer">
                          <Checkbox
                            className="mt-0.5"
                            checked={menuPermissions[key] === true}
                            onCheckedChange={(v) => toggleMenu(key, v === true)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{t(`menuLabels.${key}`)}</span>
                            <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground/70">
                              {key}
                            </span>
                          </span>
                        </label>
                        <GateInfo text={t(`menuDesc.${key}`)} />
                      </div>
                      {(missingPerms.length > 0 || missingMenus.length > 0) && (
                        <span className="ml-6 flex items-start gap-1 text-[11px] leading-tight text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
                          <span className="min-w-0">
                            {missingPerms.length > 0 && (
                              <span className="block">
                                {t("menuRequires", {
                                  perms: missingPerms.map((p) => t(`permLabels.${p}`)).join(", "),
                                })}
                              </span>
                            )}
                            {missingMenus.length > 0 && (
                              <span className="block">
                                {t("menuRequiresMenu", {
                                  menus: missingMenus.map((mk) => t(`menuLabels.${mk}`)).join(", "),
                                })}
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">{t("form.permissions")}</Label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selectAllPerms}>
                  {t("form.selectAll")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={deselectAllPerms}>
                  {t("form.deselectAll")}
                </Button>
              </div>
            </div>
            {permissionGroups.map((group) => (
              <div key={group.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{t(`permGroups.${group.id}`)}</div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPermsGroup(group.keys, true)}>
                      {t("form.selectAll")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPermsGroup(group.keys, false)}>
                      {t("form.deselectAll")}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {group.keys.map((key) => (
                    <div key={key} className="flex items-start gap-1.5 text-sm">
                      <label className="flex min-w-0 flex-1 items-start gap-2 cursor-pointer">
                        <Checkbox
                          className="mt-0.5"
                          checked={customPermissions[key] === true}
                          onCheckedChange={(v) => togglePerm(key, v === true)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{t(`permLabels.${key}`)}</span>
                          <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground/70">
                            {key}
                          </span>
                        </span>
                      </label>
                      <GateInfo text={t(`permDesc.${key}`)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        </TooltipProvider>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
