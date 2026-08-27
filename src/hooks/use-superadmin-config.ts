"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSuperadminConfigs, updateSuperadminConfig } from "@/services/superadmin-config";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function useSuperadminConfig(keys?: string[]) {
  const t = useTranslations("useSettings");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data } = await fetchSuperadminConfigs();
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        const map: Record<string, string> = {};
        arr.forEach((s: { key: string; value: string }) => {
          if (!keys || keys.length === 0 || keys.includes(s.key)) {
            map[s.key] = s.value;
          }
        });
        setSettings(map);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "CanceledError") return;
        toast.error(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [keys?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (entries?: { key: string; value: string }[]) => {
    setSaving(true);
    try {
      const toSave = entries || Object.entries(settings).map(([key, value]) => ({ key, value }));
      await Promise.all(toSave.map((e) => updateSuperadminConfig(e.key, e.value)));
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  return { settings, loading, saving, set, save };
}
