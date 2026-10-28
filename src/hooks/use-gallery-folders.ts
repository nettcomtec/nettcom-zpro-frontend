"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_GALLERY_FOLDERS,
  fetchGalleryFolders,
  type GalleryFolder,
  type GalleryFoldersState,
} from "@/services/gallery";

/**
 * Pastas da galeria (PLANO_GALERIA_PASTAS) para a página /galeria, o seletor compartilhado e o
 * modal "Da galeria" do atendimento.
 * - Busca SÓ com `enabled` (o seletor fica montado fechado no header e no atendimento: buscar ao
 *   montar seria 1 GET + GROUP BY a cada navegação).
 * - Busca de novo quando `fileType` muda: a contagem segue o filtro de tipo (D17).
 * - Resposta fora de ordem é descartada (contador de requisição).
 * - `available: false` (backend antigo, sem a migration ou erro) = nenhuma UI de pasta.
 */
export function useGalleryFolders({ enabled, fileType }: { enabled: boolean; fileType?: string }) {
  const [state, setState] = useState<GalleryFoldersState>(EMPTY_GALLERY_FOLDERS);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const { transientError, ...next } = await fetchGalleryFolders({ fileType: fileType || undefined });
    if (requestId !== requestIdRef.current) return;
    // Falha passageira (rede, prazo, 5xx) com pastas já na tela: mantém o que havia. Sem isso a
    // barra sumia, o filtro voltava a "Todos" e o próximo envio ia para fora da pasta.
    setState((prev) =>
      transientError && prev.available
        ? prev
        : {
            ...next,
            folders: [...next.folders].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            ),
          },
    );
    setLoading(false);
  }, [fileType]);

  useEffect(() => {
    if (!enabled) {
      // Invalida qualquer resposta pendente de uma abertura anterior.
      requestIdRef.current++;
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const nameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const folder of state.folders) map[folder.id] = folder.name;
    return map;
  }, [state.folders]);

  return {
    available: state.available,
    folders: state.folders as GalleryFolder[],
    unfiledCount: state.unfiledCount,
    totalCount: state.totalCount,
    loading,
    refresh,
    nameById,
  };
}
