"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, FileDown, Loader2, AlertTriangle, CheckCircle2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { fetchContacts } from "@/services/contacts";
import Link from "next/link";
import {
  previewChannelHistoryImport,
  executeChannelHistoryImport,
  type PreviewResult,
  type ExecuteResult
} from "@/services/channel-history-import";

interface ContactOption {
  id: number;
  name?: string;
  number: string;
}

export default function ImportarHistoricoPage() {
  const t = useTranslations("channelHistoryImport");

  const [channels, setChannels] = useState<Whatsapp[]>([]);
  const [whatsappId, setWhatsappId] = useState<string>("");
  const [contactNumber, setContactNumber] = useState<string>("");
  const [myName, setMyName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ExecuteResult | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWhatsapps();
        setChannels(res.data || []);
      } catch {
        toast.error(t("errorLoadChannels"));
      }
    })();
  }, [t]);

  // Contact search debounced
  useEffect(() => {
    if (!contactQuery || contactQuery.length < 2) {
      setContactOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const res = await fetchContacts({ searchParam: contactQuery, pageNumber: 1, pageSize: 20 });
        const raw = Array.isArray(res.data?.contacts) ? res.data.contacts : [];
        setContactOptions(raw.map((c: Record<string, unknown>) => ({
          id: Number(c.id),
          name: c.name as string | undefined,
          number: String(c.number || "")
        })));
      } catch {
        setContactOptions([]);
      } finally {
        setLoadingContacts(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [contactQuery]);

  const ALLOWED_TYPES = useMemo(() => new Set(["waba", "baileys", "zapo", "whatsapp", "evo", "evogo", "meow", "uazapi", "zapi"]), []);
  const allowedChannels = useMemo(
    () => channels.filter(c => c.type && ALLOWED_TYPES.has(c.type)),
    [channels, ALLOWED_TYPES]
  );
  const selectedChannel = useMemo(() => allowedChannels.find(c => String(c.id) === whatsappId), [allowedChannels, whatsappId]);

  const onPickFile = useCallback(async (f: File) => {
    setFile(f);
    setPreview(null);
    setMyName("");
    setLoadingPreview(true);
    try {
      const result = await previewChannelHistoryImport(f);
      setPreview(result);
      if (result.detectedMyName) setMyName(result.detectedMyName);
      toast.success(t("previewReady", { count: result.totalMessages }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || t("errorPreview");
      toast.error(t("errorPreviewWith", { msg }));
      setFile(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [t]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
  }, [onPickFile]);

  const canExecute = !!file && !!preview && !!whatsappId && !!contactNumber.trim() && !!myName && !executing;

  const onExecute = useCallback(async () => {
    if (!file || !whatsappId || !contactNumber.trim() || !myName) return;
    setExecuting(true);
    try {
      const result = await executeChannelHistoryImport({
        zip: file,
        whatsappId: Number(whatsappId),
        contactNumber: contactNumber.trim(),
        myName
      });
      toast.success(t("executeSuccess", { created: result.totalCreated, media: result.totalMediaCopied }));
      setLastResult(result);
      // Reset upload state but keep result visible
      setFile(null);
      setPreview(null);
      setContactNumber("");
      setMyName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || t("errorExecute");
      toast.error(t("errorExecuteWith", { msg }));
    } finally {
      setExecuting(false);
    }
  }, [file, whatsappId, contactNumber, myName, t]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    setMyName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <PageHeader title={t("title")} description={t("description")} />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("noteTitle")}</AlertTitle>
        <AlertDescription>{t("noteDesc")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("step1Title")}</CardTitle>
          <CardDescription>{t("step1Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="channel">{t("channelLabel")}</Label>
            <Select value={whatsappId} onValueChange={setWhatsappId}>
              <SelectTrigger id="channel">
                <SelectValue placeholder={t("channelPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {allowedChannels.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">{t("noChannelsAvailable")}</div>
                )}
                {allowedChannels.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name} <span className="text-xs text-muted-foreground ml-2">({c.type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedChannel && (
              <p className="text-xs text-muted-foreground">{t("channelHint", { type: selectedChannel.type })}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("step2Title")}</CardTitle>
          <CardDescription>{t("step2Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="contactNumber">{t("contactNumberLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="contactNumber"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder={t("contactNumberPlaceholder")}
              />
              <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon" title={t("searchContactTitle")}>
                    <Search className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[360px]" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t("searchContactPlaceholder")}
                      value={contactQuery}
                      onValueChange={setContactQuery}
                    />
                    <CommandList>
                      {loadingContacts && (
                        <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> {t("loading")}
                        </div>
                      )}
                      {!loadingContacts && contactOptions.length === 0 && contactQuery.length >= 2 && (
                        <CommandEmpty>{t("noContactsFound")}</CommandEmpty>
                      )}
                      {!loadingContacts && contactOptions.length > 0 && (
                        <CommandGroup>
                          {contactOptions.map(c => (
                            <CommandItem
                              key={c.id}
                              value={String(c.id)}
                              onSelect={() => {
                                setContactNumber(c.number || "");
                                setContactSearchOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm">{c.name || c.number}</span>
                                {c.name && <span className="text-xs text-muted-foreground">{c.number}</span>}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">{t("contactNumberHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("step3Title")}</CardTitle>
          <CardDescription>{t("step3Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md py-10 px-4 text-center">
              <FileDown className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm mb-2">{t("uploadPrompt")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={onFileChange}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingPreview}
              >
                {loadingPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {t("uploadButton")}
              </Button>
              <p className="text-xs text-muted-foreground mt-3">{t("uploadHint")}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 border rounded-md p-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileDown className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                    {preview && (
                      <span> · {t("previewSummary", {
                        total: preview.totalMessages,
                        media: preview.mediaFilesInZip.length
                      })}</span>
                    )}
                  </p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={handleClearFile} disabled={executing}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {preview && (
            <div className="grid gap-2">
              <Label htmlFor="myName">{t("myNameLabel")}</Label>
              <Select value={myName} onValueChange={setMyName}>
                <SelectTrigger id="myName">
                  <SelectValue placeholder={t("myNamePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {preview.senders.map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                      {s === preview.detectedMyName && (
                        <span className="text-xs text-blue-500 ml-2">{t("detectedMark")}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("myNameHint")}</p>
            </div>
          )}

          {preview && preview.sampleMessages.length > 0 && (
            <div className="border rounded-md p-3 bg-muted/20">
              <p className="text-xs font-semibold mb-2">{t("previewTitle")}</p>
              <div className="space-y-1 text-xs">
                {preview.sampleMessages.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{m.date} {m.time}</span>
                    <span className="font-medium shrink-0">{m.sender}:</span>
                    <span className="truncate">
                      {m.isHiddenMedia
                        ? t("previewHiddenMedia")
                        : m.attachmentName
                        ? t("previewAttachment", { name: m.attachmentName })
                        : m.body}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              {t("resultTitle")}
            </CardTitle>
            <CardDescription>
              {t("resultSummary", {
                created: lastResult.totalCreated,
                skipped: lastResult.totalSkipped,
                media: lastResult.totalMediaCopied
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Link href={`/atendimento?ticketId=${lastResult.ticketId}`} prefetch={false}>
              <Button variant="default">
                {t("openTicket", { id: lastResult.ticketId })}
              </Button>
            </Link>
            <Button variant="ghost" onClick={() => setLastResult(null)}>
              {t("dismissResult")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onExecute}
          disabled={!canExecute}
        >
          {executing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {t("executeButton")}
        </Button>
      </div>
    </div>
  );
}
