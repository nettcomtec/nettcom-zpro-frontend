"use client";

import React, { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Send, RefreshCw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { fetchContacts } from "@/services/contacts";
import { sendBulkSms, sendBulkSmsConecta, sendBulkSmsLivson } from "@/services/bulk";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";

const SERVICES = [
  { label: "Comtele", value: "comtele" },
  { label: "ConectaStartup", value: "conecta" },
  { label: "BHI", value: "livson" },
];

export default function MassaSmsPage() {
  const t = useTranslations("massaSmsPage");
  const tCsv = useTranslations("bulkCsvImport");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
  const [service, setService] = useState("");
  const [numberInput, setNumberInput] = useState("");
  const [message, setMessage] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [importContacts, setImportContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<{ label: string; value: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  const loadContacts = async () => {
    setLoadingContacts(true);
    setContactOptions([]);
    try {
      let page = 1;
      let hasMore = true;
      const all: { label: string; value: string }[] = [];
      while (hasMore) {
        const res = await fetchContacts({ pageNumber: page, searchParam: contactSearch });
        const data = res.data as { contacts: { name: string; number: string; isGroup?: boolean }[]; hasMore: boolean };
        const filtered = (data.contacts || [])
          .filter((c) => !c.isGroup)
          .map((c) => ({ label: c.name, value: c.number }));
        all.push(...filtered);
        hasMore = data.hasMore;
        page++;
        if (hasMore) await new Promise((r) => setTimeout(r, 800));
      }
      setContactOptions(all);
    } catch {
      toast.error(t("errorLoadContacts"));
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleImportToggle = (val: boolean) => {
    setImportContacts(val);
    if (val && contactOptions.length === 0) loadContacts();
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt")) {
      toast.warning(tCsv("onlyCsvTxtAccepted"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvImport({ fileName: file.name, content: String(ev.target?.result ?? "") });
    };
    reader.readAsText(file, "UTF-8");
  };

  const toggleContact = (c: { label: string; value: string }) => {
    setSelectedContacts((prev) =>
      prev.some((x) => x.value === c.value)
        ? prev.filter((x) => x.value !== c.value)
        : [...prev, c]
    );
  };

  const handleSend = async () => {
    if (!service) { toast.warning(t("selectService")); return; }
    const minInt = parseInt(min, 10);
    const maxInt = parseInt(max, 10);
    if (isNaN(minInt) || isNaN(maxInt)) { toast.warning(t("validMinMax")); return; }
    if (!message.trim()) { toast.warning(t("typeMessage")); return; }

    let numbers: string[] = [];
    if (importContacts) {
      numbers = selectedContacts.map((c) => c.value);
    } else {
      numbers = numberInput.split(",").map((n) => n.trim()).filter(Boolean);
    }
    if (numbers.length === 0) { toast.warning(t("atLeastOneNumber")); return; }

    const payload = { arrayNumbers: numbers, message, min: minInt, max: maxInt, importContact: importContacts };

    setSending(true);
    try {
      if (service === "comtele") {
        await sendBulkSms(payload);
        toast.success(t("successComtele"));
      } else if (service === "conecta") {
        await sendBulkSmsConecta(payload);
        toast.success(t("successConecta"));
      } else if (service === "livson") {
        await sendBulkSmsLivson(payload);
        toast.success(t("successBhi"));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (err as { message?: string })?.message
        || "Erro ao enviar SMS";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleClear = () => {
    setService("");
    setNumberInput("");
    setMessage("");
    setMin("");
    setMax("");
    setSelectedContacts([]);
    setImportContacts(false);
    toast.info(t("fieldsCleared"));
  };

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
        {/* Service */}
        <div className="grid gap-2">
          <Label>{t("labelService")}</Label>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectService")} />
            </SelectTrigger>
            <SelectContent>
              {SERVICES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Delays */}
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label>Min (s)</Label>
            <Input value={min} onChange={(e) => setMin(e.target.value)} placeholder="5" />
          </div>
          <div className="grid gap-2">
            <Label>Max (s)</Label>
            <Input value={max} onChange={(e) => setMax(e.target.value)} placeholder="15" />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Switch id="import-contacts" checked={importContacts} onCheckedChange={handleImportToggle} />
            <Label htmlFor="import-contacts">{t("importContacts")}</Label>
          </div>
        </div>

        {/* Contact import */}
        {importContacts && (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar contatos..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
              <Button variant="outline" onClick={loadContacts} disabled={loadingContacts}>
                {loadingContacts ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("search")}
              </Button>
            </div>
            {selectedContacts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedContacts.map((c) => (
                  <span key={c.value} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                    {c.label}
                    <button onClick={() => toggleContact(c)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded border">
              {contactOptions.map((c) => (
                <div
                  key={c.value}
                  className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm hover:bg-muted ${selectedContacts.some((x) => x.value === c.value) ? "bg-primary/10" : ""}`}
                  onClick={() => toggleContact(c)}
                >
                  <span>{c.label}</span>
                  <span className="text-muted-foreground">{c.value}</span>
                </div>
              ))}
              {contactOptions.length === 0 && !loadingContacts && (
                <p className="p-3 text-center text-sm text-muted-foreground">{t("noContacts")}</p>
              )}
            </div>
          </div>
        )}

        {/* Manual numbers */}
        {!importContacts && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-2">
              <Label>{t("labelNumbers")}</Label>
              <Input
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                placeholder="5511999999999,5511888888888"
              />
            </div>
            <div className="grid gap-2">
              <Label>CSV</Label>
              <Button variant="outline" size="icon" onClick={() => csvRef.current?.click()}>
                <Upload className="h-4 w-4" />
              </Button>
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
              <BulkCsvImportDialog
                open={!!csvImport}
                onOpenChange={(o) => {
                  if (!o) setCsvImport(null);
                }}
                fileName={csvImport?.fileName ?? ""}
                content={csvImport?.content ?? ""}
                mode="allFields"
                minDigits={8}
                maxDigits={20}
                onImport={({ text, count }) => {
                  setNumberInput(text);
                  toast.success(tCsv("importedToast", { count }));
                  setCsvImport(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Message */}
        <div className="grid gap-2">
          <Label>{t("labelMessage")}</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("placeholderMessage")}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">{message.length}/160 {t("characters")}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button disabled={sending} onClick={handleSend}>
            {sending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sending ? t("sending") : t("send")}
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={sending}>
            {t("clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
