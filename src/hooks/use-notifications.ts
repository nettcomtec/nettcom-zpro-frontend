"use client";

import { useState, useCallback, useRef } from "react";
import {
  fetchAllNotifications,
  type InternalNotification,
} from "@/services/internal-notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);

  const reload = useCallback(async () => {
    setLoading(true);
    pageRef.current = 1;
    try {
      const { data } = await fetchAllNotifications({ pageNumber: 1 });
      const list =
        Array.isArray(data)
          ? (data as InternalNotification[])
          : data?.notifications ?? [];
      setNotifications(list);
      setHasMore(data?.hasMore ?? false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    pageRef.current += 1;
    try {
      const { data } = await fetchAllNotifications({ pageNumber: pageRef.current });
      const list =
        Array.isArray(data)
          ? (data as InternalNotification[])
          : data?.notifications ?? [];
      setNotifications((prev) => [...prev, ...list]);
      setHasMore(data?.hasMore ?? false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  const addNotification = useCallback((n: InternalNotification) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      return [n, ...prev];
    });
  }, []);

  const removeByIds = useCallback((ids: number[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const updateOne = useCallback((id: number, patch: Partial<InternalNotification>) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch } : n))
    );
  }, []);

  return {
    notifications,
    loading,
    hasMore,
    reload,
    loadMore,
    addNotification,
    removeByIds,
    updateOne,
  };
}
