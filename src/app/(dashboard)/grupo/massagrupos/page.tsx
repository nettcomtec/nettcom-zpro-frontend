"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLiveMode } from "@/hooks/use-live-mode";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import {
  listGroups,
  listGroupIds,
  listParticipants,
  createGroups,
  type WhatsAppGroup,
  type GroupParticipants,
} from "@/services/groups";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";

const GROUP_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow"];

interface ConnectionOption {
  label: string;
  value: number;
}

interface GroupOption {
  id: string;
  name: string;
}

// Modal to create groups
function ModalCriarGrupo({
  open,
  onClose,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  connections: ConnectionOption[];
}) {
  const t = useTranslations("grupoMassagruposPage");
  const [whatsappId, setWhatsappId] = useState("");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!whatsappId) {
      toast.warning(t("warningSelectConnection"));
      return;
    }
    if (!title.trim()) {
      toast.warning(t("warningFillGroupName"));
      return;
    }
    if (!number.trim()) {
      toast.warning(t("warningFillParticipantNumber"));
      return;
    }
    if (!quantidade || Number(quantidade) < 1) {
      toast.warning(t("warningFillQuantity"));
      return;
    }

    const qty = Number(quantidade);
    const titles: string[] = [];
    for (let i = 1; i <= qty; i++) {
      titles.push(`${title} #${String(i).padStart(2, "0")}`);
    }

    setLoading(true);
    try {
      await createGroups({ whatsappId: Number(whatsappId), titles, number: number.trim() });
      toast.success(t("groupsCreated"));
      onClose();
      setTitle("");
      setNumber("");
      setQuantidade("");
      setWhatsappId("");
    } catch {
      toast.error(t("errorCreateGroups"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modalCreateTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>{t("labelConnection")}</Label>
            <Select value={whatsappId} onValueChange={setWhatsappId}>
              <SelectTrigger>
                <SelectValue placeholder={t("placeholderSelectConnection")} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.value} value={String(c.value)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{t("labelGroupName")}</Label>
            <Input
              placeholder={t("placeholderGroupName")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("labelParticipantNumber")}</Label>
            <Input
              placeholder="5511999999999"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("labelQuantity")}</Label>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="1"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
          {loading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("creatingGroups")}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GrupoMassaGruposPage() {
  const t = useTranslations("grupoMassagruposPage");
  const { isLiveMode } = useLiveMode();
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantes, setParticipantes] = useState<GroupParticipants[]>([]);
  const [grupos, setGrupos] = useState<WhatsAppGroup[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimer = (id: ReturnType<typeof setTimeout>) => {
    timers.current.push(id);
  };

  const clearAllTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => {
    return () => clearAllTimers();
  }, []);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWhatsapps();
      const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const all = filterWhatsappsForCurrentUser(raw);
      const filtered = all
        .filter(
          (w) =>
            GROUP_CHANNEL_TYPES.includes((w.type || "").toLowerCase()) &&
            w.status === "CONNECTED"
        )
        .map((w) => ({ label: w.name, value: w.id }));
      setConnections(filtered);
    } catch {
      toast.error(t("errorLoadConnections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const popularGrupos = async (connId: string) => {
    setSelectedGroups([]);
    setGroupOptions([]);
    setParticipantes([]);
    setGrupos([]);
    if (!connId) return;
    setLoadingGroups(true);
    try {
      const res = await listGroups({ whatsappId: Number(connId) });
      const raw = (res.data as any)?.groups ?? res.data;
      const list: GroupOption[] = (Array.isArray(raw) ? raw : [])
        .map((g: any) => ({ id: g.id, name: g.name }))
        .sort((a: GroupOption, b: GroupOption) => a.name.localeCompare(b.name));
      setGroupOptions(list);
    } catch {
      toast.error(t("errorListGroups"));
      setGroupOptions([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleConnectionChange = (val: string) => {
    setSelectedConnection(val);
    popularGrupos(val);
  };

  const toggleGroup = (g: GroupOption) => {
    setSelectedGroups((prev) => {
      const exists = prev.find((x) => x.id === g.id);
      if (exists) return prev.filter((x) => x.id !== g.id);
      return [...prev, g];
    });
  };

  const removeGroup = (id: string) => {
    setSelectedGroups((prev) => prev.filter((x) => x.id !== id));
  };

  const listarGruposIds = async () => {
    if (!selectedConnection) return;
    try {
      const res = await listGroupIds({ whatsappId: Number(selectedConnection) });
      const raw = (res.data as any)?.groups ?? res.data;
      const sorted = (Array.isArray(raw) ? raw : []).sort((a: WhatsAppGroup, b: WhatsAppGroup) =>
        (a.name || "").localeCompare(b.name || "")
      );
      setGrupos(sorted);
    } catch {
      toast.error(t("errorListGroupIds"));
    }
  };

  const listarParticipantes = async () => {
    if (!selectedConnection) {
      toast.warning(t("warningSelectConnection"));
      return;
    }
    if (selectedGroups.length === 0) {
      toast.warning(t("warningSelectGroup"));
      return;
    }
    setLoadingParticipants(true);
    try {
      const groupIds = selectedGroups.map((g) => g.id);
      const res = await listParticipants({
        whatsappId: Number(selectedConnection),
        groupIds,
      });
      const data = (res.data as any);
      const sortedData = (Array.isArray(data) ? data : []).map((g: GroupParticipants) => ({
        ...g,
        participants: [...g.participants].sort((a, b) => a.localeCompare(b)),
      }));
      setParticipantes(sortedData);
    } catch {
      toast.error(t("errorListParticipants"));
    } finally {
      setLoadingParticipants(false);
    }
  };

  const exportToXLS = async () => {
    if (participantes.length === 0) {
      toast.warning(t("warningNoParticipants"));
      return;
    }
    try {
      const mod = await import("xlsx");
      const XLSX = mod.default || mod;
      const wb = XLSX.utils.book_new();
      const data: { "Grupo ID": string; Participante: string }[] = [];
      participantes.forEach((grupo) => {
        grupo.participants.forEach((p) => {
          data.push({ "Grupo ID": grupo.groupId, Participante: p });
        });
      });
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Participantes");
      XLSX.writeFile(wb, "participantes.xlsx");
    } catch {
      toast.error(t("errorExport"));
    }
  };

  const limparCampos = () => {
    setSelectedGroups([]);
    setGroupOptions([]);
    setSelectedConnection("");
    setParticipantes([]);
    setGrupos([]);
    toast.warning(t("fieldsCleared"));
    const id = setTimeout(() => window.location.reload(), 500);
    addTimer(id);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-lg font-bold">{t("cardTitle")}</CardTitle>
            <PageHelp
              description={t("helpDesc")}
              sections={[
                { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
                { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create groups button */}
          <div>
            <Button onClick={() => setShowCreateModal(true)} className="mb-2 mr-2">
              <Plus className="mr-2 h-4 w-4" />
              {t("createGroupsMass")}
            </Button>
          </div>

          <div className="text-base font-semibold mb-2">{t("listParticipants")}</div>

          {/* Connection + Groups selectors */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("labelConnection")}</Label>
              <Select value={selectedConnection} onValueChange={handleConnectionChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("placeholderSelectConnection")} />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.value} value={String(c.value)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("labelGroups")}</Label>
              {loadingGroups && (
                <div className="text-sm text-primary flex items-center gap-2 mb-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loadingGroups")}
                </div>
              )}
              <Select
                disabled={loadingGroups || groupOptions.length === 0}
                onValueChange={(val) => {
                  const g = groupOptions.find((x) => x.id === val);
                  if (g) toggleGroup(g);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      groupOptions.length === 0
                        ? t("placeholderSelectConnectionFirst")
                        : t("placeholderSelectGroups")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Selected chips */}
              {selectedGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedGroups.map((g) => (
                    <Badge key={g.id} variant="secondary" className="flex items-center gap-1">
                      {g.name}
                      <button onClick={() => removeGroup(g.id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Loading indicators */}
          {loadingParticipants && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loadingParticipants")}
            </div>
          )}

          {/* Participants list */}
          {participantes.length > 0 && (
            <div className="space-y-4">
              {participantes.map((grupo) => (
                <div key={grupo.groupId} className="border rounded p-3">
                  <div className="font-semibold text-sm mb-1">
                    <strong>{t("groupId")}:</strong>{" "}
                    <span className={cn(isLiveMode && "live-blur-text")}>{grupo.groupId}</span>
                  </div>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {grupo.participants.map((p) => (
                      <li key={p} className={cn(isLiveMode && "live-blur-text")}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Group IDs list */}
          {grupos.length > 0 && (
            <div className="space-y-1 text-sm">
              {grupos.map((g) => (
                <div key={g.id}>
                  {g.id.split("@")[0]} - {g.name}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="default" onClick={listarGruposIds}>
              {t("listGroupIds")}
            </Button>
            <Button variant="default" onClick={listarParticipantes} disabled={loadingParticipants}>
              {loadingParticipants && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("listParticipants")}
            </Button>
            <Button variant="default" onClick={exportToXLS}>
              {t("exportToXLS")}
            </Button>
            <Button variant="destructive" onClick={limparCampos}>
              {t("clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ModalCriarGrupo
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        connections={connections}
      />
    </div>
  );
}
