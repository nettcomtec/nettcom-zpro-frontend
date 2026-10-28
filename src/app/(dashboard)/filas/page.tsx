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
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/layout/empty-state";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import { Search, Plus, Pencil, Trash2, ListOrdered, Info, Loader2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import {
  fetchQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  type Queue,
  type BusinessHour,
  type BusinessHourType,
  type DistributionPriority,
  type DistributionStrategy,
} from "@/services/queues";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { cn } from "@/lib/utils";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function makeQueueSchema(msgs: { nameRequired: string; colorRequired: string; limitRange: string }) {
  return z.object({
    name: z.string().min(1, msgs.nameRequired),
    color: z.string().min(1, msgs.colorRequired),
    messageBusinessHours: z.string().optional(),
    // Feature "Distribuicao Automatica por Fila": defaults garantem 100% opt-in.
    autoDistributeEnabled: z.boolean().default(false),
    maxOpenTicketsPerUser: z.coerce
      .number({ invalid_type_error: msgs.limitRange })
      .int(msgs.limitRange)
      .min(1, msgs.limitRange)
      .max(999, msgs.limitRange)
      .default(8),
    distributionPriority: z.enum(["oldest", "newest"]).default("oldest"),
    distributionStrategy: z.enum(["R", "B", "S"]).default("B"),
  });
}

type QueueForm = z.infer<ReturnType<typeof makeQueueSchema>>;

// Horário salvo sem algum dos 7 dias (gravado pela API ou dado antigo): a tela trocava
// o horário inteiro pelo padrão e o Salvar apagava os dias que existiam. Mesmo critério
// de /usuarios: o dia que existe fica como veio (só campo ausente é completado, como a
// tela sempre fez), o que falta entra com o padrão de fila nova, de domingo a sábado.
// Sem lista, o padrão inteiro, como antes.
function withAllBusinessDays(raw: unknown, defaults: BusinessHour[]): BusinessHour[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  const entries = raw as Array<{ day?: unknown } | null | undefined>;
  return defaults.map((fallback): BusinessHour => {
    // Mesma busca do servidor (dia numérico, a primeira que casa). Dia gravado como
    // texto ("1") só entra na falta dela, já como número: assim o servidor o acha.
    const found =
      entries.find((h) => h?.day === fallback.day) ??
      entries.find((h) => {
        const day = h?.day;
        return typeof day === "string" && /^\d+$/.test(day.trim()) && Number(day) === fallback.day;
      });
    if (!found) return fallback;
    const bh = found as Partial<BusinessHour>;
    return {
      day: fallback.day,
      label: bh.label ?? fallback.label,
      type: bh.type ?? "O",
      hr1: bh.hr1 ?? "08:00",
      hr2: bh.hr2 ?? "12:00",
      hr3: bh.hr3 ?? "14:00",
      hr4: bh.hr4 ?? "18:00",
    };
  });
}

// Minutos do dia de um horário "HH:mm" (ou "H:mm"), no mesmo formato que o servidor
// lê ao conferir o horário da fila; null = hora vazia ou ilegível.
function parseShiftMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{1,2})\s*$/.exec(String(value ?? ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Ajuda do turno que vira a noite. O tooltip não abre por toque (o Radix fecha no
// clique), então o clique abre e tocar fora fecha: sem isso, no celular a explicação
// nunca apareceria.
function OvernightShiftTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={text}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          collisionPadding={16}
          className="max-w-[18rem] whitespace-normal leading-relaxed"
          onPointerDownOutside={(e) => {
            if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function FilasPage() {
  const t = useTranslations("filasPage");
  const tUnsaved = useTranslations("flowBuilderNodeForm");
  const allowed = usePageAccess("filas", { adminSuperOnly: true });
  const queueSchema = makeQueueSchema({
    nameRequired: t("nameRequired"),
    colorRequired: t("colorRequired"),
    limitRange: t("autoDistributeLimitRange"),
  });
  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();

  const DAY_LABELS = DAY_KEYS.map((k) => t(k as any));

  function getDefaultBusinessHours(): BusinessHour[] {
    return DAY_LABELS.map((label, i) => ({
      day: i,
      label,
      type: "O" as BusinessHourType,
      hr1: "08:00",
      hr2: "12:00",
      hr3: "14:00",
      hr4: "18:00",
    }));
  }

  const [items, setItems] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [deleting, setDeleting] = useState<Queue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(getDefaultBusinessHours);
  // Snapshot dos estados fora do RHF (isActive/businessHours) na abertura do dialog (dirty-guard)
  const extrasSnapshotRef = useRef<string>("");

  const form = useForm<QueueForm>({
    resolver: zodResolver(queueSchema),
    defaultValues: {
      name: "",
      color: "#3B82F6",
      messageBusinessHours: "",
      autoDistributeEnabled: false,
      maxOpenTicketsPerUser: 8,
      distributionPriority: "oldest",
      distributionStrategy: "B",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchQueues();
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

  const { sortKey, sortDir, handleSort, sortedData } = useSortable<Queue>(items, "name");

  // Captura snapshot quando o dialog abre (dirty-guard de fechamento)
  useEffect(() => {
    if (dialogOpen) extrasSnapshotRef.current = JSON.stringify({ isActive, businessHours });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  const filtered = sortedData.filter((q) =>
    q.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "",
      color: "#3B82F6",
      messageBusinessHours: "",
      autoDistributeEnabled: false,
      maxOpenTicketsPerUser: 8,
      distributionPriority: "oldest",
      distributionStrategy: "B",
    });
    setIsActive(true);
    setBusinessHours(getDefaultBusinessHours());
    setDialogOpen(true);
  };

  const openEdit = (q: Queue) => {
    setEditing(q);
    form.reset({
      name: q.name,
      color: q.color || "#3B82F6",
      messageBusinessHours: q.messageBusinessHours || "",
      autoDistributeEnabled: q.autoDistributeEnabled ?? false,
      maxOpenTicketsPerUser: q.maxOpenTicketsPerUser ?? 8,
      distributionPriority: q.distributionPriority ?? "oldest",
      distributionStrategy: q.distributionStrategy ?? "B",
    });
    setIsActive(q.isActive ?? true);
    setBusinessHours(withAllBusinessDays(q.businessHours, getDefaultBusinessHours()));
    setDialogOpen(true);
  };

  // Dirty-guard: fechar o dialog (Esc, clique-fora, X ou Cancelar) com alterações
  // não salvas pede confirmação. Submit fecha direto (setDialogOpen(false) no onSubmit).
  const isQueueFormDirty = () =>
    form.formState.isDirty || JSON.stringify({ isActive, businessHours }) !== extrasSnapshotRef.current;
  const attemptCloseDialog = () => {
    if (form.formState.isSubmitting) return;
    if (isQueueFormDirty() && !window.confirm(tUnsaved("unsavedChangesDesc"))) return;
    setDialogOpen(false);
  };

  const hasEmptyTime = (bh: BusinessHour) => {
    if (bh.type !== "H") return false;
    return !bh.hr1 || !bh.hr2 || !bh.hr3 || !bh.hr4;
  };

  // Hora ilegível fica com o aviso de período inválido.
  const hasOverlap = (bh: BusinessHour) => {
    if (bh.type !== "H") return false;
    if (hasEmptyTime(bh)) return false;
    const end1 = parseShiftMinutes(bh.hr2);
    const start2 = parseShiftMinutes(bh.hr3);
    if (end1 === null || start2 === null) return false;
    return end1 >= start2;
  };

  // Início maior que o fim é turno que vira a noite (22:00–02:00), e o servidor o
  // entende, no recebimento e na distribuição automática: naquele dia da semana, da
  // meia-noite até o fim e do início até o fim do dia. Continuam recusados o
  // intervalo vazio (início igual ao fim) e a hora ilegível (antes um "abc" passava
  // e a fila ficava fechada naquele turno sem aviso).
  const hasInvalidPeriod = (bh: BusinessHour) => {
    if (bh.type !== "H") return false;
    if (hasEmptyTime(bh)) return false;
    const [start1, end1, start2, end2] = [bh.hr1, bh.hr2, bh.hr3, bh.hr4].map(parseShiftMinutes);
    if (start1 === null || end1 === null || start2 === null || end2 === null) return true;
    return start1 === end1 || start2 === end2;
  };

  const onSubmit = async (values: QueueForm) => {
    const emptyDays = businessHours.filter(hasEmptyTime);
    if (emptyDays.length > 0) {
      toast.error(t("validationEmptyTime"));
      return;
    }
    const invalidDays = businessHours.filter((bh) => hasInvalidPeriod(bh) || hasOverlap(bh));
    if (invalidDays.length > 0) {
      toast.error(t("validationFixBeforeSave"));
      return;
    }
    // First-run hint da feature "Distribuicao Automatica por Fila": detecta
    // transicao false->true (editing) ou criacao ja com toggle ligado, mostra
    // toast educacional UMA vez por usuario (localStorage). Calculado antes do
    // POST/PUT para nao depender de re-fetch.
    const wasOff = !editing || editing.autoDistributeEnabled !== true;
    const turningOn = wasOff && values.autoDistributeEnabled === true;
    const hintAlreadyShown =
      typeof window !== "undefined" &&
      localStorage.getItem("autoDistribute:hintShown") === "true";

    try {
      const payload = {
        ...values,
        isActive,
        businessHours,
      };
      if (editing) {
        await updateQueue(editing.id, payload);
        toast.success(t("successUpdate"));
      } else {
        await createQueue(payload);
        toast.success(t("successCreate"));
      }
      setDialogOpen(false);
      load();
      // First-run hint pos-save bem-sucedido (apenas 1x por usuario)
      if (turningOn && !hintAlreadyShown && typeof window !== "undefined") {
        toast.info(t("autoDistributeFirstRunHint"), { duration: 8000 });
        localStorage.setItem("autoDistribute:hintShown", "true");
      }
    } catch {
      toast.error(editing ? t("errorUpdate") : t("errorCreate"));
    }
  };

  const handleDelete = async () => {
    if (!deleting || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteQueue(deleting.id);
      toast.success(t("successDelete"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setIsDeleting(false);
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
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
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
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("colId")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colColor")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colAutoDistribute")}</TableHead>
                <TableHead className="w-24">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i}>
                  {/* ID */}
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  {/* Name */}
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  {/* Color swatch + hex */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </TableCell>
                  {/* Status badge */}
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  {/* Auto-distribute badge */}
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  {/* Actions */}
                  <TableCell>
                    <div className="flex gap-1">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
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
                <TableHead className="w-16">{t("colId")}</TableHead>
                <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                <SortableTableHead sortKey="color" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colColor")}</SortableTableHead>
                <SortableTableHead sortKey="isActive" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                <SortableTableHead sortKey="autoDistributeEnabled" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colAutoDistribute")}</SortableTableHead>
                <TableHead className="w-24">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q) => (
                <TableRow key={q.id} className={rowClassName}>
                  <TableCell className={cn("text-muted-foreground text-sm", cellClassName)}>{q.id}</TableCell>
                  <TableCell className={cn("font-medium", cellClassName)}>{q.name}</TableCell>
                  <TableCell className={cellClassName}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: q.color || "#3B82F6" }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {q.color || "#3B82F6"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <Badge variant={q.isActive !== false ? "default" : "secondary"}>
                      {q.isActive !== false ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <Badge variant={q.autoDistributeEnabled ? "default" : "outline"}>
                      {q.autoDistributeEnabled ? t("autoDistributeOn") : t("autoDistributeOff")}
                    </Badge>
                  </TableCell>
                  <TableCell className={cellClassName}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t("edit")}
                        aria-label={t("edit")}
                        onClick={() => openEdit(q)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t("delete")}
                        aria-label={t("delete")}
                        onClick={() => setDeleting(q)}
                      >
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (v) setDialogOpen(true); else attemptCloseDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? t("editDescription") : t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            {/* isActive toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">{t("activeLabel")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("activeDescription")}
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Name + Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("nameLabel")}</Label>
                <Input {...form.register("name")} placeholder={t("namePlaceholder")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("colorLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={form.watch("color") || "#3B82F6"}
                    onChange={(e) => form.setValue("color", e.target.value, { shouldValidate: true, shouldDirty: true })}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <Input
                    value={form.watch("color") || ""}
                    onChange={(e) => form.setValue("color", e.target.value, { shouldValidate: true, shouldDirty: true })}
                    placeholder="#3B82F6"
                    className="flex-1 font-mono text-sm"
                  />
                </div>
                {form.formState.errors.color && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.color.message}
                  </p>
                )}
              </div>
            </div>

            {/* Business Hours */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-base">{t("businessHoursLabel")}</Label>
                  <OvernightShiftTip text={t("overnightShiftTip")} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("businessHoursDescription")}
                </p>
              </div>
              {/* Mesmas regras de turno do Salvar (hasInvalidPeriod/hasOverlap acima). */}
              <BusinessHoursEditor value={businessHours} onChange={setBusinessHours} allowOvernight />
            </div>

            {/* Auto-Distribuicao por Fila (feature opt-in) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">{t("autoDistributeLabel")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("autoDistributeDescription")}
                  </p>
                </div>
                <Switch
                  checked={form.watch("autoDistributeEnabled")}
                  onCheckedChange={(v) =>
                    form.setValue("autoDistributeEnabled", v, { shouldValidate: true, shouldDirty: true })
                  }
                />
              </div>

              {form.watch("autoDistributeEnabled") && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Limite */}
                    <div className="space-y-2">
                      <Label>{t("autoDistributeLimitLabel")}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        {...form.register("maxOpenTicketsPerUser", { valueAsNumber: true })}
                      />
                      {form.formState.errors.maxOpenTicketsPerUser && (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.maxOpenTicketsPerUser.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("autoDistributeLimitHint")}
                      </p>
                    </div>

                    {/* Prioridade */}
                    <div className="space-y-2">
                      <Label>{t("autoDistributePriorityLabel")}</Label>
                      <Select
                        value={form.watch("distributionPriority")}
                        onValueChange={(v) =>
                          form.setValue("distributionPriority", v as DistributionPriority, { shouldValidate: true, shouldDirty: true })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="oldest">{t("autoDistributePriorityOldest")}</SelectItem>
                          <SelectItem value="newest">{t("autoDistributePriorityNewest")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("autoDistributePriorityHint")}
                      </p>
                    </div>

                    {/* Estrategia */}
                    <div className="space-y-2">
                      <Label>{t("autoDistributeStrategyLabel")}</Label>
                      <Select
                        value={form.watch("distributionStrategy")}
                        onValueChange={(v) =>
                          form.setValue("distributionStrategy", v as DistributionStrategy, { shouldValidate: true, shouldDirty: true })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="R">{t("autoDistributeStrategyRandom")}</SelectItem>
                          <SelectItem value="B">{t("autoDistributeStrategyBalanced")}</SelectItem>
                          <SelectItem value="S">{t("autoDistributeStrategySequential")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("autoDistributeStrategyHint")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                    {t("autoDistributeInfoBox")}
                  </div>

                  <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-line">{t("autoDistributeHowItWorks")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Message outside business hours */}
            <div className="space-y-2">
              <Label>{t("outOfHoursLabel")}</Label>
              <Textarea
                {...form.register("messageBusinessHours")}
                placeholder={t("outOfHoursPlaceholder")}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={attemptCloseDialog}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteCannotUndo")}
            </DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>{deleting?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={isDeleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-1">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
