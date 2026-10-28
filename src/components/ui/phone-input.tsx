"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRegion } from "@/hooks/use-region";
import { useSafeAreaCollisionPadding } from "@/lib/safe-area-insets";
import {
  DEFAULT_COUNTRY,
  countryFromFullNumber,
  countryOptions,
  dialCodeFor,
  examplePhone,
  getCountry,
  isCountryIso,
  nationalLength,
  normalizeSearch,
  parsePhone,
} from "@/lib/region";

/**
 * Campo de telefone com seletor de país (tabela e regras em lib/region.ts).
 *
 * Valor = só dígitos COM o DDI, sem "+" ("5511987654321"); campo vazio = "".
 *
 * - País padrão: prop `defaultCountry` → país da empresa (`useRegion`) → BR.
 * - Valor vindo de FORA (banco, reset do form) passa por `parsePhone`: sem país
 *   reconhecível, o campo fica no modo "como está" (sem bandeira): mostra o valor
 *   exatamente como veio, devolve intacto e não acrescenta DDI a nada que for
 *   digitado até o operador escolher uma bandeira.
 * - O que o próprio campo emitiu NÃO é relido (ref com o último valor emitido):
 *   relê-lo trocava Canadá por EUA e a Rep. Dominicana/Jamaica por EUA no meio da
 *   digitação.
 * - "+…"/"00…" digitado ou colado lê o número inteiro (troca a bandeira); dígitos que
 *   começam com o DDI da bandeira e passam do tamanho nacional são o número completo
 *   (não duplica o DDI).
 */

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

type PhoneState =
  /** País escolhido/reconhecido; `national` = dígitos depois do DDI, como digitados. */
  | { iso: string; national: string }
  /** Modo "como está" (sem bandeira): `text` é mostrado e devolvido sem DDI novo. */
  | { iso: null; text: string };

interface PhoneCtx {
  defIso: string;
  locked: boolean;
}

interface PhoneStep {
  state: PhoneState;
  /** Valor a emitir (null = não emite). */
  emit: string | null;
  /** Caret: nº de dígitos antes dele; -1 = fim; null = não mexe. */
  caret: number | null;
}

// Entrada em bloco (colar, arrastar, autocompletar): lida como valor de fora.
const BULK_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop", "insertReplacementText"]);

// O zero da frente é prefixo de tronco ("0 11…", "06 12…") e não entra no número
// internacional — salvo onde ele faz parte do próprio número.
const KEEP_LEADING_ZERO = new Set(["IT", "SM", "VA", "CI"]);

const onlyDigits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** "+…" ou "00…" = número internacional. */
function isIntlEntry(raw: string): boolean {
  const s = raw.trimStart();
  return s.startsWith("+") || s.startsWith("00");
}

/** Dígitos depois do prefixo internacional. */
function intlDigits(raw: string): string {
  const s = raw.trimStart();
  const d = onlyDigits(s);
  return s.startsWith("+") ? d : d.slice(2);
}

/** Texto livre do modo "como está": só o que aparece num telefone. */
function cleanText(raw: string): string {
  return raw.replace(/[^\d+\s().-]/g, "");
}

/** Número completo (DDI + nacional) que o campo emite; nacional vazio = "". */
function fullNumber(iso: string, national: string): string {
  const digits = onlyDigits(national);
  const n = KEEP_LEADING_ZERO.has(iso) ? digits : digits.replace(/^0+/, "");
  return n ? `${dialCodeFor(iso)}${n}` : "";
}

/** Parte nacional do que está no campo quando o operador escolhe o país `iso`. */
function nationalFor(text: string, iso: string): string {
  const dial = dialCodeFor(iso);
  if (isIntlEntry(text)) {
    const full = intlDigits(text);
    if (!full || dial.startsWith(full)) return "";
    return full.startsWith(dial) ? full.slice(dial.length) : full;
  }
  const digits = onlyDigits(text);
  return digits.startsWith(dial) && digits.length > nationalLength(iso).max ? digits.slice(dial.length) : digits;
}

/** Valor que veio de fora → estado do campo. */
function stateFromValue(value: unknown, ctx: PhoneCtx): PhoneState {
  const raw = String(value ?? "");
  const digits = onlyDigits(raw);
  if (!digits) return { iso: ctx.defIso, national: "" };
  // Só o DDI (o campo antigo gravava "55" quando esvaziado) = vazio no país dele.
  let dialOnly: string | null = digits === dialCodeFor(ctx.defIso) ? ctx.defIso : null;
  if (!dialOnly) {
    const c = getCountry(countryFromFullNumber(digits));
    if (c && c.dial === digits) dialOnly = c.iso;
  }
  if (dialOnly && (!ctx.locked || dialOnly === ctx.defIso)) return { iso: dialOnly, national: "" };
  const p = parsePhone(raw, ctx.defIso);
  if (p.iso && (!ctx.locked || p.iso === ctx.defIso)) return { iso: p.iso, national: p.national };
  return { iso: null, text: raw };
}

/** "+…"/"00…": lê o número inteiro; enquanto o país não é certo, fica "como está". */
function reduceIntl(raw: string, ctx: PhoneCtx): PhoneStep {
  const text = cleanText(raw);
  const full = intlDigits(raw);
  const c = full ? getCountry(countryFromFullNumber(full)) : undefined;
  const rest = c ? full.slice(c.dial.length) : "";
  // +1 só decide o país com o código de área; +7 (Rússia × Cazaquistão), com 1 dígito.
  const pending = !c || (c.dial === "1" && rest.length < 3) || (c.dial === "7" && rest.length < 1);
  if (!c || pending || (ctx.locked && c.iso !== ctx.defIso)) {
    return { state: { iso: null, text }, emit: full, caret: null };
  }
  return { state: { iso: c.iso, national: rest }, emit: fullNumber(c.iso, rest), caret: -1 };
}

/** Digitação/colagem no campo. `caret` = dígitos antes do cursor no texto novo. */
function reduceInput(prev: PhoneState, raw: string, ctx: PhoneCtx, bulk: boolean, caret: number): PhoneStep {
  if (isIntlEntry(raw)) return reduceIntl(raw, ctx);
  const digits = onlyDigits(raw);
  if (!digits) {
    const iso = ctx.locked ? ctx.defIso : prev.iso ?? ctx.defIso;
    return { state: { iso, national: "" }, emit: "", caret: null };
  }
  if (bulk) {
    const p = parsePhone(raw, prev.iso ?? ctx.defIso);
    if (p.iso) {
      if (!ctx.locked || p.iso === ctx.defIso) {
        return { state: { iso: p.iso, national: p.national }, emit: fullNumber(p.iso, p.national), caret: -1 };
      }
      return { state: { iso: null, text: cleanText(raw) }, emit: digits, caret: null };
    }
  }
  // Modo "como está": nenhum DDI é acrescentado até o operador escolher a bandeira.
  // Com o país travado não há bandeira a escolher: sem "+"/"00", volta ao país travado.
  if (prev.iso === null && !ctx.locked) {
    return { state: { iso: null, text: cleanText(raw) }, emit: digits, caret: null };
  }
  const iso = prev.iso ?? ctx.defIso;
  const prevNational = prev.iso !== null ? prev.national : "";
  const dial = dialCodeFor(iso);
  // Número completo digitado com a bandeira do próprio país: não duplica o DDI. Só ao
  // digitar no fim (edição no meio de um número longo nunca apaga o começo dele).
  if (digits.startsWith(dial) && digits.length > nationalLength(iso).max && digits.startsWith(prevNational)) {
    const national = digits.slice(dial.length);
    return { state: { iso, national }, emit: fullNumber(iso, national), caret: -1 };
  }
  return { state: { iso, national: digits }, emit: fullNumber(iso, digits), caret };
}

/** Escolha de país no seletor. */
function reducePick(prev: PhoneState, iso: string): PhoneStep {
  const national = nationalFor(prev.iso !== null ? prev.national : prev.text, iso);
  return { state: { iso, national }, emit: fullNumber(iso, national), caret: -1 };
}

/** Máscara só no Brasil (DDD + 4/5 + 4); os demais países ficam como digitados. */
function formatNational(iso: string, national: string): string {
  if (iso !== "BR") return national;
  const d = national;
  if (d.length <= 2) return d;
  if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
}

/** Exemplo sem o DDI (a bandeira já mostra): "+54 9 11 2345-6789" → "9 11 2345-6789". */
function nationalExample(iso: string): string {
  return examplePhone(iso).replace(/^\+\d+\s*/, "");
}

/** DDI mostrado na lista: território do plano +1 leva o código de área ("+1 809"). */
function listDial(iso: string, dial: string): string {
  const areas = getCountry(iso)?.nanpAreas || [];
  return dial === "1" && iso !== "CA" && areas.length ? `+1 ${areas[0]}` : `+${dial}`;
}

function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join("");
}

// ---------------------------------------------------------------------------
// PhoneInput component
// ---------------------------------------------------------------------------
export interface PhoneInputProps {
  /** Só dígitos COM o DDI, sem "+" (ex.: "5511999999999"); vazio = "". */
  value?: string | null;
  /** Recebe o número completo (dígitos com DDI) ou "" quando o campo fica vazio. */
  onChange?: (value: string) => void;
  /** Sem ela, o exemplo do país escolhido. */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** ISO2 (ex.: "BR", "AR"). Sem ela, o país da empresa; depois, Brasil. */
  defaultCountry?: string;
  readOnly?: boolean;
  /** Seletor de país travado no `defaultCountry` (ex.: /signup no modo br). */
  lockCountry?: boolean;
  /** Textos para páginas fora do i18n da tela (ex.: /agendar); o que faltar vem do i18n. */
  labels?: { searchPlaceholder?: string; noResults?: string; asTyped?: string; countryLabel?: string };
  /** Idioma dos nomes de país (sem ela, o idioma da tela). */
  locale?: string;
  /**
   * Onde a lista de países é montada (portal). Sem ela, no `body`, como sempre. O
   * formulário público passa a raiz dele, para a lista usar as cores do formulário e
   * não as do tema do painel.
   */
  portalContainer?: HTMLElement | null;
}

// Mesmas classes do PopoverContent (components/ui/popover.tsx) + as da lista de países:
// com `portalContainer` o portal é montado aqui, porque o PopoverContent não repassa o
// `container` ao Portal. Mudar a aparência de um exige o outro.
const PORTAL_CONTENT_CLASS =
  "z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";

export function PhoneInput({
  value: rawValue,
  onChange,
  placeholder,
  className,
  disabled,
  defaultCountry,
  readOnly,
  lockCountry,
  labels,
  locale,
  portalContainer,
}: PhoneInputProps) {
  const value = rawValue ?? "";
  const t = useTranslations("phoneInput");
  const screenLocale = useLocale();
  const { country: regionCountry } = useRegion();
  const nameLocale = locale || screenLocale || "pt";

  const defIso = isCountryIso(defaultCountry)
    ? defaultCountry.toUpperCase()
    : isCountryIso(regionCountry)
      ? regionCountry.toUpperCase()
      : DEFAULT_COUNTRY;
  const locked = !!lockCountry;
  const ctx: PhoneCtx = { defIso, locked };

  const [state, setState] = React.useState<PhoneState>(() => stateFromValue(value, ctx));
  const [open, setOpen] = React.useState(false);
  // Só o portal próprio (`portalContainer`) precisa: o PopoverContent já desconta a faixa.
  const portalCollisionPadding = useSafeAreaCollisionPadding();
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedItemRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  // Último valor emitido pelo próprio campo (o eco dele não é relido) e último valor
  // da prop já sincronizado.
  const lastEmittedRef = React.useRef<string | null>(null);
  const syncedValueRef = React.useRef(value);
  const userPickedRef = React.useRef(false);
  const pendingCaretRef = React.useRef<number | null>(null);
  const focusInputOnCloseRef = React.useRef(false);

  // Valor mudou DE FORA (reset do form, contato carregado): relê. Troca só do país
  // padrão não relê (o valor é o mesmo): quem cuida dela é o efeito seguinte.
  React.useEffect(() => {
    if (value === syncedValueRef.current) return;
    syncedValueRef.current = value;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = null;
    userPickedRef.current = false;
    pendingCaretRef.current = null;
    setState(stateFromValue(value, { defIso, locked }));
  }, [value, defIso, locked]);

  // País padrão chegou/mudou (Região carregada, config do signup): vale para o campo
  // ainda vazio, salvo quando o operador já escolheu outro país (a trava sempre vence).
  const defKey = `${defIso}|${locked ? 1 : 0}`;
  const prevDefKeyRef = React.useRef(defKey);
  React.useEffect(() => {
    if (prevDefKeyRef.current === defKey) return;
    prevDefKeyRef.current = defKey;
    setState((s) => {
      const empty = s.iso !== null ? !s.national : !onlyDigits(s.text);
      if (!empty || s.iso === defIso) return s;
      if (userPickedRef.current && !locked) return s;
      return { iso: defIso, national: "" };
    });
  }, [defKey, defIso, locked]);

  // Máscara reescreve o texto: devolve o cursor ao mesmo dígito (senão pula para o fim).
  React.useLayoutEffect(() => {
    const want = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (want === null || !el || document.activeElement !== el) return;
    const text = el.value;
    let pos = text.length;
    if (want === 0) pos = 0;
    else if (want > 0) {
      let seen = 0;
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] >= "0" && text[i] <= "9") {
          seen += 1;
          if (seen === want) {
            pos = i + 1;
            break;
          }
        }
      }
    }
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // campo sem API de seleção: mantém o cursor do navegador
    }
  });

  // Foco na busca e país atual visível ao abrir.
  React.useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const timer = setTimeout(() => {
      searchRef.current?.focus();
      // Rola só a lista (scrollIntoView rolaria também a página/modal por trás).
      const list = listRef.current;
      const item = selectedItemRef.current;
      if (list && item) {
        const delta = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += delta - (list.clientHeight - item.clientHeight) / 2;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  const options = React.useMemo(() => countryOptions(nameLocale), [nameLocale]);
  const optionByIso = React.useMemo(() => new Map(options.map((o) => [o.iso, o])), [options]);
  // Busca sem acento pelo nome no idioma da tela, pelo nome em inglês e pelo ISO.
  const searchIndex = React.useMemo(() => {
    const en = new Map(countryOptions("en").map((o) => [o.iso, o.name]));
    return new Map(options.map((o) => [o.iso, normalizeSearch(`${o.name} ${en.get(o.iso) || ""} ${o.iso}`)]));
  }, [options]);
  const filtered = React.useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return options;
    // "+54", "54", "1809": busca pelo DDI (território +1 também pelo código de área).
    if (/^\+?\d+$/.test(q)) {
      const qd = q.replace(/\D/g, "");
      return options.filter((o) => {
        if (o.dial.startsWith(qd)) return true;
        return o.dial === "1" && (getCountry(o.iso)?.nanpAreas || []).some((a) => `1${a}`.startsWith(qd));
      });
    }
    return options.filter((o) => (searchIndex.get(o.iso) || "").includes(q));
  }, [search, options, searchIndex]);

  const canPick = !disabled && !readOnly && !locked;
  const searchPlaceholder = labels?.searchPlaceholder ?? t("searchPlaceholder");
  const asTypedLabel = state.iso === null ? (labels?.asTyped ?? t("asTyped")) : "";
  const countryLabel = labels?.countryLabel ?? t("countryLabel");
  const current = state.iso !== null ? optionByIso.get(state.iso) : undefined;
  const currentDial = state.iso !== null ? dialCodeFor(state.iso) : "";
  const buttonLabel =
    state.iso !== null
      ? `${countryLabel}: ${current?.name || state.iso} (+${currentDial})`
      : `${countryLabel}: ${asTypedLabel}`;

  function emit(next: string) {
    lastEmittedRef.current = next;
    onChange?.(next);
  }

  function apply(step: PhoneStep) {
    pendingCaretRef.current = step.caret;
    setState(step.state);
    if (step.emit !== null) emit(step.emit);
  }

  function handleCountrySelect(iso: string) {
    userPickedRef.current = true;
    focusInputOnCloseRef.current = true;
    setOpen(false);
    apply(reducePick(state, iso));
  }

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const inputType = (e.nativeEvent as InputEvent | undefined)?.inputType || "";
    const prevDigits = state.iso !== null ? state.national.length : onlyDigits(state.text).length;
    const bulk = BULK_INPUT_TYPES.has(inputType) || onlyDigits(raw).length - prevDigits > 1;
    const sel = e.target.selectionStart;
    const caret = sel === null ? -1 : onlyDigits(raw.slice(0, sel)).length;
    apply(reduceInput(state, raw, ctx, bulk, caret));
  }

  const displayValue = state.iso !== null ? formatNational(state.iso, state.national) : state.text;

  function handleContentCloseAutoFocus(e: Event) {
    if (!focusInputOnCloseRef.current) return;
    focusInputOnCloseRef.current = false;
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // campo sem API de seleção
    }
  }

  const countryPanel = (
    <>
      {/* Search */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered[0]) handleCountrySelect(filtered[0].iso);
            }
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {/* Country list */}
      <div ref={listRef} id={listId} role="listbox" aria-label={countryLabel} className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {labels?.noResults ?? t("noResults")}
          </p>
        )}
        {filtered.map((country) => {
          const selected = state.iso === country.iso;
          return (
            <button
              key={country.iso}
              ref={selected ? selectedItemRef : undefined}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => handleCountrySelect(country.iso)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                selected && "bg-accent"
              )}
            >
              <span className="text-base">{flagEmoji(country.iso)}</span>
              <span className="flex-1 truncate">{country.name}</span>
              <span className="text-muted-foreground tabular-nums text-xs">{listDial(country.iso, country.dial)}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className={cn("flex h-9 min-w-0 rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-ring/40 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      {/* Country selector */}
      <Popover open={open} onOpenChange={(o) => setOpen(canPick ? o : false)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!canPick}
            aria-label={buttonLabel}
            title={state.iso === null ? asTypedLabel : undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 pl-3 pr-2 text-sm border-r border-input transition-colors rounded-l-md focus:outline-none",
              canPick && "hover:bg-accent",
              disabled && "cursor-not-allowed opacity-50",
              !canPick && !disabled && "cursor-default"
            )}
          >
            {state.iso !== null ? (
              <>
                <span className="text-base leading-none">{flagEmoji(state.iso)}</span>
                <span className="text-muted-foreground tabular-nums">+{currentDial}</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="max-w-[6rem] truncate text-xs text-muted-foreground">{asTypedLabel}</span>
              </>
            )}
            {canPick && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
        </PopoverTrigger>
        {portalContainer === undefined ? (
          <PopoverContent
            className="w-72 max-w-[calc(100vw-2rem)] p-0"
            align="start"
            onCloseAutoFocus={handleContentCloseAutoFocus}
          >
            {countryPanel}
          </PopoverContent>
        ) : (
          <PopoverPrimitive.Portal container={portalContainer}>
            <PopoverPrimitive.Content
              className={PORTAL_CONTENT_CLASS}
              align="start"
              sideOffset={4}
              collisionPadding={portalCollisionPadding}
              onCloseAutoFocus={handleContentCloseAutoFocus}
            >
              {countryPanel}
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        )}
      </Popover>

      {/* Number input */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="tel"
        disabled={disabled}
        readOnly={readOnly}
        value={displayValue}
        onChange={handleLocalChange}
        placeholder={placeholder ?? (state.iso !== null ? nationalExample(state.iso) : undefined)}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 rounded-r-md"
      />
    </div>
  );
}
