"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Paperclip, Plus, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { EmailBodyField } from "@/components/email-marketing/email-body-field";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { parseEmailDesign, type EmailDesign } from "@/lib/email-design";
import {
  fetchEmailTemplates, fetchEmailTemplate, sendBulkEmail, fetchEmailEditorCapabilities, readApiError,
  type EmailTemplate, type EmailEditorCapabilities,
} from "@/services/email-marketing";

const EMAIL_CHANNEL_TYPES = ["email", "webmail"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function MassaEmailPage() {
  const t = useTranslations("massaEmailPage");
  const hasAccess = usePageAccess("massa");

  const [channels, setChannels] = useState<Whatsapp[]>([]);
  const [channelId, setChannelId] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [unsubFooter, setUnsubFooter] = useState(true);
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    total: number; blacklist: number; invalid: number;
  } | null>(null);
  // Editor visual (PLANO_EMAIL_EDITOR_VISUAL D3): cópia do projeto do modelo escolhido
  const [editorCaps, setEditorCaps] = useState<EmailEditorCapabilities | null>(null);
  const [bodySeed, setBodySeed] = useState<{ design: EmailDesign | null; nonce: number } | undefined>(undefined);

  useEffect(() => {
    if (!hasAccess) return;
    fetchEmailEditorCapabilities().then(setEditorCaps);
    (async () => {
      try {
        const res = await fetchWhatsapps();
        const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
        const all = filterWhatsappsForCurrentUser(raw);
        setChannels(all.filter(w => EMAIL_CHANNEL_TYPES.includes((w.type || "").toLowerCase())));
      } catch { /* sem canais: aviso na UI */ }
      try {
        const res = await fetchEmailTemplates({ limit: 200 });
        setTemplates(res.records || []);
      } catch { setTemplates([]); }
    })();
  }, [hasAccess]);

  const recipients = useMemo(
    () => recipientsText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
    [recipientsText]
  );

  const handlePickTemplate = async (id: string) => {
    setTemplateId(id);
    if (!id) return;
    try {
      const full = await fetchEmailTemplate(Number(id));
      setSubject(full.subject || "");
      setHtml(full.html || "");
      setBodySeed({ design: parseEmailDesign(full.designJson), nonce: Date.now() });
    } catch {
      toast.error(t("errorLoadTemplate"));
    }
  };

  const handleSend = async () => {
    if (!channelId || recipients.length === 0 || !subject.trim() || !html.trim()) {
      toast.error(t("requiredFields"));
      return;
    }
    if (maxDelay < minDelay) {
      toast.error(t("delayInvalid"));
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const result = await sendBulkEmail(Number(channelId), {
        recipients,
        subject: subject.trim(),
        html,
        unsubscribeFooterEnabled: unsubFooter,
        minDelay,
        maxDelay,
        files,
      });
      setLastResult({
        total: result.total,
        blacklist: result.skippedByBlacklist.length,
        invalid: result.skippedInvalid.length,
      });
      toast.success(
        t("sentSummary", {
          total: result.total,
          blacklist: result.skippedByBlacklist.length,
          invalid: result.skippedInvalid.length,
        })
      );
    } catch (err: unknown) {
      // lib/api.ts rejeita com `error.response || error`: status/corpo na RAIZ
      const { status, code } = readApiError(err);
      if (code === "ERR_EMAIL_ALL_RECIPIENTS_OPTOUT") {
        toast.error(t("allOptOut"));
      } else if (status === 404) {
        // Backend antigo sem a rota /bulk-email (rollout parcial)
        toast.error(t("backendOld"));
      } else {
        toast.error(t("errorSend"));
      }
    } finally {
      setSending(false);
    }
  };

  if (!hasAccess) return <AccessDenied />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle>{t("cardTitle")}</CardTitle>
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("channel")}</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("channel")} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {channels.length === 0 && (
                <p className="text-xs text-destructive">{t("noChannels")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("recipientsLabel")}</Label>
              <Textarea
                rows={8}
                value={recipientsText}
                onChange={e => setRecipientsText(e.target.value)}
                placeholder={"nome@dominio.com\noutro@dominio.com"}
              />
              <p className="text-xs text-muted-foreground">
                {t("recipientsHint", { count: recipients.length })}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("minDelay")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={minDelay}
                  onChange={e => setMinDelay(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("maxDelay")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxDelay}
                  onChange={e => setMaxDelay(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("delayHint")}</p>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label>{t("unsubLabel")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t("unsubHint")}</p>
              </div>
              <Switch checked={unsubFooter} onCheckedChange={setUnsubFooter} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("templateLabel")}</Label>
                <Select
                  value={templateId || "none"}
                  onValueChange={v => handlePickTemplate(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("templateFree")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("templateFree")}</SelectItem>
                    {templates.map(tpl => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("subjectLabel")}</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("bodyLabel")}</Label>
              <EmailBodyField value={html} onChange={setHtml} seed={bodySeed} capabilities={editorCaps} />
              <p className="text-xs text-muted-foreground">{t("variablesNote")}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("attachments")}</Label>
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      aria-label={t("removeAttachment")}
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
                      const picked = Array.from(e.target.files || []);
                      const ok = picked.filter(f => f.size <= MAX_FILE_SIZE);
                      if (ok.length < picked.length) toast.error(t("attachmentTooBig"));
                      setFiles(prev => [...prev, ...ok]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">{t("attachmentsHint")}</p>
              </div>
            </div>
          </div>
        </div>

        {lastResult && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>{t("sentSummary", { total: lastResult.total, blacklist: lastResult.blacklist, invalid: lastResult.invalid })}</p>
            <Link href="/massa/relatorio" className="text-primary hover:underline text-xs">
              {t("goToReport")}
            </Link>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSend}
            disabled={sending || !channelId || recipients.length === 0 || !subject.trim() || !html.trim()}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("send")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
