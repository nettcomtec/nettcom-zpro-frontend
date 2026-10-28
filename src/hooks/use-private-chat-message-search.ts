"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchPrivateMessages, type PrivateChatSearchResult } from "@/services/private-chat";
import { privateChatSearchTokens } from "@/lib/text-search";
import { getBackendErrorCode } from "@/lib/backend-error-code";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_PAGE_SIZE = 30;

interface SearchScope {
  id: number;
  isGroup: boolean;
}

/** `timeout` = o servidor cortou a busca pelo prazo (palavras muito comuns em muito histórico). */
export type PrivateChatSearchError = false | "generic" | "timeout";

interface SearchState {
  key: string;
  results: PrivateChatSearchResult[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: PrivateChatSearchError;
}

const EMPTY: SearchState = { key: "", results: [], hasMore: false, loading: false, loadingMore: false, error: false };

const statusOf = (err: unknown) => {
  const e = err as { status?: number; response?: { status?: number } };
  return e?.status ?? e?.response?.status;
};

const errorKind = (err: unknown): PrivateChatSearchError =>
  getBackendErrorCode(err) === "ERR_PRIVATE_CHAT_SEARCH_TIMEOUT" ? "timeout" : "generic";

/**
 * Busca nas mensagens do chat interno. Sem `scope` = todas as conversas do usuário e as
 * equipes de que ele é membro; com `scope` = só aquela conversa. Espera o usuário parar de
 * digitar, cancela o pedido anterior e descarta resposta de um termo que já mudou.
 * `unavailable` = backend sem a rota (404, versão anterior à busca).
 */
export function usePrivateChatMessageSearch({ term, scope, enabled }: { term: string; scope?: SearchScope | null; enabled: boolean }) {
  const tokens = useMemo(() => privateChatSearchTokens(term), [term]);
  const query = tokens.join(" ");
  const scopeId = scope?.id;
  const scopeIsGroup = !!scope?.isGroup;
  const key = enabled && query ? `${scopeId ? `${scopeIsGroup ? "g" : "u"}:${scopeId}` : "all"}|${query}` : "";
  const [state, setState] = useState<SearchState>(EMPTY);
  const [unavailable, setUnavailable] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;
  const moreCtrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    moreCtrlRef.current?.abort();
    if (!key || unavailable) {
      setState(EMPTY);
      return;
    }
    const ctrl = new AbortController();
    setState({ ...EMPTY, key, loading: true });
    const timer = setTimeout(async () => {
      try {
        const { data } = await searchPrivateMessages(
          { q: query, contactId: scopeId, isGroup: scopeIsGroup, limit: SEARCH_PAGE_SIZE },
          ctrl.signal
        );
        if (ctrl.signal.aborted || keyRef.current !== key) return;
        setState({ key, results: data?.results ?? [], hasMore: !!data?.hasMore, loading: false, loadingMore: false, error: false });
      } catch (err) {
        if (ctrl.signal.aborted || keyRef.current !== key) return;
        if (statusOf(err) === 404) setUnavailable(true);
        setState({ ...EMPTY, key, error: statusOf(err) === 404 ? false : errorKind(err) });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `key` já carrega termo e conversa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unavailable]);

  const loadMore = useCallback(async () => {
    const current = state;
    if (!current.key || current.key !== keyRef.current || !current.hasMore || current.loadingMore || current.results.length === 0) return;
    const beforeId = current.results[current.results.length - 1].id;
    moreCtrlRef.current?.abort();
    const ctrl = new AbortController();
    moreCtrlRef.current = ctrl;
    setState((s) => (s.key === current.key ? { ...s, loadingMore: true, error: false } : s));
    try {
      const { data } = await searchPrivateMessages(
        { q: query, contactId: scopeId, isGroup: scopeIsGroup, beforeId, limit: SEARCH_PAGE_SIZE },
        ctrl.signal
      );
      if (ctrl.signal.aborted) return;
      setState((s) => {
        if (s.key !== current.key) return s;
        const seen = new Set(s.results.map((r) => r.id));
        const next = (data?.results ?? []).filter((r) => !seen.has(r.id));
        return { ...s, results: [...s.results, ...next], hasMore: !!data?.hasMore, loadingMore: false };
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => (s.key === current.key ? { ...s, loadingMore: false, error: errorKind(err) } : s));
    }
  }, [state, query, scopeId, scopeIsGroup]);

  const live = state.key === key && !!key;
  return {
    tokens,
    active: !!key && !unavailable,
    results: live ? state.results : [],
    hasMore: live && state.hasMore,
    loading: !!key && !unavailable && (!live || state.loading),
    loadingMore: live && state.loadingMore,
    error: live ? state.error : (false as PrivateChatSearchError),
    unavailable,
    loadMore,
  };
}
