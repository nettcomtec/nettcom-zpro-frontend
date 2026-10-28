"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { fetchFastReplies, type FastReply } from "@/services/fast-reply";
import { visibleQuickReplies } from "@/lib/quick-reply-picker";

/**
 * Mensagens rápidas visíveis ao usuário (públicas + próprias), carregadas a cada abertura
 * do diálogo. Sem cache de módulo de propósito: rápida criada agora aparece na próxima
 * abertura. A sequência descarta a resposta de uma carga anterior (diálogo fechado e
 * aberto de novo, troca de usuário). Erro = lista vazia (o campo continua digitável).
 */
export function useQuickReplies(enabled: boolean): { rows: FastReply[]; loading: boolean } {
  const userId = useAuthStore((s) => s.user?.userId);
  const [rows, setRows] = useState<FastReply[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || userId == null) return;
    const seq = ++seqRef.current;
    setLoading(true);
    fetchFastReplies()
      .then(({ data }) => {
        if (seq !== seqRef.current) return;
        setRows(visibleQuickReplies(Array.isArray(data) ? data : [], userId));
      })
      .catch(() => {
        if (seq === seqRef.current) setRows([]);
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
    return () => {
      seqRef.current++;
      setLoading(false);
    };
  }, [enabled, userId]);

  return { rows, loading };
}
