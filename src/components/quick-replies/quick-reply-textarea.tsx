"use client";

// Campo de mensagem dos diálogos que iniciam conversa com o atalho "/" das mensagens
// rápidas (Nova Conversa, conversa avulsa do /atendimento, Funil). Só o texto entra: a
// escolha troca só o "/atalho" e preserva o resto do campo (o link do convite do Telegram
// não some). Lista no fluxo, logo abaixo do campo: dentro do diálogo um popover absoluto
// seria cortado pelo corpo rolável. docs/PLANO_NOVA_CONVERSA_MENSAGENS_RAPIDAS.md (D2, D4).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from "react";
import { useTranslations } from "next-intl";
import { Info, Loader2, MessageSquareQuote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parseFastReplyMedias, type FastReply } from "@/services/fast-reply";
import {
  applyQuickReplyAtToken,
  findSlashToken,
  insertQuickReplyAt,
  isTextQuickReply,
  quickReplyVarWarnings,
  rankQuickReplies,
  type SlashToken,
} from "@/lib/quick-reply-picker";

export interface QuickReplyVarWarningsContext {
  /** Contato escolhido do sistema (com nome de verdade): os dados do cadastro existem. */
  contactKnown: boolean;
  /** O atendimento terá dono no envio ({{user}} preenchido). */
  ownerKnown: boolean;
  /** {{protocol}}/{{ticketId}} saem vazios (atendimento criado depois do envio, ou e-mail). */
  ticketVarsEmpty: boolean;
  channel: "phone" | "email";
}

export interface QuickReplyTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Rápidas visíveis ao usuário (useQuickReplies); aqui entram só as de texto. */
  quickReplies: FastReply[];
  /** Carga das rápidas em andamento (o vazio do botão espera a lista). */
  quickRepliesLoading?: boolean;
  placeholder?: string;
  /** Classe do <textarea>. */
  className?: string;
  id?: string;
  disabled?: boolean;
  textareaRows?: number;
  maxLength?: number;
  /** Sem contexto = sem avisos de variável. */
  warnings?: QuickReplyVarWarningsContext | null;
  /** Repassado quando a tecla não foi usada pela lista. */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

type ListMode = "token" | "button";

export function QuickReplyTextarea({
  value,
  onChange,
  quickReplies,
  quickRepliesLoading = false,
  placeholder,
  className,
  id,
  disabled = false,
  textareaRows,
  maxLength,
  warnings = null,
  onKeyDown,
}: QuickReplyTextareaProps) {
  const t = useTranslations("quickReplyPicker");
  const tMsg = useTranslations("messageInput");
  const listId = useId();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  // Última posição conhecida do cursor: o botão insere ali sem focar o campo.
  const lastCaretRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ListMode>("token");
  const [token, setToken] = useState<SlashToken | null>(null);
  const [highlight, setHighlight] = useState(0);
  // Enter só escolhe depois de ↑/↓ ou com algo digitado depois do "/" (senão é quebra de linha).
  const [navigated, setNavigated] = useState(false);
  // Esc num "/atalho" não reabre a lista até a busca mudar.
  const [dismissed, setDismissed] = useState<{ start: number; query: string } | null>(null);
  const [filesNotice, setFilesNotice] = useState(false);

  const textReplies = useMemo(() => quickReplies.filter(isTextQuickReply), [quickReplies]);
  const ranked = useMemo(
    () => rankQuickReplies(textReplies, mode === "token" ? token?.query ?? "" : "", 50),
    [textReplies, mode, token?.query],
  );
  const items = ranked.items;

  const close = useCallback(() => {
    setOpen(false);
    setNavigated(false);
  }, []);

  // Abre só ao digitar: o "/" acabou de entrar no campo, nunca por mover o cursor.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const caret = e.target.selectionStart ?? next.length;
    lastCaretRef.current = caret;
    onChange(next);
    if (filesNotice && !next.trim()) setFilesNotice(false);

    const tok = findSlashToken(next, caret);
    if (!tok) {
      setDismissed(null);
      close();
      return;
    }
    if (dismissed && dismissed.start === tok.start && dismissed.query === tok.query) {
      close();
      return;
    }
    if (dismissed) setDismissed(null);
    if (rankQuickReplies(textReplies, tok.query, 1).items.length === 0) {
      close();
      return;
    }
    const queryChanged = !open || mode !== "token" || token?.query !== tok.query;
    setMode("token");
    setToken(tok);
    setOpen(true);
    if (queryChanged) {
      setHighlight(0);
      setNavigated(false);
    }
  };

  // Mover o cursor só FECHA a lista quando ele sai do "/atalho".
  const handleCaretMove = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    lastCaretRef.current = el.selectionStart ?? el.value.length;
    if (!open || mode !== "token") return;
    const tok = findSlashToken(el.value, lastCaretRef.current);
    if (!tok || !token || tok.start !== token.start) {
      close();
      return;
    }
    if (tok.end !== token.end || tok.query !== token.query) setToken(tok);
  };

  const choose = (reply: FastReply) => {
    const el = textareaRef.current;
    const replyText = reply.message || "";
    const fromToken = mode === "token" && token != null;
    const res = fromToken
      ? applyQuickReplyAtToken(value, token as SlashToken, replyText)
      : insertQuickReplyAt(value, lastCaretRef.current, replyText);
    onChange(res.text);
    lastCaretRef.current = res.caret;
    setDismissed(null);
    close();
    setFilesNotice(parseFastReplyMedias(reply).length > 0);
    // Pelo botão o campo não é focado (no celular não sobe o teclado).
    if (fromToken && el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(res.caret, res.caret);
      });
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (open && !composing && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % items.length);
        setNavigated(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + items.length) % items.length);
        setNavigated(true);
        return;
      }
      // Lista aberta pelo botão: Tab/Enter só escolhem depois de ↑/↓ (senão Tab sai do campo).
      if (e.key === "Tab" && !e.shiftKey && (mode === "token" || navigated)) {
        e.preventDefault();
        choose(items[highlight] ?? items[0]);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const typed = mode === "token" && (token?.query.length ?? 0) >= 1;
        if (navigated || typed) {
          e.preventDefault();
          choose(items[highlight] ?? items[0]);
          return;
        }
      }
    }
    onKeyDown?.(e);
  };

  // Esc com a lista aberta fecha só a lista. Captura no `window`: roda antes do Radix,
  // que escuta o `document` em captura e fecharia o diálogo. Só com o foco no campo
  // (ou no botão/lista), para não engolir o Esc de outros controles da tela.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const ae = document.activeElement;
      const mine = ae != null && (ae === textareaRef.current || containerRef.current?.contains(ae));
      // Safari não foca botão no clique: aberta pelo botão, o foco fica no body.
      const fromButtonWithoutFocus = mode === "button" && (ae == null || ae === document.body);
      if (!mine && !fromButtonWithoutFocus) return;
      e.preventDefault();
      e.stopPropagation();
      if (mode === "token" && token) setDismissed({ start: token.start, query: token.query });
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, mode, token, close]);

  // Toque/clique fora do campo e da lista fecha.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && containerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, close]);

  // Item ativo à vista ao abrir e ao navegar (no celular a lista pode ficar sob o teclado).
  useEffect(() => {
    if (open) activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  // Campo esvaziado por fora (envio, troca de canal): some o aviso de arquivos.
  useEffect(() => {
    if (!value.trim() && filesNotice) setFilesNotice(false);
  }, [value, filesNotice]);

  const toggleFromButton = () => {
    if (open) {
      close();
      return;
    }
    setMode("button");
    setToken(null);
    setHighlight(0);
    setNavigated(false);
    setOpen(true);
  };

  const varWarnings = useMemo(
    () => (warnings ? quickReplyVarWarnings(value, warnings) : []),
    [value, warnings],
  );

  const warningText = (kind: string, vars: string) => {
    if (kind === "contactData") {
      return warnings?.channel === "email" ? t("varContactDataEmail", { vars }) : t("varContactDataPhone", { vars });
    }
    if (kind === "userEmpty") return t("varUserEmpty", { vars });
    return t("varTicketEmpty", { vars });
  };

  const activeOptionId = open && items.length > 0 ? `${listId}-opt-${highlight}` : undefined;

  return (
    <div ref={containerRef} className="space-y-1.5">
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={handleCaretMove}
        onClick={handleCaretMove}
        onKeyUp={handleCaretMove}
        // Voltar a escrever fecha a lista aberta pelo botão (as setas voltam a mover o cursor).
        onFocus={() => {
          if (open && mode === "button") close();
        }}
        onBlur={() => {
          if (mode === "token") close();
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        rows={textareaRows}
        maxLength={maxLength}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={activeOptionId ? listId : undefined}
        aria-activedescendant={activeOptionId}
      />

      {open && (
        // preventDefault no toque: a lista não tira o foco do campo (senão o blur fecharia).
        <div className="rounded-md border bg-popover shadow-sm overflow-hidden" onPointerDown={(e) => e.preventDefault()}>
          <div className="flex items-baseline justify-between gap-2 px-3 py-1.5 border-b bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground">{tMsg("quickRepliesTooltip")}</span>
            <span className="hidden sm:inline text-[10px] text-muted-foreground/70 truncate">{t("keyboardHint")}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              {quickRepliesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : t("empty")}
            </div>
          ) : (
            <div
              id={listId}
              role="listbox"
              className="max-h-48 overflow-y-auto"
            >
              {items.map((r, i) => {
                const hasFiles = parseFastReplyMedias(r).length > 0;
                return (
                  <button
                    key={r.id}
                    id={`${listId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    ref={i === highlight ? activeItemRef : undefined}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(r)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-start gap-2 border-b last:border-b-0",
                      i === highlight ? "bg-accent" : "hover:bg-accent",
                    )}
                  >
                    <span className="flex flex-col items-start gap-1 shrink-0 pt-0.5">
                      <span className={cn(badgeVariants({ variant: "secondary" }), "text-[10px]")}>
                        /{(r.key || "").replace(/^\//, "")}
                      </span>
                      {hasFiles && (
                        <span className={cn(badgeVariants({ variant: "outline" }), "text-[10px] text-info border-info/40")}>
                          {r.voice === "enabled" ? tMsg("quickReplyAudioBadge") : tMsg("quickReplyMediaBadge")}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 min-w-0 line-clamp-2 whitespace-pre-wrap break-words leading-snug">{r.message}</span>
                  </button>
                );
              })}
              {ranked.more && (
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{t("moreHint")}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                disabled={disabled}
                aria-expanded={open}
                // O botão fica com o foco (o campo não): no celular o teclado não sobe, e o
                // Esc com a lista aberta chega ao listener do campo em vez de fechar o diálogo.
                onClick={toggleFromButton}
              >
                <MessageSquareQuote className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                {tMsg("quickRepliesTooltip")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs leading-relaxed">
              {t("buttonTooltip")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {filesNotice && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t("filesNotice")}</span>
        </p>
      )}
      {varWarnings.map((w) => (
        <p key={w.kind} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{warningText(w.kind, w.vars.join(", "))}</span>
        </p>
      ))}
    </div>
  );
}
