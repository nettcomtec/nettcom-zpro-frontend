"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Activity, AlertTriangle, ArrowLeftRight, Bot, CalendarClock, CircleCheck, Clock, Handshake, Hash, History, Kanban,
  ListOrdered, ListTodo, Megaphone, MessageSquarePlus, MessagesSquare, Paperclip, Phone, PhoneIncoming, PhoneOutgoing,
  RotateCcw, RotateCw, Smartphone, SquareCheckBig, Star, StickyNote, Tag, Target, UserCheck, UserPen, Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { useLiveMode } from "@/hooks/use-live-mode";
import { formatCurrencyBRL, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  loadContactTimeline, type ContactTimelineGroup, type ContactTimelineItem,
} from "@/services/contact-crm";

// PLANO_CRM_CONTATO — Fase 2 (§5.2-15). Aba Timeline da página /contatos/[contactId].
// Tipos e `data` de cada fonte: services/contact-crm.ts e
// backend/src/services/ContactEventServices/ContactEventTypesZPRO.ts.
// Backend futuro pode mandar tipos novos: tudo que não está nas listas abaixo vira
// o rótulo genérico `unknown`, nunca chave i18n crua nem erro.

const PAGE_SIZE = 30;

const ALL_GROUPS: ContactTimelineGroup[] = ["tickets", "funnel", "contact", "campaigns", "notes", "calls", "relationship"];

const GROUP_ICON: Record<ContactTimelineGroup, ElementType> = {
  tickets: MessagesSquare,
  funnel: Target,
  contact: Tag,
  campaigns: Megaphone,
  notes: StickyNote,
  calls: Phone,
  relationship: Handshake,
};

const GROUP_TONE: Record<ContactTimelineGroup, string> = {
  tickets: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  funnel: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  contact: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  campaigns: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  notes: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  calls: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  relationship: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

const UNKNOWN_TONE = "bg-muted text-muted-foreground";

const LOG_TYPES = new Set([
  "create", "open", "pending", "closed", "transfered", "receivedTransfer",
  "userDefine", "queue", "channelDefine", "chatBot", "autoClose",
]);
const SYSTEM_TYPES = new Set(["evaluation", "protocol", "scheduleSent"]);
const ACTOR_SOURCES = new Set(["ui", "api", "bot", "ai", "automation", "campaign", "inbound"]);
const OPPORTUNITY_STATUSES = new Set(["open", "win", "lose"]);
const CONTACT_FIELDS = new Set([
  "name", "number", "email", "cpf", "birthdayDate", "businessName", "firstName", "lastName",
  "cep", "logradouro", "numeroEndereco", "complemento", "bairro", "cidade", "estado",
]);

type Translate = ReturnType<typeof useTranslations>;

/** Trecho interpolado; `sensitive` = dado do cliente, ofuscado no modo apresentação. */
interface Segment {
  text: string;
  sensitive?: boolean;
}

type MessageValue = string | Segment;

interface FieldChange {
  label: string;
  from: string | null;
  to: string | null;
}

interface ItemContent {
  lines: ReactNode[];
  details: Segment[];
  /** Marcador no início da linha secundária (cor do tipo de relacionamento, ícone do prazo) */
  detailsLead: ReactNode | null;
  /** Complemento no fim da linha secundária (quantidade de anexos) */
  detailsTrail: ReactNode | null;
  changes: FieldChange[];
  noteText: string | null;
  meta: string[];
}

// Marcadores de uso privado: a mensagem traduzida é montada com eles no lugar dos
// valores sensíveis e depois quebrada em pedaços — assim só o valor recebe o blur,
// sem mudar as chaves i18n (o t.rich só aceita função de tag, não valor React).
const TOKEN_SPLIT = /(\d+)/;

function renderMessage(t: Translate, key: string, values: Record<string, MessageValue>, blur: boolean): ReactNode {
  const hidden: string[] = [];
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string") {
      params[name] = value;
    } else if (blur && value.sensitive) {
      params[name] = `${hidden.length}`;
      hidden.push(value.text);
    } else {
      params[name] = value.text;
    }
  }
  const text = t(key, params);
  if (hidden.length === 0) return text;
  return text.split(TOKEN_SPLIT).map((piece, index) =>
    index % 2 === 1 ? (
      <span key={index} className="live-blur-text">
        {hidden[Number(piece)] ?? ""}
      </span>
    ) : piece ? (
      <Fragment key={index}>{piece}</Fragment>
    ) : null
  );
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Cor do tipo de relacionamento só quando é um valor de cor reconhecível (texto livre no banco). */
function safeColor(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text;
  if (/^(rgb|hsl)a?\([\d\s.,%/+-]+\)$/i.test(text)) return text;
  return null;
}

/** Prazo de tarefa é data pura (mesma leitura de /tarefas): nunca escorrega um dia pelo fuso. */
function formatDeadline(value: unknown): string | null {
  const day = (asText(value) ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  return formatDate(new Date(year, month - 1, date));
}

function groupOf(item: ContactTimelineItem): ContactTimelineGroup | null {
  const type = String(item.type || "");
  switch (item.source) {
    case "event":
      if (type.startsWith("opportunity_")) return "funnel";
      if (type.startsWith("tag_") || type === "kanban_changed" || type === "wallet_changed" || type === "contact_updated") {
        return "contact";
      }
      if (type.startsWith("ai_agent_") || type === "ticket_reopened") return "tickets";
      return null;
    case "log":
    case "system":
      return "tickets";
    case "note":
      return "notes";
    case "campaign":
      return "campaigns";
    case "call":
      return "calls";
    case "relationship":
    case "task":
      return "relationship";
    default:
      return null;
  }
}

function iconOf(item: ContactTimelineItem): ElementType {
  const type = String(item.type || "");
  switch (item.source) {
    case "event":
      if (type.startsWith("opportunity_")) return Target;
      if (type.startsWith("tag_")) return Tag;
      if (type === "kanban_changed") return Kanban;
      if (type === "wallet_changed") return Wallet;
      if (type === "contact_updated") return UserPen;
      if (type.startsWith("ai_agent_")) return Bot;
      if (type === "ticket_reopened") return RotateCcw;
      return Activity;
    case "log":
      switch (type) {
        case "create": return MessageSquarePlus;
        case "pending": return Clock;
        case "closed":
        case "autoClose": return CircleCheck;
        case "transfered":
        case "receivedTransfer": return ArrowLeftRight;
        case "userDefine": return UserCheck;
        case "queue": return ListOrdered;
        case "channelDefine": return Smartphone;
        case "chatBot": return Bot;
        default: return MessagesSquare;
      }
    case "system":
      if (type === "evaluation") return Star;
      if (type === "protocol") return Hash;
      if (type === "scheduleSent") return CalendarClock;
      return MessagesSquare;
    case "note":
      return StickyNote;
    case "campaign":
      return Megaphone;
    case "call": {
      const direction = asText(asRecord(item.data).direction)?.toLowerCase();
      if (direction === "incoming") return PhoneIncoming;
      if (direction === "outgoing") return PhoneOutgoing;
      return Phone;
    }
    case "relationship":
      return Handshake;
    case "task":
      return type === "task_completed" ? SquareCheckBig : ListTodo;
    default:
      return Activity;
  }
}

/** Data de calendário do navegador (a mesma que o formatDate exibe). */
function dayKeyOf(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Acrescenta sem repetir `key` (páginas vizinhas podem se sobrepor). */
function mergeItems(current: ContactTimelineItem[], incoming: ContactTimelineItem[] | null | undefined): ContactTimelineItem[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const seen = new Set(current.map((item) => item.key));
  const next = [...current];
  for (const item of incoming) {
    if (!item || typeof item.key !== "string" || seen.has(item.key)) continue;
    seen.add(item.key);
    next.push(item);
  }
  return next;
}

export interface ContactTimelineProps {
  contactId: number;
  /** Dica do ticket de origem — repassada ao backend como na página */
  ticketId?: number | null;
  /** Plano sem funil: o backend nunca devolve eventos de funil — o filtro some */
  showFunnel?: boolean;
  /** WaVoIP desligado: o backend nunca devolve chamadas — o filtro some */
  showCalls?: boolean;
  /** Relacionamento fora do plano (ou backend sem o recurso): o filtro some */
  showRelationship?: boolean;
}

type ViewStatus = "loading" | "ok" | "error";

export function ContactTimeline({
  contactId, ticketId, showFunnel = true, showCalls = true, showRelationship = false,
}: ContactTimelineProps) {
  const visibleGroups = ALL_GROUPS.filter(
    (g) => (g !== "funnel" || showFunnel) && (g !== "calls" || showCalls) && (g !== "relationship" || showRelationship)
  );
  const t = useTranslations("contactTimeline");
  const { isLiveMode } = useLiveMode();
  const blur = isLiveMode;

  const [groups, setGroups] = useState<ContactTimelineGroup[]>([]);
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [items, setItems] = useState<ContactTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Toda carga do zero (filtro, contato, nova tentativa, desmontagem) avança a
  // sequência: resposta de requisição anterior — inclusive "carregar mais" — é descartada.
  const requestSeq = useRef(0);
  const loadingMoreRef = useRef(false);

  const groupsKey = groups.join(",");
  const hintTicketId = ticketId ?? null;

  useEffect(() => {
    const seq = ++requestSeq.current;
    loadingMoreRef.current = false;
    setStatus("loading");
    setItems([]);
    setNextCursor(null);
    setLoadingMore(false);
    setLoadMoreFailed(false);

    const selected = groupsKey ? (groupsKey.split(",") as ContactTimelineGroup[]) : undefined;
    loadContactTimeline(contactId, {
      limit: PAGE_SIZE,
      groups: selected,
      ticketId: hintTicketId,
      background: true,
    })
      .then((result) => {
        if (seq !== requestSeq.current) return;
        if (result.status !== "ok") {
          setStatus("error");
          return;
        }
        setItems(mergeItems([], result.data?.items));
        setNextCursor(result.data?.nextCursor || null);
        setStatus("ok");
      })
      .catch(() => {
        if (seq === requestSeq.current) setStatus("error");
      });

    return () => {
      requestSeq.current += 1;
    };
  }, [contactId, hintTicketId, groupsKey, reloadKey]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMoreRef.current) return;
    const seq = requestSeq.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);

    const selected = groupsKey ? (groupsKey.split(",") as ContactTimelineGroup[]) : undefined;
    loadContactTimeline(contactId, {
      cursor: nextCursor,
      limit: PAGE_SIZE,
      groups: selected,
      ticketId: hintTicketId,
    })
      .then((result) => {
        if (seq !== requestSeq.current) return;
        if (result.status !== "ok") {
          setLoadMoreFailed(true);
          return;
        }
        setItems((prev) => mergeItems(prev, result.data?.items));
        setNextCursor(result.data?.nextCursor || null);
      })
      .catch(() => {
        if (seq === requestSeq.current) setLoadMoreFailed(true);
      })
      .finally(() => {
        if (seq !== requestSeq.current) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [contactId, hintTicketId, groupsKey, nextCursor]);

  const toggleGroup = useCallback((group: ContactTimelineGroup) => {
    setGroups((prev) => {
      const next = prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group];
      // Ordem fixa: a mesma seleção sempre gera a mesma chave (não recarrega à toa).
      const ordered = ALL_GROUPS.filter((g) => next.includes(g));
      return ordered.length >= visibleGroups.length ? [] : ordered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups.length]);

  const days = useMemo(() => {
    const result: { key: string; label: string; items: ContactTimelineItem[] }[] = [];
    for (const item of items) {
      const key = dayKeyOf(item.at);
      let current = result[result.length - 1];
      if (!current || current.key !== key) {
        current = {
          key,
          label: key ? formatDate(item.at, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—",
          items: [],
        };
        result.push(current);
      }
      current.items.push(item);
    }
    return result;
  }, [items]);

  const unnamed = t("unnamed");
  const emptyValue = t("emptyValue");

  const moneySegment = (value: unknown): Segment => {
    const n = asNumber(value);
    return n == null ? { text: emptyValue } : { text: formatCurrencyBRL(n), sensitive: true };
  };

  const statusLabel = (value: unknown): string | null => {
    const raw = asText(value);
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    return OPPORTUNITY_STATUSES.has(normalized) ? t(`statuses.${normalized}`) : raw;
  };

  const stageLabel = (stage: unknown, pipeline: unknown, otherPipeline: unknown): string => {
    const stageName = asText(stage) ?? unnamed;
    const pipelineName = asText(pipeline);
    const otherName = asText(otherPipeline);
    // Funil só aparece quando a mudança atravessou funis.
    return pipelineName && otherName && pipelineName !== otherName ? `${pipelineName} / ${stageName}` : stageName;
  };

  const kanbanLabel = (name: unknown, raw: unknown): string => {
    const text = asText(name);
    if (text) return text;
    const fallback = asText(raw);
    if (!fallback) return emptyValue;
    return /^\d+$/.test(fallback) ? `#${fallback}` : fallback;
  };

  const fieldValue = (field: string, value: unknown): string | null => {
    const text = asText(value);
    if (!text) return null;
    if (field === "birthdayDate" && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      // Meio-dia local: a data pura não pode escorregar um dia pelo fuso.
      return formatDate(`${text}T12:00:00`);
    }
    return text;
  };

  const buildContent = (item: ContactTimelineItem): ItemContent => {
    const type = String(item.type || "");
    const data = asRecord(item.data);
    const content: ItemContent = {
      lines: [], details: [], detailsLead: null, detailsTrail: null, changes: [], noteText: null, meta: [],
    };
    const msg = (key: string, values: Record<string, MessageValue>) => renderMessage(t, key, values, blur);

    switch (item.source) {
      case "event": {
        const oppName: Segment = { text: asText(data.name) ?? unnamed, sensitive: true };
        switch (type) {
          case "opportunity_created": {
            content.lines.push(msg("events.opportunity_created", { name: oppName }));
            const stage = asText(data.stageName);
            const pipeline = asText(data.pipelineName);
            if (stage || pipeline) content.details.push({ text: [pipeline, stage].filter(Boolean).join(" / ") });
            if (asNumber(data.value) != null) content.details.push(moneySegment(data.value));
            break;
          }
          case "opportunity_stage":
            content.lines.push(
              msg("events.opportunity_stage", {
                name: oppName,
                from: stageLabel(data.fromStageName, data.fromPipelineName, data.toPipelineName),
                to: stageLabel(data.toStageName, data.toPipelineName, data.fromPipelineName),
              })
            );
            break;
          case "opportunity_status":
            content.lines.push(
              msg("events.opportunity_status", { name: oppName, status: statusLabel(data.to) ?? emptyValue })
            );
            if (asNumber(data.value) != null) content.details.push(moneySegment(data.value));
            break;
          case "opportunity_value":
            content.lines.push(
              msg("events.opportunity_value", { name: oppName, from: moneySegment(data.from), to: moneySegment(data.to) })
            );
            break;
          case "opportunity_responsible":
            content.lines.push(
              msg("events.opportunity_responsible", {
                name: oppName,
                from: asText(data.fromUserName) ?? emptyValue,
                to: asText(data.toUserName) ?? emptyValue,
              })
            );
            break;
          case "opportunity_contact_changed": {
            const direction = asText(data.direction);
            if (direction === "in") content.lines.push(msg("events.opportunity_contact_changed_in", { name: oppName }));
            else if (direction === "out") content.lines.push(msg("events.opportunity_contact_changed_out", { name: oppName }));
            else content.lines.push(t("unknown"));
            break;
          }
          case "opportunity_deleted": {
            content.lines.push(msg("events.opportunity_deleted", { name: oppName }));
            const status = statusLabel(data.status);
            if (status) content.details.push({ text: status });
            if (asNumber(data.value) != null) content.details.push(moneySegment(data.value));
            break;
          }
          case "tag_added":
          case "tag_removed":
            content.lines.push(msg(`events.${type}`, { name: asText(data.tagName) ?? unnamed }));
            break;
          case "kanban_changed":
            content.lines.push(
              msg("events.kanban_changed", {
                from: kanbanLabel(data.fromName, data.from),
                to: kanbanLabel(data.toName, data.to),
              })
            );
            break;
          case "wallet_changed": {
            const names = (list: unknown) =>
              (Array.isArray(list) ? list : []).map((entry) => asText(asRecord(entry).name) ?? unnamed);
            const added = names(data.added);
            const removed = names(data.removed);
            if (added.length > 0) content.lines.push(msg("events.wallet_added", { names: added.join(", ") }));
            if (removed.length > 0) content.lines.push(msg("events.wallet_removed", { names: removed.join(", ") }));
            if (content.lines.length === 0) content.lines.push(t("unknown"));
            break;
          }
          case "contact_updated": {
            const list = Array.isArray(data.fields) ? data.fields : [];
            for (const entry of list) {
              const change = asRecord(entry);
              const field = asText(change.field);
              if (!field) continue;
              const label = field.startsWith("extra:")
                ? field.slice("extra:".length) || unnamed
                : CONTACT_FIELDS.has(field)
                  ? t(`fields.${field}`)
                  : field;
              content.changes.push({
                label,
                from: fieldValue(field, change.from),
                to: fieldValue(field, change.to),
              });
            }
            if (content.changes.length > 0) {
              const labels = Array.from(new Set(content.changes.map((c) => c.label)));
              const omitted = Number(data.omitted);
              const fieldsText = labels.join(", ") + (Number.isInteger(omitted) && omitted > 0 ? ` (+${omitted})` : "");
              content.lines.push(msg("events.contact_updated", { fields: fieldsText }));
            } else {
              content.lines.push(t("unknown"));
            }
            break;
          }
          case "ai_agent_armed":
          case "ai_agent_released":
          case "ai_agent_blocked_contact":
          case "ticket_reopened": {
            content.lines.push(t(`events.${type}`));
            const agentName = asText(data.agentName);
            if (agentName) content.meta.push(agentName);
            break;
          }
          default:
            content.lines.push(t("unknown"));
        }
        break;
      }
      case "log": {
        content.lines.push(LOG_TYPES.has(type) ? t(`logs.${type}`) : t("unknown"));
        const queueName = asText(data.queueName);
        if (queueName) content.meta.push(queueName);
        break;
      }
      case "system":
        content.lines.push(SYSTEM_TYPES.has(type) ? t(`system.${type}`) : t("unknown"));
        break;
      case "note":
        content.lines.push(t("note"));
        content.noteText = asText(data.text);
        break;
      case "campaign":
        content.lines.push(msg("campaign", { name: asText(data.campaignName) ?? unnamed }));
        break;
      case "call": {
        content.lines.push(t("call"));
        const duration = asNumber(data.duration);
        if (duration != null && duration > 0) content.details.push({ text: formatDuration(duration) });
        break;
      }
      case "relationship": {
        content.lines.push(msg("relationship", { type: asText(data.typeName) ?? t("unknown") }));
        const description = asText(data.description);
        if (description) content.details.push({ text: description, sensitive: true });
        const attachmentsCount = asNumber(data.attachmentsCount);
        if (attachmentsCount != null && attachmentsCount > 0) {
          content.detailsTrail = (
            <span className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap align-middle">
              <Paperclip aria-hidden className="h-3 w-3" />
              {attachmentsCount}
            </span>
          );
        }
        const color = safeColor(data.typeColor);
        if (description) {
          content.detailsLead = (
            <span
              aria-hidden
              className={cn(
                "mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle",
                !color && "bg-muted-foreground/40"
              )}
              style={color ? { backgroundColor: color } : undefined}
            />
          );
        }
        break;
      }
      case "task": {
        if (type === "task_created" || type === "task_completed") {
          content.lines.push(msg(type, { name: { text: asText(data.name) ?? unnamed, sensitive: true } }));
          const deadline = formatDeadline(data.limitDate);
          if (deadline) {
            content.details.push({ text: deadline });
            content.detailsLead = <CalendarClock aria-hidden className="mr-1 inline-block h-3 w-3 align-[-2px]" />;
          }
        } else {
          content.lines.push(t("unknown"));
        }
        break;
      }
      default:
        content.lines.push(t("unknown"));
    }
    return content;
  };

  const buildMeta = (item: ContactTimelineItem, extra: string[]): string[] => {
    const meta: string[] = [];
    if (!Number.isNaN(new Date(item.at).getTime())) {
      meta.push(formatTime(item.at, { hour: "2-digit", minute: "2-digit" }));
    }
    if (item.user) meta.push(t("byUser", { name: asText(item.user.name) ?? unnamed }));
    if (item.source === "event" && item.actorSource && ACTOR_SOURCES.has(item.actorSource)) {
      meta.push(t("viaSource", { source: t(`sources.${item.actorSource}`) }));
    }
    if (item.ticketId) meta.push(t("ticketLabel", { id: String(item.ticketId) }));
    meta.push(...extra);
    return meta;
  };

  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      {[null, ...visibleGroups].map((group) => {
        const active = group === null ? groups.length === 0 : groups.includes(group);
        const Icon = group ? GROUP_ICON[group] : null;
        return (
          <button
            key={group ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => (group === null ? setGroups([]) : toggleGroup(group))}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {group === null ? t("filterAll") : t(`groups.${group}`)}
          </button>
        );
      })}
    </div>
  );

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <Card>
        <CardContent className="p-4 space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  } else if (status === "error") {
    body = (
      <EmptyState icon={AlertTriangle} title={t("loadError")}>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="mr-2 h-4 w-4" />
          {t("retry")}
        </Button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = <EmptyState icon={History} title={t("empty")} description={t("emptyHint")} />;
  } else {
    body = (
      <div className="space-y-4">
        {days.map((day, dayIndex) => (
          <section key={`${day.key}-${dayIndex}`} className="space-y-2">
            <h3 className="px-1 text-sm font-medium text-muted-foreground first-letter:uppercase">{day.label}</h3>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <ol>
                  {day.items.map((item, index) => {
                    const isLast = index === day.items.length - 1;
                    const group = groupOf(item);
                    const Icon = iconOf(item);
                    const content = buildContent(item);
                    const meta = buildMeta(item, content.meta);
                    return (
                      <li key={item.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                              group ? GROUP_TONE[group] : UNKNOWN_TONE
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
                        </div>
                        <div className={cn("min-w-0 flex-1 pt-1", !isLast && "pb-4")}>
                          {content.lines.map((line, lineIndex) => (
                            <p key={lineIndex} className="text-sm font-medium leading-snug break-words">
                              {line}
                            </p>
                          ))}
                          {content.details.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground break-words">
                              {content.detailsLead}
                              {content.details.map((segment, segmentIndex) => (
                                <Fragment key={segmentIndex}>
                                  {segmentIndex > 0 && " · "}
                                  <span className={cn(blur && segment.sensitive && "live-blur-text")}>
                                    {segment.text}
                                  </span>
                                </Fragment>
                              ))}
                              {content.detailsTrail}
                            </p>
                          )}
                          {content.changes.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {content.changes.map((change, changeIndex) => (
                                <li key={changeIndex} className="break-words">
                                  <span className="font-medium text-foreground/80">{change.label}:</span>{" "}
                                  <span className={cn(blur && change.from != null && "live-blur-text")}>
                                    {change.from ?? emptyValue}
                                  </span>
                                  {" → "}
                                  <span className={cn(blur && change.to != null && "live-blur-text")}>
                                    {change.to ?? emptyValue}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {content.noteText && (
                            <p
                              className={cn(
                                "mt-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm text-foreground whitespace-pre-wrap break-words",
                                blur && "live-blur-text"
                              )}
                            >
                              {content.noteText}
                            </p>
                          )}
                          {meta.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground break-words">{meta.join(" · ")}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </section>
        ))}

        {nextCursor && (
          <div className="flex flex-col items-center gap-2">
            {loadMoreFailed && <p className="text-xs text-destructive">{t("loadError")}</p>}
            <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
              {!loadingMore && loadMoreFailed && <RotateCw className="h-4 w-4" />}
              {loadMoreFailed ? t("retry") : t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterChips}
      {body}
    </div>
  );
}

export default ContactTimeline;
