"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Send, RefreshCw, X, Search, Loader2, Pause, PlayCircle, Upload, Info, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { fetchContacts, type Contact } from "@/services/contacts";
import { fetchTags, type Tag } from "@/services/tags";
import { fetchKanbans, type Kanban } from "@/services/kanban";
import { fetchQueues, type Queue } from "@/services/queues";
import { sendBulkClose, sendBulkCloseJson, createDispatch, BULK_TEXT_CHANNEL_TYPES } from "@/services/bulk";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { parseBulkPhoneList, detectBrPhoneAmbiguity, normalizeBrPhone } from "@/lib/phone-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBulkSendError } from "@/lib/bulk-send-error-format";
import { SendProgressModal } from "@/components/massa/send-progress-modal";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";
import { WhatsAppPreview } from "@/components/massa/whatsapp-preview";
import { fetchWallets } from "@/services/wallets";
import { fetchAllContactsForWallet } from "@/lib/massa-fetch-contacts-wallet";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

interface ContactOption {
  label: string;
  value: string;
}

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

/** Channels that support URL-based media (not baileys/meow/evo/zapi/uazapi/zapo) */
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

export default function MassaTextoPage() {
  const t = useTranslations("massaTextoPage");
  const tWarn = useTranslations("bulkPhoneWarnings");
  // Título do preview WhatsApp (chave existente ×13 locales)
  const tPreview = useTranslations("massaRelatorioPage");
  const tCsv = useTranslations("bulkCsvImport");
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
  const { isLiveMode } = useLiveMode();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [sendErrorLog, setSendErrorLog] = useState<{ number: string; error: string; timestamp: Date }[]>([]);
  const [sendSuccessLog, setSendSuccessLog] = useState<{ number: string; timestamp: Date }[]>([]);

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

  // Mode toggles
  const [contatosImportar, setContatosImportar] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [useTags, setUseTags] = useState(false);
  const [useKanban, setUseKanban] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [useAllContacts, setUseAllContacts] = useState(false);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [allContactsLoadedCount, setAllContactsLoadedCount] = useState(0);

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [loadingTag, setLoadingTag] = useState(false);

  // Kanban
  const [kanbans, setKanbans] = useState<Kanban[]>([]);
  const [selectedKanban, setSelectedKanban] = useState<string>("");
  const [loadingKanban, setLoadingKanban] = useState(false);

  // Wallet (carteira)
  const [wallets, setWallets] = useState<{ id: number; name: string }[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Pós-envio: fechar / atribuir fila / atribuir usuário
  const [fecharTicket, setFecharTicket] = useState(true);
  const [assignQueue, setAssignQueue] = useState(false);
  const [assignUser, setAssignUser] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedAssignQueueId, setSelectedAssignQueueId] = useState<string>("");
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedAssignUserId, setSelectedAssignUserId] = useState<string>("");

  // Contacts
  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // Manual number input
  const [numberInput, setNumberInput] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  const ambiguousLines = useMemo(() => {
    const out: { lineNumber: number; raw: string; normalized: string; reason: string }[] = [];
    if (!numberInput.trim()) return out;
    const raws = numberInput.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    raws.forEach((entry, idx) => {
      const a = detectBrPhoneAmbiguity(entry);
      if (a) out.push({ lineNumber: idx + 1, raw: a.raw, normalized: a.normalized, reason: a.reason });
    });
    return out;
  }, [numberInput]);

  const duplicateGroups = useMemo(() => {
    if (!numberInput.trim()) return [] as { normalized: string; lines: number[] }[];
    const raws = numberInput.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const map = new Map<string, number[]>();
    raws.forEach((entry, idx) => {
      const digits = entry.replace(/\D/g, "");
      if (!digits) return;
      const norm = normalizeBrPhone(digits) || digits;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(idx + 1);
    });
    return Array.from(map.entries())
      .filter(([, lines]) => lines.length > 1)
      .map(([normalized, lines]) => ({ normalized, lines }));
  }, [numberInput]);

  // Message content
  const [includeText, setIncludeText] = useState(false);
  const [message, setMessage] = useState("");

  // Remote media (only for non-baileys channels)
  const [includeMedia, setIncludeMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaDescription, setMediaDescription] = useState("");

  // Voice URL (only for non-baileys)
  const [includeVoice, setIncludeVoice] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");

  // Local file
  const [includeFile, setIncludeFile] = useState(false);
  const [voiceLocal, setVoiceLocal] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState("");
  const localFileRef = useRef<HTMLInputElement>(null);

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

  const loadTags = useCallback(async () => {
    try {
      const res = await fetchTags();
      const sorted = [...(res.data || [])].sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setTags(sorted);
    } catch {
      toast.error(t("errorLoadTags"));
    }
  }, []);

  const loadKanbans = useCallback(async () => {
    try {
      const res = await fetchKanbans();
      const sorted = [...(res.data || [])].sort((a, b) =>
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
      );
      setKanbans(sorted);
    } catch {
      toast.error(t("errorLoadKanbans"));
    }
  }, []);

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

  const filterContactsByTag = useCallback(async () => {
    if (!selectedTag) return;
    setLoadingTag(true);
    setSelectedContacts([]);
    const allContacts: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    try {
      while (true) {
        const res = await fetchContacts({ pageNumber: page, tagId: Number(selectedTag), pageSize });
        const data = res.data as { contacts: { name: string; number: string }[] };
        const list = data.contacts || [];
        allContacts.push(...list.map((c) => ({ label: c.name, value: c.number })));
        if (list.length < pageSize) break;
        page++;
        await new Promise((r) => setTimeout(r, 200));
      }
      setSelectedContacts(allContacts);
    } catch {
      toast.error(t("errorFilterByTag"));
    } finally {
      setLoadingTag(false);
    }
  }, [selectedTag]);

  const filterContactsByKanban = useCallback(async () => {
    if (!selectedKanban) return;
    setLoadingKanban(true);
    setSelectedContacts([]);
    const allContacts: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    try {
      while (true) {
        const res = await fetchContacts({ pageNumber: page, pageSize });
        const data = res.data as { contacts: { name: string; number: string; kanban?: number }[] };
        const list = data.contacts || [];
        const filtered = list.filter((c) => String(c.kanban) === selectedKanban);
        allContacts.push(...filtered.map((c) => ({ label: c.name, value: c.number })));
        if (list.length < pageSize) break;
        page++;
        await new Promise((r) => setTimeout(r, 200));
      }
      setSelectedContacts(allContacts);
    } catch {
      toast.error(t("errorFilterByKanban"));
    } finally {
      setLoadingKanban(false);
    }
  }, [selectedKanban]);

  const loadWallets = useCallback(async () => {
    try {
      const { data } = await fetchWallets();
      const list = (data as { id: number; name: string; profile?: string }[]).filter((u) => u.profile !== "superadmin");
      const sorted = list.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
      setWallets(sorted.map((u) => ({ id: u.id, name: u.name })));
    } catch {
      toast.error(t("errorLoadWallets"));
    }
  }, []);

  const filterContactsByWallet = useCallback(async () => {
    if (!selectedWallet) return;
    setLoadingWallet(true);
    setSelectedContacts([]);
    try {
      const list = await fetchAllContactsForWallet(selectedWallet);
      setSelectedContacts(list.map((c) => ({ label: c.name ?? c.number, value: c.number })));
    } catch {
      toast.error(t("errorFilterByWallet"));
    } finally {
      setLoadingWallet(false);
    }
  }, [selectedWallet]);

  const filterAllContacts = useCallback(async () => {
    setLoadingAllContacts(true);
    setAllContactsLoadedCount(0);
    setSelectedContacts([]);
    const all: ContactOption[] = [];
    let page = 1;
    const pageSize = 500;
    const maxPages = 200;
    try {
      while (page <= maxPages) {
        const { data } = await fetchContacts({ pageNumber: page, pageSize });
        const list = (data as { contacts?: { name: string; number: string }[] })?.contacts ?? [];
        if (list.length === 0) break;
        const opts = list.map((c) => ({ label: c.name, value: c.number }));
        all.push(...opts);
        setAllContactsLoadedCount(all.length);
        if (list.length < pageSize) break;
        page += 1;
        await new Promise((r) => setTimeout(r, 200));
      }
      setSelectedContacts(all);
    } catch {
      toast.error(t("errorLoadContacts"));
    } finally {
      setLoadingAllContacts(false);
    }
  }, []);

  const handleContactSearchChange = (value: string) => {
    setContactSearch(value);
    setShowContactDropdown(true);
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (value.length < 2) { setContactResults([]); return; }
    contactSearchTimer.current = setTimeout(async () => {
      setContactSearching(true);
      try {
        const res = await fetchContacts({ searchParam: value, pageNumber: 1 });
        const data = res.data as { contacts: (Contact & { isGroup?: boolean })[] };
        const results = (data.contacts || [])
          .filter((c) => (isGroup ? c.isGroup : !c.isGroup))
          .slice(0, 10)
          .map((c) => ({ label: c.name, value: c.number }));
        setContactResults(results);
      } catch {
        setContactResults([]);
      } finally {
        setContactSearching(false);
      }
    }, 400);
  };

  const handleSelectContact = (opt: ContactOption) => {
    if (!selectedContacts.find((x) => x.value === opt.value)) {
      setSelectedContacts((prev) => [...prev, opt]);
    }
    setContactSearch("");
    setContactResults([]);
    setShowContactDropdown(false);
  };

  useEffect(() => {
    loadConnections();
    loadTags();
    loadKanbans();
  }, [loadConnections, loadTags, loadKanbans]);

  useEffect(() => {
    if (selectedTag && useTags) filterContactsByTag();
  }, [selectedTag, useTags, filterContactsByTag]);

  useEffect(() => {
    if (selectedKanban && useKanban) filterContactsByKanban();
  }, [selectedKanban, useKanban, filterContactsByKanban]);

  useEffect(() => { if (useWallet && wallets.length === 0) loadWallets(); }, [useWallet, wallets.length, loadWallets]);
  useEffect(() => { if (assignQueue && queues.length === 0) loadAssignQueues(); }, [assignQueue, queues.length, loadAssignQueues]);
  useEffect(() => { if (assignUser && assignUsers.length === 0) loadAssignUsers(); }, [assignUser, assignUsers.length, loadAssignUsers]);
  useEffect(() => { if (selectedWallet && useWallet) filterContactsByWallet(); }, [selectedWallet, useWallet, filterContactsByWallet]);
  useEffect(() => { if (useAllContacts) filterAllContacts(); }, [useAllContacts, filterAllContacts]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const handleSend = async () => {
    if (selectedConnections.length === 0) {
      toast.error(t("errorSelectConnection"));
      return;
    }

    if (loadingAllContacts || loadingTag || loadingKanban || loadingWallet) {
      toast.warning(t("loadingAllContacts"));
      return;
    }

    let numbers: string[] = [];
    if (useTags || useKanban || useWallet || useAllContacts) {
      numbers = selectedContacts.map((c) => c.value);
    } else if (contatosImportar) {
      numbers = selectedContacts.map((c) => c.value);
    } else {
      numbers = parseBulkPhoneList(numberInput);
    }

    if (numbers.length === 0) {
      toast.error(t("errorNoNumbers"));
      return;
    }

    const minInt = parseInt(minDelay, 10);
    const maxInt = parseInt(maxDelay, 10);
    if (isNaN(minInt) || isNaN(maxInt)) {
      toast.error(t("errorInvalidDelay"));
      return;
    }

    if (!includeText && !includeMedia && !includeVoice && !includeFile) {
      toast.error(t("errorSelectContent"));
      return;
    }
    if (includeText && !message.trim()) {
      toast.error(t("errorNoMessage"));
      return;
    }
    if (includeMedia && (!mediaUrl.trim() || !mediaDescription.trim())) {
      toast.error(t("errorMediaUrlDesc"));
      return;
    }
    if (includeVoice && !voiceUrl.trim()) {
      toast.error(t("errorVoiceUrl"));
      return;
    }
    if (includeFile) {
      if (!voiceLocal && (!localFile || !fileDescription.trim())) {
        toast.error(t("errorFileAndDesc"));
        return;
      } else if (voiceLocal && !localFile) {
        toast.error(t("errorAudioFile"));
        return;
      }
    }

    setSending(true);
    sendingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setSentCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setTotalMessages(numbers.length);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(true);
    let skippedTotal = 0;

    // Criar registro de tracking no bulk-dispatch (igual ao Vue antigo)
    let bulkDispatchId: number | null = null;
    try {
      const dispatch = await createDispatch({
        dispatchType: "text",
        totalMessages: numbers.length,
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
          contacts: numbers,
          useTags,
          tagId: selectedTag ? Number(selectedTag) : undefined,
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

    for (let i = 0; i < numbers.length; i++) {
      while (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const number = numbers[i];
      const randomConn =
        selectedConnections[Math.floor(Math.random() * selectedConnections.length)];
      const randomDelay =
        Math.floor(Math.random() * (maxInt - minInt + 1) + minInt) * 1000;

      try {
        let numberSkipped = false;
        if (includeText) {
          const res = await sendBulkCloseJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            arrayNumbers: [number],
            message: message.trim(),
            min: minInt,
            max: maxInt,
            groups: isGroup,
            idFront: crypto.randomUUID(),
            sendType: "chat",
            ...(bulkDispatchId ? { bulkDispatchId } : {}),
            ...bulkAssignExtras,
          });
          if (isSkippedResponse(res)) numberSkipped = true;
        }
        if (includeMedia) {
          const res = await sendBulkCloseJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            arrayNumbers: [number],
            min: minInt,
            max: maxInt,
            groups: isGroup,
            idFront: crypto.randomUUID(),
            sendType: "chat",
            media: true,
            mediaUrl: mediaUrl.trim(),
            mediaDescription: mediaDescription.trim(),
            ...(bulkDispatchId ? { bulkDispatchId } : {}),
            ...bulkAssignExtras,
          });
          if (isSkippedResponse(res)) numberSkipped = true;
        }
        if (includeVoice) {
          const res = await sendBulkCloseJson({
            whatsappId: Number(randomConn.value),
            whatsappType: randomConn.type,
            arrayNumbers: [number],
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
          if (isSkippedResponse(res)) numberSkipped = true;
        }
        if (includeFile && localFile) {
          const formData = new FormData();
          formData.append("whatsappId", randomConn.value);
          formData.append("whatsappType", randomConn.type);
          formData.append("arrayNumbers", number);
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
          } else {
            formData.append("mediaLocalDescription", fileDescription.trim());
          }
          if (bulkAssignExtras.assignQueueId) formData.append("assignQueueId", String(bulkAssignExtras.assignQueueId));
          if (bulkAssignExtras.assignUserId) formData.append("assignUserId", String(bulkAssignExtras.assignUserId));
          formData.append("closeTicket", String(bulkAssignExtras.closeTicket));
          const res = await sendBulkClose(formData);
          if (isSkippedResponse(res)) numberSkipped = true;
        }

        if (numberSkipped) {
          skippedTotal += 1;
          setSkippedCount((c) => c + 1);
          setSendErrorLog((prev) => [...prev, { number, error: t("skippedLogLabel"), timestamp: new Date() }]);
        } else {
          setSentCount((c) => c + 1);
          setSendSuccessLog((prev) => [...prev, { number, timestamp: new Date() }]);
        }
      } catch (err) {
        const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
        const detail = e?.response?.data?.message || e?.response?.data?.error || e?.message || String(err);
        logger.error(`Erro ao enviar para ${number}:`, detail, e?.response?.data);
        setFailedCount((c) => c + 1);
        setSendErrorLog((prev) => [...prev, { number, error: formatBulkSendError(err), timestamp: new Date() }]);
      }

      if (i < numbers.length - 1) {
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
    setNumberInput("");
    setMinDelay("");
    setMaxDelay("");
    setMediaUrl("");
    setMediaDescription("");
    setVoiceUrl("");
    setSelectedConnections([]);
    setSelectedContacts([]);
    setUseAllContacts(false);
    setAllContactsLoadedCount(0);
    setContactSearch("");
    setContactResults([]);
    setShowContactDropdown(false);
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
    setFailedCount(0);
    setSkippedCount(0);
    setTotalMessages(0);
    setSendErrorLog([]);
    setSendSuccessLog([]);
    setProgressModalOpen(false);
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

  // Preview WhatsApp (Fase 5): dados derivados do formulário, sem estado novo.
  // Prioridade: arquivo local > mídia por URL > áudio por URL.
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
            <Label>{t("labelSelectConnection")}</Label>
            <Select
              onValueChange={(val) => {
                const conn = connOptions.find((c) => c.value === val);
                if (conn) toggleConnection(conn);
              }}
              value=""
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectConnectionsPlaceholder")} />
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
            <Input
              placeholder="Ex: 1"
              value={minDelay}
              onChange={(e) => setMinDelay(e.target.value)}
            />
          </div>
          <div className="md:col-span-1 space-y-2">
            <Label>{t("maxSeconds")}</Label>
            <Input
              placeholder="Ex: 3"
              value={maxDelay}
              onChange={(e) => setMaxDelay(e.target.value)}
            />
          </div>
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

        {/* Mode toggles */}
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="contatosImportar"
              checked={contatosImportar}
              onCheckedChange={(v) => {
                setContatosImportar(v);
                if (v) { setUseTags(false); setUseKanban(false); setUseWallet(false); setUseAllContacts(false); }
              }}
            />
            <Label htmlFor="contatosImportar">{t("importContacts")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="isGroup"
              checked={isGroup}
              onCheckedChange={setIsGroup}
            />
            <Label htmlFor="isGroup">{t("groups")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="useTags"
              checked={useTags}
              onCheckedChange={(v) => {
                setUseTags(v);
                if (v) { setUseKanban(false); setUseWallet(false); setContatosImportar(false); setUseAllContacts(false); }
              }}
            />
            <Label htmlFor="useTags">{t("filterByTag")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="useKanban"
              checked={useKanban}
              onCheckedChange={(v) => {
                setUseKanban(v);
                if (v) { setUseTags(false); setUseWallet(false); setContatosImportar(false); setUseAllContacts(false); }
              }}
            />
            <Label htmlFor="useKanban">{t("kanban")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="useWallet"
              checked={useWallet}
              onCheckedChange={(v) => {
                setUseWallet(v);
                if (v) { setUseTags(false); setUseKanban(false); setContatosImportar(false); setUseAllContacts(false); }
              }}
            />
            <Label htmlFor="useWallet">{t("filterByWallet")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="useAllContacts"
              checked={useAllContacts}
              onCheckedChange={(v) => {
                setUseAllContacts(v);
                if (v) { setUseTags(false); setUseKanban(false); setUseWallet(false); setContatosImportar(false); }
              }}
            />
            <Label htmlFor="useAllContacts">{t("allContacts")}</Label>
          </div>
        </div>

        {/* Wallet selector */}
        {useWallet && (
          <div className="space-y-2">
            {loadingWallet && (
              <div className="text-xs text-muted-foreground animate-pulse">{t("loadingWalletContacts")}</div>
            )}
            <div className="flex gap-2">
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectWallet")} />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={filterContactsByWallet} disabled={!selectedWallet || loadingWallet}>
                {t("selectAllFromWallet")}
              </Button>
            </div>
            {selectedContacts.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contacts")}</p>
            )}
          </div>
        )}

        {/* Tag selector */}
        {useTags && (
          <div className="space-y-2">
            {loadingTag && (
              <div className="text-xs text-muted-foreground animate-pulse">
                {t("loadingTagContacts")}
              </div>
            )}
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectTag")} />
              </SelectTrigger>
              <SelectContent>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedContacts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedContacts.length} {t("contactsSelected")}
              </p>
            )}
          </div>
        )}

        {/* Kanban selector */}
        {useKanban && (
          <div className="space-y-2">
            {loadingKanban && (
              <div className="text-xs text-muted-foreground animate-pulse">
                {t("loadingKanbanContacts")}
              </div>
            )}
            <Select value={selectedKanban} onValueChange={setSelectedKanban}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectKanban")} />
              </SelectTrigger>
              <SelectContent>
                {kanbans.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedContacts.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedContacts.length} {t("contactsSelected")}
              </p>
            )}
          </div>
        )}

        {/* All contacts */}
        {useAllContacts && (
          <div className="space-y-1">
            {loadingAllContacts ? (
              <div className="text-xs text-muted-foreground animate-pulse">
                {t("loadingAllContacts")} — {allContactsLoadedCount} {t("contactsSelected")}
              </div>
            ) : selectedContacts.length > 0 ? (
              <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contactsSelected")}</p>
            ) : null}
          </div>
        )}

        {/* Contact search (searchable, no full load) */}
        {contatosImportar && !useTags && !useKanban && (
          <div className="space-y-2">
            <div className="relative" ref={contactDropdownRef}>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => handleContactSearchChange(e.target.value)}
                onFocus={() => contactSearch.length >= 2 && setShowContactDropdown(true)}
                placeholder={t("contactSearchPlaceholder")}
                autoComplete="off"
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {showContactDropdown && (contactSearching || contactResults.length > 0) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                  {contactSearching ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("searching")}
                    </div>
                  ) : (
                    contactResults.map((c) => (
                      <div
                        key={c.value}
                        className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer text-sm"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectContact(c); }}
                      >
                        <div className={cn("h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0", isLiveMode && "live-blur")}>
                          {c.label?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-medium truncate", isLiveMode && "live-blur-text")}>{c.label}</p>
                          <p className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.value}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {contactSearch.length > 0 && contactSearch.length < 2 && (
                <p className="text-xs text-muted-foreground mt-1">{t("typeAtLeast2Chars")}</p>
              )}
            </div>
            {selectedContacts.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1">
                  {selectedContacts.map((c) => (
                    <Badge key={c.value} variant="secondary" className="flex items-center gap-1">
                      <span className={cn(isLiveMode && "live-blur-text")}>{c.label}</span>
                      <button onClick={() => setSelectedContacts((prev) => prev.filter((x) => x.value !== c.value))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selectedContacts.length} {t("contactsSelected")}</p>
              </>
            )}
          </div>
        )}

        {/* Manual number input + CSV */}
        {!contatosImportar && !useTags && !useKanban && !useWallet && !useAllContacts && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Label>{t("labelNumbers")}</Label>
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
                  mode="firstField"
                  onImport={({ text, count }) => {
                    setNumberInput(text);
                    toast.success(t("csvImported", { count }));
                    setCsvImport(null);
                  }}
                />
              </div>
            </div>
            <Input
              placeholder="5511999999999, 5521888888888"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
            />

            {ambiguousLines.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-medium text-amber-700 dark:text-amber-500">
                    {tWarn("title")}{" "}
                    <span className="text-amber-600 dark:text-amber-500 font-normal">
                      ({ambiguousLines.length} {tWarn("count")})
                    </span>
                  </p>
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
                  <p className="font-medium text-sky-700 dark:text-sky-500">
                    {tWarn("duplicatesTitle")}{" "}
                    <span className="text-sky-600 dark:text-sky-500 font-normal">
                      ({duplicateGroups.reduce((acc, g) => acc + g.lines.length - 1, 0)} {tWarn("duplicatesCount")})
                    </span>
                  </p>
                  <p className="text-muted-foreground">{tWarn("duplicatesHint")}</p>
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

        {/* Include text toggle + textarea */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch id="includeText" checked={includeText} onCheckedChange={setIncludeText} />
            <Label htmlFor="includeText">{t("includeText")}</Label>
          </div>
          {includeText && (
            <Textarea
              placeholder={t("messagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          )}
        </div>

        {/* Remote media (only for non-baileys connections) */}
        {hasRemoteMedia && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="includeMedia" checked={includeMedia} onCheckedChange={setIncludeMedia} />
              <Label htmlFor="includeMedia">{t("includeMedia")}</Label>
            </div>
            {includeMedia && (
              <div className="space-y-2">
                <Input
                  placeholder={t("mediaUrlInputPlaceholder")}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
                <Textarea
                  placeholder={t("mediaDescriptionPlaceholder")}
                  value={mediaDescription}
                  onChange={(e) => setMediaDescription(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
        )}

        {/* Voice URL (only for non-baileys connections) */}
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

        {/* Local file upload */}
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
                <label htmlFor="voiceLocal" className="text-sm">
                  {t("voiceRecorded")}
                </label>
              </div>
              <Input
                type="file"
                ref={localFileRef}
                onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
              />
              {!voiceLocal && (
                <Textarea
                  placeholder={t("fileDescriptionPlaceholder")}
                  value={fileDescription}
                  onChange={(e) => setFileDescription(e.target.value)}
                  rows={2}
                />
              )}
            </div>
          )}
        </div>

        {/* Send progress */}
        {sending && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                {isPaused ? (
                  <span className="text-yellow-600 font-medium">{t("dispatchPaused")} — </span>
                ) : null}
                {t("progressMsg", { sent: sentCount, total: totalMessages })}
                {failedCount > 0 && <span className="text-destructive ml-2">— {t("failed")}: {failedCount}</span>}
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
            <Progress value={totalMessages > 0 ? (sentCount / totalMessages) * 100 : 0} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button disabled={sending} onClick={handleSend}>
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
    <SendProgressModal
      open={progressModalOpen}
      onClose={() => setProgressModalOpen(false)}
      sending={sending}
      sentCount={sentCount}
      totalMessages={totalMessages}
      errors={failedCount + skippedCount}
      errorLog={sendErrorLog}
      successLog={sendSuccessLog}
      detailLine={skippedCount > 0 ? t("skippedSummary", { sent: sentCount, failed: failedCount, skipped: skippedCount }) : undefined}
      isPaused={isPaused}
      onPause={() => { isPausedRef.current = true; setIsPaused(true); }}
      onResume={() => { isPausedRef.current = false; setIsPaused(false); }}
    />
    </div>
  );
}
