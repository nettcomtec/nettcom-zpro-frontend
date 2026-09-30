"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { displayContactIdentity } from "@/lib/contact-identity";
import { cn, isValidHttpUrl } from "@/lib/utils";
import { isTicketAccessDenied } from "@/lib/ticket-access-denied";
import { OrderDetailsFields } from "@/components/common/order-details-fields";
import {
  isOrderDetailsTemplate,
  emptyOrderDetails,
  validateOrderDetails,
  buildOrderDetailsPayload,
  type OrderDetailsValue,
} from "@/lib/order-details";
import { useLiveMode } from "@/hooks/use-live-mode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, RefreshCw, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  User, Phone, Mail, Calendar, Search, X, MessageCircle, Paperclip,
  Images, Loader2, Download, Eye, MessagesSquare, UserRound,
} from "lucide-react";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactConversationDialog } from "@/components/atendimento/contact-conversation-dialog";
import { SpyContactMessagesPopover } from "@/components/atendimento/spy-contact-messages-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  fetchPipelines,
  fetchStages,
  fetchOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "@/services/funnel";
import { fetchContacts } from "@/services/contacts";
import { fetchAllUsers } from "@/services/users";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { fetchTags, type Tag as TagOption } from "@/services/tags";
import { fetchWallets, type Wallet as WalletOption } from "@/services/wallets";
import { fetchKanbans, type Kanban as KanbanOption } from "@/services/kanban";
import {
  sendIndividualMessage,
  sendWabaTemplateComponents,
  sendEmailWebmail,
  type WabaTemplate,
} from "@/services/messages";
import { type GalleryItem } from "@/services/gallery";
import { GalleryPickerWithUploadDialog, wabaHeaderFormatToGalleryParams } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { useTouchDrag } from "@/hooks/use-touch-drag";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";
import { KanbanStatsChips } from "@/components/funil/kanban-stats-chips";
import { OpportunityAlerts } from "@/components/funil/opportunity-alerts";
import { useOpportunityCalendarEvent } from "@/components/funil/opportunity-calendar-event";
import {
  daysUntilClosing, dateInputToClosingForecastISO, closingForecastToDateInput,
} from "@/lib/opportunity-date";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pipeline { id: number; name: string; }
interface Stage { id: number; name: string; pipelineId: number; color?: string; order?: number; }
interface Responsible { label: string; value: number; }
interface ContactOption { id: number; name: string; number?: string; email?: string; profilePicUrl?: string; }

interface Opportunity {
  id: number;
  name: string;
  value?: number;
  status: string;
  stageId: number;
  pipelineId: number;
  responsibleId?: number;
  contactId?: number;
  contact?: {
    id: number;
    name: string;
    number?: string;
    email?: string;
    profilePicUrl?: string;
    kanban?: number | null;
    tags?: { id: number; tag?: string; name?: string; color?: string }[];
    wallets?: { id: number; name: string }[];
    kanbanInfo?: { id: number; name: string; color?: string } | null;
  };
  closingForecast?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Filters {
  pipelineId: number | null;
  stageId: number | null;
  responsibleId: number | null;
  status: string;
  valorMin: number | null;
  valorMax: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  searchTerm: string;
  ordenacao: string;
  tagId: number | null;
  walletUserId: number | null;
  kanbanId: number | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(val?: number) {
  if (!val) return "R$ 0,00";
  return `R$ ${Number(val).toFixed(2).replace(".", ",")}`;
}

function formatDateUTC(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '""';
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

// O Excel le uma sequencia longa de digitos como numero e mostra 5,54796E+11 no
// lugar do telefone. `="..."` obriga a celula a ser texto. So entra em valor de
// telefone (digitos/sinais) para nunca transformar texto do usuario em formula.
function csvPhoneCell(value: string) {
  if (!value) return "";
  return /^[+\d][\d\s().+-]*$/.test(value) ? `="${value}"` : value;
}

function convertBRToISO(br: string) {
  if (!br) return "";
  const [d, m, y] = br.split("/");
  if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return "";
}

function convertISOToBR(iso: string) {
  if (!iso) return "";
  const short = iso.split("T")[0];
  const [y, m, d] = short.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return "";
}

function isUrgent(dateStr?: string) {
  const diffDays = daysUntilClosing(dateStr);
  if (diffDays === null) return false;
  return diffDays <= 7 && diffDays >= 0;
}

function statusColor(status: string) {
  if (status === "open") return "bg-amber-400 text-white";
  if (status === "win") return "bg-green-500 text-white";
  if (status === "lose") return "bg-red-500 text-white";
  return "bg-gray-400 text-white";
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "open") return t("statusOpen");
  if (status === "win") return t("statusWin");
  if (status === "lose") return t("statusLose");
  return status;
}

// ─── Opportunity Form ─────────────────────────────────────────────────────────

interface OpportunityFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  oportunidade: Opportunity | null;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
}

function OpportunityForm({ open, onClose, onSaved, oportunidade, pipelines, stages, responsaveis }: OpportunityFormProps) {
  const t = useTranslations("funilKanbanPage");
  const { isLiveMode } = useLiveMode();
  const [form, setForm] = useState({
    name: "",
    pipelineId: "" as string | number,
    stageId: "" as string | number,
    responsibleId: "" as string | number,
    contactId: "" as string | number,
    closingForecastBR: "",
    closingForecast: "",
    value: 0,
    description: "",
    status: "open",
  });
  const [contatoSelecionado, setContatoSelecionado] = useState<ContactOption | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gcal = useOpportunityCalendarEvent();

  const isEditing = !!oportunidade?.id;

  // Populate form when editing
  useEffect(() => {
    if (oportunidade) {
      const cf = closingForecastToDateInput(oportunidade.closingForecast);
      setForm({
        name: oportunidade.name || "",
        pipelineId: oportunidade.pipelineId || "",
        stageId: oportunidade.stageId || "",
        responsibleId: oportunidade.responsibleId || "",
        contactId: oportunidade.contactId || "",
        closingForecast: cf,
        closingForecastBR: cf ? convertISOToBR(cf) : "",
        value: oportunidade.value || 0,
        description: oportunidade.description || "",
        status: oportunidade.status || "open",
      });
      if (oportunidade.contact) {
        setContatoSelecionado(oportunidade.contact);
        setContactOptions([oportunidade.contact]);
      }
    } else {
      setForm({
        name: "", pipelineId: "", stageId: "", responsibleId: "",
        contactId: "", closingForecast: "", closingForecastBR: "",
        value: 0, description: "", status: "open",
      });
      setContatoSelecionado(null);
      setContactOptions([]);
      setContactSearch("");
    }
  }, [oportunidade, open]);

  const etapasFiltradas = stages.filter(s => String(s.pipelineId) === String(form.pipelineId));

  function onPipelineChange(val: string) {
    setForm(f => ({ ...f, pipelineId: val, stageId: "" }));
  }

  function onClosingChange(br: string) {
    setForm(f => ({ ...f, closingForecastBR: br, closingForecast: convertBRToISO(br) }));
  }

  function searchContacts(term: string) {
    setContactSearch(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (term.length < 2) return;
    searchTimeout.current = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const res = await fetchContacts({ searchParam: term });
        const contacts = res.data?.contacts ?? res.data ?? [];
        setContactOptions(Array.isArray(contacts) ? contacts : []);
      } catch {
        // ignore
      } finally {
        setLoadingContacts(false);
      }
    }, 700);
  }

  function selectContact(c: ContactOption) {
    setContatoSelecionado(c);
    setForm(f => ({ ...f, contactId: c.id }));
    setContactSearch(c.name);
    setContactOptions([]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t("nameRequired")); return; }
    setSaving(true);
    try {
      const isoShort = form.closingForecastBR ? convertBRToISO(form.closingForecastBR) : "";
      const payload = {
        ...form,
        pipelineId: form.pipelineId ? Number(form.pipelineId) : undefined,
        stageId: form.stageId ? Number(form.stageId) : undefined,
        responsibleId: form.responsibleId ? Number(form.responsibleId) : undefined,
        contactId: form.contactId ? Number(form.contactId) : undefined,
        value: Number(form.value) || 0,
        closingForecast: dateInputToClosingForecastISO(isoShort),
      };
      if (isEditing && oportunidade) {
        await updateOpportunity(oportunidade.id, payload);
        toast.success(t("updateSuccess"));
      } else {
        await createOpportunity(payload);
        toast.success(t("createSuccess"));
        gcal.askToCreateEvent({
          name: form.name,
          description: form.description,
          closingForecast: form.closingForecast,
          contactEmail: contatoSelecionado?.email,
        });
      }
      onSaved();
      onClose();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editOpportunity") : t("createOpportunity")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Nome */}
          <div className="space-y-1">
            <Label>{t("labelName")}</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("placeholderName")} required />
          </div>

          {/* Pipeline */}
          <div className="space-y-1">
            <Label>{t("labelPipeline")}</Label>
            <Select value={String(form.pipelineId || "")} onValueChange={onPipelineChange}>
              <SelectTrigger><SelectValue placeholder={t("placeholderPipeline")} /></SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <Label>{t("labelStage")}</Label>
            <Select
              value={String(form.stageId || "")}
              onValueChange={v => setForm(f => ({ ...f, stageId: v }))}
              disabled={!form.pipelineId}
            >
              <SelectTrigger><SelectValue placeholder={form.pipelineId ? t("placeholderStage") : t("placeholderStageFirst")} /></SelectTrigger>
              <SelectContent>
                {etapasFiltradas.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Responsável */}
          <div className="space-y-1">
            <Label>{t("labelResponsible")}</Label>
            <Select value={String(form.responsibleId || "")} onValueChange={v => setForm(f => ({ ...f, responsibleId: v }))}>
              <SelectTrigger><SelectValue placeholder={t("placeholderResponsible")} /></SelectTrigger>
              <SelectContent>
                {responsaveis.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Contato */}
          <div className="space-y-1">
            <Label>{t("labelContact")}</Label>
            <div className="relative">
              <Input
                value={contactSearch}
                onChange={e => searchContacts(e.target.value)}
                placeholder={t("placeholderContact")}
                disabled={isEditing}
              />
              {loadingContacts && (
                <div className="absolute right-2 top-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {contactOptions.length > 0 && !isEditing && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {contactOptions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => selectContact(c)}
                    >
                      <div className={cn("font-medium", isLiveMode && "live-blur-text")}>{c.name}</div>
                      {c.number && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.number}</div>}
                    </button>
                  ))}
                </div>
              )}
              {contatoSelecionado && !isEditing && (
                <button
                  type="button"
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setContatoSelecionado(null); setForm(f => ({ ...f, contactId: "" })); setContactSearch(""); setContactOptions([]); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {contatoSelecionado && (
              <p className="text-xs text-muted-foreground">{t("contactSelected")} <strong className={cn(isLiveMode && "live-blur-text")}>{contatoSelecionado.name}</strong></p>
            )}
          </div>

          {/* Previsão de Fechamento */}
          <div className="space-y-1">
            <Label>{t("labelClosingForecast")}</Label>
            <Input
              type="date"
              value={form.closingForecast}
              onChange={e => {
                const iso = e.target.value;
                setForm(f => ({ ...f, closingForecast: iso, closingForecastBR: iso ? convertISOToBR(iso + "T00:00:00") : "" }));
              }}
            />
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <Label>{t("labelValue")}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
              placeholder="0,00"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label>{t("labelDescription")}</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={t("placeholderDescription")}
              rows={3}
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label>{t("labelStatus")}</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("statusOpen")}</SelectItem>
                <SelectItem value="win">{t("statusWin")}</SelectItem>
                <SelectItem value="lose">{t("statusLose")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
            {isEditing && gcal.hasActiveConfigs && (
              <Button
                type="button"
                variant="outline"
                className="sm:mr-auto"
                onClick={() => gcal.openEventDialog({
                  name: form.name,
                  description: form.description,
                  closingForecast: form.closingForecast,
                  contactEmail: contatoSelecionado?.email,
                })}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {gcal.labels.createEventButton}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={saving}>
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {gcal.dialogs}
    </>
  );
}

// ─── Opportunity Details Modal ─────────────────────────────────────────────────

interface OpportunityDetailsProps {
  open: boolean;
  onClose: () => void;
  onEdit: (opp: Opportunity) => void;
  oportunidade: Opportunity | null;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
}

function OpportunityDetails({ open, onClose, onEdit, oportunidade, pipelines, stages, responsaveis }: OpportunityDetailsProps) {
  const t = useTranslations("funilKanbanPage");
  const { isLiveMode } = useLiveMode();
  if (!oportunidade) return null;

  const stage = stages.find(s => String(s.id) === String(oportunidade.stageId));
  const pipeline = pipelines.find(p => String(p.id) === String(oportunidade.pipelineId));
  const responsavel = responsaveis.find(r => String(r.value) === String(oportunidade.responsibleId));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("detailsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Informações Básicas */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("sectionBasic")}</h4>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldName")}</p>
              <p className="font-medium">{oportunidade.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldPipeline")}</p>
              <p className="font-medium">{pipeline?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldStage")}</p>
              <p className="font-medium">{stage?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldStatus")}</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(oportunidade.status)}`}>
                {statusLabel(oportunidade.status, t)}
              </span>
            </div>
          </div>

          {/* Valores e Datas */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("sectionValues")}</h4>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldValue")}</p>
              <p className="font-medium text-green-600">{formatValue(oportunidade.value)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldClosing")}</p>
              <p className="font-medium">{formatDateUTC(oportunidade.closingForecast) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldCreated")}</p>
              <p className="font-medium">{formatDateUTC(oportunidade.createdAt) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("fieldUpdated")}</p>
              <p className="font-medium">{formatDateUTC(oportunidade.updatedAt) || "—"}</p>
            </div>
          </div>

          {/* Responsável */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("sectionResponsible")}</h4>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{responsavel?.label ?? t("noResponsible")}</span>
            </div>
          </div>

          {/* Contato */}
          {oportunidade.contact && (
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("sectionContact")}</h4>
              <div className="flex items-center gap-3">
                <ContactAvatar
                  name={oportunidade.contact.name}
                  profilePicUrl={oportunidade.contact.profilePicUrl}
                  sizeClassName="w-10 h-10"
                  fallbackClassName="bg-primary text-white font-bold"
                  blur={isLiveMode}
                />
                <div>
                  <p className={cn("font-medium", isLiveMode && "live-blur-text")}>{oportunidade.contact.name}</p>
                  {displayContactIdentity(oportunidade.contact) && (
                    <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>
                      <Phone className="h-3 w-3" />{displayContactIdentity(oportunidade.contact)}
                    </div>
                  )}
                  {oportunidade.contact.email && (
                    <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>
                      <Mail className="h-3 w-3" />{oportunidade.contact.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Descrição */}
          {oportunidade.description && (
            <div className="md:col-span-2 border rounded-lg p-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("sectionDescription")}</h4>
              <p className="text-sm">{oportunidade.description}</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{t("close")}</Button>
          <Button onClick={() => onEdit(oportunidade)}>{t("edit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Message Modal ───────────────────────────────────────────────────────

interface SendMessageModalProps {
  open: boolean;
  opp: Opportunity | null;
  whatsapps: Whatsapp[];
  onClose: () => void;
}

function SendMessageModal({ open, opp, whatsapps, onClose }: SendMessageModalProps) {
  const t = useTranslations("funilKanbanPage");
  const tErrors = useTranslations("errors");
  const tOrder = useTranslations("orderDetails");
  // Seletor de status: MESMO vocabulario do dialog "Nova Conversa" (as 5 chaves ja
  // existem nos 13 locales) — reusar evita duas traducoes divergindo para a mesma escolha.
  const tHeader = useTranslations("layoutHeader");
  const tChat = useTranslations("atendimentoChat");
  const [sessionId, setSessionId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  // Status do ticket iniciado pelo card (espelha "Nova Conversa"): "open" nasce
  // atribuido ao operador; "pending" fica na fila sem dono. Sem este campo o
  // backend criava o ticket sem vinculo nenhum com quem enviou e o guard de acesso
  // barrava o proprio envio do template (403 ERR_NO_TICKET_ACCESS) para atendente.
  const [desiredStatus, setDesiredStatus] = useState<"open" | "pending">("open");
  const [loading, setLoading] = useState(false);

  // WABA state
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateVars, setTemplateVars] = useState<{ key: string; label: string; value: string }[]>([]);
  // Cobranca (template ORDER_DETAILS) — PLANO_TEMPLATE_ORDER_DETAILS.md F6.
  // Estado paralelo ao templateVars: o botao de cobranca nao gera variavel.
  const [orderDetailsValue, setOrderDetailsValue] = useState<OrderDetailsValue>(() => emptyOrderDetails());
  const [tplGalleryOpen, setTplGalleryOpen] = useState(false);

  const connectedSessions = whatsapps.filter(w =>
    w.status === "CONNECTED" && !(w.type ?? "").toLowerCase().includes("webmail")
  );
  const selectedSession = whatsapps.find(w => String(w.id) === sessionId);
  const chType = (selectedSession?.type ?? "").toLowerCase();
  const isDialog360 = chType === "dialog360";
  const isGupshup = chType === "gupshup";
  const isWabaLike = chType.includes("waba") || isDialog360 || isGupshup;

  // Reset on open
  useEffect(() => {
    if (open && opp) {
      setPhone(opp.contact?.number ?? "");
      setSessionId("");
      setMessage("");
      setSelectedTemplate(null);
      setTemplateSearch("");
      setWabaTemplates([]);
      setDesiredStatus("open");
    }
  }, [open, opp]);

  // Load templates (WABA/Dialog360/Gupshup) when session changes
  useEffect(() => {
    if (!isWabaLike || (chType.includes("waba") && !selectedSession?.tokenAPI)) {
      setWabaTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    setLoadingTemplates(true);
    import("@/services/channel-templates")
      .then(m => m.getTemplatesForChannel({ id: selectedSession!.id, type: selectedSession!.type, tokenAPI: selectedSession!.tokenAPI, appId: (selectedSession as { appId?: string })?.appId }))
      .then((res: any) => {
        const list = (Array.isArray(res) ? res : res?.data || []) as any[];
        setWabaTemplates([...list].sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())));
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [sessionId, isWabaLike, chType, selectedSession?.tokenAPI]);

  // Parse template variables when template selected
  useEffect(() => {
    // Zera a ficha de cobranca ao trocar de template (nao ha var de botao p/ ORDER_DETAILS).
    setOrderDetailsValue(emptyOrderDetails());
    if (!selectedTemplate) { setTemplateVars([]); return; }
    const vars: { key: string; label: string; value: string }[] = [];
    selectedTemplate.components?.forEach(comp => {
      if (comp.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE")
        vars.push({ key: "header_link", label: `Header (${comp.format})`, value: "" });
      if ((comp.type === "BODY" || comp.type === "HEADER") && comp.text) {
        // Variáveis WABA são numeradas independentemente por componente — prefixar key com header_/body_.
        const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
        const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
        [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].forEach(m => {
          const k = `${keyPrefix}named_${m[1]}`;
          if (!vars.some(v => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
        [...comp.text.matchAll(/\{\{(\d+)\}\}/g)].forEach(m => {
          const k = `${keyPrefix}var_${m[1]}`;
          if (!vars.some(v => v.key === k))
            vars.push({ key: k, label: `${labelPrefix}{{${m[1]}}}`, value: "" });
        });
      }
    });
    setTemplateVars(vars);
  }, [selectedTemplate]);

  // Template de cobranca: exige a ficha de pagamento no envio (sub_category/display_format/botao).
  const isOrderDetailsSelected = useMemo(
    () => isOrderDetailsTemplate(selectedTemplate),
    [selectedTemplate]
  );

  const filteredTemplates = wabaTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const pickTplGalleryItem = (item: GalleryItem) => {
    setTemplateVars(prev => prev.map(v => v.key === "header_link" ? { ...v, value: item.url } : v));
    setTplGalleryOpen(false);
  };

  function updateVar(key: string, value: string) {
    setTemplateVars(vars => vars.map(v => v.key === key ? { ...v, value } : v));
  }

  function getTemplatePreview(tpl: WabaTemplate) {
    const body = tpl.components?.find(c => c.type === "BODY");
    return body?.text?.slice(0, 80) ?? tpl.name;
  }

  async function handleSend() {
    if (!sessionId) { toast.error(t("msgSessionRequired")); return; }
    if (!phone.trim()) { toast.error(t("msgPhoneRequired")); return; }
    if (isWabaLike && !selectedTemplate) { toast.error(t("msgTemplateRequired")); return; }
    if (!isWabaLike && !message.trim()) { toast.error(t("msgTextRequired")); return; }
    if (isWabaLike && selectedTemplate) {
      const headerLinkCheck = templateVars.find(v => v.key === "header_link");
      if (headerLinkCheck && !isValidHttpUrl(headerLinkCheck.value)) { toast.error(tErrors("invalidMediaHeaderUrl")); return; }
      // Cobranca: valida antes de criar o ticket — evita ticket orfao com envio 400.
      if (isOrderDetailsSelected) {
        const orderError = validateOrderDetails(orderDetailsValue);
        if (orderError) { toast.warning(tOrder(orderError)); return; }
      }
    }

    const cleanNumber = phone.replace(/\D/g, "");
    setLoading(true);
    try {
      const res = await sendIndividualMessage({
        whatsappId: Number(sessionId),
        whatsappType: selectedSession?.type ?? "",
        number: cleanNumber,
        message: isWabaLike ? "" : message,
        desiredStatus,
      });

      if (isWabaLike && selectedTemplate) {
        const ticketId = (res.data as { ticketId?: number })?.ticketId;
        const components: Record<string, unknown>[] = [];

        const headerComp = selectedTemplate.components?.find(c => c.type === "HEADER");
        if (headerComp) {
          if (headerComp.format === "TEXT") {
            const headerPositional = templateVars.filter(v => v.key.startsWith("header_var_"));
            const headerNamed = templateVars.filter(v => v.key.startsWith("header_named_"));
            if (headerPositional.length > 0) {
              const variables: string[] = [];
              headerPositional
                .sort((a, b) => parseInt(a.key.replace("header_var_", "")) - parseInt(b.key.replace("header_var_", "")))
                .forEach((v, i) => { variables[i] = v.value.trim() || " "; });
              components.push({ type: "HEADER", format: "TEXT", variables });
            } else if (headerNamed.length > 0) {
              components.push({
                type: "HEADER",
                format: "TEXT",
                parameters: headerNamed.map(v => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("header_named_", "") })),
              });
            }
          } else {
            const hlv = templateVars.find(v => v.key === "header_link");
            if (hlv?.value)
              components.push({ type: "HEADER", format: headerComp.format, value: hlv.value });
          }
        }

        const positionalVars = templateVars.filter(v => v.key.startsWith("body_var_"));
        const namedVars = templateVars.filter(v => v.key.startsWith("body_named_"));

        if (positionalVars.length > 0) {
          const variables: string[] = [];
          positionalVars
            .sort((a, b) => parseInt(a.key.replace("body_var_", "")) - parseInt(b.key.replace("body_var_", "")))
            .forEach((v, i) => { variables[i] = v.value; });
          components.push({ type: "BODY", variables });
        } else if (namedVars.length > 0) {
          components.push({
            type: "BODY",
            parameters: namedVars.map(v => ({
              type: "text",
              text: v.value.trim() || " ",
              name: v.key.replace("body_named_", ""),
            })),
          });
        }

        const idFront = `kanban_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        // Cobranca vai como campo proprio: o backend monta, valida e injeta o
        // componente no BUTTONS. Sem cobranca o spread vira {} (no-op).
        const orderDetailsField = isOrderDetailsSelected
          ? { orderDetails: buildOrderDetailsPayload(orderDetailsValue) }
          : {};

        if (isGupshup) {
          const { sendGupshupTemplateMsg } = await import("@/services/gupshup-messages");
          await sendGupshupTemplateMsg({
            from: cleanNumber,
            ticketId,
            whatsappId: selectedSession!.id,
            tokenApi: selectedSession!.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else if (isDialog360) {
          const { sendDialog360Template } = await import("@/services/dialog360-messages");
          await sendDialog360Template({
            from: cleanNumber,
            ticketId,
            whatsappId: selectedSession!.id,
            tokenApi: selectedSession!.tokenAPI,
            idFront,
            fromMe: true,
            read: 1,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            components,
            // Mesmo array de components do ramo WABA (contrato do dataJson):
            // sem ele a bolha nao tem o que renderizar no Gupshup/Dialog360.
            dataJson: JSON.stringify(components),
            ...orderDetailsField,
          });
        } else {
          await sendWabaTemplateComponents({
            from: cleanNumber,
            tokenApi: selectedSession!.tokenAPI,
            ticketId,
            phone_number_id: selectedSession!.tokenAPI,
            language: selectedTemplate.language,
            templateName: selectedTemplate.name,
            body: JSON.stringify(selectedTemplate.components || []),
            mediaType: "templates",
            sendType: "templates",
            fromMe: true,
            components,
            dataJson: JSON.stringify(components),
            scheduleDate: null,
            quotedMsg: null,
            idFront,
            ...orderDetailsField,
          });
        }
      }

      toast.success(t("msgSentOk"));
      onClose();
    } catch (err: unknown) {
      const errCode = String((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "");
      // Cobrança: o interceptor de api.ts rejeita com a RESPOSTA (não com o
      // AxiosError), então o código chega em `data.error`. Lê as duas formas —
      // sem isso o motivo da recusa (CRC, valor, permissão) some no toast genérico.
      const chargeErrCode = String(
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        ""
      );
      if (errCode.startsWith("ERR_NUMBER_RESOLVED_MISMATCH")) {
        toast.error(tErrors("numberResolvedMismatch"));
      } else if (isTicketAccessDenied(err)) {
        // Guard de acesso do backend: o contato ja tem atendimento de outra
        // pessoa/fila. Mostra o motivo real em vez do "erro ao enviar" generico.
        toast.error(tChat("noTicketAccess"));
      } else if (chargeErrCode === "ERR_ORDER_DETAILS_NOT_SUPPORTED") {
        toast.error(tOrder("errorNotSupportedHere"));
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_NO_PERMISSION") {
        toast.error(tOrder("errorNotAllowed"));
      } else if (chargeErrCode.startsWith("ERR_ORDER_DETAILS")) {
        // A validação do formulário espelha a do backend, então um código aqui é
        // divergência real — mostra o código para o suporte em vez de engolir.
        toast.error(`${tOrder("errorSendFailed")}: ${chargeErrCode}`);
      } else if (isOrderDetailsSelected && chargeErrCode === "ERR_FEATURE_NOT_IN_PLAN") {
        // O interceptor global já avisa "recurso fora do plano" — não duplicar.
      } else {
        toast.error(t("msgSentError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90dvh] flex flex-col">
        <DialogHeader><DialogTitle>{t("msgModalTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Canal */}
          <div>
            <Label className="text-xs mb-1 block">{t("msgSession")}</Label>
            <Select value={sessionId} onValueChange={v => { setSessionId(v); setSelectedTemplate(null); setTemplateSearch(""); }}>
              <SelectTrigger><SelectValue placeholder={t("msgSessionPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {connectedSessions.length === 0
                  ? <SelectItem value="__none" disabled>{t("noSessions")}</SelectItem>
                  : connectedSessions.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name} <span className="text-muted-foreground text-xs">({w.type})</span>
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* Número */}
          <div>
            <Label className="text-xs mb-1 block">{t("msgPhone")}</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t("msgPhonePlaceholder")} />
          </div>

          {/* Canal oficial (WABA/Dialog360/Gupshup): template selector */}
          {isWabaLike && (
            <>
              <div>
                <Label className="text-xs mb-1 block">{t("msgSelectTemplate")}</Label>
                <Input
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder={t("msgTemplateSearch")}
                  className="mb-2"
                />
                {loadingTemplates ? (
                  <p className="text-xs text-muted-foreground py-2">{t("msgLoadingTemplates")}</p>
                ) : filteredTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">{t("msgNoTemplates")}</p>
                ) : (
                  <div className="border rounded-md overflow-y-auto max-h-40 divide-y">
                    {filteredTemplates.map(tpl => (
                      <button
                        key={tpl.name}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors ${selectedTemplate?.name === tpl.name ? "bg-primary/10 font-semibold" : ""}`}
                        onClick={() => setSelectedTemplate(tpl)}
                      >
                        <p className="font-medium">{tpl.name}</p>
                        <p className="text-muted-foreground truncate">{getTemplatePreview(tpl)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Variáveis do template */}
              {templateVars.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs mb-1 block">{t("msgTemplateVars")}</Label>
                  {templateVars.map(v => (
                    <div key={v.key}>
                      <Label className="text-xs mb-0.5 block text-muted-foreground">{v.label}</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          value={v.value}
                          onChange={e => updateVar(v.key, e.target.value)}
                          placeholder={v.label}
                          className="h-8 text-xs flex-1"
                        />
                        {v.key === "header_link" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            title={t("pickFromGallery")}
                            onClick={() => setTplGalleryOpen(true)}
                          >
                            <Images className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ficha de cobranca — so aparece em template ORDER_DETAILS */}
              {isOrderDetailsSelected && selectedTemplate && (
                <div className="space-y-2 border-t pt-2">
                  <div>
                    <Label className="text-xs mb-0.5 block">{tOrder("sectionTitle")}</Label>
                    <p className="text-xs text-muted-foreground">{tOrder("sectionHint")}</p>
                  </div>
                  <OrderDetailsFields
                    key={`${selectedTemplate.name}-${selectedTemplate.language}`}
                    value={orderDetailsValue}
                    onChange={setOrderDetailsValue}
                    compact
                  />
                </div>
              )}

              {/* Preview do template */}
              {selectedTemplate && (
                <div>
                  <Label className="text-xs mb-1 block">{t("msgTemplatePreview")}</Label>
                  <div className="bg-[#e5ddd5] rounded-lg p-3">
                    <div className="bg-white rounded-lg shadow-sm p-3 max-w-[90%] ml-auto space-y-1.5">
                      {selectedTemplate.components?.find(c => c.type === "HEADER") && (() => {
                        const hdr = selectedTemplate.components!.find(c => c.type === "HEADER")!;
                        if (hdr.format === "TEXT" && hdr.text) {
                          let rendered = hdr.text;
                          templateVars.filter(v => v.key.startsWith("header_var_") || v.key.startsWith("header_named_")).forEach(v => {
                            const n = v.key.startsWith("header_var_") ? v.key.replace("header_var_", "") : v.key.replace("header_named_", "");
                            rendered = rendered.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                          });
                          return <p className="font-bold text-sm text-gray-900">{rendered}</p>;
                        }
                        if (hdr.format === "IMAGE") return <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Imagem]</div>;
                        if (hdr.format === "VIDEO") return <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Video]</div>;
                        if (hdr.format === "DOCUMENT") return <div className="h-10 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Documento]</div>;
                        return null;
                      })()}
                      {selectedTemplate.components?.find(c => c.type === "BODY")?.text && (() => {
                        let text = selectedTemplate.components!.find(c => c.type === "BODY")!.text!;
                        templateVars.filter(v => v.key.startsWith("body_var_") || v.key.startsWith("body_named_")).forEach(v => {
                          const n = v.key.startsWith("body_var_") ? v.key.replace("body_var_", "") : v.key.replace("body_named_", "");
                          text = text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), v.value || `{{${n}}}`);
                        });
                        return <p className="text-sm whitespace-pre-wrap text-gray-800">{text}</p>;
                      })()}
                      {selectedTemplate.components?.find(c => c.type === "FOOTER")?.text && (
                        <p className="text-xs text-gray-400">{selectedTemplate.components!.find(c => c.type === "FOOTER")!.text}</p>
                      )}
                      {selectedTemplate.components?.find(c => c.type === "BUTTONS")?.buttons && (
                        <div className="border-t border-gray-200 pt-1.5 mt-1 space-y-1">
                          {selectedTemplate.components!.find(c => c.type === "BUTTONS")!.buttons!.map((btn, i) => (
                            <div key={i} className="text-center text-xs text-blue-500 py-0.5 border border-gray-200 rounded">{btn.text}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Não-oficial: textarea de mensagem */}
          {!isWabaLike && sessionId && (
            <div>
              <Label className="text-xs mb-1 block">{t("msgText")}</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={t("msgTextPlaceholder")} rows={4} />
            </div>
          )}

          {/* Status do atendimento — ultima escolha antes de Enviar, igual ao dialog
              "Nova Conversa". Define se o ticket nasce com o operador ou fica na fila. */}
          <div className="space-y-2">
            <Label>{tHeader("newConversation.statusLabel")}</Label>
            <RadioGroup
              value={desiredStatus}
              onValueChange={(v) => setDesiredStatus(v as "open" | "pending")}
              className="grid grid-cols-2 gap-2"
            >
              <label className={cn(
                "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                desiredStatus === "open" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}>
                <RadioGroupItem value="open" id="funil-status-open" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium leading-none">{tHeader("newConversation.statusOpen")}</div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{tHeader("newConversation.statusOpenDesc")}</p>
                </div>
              </label>
              <label className={cn(
                "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                desiredStatus === "pending" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}>
                <RadioGroupItem value="pending" id="funil-status-pending" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium leading-none">{tHeader("newConversation.statusPending")}</div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{tHeader("newConversation.statusPendingDesc")}</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Gallery picker for template header */}
    <GalleryPickerWithUploadDialog
      open={tplGalleryOpen}
      onOpenChange={setTplGalleryOpen}
      onPick={pickTplGalleryItem}
      {...wabaHeaderFormatToGalleryParams(
        selectedTemplate?.components?.find((c) => c.type === "HEADER")?.format
      )}
    />
    </>
  );
}

// ─── Send Email Modal ─────────────────────────────────────────────────────────

interface SendEmailModalProps {
  open: boolean;
  opp: Opportunity | null;
  whatsapps: Whatsapp[];
  onClose: () => void;
}

function SendEmailModal({ open, opp, whatsapps, onClose }: SendEmailModalProps) {
  const t = useTranslations("funilKanbanPage");
  const [channelId, setChannelId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const webmailChannels = whatsapps.filter(w =>
    w.status === "CONNECTED" && (w.type ?? "").toLowerCase().includes("webmail")
  );

  useEffect(() => {
    if (open && opp) {
      setTo(opp.contact?.email ?? "");
      setChannelId(webmailChannels.length === 1 ? String(webmailChannels[0].id) : "");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setFiles([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opp]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  async function handleSend() {
    if (!channelId) { toast.error(t("emailChannelRequired")); return; }
    if (!to.trim()) { toast.error(t("emailToRequired")); return; }
    if (!subject.trim()) { toast.error(t("emailSubjectRequired")); return; }
    if (!body.trim()) { toast.error(t("emailBodyRequired")); return; }
    setLoading(true);
    try {
      const ccList = cc.trim() ? cc.split(",").map(e => e.trim()).filter(Boolean) : undefined;
      const bccList = bcc.trim() ? bcc.split(",").map(e => e.trim()).filter(Boolean) : undefined;
      const attachments = files.length > 0
        ? await Promise.all(files.map(async f => ({
            filename: f.name.replace(/\s+/g, "_"),
            content: await readFileAsBase64(f),
            contentType: f.type || undefined,
          })))
        : undefined;
      await sendEmailWebmail(Number(channelId), {
        to: to.trim(),
        subject: subject.trim(),
        text: body.trim(),
        ...(ccList?.length && { cc: ccList }),
        ...(bccList?.length && { bcc: bccList }),
        ...(attachments?.length && { attachments }),
      });
      toast.success(t("emailSentOk"));
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        ?? (e as Error).message
        ?? t("emailSentError");
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />{t("emailModalTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* Canal webmail */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailChannel")}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder={t("emailChannelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {webmailChannels.length === 0
                  ? <SelectItem value="__none" disabled>{t("noWebmailSessions")}</SelectItem>
                  : webmailChannels.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          {/* Para */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailTo")} *</Label>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemplo.com" />
          </div>

          {/* CC */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailCc")}</Label>
            <Input value={cc} onChange={e => setCc(e.target.value)} placeholder={t("emailCcPlaceholder")} />
          </div>

          {/* CCO */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailBcc")}</Label>
            <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder={t("emailBccPlaceholder")} />
          </div>

          {/* Assunto */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailSubject")} *</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t("emailSubjectPlaceholder")} />
          </div>

          {/* Mensagem */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailBody")} *</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t("emailBodyPlaceholder")} rows={5} className="resize-none" />
          </div>

          {/* Anexos */}
          <div>
            <Label className="text-xs mb-1 block">{t("emailAttachments")}</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={e => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setFiles(prev => [...prev, ...list].slice(0, 10));
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" />{t("emailAttachBtn")}
            </Button>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 bg-muted/50">
                    <span className="truncate flex-1 min-w-0 text-xs">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={loading || !channelId || !to.trim() || !subject.trim() || !body.trim()}>
            {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────────────────────

interface OpportunityCardProps {
  opp: Opportunity;
  onClick: () => void;
  onDelete: () => void;
  onSendMessage?: () => void;
  onSendEmail?: () => void;
  onOpenCrm?: () => void;
}

function OpportunityCardComp({ opp, onClick, onDelete, onSendMessage, onSendEmail, onOpenCrm }: OpportunityCardProps) {
  const t = useTranslations("funilKanbanPage");
  const tCrm = useTranslations("contactCrm");
  const router = useRouter();
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  // PLANO_CRM_CONTATO F1 (D16): perfil do contato a partir do card; restrito nao tem acesso ao perfil
  const profileContactId = opp.contact?.id ?? opp.contactId;
  const { isLiveMode } = useLiveMode();
  return (
    <Card
      className="cursor-pointer hover:-translate-y-0.5 transition-transform border border-border/60 mb-2"
      onClick={onClick}
    >
      <CardContent className="p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusColor(opp.status)}`}>
            {statusLabel(opp.status, t)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {opp.contact?.number && onSendMessage && (
              <button
                type="button"
                className="text-muted-foreground hover:text-green-600 transition-colors"
                onClick={e => { e.stopPropagation(); onSendMessage(); }}
                title={t("sendMessage")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
            )}
            {opp.contact?.email && onSendEmail && (
              <button
                type="button"
                className="text-muted-foreground hover:text-blue-600 transition-colors"
                onClick={e => { e.stopPropagation(); onSendEmail(); }}
                title={t("sendEmail")}
              >
                <Mail className="h-3.5 w-3.5" />
              </button>
            )}
            {opp.contact?.id && (
              <SpyContactMessagesPopover contactId={opp.contact.id} contactName={opp.contact.name}>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-cyan-600 transition-colors"
                  onClick={e => e.stopPropagation()}
                  title={t("viewTickets")}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </SpyContactMessagesPopover>
            )}
            {opp.contact?.id && onOpenCrm && (
              <button
                type="button"
                className="text-muted-foreground hover:text-violet-600 transition-colors"
                onClick={e => { e.stopPropagation(); onOpenCrm(); }}
                title={t("openCrmDialog")}
              >
                <MessagesSquare className="h-3.5 w-3.5" />
              </button>
            )}
            {!!profileContactId && !isRestricted && (
              <button
                type="button"
                className="text-muted-foreground hover:text-primary transition-colors"
                onClick={e => { e.stopPropagation(); router.push(`/contatos/${profileContactId}`); }}
                title={tCrm("viewProfile")}
                aria-label={tCrm("viewProfile")}
              >
                <UserRound className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive transition-colors"
              onClick={e => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Title & Value */}
        <div>
          <p className="text-sm font-semibold leading-snug">#{opp.id} - {opp.name}</p>
          <p className="text-sm font-bold text-green-600 mt-0.5">{formatValue(opp.value)}</p>
        </div>

        {/* Contact */}
        {opp.contact && (
          <div className="flex items-center gap-2">
            <ContactAvatar
              name={opp.contact.name}
              profilePicUrl={opp.contact.profilePicUrl}
              sizeClassName="w-7 h-7 shrink-0"
              fallbackClassName="bg-primary/20 text-primary text-xs font-bold"
              blur={isLiveMode}
            />
            <div className="min-w-0">
              {opp.contact.name && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>
                  <User className="h-3 w-3 shrink-0" />{opp.contact.name}
                </div>
              )}
              {displayContactIdentity(opp.contact) && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>
                  <Phone className="h-3 w-3 shrink-0" />{displayContactIdentity(opp.contact)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer dates */}
        <div className="flex flex-col gap-0.5">
          {opp.closingForecast && (
            <div className={`flex items-center gap-1 text-xs ${isUrgent(opp.closingForecast) ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
              <Calendar className="h-3 w-3" />
              {t("closingLabel")} {formatDateUTC(opp.closingForecast)}
            </div>
          )}
          {opp.createdAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {t("createdLabel")} {formatDateUTC(opp.createdAt)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (f: Partial<Filters>) => void;
  onApply: () => void;
  onClear: () => void;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
  tagsList: TagOption[];
  walletsList: WalletOption[];
  kanbansList: KanbanOption[];
}

function FilterBar({ filters, onFiltersChange, onApply, onClear, pipelines, stages, responsaveis, tagsList, walletsList, kanbansList }: FilterBarProps) {
  const t = useTranslations("funilKanbanPage");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("funilKanbanFiltersOpen") === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("funilKanbanFiltersOpen", String(isOpen));
  }, [isOpen]);

  const activeCount = useMemo(() => {
    let c = 0;
    if (filters.pipelineId != null) c++;
    if (filters.stageId != null) c++;
    if (filters.responsibleId != null) c++;
    // "open" é o status default — não conta como filtro ativo
    if (filters.status && filters.status !== "open") c++;
    if (filters.valorMin != null) c++;
    if (filters.valorMax != null) c++;
    if (filters.dataInicio) c++;
    if (filters.dataFim) c++;
    if (filters.tagId != null) c++;
    if (filters.walletUserId != null) c++;
    if (filters.kanbanId != null) c++;
    return c;
  }, [filters]);

  const filteredStages = filters.pipelineId
    ? stages.filter(s => String(s.pipelineId) === String(filters.pipelineId))
    : stages;

  function handleSearchChange(val: string) {
    onFiltersChange({ searchTerm: val });
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => onApply(), 500);
  }

  return (
    <div className="border rounded-lg">
      {/* Toolbar sempre visível: busca + botão toggle */}
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder={t("filterSearch")}
            value={filters.searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          <span className="text-xs">{t("moreFilters")}</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">{activeCount}</Badge>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
        </Button>
      </div>

      {/* Painel recolhível */}
      {isOpen && (
      <div className="border-t p-4 space-y-3">
      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Pipeline */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterPipeline")}</Label>
          <Select
            value={filters.pipelineId ? String(filters.pipelineId) : "all"}
            onValueChange={v => {
              onFiltersChange({ pipelineId: v === "all" ? null : Number(v), stageId: null });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {pipelines.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Etapa */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterStage")}</Label>
          <Select
            value={filters.stageId ? String(filters.stageId) : "all"}
            onValueChange={v => {
              onFiltersChange({ stageId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAllF")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAllF")}</SelectItem>
              {filteredStages.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Responsável */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterResponsible")}</Label>
          <Select
            value={filters.responsibleId ? String(filters.responsibleId) : "all"}
            onValueChange={v => {
              onFiltersChange({ responsibleId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {responsaveis.map(r => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div>
          <Label className="text-xs mb-1 block">{t("filterStatus")}</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={v => {
              onFiltersChange({ status: v === "all" ? "" : v });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              <SelectItem value="open">{t("statusOpen")}</SelectItem>
              <SelectItem value="win">{t("statusWin")}</SelectItem>
              <SelectItem value="lose">{t("statusLose")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 1b — Tag / Carteira / Kanban (filtros via contato) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs mb-1 block">{t("filterTag")}</Label>
          <Select
            value={filters.tagId ? String(filters.tagId) : "all"}
            onValueChange={v => {
              onFiltersChange({ tagId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {tagsList.map(tg => (
                <SelectItem key={tg.id} value={String(tg.id)}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tg.color || "#3B82F6" }} />
                    {tg.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterWallet")}</Label>
          <Select
            value={filters.walletUserId ? String(filters.walletUserId) : "all"}
            onValueChange={v => {
              onFiltersChange({ walletUserId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {walletsList.map(w => (
                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterKanban")}</Label>
          <Select
            value={filters.kanbanId ? String(filters.kanbanId) : "all"}
            onValueChange={v => {
              onFiltersChange({ kanbanId: v === "all" ? null : Number(v) });
              setTimeout(() => onApply(), 0);
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("filterAll")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              {kanbansList.map(k => (
                <SelectItem key={k.id} value={String(k.id)}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: k.color || "#9CA3AF" }} />
                    {k.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3 – Values & Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs mb-1 block">{t("filterMinValue")}</Label>
          <Input
            type="number" className="h-8 text-xs"
            placeholder="0"
            value={filters.valorMin ?? ""}
            onChange={e => onFiltersChange({ valorMin: e.target.value ? Number(e.target.value) : null })}
            onBlur={onApply}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterMaxValue")}</Label>
          <Input
            type="number" className="h-8 text-xs"
            placeholder="0"
            value={filters.valorMax ?? ""}
            onChange={e => onFiltersChange({ valorMax: e.target.value ? Number(e.target.value) : null })}
            onBlur={onApply}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterStartDate")}</Label>
          <Input
            type="date" className="h-8 text-xs"
            value={filters.dataInicio ?? ""}
            onChange={e => { onFiltersChange({ dataInicio: e.target.value || null }); setTimeout(onApply, 0); }}
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("filterEndDate")}</Label>
          <Input
            type="date" className="h-8 text-xs"
            value={filters.dataFim ?? ""}
            onChange={e => { onFiltersChange({ dataFim: e.target.value || null }); setTimeout(onApply, 0); }}
          />
        </div>
      </div>

      {/* Row 4 – Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>{t("clearFilters")}</Button>
        <Button size="sm" onClick={onApply}>
          <Search className="mr-1 h-3.5 w-3.5" />{t("filter")}
        </Button>
      </div>
      </div>
      )}
    </div>
  );
}

// ─── Main Kanban Page ─────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = {
  pipelineId: null,
  stageId: null,
  responsibleId: null,
  status: "open",
  valorMin: null,
  valorMax: null,
  dataInicio: null,
  dataFim: null,
  searchTerm: "",
  ordenacao: "data_desc",
  tagId: null,
  walletUserId: null,
  kanbanId: null,
};

const DEFAULT_PAGINATION: Pagination = { page: 1, limit: 100, total: 0 };

export default function FunilKanbanPage() {
  // Gate isolado num wrapper: sair com `return` no meio dos hooks do conteúdo
  // quebrava o React ("Rendered fewer hooks than expected") quando a permissão
  // caía com a página montada — o teto do tenant chega após o 1º render.
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  return <FunilKanbanPageContent />;
}

function FunilKanbanPageContent() {
  const t = useTranslations("funilKanbanPage");
  const tCommon = useTranslations("common");
  const { user, supervisorAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsible[]>([]);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [pagination, setPagination] = useState<Pagination>({ ...DEFAULT_PAGINATION });

  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollBoard = useCallback((dir: -1 | 1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  }, []);

  // Auto-scroll horizontal nas bordas do board durante o drag — o DnD nativo
  // do HTML5 nao rola containers com overflow, entao arrastar um card para uma
  // etapa fora da viewport exigia soltar no meio do caminho. Loop rAF unico
  // (guard em autoScrollRaf) com delta proporcional a proximidade da borda.
  const autoScrollRaf = useRef<number | null>(null);
  const autoScrollDelta = useRef(0);

  const stopEdgeAutoScroll = useCallback(() => {
    autoScrollDelta.current = 0;
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const updateEdgeAutoScroll = useCallback((clientX: number) => {
    const el = boardRef.current;
    if (!el) return;
    const EDGE = 80; // px da borda que ativa o auto-scroll
    const MIN_STEP = 8; // px/frame ao entrar na zona
    const MAX_STEP = 20; // px/frame colado na borda
    const rect = el.getBoundingClientRect();
    let delta = 0;
    if (clientX < rect.left + EDGE) {
      const ratio = Math.min(1, (rect.left + EDGE - clientX) / EDGE);
      delta = -(MIN_STEP + (MAX_STEP - MIN_STEP) * ratio);
    } else if (clientX > rect.right - EDGE) {
      const ratio = Math.min(1, (clientX - (rect.right - EDGE)) / EDGE);
      delta = MIN_STEP + (MAX_STEP - MIN_STEP) * ratio;
    }
    autoScrollDelta.current = delta;
    if (delta === 0) {
      stopEdgeAutoScroll();
      return;
    }
    if (autoScrollRaf.current !== null) return; // loop ja ativo — so atualiza o delta
    const step = () => {
      const container = boardRef.current;
      if (!container || autoScrollDelta.current === 0) {
        autoScrollRaf.current = null;
        return;
      }
      container.scrollLeft += autoScrollDelta.current;
      autoScrollRaf.current = requestAnimationFrame(step);
    };
    autoScrollRaf.current = requestAnimationFrame(step);
  }, [stopEdgeAutoScroll]);

  // Cancela o loop de auto-scroll no unmount
  useEffect(() => stopEdgeAutoScroll, [stopEdgeAutoScroll]);

  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<Opportunity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([]);
  const allowedWhatsapps = useMemo(() => {
    const isAdminLike = user?.profile === "admin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
    if (isAdminLike) return whatsapps;
    const allowedList = user?.whatsappAllowed as { id: number }[] | undefined;
    if (!allowedList || !Array.isArray(allowedList) || allowedList.length === 0) return whatsapps;
    const allowedIds = allowedList.map((a) => a.id);
    return whatsapps.filter((w) => allowedIds.includes(w.id));
  }, [whatsapps, user?.profile, user?.whatsappAllowed, supervisorAdmin]);
  const [tagsList, setTagsList] = useState<TagOption[]>([]);
  const [walletsList, setWalletsList] = useState<WalletOption[]>([]);
  const [kanbansList, setKanbansList] = useState<KanbanOption[]>([]);
  const [msgModal, setMsgModal] = useState<{ open: boolean; opp: Opportunity | null }>({ open: false, opp: null });
  const [crmOpp, setCrmOpp] = useState<Opportunity | null>(null);
  const [emailModal, setEmailModal] = useState<{ open: boolean; opp: Opportunity | null }>({ open: false, opp: null });
  const [exportTipo, setExportTipo] = useState<"oportunidades" | "pipelines" | "etapas" | "">("");

  // Drag-and-drop state
  const [draggingOpp, setDraggingOpp] = useState<Opportunity | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);

  const loadData = useCallback(async (f: Filters = filters, pg: Pagination = pagination) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pg.page,
        limit: pg.limit,
        ordenacao: f.ordenacao,
        // Includes opt-in para enriquecer Contact com tags/wallets/kanban
        include: "tags,wallets,kanban",
      };
      if (f.pipelineId) params.pipelineId = f.pipelineId;
      if (f.stageId) params.stageId = f.stageId;
      if (f.responsibleId) params.responsibleId = f.responsibleId;
      if (f.status) params.status = f.status;
      if (f.valorMin != null) params.valorMin = f.valorMin;
      if (f.valorMax != null) params.valorMax = f.valorMax;
      if (f.dataInicio) params.startDate = f.dataInicio;
      if (f.dataFim) params.endDate = f.dataFim;
      if (f.searchTerm) params.searchTerm = f.searchTerm;
      if (f.tagId) params.tagId = f.tagId;
      if (f.walletUserId) params.walletUserId = f.walletUserId;
      if (f.kanbanId) params.kanbanId = f.kanbanId;

      const [oppsRes, stagesRes, pipesRes, usersRes, whatsRes, tagsRes, walletsRes, kanbansRes] = await Promise.all([
        fetchOpportunities(params),
        fetchStages({ page: 1, limit: 1000 }),
        fetchPipelines(),
        fetchAllUsers(),
        fetchWhatsapps(),
        fetchTags().catch(() => ({ data: [] as TagOption[] })),
        fetchWallets().catch(() => ({ data: [] as WalletOption[] })),
        fetchKanbans().catch(() => ({ data: [] as KanbanOption[] })),
      ]);

      const rawOpps = oppsRes.data?.data ?? (Array.isArray(oppsRes.data) ? oppsRes.data : []);
      setOpportunities(rawOpps.map((o: Opportunity) => ({
        ...o,
        stageId: Number(o.stageId),
        pipelineId: Number(o.pipelineId),
        value: Number(o.value),
        status: o.status ? o.status.toLowerCase() : "",
      })));
      setPagination(p => ({ ...p, total: oppsRes.data?.pagination?.total ?? rawOpps.length }));

      const rawStages = stagesRes.data?.data ?? (Array.isArray(stagesRes.data) ? stagesRes.data : []);
      setStages(rawStages);

      const rawPipes = pipesRes.data?.data ?? (Array.isArray(pipesRes.data) ? pipesRes.data : []);
      setPipelines(rawPipes);

      const rawUsers = usersRes.data?.users ?? (Array.isArray(usersRes.data) ? usersRes.data : []);
      setResponsaveis(
        rawUsers
          .filter((u: { profile: string }) => u.profile !== "superadmin")
          .map((u: { id: number; name: string }) => ({ label: u.name, value: u.id }))
      );

      const rawWhats = Array.isArray(whatsRes.data) ? whatsRes.data : [];
      setWhatsapps(rawWhats);

      setTagsList(Array.isArray(tagsRes.data) ? tagsRes.data : []);
      setWalletsList(Array.isArray(walletsRes.data) ? walletsRes.data : []);
      setKanbansList(Array.isArray(kanbansRes.data) ? kanbansRes.data : []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(DEFAULT_FILTERS, DEFAULT_PAGINATION); }, [loadData]);

  // Filtered & visible stages
  const etapasVisiveis = (() => {
    if (filters.stageId != null) return stages.filter(s => Number(s.id) === Number(filters.stageId));
    if (filters.pipelineId != null) return stages.filter(s => Number(s.pipelineId) === Number(filters.pipelineId));
    return stages;
  })();

  function oppsForStage(stageId: number) {
    return opportunities.filter(o => Number(o.stageId) === Number(stageId));
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;

  // Paginação ativa: somas por coluna cobrem só a página carregada — o header
  // de cada lane sinaliza "nesta página" p/ não parecer total global.
  const isPartialPage = pagination.total > opportunities.length;

  function applyFilters(newFilters: Filters) {
    const pg = { ...pagination, page: 1 };
    setPagination(pg);
    loadData(newFilters, pg);
  }

  function handleFilterChange(partial: Partial<Filters>) {
    setFilters(f => ({ ...f, ...partial }));
  }

  function handleClearFilters() {
    const cleared = { ...DEFAULT_FILTERS };
    setFilters(cleared);
    applyFilters(cleared);
  }

  function handleApplyFilters() {
    applyFilters(filters);
  }

  function handleExportCSV() {
    let headers: string[] = [];
    let linhas: string[][] = [];

    if (exportTipo === "oportunidades") {
      if (!opportunities.length) { toast.warning(t("exportNoData")); return; }
      // Colunas legiveis: o contato e um objeto aninhado (virava "[object Object]")
      // e funil/etapa/responsavel chegam como id \u2014 resolvidos aqui pelas listas ja
      // carregadas na tela, sem consulta extra.
      headers = [
        "id", "name", "value", "description", "status",
        "pipeline", "stage", "responsible",
        "contactName", "contactNumber", "contactEmail",
        "closingForecast", "createdAt", "updatedAt",
      ];
      linhas = opportunities.map(o => {
        const pipeline = pipelines.find(p => String(p.id) === String(o.pipelineId));
        const stage = stages.find(s => String(s.id) === String(o.stageId));
        const responsavel = responsaveis.find(r => String(r.value) === String(o.responsibleId));
        return [
          String(o.id),
          o.name ?? "",
          Number(o.value ?? 0).toFixed(2).replace(".", ","),
          o.description ?? "",
          statusLabel(o.status, t),
          pipeline?.name ?? (o.pipelineId ? String(o.pipelineId) : ""),
          stage?.name ?? (o.stageId ? String(o.stageId) : ""),
          responsavel?.label ?? (o.responsibleId ? String(o.responsibleId) : ""),
          o.contact?.name ?? "",
          csvPhoneCell(displayContactIdentity(o.contact)),
          o.contact?.email ?? "",
          formatDateUTC(o.closingForecast),
          formatDateUTC(o.createdAt),
          formatDateUTC(o.updatedAt),
        ];
      });
    } else if (exportTipo === "pipelines" || exportTipo === "etapas") {
      const dados = (exportTipo === "pipelines" ? pipelines : stages) as unknown as Record<string, unknown>[];
      if (!dados.length) { toast.warning(t("exportNoData")); return; }
      // Uniao das chaves: campo ausente na 1a linha deixava a coluna de fora do arquivo.
      headers = Array.from(new Set(dados.flatMap(d => Object.keys(d))));
      linhas = dados.map(d => headers.map(k => {
        const v = d[k];
        if (v === null || v === undefined) return "";
        return typeof v === "object" ? JSON.stringify(v) : String(v);
      }));
    } else {
      return;
    }

    const rows = [headers.join(","), ...linhas.map(l => l.map(csvEscape).join(","))];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportTipo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openCreateForm() {
    setSelectedOpp(null);
    setFormOpen(true);
  }

  function openEditForm(opp: Opportunity) {
    setSelectedOpp(opp);
    setFormOpen(true);
  }

  function openDetails(opp: Opportunity) {
    setSelectedOpp(opp);
    setDetailsOpen(true);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteOpportunity(deleteConfirm.id);
      toast.success(t("deleteSuccess"));
      setDeleteConfirm(null);
      loadData(filters, pagination);
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  // Touch drag-and-drop
  const { touchStart, touchMove, touchEnd } = useTouchDrag<Opportunity>({
    dataAttr: "data-stage-id",
    onDrop: (opp, zoneId) => {
      const stageId = Number(zoneId);
      if (opp.stageId === stageId) return;
      const targetStage = stages.find(s => s.id === stageId);
      const payload = { ...opp, stageId, pipelineId: targetStage?.pipelineId ?? opp.pipelineId };
      setOpportunities(opps => opps.map(o => o.id === opp.id ? { ...o, stageId, pipelineId: payload.pipelineId } : o));
      updateOpportunity(opp.id, payload).catch(() => {
        toast.error(t("moveError"));
        loadData(filters, pagination);
      });
    },
  });

  // Touch: mesmo auto-scroll de borda do drag nativo, usando a posicao do dedo
  const handleCardTouchMove = (e: React.TouchEvent) => {
    touchMove(e);
    const touch = e.touches[0];
    if (touch) updateEdgeAutoScroll(touch.clientX);
  };

  const handleCardTouchEnd = (e: React.TouchEvent) => {
    stopEdgeAutoScroll();
    touchEnd(e);
  };

  // Drag-and-drop handlers
  function onDragStart(opp: Opportunity) {
    setDraggingOpp(opp);
  }

  function onDragOver(e: React.DragEvent, stageId: number) {
    e.preventDefault();
    setDragOverStage(stageId);
  }

  function onDragLeave() {
    setDragOverStage(null);
  }

  async function onDrop(stageId: number) {
    setDragOverStage(null);
    if (!draggingOpp || draggingOpp.stageId === stageId) { setDraggingOpp(null); return; }
    const targetStage = stages.find(s => s.id === stageId);
    const payload = {
      ...draggingOpp,
      stageId,
      pipelineId: targetStage?.pipelineId ?? draggingOpp.pipelineId,
    };
    // Optimistic update
    setOpportunities(opps => opps.map(o => o.id === draggingOpp.id ? { ...o, stageId, pipelineId: payload.pipelineId } : o));
    setDraggingOpp(null);
    try {
      await updateOpportunity(draggingOpp.id, payload);
      toast.success(t("moveSuccess"));
    } catch {
      toast.error(t("moveError"));
      loadData(filters, pagination);
    }
  }

  if (loading && stages.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <OpportunityAlerts opportunities={opportunities} onOpen={(id) => { const opp = opportunities.find((o) => o.id === id); if (opp) openDetails(opp); }} />
      {/* Top controls — stats + help + ações + scroll na mesma linha */}
      <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <PageHelp
            description={t("helpDesc")}
            sections={[
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
            ]}
          />
          <KanbanStatsChips opportunities={opportunities} paginationTotal={pagination.total} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={exportTipo} onValueChange={v => setExportTipo(v as typeof exportTipo)}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder={t("exportLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oportunidades">{t("exportOpportunities")}</SelectItem>
              <SelectItem value="pipelines">{t("exportPipelines")}</SelectItem>
              <SelectItem value="etapas">{t("exportStages")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!exportTipo}>
            <Download className="mr-2 h-4 w-4" />
            {t("exportCSV")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(filters, pagination)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            {t("newOpportunity")}
          </Button>
          <div className="flex items-center gap-1 ml-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(-1)} aria-label={tCommon("scrollLeft")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(1)} aria-label={tCommon("scrollRight")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFilterChange}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
        tagsList={tagsList}
        walletsList={walletsList}
        kanbansList={kanbansList}
      />

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline" size="sm"
            disabled={pagination.page <= 1}
            onClick={() => {
              const pg = { ...pagination, page: pagination.page - 1 };
              setPagination(pg);
              loadData(filters, pg);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{t("pageLabel")} {pagination.page} / {totalPages}</span>
          <Button
            variant="outline" size="sm"
            disabled={pagination.page >= totalPages}
            onClick={() => {
              const pg = { ...pagination, page: pagination.page + 1 };
              setPagination(pg);
              loadData(filters, pg);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select
            value={String(pagination.limit)}
            onValueChange={v => {
              const pg = { ...pagination, limit: Number(v), page: 1 };
              setPagination(pg);
              loadData(filters, pg);
            }}
          >
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} {t("perPage")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Kanban Board */}
      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
        onDragOver={(e) => updateEdgeAutoScroll(e.clientX)}
        onDragLeave={(e) => {
          // So para quando o ponteiro sai do container de fato (nao ao entrar em filho)
          const related = e.relatedTarget as Node | null;
          if (!related || !(e.currentTarget as HTMLElement).contains(related)) stopEdgeAutoScroll();
        }}
        onDrop={stopEdgeAutoScroll}
        onDragEnd={stopEdgeAutoScroll}
      >
        {etapasVisiveis.length === 0 ? (
          <div className="flex-1 text-center py-12 text-muted-foreground">
            {t("noStages")}
          </div>
        ) : (
          etapasVisiveis.map(stage => {
            const items = oppsForStage(stage.id);
            const isDragTarget = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                className={`w-72 shrink-0 rounded-xl border p-3 flex flex-col h-[75vh] min-h-[500px] transition-all ${
                  isDragTarget ? "border-primary bg-primary/5 shadow-lg" : "border-border/40 bg-muted/20"
                }`}
                data-stage-id={stage.id}
                onDragOver={e => onDragOver(e, stage.id)}
                onDragLeave={onDragLeave}
                onDrop={() => onDrop(stage.id)}
              >
                {/* Column Header — fixo no topo da lane (flex shrink-0) */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b shrink-0">
                  <span className="font-semibold text-sm truncate">{stage.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-xs font-semibold text-green-600 tabular-nums"
                      title={isPartialPage ? t("statOnThisPage") : undefined}
                    >
                      {formatValue(items.reduce((s, o) => s + (Number(o.value) || 0), 0))}
                      {isPartialPage && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({t("statOnThisPage")})
                        </span>
                      )}
                    </span>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                </div>

                {/* Cards — scroll vertical dentro da lane */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-0" style={{ scrollbarWidth: "thin" }}>
                  {items.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border border-dashed rounded-lg">
                      {t("dragHint")}
                    </div>
                  ) : (
                    items.map(opp => (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={() => onDragStart(opp)}
                        onTouchStart={(e) => touchStart(e, opp)}
                        onTouchMove={handleCardTouchMove}
                        onTouchEnd={handleCardTouchEnd}
                        className={`touch-none select-none${draggingOpp?.id === opp.id ? " opacity-50" : ""}`}
                      >
                        <OpportunityCardComp
                          opp={opp}
                          onClick={() => openEditForm(opp)}
                          onDelete={() => setDeleteConfirm(opp)}
                          onSendMessage={opp.contact?.number ? () => setMsgModal({ open: true, opp }) : undefined}
                          onSendEmail={opp.contact?.email ? () => setEmailModal({ open: true, opp }) : undefined}
                          onOpenCrm={opp.contact?.id ? () => setCrmOpp(opp) : undefined}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        onClick={openCreateForm}
        title={t("newOpportunity")}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Opportunity Form Modal */}
      <OpportunityForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedOpp(null); }}
        onSaved={() => loadData(filters, pagination)}
        oportunidade={selectedOpp}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
      />

      {/* Opportunity Details Modal */}
      <OpportunityDetails
        open={detailsOpen}
        onClose={() => { setDetailsOpen(false); setSelectedOpp(null); }}
        onEdit={opp => { setDetailsOpen(false); openEditForm(opp); }}
        oportunidade={selectedOpp}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
      />

      {/* Send Message Modal */}
      <SendMessageModal
        open={msgModal.open}
        opp={msgModal.opp}
        whatsapps={allowedWhatsapps}
        onClose={() => setMsgModal({ open: false, opp: null })}
      />

      {/* Send Email Modal */}
      <SendEmailModal
        open={emailModal.open}
        opp={emailModal.opp}
        whatsapps={allowedWhatsapps}
        onClose={() => setEmailModal({ open: false, opp: null })}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => { if (!v) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirmMsg")} <strong>{deleteConfirm?.name}</strong>?
            {t("deleteConfirmNote")}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("deleteNo")}</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {t("deleteYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactConversationDialog
        open={!!crmOpp}
        onOpenChange={(o) => { if (!o) setCrmOpp(null); }}
        contact={crmOpp?.contact ? {
          id: crmOpp.contact.id,
          name: crmOpp.contact.name || "",
          number: crmOpp.contact.number ?? undefined,
          profilePicUrl: crmOpp.contact.profilePicUrl ?? undefined,
        } : null}
        onChanged={() => loadData(filters, pagination)}
      />
    </div>
  );
}
