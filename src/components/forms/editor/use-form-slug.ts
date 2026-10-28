"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FORM_LIMITS, isValidFormSlug, normalizeFormSlug } from "@/lib/forms";
import { checkFormSlug } from "@/services/forms";

export type FormSlugState = "idle" | "checking" | "ok" | "taken" | "invalid";

/**
 * Sanitização enquanto a pessoa digita: o normalizador completo apaga o hífen do fim, e
 * aplicá-lo a cada tecla impediria digitar "meu-formulario". Aqui o separador do fim
 * vira um hífen; o normalizador completo roda ao sair do campo e ao salvar.
 */
export function typingFormSlug(raw: string): string {
  const base = normalizeFormSlug(raw);
  if (!base) return "";
  const endsWithSeparator = /[\s\-_.]$/.test(raw);
  return endsWithSeparator && base.length < FORM_LIMITS.slugMax ? `${base}-` : base;
}

/**
 * Conferência do endereço com espera de 450 ms (molde do Agendamento Público). O
 * endereço já salvo do próprio formulário conta como disponível sem perguntar.
 */
export function useFormSlugCheck(formId: number | null, savedSlug: string) {
  const [state, setState] = useState<FormSlugState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const check = useCallback(
    (raw: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const seq = ++seqRef.current;
      const slug = normalizeFormSlug(raw);
      if (!raw.trim()) {
        setState("idle");
        return;
      }
      if (!isValidFormSlug(slug)) {
        setState("invalid");
        return;
      }
      if (formId && savedSlug && slug === savedSlug) {
        setState("ok");
        return;
      }
      setState("checking");
      timerRef.current = setTimeout(async () => {
        try {
          const res = await checkFormSlug(slug, formId);
          if (seq !== seqRef.current) return;
          setState(res.available ? "ok" : "taken");
        } catch {
          if (seq === seqRef.current) setState("idle");
        }
      }, 450);
    },
    [formId, savedSlug]
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    seqRef.current += 1;
    setState("idle");
  }, []);

  return { state, check, reset, setState };
}
