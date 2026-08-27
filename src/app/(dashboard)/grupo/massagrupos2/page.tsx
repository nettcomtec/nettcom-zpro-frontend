"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  changeDescriptions,
  changeTitles,
  changePicturesUrl,
  changePicturesFile,
  setAdminsOnlyForGroups,
  type WhatsAppGroup,
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

export default function GrupoMassaGrupos2Page() {
  const t = useTranslations("grupoMassagrupos2Page");
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedConnection, setSelectedConnection] = useState("");
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loading2, setLoading2] = useState(false);

  // Toggles
  const [titulo, setTitulo] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [descricao, setDescricao] = useState(false);
  const [novaDescricao, setNovaDescricao] = useState("");
  const [imagemUrl, setImagemUrl] = useState(false);
  const [novaImagemUrl, setNovaImagemUrl] = useState("");
  const [imagemArquivo, setImagemArquivo] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [permissao, setPermissao] = useState(false);
  const [novaPermissao, setNovaPermissao] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const addTimer = (id: ReturnType<typeof setTimeout>) => timers.current.push(id);
  const clearAllTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => () => clearAllTimers(), []);

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
          .map((w) => ({ label: w.name, value: w.id }))
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
    toast.warning(t("fieldsCleared"));
    const id = setTimeout(() => window.location.reload(), 500);
    addTimer(id);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
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

    setLoading2(true);
    const groupIds = selectedGroups.map((g) => g.id);
    const whatsappId = Number(selectedConnection);

    try {
      if (titulo) {
        if (!novoTitulo.trim()) {
          toast.warning(t("warningFillTitle"));
          setLoading2(false);
          return;
        }
        await changeTitles({ whatsappId, groupIds, title: novoTitulo });
      }
      if (descricao) {
        if (!novaDescricao.trim()) {
          toast.warning(t("warningFillDescription"));
          setLoading2(false);
          return;
        }
        await changeDescriptions({ whatsappId, groupIds, description: novaDescricao });
      }
      if (imagemUrl) {
        if (!novaImagemUrl.trim()) {
          toast.warning(t("warningFillImageUrl"));
          setLoading2(false);
          return;
        }
        await changePicturesUrl({ whatsappId, groupIds, picture: novaImagemUrl });
      }
      if (imagemArquivo) {
        if (!file) {
          toast.warning(t("warningSelectImageFile"));
          setLoading2(false);
          return;
        }
        const formData = new FormData();
        formData.append("whatsappId", String(whatsappId));
        formData.append("arrayGroupIds", groupIds.toString());
        formData.append("medias", file, file.name);
        await changePicturesFile(formData);
      }
      if (permissao) {
        await setAdminsOnlyForGroups({ whatsappId, groupIds, adminsOnly: novaPermissao });
      }

      toast.success(t("groupsModified"));
      setLoading2(false);
      limparCampos();
    } catch {
      toast.error(t("errorModifyGroups"));
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

        {/* Toggle: Change title */}
        <div className="flex items-center gap-3">
          <Switch checked={titulo} onCheckedChange={setTitulo} id="toggle-titulo" />
          <Label htmlFor="toggle-titulo">{t("toggleChangeTitle")}</Label>
        </div>
        {titulo && (
          <Textarea
            placeholder={t("placeholderNewTitle")}
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            rows={2}
          />
        )}

        {/* Toggle: Change description */}
        <div className="flex items-center gap-3">
          <Switch checked={descricao} onCheckedChange={setDescricao} id="toggle-descricao" />
          <Label htmlFor="toggle-descricao">{t("toggleChangeDescription")}</Label>
        </div>
        {descricao && (
          <Textarea
            placeholder={t("placeholderNewDescription")}
            value={novaDescricao}
            onChange={(e) => setNovaDescricao(e.target.value)}
            rows={2}
          />
        )}

        {/* Toggle: Change image URL */}
        <div className="flex items-center gap-3">
          <Switch checked={imagemUrl} onCheckedChange={setImagemUrl} id="toggle-imagem-url" />
          <Label htmlFor="toggle-imagem-url">{t("toggleChangeImageUrl")}</Label>
        </div>
        {imagemUrl && (
          <Textarea
            placeholder={t("placeholderImageUrl")}
            value={novaImagemUrl}
            onChange={(e) => setNovaImagemUrl(e.target.value)}
            rows={2}
          />
        )}

        {/* Toggle: Change image file */}
        <div className="flex items-center gap-3">
          <Switch
            checked={imagemArquivo}
            onCheckedChange={setImagemArquivo}
            id="toggle-imagem-arquivo"
          />
          <Label htmlFor="toggle-imagem-arquivo">{t("toggleChangeImageFile")}</Label>
        </div>
        {imagemArquivo && (
          <Input type="file" accept="image/*" onChange={handleFileUpload} />
        )}

        {/* Toggle: Change permission */}
        <div className="flex items-center gap-3">
          <Switch checked={permissao} onCheckedChange={setPermissao} id="toggle-permissao" />
          <Label htmlFor="toggle-permissao">{t("toggleChangePermission")}</Label>
        </div>
        {permissao && (
          <div className="flex items-center gap-3 pl-2">
            <Switch
              checked={novaPermissao}
              onCheckedChange={setNovaPermissao}
              id="toggle-apenas-admins"
            />
            <Label htmlFor="toggle-apenas-admins">{t("labelAdminsOnly")}</Label>
          </div>
        )}

        {/* Loading indicator */}
        {loading2 && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("modifyingGroups")}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={enviar} disabled={loading2}>
            {loading2 && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("modify")}
          </Button>
          <Button variant="destructive" onClick={limparCampos}>
            {t("clear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
