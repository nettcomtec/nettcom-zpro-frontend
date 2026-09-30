"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { displayContactIdentity } from "@/lib/contact-identity";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Filter, RefreshCw, ChevronDown, FileText, Printer, X, Info } from "lucide-react";
import { toast } from "sonner";
import { fetchReportTickets } from "@/services/reports";
import { printReportTable } from "@/lib/print-report";
import { getTicketLastMessagePreview } from "@/lib/template-preview";
import { fetchQueues } from "@/services/queues";
import { fetchAllUsers } from "@/services/users";
import { fetchReasons } from "@/services/reasons";
import { fetchWhatsapps } from "@/services/whatsapp";
import { formatDuration } from "@/services/dashboard";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface TicketRow {
  id: number;
  status: string;
  isGroup?: boolean;
  attendanceType?: "active" | "receptive" | null;
  firstMessageFromMe?: boolean | null;
  contact?: { name?: string; number?: string };
  whatsapp?: { name?: string };
  lastMessage?: string;
  unreadMessages?: boolean;
  reasons?: string;
  reasonName?: string;
  queue?: { queue?: string; name?: string };
  user?: { id?: number; name?: string };
  channel?: string;
  value?: number | string;
  ticketNotes?: Array<{ notes: string; createdAt: string }>;
  createdAt: string;
  closedAt?: number | string | null;
  startedAttendanceAt?: number | string | null;
  totalPauseTime?: number | string | null;
  firstAssignedAt?: number | string | null;
  firstAgentReplyAt?: number | string | null;
}

interface SelectOption {
  label: string;
  value: string | number;
}

const CHANNEL_OPTIONS: SelectOption[] = [
  { label: "WhatsApp Official (WABA)", value: "waba" },
  { label: "WhatsApp Baileys (QRCode)", value: "baileys" },
  { label: "WhatsApp Zapo (QRCode)", value: "zapo" },
  { label: "WhatsApp WebJs (QRCode)", value: "whatsapp" },
  { label: "WhatsApp Meow (QRCode)", value: "meow" },
  { label: "WhatsApp Evolution (QRCode)", value: "evo" },
  { label: "WhatsApp Evolution Go (QRCode)", value: "evogo" },
  { label: "WhatsApp Zapi (QRCode)", value: "zapi" },
  { label: "WhatsApp Uazapi (QRCode)", value: "uazapi" },
  { label: "Telegram", value: "telegram" },
  { label: "Facebook (Hub)", value: "hub_facebook" },
  { label: "Instagram (Hub)", value: "hub_instagram" },
];

function formatChannel(value: string) {
  const opt = CHANNEL_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value;
}

function formatDate(v: string) {
  if (!v) return "N/A";
  return formatDateTime(new Date(v), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// closedAt / startedAttendanceAt são BIGINT epoch-ms (chegam como string ou number).
// Retorna a data formatada, ou null quando vazio (ticket sem fechamento/atendimento).
function formatEpochDate(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "" || v === 0 || v === "0") return null;
  const n = Number(v);
  if (isNaN(n) || n <= 0) return null;
  return formatDateTime(new Date(n), {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// Duração por linha em d/h/min — mostra DIAS para destacar tickets longos (a dor
// do gestor: enxergar o que distorce a média). null = marco ainda não ocorreu → "—".
function formatRowDuration(totalMinFloat: number | null): string {
  if (totalMinFloat === null) return "—";
  const totalSec = Math.round(totalMinFloat * 60);
  if (totalSec <= 0) return "0min";
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  // Segundos só abaixo de 1h: resposta rápida deixava de aparecer como "0min".
  if (days === 0 && hours === 0 && seconds > 0) parts.push(`${seconds}s`);
  return parts.length ? parts.join(" ") : "0min";
}

// `lastMessage` chega como JSON em vários casos (template WABA, resposta de Flow,
// interativos) — o mesmo preview da lista de conversas evita o JSON cru no relatório.
function lastMessageText(raw: string | undefined): string {
  return getTicketLastMessagePreview(raw) || "N/A";
}

// Minutos por linha espelhando a fórmula do agregado timeStats (desconta pausa, piso 0).
// Retorna null quando o marco (fechamento / início do atendimento) ainda não ocorreu.
function rowHandlingMinutes(row: TicketRow): number | null {
  const created = new Date(row.createdAt).getTime();
  if (isNaN(created)) return null;
  if (!row.closedAt) return null;
  const closed = Number(row.closedAt);
  if (isNaN(closed) || closed <= 0) return null;
  const pauseMin = (Number(row.totalPauseTime ?? 0) || 0) / 60000;
  return Math.max(0, (closed - created) / 60000 - pauseMin);
}

function rowFirstResponseMinutes(row: TicketRow): number | null {
  const created = new Date(row.createdAt).getTime();
  if (isNaN(created)) return null;
  // TME/tempo até atribuição: mesma fonte do card TME do dashboard
  // COALESCE(firstAssignedAt, startedAttendanceAt) − createdAt.
  const started =
    Number(row.firstAssignedAt) > 0
      ? Number(row.firstAssignedAt)
      : Number(row.startedAttendanceAt);
  if (isNaN(started) || started <= 0) return null;
  const pauseMin = (Number(row.totalPauseTime ?? 0) || 0) / 60000;
  return Math.max(0, (started - created) / 60000 - pauseMin);
}

function rowFirstReplyMinutes(row: TicketRow): number | null {
  const created = new Date(row.createdAt).getTime();
  if (isNaN(created)) return null;
  if (!row.firstAgentReplyAt) return null;
  const replied = Number(row.firstAgentReplyAt);
  if (isNaN(replied) || replied <= 0) return null;
  return Math.max(0, (replied - created) / 60000);
}


function MultiSelect({
  label,
  placeholder,
  noOptions,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  noOptions: string;
  options: SelectOption[];
  selected: (string | number)[];
  onChange: (v: (string | number)[]) => void;
  disabled?: boolean;
}) {
  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="justify-between min-w-[160px] h-9 text-left font-normal"
            disabled={disabled}
          >
            <span className="truncate text-sm max-w-[140px]">
              {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-60 overflow-y-auto w-56">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{noOptions}</div>
          ) : (
            options.map((opt) => (
              <DropdownMenuCheckboxItem
                key={String(opt.value)}
                checked={selected.includes(opt.value)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value)
                  );
                }}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SingleSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: SelectOption[];
  selected: string | number | null;
  onChange: (v: string | number | null) => void;
}) {
  const selectedLabel = options.find((o) => o.value === selected)?.label;
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="justify-between min-w-[160px] h-9 text-left font-normal">
            <span className="truncate text-sm max-w-[140px]">
              {selectedLabel ?? allLabel}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-60 overflow-y-auto w-56">
          <DropdownMenuCheckboxItem
            checked={selected === null}
            onCheckedChange={() => onChange(null)}
          >
            {allLabel}
          </DropdownMenuCheckboxItem>
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={String(opt.value)}
              checked={selected === opt.value}
              onCheckedChange={() =>
                onChange(selected === opt.value ? null : opt.value)
              }
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function RelatorioAtendimentosParamsPage() {
  const t = useTranslations("relatoriosAtendimentosParamsPage");
  const tCommon = useTranslations("common");
  const tFunil = useTranslations("funil");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  const { isLiveMode } = useLiveMode();

  const STATUS_OPTIONS: SelectOption[] = [
    { label: t("statusAberto"), value: "open" },
    { label: t("statusFechado"), value: "closed" },
    { label: t("statusPendente"), value: "pending" },
  ];

  function formatStatus(status: string) {
    switch (status) {
      case "open": return t("statusAberto");
      case "closed": return t("statusFechado");
      case "pending": return t("statusPendente");
      case "schedule": return t("statusAgendado");
      default: return status;
    }
  }

  // Tipo de Atendimento derivado da 1ª mensagem (backend): active/receptive/Indefinido.
  function attendanceLabel(type?: string | null) {
    if (type === "active") return t("tipoAtivo");
    if (type === "receptive") return t("tipoReceptivo");
    return t("tipoIndefinido");
  }

  function formatNotes(notes: Array<{ notes: string; createdAt: string }> | undefined) {
    if (!notes || notes.length === 0) return t("vazio");
    return notes
      .map((n) =>
        `${n.notes} (${formatDateTime(new Date(n.createdAt), {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })})`
      )
      .join(" | ");
  }

  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [selectedStatus, setSelectedStatus] = useState<(string | number)[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<(string | number)[]>([]);
  const [selectedQueues, setSelectedQueues] = useState<(string | number)[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<(string | number)[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<(string | number)[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | number | null>(null);
  const [selectedAttendanceType, setSelectedAttendanceType] = useState<string | number | null>(null);
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");

  const [data, setData] = useState<TicketRow[]>([]);
  const [queuesOptions, setQueuesOptions] = useState<SelectOption[]>([]);
  const [usersOptions, setUsersOptions] = useState<SelectOption[]>([]);
  const [reasonsOptions, setReasonsOptions] = useState<SelectOption[]>([]);
  const [connectionsOptions, setConnectionsOptions] = useState<SelectOption[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true);
    try {
      const [queuesRes, usersRes, reasonsRes, whatsappsRes] = await Promise.all([
        fetchQueues(),
        fetchAllUsers(),
        fetchReasons(),
        fetchWhatsapps(),
      ]);

      setQueuesOptions(
        (queuesRes.data ?? []).map((q: { id: number; name: string }) => ({
          label: q.name,
          value: q.id,
        }))
      );

      const usersList = (usersRes.data?.users ?? []) as Array<{ id: number; name: string; profile: string }>;
      setUsersOptions(
        usersList
          .filter((u) => u.profile !== "superadmin")
          .map((u) => ({ label: u.name, value: u.id }))
      );

      const reasonsRaw = reasonsRes.data as { reasons?: Array<{ id: number; name: string }> } | Array<{ id: number; name: string }>;
      const reasonsList = Array.isArray(reasonsRaw)
        ? reasonsRaw
        : (reasonsRaw as { reasons?: Array<{ id: number; name: string }> }).reasons ?? [];
      setReasonsOptions(reasonsList.map((r) => ({ label: r.name, value: r.id })));

      const whatsappsRaw = whatsappsRes.data as
        | { whatsapps?: Array<{ id: number; name: string }> }
        | Array<{ id: number; name: string }>;
      const whatsappsList = Array.isArray(whatsappsRaw)
        ? whatsappsRaw
        : (whatsappsRaw as { whatsapps?: Array<{ id: number; name: string }> }).whatsapps ?? [];
      setConnectionsOptions(
        whatsappsList.map((w) => ({ label: w.name, value: w.id }))
      );
    } catch (err) {
      logger.error("Erro ao carregar filtros:", err);
    } finally {
      setFiltersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Grupos fora das métricas de tempo (interruptor do tenant em /configuracoes):
  // as três colunas de tempo saem "—" para linha de grupo e o grupo não entra nas
  // médias do rodapé. Quantidades seguem contando grupos. Backend antigo não manda
  // a config → segue contando (comportamento histórico).
  const hideGroupTimes = useAuthStore(
    (s) => s.getConfigValue("groupTimeMetricsEnabled") === "disabled"
  );
  const timeAtrib = (row: TicketRow) =>
    hideGroupTimes && row.isGroup ? null : rowFirstResponseMinutes(row);
  const timeResp = (row: TicketRow) =>
    hideGroupTimes && row.isGroup ? null : rowFirstReplyMinutes(row);
  const timeAtend = (row: TicketRow) =>
    hideGroupTimes && row.isGroup ? null : rowHandlingMinutes(row);

  // Subset exibido (respeita o filtro ativo do gráfico por fila).
  const displayData = useMemo(
    () =>
      activeFilter
        ? data.filter((row) => (row.queue?.queue ?? row.queue?.name ?? tCommon("noQueue")) === activeFilter)
        : data,
    [data, activeFilter, tCommon]
  );

  // Linhas decoradas para ordenação client-side: datas/durações/valor viram INTEIROS
  // (epoch-ms / segundos / centavos) porque o comparador do useSortable (localeCompare
  // numeric) é exato em inteiros; textos ficam string (comparação locale-aware);
  // null vai sempre para o fim, em qualquer direção.
  const sortableRows = useMemo(
    () =>
      displayData.map((row) => {
        const created = new Date(row.createdAt).getTime();
        const started = Number(row.startedAttendanceAt);
        const closed = Number(row.closedAt);
        const valueNum = parseFloat(String(row.value ?? ""));
        const tAtrib = timeAtrib(row);
        const tResp = timeResp(row);
        const tAtend = timeAtend(row);
        return {
          row,
          id: row.id,
          status: formatStatus(row.status),
          tipo: attendanceLabel(row.attendanceType),
          nome: row.contact?.name ?? null,
          numero: displayContactIdentity(row.contact) || null,
          conexao: row.whatsapp?.name ?? null,
          naoLidas: row.unreadMessages ? 1 : 0,
          demanda: row.reasonName ?? row.reasons ?? null,
          fila: row.queue?.queue ?? row.queue?.name ?? null,
          usuario: row.user?.name ?? null,
          canal: formatChannel(row.channel ?? ""),
          valor: isNaN(valueNum) ? null : Math.round(valueNum * 100),
          dataCriacao: isNaN(created) ? null : created,
          inicioAtendimento: !isNaN(started) && started > 0 ? started : null,
          dataFechamento: !isNaN(closed) && closed > 0 ? closed : null,
          tempoAtribuicao: tAtrib === null ? null : Math.round(tAtrib * 60),
          tempoPrimeiraResposta: tResp === null ? null : Math.round(tResp * 60),
          tempoAtendimento: tAtend === null ? null : Math.round(tAtend * 60),
        };
      }),
    // formatStatus/attendanceLabel dependem apenas de t (labels traduzidos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayData, t, hideGroupTimes]
  );

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(sortableRows);

  if (!allowed) return <AccessDenied />;

  const handleFilter = async (s: string = dateStart, e: string = dateEnd) => {
    if (!s || !e) {
      toast.error(t("toastSelectDates"));
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        startDate: s,
        endDate: e,
        userId: selectedUserId || null,
        attendanceType: selectedAttendanceType || null,
        status: selectedStatus.length ? selectedStatus : null,
        queues: selectedQueues.length ? selectedQueues : null,
        channel: selectedChannels.length ? selectedChannels : null,
        reasons: selectedReasons.length ? selectedReasons : null,
        whatsappId: selectedConnections.length ? selectedConnections : null,
        valueMin: valueMin !== "" ? Number(valueMin) : null,
        valueMax: valueMax !== "" ? Number(valueMax) : null,
      };
      const res = await fetchReportTickets(params);
      const result: TicketRow[] =
        (res.data as { tickets?: TicketRow[] })?.tickets ?? [];
      setData(result);
      if (result.length === 0) toast.info(t("toastNoTickets"));
    } catch {
      toast.error(t("toastErrorTickets"));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default ?? mod;
      const exportData = data.map((row) => ({
        [t("colId")]: row.id,
        [t("colStatus")]: formatStatus(row.status),
        [t("colTipo")]: attendanceLabel(row.attendanceType),
        [t("colNome")]: row.contact?.name ?? "N/A",
        [t("colNumero")]: displayContactIdentity(row.contact) || "N/A",
        [t("colConexao")]: row.whatsapp?.name ?? "N/A",
        [t("colUltimaMensagem")]: lastMessageText(row.lastMessage),
        [t("colMsgsNaoLidas")]: row.unreadMessages ? t("sim") : t("nao"),
        [t("colDemanda")]: row.reasonName ?? row.reasons ?? "N/A",
        [t("colFila")]: row.queue?.queue ?? row.queue?.name ?? "N/A",
        [t("colUsuario")]: row.user?.name ?? "N/A",
        [t("colCanal")]: formatChannel(row.channel ?? ""),
        [t("colValor")]: row.value ? `R$ ${row.value}` : "N/A",
        [t("colNotas")]: formatNotes(row.ticketNotes),
        [t("colDataCriacao")]: formatDate(row.createdAt),
        [t("colInicioAtendimento")]: formatEpochDate(row.startedAttendanceAt) ?? t("naoIniciado"),
        [t("colDataFechamento")]: formatEpochDate(row.closedAt) ?? t("emAberto"),
        [t("colTempoAtribuicao")]: formatRowDuration(timeAtrib(row)),
        [t("colTempoPrimeiraResposta")]: formatRowDuration(timeResp(row)),
        [t("colTempoAtendimento")]: formatRowDuration(timeAtend(row)),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
        { wch: 50 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 18 },
        { wch: 25 }, { wch: 12 }, { wch: 50 }, { wch: 22 },
        { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, t("sheetAtendimentos"));
      XLSX.writeFile(wb, "Relatorio-Atendimentos.xlsx");
      toast.success(t("toastExportSuccess"));
    } catch {
      toast.error(t("toastExportError"));
    }
  };

  const handleExportCsv = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [
      t("colId"), t("colStatus"), t("colTipo"), t("colNome"), t("colNumero"), t("colConexao"),
      t("colUltimaMensagem"), t("colMsgsNaoLidas"), t("colDemanda"), t("colFila"),
      t("colUsuario"), t("colCanal"), t("colValor"), t("colNotas"), t("colDataCriacao"),
      t("colInicioAtendimento"), t("colDataFechamento"), t("colTempoAtribuicao"), t("colTempoPrimeiraResposta"), t("colTempoAtendimento"),
    ];
    const rows = data.map((row) => [
      String(row.id),
      formatStatus(row.status),
      attendanceLabel(row.attendanceType),
      row.contact?.name ?? "N/A",
      displayContactIdentity(row.contact) || "N/A",
      row.whatsapp?.name ?? "N/A",
      lastMessageText(row.lastMessage),
      row.unreadMessages ? t("sim") : t("nao"),
      row.reasonName ?? row.reasons ?? "N/A",
      row.queue?.queue ?? row.queue?.name ?? "N/A",
      row.user?.name ?? "N/A",
      formatChannel(row.channel ?? ""),
      row.value ? `R$ ${row.value}` : "N/A",
      formatNotes(row.ticketNotes),
      formatDate(row.createdAt),
      formatEpochDate(row.startedAttendanceAt) ?? t("naoIniciado"),
      formatEpochDate(row.closedAt) ?? t("emAberto"),
      formatRowDuration(timeAtrib(row)),
      formatRowDuration(timeResp(row)),
      formatRowDuration(timeAtend(row)),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Relatorio-Atendimentos.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("toastExportSuccess"));
  };

  const handlePrint = () => {
    if (data.length === 0) {
      toast.error(t("toastNoData"));
      return;
    }
    const headers = [
      t("colId"), t("colStatus"), t("colTipo"), t("colNome"), t("colNumero"), t("colConexao"),
      t("colUltimaMensagem"), t("colMsgsNaoLidas"), t("colDemanda"), t("colFila"),
      t("colUsuario"), t("colCanal"), t("colValor"), t("colNotas"), t("colDataCriacao"),
      t("colInicioAtendimento"), t("colDataFechamento"), t("colTempoAtribuicao"), t("colTempoPrimeiraResposta"), t("colTempoAtendimento"),
    ];
    const rows = data.map((row) => [
      String(row.id),
      formatStatus(row.status),
      attendanceLabel(row.attendanceType),
      row.contact?.name ?? "N/A",
      displayContactIdentity(row.contact) || "N/A",
      row.whatsapp?.name ?? "N/A",
      lastMessageText(row.lastMessage),
      row.unreadMessages ? t("sim") : t("nao"),
      row.reasonName ?? row.reasons ?? "N/A",
      row.queue?.queue ?? row.queue?.name ?? "N/A",
      row.user?.name ?? "N/A",
      formatChannel(row.channel ?? ""),
      row.value ? `R$ ${row.value}` : "N/A",
      formatNotes(row.ticketNotes),
      formatDate(row.createdAt),
      formatEpochDate(row.startedAttendanceAt) ?? t("naoIniciado"),
      formatEpochDate(row.closedAt) ?? t("emAberto"),
      formatRowDuration(timeAtrib(row)),
      formatRowDuration(timeResp(row)),
      formatRowDuration(timeAtend(row)),
    ]);
    if (!printReportTable({ title: t("title"), headers, rows })) {
      toast.error(t("toastExportError"));
    }
  };

  // Aggregate ticket counts by queue name for the drill-down chart
  const queueChartData = (() => {
    const counts: Record<string, number> = {};
    data.forEach((row) => {
      const queueName = row.queue?.queue ?? row.queue?.name ?? tCommon("noQueue");
      counts[queueName] = (counts[queueName] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  })();

  const valueSum = displayData.reduce((sum, row) => {
    const v = parseFloat(String(row.value ?? ""));
    return isNaN(v) ? sum : sum + v;
  }, 0);
  const hasValues = displayData.some(row => !isNaN(parseFloat(String(row.value ?? ""))));

  // TMA (tempo médio de atendimento) e TME (tempo médio até 1ª resposta)
  // calculados a partir do conjunto JÁ FILTRADO (displayData), espelhando a
  // fórmula SQL de DashTicketsAndTimesZPRO: por ticket, minutos =
  // GREATEST(0, (fim - createdAt)/60000 - totalPauseTime/60000); média sobre
  // todos os tickets do conjunto (tickets sem fim contam como 0, igual ao AVG do backend).
  const timeStats = (() => {
    // Contador de grupos desligado no tenant: grupo não entra nas médias.
    const considered = hideGroupTimes
      ? displayData.filter((row) => !row.isGroup)
      : displayData;
    if (considered.length === 0) return null;
    let sumTma = 0;
    let sumTme = 0;
    considered.forEach((row) => {
      const created = new Date(row.createdAt).getTime();
      if (isNaN(created)) return;
      const pauseMin = (Number(row.totalPauseTime ?? 0) || 0) / 60000;
      const closed = row.closedAt ? Number(row.closedAt) : null;
      const started = row.startedAttendanceAt ? Number(row.startedAttendanceAt) : null;
      if (closed) sumTma += Math.max(0, (closed - created) / 60000 - pauseMin);
      if (started) sumTme += Math.max(0, (started - created) / 60000 - pauseMin);
    });
    const toHMS = (totalMinFloat: number) => {
      const totalSec = Math.round(totalMinFloat * 60);
      return {
        hours: Math.floor(totalSec / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
      };
    };
    return {
      tma: formatDuration(toHMS(sumTma / considered.length)),
      tme: formatDuration(toHMS(sumTme / considered.length)),
    };
  })();

  // Médias das colunas de duração no rodapé — sempre MÉDIA (nunca soma), calculadas
  // apenas sobre as linhas em que o marco ocorreu (mesma semântica do "—" por linha).
  const durationAverages = (() => {
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    const atrib = displayData.map(rowFirstResponseMinutes).filter((v): v is number => v !== null);
    const resp = displayData.map(rowFirstReplyMinutes).filter((v): v is number => v !== null);
    const atend = displayData.map(rowHandlingMinutes).filter((v): v is number => v !== null);
    return { atrib: avg(atrib), resp: avg(resp), atend: avg(atend) };
  })();

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }} />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t("title")}</CardTitle>
            {data.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                {tFunil("exportCSV")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: dates + action buttons */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label>{t("labelDataInicio")}</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("labelDataFim")}</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
            <DateRangePresets onSelect={(s, e) => { setDateStart(s); setDateEnd(e); handleFilter(s, e); }} />
            <Button onClick={() => handleFilter()} disabled={loading}>
              {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {t("btnGerar")}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={data.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              {t("btnImprimir")}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t("btnExportar")}
            </Button>
          </div>

          {/* Row 2: filters */}
          <div className="flex flex-wrap items-end gap-4">
            <MultiSelect
              label={t("labelStatus")}
              placeholder={t("placeholderSelecionar")}
              noOptions={t("nenhumaOpcao")}
              options={STATUS_OPTIONS}
              selected={selectedStatus}
              onChange={setSelectedStatus}
            />
            <MultiSelect
              label={t("labelConexoes")}
              placeholder={t("placeholderSelecionar")}
              noOptions={t("nenhumaOpcao")}
              options={connectionsOptions}
              selected={selectedConnections}
              onChange={setSelectedConnections}
              disabled={filtersLoading}
            />
            <MultiSelect
              label={t("labelFilas")}
              placeholder={t("placeholderSelecionar")}
              noOptions={t("nenhumaOpcao")}
              options={queuesOptions}
              selected={selectedQueues}
              onChange={setSelectedQueues}
              disabled={filtersLoading}
            />
            <SingleSelect
              label={t("labelUsuario")}
              allLabel={t("todos")}
              options={usersOptions}
              selected={selectedUserId}
              onChange={setSelectedUserId}
            />
            <SingleSelect
              label={t("labelTipoAtendimento")}
              allLabel={t("todos")}
              options={[
                { label: t("tipoAtivo"), value: "active" },
                { label: t("tipoReceptivo"), value: "receptive" },
              ]}
              selected={selectedAttendanceType}
              onChange={setSelectedAttendanceType}
            />
            <MultiSelect
              label={t("labelCanal")}
              placeholder={t("placeholderSelecionar")}
              noOptions={t("nenhumaOpcao")}
              options={CHANNEL_OPTIONS}
              selected={selectedChannels}
              onChange={setSelectedChannels}
            />
            <MultiSelect
              label={t("labelDemanda")}
              placeholder={t("placeholderSelecionar")}
              noOptions={t("nenhumaOpcao")}
              options={reasonsOptions}
              selected={selectedReasons}
              onChange={setSelectedReasons}
              disabled={filtersLoading}
            />
            <div className="grid gap-2">
              <Label>{t("labelValorMin")}</Label>
              <Input
                type="number"
                placeholder="0"
                value={valueMin}
                onChange={(e) => setValueMin(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("labelValorMax")}</Label>
              <Input
                type="number"
                placeholder="0"
                value={valueMax}
                onChange={(e) => setValueMax(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-[300px]" />
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Filter className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">{t("nenhumDado")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("emptyHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart: atendimentos por fila — clique filtra a tabela */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("chartByQueueTitle")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("chartClickHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={queueChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                    onClick={(e) => {
                      if (e && e.activePayload && e.activePayload.length > 0) {
                        const clickedName = (e.activePayload[0].payload as { name: string }).name;
                        setActiveFilter((prev) => prev === clickedName ? null : clickedName);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [value, t("colFila")]}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={36}>
                      {queueChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={activeFilter === entry.name ? "hsl(220, 70%, 40%)" : "hsl(220, 70%, 50%)"}
                          opacity={activeFilter && activeFilter !== entry.name ? 0.45 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Active filter chip */}
          {activeFilter && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("activeFilterLabel")}</span>
              <Badge variant="secondary" className="flex items-center gap-1 pr-1">
                {activeFilter}
                <button
                  onClick={() => setActiveFilter(null)}
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  aria-label={t("clearFilter")}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <span className="text-xs text-muted-foreground">
                ({t("ticketsCount", { count: displayData.length })})
              </span>
            </div>
          )}

          {/* Metrics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{t("metricsTotalTickets")}</p>
                <p className="text-2xl font-bold tabular-nums">{displayData.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{t("metricsTotalValue")}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {hasValues ? `R$ ${valueSum.toFixed(2)}` : t("metricsNoData")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{t("metricsAvgHandling")}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {timeStats ? timeStats.tma : t("metricsNoData")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">{t("metricsAvgFirstResponse")}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {timeStats ? timeStats.tme : t("metricsNoData")}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="overflow-x-auto">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colId")}</SortableTableHead>
                      <SortableTableHead sortKey="status" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                      <SortableTableHead sortKey="tipo" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTipo")}</SortableTableHead>
                      <SortableTableHead sortKey="nome" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colNome")}</SortableTableHead>
                      <SortableTableHead sortKey="numero" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colNumero")}</SortableTableHead>
                      <SortableTableHead sortKey="conexao" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colConexao")}</SortableTableHead>
                      <TableHead className="max-w-[200px]">{t("colUltimaMensagem")}</TableHead>
                      <SortableTableHead sortKey="naoLidas" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colMsgsNaoLidas")}</SortableTableHead>
                      <SortableTableHead sortKey="demanda" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDemanda")}</SortableTableHead>
                      <SortableTableHead sortKey="fila" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colFila")}</SortableTableHead>
                      <SortableTableHead sortKey="usuario" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colUsuario")}</SortableTableHead>
                      <SortableTableHead sortKey="canal" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colCanal")}</SortableTableHead>
                      <SortableTableHead sortKey="valor" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colValor")}</SortableTableHead>
                      <TableHead className="max-w-[200px]">{t("colNotas")}</TableHead>
                      <SortableTableHead sortKey="dataCriacao" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDataCriacao")}</SortableTableHead>
                      <SortableTableHead sortKey="inicioAtendimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colInicioAtendimento")}</SortableTableHead>
                      <SortableTableHead sortKey="dataFechamento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDataFechamento")}</SortableTableHead>
                      <SortableTableHead sortKey="tempoAtribuicao" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                        <span className="inline-flex items-center gap-1 cursor-help" title={t("colTempoAtribuicaoInfo")}>
                          {t("colTempoAtribuicao")}
                          <Info className="h-3 w-3 text-muted-foreground/60" />
                        </span>
                      </SortableTableHead>
                      <SortableTableHead sortKey="tempoPrimeiraResposta" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                        <span className="inline-flex items-center gap-1 cursor-help" title={t("colTempoPrimeiraRespostaInfo")}>
                          {t("colTempoPrimeiraResposta")}
                          <Info className="h-3 w-3 text-muted-foreground/60" />
                        </span>
                      </SortableTableHead>
                      <SortableTableHead sortKey="tempoAtendimento" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTempoAtendimento")}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map(({ row }) => (
                      <TableRow key={row.id} className="odd:bg-muted/30">
                        <TableCell className="font-mono text-xs">#{row.id}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === "closed"
                                ? "secondary"
                                : row.status === "open"
                                ? "default"
                                : "outline"
                            }
                          >
                            {formatStatus(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.attendanceType === "active" ? (
                            <Badge className="border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {t("tipoAtivo")}
                            </Badge>
                          ) : row.attendanceType === "receptive" ? (
                            <Badge variant="secondary">{t("tipoReceptivo")}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("tipoIndefinido")}</span>
                          )}
                        </TableCell>
                        <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>
                          {row.contact?.name ?? "N/A"}
                        </TableCell>
                        <TableCell className={cn(isLiveMode && "live-blur-text")}>{displayContactIdentity(row.contact) || "N/A"}</TableCell>
                        <TableCell>{row.whatsapp?.name ?? "N/A"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">
                          {lastMessageText(row.lastMessage)}
                        </TableCell>
                        <TableCell>{row.unreadMessages ? t("sim") : t("nao")}</TableCell>
                        <TableCell>{row.reasonName ?? row.reasons ?? "N/A"}</TableCell>
                        <TableCell>
                          {row.queue?.queue ?? row.queue?.name ?? "N/A"}
                        </TableCell>
                        <TableCell>{row.user?.name ?? "N/A"}</TableCell>
                        <TableCell className="text-xs">
                          {formatChannel(row.channel ?? "")}
                        </TableCell>
                        <TableCell>
                          {row.value ? `R$ ${row.value}` : "N/A"}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-xs break-words">
                          {formatNotes(row.ticketNotes)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatEpochDate(row.startedAttendanceAt) ?? t("naoIniciado")}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatEpochDate(row.closedAt) ?? t("emAberto")}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          {formatRowDuration(timeAtrib(row))}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          {formatRowDuration(timeResp(row))}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          {formatRowDuration(timeAtend(row))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {displayData.length > 0 && (
                    <TableFooter>
                      <TableRow className="font-semibold bg-muted/40">
                        <TableCell colSpan={3} className="text-sm whitespace-nowrap">
                          {t("ticketsCount", { count: displayData.length })}
                        </TableCell>
                        <TableCell colSpan={9} className="text-right text-sm">
                          {hasValues ? t("metricsValueTotal") : ""}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {hasValues ? `R$ ${valueSum.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell colSpan={4} />
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                          {formatRowDuration(durationAverages.atrib)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                          {formatRowDuration(durationAverages.resp)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          <span className="block text-[10px] font-normal text-muted-foreground">{t("footerAvg")}</span>
                          {formatRowDuration(durationAverages.atend)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </div>
          </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
