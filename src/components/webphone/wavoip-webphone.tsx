"use client";

/**
 * WaVoIPWebphone — UI de chamada para o modal webphone.
 * O SDK já é inicializado pelo WaVoIPInitializer no layout.
 * Este componente apenas fornece controles de discagem e chamada.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWebphoneStore } from "@/stores/webphone-store";
import { CallControls } from "./call-controls";
import { CallTimer } from "./call-timer";
import { Numpad } from "./numpad";
import { getInitials } from "@/lib/utils";
import { createWavoipCall, updateWavoipCall, createCallNote } from "@/services/wavoip";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslations } from "next-intl";

interface WaVoIPWebphoneProps {
  tokens: { token: string; inboxName: string }[];
}

export function WaVoIPWebphone({ tokens }: WaVoIPWebphoneProps) {
  const t = useTranslations("wavoipWebphone");
  const {
    callStatus,
    callInfo,
    setCallStatus,
    startCall,
    endCall,
    pendingWavoipCall,
    clearPendingWavoipCall,
  } = useWebphoneStore();
  const { user } = useAuthStore();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const offerRef = useRef<{ accept: () => void; reject: () => void; onEnd?: (cb: () => void) => void } | null>(null);
  const outgoingCallRef = useRef<{
    onPeerAccept?: (cb: () => void) => void;
    onPeerReject?: (cb: () => void) => void;
    onUnanswered?: (cb: () => void) => void;
    onEnd?: (cb: () => void) => void;
    _wavoipCallLogId?: number;
    _wavoipCallStartedAt?: number;
  } | null>(null);

  /** Core dial logic — reutilizado tanto pelo botão manual quanto pelo auto-dial do pendingWavoipCall */
  const dialWithTokens = useCallback(async (phone: string, tokenList: string[], meta?: {
    inboxName?: string;
    ticketId?: number;
    contactName?: string;
    contactPic?: string;
  }) => {
    if (!phone.trim() || !window.wavoip || tokenList.length === 0) return;

    const callResult = window.wavoip.call.startCall(phone, tokenList) as typeof outgoingCallRef.current;

    startCall({
      phone,
      tag: meta?.contactName,
      pictureProfile: meta?.contactPic,
      direction: "outgoing",
      inboxName: meta?.inboxName,
    });

    outgoingCallRef.current = callResult ?? null;

    createWavoipCall({
      direction: "outgoing",
      phone,
      deviceToken: tokenList[0],
      inboxName: meta?.inboxName || "",
      callStatus: "ringing",
      tenantId: user?.tenantId,
      userId: user?.userId,
      ...(meta?.ticketId != null && { ticketId: meta.ticketId }),
    })
      .then((res) => {
        const logId = (res?.data as { id?: number })?.id;
        if (logId && outgoingCallRef.current) {
          outgoingCallRef.current._wavoipCallLogId = logId;
          outgoingCallRef.current._wavoipCallStartedAt = Date.now();
        }
      })
      .catch(() => {});

    // Cria nota de ligação no ticket (como Vue's CriarNota), se chamada originada de um ticket
    if (meta?.ticketId != null) {
      createCallNote({
        notes: JSON.stringify({ title: "Ligação de voz", subtitle: "Registro de ligação no seu celular." }),
        ticketId: meta.ticketId,
        noteType: "callNotes",
        fromMe: true,
      }).catch(() => {});
    }

    const updateLog = (status: string) => {
      const id = outgoingCallRef.current?._wavoipCallLogId;
      if (!id) return;
      const duration = outgoingCallRef.current?._wavoipCallStartedAt
        ? Math.round((Date.now() - outgoingCallRef.current._wavoipCallStartedAt) / 1000)
        : 0;
      updateWavoipCall(id, { callStatus: status, callDuration: duration }).catch(() => {});
    };

    if (callResult) {
      callResult.onPeerAccept?.(() => {
        setCallStatus("established");
        updateLog("answered");
      });
      callResult.onPeerReject?.(() => {
        updateLog("rejected");
        endCall();
      });
      callResult.onUnanswered?.(() => {
        updateLog("unanswered");
        endCall();
      });
      callResult.onEnd?.(() => {
        updateLog("completed");
        endCall();
      });
    }
  }, [startCall, setCallStatus, endCall, user]);

  /** Botão manual de discar — usa todos os tokens do usuário */
  const handleDial = useCallback(() => {
    const tokenList = tokens.map((t) => t.token);
    dialWithTokens(phoneNumber, tokenList, { inboxName: tokens[0]?.inboxName });
  }, [phoneNumber, tokens, dialWithTokens]);

  /**
   * Auto-dial quando ticket-detail solicita via store.requestWavoipCall()
   * Usa o token específico do canal do ticket
   */
  useEffect(() => {
    if (!pendingWavoipCall) return;
    const { phone, token, ticketId, contactName, contactPic, inboxName } = pendingWavoipCall;
    clearPendingWavoipCall();

    const tokenList = token.includes(",")
      ? token.split(",").map((t) => t.trim())
      : [token];

    dialWithTokens(phone, tokenList, { inboxName, ticketId, contactName, contactPic });
  }, [pendingWavoipCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = useCallback(() => {
    offerRef.current?.accept();
    setCallStatus("established");
  }, [setCallStatus]);

  const handleReject = useCallback(() => {
    offerRef.current?.reject();
    endCall();
    offerRef.current = null;
  }, [endCall]);

  const handleHangup = useCallback(() => {
    endCall();
    offerRef.current = null;
    outgoingCallRef.current = null;
  }, [endCall]);

  const handleKeypadPress = useCallback(
    (key: string) => {
      if (callStatus !== "established") {
        setPhoneNumber((prev) => prev + key);
      }
    },
    [callStatus]
  );

  const statusLabel: Record<string, string> = {
    idle: t("statusIdle"),
    ringing: t("statusRinging"),
    calling: t("statusCalling"),
    established: t("statusEstablished"),
  };

  const sdkReady = typeof window !== "undefined" && !!window.wavoip;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <Badge variant={callStatus === "idle" ? "secondary" : "default"}>
        {statusLabel[callStatus] || callStatus}
      </Badge>

      {!sdkReady && (
        <p className="text-xs text-muted-foreground">{t("startingWavoip")}</p>
      )}

      {callInfo && (
        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-16 w-16">
            {callInfo.pictureProfile && (
              <AvatarImage src={callInfo.pictureProfile} />
            )}
            <AvatarFallback>
              {getInitials(callInfo.tag || callInfo.phone)}
            </AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold">
            {callInfo.tag || callInfo.phone}
          </p>
          {callInfo.inboxName && (
            <p className="text-xs text-muted-foreground">{callInfo.inboxName}</p>
          )}
          <CallTimer />
        </div>
      )}

      {callStatus === "idle" && (
        <Input
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder={t("phoneNumberPlaceholder")}
          className="text-center text-lg"
          onKeyDown={(e) => { if (e.key === "Enter") handleDial(); }}
        />
      )}

      {showKeypad && <Numpad onPress={handleKeypadPress} />}

      <CallControls
        onDial={handleDial}
        onHangup={handleHangup}
        onAccept={handleAccept}
        onReject={handleReject}
        onToggleKeypad={() => setShowKeypad(!showKeypad)}
      />
    </div>
  );
}
