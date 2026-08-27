"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Save, Loader2, Mail, Send } from "lucide-react";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import api from "@/lib/api";

const KEYS = ["smtp", "emailHost", "emailPort", "emailUser", "emailPass", "emailSecure", "emailFrom", "emailFromName"];

export default function SMTPPage() {
  const t = useTranslations("configSmtpPage");
  const { settings, loading, saving, set, save } = useSettings(KEYS);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  const get = (key: string) => settings[key] || "";
  const smtpEnabled = get("smtp") === "enabled";

  async function handleSendTest() {
    if (!testEmail) { toast.error(t("testEmailRequired")); return; }
    setTestLoading(true);
    try {
      const fromEmail = get("emailFrom") || get("emailUser");
      const fromName = get("emailFromName");
      const res = await api.post("/email/", {
        to: testEmail,
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        subject: t("testSubject"),
        text: t("testBody"),
        host: get("emailHost"),
        port: get("emailPort"),
        secure: get("emailSecure"),
        user: get("emailUser"),
        pass: get("emailPass"),
      });
      if (!res.data || res.data.success !== true) throw new Error();
      toast.success(res.data.message || t("testSuccess"));
      setTestOpen(false);
    } catch (err: unknown) {
      // O interceptor do axios (lib/api.ts) rejeita com `error.response`, entao o
      // corpo chega em `err.data`; mantemos `err.response.data` como fallback.
      const errData =
        (err as { data?: { error?: string; details?: unknown } })?.data ??
        (err as { response?: { data?: { error?: string; details?: unknown } } })?.response?.data;
      const title = errData?.error || t("testError");
      let description: string | undefined;
      const d = errData?.details;
      if (d && typeof d === "object") {
        const dd = d as Record<string, string>;
        // Mensagem real do servidor SMTP (ex.: SES "554 ... not verified") ou dica
        description = dd.response || dd.message || dd.suggestion;
      } else if (typeof d === "string") {
        description = d;
      }
      toast.error(title, description ? { description, duration: 12000 } : undefined);
    } finally {
      setTestLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={t("title")}
          description={t("description")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            ],
          }}
        >
          <div className="flex flex-wrap gap-2">
            {smtpEnabled && (
              <Button size="sm" variant="outline" title={t("testButton")} onClick={() => { setTestEmail(""); setTestOpen(true); }}>
                <Send className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("testButton")}</span>
              </Button>
            )}
            <Button size="sm" disabled={saving} title={t("saveButton")} onClick={() => save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Save className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{t("saveButton")}</span>
            </Button>
          </div>
        </PageHeader>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 break-words">
              <Mail className="h-5 w-5 shrink-0" />
              {t("serverTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 sm:p-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <Label className="break-words">{t("enableLabel")}</Label>
                <p className="text-sm text-muted-foreground break-words">{t("enableDescription")}</p>
              </div>
              <Switch
                checked={smtpEnabled}
                onCheckedChange={(v) => set("smtp", v ? "enabled" : "disabled")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("hostLabel")}</Label>
                <Input
                  value={get("emailHost")}
                  onChange={(e) => set("emailHost", e.target.value)}
                  placeholder={t("hostPlaceholder")}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("portLabel")}</Label>
                <Input
                  type="number"
                  value={get("emailPort")}
                  onChange={(e) => set("emailPort", e.target.value)}
                  placeholder={t("portPlaceholder")}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("userLabel")}</Label>
                <Input
                  value={get("emailUser")}
                  onChange={(e) => set("emailUser", e.target.value)}
                  placeholder={t("userPlaceholder")}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("passwordLabel")}</Label>
                <Input
                  type="password"
                  value={get("emailPass")}
                  onChange={(e) => set("emailPass", e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("senderLabel")}</Label>
                <Input
                  type="email"
                  value={get("emailFrom")}
                  onChange={(e) => set("emailFrom", e.target.value)}
                  placeholder={t("senderPlaceholder")}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground break-words">{t("senderHint")}</p>
              </div>

              <div className="space-y-2">
                <Label>{t("senderNameLabel")}</Label>
                <Input
                  value={get("emailFromName")}
                  onChange={(e) => set("emailFromName", e.target.value)}
                  placeholder={t("senderNamePlaceholder")}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 sm:p-4">
              <div className="space-y-0.5 min-w-0 flex-1">
                <Label className="break-words">{t("secureLabel")}</Label>
                <p className="text-sm text-muted-foreground break-words">{t("secureDescription")}</p>
              </div>
              <Switch
                checked={get("emailSecure") === "true"}
                onCheckedChange={(v) => set("emailSecure", v ? "true" : "false")}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="break-words">{t("testDialogTitle")}</DialogTitle>
            <DialogDescription className="break-words">{t("testDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t("testEmailLabel")}</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder={t("testEmailPlaceholder")}
              className="w-full"
            />
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setTestOpen(false)}>{t("cancelButton")}</Button>
            <Button className="w-full sm:w-auto" onClick={handleSendTest} disabled={testLoading}>
              {testLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("sendingButton")}</> : t("sendButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FloatingSaveButton saving={saving} onClick={() => save()} />
    </>
  );
}
