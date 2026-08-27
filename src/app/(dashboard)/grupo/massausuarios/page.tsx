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
import { Switch } from "@/components/ui/switch";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import {
  listGroups,
  promoteParticipantsInGroups,
  demoteParticipantsInGroups,
  addParticipantsToGroups,
  removeParticipantsFromGroups,
} from "@/services/groups";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { BulkCsvImportDialog } from "@/components/massa/bulk-csv-import-dialog";

const GROUP_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "evo", "evogo", "zapi", "uazapi", "meow"];

interface ConnectionOption {
  label: string;
  value: number;
  type: string;
}

interface GroupOption {
  id: string;
  name: string;
}

export default function GrupoMassaUsuariosPage() {
  const t = useTranslations("grupoMassausuariosPage");
  const tCsv = useTranslations("bulkCsvImport");
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedConnectionType, setSelectedConnectionType] = useState("");
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loading2, setLoading2] = useState(false);

  // Action toggles (mutually exclusive)
  const [promover, setPromover] = useState(false);
  const [demover, setDemover] = useState(false);
  const [adicionar, setAdicionar] = useState(false);
  const [remover, setRemover] = useState(false);

  const [numberInput, setNumberInput] = useState("");
  const [csvImport, setCsvImport] = useState<{ fileName: string; content: string } | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addTimer = (id: ReturnType<typeof setTimeout>) => timers.current.push(id);
  const clearAllTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => () => clearAllTimers(), []);

  // Mutually exclusive toggles
  const handlePromover = (v: boolean) => {
    setPromover(v);
    if (v) { setDemover(false); setAdicionar(false); setRemover(false); }
  };
  const handleDemover = (v: boolean) => {
    setDemover(v);
    if (v) { setPromover(false); setAdicionar(false); setRemover(false); }
  };
  const handleAdicionar = (v: boolean) => {
    setAdicionar(v);
    if (v) { setPromover(false); setDemover(false); setRemover(false); }
  };
  const handleRemover = (v: boolean) => {
    setRemover(v);
    if (v) { setPromover(false); setDemover(false); setAdicionar(false); }
  };

  const anyActionSelected = promover || demover || adicionar || remover;

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWhatsapps();
      const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const all = filterWhatsappsForCurrentUser(raw);
      setConnections(
        all
          .filter(
            (w) =>
              GROUP_CHANNEL_TYPES.includes((w.type || "").toLowerCase()) &&
              w.status === "CONNECTED"
          )
          .map((w) => ({ label: w.name, value: w.id, type: w.type || "" }))
      );
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
    const conn = connections.find((c) => String(c.value) === val);
    setSelectedConnectionType(conn?.type || "");
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

  const limparCampos = () => {
    setSelectedGroups([]);
    setGroupOptions([]);
    setSelectedConnection("");
    setNumberInput("");
    toast.warning(t("fieldsCleared"));
    const id = setTimeout(() => window.location.reload(), 500);
    addTimer(id);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt")) {
      toast.warning(tCsv("onlyCsvTxtAccepted"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvImport({ fileName: f.name, content: String(ev.target?.result ?? "") });
    };
    reader.readAsText(f, "UTF-8");
  };

  const enviar = async () => {
    if (!selectedConnection) {
      toast.warning(t("warningSelectConnection"));
      return;
    }
    if (selectedGroups.length === 0) {
      toast.warning(t("warningSelectGroup"));
      return;
    }
    if (!numberInput.trim()) {
      toast.warning(t("warningFillNumbers"));
      return;
    }

    setLoading2(true);
    const groupIds = selectedGroups.map((g) => g.id);
    const whatsappId = Number(selectedConnection);
    const participants = numberInput.split(",").map((n) => n.trim()).filter(Boolean);

    try {
      if (promover) {
        await promoteParticipantsInGroups({ whatsappId, groupIds, participants });
      }
      if (demover) {
        await demoteParticipantsInGroups({ whatsappId, groupIds, participants });
      }
      if (adicionar) {
        await addParticipantsToGroups({ whatsappId, groupIds, participants });
      }
      if (remover) {
        await removeParticipantsFromGroups({ whatsappId, groupIds, participants });
      }
      toast.success(t("actionExecuted"));
      setLoading2(false);
      limparCampos();
    } catch {
      toast.error(t("errorExecuteAction"));
      setLoading2(false);
    }
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
        {/* Connection + Groups */}
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

        {/* Action toggles */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch checked={promover} onCheckedChange={handlePromover} id="toggle-promover" />
            <Label htmlFor="toggle-promover">{t("togglePromote")}</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={demover} onCheckedChange={handleDemover} id="toggle-demover" />
            <Label htmlFor="toggle-demover">{t("toggleDemote")}</Label>
          </div>
          {/* Add users: not available for baileys/zapo */}
          {selectedConnectionType !== "baileys" && selectedConnectionType !== "zapo" && (
            <div className="flex items-center gap-3">
              <Switch checked={adicionar} onCheckedChange={handleAdicionar} id="toggle-adicionar" />
              <Label htmlFor="toggle-adicionar">{t("toggleAdd")}</Label>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={remover} onCheckedChange={handleRemover} id="toggle-remover" />
            <Label htmlFor="toggle-remover">{t("toggleRemove")}</Label>
          </div>
        </div>

        {/* Number inputs */}
        {anyActionSelected && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 grid gap-2">
              <Label>{t("labelNumbers")}</Label>
              <Input
                placeholder="5511999999999,5511888888888"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("labelImportCSV")}</Label>
              <Input type="file" accept=".csv,.txt" onChange={handleCSVUpload} />
              <BulkCsvImportDialog
                open={!!csvImport}
                onOpenChange={(o) => {
                  if (!o) setCsvImport(null);
                }}
                fileName={csvImport?.fileName ?? ""}
                content={csvImport?.content ?? ""}
                mode="allFields"
                minDigits={8}
                maxDigits={20}
                onImport={({ text }) => {
                  setNumberInput(text);
                  toast.success(t("csvImported"));
                  setCsvImport(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading2 && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("executingActions")}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={enviar} disabled={loading2}>
            {loading2 && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("execute")}
          </Button>
          <Button variant="destructive" onClick={limparCampos}>
            {t("clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
