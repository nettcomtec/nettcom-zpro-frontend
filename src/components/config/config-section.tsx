"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { PageHeader } from "@/components/layout/page-header";
import { type PageHelpProps } from "@/components/layout/page-help";

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean" | "textarea" | "url" | "select" | "datalist";
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  /** Para `datalist`: lista estatica de strings sugeridas (custom permitido). */
  datalistOptions?: ReadonlyArray<string>;
  /**
   * Para `datalist` dinamico: chave de outro field cujo valor escolhe a lista de opcoes.
   * Usado em conjunto com `datalistOptionsMap`. Exemplo: `optionsFromField: "copilotProvider"`
   * + `datalistOptionsMap: { openai: [...], groq: [...] }` -> lista varia conforme provider.
   */
  optionsFromField?: string;
  datalistOptionsMap?: Record<string, ReadonlyArray<string>>;
  /** Tooltip renderizado ao lado do Label (ex: icone de ajuda com Popover). */
  tooltipContent?: React.ReactNode;
  /** Texto do chip exibido ao lado do Label quando o campo tem valor non-empty. */
  badgeWhenSet?: string;
  /** Renderiza o field apenas quando outro field tiver o valor especificado. */
  visibleWhen?: { field: string; value: string };
}

export interface ConfigSectionDef {
  title: string;
  description?: string;
  icon?: React.ElementType;
  fields: ConfigField[];
}

export function ConfigPage({
  title, description, sections, icon: Icon, help, headerActions, banner,
}: {
  title: string;
  description: string;
  sections: ConfigSectionDef[];
  icon?: React.ElementType;
  help?: PageHelpProps;
  headerActions?: (api: { settings: Record<string, string>; saving: boolean }) => React.ReactNode;
  /** Aviso opcional renderizado entre o cabeçalho e os cards (ex: banner de migração/deadline). */
  banner?: React.ReactNode;
}) {
  const t = useTranslations("configSection");
  const tCommon = useTranslations("common");
  const allKeys = sections.flatMap((s) => s.fields.map((f) => f.key));
  const { settings, loading, saving, set, save } = useSettings(allKeys);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} help={help}>
        {headerActions?.({ settings, saving })}
        <Button size="sm" disabled={saving} onClick={() => save()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {tCommon("save")}
        </Button>
      </PageHeader>
      {banner}
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {section.icon && <section.icon className="h-5 w-5" />}
              {!section.icon && Icon && <Icon className="h-5 w-5" />}
              {section.title}
            </CardTitle>
            {section.description && <CardDescription>{section.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map((field) => {
              const val = settings[field.key] || "";

              if (field.visibleWhen && String(settings[field.visibleWhen.field] || "") !== field.visibleWhen.value) {
                return null;
              }

              const labelNode = (
                <div className="flex items-center gap-2">
                  <Label>{field.label}</Label>
                  {field.tooltipContent}
                  {field.badgeWhenSet && val.trim() && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {field.badgeWhenSet}
                    </Badge>
                  )}
                </div>
              );

              if (field.type === "boolean") {
                return (
                  <div key={field.key} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      {labelNode}
                      {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
                    </div>
                    <Switch
                      checked={val === "enabled" || val === "true" || val === "1"}
                      onCheckedChange={(v) => set(field.key, v ? "enabled" : "disabled")}
                    />
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key} className="space-y-2">
                    {labelNode}
                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                    <Select value={val} onValueChange={(v) => set(field.key, v)}>
                      <SelectTrigger><SelectValue placeholder={field.placeholder || t("selectPlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {field.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (field.type === "textarea") {
                return (
                  <div key={field.key} className="space-y-2">
                    {labelNode}
                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                    <Textarea
                      value={val}
                      onChange={(e) => set(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="min-h-[80px]"
                    />
                  </div>
                );
              }

              if (field.type === "datalist") {
                // Resolve a lista de opcoes: estatica via `datalistOptions`, ou dinamica
                // via `optionsFromField` + `datalistOptionsMap` (ex: model depende de provider).
                // Se o field dependente esta vazio (provider nao selecionado ainda) ou nao
                // bate com nenhuma chave do mapa, cai pro primeiro provider do mapa para
                // que o dropdown nunca apareca vazio.
                let opts: ReadonlyArray<string> = field.datalistOptions || [];
                if (field.optionsFromField && field.datalistOptionsMap) {
                  const dep = String(settings[field.optionsFromField] || "");
                  const mapKeys = Object.keys(field.datalistOptionsMap);
                  const fallbackKey = mapKeys[0];
                  opts = field.datalistOptionsMap[dep] || (fallbackKey ? field.datalistOptionsMap[fallbackKey] : []);
                }
                const listId = `cfg-datalist-${field.key}`;
                return (
                  <div key={field.key} className="space-y-2">
                    {labelNode}
                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                    <Input
                      list={listId}
                      value={val}
                      onChange={(e) => set(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                    <datalist id={listId}>
                      {opts.map((o) => <option key={o} value={o} />)}
                    </datalist>
                  </div>
                );
              }

              return (
                <div key={field.key} className="space-y-2">
                  {labelNode}
                  {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                  <Input
                    type={field.type === "password" ? "password" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                    value={val}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
