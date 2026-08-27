"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, Send, Eye, Paperclip, Download, Upload,
  MailX, Loader2, FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EmailHtmlEditor } from "@/components/email-marketing/email-html-editor";
import { sanitize } from "@/lib/sanitize";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import {
  fetchEmailTemplates, fetchEmailTemplate, createEmailTemplate, updateEmailTemplate,
  deleteEmailTemplate, testSendEmailTemplate,
  fetchEmailBlacklist, addEmailBlacklist, removeEmailBlacklist,
  importEmailBlacklist, exportEmailBlacklist,
  type EmailTemplate, type EmailBlacklistEntry, type EmailTemplateAttachment,
} from "@/services/email-marketing";

const EMAIL_CHANNEL_TYPES = ["email", "webmail"];

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function EmailMarketingPage() {
  const t = useTranslations("emailMarketingPage");
  const hasAccess = usePageAccess("email-marketing", { allowIfNotSet: true });

  // ── Modelos ────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formHtml, setFormHtml] = useState("");
  const [existingAttachments, setExistingAttachments] = useState<EmailTemplateAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [loadingTemplateBody, setLoadingTemplateBody] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Envio de teste
  const [testOpen, setTestOpen] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<number | null>(null);
  const [testChannelId, setTestChannelId] = useState<string>("");
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testOptOutConfirm, setTestOptOutConfirm] = useState<string | null>(null);
  const [emailChannels, setEmailChannels] = useState<Whatsapp[]>([]);

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
    (async () => {
      try {
        const res = await fetchWhatsapps();
        const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
        const all = filterWhatsappsForCurrentUser(raw);
        setEmailChannels(
          all.filter(w => EMAIL_CHANNEL_TYPES.includes((w.type || "").toLowerCase()))
        );
      } catch {
        /* canais indisponíveis: o teste fica desabilitado */
      }
    })();
  }, [hasAccess, loadTemplates, loadBlacklist]);

  const openCreate = () => {
    setEditId(null);
    setFormName("");
    setFormSubject("");
    setFormHtml("");
    setExistingAttachments([]);
    setNewFiles([]);
    setDialogOpen(true);
  };

  const openEdit = async (tpl: EmailTemplate) => {
    setEditId(tpl.id);
    setFormName(tpl.name);
    setFormSubject(tpl.subject);
    setFormHtml("");
    setExistingAttachments(tpl.attachments || []);
    setNewFiles([]);
    setDialogOpen(true);
    setLoadingTemplateBody(true);
    try {
      const full = await fetchEmailTemplate(tpl.id);
      setFormHtml(full.html || "");
      setExistingAttachments(full.attachments || []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingTemplateBody(false);
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSubject.trim() || !formHtml.trim()) {
      toast.error(t("requiredFields"));
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateEmailTemplate(editId, {
          name: formName.trim(),
          subject: formSubject.trim(),
          html: formHtml,
          keepAttachmentKeys: existingAttachments.map(a => a.key),
          files: newFiles,
        });
      } else {
        await createEmailTemplate({
          name: formName.trim(),
          subject: formSubject.trim(),
          html: formHtml,
          files: newFiles,
        });
      }
      toast.success(t("saved"));
      setDialogOpen(false);
      loadTemplates(templateSearch);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
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
    setTestTo("");
    setTestOptOutConfirm(null);
    if (emailChannels.length > 0 && !testChannelId) {
      setTestChannelId(String(emailChannels[0].id));
    }
    setTestOpen(true);
  };

  const handleTestSend = async (override = false) => {
    if (!testTemplateId || !testChannelId || !testTo.trim()) return;
    setTestSending(true);
    try {
      await testSendEmailTemplate(testTemplateId, {
        whatsappId: Number(testChannelId),
        to: testTo.trim(),
        ...(override ? { allowOptOutOverride: true } : {}),
      });
      toast.success(t("testSent"));
      setTestOpen(false);
      setTestOptOutConfirm(null);
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { error?: string; optOut?: { createdAt?: string } } } })?.response;
      if (resp?.status === 409 && resp.data?.error === "ERR_EMAIL_OPTOUT") {
        setTestOptOutConfirm(resp.data?.optOut?.createdAt || "");
      } else {
        toast.error(t("saveError"));
      }
    } finally {
      setTestSending(false);
    }
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

  const previewHtml = useMemo(() => sanitize(formHtml || ""), [formHtml]);

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
                      <TableCell className="font-medium">{tpl.name}</TableCell>
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

      {/* ── Dialog criar/editar modelo ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editId ? t("dialogEditTitle") : t("dialogNewTitle")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("fieldName")}</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fieldSubject")}</Label>
                <Input value={formSubject} onChange={e => setFormSubject(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("fieldHtml")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!formHtml.trim()}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t("preview")}
                </Button>
              </div>
              {loadingTemplateBody ? (
                <div className="flex min-h-[260px] items-center justify-center rounded-md border">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <EmailHtmlEditor value={formHtml} onChange={setFormHtml} />
              )}
              <p className="text-xs text-muted-foreground">{t("variablesNote")}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("attachments")}</Label>
              <div className="space-y-2">
                {existingAttachments.map(att => (
                  <div key={att.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{att.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(att.size)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setExistingAttachments(prev => prev.filter(a => a.key !== att.key))}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {newFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline">
                  <Plus className="h-4 w-4" />
                  {t("addAttachment")}
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp3,.ogg,.wav,.mp4,.zip,.ics,.vcf"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      const tooBig = files.filter(f => f.size > 25 * 1024 * 1024);
                      if (tooBig.length > 0) toast.error(t("attachmentTooBig"));
                      setNewFiles(prev => [...prev, ...files.filter(f => f.size <= 25 * 1024 * 1024)]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">{t("attachmentsHint")}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview ────────────────────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{t("previewTitle")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {/* sandbox SEM allow-scripts (padrão do render de e-mail recebido) */}
            <iframe
              title={t("previewTitle")}
              sandbox="allow-same-origin"
              srcDoc={previewHtml}
              className="h-[60vh] w-full rounded-md border bg-white"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Envio de teste ─────────────────────────────────────────────── */}
      <Dialog open={testOpen} onOpenChange={o => { setTestOpen(o); if (!o) setTestOptOutConfirm(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{t("testSendTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("testChannel")}</Label>
              <Select value={testChannelId} onValueChange={setTestChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("testChannel")} />
                </SelectTrigger>
                <SelectContent>
                  {emailChannels.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {emailChannels.length === 0 && (
                <p className="text-xs text-destructive">{t("noChannels")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("testTo")}</Label>
              <Input
                type="email"
                value={testTo}
                onChange={e => {
                  setTestTo(e.target.value);
                  // Trocou o destinatário: a confirmação de opt-out anterior não
                  // vale para o novo endereço (auditoria pós-impl. #7)
                  setTestOptOutConfirm(null);
                }}
                placeholder="nome@dominio.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("testHint")}</p>
            {testOptOutConfirm !== null && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                <p>{t("optOutWarnDesc", { date: testOptOutConfirm ? new Date(testOptOutConfirm).toLocaleDateString() : "—" })}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>{t("cancel")}</Button>
            {testOptOutConfirm !== null ? (
              <Button variant="destructive" disabled={testSending} onClick={() => handleTestSend(true)} className="gap-1.5">
                {testSending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("optOutSendAnyway")}
              </Button>
            ) : (
              <Button
                disabled={testSending || !testChannelId || !testTo.trim()}
                onClick={() => handleTestSend(false)}
                className="gap-1.5"
              >
                {testSending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("testSendAction")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
