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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { Search, Plus, Pencil, Trash2, Users2, UserPlus, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import {
  fetchTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  fetchTeamMembers,
  addTeamMember,
  removeTeamMember,
  uploadGroupProfilePicture,
  type Team,
} from "@/services/teams";
import { fetchAllUsers, type User } from "@/services/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { cn } from "@/lib/utils";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

function makeTeamSchema(msgs: { nameRequired: string }) {
  return z.object({
    name: z.string().min(1, msgs.nameRequired),
    isActive: z.boolean(),
  });
}

type TeamForm = z.infer<ReturnType<typeof makeTeamSchema>>;

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export default function EquipesPage() {
  const t = useTranslations("equipesPage");
  const allowed = usePageAccess("equipes", { adminSuperOnly: true });
  const teamSchema = makeTeamSchema({ nameRequired: t("nameRequired") });
  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();

  const [items, setItems] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPicture, setEditingPicture] = useState<string>("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string>("");
  const createPhotoInputRef = useRef<HTMLInputElement>(null);

  // Members state
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersTeam, setMembersTeam] = useState<Team | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [currentMemberIds, setCurrentMemberIds] = useState<Set<number>>(new Set());
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersSaving, setMembersSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const form = useForm<TeamForm>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", isActive: true },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchTeams();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { sortKey, sortDir, handleSort, sortedData } = useSortable<Team>(items, "name");

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  const filtered = sortedData.filter((team) =>
    (team.name || team.group || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsers = allUsers.filter((u) =>
    u.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setEditingPicture("");
    setPendingPhotoFile(null);
    setPendingPhotoPreview("");
    form.reset({ name: "", isActive: true });
    setDialogOpen(true);
  };

  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("A foto deve ter no máximo 5MB");
      if (createPhotoInputRef.current) createPhotoInputRef.current.value = "";
      return;
    }
    setPendingPhotoFile(file);
    setPendingPhotoPreview(URL.createObjectURL(file));
  };

  const openEdit = (team: Team) => {
    setEditing(team);
    setEditingPicture(team.profilePicture || "");
    form.reset({ name: team.name || team.group, isActive: team.isActive ?? true });
    setDialogOpen(true);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("A foto deve ter no máximo 5MB");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const { data } = await uploadGroupProfilePicture(editing.id, file);
      setEditingPicture(data.profilePicture);
      setItems((prev) => prev.map((i) => i.id === editing.id ? { ...i, profilePicture: data.profilePicture } : i));
      toast.success("Foto atualizada com sucesso");
    } catch {
      toast.error("Erro ao atualizar foto");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const openMembers = async (team: Team) => {
    setMembersTeam(team);
    setMembersDialogOpen(true);
    setMembersLoading(true);
    setMemberSearch("");
    try {
      const { data } = await fetchAllUsers();
      const list = data?.users ?? [];
      setAllUsers(list.filter((u) => u.profile !== "superadmin"));
    } catch {
      toast.error(t("errorLoadMembers"));
      setMembersLoading(false);
      return;
    }
    try {
      const { data: membersData } = await fetchTeamMembers(team.id);
      const memberList: { id: number; userId?: number; user?: { id: number } }[] =
        Array.isArray(membersData) ? membersData : [];
      const ids = new Set(memberList.map((m) => m.userId ?? m.user?.id ?? m.id));
      setCurrentMemberIds(ids);
      setSelectedMemberIds(new Set(ids));
    } catch {
      setCurrentMemberIds(new Set());
      setSelectedMemberIds(new Set());
    } finally {
      setMembersLoading(false);
    }
  };

  const handleToggleMember = (userId: number) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSaveMembers = async () => {
    if (!membersTeam) return;
    setMembersSaving(true);
    try {
      const toAdd = [...selectedMemberIds].filter((id) => !currentMemberIds.has(id));
      const toRemove = [...currentMemberIds].filter((id) => !selectedMemberIds.has(id));
      await Promise.all([
        ...toAdd.map((userId) => addTeamMember(userId, membersTeam.id)),
        ...toRemove.map((userId) => removeTeamMember(userId, membersTeam.id)),
      ]);
      toast.success(t("successSaveMembers"));
      setMembersDialogOpen(false);
      load();
    } catch {
      toast.error(t("errorSaveMembers"));
    } finally {
      setMembersSaving(false);
    }
  };

  const onSubmit = async (values: TeamForm) => {
    try {
      if (editing) {
        await updateTeam(editing.id, values);
        toast.success(t("successUpdate"));
      } else {
        const { data: newTeam } = await createTeam(values);
        if (pendingPhotoFile && newTeam?.id) {
          try {
            await uploadGroupProfilePicture(newTeam.id, pendingPhotoFile);
          } catch {
            // foto não é crítica — equipe foi criada
          }
        }
        setPendingPhotoFile(null);
        setPendingPhotoPreview("");
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTeam(deleting.id);
      toast.success(t("successDelete"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
        </Button>
      </PageHeader>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <TableDensityToggle density={density} onChange={updateDensity} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users2}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[
            { number: 1, title: t("emptyStep1") },
            { number: 2, title: t("emptyStep2") },
            { number: 3, title: t("emptyStep3") },
          ]}
        >
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                <SortableTableHead sortKey="isActive" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                <TableHead>{t("colMembers")}</TableHead>
                <TableHead className="w-32">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((team) => (
                <TableRow key={team.id} className={rowClassName}>
                  <TableCell className={cellClassName}>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={team.profilePicture || ""} alt={team.name || team.group} />
                      <AvatarFallback className="text-xs">{(team.name || team.group || "?").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className={cn("text-muted-foreground", cellClassName)}>{team.id}</TableCell>
                  <TableCell className={cn("font-medium", cellClassName)}>{team.name || team.group}</TableCell>
                  <TableCell className={cellClassName}>
                    <Badge variant={team.isActive ? "success" : "secondary"}>
                      {team.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <Badge variant="secondary">{team.usersCount ?? team.users?.length ?? 0}</Badge>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t("manageMembers")} onClick={() => openMembers(team)}>
                        <UserPlus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t("edit")} onClick={() => openEdit(team)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t("delete")} onClick={() => setDeleting(team)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("editDescription") : t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {/* Foto de perfil — edição: upload imediato; criação: salva pendente */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={editing ? editingPicture : pendingPhotoPreview} alt="Foto da equipe" />
                  <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                    {editing
                      ? (editing.name || editing.group || "?").charAt(0).toUpperCase()
                      : <Camera className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => editing ? photoInputRef.current?.click() : createPhotoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingPhoto
                    ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                    : <Camera className="h-5 w-5 text-white" />}
                </button>
                {/* input para edição (upload imediato) */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                {/* input para criação (upload após salvar) */}
                <input
                  ref={createPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCreatePhotoSelect}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {editing ? "Clique na foto para alterar (máx. 5MB)" : "Clique para adicionar uma foto (máx. 5MB)"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("nameLabel")}</Label>
              <Input {...form.register("name")} placeholder={t("namePlaceholder")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.watch("isActive")}
                onCheckedChange={(v) => form.setValue("isActive", v)}
              />
              <Label>{t("activeLabel")}</Label>
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

      {/* Delete */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteCannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>{deleting?.name || deleting?.group}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("remove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("membersTitle")} — {membersTeam?.name || membersTeam?.group}</DialogTitle>
            <DialogDescription>{t("membersDescription")}</DialogDescription>
          </DialogHeader>

          {membersLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="py-2 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={t("memberSearchPlaceholder")}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("noUsersFound")}</p>
                ) : (
                  filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => handleToggleMember(u.id)}
                    >
                      <Checkbox
                        checked={selectedMemberIds.has(u.id)}
                        onCheckedChange={() => handleToggleMember(u.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={u.profilePicture || ""} alt={u.name} />
                        <AvatarFallback className="text-xs">
                          {u.name?.charAt(0)?.toUpperCase() || "#"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{u.profile}</Badge>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedMemberIds.size} {t("selectedCount")}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveMembers} disabled={membersSaving || membersLoading}>
              {membersSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveMembers")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
