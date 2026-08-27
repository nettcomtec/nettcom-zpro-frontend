"use client";

/**
 * MassaTextoVariavel — matches Vue's MassaTextoVariavel.vue
 *
 * Data format for each line (textarea or CSV):
 *   number,var1,var2,...
 *
 * Message uses {{var1}}, {{var2}} etc as placeholders.
 * Channel restriction: baileys / meow / evo / zapi / uazapi (same as texto tab).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseBulkCsv, type BulkInvalidLine } from "@/lib/bulk-csv-parser";
import { detectBrPhoneAmbiguity, normalizeBrPhone } from "@/lib/phone-utils";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, RefreshCw, X, Pause, PlayCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { sendBulkVariable, sendBulkVariableJson, createDispatch, BULK_TEXT_CHANNEL_TYPES } from "@/services/bulk";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchWallets } from "@/services/wallets";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { WhatsAppPreview } from "@/components/massa/whatsapp-preview";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";

interface ConnectionOption {
  label: string;
  value: string;
  type: string;
}

/** Resposta aditiva do backend (cross-channel ticket check): campos podem estar ausentes */
function isSkippedResponse(res: unknown): boolean {
  const data = (res as { data?: { skipped?: number; skippedNumbers?: unknown } } | null)?.data;
  if (!data) return false;
  return (
    Number(data.skipped ?? 0) > 0 ||
    (Array.isArray(data.skippedNumbers) && data.skippedNumbers.length > 0)
  );
}

function supportsRemoteMedia(selectedConns: ConnectionOption[]) {
  return (
    selectedConns.length > 0 &&
    selectedConns.some(
      (w) =>
        w.type !== "baileys" &&
        w.type !== "meow" &&
        w.type !== "evo" &&
        w.type !== "zapi" &&
        w.type !== "uazapi" &&
        w.type !== "zapo"
    )
  );
}

export default function MassaTextoVariavelPage() {
  const t = useTranslations("massaTextoVariavelPage");
  const tWarn = useTranslations("bulkPhoneWarnings");
  // Título do preview WhatsApp (chave existente ×13 locales)
  const tPreview = useTranslations("massaRelatorioPage");
  const tCsv = useTranslations("bulkCsvImport");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [sentCount, setSentCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [progresso, setProgresso] = useState(0);

  // Guarda de saída: alerta ao fechar/atualizar a aba durante um disparo e marca
  // o dispatch como cancelado no backend via fetch keepalive (axios não suporta
  // keepalive) — mesmo endpoint PUT /bulk-dispatch/:id do updateDispatch (services/bulk.ts).
  const sendingRef = useRef(false);
  const bulkDispatchIdRef = useRef<number | null>(null);
  useEffect(() => {
    const cancelDispatchOnExit = () => {
      if (!sendingRef.current || !bulkDispatchIdRef.current) return;
      try {
        const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";
        let token: string | null = null;
        try {
          const raw = localStorage.getItem("token");
          token = raw ? (JSON.parse(raw) as string) : null;
        } catch {
          token = null;
        }
        void fetch(`${baseURL}/bulk-dispatch/${bulkDispatchIdRef.current}`, {
          method: "PUT",
          keepalive: true,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: "cancelled", cancellationReason: "browser_closed" }),
        }).catch(() => undefined);
      } catch {
        // best-effort
      }
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!sendingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", cancelDispatchOnExit);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", cancelDispatchOnExit);
    };
  }, []);

  // Connections
  const [connections, setConnections] = useState<Whatsapp[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<ConnectionOption[]>([]);

  // Delay
  const [minDelay, setMinDelay] = useState("");
  const [maxDelay, setMaxDelay] = useState("");

  // Groups toggle
  const [isGroup, setIsGroup] = useState(false);

  // Data input — each line: number,var1,var2,...
  const [dataInput, setDataInput] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  // Content toggles
  const [includeText, setIncludeText] = useState(false);
  const [message, setMessage] = useState("");

  // Remote media (non-baileys only)
  const [includeMedia, setIncludeMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaDescription, setMediaDescription] = useState("");

  // Voice URL (non-baileys only)
  const [includeVoice, setIncludeVoice] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");

  // Local file
  const [includeFile, setIncludeFile] = useState(false);
  const [voiceLocal, setVoiceLocal] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState("");
  const localFileRef = useRef<HTMLInputElement>(null);

  // Pós-envio: fechar / atribuir fila / atribuir usuário
  const [fecharTicket, setFecharTicket] = useState(true);
  const [assignQueue, setAssignQueue] = useState(false);
  const [assignUser, setAssignUser] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedAssignQueueId, setSelectedAssignQueueId] = useState<string>("");
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>("");

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWhatsapps();
      const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const all = filterWhatsappsForCurrentUser(raw);
      setConnections(
        all.filter(
          (c) =>
            BULK_TEXT_CHANNEL_TYPES.includes((c.type || "").toLowerCase()) &&
            c.status === "CONNECTED"
        )
      );
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const loadAssignQueues = useCallback(async () => {
    try {
      const res = await fetchQueues();
      const sorted = [...(res.data || [])].sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setQueues(sorted);
    } catch {
      toast.error(t("errorLoadQueues"));
    }
  }, []);

  const loadAssignUsers = useCallback(async () => {
    try {
      const { data } = await fetchWallets();
      const list = (data as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin");
      const sorted = list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
      setAssignUsers(sorted.map((u) => ({ id: u.id, name: u.name })));
    } catch {
      toast.error(t("errorLoadUsers"));
    }
  }, []);

  useEffect(() => { if (assignQueue && queues.length === 0) loadAssignQueues(); }, [assignQueue, queues.length, loadAssignQueues]);
  useEffect(() => { if (assignUser && assignUsers.length === 0) loadAssignUsers(); }, [assignUser, assignUsers.length, loadAssignUsers]);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const toggleConnection = (conn: ConnectionOption) => {
    setSelectedConnections((prev) => {
      const exists = prev.find((c) => c.value === conn.value);
      if (exists) return prev.filter((c) => c.value !== conn.value);
      return [...prev, conn];
    });
  };

  const removeConnection = (value: string) => {
    setSelectedConnections((prev) => prev.filter((c) => c.value !== value));
  };

  const minVarCount = useMemo(() => {
    const sources: string[] = [];
    if (includeText && message) sources.push(message);
    if (includeMedia && mediaDescription) sources.push(mediaDescription);
    if (includeFile && !voiceLocal && fileDescription) sources.push(fileDescription);
    let max = 0;
    for (const src of sources) {
      const matches = src.match(/\{\{var(\d+)\}\}/g) || [];
      for (const m of matches) {
        const n = parseInt(m.replace(/\{\{var|\}\}/g, ""), 10);
        if (n > max) max = n;
      }
    }
    return max;
  }, [includeText, message, includeMedia, mediaDescription, includeFile, voiceLocal, fileDescription]);

  const parsedBulk = useMemo(() => {
    if (!dataInput.trim()) return { valid: [], invalid: [] as BulkInvalidLine[] };
    return parseBulkCsv(dataInput, minVarCount > 0 ? { minVarCount } : undefined);
  }, [dataInput, minVarCount]);

  const ambiguousLines = useMemo(() => {
    const out: { lineNumber: number; raw: string; normalized: string; reason: string }[] = [];
    for (const line of parsedBulk.valid) {
      const a = detectBrPhoneAmbiguity(line.number);
      if (a) out.push({ lineNumber: line.lineNumber, raw: a.raw, normalized: a.normalized, reason: a.reason });
    }
    return out;
  }, [parsedBulk.valid]);

  const duplicateGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const line of parsedBulk.valid) {
      const norm = normalizeBrPhone(line.number) || line.number;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(line.lineNumber);
    }
    return Array.from(map.entries())
      .filter(([, lines]) => lines.length > 1)
      .map(([normalized, lines]) => ({ normalized, lines }));
  }, [parsedBulk.valid]);


  const handleSend = async () => {
    if (selectedConnections.length === 0) {
      toast.error(t("errorSelectConnection"));
      return;
    }
    if (!includeText && !includeMedia && !includeVoice && !includeFile) {
      toast.error(t("errorSelectContent"));
      return;
    }
    if (!dataInput.trim()) {
      toast.error(t("errorNoData"));
      return;
    }
    if (parsedBulk.invalid.length > 0) {
      toast.error(t("fixInvalidLinesFirst"));
      return;
    }
    if (parsedBulk.valid.length === 0) {
      toast.error(t("noValidLines"));
      return;
    }

    // Não dedupamos lines pelo número aqui: cada linha pode trazer variáveis
    // diferentes para o mesmo destinatário (uso intencional). O painel
    // "Duplicatas" apenas informa que o destinatário se repete.
    const lines = parsedBulk.valid;
    const minInt = parseInt(minDelay, 10) || 1;
    const maxInt = parseInt(maxDelay, 10) || 3;

    setSending(true);
    sendingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setSentCount(0);
    setSkippedCount(0);
    setTotalMessages(lines.length);
    setProgresso(0);
    let skippedTotal = 0;

    // Criar registro de tracking no bulk-dispatch (igual ao Vue antigo)
    let bulkDispatchId: number | null = null;
    try {
      const dispatch = await createDispatch({
        dispatchType: "text_variable",
        totalMessages: lines.length,
        whatsappId: selectedConnections[0]?.value ? Number(selectedConnections[0].value) : null,
        message: includeText ? message : null,
        mediaUrl: includeMedia ? mediaUrl : null,
        mediaDescription: includeMedia ? mediaDescription : null,
        voiceUrl: includeVoice ? voiceUrl : null,
        isGroup,
        minDelay: minInt,
        maxDelay: maxInt,
        metadata: {
          whatsappType: selectedConnections[0]?.type || null,
          media: includeMedia,
          voice: includeVoice,
          mediaLocal: includeFile && !voiceLocal,
          voiceLocal: includeFile && voiceLocal,
          multipleWhatsapps: selectedConnections.map((w) => ({ id: Number(w.value), type: w.type })),
        },
      });
      bulkDispatchId = dispatch.data?.id ?? null;
      bulkDispatchIdRef.current = bulkDispatchId;
    } catch (err) {
      logger.error("Erro ao criar BulkDispatch:", err);
    }

    // Pós-envio: fechar ticket OU atribuir fila/user (combináveis)
    const bulkAssignExtras: Record<string, unknown> = {};
    if (assignQueue && selectedAssignQueueId) bulkAssignExtras.assignQueueId = Number(selectedAssignQueueId);
    if (assignUser && selectedAssignUserId) bulkAssignExtras.assignUserId = Number(selectedAssignUserId);
    bulkAssignExtras.closeTicket = fecharTicket && !assignQueue && !assignUser;

    for (let i = 0; i < lines.length; i++) {
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const number = lines[i].number;
      const vars = lines[i].vars;

      const fmt = (tpl: string) =>
        tpl.replace(/\{\{var(\d+)\}\}/g, (_, idx) => vars[parseInt(idx) - 1] || "");

      const randomConn =
        selectedConnections[Math.floor(Math.random() * selectedConnections.length)];
      const randomDelay =
        Math.floor(Math.random() * (maxInt - minInt + 1) + minInt) * 1000;

      try {
        let lineSkipped = false;
        if (includeText && message.trim()) {
          const res = await sendBulkVariableJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            number: number,
            message: fmt(message),
            min: minInt,
            max: maxInt,
            groups: isGroup,
            idFront: crypto.randomUUID(),
            sendType: "chat",
            ...(bulkDispatchId ? { bulkDispatchId } : {}),
            ...bulkAssignExtras,
          });
          if (isSkippedResponse(res)) lineSkipped = true;
        }
        if (includeMedia && mediaUrl.trim()) {
          const res = await sendBulkVariableJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            number: number,
            min: minInt,
            max: maxInt,
            groups: isGroup,
            idFront: crypto.randomUUID(),
            sendType: "chat",
            media: true,
            mediaUrl: mediaUrl.trim(),
            mediaDescription: mediaDescription.trim() ? fmt(mediaDescription) : undefined,
            ...(bulkDispatchId ? { bulkDispatchId } : {}),
            ...bulkAssignExtras,
          });
          if (isSkippedResponse(res)) lineSkipped = true;
        }
        if (includeVoice && voiceUrl.trim()) {
          const res = await sendBulkVariableJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            number: number,
            min: minInt,
            max: maxInt,
            groups: isGroup,
            idFront: crypto.randomUUID(),
            sendType: "chat",
            voice: true,
            voiceUrl: voiceUrl.trim(),
            ...(bulkDispatchId ? { bulkDispatchId } : {}),
            ...bulkAssignExtras,
          });
          if (isSkippedResponse(res)) lineSkipped = true;
        }
        if (includeFile && localFile) {
          const formData = new FormData();
          formData.append("whatsappId", randomConn.value);
          formData.append("whatsappType", randomConn.type);
          formData.append("number", number);
          formData.append("min", String(minInt));
          formData.append("max", String(maxInt));
          formData.append("groups", String(isGroup));
          formData.append("idFront", crypto.randomUUID());
          formData.append("sendType", "chat");
          formData.append("mediaLocal", "true");
          formData.append("medias", localFile, localFile.name);
          if (bulkDispatchId) formData.append("bulkDispatchId", String(bulkDispatchId));
          if (voiceLocal) {
            formData.append("voiceLocal", "true");
          } else if (fileDescription.trim()) {
            formData.append("mediaLocalDescription", fmt(fileDescription));
          }
          if (bulkAssignExtras.assignQueueId) formData.append("assignQueueId", String(bulkAssignExtras.assignQueueId));
          if (bulkAssignExtras.assignUserId) formData.append("assignUserId", String(bulkAssignExtras.assignUserId));
          formData.append("closeTicket", String(bulkAssignExtras.closeTicket));
          const res = await sendBulkVariable(formData);
          if (isSkippedResponse(res)) lineSkipped = true;
        }

        if (lineSkipped) {
          skippedTotal += 1;
          setSkippedCount((c) => c + 1);
        } else {
          setSentCount((c) => c + 1);
        }
        setProgresso(((i + 1) / lines.length) * 100);
      } catch (err) {
        logger.error(`Erro ao enviar para ${number}:`, err);
      }

      if (i < lines.length - 1) {
        await new Promise((r) => setTimeout(r, randomDelay));
      }
    }

    setSending(false);
    sendingRef.current = false;
    bulkDispatchIdRef.current = null;
    setIsPaused(false);
    isPausedRef.current = false;
    toast.success(t("successSend"));
    if (skippedTotal > 0) {
      toast.info(t("skippedToastSummary", { count: skippedTotal }));
    }
  };

  const clearFields = () => {
    setMessage("");
    setDataInput("");
    setMinDelay("");
    setMaxDelay("");
    setMediaUrl("");
    setMediaDescription("");
    setVoiceUrl("");
    setSelectedConnections([]);
    setIncludeText(false);
    setIncludeMedia(false);
    setIncludeVoice(false);
    setIncludeFile(false);
    setVoiceLocal(false);
    setLocalFile(null);
    setFileDescription("");
    setAssignQueue(false);
    setSelectedAssignQueueId("");
    setAssignUser(false);
    setSelectedAssignUserId("");
    setFecharTicket(true);
    setSentCount(0);
    setSkippedCount(0);
    setTotalMessages(0);
    setProgresso(0);
    if (localFileRef.current) localFileRef.current.value = "";
    if (csvFileRef.current) csvFileRef.current.value = "";
    toast.warning(t("fieldsCleared"));
  };

  const connOptions: ConnectionOption[] = connections.map((c) => ({
    label: c.name,
    value: String(c.id),
    type: c.type,
  }));

  const hasRemoteMedia = supportsRemoteMedia(selectedConnections);

  // Preview WhatsApp (Fase 5): corpo com as variáveis cruas ({{var1}} etc. —
  // sem resolver). Prioridade de mídia: arquivo local > URL > áudio por URL.
  let previewMediaFile: File | null = null;
  let previewMediaUrl: string | undefined;
  let previewMediaType: string | undefined;
  if (includeFile && localFile) {
    previewMediaFile = localFile;
    if (voiceLocal) previewMediaType = "audio";
  } else if (includeMedia && mediaUrl.trim()) {
    previewMediaUrl = mediaUrl.trim();
  } else if (includeVoice && voiceUrl.trim()) {
    previewMediaUrl = voiceUrl.trim();
    previewMediaType = "audio";
  }

  return (
    <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle>{t("cardTitle")}</CardTitle>
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection multi-select */}
        <div className="grid gap-2 md:grid-cols-6">
          <div className="md:col-span-3 space-y-2">
            <Label>{t("labelWhatsappId")}</Label>
            <Select
              onValueChange={(val) => {
                const conn = connOptions.find((c) => c.value === val);
                if (conn) toggleConnection(conn);
              }}
              value=""
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectConnectionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <SelectItem value="loading" disabled>{t("loading")}</SelectItem>
                ) : connOptions.length === 0 ? (
                  <SelectItem value="none" disabled>{t("noConnections")}</SelectItem>
                ) : (
                  connOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label} ({c.type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedConnections.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedConnections.map((c) => (
                  <Badge key={c.value} variant="secondary" className="flex items-center gap-1">
                    {c.label}
                    <button onClick={() => removeConnection(c.value)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-1 space-y-2">
            <Label>{t("minSeconds")}</Label>
            <Input placeholder="Ex: 1" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} />
          </div>
          <div className="md:col-span-1 space-y-2">
            <Label>{t("maxSeconds")}</Label>
            <Input placeholder="Ex: 3" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} />
          </div>
        </div>

        {/* Groups toggle */}
        <div className="flex items-center gap-2">
          <Switch id="isGroup" checked={isGroup} onCheckedChange={setIsGroup} />
          <Label htmlFor="isGroup">{t("groups")}</Label>
        </div>

        {/* Banner: APIs não oficiais não geram tickets */}
        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertDescription>{t("nonOfficialApiBanner")}</AlertDescription>
        </Alert>

        {/* Nota: verificação de conversas em outros canais pode pular contatos */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t("activeTicketSkipNote")}</AlertDescription>
        </Alert>

        {/* Pós-envio: fechar / atribuir fila / atribuir usuário */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="fecharTicket"
              checked={fecharTicket}
              onCheckedChange={(v) => {
                setFecharTicket(v);
                if (v) { setAssignQueue(false); setAssignUser(false); }
              }}
            />
            <Label htmlFor="fecharTicket">{t("closeTicket")}</Label>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="assignQueue"
              checked={assignQueue}
              onCheckedChange={(v) => {
                setAssignQueue(v);
                if (v) setFecharTicket(false);
                else setSelectedAssignQueueId("");
              }}
            />
            <Label htmlFor="assignQueue">{t("assignQueue")}</Label>
          </div>
          {assignQueue && (
            <div className="min-w-[200px]">
              <Select value={selectedAssignQueueId} onValueChange={setSelectedAssignQueueId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectQueue")} />
                </SelectTrigger>
                <SelectContent>
                  {queues.map((q) => (
                    <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="assignUser"
              checked={assignUser}
              onCheckedChange={(v) => {
                setAssignUser(v);
                if (v) setFecharTicket(false);
                else setSelectedAssignUserId("");
              }}
            />
            <Label htmlFor="assignUser">{t("assignUser")}</Label>
          </div>
          {assignUser && (
            <div className="min-w-[200px]">
              <Select value={selectedAssignUserId} onValueChange={setSelectedAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectUser")} />
                </SelectTrigger>
                <SelectContent>
                  {assignUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Data input / CSV */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Label>{t("labelData")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full hover:bg-muted p-0.5"
                    aria-label="info"
                  >
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 text-xs whitespace-pre-line" align="start">
                  {tWarn("behaviorInfo")}
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleCSVUpload}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => csvFileRef.current?.click()}
                disabled={sending}
              >
                <Upload className="h-3 w-3" /> {t("importCsv")}
              </Button>
              <BulkCsvImportDialog
                open={!!csvImport}
                onOpenChange={(o) => {
                  if (!o) setCsvImport(null);
                }}
                fileName={csvImport?.fileName ?? ""}
                content={csvImport?.content ?? ""}
                mode="fullRows"
                onImport={({ text, count }) => {
                  setDataInput(text);
                  toast.success(t("csvImported", { count }));
                  setCsvImport(null);
                }}
              />
            </div>
          </div>

          {/* Instruction box */}
            <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{t("formatInstructionsTitle")}</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>{t("formatInstruction1")}</li>
                  <li>
                    {t("formatInstruction2")}{" "}
                    <code className="rounded bg-blue-100 px-1 dark:bg-blue-900/40">
                      5511999999999,&quot;Olá, João&quot;,Produto A
                    </code>
                  </li>
                  <li>{t("formatInstruction3")}</li>
                </ul>
              </div>
            </div>

            <Textarea
              placeholder={"5511999999999,João,Produto A\n5521888888888,Maria,Produto B"}
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />

            {/* Counts + invalid lines panel */}
            {dataInput.trim() && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {parsedBulk.valid.length} {t("validLines")}
                  {parsedBulk.invalid.length > 0 && (
                    <span className="text-destructive ml-2">
                      — {parsedBulk.invalid.length} {t("invalidLines")}
                    </span>
                  )}
                  {ambiguousLines.length > 0 && (
                    <span className="text-amber-600 dark:text-amber-500 ml-2">
                      — {ambiguousLines.length} {tWarn("count")}
                    </span>
                  )}
                  {duplicateGroups.length > 0 && (
                    <span className="text-sky-600 dark:text-sky-500 ml-2">
                      — {duplicateGroups.reduce((acc, g) => acc + g.lines.length - 1, 0)} {tWarn("duplicatesCount")}
                    </span>
                  )}
                </p>

                {parsedBulk.invalid.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-destructive">{t("invalidLinesTitle")}</p>
                      <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {parsedBulk.invalid.slice(0, 20).map((err) => (
                          <li key={err.lineNumber} className="font-mono text-[11px] break-all">
                            <span className="text-destructive">#{err.lineNumber}</span>{" "}
                            <span className="text-muted-foreground">
                              [{err.reason === "no_number"
                                ? t("errorNoNumber")
                                : err.reason === "missing_vars"
                                  ? t("errorMissingVars", { expected: err.expected ?? 0, got: err.got ?? 0 })
                                  : err.reason === "wrong_var_count"
                                    ? t("errorWrongVarCount", { expected: err.expected ?? 0, got: err.got ?? 0 })
                                    : t("errorEmpty")}]
                            </span>{" "}
                            <span>{err.raw.slice(0, 80)}{err.raw.length > 80 ? "…" : ""}</span>
                          </li>
                        ))}
                        {parsedBulk.invalid.length > 20 && (
                          <li className="text-muted-foreground italic">
                            {t("invalidLinesMore", { count: parsedBulk.invalid.length - 20 })}
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {ambiguousLines.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-amber-700 dark:text-amber-500">{tWarn("title")}</p>
                      <p className="text-muted-foreground">{tWarn("hint")}</p>
                      <ul className="space-y-1 max-h-40 overflow-y-auto pt-1">
                        {ambiguousLines.slice(0, 20).map((amb) => (
                          <li key={amb.lineNumber} className="font-mono text-[11px] break-all">
                            <span className="text-amber-700 dark:text-amber-500">#{amb.lineNumber}</span>{" "}
                            <span className="text-muted-foreground">
                              [{amb.reason === "fixed_has_9"
                                ? tWarn("reasonFixedHas9")
                                : amb.reason === "mobile_missing_9"
                                  ? tWarn("reasonMobileMissing9")
                                  : tWarn("reasonMobileHas9")}]
                            </span>{" "}
                            <span>{tWarn("lineFormat", { raw: amb.raw, normalized: amb.normalized })}</span>
                          </li>
                        ))}
                        {ambiguousLines.length > 20 && (
                          <li className="text-muted-foreground italic">
                            {tWarn("moreLines", { count: ambiguousLines.length - 20 })}
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {duplicateGroups.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-xs">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-500" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-sky-700 dark:text-sky-500">{tWarn("duplicatesTitle")}</p>
                      <p className="text-muted-foreground">{tWarn("duplicatesHintMultiSend")}</p>
                      <ul className="space-y-1 max-h-40 overflow-y-auto pt-1">
                        {duplicateGroups.slice(0, 20).map((dup) => (
                          <li key={dup.normalized} className="font-mono text-[11px] break-all">
                            <span>{tWarn("duplicateLineFormat", { normalized: dup.normalized, lines: dup.lines.join(", ") })}</span>
                          </li>
                        ))}
                        {duplicateGroups.length > 20 && (
                          <li className="text-muted-foreground italic">
                            {tWarn("moreLines", { count: duplicateGroups.length - 20 })}
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Include text */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch id="includeText" checked={includeText} onCheckedChange={setIncludeText} />
            <Label htmlFor="includeText">{t("includeText")}</Label>
          </div>
          {includeText && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t.raw("varHint") as string}
              </p>
              <Textarea
                placeholder={"Olá {{var1}}, seu produto {{var2}} está disponível!"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>
          )}
        </div>

        {/* Remote media */}
        {hasRemoteMedia && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="includeMedia" checked={includeMedia} onCheckedChange={setIncludeMedia} />
              <Label htmlFor="includeMedia">{t("includeMedia")}</Label>
            </div>
            {includeMedia && (
              <div className="space-y-2">
                <Input
                  placeholder={t("mediaUrlPlaceholder")}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                <Textarea
                  placeholder={t("mediaDescPlaceholder")}
                  value={mediaDescription}
                  onChange={(e) => setMediaDescription(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
        )}

        {/* Voice URL */}
        {hasRemoteMedia && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="includeVoice" checked={includeVoice} onCheckedChange={setIncludeVoice} />
              <Label htmlFor="includeVoice">{t("includeVoice")}</Label>
            </div>
            {includeVoice && (
              <Input
                placeholder={t("voiceUrlPlaceholder")}
                value={voiceUrl}
                onChange={(e) => setVoiceUrl(e.target.value)}
              />
            )}
          </div>
        )}

        {/* Local file */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch id="includeFile" checked={includeFile} onCheckedChange={setIncludeFile} />
            <Label htmlFor="includeFile">{t("includeFile")}</Label>
          </div>
          {includeFile && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="voiceLocal"
                  checked={voiceLocal}
                  onChange={(e) => setVoiceLocal(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="voiceLocal" className="text-sm">{t("voiceRecorded")}</label>
              </div>
              <Input
                type="file"
                ref={localFileRef}
                onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
              />
              {!voiceLocal && (
                <Textarea
                  placeholder={t("fileDescPlaceholder")}
                  value={fileDescription}
                  onChange={(e) => setFileDescription(e.target.value)}
                  rows={2}
                />
              )}
            </div>
          )}
        </div>

        {/* Progress */}
        {sending && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                {isPaused ? (
                  <span className="text-yellow-600 font-medium">{t("dispatchPaused")} — </span>
                ) : null}
                {t("progressMsg", { sent: sentCount, total: totalMessages })}
                {skippedCount > 0 && <span className="text-amber-600 dark:text-amber-500 ml-2">— {t("skippedLabel")}: {skippedCount}</span>}
              </p>
              {!isPaused ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-yellow-600 border-yellow-500 hover:bg-yellow-50"
                  onClick={() => { isPausedRef.current = true; setIsPaused(true); }}
                >
                  <Pause className="h-3 w-3" /> {t("pauseDispatch")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-green-600 border-green-500 hover:bg-green-50"
                  onClick={() => { isPausedRef.current = false; setIsPaused(false); }}
                >
                  <PlayCircle className="h-3 w-3" /> {t("resumeDispatch")}
                </Button>
              )}
            </div>
            <Progress value={progresso} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            disabled={
              sending ||
              parsedBulk.invalid.length > 0 ||
              (dataInput.trim() !== "" && parsedBulk.valid.length === 0)
            }
            onClick={handleSend}
          >
            {sending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {sending ? t("sending") : t("send")}
          </Button>
          <Button variant="outline" onClick={clearFields} disabled={sending}>
            {t("clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
    {/* Preview WhatsApp ao lado do formulário (xl+); abaixo do form em telas menores */}
    <div className="flex flex-col items-center gap-2 xl:sticky xl:top-6">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {tPreview("previewTitle")}
      </p>
      <WhatsAppPreview
        message={includeText ? message : ""}
        mediaFile={previewMediaFile}
        mediaUrl={previewMediaUrl}
        mediaType={previewMediaType}
      />
    </div>
    </div>
    </div>
  );
}
