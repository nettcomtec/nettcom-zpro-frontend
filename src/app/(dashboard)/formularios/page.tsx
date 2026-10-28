"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bot, Check, ClipboardList, Copy, EllipsisVertical, Info, Inbox, ListOrdered, Loader2, Pencil, Phone, Plus, Power,
  PowerOff, RotateCw, Trash2, TriangleAlert, Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { AccessDenied } from "@/components/layout/access-denied";
import { usePageAccess } from "@/hooks/use-page-access";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FormDestinationMode, FormListItem, FormListResponse } from "@/lib/forms";
import { deleteForm, fetchForms, getRequestStatus, patchForm } from "@/services/forms";
import {
  InfoHint,
  NoticeBox,
  formErrorKey,
  useChannelTypeLabel,
  useCopyFeedback,
  useFormsPageHelp,
} from "@/components/forms/editor/form-editor-shared";

/**
 * Formulários da empresa (`/formularios`, docs/PLANO_FORMULARIOS_ATENDIMENTO.md §5.9).
 *
 * Acesso: admin, supervisor e personalizado com a chave do menu (D10). `adminSuperOnly`
 * deixa o atendente sempre de fora (o servidor também recusa); `allowIfNotSet` deixa
 * entrar o supervisor salvo antes de a chave existir — o menu já mostra o item para ele
 * (só esconde com a chave desmarcada), e sem isso o clique daria "acesso negado".
 */
export default function FormulariosPage() {
  const allowed = usePageAccess("formularios", { adminSuperOnly: true, allowIfNotSet: true });
  if (!allowed) return <AccessDenied />;
  return <FormsListContent />;
}

type LoadState = "ok" | "denied" | "unavailable" | "schemaMissing" | "notInPlan" | "error";

const DESTINATION_ICONS: Record<FormDestinationMode, typeof ListOrdered> = {
  queue: ListOrdered,
  chatflow: Workflow,
  ai_agent: Bot,
};

const DESTINATION_KEYS: Record<FormDestinationMode, string> = {
  queue: "list.destinationQueue",
  chatflow: "list.destinationFlow",
  ai_agent: "list.destinationAgent",
};

function FormsListContent() {
  const t = useTranslations("formsPage");
  const router = useRouter();
  const pageHelp = useFormsPageHelp();
  const channelTypeLabel = useChannelTypeLabel();
  const { copiedId, copy } = useCopyFeedback();

  const [data, setData] = useState<FormListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>("ok");
  const [origin, setOrigin] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const seqRef = useRef(0);
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++seqRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetchForms();
        if (seq !== seqRef.current) return;
        hasDataRef.current = true;
        setData(res);
        setLoadState("ok");
      } catch (err) {
        if (seq !== seqRef.current) return;
        const status = getRequestStatus(err);
        const code = getBackendErrorCode(err);
        let next: LoadState = "error";
        if (code === "ERR_NO_PERMISSION" || status === 403) next = "denied";
        else if (code === "ERR_FORMS_SCHEMA_MISSING") next = "schemaMissing";
        else if (status === 402) next = "notInPlan";
        // 404 sem código = servidor de uma versão sem os formulários.
        else if (status === 404) next = "unavailable";
        // Recarga depois de uma ação: a lista que está na tela continua; só avisa.
        if (opts?.silent && hasDataRef.current && next === "error") toast.error(t("list.reloadFailed"));
        else setLoadState(next);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const forms = data?.forms ?? [];
  const maxForms = data?.maxForms ?? 100;
  const atLimit = forms.length >= maxForms;

  const linkFor = (slug: string) => (origin ? `${origin}/f/${slug}` : `/f/${slug}`);

  const showActionError = (err: unknown, formId: number) => {
    const code = getBackendErrorCode(err);
    // "Sem permissão" e "fora do plano" já têm aviso geral do painel.
    if (code === "ERR_NO_PERMISSION" || getRequestStatus(err) === 402) return;
    toast.error(t(formErrorKey(code)), {
      action: { label: t("list.edit"), onClick: () => router.push(`/formularios/${formId}`) },
    });
  };

  const handleCopyLink = async (form: FormListItem) => {
    const ok = await copy(`link-${form.id}`, linkFor(form.slug));
    if (ok) toast.success(t("list.copied"));
    else toast.error(t("share.copyFailed"));
  };

  // Ativar/desativar manda só a chave (o PUT mantém o resto como está gravado).
  const handleToggleActive = async (form: FormListItem) => {
    if (togglingId !== null) return;
    setTogglingId(form.id);
    try {
      const nextActive = !form.isActive;
      await patchForm(form.id, { isActive: nextActive });
      toast.success(nextActive ? t("list.activated") : t("list.deactivated"));
      await load({ silent: true });
    } catch (err) {
      showActionError(err, form.id);
      if (getBackendErrorCode(err) === "ERR_FORM_NOT_FOUND") await load({ silent: true });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteForm(deleteTarget.id);
      toast.success(t("list.deleted"));
      setDeleteTarget(null);
      await load({ silent: true });
    } catch (err) {
      const code = getBackendErrorCode(err);
      if (code === "ERR_FORM_NOT_FOUND") {
        setDeleteTarget(null);
        await load({ silent: true });
      } else if (code !== "ERR_NO_PERMISSION" && getRequestStatus(err) !== 402) {
        toast.error(t(formErrorKey(code)));
      }
    } finally {
      setDeleting(false);
    }
  };

  const newFormButton =
    loadState === "ok" && data ? (
      atLimit ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              <Button disabled className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("newForm")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{t("limitReached", { max: maxForms })}</TooltipContent>
        </Tooltip>
      ) : (
        <Button asChild className="gap-1.5">
          <Link href="/formularios/new">
            <Plus className="h-4 w-4" />
            {t("newForm")}
          </Link>
        </Button>
      )
    ) : null;

  const channelLine = (form: FormListItem) => {
    const warning = form.channelWarning;
    return (
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          {form.channel && warning !== "channelDeleted" ? (
            <p className="truncate">
              <span>{form.channel.name}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{channelTypeLabel(form.channel.type)}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">{t("list.noChannelShort")}</p>
          )}
          {warning && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3 shrink-0" />
              <span>{t(`list.${warning}`)}</span>
              <InfoHint text={t(`list.${warning}Hint`)} />
            </p>
          )}
        </div>
      </div>
    );
  };

  const countBadge = (
    form: FormListItem,
    value: number,
    labelKey: string,
    variant: "warning-soft" | "destructive-soft" | "info-soft",
    status?: string
  ) => {
    if (value <= 0) return null;
    const href = `/formularios/${form.id}?tab=responses${status ? `&status=${status}` : ""}`;
    return (
      <Link href={href} prefetch={false} className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        <Badge variant={variant} className="whitespace-nowrap">
          {t(labelKey, { count: value })}
        </Badge>
      </Link>
    );
  };

  const formCard = (form: FormListItem) => {
    const DestIcon = DESTINATION_ICONS[form.destinationMode] ?? ListOrdered;
    // O teto conta sem os envios da API e sem os suspeitos (servidor sem o campo: os de 24 h).
    const limitUsed = typeof form.dailyLimitCount === "number" ? form.dailyLimitCount : form.submissions24h;
    const limitHit = form.dailyLimit > 0 && limitUsed >= form.dailyLimit;
    const busy = togglingId === form.id;
    return (
      <Card key={form.id} className={cn("flex min-w-0 flex-col", !form.isActive && "opacity-80")}>
        <CardHeader className="space-y-1.5 p-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base" title={form.name}>
                <Link href={`/formularios/${form.id}`} className="hover:underline">
                  {form.name}
                </Link>
              </CardTitle>
              <div className="mt-1 flex min-w-0 items-center gap-1">
                <a
                  href={linkFor(form.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                  title={t("list.openLink")}
                >
                  /f/{form.slug}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  onClick={() => void handleCopyLink(form)}
                  aria-label={t("list.copyLink")}
                  title={t("list.copyLink")}
                >
                  {copiedId === `link-${form.id}` ? <Check className="text-success" /> : <Copy />}
                </Button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={form.isActive ? "success-soft" : "secondary"} className="whitespace-nowrap">
                {form.isActive ? t("list.active") : t("list.inactive")}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("list.actions")} title={t("list.actions")} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <EllipsisVertical className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => router.push(`/formularios/${form.id}`)}>
                    <Pencil />
                    {t("list.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push(`/formularios/${form.id}?tab=responses`)}>
                    <Inbox />
                    {t("list.responses")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleToggleActive(form)} disabled={togglingId !== null}>
                    {form.isActive ? <PowerOff /> : <Power />}
                    {form.isActive ? t("list.deactivate") : t("list.activate")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleteTarget(form)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 />
                    {t("list.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid flex-1 content-start gap-3 p-4 pt-0">
          {channelLine(form)}
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <DestIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{t(DESTINATION_KEYS[form.destinationMode] ?? "list.destinationQueue")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={cn("rounded-md border p-2", limitHit && "border-amber-500/50 bg-amber-500/10")}>
              <p className="text-[11px] text-muted-foreground">{t("list.submissions24h")}</p>
              <p className="text-sm font-semibold tabular-nums">{formatNumber(form.submissions24h)}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {t("list.limitUsage", { used: formatNumber(limitUsed), limit: formatNumber(form.dailyLimit) })}
              </p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">{t("list.submissionsTotal")}</p>
              <p className="text-sm font-semibold tabular-nums">{formatNumber(form.submissionsTotal)}</p>
            </div>
          </div>
          {limitHit && (
            <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3 shrink-0" />
              <span>{t("list.dailyLimitHit")}</span>
              <InfoHint text={t("list.dailyLimitHitHint")} />
            </p>
          )}
          {(form.pendingCount > 0 || form.failedCount > 0 || form.suspectCount > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {countBadge(form, form.pendingCount, "list.pending", "info-soft", "pending")}
              {countBadge(form, form.failedCount, "list.failed", "destructive-soft", "failed")}
              {countBadge(form, form.suspectCount, "list.suspect", "warning-soft", "suspect")}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {form.lastSubmissionAt
              ? t("list.lastSubmission", {
                  date: formatDateTime(form.lastSubmissionAt, { dateStyle: "short", timeStyle: "short" }),
                })
              : t("list.noSubmissions")}
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 p-4 pt-0">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={`/formularios/${form.id}`}>
              <Pencil className="h-3.5 w-3.5" />
              {t("list.edit")}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link href={`/formularios/${form.id}?tab=responses`}>
              <Inbox className="h-3.5 w-3.5" />
              {t("list.responses")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const stateNotice =
    loadState === "unavailable" ? (
      <NoticeBox icon={Info} tone="info">
        <p className="text-sm">{t("unavailable")}</p>
      </NoticeBox>
    ) : loadState === "schemaMissing" ? (
      <NoticeBox icon={TriangleAlert} tone="warning">
        <p className="text-sm">{t("schemaMissing")}</p>
      </NoticeBox>
    ) : loadState === "notInPlan" ? (
      <NoticeBox icon={Info} tone="info">
        <p className="text-sm">{t("notInPlan")}</p>
      </NoticeBox>
    ) : loadState === "error" ? (
      <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{t("loadFailed")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="shrink-0 gap-1.5">
          <RotateCw className="h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      </div>
    ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp}>
          {newFormButton}
        </PageHeader>

        {loadState === "denied" ? (
          <AccessDenied />
        ) : loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="hidden h-64 w-full xl:block" />
          </div>
        ) : loadState !== "ok" || !data ? (
          stateNotice
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="p-4 md:p-6">
              <EmptyState
                icon={ClipboardList}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                className="py-10"
                steps={[
                  { number: 1, title: t("emptyStep1") },
                  { number: 2, title: t("emptyStep2") },
                  { number: 3, title: t("emptyStep3") },
                ]}
              >
                <Button asChild className="gap-1.5">
                  <Link href="/formularios/new">
                    <Plus className="h-4 w-4" />
                    {t("newForm")}
                  </Link>
                </Button>
              </EmptyState>
            </CardContent>
          </Card>
        ) : (
          <>
            {atLimit && (
              <NoticeBox icon={TriangleAlert} tone="warning">
                <p>{t("limitReached", { max: maxForms })}</p>
              </NoticeBox>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{forms.map(formCard)}</div>
          </>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("list.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("list.deleteBody", {
                name: deleteTarget?.name ?? "",
                count: formatNumber(deleteTarget?.submissionsTotal ?? 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("list.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
