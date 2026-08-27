"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import { formatTime as formatTimeIntl, formatDate as formatDateIntl } from "@/lib/format";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Send, MessageCircle, Check, CheckCheck, Paperclip,
  Smile, Trash2, MoreHorizontal, Users2, User, Pencil,
  X, Phone, Video, Mic,
  Image as ImageIcon, Camera, Loader2, MonitorPlay, Square, Forward, ArrowDown,
  ZoomIn, ZoomOut, RotateCcw, Download, FileText, Reply, ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { cn, getInitials } from "@/lib/utils";
import { linkifyParts } from "@/lib/linkify";
import { ProfilePicPreviewDialog, type ProfilePicPreview } from "@/components/shared/profile-pic-preview-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { useChatStore, type PrivateMessage, type ChatUser, type ChatGroup } from "@/stores/chat-store";
import {
  fetchPrivateMessages, sendPrivateMessage, markAsRead,
  deletePrivateMessage, editPrivateMessage, addReaction,
  fetchOnlineUsers, fetchPrivateGroups, fetchUnreadCounts, fetchUnreadGroupCounts,
  fetchGroupMembers,
} from "@/services/private-chat";
import { uploadGroupProfilePicture } from "@/services/teams";
import { usePrivateCallStore } from "@/stores/private-call-store";
import { usePrivateCallActions } from "@/components/private-call/private-call-provider";
import { validateChatFile, formatMaxFileSize, namePastedFile, shouldDeferPasteToText } from "@/lib/chat-upload-validation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { ChatPrivadoAuditDialog } from "@/components/chat-privado/chat-privado-audit-dialog";
import { EMOJI_CATEGORIES } from "@/lib/emoji-data";

const EMOJI_LIST = ["😀","😂","😍","👍","👎","🙏","🎉","❤️","🔥","😎","😢","😡","🤔","👋","✅","❌"];

// ────────────────────────────────────────────────────
// Link Preview
// ────────────────────────────────────────────────────
function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/);
  return match ? match[0] : null;
}

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  hostname?: string;
}

const LP_CACHE_PREFIX = "lp_cache_";
const LP_CACHE_TTL = 1000 * 60 * 60 * 24;

function lpReadCache(url: string): LinkPreviewData | null {
  try {
    const raw = localStorage.getItem(LP_CACHE_PREFIX + url);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: LinkPreviewData; ts: number };
    if (Date.now() - ts > LP_CACHE_TTL) { localStorage.removeItem(LP_CACHE_PREFIX + url); return null; }
    return data;
  } catch { return null; }
}

function lpWriteCache(url: string, data: LinkPreviewData) {
  try { localStorage.setItem(LP_CACHE_PREFIX + url, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
}

function PrivateLinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(() => lpReadCache(url));
  const [loading, setLoading] = useState(() => lpReadCache(url) === null);

  useEffect(() => {
    const cached = lpReadCache(url);
    if (cached) { setData(cached); setLoading(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((r) => r.json())
        .then((d: LinkPreviewData) => { if (!cancelled) { lpWriteCache(url, d); setData(d); } })
        .catch(() => { if (!cancelled) setData(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border bg-muted/20 overflow-hidden max-w-[260px]">
        <div className="h-[60px] bg-muted/40 flex items-center justify-center">
          <svg className="h-4 w-4 animate-spin text-muted-foreground/50" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
        <div className="p-2 space-y-1.5">
          <div className="h-2 bg-muted rounded animate-pulse w-1/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
        </div>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="mt-2 block rounded-lg border bg-muted/20 overflow-hidden max-w-[260px] hover:bg-muted/30 transition-colors">
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image} alt="" className="w-full h-[120px] object-cover"
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

interface SelectedContact {
  id: number;
  name: string;
  email?: string;
  status?: string;
  isOnline?: boolean;
  isGroup?: boolean;
  profilePicture?: string;
}

const chatPrivadoDownloading = new Set<string>();

export default function ChatPrivadoPage() {
  const t = useTranslations("chatPrivadoPage");
  const tAudit = useTranslations("chatPrivadoAudit");
  const tCommon = useTranslations("common");
  const tChat = useTranslations("chatPrivado");
  const tBubble = useTranslations("messageBubble");
  const allowed = usePageAccess("chat-privado");
  if (!allowed) return <AccessDenied />;
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  if (user?.profile === "superadmin") return null;

  const {
    messages, setMessages, addMessage, removeMessage, updateMessage,
    users, setUsers, groups, setGroups, setUnreadCount,
    mentionGroupIds, clearMentionGroup, setActiveConversation,
    socketUnreadByUser, clearSocketUnread,
  } = useChatStore();

  const [loading, setLoading] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  // Auditoria (espiar) do chat privado: admin/supervisor sempre; perfil custom
  // apenas com a permissao private_chat_audit (hasPermission so checa custom).
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAudit =
    user?.profile === "admin" ||
    user?.profile === "super" ||
    (user?.profile === "custom" && hasPermission("private_chat_audit"));
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  const [forwardMsg, setForwardMsg] = useState<PrivateMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "groups">("users");
  const [selectedContact, setSelectedContact] = useState<SelectedContact | null>(null);
  const [text, setText] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<number, number>>({});
  const [unreadGroupMap, setUnreadGroupMap] = useState<Record<number, number>>({});
  const [editingMsg, setEditingMsg] = useState<PrivateMessage | null>(null);
  const [replyTo, setReplyTo] = useState<PrivateMessage | null>(null);
  const [reactingMsg, setReactingMsg] = useState<PrivateMessage | null>(null);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [membersPopoverOpen, setMembersPopoverOpen] = useState(false);
  const [uploadingGroupPhoto, setUploadingGroupPhoto] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAtIndex, setMentionAtIndex] = useState(0);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  // ── Lightbox (imagem) e modal de arquivo ──
  const [lightboxUrl, setLightboxUrl] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [lightboxOffset, setLightboxOffset] = useState({ x: 0, y: 0 });
  const lightboxDragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const lightboxPinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const [fileModal, setFileModal] = useState<{ url: string; name: string } | null>(null);

  const closeLightbox = () => { setLightboxOpen(false); setLightboxScale(1); setLightboxOffset({ x: 0, y: 0 }); };
  const resetLightboxZoom = (e?: React.MouseEvent) => { e?.stopPropagation(); setLightboxScale(1); setLightboxOffset({ x: 0, y: 0 }); };

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadFile = (url: string, name = "arquivo") => {
    if (chatPrivadoDownloading.has(url)) return;
    chatPrivadoDownloading.add(url);
    const toastId = toast.loading(tCommon("downloadLoading"));
    const isExternal = url.startsWith("http://") || url.startsWith("https://");
    const opts: RequestInit = isExternal ? { credentials: "omit" } : { credentials: "include" };
    fetch(url, opts)
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.success(tCommon("downloadSuccess"), { id: toastId });
      })
      .catch(() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        toast.success(tCommon("downloadSuccess"), { id: toastId });
      })
      .finally(() => {
        chatPrivadoDownloading.delete(url);
      });
  };

  // ── Scroll refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevConvKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const deepLinkHandled = useRef(false);

  // ── Pagination ──
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  // ── Private call (provider global) ──
  const callBusy = usePrivateCallStore((s) => s.state) !== "idle";
  const { startCall: startPrivateCall } = usePrivateCallActions();

  // ── Group members cache ──
  const [groupMembersMap, setGroupMembersMap] = useState<Record<number, ChatUser[]>>({});

  // ── Pending paste files ──
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // ── Audio recording state ──
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ─────────────────────────────────────
  // Scroll to bottom helper
  // ─────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    return () => { setActiveConversation(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoadingMoreRef.current) {
      // Restore scroll position after prepending older messages
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevScrollHeightRef.current;
        }
        isLoadingMoreRef.current = false;
      });
    } else {
      // Auto-scroll com gate "perto do fundo": rola apenas ao trocar de conversa,
      // ao enviar mensagem propria ou quando o usuario ja esta no fim da lista.
      // Evita puxar a tela de quem esta lendo o historico (botao ArrowDown cobre o resto).
      const convKey = selectedContact ? `${selectedContact.isGroup ? "g" : "u"}:${selectedContact.id}` : null;
      const convChanged = prevConvKeyRef.current !== convKey;
      prevConvKeyRef.current = convKey;
      const lastMsg = messages[messages.length - 1];
      const lastIsMine = !!lastMsg && lastMsg.senderId === user?.userId;
      if (convChanged || lastIsMine || isAtBottom) scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, selectedContact?.id]);

  // ─────────────────────────────────────
  // Load users & groups on mount
  // ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const usersRes = await fetchOnlineUsers();
        const rawList = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || [];
        const userList = rawList.filter((u: { profile?: string }) => u.profile !== "superadmin");
        setUsers(userList);
        const userCountMap: Record<number, number> = {};
        userList.forEach((u: { id?: number; count?: number }) => {
          if (u.id != null) userCountMap[u.id] = Number(u.count) || 0;
        });
        setUnreadMap(userCountMap);

        if (user?.userId) {
          try {
            const groupsRes = await fetchPrivateGroups(user.userId);
            const groupList = Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.groups || [];
            setGroups(groupList);
            const groupCountMap: Record<number, number> = {};
            groupList.forEach((g: { id?: number; groupId?: number; count?: number }) => {
              const key = g.id ?? g.groupId;
              if (key != null) groupCountMap[key] = Number(g.count) || 0;
            });
            setUnreadGroupMap(groupCountMap);
          } catch { setGroups([]); }
        }
      } catch {
        toast.error(t("loadUsersError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [setUsers, setGroups, user?.userId]);

  // ─────────────────────────────────────
  // Load messages
  // ─────────────────────────────────────
  const loadMessages = useCallback(async (contactId: number, isGroup: boolean) => {
    try {
      isLoadingMoreRef.current = false;
      setHasMoreMessages(false);
      setCurrentPage(1);
      const { data } = await fetchPrivateMessages(contactId, isGroup, 1);
      const msgs = Array.isArray(data) ? data : data?.msgs || data?.messages || [];
      setMessages(msgs);
      setHasMoreMessages(!!(data as { hasMore?: boolean })?.hasMore);
      scrollToBottom();
      await markAsRead(contactId, isGroup);
      if (isGroup) setUnreadGroupMap((prev) => ({ ...prev, [contactId]: 0 }));
      else setUnreadMap((prev) => ({ ...prev, [contactId]: 0 }));
      clearSocketUnread(contactId);

      const [privateRes, groupRes] = await Promise.all([
        fetchUnreadCounts(),
        fetchUnreadGroupCounts().catch(() => ({ data: { count: 0 } })),
      ]);
      const privateCount = Number((privateRes.data as { count?: number })?.count) || 0;
      const g = groupRes.data as { count?: number | { count?: number } };
      const groupCount = Number(g?.count && typeof g.count === "object" ? g.count?.count : g?.count) || 0;
      setUnreadCount(privateCount + groupCount);
    } catch {
      toast.error(t("loadMessagesError"));
    }
  }, [setMessages, setUnreadCount, scrollToBottom, clearSocketUnread]);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedContact || loadingMore || !hasMoreMessages) return;
    try {
      setLoadingMore(true);
      prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
      isLoadingMoreRef.current = true;
      const nextPage = currentPage + 1;
      const { data } = await fetchPrivateMessages(selectedContact.id, !!selectedContact.isGroup, nextPage);
      const olderMsgs = Array.isArray(data) ? data : data?.msgs || data?.messages || [];
      if (olderMsgs.length > 0) {
        setMessages([...olderMsgs, ...useChatStore.getState().messages]);
      }
      setHasMoreMessages(!!(data as { hasMore?: boolean })?.hasMore);
      setCurrentPage(nextPage);
    } catch {
      toast.error(t("loadMessagesError"));
      isLoadingMoreRef.current = false;
    } finally {
      setLoadingMore(false);
    }
  }, [selectedContact, loadingMore, hasMoreMessages, currentPage, setMessages]);

  // ─────────────────────────────────────
  // Deep-link via searchParams
  // ─────────────────────────────────────
  const contactIdParam = searchParams.get("contactId");
  const groupIdParam = searchParams.get("groupId");

  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    const cId = contactIdParam ? Number(contactIdParam) : null;
    const gId = groupIdParam ? Number(groupIdParam) : null;
    if (cId && !Number.isNaN(cId)) {
      const u = (users as ChatUser[]).find((x) => x.id === cId || (x as { userId?: number }).userId === cId);
      if (u) {
        deepLinkHandled.current = true;
        setTab("users");
        const contact: SelectedContact = { id: (u as { id?: number }).id ?? (u as unknown as { userId: number }).userId, name: u.name, email: u.email, status: u.status, isOnline: u.isOnline, isGroup: false, profilePicture: (u as { profilePicture?: string }).profilePicture };
        setSelectedContact(contact); setEditingMsg(null); setText(""); loadMessages(contact.id, false);
      }
    } else if (gId && !Number.isNaN(gId)) {
      const g = (groups as ChatGroup[]).find((x) => x.id === gId || (x as { groupId?: number }).groupId === gId);
      if (g) {
        deepLinkHandled.current = true;
        setTab("groups");
        const id = (g as { id?: number }).id ?? (g as unknown as { groupId: number }).groupId;
        const contact: SelectedContact = { id, name: g.name, isGroup: true, profilePicture: g.profilePicture };
        setSelectedContact(contact); setEditingMsg(null); setText(""); loadMessages(id, true);
      }
    }
  }, [loading, contactIdParam, groupIdParam, users, groups, loadMessages]);

  // ESC closes the active conversation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedContact && !forwardMsg && !profilePicPreview) {
        setSelectedContact(null);
        setEditingMsg(null);
        setText("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedContact, forwardMsg, profilePicPreview]);

  // ─────────────────────────────────────
  // Group photo upload
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

  const handleGroupPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact?.isGroup) return;
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error(t("errorPhotoTooLarge"));
      if (groupPhotoInputRef.current) groupPhotoInputRef.current.value = "";
      return;
    }
    setUploadingGroupPhoto(true);
    try {
      const { data } = await uploadGroupProfilePicture(selectedContact.id, file);
      setSelectedContact((prev) => prev ? { ...prev, profilePicture: data.profilePicture } : prev);
      setGroups(groups.map((g) => g.id === selectedContact.id ? { ...g, profilePicture: data.profilePicture } : g));
      toast.success(t("groupPhotoUpdated"));
    } catch {
      toast.error(t("errorUpdateGroupPhoto"));
    } finally {
      setUploadingGroupPhoto(false);
      if (groupPhotoInputRef.current) groupPhotoInputRef.current.value = "";
    }
  };

  // Message actions
  // ─────────────────────────────────────
  const handleSelectContact = (contact: SelectedContact) => {
    setSelectedContact(contact);
    setEditingMsg(null);
    setReplyTo(null);
    setText("");
    setPendingFiles([]);
    setMentionQuery(null);
    setActiveConversation({ id: contact.id, isGroup: !!contact.isGroup });
    if (contact.isGroup) {
      clearMentionGroup(contact.id);
      if (!groupMembersMap[contact.id]) {
        fetchGroupMembers(contact.id)
          .then(({ data }) => {
            // API returns array of UsersPrivateGroups with nested user
            const members: ChatUser[] = (Array.isArray(data) ? data : [])
              .map((r: { user?: { id: number; name: string; email?: string; profilePicture?: string } }) => r.user)
              .filter((u): u is ChatUser => !!u);
            setGroupMembersMap((prev) => ({ ...prev, [contact.id]: members }));
          })
          .catch(() => {});
      }
    }
    loadMessages(contact.id, !!contact.isGroup);
  };

  const handleSend = async () => {
    if (!selectedContact) return;
    if (!text.trim() && pendingFiles.length === 0) return;

    if (editingMsg) {
      try {
        await editPrivateMessage(editingMsg.id, text.trim());
        updateMessage(editingMsg.id, { text: text.trim() });
        setEditingMsg(null);
        setText("");
      } catch {
        toast.error(t("editMessageError"));
      }
      return;
    }

    const quotedMsgId = replyTo?.id ?? null;

    if (text.trim()) {
      const body = text.trim();
      try {
        const payload = {
          text: body,
          receiverId: selectedContact.id,
          timestamp: Date.now(),
          isGroup: !!selectedContact.isGroup,
          quotedMsgId,
        };
        setText("");
        const { data } = await sendPrivateMessage(payload);
        const msg = data?.mensagem || data;
        if (msg) addMessage(msg);
      } catch {
        toast.error(t("sendMessageError"));
        // Falha no envio: devolve o texto ao campo para nao perder o que foi digitado
        setText((cur) => (cur ? cur : body));
      }
    }

    if (pendingFiles.length > 0) {
      const filesToSend = [...pendingFiles];
      setPendingFiles([]);
      for (const file of filesToSend) {
        try {
          const fd = new FormData();
          fd.append("medias", file);
          fd.append("text", file.name || `arquivo_${Date.now()}`);
          fd.append("receiverId", String(selectedContact.id));
          fd.append("timestamp", String(Date.now()));
          fd.append("isGroup", String(!!selectedContact.isGroup));
          if (quotedMsgId) fd.append("quotedMsgId", String(quotedMsgId));
          const { data } = await sendPrivateMessage(fd);
          const msg = data?.mensagem || data;
          if (msg) addMessage(msg);
        } catch {
          toast.error(t("sendFileError", { name: file.name }));
        }
      }
    }

    if (quotedMsgId) setReplyTo(null);
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedContact) return;

    const quotedMsgId = replyTo?.id ?? null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validationError = validateChatFile(file);
      if (validationError === "size") {
        toast.error(t("fileTooLarge", { name: file.name, max: formatMaxFileSize() }));
        continue;
      }
      if (validationError === "type") {
        toast.error(t("fileTypeNotAllowed", { name: file.name }));
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("medias", file);
        fd.append("text", file.name);
        fd.append("receiverId", String(selectedContact.id));
        fd.append("timestamp", String(Date.now()));
        fd.append("isGroup", String(!!selectedContact.isGroup));
        if (quotedMsgId) fd.append("quotedMsgId", String(quotedMsgId));
        const { data } = await sendPrivateMessage(fd);
        const msg = data?.mensagem || data;
        if (msg) addMessage(msg);
      } catch {
        toast.error(t("sendFileError", { name: file.name }));
      }
    }
    e.target.value = "";
    if (quotedMsgId) setReplyTo(null);
  };

  const handleDelete = async (msgId: number) => {
    try {
      await deletePrivateMessage(msgId);
      removeMessage(msgId);
    } catch {
      toast.error(t("deleteMessageError"));
    }
  };

  const handleStartEdit = (msg: PrivateMessage) => {
    setEditingMsg(msg);
    setText(msg.text);
    inputRef.current?.focus();
  };

  const handleForward = async (receiverId: number) => {
    if (!forwardMsg || !user) return;
    setForwarding(true);
    try {
      const now = Date.now();
      let result: { data: unknown } | null = null;
      if (forwardMsg.mediaType === "chat" || !forwardMsg.mediaType) {
        result = await sendPrivateMessage({ text: forwardMsg.text, receiverId, timestamp: now, isGroup: false });
      } else {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const parsed = token ? JSON.parse(token) : null;
        const res = await fetch(forwardMsg.mediaUrl!, {
          headers: parsed ? { Authorization: `Bearer ${parsed}` } : {},
        });
        if (!res.ok) throw new Error("download failed");
        const blob = await res.blob();
        const file = new File([blob], forwardMsg.mediaName || forwardMsg.text || "arquivo", { type: blob.type });
        const fd = new FormData();
        fd.append("medias", file);
        fd.append("text", forwardMsg.mediaName || forwardMsg.text || "");
        fd.append("read", "false");
        fd.append("isGroup", "false");
        fd.append("receiverId", String(receiverId));
        fd.append("timestamp", String(now));
        result = await sendPrivateMessage(fd);
      }

      // Update the sidebar last message for the target user immediately
      const lastText = forwardMsg.mediaType && forwardMsg.mediaType !== "chat"
        ? (forwardMsg.mediaName || forwardMsg.text || "📎")
        : forwardMsg.text;
      setUsers(
        (users as ChatUser[]).map((u) =>
          u.id === receiverId ? { ...u, text: lastText, timestamp: now, senderId: user.userId } : u
        )
      );

      // If this conversation is currently open, also add the message
      const msg = (result?.data as { mensagem?: unknown })?.mensagem || result?.data;
      if (msg && selectedContact?.id === receiverId && !selectedContact.isGroup) {
        addMessage(msg as PrivateMessage);
      }

      toast.success(t("messageForwarded"));
      setForwardMsg(null);
      setForwardSearch("");
    } catch {
      toast.error(t("forwardError"));
    } finally {
      setForwarding(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMsg(null);
    setText("");
  };

  const handleSendVideoLink = async () => {
    if (!selectedContact) return;
    const id1 = Math.random().toString(36).substring(2, 10);
    const id2 = Math.random().toString(36).substring(2, 10);
    const link = `https://meet.jit.si/${id1}/${id2}`;
    try {
      const payload = {
        text: link,
        receiverId: selectedContact.id,
        timestamp: Date.now(),
        isGroup: !!selectedContact.isGroup,
        quotedMsgId: replyTo?.id ?? null,
      };
      const { data } = await sendPrivateMessage(payload);
      const msg = data?.mensagem || data;
      if (msg) addMessage(msg);
      setReplyTo(null);
    } catch {
      toast.error(t("sendMessageError"));
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
      toast.error(t("audioRecordingError"));
    }
  };

  const handleStopRecordingAudio = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || !selectedContact) return;
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      if (blob.size < 1000) { setIsRecordingAudio(false); return; }
      const filename = `${Date.now()}.mp3`;
      const audioFile = new File([blob], filename, { type: "audio/mp3" });
      const quotedMsgId = replyTo?.id ?? null;
      const fd = new FormData();
      fd.append("medias", audioFile);
      fd.append("text", filename);
      fd.append("receiverId", String(selectedContact.id));
      fd.append("timestamp", String(Date.now()));
      fd.append("isGroup", String(!!selectedContact.isGroup));
      if (quotedMsgId) fd.append("quotedMsgId", String(quotedMsgId));
      try {
        const { data } = await sendPrivateMessage(fd);
        const msg = data?.mensagem || data;
        if (msg) addMessage(msg);
        if (quotedMsgId) setReplyTo(null);
      } catch {
        toast.error(t("sendFileError", { name: filename }));
      }
      mr.stream.getTracks().forEach((track) => track.stop());
      setIsRecordingAudio(false);
    };
    mr.stop();
  };

  const handleCancelRecordingAudio = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.onstop = () => { mr.stream.getTracks().forEach((track) => track.stop()); };
    mr.stop();
    setIsRecordingAudio(false);
  };

  const handlePasteFile = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    // Excel/Word no Windows publicam CF_DIB junto com o texto e o Blink expoe esse
    // bitmap como item de arquivo (no macOS um `else if` evita isso, por isso o bug
    // nao reproduz em Mac). Sem este guard, colar um intervalo do Excel anexa um
    // print e engole o texto.
    if (shouldDeferPasteToText(Array.from(e.clipboardData?.types ?? []), pasted)) return;
    // Sincrono e antes de qualquer await: logo apos o dispatch o Blink faz
    // SetAccessPolicy(kNumb) e preventDefault/clipboardData viram no-op.
    e.preventDefault();
    const now = Date.now();
    const validFiles: File[] = [];
    for (const file of pasted.map((f) => namePastedFile(f, now))) {
      const validationError = validateChatFile(file);
      if (validationError === "size") {
        toast.error(t("fileTooLarge", { name: file.name, max: formatMaxFileSize() }));
        continue;
      }
      if (validationError === "type") {
        toast.error(t("fileTypeNotAllowed", { name: file.name }));
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleReaction = async (msg: PrivateMessage, emoji: string) => {
    try {
      await addReaction(msg.id, emoji);
      const isMe = msg.senderId === user?.userId;
      updateMessage(msg.id, isMe ? { reactFromMe: emoji } : { react: emoji });
    } catch {
      toast.error(t("reactionError"));
    }
  };

  // ─────────────────────────────────────
  // Mention helpers
  // ─────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (!selectedContact?.isGroup) {
      setMentionQuery(null);
      return;
    }

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const atIndex = textBefore.lastIndexOf("@");

    if (atIndex !== -1) {
      const charBeforeAt = textBefore[atIndex - 1];
      if (atIndex === 0 || charBeforeAt === " ") {
        const query = textBefore.slice(atIndex + 1);
        if (!query.includes(" ")) {
          setMentionQuery(query);
          setMentionAtIndex(atIndex);
          setMentionSelectedIndex(0);
          return;
        }
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (u: ChatUser) => {
    const before = text.slice(0, mentionAtIndex);
    const after = text.slice(mentionAtIndex + 1 + (mentionQuery?.length ?? 0));
    setText(`${before}@${u.name} ${after}`);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // URLs/e-mails viram links clicaveis. O card de preview so aparece quando o
  // /api/link-preview devolve titulo ou imagem — links internos (ERP, boleto,
  // painel) nao geram preview e ficariam sem nenhuma forma de abrir.
  const renderLinkified = (rawText: string, isMe: boolean, keyPrefix: string): React.ReactNode[] =>
    linkifyParts(rawText).map((part, i) =>
      part.type === "text" ? (
        <React.Fragment key={`${keyPrefix}-t${i}`}>{part.value}</React.Fragment>
      ) : (
        <a
          key={`${keyPrefix}-l${i}`}
          href={part.href}
          target={part.href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn("underline hover:opacity-80", isMe ? "text-primary-foreground" : "text-blue-600 dark:text-blue-400")}
        >
          {part.value}
        </a>
      )
    );

  const renderTextWithMentions = (rawText: string, isMe = false) => {
    const allUsers = users as ChatUser[];
    if (!rawText.includes("@") || allUsers.length === 0) {
      return <>{renderLinkified(rawText, isMe, "p")}</>;
    }
    const sorted = [...allUsers].sort((a, b) => b.name.length - a.name.length);
    const escaped = sorted.map((u) => u.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`@(${escaped.join("|")})`, "g");
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
      if (match.index > lastIndex) parts.push(...renderLinkified(rawText.slice(lastIndex, match.index), isMe, `m${match.index}`));
      parts.push(
        <span
          key={match.index}
          className={cn("font-semibold", isMe ? "text-primary-foreground underline underline-offset-2" : "text-primary")}
        >
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < rawText.length) parts.push(...renderLinkified(rawText.slice(lastIndex), isMe, "end"));
    return <>{parts}</>;
  };

  // ─────────────────────────────────────
  // Computed
  // ─────────────────────────────────────
  const totalUnreadUsers = Object.values(unreadMap).reduce((a, b) => a + b, 0);
  const totalUnreadGroups = Object.values(unreadGroupMap).reduce((a, b) => a + b, 0);

  // Merge mount-time unread counts with real-time socket counts
  const mergedUnreadMap = (users as ChatUser[]).reduce<Record<number, number>>((acc, u) => {
    acc[u.id] = (unreadMap[u.id] ?? unreadMap[(u as { userId?: number }).userId ?? 0] ?? 0)
      + (socketUnreadByUser[u.id] ?? 0);
    return acc;
  }, {});

  const filteredUsers = (users as ChatUser[])
    .filter((u) => u.id !== user?.userId && u.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const unreadA = mergedUnreadMap[a.id] ?? 0;
      const unreadB = mergedUnreadMap[b.id] ?? 0;
      if (unreadA !== unreadB) return unreadB - unreadA; // users with unread first
      const tsA = a.timestamp ?? 0;
      const tsB = b.timestamp ?? 0;
      if (tsA !== tsB) return tsB - tsA; // most recent last-message first
      return a.name.localeCompare(b.name);
    });

  const filteredGroups = (groups as ChatGroup[]).filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedGroupMembers: ChatUser[] = selectedContact?.isGroup
    ? (groupMembersMap[selectedContact.id] ?? [])
    : [];

  const mentionCandidates = mentionQuery !== null
    ? (selectedContact?.isGroup && selectedGroupMembers.length > 0
        ? selectedGroupMembers
        : (users as ChatUser[])
      )
        .filter((u) => u.id !== user?.userId && u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6)
    : [];

  const formatTime = (msg: PrivateMessage) => {
    let ts = msg.timestamp || (msg.createdAt ? new Date(msg.createdAt).getTime() : 0);
    if (!ts) return "";
    if (typeof ts === "string") { const p = Number(ts); ts = isNaN(p) ? new Date(ts).getTime() : p; }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const timeStr = formatTimeIntl(d, { hour: "2-digit", minute: "2-digit" });
    const isToday = d.toDateString() === new Date().toDateString();
    if (isToday) return timeStr;
    const dateStr = formatDateIntl(d, { day: "2-digit", month: "2-digit" });
    return `${dateStr} ${timeStr}`;
  };

  const buildMediaUrl = (mediaUrl: string) => {
    if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) return mediaUrl;
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    if (mediaUrl.startsWith("/public/")) return `${base}${mediaUrl}`;
    return `${base}/public/${mediaUrl}`;
  };

  const getMediaPreview = (msg: PrivateMessage) => {
    if (!msg.mediaUrl || msg.mediaType === "chat") return null;
    const url = buildMediaUrl(msg.mediaUrl);
    if (msg.mediaType === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
      return (
        <button onClick={() => { setLightboxUrl(url); setLightboxOpen(true); }} className="block mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={msg.mediaName || tBubble("image")} className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity" />
        </button>
      );
    }
    if (msg.mediaType === "audio" || /\.(mp3|ogg|wav)$/i.test(url)) {
      return <audio controls src={url} className="max-w-[200px] mb-1" />;
    }
    if (msg.mediaType === "video" || /\.(mp4|webm)$/i.test(url)) {
      return <video controls src={url} className="max-w-[200px] rounded-lg mb-1" />;
    }
    return (
      <button onClick={() => setFileModal({ url, name: msg.mediaName || msg.mediaUrl || "arquivo" })} className="flex items-center gap-1.5 text-xs underline opacity-80 mb-1">
        <FileText className="h-3 w-3" /> {msg.mediaName || msg.mediaUrl}
      </button>
    );
  };

  // ─────────────────────────────────────
  // Render
  // ─────────────────────────────────────
  return (
    <>
      {/* ── Main layout — absolute inset-0 fills the main's relative container ── */}
      <div className="absolute inset-0 flex bg-background overflow-hidden">
        <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleSendFile}
          accept=".mp3,.txt,.xml,.jpg,.png,.jpeg,.pdf,.doc,.docx,.mp4,.xls,.xlsx,.zip,.ppt,.pptx,image/*" />

        {/* ── Sidebar (contact list) — on mobile: full width when no chat open; hidden when chat open ── */}
        <div className={cn(
          "border-r flex flex-col shrink-0 min-h-0",
          "md:w-[300px] md:flex",
          selectedContact ? "hidden md:flex" : "flex w-full"
        )}>
          <div className="p-3 space-y-2 shrink-0">
            <div className="flex items-center gap-1">
              <h2 className="font-semibold text-sm">{t("title")}</h2>
              <PageHelp
                description={t("helpDesc")}
                sections={[
                  {
                    title: t("helpS0T"),
                    items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2"), t("helpS0I3")],
                  },
                  {
                    title: t("helpS1T"),
                    items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2"), t("helpS1I3")],
                  },
                  {
                    title: t("helpS2T"),
                    items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")],
                  },
                ]}
              />
              {canAudit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-auto shrink-0 text-muted-foreground hover:text-primary"
                  onClick={() => setAuditOpen(true)}
                  title={tAudit("openButton")}
                >
                  <ShieldQuestion className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="pl-8 h-8 text-sm" />
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "users" | "groups")} className="px-3 shrink-0">
            <TabsList className="w-full h-8">
              <TabsTrigger value="users" className="flex-1 text-xs h-6 gap-1.5">
                <User className="h-3.5 w-3.5" />
                {t("tabUsers")}
                {totalUnreadUsers > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[9px] rounded-full">{totalUnreadUsers}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex-1 text-xs h-6 gap-1.5">
                <Users2 className="h-3.5 w-3.5" />
                {t("tabTeams")}
                {totalUnreadGroups > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[9px] rounded-full">{totalUnreadGroups}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Separator className="mt-2 shrink-0" />

          <ScrollArea className="flex-1 min-h-0">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            ) : tab === "users" ? (
              filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <User className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">{t("noUsers")}</p>
                </div>
              ) : (
                <div className="p-1">
                  {filteredUsers.map((u) => {
                    const userUnread = mergedUnreadMap[u.id] ?? 0;
                    const hasUnread = userUnread > 0;
                    return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectContact({ id: u.id, name: u.name, email: u.email, status: u.status, isOnline: u.isOnline, isGroup: false, profilePicture: (u as { profilePicture?: string }).profilePicture })}
                      className={cn(
                        "w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-accent/50 text-left overflow-hidden",
                        selectedContact?.id === u.id && !selectedContact.isGroup && "bg-accent",
                        hasUnread && selectedContact?.id !== u.id && "bg-primary/5 border border-primary/20"
                      )}
                    >
                      <div className="relative">
                        <Avatar
                          className={cn(
                            (u as { profilePicture?: string }).profilePicture ? "h-9 w-9 cursor-zoom-in" : "h-9 w-9",
                            hasUnread && "ring-2 ring-primary ring-offset-1"
                          )}
                          onClick={(e) => { const pic = (u as { profilePicture?: string }).profilePicture; if (pic) { e.stopPropagation(); setProfilePicPreview({ url: pic, name: u.name }); } }}
                        >
                          <AvatarImage src={(u as { profilePicture?: string }).profilePicture} alt={u.name} />
                          <AvatarFallback className="text-xs">{getInitials(u.name)}</AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                          u.isOnline || u.status === "online" ? "bg-success" : "bg-muted-foreground/50"
                        )} />
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <p className={cn("text-sm truncate", hasUnread ? "font-semibold" : "font-medium")}>{u.name}</p>
                        {u.text ? (
                          <p className={cn("text-[10px] truncate", hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>{u.text}</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">{u.isOnline || u.status === "online" ? tChat("chatHeader.online") : tChat("chatHeader.offline")}</p>
                        )}
                      </div>
                      {hasUnread && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-[10px]">
                          {userUnread}
                        </Badge>
                      )}
                    </button>
                    );
                  })}
                </div>
              )
            ) : (
              filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users2 className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">{t("noTeams")}</p>
                </div>
              ) : (
                <div className="p-1">
                  {filteredGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => handleSelectContact({ id: g.id, name: g.name, isGroup: true, profilePicture: (g as { profilePicture?: string }).profilePicture })}
                      className={cn(
                        "w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-accent/50 text-left overflow-hidden",
                        selectedContact?.id === g.id && selectedContact.isGroup && "bg-accent"
                      )}
                    >
                      <Avatar
                        className={(g as { profilePicture?: string }).profilePicture ? "h-9 w-9 cursor-zoom-in" : "h-9 w-9"}
                        onClick={(e) => { const pic = (g as { profilePicture?: string }).profilePicture; if (pic) { e.stopPropagation(); setProfilePicPreview({ url: pic, name: g.name, isGroup: true }); } }}
                      >
                        <AvatarImage src={(g as { profilePicture?: string }).profilePicture} alt={g.name} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          <Users2 className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 overflow-hidden">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        {g.text && <p className="text-[10px] text-muted-foreground truncate">{g.text}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {mentionGroupIds.includes(g.id) && (
                          <Badge className="h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-[10px] bg-info hover:bg-info text-info-foreground">
                            @
                          </Badge>
                        )}
                        {((unreadGroupMap[g.id] ?? unreadGroupMap[(g as { groupId?: number }).groupId ?? 0]) || 0) > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-[10px]">
                            {unreadGroupMap[g.id] ?? unreadGroupMap[(g as { groupId?: number }).groupId ?? 0]}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </div>

        {/* ── Chat area — on mobile: only shown when contact selected ── */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden",
          !selectedContact ? "hidden md:flex" : "flex"
        )}>
          {!selectedContact ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">{t("selectConversation")}</h3>
              <p className="text-sm mt-1">{t("selectConversationDescription")}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
                {/* Mobile back button */}
                <button
                  className="md:hidden flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent text-muted-foreground shrink-0"
                  onClick={() => { setSelectedContact(null); setActiveConversation(null); }}
                >
                  <span className="text-sm">←</span>
                </button>
                <Avatar
                  className={selectedContact.profilePicture ? "h-9 w-9 cursor-zoom-in" : "h-9 w-9"}
                  onClick={() => { if (selectedContact.profilePicture) setProfilePicPreview({ url: selectedContact.profilePicture, name: selectedContact.name, isGroup: selectedContact.isGroup }); }}
                >
                  <AvatarImage src={selectedContact.profilePicture} alt={selectedContact.name} />
                  <AvatarFallback className="text-xs">
                    {selectedContact.isGroup ? <Users2 className="h-4 w-4" /> : getInitials(selectedContact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium">{selectedContact.name}</h3>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedContact.isGroup ? (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">{t("team")}</Badge>
                    ) : (
                      <span>{selectedContact.isOnline || selectedContact.status === "online" ? tChat("chatHeader.online") : tChat("chatHeader.offline")}</span>
                    )}
                  </div>
                </div>
                {/* Members button — only for group chats */}
                {selectedContact.isGroup ? (
                  <Popover open={membersPopoverOpen} onOpenChange={setMembersPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={t("teamMembers")}>
                        <Users2 className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-3">
                      {/* Group photo upload */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="relative group cursor-pointer" onClick={() => groupPhotoInputRef.current?.click()}>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={selectedContact?.profilePicture} alt={selectedContact?.name} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              <Users2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            {uploadingGroupPhoto
                              ? <Loader2 className="h-3 w-3 text-white animate-spin" />
                              : <Camera className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                        <p className="text-xs font-semibold flex-1">{t("uploadGroupPhoto")}</p>
                        <input
                          ref={groupPhotoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleGroupPhotoChange}
                        />
                      </div>
                      <p className="text-xs font-semibold mb-3">{t("teamMembers")}</p>
                      {selectedGroupMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("noMembers")}</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedGroupMembers.map((m) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <Avatar
                                className={m.profilePicture ? "h-7 w-7 shrink-0 cursor-zoom-in" : "h-7 w-7 shrink-0"}
                                onClick={() => { if (m.profilePicture) setProfilePicPreview({ url: m.profilePicture, name: m.name }); }}
                              >
                                <AvatarImage src={m.profilePicture} alt={m.name} />
                                <AvatarFallback className="text-[10px]">{getInitials(m.name)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs truncate flex-1">{m.name}</span>
                              <span className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                m.isOnline || m.status === "online" ? "bg-success" : "bg-muted-foreground/30"
                              )} />
                            </div>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : (
                  /* Call buttons — only for direct chats */
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        if (!selectedContact || selectedContact.isGroup) return;
                        void startPrivateCall(selectedContact.id, selectedContact.name, "audio", selectedContact.profilePicture ?? null);
                      }}
                      disabled={callBusy}
                      title={t("audioCall")}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        if (!selectedContact || selectedContact.isGroup) return;
                        void startPrivateCall(selectedContact.id, selectedContact.name, "video", selectedContact.profilePicture ?? null);
                      }}
                      disabled={callBusy}
                      title={t("videoCall")}
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Messages — fixed height, scrollable */}
              <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                className="h-full overflow-y-auto p-4 bg-muted/20"
                onScroll={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
                }}
              >
                <div className="space-y-2">
                  {hasMoreMessages && (
                    <div className="flex justify-center py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreMessages}
                        disabled={loadingMore}
                        className="text-xs gap-1"
                      >
                        {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {loadingMore ? t("loadingMore") : t("loadMore")}
                      </Button>
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <MessageCircle className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">{t("noMessages")}</p>
                    </div>
                  ) : messages.map((msg, idx) => {
                    const isMe = msg.senderId === user?.userId;
                    const senderPic = !isMe
                      ? (msg.sender?.profilePicture
                          || (users as ChatUser[]).find((u) => u.id === msg.senderId)?.profilePicture
                          || selectedGroupMembers.find((m) => m.id === msg.senderId)?.profilePicture
                          || undefined)
                      : undefined;
                    const senderName = msg.sender?.name || (users as ChatUser[]).find((u) => u.id === msg.senderId)?.name || "";
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
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
                      <motion.div
                        key={msg.id}
                        data-msg-id={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn("group flex gap-1 rounded-2xl", isMe ? "justify-end" : "justify-start")}
                      >
                        {!isMe && (
                          <Avatar className="h-7 w-7 shrink-0 self-end mb-1">
                            {senderPic && <AvatarImage src={senderPic} alt={senderName} />}
                            <AvatarFallback className="text-[10px]">{getInitials(senderName || "U")}</AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          onDoubleClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                          className={cn(
                            "max-w-[70%] rounded-2xl px-3 py-2 text-sm relative",
                            isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                          )}
                        >
                          {!isMe && msg.sender && (
                            <p className="text-[10px] font-semibold text-primary mb-0.5">{msg.sender.name}</p>
                          )}
                          {msg.quotedMsg && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                const qId = msg.quotedMsg!.id;
                                const el = document.querySelector(`[data-msg-id="${qId}"]`);
                                if (!el) return;
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("msg-highlight");
                                setTimeout(() => el.classList.remove("msg-highlight"), 1800);
                              }}
                              className={cn(
                                "mb-1 border-l-2 rounded-sm px-2 py-1 text-xs cursor-pointer hover:opacity-90 transition-opacity",
                                isMe ? "bg-primary-foreground/10 border-primary-foreground/60" : "bg-foreground/5 border-primary/60"
                              )}
                            >
                              <p className={cn("font-semibold truncate", isMe ? "text-primary-foreground/90" : "text-primary")}>
                                {msg.quotedMsg.senderId === user?.userId ? t("you") : (msg.quotedMsg.sender?.name || "")}
                              </p>
                              <p className={cn("truncate opacity-80", isMe ? "text-primary-foreground" : "text-foreground")}>
                                {msg.quotedMsg.mediaType === "image" ? "🖼"
                                  : msg.quotedMsg.mediaType === "audio" ? "🎤"
                                  : msg.quotedMsg.mediaType && msg.quotedMsg.mediaType !== "chat" ? `📎 ${msg.quotedMsg.text || ""}`
                                  : (msg.quotedMsg.text || "")}
                              </p>
                            </div>
                          )}
                          {getMediaPreview(msg)}
                          {msg.text && (
                            <div>
                              <p className="whitespace-pre-wrap break-words">{renderTextWithMentions(msg.text, isMe)}</p>
                              {(() => { const url = extractFirstUrl(msg.text); return url ? <PrivateLinkPreview url={url} /> : null; })()}
                            </div>
                          )}
                          <div className={cn("flex items-center gap-1 mt-1 justify-end", isMe ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {(msg.react || msg.reactFromMe) && (
                              <span className="text-sm mr-1">
                                {msg.reactFromMe}{msg.react && msg.react !== msg.reactFromMe ? msg.react : ""}
                              </span>
                            )}
                            <span className="text-[10px]">{formatTime(msg)}</span>
                            {isMe && (msg.read ? <CheckCheck className="h-3 w-3 text-blue-300" /> : <Check className="h-3 w-3" />)}
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 self-center shrink-0">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side={isMe ? "left" : "right"}>
                            <DropdownMenuItem onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}>
                              <Reply className="mr-2 h-3 w-3" /> {t("reply")}
                            </DropdownMenuItem>
                            {!selectedContact.isGroup && (
                              <DropdownMenuItem onSelect={() => setReactingMsg(msg)}>
                                <Smile className="mr-2 h-3 w-3" /> {t("react")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => { setForwardMsg(msg); setForwardSearch(""); }}>
                              <Forward className="mr-2 h-3 w-3" /> {t("forward")}
                            </DropdownMenuItem>
                            {isMe && msg.mediaType === "chat" && (
                              <DropdownMenuItem onClick={() => handleStartEdit(msg)}>
                                <Pencil className="mr-2 h-3 w-3" /> {t("edit")}
                              </DropdownMenuItem>
                            )}
                            {isMe && (
                              <DropdownMenuItem onClick={() => handleDelete(msg.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-3 w-3" /> {t("delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
              {!isAtBottom && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:opacity-90 transition-opacity"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              )}
              </div>

              {/* Edit indicator */}
              {editingMsg && (
                <div className="flex items-center gap-2 px-4 py-2 border-t bg-accent/50 text-sm shrink-0">
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">{t("editing")}</span>
                  <span className="flex-1 truncate">{editingMsg.text}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancelEdit}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Reply indicator */}
              {replyTo && !editingMsg && (
                <div className="flex items-center gap-2 px-4 py-2 border-t bg-accent/40 text-sm shrink-0 border-l-2 border-primary">
                  <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-primary truncate">
                      {t("replyingTo")} {replyTo.senderId === user?.userId ? t("you") : (replyTo.sender?.name || "")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {replyTo.mediaType === "image" ? "🖼"
                        : replyTo.mediaType === "audio" ? "🎤"
                        : replyTo.mediaType && replyTo.mediaType !== "chat" ? `📎 ${replyTo.text || ""}`
                        : (replyTo.text || "")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTo(null)} title={t("cancelReply")}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Input */}
              <div className={cn("border-t p-3 shrink-0", isRecordingAudio && "bg-destructive/10")}>
                {/* Pending paste files preview */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingFiles.map((file, idx) => (
                      <div key={idx} className="relative flex items-center gap-1.5 rounded-lg border bg-muted px-2 py-1.5 text-xs max-w-[160px]">
                        {file.type.startsWith("image/") ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-8 w-8 rounded object-cover shrink-0"
                          />
                        ) : (
                          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate flex-1 text-[11px]">{file.name}</span>
                        <button
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="ml-1 rounded-full hover:bg-accent p-0.5 shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mention dropdown */}
                {mentionQuery !== null && mentionCandidates.length > 0 && (
                  <div className="max-w-2xl mx-auto mb-2 rounded-lg border bg-popover shadow-md overflow-hidden">
                    {mentionCandidates.map((u, idx) => (
                      <button
                        key={u.id}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors",
                          idx === mentionSelectedIndex && "bg-accent"
                        )}
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={u.profilePicture} alt={u.name} />
                          <AvatarFallback className="text-[10px]">{getInitials(u.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{u.name}</span>
                        <span className="text-[11px] text-info ml-auto shrink-0">@{u.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                        <Smile className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-4 gap-1">
                        {EMOJI_LIST.map((e) => (
                          <button key={e} onClick={() => setText((p) => p + e)} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-lg">
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileInputRef.current?.click()} title={t("attachFile")}>
                    <Paperclip className="h-4 w-4" />
                  </Button>

                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleSendVideoLink} title={t("sendVideoLink")} disabled={!selectedContact}>
                    <MonitorPlay className="h-4 w-4" />
                  </Button>

                  <Textarea
                    ref={inputRef}
                    value={text}
                    onChange={handleTextChange}
                    placeholder={selectedContact?.isGroup ? `${t("messagePlaceholder")} ${t("mentionHint")}` : t("messagePlaceholder")}
                    className="flex-1 min-h-[36px] max-h-[120px] resize-none"
                    rows={1}
                    onPaste={handlePasteFile}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (mentionQuery !== null && mentionCandidates.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMentionSelectedIndex((i) => Math.min(i + 1, mentionCandidates.length - 1));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMentionSelectedIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          insertMention(mentionCandidates[mentionSelectedIndex]);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setMentionQuery(null);
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                  />

                  {isRecordingAudio ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={handleCancelRecordingAudio} title={t("cancelRecording")}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9 shrink-0 bg-success text-success-foreground hover:bg-success/90" onClick={handleStopRecordingAudio} title={t("sendAudio")}>
                        <Square className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleStartRecordingAudio} title={t("recordAudio")} disabled={!selectedContact}>
                        <Mic className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!text.trim() && pendingFiles.length === 0}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} />

      {/* Forward message dialog */}
      <Dialog open={!!forwardMsg} onOpenChange={(open) => { if (!open) { setForwardMsg(null); setForwardSearch(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{t("forwardMessage")}</DialogTitle>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t("searchUser")}
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              <div className="space-y-1">
                {(users as ChatUser[])
                  .filter((u) => u.name?.toLowerCase().includes(forwardSearch.toLowerCase()))
                  .map((u) => (
                    <button
                      key={u.id}
                      disabled={forwarding}
                      onClick={() => handleForward(u.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-left text-sm transition-colors"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        {u.profilePicture && <AvatarImage src={u.profilePicture} alt={u.name} />}
                        <AvatarFallback className="text-[10px]">{getInitials(u.name)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{u.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox de imagem com zoom */}
      <Dialog open={lightboxOpen && !!lightboxUrl} onOpenChange={(o) => { if (!o) closeLightbox(); }}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0 bg-black border-none [&>button]:text-white/80 [&>button]:hover:text-white [&>button]:bg-white/10">
          <DialogTitle className="sr-only">{tBubble("image")}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 pr-12">
            <div className="flex items-center gap-1">
              {lightboxScale > 1 && <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={resetLightboxZoom}><RotateCcw className="h-4 w-4" /></button>}
              <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={(e) => { e.stopPropagation(); setLightboxScale((s) => Math.min(5, s + 0.5)); }}><ZoomIn className="h-4 w-4" /></button>
              <button className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={(e) => { e.stopPropagation(); setLightboxScale((s) => { const next = Math.max(1, s - 0.5); if (next === 1) setLightboxOffset({ x: 0, y: 0 }); return next; }); }}><ZoomOut className="h-4 w-4" /></button>
            </div>
            <button type="button" className="text-white/80 hover:text-white rounded-full bg-white/10 p-1.5" onClick={() => lightboxUrl && downloadFile(lightboxUrl)}><Download className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden bg-black/90 relative" onClick={() => { if (lightboxScale <= 1) closeLightbox(); }}>
            {lightboxScale !== 1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80 select-none pointer-events-none">{Math.round(lightboxScale * 100)}%</div>}
            {lightboxUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightboxUrl} alt="" className="object-contain select-none"
                style={{ maxHeight: lightboxScale === 1 ? "100%" : undefined, maxWidth: lightboxScale === 1 ? "100%" : undefined, transform: `scale(${lightboxScale}) translate(${lightboxOffset.x / lightboxScale}px, ${lightboxOffset.y / lightboxScale}px)`, cursor: lightboxScale > 1 ? (lightboxDragRef.current ? "grabbing" : "grab") : "default", transition: lightboxDragRef.current ? "none" : "transform 0.15s ease" }}
                onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); resetLightboxZoom(); }}
                onWheel={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxScale((s) => Math.min(5, Math.max(1, s * (e.deltaY < 0 ? 1.1 : 0.9)))); }}
                onMouseDown={(e) => { if (lightboxScale <= 1) return; e.preventDefault(); lightboxDragRef.current = { startX: e.clientX, startY: e.clientY, ox: lightboxOffset.x, oy: lightboxOffset.y }; }}
                onMouseMove={(e) => { if (!lightboxDragRef.current) return; setLightboxOffset({ x: lightboxDragRef.current.ox + e.clientX - lightboxDragRef.current.startX, y: lightboxDragRef.current.oy + e.clientY - lightboxDragRef.current.startY }); }}
                onMouseUp={() => { lightboxDragRef.current = null; }} onMouseLeave={() => { lightboxDragRef.current = null; }}
                onTouchStart={(e) => { if (e.touches.length === 2) lightboxPinchRef.current = { dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), scale: lightboxScale }; }}
                onTouchMove={(e) => { if (e.touches.length === 2 && lightboxPinchRef.current) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); setLightboxScale(Math.min(5, Math.max(1, lightboxPinchRef.current.scale * (d / lightboxPinchRef.current.dist)))); } }}
                onTouchEnd={() => { lightboxPinchRef.current = null; }} draggable={false} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Emoji picker dialog (reagir) */}
      <Dialog open={!!reactingMsg} onOpenChange={(o) => { if (!o) { setReactingMsg(null); setEmojiCategory(0); } }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t("react")}</DialogTitle>
          <div className="flex border-b overflow-x-auto scrollbar-none pr-10">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setEmojiCategory(i)}
                className={`flex-shrink-0 px-2 py-2 text-lg transition-colors ${i === emojiCategory ? "border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-64 overflow-y-auto">
            {EMOJI_CATEGORIES[emojiCategory].emojis.map((e) => (
              <button
                key={e}
                onClick={() => { if (reactingMsg) handleReaction(reactingMsg, e); setReactingMsg(null); setEmojiCategory(0); }}
                className="h-9 w-9 rounded-md hover:bg-accent text-xl flex items-center justify-center transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de arquivo */}
      {fileModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setFileModal(null)}>
          <div className="bg-background rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm font-medium text-center break-all">{fileModal.name}</p>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => downloadFile(fileModal.url, fileModal.name)}>
                <Download className="h-4 w-4" /> {tCommon("download")}
              </button>
              <button className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => window.open(fileModal.url, "_blank")}>
                <FileText className="h-4 w-4" /> {tCommon("open")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auditoria (espiar) do chat privado — somente admin/supervisor */}
      {canAudit && (
        <ChatPrivadoAuditDialog open={auditOpen} onOpenChange={setAuditOpen} />
      )}
    </>
  );
}
