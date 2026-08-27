"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Key, Loader2 } from "lucide-react";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";
import { toast } from "sonner";
import { fetchTenantById, fetchTenantA2F, updateTenantA2F } from "@/services/tenants";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface WabaTemplate {
  name: string;
  language: string;
  category: string;
  status: string;
}

export default function A2FPage() {
  const t = useTranslations("configA2fPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [a2f, setA2f] = useState("disabled");
  const [a2fChannel, setA2fChannel] = useState<string | null>(null);
  const [a2fWhatsappId, setA2fWhatsappId] = useState<string | null>(null);
  const [a2fWabaTemplateId, setA2fWabaTemplateId] = useState<string | null>(null);
  const [a2fSmsProvider, setA2fSmsProvider] = useState<string | null>(null);
  const [a2fMessage, setA2fMessage] = useState("");

  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [selectedWhatsappType, setSelectedWhatsappType] = useState<string | null>(null);

  const loadTenantConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTenantById(tenantId);
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      setA2f(data?.a2f || "disabled");
      setA2fChannel(data?.a2fChannel || null);
      setA2fWhatsappId(data?.a2fWhatsappId ? String(data.a2fWhatsappId) : null);
      setA2fWabaTemplateId(data?.a2fWabaTemplateId || null);
      setA2fSmsProvider(data?.a2fSmsProvider || null);
      setA2fMessage(data?.a2fMessage || "");
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadWhatsapps = useCallback(async () => {
    try {
      const res = await fetchWhatsapps();
      const all: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      const whatsappTypes = ["whatsapp", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi", "waba"];
      setWhatsapps(all.filter((w) => whatsappTypes.includes((w as { type?: string }).type || (w as any).channel || "") && w.status === "CONNECTED"));
    } catch {
      setWhatsapps([]);
    }
  }, []);

  useEffect(() => {
    loadTenantConfig();
    loadWhatsapps();
  }, [loadTenantConfig, loadWhatsapps]);

  // Load WABA templates when a WABA whatsapp is selected
  useEffect(() => {
    if (!a2fWhatsappId) {
      setWabaTemplates([]);
      setSelectedWhatsappType(null);
      return;
    }
    const selected = whatsapps.find((w) => String(w.id) === a2fWhatsappId);
    const type = (selected as { type?: string } | undefined)?.type || (selected as any)?.channel;
    setSelectedWhatsappType(type || null);
    if (type === "waba") {
      const tokenAPI = (selected as { tokenAPI?: string } | undefined)?.tokenAPI;
      if (tokenAPI) {
        setLoadingTemplates(true);
        api.get(`/wabametaTemplate/${tokenAPI}`).then((res) => {
          const allTemplates: WabaTemplate[] = res.data?.data || [];
          setWabaTemplates(allTemplates.filter((t) => t.category === "AUTHENTICATION" && t.status === "APPROVED").sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
        }).catch(() => setWabaTemplates([])).finally(() => setLoadingTemplates(false));
      }
    } else {
      setWabaTemplates([]);
    }
  }, [a2fWhatsappId, whatsapps]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenantA2F(tenantId, {
        a2f,
        a2fChannel,
        a2fWhatsappId: a2fChannel === "whatsapp" && a2fWhatsappId ? Number(a2fWhatsappId) : null,
        a2fWabaTemplateId,
        a2fSmsProvider: a2fChannel === "sms" ? a2fSmsProvider : null,
        a2fMessage,
      });
      toast.success(t("successSave"));
    } catch {
      toast.error(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const enabled = a2f === "enabled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      >
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t("save")}
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> {t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/disable */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("enableA2f")}</Label>
              <p className="text-sm text-muted-foreground">{t("enableA2fDesc")}</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => setA2f(v ? "enabled" : "disabled")}
            />
          </div>

          {enabled && (
            <>
              {/* Channel selection */}
              <div className="space-y-2">
                <Label>{t("channelLabel")}</Label>
                <Select value={a2fChannel ?? "none"} onValueChange={(v) => {
                  const val = v === "none" ? null : v;
                  setA2fChannel(val);
                  if (val !== "whatsapp") { setA2fWhatsappId(null); setA2fWabaTemplateId(null); }
                  if (val !== "sms") setA2fSmsProvider(null);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("channelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("none")}</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* WhatsApp connection selection */}
              {a2fChannel === "whatsapp" && (
                <div className="space-y-2">
                  <Label>{t("whatsappConnection")}</Label>
                  <Select value={a2fWhatsappId ?? "none"} onValueChange={(v) => setA2fWhatsappId(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("connectionPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("noneF")}</SelectItem>
                      {whatsapps.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name} ({(w as { type?: string }).type || (w as any).channel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* WABA template selection */}
              {a2fChannel === "whatsapp" && selectedWhatsappType === "waba" && (
                <div className="space-y-2">
                  <Label>{t("wabaTemplate")}</Label>
                  {loadingTemplates ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <Select value={a2fWabaTemplateId ?? "none"} onValueChange={(v) => setA2fWabaTemplateId(v === "none" ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("templatePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        {wabaTemplates.map((t) => (
                          <SelectItem key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
                            {t.name} ({t.language})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {wabaTemplates.length === 0 && !loadingTemplates && (
                    <p className="text-xs text-muted-foreground">{t("noWabaTemplates")}</p>
                  )}
                </div>
              )}

              {/* SMS provider */}
              {a2fChannel === "sms" && (
                <div className="space-y-2">
                  <Label>{t("smsProvider")}</Label>
                  <Select value={a2fSmsProvider ?? "none"} onValueChange={(v) => setA2fSmsProvider(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("smsProviderPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("none")}</SelectItem>
                      <SelectItem value="comtele">Comtele</SelectItem>
                      <SelectItem value="conecta">ConectaStartup</SelectItem>
                      <SelectItem value="livson">Livson / BHI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Message (disabled for WABA) */}
              {!(a2fChannel === "whatsapp" && selectedWhatsappType === "waba") && (
                <div className="space-y-2">
                  <Label>{t("messageLabel")}</Label>
                  <Textarea
                    value={a2fMessage}
                    onChange={(e) => setA2fMessage(e.target.value)}
                    placeholder={t("defaultMessage", { code: "{code}" })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">{t("messageHint", { code: "{code}" })}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <FloatingSaveButton saving={saving} onClick={handleSave} />
    </div>
  );
}
