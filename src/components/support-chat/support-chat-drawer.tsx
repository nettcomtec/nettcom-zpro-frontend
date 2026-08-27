"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Send, Headset, Paperclip, MonitorPlay, Mic, Square, X, FileText, ArrowDown, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { useSupportChatStore } from "@/stores/support-chat-store";
import {
  fetchSupportMessages,
  sendSupportMessage,
  markSupportMessagesRead,
  type SupportMessage,
} from "@/services/support-chat";
import { getInitials } from "@/lib/utils";
import { validateChatFile, formatMaxFileSize, namePastedFile, shouldDeferPasteToText } from "@/lib/chat-upload-validation";
import { format, isToday } from "date-fns";
import { toast } from "sonner";

// ── Media URL helper ───────────────────────────────────────────────────────
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
function getMediaUrl(msg: SupportMessage): string {
  if (!msg.mediaUrl) return "";
  if (msg.mediaUrl.startsWith("http://") || msg.mediaUrl.startsWith("https://")) return msg.mediaUrl;
  return `${backendUrl}/public/${msg.tenantId}/${msg.mediaUrl}`;
}

// ── Link preview helpers (same pattern as message-bubble) ──────────────────
interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  hostname?: string;
}
const LP_PREFIX = "lp_cache_";
const LP_TTL = 1000 * 60 * 60 * 24;
function lpReadCache(url: string): LinkPreviewData | null {
  try {
    const raw = localStorage.getItem(LP_PREFIX + url);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LinkPreviewData; ts: number };
    if (Date.now() - ts > LP_TTL) { localStorage.removeItem(LP_PREFIX + url); return null; }
    return data;
  } catch { return null; }
}
function lpWriteCache(url: string, data: LinkPreviewData) {
  try { localStorage.setItem(LP_PREFIX + url, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}
function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0] : null;
}
function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(() => lpReadCache(url));
  const [loading, setLoading] = useState(() => lpReadCache(url) === null);
  useEffect(() => {
    const cached = lpReadCache(url);
    if (cached) { setData(cached); setLoading(false); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => r.json())
        .then((d: LinkPreviewData) => { if (!cancelled) { lpWriteCache(url, d); setData(d); } })
        .catch(() => { if (!cancelled) setData(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [url]);
  if (loading) return (
    <div className="mt-1.5 rounded-lg border bg-muted/20 overflow-hidden max-w-[240px]">
      <div className="h-[60px] bg-muted/40 flex items-center justify-center">
        <svg className="h-4 w-4 animate-spin text-muted-foreground/50" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    </div>
  );
  if (!data || (!data.title && !data.image)) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="mt-1.5 block rounded-lg border bg-muted/20 overflow-hidden max-w-[240px] hover:bg-muted/30 transition-colors">
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image} alt="" className="w-full h-[100px] object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      <div className="p-2 space-y-0.5">
        {data.hostname && <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{data.hostname}</p>}
        {data.title && <p className="text-xs font-semibold line-clamp-2 leading-snug">{data.title}</p>}
        {data.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{data.description}</p>}
      </div>
    </a>
  );
}

// ── Message bubble content ─────────────────────────────────────────────────
function MessageContent({ msg, isMine }: { msg: SupportMessage; isMine: boolean }) {
  const firstUrl = msg.mediaType === "chat" || !msg.mediaType ? extractFirstUrl(msg.text) : null;
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

  const mediaUrl = getMediaUrl(msg);

  if (msg.mediaType === "image") {
    return (
      <div>
        <button onClick={() => mediaUrl && setLightbox(true)} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl || undefined} alt={msg.text ?? "imagem"}
            className="rounded-md max-w-[220px] max-h-[220px] object-cover cursor-pointer hover:opacity-90 transition-opacity" />
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
        <button onClick={() => setFileModal(true)} className={cn("flex items-center gap-1.5 text-sm underline underline-offset-2", isMine ? "text-primary-foreground" : "text-foreground")}>
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-[180px]">{msg.text}</span>
        </button>
        {fileModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setFileModal(false)}>
            <div className="bg-background rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <FileText className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm font-medium text-center break-all">{msg.text || "arquivo"}</p>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => mediaUrl && downloadFile(mediaUrl, msg.text || "arquivo")}><Download className="h-4 w-4" /> Download</button>
                <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => mediaUrl && window.open(mediaUrl, "_blank")}><FileText className="h-4 w-4" /> Abrir</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>
      {firstUrl && <LinkPreview url={firstUrl} />}
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────
interface SupportChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SupportChatDrawer({ open, onClose }: SupportChatDrawerProps) {
  const t = useTranslations("supportChat");
  const { messages, setMessages, addMessage, setUnreadCount } = useSupportChatStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const loadMessages = useCallback(async () => {
    try {
      const { data } = await fetchSupportMessages();
      setMessages(data.messages || []);
    } catch { /* silent */ }
  }, [setMessages]);

  useEffect(() => {
    if (!open) return;
    loadMessages();
    markSupportMessagesRead().catch(() => {});
    setUnreadCount(0);
  }, [open, loadMessages, setUnreadCount]);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [messages.length]);

  // ── Send text ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    // If there is a pasted file pending, send it
    if (pastedFile) {
      await handleSendFileData(pastedFile);
      setPastedFile(null);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const { data } = await sendSupportMessage({ text: trimmed });
      addMessage(data.message);
      setText("");
    } catch {
      toast.error(t("sendError"));
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

  // ── Send file helper ───────────────────────────────────────────────────
  const handleSendFileData = async (file: File) => {
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("medias", file);
      fd.append("text", file.name);
      fd.append("timestamp", String(Date.now()));
      const { data } = await sendSupportMessage(fd);
      addMessage(data.message);
    } catch {
      toast.error(t("sendFileError"));
    } finally {
      setSending(false);
    }
  };

  // ── File picker ────────────────────────────────────────────────────────
  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await handleSendFileData(files[i]);
    }
    e.target.value = "";
  };

  // ── Paste file → show in bar ───────────────────────────────────────────
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
    // Sem esta validacao o drawer aceitava ate .exe e so falhava no upload, com o
    // 415 CHAT_FILE_TYPE_NOT_ALLOWED do backend virando erro generico na tela.
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

  // ── Video call link ────────────────────────────────────────────────────
  const handleSendVideoLink = async () => {
    const id1 = Math.random().toString(36).substring(2, 10);
    const id2 = Math.random().toString(36).substring(2, 10);
    const link = `https://meet.jit.si/${id1}/${id2}`;
    setSending(true);
    try {
      const { data } = await sendSupportMessage({ text: link });
      addMessage(data.message);
    } catch {
      toast.error(t("sendError"));
    } finally {
      setSending(false);
    }
  };

  // ── Audio recording ────────────────────────────────────────────────────
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

  const canSend = !!pastedFile || !!text.trim();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col" aria-describedby={undefined}>
        <SheetHeader className="px-4 py-3 border-b flex flex-row items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Headset className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">{t("title")}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="relative flex-1 min-h-0">
        <ScrollArea className="h-full px-4 py-2">
          <div className="flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">{t("noMessages")}</p>
            )}
            {messages.map((msg) => {
              const isMine = !msg.fromSuperadmin;
              return (
                <div key={msg.id} className={cn("flex gap-2 max-w-[85%]",
                  isMine ? "ml-auto flex-row-reverse" : "mr-auto flex-row")}>
                  {!isMine && (
                    <Avatar className="h-7 w-7 shrink-0">
                      {msg.sender?.profilePicture && <AvatarImage src={msg.sender.profilePicture} alt={msg.sender.name} />}
                      <AvatarFallback className="text-[10px]">{getInitials(msg.sender?.name || "S")}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn("rounded-lg px-3 py-2 text-sm break-words",
                    isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    {!isMine && (
                      <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                        {msg.sender?.name || t("support")}
                      </p>
                    )}
                    <MessageContent msg={msg} isMine={isMine} />
                    <p className={cn("text-[9px] mt-1 opacity-60 text-right",
                      isMine ? "text-primary-foreground" : "text-foreground")}>
                      {isToday(new Date(msg.createdAt)) ? format(new Date(msg.createdAt), "HH:mm") : format(new Date(msg.createdAt), "dd/MM HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
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

        {/* Footer */}
        <div className={cn("px-3 py-2 border-t", isRecordingAudio && "bg-red-50 dark:bg-red-950/20")}>
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
              onClick={handleSendVideoLink} title={t("sendVideoLink")} disabled={isRecordingAudio || sending}>
              <MonitorPlay className="h-4 w-4" />
            </Button>

            {/* Text input */}
            <Textarea
              ref={inputRef}
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
                <Button size="icon" className="h-8 w-8 shrink-0 bg-green-600 hover:bg-green-700"
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
      </SheetContent>
    </Sheet>
  );
}

// ── Trigger button ─────────────────────────────────────────────────────────
interface SupportChatButtonProps {
  className?: string;
}

export function SupportChatButton({ className }: SupportChatButtonProps) {
  const t = useTranslations("supportChat");
  const [open, setOpen] = useState(false);
  const { unreadCount } = useSupportChatStore();

  return (
    <>
      <Button variant="ghost" size="icon" className={cn("relative h-9 w-9", className)}
        onClick={() => setOpen(true)} title={t("title")}>
        <Headset className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full px-1 text-[10px] pointer-events-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>
      <SupportChatDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
