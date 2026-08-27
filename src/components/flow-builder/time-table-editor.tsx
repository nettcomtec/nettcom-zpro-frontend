"use client";

import React from "react";
import { Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import type { FlowCondition, FlowNodeData } from "./lib/types";

export interface RouteOptions {
  queues: { id: number | string; name: string }[];
  users: { id: number | string; name: string }[];
  channels: { id: number | string; name: string }[];
}

interface Props {
  editNode: FlowNodeData;
  setEditNode: (n: FlowNodeData) => void;
  routeOptions: RouteOptions;
  // Nós candidatos a destino dos branches (popular o Select de "próxima etapa").
  // Passado como PROP — nunca injetar dentro do editNode: qualquer spread do nó
  // levaria a lista inteira (com base64 de mídias) para o state e para o JSON
  // salvo, inflando o fluxo até o timeout do save.
  otherNodes: FlowNodeData[];
}

const DEFAULT_WEEKDAYS: number[] = [1, 2, 3, 4, 5];

const newTimeBranch = (): FlowCondition => ({
  id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: "T",
  weekdays: [...DEFAULT_WEEKDAYS],
  startTime: "08:00",
  endTime: "18:00",
  action: 0,
  nextStepId: "",
  value: "",
  condition: [],
});

const newDefaultBranch = (): FlowCondition => ({
  id: `cond-default-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: "US",
  action: 0,
  nextStepId: "",
  value: "",
  condition: [],
});

const reorderForRender = (conds: FlowCondition[]): { time: FlowCondition[]; defaultBranch: FlowCondition | null } => {
  const time = conds.filter((c) => c.type === "T");
  const defaults = conds.filter((c) => c.type === "US");
  return { time, defaultBranch: defaults[0] || null };
};

const TimeTableEditor: React.FC<Props> = ({ editNode, setEditNode, routeOptions, otherNodes }) => {
  const t = useTranslations("flowBuilderTimeTable");

  const conditions = Array.isArray(editNode.conditions) ? editNode.conditions : [];
  const { time, defaultBranch } = reorderForRender(conditions);

  const setConditions = (next: FlowCondition[]) => {
    setEditNode({ ...editNode, conditions: next, interactions: [] });
  };

  const updateBranch = (id: string, updates: Partial<FlowCondition>) => {
    setConditions(conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const addTimeBranch = () => {
    const us = conditions.find((c) => c.type === "US");
    const tBranches = conditions.filter((c) => c.type === "T");
    const next = [...tBranches, newTimeBranch(), ...(us ? [us] : [newDefaultBranch()])];
    setConditions(next);
  };

  const removeBranch = (id: string) => {
    const filtered = conditions.filter((c) => c.id !== id);
    const stillHasUS = filtered.some((c) => c.type === "US");
    setConditions(stillHasUS ? filtered : [...filtered, newDefaultBranch()]);
  };

  const toggleWeekday = (id: string, weekday: number) => {
    const cond = conditions.find((c) => c.id === id);
    if (!cond) return;
    const current = Array.isArray(cond.weekdays) ? cond.weekdays : [];
    const next = current.includes(weekday)
      ? current.filter((d) => d !== weekday)
      : [...current, weekday].sort((a, b) => a - b);
    updateBranch(id, { weekdays: next });
  };

  const ensureDefault = () => {
    if (!defaultBranch) {
      setConditions([...conditions, newDefaultBranch()]);
    }
  };

  React.useEffect(() => {
    ensureDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekdayKeys: { d: number; key: string }[] = [
    { d: 0, key: "weekdaySun" },
    { d: 1, key: "weekdayMon" },
    { d: 2, key: "weekdayTue" },
    { d: 3, key: "weekdayWed" },
    { d: 4, key: "weekdayThu" },
    { d: 5, key: "weekdayFri" },
    { d: 6, key: "weekdaySat" },
  ];

  const renderActionFields = (cond: FlowCondition) => {
    const action = cond.action ?? 0;
    return (
      <>
        <div className="space-y-1">
          <Label className="text-xs">{t("routeTo")}</Label>
          <Select
            value={String(action)}
            onValueChange={(v) =>
              updateBranch(cond.id, {
                action: parseInt(v, 10),
                nextStepId: "",
                queueId: "",
                userIdDestination: "",
                closeTicket: "",
                channelDestination: "",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="0">{t("actionStep")}</SelectItem>
              <SelectItem value="1">{t("actionQueue")}</SelectItem>
              <SelectItem value="2">{t("actionUser")}</SelectItem>
              <SelectItem value="3">{t("actionClose")}</SelectItem>
              <SelectItem value="4">{t("actionChannel")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {action === 0 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("nextStep")}</Label>
            <Select
              value={cond.nextStepId}
              onValueChange={(v) => updateBranch(cond.id, { nextStepId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {otherNodes
                  .filter((n: FlowNodeData) => n.id !== editNode.id && n.type !== "configurations" && n.type !== "start")
                  .map((n: FlowNodeData) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {action === 1 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectQueue")}</Label>
            <Select
              value={cond.queueId || ""}
              onValueChange={(v) => updateBranch(cond.id, { queueId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectQueue")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.queues.map((q) => (
                  <SelectItem key={q.id} value={String(q.id)}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {action === 2 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectUser")}</Label>
            <Select
              value={cond.userIdDestination || ""}
              onValueChange={(v) => updateBranch(cond.id, { userIdDestination: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectUser")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {action === 3 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("closingMessage")}</Label>
            <textarea
              className="w-full rounded-md border bg-background p-2 text-sm resize-y"
              rows={2}
              placeholder={t("closingMessage")}
              value={cond.closeTicket || ""}
              onChange={(e) => updateBranch(cond.id, { closeTicket: e.target.value })}
            />
          </div>
        )}
        {action === 4 && (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectChannel")}</Label>
            <Select
              value={cond.channelDestination || ""}
              onValueChange={(v) => updateBranch(cond.id, { channelDestination: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectChannel")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.channels.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">{t("title")}</p>
            <p className="text-amber-800">{t("description")}</p>
            <p className="mt-1 text-[11px] text-amber-700">{t("helpFullDay")}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("branches")}</span>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addTimeBranch}>
          <Plus className="mr-1 h-3 w-3" /> {t("addBranch")}
        </Button>
      </div>

      {time.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("noBranches")}</p>
      )}

      {time.map((cond, idx) => (
        <Card key={cond.id}>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 h-3 w-3" />
                {t("branchPrefix")} #{idx + 1}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => removeBranch(cond.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t("weekdays")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {weekdayKeys.map(({ d, key }) => {
                  const selected = (cond.weekdays || []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekday(cond.id, d)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:bg-muted"
                      }`}
                    >
                      {t(key)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("timeFrom")}</Label>
                <Input
                  type="time"
                  value={cond.startTime || "00:00"}
                  onChange={(e) => updateBranch(cond.id, { startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("timeTo")}</Label>
                <Input
                  type="time"
                  value={cond.endTime || "00:00"}
                  onChange={(e) => updateBranch(cond.id, { endTime: e.target.value })}
                />
              </div>
            </div>

            {renderActionFields(cond)}
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">{t("branchDefault")}</Badge>
            <span className="text-[11px] text-muted-foreground">{t("branchDefaultHint")}</span>
          </div>
          {defaultBranch ? (
            renderActionFields(defaultBranch)
          ) : (
            <Button variant="outline" size="sm" onClick={ensureDefault}>
              <Plus className="mr-1 h-3 w-3" /> {t("addDefault")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeTableEditor;
