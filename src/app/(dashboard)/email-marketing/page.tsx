"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, Send, Paperclip, Download, Upload,
  MailX, Loader2, FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EmailTemplateTestDialog } from "@/components/email-marketing/email-template-test-dialog";
import {
  fetchEmailTemplates, deleteEmailTemplate,
  fetchEmailBlacklist, addEmailBlacklist, removeEmailBlacklist,
  importEmailBlacklist, exportEmailBlacklist,
  type EmailTemplate, type EmailBlacklistEntry,
} from "@/services/email-marketing";

// Criar/editar modelo vive na página própria /email-marketing/modelos/[id]
// (PLANO_EMAIL_EDITOR_VISUAL D8) — a lista só navega.
const TEMPLATE_PAGE_PREFIX = "/email-marketing/modelos/";

export default function EmailMarketingPage() {
  const t = useTranslations("emailMarketingPage");
  const hasAccess = usePageAccess("email-marketing", { allowIfNotSet: true });
  const router = useRouter();

  // ── Modelos ────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Envio de teste
  const [testOpen, setTestOpen] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<number | null>(null);

  // ── Blacklist ──────────────────────────────────────────────────────────
  const [blacklist, setBlacklist] = useState<EmailBlacklistEntry[]>([]);
  const [blacklistCount, setBlacklistCount] = useState(0);
  const [loadingBlacklist, setLoadingBlacklist] = useState(false);
  const [blacklistSearch, setBlacklistSearch] = useState("");
  const [blacklistAdd, setBlacklistAdd] = useState("");
  const [blacklistRemoveId, setBlacklistRemoveId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Debounce das buscas (sem isso, cada tecla dispara um request e a última
  // resposta a chegar vence — lista errada em digitação rápida)
  const templateSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blacklistSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTemplates = useCallback(async (search?: string) => {
    setLoadingTemplates(true);
    try {
      const res = await fetchEmailTemplates({ searchParam: search, limit: 200 });
      setTemplates(res.records || []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingTemplates(false);
    }
  }, [t]);

  const loadBlacklist = useCallback(async (search?: string) => {
    setLoadingBlacklist(true);
    try {
      const res = await fetchEmailBlacklist({ searchParam: search, limit: 200 });
      setBlacklist(res.records || []);
      setBlacklistCount(res.count || 0);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingBlacklist(false);
    }
  }, [t]);

  useEffect(() => {
    if (!hasAccess) return;
    loadTemplates();
    loadBlacklist();
  }, [hasAccess, loadTemplates, loadBlacklist]);

  const openCreate = () => {
    router.push(`${TEMPLATE_PAGE_PREFIX}novo`);
  };

  const openEdit = (tpl: EmailTemplate) => {
    router.push(`${TEMPLATE_PAGE_PREFIX}${tpl.id}`);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmailTemplate(deleteId);
      toast.success(t("deleted"));
      setTemplates(prev => prev.filter(x => x.id !== deleteId));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setDeleteId(null);
    }
  };

  const openTest = (templateId: number) => {
    setTestTemplateId(templateId);
    setTestOpen(true);
  };

  const handleBlacklistAdd = async () => {
    const email = blacklistAdd.trim();
    if (!email) return;
    try {
      await addEmailBlacklist(email);
      toast.success(t("blacklistAdded"));
      setBlacklistAdd("");
      loadBlacklist(blacklistSearch);
    } catch {
      toast.error(t("blacklistAddError"));
    }
  };

  const handleBlacklistRemove = async () => {
    if (!blacklistRemoveId) return;
    try {
      await removeEmailBlacklist(blacklistRemoveId);
      toast.success(t("blacklistRemoved"));
      setBlacklist(prev => prev.filter(x => x.id !== blacklistRemoveId));
      setBlacklistCount(c => Math.max(0, c - 1));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setBlacklistRemoveId(null);
    }
  };

  const handleImport = async () => {
    const emails = importText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setImporting(true);
    try {
      const res = await importEmailBlacklist(emails);
      toast.success(
        t("importResult", {
          added: res.added,
          existing: res.skippedExisting,
          invalid: res.skippedInvalid,
        })
      );
      setImportOpen(false);
      setImportText("");
      loadBlacklist(blacklistSearch);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportEmailBlacklist();
      const quote = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
      const lines = ["email;reason;date"].concat(
        (res.records || []).map(r => [quote(r.email), quote(r.reason || ""), quote(r.createdAt)].join(";"))
      );
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "blacklist-email.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("saveError"));
    }
  };

  const reasonLabel = (reason?: string | null): string => {
    if (reason === "unsubscribe_link") return t("reasonUnsubscribeLink");
    if (reason === "import") return t("reasonImport");
    if (reason === "bounce") return t("reasonBounce");
    return t("reasonManual");
  };

  if (!hasAccess) return <AccessDenied />;

  return (
    <div className="space-y-6" data-tour="tour-email-marketing">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      />

      <Tabs defaultValue="templates">
        <TabsList className="mb-4">
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="h-4 w-4" />
            {t("tabTemplates")}
          </TabsTrigger>
          <TabsTrigger value="blacklist" className="gap-1.5">
            <MailX className="h-4 w-4" />
            {t("tabBlacklist")}
            {blacklistCount > 0 && (
              <Badge variant="secondary" className="ml-1">{blacklistCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Modelos ─────────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t("searchPlaceholder")}
                value={templateSearch}
                onChange={e => {
                  const v = e.target.value;
                  setTemplateSearch(v);
                  if (templateSearchTimer.current) clearTimeout(templateSearchTimer.current);
                  templateSearchTimer.current = setTimeout(() => loadTemplates(v), 300);
                }}
              />
            </div>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("newTemplate")}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("colSubject")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("colAttachments")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("colUpdatedAt")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTemplates ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map(tpl => (
                    <TableRow key={tpl.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{tpl.name}</span>
                          {tpl.editorVersion ? (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                              {t("badgeVisual")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[280px] truncate md:table-cell">{tpl.subject}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {(tpl.attachments?.length || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                            <Paperclip className="h-3.5 w-3.5" />
                            {tpl.attachments?.length}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {new Date(tpl.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTest(tpl.id)} aria-label={t("testSend")}>
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tpl)} aria-label={t("edit")}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(tpl.id)} aria-label={t("delete")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Blacklist ───────────────────────────────────────────── */}
        <TabsContent value="blacklist" className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("blacklistNote")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t("searchPlaceholder")}
                value={blacklistSearch}
                onChange={e => {
                  const v = e.target.value;
                  setBlacklistSearch(v);
                  if (blacklistSearchTimer.current) clearTimeout(blacklistSearchTimer.current);
                  blacklistSearchTimer.current = setTimeout(() => loadBlacklist(v), 300);
                }}
              />
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <Input
                className="w-full max-w-[240px]"
                placeholder={t("blacklistAddPlaceholder")}
                value={blacklistAdd}
                onChange={e => setBlacklistAdd(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleBlacklistAdd(); }}
              />
              <Button variant="outline" onClick={handleBlacklistAdd} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("blacklistAddBtn")}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                <Upload className="h-4 w-4" />
                {t("blacklistImport")}
              </Button>
              <Button variant="outline" onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                {t("blacklistExport")}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("blacklistColEmail")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("blacklistColReason")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("blacklistColOrigin")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("blacklistColDate")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBlacklist ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : blacklist.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("emptyBlacklist")}
                    </TableCell>
                  </TableRow>
                ) : (
                  blacklist.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary">{reasonLabel(row.reason)}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {row.sourceCampaign?.name || row.contact?.name || row.user?.name || "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setBlacklistRemoveId(row.id)}
                          aria-label={t("delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Envio de teste ─────────────────────────────────────────────── */}
      <EmailTemplateTestDialog open={testOpen} onOpenChange={setTestOpen} templateId={testTemplateId} />

      {/* ── Import blacklist ───────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("importDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              rows={8}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"nome@dominio.com\noutro@dominio.com"}
            />
            <p className="text-xs text-muted-foreground">{t("importHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleImport} disabled={importing} className="gap-1.5">
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("importDo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmações ───────────────────────────────────────────────── */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blacklistRemoveId !== null} onOpenChange={o => { if (!o) setBlacklistRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("blacklistRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("blacklistRemoveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlacklistRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
