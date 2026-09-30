"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useWatch, type FieldValues, type Path, type PathValue, type UseFormReturn } from "react-hook-form";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cepDigits, formatCep, lookupCep } from "@/lib/cep-lookup";

// Bloco de endereço do contato — componente ÚNICO dos 2 formulários (/contatos e o do
// atendimento), PLANO_ENDERECO_COMPLETO_CONTATO D2/D3.
export type ContactAddressFormValues = {
  cep?: string;
  logradouro?: string;
  numeroEndereco?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

export const CONTACT_ADDRESS_FIELD_NAMES = [
  "cep",
  "logradouro",
  "numeroEndereco",
  "complemento",
  "bairro",
  "cidade",
  "estado",
] as const;

export type ContactAddressFieldName = (typeof CONTACT_ADDRESS_FIELD_NAMES)[number];

// Algum campo do bloco foi mexido? Na EDIÇÃO o bloco só vai no payload nesse caso (e aí ""
// apaga) — senão um diálogo aberto antes de uma atualização feita por outro caminho
// (pedido da loja, API) devolveria o endereço velho ao salvar outra coisa.
export function isAddressBlockDirty<T extends FieldValues>(form: UseFormReturn<T>): boolean {
  return CONTACT_ADDRESS_FIELD_NAMES.some((field) => form.getFieldState(field as Path<T>).isDirty);
}

// Os 7 campos do bloco, crus ("" = apagar).
export function addressPayloadFrom(values: ContactAddressFormValues): Required<ContactAddressFormValues> {
  return {
    cep: values.cep ?? "",
    logradouro: values.logradouro ?? "",
    numeroEndereco: values.numeroEndereco ?? "",
    complemento: values.complemento ?? "",
    bairro: values.bairro ?? "",
    cidade: values.cidade ?? "",
    estado: values.estado ?? "",
  };
}

interface ContactAddressFieldsProps<T extends FieldValues & ContactAddressFormValues> {
  form: UseFormReturn<T>;
  disabled?: boolean;
  className?: string;
}

export function ContactAddressFields<T extends FieldValues & ContactAddressFormValues>({
  form,
  disabled,
  className,
}: ContactAddressFieldsProps<T>) {
  const t = useTranslations("contactAddressFields");
  const baseId = useId();
  const [cepLoading, setCepLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const lastLookupRef = useRef<string | null>(null);
  // Só a digitação/colagem no CEP (nesta abertura) liga a busca automática. Valor que chega por
  // reset/carga nunca busca: o /contatos abre o diálogo ANTES de carregar o contato, e o form
  // ainda traz o CEP e o "sujo" da edição anterior nesse intervalo.
  const cepTypedRef = useRef(false);
  const cepInputRef = useRef<HTMLInputElement | null>(null);
  const lupaRef = useRef<HTMLButtonElement | null>(null);

  const path = (field: ContactAddressFieldName) => field as Path<T>;

  const cepValue = useWatch({ control: form.control, name: path("cep") }) as string | undefined;

  useEffect(() => () => abortRef.current?.abort(), []);

  const runLookup = useCallback(
    async (manual: boolean) => {
      const digits = cepDigits(form.getValues(path("cep")) as string | undefined);
      if (digits.length !== 8) {
        if (manual) toast.error(t("cepInvalid"));
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++seqRef.current;
      lastLookupRef.current = digits;
      setCepLoading(true);
      // Retrato dos campos que a busca preenche: o que o atendente digitar durante a espera
      // (até 10 s com a reserva) não é sobrescrito pela resposta.
      const fillable: ContactAddressFieldName[] = ["logradouro", "bairro", "cidade", "estado"];
      const before = new Map(
        fillable.map((field) => [field, String(form.getValues(path(field)) ?? "")] as const)
      );

      const result = await lookupCep(digits, controller.signal);
      // Resposta atrasada (outra busca começou depois): descarta.
      if (seq !== seqRef.current) return;
      abortRef.current = null;
      setCepLoading(false);

      if (result.status === "aborted") return;
      if (result.status === "invalid") {
        if (manual) toast.error(t("cepInvalid"));
        return;
      }
      if (result.status === "notFound") {
        toast.error(t("cepNotFound"));
        return;
      }
      if (result.status === "error") {
        toast.error(t("cepError"));
        return;
      }
      // O CEP mudou enquanto a busca corria: não preenche com o endereço de outro CEP.
      if (cepDigits(form.getValues(path("cep")) as string | undefined) !== digits) return;

      // CEP novo substitui rua/bairro/cidade/UF, mas campo que o CEP devolve vazio (CEP geral de
      // cidade pequena) não apaga o que já está lá. Nº e complemento nunca são tocados.
      const fill: Array<[ContactAddressFieldName, string]> = [
        ["logradouro", result.logradouro],
        ["bairro", result.bairro],
        ["cidade", result.cidade],
        ["estado", result.uf],
      ];
      fill.forEach(([field, value]) => {
        if (!value) return;
        if (String(form.getValues(path(field)) ?? "") !== before.get(field)) return;
        form.setValue(path(field), value as PathValue<T, Path<T>>, { shouldDirty: true });
      });

      // Foco no Nº só se o atendente ainda está no CEP (não rouba o foco de quem já seguiu).
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (!active || active === document.body || active === cepInputRef.current || active === lupaRef.current) {
        form.setFocus(path("numeroEndereco"));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, t]
  );

  // Busca automática: campo mexido, 8 dígitos e diferente do último CEP buscado. Ao abrir a
  // edição com o CEP salvo nada é buscado (campo intocado); a lupa força.
  useEffect(() => {
    const digits = cepDigits(cepValue);
    if (digits.length !== 8) return;
    if (digits === lastLookupRef.current) return;
    if (!cepTypedRef.current) return;
    if (!form.getFieldState(path("cep")).isDirty) return;
    void runLookup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepValue]);

  const cepField = form.register(path("cep"));
  const estadoField = form.register(path("estado"));
  const id = (field: ContactAddressFieldName) => `${baseId}-${field}`;

  return (
    <section className={cn("space-y-3", className)} aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("sectionTitle")}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={id("cep")}>{t("cep")}</Label>
          <div className="flex gap-2 sm:max-w-xs">
            <Input
              {...cepField}
              id={id("cep")}
              ref={(el) => {
                cepField.ref(el);
                cepInputRef.current = el;
              }}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder={t("cepPlaceholder")}
              disabled={disabled}
              onChange={(e) => {
                // Máscara pelos dígitos, sem maxLength nativo: colar "CEP 01.310-100" funciona.
                // Código postal estrangeiro (tem letra fora de um "CEP" colado) fica como digitado.
                const typed = e.target.value;
                const withoutLabel = typed.replace(/^\s*cep\b[\s:.-]*/i, "");
                e.target.value = /[A-Za-z]/.test(withoutLabel) ? typed.slice(0, 20) : formatCep(typed);
                cepTypedRef.current = true;
                void cepField.onChange(e);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runLookup(true);
                }
              }}
            />
            <Button
              ref={lupaRef}
              type="button"
              variant="outline"
              size="icon"
              title={t("searchCep")}
              aria-label={t("searchCep")}
              onClick={() => void runLookup(true)}
              disabled={disabled || cepLoading}
            >
              {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-[1fr_7rem]">
          <div className="space-y-2">
            <Label htmlFor={id("logradouro")}>{t("logradouro")}</Label>
            <Input
              {...form.register(path("logradouro"))}
              id={id("logradouro")}
              placeholder={t("logradouroPlaceholder")}
              autoComplete="address-line1"
              maxLength={255}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("numeroEndereco")}>{t("numeroEndereco")}</Label>
            <Input
              {...form.register(path("numeroEndereco"))}
              id={id("numeroEndereco")}
              placeholder={t("numeroEnderecoPlaceholder")}
              maxLength={30}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={id("complemento")}>{t("complemento")}</Label>
          <Input
            {...form.register(path("complemento"))}
            id={id("complemento")}
            placeholder={t("complementoPlaceholder")}
            autoComplete="address-line2"
            maxLength={255}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("bairro")}>{t("bairro")}</Label>
          <Input
            {...form.register(path("bairro"))}
            id={id("bairro")}
            placeholder={t("bairroPlaceholder")}
            maxLength={255}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("cidade")}>{t("cidade")}</Label>
          <Input
            {...form.register(path("cidade"))}
            id={id("cidade")}
            placeholder={t("cidadePlaceholder")}
            autoComplete="address-level2"
            maxLength={255}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("estado")}>{t("estado")}</Label>
          <Input
            {...estadoField}
            id={id("estado")}
            placeholder={t("estadoPlaceholder")}
            autoComplete="address-level1"
            maxLength={2}
            className="uppercase"
            disabled={disabled}
            onChange={(e) => {
              e.target.value = e.target.value.toUpperCase();
              void estadoField.onChange(e);
            }}
          />
        </div>
      </div>
    </section>
  );
}
