"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchContacts } from "@/services/contacts";
import { displayContactIdentity, displayContactName } from "@/lib/contact-identity";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";

export interface ContactPickerValue {
  id: number;
  name: string;
}

interface ContactPickerProps {
  value: ContactPickerValue | null;
  onChange: (value: ContactPickerValue | null) => void;
  disabled?: boolean;
  /** `id` do botão (para o `<Label htmlFor>`). */
  id?: string;
  className?: string;
}

interface ContactOption {
  id: number;
  name: string;
  identity: string;
}

/** O que a busca usa de cada contato do `GET /contacts`. */
interface RawContact {
  id?: unknown;
  name?: string | null;
  pushname?: string | null;
  username?: string | null;
  number?: string | null;
  lid?: string | null;
  isLid?: boolean | null;
  bsuid?: string | null;
}

/**
 * Seletor de contato com busca no servidor (molde do /agenda): "Nenhum" como primeira
 * opção, busca ao abrir e a cada digitação com espera de 400 ms. A busca é do backend
 * (`GET /contacts`, que já respeita carteira e restrições) — o filtro do cmdk fica
 * desligado para não esconder resultado que o servidor achou por outro campo.
 * Quem usa decide se o campo aparece para usuário restrito.
 */
export function ContactPicker({ value, onChange, disabled, id, className }: ContactPickerProps) {
  const t = useTranslations("contactPicker");
  const { isLiveMode } = useLiveMode();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const search = useCallback(async (term: string) => {
    const seq = ++requestSeqRef.current;
    setSearching(true);
    try {
      const res = await fetchContacts({ searchParam: term, pageNumber: 1 });
      if (seq !== requestSeqRef.current) return;
      const raw = (res as { data?: unknown })?.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { contacts?: unknown[] })?.contacts)
          ? (raw as { contacts: unknown[] }).contacts
          : [];
      setOptions(
        (list as RawContact[])
          .filter((c) => typeof c?.id === "number")
          .map((c) => ({
            id: c.id as number,
            name: displayContactName(c) || `#${c.id as number}`,
            identity: displayContactIdentity(c),
          })),
      );
    } catch {
      if (seq === requestSeqRef.current) setOptions([]);
    } finally {
      if (seq === requestSeqRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (open) search(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 400);
  };

  const pick = (next: ContactPickerValue | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate text-left",
              !value && "text-muted-foreground",
              isLiveMode && value && "live-blur-text",
            )}
          >
            {value ? value.name || `#${value.id}` : t("placeholder")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("search")} value={query} onValueChange={handleQueryChange} />
          <CommandList onWheel={(e) => e.stopPropagation()} className="overscroll-contain">
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => pick(null)}>
                <Check className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                {t("none")}
              </CommandItem>
              {options.map((c) => (
                <CommandItem key={c.id} value={`contact-${c.id}`} onSelect={() => pick({ id: c.id, name: c.name })}>
                  <Check className={cn("h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                  <span className={cn("min-w-0 truncate", isLiveMode && "live-blur-text")}>{c.name}</span>
                  {c.identity && c.identity !== c.name && (
                    <span className={cn("ml-auto shrink-0 text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>
                      {c.identity}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
              </div>
            ) : options.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
