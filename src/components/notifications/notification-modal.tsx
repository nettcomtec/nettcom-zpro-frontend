"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Search, Users, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAllUsers, type User } from "@/services/users";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

// ── Emoji shortcuts ───────────────────────────────────────
const QUICK_EMOJIS = [
  "😀", "🎉", "⚠️", "🔔", "✅", "❌", "📢", "💡", "🚀", "❤️",
  "😊", "🎯", "🔥", "📌", "💬",
];

// ── Preview CSS ───────────────────────────────────────────
const PREVIEW_CSS_BASE = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 8px; font-size: 14px; margin: 0; }
  ul, ol { padding-left: 1.5em; margin: 0.25em 0; }
  li { margin: 0.1em 0; }
  p, h1, h2, h3, h4 { margin: 0.2em 0; }
`;

function buildPreviewSrcDoc(html: string, isDark: boolean): string {
  const bodyBg = isDark ? "#1c1c1e" : "#ffffff";
  const bodyColor = isDark ? "#e5e7eb" : "#111827";
  const css = `${PREVIEW_CSS_BASE}body{background:${bodyBg};color:${bodyColor};}`;
  const placeholder = `<p style='color:#6b7280;font-size:13px'>Pré-visualização aparecerá aqui...</p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html || placeholder}</body></html>`;
}

// ── Base64 helpers ────────────────────────────────────────
function isHtmlContent(html: string): boolean {
  return /<[a-z][\s\S]*>/i.test(html);
}

export function encodeNotificationMessage(html: string): string {
  if (!isHtmlContent(html)) return html.trim();
  const b64 = btoa(unescape(encodeURIComponent(html)));
  return `{{HTML_B64}}${b64}`;
}

export function decodeNotificationMessage(message: string): string {
  if (!message.startsWith("{{HTML_B64}}")) return message;
  try {
    return decodeURIComponent(escape(atob(message.slice(12))));
  } catch {
    return message;
  }
}

// ── Cross-tenant user type ────────────────────────────────
interface UserWithTenant extends User {
  tenantId?: number;
  tenant?: { name?: string };
}

async function fetchUsersAllTenants(): Promise<UserWithTenant[]> {
  const { data } = await api.get<{ users?: UserWithTenant[] } | UserWithTenant[]>("/userTenants");
  return Array.isArray(data) ? data : data?.users ?? [];
}

// ── User multiselect ──────────────────────────────────────
function UserSelector({
  selected,
  onChange,
  isSuperadmin,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
  isSuperadmin: boolean;
}) {
  const [users, setUsers] = useState<UserWithTenant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const fetch = isSuperadmin
      ? fetchUsersAllTenants()
      : fetchAllUsers().then(({ data }) => {
          return (data?.users ?? []) as UserWithTenant[];
        });

    fetch
      .then((list) => setUsers(list))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSuperadmin]);

  // Build tenant groups
  const tenants = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    for (const u of users) {
      if (u.tenantId && !map.has(u.tenantId)) {
        map.set(u.tenantId, { id: u.tenantId, name: u.tenant?.name ?? `Tenant ${u.tenantId}` });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase());
      const matchTenant = tenantFilter === null || u.tenantId === tenantFilter;
      return matchSearch && matchTenant;
    });
  }, [users, search, tenantFilter]);

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  // Select/deselect all currently visible
  const toggleAll = () => {
    const visibleIds = filtered.map((u) => u.id);
    const allSelected = visibleIds.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((id) => !visibleIds.includes(id)));
    } else {
      const newSet = new Set([...selected, ...visibleIds]);
      onChange(Array.from(newSet));
    }
  };

  // Select/deselect all users of a specific tenant
  const toggleTenant = (tenantId: number) => {
    const tenantUserIds = users.filter((u) => u.tenantId === tenantId).map((u) => u.id);
    const allSelected = tenantUserIds.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((id) => !tenantUserIds.includes(id)));
    } else {
      const newSet = new Set([...selected, ...tenantUserIds]);
      onChange(Array.from(newSet));
    }
  };

  // Select/deselect everyone
  const toggleAllTenants = () => {
    if (selected.length === users.length) {
      onChange([]);
    } else {
      onChange(users.map((u) => u.id));
    }
  };

  const visibleSelectedCount = filtered.filter((u) => selected.includes(u.id)).length;
  const visibleAllSelected = filtered.length > 0 && visibleSelectedCount === filtered.length;
  const visibleSomeSelected = visibleSelectedCount > 0 && visibleSelectedCount < filtered.length;

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            className="h-6 border-0 bg-transparent p-0 text-sm focus-visible:ring-0 w-full"
            placeholder="Buscar usuários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" className="text-xs h-6 px-2 shrink-0" onClick={toggleAll}>
          {visibleAllSelected ? "Desmarcar" : "Todos"}
        </Button>
        {isSuperadmin && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 px-2 shrink-0 gap-1"
            onClick={toggleAllTenants}
            title="Selecionar todos os usuários de todos os tenants"
          >
            <Building2 className="h-3 w-3" />
            {selected.length === users.length && users.length > 0 ? "Desmarcar tudo" : "Todos os tenants"}
          </Button>
        )}
      </div>

      {/* Tenant filter tabs (superadmin only) */}
      {isSuperadmin && tenants.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTenantFilter(null)}
            className={cn(
              "text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-colors",
              tenantFilter === null ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            Todos ({users.length})
          </button>
          {tenants.map((t) => {
            const count = users.filter((u) => u.tenantId === t.id).length;
            const selCount = users.filter((u) => u.tenantId === t.id && selected.includes(u.id)).length;
            return (
              <div key={t.id} className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTenantFilter(tenantFilter === t.id ? null : t.id)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full whitespace-nowrap transition-colors",
                    tenantFilter === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {t.name} ({count})
                  {selCount > 0 && (
                    <span className="ml-1 bg-green-500 text-white rounded-full px-1 text-[9px]">{selCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleTenant(t.id)}
                  className="text-[9px] text-muted-foreground hover:text-foreground px-1 transition-colors"
                  title={`Selecionar todos do ${t.name}`}
                >
                  ✓
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* User list */}
      <ScrollArea className="h-40">
        {loading ? (
          <p className="text-xs text-center py-4 text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-center py-4 text-muted-foreground">Nenhum usuário encontrado</p>
        ) : (
          <div className="p-1">
            {/* Select all visible — destacado pra ficar fácil de descobrir */}
            <button
              type="button"
              onClick={toggleAll}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left transition-colors border-b mb-1",
                visibleAllSelected && "bg-primary/5"
              )}
              title={visibleAllSelected ? "Desmarcar todos os visíveis" : "Selecionar todos os visíveis"}
            >
              <div
                className={cn(
                  "h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center",
                  visibleAllSelected
                    ? "bg-primary border-primary"
                    : visibleSomeSelected
                    ? "bg-primary/40 border-primary"
                    : "border-muted-foreground"
                )}
              >
                {visibleSomeSelected && !visibleAllSelected && (
                  <span className="h-0.5 w-2 bg-primary-foreground rounded-sm" />
                )}
              </div>
              <span className="font-medium">
                {visibleAllSelected ? "Desmarcar todos" : "Selecionar todos"}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {visibleSelectedCount}/{filtered.length}
              </span>
            </button>
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left transition-colors",
                  selected.includes(u.id) && "bg-primary/10"
                )}
              >
                <div
                  className={cn(
                    "h-3.5 w-3.5 rounded border shrink-0",
                    selected.includes(u.id) ? "bg-primary border-primary" : "border-muted-foreground"
                  )}
                />
                <span className="truncate font-medium">{u.name}</span>
                {isSuperadmin && u.tenant?.name && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 ml-auto">
                    {u.tenant.name}
                  </Badge>
                )}
                {!isSuperadmin && (
                  <span className="truncate text-muted-foreground text-xs ml-auto">{u.profile}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {selected.length > 0
            ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}`
            : "Nenhum selecionado"}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            className="text-destructive hover:underline"
            onClick={() => onChange([])}
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────
interface NotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMessage?: string;
  initialUserIds?: number[];
  isEdit?: boolean;
  onSave: (message: string, userIds: number[]) => Promise<void>;
}

export function NotificationModal({
  open,
  onOpenChange,
  initialMessage = "",
  initialUserIds = [],
  isEdit = false,
  onSave,
}: NotificationModalProps) {
  const t = useTranslations("notificacaoPage");
  const { user } = useAuthStore();
  const isSuperadmin = user?.profile === "superadmin";

  const [tab, setTab] = useState<"visual" | "html">("visual");
  const [htmlContent, setHtmlContent] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Detect dark mode reactively
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // srcDoc for preview — avoids iframe timing issues entirely
  const [previewSrcDoc, setPreviewSrcDoc] = useState(() => buildPreviewSrcDoc("", false));

  const prevOpenRef = useRef(false);
  const initialMessageRef = useRef(initialMessage);
  initialMessageRef.current = initialMessage;
  const initialUserIdsRef = useRef(initialUserIds);
  initialUserIdsRef.current = initialUserIds;

  // Init state only when modal opens (false → true transition)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const decoded = decodeNotificationMessage(initialMessageRef.current);
      setHtmlContent(decoded);
      setSelectedUsers(initialUserIdsRef.current ?? []);
      setTab("visual");
      setPreviewSrcDoc(buildPreviewSrcDoc(decoded, isDarkRef.current));
      // Set editor content after next paint (dialog might not be mounted yet)
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = decoded;
      });
    }
    prevOpenRef.current = open;
  }, [open]);

  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // Re-render preview when dark mode changes
  const previewHtmlRef = useRef("");
  const updatePreview = useCallback((html: string) => {
    previewHtmlRef.current = html;
    setPreviewSrcDoc(buildPreviewSrcDoc(html, isDarkRef.current));
  }, []);

  useEffect(() => {
    setPreviewSrcDoc(buildPreviewSrcDoc(previewHtmlRef.current, isDark));
  }, [isDark]);

  const exec = (cmd: string) => {
    document.execCommand(cmd, false, undefined);
    editorRef.current?.focus();
  };

  const insertEmoji = (emoji: string) => {
    if (tab === "visual") {
      editorRef.current?.focus();
      document.execCommand("insertText", false, emoji);
      updatePreview(editorRef.current?.innerHTML ?? "");
    } else {
      const next = htmlContent + emoji;
      setHtmlContent(next);
      updatePreview(next);
    }
  };

  const switchTab = (next: "visual" | "html") => {
    if (next === "html") {
      const content = editorRef.current?.innerHTML ?? "";
      setHtmlContent(content);
      updatePreview(content);
    } else {
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = htmlContent;
        updatePreview(editorRef.current?.innerHTML ?? htmlContent);
      });
    }
    setTab(next);
  };

  const handleEditorInput = () => {
    updatePreview(editorRef.current?.innerHTML ?? "");
  };

  const handleSave = async () => {
    const rawHtml = tab === "visual"
      ? (editorRef.current?.innerHTML ?? "")
      : htmlContent;

    if (!rawHtml.trim() || rawHtml === "<br>" || rawHtml === "<div><br></div>") {
      return;
    }

    setSaving(true);
    try {
      const encoded = encodeNotificationMessage(rawHtml);
      await onSave(encoded, selectedUsers);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="pr-7">
          <DialogTitle className="text-base sm:text-lg break-words">
            {isEdit ? t("modalEditTitle") : t("modalCreateTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {isEdit ? t("modalDescEdit") : t("modalDescCreate")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-w-0">
          {/* Tab switch */}
          <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md w-fit">
            <Button
              variant={tab === "visual" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => switchTab("visual")}
            >
              {t("tabVisual")}
            </Button>
            <Button
              variant={tab === "html" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs font-mono"
              onClick={() => switchTab("html")}
            >
              {t("tabHtml")}
            </Button>
          </div>

          {/* Emoji toolbar */}
          <div className="flex flex-wrap gap-0.5 sm:gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="h-7 w-7 text-sm sm:text-base rounded hover:bg-accent transition-colors flex items-center justify-center shrink-0"
                onClick={() => insertEmoji(emoji)}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>

          {tab === "visual" && (
            <>
              {/* Formatting toolbar */}
              <div className="flex flex-wrap gap-0.5 p-1 border rounded-md bg-muted/30">
                {[
                  { icon: Bold, cmd: "bold", title: t("boldBtn") },
                  { icon: Italic, cmd: "italic", title: t("italicBtn") },
                  { icon: Underline, cmd: "underline", title: t("underlineBtn") },
                  { icon: Strikethrough, cmd: "strikeThrough", title: t("strikBtn") },
                  { icon: List, cmd: "insertUnorderedList", title: "Lista" },
                  { icon: ListOrdered, cmd: "insertOrderedList", title: "Lista numerada" },
                  { icon: AlignLeft, cmd: "justifyLeft", title: "Esquerda" },
                  { icon: AlignCenter, cmd: "justifyCenter", title: "Centro" },
                  { icon: AlignRight, cmd: "justifyRight", title: "Direita" },
                ].map(({ icon: Icon, cmd, title }) => (
                  <button
                    key={cmd}
                    type="button"
                    title={title}
                    className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors shrink-0"
                    onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>

              {/* contentEditable */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                className="min-h-[120px] max-h-[200px] overflow-y-auto border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ wordBreak: "break-word" }}
              />
            </>
          )}

          {tab === "html" && (
            <Textarea
              value={htmlContent}
              onChange={(e) => {
                setHtmlContent(e.target.value);
                updatePreview(e.target.value);
              }}
              placeholder="<div>...</div>"
              className="min-h-[160px] font-mono text-xs"
            />
          )}

          {/* Preview — uses srcDoc to avoid iframe timing issues */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("previewLabel")}</p>
            <div className="border rounded-md overflow-hidden bg-background">
              <iframe
                title="preview"
                sandbox="allow-same-origin"
                srcDoc={previewSrcDoc}
                scrolling="no"
                className="w-full border-0"
                style={{ height: 150 }}
              />
            </div>
          </div>

          {/* User selector (only when creating) */}
          {!isEdit && (
            <div>
              <p className="text-xs font-medium mb-1">{t("labelUsers")}</p>
              <UserSelector
                selected={selectedUsers}
                onChange={setSelectedUsers}
                isSuperadmin={isSuperadmin}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
