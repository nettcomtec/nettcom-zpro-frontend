"use client";

import { useCallback, useRef, useState } from "react";
import { listMedia, readInstagramMediaPage, type InstagramMedia } from "@/services/instagram";

// Lista de publicações do Instagram em páginas (paging.next da Meta). Antes as telas
// carregavam só a 1ª página (25 mais recentes) e as publicações antigas nunca apareciam.
// A geração descarta a resposta de uma carga que ficou para trás (troca de canal, reabrir
// o diálogo) — sem ela, um "carregar mais" atrasado juntaria posts de outra lista.
export function useInstagramMediaPages() {
  const [items, setItems] = useState<InstagramMedia[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const genRef = useRef(0);
  const whatsappIdRef = useRef<number | null>(null);
  const nextUrlRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const applyNext = useCallback((next: string | null) => {
    nextUrlRef.current = next;
    setNextUrl(next);
  }, []);

  const reset = useCallback(() => {
    genRef.current += 1;
    whatsappIdRef.current = null;
    loadingMoreRef.current = false;
    applyNext(null);
    setItems([]);
    setLoading(false);
    setLoadingMore(false);
  }, [applyNext]);

  // true = carregou (ou foi substituída por uma carga mais nova); false = falhou
  const load = useCallback(async (whatsappId: number): Promise<boolean> => {
    const gen = ++genRef.current;
    whatsappIdRef.current = whatsappId;
    loadingMoreRef.current = false;
    applyNext(null);
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    try {
      const res = await listMedia(whatsappId);
      if (gen !== genRef.current) return true;
      const page = readInstagramMediaPage(res.data);
      setItems(page.items);
      applyNext(page.next);
      return true;
    } catch {
      return gen !== genRef.current;
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [applyNext]);

  const loadMore = useCallback(async (): Promise<boolean> => {
    const whatsappId = whatsappIdRef.current;
    const next = nextUrlRef.current;
    if (!whatsappId || !next || loadingMoreRef.current) return true;
    const gen = genRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await listMedia(whatsappId, next);
      if (gen !== genRef.current) return true;
      const page = readInstagramMediaPage(res.data);
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.items.filter((m) => !seen.has(m.id))];
      });
      applyNext(page.next);
      return true;
    } catch {
      return gen !== genRef.current;
    } finally {
      if (gen === genRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [applyNext]);

  return { items, setItems, nextUrl, hasMore: !!nextUrl, loading, loadingMore, load, loadMore, reset };
}
