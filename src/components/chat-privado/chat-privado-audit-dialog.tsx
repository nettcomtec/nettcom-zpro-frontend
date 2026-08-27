"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, getInitials } from "@/lib/utils";
import {
  Search, User, Users2, ArrowLeft, Loader2, MessageCircle, ShieldQuestion,
  FileText, CheckCheck, Check,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import type { PrivateMessage } from "@/stores/chat-store";
import {
  fetchAuditUsers, fetchAuditConversations, fetchAuditGroups, fetchAuditMessages,
  type AuditUser, type AuditConversation, type AuditGroup,
} from "@/services/private-chat";

type AuditTarget =
  | { type: "individual"; userA: number; userB: number; title: string; subtitle: string; subjectId: number }
  | { type: "team"; groupId: number; title: string; subtitle: string; subjectId: null };

function buildMediaUrl(mediaUrl: string) {
  if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) return mediaUrl;
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  if (mediaUrl.startsWith("/public/")) return `${base}${mediaUrl}`;
  return `${base}/public/${mediaUrl}`;
}

function sortAsc(msgs: PrivateMessage[]) {
  return [...msgs].sort((a, b) => {
    const ta = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const tb = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return ta - tb;
  });
}

export function ChatPrivadoAuditDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("chatPrivadoAudit");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;

  const [tab, setTab] = useState<"individual" | "team">("individual");
  const [search, setSearch] = useState("");

  const [loadingLists, setLoadingLists] = useState(false);
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [groups, setGroups] = useState<AuditGroup[]>([]);

  const [subject, setSubject] = useState<AuditUser | null>(null);
  const [partners, setPartners] = useState<AuditConversation[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);

  const [target, setTarget] = useState<AuditTarget | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const keepScrollRef = useRef(false);
  const forceBottomRef = useRef(false);

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setTab("individual");
      setSearch("");
      setSubject(null);
      setPartners([]);
      setTarget(null);
      setMessages([]);
      setPage(1);
      setHasMore(false);
    }
  }, [open]);

  // ── Load lists on open ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingLists(true);
    Promise.all([
      fetchAuditUsers().then((r) => r.data?.users ?? []).catch(() => []),
      fetchAuditGroups().then((r) => r.data?.groups ?? []).catch(() => []),
    ]).then(([u, g]) => {
      if (cancelled) return;
      setUsers((u as AuditUser[]).filter((x) => x.profile !== "superadmin"));
      setGroups(g as AuditGroup[]);
      setLoadingLists(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  // ── Load partners of a subject (individual) ──
  const selectSubject = useCallback((s: AuditUser) => {
    setSubject(s);
    setSearch("");
    setTarget(null);
    setMessages([]);
    setLoadingPartners(true);
    fetchAuditConversations(s.id)
      .then((r) => setPartners(r.data?.conversations ?? []))
      .catch(() => { setPartners([]); toast.error(t("loadError")); })
      .finally(() => setLoadingPartners(false));
  }, [t]);

  // ── Load a conversation thread ──
  const loadThread = useCallback(async (tgt: AuditTarget) => {
    setTarget(tgt);
    setMessages([]);
    setPage(1);
    setHasMore(false);
    setLoadingMsgs(true);
    keepScrollRef.current = false;
    forceBottomRef.current = true;
    isAtBottomRef.current = true;
    try {
      const { data } = await fetchAuditMessages(
        tgt.type === "team"
          ? { groupId: tgt.groupId, pageNumber: 1 }
          : { userA: tgt.userA, userB: tgt.userB, pageNumber: 1 }
      );
      const msgs = (data?.msgs ?? []) as PrivateMessage[];
      setMessages(sortAsc(msgs));
      setHasMore(!!data?.hasMore);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingMsgs(false);
    }
  }, [t]);

  const loadMore = useCallback(async () => {
    if (!target || loadingMore || !hasMore) return;
    setLoadingMore(true);
    prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
    keepScrollRef.current = true;
    const nextPage = page + 1;
    try {
      const { data } = await fetchAuditMessages(
        target.type === "team"
          ? { groupId: target.groupId, pageNumber: nextPage }
          : { userA: target.userA, userB: target.userB, pageNumber: nextPage }
      );
      const older = (data?.msgs ?? []) as PrivateMessage[];
      if (older.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...older.filter((m) => !seen.has(m.id)), ...prev];
          return sortAsc(merged);
        });
      }
      setHasMore(!!data?.hasMore);
      setPage(nextPage);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingMore(false);
    }
  }, [target, loadingMore, hasMore, page, t]);

  // ── Scroll management ──
  // - keepScrollRef: preserve position after prepending older messages (load more)
  // - forceBottomRef: jump to bottom right after opening a thread
  // - otherwise (live append): only follow if the supervisor is already at the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (keepScrollRef.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current;
      keepScrollRef.current = false;
    } else if (forceBottomRef.current || isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceBottomRef.current = false;
    }
  }, [messages.length, target]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // ── Live socket updates (mirror "espiar conversa") ──
  useEffect(() => {
    if (!open || !target || !tenantId) return;
    const socket = getSocket();

    const matches = (d: { senderId?: number; receiverId?: number; groupId?: number | null }) => {
      if (target.type === "team") return d.groupId != null && Number(d.groupId) === target.groupId;
      if (d.groupId != null) return false;
      return (
        (d.senderId === target.userA && d.receiverId === target.userB) ||
        (d.senderId === target.userB && d.receiverId === target.userA)
      );
    };

    const onCreate = (evt: { action: string; data: Record<string, unknown> }) => {
      if (evt.action !== "update") return;
      const d = evt.data as {
        id?: number; senderId?: number; receiverId?: number; groupId?: number | null;
        text?: string; mediaType?: string; mediaUrl?: string; mediaName?: string;
        timestamp?: number; sender?: { id: number; name: string }; receiver?: { id: number; name: string };
        quotedMsgId?: number | null; quotedMsg?: PrivateMessage | null;
      };
      if (!matches(d)) return;
      const newMsg: PrivateMessage = {
        id: d.id ?? Date.now(),
        text: d.text ?? "",
        senderId: d.senderId ?? 0,
        receiverId: d.receiverId,
        groupId: d.groupId ?? undefined,
        read: false,
        timestamp: d.timestamp ?? Date.now(),
        createdAt: new Date().toISOString(),
        mediaType: d.mediaType,
        mediaUrl: d.mediaUrl,
        mediaName: d.mediaName,
        sender: d.sender,
        receiver: d.receiver,
        quotedMsgId: d.quotedMsgId ?? null,
        quotedMsg: d.quotedMsg ?? null,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return sortAsc([...prev, newMsg]);
      });
    };

    const onDelete = (evt: { action: string; data: { id?: number } }) => {
      if (evt.data?.id == null) return;
      setMessages((prev) => prev.filter((m) => m.id !== evt.data.id));
    };

    const onUpdate = (evt: { action: string; data: { id?: number; text?: string } }) => {
      if (evt.data?.id == null) return;
      setMessages((prev) => prev.map((m) => (m.id === evt.data.id ? { ...m, text: evt.data.text ?? m.text } : m)));
    };

    const onReaction = (evt: { action: string; data: { id?: number; react?: string | null; reactFromMe?: string | null } }) => {
      if (evt.data?.id == null) return;
      setMessages((prev) => prev.map((m) => (m.id === evt.data.id ? { ...m, react: evt.data.react ?? null, reactFromMe: evt.data.reactFromMe ?? null } : m)));
    };

    socket.on(`${tenantId}:msg-private-msg`, onCreate);
    socket.on(`${tenantId}:msg-private-msg-delete`, onDelete);
    socket.on(`${tenantId}:msg-private-msg-update`, onUpdate);
    socket.on(`${tenantId}:msg-private-msg-reaction`, onReaction);
    return () => {
      socket.off(`${tenantId}:msg-private-msg`, onCreate);
      socket.off(`${tenantId}:msg-private-msg-delete`, onDelete);
      socket.off(`${tenantId}:msg-private-msg-update`, onUpdate);
      socket.off(`${tenantId}:msg-private-msg-reaction`, onReaction);
    };
  }, [open, target, tenantId]);

  // ── Helpers ──
  const formatTime = (msg: PrivateMessage) => {
    let ts = msg.timestamp || (msg.createdAt ? new Date(msg.createdAt).getTime() : 0);
    if (!ts) return "";
    if (typeof ts === "string") { const p = Number(ts); ts = isNaN(p) ? new Date(ts).getTime() : p; }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) return timeStr;
    const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${dateStr} ${timeStr}`;
  };

  const lastPreview = (text?: string | null, mediaType?: string | null) => {
    if (mediaType && mediaType !== "chat") {
      if (mediaType === "image") return "🖼";
      if (mediaType === "audio") return "🎤";
      if (mediaType === "video") return "🎬";
      return `📎 ${text || ""}`;
    }
    return text || "";
  };

  const renderMedia = (msg: PrivateMessage) => {
    if (!msg.mediaUrl || msg.mediaType === "chat") return null;
    const url = buildMediaUrl(msg.mediaUrl);
    if (msg.mediaType === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={msg.mediaName || "image"} className="max-w-[200px] rounded-lg" />
        </a>
      );
    }
    if (msg.mediaType === "audio" || /\.(mp3|ogg|wav)$/i.test(url)) {
      return <audio controls src={url} className="max-w-[200px] mb-1" />;
    }
    if (msg.mediaType === "video" || /\.(mp4|webm)$/i.test(url)) {
      return <video controls src={url} className="max-w-[200px] rounded-lg mb-1" />;
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs underline opacity-80 mb-1">
        <FileText className="h-3 w-3" /> {msg.mediaName || msg.mediaUrl}
      </a>
    );
  };

  // ── Filtered lists ──
  const sLower = search.toLowerCase();
  const filteredUsers = users.filter((u) => u.name.toLowerCase().includes(sLower));
  const filteredPartners = partners.filter((p) => p.name.toLowerCase().includes(sLower));
  const filteredGroups = groups.filter((g) => g.name.toLowerCase().includes(sLower));

  // ── Render thread bubbles ──
  const renderThread = () => {
    if (loadingMsgs) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">{t("loadingMessages")}</p>
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <MessageCircle className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-sm">{t("noMessages")}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {hasMore && (
          <div className="flex justify-center py-1">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="text-xs gap-1">
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {loadingMore ? t("loadingMore") : t("loadMore")}
            </Button>
          </div>
        )}
        {messages.map((msg, idx) => {
          const alignRight = target?.type === "individual" && msg.senderId === target.subjectId;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const msgDateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString("pt-BR") : "";
          const prevDateStr = prevMsg?.createdAt ? new Date(prevMsg.createdAt).toLocaleDateString("pt-BR") : "";
          const isNewDate = !prevMsg || msgDateStr !== prevDateStr;
          const senderName = msg.sender?.name || "";
          const senderPic = msg.sender?.profilePicture;
          return (
            <React.Fragment key={`${msg.id}-${idx}`}>
              {isNewDate && msgDateStr && (
                <div className="flex items-center gap-3 my-3 mx-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap px-2 bg-background">{msgDateStr}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className={cn("flex gap-1", alignRight ? "justify-end" : "justify-start")}>
                {!alignRight && (
                  <Avatar className="h-7 w-7 shrink-0 self-end mb-1">
                    {senderPic && <AvatarImage src={senderPic} alt={senderName} />}
                    <AvatarFallback className="text-[10px]">{getInitials(senderName || "U")}</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm relative",
                  alignRight ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                )}>
                  {senderName && (
                    <p className={cn("text-[10px] font-semibold mb-0.5", alignRight ? "text-primary-foreground/80" : "text-primary")}>
                      {senderName}
                    </p>
                  )}
                  {msg.quotedMsg && (
                    <div className={cn(
                      "mb-1 border-l-2 rounded-sm px-2 py-1 text-xs",
                      alignRight ? "bg-primary-foreground/10 border-primary-foreground/60" : "bg-foreground/5 border-primary/60"
                    )}>
                      <p className={cn("font-semibold truncate", alignRight ? "text-primary-foreground/90" : "text-primary")}>
                        {msg.quotedMsg.sender?.name || ""}
                      </p>
                      <p className={cn("truncate opacity-80", alignRight ? "text-primary-foreground" : "text-foreground")}>
                        {lastPreview(msg.quotedMsg.text, msg.quotedMsg.mediaType)}
                      </p>
                    </div>
                  )}
                  {renderMedia(msg)}
                  {msg.text && msg.mediaType === "chat" && (
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  )}
                  <div className={cn("flex items-center gap-1 mt-1 justify-end", alignRight ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    {(msg.react || msg.reactFromMe) && (
                      <span className="text-sm mr-1">
                        {msg.reactFromMe}{msg.react && msg.react !== msg.reactFromMe ? msg.react : ""}
                      </span>
                    )}
                    <span className="text-[10px]">{formatTime(msg)}</span>
                    {alignRight && (msg.read ? <CheckCheck className="h-3 w-3 text-blue-400" /> : <Check className="h-3 w-3" />)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* ── Left list column ── */}
          <div className="w-72 border-r flex flex-col shrink-0 min-h-0">
            <Tabs
              value={tab}
              onValueChange={(v) => { setTab(v as "individual" | "team"); setSearch(""); setSubject(null); setPartners([]); setTarget(null); setMessages([]); }}
              className="px-3 pt-3 shrink-0"
            >
              <TabsList className="w-full h-8">
                <TabsTrigger value="individual" className="flex-1 text-xs h-6 gap-1.5">
                  <User className="h-3.5 w-3.5" /> {t("tabIndividual")}
                </TabsTrigger>
                <TabsTrigger value="team" className="flex-1 text-xs h-6 gap-1.5">
                  <Users2 className="h-3.5 w-3.5" /> {t("tabTeam")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Drill-down header for individual */}
            {tab === "individual" && subject && (
              <button
                onClick={() => { setSubject(null); setPartners([]); setSearch(""); setTarget(null); setMessages([]); }}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50 border-b shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="truncate">{subject.name}</span>
              </button>
            )}

            <div className="p-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-2">
              {loadingLists ? (
                <div className="p-2 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : tab === "individual" ? (
                !subject ? (
                  // Level 0: pick an agent
                  filteredUsers.length === 0 ? (
                    <EmptyList icon={<User className="h-8 w-8 mb-2 opacity-40" />} label={t("noUsers")} />
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectSubject(u)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 text-left"
                      >
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={u.profilePicture} alt={u.name} />
                            <AvatarFallback className="text-xs">{getInitials(u.name)}</AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                            u.isOnline ? "bg-emerald-500" : "bg-muted-foreground/50"
                          )} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate capitalize">{u.profile}</p>
                        </div>
                      </button>
                    ))
                  )
                ) : (
                  // Level 1: pick a conversation partner of the agent
                  loadingPartners ? (
                    <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : filteredPartners.length === 0 ? (
                    <EmptyList icon={<MessageCircle className="h-8 w-8 mb-2 opacity-40" />} label={t("noConversations")} />
                  ) : (
                    filteredPartners.map((p) => {
                      const isActive = target?.type === "individual" && target.userB === p.id && target.userA === subject.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => loadThread({
                            type: "individual",
                            userA: subject.id,
                            userB: p.id,
                            subjectId: subject.id,
                            title: p.name,
                            subtitle: t("threadIndividual", { a: subject.name, b: p.name }),
                          })}
                          className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 text-left",
                            isActive && "bg-accent"
                          )}
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={p.profilePicture} alt={p.name} />
                            <AvatarFallback className="text-xs">{getInitials(p.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{lastPreview(p.lastText, p.lastMediaType)}</p>
                          </div>
                        </button>
                      );
                    })
                  )
                )
              ) : (
                // Team tab: pick a team
                filteredGroups.length === 0 ? (
                  <EmptyList icon={<Users2 className="h-8 w-8 mb-2 opacity-40" />} label={t("noTeams")} />
                ) : (
                  filteredGroups.map((g) => {
                    const isActive = target?.type === "team" && target.groupId === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => loadThread({
                          type: "team",
                          groupId: g.id,
                          subjectId: null,
                          title: g.name,
                          subtitle: t("threadTeam", { count: g.memberCount ?? 0 }),
                        })}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 text-left",
                          isActive && "bg-accent"
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={g.profilePicture} alt={g.name} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            <Users2 className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{g.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {g.lastText ? lastPreview(g.lastText, null) : t("teamMembersCount", { count: g.memberCount ?? 0 })}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )
              )}
            </div>
          </div>

          {/* ── Right thread column ── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {!target ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6 text-center">
                <ShieldQuestion className="h-14 w-14 mb-3 opacity-20" />
                <p className="text-sm font-medium">{t("emptyTitle")}</p>
                <p className="text-xs mt-1">{t("emptyDescription")}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {target.type === "team" ? <Users2 className="h-4 w-4" /> : getInitials(target.title)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate flex items-center gap-1.5">
                      {target.title}
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">{t("readOnly")}</Badge>
                    </h3>
                    <p className="text-[10px] text-muted-foreground truncate">{target.subtitle}</p>
                  </div>
                </div>
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex-1 min-h-0 overflow-y-auto p-4 bg-muted/20"
                >
                  {renderThread()}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyList({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      {icon}
      <p className="text-sm">{label}</p>
    </div>
  );
}
