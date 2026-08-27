"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Variable, Plus, Pencil, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  fetchTenantVariables,
  createTenantVariable,
  updateTenantVariable,
  deleteTenantVariable,
  type TenantVariable,
} from "@/services/tenant-variables";

function VarRef({ vars }: { vars: Record<string, string> }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string) => {
    navigator.clipboard.writeText(`{{${key}}}`).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="divide-y">
      {Object.entries(vars).map(([key, desc]) => (
        <div key={key} className="flex items-center justify-between gap-4 py-2">
          <button
            onClick={() => copy(key)}
            className="flex items-center gap-1.5 group"
            title="Copiar"
            type="button"
          >
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              {`{{${key}}}`}
            </code>
            {copied === key
              ? <Check className="h-3 w-3 text-green-500" />
              : <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            }
          </button>
          <span className="text-xs text-muted-foreground text-right">{desc}</span>
        </div>
      ))}
    </div>
  );
}

export default function VariaveisPage() {
  const t = useTranslations("variaveisPage");

  const [list, setList] = useState<TenantVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantVariable | null>(null);
  const [deleting, setDeleting] = useState<TenantVariable | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchTenantVariables();
      setList(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setKey("");
    setValue("");
    setDescription("");
    setActive(true);
    setOpen(true);
  };

  const openEdit = (v: TenantVariable) => {
    setEditing(v);
    setKey(v.key);
    setValue(v.value);
    setDescription(v.description ?? "");
    setActive(v.active);
    setOpen(true);
  };

  const handleSave = async () => {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey) { toast.error(t("errorKeyRequired")); return; }
    if (!trimmedValue) { toast.error(t("errorValueRequired")); return; }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedKey)) {
      toast.error(t("errorKeyFormat"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateTenantVariable(editing.id, {
          key: trimmedKey,
          value: trimmedValue,
          description: description.trim() || undefined,
          active,
        });
        toast.success(t("successUpdated"));
      } else {
        await createTenantVariable({
          key: trimmedKey,
          value: trimmedValue,
          description: description.trim() || undefined,
        });
        toast.success(t("successCreated"));
      }
      setOpen(false);
      load();
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTenantVariable(deleting.id);
      toast.success(t("successDeleted"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  const PLATFORM_VARS: Record<string, string> = {
    name: t("varName"),
    greeting: t("varGreeting"),
    protocol: t("varProtocol"),
    email: t("varEmail"),
    phoneNumber: t("varPhone"),
    kanban: t("varKanban"),
    user: t("varUser"),
    userEmail: t("varUserEmail"),
    firstName: t("varFirstName"),
    lastName: t("varLastName"),
    businessName: t("varBusiness"),
  };

  const TYPEBOT_VARS: Record<string, string> = {
    nome: t("varNome"),
    numero: t("varNumero"),
    atendimento: t("varAtendimento"),
    email: t("varEmailTypebot"),
    status: t("varStatus"),
    canal: t("varCanal"),
    grupo: t("varGrupo"),
    fullTicket: t("varFullTicket"),
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
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
          ],
        }}
      >
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
        </Button>
      </PageHeader>

      {/* Variáveis personalizadas do tenant */}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Variable}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("newButton")}
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colKey")}</TableHead>
                <TableHead>{t("colValue")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("colDescription")}</TableHead>
                <TableHead className="w-20 text-center">{t("colStatus")}</TableHead>
                <TableHead className="w-24">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                      {`{{${v.key}}}`}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">{v.value}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                    {v.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={v.active ? "default" : "secondary"} className="text-xs">
                      {v.active ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(v)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Referência de variáveis do sistema */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Variable className="h-4 w-4" /> {t("platformTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VarRef vars={PLATFORM_VARS} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Variable className="h-4 w-4" /> {t("typebotTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VarRef vars={TYPEBOT_VARS} />
          </CardContent>
        </Card>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("keyLabel")}</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t("keyPlaceholder")}
                disabled={!!editing}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("valueLabel")}</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("valuePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("descriptionLabel")}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            {editing && (
              <div className="flex items-center gap-3">
                <Switch checked={active} onCheckedChange={setActive} id="var-active" />
                <Label htmlFor="var-active">{t("activeLabel")}</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !key.trim() || !value.trim()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog deletar */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            {t("deleteConfirm", { key: deleting?.key ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("deleteButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
