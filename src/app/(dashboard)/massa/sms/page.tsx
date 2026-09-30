"use client";

import React, { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Send, RefreshCw, Upload, X, AlertCircle, ChevronDown, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddressFilterFields } from "@/components/contatos/address-filter-fields";
import {
  type AddressFilter,
  AddressFilterUnsupportedError,
  EMPTY_ADDRESS_FILTER,
  addressFilterActiveCount,
  assertAddressFilterEcho,
  toAddressQuery,
} from "@/lib/address-filter";
import { cn } from "@/lib/utils";
import { fetchContacts } from "@/services/contacts";
import {
  sendBulkSms, sendBulkSmsConecta, sendBulkSmsLivson, type SmsBulkResult,
  startBulkSmsDispatch, fetchActiveBulkSmsDispatch, fetchBulkSmsDispatch, cancelBulkSmsDispatch,
  readBulkSmsErrorCode, readBulkSmsErrorStatus, readBulkSmsErrorData, isLegacyBackend404,
  isSmsBulkDispatchActive, SMS_BULK_FALLBACK_CODES,
  type SmsBulkDispatchLean, type SmsBulkDispatchStartResult, type SmsBulkProvider,
} from "@/services/bulk";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";
import { SendProgressModal } from "@/components/massa/send-progress-modal";

const SERVICES = [
  { label: "Comtele", value: "comtele" },
  { label: "ConectaStartup", value: "conecta" },
  { label: "BHI", value: "livson" },
];

// Envio em segundo plano (docs/PLANO_SMS_MASSA_SEGUNDO_PLANO.md §5.7).
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_BACKOFF_MS = 15000;
const MAX_DELAY_SECONDS = 3600;
// Fim em `failed` por um destes motivos é interrupção, não "nenhum enviado".
const ABORT_REASONS = new Set([
  "ERR_SMS_INVALID_KEY",
  "ERR_SMS_PROVIDER_REJECTED",
  "ERR_SMS_TOKEN_NOT_FOUND",
  "ERR_SMS_BULK_INTERRUPTED",
]);

type NoticeTone = "success" | "error" | "warning" | "info";
type BulkNotice = { tone: NoticeTone; text: string };
type BulkSummary = NonNullable<SmsBulkResult["summary"]>;

const toCount = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const isPageVisible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

// Cancelado com um número reservado ainda sem resultado: o servidor grava esse
// número em até 5 min (teto por envio) ou a varredura o concilia; até lá a tela
// segue consultando, para o aviso final não sair com a contagem congelada.
const CANCEL_SETTLE_MAX_MS = 8 * 60 * 1000;
const hasInFlightGap = (d: SmsBulkDispatchLean) =>
  toCount(d.totalMessages) - toCount(d.pendingMessages) > toCount(d.sentMessages) + toCount(d.failedMessages);

// Mesmo id no "cancelado" e no resultado final: o segundo aviso substitui o primeiro.
const cancelToastId = (id: number) => `sms-bulk-cancel-${id}`;

// Disparo terminado no formato do resultado do envio síncrono: o aviso é o mesmo nos dois caminhos.
const dispatchToResult = (d: SmsBulkDispatchLean): SmsBulkResult & { summary: BulkSummary } => {
  const total = toCount(d.totalMessages);
  const sent = toCount(d.sentMessages);
  const failed = toCount(d.failedMessages);
  const reason = d.cancellationReason || undefined;
  return {
    summary: { total, success: sent, errors: failed, notAttempted: toCount(d.pendingMessages) },
    // `failed` sem falha contada e sem tudo enviado também parou no meio: nunca vira "todos enviados".
    aborted: d.status === "failed" && ((!!reason && ABORT_REASONS.has(reason)) || (failed === 0 && sent < total)),
    code: reason,
    errors: (d.errors || []).map((e) => ({ phoneNumber: e.contact, error: e.error, status: e.status, code: e.code })),
  };
};

export default function MassaSmsPage() {
  const t = useTranslations("massaSmsPage");
  const tCsv = useTranslations("bulkCsvImport");
  const tAddr = useTranslations("addressFilter");
  const allowed = usePageAccess("massa");
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
  // Endereço (bairro, cidade, UF do cadastro): estreita a lista de onde se clica. Só o filtro
  // APLICADO entra na carga; cada carga tem geração própria e resultado velho é descartado.
  const [addressFilter, setAddressFilter] = useState<AddressFilter>(EMPTY_ADDRESS_FILTER);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressUnsupported, setAddressUnsupported] = useState(false);
  const contactsLoadGenRef = useRef(0);
  const [sending, setSending] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);
  // Envio em segundo plano: disparo acompanhado, painel, confirmação de cancelar e aviso final.
  const [smsDispatch, setSmsDispatch] = useState<SmsBulkDispatchLean | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [finalNotice, setFinalNotice] = useState<{ id: number; text: string } | null>(null);
  const sendingRef = useRef(false);
  const cancellingRef = useRef(false);
  const aliveRef = useRef(false);
  const pollIdRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollBusyIdRef = useRef<number | null>(null);
  const pollAgainRef = useRef(false);
  const pollErrorsRef = useRef(0);
  const notifiedRef = useRef<Set<number>>(new Set());
  const cancelSettleSinceRef = useRef<Map<number, number>>(new Map());

  const loadContacts = async (filter: AddressFilter = addressFilter) => {
    const gen = ++contactsLoadGenRef.current;
    setLoadingContacts(true);
    setContactOptions([]);
    try {
      let page = 1;
      let hasMore = true;
      const all: { label: string; value: string }[] = [];
      while (hasMore) {
        const res = await fetchContacts({ pageNumber: page, searchParam: contactSearch, ...toAddressQuery(filter) });
        if (gen !== contactsLoadGenRef.current) return;
        // Sem o eco, com filtro ativo, o backend ignorou o filtro: a lista não é usada.
        assertAddressFilterEcho(filter, res.data);
        const data = res.data as { contacts: { name: string; number: string; isGroup?: boolean }[]; hasMore: boolean };
        const filtered = (data.contacts || [])
          .filter((c) => !c.isGroup)
          .map((c) => ({ label: c.name, value: c.number }));
        all.push(...filtered);
        hasMore = data.hasMore;
        page++;
        if (hasMore) await new Promise((r) => setTimeout(r, 800));
        if (gen !== contactsLoadGenRef.current) return;
      }
      setContactOptions(all);
      setAddressUnsupported(false);
    } catch (err) {
      if (gen !== contactsLoadGenRef.current) return;
      if (err instanceof AddressFilterUnsupportedError) {
        setContactOptions([]);
        setAddressUnsupported(true);
        setAddressOpen(true);
        toast.error(tAddr("unsupported"));
        return;
      }
      toast.error(t("errorLoadContacts"));
    } finally {
      if (gen === contactsLoadGenRef.current) setLoadingContacts(false);
    }
  };

  // Filtro aplicado mudou: a lista de onde se clica recarrega com ele. Os contatos já
  // marcados ficam (a escolha é explícita e aparece acima da lista).
  const handleAddressFilterChange = (next: AddressFilter) => {
    setAddressFilter(next);
    setAddressUnsupported(false);
    void loadContacts(next);
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

  const describeFailure = (data: SmsBulkResult) => {
    const first = data.errors?.[0];
    const code = data.code || first?.code;
    if (code === "ERR_SMS_INVALID_KEY") return t("reasonInvalidKey");
    if (code === "ERR_SMS_PROVIDER_UNAVAILABLE") return t("reasonUnavailable");
    if (code === "ERR_SMS_UNCONFIRMED") return t("reasonUnconfirmed");
    if (code === "ERR_SMS_BULK_INTERRUPTED") return t("reasonInterrupted");
    if (code === "ERR_SMS_TOKEN_NOT_FOUND") return t("errTokenNotFound");
    // Texto do provedor entra no meio da frase: sem o ponto final dele.
    return first?.error?.replace(/[.\s]+$/, "") || t("reasonUnknown");
  };

  // Tom e texto do resultado. Interrompido vem antes de "sem falha": em segundo plano o
  // envio pode parar sem falha contada; no síncrono a interrupção sempre tem falha.
  const bulkResultNotice = (data: SmsBulkResult, summary: BulkSummary): BulkNotice => {
    const sent = summary.success;
    const total = summary.total;
    const failed = summary.errors;
    if (failed === 0 && !data.aborted) return { tone: "success", text: t("resultAllSent", { sent, total }) };
    if (data.aborted) return { tone: "error", text: t("resultAborted", { sent, total, reason: describeFailure(data) }) };
    if (sent === 0) return { tone: "error", text: t("resultNoneSent", { total, reason: describeFailure(data) }) };
    return { tone: "warning", text: t("resultPartial", { sent, total, failed, reason: describeFailure(data) }) };
  };

  const showNotice = (notice: BulkNotice, toastId?: string) => {
    const opts = toastId ? { id: toastId } : undefined;
    if (notice.tone === "success") toast.success(notice.text, opts);
    else if (notice.tone === "error") toast.error(notice.text, opts);
    else if (notice.tone === "warning") toast.warning(notice.text, opts);
    else toast.info(notice.text, opts);
  };

  // Backend antigo não devolve `summary` (Conecta/BHI): mantém o aviso de sempre.
  const showBulkResult = (data: SmsBulkResult | undefined, legacyKey: "successComtele" | "successConecta" | "successBhi") => {
    const summary = data?.summary;
    if (!data || !summary || typeof summary.success !== "number") {
      toast.success(t(legacyKey));
      return;
    }
    showNotice(bulkResultNotice(data, summary));
  };

  // Envio de sempre, dentro do request: backend sem a rota nova ou com o envio em
  // segundo plano desligado/indisponível no servidor.
  const sendBulkSmsSync = async (numbers: string[], minInt: number, maxInt: number) => {
    const payload = { arrayNumbers: numbers, message, min: minInt, max: maxInt, importContact: importContacts };
    try {
      if (service === "comtele") {
        const res = await sendBulkSms(payload);
        showBulkResult(res?.data, "successComtele");
      } else if (service === "conecta") {
        const res = await sendBulkSmsConecta(payload);
        showBulkResult(res?.data, "successConecta");
      } else if (service === "livson") {
        const res = await sendBulkSmsLivson(payload);
        showBulkResult(res?.data, "successBhi");
      }
    } catch (err: unknown) {
      // O interceptor rejeita com o `response` do axios (sem `.response` aninhado).
      const e = err as { data?: { message?: string; error?: string }; response?: { data?: { message?: string; error?: string } }; message?: string };
      const data = e?.data ?? e?.response?.data;
      const msg = data?.message || data?.error || e?.message || t("errorSending");
      toast.error(msg);
    }
  };

  // ── Acompanhamento do disparo em segundo plano ──────────────────────────────
  // Consulta a cada 3 s só enquanto roda e só com a aba visível.

  const clearPollTimer = () => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const stopPolling = () => {
    pollIdRef.current = null;
    pollAgainRef.current = false;
    clearPollTimer();
  };

  const schedulePoll = (id: number, delay: number) => {
    clearPollTimer();
    if (!aliveRef.current || pollIdRef.current !== id) return;
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      void pollOnce(id);
    }, delay);
  };

  const forgetDispatch = (id: number) => {
    if (pollIdRef.current === id) stopPolling();
    setSmsDispatch((cur) => (cur && cur.id === id ? null : cur));
    setProgressOpen(false);
    setCancelConfirmOpen(false);
  };

  const dispatchEndNotice = (d: SmsBulkDispatchLean): BulkNotice => {
    if (d.status === "cancelled") {
      return { tone: "info", text: t("resultCancelled", { sent: toCount(d.sentMessages), total: toCount(d.totalMessages) }) };
    }
    const result = dispatchToResult(d);
    return bulkResultNotice(result, result.summary);
  };

  // Fim do disparo: 1 consulta com as falhas e 1 aviso por disparo.
  const finalizeDispatch = async (d: SmsBulkDispatchLean) => {
    if (notifiedRef.current.has(d.id)) return;
    notifiedRef.current.add(d.id);
    setCancelConfirmOpen(false);
    let final = d;
    try {
      const res = await fetchBulkSmsDispatch(d.id, { withErrors: true });
      const full = res?.data;
      if (full && Number(full.id) === d.id && !isSmsBulkDispatchActive(full)) final = full;
    } catch { /* sem a lista de falhas: o aviso sai só com os contadores */ }
    if (!aliveRef.current) return;
    setSmsDispatch((cur) => (cur && cur.id === final.id ? final : cur));
    const notice = dispatchEndNotice(final);
    setFinalNotice({ id: final.id, text: notice.text });
    showNotice(notice, final.status === "cancelled" ? cancelToastId(final.id) : undefined);
  };

  const cancelSettleExpired = (id: number) => {
    const now = Date.now();
    const since = cancelSettleSinceRef.current.get(id);
    if (since === undefined) {
      cancelSettleSinceRef.current.set(id, now);
      return false;
    }
    return now - since > CANCEL_SETTLE_MAX_MS;
  };

  const pollOnce = async (id: number) => {
    if (!aliveRef.current || pollIdRef.current !== id || !isPageVisible()) return;
    if (pollBusyIdRef.current === id) {
      pollAgainRef.current = true;
      return;
    }
    clearPollTimer();
    pollBusyIdRef.current = id;
    let nextDelay: number | null = null;
    try {
      const res = await fetchBulkSmsDispatch(id);
      if (!aliveRef.current || pollIdRef.current !== id) return;
      const d = res?.data;
      if (!d || Number(d.id) !== id) {
        pollErrorsRef.current += 1;
        nextDelay = Math.min(POLL_INTERVAL_MS * pollErrorsRef.current, POLL_MAX_BACKOFF_MS);
        return;
      }
      pollErrorsRef.current = 0;
      setSmsDispatch(d);
      if (isSmsBulkDispatchActive(d)) {
        nextDelay = POLL_INTERVAL_MS;
      } else if (d.status === "cancelled" && hasInFlightGap(d) && !cancelSettleExpired(id)) {
        nextDelay = POLL_INTERVAL_MS;
      } else {
        stopPolling();
        void finalizeDispatch(d);
      }
    } catch (err: unknown) {
      if (!aliveRef.current || pollIdRef.current !== id) return;
      const status = readBulkSmsErrorStatus(err);
      // 404 (envio apagado ou backend sem a rota) e demais recusas: para e limpa.
      if (status != null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        forgetDispatch(id);
        return;
      }
      // Rede ou servidor: segue tentando, espaçando um pouco a cada falha seguida.
      pollErrorsRef.current += 1;
      nextDelay = Math.min(POLL_INTERVAL_MS * pollErrorsRef.current, POLL_MAX_BACKOFF_MS);
    } finally {
      if (pollBusyIdRef.current === id) pollBusyIdRef.current = null;
      const again = pollAgainRef.current;
      pollAgainRef.current = false;
      if (nextDelay !== null) schedulePoll(id, again ? 0 : nextDelay);
    }
  };

  const trackDispatch = (d: SmsBulkDispatchLean, openPanel: boolean) => {
    setSmsDispatch(d);
    if (openPanel) setProgressOpen(true);
    if (!isSmsBulkDispatchActive(d)) {
      if (pollIdRef.current === d.id) stopPolling();
      void finalizeDispatch(d);
      return;
    }
    if (pollIdRef.current !== d.id) {
      stopPolling();
      pollIdRef.current = d.id;
      pollErrorsRef.current = 0;
    }
    if (pollBusyIdRef.current !== d.id) schedulePoll(d.id, POLL_INTERVAL_MS);
  };

  // Envio do usuário que ainda roda no servidor (ao abrir a tela, depois de recarregar
  // ou quando o pedido de envio ficou sem resposta).
  const discoverActiveDispatch = async (openPanel: boolean): Promise<boolean> => {
    try {
      const res = await fetchActiveBulkSmsDispatch();
      const d = res?.data?.dispatch;
      if (!aliveRef.current || !d || !isSmsBulkDispatchActive(d)) return false;
      trackDispatch(d, openPanel);
      return true;
    } catch {
      // Backend antigo (404), migração pendente ou plano sem o recurso: sem painel e sem aviso.
      return false;
    }
  };

  const openDispatchById = async (id: number): Promise<boolean> => {
    try {
      const res = await fetchBulkSmsDispatch(id);
      const d = res?.data;
      if (!aliveRef.current || !d || Number(d.id) !== id) return false;
      trackDispatch(d, true);
      return true;
    } catch {
      return false;
    }
  };

  // Recusa do envio em segundo plano. Nunca cai no envio síncrono: só a rota ausente e o
  // envio em segundo plano desligado/indisponível fazem isso (tratados em handleSend).
  const handleStartError = async (err: unknown) => {
    const code = readBulkSmsErrorCode(err);
    const status = readBulkSmsErrorStatus(err);
    if (code === "ERR_SMS_BULK_ALREADY_RUNNING") {
      toast.info(t("alreadyRunning"));
      const existingId = Number(readBulkSmsErrorData(err)?.bulkDispatchId);
      const opened = Number.isInteger(existingId) && existingId > 0 && (await openDispatchById(existingId));
      if (!opened) await discoverActiveDispatch(true);
      return;
    }
    if (code === "ERR_SMS_BULK_INVALID_PROVIDER") { toast.error(t("errInvalidProvider")); return; }
    if (code === "ERR_SMS_BULK_EMPTY_MESSAGE") { toast.warning(t("typeMessage")); return; }
    if (code === "ERR_SMS_BULK_INVALID_DELAY") { toast.warning(t("validMinMax")); return; }
    if (code === "ERR_SMS_BULK_NO_NUMBERS") { toast.warning(t("atLeastOneNumber")); return; }
    if (code === "ERR_SMS_TOKEN_NOT_FOUND") { toast.error(t("errTokenNotFound")); return; }
    // Sem permissão (403) e fora do plano (402): o aviso global já saiu.
    if (status === 403 || status === 402) return;
    // Sem resposta ou erro do servidor: o envio pode ter sido criado mesmo assim.
    if (status == null || status >= 500) {
      if (await discoverActiveDispatch(true)) {
        toast.success(t("backgroundStarted"));
        return;
      }
    }
    toast.error(t("errorSending"));
  };

  const handleSend = async () => {
    if (sendingRef.current || isSmsBulkDispatchActive(smsDispatch)) return;
    if (!service) { toast.warning(t("selectService")); return; }
    const minInt = parseInt(min, 10);
    const maxInt = parseInt(max, 10);
    if (isNaN(minInt) || isNaN(maxInt)) { toast.warning(t("validMinMax")); return; }
    if (minInt < 0 || maxInt < 0) { toast.warning(t("negativeDelay")); return; }
    if (minInt > maxInt) { toast.warning(t("minGreaterThanMax")); return; }
    if (maxInt > MAX_DELAY_SECONDS) { toast.warning(t("delayTooHigh")); return; }
    if (!message.trim()) { toast.warning(t("typeMessage")); return; }

    let numbers: string[] = [];
    if (importContacts) {
      numbers = selectedContacts.map((c) => c.value);
    } else {
      numbers = numberInput.split(",").map((n) => n.trim()).filter(Boolean);
    }
    if (numbers.length === 0) { toast.warning(t("atLeastOneNumber")); return; }

    sendingRef.current = true;
    setSending(true);
    try {
      let started: SmsBulkDispatchStartResult | undefined;
      try {
        const res = await startBulkSmsDispatch({
          provider: service as SmsBulkProvider,
          arrayNumbers: numbers,
          message,
          minDelay: minInt,
          maxDelay: maxInt,
        });
        started = res?.data;
      } catch (err: unknown) {
        const code = readBulkSmsErrorCode(err);
        if (isLegacyBackend404(err) || (code !== undefined && SMS_BULK_FALLBACK_CODES.includes(code))) {
          await sendBulkSmsSync(numbers, minInt, maxInt);
          return;
        }
        await handleStartError(err);
        return;
      }

      const id = Number(started?.bulkDispatchId);
      if (!Number.isInteger(id) || id <= 0) {
        // Resposta sem o id: procura o envio que ficou rodando.
        if (await discoverActiveDispatch(true)) toast.success(t("backgroundStarted"));
        else toast.error(t("errorSending"));
        return;
      }
      const total = toCount(started?.total);
      setFinalNotice(null);
      trackDispatch({
        id,
        userId: null,
        status: "processing",
        totalMessages: total,
        sentMessages: 0,
        failedMessages: 0,
        pendingMessages: total,
        startedAt: new Date().toISOString(),
        completedAt: null,
        cancellationReason: null,
      }, true);
      toast.success(t("backgroundStarted"));
      const removed = toCount(started?.removedDuplicates);
      if (removed > 0) toast.info(t("duplicatesRemoved", { count: removed }));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleConfirmCancel = async () => {
    const d = smsDispatch;
    if (!d || !isSmsBulkDispatchActive(d) || cancellingRef.current) return;
    cancellingRef.current = true;
    try {
      await cancelBulkSmsDispatch(d.id);
      toast.success(t("cancelSuccess"), { id: cancelToastId(d.id) });
      void pollOnce(d.id);
    } catch (err: unknown) {
      const code = readBulkSmsErrorCode(err);
      const status = readBulkSmsErrorStatus(err);
      if (code === "ERR_SMS_BULK_NOT_RUNNING") {
        toast.info(t("errNotRunning"));
        void pollOnce(d.id);
      } else if (code === "ERR_BULK_DISPATCH_NOT_FOUND") {
        toast.error(t("errNotFound"));
        forgetDispatch(d.id);
      } else if (status !== 403) {
        // 403: o aviso global de "sem permissão" já saiu.
        toast.error(t("cancelError"));
      }
    } finally {
      cancellingRef.current = false;
    }
  };

  const handleCloseProgress = () => {
    setProgressOpen(false);
    // Terminado, fechar o painel encerra o acompanhamento; rodando, a faixa da página fica.
    if (!isSmsBulkDispatchActive(smsDispatch)) {
      setSmsDispatch(null);
      setFinalNotice(null);
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

  useEffect(() => {
    if (!allowed) return;
    aliveRef.current = true;
    void discoverActiveDispatch(true);
    const onVisibility = () => {
      if (!isPageVisible()) {
        clearPollTimer();
        return;
      }
      const id = pollIdRef.current;
      if (id !== null) void pollOnce(id);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
    };
  }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return <AccessDenied />;

  const dispatchActive = isSmsBulkDispatchActive(smsDispatch);
  const busy = sending || dispatchActive;
  const dispatchSent = toCount(smsDispatch?.sentMessages);
  const dispatchFailed = toCount(smsDispatch?.failedMessages);
  const dispatchTotal = toCount(smsDispatch?.totalMessages);
  const dispatchDetail =
    smsDispatch && finalNotice && !dispatchActive && finalNotice.id === smsDispatch.id ? finalNotice.text : undefined;

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
        {/* Envio em andamento com o painel fechado */}
        {dispatchActive && !progressOpen ? (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
              <span>{t("runningBanner", { sent: dispatchSent, total: dispatchTotal })}</span>
            </div>
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setProgressOpen(true)}>
              {t("viewProgress")}
            </Button>
          </div>
        ) : null}

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
            <Label>{t("minSeconds")}</Label>
            <Input value={min} onChange={(e) => setMin(e.target.value)} placeholder="5" />
          </div>
          <div className="grid gap-2">
            <Label>{t("maxSeconds")}</Label>
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
            {/* Endereço: estreita a lista de onde se clica */}
            <Collapsible open={addressOpen} onOpenChange={setAddressOpen} className="rounded-md border">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{tAddr("title")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!addressOpen && addressFilterActiveCount(addressFilter) > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tAddr("activeCount", { count: addressFilterActiveCount(addressFilter) })}
                      </Badge>
                    )}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", addressOpen && "rotate-180")} />
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t px-3 py-3">
                {addressUnsupported && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{tAddr("unsupported")}</AlertDescription>
                  </Alert>
                )}
                <AddressFilterFields
                  value={addressFilter}
                  onChange={handleAddressFilterChange}
                  mode="apply"
                  layout="row"
                  showHint
                  disabled={sending}
                />
              </CollapsibleContent>
            </Collapsible>
            <div className="flex gap-2">
              <Input
                placeholder={t("searchContactsPlaceholder")}
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
              <Button variant="outline" onClick={() => void loadContacts()} disabled={loadingContacts}>
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
          <Button disabled={busy} onClick={handleSend}>
            {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {busy ? t("sending") : t("send")}
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={sending}>
            {t("clear")}
          </Button>
        </div>

        <SendProgressModal
          open={progressOpen && !!smsDispatch}
          onClose={handleCloseProgress}
          sending={dispatchActive}
          sentCount={dispatchSent}
          totalMessages={dispatchTotal}
          errors={dispatchFailed}
          sentCountOverride={dispatchSent}
          failedCountOverride={dispatchFailed}
          hideLogTabs
          title={t("progressTitle")}
          detailLine={dispatchDetail}
          processingHint={t("stillRunningHint")}
          onCancel={() => setCancelConfirmOpen(true)}
          cancelLabel={t("cancelSending")}
          closableWhileSending
        />

        <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("cancelConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("cancelConfirmDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancelConfirmNo")}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => void handleConfirmCancel()}
              >
                {t("cancelSending")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
