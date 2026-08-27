"use client";

// Banner persistente + toast quando um número WABA é BANIDO/RESTRITO pela Meta.
// Fonte: GET /meta/phone-health (tenant-scoped, qualquer usuário autenticado) +
// socket :meta:quality:update (tempo real via webhook account_update / pull 6h).
// Diferente do MetaRestrictionBanner (superadmin / saúde do App Tech Provider): este é
// operacional — avisa o tenant que o canal parou de enviar/receber.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Ban, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { classifyWabaPhoneStatus, isWabaPhoneStatusProblem } from "@/lib/waba-phone-quality";
import { useMetaPhoneHealthSocket } from "@/hooks/use-meta-phone-health-socket";

interface PhoneHealthRow {
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  phoneStatus?: string | null;
}

const DISMISS_KEY = "metaBannedBannerDismissedSig";

export function MetaBannedBanner() {
  const t = useTranslations("metaHealth");
  const { isAuthenticated } = useAuthStore();
  const [affected, setAffected] = useState<PhoneHealthRow[]>([]);
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);
  // null = ainda não carregou; depois vira o conjunto de banidos já vistos (não re-toasta).
  const seenBanned = useRef<Set<string> | null>(null);

  const load = useCallback(
    async (allowToast: boolean) => {
      if (!isAuthenticated) return;
      try {
        const resp = await api.get("/meta/phone-health");
        const rows: PhoneHealthRow[] = Array.isArray(resp.data) ? resp.data : [];
        const probs = rows.filter((r) => isWabaPhoneStatusProblem(r.phoneStatus));
        setAffected(probs);

        const banned = probs.filter((r) => classifyWabaPhoneStatus(r.phoneStatus) === "banned");
        if (seenBanned.current === null) {
          // primeira carga: registra os já banidos sem alertar (evita spam de bans antigos)
          seenBanned.current = new Set(banned.map((b) => b.phoneNumberId));
        } else if (allowToast) {
          for (const b of banned) {
            if (!seenBanned.current.has(b.phoneNumberId)) {
              seenBanned.current.add(b.phoneNumberId);
              toast.error(t("bannedToast", { phone: b.displayPhoneNumber || b.phoneNumberId }));
            }
          }
        }
      } catch {
        // 401 / sem dados / endpoint indisponível — silencia
      }
    },
    [isAuthenticated, t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Tempo real: qualquer mudança de saúde refaz o fetch (e toasta novos bans).
  useMetaPhoneHealthSocket(() => {
    load(true);
  });

  useEffect(() => {
    try {
      setDismissedSig(localStorage.getItem(DISMISS_KEY));
    } catch {}
  }, []);

  if (!isAuthenticated || affected.length === 0) return null;

  const banned = affected.filter((r) => classifyWabaPhoneStatus(r.phoneStatus) === "banned");
  const primary = banned.length > 0 ? banned : affected;
  const isBan = banned.length > 0;

  // Assinatura do conjunto atual — se mudar (novo número afetado), o banner reaparece
  // mesmo que tenha sido dispensado para o conjunto anterior.
  const signature = affected
    .map((r) => `${r.phoneNumberId}:${classifyWabaPhoneStatus(r.phoneStatus)}`)
    .sort()
    .join(",");
  if (dismissedSig === signature) return null;

  const phones = primary.map((r) => r.displayPhoneNumber || r.phoneNumberId).join(", ");
  const message = isBan ? t("bannedBanner", { phone: phones }) : t("restrictedBanner", { phone: phones });

  const handleDismiss = () => {
    setDismissedSig(signature);
    try {
      localStorage.setItem(DISMISS_KEY, signature);
    } catch {}
  };

  return (
    <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 px-4 py-2 flex items-center gap-3 text-sm">
      <Ban className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-red-900 dark:text-red-200 font-medium">{message}</span>
      </div>
      <Link
        href="/configuracoes/meta"
        className="text-red-700 dark:text-red-300 underline hover:text-red-900 dark:hover:text-red-100 shrink-0"
      >
        {t("viewChannelCta")}
      </Link>
      <button
        onClick={handleDismiss}
        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
