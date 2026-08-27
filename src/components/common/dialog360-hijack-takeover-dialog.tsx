"use client"

import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Dialog360HijackDetails } from "@/types/dialog360"

interface Props {
  open: boolean
  details: Dialog360HijackDetails | null
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * Dialog de takeover de canal Dialog360 já cadastrado em outro tenant.
 * Cópia independente de `HijackTakeoverDialog` para preservar isolamento do
 * stack WABA. Usa o namespace de i18n `dialog360Hijack` (adicionado em W3).
 */
export function Dialog360HijackTakeoverDialog({
  open,
  details,
  loading = false,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTranslations("dialog360Hijack")

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          <div>
            <span className="font-medium">{t("domainLabel")}:</span>{" "}
            <code>{details?.apiUrlMasked || "***"}</code>
          </div>
          <div>
            <span className="font-medium">{t("registeredAtLabel")}:</span>{" "}
            {formatDate(details?.registeredAt || null)}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t("question")}</p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? t("loading") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
