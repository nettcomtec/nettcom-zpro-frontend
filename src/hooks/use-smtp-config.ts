"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSettings, updateSetting } from "@/services/settings";
import { fetchSuperadminConfigs, updateSuperadminConfig } from "@/services/superadmin-config";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const SMTP_KEYS = ["smtp", "emailHost", "emailPort", "emailUser", "emailPass", "emailSecure"];

export function useSmtpConfig() {
  const t = useTranslations("useSettings");
  const profile = useAuthStore((s) => s.user?.profile);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSuperadmin = profile === "superadmin";

  useEffect(() => {
    if (!profile) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        let arr: { key: string; value: string }[] = [];

        if (profile === "superadmin") {
          const { data } = await fetchSuperadminConfigs();
          arr = Array.isArray(data) ? data : [];
        } else {
          const { data } = await fetchSettings();
          arr = Array.isArray(data)
            ? data
            : (data as Record<string, unknown>)?.settings as { key: string; value: string }[] || [];
        }

        if (cancelled) return;

        const map: Record<string, string> = {};
        arr.forEach((s) => {
          if (SMTP_KEYS.includes(s.key)) {
            map[s.key] = s.value;
          }
        });
        setSettings(map);
      } catch (err) {
        if (cancelled) return;
        toast.error(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (entries?: { key: string; value: string }[]) => {
    setSaving(true);
    try {
      const toSave = entries || Object.entries(settings).map(([key, value]) => ({ key, value }));
      if (isSuperadmin) {
        await Promise.all(toSave.map((e) => updateSuperadminConfig(e.key, e.value)));
      } else {
        await Promise.all(toSave.map((e) => updateSetting(e.key, e.value)));
      }
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [settings, isSuperadmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return { settings, loading, saving, set, save };
}
