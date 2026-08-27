"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pin } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Message } from "@/stores/ticket-store";

export type PinDuration = "24h" | "7d" | "30d" | "always";

interface PinMessageDialogProps {
  open: boolean;
  message: Message | null;
  onClose: () => void;
  onPin: (msg: Message, duration: PinDuration) => void;
}

export function PinMessageDialog({ open, message, onClose, onPin }: PinMessageDialogProps) {
  const t = useTranslations("pinMessage");
  const [duration, setDuration] = useState<PinDuration>("7d");

  function handleConfirm() {
    if (!message) return;
    onPin(message, duration);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-4 w-4" /> {t("title")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t("description")}</p>

        <RadioGroup
          value={duration}
          onValueChange={(v) => setDuration(v as PinDuration)}
          className="mt-2 space-y-2"
        >
          {(["24h", "7d", "30d", "always"] as PinDuration[]).map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`pin-duration-${opt}`} />
              <Label htmlFor={`pin-duration-${opt}`} className="cursor-pointer">
                {t(`duration_${opt}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleConfirm}>{t("confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
