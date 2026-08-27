"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { displayContactIdentity } from "@/lib/contact-identity";
import { PageHeader } from "@/components/layout/page-header";
import { ContactAvatar } from "@/components/contact-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Cake, Search, MessageCircle, ChevronLeft, ChevronRight, Send, Gift, AlertTriangle, CalendarCheck, Pencil, Check, X, Loader2, Trash2 } from "lucide-react";
import { BirthdayAuditDialog } from "@/components/birthday/birthday-audit-dialog";
import { toast } from "sonner";
import { fetchBirthdayContacts, sendBirthdayMessage, fixBirthdayDates, type Contact, type WhatsappOption, type BirthdaySortKey } from "@/services/contacts";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { cn } from "@/lib/utils";
import { useTableDensity } from "@/hooks/use-table-density";
import { TableDensityToggle } from "@/components/ui/table-density-toggle";
import type { SortDir } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { NewConversationDialog } from "@/components/layout/header";
import { useLocale } from "@/i18n/locale-provider";
import { useLiveMode } from "@/hooks/use-live-mode";
import { calculateAge, daysUntilBirthday, formatBirthdayDisplay, formatBirthdayInput } from "@/lib/birthday-format";

function getContactBirthDate(contact: Contact): string | null {
  return contact.birthdayDate || contact.birthDate || null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Edicao inline da data de aniversario direto na tabela. Atualiza SO o
// birthdayDate (endpoint dedicado fixBirthdayDates), sem passar pela validacao
// de number/outros campos do contato.
function BirthdayCellEditor({
  contactId,
  value,
  blur,
  onSaved,
}: {
  contactId: number;
  value: string;
  blur: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("aniversariosPage");
  const [mode, setMode] = useState<"view" | "edit" | "confirmRemove">("view");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = ISO_DATE_RE.test(draft);

  const startEdit = () => {
    setDraft(formatBirthdayInput(value));
    setMode("edit");
  };

  const save = async () => {
    if (!valid) {
      toast.error(t("dateUpdateError"));
      return;
    }
    setSaving(true);
    try {
      const { data } = await fixBirthdayDates([{ contactId, birthdayDate: draft }]);
      if (data?.updated > 0) {
        toast.success(t("dateUpdated"));
        setMode("view");
        onSaved();
      } else {
        toast.error(t("dateUpdateError"));
      }
    } catch {
      toast.error(t("dateUpdateError"));
    } finally {
      setSaving(false);
    }
  };

  // Remove a data (envia null explicito -> backend limpa o campo). Depois o
  // contato sai da lista (so lista quem tem birthdayDate).
  const remove = async () => {
    setSaving(true);
    try {
      const { data } = await fixBirthdayDates([{ contactId, birthdayDate: null }]);
      if (data?.updated > 0) {
        toast.success(t("dateRemoved"));
        setMode("view");
        onSaved();
      } else {
        toast.error(t("dateUpdateError"));
      }
    } catch {
      toast.error(t("dateUpdateError"));
    } finally {
      setSaving(false);
    }
  };

  if (mode === "edit") {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          className="h-8 w-[150px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={save}
          disabled={saving || !valid}
          title={t("saveDate")}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setMode("view")}
          disabled={saving}
          title={t("cancel")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (mode === "confirmRemove") {
    return (
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">{t("confirmRemove")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive"
          onClick={remove}
          disabled={saving}
          title={t("removeDate")}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setMode("view")}
          disabled={saving}
          title={t("cancel")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className={cn(blur && "live-blur-text")}>{formatBirthdayDisplay(value)}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-60 hover:opacity-100"
        onClick={startEdit}
        title={t("editDate")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-60 hover:opacity-100 hover:text-destructive"
        onClick={() => setMode("confirmRemove")}
        title={t("removeDate")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function AniversariosPage() {
  const t = useTranslations("aniversariosPage");
  const tErrors = useTranslations("errors");
  const allowed = usePageAccess("aniversarios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  const { density, updateDensity, rowClassName, cellClassName } = useTableDensity();
  const { isLiveMode } = useLiveMode();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(0);

  // WhatsApp sessions eligible for birthday messages
  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const [whatsappOptions, setWhatsappOptions] = useState<WhatsappOption[]>([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWhatsappId, setSelectedWhatsappId] = useState("");
  const [sending, setSending] = useState(false);

  // Filtro por mes do aniversario (client-side, sobre a pagina ja carregada).
  // "all" = todos; "0".."11" = mes (Janeiro..Dezembro)
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Ordenacao SERVER-SIDE: antes o clique no cabecalho reordenava so os 40
  // contatos da pagina carregada, entao "Dias restantes" nunca trazia o proximo
  // aniversariante da base -- so o mais proximo daquela pagina. Agora a chave vai
  // pro backend, que ordena o resultado inteiro e devolve a pagina certa.
  const [sortKey, setSortKey] = useState<BirthdaySortKey>("daysUntil");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: string) => {
    const next = key as BirthdaySortKey;
    setSortDir(sortKey === next ? (sortDir === "asc" ? "desc" : "asc") : "asc");
    setSortKey(next);
    setPage(1);
  };

  // Dialog de nova conversa: substitui o window.open(/atendimento?contact=...)
  // que nao criava ticket. Usa o mesmo NewConversationDialog do header,
  // que ja trata 409 (ticket existente) e cria/abre o atendimento.
  const [conversationContact, setConversationContact] = useState<Contact | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);

  // Dialog de revisao/correcao de datas de aniversario possivelmente incorretas.
  const [auditOpen, setAuditOpen] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cliques seguidos no cabecalho disparam varias buscas; so a ultima pode pintar
  // a tabela (senao uma resposta antiga sobrescreve a ordem recem-pedida).
  const requestSeqRef = useRef(0);

  const loadContacts = useCallback(async (
    searchParam: string,
    pageNumber: number,
    monthParam: string,
    sortKeyParam: BirthdaySortKey,
    sortDirParam: SortDir,
  ) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const { data } = await fetchBirthdayContacts({
        searchParam,
        pageNumber,
        month: monthParam && monthParam !== "all" ? monthParam : undefined,
        sortKey: sortKeyParam,
        sortDir: sortDirParam,
      });
      if (seq !== requestSeqRef.current) return;
      setContacts(data.contacts || []);
      setCount(data.count || (data.contacts?.length ?? 0));
      setHasMore(data.hasMore || false);
    } catch {
      if (seq !== requestSeqRef.current) return;
      toast.error(t("errorLoad"));
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paginacao + troca de mes + ordenacao (tudo server-side, sobre TODA a base).
  useEffect(() => {
    loadContacts(search, page, monthFilter, sortKey, sortDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, monthFilter, sortKey, sortDir]);

  // Busca com debounce -> volta pra pagina 1 (tambem server-side).
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      loadContacts(search, 1, monthFilter, sortKey, sortDir);
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchWhatsapps()
      .then((res) => {
        const all: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
        // Filter: connected + birthdayDate enabled, same types as Vue
        const allowedTypes = ["whatsapp", "waba", "instagram", "baileys", "zapo", "evo", "evogo", "meow", "uazapi", "zapi"];
        const eligible = all.filter(
          (w) =>
            allowedTypes.includes(w.type) &&
            !("isDeleted" in w && (w as unknown as { isDeleted: boolean }).isDeleted) &&
            w.status === "CONNECTED" &&
            w.birthdayDate === "enabled"
        );
        setWhatsapps(eligible);
        setWhatsappOptions(
          eligible.map((w) => ({
            label: w.name,
            value: w.id,
            type: w.type,
            tokenAPI: w.tokenAPI || null,
            fbPageId: w.fbPageId || null,
          }))
        );
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleSendBirthday = async () => {
    const option = whatsappOptions.find((o) => String(o.value) === selectedWhatsappId);
    if (!option) {
      toast.error(t("errorSelectConnection"));
      return;
    }
    setSending(true);
    try {
      await sendBirthdayMessage(option);
      toast.success(t("successSent"));
    } catch {
      toast.error(t("errorSend"));
    } finally {
      setSending(false);
      setIsModalOpen(false);
    }
  };

  // Busca, filtro de mes e ORDENACAO agora sao server-side (cobrem TODA a base,
  // nao so a pagina carregada). Aqui so mantemos contatos com data e
  // enriquecemos com idade/dias restantes para exibicao -- sem reordenar, senao
  // a ordem do servidor seria embaralhada dentro da pagina de novo.
  const enriched = contacts
    .filter((c) => Boolean(getContactBirthDate(c)))
    .map((c) => {
      const bd = getContactBirthDate(c)!;
      return {
        ...c,
        age: calculateAge(bd),
        daysUntil: daysUntilBirthday(bd),
        resolvedBirthDate: bd,
      };
    });

  // Lista de meses localizada via Intl + locale do next-intl (evita mismatch SSR/CSR
  // que ocorreria com `undefined` quando o locale do navegador != locale do servidor).
  const { locale } = useLocale();
  const monthOptions = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: String(i),
      label: new Date(2000, i, 1).toLocaleString(locale, { month: "long" }),
    }));
  }, [locale]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2"), t("helpS1I3")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button variant="outline" onClick={() => setAuditOpen(true)}>
          <CalendarCheck className="mr-2 h-4 w-4" />
          {t("reviewButton")}
        </Button>
        <Button onClick={handleOpenModal} variant="default">
          <Gift className="mr-2 h-4 w-4" />
          {t("sendButton")}
        </Button>
      </PageHeader>

      {/* Send birthday message modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("modalTitle")}</DialogTitle>
            <DialogDescription>
              {t("modalDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{t("modalWarning")}</span>
          </div>

          {sending && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("sending")}</p>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary animate-[loading_1s_ease-in-out_infinite]" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>{t("connectionLabel")}</Label>
            <SearchableSelect
              options={whatsappOptions.map((opt) => ({ value: String(opt.value), label: opt.label }))}
              value={selectedWhatsappId}
              onValueChange={setSelectedWhatsappId}
              placeholder={t("connectionPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={sending}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSendBirthday}
              disabled={sending || !selectedWhatsappId || selectedWhatsappId === "_none"}
            >
              {sending ? (
                t("sending")
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> {t("send")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("monthFilterPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("monthFilterAll")}</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{count} {t("contactCount")}</Badge>
        <TableDensityToggle density={density} onChange={updateDensity} />
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[400px]" />
        </div>
      ) : enriched.length === 0 ? (
        <EmptyState
          icon={Cake}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colName")}</SortableTableHead>
                    <SortableTableHead sortKey="number" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colNumber")}</SortableTableHead>
                    <SortableTableHead sortKey="birthdayDate" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colBirthDate")}</SortableTableHead>
                    <SortableTableHead sortKey="age" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colAge")}</SortableTableHead>
                    <SortableTableHead sortKey="daysUntil" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDaysLeft")}</SortableTableHead>
                    <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enriched.map((contact) => (
                    <TableRow key={contact.id} className={rowClassName}>
                      <TableCell className={cn("font-medium", cellClassName)}>
                        <div className="flex items-center gap-2">
                          <ContactAvatar
                            name={contact.name}
                            profilePicUrl={contact.profilePicUrl}
                            sizeClassName="h-8 w-8"
                            fallbackClassName="bg-muted text-xs font-bold"
                            blur={isLiveMode}
                            alt={contact.name}
                          />
                          <span className={cn(isLiveMode && "live-blur-text")}>{contact.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn(cellClassName, isLiveMode && "live-blur-text")}>{displayContactIdentity(contact)}</TableCell>
                      <TableCell className={cellClassName}>
                        <BirthdayCellEditor
                          contactId={contact.id}
                          value={contact.resolvedBirthDate}
                          blur={isLiveMode}
                          onSaved={() => loadContacts(search, page, monthFilter, sortKey, sortDir)}
                        />
                      </TableCell>
                      <TableCell className={cellClassName}>{contact.age != null ? `${contact.age} ${t("years")}` : "—"}</TableCell>
                      <TableCell className={cellClassName}>
                        {contact.daysUntil === 0 ? (
                          <Badge className="bg-green-500 text-white">{t("today")}</Badge>
                        ) : contact.daysUntil <= 7 ? (
                          <Badge variant="destructive">{contact.daysUntil} {t("days")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{contact.daysUntil} {t("days")}</span>
                        )}
                      </TableCell>
                      <TableCell className={cellClassName}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t("goToAttendance")}
                          onClick={() => {
                            setConversationContact(contact);
                            setConversationOpen(true);
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("page")} {page}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      <NewConversationDialog
        open={conversationOpen}
        onOpenChange={(o) => {
          setConversationOpen(o);
          if (!o) setConversationContact(null);
        }}
        prefilledNumber={conversationContact?.number ?? null}
        prefilledContactName={conversationContact?.name ?? null}
        prefilledContactEmail={conversationContact?.email ?? null}
        lockNumber
      />

      <BirthdayAuditDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        onFixed={() => loadContacts(search, page, monthFilter, sortKey, sortDir)}
      />
    </div>
  );
}
