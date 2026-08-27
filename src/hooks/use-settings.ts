"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSettings, updateSetting } from "@/services/settings";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";

interface SettingValue {
  key: string;
  value: string;
}

export function useSettings(keys?: string[]) {
  const t = useTranslations("useSettings");
  const setConfiguracoes = useAuthStore((s) => s.setConfiguracoes);
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Snapshot dos valores carregados do servidor — base do dirty-state:
  // save() sem args envia somente as chaves cujo valor difere daqui.
  const [initialSettings, setInitialSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data } = await fetchSettings();
        if (cancelled) return;
        const arr: SettingValue[] = Array.isArray(data)
          ? data
          : (data as Record<string, unknown>)?.settings as SettingValue[] || [];
        const map: Record<string, string> = {};
        arr.forEach((s) => {
          if (!keys || keys.length === 0 || keys.includes(s.key)) {
            map[s.key] = s.value;
          }
        });
        setSettings(map);
        setInitialSettings(map);
      } catch (err) {
        if (cancelled) return;
        toast.error(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [keys?.join(","), reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (entries?: { key: string; value: string }[]) => {
    setSaving(true);
    try {
      // Sem `entries`: envia SOMENTE as chaves alteradas em relacao ao snapshot
      // inicial (dirty-state). Com `entries`, mantem o comportamento original.
      const toSave = entries || Object.entries(settings)
        .filter(([key, value]) => (initialSettings[key] ?? "") !== value)
        .map(([key, value]) => ({ key, value }));
      if (toSave.length > 0) {
        await Promise.all(toSave.map((e) => updateSetting(e.key, e.value)));
        // Sync saved values into the auth store so getConfigValue returns fresh data
        // without requiring a page refresh.
        setConfiguracoes(toSave.map((e) => ({ key: e.key, value: e.value })));
        // Atualiza o snapshot com o que foi persistido, zerando o dirty-state.
        setInitialSettings((prev) => {
          const next = { ...prev };
          toSave.forEach((e) => { next[e.key] = e.value; });
          return next;
        });
      }
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [settings, initialSettings, setConfiguracoes]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // true quando algum valor em memoria difere do snapshot carregado do servidor.
  const hasChanges = Object.entries(settings).some(
    ([key, value]) => (initialSettings[key] ?? "") !== value
  );

  return { settings, loading, saving, set, save, reload, hasChanges };
}
