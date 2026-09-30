"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X, HelpCircle, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchTags, type Tag } from "@/services/tags";
import { fetchKanbans, type Kanban } from "@/services/kanban";

export type TargetAudience = "all" | "new" | "returning" | "custom";

export interface ScheduleWindow {
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface AudienceValue {
  audienceEnabled: boolean;
  targetAudience: TargetAudience;
  audienceMaxAgeDays: number | null;
  audienceTags: string[];
  audienceExcludeTags: string[];
  audienceKanbanId: number | null;
  audienceChannels: string[];
  audienceScheduleEnabled: boolean;
  audienceScheduleWindows: ScheduleWindow[];
  priority: number;
}

interface Props {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
}

// Canais disponíveis pra filtro de origem. Espelha types em Whatsapp.type no backend.
const CHANNEL_OPTIONS = [
  "baileys",
  "zapo",
  "waba",
  "dialog360",
  "gupshup",
  "uazapi",
  "zapi",
  "evo",
  "evogo",
  "meow",
  "instagram",
  "messenger",
  "telegram",
  "webchat",
  "hub",
  "mercadolivre",
  "olx",
  "youtube",
  "tiktok",
  "linkedin",
  "woocommerce",
  "nuvemshop",
];

// Reusa os rótulos curtos de dia da semana do namespace do nó timeTable.
const WEEKDAY_KEYS: { d: number; key: string }[] = [
  { d: 0, key: "weekdaySun" },
  { d: 1, key: "weekdayMon" },
  { d: 2, key: "weekdayTue" },
  { d: 3, key: "weekdayWed" },
  { d: 4, key: "weekdayThu" },
  { d: 5, key: "weekdayFri" },
  { d: 6, key: "weekdaySat" },
];

export function AudienceFields({ value, onChange }: Props) {
  const t = useTranslations("chatFlowAudience");
  const tw = useTranslations("flowBuilderTimeTable");
  const [tags, setTags] = useState<Tag[]>([]);
  const [kanbans, setKanbans] = useState<Kanban[]>([]);
  const [tagInputInclude, setTagInputInclude] = useState("");
  const [tagInputExclude, setTagInputExclude] = useState("");

  useEffect(() => {
    fetchTags()
      .then(({ data }) => setTags(data || []))
      .catch(() => setTags([]));
    // Carga automática: plano sem funil não deve virar toast de "recurso fora do
    // plano" — o filtro por kanban apenas não lista opções.
    fetchKanbans({ background: true })
      .then(({ data }) => setKanbans(data || []))
      .catch(() => setKanbans([]));
  }, []);

  const update = (patch: Partial<AudienceValue>) => onChange({ ...value, ...patch });

  // ─── Horário de funcionamento (janelas) ──────────────────────────────────
  const addWindow = () =>
    update({
      audienceScheduleWindows: [
        ...(value.audienceScheduleWindows || []),
        { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "18:00" },
      ],
    });

  const removeWindow = (idx: number) =>
    update({
      audienceScheduleWindows: (value.audienceScheduleWindows || []).filter(
        (_, i) => i !== idx
      ),
    });

  const updateWindow = (idx: number, patch: Partial<ScheduleWindow>) =>
    update({
      audienceScheduleWindows: (value.audienceScheduleWindows || []).map((w, i) =>
        i === idx ? { ...w, ...patch } : w
      ),
    });

  const toggleWindowWeekday = (idx: number, weekday: number) => {
    const w = (value.audienceScheduleWindows || [])[idx];
    if (!w) return;
    const current = Array.isArray(w.weekdays) ? w.weekdays : [];
    const next = current.includes(weekday)
      ? current.filter((x) => x !== weekday)
      : [...current, weekday].sort((a, b) => a - b);
    updateWindow(idx, { weekdays: next });
  };

  const addTag = (
    raw: string,
    field: "audienceTags" | "audienceExcludeTags",
    clearer: (v: string) => void
  ) => {
    const tag = raw.trim();
    if (!tag) return;
    const current = value[field] || [];
    if (current.map((s) => s.toLowerCase()).includes(tag.toLowerCase())) {
      clearer("");
      return;
    }
    update({ [field]: [...current, tag] } as Partial<AudienceValue>);
    clearer("");
  };

  const removeTag = (tag: string, field: "audienceTags" | "audienceExcludeTags") => {
    update({
      [field]: (value[field] || []).filter((s) => s !== tag),
    } as Partial<AudienceValue>);
  };

  const toggleChannel = (channel: string) => {
    const current = value.audienceChannels || [];
    if (current.includes(channel)) {
      update({ audienceChannels: current.filter((c) => c !== channel) });
    } else {
      update({ audienceChannels: [...current, channel] });
    }
  };

  // Quando o toggle global da audiência está off, todos os campos abaixo ficam
  // desabilitados visualmente. O backend ignora qualquer valor desses campos
  // (gate audienceEnabled em SelectChatFlow/MatchByKeyword/IsContactInAudience),
  // mas mantemos os valores no payload pra preservar configuração do usuário
  // caso ele reabilite depois.
  const disabled = !value.audienceEnabled;

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{t("sectionTitle")}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{t("sectionDesc")}</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t("helpTitle")}
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={6}
            collisionPadding={16}
            avoidCollisions
            className="w-[min(420px,calc(100vw-2rem))] p-0"
            // Radix expõe --radix-popover-content-available-height: altura real disponível
            // até a borda do viewport (já considerando collisionPadding). Usa isso pra
            // limitar o popover e habilita scroll interno em vez de vazar pra fora.
            style={{
              maxHeight: "var(--radix-popover-content-available-height, 70vh)",
            }}
          >
            <div className="space-y-3 text-xs overflow-y-auto p-4 max-h-[inherit]">
              <div>
                <h5 className="text-sm font-semibold mb-1">{t("helpTitle")}</h5>
                <p className="text-muted-foreground">{t("helpIntro")}</p>
              </div>

              <div>
                <p className="font-medium">{t("audience")}</p>
                <ul className="mt-1 space-y-1 text-muted-foreground list-disc list-inside">
                  <li><strong>{t("audienceAll")}:</strong> {t("helpAudienceAll")}</li>
                  <li><strong>{t("audienceNew")}:</strong> {t("helpAudienceNew")}</li>
                  <li><strong>{t("audienceReturning")}:</strong> {t("helpAudienceReturning")}</li>
                  <li><strong>{t("audienceCustom")}:</strong> {t("helpAudienceCustom")}</li>
                </ul>
              </div>

              <div>
                <p className="font-medium">{t("maxAgeDays")}</p>
                <p className="text-muted-foreground">{t("helpMaxAgeDays")}</p>
              </div>

              <div>
                <p className="font-medium">{t("tagsInclude")}</p>
                <p className="text-muted-foreground">{t("helpTagsInclude")}</p>
              </div>

              <div>
                <p className="font-medium">{t("tagsExclude")}</p>
                <p className="text-muted-foreground">{t("helpTagsExclude")}</p>
              </div>

              <div>
                <p className="font-medium">{t("kanban")}</p>
                <p className="text-muted-foreground">{t("helpKanban")}</p>
              </div>

              <div>
                <p className="font-medium">{t("channels")}</p>
                <p className="text-muted-foreground">{t("helpChannels")}</p>
              </div>

              <div>
                <p className="font-medium">{t("priority")}</p>
                <p className="text-muted-foreground">{t("helpPriority")}</p>
              </div>

              <div className="border-t pt-2">
                <p className="font-medium">{t("helpHowItWorksTitle")}</p>
                <p className="text-muted-foreground">{t("helpHowItWorks")}</p>
              </div>

              <div>
                <p className="font-medium">{t("helpOutOfAudienceTitle")}</p>
                <p className="text-muted-foreground">{t("helpOutOfAudience")}</p>
              </div>

              <div>
                <p className="font-medium">{t("helpKeywordTitle")}</p>
                <p className="text-muted-foreground">{t("helpKeyword")}</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Toggle global do opt-in audiência */}
      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
        <div className="space-y-0.5">
          <Label htmlFor="audience-enabled-switch" className="cursor-pointer">
            {t("enabledToggle")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("enabledToggleDesc")}</p>
        </div>
        <Switch
          id="audience-enabled-switch"
          checked={value.audienceEnabled}
          onCheckedChange={(checked) => update({ audienceEnabled: checked })}
        />
      </div>

      {/* Modo audience */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("audience")}</Label>
        <Select
          value={value.targetAudience}
          onValueChange={(v) => update({ targetAudience: v as TargetAudience })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audienceAll")}</SelectItem>
            <SelectItem value="new">{t("audienceNew")}</SelectItem>
            <SelectItem value="returning">{t("audienceReturning")}</SelectItem>
            <SelectItem value="custom">{t("audienceCustom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* maxAgeDays — só para 'new' */}
      {value.targetAudience === "new" && (
        <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <Label>{t("maxAgeDays")}</Label>
          <Input
            type="number"
            min={0}
            value={value.audienceMaxAgeDays ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              update({ audienceMaxAgeDays: v === "" ? null : Number(v) });
            }}
            placeholder={t("maxAgeDaysPlaceholder")}
            disabled={disabled}
          />
        </div>
      )}

      {/* Tags include */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("tagsInclude")}</Label>
        <div className="flex gap-2">
          <Input
            list="audience-tags-include"
            value={tagInputInclude}
            onChange={(e) => setTagInputInclude(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInputInclude, "audienceTags", setTagInputInclude);
              }
            }}
            placeholder={t("tagsIncludePlaceholder")}
          />
          <datalist id="audience-tags-include">
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            onClick={() => addTag(tagInputInclude, "audienceTags", setTagInputInclude)}
          >
            +
          </Button>
        </div>
        {(value.audienceTags || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.audienceTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, "audienceTags")}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tags exclude */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("tagsExclude")}</Label>
        <div className="flex gap-2">
          <Input
            list="audience-tags-exclude"
            value={tagInputExclude}
            onChange={(e) => setTagInputExclude(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInputExclude, "audienceExcludeTags", setTagInputExclude);
              }
            }}
            placeholder={t("tagsExcludePlaceholder")}
          />
          <datalist id="audience-tags-exclude">
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            onClick={() => addTag(tagInputExclude, "audienceExcludeTags", setTagInputExclude)}
          >
            +
          </Button>
        </div>
        {(value.audienceExcludeTags || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.audienceExcludeTags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, "audienceExcludeTags")}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Kanban */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("kanban")}</Label>
        <Select
          value={value.audienceKanbanId == null ? "any" : String(value.audienceKanbanId)}
          onValueChange={(v) =>
            update({ audienceKanbanId: v === "any" ? null : Number(v) })
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("kanbanAny")}</SelectItem>
            {kanbans.map((k) => (
              <SelectItem key={k.id} value={String(k.id)}>
                {k.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Canais */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("channels")}</Label>
        <p className="text-xs text-muted-foreground">{t("channelsAny")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CHANNEL_OPTIONS.map((ch) => (
            <label
              key={ch}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={(value.audienceChannels || []).includes(ch)}
                onCheckedChange={() => toggleChannel(ch)}
                disabled={disabled}
              />
              <span className="capitalize">{ch}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Label>{t("priority")}</Label>
        <Input
          type="number"
          value={value.priority ?? 0}
          onChange={(e) => update({ priority: Number(e.target.value) || 0 })}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">{t("priorityHint")}</p>
      </div>

      {/* ─── Horário de funcionamento (gate independente do opt-in de audiência) ─── */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
          <div className="space-y-0.5">
            <Label
              htmlFor="audience-schedule-switch"
              className="cursor-pointer flex items-center gap-1.5"
            >
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              {t("scheduleToggle")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("scheduleToggleDesc")}</p>
          </div>
          <Switch
            id="audience-schedule-switch"
            checked={value.audienceScheduleEnabled}
            onCheckedChange={(checked) => update({ audienceScheduleEnabled: checked })}
          />
        </div>

        {value.audienceScheduleEnabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("scheduleFullDayHint")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addWindow}
              >
                + {t("scheduleAddWindow")}
              </Button>
            </div>

            {(value.audienceScheduleWindows || []).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t("scheduleNoWindows")}
              </p>
            )}

            {(value.audienceScheduleWindows || []).map((w, idx) => (
              <div key={idx} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {t("scheduleWindowLabel")} #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeWindow(idx)}
                    className="text-destructive hover:opacity-70"
                    aria-label={t("scheduleWindowLabel")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_KEYS.map(({ d, key }) => {
                    const selected = (w.weekdays || []).includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWindowWeekday(idx, d)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-input hover:bg-muted"
                        }`}
                      >
                        {tw(key)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scheduleFrom")}</Label>
                    <Input
                      type="time"
                      value={w.startTime || "00:00"}
                      onChange={(e) => updateWindow(idx, { startTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scheduleTo")}</Label>
                    <Input
                      type="time"
                      value={w.endTime || "00:00"}
                      onChange={(e) => updateWindow(idx, { endTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function defaultAudienceValue(): AudienceValue {
  return {
    audienceEnabled: false,
    targetAudience: "all",
    audienceMaxAgeDays: null,
    audienceTags: [],
    audienceExcludeTags: [],
    audienceKanbanId: null,
    audienceChannels: [],
    audienceScheduleEnabled: false,
    audienceScheduleWindows: [],
    priority: 0,
  };
}

export function extractAudienceFromFlow(flow: Record<string, unknown>): AudienceValue {
  const f = flow as Record<string, unknown>;
  return {
    audienceEnabled: f.audienceEnabled === true,
    targetAudience: ((f.targetAudience as string) || "all") as TargetAudience,
    audienceMaxAgeDays:
      f.audienceMaxAgeDays == null ? null : Number(f.audienceMaxAgeDays),
    audienceTags: Array.isArray(f.audienceTags) ? (f.audienceTags as string[]) : [],
    audienceExcludeTags: Array.isArray(f.audienceExcludeTags)
      ? (f.audienceExcludeTags as string[])
      : [],
    audienceKanbanId:
      f.audienceKanbanId == null ? null : Number(f.audienceKanbanId),
    audienceChannels: Array.isArray(f.audienceChannels)
      ? (f.audienceChannels as string[])
      : [],
    audienceScheduleEnabled: f.audienceScheduleEnabled === true,
    audienceScheduleWindows: Array.isArray(f.audienceScheduleWindows)
      ? (f.audienceScheduleWindows as ScheduleWindow[])
      : [],
    priority: f.priority == null ? 0 : Number(f.priority),
  };
}
