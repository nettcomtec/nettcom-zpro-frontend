"use client";

// Atalhos das mensagens rápidas do tipo Template no topo da lista de templates dos
// diálogos que iniciam conversa em canal oficial (no oficial não há campo livre).
// Mesmo comportamento e visual do chat (message-input.tsx, renderTemplateShortcuts):
// clicar pré-seleciona o modelo; as variáveis do template são preenchidas ali.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FastReply } from "@/services/fast-reply";
import { matchQuickReplyTemplate } from "@/lib/quick-reply-template";
import { templateQuickReplyRefs } from "@/lib/quick-reply-picker";

export interface QuickReplyTemplateShortcutsProps<T extends { name: string; language: string }> {
  /** Rápidas visíveis ao usuário (useQuickReplies). */
  quickReplies: FastReply[];
  /** Templates da conexão escolhida. */
  templates: T[];
  /** Lista de templates carregando: sem atalho (evita escolher modelo de outra conexão). */
  loading?: boolean;
  onSelectTemplate: (template: T) => void;
  /** Mais de um idioma (ou o cadastrado não existe): filtra a lista pelo nome. */
  onFilterByName: (name: string) => void;
}

export function QuickReplyTemplateShortcuts<T extends { name: string; language: string }>({
  quickReplies,
  templates,
  loading = false,
  onSelectTemplate,
  onFilterByName,
}: QuickReplyTemplateShortcutsProps<T>) {
  const t = useTranslations("messageInput");

  // Só os atalhos cujo template existe nesta conexão (cada número tem os seus).
  const shortcuts = useMemo(() => {
    if (templates.length === 0) return [];
    return templateQuickReplyRefs(quickReplies).filter(
      (q) => matchQuickReplyTemplate(templates, q.ref).kind !== "notFound",
    );
  }, [quickReplies, templates]);

  if (loading || shortcuts.length === 0) return null;

  const pick = (ref: (typeof shortcuts)[number]["ref"]) => {
    const match = matchQuickReplyTemplate(templates, ref);
    if (match.kind === "found") {
      onSelectTemplate(match.template);
      return;
    }
    if (match.kind === "notFound") return;
    onFilterByName(match.name);
    toast.info(
      match.kind === "languageMissing"
        ? t("quickReplyTemplateLanguageMissing", { name: match.name, language: ref.language })
        : t("quickReplyTemplatePickLanguage", { name: match.name }),
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Zap className="h-3 w-3 shrink-0" />
        <span className="font-medium">{t("quickReplyTemplatesLabel")}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("quickReplyTemplatesHelpLabel")}
              title={t("quickReplyTemplatesHelpLabel")}
              className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
            {t("quickReplyTemplatesHelp")}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
        {shortcuts.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => pick(q.ref)}
            title={q.ref.language ? `${q.ref.name} · ${q.ref.language}` : q.ref.name}
            className="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent"
          >
            <span className="truncate">/{q.key}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
