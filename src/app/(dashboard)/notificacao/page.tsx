"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { Bell, Trash2, Search, RefreshCw, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNotifications } from "@/hooks/use-notifications";
import { useNotificationSocket } from "@/hooks/use-notification-socket";
import { useAuthStore } from "@/stores/auth-store";
import {
  createNotification,
  updateNotification,
  deleteNotification,
  deleteAllNotifications,
  type InternalNotification,
} from "@/services/internal-notifications";
import {
  NotificationModal,
  decodeNotificationMessage,
} from "@/components/notifications/notification-modal";
import {
  NotificationCard,
  type GroupedNotification,
} from "@/components/notifications/notification-card";

export default function NotificacaoPage() {
  const t = useTranslations("notificacaoPage");
  const tCommon = useTranslations("common");
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupedNotification | null>(null);

  // Confirmação via AlertDialog (substitui o confirm() nativo): a exclusão só roda no Confirmar.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ message: string; action: () => void } | null>(null);
  const askConfirm = (message: string, action: () => void) => {
    setConfirmData({ message, action });
    setConfirmOpen(true);
  };

  const {
    notifications,
    loading,
    hasMore,
    reload,
    loadMore,
    addNotification,
  } = useNotifications();

  // Load on mount
  useEffect(() => {
    reload();
  }, [reload]);

  // Socket real-time: nova notificação criada aparece na lista
  useNotificationSocket({
    onNotification: (n) => addNotification(n),
  });

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) loadMore();
      },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  // Group by message (broadcast grouping)
  const grouped = useMemo<GroupedNotification[]>(() => {
    const map = new Map<string, GroupedNotification>();
    for (const n of notifications) {
      const key = n.message;
      if (!map.has(key)) {
        map.set(key, {
          message: key,
          ids: [],
          users: [],
          readCount: 0,
          totalCount: 0,
          firstNotification: n,
        });
      }
      const g = map.get(key)!;
      g.ids.push(n.id);
      g.totalCount++;
      if (n.isRead) g.readCount++;
      if (n.user?.name && !g.users.includes(n.user.name)) {
        g.users.push(n.user.name);
      }
    }
    return Array.from(map.values());
  }, [notifications]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter((g) => {
      const decoded = decodeNotificationMessage(g.message).toLowerCase();
      return decoded.includes(q) || g.users.some((u) => u.toLowerCase().includes(q));
    });
  }, [grouped, search]);

  const handleCreate = async (message: string, userIds: number[]) => {
    await createNotification({ message, userIds: userIds.length > 0 ? userIds : undefined });
    toast.success(t("notifCreated"));
    reload();
  };

  const handleEdit = async (message: string) => {
    if (!editingGroup) return;
    // Editar todos os registros do grupo com a nova mensagem
    await Promise.all(
      editingGroup.ids.map((id) => updateNotification(id, { message }))
    );
    toast.success(t("notifUpdated"));
    reload();
  };

  const handleDeleteGroup = (group: GroupedNotification) => {
    askConfirm(t("confirmDeleteGroup"), async () => {
      await Promise.allSettled(group.ids.map((id) => deleteNotification(id)));
      toast.success(t("notifDeleted"));
      reload();
    });
  };

  const handleDeleteAll = () => {
    askConfirm(t("confirmDeleteAll"), async () => {
      try {
        await deleteAllNotifications();
        toast.success(t("allDeleted"));
        reload();
      } catch {
        toast.error(t("errorDeleting"));
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setEditingGroup(null); setModalOpen(true); }} title={t("addBtn")}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("addBtn")}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={reload} title={t("refreshBtn")}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("refreshBtn")}</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteAll} title={t("deleteAllBtn")}>
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("deleteAllBtn")}</span>
          </Button>
        </div>
      </PageHeader>

      {/* Search + counter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!loading && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {filtered.length} {t("groupCount")} / {notifications.length} {t("totalCount")}
          </p>
        )}
      </div>

      {/* Content */}
      {loading && notifications.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Bell} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button onClick={() => { setEditingGroup(null); setModalOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />{t("addBtn")}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((group) => (
            <NotificationCard
              key={group.message.slice(0, 40) + group.ids[0]}
              notification={group}
              onEdit={(g) => { setEditingGroup(g); setModalOpen(true); }}
              onDelete={handleDeleteGroup}
            />
          ))}
        </div>
      )}

      {/* Load more sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-2">
        {loading && notifications.length > 0 && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {!hasMore && notifications.length > 0 && !loading && (
          <p className="text-xs text-muted-foreground">{t("allLoaded")}</p>
        )}
      </div>

      {/* Modal */}
      <NotificationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialMessage={editingGroup?.message ?? ""}
        isEdit={!!editingGroup}
        onSave={editingGroup ? handleEdit : handleCreate}
      />

      {/* Confirmação de exclusão (AlertDialog) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmData?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => confirmData?.action()}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
