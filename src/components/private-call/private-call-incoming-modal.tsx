"use client";

import { useEffect, useRef } from "react";
import { PhoneOff, PhoneIncoming } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { startCallRingtone } from "@/lib/call-ringtone";
import { usePrivateCallStore } from "@/stores/private-call-store";
import { usePrivateCallActions } from "./private-call-provider";

export function PrivateCallIncomingModal() {
  const t = useTranslations("chatPrivadoPage");
  const state = usePrivateCallStore((s) => s.state);
  const callType = usePrivateCallStore((s) => s.callType);
  const remoteUserName = usePrivateCallStore((s) => s.remoteUserName);
  const remoteUserAvatar = usePrivateCallStore((s) => s.remoteUserAvatar);
  const { acceptCall, rejectCall } = usePrivateCallActions();
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  const open = state === "incoming";

  useEffect(() => {
    if (!open) return;
    // Toca o arquivo de public/ quando existir; senão, o beep sintetizado de
    // sempre. Ver lib/call-ringtone.ts.
    return startCallRingtone();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rejectCall(); }}>
      <DialogContent
        className="max-w-xs overflow-hidden text-center [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          // Foco inicial no botão ATENDER (o primeiro focável é o Recusar —
          // sem isso, Enter recusava a chamada).
          e.preventDefault();
          acceptButtonRef.current?.focus();
        }}
        onEscapeKeyDown={() => {
          // Intencional: Esc fecha o dialog (default do Radix) ->
          // onOpenChange(false) -> rejectCall(). Não chamar rejectCall aqui
          // para não recusar em duplicidade.
        }}
      >
        <DialogTitle className="sr-only">{t("incomingCall")}</DialogTitle>
        <div className="flex w-full min-w-0 flex-col items-center gap-4 py-4">
          <Avatar className="h-16 w-16 shrink-0">
            {remoteUserAvatar ? <AvatarImage src={remoteUserAvatar} alt={remoteUserName ?? ""} /> : null}
            <AvatarFallback className="text-2xl">
              {(remoteUserName || "?").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="w-full min-w-0 px-2">
            <p className="font-semibold text-lg break-all line-clamp-2 leading-tight [overflow-wrap:anywhere]">
              {remoteUserName || t("incomingCall")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {callType === "video" ? t("videoCall") : t("audioCall")}
            </p>
          </div>
          <div className="flex gap-6 mt-2">
            <Button
              size="icon"
              variant="destructive"
              className="h-12 w-12 rounded-full"
              onClick={rejectCall}
              aria-label={t("declineCall")}
              title={t("declineCall")}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
            <Button
              ref={acceptButtonRef}
              size="icon"
              className="h-12 w-12 rounded-full bg-success text-success-foreground hover:bg-success/90"
              onClick={acceptCall}
              aria-label={t("acceptCall")}
              title={t("acceptCall")}
            >
              <PhoneIncoming className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
