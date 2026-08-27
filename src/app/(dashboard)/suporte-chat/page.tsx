"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Send, Headset, User2, MessageCircle, FileText, RefreshCw, ArrowDown, ArrowLeft, Paperclip, MonitorPlay, Mic, Square, X, ZoomIn, ZoomOut, RotateCcw, Download, AlertTriangle, Search, Reply, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHelp } from "@/components/layout/page-help";
import { toast } from "sonner";
import { format, isToday } from "date-fns";
import { useSupportChatStore } from "@/stores/support-chat-store";
import {
  fetchSupportUsers,
  fetchSupportMessagesAdmin,
  sendSupportMessageAdmin,
  markSupportMessagesReadAdmin,
  type SupportMessage,
} from "@/services/support-chat";
import { getInitials } from "@/lib/utils";
import { ProfilePicPreviewDialog, type ProfilePicPreview } from "@/components/shared/profile-pic-preview-dialog";
import { validateChatFile, formatMaxFileSize, namePastedFile, shouldDeferPasteToText } from "@/lib/chat-upload-validation";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

function getMediaUrl(msg: SupportMessage): string {
  if (!msg.mediaUrl) return "";
  if (msg.mediaUrl.startsWith("http://") || msg.mediaUrl.startsWith("https://")) return msg.mediaUrl;
  return `${backendUrl}/public/${msg.tenantId}/${msg.mediaUrl}`;
}

function AdminMsgContent({ msg, isMine }: { msg: SupportMessage; isMine: boolean }) {
  const mediaUrl = getMediaUrl(msg);
  const [lightbox, setLightbox] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fileModal, setFileModal] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const closeLightbox = () => { setLightbox(false); setScale(1); setOffset({ x: 0, y: 0 }); };
  const resetZoom = (e?: React.MouseEvent) => { e?.stopPropagation(); setScale(1); setOffset({ x: 0, y: 0 }); };

  React.useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); e.stopPropagation(); setScale((s) => Math.min(5, Math.max(1, s * (e.deltaY < 0 ? 1.1 : 0.9)))); };
  const handleMouseDown = (e: React.MouseEvent) => { if (scale <= 1) return; e.preventDefault(); dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }; };
  const handleMouseMove = (e: React.MouseEvent) => { if (!dragRef.current) return; setOffset({ x: dragRef.current.ox + e.clientX - dragRef.current.startX, y: dragRef.current.oy + e.clientY - dragRef.current.startY }); };
  const handleMouseUp = () => { dragRef.current = null; };
  const getTouchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const handleTouchStart = (e: React.TouchEvent) => { if (e.touches.length === 2) pinchRef.current = { dist: getTouchDist(e.touches), scale }; };
  const handleTouchMove = (e: React.TouchEvent) => { if (e.touches.length === 2 && pinchRef.current) { const ratio = getTouchDist(e.touches) / pinchRef.current.dist; setScale(Math.min(5, Math.max(1, pinchRef.current.scale * ratio))); } };
  const handleTouchEnd = () => { pinchRef.current = null; };

  const downloadFile = (url: string, name = "arquivo") => {
    const isExternal = url.startsWith("http://") || url.startsWith("https://")
    const opts: RequestInit = isExternal ? { credentials: "omit" } : { credentials: "include" }
    fetch(url, opts).then((r) => r.blob()).then((blob) => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }).catch(() => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); });
  };

  if (msg.mediaType === "image") {
    return (
      <div>
        <button onClick={() => mediaUrl && setLightbox(true)} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl || undefined}
            alt={msg.text ?? "imagem"}
            className="rounded-md max-w-[220px] max-h-[220px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
          />
        </button>
        {msg.text && msg.text !== (msg.mediaUrl ?? "") && (
          <p className="text-sm mt-1 break-words">{msg.text}</p>
        )}
        <Dialog open={lightbox} onOpenChange={(o) => { if (!o) closeLightbox(); }}>
          <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0 bg-black border-none [&>button]:text-white/80 [&>button]:hover:text-white [&>button]:bg-white/10">
            <DialogTitle className="sr-only">imagem</DialogTitle>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 pr-12">
              <div className="flex items-center gap-1">
                {scale > 1 && <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={resetZoom}><RotateCcw className="h-4 w-4" /></button>}
                <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(5, s + 0.5)); }}><ZoomIn className="h-4 w-4" /></button>
                <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={(e) => { e.stopPropagation(); setScale((s) => { const next = Math.max(1, s - 0.5); if (next === 1) setOffset({ x: 0, y: 0 }); return next; }); }}><ZoomOut className="h-4 w-4" /></button>
              </div>
              <button type="button" className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={() => downloadFile(mediaUrl, msg.text || "imagem.jpg")}><Download className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 relative" onClick={() => { if (scale <= 1) closeLightbox(); }}>
              {scale !== 1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 select-none pointer-events-none">{Math.round(scale * 100)}%</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl} alt="" className="object-contain select-none"
                style={{ maxHeight: scale === 1 ? "100%" : undefined, maxWidth: scale === 1 ? "100%" : undefined, transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`, cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default", transition: dragRef.current ? "none" : "transform 0.15s ease" }}
                onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); resetZoom(); }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} draggable={false} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (msg.mediaType === "audio") {
    return <audio controls src={mediaUrl || undefined} className="max-w-[220px] h-8" />;
  }

  if (msg.mediaType && msg.mediaType !== "chat") {
    return (
      <>
        <button
          onClick={() => setFileModal(true)}
          className={cn("flex items-center gap-1.5 text-sm underline underline-offset-2", isMine ? "text-primary-foreground" : "text-foreground")}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-[180px]">{msg.text}</span>
        </button>
        <Dialog open={fileModal} onOpenChange={setFileModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-medium text-center break-all pr-6">
                {msg.text || "arquivo"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => mediaUrl && downloadFile(mediaUrl, msg.text || "arquivo")}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
                <Button variant="outline" onClick={() => mediaUrl && window.open(mediaUrl, "_blank")}>
                  <FileText className="mr-2 h-4 w-4" /> Abrir
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>;
}

function quotedPreviewText(q: SupportMessage): string {
  if (q.mediaType === "image") return "🖼";
  if (q.mediaType === "audio") return "🎤";
  if (q.mediaType && q.mediaType !== "chat") return "📎 " + (q.text || "");
  return q.text || "";
}

function scrollToQuotedMessage(id: number) {
  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("msg-highlight");
  setTimeout(() => el.classList.remove("msg-highlight"), 1800);
}

function QuotedBlock({
  quoted,
  isMine,
  youLabel,
}: {
  quoted: SupportMessage;
  isMine: boolean;
  youLabel: string;
}) {
  const senderName = quoted.fromSuperadmin ? youLabel : quoted.sender?.name || "";
  return (
    <div
      onClick={(e) => { e.stopPropagation(); scrollToQuotedMessage(quoted.id); }}
      className={cn(
        "mb-1 border-l-2 rounded-sm px-2 py-1 text-xs cursor-pointer hover:opacity-90 transition-opacity",
        isMine ? "bg-primary-foreground/10 border-primary-foreground/60" : "bg-foreground/5 border-primary/60"
      )}
    >
      <p className={cn("font-semibold truncate", isMine ? "text-primary-foreground/90" : "text-primary")}>
        {senderName}
      </p>
      <p className={cn("truncate opacity-80", isMine ? "text-primary-foreground" : "text-foreground")}>
        {quotedPreviewText(quoted)}
      </p>
    </div>
  );
}

export default function SupporteChatPage() {
  const t = useTranslations("supportChatAdmin");
  const {
    supportUsers,
    setSupportUsers,
    activeConversation,
    setActiveConversation,
    adminMessages,
    setAdminMessages,
    addAdminMessage,
    updateUserUnread,
  } = useSupportChatStore();

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [filterValue, setFilterValue] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [adminMessages.length]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await fetchSupportUsers();
      setSupportUsers(data.users || []);
    } catch {
      toast.error(t("errorLoadingTenants"));
    } finally {
      setLoadingUsers(false);
    }
  }, [setSupportUsers, t]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadMessages = useCallback(
    async (tenantId: number, userId: number) => {
      setLoadingMessages(true);
      try {
        const { data } = await fetchSupportMessagesAdmin(tenantId, userId);
        setAdminMessages(data.messages || []);
        await markSupportMessagesReadAdmin(tenantId, userId);
        updateUserUnread(tenantId, userId, 0);
      } catch {
        toast.error(t("errorLoadingMessages"));
      } finally {
        setLoadingMessages(false);
      }
    },
    [setAdminMessages, updateUserUnread, t]
  );

  const handleSelectUser = (tenantId: number, userId: number) => {
    setActiveConversation({ tenantId, userId });
    loadMessages(tenantId, userId);
    setMobileView("chat");
    setReplyTo(null);
  };

  useEffect(() => {
    if (activeConversation) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [activeConversation, adminMessages.length]);

  const handleSendFileData = async (file: File) => {
    if (!activeConversation) return;
    const validationError = validateChatFile(file);
    if (validationError === "size") {
      toast.error(t("fileTooLarge", { name: file.name, max: formatMaxFileSize() }));
      return;
    }
    if (validationError === "type") {
      toast.error(t("fileTypeNotAllowed", { name: file.name }));
      return;
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("medias", file);
      fd.append("text", file.name);
      fd.append("timestamp", String(Date.now()));
      if (replyTo) fd.append("quotedMsgId", String(replyTo.id));
      const { data } = await sendSupportMessageAdmin(
        activeConversation.tenantId,
        activeConversation.userId,
        fd
      );
      addAdminMessage(data.message);
      setReplyTo(null);
    } catch {
      toast.error(t("errorSending"));
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await handleSendFileData(files[i]);
    }
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    // Excel/Word no Windows publicam CF_DIB junto com o texto e o Blink expoe esse
    // bitmap como item de arquivo (no macOS um `else if` evita isso, por isso o bug
    // nao reproduz em Mac). Sem este guard, colar um intervalo do Excel anexa um
    // print e engole o texto.
    if (shouldDeferPasteToText(Array.from(e.clipboardData?.types ?? []), pasted)) return;
    // Sincrono e antes de qualquer await: logo apos o dispatch o Blink faz
    // SetAccessPolicy(kNumb) e preventDefault/clipboardData viram no-op.
    e.preventDefault();
    const file = namePastedFile(pasted[0], Date.now());
    const validationError = validateChatFile(file);
    if (validationError === "size") {
      toast.error(t("fileTooLarge", { name: file.name, max: formatMaxFileSize() }));
      return;
    }
    if (validationError === "type") {
      toast.error(t("fileTypeNotAllowed", { name: file.name }));
      return;
    }
    setPastedFile(file);
  };

  const handleSendVideoLink = async () => {
    if (!activeConversation) return;
    const id1 = Math.random().toString(36).substring(2, 10);
    const id2 = Math.random().toString(36).substring(2, 10);
    const link = `https://meet.jit.si/${id1}/${id2}`;
    setSending(true);
    try {
      const { data } = await sendSupportMessageAdmin(
        activeConversation.tenantId,
        activeConversation.userId,
        { text: link, quotedMsgId: replyTo?.id ?? null }
      );
      addAdminMessage(data.message);
      setReplyTo(null);
    } catch {
      toast.error(t("errorSending"));
    } finally {
      setSending(false);
    }
  };

  const handleStartRecordingAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecordingAudio(true);
    } catch {
      toast.error(t("audioError"));
    }
  };

  const handleStopRecordingAudio = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      if (blob.size < 1000) { setIsRecordingAudio(false); return; }
      const filename = `${Date.now()}.mp3`;
      const audioFile = new File([blob], filename, { type: "audio/mp3" });
      await handleSendFileData(audioFile);
      mr.stream.getTracks().forEach((t) => t.stop());
      setIsRecordingAudio(false);
    };
    mr.stop();
  };

  const handleCancelRecordingAudio = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.onstop = () => { mr.stream.getTracks().forEach((t) => t.stop()); };
    mr.stop();
    setIsRecordingAudio(false);
  };

  const handleSend = async () => {
    if (pastedFile) {
      await handleSendFileData(pastedFile);
      setPastedFile(null);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || sending || !activeConversation) return;
    setSending(true);
    try {
      const { data } = await sendSupportMessageAdmin(
        activeConversation.tenantId,
        activeConversation.userId,
        { text: trimmed, quotedMsgId: replyTo?.id ?? null }
      );
      addAdminMessage(data.message);
      setText("");
      setReplyTo(null);
    } catch {
      toast.error(t("errorSending"));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !!pastedFile || !!text.trim();

  const activeUser = activeConversation
    ? supportUsers.find(
        (u) => u.tenantId === activeConversation.tenantId && u.userId === activeConversation.userId
      )
    : null;

  // Build filter options: unique tenants + users
  const filterOptions = useMemo(() => {
    const options: { value: string; label: string; group: string }[] = [
      { value: "all", label: t("filterAll"), group: "" },
    ];

    const tenantsSeen = new Set<number>();
    supportUsers.forEach((u) => {
      if (!tenantsSeen.has(u.tenantId)) {
        tenantsSeen.add(u.tenantId);
        options.push({
          value: `tenant:${u.tenantId}`,
          label: `${t("filterByTenant")}: ${u.tenantName}`,
          group: "tenant",
        });
      }
    });

    supportUsers.forEach((u) => {
      options.push({
        value: `user:${u.tenantId}:${u.userId}`,
        label: `${t("filterByUser")}: ${u.userName} (${u.tenantName})`,
        group: "user",
      });
    });

    return options;
  }, [supportUsers, t]);

  const filteredUsers = useMemo(() => {
    let list = supportUsers;
    if (filterValue !== "all") {
      if (filterValue.startsWith("tenant:")) {
        const tenantId = Number(filterValue.replace("tenant:", ""));
        list = supportUsers.filter((u) => u.tenantId === tenantId);
      } else if (filterValue.startsWith("user:")) {
        const [, tenantId, userId] = filterValue.split(":");
        list = supportUsers.filter(
          (u) => u.tenantId === Number(tenantId) && u.userId === Number(userId)
        );
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((u) => u.userName.toLowerCase().includes(q));
    }
    // Sort: unread first, then alphabetically
    return [...list].sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
      return a.userName.localeCompare(b.userName);
    });
  }, [supportUsers, filterValue, searchQuery]);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b bg-background flex items-center gap-3">
        <Headset className="h-5 w-5 text-muted-foreground" />
        <div className="flex items-center gap-1.5 flex-1">
          <div>
            <h1 className="text-lg font-semibold leading-none">{t("title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("description")}</p>
          </div>
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-1 gap-4 p-4 min-h-0 overflow-hidden">
        {/* User list */}
        <Card className={cn("w-full md:w-72 md:max-w-72 shrink-0 flex flex-col overflow-hidden", mobileView === "chat" ? "hidden md:flex" : "flex")}>
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <p className="text-sm font-medium flex-1">{t("users")}</p>
            <button
              onClick={loadUsers}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filter dropdown */}
          {supportUsers.length > 0 && (
            <div className="px-3 py-2 border-b">
              <Select value={filterValue} onValueChange={setFilterValue}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder={t("filterLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search by user name */}
          {supportUsers.length > 0 && (
            <div className="px-3 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-7 pl-6 text-xs"
                />
              </div>
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0">
            {loadingUsers ? (
              <div className="p-3 flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t("noUsers")}
              </div>
            ) : (
              <div className="p-2 flex flex-col gap-1 overflow-x-hidden w-full">
                {filteredUsers.map((su) => {
                  const isActive =
                    activeConversation?.tenantId === su.tenantId &&
                    activeConversation?.userId === su.userId;
                  return (
                    <button
                      key={`${su.tenantId}:${su.userId}`}
                      onClick={() => handleSelectUser(su.tenantId, su.userId)}
                      className={cn(
                        "w-full max-w-[272px] flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground overflow-hidden",
                        isActive && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Avatar
                        className={su.profilePicture ? "h-8 w-8 shrink-0 cursor-zoom-in" : "h-8 w-8 shrink-0"}
                        onClick={(e) => { if (su.profilePicture) { e.stopPropagation(); setProfilePicPreview({ url: su.profilePicture, name: su.userName }); } }}
                      >
                        {su.profilePicture && <AvatarImage src={su.profilePicture} alt={su.userName} />}
                        <AvatarFallback className="text-xs">
                          {getInitials(su.userName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{su.userName}</p>
                        <p className={cn("text-xs truncate", isActive ? "opacity-70" : "text-muted-foreground")}>{su.tenantName}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {su.supportChatEnabled !== "enabled" && (
                          <span title={t("supportDisabledBadgeTooltip")} className="flex items-center">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          </span>
                        )}
                        {su.unreadCount > 0 && (
                          <Badge className="h-5 min-w-[20px] rounded-full px-1 text-[10px]">
                            {su.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Chat panel */}
        <Card className={cn("flex-1 flex flex-col overflow-hidden min-h-0", mobileView === "list" ? "hidden md:flex" : "flex")}>
          {!activeConversation ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">{t("selectUser")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 px-4 py-3 border-b flex items-center gap-2">
                <button
                  className="md:hidden text-muted-foreground hover:text-foreground mr-1"
                  onClick={() => setMobileView("list")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <User2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{activeUser?.userName}</span>
                  <span className="text-xs text-muted-foreground ml-2">{activeUser?.tenantName}</span>
                </div>
                {activeUser?.supportChatEnabled !== "enabled" && (
                  <StatusChip tone="warning" withDot={false} className="gap-1 rounded-md shrink-0">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {t("supportDisabledWarning")}
                  </StatusChip>
                )}
              </div>

              <div className="relative flex-1 min-h-0">
              <ScrollArea className="h-full px-4 py-2">
                {loadingMessages ? (
                  <div className="flex flex-col gap-2 py-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn("h-10 w-2/3 rounded-lg", i % 2 === 0 ? "mr-auto" : "ml-auto")}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {adminMessages.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        {t("noMessages")}
                      </p>
                    )}
                    {adminMessages.map((msg, idx) => {
                      const isMine = msg.fromSuperadmin;
                      const senderPic = !isMine
                        ? (msg.sender?.profilePicture || supportUsers.find((u) => u.userId === msg.senderId)?.profilePicture || null)
                        : null;
                      const prevMsg = idx > 0 ? adminMessages[idx - 1] : null;
                      const msgDateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : "";
                      const prevMsgDateStr = prevMsg?.createdAt ? new Date(prevMsg.createdAt).toLocaleDateString() : "";
                      const isNewDate = !prevMsg || msgDateStr !== prevMsgDateStr;
                      return (
                        <React.Fragment key={`frag-${msg.id}`}>
                        {isNewDate && (
                          <div className="flex items-center gap-3 my-3 mx-2">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap px-2 bg-background">
                              {msgDateStr}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div
                          key={msg.id}
                          data-msg-id={msg.id}
                          onDoubleClick={() => setReplyTo(msg)}
                          className={cn(
                            "group flex gap-2 max-w-[75%] rounded-lg",
                            isMine ? "ml-auto flex-row-reverse" : "mr-auto flex-row"
                          )}
                        >
                          {!isMine && (
                            <Avatar className="h-7 w-7 shrink-0">
                              {senderPic && <AvatarImage src={senderPic} alt={msg.sender?.name || ""} />}
                              <AvatarFallback className="text-[10px]">
                                {getInitials(msg.sender?.name || "U")}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm break-words",
                              isMine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                            )}
                          >
                            {!isMine && (
                              <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                                {msg.sender?.name || t("user")}
                              </p>
                            )}
                            {msg.quotedMsg && (
                              <QuotedBlock quoted={msg.quotedMsg} isMine={isMine} youLabel={t("you")} />
                            )}
                            <AdminMsgContent msg={msg} isMine={isMine} />
                            <p
                              className={cn(
                                "text-[9px] mt-1 opacity-60 text-right",
                                isMine ? "text-primary-foreground" : "text-foreground"
                              )}
                            >
                              {isToday(new Date(msg.createdAt)) ? format(new Date(msg.createdAt), "HH:mm") : format(new Date(msg.createdAt), "dd/MM HH:mm")}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 self-center shrink-0">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side={isMine ? "left" : "right"}>
                              <DropdownMenuItem onClick={() => setReplyTo(msg)}>
                                <Reply className="mr-2 h-3 w-3" /> {t("reply")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </ScrollArea>
              {!isAtBottom && (
                <button
                  onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:opacity-90 transition-opacity"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              )}
              </div>

              <div className={cn("shrink-0 px-3 py-2 border-t", isRecordingAudio && "bg-destructive/10")}>
                {/* Reply preview */}
                {replyTo && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-accent/40 border-l-2 border-primary text-sm">
                    <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-primary truncate">
                        {t("replyingTo")} {replyTo.fromSuperadmin ? t("you") : (replyTo.sender?.name || t("user"))}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{quotedPreviewText(replyTo)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setReplyTo(null)} title={t("cancelReply")}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {/* Pasted file preview */}
                {pastedFile && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-muted text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs">{pastedFile.name}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setPastedFile(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {/* File picker */}
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => fileInputRef.current?.click()} title={t("attachFile")} disabled={isRecordingAudio}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleSendFile} />

                  {/* Video call link */}
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={handleSendVideoLink} title={t("sendVideoLink")} disabled={isRecordingAudio || sending || !activeConversation}>
                    <MonitorPlay className="h-4 w-4" />
                  </Button>

                  {/* Text input */}
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={pastedFile ? pastedFile.name : t("inputPlaceholder")}
                    className="flex-1 text-sm min-h-[32px] max-h-[120px] resize-none py-1.5"
                    rows={1}
                    disabled={sending || isRecordingAudio || !!pastedFile}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                  />

                  {/* Recording controls */}
                  {isRecordingAudio ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive"
                        onClick={handleCancelRecordingAudio} title={t("cancelRecording")}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-8 w-8 shrink-0 bg-success text-success-foreground hover:bg-success/90"
                        onClick={handleStopRecordingAudio} title={t("sendAudio")}>
                        <Square className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                        onClick={handleStartRecordingAudio} title={t("recordAudio")} disabled={sending}>
                        <Mic className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-8 w-8 shrink-0"
                        onClick={handleSend} disabled={!canSend || sending}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
      <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} />
    </div>
  );
}
