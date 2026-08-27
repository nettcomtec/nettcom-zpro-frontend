"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactAvatar } from "@/components/contact-avatar";
import {
  CalendarCheck,
  CalendarClock,
  HelpCircle,
  AlertTriangle,
  ArrowLeftRight,
  FileQuestion,
  Check,
  X,
  Loader2,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useLocale } from "@/i18n/locale-provider";
import {
  auditBirthdayDates,
  fixBirthdayDates,
  type BirthdayAuditItem,
  type BirthdayAuditCandidate,
  type BirthdayAuditCategory,
} from "@/services/contacts";

interface BirthdayAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Chamado depois de qualquer correcao, pra a pagina recarregar a lista.
  onFixed?: () => void;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

const CATEGORY_ORDER: BirthdayAuditCategory[] = [
  "ambiguous",
  "possiblySwapped",
  "nonCanonical",
  "noYear",
  "implausible",
  "unparseable",
];

export function BirthdayAuditDialog({
  open,
  onOpenChange,
  onFixed,
}: BirthdayAuditDialogProps) {
  const t = useTranslations("aniversariosPage.audit");
  const { locale } = useLocale();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BirthdayAuditItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  // Modo extra: conferir datas OK que podem ter dia/mês trocados (import antigo).
  const [swapCheck, setSwapCheck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await auditBirthdayDates(swapCheck);
      setItems(data.items || []);
      setTruncated(Boolean(data.truncated));
      setEdits({});
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t, swapCheck]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Formata uma data ISO (YYYY-MM-DD) no idioma atual, sem shift de fuso.
  const formatIso = useCallback(
    (iso: string): string => {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return iso;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    },
    [locale],
  );

  const grouped = useMemo(() => {
    const map: Record<BirthdayAuditCategory, BirthdayAuditItem[]> = {
      ambiguous: [],
      possiblySwapped: [],
      nonCanonical: [],
      noYear: [],
      implausible: [],
      unparseable: [],
    };
    for (const it of items) map[it.category]?.push(it);
    return map;
  }, [items]);

  const removeItems = useCallback((ids: number[]) => {
    const set = new Set(ids);
    setItems((prev) => prev.filter((it) => !set.has(it.contactId)));
  }, []);

  const setSaving = useCallback((id: number, on: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const applyOne = useCallback(
    async (contactId: number, iso: string) => {
      if (!ISO_RE.test(iso)) {
        toast.error(t("saveError"));
        return;
      }
      setSaving(contactId, true);
      try {
        const { data } = await fixBirthdayDates([{ contactId, birthdayDate: iso }]);
        if (data?.updated > 0) {
          removeItems([contactId]);
          toast.success(t("savedOne"));
          onFixed?.();
        } else {
          toast.error(t("saveError"));
        }
      } catch {
        toast.error(t("saveError"));
      } finally {
        setSaving(contactId, false);
      }
    },
    [t, setSaving, removeItems, onFixed],
  );

  const removeOne = useCallback(
    async (contactId: number) => {
      setSaving(contactId, true);
      try {
        const { data } = await fixBirthdayDates([{ contactId, birthdayDate: null }]);
        if (data?.updated > 0) {
          removeItems([contactId]);
          toast.success(t("removed"));
          onFixed?.();
        } else {
          toast.error(t("saveError"));
        }
      } catch {
        toast.error(t("saveError"));
      } finally {
        setSaving(contactId, false);
      }
    },
    [t, setSaving, removeItems, onFixed],
  );

  const applyAllObvious = useCallback(async () => {
    const fixes = grouped.nonCanonical
      .filter((it) => it.suggestion && ISO_RE.test(it.suggestion))
      .map((it) => ({ contactId: it.contactId, birthdayDate: it.suggestion as string }));
    if (fixes.length === 0) return;
    setBulkSaving(true);
    try {
      const { data } = await fixBirthdayDates(fixes);
      const updated = data?.updated ?? 0;
      if (updated > 0) {
        removeItems(fixes.map((f) => f.contactId));
        toast.success(t("savedMany", { count: updated }));
        onFixed?.();
      } else {
        toast.error(t("saveError"));
      }
    } catch {
      toast.error(t("saveError"));
    } finally {
      setBulkSaving(false);
    }
  }, [grouped.nonCanonical, t, removeItems, onFixed]);

  const defaultDateFor = useCallback((it: BirthdayAuditItem): string => {
    if (it.suggestion && ISO_RE.test(it.suggestion)) return it.suggestion;
    if (it.month && it.day) {
      const year = new Date().getFullYear();
      return `${year}-${pad2(it.month)}-${pad2(it.day)}`;
    }
    return "";
  }, []);

  const total = items.length;

  const chip = (cat: BirthdayAuditCategory, count: number) => {
    if (!count) return null;
    const labelKey = {
      ambiguous: "chipAmbiguous",
      possiblySwapped: "chipPossiblySwapped",
      nonCanonical: "chipNonCanonical",
      noYear: "chipNoYear",
      implausible: "chipImplausible",
      unparseable: "chipUnparseable",
    }[cat];
    return (
      <Badge key={cat} variant="secondary">
        {count} {t(labelKey)}
      </Badge>
    );
  };

  const sectionMeta: Record<
    BirthdayAuditCategory,
    { icon: React.ElementType; titleKey: string; descKey: string }
  > = {
    ambiguous: { icon: HelpCircle, titleKey: "ambiguousTitle", descKey: "ambiguousDesc" },
    possiblySwapped: { icon: ArrowLeftRight, titleKey: "possiblySwappedTitle", descKey: "possiblySwappedDesc" },
    nonCanonical: { icon: CheckCircle2, titleKey: "nonCanonicalTitle", descKey: "nonCanonicalDesc" },
    noYear: { icon: CalendarClock, titleKey: "noYearTitle", descKey: "noYearDesc" },
    implausible: { icon: AlertTriangle, titleKey: "implausibleTitle", descKey: "implausibleDesc" },
    unparseable: { icon: FileQuestion, titleKey: "unparseableTitle", descKey: "unparseableDesc" },
  };

  // Funcoes de render (NAO componentes) -> JSX inline, sem remontar o <input>
  // a cada tecla (o que faria perder o foco no campo de data).
  const renderSkip = (it: BirthdayAuditItem) => (
    <Button
      variant="ghost"
      size="sm"
      title={t("skip")}
      disabled={savingIds.has(it.contactId)}
      onClick={() => removeItems([it.contactId])}
    >
      <X className="h-4 w-4" />
    </Button>
  );

  const renderDateEditor = (it: BirthdayAuditItem) => {
    const value = edits[it.contactId] ?? defaultDateFor(it);
    const valid = ISO_RE.test(value);
    return (
      <>
        <Input
          type="date"
          className="h-9 w-[160px]"
          value={value}
          onChange={(e) =>
            setEdits((prev) => ({ ...prev, [it.contactId]: e.target.value }))
          }
        />
        <Button
          size="sm"
          disabled={savingIds.has(it.contactId) || !valid}
          onClick={() => applyOne(it.contactId, value)}
        >
          {savingIds.has(it.contactId) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-1 h-4 w-4" />
              {t("save")}
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          title={t("remove")}
          disabled={savingIds.has(it.contactId)}
          onClick={() => removeOne(it.contactId)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        {renderSkip(it)}
      </>
    );
  };

  const renderControls = (cat: BirthdayAuditCategory, it: BirthdayAuditItem) => {
    // candidates[0] = manter como está (só dispensa, sem gravar), [1] = trocado dia<->mês.
    if (cat === "possiblySwapped") {
      const keep = it.candidates[0];
      const swapped = it.candidates[1];
      return (
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={savingIds.has(it.contactId)}
            onClick={() => removeItems([it.contactId])}
          >
            {keep ? t("keepDate", { date: formatIso(keep.iso) }) : t("skip")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={savingIds.has(it.contactId) || !swapped}
            onClick={() => swapped && applyOne(it.contactId, swapped.iso)}
          >
            {savingIds.has(it.contactId) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowLeftRight className="mr-1 h-4 w-4" />
                {t("swapTo", { date: swapped ? formatIso(swapped.iso) : "" })}
              </>
            )}
          </Button>
        </>
      );
    }
    if (cat === "ambiguous") {
      return (
        <>
          {it.candidates.map((c: BirthdayAuditCandidate) => (
            <Button
              key={c.iso}
              size="sm"
              variant="outline"
              disabled={savingIds.has(it.contactId)}
              onClick={() => applyOne(it.contactId, c.iso)}
            >
              {formatIso(c.iso)}
            </Button>
          ))}
          {renderSkip(it)}
        </>
      );
    }
    if (cat === "nonCanonical") {
      return (
        <>
          <Button
            size="sm"
            disabled={
              savingIds.has(it.contactId) || !it.suggestion || !ISO_RE.test(it.suggestion)
            }
            onClick={() => it.suggestion && applyOne(it.contactId, it.suggestion)}
          >
            {savingIds.has(it.contactId) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" />
                {it.suggestion ? formatIso(it.suggestion) : t("apply")}
              </>
            )}
          </Button>
          {renderSkip(it)}
        </>
      );
    }
    return renderDateEditor(it);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Checkbox
            id="bday-swap-check"
            checked={swapCheck}
            onCheckedChange={(v) => setSwapCheck(!!v)}
            disabled={loading}
          />
          <Label
            htmlFor="bday-swap-check"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {t("swapCheckLabel")}
          </Label>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-sm font-medium">{t("allGoodTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("allGoodDesc")}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_ORDER.map((cat) => chip(cat, grouped[cat].length))}
            </div>
            {truncated && (
              <p className="text-xs text-amber-600">{t("truncated", { count: total })}</p>
            )}

            <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              {CATEGORY_ORDER.map((cat) => {
                const list = grouped[cat];
                if (list.length === 0) return null;
                const meta = sectionMeta[cat];
                const Icon = meta.icon;
                return (
                  <section key={cat} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Icon className="h-4 w-4" />
                          {t(meta.titleKey)} ({list.length})
                        </p>
                        <p className="text-xs text-muted-foreground">{t(meta.descKey)}</p>
                      </div>
                      {cat === "nonCanonical" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={bulkSaving}
                          onClick={applyAllObvious}
                        >
                          {bulkSaving ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-4 w-4" />
                          )}
                          {t("applyAll", { count: list.length })}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {list.map((it) => (
                        <div
                          key={it.contactId}
                          className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ContactAvatar
                              name={it.name}
                              profilePicUrl={it.profilePicUrl || undefined}
                              sizeClassName="h-8 w-8"
                              fallbackClassName="bg-muted text-xs font-bold"
                              alt={it.name}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{it.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {t("current")}: <span className="font-mono">{it.raw}</span>
                                {it.age != null ? ` · ${t("ageYears", { age: it.age })}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                            {renderControls(cat, it)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
