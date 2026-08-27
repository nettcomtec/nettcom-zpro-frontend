"use client";

/**
 * WebphoneModal — modal do WebPhone SIP (AsteriskWebphone).
 * WaVoIP usa widget nativo do CDN, não este modal.
 */

import React, { useRef, useCallback, useEffect, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWebphoneStore } from "@/stores/webphone-store";
import { AsteriskWebphone } from "./asterisk-webphone";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslations } from "next-intl";
import { safeJsonParse } from "@/lib/safe-json-parse";

interface SipConfig {
  server: string;
  port: number;
  username: string;
  password: string;
  transport: "ws" | "wss" | "udp";
}

export function WebphoneModal() {
  const t = useTranslations("webphoneModal");
  const tCommon = useTranslations("common");
  const { isVisible, toggleVisibility, callStatus } = useWebphoneStore();
  const { user } = useAuthStore();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Tenta sipConfig do store; fallback: constrói a partir dos campos flat no localStorage (igual ao Vue)
  const sipConfig: SipConfig | null = (() => {
    if (user?.sipConfig) return user.sipConfig as SipConfig;
    try {
      const u = safeJsonParse(localStorage.getItem("usuario"), {} as Record<string, unknown>);
      if (u?.sipEnabled && u?.sipServer && u?.sipUsername && u?.sipPassword) {
        return {
          server: u.sipServer as string,
          port: (u.sipPort as number) ?? 5060,
          username: u.sipUsername as string,
          password: u.sipPassword as string,
          transport: ((u.sipTransport as string) ?? "wss") as "ws" | "wss" | "udp",
        };
      }
    } catch { /* ignore */ }
    return null;
  })();

  useEffect(() => {
    const saved = localStorage.getItem("webphone-position");
    if (saved) {
      try { setPosition(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const newPos = { x: position.x + info.offset.x, y: position.y + info.offset.y };
      setPosition(newPos);
      localStorage.setItem("webphone-position", JSON.stringify(newPos));
    },
    [position]
  );

  if (!isVisible || !sipConfig) return null;

  return (
    <div ref={constraintsRef} className="fixed inset-0 z-50 pointer-events-none">
      <motion.div
        drag
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        initial={{ x: position.x || window.innerWidth - 380, y: position.y || 80 }}
        className="pointer-events-auto absolute"
        style={{ x: position.x || window.innerWidth - 380, y: position.y || 80 }}
      >
        <Card
          role="dialog"
          aria-label={t("title")}
          className="w-[320px] shadow-2xl border-2"
        >
          <div className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-semibold">{t("title")}</span>
            </div>
            {callStatus === "idle" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => toggleVisibility(false)}
                aria-label={tCommon("close")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <AsteriskWebphone
            server={sipConfig.server}
            port={sipConfig.port}
            username={sipConfig.username}
            password={sipConfig.password}
            transport={sipConfig.transport}
          />
        </Card>
      </motion.div>
    </div>
  );
}
