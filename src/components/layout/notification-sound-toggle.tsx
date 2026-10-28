"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Volume1, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { useAuthStore } from "@/stores/auth-store";
import { persistNotificationSoundMute } from "@/services/users";
import {
  NOTIFICATION_SOUND_MUTE_CONFIG_KEY,
  NOTIFICATION_SOUND_MUTE_SYNC_KEY,
  beginNotificationSoundMuteWrite,
  endNotificationSoundMuteWrite,
  isTenantNotificationSoundOff,
  noteNotificationSoundMuteExternalWrite,
  normalizeNotificationSoundMuteMode,
  type NotificationSoundMuteMode,
} from "@/lib/notification-sound-mute";

const MODES: NotificationSoundMuteMode[] = ["none", "groups", "all"];

const MODE_LABEL_KEY: Record<NotificationSoundMuteMode, string> = {
  none: "soundToggle.modeNone",
  groups: "soundToggle.modeGroups",
  all: "soundToggle.modeAll",
};

const MODE_DESC_KEY: Record<NotificationSoundMuteMode, string> = {
  none: "soundToggle.modeNoneDesc",
  groups: "soundToggle.modeGroupsDesc",
  all: "soundToggle.modeAllDesc",
};

const MODE_TOAST_KEY: Record<NotificationSoundMuteMode, string> = {
  none: "soundToggle.toastNone",
  groups: "soundToggle.toastGroups",
  all: "soundToggle.toastAll",
};

/**
 * Botão de som do topo: cada usuário escolhe, só para ele, som ligado, grupos sem som ou tudo
 * sem som (lib/notification-sound-mute.ts). Grava em User.configs e vale em todo aparelho em
 * que ele entra, inclusive no push. Com "Notificações sonoras" da empresa desligada, o painel,
 * o navegador e o iPhone já estão sem som para todos e o app Android continua tocando
 * (decisão do Pedro, 17/10/2026): o menu segue aberto e a escolha vale para o app Android.
 * Superadmin não segue a empresa aqui: o push do suporte dele ignora esse interruptor.
 */
export function NotificationSoundToggle({ className }: { className?: string }) {
  const t = useTranslations("layoutHeader");
  const userId = useAuthStore((s) => s.user?.userId);
  const profile = useAuthStore((s) => s.user?.profile);
  const rawMode = useAuthStore(
    (s) => (s.user?.configs as Record<string, unknown> | undefined)?.[NOTIFICATION_SOUND_MUTE_CONFIG_KEY],
  );
  // Assinatura só para redesenhar quando as configurações da empresa chegam ou mudam.
  useAuthStore((s) => s.configuracoes);
  const setNotificationSoundMute = useAuthStore((s) => s.setNotificationSoundMute);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const mode = normalizeNotificationSoundMuteMode(rawMode);
  const tenantOff =
    profile !== "superadmin" &&
    isTenantNotificationSoundOff(useAuthStore.getState().getConfigValue("notificationSilenced"));

  // Outra aba do mesmo navegador mudou a escolha: aplica aqui sem esperar o refresh de 30 s.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NOTIFICATION_SOUND_MUTE_SYNC_KEY || !event.newValue) return;
      const data = safeJsonParse(event.newValue, null as null | { userId?: unknown; mode?: unknown });
      const me = useAuthStore.getState().user?.userId;
      if (!data || me == null || Number(data.userId) !== Number(me)) return;
      noteNotificationSoundMuteExternalWrite();
      try {
        useAuthStore.getState().setNotificationSoundMute(normalizeNotificationSoundMuteMode(data.mode));
      } catch { /* cópia local indisponível: a tela pega no refresh de 30 s */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleChange = async (value: string) => {
    const next = normalizeNotificationSoundMuteMode(value);
    if (userId == null || saving || next === mode) return;
    const previous = mode;
    setSaving(true);
    beginNotificationSoundMuteWrite();
    let saved = false;
    try {
      setNotificationSoundMute(next);
      await persistNotificationSoundMute(Number(userId), next);
      saved = true;
    } catch {
      try {
        setNotificationSoundMute(previous);
      } catch { /* cópia local indisponível */ }
    } finally {
      endNotificationSoundMuteWrite();
      setSaving(false);
    }
    if (!saved) {
      toast.error(t("soundToggle.saveError"));
      return;
    }
    try {
      localStorage.setItem(
        NOTIFICATION_SOUND_MUTE_SYNC_KEY,
        JSON.stringify({ userId, mode: next, at: Date.now() }),
      );
    } catch { /* sem localStorage: as outras abas pegam no refresh de 30 s */ }
    // Empresa com o som desligado: a escolha só muda o app Android.
    toast.success(tenantOff ? t("soundToggle.toastTenantOff") : t(MODE_TOAST_KEY[next]));
  };

  const muted = mode !== "none";
  const Icon = tenantOff || mode === "all" ? VolumeX : mode === "groups" ? Volume1 : Volume2;
  const label = tenantOff
    ? t("soundToggle.tooltipTenantOff")
    : t("soundToggle.tooltipState", { state: t(MODE_LABEL_KEY[mode]) });

  return (
    <TooltipProvider delayDuration={300}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                className={cn(
                  "relative h-9 w-9",
                  muted && !tenantOff && "bg-amber-500/10 hover:bg-amber-500/20",
                  className,
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    tenantOff ? "text-muted-foreground" : muted && "text-amber-600 dark:text-amber-400",
                  )}
                />
                {muted && (
                  <span
                    className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!open && <TooltipContent side="bottom">{label}</TooltipContent>}
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={8} collisionPadding={8} className="w-[calc(100vw-1rem)] max-w-80 sm:w-80">
          <div className="space-y-1 px-2 py-1.5">
            <p className="text-sm font-semibold">{t("soundToggle.title")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("soundToggle.help")}</p>
          </div>
          {tenantOff && (
            <div className="mx-1 mb-1 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("soundToggle.tenantOffNotice")}</span>
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={mode} onValueChange={handleChange}>
            {MODES.map((option) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={saving}
                className="items-start py-2"
              >
                <div className="space-y-0.5">
                  <p className="text-sm leading-tight">{t(MODE_LABEL_KEY[option])}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{t(MODE_DESC_KEY[option])}</p>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <div className="space-y-1 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            <p>{t("soundToggle.androidNote")}</p>
            <p>{t("soundToggle.callNote")}</p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
