"use client";

import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { listGroups, type WhatsAppGroup } from "@/services/groups";

const GROUP_COMPATIBLE_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow"];

interface GroupConnectionSelectProps {
  groupId: string;
  onChange: (groupId: string) => void;
  onWhatsappIdChange?: (whatsappId: string) => void;
  labelConnection?: string;
  labelGroup?: string;
}

export function GroupConnectionSelect({
  groupId,
  onChange,
  onWhatsappIdChange,
  labelConnection = "Conexão",
  labelGroup = "Grupo",
}: GroupConnectionSelectProps) {
  const [sessions, setSessions] = useState<Whatsapp[]>([]);
  const [selectedWhatsappId, setSelectedWhatsappId] = useState<string>("");
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    fetchWhatsapps()
      .then(({ data }) => {
        const connected = (Array.isArray(data) ? data : []).filter(
          (w) =>
            GROUP_COMPATIBLE_TYPES.includes((w.type || "").toLowerCase()) &&
            w.status === "CONNECTED"
        );
        setSessions(connected);
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  const handleSelectSession = async (id: string) => {
    setSelectedWhatsappId(id);
    onWhatsappIdChange?.(id);
    onChange(""); // reset group when session changes
    setGroups([]);
    if (!id) return;
    setLoadingGroups(true);
    try {
      const { data } = await listGroups({ whatsappId: Number(id) });
      const list = (data as any)?.groups ?? data;
      const arr: WhatsAppGroup[] = Array.isArray(list) ? list : [];
      arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setGroups(arr);
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label>{labelConnection}</Label>
        {loadingSessions ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões...
          </div>
        ) : (
          <Select value={selectedWhatsappId} onValueChange={handleSelectSession}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma conexão" />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <SelectItem value="_none" disabled>
                  Nenhuma conexão disponível
                </SelectItem>
              ) : (
                sessions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-2">
        <Label>{labelGroup}</Label>
        {loadingGroups ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...
          </div>
        ) : (
          <Select
            value={groupId}
            onValueChange={onChange}
            disabled={!selectedWhatsappId || groups.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !selectedWhatsappId
                    ? "Selecione uma conexão primeiro"
                    : groups.length === 0
                    ? "Nenhum grupo encontrado"
                    : "Selecione um grupo"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
