"use client";

import React from "react";
import { Plus, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { RouteOptions } from "./node-form";

export type AiActionType = "queue" | "user" | "close" | "kanban";

// Shape salvo em interaction.data.aiActions — contrato com o backend
// (ações que a IA pode executar via function calling).
export interface AiAction {
  id: string;
  type: AiActionType;
  queueId?: number;
  userIdDestination?: number;
  kanbanId?: number;
  /** Nome legível do destino, denormalizado no momento da seleção. */
  label?: string;
  /** "Quando usar" — instrução para a IA decidir disparar a ação. */
  description?: string;
  /** Mensagem enviada ao executar a ação — obrigatória (backend descarta sem ela). */
  actionMessage: string;
}

const MAX_ACTIONS = 10;

interface Props {
  value: AiAction[] | undefined;
  onChange: (next: AiAction[]) => void;
  routeOptions: RouteOptions;
}

const AiActionsEditor: React.FC<Props> = ({ value, onChange, routeOptions }) => {
  const t = useTranslations("flowBuilderNodeForm");

  const actions = Array.isArray(value) ? value : [];
  const hasKanbans = (routeOptions.kanbans?.length ?? 0) > 0;

  const addAction = () => {
    if (actions.length >= MAX_ACTIONS) return;
    onChange([
      ...actions,
      {
        id: `ai-${Date.now()}-${actions.length}`,
        type: "queue",
        actionMessage: "",
      },
    ]);
  };

  const removeAction = (id: string) => {
    onChange(actions.filter((a) => a.id !== id));
  };

  const updateAction = (id: string, updates: Partial<AiAction>) => {
    onChange(actions.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const changeType = (id: string, type: AiActionType) => {
    // Trocar o tipo zera destino e label — evita destino órfão do tipo anterior.
    updateAction(id, {
      type,
      queueId: undefined,
      userIdDestination: undefined,
      kanbanId: undefined,
      label: undefined,
    });
  };

  const setDestination = (
    id: string,
    field: "queueId" | "userIdDestination" | "kanbanId",
    list: { id: number; name: string }[],
    rawValue: string
  ) => {
    const idNum = parseInt(rawValue, 10);
    const opt = list.find((o) => Number(o.id) === idNum);
    updateAction(id, { [field]: idNum, label: opt?.name } as Partial<AiAction>);
  };

  const renderDestination = (action: AiAction) => {
    switch (action.type) {
      case "queue":
        return (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectQueue")}</Label>
            <Select
              value={action.queueId != null ? String(action.queueId) : ""}
              onValueChange={(v) => setDestination(action.id, "queueId", routeOptions.queues, v)}
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
        );
      case "user":
        return (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectUser")}</Label>
            <Select
              value={action.userIdDestination != null ? String(action.userIdDestination) : ""}
              onValueChange={(v) =>
                setDestination(action.id, "userIdDestination", routeOptions.users, v)
              }
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
        );
      case "kanban":
        return (
          <div className="space-y-1">
            <Label className="text-xs">{t("selectKanban")}</Label>
            <Select
              value={action.kanbanId != null ? String(action.kanbanId) : ""}
              onValueChange={(v) => setDestination(action.id, "kanbanId", routeOptions.kanbans, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectKanban")} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {routeOptions.kanbans.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      // "close" não tem destino — a mensagem obrigatória é a despedida.
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={addAction}
          disabled={actions.length >= MAX_ACTIONS}
        >
          <Plus className="mr-1 h-3 w-3" /> {t("aiActionsAdd")}
        </Button>
      </div>

      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3">{t("aiActionsEmpty")}</p>
      )}

      {actions.map((action, idx) => {
        const messageEmpty = !action.actionMessage || !action.actionMessage.trim();
        return (
          <Card key={action.id}>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  <Bot className="mr-1 h-3 w-3" />
                  #{idx + 1}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAction(action.id)}
                  title={t("aiActionsRemove")}
                  aria-label={t("aiActionsRemove")}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("aiActionsTypeLabel")}</Label>
                <Select
                  value={action.type}
                  onValueChange={(v) => changeType(action.id, v as AiActionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="queue">{t("aiActionsTypeQueue")}</SelectItem>
                    <SelectItem value="user">{t("aiActionsTypeUser")}</SelectItem>
                    <SelectItem value="close">{t("aiActionsTypeClose")}</SelectItem>
                    {(hasKanbans || action.type === "kanban") && (
                      <SelectItem value="kanban">{t("aiActionsTypeKanban")}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {renderDestination(action)}

              <div className="space-y-1">
                <Label className="text-xs">{t("aiActionsWhenLabel")}</Label>
                <textarea
                  className="w-full rounded-md border bg-background p-2 text-sm resize-y"
                  rows={2}
                  maxLength={200}
                  placeholder={t("aiActionsWhenPlaceholder")}
                  value={action.description || ""}
                  onChange={(e) => updateAction(action.id, { description: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t("aiActionsMessageLabel")}</Label>
                <textarea
                  className={`w-full rounded-md border bg-background p-2 text-sm resize-y ${
                    messageEmpty ? "border-destructive" : ""
                  }`}
                  rows={2}
                  placeholder={t("aiActionsMessageHint")}
                  value={action.actionMessage || ""}
                  onChange={(e) => updateAction(action.id, { actionMessage: e.target.value })}
                />
                {messageEmpty ? (
                  <p className="text-[11px] text-destructive">{t("aiActionsMessageRequired")}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("aiActionsMessageHint")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AiActionsEditor;
