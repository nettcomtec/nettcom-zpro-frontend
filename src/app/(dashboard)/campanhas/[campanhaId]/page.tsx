"use client";

import { formatDateTime } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { displayContactIdentity } from "@/lib/contact-identity";
import { useParams, useRouter } from "next/navigation";
import { format, sub } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Users, ArrowLeft, Search, RefreshCw, Plus, Trash2, ChevronDown, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchCampaign, fetchCampaignContacts, addCampaignContacts,
  deleteCampaignContact, deleteAllCampaignContacts, fetchContactsReportCampaign,
} from "@/services/campaigns";
import { fetchTags } from "@/services/tags";
import { fetchAllUsers } from "@/services/users";
import { estadosBR } from "@/lib/constants";
import { AddressFilterFields } from "@/components/contatos/address-filter-fields";
import {
  type AddressFilter,
  AddressFilterUnsupportedError,
  EMPTY_ADDRESS_FILTER,
  assertAddressFilterEcho,
  sameAddressFilter,
  toAddressQuery,
} from "@/lib/address-filter";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CampaignContact {
  id: number;
  name: string;
  number: string;
  campaignContacts?: { ack: number; body?: string; messageRandom?: string }[];
  tags?: { id: number; name: string; tag?: string }[];
}

interface ContactForAdd {
  id: number;
  name: string;
  number: string;
  tags?: { id: number; name: string; tag?: string }[];
}

interface CampaignDetail {
  id: number;
  name: string;
  status: string;
  contactsCount?: number;
  sentCount?: number;
  recebidas?: number;
  failedCount?: number;
  start?: string;
  message1?: string;
  message2?: string;
  message3?: string;
}

type TFunc = (key: string) => string;

function getAckLabels(t: TFunc): Record<string | number, string> {
  return {
    "-1": t("ackError"),
    0: t("ackPendingSend"),
    1: t("ackPendingDelivery"),
    2: t("ackReceived"),
    3: t("ackRead"),
    4: t("ackPlayed"),
  };
}

// Registro pulado pelo backend (crossChannelTicketCheck): destinatário já em
// atendimento (ticket open/pending) → ack = -1 + body/messageRandom = "active_conversation".
// Não é erro real; exibir rótulo próprio e nunca vazar a string crua.
const ACTIVE_CONVERSATION_SKIP = "active_conversation";

function isSkippedActiveConversation(
  rec?: { ack?: number; body?: string; messageRandom?: string } | null
): boolean {
  return (
    rec?.ack === -1 &&
    (rec?.body === ACTIVE_CONVERSATION_SKIP || rec?.messageRandom === ACTIVE_CONVERSATION_SKIP)
  );
}

function getStatusMap(t: TFunc): Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> {
  return {
    pending: { label: t("statusPending"), variant: "secondary" },
    scheduled: { label: t("statusScheduled"), variant: "outline" },
    processing: { label: t("statusInProgress"), variant: "default" },
    running: { label: t("statusInProgress"), variant: "default" },
    finished: { label: t("statusCompleted"), variant: "secondary" },
    completed: { label: t("statusCompleted"), variant: "secondary" },
    canceled: { label: t("statusCancelled"), variant: "destructive" },
    cancelled: { label: t("statusCancelled"), variant: "destructive" },
    failed: { label: t("statusFailed"), variant: "destructive" },
  };
}

function formatDate(d: string) {
  if (!d) return "—";
  return formatDateTime(new Date(d));
}

// ─── Add Contacts Dialog ──────────────────────────────────────────────────────

interface AddContactsDialogProps {
  open: boolean;
  campaignId: number;
  onClose: () => void;
  onAdded: () => void;
}

function AddContactsDialog({ open, campaignId, onClose, onAdded }: AddContactsDialogProps) {
  const t = useTranslations("campanhasDetailPage");
  const tErrors = useTranslations("errors");
  const tAddr = useTranslations("addressFilter");
  const [tags, setTags] = useState<{ id: number; name: string; tag?: string }[]>([]);
  const [wallets, setWallets] = useState<{ id: number; name: string }[]>([]);
  const [filters, setFilters] = useState({
    startDate: format(sub(new Date(), { days: 30 }), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    ddds: [] as string[],
    tags: [] as number[],
    wallets: [] as number[],
    searchParam: "",
  });
  // Endereço do cadastro (bairro, cidade, UF do cadastro) APLICADO: só ele vai na busca.
  const [addressFilter, setAddressFilter] = useState<AddressFilter>(EMPTY_ADDRESS_FILTER);
  // Retrato do filtro com que a lista foi montada: "Adicionar" exige que seja o aplicado.
  const [listAddressFilter, setListAddressFilter] = useState<AddressFilter | null>(null);
  const [addressUnsupported, setAddressUnsupported] = useState(false);
  // Filtro digitado e ainda não aplicado: "Adicionar" espera o "Aplicar".
  const [addressDraftPending, setAddressDraftPending] = useState(false);
  // Geração da busca: resposta de busca velha (ou de antes de reabrir o diálogo) é descartada.
  const loadGenRef = useRef(0);
  const [contacts, setContacts] = useState<ContactForAdd[]>([]);
  const [selected, setSelected] = useState<ContactForAdd[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadGenRef.current += 1;
    setLoadingContacts(false);
    setSelected([]);
    setContacts([]);
    setListAddressFilter(null);
    setAddressUnsupported(false);
    Promise.all([fetchTags(), fetchAllUsers()]).then(([tagsRes, usersRes]) => {
      setTags((tagsRes?.data ?? []) as { id: number; name: string; tag?: string }[]);
      const usersArr = usersRes.data?.users ?? [];
      setWallets(usersArr as { id: number; name: string }[]);
    }).catch(() => { toast.error(tErrors("loadFailed")); });
  }, [open]);

  // Toda busca zera a seleção e a lista: "Todos" marcado na lista anterior nunca vira público
  // da lista nova. Sem o eco, com filtro de endereço ativo, a lista fica vazia (backend antigo
  // ignora o filtro e devolveria o público sem ele).
  const search = async (filter: AddressFilter = addressFilter) => {
    const gen = ++loadGenRef.current;
    setLoadingContacts(true);
    setSelected([]);
    setContacts([]);
    setListAddressFilter(null);
    try {
      const res = await fetchContactsReportCampaign<ContactForAdd>({
        startDate: filters.startDate,
        endDate: filters.endDate,
        ddds: filters.ddds.length ? filters.ddds : undefined,
        tags: filters.tags.length ? filters.tags : undefined,
        wallets: filters.wallets.length ? filters.wallets : undefined,
        searchParam: filters.searchParam || undefined,
        ...toAddressQuery(filter),
      });
      if (gen !== loadGenRef.current) return;
      assertAddressFilterEcho(filter, res?.data);
      const list = (res?.data?.contacts ?? res?.data ?? []) as ContactForAdd[];
      setSelected([]);
      setContacts(Array.isArray(list) ? list : []);
      setListAddressFilter(filter);
      setAddressUnsupported(false);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setSelected([]);
      setContacts([]);
      if (err instanceof AddressFilterUnsupportedError) {
        setAddressUnsupported(true);
        toast.error(tAddr("unsupported"));
        return;
      }
      toast.error(t("errorLoad"));
    } finally {
      if (gen === loadGenRef.current) setLoadingContacts(false);
    }
  };

  // Aplicar (ou limpar) o filtro de endereço refaz a busca com os demais filtros da tela.
  const handleAddressFilterChange = (next: AddressFilter) => {
    setAddressFilter(next);
    void search(next);
  };

  const toggle = (c: ContactForAdd) =>
    setSelected((prev) => prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]);

  const toggleAll = () =>
    setSelected(selected.length === contacts.length ? [] : [...contacts]);

  const handleAdd = async () => {
    if (selected.length === 0) { toast.error(t("selectAtLeastOne")); return; }
    // Lista ainda carregando, montada com outro filtro de endereço ou filtro digitado sem
    // "Aplicar": nada é gravado.
    if (loadingContacts || addressDraftPending || !sameAddressFilter(listAddressFilter, addressFilter)) {
      toast.warning(tAddr("staleList"));
      return;
    }
    setAdding(true);
    try {
      await addCampaignContacts(campaignId, selected.map((c) => ({ id: c.id, name: c.name || "" })));
      toast.success(t("contactsAddedN", { n: selected.length }));
      onAdded();
      onClose();
    } catch {
      toast.error(t("errorAddContacts"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("addContactsDialog")}</DialogTitle>
          <DialogDescription>{t("addContactsDialogDesc")}</DialogDescription>
        </DialogHeader>

        <fieldset className="rounded-lg border p-4 space-y-3 shrink-0">
          <legend className="px-2 font-medium text-sm">{t("filters")}</legend>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("startDate")}</Label>
              <Input type="date" value={filters.startDate}
                onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("endDate")}</Label>
              <Input type="date" value={filters.endDate}
                onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("tags")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between font-normal h-8 text-xs">
                    {filters.tags.length ? `${filters.tags.length} tag(s)` : t("allTags")}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 max-h-52 overflow-auto">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted text-sm">
                      <Checkbox
                        checked={filters.tags.includes(tag.id)}
                        onCheckedChange={(checked) =>
                          setFilters((p) => ({
                            ...p,
                            tags: checked ? [...p.tags, tag.id] : p.tags.filter((id) => id !== tag.id),
                          }))
                        }
                      />
                      {tag.tag || tag.name}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("wallets")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between font-normal h-8 text-xs">
                    {filters.wallets.length ? `${filters.wallets.length} carteira(s)` : t("allWallets")}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 max-h-52 overflow-auto">
                  {wallets.map((w) => (
                    <label key={w.id} className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted text-sm">
                      <Checkbox
                        checked={filters.wallets.includes(w.id)}
                        onCheckedChange={(checked) =>
                          setFilters((p) => ({
                            ...p,
                            wallets: checked ? [...p.wallets, w.id] : p.wallets.filter((id) => id !== w.id),
                          }))
                        }
                      />
                      {w.name}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1.5 sm:w-[180px] sm:shrink-0">
              <Label className="text-xs">{t("stateDdd")}</Label>
              <Select
                value={filters.ddds.join(",") || "__all__"}
                onValueChange={(v) => setFilters((p) => ({ ...p, ddds: v === "__all__" ? [] : [v] }))}
              >
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue placeholder={t("stateDdd")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allStates")}</SelectItem>
                  {estadosBR.map((e) => (
                    <SelectItem key={e.sigla} value={e.sigla}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 gap-2">
              <Input
                placeholder={t("searchNamePhone")}
                value={filters.searchParam}
                onChange={(e) => setFilters((p) => ({ ...p, searchParam: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" onClick={() => void search()} disabled={loadingContacts} className="h-8">
                {loadingContacts ? "..." : t("search")}
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            <AddressFilterFields
              value={addressFilter}
              onChange={handleAddressFilterChange}
              mode="apply"
              layout="row"
              showTitle
              disabled={adding}
              onPendingChange={setAddressDraftPending}
            />
            {addressUnsupported && (
              <p role="alert" className="text-xs text-destructive">{tAddr("unsupported")}</p>
            )}
          </div>
        </fieldset>

        <div className="flex-1 overflow-auto border rounded-lg min-h-[180px]">
          {contacts.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[120px]">
              {loadingContacts ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.length === contacts.length && contacts.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("whatsapp")}</TableHead>
                  <TableHead>{t("tags")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id} onClick={() => toggle(c)} className="cursor-pointer">
                    <TableCell>
                      <Checkbox checked={selected.some((x) => x.id === c.id)} onCheckedChange={() => toggle(c)} />
                    </TableCell>
                    <TableCell>{c.name || "—"}</TableCell>
                    <TableCell>{c.number}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(c.tags ?? []).map((tg) => tg.tag || tg.name).join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {contacts.length > 0 && (
          <p className="text-sm text-muted-foreground shrink-0">{t("selectedOf", { selected: selected.length, total: contacts.length })}</p>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleAdd} disabled={adding || loadingContacts || selected.length === 0}>
            {adding ? t("adding") : t("addNContacts", { n: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampanhaDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("campanhasDetailPage");
  const allowed = usePageAccess("campanhas");
  if (!allowed) return <AccessDenied />;
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [search, setSearch] = useState("");
  const [addContactsOpen, setAddContactsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const campaignId = Number(params.campanhaId);

  const canEdit = campaign?.status === "pending" || campaign?.status === "canceled" || !campaign?.status;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, contactsRes] = await Promise.all([
        fetchCampaign(campaignId),
        fetchCampaignContacts(campaignId),
      ]);
      const campData = campRes.data as Record<string, unknown>;
      setCampaign((campData?.campaign ?? campData) as CampaignDetail);

      const rawContacts = contactsRes.data as unknown;
      const arr = Array.isArray(rawContacts) ? rawContacts : ((rawContacts as Record<string, unknown>)?.contacts ?? []);
      setContacts(Array.isArray(arr) ? arr as CampaignContact[] : []);
    } catch {
      toast.error(t("errorLoadCampaignData"));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeleteContact = async (contactId: number) => {
    setDeletingId(contactId);
    try {
      await deleteCampaignContact(campaignId, contactId);
      toast.success(t("contactRemoved"));
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch {
      toast.error(t("errorRemoveContact"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await deleteAllCampaignContacts(campaignId);
      toast.success(t("allContactsRemoved"));
      setContacts([]);
      setClearAllOpen(false);
      loadData();
    } catch {
      toast.error(t("errorClearContacts"));
    } finally {
      setClearingAll(false);
    }
  };

  const getAckLabel = (c: CampaignContact) => {
    const cc = c.campaignContacts?.[0];
    const ack = cc?.ack;
    if (ack == null) return "—";
    if (isSkippedActiveConversation(cc)) return t("ackSkippedActiveConversation");
    return getAckLabels(t as TFunc)[String(ack)] ?? `ACK ${ack}`;
  };

  const getAckVariant = (c: CampaignContact): "default" | "secondary" | "destructive" | "outline" => {
    const cc = c.campaignContacts?.[0];
    const ack = cc?.ack;
    if (ack === 2 || ack === 3 || ack === 4) return "default";
    if (ack === -1) return isSkippedActiveConversation(cc) ? "outline" : "destructive";
    return "secondary";
  };

  const filtered = contacts.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.number || "").includes(search)
  );

  const total = contacts.length;
  const delivered = contacts.filter((c) => {
    const ack = c.campaignContacts?.[0]?.ack;
    return ack === 2 || ack === 3 || ack === 4;
  }).length;
  const pending = contacts.filter((c) => {
    const ack = c.campaignContacts?.[0]?.ack;
    return ack === 0 || ack == null;
  }).length;
  const failed = contacts.filter((c) => c.campaignContacts?.[0]?.ack === -1).length;
  const progress = total > 0 ? (delivered / total) * 100 : 0;

  const st = campaign ? (getStatusMap(t as TFunc)[campaign.status] ?? { label: campaign.status, variant: "secondary" as const }) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign?.name || `${t("title").replace("#{id}", String(campaignId))}`}
        description={`${t("idLabel")} ${campaignId} · ${total} ${t("contactsCountLabel")}`}
        help={{
          description: t("helpDesc"),
          sections: [
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
          ],
        }}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {t("refresh")}
          </Button>
          <Button variant="outline" onClick={() => router.push("/campanhas")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("back")}
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("total")}</p>
                <p className="text-2xl font-bold">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("delivered")}</p>
                <p className="text-2xl font-bold text-emerald-600">{delivered}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("pending")}</p>
                <p className="text-2xl font-bold text-amber-600">{pending}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("failures")}</p>
                <p className="text-2xl font-bold text-red-500">{failed}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t("sendingProgress")}</CardTitle>
                {st && <Badge variant={st.variant}>{st.label}</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{delivered} de {total} {t("deliveredLabel")}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
              {campaign?.start && (
                <p className="text-xs text-muted-foreground mt-2">{t("startedAt")} {formatDate(campaign.start)}</p>
              )}
            </CardContent>
          </Card>

          {/* Contacts table */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchContacts")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {canEdit && (
              <>
                <Button variant="destructive" size="sm" onClick={() => setClearAllOpen(true)} disabled={contacts.length === 0}>
                  {t("clearAll")}
                </Button>
                <Button size="sm" onClick={() => setAddContactsOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> {t("addContacts")}
                </Button>
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={contacts.length === 0 ? t("noContactsLinked") : t("noContactsMatch")}
              description={contacts.length === 0 && canEdit ? t("addContactsToSend") : ""}
            >
              {contacts.length === 0 && canEdit && (
                <Button size="sm" onClick={() => setAddContactsOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> {t("addContacts")}
                </Button>
              )}
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colNumber")}</TableHead>
                      <TableHead>{t("colTags")}</TableHead>
                      <TableHead>{t("colSendStatus")}</TableHead>
                      {canEdit && <TableHead className="w-16">{t("colAction")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">{contact.name || "—"}</TableCell>
                        <TableCell>{displayContactIdentity(contact)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {(contact.tags ?? []).map((tg) => tg.tag || tg.name).join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getAckVariant(contact)}>{getAckLabel(contact)}</Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteContact(contact.id)}
                              disabled={deletingId === contact.id}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add contacts dialog */}
      {canEdit && (
        <AddContactsDialog
          open={addContactsOpen}
          campaignId={campaignId}
          onClose={() => setAddContactsOpen(false)}
          onAdded={loadData}
        />
      )}

      {/* Clear all contacts confirm */}
      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clearAllTitle")}</DialogTitle>
            <DialogDescription>
              {t("clearAllDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllOpen(false)} disabled={clearingAll}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleClearAll} disabled={clearingAll}>
              {clearingAll ? t("clearing") : t("clearAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
