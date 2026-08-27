"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { INTERACTION_TYPES } from "./lib/types";
import {
  MessageSquare, Image, Clock, Bot, Blocks, Workflow, Tag, LayoutGrid,
  ShieldOff, Globe, GitBranch, TrendingUp, Calendar, ArrowRightLeft,
  UserCircle, MapPin, Smile, Video, CalendarClock, CalendarPlus, ListChecks,
  Phone, Mic, FileText, SquareStack, List, Receipt, FileBadge, BellRing,
  ArrowLeftRight, TimerReset,
} from "lucide-react";

// Palette lateral do flow-builder: blocos arrastáveis para o canvas. Cada bloco
// cria um nó pré-configurado com UMA interação do tipo correspondente. O drop é
// tratado no flow-editor (dataTransfer "application/zpro-flow-block").

export const FLOW_BLOCK_MIME = "application/zpro-flow-block";

const iconMap: Record<string, React.ElementType> = {
  MessageSquare, Image, Clock, Bot, Blocks, Workflow, Tag, LayoutGrid,
  ShieldOff, Globe, GitBranch, TrendingUp, Calendar, SquareStack,
  ArrowRightLeft, UserCircle, MapPin, Smile, Video, CalendarClock,
  ListChecks, Phone, Mic, FileText, CalendarPlus, List, Receipt, FileBadge, BellRing,
  ArrowLeftRight, TimerReset,
};

const CATEGORIES: { key: string; labelKey: string; types: string[] }[] = [
  {
    key: "messages",
    labelKey: "paletteCatMessages",
    types: ["message", "media", "button", "list", "template", "sticker", "contact", "location", "videoLink", "pixButton"],
  },
  {
    key: "routing",
    labelKey: "paletteCatRouting",
    types: ["transfer", "carencia", "SwitchChannel", "chatflow", "delay", "chatBotBlock"],
  },
  {
    key: "integrations",
    labelKey: "paletteCatIntegrations",
    types: ["webhook", "webhookAll", "chatgpt", "typebot", "n8n", "vapi", "sms"],
  },
  {
    key: "crm",
    labelKey: "paletteCatCrm",
    types: ["tag", "kanban", "opportunity", "googleAgenda", "schedule", "reasons", "notes", "appointment", "notify"],
  },
];

// Busca case/acento-insensitive (NFD remove diacríticos: "Midia" acha "Mídia")
const normalizeSearch = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function BlockPalette() {
  const t = useTranslations("flowBuilderEditor");
  const [search, setSearch] = useState("");
  const query = normalizeSearch(search.trim());

  return (
    <div className="pointer-events-auto w-[210px] rounded-lg border bg-card shadow-lg">
      <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">
        {t("paletteHint")}
      </p>
      <div className="px-2 pb-1.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("paletteSearch")}
          className="h-7 text-xs"
        />
      </div>
      <div className="max-h-[55vh] overflow-y-auto px-2 pb-2 space-y-2">
        {CATEGORIES.map((cat) => {
          const items = cat.types.flatMap((type) => {
            const it = INTERACTION_TYPES.find((i) => i.type === type);
            if (!it) return [];
            if (query && !normalizeSearch(it.label).includes(query)) return [];
            return [{ type, it }];
          });
          if (items.length === 0) return null;
          return (
            <div key={cat.key}>
              <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {t(cat.labelKey)}
              </p>
              <div className="space-y-0.5">
                {items.map(({ type, it }) => {
                  const Ico = iconMap[it.icon] || MessageSquare;
                  return (
                    <div
                      key={type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(FLOW_BLOCK_MIME, type);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent active:cursor-grabbing"
                      title={it.label}
                    >
                      <Ico className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{it.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
