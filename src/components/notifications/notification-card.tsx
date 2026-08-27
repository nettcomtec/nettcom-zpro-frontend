"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InternalNotification } from "@/services/internal-notifications";

export interface GroupedNotification {
  message: string;
  ids: number[];
  users: string[];
  readCount: number;
  totalCount: number;
  firstNotification: InternalNotification;
}

interface NotificationCardProps {
  notification: GroupedNotification;
  onEdit: (notification: GroupedNotification) => void;
  onDelete: (notification: GroupedNotification) => void;
}

const CARD_IFRAME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; overflow: hidden; margin: 0; padding: 0; }
  ul, ol { padding-left: 1.5em; margin: 0.25em 0; }
  li { margin: 0.1em 0; }
  p, h1, h2, h3, h4 { margin: 0.2em 0; }
`;

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function decodeMessage(message: string): { html: true; content: string } | { html: false; content: string } {
  if (message.startsWith("{{HTML_B64}}")) {
    try {
      const b64 = message.slice(12);
      const decoded = decodeURIComponent(escape(atob(b64)));
      return { html: true, content: decoded };
    } catch {
      return { html: false, content: message };
    }
  }
  return { html: false, content: message };
}

function NotificationPreview({ message }: { message: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const decoded = decodeMessage(message);
  const isDark = useDarkMode();

  const srcDoc = useMemo(() => {
    if (!decoded.html) return "";
    const bodyBg = isDark ? "#1c1c1e" : "#ffffff";
    const bodyColor = isDark ? "#e5e7eb" : "#111827";
    const css = `${CARD_IFRAME_CSS}body{background:${bodyBg};color:${bodyColor};}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${decoded.content}</body></html>`;
  }, [decoded.html, decoded.content, isDark]);

  useEffect(() => {
    if (!decoded.html || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const measure = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const h = doc?.body?.scrollHeight ?? 120;
      setHeight(Math.min(Math.max(h, 80), 300));
    };
    iframe.addEventListener("load", measure);
    setTimeout(measure, 80);
    return () => iframe.removeEventListener("load", measure);
  }, [decoded.html, decoded.content]);

  if (decoded.html) {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title="preview"
        sandbox="allow-same-origin"
        scrolling="no"
        className="w-full rounded border-0 pointer-events-none"
        style={{ height }}
      />
    );
  }

  return (
    <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
      {decoded.content}
    </p>
  );
}

export function NotificationCard({ notification, onEdit, onDelete }: NotificationCardProps) {
  const unread = notification.totalCount - notification.readCount;
  const displayUsers = notification.users.slice(0, 3);
  const remaining = notification.users.length - displayUsers.length;

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">{notification.totalCount} usuários</span>
          {unread > 0 && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              {unread} não lidas
            </Badge>
          )}
          {notification.firstNotification.source === "chatflow" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-500/15 text-violet-500">
              Chatbot
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(notification)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(notification)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="p-3 flex-1">
        <NotificationPreview message={notification.message} />
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t bg-muted/20 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground truncate">
          <Users className="h-3 w-3 inline mr-1" />
          {displayUsers.join(", ")}
          {remaining > 0 && ` +${remaining}`}
        </p>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {fmt(notification.firstNotification.createdAt)}
        </span>
      </div>
    </div>
  );
}
