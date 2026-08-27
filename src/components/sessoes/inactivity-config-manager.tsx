"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FarewellMediaManager } from "@/components/sessoes/farewell-media-manager";

export type InactivityAction = {
  type: "message" | "media" | "evaluation";
  text?: string;
  urls?: string[];
  caption?: string;
};

export type InactivityConfigValue = {
  mode: "inherit" | "off" | "custom";
  timeMinutes?: number;
  actions?: InactivityAction[];
  final?: "close" | "chatbot";
  chatFlowId?: number | null;
};

// Canais que suportam a ação de avaliação (hub também suporta via includes("hub"))
export const INACTIVITY_EVAL_TYPES = [
  "baileys",
  "zapo",
  "whatsapp",
  "evo",
  "evogo",
  "zapi",
  "uazapi",
  "meow",
  "webchat",
  "waba",
  "dialog360",
  "gupshup",
  "instagram",
  "messenger",
];

type Props = {
  value: InactivityConfigValue | null | undefined;
  onChange: (v: InactivityConfigValue) => void;
  channelType: string;
  chatFlows: { id: number; name: string }[];
};

const DEFAULT_CHATFLOW = "__default__";

export function InactivityConfigManager({ value, onChange, channelType, chatFlows }: Props) {
  const t = useTranslations("sessoesPage");

  const cfg: InactivityConfigValue =
    value && typeof value === "object" ? value : { mode: "inherit" };
  const actions = Array.isArray(cfg.actions) ? cfg.actions : [];
  const supportsEvaluation =
    INACTIVITY_EVAL_TYPES.includes(channelType) || channelType.includes("hub");

  const patch = (partial: Partial<InactivityConfigValue>) => {
    onChange({ ...cfg, ...partial });
  };

  const updateAction = (idx: number, partial: Partial<InactivityAction>) => {
    const next = actions.map((a, i) => (i === idx ? { ...a, ...partial } : a));
    patch({ actions: next });
  };

  const moveAction = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= actions.length) return;
    const next = [...actions];
    [next[idx], next[target]] = [next[target], next[idx]];
    patch({ actions: next });
  };

  const removeAction = (idx: number) => {
    patch({ actions: actions.filter((_, i) => i !== idx) });
  };

  const addAction = () => {
    patch({ actions: [...actions, { type: "message", text: "" }] });
  };

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">{t("inactivitySectionHint")}</p>

      <div className="space-y-2">
        <Label>{t("inactivityModeLabel")}</Label>
        <Select
          value={cfg.mode}
          onValueChange={(mode) =>
            patch({ mode: mode as InactivityConfigValue["mode"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">{t("inactivityModeInherit")}</SelectItem>
            <SelectItem value="off">{t("inactivityModeOff")}</SelectItem>
            <SelectItem value="custom">{t("inactivityModeCustom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cfg.mode === "custom" && (
        <div className="space-y-3 rounded-md border p-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {t("inactivityModeCustomNote")}
          </div>

          <div className="space-y-2">
            <Label>{t("inactivityTimeLabel")}</Label>
            <Input
              type="number"
              min={1}
              value={cfg.timeMinutes ?? ""}
              onChange={(e) =>
                patch({ timeMinutes: Number(e.target.value) || undefined })
              }
            />
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-sm font-medium">{t("inactivityActionsTitle")}</div>
              <p className="text-xs text-muted-foreground">{t("inactivityActionsHint")}</p>
            </div>

            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("inactivityActionEmpty")}</p>
            ) : (
              <div className="min-w-0 space-y-2">
                {actions.map((action, idx) => (
                  <div
                    key={idx}
                    className="min-w-0 space-y-2 rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Select
                          value={action.type}
                          onValueChange={(type) =>
                            updateAction(idx, { type: type as InactivityAction["type"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="message">
                              {t("inactivityActionTypeMessage")}
                            </SelectItem>
                            <SelectItem value="media">
                              {t("inactivityActionTypeMedia")}
                            </SelectItem>
                            <SelectItem value="evaluation">
                              {t("inactivityActionTypeEvaluation")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={idx === 0}
                        onClick={() => moveAction(idx, -1)}
                        title={t("inactivityActionMoveUp")}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        disabled={idx === actions.length - 1}
                        onClick={() => moveAction(idx, 1)}
                        title={t("inactivityActionMoveDown")}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => removeAction(idx)}
                        title={t("inactivityActionRemove")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {action.type === "message" && (
                      <div className="space-y-1.5">
                        <Label>{t("inactivityActionTextLabel")}</Label>
                        <Textarea
                          value={action.text ?? ""}
                          placeholder={t("inactivityActionTextPlaceholder")}
                          onChange={(e) => updateAction(idx, { text: e.target.value })}
                        />
                      </div>
                    )}

                    {action.type === "media" && (
                      <div className="space-y-2">
                        <FarewellMediaManager
                          urls={action.urls}
                          onChange={(next) => updateAction(idx, { urls: next })}
                        />
                        <div className="space-y-1.5">
                          <Label>{t("inactivityActionCaptionLabel")}</Label>
                          <Input
                            value={action.caption ?? ""}
                            onChange={(e) => updateAction(idx, { caption: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {action.type === "evaluation" && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t("inactivityActionEvaluationNote")}
                        </p>
                        {!supportsEvaluation && (
                          <p className="text-xs text-destructive">
                            {t("inactivityActionEvaluationUnsupported")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addAction}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("inactivityActionAdd")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t("inactivityFinalLabel")}</Label>
            <Select
              value={cfg.final ?? ""}
              onValueChange={(final) =>
                patch({ final: final as InactivityConfigValue["final"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="close">{t("inactivityFinalClose")}</SelectItem>
                <SelectItem value="chatbot">{t("inactivityFinalChatbot")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cfg.final === "chatbot" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("inactivityFinalChatbotNote")}</p>
              <Label>{t("inactivityChatFlowLabel")}</Label>
              <Select
                value={cfg.chatFlowId != null ? String(cfg.chatFlowId) : DEFAULT_CHATFLOW}
                onValueChange={(v) =>
                  patch({ chatFlowId: v === DEFAULT_CHATFLOW ? null : Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_CHATFLOW}>
                    {t("inactivityChatFlowPlaceholder")}
                  </SelectItem>
                  {chatFlows.map((cf) => (
                    <SelectItem key={cf.id} value={String(cf.id)}>
                      {cf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
