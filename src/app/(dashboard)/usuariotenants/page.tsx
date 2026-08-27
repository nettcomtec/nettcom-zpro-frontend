"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, Pencil, Trash2, Users, Shield, ShieldCheck, User, Phone, ChevronRight, Clock, UserX, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BusinessHoursEditor, getDefaultBusinessHours, validateBusinessHours, type BusinessHour } from "@/components/business-hours-editor";
import {
  fetchUserTenantsPage,
  createUserTenant,
  updateUserTenant,
  deleteUserTenant,
  inactivateUserTenant,
  reactivateUserTenant,
  type UserTenant,
} from "@/services/user-tenants";
import { fetchTenants } from "@/services/tenants";

const MENU_PERMISSION_KEYS = [
  "massa", "grupo", "chatPrivado", "kanban", "funil",
  "relatorios", "campanhas", "email-marketing", "agendamentos", "configuracoes",
] as const;

// Tela superadmin-only: page size alto para carregar todos os usuários em
// 1 requisição (backend cap = 500). Infinite scroll segue como rede de
// segurança caso a base passe de 500.
const USER_TENANTS_PAGE_SIZE = 500;

const userTenantSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional().or(z.literal("")),
  profile: z.string().min(1),
  tenantId: z.number().positive(),
  phone: z.string().optional().or(z.literal("")),
});

type UserTenantForm = z.infer<typeof userTenantSchema>;

interface Tenant {
  id: number;
  name: string;
}

const profileIconMap: Record<string, { icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user: { icon: User, variant: "secondary" },
  super: { icon: Shield, variant: "outline" },
  admin: { icon: ShieldCheck, variant: "default" },
  superadmin: { icon: Shield, variant: "destructive" },
};

export default function UsuarioTenantsPage() {
  const t = useTranslations("usuariotenantsPage");
  const tBh = useTranslations("businessHoursEditor");
  const tSidebar = useTranslations("layoutSidebar");

  const MENU_PERMISSIONS = [
    { key: "massa", label: t("menuMassa") },
    { key: "grupo", label: t("menuGrupo") },
    { key: "chatPrivado", label: t("menuChatPrivado") },
    { key: "kanban", label: t("menuKanban") },
    { key: "funil", label: t("menuFunil") },
    { key: "relatorios", label: t("menuRelatorios") },
    { key: "campanhas", label: t("menuCampanhas") },
    { key: "email-marketing", label: tSidebar("item.emailMarketing") },
    { key: "agendamentos", label: t("menuAgendamentos") },
    { key: "configuracoes", label: t("menuConfiguracoes") },
  ] as const;

  const profileMap: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    user: { label: t("profileUser"), icon: User, variant: "secondary" },
    super: { label: t("profileSuper"), icon: Shield, variant: "outline" },
    admin: { label: t("profileAdmin"), icon: ShieldCheck, variant: "default" },
    superadmin: { label: "Super Admin", icon: Shield, variant: "destructive" },
  };

  const [users, setUsers] = useState<UserTenant[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserTenant | null>(null);
  const [deleting, setDeleting] = useState<UserTenant | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [menuPermissions, setMenuPermissions] = useState<Record<string, boolean>>({});
  const [restrictedUser, setRestrictedUser] = useState<"enabled" | "disabled">("disabled");
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(getDefaultBusinessHours());
  const [bhOpen, setBhOpen] = useState(false);

  // Busca / ordenação / paginação server-side (infinite scroll)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("tenantId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const form = useForm<UserTenantForm>({
    resolver: zodResolver(userTenantSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      profile: "user",
      tenantId: undefined as unknown as number,
      phone: "",
    },
  });

  const loadTenants = useCallback(async () => {
    try {
      const { data } = await fetchTenants();
      const list = Array.isArray(data) ? data : (data as { tenants?: Tenant[] })?.tenants ?? [];
      setTenants(list);
    } catch {
      toast.error(t("errorLoadingTenants"));
    }
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchUserTenantsPage({
        pageNumber: 1,
        pageSize: USER_TENANTS_PAGE_SIZE,
        searchParam: debouncedSearch || undefined,
        sortKey: sortKey || undefined,
        sortDir,
      });
      setUsers(r.users);
      setCount(r.count);
      setActiveCount(r.activeCount);
      setHasMore(r.hasMore);
      setPage(1);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sortKey, sortDir, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const r = await fetchUserTenantsPage({
        pageNumber: next,
        pageSize: USER_TENANTS_PAGE_SIZE,
        searchParam: debouncedSearch || undefined,
        sortKey: sortKey || undefined,
        sortDir,
      });
      setUsers((prev) => [...prev, ...r.users]);
      setCount(r.count);
      setActiveCount(r.activeCount);
      setHasMore(r.hasMore);
      setPage(next);
    } catch {
      toast.error(t("errorLoading"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, hasMore, page, debouncedSearch, sortKey, sortDir, t]);

  // Debounce da busca → o reload server-side (volta pra página 1) é disparado
  // pela mudança de `debouncedSearch`, da qual `load` depende.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  // Recarrega quando busca/ordenação mudam (load depende de ambos)
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Infinite scroll: observa o sentinel no fim da lista
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Badge do menu: total de usuários ATIVOS. Só atualiza na visão sem busca,
  // para refletir o total global e não um número filtrado.
  useEffect(() => {
    if (!debouncedSearch) {
      window.dispatchEvent(new CustomEvent("userTenantsStatusUpdate", {
        detail: { total: activeCount },
      }));
    }
  }, [activeCount, debouncedSearch]);

  const handleSort = (key: string) => {
    setSortDir((prev) => (sortKey === key ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setSortKey(key);
  };

  const resetPermissions = () => {
    const defaults: Record<string, boolean> = {};
    MENU_PERMISSIONS.forEach((p) => { defaults[p.key] = false; });
    return defaults;
  };

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "",
      email: "",
      password: "",
      profile: "user",
      tenantId: undefined as unknown as number,
      phone: "",
    });
    setMenuPermissions(resetPermissions());
    setRestrictedUser("disabled");
    setBusinessHours(getDefaultBusinessHours());
    setBhOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (u: UserTenant) => {
    setEditing(u);
    form.reset({
      name: u.name,
      email: u.email,
      password: "",
      profile: u.profile,
      tenantId: u.tenantId,
      phone: u.phone || "",
    });
    setMenuPermissions(u.menuPermissions ?? resetPermissions());
    setRestrictedUser(u.restrictedUser === "enabled" ? "enabled" : "disabled");
    const rawBh = u.businessHours as BusinessHour[] | undefined;
    setBusinessHours(Array.isArray(rawBh) && rawBh.length > 0 ? rawBh : getDefaultBusinessHours());
    setBhOpen(Array.isArray(rawBh) && rawBh.length > 0);
    setDialogOpen(true);
  };

  const togglePermission = (key: string) => {
    setMenuPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onSubmit = async (values: UserTenantForm) => {
    const bhError = validateBusinessHours(businessHours);
    if (bhError === "empty") { toast.error(tBh("validationEmptyTime")); return; }
    if (bhError) { toast.error(tBh("validationFixBeforeSave")); return; }
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        email: values.email,
        profile: values.profile,
        tenantId: values.tenantId,
        phone: values.phone || "",
        menuPermissions,
        restrictedUser,
        businessHours,
      };
      if (values.password) payload.password = values.password;
      if (editing) {
        await updateUserTenant(editing.id, payload);
        toast.success(t("userUpdated"));
      } else {
        if (!values.password) {
          toast.error(t("errorPasswordRequired"));
          return;
        }
        payload.password = values.password;
        await createUserTenant(payload);
        toast.success(t("userCreated"));
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdating") : t("errorCreating"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteUserTenant(deleting.id);
      toast.success(t("userRemoved"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorRemoving"));
    }
  };

  const handleToggleActive = async (u: UserTenant) => {
    setTogglingId(u.id);
    try {
      if (u.inactive) {
        await reactivateUserTenant(u.id);
        toast.success(t("userReactivated"));
      } else {
        await inactivateUserTenant(u.id);
        toast.success(t("userDeactivated"));
      }
      await load();
    } catch {
      toast.error(t("errorToggleStatus"));
    } finally {
      setTogglingId(null);
    }
  };

  const getTenantName = (tenantId: number) => {
    const t = tenants.find((x) => x.id === tenantId) ?? users.find((u) => u.tenantId === tenantId)?.tenant;
    return t ? (typeof t === "object" && "name" in t ? t.name : String(t)) : String(tenantId);
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
        <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newUser")}</Button>
      </PageHeader>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t("newUser")}</Button>
        </EmptyState>
      ) : (
        <>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                <SortableTableHead sortKey="email" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colEmail")}</SortableTableHead>
                <SortableTableHead sortKey="tenantId" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTenant")}</SortableTableHead>
                <SortableTableHead sortKey="profile" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colProfile")}</SortableTableHead>
                <SortableTableHead sortKey="inactive" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                <TableHead className="w-28">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const p = profileMap[u.profile] ?? profileMap.user;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        {u.profilePicture && <AvatarImage src={u.profilePicture} alt={u.name} />}
                        <AvatarFallback className="text-xs">{getInitials(u.name)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{u.id}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <span className="text-sm">{getTenantName(u.tenantId)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.variant}>
                        <p.icon className="mr-1 h-3 w-3" /> {p.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.inactive ? "secondary" : "success"}>{u.inactive ? t("statusInactive") : t("statusActive")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {u.profile !== "superadmin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={!u.inactive ? t("titleDeactivate") : t("titleReactivate")}
                            onClick={() => handleToggleActive(u)}
                            disabled={togglingId === u.id}
                          >
                            {togglingId === u.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : !u.inactive
                                ? <UserX className="h-3 w-3 text-orange-500" />
                                : <UserCheck className="h-3 w-3 text-emerald-500" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(u)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Sentinel (infinite scroll) + contador + carregar mais */}
        <div ref={sentinelRef} className="h-px" />
        <div className="flex items-center justify-center gap-3 py-3">
          <span className="text-xs text-muted-foreground">
            {t("showingCount", { shown: users.length, total: count })}
          </span>
          {hasMore && (
            <Button variant="outline" size="sm" onClick={() => loadMore()} disabled={loadingMore}>
              {loadingMore
                ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> {t("loadingMore")}</>
                : t("loadMore")}
            </Button>
          )}
        </div>
        </>
      )}

      {/* Dialog: Criar / Editar Usuário Tenant */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("dialogEditDescription") : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-2">
            <div>
              <h4 className="text-sm font-semibold mb-3">{t("sectionBasicData")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("labelName")} *</Label>
                  <Input {...form.register("name")} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t("labelEmail")} *</Label>
                  <Input {...form.register("email")} type="email" />
                  {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{editing ? t("labelPasswordEdit") : t("labelPasswordCreate")}</Label>
                  <Input {...form.register("password")} type="password" autoComplete="new-password" />
                  {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t("labelPhone")}</Label>
                  <Input {...form.register("phone")} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>{t("labelProfile")} *</Label>
                  <Select value={form.watch("profile")} onValueChange={(v) => form.setValue("profile", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t("profileUser")}</SelectItem>
                      <SelectItem value="super">{t("profileSuper")}</SelectItem>
                      <SelectItem value="admin">{t("profileAdmin")}</SelectItem>
                      <SelectItem value="superadmin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("labelTenant")} *</Label>
                  <Select
                    value={form.watch("tenantId") ? String(form.watch("tenantId")) : ""}
                    onValueChange={(v) => form.setValue("tenantId", Number(v))}
                    disabled={!!editing}
                  >
                    <SelectTrigger><SelectValue placeholder={t("selectTenantPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={String(tenant.id)}>{tenant.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.tenantId && <p className="text-xs text-destructive">{form.formState.errors.tenantId.message}</p>}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">{t("sectionSettings")}</h4>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch id="restricted-user" checked={restrictedUser === "enabled"} onCheckedChange={(v) => setRestrictedUser(v ? "enabled" : "disabled")} />
                <Label htmlFor="restricted-user" className="cursor-pointer font-normal">{t("labelRestrictedUser")}</Label>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">{t("sectionMenuPermissions")}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MENU_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={menuPermissions[perm.key] ?? false}
                      onCheckedChange={() => togglePermission(perm.key)}
                    />
                    <span className="text-sm">{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Horário de Atendimento */}
            <div>
              <Collapsible open={bhOpen} onOpenChange={setBhOpen}>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/50">
                  <ChevronRight className={`h-4 w-4 transition-transform ${bhOpen ? "rotate-90" : ""}`} />
                  <Clock className="h-4 w-4" />
                  {t("businessHoursLabel")}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <BusinessHoursEditor value={businessHours} onChange={setBusinessHours} />
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">{t("deleteConfirmMsg")} <strong>{deleting?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("remove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
