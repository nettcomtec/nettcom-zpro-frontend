"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { displayContactIdentity } from "@/lib/contact-identity";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Search, Plus, Pencil, Trash2, Upload, Download, Users, Phone, Mail,
  MessageSquare, SlidersHorizontal, X, FileDown,
  RefreshCw, Eye, Bot, FileSpreadsheet, Info, Loader2, ChevronDown,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import { ProfilePicPreviewDialog, type ProfilePicPreview } from "@/components/shared/profile-pic-preview-dialog";
import {
  fetchContacts, fetchContact, createContact, updateContact, deleteContact, forceDeleteContact,
  importContacts, exportContacts, exportContactsCount, syncContacts, syncContactGroups,
  removeDuplicateContacts, groupContactLid, checkNinthDigit,
  updateContactBlock, removeContactProfilePicture, updateContactTags,
  updateContactName, updateContactNumber, updateContactLidFromContactId,
  type Contact, type ContactPayload, type DuplicateCleanupResult,
} from "@/services/contacts";
import { ImportWizardDialog } from "@/components/contatos/ImportWizardDialog";
import { TicketAlreadyAssignedDialog, type TicketAssignedInfo } from "@/components/atendimento/ticket-already-assigned-dialog";
import { fetchTags, type Tag } from "@/services/tags";
import { fetchAllUsers, type User } from "@/services/users";
import type { Wallet } from "@/services/wallets";
import { createTicket, updateTicket } from "@/services/tickets";
import { findExistingOpenTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { fetchWhatsapps } from "@/services/whatsapp";
import { findUazapiChat } from "@/services/uazapi-interactive";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchSettings } from "@/services/settings";
import { fetchTenantById } from "@/services/tenants";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import { SpyContactMessagesDialog } from "@/components/atendimento/spy-contact-messages-dialog";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { AccessDenied } from "@/components/layout/access-denied";
import { useSortable } from "@/hooks/use-sortable";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatBirthdayDisplay } from "@/lib/birthday-format";

function makeContactSchema(msgs: { nameMin: string; numberMin: string; emailInvalid: string }) {
  return z.object({
    name: z.string().min(2, msgs.nameMin),
    number: z.string().min(8, msgs.numberMin),
    email: z.string().email(msgs.emailInvalid).or(z.literal("")).optional(),
    cpf: z.string().optional(),
    birthDate: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    businessName: z.string().optional(),
    lid: z.string().optional(),
    isLid: z.boolean().optional(),
    messengerId: z.string().optional(),
    instagramPK: z.string().optional(),
    hubWhatsapp: z.string().optional(),
    cep: z.string().optional(),
    cidade: z.string().optional(),
    estado: z.string().optional(),
    telegramId: z.string().optional(),
    webchatId: z.string().optional(),
    mercadolivreId: z.string().optional(),
    linkedinId: z.string().optional(),
    youtubeChannelId: z.string().optional(),
    tiktokId: z.string().optional(),
    hubMercadolivre: z.string().optional(),
    hubTiktok: z.string().optional(),
    hubLikedin: z.string().optional(),
    hubOlx: z.string().optional(),
    hubYoutube: z.string().optional(),
    hubIfood: z.string().optional(),
    hubTwitter: z.string().optional(),
    hubSms: z.string().optional(),
    hubTelegram: z.string().optional(),
    hubWidget: z.string().optional(),
    hubWebchat: z.string().optional(),
    hubEmail: z.string().optional(),
  });
}

type ContactForm = z.infer<ReturnType<typeof makeContactSchema>>;

type ColumnKey =
  | "select" | "id" | "avatar" | "name" | "whatsapp" | "email" | "cpf" | "empresa"
  | "tags" | "lid" | "firstName" | "lastName" | "wallet" | "queue" | "kanban"
  | "birthdayDate" | "telegramId" | "messengerId" | "instagramPK" | "hubWhatsapp"
  | "bloquearContato" | "bloquearChatbot" | "cep" | "cidade" | "estado" | "actions";

const ALL_COLUMN_KEYS: ColumnKey[] = [
  "select", "id", "avatar", "name", "whatsapp", "email", "cpf", "empresa",
  "tags", "lid", "firstName", "lastName", "wallet", "queue", "kanban",
  "birthdayDate", "telegramId", "messengerId", "instagramPK", "hubWhatsapp",
  "bloquearContato", "bloquearChatbot", "cep", "cidade", "estado", "actions",
];

const DEFAULT_VISIBLE: ColumnKey[] = ["select", "avatar", "name", "whatsapp", "tags", "actions"];

const CHANNEL_TYPES = [
  { type: "whatsapp", label: "WhatsApp", logo: "whatsapp-logo.png" },
  { type: "baileys", label: "Baileys", logo: "baileys-logo.png" },
  { type: "zapo", label: "Zapo", logo: "zapo-logo.png" },
  { type: "meow", label: "Meow", logo: "meow-logo.png" },
  { type: "evo", label: "Evolution", logo: "evo-logo.png" },
  { type: "evogo", label: "Evolution Go", logo: "evogo-logo.png" },
  { type: "zapi", label: "Z-API", logo: "zapi-logo.png" },
  { type: "uazapi", label: "UAZAPI", logo: "uazapi-logo.png" },
  { type: "waba", label: "WABA", logo: "waba-logo.png" },
  { type: "gupshup", label: "Gupshup", logo: "gupshup-logo.png" },
  { type: "dialog360", label: "Dialog360", logo: "dialog360-logo.png" },
  { type: "messenger", label: "Messenger", logo: "messenger-logo.png" },
  { type: "instagram", label: "Instagram", logo: "instagram-logo.png" },
  { type: "hub_instagram", label: "Hub Instagram", logo: "hub_instagram-logo.png" },
  { type: "hub_facebook", label: "Hub Facebook", logo: "hub_facebook-logo.png" },
  { type: "hub_whatsapp_business_account", label: "Hub WBA", logo: "hub_whatsapp-logo.png" },
];

export default function ContatosPage() {
  const allowed = usePageAccess("contatos", { checkRestrictedUser: true, allowIfNotSet: true });
  const t = useTranslations("contacts");
  const tC = useTranslations("contatosPage");
  const tCED = useTranslations("contactEditDialog");
  const tUnsaved = useTranslations("flowBuilderNodeForm");
  const tLoadMore = useTranslations("usuariotenantsPage");
  const contactSchema = makeContactSchema({ nameMin: tC("nameMin"), numberMin: tC("numberMin"), emailInvalid: tC("emailInvalid") });

  const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: "select", label: tC("colSelect") },
    { key: "id", label: "ID" },
    { key: "avatar", label: tC("colAvatar") },
    { key: "name", label: tC("colName") },
    { key: "whatsapp", label: tC("colWhatsapp") },
    { key: "email", label: tC("colEmail") },
    { key: "cpf", label: tC("colCpf") },
    { key: "empresa", label: tC("colEmpresa") },
    { key: "tags", label: tC("colTags") },
    { key: "lid", label: tC("colLid") },
    { key: "firstName", label: tC("colFirstName") },
    { key: "lastName", label: tC("colLastName") },
    { key: "wallet", label: tC("colWallet") },
    { key: "queue", label: tC("colQueue") },
    { key: "kanban", label: tC("colKanban") },
    { key: "birthdayDate", label: tC("colBirthday") },
    { key: "telegramId", label: tC("colTelegram") },
    { key: "messengerId", label: tC("colMessenger") },
    { key: "instagramPK", label: tC("colInstagramPK") },
    { key: "hubWhatsapp", label: tC("colHubWa") },
    { key: "bloquearContato", label: tC("colBlocked") },
    { key: "bloquearChatbot", label: tC("colBlockedChatbot") },
    { key: "cep", label: tC("colCep") },
    { key: "cidade", label: tC("colCidade") },
    { key: "estado", label: tC("colEstado") },
    { key: "actions", label: tC("colActions") },
  ];
  const router = useRouter();
  const { user, isAdmin, isSuporte, supervisorAdmin, getConfigValue, isRestrictedUser, hasPermission } = useAuthStore();
  const controlFeatures = getConfigValue("controlFeatures") === "enabled";
  const spyBlockedByFeatureControl = controlFeatures && user?.profile === "user";
  const whatsapps = useWhatsappStore((s) => s.whatsapps);
  const setWhatsapps = useWhatsappStore((s) => s.setWhatsapps);
  const { isLiveMode } = useLiveMode();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilePicPreview, setProfilePicPreview] = useState<ProfilePicPreview | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalContacts, setTotalContacts] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTagIds, setImportTagIds] = useState<number[]>([]);
  const [importWalletId, setImportWalletId] = useState<number | null>(null);
  const [importQueueId, setImportQueueId] = useState<number | null>(null);
  const [importValidate, setImportValidate] = useState(false);
  const [importAddTags, setImportAddTags] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportCounts, setExportCounts] = useState<{ all: number; filtered: number } | null>(null);
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(null);
  const [extraInfo, setExtraInfo] = useState<{ name: string; value: string }[]>([]);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [cleanupSummary, setCleanupSummary] = useState<{ title: string; data: DuplicateCleanupResult } | null>(null);
  const [isLidForm, setIsLidForm] = useState(false);
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [forceDeleteContactId, setForceDeleteContactId] = useState<number | null>(null);
  const [forceDeleteMsg, setForceDeleteMsg] = useState("");

  // Start ticket modal
  const [startTicketOpen, setStartTicketOpen] = useState(false);
  const [startTicketContact, setStartTicketContact] = useState<Contact | null>(null);
  const [startTicketChannelType, setStartTicketChannelType] = useState<string>("");
  const [startTicketChannelLabel, setStartTicketChannelLabel] = useState<string>("");
  const [startTicketConnections, setStartTicketConnections] = useState<{ id: number; name: string }[]>([]);
  const [startTicketConnectionId, setStartTicketConnectionId] = useState<number | null>(null);
  const [startTicketQueueId, setStartTicketQueueId] = useState<number | null>(null);
  const [startTicketUserId, setStartTicketUserId] = useState<number | null>(null);
  const [startTicketSubmitting, setStartTicketSubmitting] = useState(false);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [notViewAssignedTickets, setNotViewAssignedTickets] = useState(false);
  const [contactDeleteAdminOnly, setContactDeleteAdminOnly] = useState(false);

  // Trava LIGADA  -> so admin/superadmin (e' o proposito da config).
  // Trava DESLIGADA -> todos excluem, inclusive atendente comum (`user`), conforme
  // a descricao da propria config ("...supervisores e atendentes comuns nao verao
  // o botao de exclusao" implica que, desligada, eles VEEM). Antes o ramo desligado
  // era `isAdmin || profile === "super"`, que nunca contemplou `user` nem `custom` —
  // desligar a trava nao surtia efeito nenhum para eles.
  // `hasPermission` devolve true para todo perfil que nao seja `custom`, e para
  // `custom` respeita a permissao granular `contacts_delete` — espelhando o
  // requirePermission("contacts_delete") que ja gateia a rota no backend.
  // Declarado aqui (antes dos handlers de force-delete) porque eles fecham sobre ele.
  const canDeleteContact = contactDeleteAdminOnly ? isAdmin : hasPermission("contacts_delete");

  // UazAPI chat/find
  const [uazapiChatFindOpen, setUazapiChatFindOpen] = useState(false);
  const [uazapiChatFindQuery, setUazapiChatFindQuery] = useState("");
  const [uazapiChatFindType, setUazapiChatFindType] = useState<"all" | "individual" | "group">("all");
  const [uazapiChatFindLimit, setUazapiChatFindLimit] = useState(20);
  const [uazapiChatFindSession, setUazapiChatFindSession] = useState("");
  const [uazapiChatFindResults, setUazapiChatFindResults] = useState<unknown[]>([]);
  const [uazapiChatFindLoading, setUazapiChatFindLoading] = useState(false);

  // Existing ticket dialog
  const [existingTicketOpen, setExistingTicketOpen] = useState(false);
  const [existingTicket, setExistingTicket] = useState<{ id: number; status: string; userId?: number; user?: { name: string }; whatsappId?: number | null } | null>(null);
  const [existingTicketContact, setExistingTicketContact] = useState<Contact | null>(null);
  const [assignedDialogOpen, setAssignedDialogOpen] = useState(false);
  const [assignedDialogInfo, setAssignedDialogInfo] = useState<TicketAssignedInfo | null>(null);
  // Aviso cross-canal (flag do tenant crossChannelTicketCheck): ticket aberto em OUTRO canal
  const [crossChannelTicket, setCrossChannelTicket] = useState<ExistingOpenTicket | null>(null);

  // Spy messages modal (paginado — componente compartilhado)
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyContact, setSpyContact] = useState<Contact | null>(null);

  const [cepLoading, setCepLoading] = useState(false);

  // Snapshot dos estados fora do RHF (tags/carteira/fila/extraInfo/isLid) na abertura
  // do dialog de criar/editar — usado no dirty-guard de fechamento
  const contactExtrasSnapshotRef = useRef<string>("");

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "", number: "", email: "", cpf: "", birthDate: "",
      firstName: "", lastName: "", businessName: "",
      lid: "", isLid: false, messengerId: "", instagramPK: "", hubWhatsapp: "",
      cep: "", cidade: "", estado: "",
      telegramId: "", webchatId: "", mercadolivreId: "", linkedinId: "",
      youtubeChannelId: "", tiktokId: "",
      hubMercadolivre: "", hubTiktok: "", hubLikedin: "", hubOlx: "", hubYoutube: "",
      hubIfood: "", hubTwitter: "", hubSms: "", hubTelegram: "", hubWidget: "",
      hubWebchat: "", hubEmail: "",
    },
  });

  const handleCepLookup = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        form.setValue("cidade", data.localidade || "", { shouldDirty: true });
        form.setValue("estado", data.uf || "", { shouldDirty: true });
      }
    } catch {
      toast.error(tC("cepFetchError"));
    } finally {
      setCepLoading(false);
    }
  };

  const isColVisible = (key: ColumnKey) => visibleColumns.includes(key);
  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const load = useCallback(async (pageNum = 1, searchParam = search) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { searchParam, pageNumber: pageNum, smartSearch: true };
      if (tagFilter && tagFilter !== "all") params.tagId = Number(tagFilter);
      if (walletFilter && walletFilter !== "all") params.walletId = Number(walletFilter);
      if (queueFilter && queueFilter !== "all") params.queueId = Number(queueFilter);
      const { data } = await fetchContacts(params);
      const list = data?.contacts || data || [];
      setContacts((prev) => {
        const merged = pageNum === 1 ? list : [...prev, ...list];
        return merged.filter((item: typeof merged[number], idx: number, self: typeof merged) => self.findIndex((c: typeof merged[number]) => c.id === item.id) === idx);
      });
      setHasMore(data?.hasMore ?? list.length >= 20);
      if (data?.count != null) setTotalContacts(data.count);
      setPage(pageNum);
    } catch {
      toast.error(tC("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, [search, tagFilter, walletFilter, queueFilter]);

  useEffect(() => {
    const timer = setTimeout(() => load(1, search), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tagFilter, walletFilter, queueFilter, load]);

  useEffect(() => {
    fetchTags().then(({ data }) => setTags(data || []));
    fetchAllUsers().then(({ data }) => {
      const arr = (data?.users || []).filter((u: { profile?: string }) => u.profile !== "superadmin");
      setUsers(arr);
      // Wallets are users in this system
      setWallets(arr.map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })));
    });
    fetchWhatsapps().then(({ data }) => {
      const all = Array.isArray(data) ? data : [];
      setWhatsapps(all.filter((w) => !(w as any).isDeleted));
    });
    fetchQueues().then(({ data: q }) => setQueues(q));
    fetchSettings().then(({ data }) => {
      const list: { key: string; value: string }[] = Array.isArray(data) ? data : data?.settings || [];
      const conf = list.find((s) => s.key === "NotViewAssignedTickets");
      setNotViewAssignedTickets(conf?.value === "enabled");
    });
    if (user?.tenantId) {
      fetchTenantById(user.tenantId).then(({ data }) => {
        const td = Array.isArray(data) ? data[0] : data;
        setContactDeleteAdminOnly(td?.contactDeleteAdminOnly === "enabled");
      }).catch(() => {});
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setIsLidForm(false);
    form.reset({
      name: "", number: "", email: "", cpf: "", birthDate: "",
      firstName: "", lastName: "", businessName: "",
      lid: "", isLid: false, messengerId: "", instagramPK: "", hubWhatsapp: "",
      cep: "", cidade: "", estado: "",
      telegramId: "", webchatId: "", mercadolivreId: "", linkedinId: "",
      youtubeChannelId: "", tiktokId: "",
      hubMercadolivre: "", hubTiktok: "", hubLikedin: "", hubOlx: "", hubYoutube: "",
      hubIfood: "", hubTwitter: "", hubSms: "", hubTelegram: "", hubWidget: "",
      hubWebchat: "", hubEmail: "",
    });
    setSelectedTagIds([]);
    setSelectedWalletId(null);
    setSelectedQueueId(null);
    setExtraInfo([]);
    setExtrasOpen(false);
    contactExtrasSnapshotRef.current = JSON.stringify({
      tagIds: [], walletId: null, queueId: null, extraInfo: [], isLid: false,
    });
    setDialogOpen(true);
  };

  const openEdit = async (c: Contact) => {
    setEditing(c);
    setExtrasOpen(false);
    setDialogOpen(true);
    // Fetch full contact to get tags, wallets, extraInfo
    try {
      const { data: full } = await fetchContact(c.id);
      const fc: Contact = full?.contact || full || c;
      setIsLidForm(!!fc.isLid);
      form.reset({
        name: fc.name || "",
        number: fc.number || "",
        email: fc.email || "",
        cpf: fc.cpf || "",
        birthDate: fc.birthDate || fc.birthdayDate || "",
        firstName: fc.firstName || "",
        lastName: fc.lastName || "",
        businessName: fc.businessName || "",
        lid: fc.lid || "",
        isLid: !!fc.isLid,
        messengerId: fc.messengerId || "",
        instagramPK: fc.instagramPK || "",
        hubWhatsapp: fc.hubWhatsapp || "",
        cep: fc.cep || "",
        cidade: fc.cidade || "",
        estado: fc.estado || "",
        telegramId: fc.telegramId || "",
        webchatId: fc.webchatId || "",
        mercadolivreId: fc.mercadolivreId || "",
        linkedinId: fc.linkedinId || "",
        youtubeChannelId: fc.youtubeChannelId || "",
        tiktokId: fc.tiktokId || "",
        hubMercadolivre: fc.hubMercadolivre || "",
        hubTiktok: fc.hubTiktok || "",
        hubLikedin: fc.hubLikedin || "",
        hubOlx: fc.hubOlx || "",
        hubYoutube: fc.hubYoutube || "",
        hubIfood: fc.hubIfood || "",
        hubTwitter: fc.hubTwitter || "",
        hubSms: fc.hubSms || "",
        hubTelegram: fc.hubTelegram || "",
        hubWidget: fc.hubWidget || "",
        hubWebchat: fc.hubWebchat || "",
        hubEmail: fc.hubEmail || "",
      });
      setSelectedTagIds((fc.tags || []).map((t) => t.id));
      const wallet = (fc.wallets as { walletId?: number; id?: number }[] | undefined)?.[0];
      setSelectedWalletId(wallet?.walletId ?? wallet?.id ?? (fc.wallet as { id?: number } | null)?.id ?? null);
      setSelectedQueueId(fc.queueId ?? (fc.queue as { id?: number } | null)?.id ?? null);
      const ei = fc.extraInfo as { name?: string; value?: string }[] | undefined;
      setExtraInfo(Array.isArray(ei) ? ei.map((x) => ({ name: x.name ?? "", value: x.value ?? "" })) : []);
      // Re-captura o snapshot com os valores pós-fetch (dirty-guard)
      contactExtrasSnapshotRef.current = JSON.stringify({
        tagIds: (fc.tags || []).map((t) => t.id).sort((a, b) => a - b),
        walletId: wallet?.walletId ?? wallet?.id ?? (fc.wallet as { id?: number } | null)?.id ?? null,
        queueId: fc.queueId ?? (fc.queue as { id?: number } | null)?.id ?? null,
        extraInfo: Array.isArray(ei) ? ei.map((x) => ({ name: x.name ?? "", value: x.value ?? "" })) : [],
        isLid: !!fc.isLid,
      });
    } catch {
      // fallback to list data
      setIsLidForm(!!c.isLid);
      form.reset({
        name: c.name || "", number: c.number || "", email: c.email || "", cpf: c.cpf || "",
        birthDate: c.birthDate || c.birthdayDate || "", firstName: c.firstName || "",
        lastName: c.lastName || "", businessName: c.businessName || "",
        lid: c.lid || "", isLid: !!c.isLid,
        messengerId: c.messengerId || "", instagramPK: c.instagramPK || "", hubWhatsapp: c.hubWhatsapp || "",
        cep: c.cep || "", cidade: c.cidade || "", estado: c.estado || "",
        telegramId: c.telegramId || "", webchatId: c.webchatId || "",
        mercadolivreId: c.mercadolivreId || "", linkedinId: c.linkedinId || "",
        youtubeChannelId: c.youtubeChannelId || "", tiktokId: c.tiktokId || "",
        hubMercadolivre: c.hubMercadolivre || "", hubTiktok: c.hubTiktok || "",
        hubLikedin: c.hubLikedin || "", hubOlx: c.hubOlx || "", hubYoutube: c.hubYoutube || "",
        hubIfood: c.hubIfood || "", hubTwitter: c.hubTwitter || "", hubSms: c.hubSms || "",
        hubTelegram: c.hubTelegram || "", hubWidget: c.hubWidget || "",
        hubWebchat: c.hubWebchat || "", hubEmail: c.hubEmail || "",
      });
      setSelectedTagIds((c.tags || []).map((t) => t.id));
      setSelectedQueueId(c.queueId ?? (c.queue as { id?: number } | null)?.id ?? null);
      // Snapshot do fallback (wallet/extraInfo mantêm o estado atual)
      contactExtrasSnapshotRef.current = JSON.stringify({
        tagIds: (c.tags || []).map((t) => t.id).sort((a, b) => a - b),
        walletId: selectedWalletId,
        queueId: c.queueId ?? (c.queue as { id?: number } | null)?.id ?? null,
        extraInfo,
        isLid: !!c.isLid,
      });
    }
  };

  // Dirty-guard: fechar o dialog de criar/editar (Esc, clique-fora, X ou Cancelar)
  // com alterações não salvas pede confirmação. Submit fecha direto (onSubmit).
  const isContactFormDirty = () =>
    form.formState.isDirty ||
    JSON.stringify({
      tagIds: [...selectedTagIds].sort((a, b) => a - b),
      walletId: selectedWalletId,
      queueId: selectedQueueId,
      extraInfo,
      isLid: isLidForm,
    }) !== contactExtrasSnapshotRef.current;

  const attemptCloseContactDialog = () => {
    if (form.formState.isSubmitting) return;
    if (isContactFormDirty() && !window.confirm(tUnsaved("unsavedChangesDesc"))) return;
    setDialogOpen(false);
  };

  const hasDuplicateExtraName = (index: number): boolean => {
    const name = extraInfo[index]?.name?.trim();
    if (!name) return false;
    return extraInfo.some((item, i) => i !== index && item.name.trim() === name);
  };

  const onSubmit = async (values: ContactForm) => {
    const names = extraInfo.filter((e) => e.name.trim()).map((e) => e.name.trim());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      toast.error(tC("duplicateExtraFields") + ": " + [...new Set(dupes)].join(", "));
      return;
    }
    try {
      const payload: ContactPayload & Record<string, unknown> = {
        name: values.name,
        number: values.number,
        email: values.email,
        cpf: values.cpf,
        birthdayDate: values.birthDate,
        firstName: values.firstName,
        lastName: values.lastName,
        businessName: values.businessName,
        lid: values.lid,
        isLid: values.isLid,
        messengerId: values.messengerId,
        instagramPK: values.instagramPK,
        hubWhatsapp: values.hubWhatsapp,
        cep: values.cep,
        cidade: values.cidade,
        estado: values.estado,
        telegramId: values.telegramId,
        webchatId: values.webchatId,
        mercadolivreId: values.mercadolivreId,
        linkedinId: values.linkedinId,
        youtubeChannelId: values.youtubeChannelId,
        tiktokId: values.tiktokId,
        hubMercadolivre: values.hubMercadolivre,
        hubTiktok: values.hubTiktok,
        hubLikedin: values.hubLikedin,
        hubOlx: values.hubOlx,
        hubYoutube: values.hubYoutube,
        hubIfood: values.hubIfood,
        hubTwitter: values.hubTwitter,
        hubSms: values.hubSms,
        hubTelegram: values.hubTelegram,
        hubWidget: values.hubWidget,
        hubWebchat: values.hubWebchat,
        hubEmail: values.hubEmail,
      };
      // Always send wallets and extraInfo so backend removes them when empty
      payload.wallets = selectedWalletId != null ? [selectedWalletId] : [];
      // Always send queueId so backend clears it when empty (null clears; number sets)
      payload.queueId = selectedQueueId;
      payload.extraInfo = extraInfo.filter((e) => e.name.trim());
      if (editing) {
        await updateContact(editing.id, payload);
        await updateContactTags(editing.id, selectedTagIds);
        toast.success(tC("contactUpdated"));
      } else {
        const { data: created } = await createContact(payload);
        const newId = created?.contact?.id ?? created?.id;
        if (newId && selectedTagIds.length) await updateContactTags(newId, selectedTagIds);
        toast.success(tC("contactCreated"));
      }
      setDialogOpen(false);
      load(1);
    } catch (err: unknown) {
      const code = (err as { data?: { error?: string }; response?: { data?: { error?: string } } })?.data?.error
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "ERR_DUPLICATED_CONTACT") {
        toast.error(tC("duplicatedContact"));
      } else {
        toast.error(editing ? tC("errorUpdating") : tC("errorCreating"));
      }
    }
  };

  const openForceDeleteDialog = (contactId: number, errorCode: string) => {
    const msg = errorCode === "ERR_CONTACT_TICKETS_REGISTERED"
      ? tC("ticketsLinked")
      : tC("opportunitiesLinked");
    setForceDeleteContactId(contactId);
    setForceDeleteMsg(msg);
    setForceDeleteOpen(true);
  };

  const handleForceDelete = async () => {
    if (!forceDeleteContactId) return;
    if (!canDeleteContact) {
      toast.error(tC("adminOnlyForceDelete"));
      setForceDeleteOpen(false);
      return;
    }
    try {
      await forceDeleteContact(forceDeleteContactId);
      toast.success(tC("forceDeleted"));
      setForceDeleteOpen(false);
      setForceDeleteContactId(null);
      setDeleting(null);
      load(1);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      if (msg === "ERR_CONTACT_DELETE_ADMIN_ONLY") {
        setForceDeleteOpen(false);
        toast.error(tC("adminOnlyMsg"));
      } else {
        toast.error(tC("errorForceDeleting"));
      }
    }
  };

  const handleDelete = async () => {
    if (!deleting || deletingContact) return;
    setDeletingContact(true);
    try {
      await deleteContact(deleting.id);
      toast.success(tC("contactRemoved"));
      setDeleting(null);
      load(1);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      if (msg === "ERR_CONTACT_TICKETS_REGISTERED" || msg === "ERR_CONTACT_OPPORTUNITIES_REGISTERED") {
        setDeleting(null);
        openForceDeleteDialog(deleting.id, msg);
      } else if (msg === "ERR_CONTACT_DELETE_ADMIN_ONLY") {
        // Trava do tenant ligada em outra aba/sessao depois que esta tela carregou:
        // o botao ainda estava visivel, mas o backend agora recusa.
        setDeleting(null);
        toast.error(tC("adminOnlyMsg"));
      } else {
        toast.error(tC("errorRemoving"));
      }
    } finally {
      setDeletingContact(false);
    }
  };

  const [bulkForceIds, setBulkForceIds] = useState<number[]>([]);
  const [bulkForceOpen, setBulkForceOpen] = useState(false);
  const [bulkDeleteResults, setBulkDeleteResults] = useState({ success: 0, failed: 0 });

  const handleBulkDelete = async () => {
    if (bulkDeleting) return; // in-flight: impede segundo loop concorrente
    setBulkDeleting(true);
    const results = { success: 0, forceNeeded: [] as number[], failed: 0 };
    for (const id of selectedIds) {
      try {
        await deleteContact(id);
        results.success++;
      } catch (err: unknown) {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        if (msg === "ERR_CONTACT_TICKETS_REGISTERED" || msg === "ERR_CONTACT_OPPORTUNITIES_REGISTERED") {
          results.forceNeeded.push(id);
        } else {
          results.failed++;
        }
      }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    if (results.forceNeeded.length > 0) {
      setBulkForceIds(results.forceNeeded);
      setBulkDeleteResults({ success: results.success, failed: results.failed });
      setBulkForceOpen(true);
    } else {
      setSelectedIds([]);
      load(1);
      const parts: string[] = [];
      if (results.success > 0) parts.push(tC("bulkRemovedCount", { count: results.success }));
      if (results.failed > 0) parts.push(tC("bulkFailedCount", { count: results.failed }));
      if (results.failed === 0) toast.success(parts.join(", "));
      else toast.warning(parts.join(", "));
    }
  };

  const handleBulkForceDelete = async () => {
    if (!canDeleteContact) {
      toast.error(tC("adminOnlyForceDelete"));
      setBulkForceOpen(false);
      return;
    }
    let forceDeleted = 0;
    let failed = bulkDeleteResults.failed;
    for (const id of bulkForceIds) {
      try {
        await forceDeleteContact(id);
        forceDeleted++;
      } catch {
        failed++;
      }
    }
    setBulkForceOpen(false);
    setBulkForceIds([]);
    setSelectedIds([]);
    load(1);
    const parts: string[] = [];
    if (bulkDeleteResults.success > 0) parts.push(tC("bulkRemovedCount", { count: bulkDeleteResults.success }));
    if (forceDeleted > 0) parts.push(tC("bulkForceDeletedCount", { count: forceDeleted }));
    if (failed > 0) parts.push(tC("bulkFailedCount", { count: failed }));
    if (failed === 0) toast.success(parts.join(", "));
    else toast.warning(parts.join(", "));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
    }
  };

  const handleToggleBlock = async (c: Contact, field: "bloquearContato" | "bloquearChatbot") => {
    try {
      const backendKey = field === "bloquearContato" ? "blocked" : "chatbotBlocked";
      const current = c[field] ?? c[backendKey];
      const newVal = !current;
      await updateContactBlock(c.id, { number: c.number, [field]: newVal } as any);
      setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, [field]: newVal, [backendKey]: newVal } : x));
    } catch {
      toast.error(tC("errorUpdatingBlock"));
    }
  };

  const openStartTicketModal = (contact: Contact, ch: typeof CHANNEL_TYPES[0], connections: { id: number; name: string }[]) => {
    setStartTicketContact(contact);
    setStartTicketChannelType(ch.type);
    setStartTicketChannelLabel(ch.label);
    setStartTicketConnections(connections);
    setStartTicketConnectionId(connections.length === 1 ? connections[0].id : null);
    setStartTicketQueueId(null);
    setStartTicketUserId(null);
    setStartTicketOpen(true);
  };

  const extract409Ticket = (err: unknown) => {
    // O interceptor do axios rejeita com error.response diretamente
    const resp = err as { status?: number; data?: Record<string, unknown> };
    if (resp?.status !== 409) return null;
    const d = resp.data;
    if (!d) return null;
    if (d.ticket && typeof d.ticket === "object") return d.ticket as { id: number; status: string; userId?: number; user?: { name: string }; whatsappId?: number | null };
    const raw = d.message ?? d.error;
    if (!raw) return null;
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  };

  const handleConfirmStartTicket = async (skipPrecheck = false) => {
    if (!startTicketContact || !startTicketConnectionId) return;
    setStartTicketSubmitting(true);

    // Pre-check cross-canal (gated pela flag do tenant): se o contato ja tem ticket
    // aberto/pending em OUTRO canal, avisa antes de criar (nao bloqueia). Same-channel
    // segue tratado pelo fluxo 409 abaixo (extract409Ticket).
    if (
      !skipPrecheck &&
      getConfigValue("crossChannelTicketCheck") === "enabled" &&
      startTicketContact.number
    ) {
      try {
        const cross = await findExistingOpenTicket({
          number: startTicketContact.number,
          whatsappId: startTicketConnectionId,
          currentUserId: user?.userId ?? null,
        });
        if (cross && cross.whatsappId != null && Number(cross.whatsappId) !== Number(startTicketConnectionId)) {
          setStartTicketOpen(false);
          setCrossChannelTicket(cross);
          setStartTicketSubmitting(false);
          return;
        }
      } catch { /* silenciar — nao bloquear criacao se pre-check falhar */ }
    }

    try {
      const payload: Record<string, unknown> = {
        contactId: startTicketContact.id,
        isActiveDemand: true,
        userId: startTicketUserId ?? user?.userId,
        channel: startTicketChannelType,
        channelId: startTicketConnectionId,
        status: "open",
      };
      if (startTicketQueueId) payload.queueId = startTicketQueueId;
      const { data } = await createTicket(payload);
      const ticketId = data?.id || data?.ticket?.id;
      setStartTicketOpen(false);
      toast.success(tC("ticketStarted", { name: startTicketContact.name, ticketId }));
      router.push(`/atendimento?ticketId=${ticketId}`);
    } catch (err) {
      const ticketAtual = extract409Ticket(err);
      if (ticketAtual) {
        setStartTicketOpen(false);

        // Regra (espelha frontend Vue handleSaveTicket / abrirAtendimentoExistente):
        // usuário com profile==='user' e tenant com NotViewAssignedTickets==='enabled'
        // não pode acessar ticket aberto em nome de outro atendente.
        // Admin e supervisor (profile==='super') seguem o fluxo normal.
        const isPlainUser = user?.profile === "user";
        if (notViewAssignedTickets && isPlainUser) {
          const assignedToSelf =
            typeof ticketAtual.userId === "number" && ticketAtual.userId === user?.userId;
          if (!assignedToSelf) {
            setAssignedDialogInfo({
              ticketId: ticketAtual.id,
              contactName: startTicketContact.name,
              assignedUserId: ticketAtual.userId ?? null,
              assignedUserName: ticketAtual.user?.name ?? null,
              assignedUserProfilePicture:
                (ticketAtual.user as { profilePicture?: string } | undefined)?.profilePicture ?? null,
            });
            setAssignedDialogOpen(true);
            setStartTicketSubmitting(false);
            return;
          }
        }

        const updateData: Record<string, unknown> = {};
        const isPending = ticketAtual.status === "pending";
        if (isPending) {
          updateData.status = "open";
          updateData.userId = startTicketUserId ?? user?.userId;
          if (startTicketQueueId) updateData.queueId = startTicketQueueId;
        }
        if (ticketAtual.whatsappId === null) updateData.whatsapp = startTicketConnectionId;

        if (Object.keys(updateData).length > 0) {
          try {
            await updateTicket(ticketAtual.id, updateData);
            await new Promise((r) => setTimeout(r, 250));
          } catch { /* ignora erro no update */ }
        }

        if (isPending) {
          // Para tickets pending: exibir dialog de confirmação (como Vue faz em abrirAtendimentoExistente)
          setExistingTicket(ticketAtual);
          setExistingTicketContact(startTicketContact);
          setExistingTicketOpen(true);
        } else {
          // Para tickets open: redirecionar diretamente com toast informativo
          toast.info(tC("ticketExists", { id: ticketAtual.id, name: startTicketContact.name }));
          router.push(`/atendimento?ticketId=${ticketAtual.id}`);
        }
      } else {
        toast.error(tC("errorCreatingTicket"));
      }
    } finally {
      setStartTicketSubmitting(false);
    }
  };

  const handleSpy = (contact: Contact) => {
    setSpyContact(contact);
    setSpyOpen(true);
  };

  const handleRefreshLid = async (contactId: number) => {
    try {
      await updateContactLidFromContactId(contactId);
      toast.success(tC("lidUpdated"));
      load(1);
    } catch { toast.error(tC("errorUpdatingLid")); }
  };

  const handleUpdateName = async () => {
    if (!editing) return;
    const value = form.getValues("name")?.trim();
    if (!value || value.length < 2) {
      toast.error(tCED("validation.nameMin"));
      return;
    }
    try {
      await updateContactName(editing.id, value);
      toast.success(tCED("success.nameUpdated"));
      load(1);
    } catch (err: unknown) {
      const backendMsg =
        (err as { data?: { error?: string } })?.data?.error
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(backendMsg || tCED("errors.updateName"));
    }
  };

  const handleUpdateNumber = async () => {
    if (!editing) return;
    const value = form.getValues("number")?.trim();
    if (!value) {
      toast.error(tCED("errors.numberRequired"));
      return;
    }
    try {
      await updateContactNumber(editing.id, value);
      toast.success(tCED("success.numberUpdated"));
      load(1);
    } catch (err: unknown) {
      const backendMsg =
        (err as { data?: { error?: string } })?.data?.error
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (backendMsg === "ERR_CONTACT_NUMBER_ALREADY_EXISTS") {
        toast.error(tCED("errors.numberAlreadyExists"));
      } else if (backendMsg === "ERR_NO_CONTACT_FOUND") {
        toast.error(tCED("errors.loadContact"));
      } else {
        toast.error(backendMsg || tCED("errors.updateNumber"));
      }
    }
  };

  const handleImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const allowedTypes = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
      const allowedExts = [".csv", ".xlsx", ".xls"];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
        toast.error(tC("invalidFileType")); return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(tC("fileTooLarge")); return;
      }
      setImportFile(file); setImportDialogOpen(true);
    };
    input.click();
  };

  const handleImportConfirm = async () => {
    if (!importFile) { toast.error(tC("selectFile")); return; }
    try {
      await importContacts(importFile, {
        tagIds: importTagIds.length ? importTagIds : undefined,
        walletId: importWalletId ?? undefined,
        queueId: importQueueId,
        validateContact: importValidate,
        addTags: importAddTags,
      });
      toast.success(tC("contactsImported"));
      setImportDialogOpen(false);
      setImportFile(null);
      setImportTagIds([]);
      setImportWalletId(null);
      setImportQueueId(null);
      setImportValidate(false);
      setImportAddTags(false);
      load(1);
    } catch (err: any) {
      // Mapeia AppError raw em mensagem amigável; senão usa a mensagem do backend; senão genérico.
      const rawMsg: string = err?.response?.data?.message || err?.response?.data?.error || err?.message || "";
      let friendly = "";
      if (rawMsg.includes("ERR_NO_DEF_WAPP_FOUND")) {
        friendly = tC("errorImportNoWhatsapp");
      } else if (rawMsg.includes("ERR_WAPP_NOT_INITIALIZED")) {
        friendly = tC("errorImportWhatsappNotReady");
      } else if (rawMsg === "FILE_REQUIRED" || rawMsg.includes("FILE_REQUIRED")) {
        friendly = tC("selectFile");
      } else if (
        rawMsg.includes("ERR_IMPORT_UNSUPPORTED_FILE_TYPE") ||
        rawMsg.includes("ERR_IMPORT_FILE_UNREADABLE")
      ) {
        friendly = tC("invalidFileType");
      } else if (rawMsg === "TENANT_NOT_FOUND" || rawMsg.includes("TENANT_NOT_FOUND")) {
        friendly = tC("errorImporting");
      } else if (rawMsg) {
        friendly = `${tC("errorImporting")}: ${rawMsg}`;
      } else {
        friendly = tC("errorImporting");
      }
      toast.error(friendly);
    }
  };

  const openExportDialog = () => {
    setExportCounts(null);
    setExportDialogOpen(true);
    const params: { searchParam?: string; walletId?: number; tagId?: number; smartSearch?: boolean } = { searchParam: search, smartSearch: true };
    if (tagFilter && tagFilter !== "all") params.tagId = Number(tagFilter);
    if (walletFilter && walletFilter !== "all") params.walletId = Number(walletFilter);
    exportContactsCount(params)
      .then(({ data }) => setExportCounts(data))
      .catch(() => setExportCounts(null));
  };

  const handleExport = async (mode: "all" | "filtered") => {
    setExportDialogOpen(false);
    try {
      const params: { mode: "all" | "filtered"; searchParam?: string; walletId?: number; tagId?: number; smartSearch?: boolean } = { mode };
      if (mode === "filtered") {
        params.searchParam = search;
        params.smartSearch = true;
        if (tagFilter && tagFilter !== "all") params.tagId = Number(tagFilter);
        if (walletFilter && walletFilter !== "all") params.walletId = Number(walletFilter);
      }
      const { data } = await exportContacts(params);
      if (!data?.downloadLink) throw new Error("missing downloadLink");
      const a = document.createElement("a");
      a.href = data.downloadLink;
      a.download = "contatos.xlsx";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(tC("errorExporting"));
    }
  };

  const handleUazapiChatFind = async () => {
    const sessionId = Number(uazapiChatFindSession);
    if (!sessionId || !uazapiChatFindQuery.trim()) return;
    setUazapiChatFindLoading(true);
    try {
      const res = await findUazapiChat({ whatsappId: sessionId, query: uazapiChatFindQuery.trim(), type: uazapiChatFindType, limit: uazapiChatFindLimit });
      const results = Array.isArray(res.data) ? res.data : (res.data?.chats ?? res.data?.data ?? []);
      setUazapiChatFindResults(results);
    } catch {
      toast.error(tC("uazapiChatFindError"));
    } finally {
      setUazapiChatFindLoading(false);
    }
  };

  const handleSyncContacts = async () => {
    try { await syncContacts(); toast.success(tC("syncStarted")); } catch { toast.error(tC("errorSyncing")); }
  };

  const handleSyncGroups = async () => {
    try { await syncContactGroups(); toast.success(tC("groupsSynced")); } catch { toast.error(tC("errorSyncingGroups")); }
  };

  const handleRemoveDuplicates = async () => {
    try {
      const data = await removeDuplicateContacts();
      toast.success(tC("duplicatesRemoved"));
      setCleanupSummary({ title: tC("removeDuplicates"), data });
      load(1);
    } catch { toast.error(tC("errorRemovingDuplicates")); }
  };

  const handleGroupLid = async () => {
    try {
      const data = await groupContactLid();
      toast.success(tC("lidsGrouped"));
      setCleanupSummary({ title: tC("groupLid"), data });
      load(1);
    } catch { toast.error(tC("errorGroupingLids")); }
  };

  const handleCheckNinthDigit = async () => {
    try {
      const data = await checkNinthDigit();
      toast.success(tC("ninthDigitChecked"));
      setCleanupSummary({ title: tC("checkNinthDigit"), data });
      load(1);
    } catch { toast.error(tC("errorCheckingNinthDigit")); }
  };

  const connectedWhatsapps = whatsapps.filter((w) => w.status === "CONNECTED" && !w.isDeleted);

  // Regra Vue: admin ou super com supervisorAdmin=disabled vê todas; demais filtram por whatsappAllowed
  const canSeeAllSessions = isAdmin || (user?.profile === "super" && supervisorAdmin === "disabled");
  const allowedSessions = canSeeAllSessions
    ? connectedWhatsapps
    : connectedWhatsapps.filter((w) =>
        (user?.whatsappAllowed as { id: number }[] | undefined)?.some((wa) => wa.id === w.id) ?? true
      );

  const getChannelWhatsapps = (type: string) => allowedSessions.filter((w) => {
    const wType = w.type || w.channel;
    return wType === type;
  });

  // Number-based channel types (require contact.number)
  const NUMBER_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "zapi", "uazapi", "waba", "gupshup", "dialog360", "hub_whatsapp_business_account"];

  // Returns sessions for a channel type, respecting contact field requirements
  const getContactChannelWhatsapps = (type: string, contact: Contact) => {
    const sessions = getChannelWhatsapps(type);
    if (sessions.length === 0) return [];
    if (NUMBER_CHANNEL_TYPES.includes(type)) {
      return contact.number ? sessions : [];
    }
    if (type === "messenger") {
      return contact.messengerId && !contact.number ? sessions : [];
    }
    if (type === "instagram") {
      return contact.instagramPK && !contact.number ? sessions : [];
    }
    if (type === "hub_instagram") {
      return contact.instagramPK ? sessions : [];
    }
    if (type === "hub_facebook") {
      return contact.messengerId ? sessions : [];
    }
    return sessions;
  };

  // Antes: `isAdmin || isSuporte` — `isSuporte` era heuristico bugado (email.includes("@"))
  // entao na pratica admitia qualquer usuario. Apos o fix do auth-store, a intencao
  // semantica e "admin OU supervisor" (super). Tornar explicito.
  const isAdminOrSuper = isAdmin || user?.profile === "super";

  const { sortKey, sortDir, handleSort, sortedData } = useSortable(contacts, "name");

  // --- Early return after all hooks ---
  if (!allowed) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("tableTitle")}
        description={t("searchPlaceholder")}
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
            {
              title: t("helpS3T"),
              items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2"), t("helpS3I3")],
            },
          ],
        }}
      >
        <div className="flex gap-2 flex-wrap items-center">
          {isAdminOrSuper && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{tC("utilities")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSyncContacts}>{tC("syncContacts")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleSyncGroups}>{tC("syncGroups")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleRemoveDuplicates}>{tC("removeDuplicates")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleGroupLid}>{tC("groupLid")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleCheckNinthDigit}>{tC("checkNinthDigit")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedIds.length > 0 && canDeleteContact && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{tC("deleteSelected", { count: selectedIds.length })}</span>
              <span className="sm:hidden">{selectedIds.length}</span>
            </Button>
          )}
          {/* Mobile: agrupa importação em dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="sm:hidden">
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setImportFile(null); setImportTagIds([]); setImportWalletId(null); setImportDialogOpen(true); }}>
                <Upload className="mr-2 h-4 w-4" /> {t("importContactsLabel")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSmartImportOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> {tC("smartImportLabel")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                const csv = "nome;numero;email;cpf;dataNascimento;primeiroNome;ultimoNome;Empresa\nExemplo;5511999999999;email@exemplo.com;000.000.000-00;01/01/2000;Primeiro;Último;Empresa Ltda";
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a"); a.href = window.URL.createObjectURL(blob); a.download = "modelo-contatos.csv"; a.click(); window.URL.revokeObjectURL(a.href);
              }}>
                <FileDown className="mr-2 h-4 w-4" /> {tC("modelCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openExportDialog}>
                <Download className="mr-2 h-4 w-4" /> {t("exportContactsLabel")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Desktop: botões individuais */}
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => { setImportFile(null); setImportTagIds([]); setImportWalletId(null); setImportDialogOpen(true); }}>
            <Upload className="mr-2 h-4 w-4" /> {t("importContactsLabel")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => setSmartImportOpen(true)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> {tC("smartImportLabel")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => {
            const csv = "nome;numero;email;cpf;dataNascimento;primeiroNome;ultimoNome;Empresa\nExemplo;5511999999999;email@exemplo.com;000.000.000-00;01/01/2000;Primeiro;Último;Empresa Ltda";
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a"); a.href = window.URL.createObjectURL(blob); a.download = "modelo-contatos.csv"; a.click(); window.URL.revokeObjectURL(a.href);
          }}>
            <FileDown className="mr-2 h-4 w-4" /> {tC("modelCsv")}
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={openExportDialog}>
            <Download className="mr-2 h-4 w-4" /> {t("exportContactsLabel")}
          </Button>
          {/* UazAPI chat/find — botão desabilitado por ora; descomentar quando fizer sentido liberar
          {whatsapps.some((w) => (w as any).type === "uazapi" && (w as any).status === "CONNECTED") && (
            <Button variant="outline" size="sm" onClick={() => setUazapiChatFindOpen(true)}>
              <Search className="mr-2 h-4 w-4" /> {tC("uazapiChatFind")}
            </Button>
          )}
          */}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("addContactLabel")}</span>
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="pl-9 w-full" />
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <SearchableSelect
            options={[
              { value: "all", label: tC("allTags") },
              ...tags
                .filter((tag) => tag.isActive !== false)
                .map((tag) => ({ value: String(tag.id), label: tag.name })),
            ]}
            value={tagFilter}
            onValueChange={setTagFilter}
            placeholder={tC("filterByTag")}
            className="w-[160px]"
            clearable
          />
          <SearchableSelect
            options={[{ value: "all", label: tC("allWallets") }, ...wallets.map((w) => ({ value: String(w.id), label: w.name }))]}
            value={walletFilter}
            onValueChange={setWalletFilter}
            placeholder={tC("filterByWallet")}
            className="w-[160px]"
            clearable
          />
          <SearchableSelect
            options={[{ value: "all", label: tC("allQueues") }, ...queues.map((q) => ({ value: String(q.id), label: q.name }))]}
            value={queueFilter}
            onValueChange={setQueueFilter}
            placeholder={tC("filterByQueue")}
            className="w-[160px]"
            clearable
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0"><SlidersHorizontal className="mr-2 h-4 w-4" /> {tC("columns")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>{tC("visibleColumns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[...ALL_COLUMNS].sort((a, b) => a.label.localeCompare(b.label)).map((col) => (
                <DropdownMenuCheckboxItem key={col.key} checked={isColVisible(col.key)} onCheckedChange={() => toggleColumn(col.key)}>
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading && page === 1 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState icon={Users} title={tC("noContacts")} description={tC("noContactsDesc")}>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {tC("newContact")}</Button>
        </EmptyState>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isColVisible("select") && (
                    <TableHead className="w-10">
                      <Checkbox checked={selectedIds.length === contacts.length && contacts.length > 0} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                  )}
                  {isColVisible("id") && <SortableTableHead sortKey="id" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-16">ID</SortableTableHead>}
                  {isColVisible("avatar") && <TableHead className="w-12" />}
                  {isColVisible("name") && <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("nameColumn")}</SortableTableHead>}
                  {isColVisible("whatsapp") && <SortableTableHead sortKey="number" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("whatsappColumn")}</SortableTableHead>}
                  {isColVisible("email") && <SortableTableHead sortKey="email" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colEmail")}</SortableTableHead>}
                  {isColVisible("cpf") && <SortableTableHead sortKey="cpf" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colCpf")}</SortableTableHead>}
                  {isColVisible("empresa") && <SortableTableHead sortKey="businessName" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colEmpresa")}</SortableTableHead>}
                  {isColVisible("tags") && <TableHead>{tC("colTags")}</TableHead>}
                  {isColVisible("lid") && <SortableTableHead sortKey="lid" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colLid")}</SortableTableHead>}
                  {isColVisible("firstName") && <SortableTableHead sortKey="firstName" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colFirstName")}</SortableTableHead>}
                  {isColVisible("lastName") && <SortableTableHead sortKey="lastName" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colLastName")}</SortableTableHead>}
                  {isColVisible("wallet") && <SortableTableHead sortKey="wallet" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colWallet")}</SortableTableHead>}
                  {isColVisible("queue") && <SortableTableHead sortKey="queue" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colQueue")}</SortableTableHead>}
                  {isColVisible("kanban") && <TableHead>{tC("colKanban")}</TableHead>}
                  {isColVisible("birthdayDate") && <SortableTableHead sortKey="birthdayDate" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{tC("colBirthday")}</SortableTableHead>}
                  {isColVisible("telegramId") && <TableHead>{tC("colTelegram")}</TableHead>}
                  {isColVisible("messengerId") && <TableHead>{tC("colMessenger")}</TableHead>}
                  {isColVisible("instagramPK") && <TableHead>{tC("colInstagramPK")}</TableHead>}
                  {isColVisible("hubWhatsapp") && <TableHead>{tC("colHubWa")}</TableHead>}
                  {isColVisible("cep") && <TableHead>{tC("colCep")}</TableHead>}
                  {isColVisible("cidade") && <TableHead>{tC("colCidade")}</TableHead>}
                  {isColVisible("estado") && <TableHead>{tC("colEstado")}</TableHead>}
                  {isColVisible("bloquearContato") && <TableHead>{tC("colBlocked")}</TableHead>}
                  {isColVisible("bloquearChatbot") && <TableHead>{tC("colBlockedChatbot")}</TableHead>}
                  {isColVisible("actions") && <TableHead className="w-48">{tC("colActions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((c) => (
                  <TableRow key={c.id}>
                    {isColVisible("select") && (
                      <TableCell><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                    )}
                    {isColVisible("id") && <TableCell className="text-muted-foreground tabular-nums text-sm">{c.id}</TableCell>}
                    {isColVisible("avatar") && (
                      <TableCell>
                        <Avatar
                          className={c.profilePicUrl ? "h-8 w-8 cursor-zoom-in" : "h-8 w-8"}
                          onClick={() => { if (c.profilePicUrl) setProfilePicPreview({ url: c.profilePicUrl, name: c.name }); }}
                        >
                          <AvatarImage
                            src={c.profilePicUrl}
                            className={cn(isLiveMode && "live-blur")}
                            onLoadingStatusChange={(status) => {
                              if (status === "error" && c.id) {
                                setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, profilePicUrl: undefined } : x));
                                removeContactProfilePicture(c.id).catch(() => {});
                              }
                            }}
                          />
                          <AvatarFallback className={cn("text-xs", isLiveMode && "live-blur-text")}>{getInitials(c.name)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                    )}
                    {isColVisible("name") && <TableCell className={cn("font-medium", isLiveMode && "live-blur-text")}>{c.name}</TableCell>}
                    {isColVisible("whatsapp") && (
                      <TableCell>
                        <span className={cn("flex items-center gap-1 text-sm", isLiveMode && "live-blur-text")}>
                          <Phone className="h-3 w-3 text-muted-foreground" /> {displayContactIdentity(c)}
                        </span>
                      </TableCell>
                    )}
                    {isColVisible("email") && (
                      <TableCell>
                        {c.email && <span className={cn("flex items-center gap-1 text-sm", isLiveMode && "live-blur-text")}><Mail className="h-3 w-3 text-muted-foreground" /> {c.email}</span>}
                      </TableCell>
                    )}
                    {isColVisible("cpf") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.cpf || "—"}</span></TableCell>}
                    {isColVisible("empresa") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.businessName || "—"}</span></TableCell>}
                    {isColVisible("tags") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).slice(0, 3).map((tag, i) => (
                            <Badge key={tag.id ?? `${c.id}-tag-${i}`} variant="outline" className="text-[10px]" style={{ borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}15` }}>
                              {tag.name || tag.tag || ""}
                            </Badge>
                          ))}
                          {(c.tags || []).length > 3 && <Badge variant="secondary" className="text-[10px]">+{(c.tags || []).length - 3}</Badge>}
                        </div>
                      </TableCell>
                    )}
                    {isColVisible("lid") && <TableCell><span className="text-xs font-mono">{c.lid || "—"}</span></TableCell>}
                    {isColVisible("firstName") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.firstName || "—"}</span></TableCell>}
                    {isColVisible("lastName") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.lastName || "—"}</span></TableCell>}
                    {isColVisible("wallet") && <TableCell><span className="text-sm">{(typeof c.wallet === "string" ? c.wallet : (c.wallet as { name?: string } | null)?.name) || "—"}</span></TableCell>}
                    {isColVisible("queue") && <TableCell><span className="text-sm">{(typeof c.queue === "string" ? c.queue : (c.queue as { queue?: string } | null)?.queue) || "—"}</span></TableCell>}
                    {isColVisible("kanban") && <TableCell><span className="text-sm">{c.kanban ?? "—"}</span></TableCell>}
                    {isColVisible("birthdayDate") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{formatBirthdayDisplay(c.birthdayDate || c.birthDate)}</span></TableCell>}
                    {isColVisible("telegramId") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.telegramId || "—"}</span></TableCell>}
                    {isColVisible("messengerId") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.messengerId || "—"}</span></TableCell>}
                    {isColVisible("instagramPK") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.instagramPK || "—"}</span></TableCell>}
                    {isColVisible("hubWhatsapp") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.hubWhatsapp || "—"}</span></TableCell>}
                    {isColVisible("cep") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.cep || "—"}</span></TableCell>}
                    {isColVisible("cidade") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.cidade || "—"}</span></TableCell>}
                    {isColVisible("estado") && <TableCell><span className={cn("text-sm", isLiveMode && "live-blur-text")}>{c.estado || "—"}</span></TableCell>}
                    {isColVisible("bloquearContato") && (
                      <TableCell>
                        <Switch checked={!!(c.bloquearContato ?? c.blocked)} onCheckedChange={() => handleToggleBlock(c, "bloquearContato")} />
                      </TableCell>
                    )}
                    {isColVisible("bloquearChatbot") && (
                      <TableCell>
                        <Switch checked={!!(c.bloquearChatbot ?? c.chatbotBlocked)} onCheckedChange={() => handleToggleBlock(c, "bloquearChatbot")} />
                      </TableCell>
                    )}
                    {isColVisible("actions") && (
                      <TableCell>
                        <div className="flex gap-1">
                          {/* Single dropdown for all available channels */}
                          {CHANNEL_TYPES.some((ch) => getContactChannelWhatsapps(ch.type, c).length > 0) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title={tC("startAttendanceTooltip")}>
                                  <MessageSquare className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{tC("startTicketAction")}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {CHANNEL_TYPES.map((ch) => {
                                  const wps = getContactChannelWhatsapps(ch.type, c);
                                  if (wps.length === 0) return null;
                                  return (
                                    <DropdownMenuItem key={ch.type} onClick={() => openStartTicketModal(c, ch, wps)}>
                                      <img src={`/${ch.logo}`} alt={ch.label} className="h-4 w-4 object-contain mr-2" />
                                      {wps.length === 1 ? `${ch.label} — ${wps[0].name}` : ch.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {/* Spy button (admin only; também gated por controlFeatures p/ user comum) */}
                          {isAdminOrSuper && !spyBlockedByFeatureControl && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={tC("spyTooltip")} onClick={() => handleSpy(c)}>
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={tC("editTooltip")} onClick={() => openEdit(c)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {canDeleteContact && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={tC("removeTooltip")} onClick={() => setDeleting(c)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalContacts != null
                ? `${contacts.length}/${totalContacts} ${tC("contactCount", { count: totalContacts }).replace(String(totalContacts), "").trim()}`
                : tC("contactCount", { count: contacts.length })}
              {selectedIds.length > 0 && ` · ${tC("selectedCount", { count: selectedIds.length })}`}
            </p>
            <div className="flex gap-2">
              {/* "Anterior" removido: o load() faz merge dedup e nunca remove itens da lista;
                  a única ação real é buscar a próxima página (Carregar mais) */}
              <Button variant="outline" size="sm" disabled={!hasMore || loading} onClick={() => load(page + 1)}>
                {tLoadMore("loadMore")} <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (v) setDialogOpen(true); else attemptCloseContactDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? tC("editContact") : tC("newContactTitle")}</DialogTitle>
            <DialogDescription>
              {editing ? tC("updateContactDesc") : tC("createContactDesc")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{tC("nameLabel")}</Label>
                <div className="flex gap-2">
                  <Input {...form.register("name")} placeholder={tC("namePlaceholder")} />
                  {editing && (
                    <Button type="button" variant="ghost" size="icon" title={tCED("refreshNameTitle")} onClick={handleUpdateName}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{tC("numberLabel")}</Label>
                <div className="flex gap-2">
                  <PhoneInput
                    className="flex-1"
                    value={form.watch("number")}
                    onChange={(val) => form.setValue("number", val, { shouldValidate: true, shouldDirty: true })}
                  />
                  {editing && (
                    <Button type="button" variant="ghost" size="icon" title={tCED("refreshNumberTitle")} onClick={handleUpdateNumber}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {form.formState.errors.number && <p className="text-xs text-destructive">{form.formState.errors.number.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{tC("firstNameLabel")}</Label>
                <Input {...form.register("firstName")} placeholder={tC("firstNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{tC("lastNameLabel")}</Label>
                <Input {...form.register("lastName")} placeholder={tC("lastNamePlaceholder")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{tC("emailLabel")}</Label>
                <Input {...form.register("email")} placeholder={tC("emailPlaceholder")} type="email" />
                {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
              </div>
            </div>

            <Collapsible open={extrasOpen} onOpenChange={setExtrasOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  <span>{tCED("extraFieldsSection")}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", extrasOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{tC("cpfLabel")}</Label>
                    <Input {...form.register("cpf")} placeholder={tC("cpfPlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("birthDateLabel")}</Label>
                    <Input {...form.register("birthDate")} type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("businessNameLabel")}</Label>
                    <Input {...form.register("businessName")} placeholder={tC("businessNamePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("cepLabel")}</Label>
                    <div className="relative">
                      <Input
                        {...form.register("cep")}
                        placeholder={tC("cepPlaceholder")}
                        maxLength={9}
                        onChange={(e) => {
                          form.setValue("cep", e.target.value, { shouldDirty: true });
                          handleCepLookup(e.target.value);
                        }}
                      />
                      {cepLoading && (
                        <RefreshCw className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("cidadeLabel")}</Label>
                    <Input {...form.register("cidade")} placeholder={tC("cidadeLabel")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("estadoLabel")}</Label>
                    <Input {...form.register("estado")} placeholder={tC("estadoLabel")} maxLength={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("messengerIdLabel")}</Label>
                    <Input {...form.register("messengerId")} placeholder={tC("messengerIdPlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("instagramPKLabel")}</Label>
                    <Input {...form.register("instagramPK")} placeholder="Instagram PK" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("hubWhatsappLabel")}</Label>
                    <Input {...form.register("hubWhatsapp")} placeholder="Hub WhatsApp" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tC("lidLabel")}</Label>
                    <div className="flex gap-2">
                      <Input {...form.register("lid")} placeholder={tC("lidPlaceholder")} />
                      {editing && (
                        <Button type="button" variant="ghost" size="icon" title={tCED("refreshLidTitle")} onClick={() => handleRefreshLid(editing.id)}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.telegramId")}</Label>
                    <Input {...form.register("telegramId")} placeholder={tCED("placeholders.telegramId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.webchatId")}</Label>
                    <Input {...form.register("webchatId")} placeholder={tCED("placeholders.webchatId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.mercadolivreId")}</Label>
                    <Input {...form.register("mercadolivreId")} placeholder={tCED("placeholders.mercadolivreId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.linkedinId")}</Label>
                    <Input {...form.register("linkedinId")} placeholder={tCED("placeholders.linkedinId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.youtubeChannelId")}</Label>
                    <Input {...form.register("youtubeChannelId")} placeholder={tCED("placeholders.youtubeChannelId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.tiktokId")}</Label>
                    <Input {...form.register("tiktokId")} placeholder={tCED("placeholders.tiktokId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubMercadolivre")}</Label>
                    <Input {...form.register("hubMercadolivre")} placeholder="Hub Mercado Livre" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubTiktok")}</Label>
                    <Input {...form.register("hubTiktok")} placeholder="Hub TikTok" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubLikedin")}</Label>
                    <Input {...form.register("hubLikedin")} placeholder="Hub LinkedIn" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubOlx")}</Label>
                    <Input {...form.register("hubOlx")} placeholder="Hub OLX" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubYoutube")}</Label>
                    <Input {...form.register("hubYoutube")} placeholder="Hub YouTube" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubIfood")}</Label>
                    <Input {...form.register("hubIfood")} placeholder="Hub iFood" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubTwitter")}</Label>
                    <Input {...form.register("hubTwitter")} placeholder="Hub Twitter" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubSms")}</Label>
                    <Input {...form.register("hubSms")} placeholder="Hub SMS" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubTelegram")}</Label>
                    <Input {...form.register("hubTelegram")} placeholder="Hub Telegram" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubWidget")}</Label>
                    <Input {...form.register("hubWidget")} placeholder="Hub Widget" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubWebchat")}</Label>
                    <Input {...form.register("hubWebchat")} placeholder="Hub Webchat" />
                  </div>
                  <div className="space-y-2">
                    <Label>{tCED("labels.hubEmail")}</Label>
                    <Input {...form.register("hubEmail")} placeholder="Hub Email" />
                  </div>
                </div>

                <div className="flex items-center gap-3 border rounded-md p-3">
                  <Switch
                    id="isLid"
                    checked={isLidForm}
                    onCheckedChange={(v) => { setIsLidForm(v); form.setValue("isLid", v, { shouldDirty: true }); }}
                  />
                  <Label htmlFor="isLid" className="cursor-pointer">
                    <Bot className="inline h-4 w-4 mr-1" /> {tC("isLidLabel")}
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <Label>{tC("tagsLabel")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start">
                    {selectedTagIds.length ? tC("selectedTags", { count: selectedTagIds.length }) : tC("selectTags")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-48 overflow-y-auto">
                  {tags
                    .filter((tag) => tag.isActive !== false || selectedTagIds.includes(tag.id))
                    .map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={(checked) => setSelectedTagIds((prev) => (checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id)))}
                      >
                        {tag.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTagIds.map((id) => {
                  const tag = tags.find((t) => t.id === id);
                  return tag ? (
                    <Badge key={id} variant="outline" className="text-xs" style={{ borderColor: tag.color, color: tag.color }}>
                      {tag.name}
                      <button type="button" onClick={() => setSelectedTagIds((p) => p.filter((x) => x !== id))} className="ml-1 hover:opacity-70">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tC("walletLabel")}</Label>
              <SearchableSelect
                options={[{ value: "all", label: tC("noWallet") }, ...wallets.map((w) => ({ value: String(w.id), label: w.name }))]}
                value={selectedWalletId != null ? String(selectedWalletId) : "all"}
                onValueChange={(v) => setSelectedWalletId(v === "all" ? null : Number(v))}
                placeholder={tC("selectWallet")}
              />
            </div>

            <div className="space-y-2">
              <Label>{tC("queueLabel")}</Label>
              <SearchableSelect
                options={[{ value: "all", label: tC("noQueue") }, ...queues.filter((q) => q.isActive !== false || q.id === selectedQueueId).map((q) => ({ value: String(q.id), label: q.name }))]}
                value={selectedQueueId != null ? String(selectedQueueId) : "all"}
                onValueChange={(v) => setSelectedQueueId(v === "all" ? null : Number(v))}
                placeholder={tC("selectQueue")}
              />
              <p className="text-xs text-muted-foreground">{tC("queueRoutingNote")}</p>
            </div>

            <div className="space-y-2">
              <Label>{tC("extraFields")}</Label>
              {extraInfo.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex gap-2">
                    <Input placeholder={tC("fieldName")} value={item.name} onChange={(e) => setExtraInfo((p) => p.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} className={`flex-1 ${hasDuplicateExtraName(idx) ? "border-destructive" : ""}`} />
                    <Input placeholder={tC("fieldValue")} value={item.value} onChange={(e) => setExtraInfo((p) => p.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} className="flex-1" />
                    <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setExtraInfo((p) => p.filter((_, i) => i !== idx)); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {hasDuplicateExtraName(idx) && <p className="text-xs text-destructive">{tC("duplicateName")}</p>}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setExtraInfo((p) => [...p, { name: "", value: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> {tC("addField")}
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={attemptCloseContactDialog}>{tC("cancelar")}</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? tC("saving") : tC("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tC("exportDialogTitle")}</DialogTitle>
            <DialogDescription>{tC("exportDialogDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{tC("exportDialogHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" className="w-full" onClick={() => handleExport("all")}>{tC("exportAllOption")}</Button>
              <span className="text-xs text-muted-foreground">{exportCounts ? tC("exportCount", { count: exportCounts.all }) : "…"}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button className="w-full" onClick={() => handleExport("filtered")}>{tC("exportFilteredOption")}</Button>
              <span className="text-xs text-muted-foreground">{exportCounts ? tC("exportCount", { count: exportCounts.filtered }) : "…"}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setImportFile(null); setImportTagIds([]); setImportWalletId(null); setImportQueueId(null); setImportValidate(false); setImportAddTags(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tC("importTitle")}</DialogTitle>
            <DialogDescription>{tC("importDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{tC("fileLabel")}</Label>
              <Button variant="outline" type="button" onClick={handleImportClick}>
                {importFile ? importFile.name : tC("selectFileBtn")}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>{tC("tagsOptional")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {importTagIds.length ? `${importTagIds.length} tag(s)` : tC("selectTags")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-48 overflow-y-auto">
                  {tags
                    .filter((tag) => tag.isActive !== false)
                    .map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={importTagIds.includes(tag.id)}
                        onCheckedChange={(checked) => setImportTagIds((prev) => (checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id)))}
                      >
                        {tag.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-2">
              <Label>{tC("walletOptional")}</Label>
              <SearchableSelect
                options={[{ value: "all", label: tC("noWallet") }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
                value={importWalletId != null ? String(importWalletId) : "all"}
                onValueChange={(v) => setImportWalletId(v === "all" ? null : Number(v))}
                placeholder={tC("selectWallet")}
              />
            </div>
            <div className="space-y-2">
              <Label>{tC("queueLabel")}</Label>
              <SearchableSelect
                options={[{ value: "all", label: tC("noQueue") }, ...queues.filter((q) => q.isActive !== false || q.id === importQueueId).map((q) => ({ value: String(q.id), label: q.name }))]}
                value={importQueueId != null ? String(importQueueId) : "all"}
                onValueChange={(v) => setImportQueueId(v === "all" ? null : Number(v))}
                placeholder={tC("selectQueue")}
              />
            </div>
          </div>
            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="import-validate" checked={importValidate} onCheckedChange={(v) => setImportValidate(!!v)} />
              <div className="space-y-0.5">
                <Label htmlFor="import-validate" className="cursor-pointer">{tC("validateContacts")}</Label>
                {importValidate && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{tC("validateWarning")}</p>
                )}
              </div>
            </div>
            {importTagIds.length > 0 && (
              <div className="flex items-start gap-2 pt-1">
                <Checkbox id="import-addtags" checked={importAddTags} onCheckedChange={(v) => setImportAddTags(!!v)} />
                <div className="space-y-0.5">
                  <Label htmlFor="import-addtags" className="cursor-pointer">{tC("addTagsLabel")}</Label>
                  {importAddTags && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{tC("addTagsWarning")}</p>
                  )}
                </div>
              </div>
            )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>{tC("cancelar")}</Button>
            <Button onClick={handleImportConfirm} disabled={!importFile}>{tC("import")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o && !deletingContact) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tC("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>{tC("cannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {tC("confirmDeleteMsg", { name: deleting?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingContact}>{tC("cancelar")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingContact} className="gap-1">
              {deletingContact && <Loader2 className="h-4 w-4 animate-spin" />}
              {tC("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { if (!bulkDeleting) setBulkDeleteOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tC("bulkDeleteTitle")}</DialogTitle>
            <DialogDescription>{tC("cannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {tC("bulkDeleteMsg", { count: selectedIds.length })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>{tC("cancelar")}</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="gap-1">
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {tC("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resumo das operações de deduplicação (Remover Duplicados / Agrupar LIDs / 9º Dígito) */}
      <Dialog open={!!cleanupSummary} onOpenChange={(open) => { if (!open) setCleanupSummary(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{cleanupSummary?.title} — {tC("cleanupSummaryTitle")}</DialogTitle>
            <DialogDescription>{tC("cleanupReversibleNote")}</DialogDescription>
          </DialogHeader>
          {cleanupSummary && (() => {
            const numberByDuplicate = new Map(
              (cleanupSummary.data.removedContacts ?? []).map((rc) => [rc.contactId, rc.number])
            );
            const rows = cleanupSummary.data.results ?? [];
            const merged = cleanupSummary.data.consolidated ?? cleanupSummary.data.removedContacts?.length ?? 0;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  {[
                    { label: tC("cleanupGroups"), value: cleanupSummary.data.groups ?? 0 },
                    { label: tC("cleanupMerged"), value: merged },
                    { label: tC("cleanupSkipped"), value: cleanupSummary.data.skipped ?? 0 },
                    { label: tC("cleanupErrors"), value: cleanupSummary.data.errors ?? 0 },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md border p-2">
                      <div className="text-lg font-semibold">{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">{tC("cleanupStatusConsolidated")}:</span>{" "}
                    {tC("cleanupLegendMerged")}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">{tC("cleanupStatusSkipped")}:</span>{" "}
                    {tC("cleanupLegendSkipped")}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">{tC("cleanupStatusError")}:</span>{" "}
                    {tC("cleanupLegendError")}
                  </p>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tC("cleanupNoDuplicates")}</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tC("cleanupColPrimary")}</TableHead>
                          <TableHead>{tC("cleanupColDuplicate")}</TableHead>
                          <TableHead>{tC("cleanupColStatus")}</TableHead>
                          <TableHead>{tC("cleanupColDetail")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice(0, 200).map((r, i) => (
                          <TableRow key={`${r.primaryId}-${r.duplicateId}-${i}`}>
                            <TableCell className="whitespace-nowrap">#{r.primaryId}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              #{r.duplicateId}
                              {numberByDuplicate.get(r.duplicateId) ? (
                                <span className="ml-1 text-xs text-muted-foreground">({numberByDuplicate.get(r.duplicateId)})</span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {r.status === "consolidated"
                                ? tC("cleanupStatusConsolidated")
                                : r.status === "skipped"
                                  ? tC("cleanupStatusSkipped")
                                  : tC("cleanupStatusError")}
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground" title={r.detail || ""}>
                              {r.detail || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {rows.length > 200 && (
                      <p className="p-2 text-xs text-muted-foreground">{tC("cleanupTruncated")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupSummary(null)}>{tC("cleanupClose")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Delete Dialog (single) */}
      <Dialog open={forceDeleteOpen} onOpenChange={(open) => { if (!open) { setForceDeleteOpen(false); setForceDeleteContactId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tC("forceDeleteTitle")}</DialogTitle>
            <DialogDescription>{forceDeleteMsg}</DialogDescription>
          </DialogHeader>
          {!canDeleteContact && (
            <p className="text-sm text-destructive py-2">{tC("adminOnlyMsg")}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForceDeleteOpen(false); setForceDeleteContactId(null); }}>{tC("cancelar")}</Button>
            {canDeleteContact && (
              <Button variant="destructive" onClick={handleForceDelete}>{tC("forceDelete")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Force Delete Dialog */}
      <Dialog open={bulkForceOpen} onOpenChange={(open) => { if (!open) { setBulkForceOpen(false); setBulkForceIds([]); setSelectedIds([]); load(1); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tC("forceDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {tC("bulkForceMsg", { count: bulkForceIds.length })}
            </DialogDescription>
          </DialogHeader>
          {!canDeleteContact && (
            <p className="text-sm text-destructive py-2">{tC("adminOnlyMsg")}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkForceOpen(false); setBulkForceIds([]); setSelectedIds([]); load(1); }}>{tC("cancelar")}</Button>
            {canDeleteContact && (
              <Button variant="destructive" onClick={handleBulkForceDelete}>{tC("forceDelete")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Ticket Modal */}
      <Dialog open={startTicketOpen} onOpenChange={(open) => { if (!open) setStartTicketOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tC("startTicketTitle")}</DialogTitle>
            <DialogDescription>
              {tC("startTicketDesc", { contact: startTicketContact?.name ?? "", channel: startTicketChannelLabel })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {startTicketConnections.length > 1 && (
              <div className="space-y-2">
                <Label>{tC("connectionLabel")}</Label>
                <SearchableSelect
                  options={startTicketConnections.map((w) => ({ value: String(w.id), label: w.name }))}
                  value={startTicketConnectionId != null ? String(startTicketConnectionId) : ""}
                  onValueChange={(v) => setStartTicketConnectionId(Number(v))}
                  placeholder={tC("selectConnection")}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{tC("queueOptional")}</Label>
              <SearchableSelect
                options={[{ value: "none", label: tC("noQueue") }, ...queues.filter((q) => q.isActive !== false).map((q) => ({ value: String(q.id), label: q.name }))]}
                value={startTicketQueueId != null ? String(startTicketQueueId) : "none"}
                onValueChange={(v) => { setStartTicketQueueId(v === "none" ? null : Number(v)); setStartTicketUserId(null); }}
                placeholder={tC("noQueue")}
              />
              {startTicketQueueId && (
                <Alert className="py-2 px-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="pl-6 text-xs">
                    {tC("queueFilterNotice", { queue: queues.find((q) => q.id === startTicketQueueId)?.name ?? "" })}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="space-y-2">
              <Label>{tC("attendantOptional")}</Label>
              <SearchableSelect
                options={[
                  { value: "none", label: tC("noAttendant") },
                  ...users
                    .filter((u) => {
                      if (!startTicketQueueId) return true;
                      const uWithQueues = u as { queues?: { id: number }[] };
                      return uWithQueues.queues?.some((q) => q.id === startTicketQueueId) ?? false;
                    })
                    .map((u) => ({ value: String(u.id), label: u.name })),
                ]}
                value={startTicketUserId != null ? String(startTicketUserId) : "none"}
                onValueChange={(v) => setStartTicketUserId(v === "none" ? null : Number(v))}
                placeholder={tC("noAttendant")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartTicketOpen(false)}>{tC("cancelar")}</Button>
            <Button onClick={() => handleConfirmStartTicket()} disabled={startTicketSubmitting || !startTicketConnectionId}>
              {startTicketSubmitting ? tC("starting") : tC("start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TicketAlreadyAssignedDialog
        open={assignedDialogOpen}
        onOpenChange={setAssignedDialogOpen}
        info={assignedDialogInfo}
      />

      {/* Existing Ticket Dialog (fallback) */}
      <Dialog open={existingTicketOpen} onOpenChange={setExistingTicketOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tC("existingTicketTitle")}</DialogTitle>
            <DialogDescription>
              {tC("existingTicketDesc", { name: existingTicketContact?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Ticket #{existingTicket?.id}
            {existingTicket?.user?.name && ` — ${tC("attendant")} ${existingTicket.user.name}`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExistingTicketOpen(false)}>{tC("cancelar")}</Button>
            <Button onClick={() => { setExistingTicketOpen(false); router.push(`/atendimento?ticketId=${existingTicket?.id}`); }}>
              {tC("openTicket")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso cross-canal: contato com ticket aberto em OUTRO canal (flag crossChannelTicketCheck) */}
      <ExistingTicketDialog
        open={!!crossChannelTicket}
        onOpenChange={(o) => { if (!o) setCrossChannelTicket(null); }}
        ticket={crossChannelTicket}
        isRestrictedUser={isRestrictedUser()}
        notViewAssignedTickets={notViewAssignedTickets}
        targetWhatsappId={startTicketConnectionId}
        onProceed={() => handleConfirmStartTicket(true)}
      />

      <ProfilePicPreviewDialog preview={profilePicPreview} onClose={() => setProfilePicPreview(null)} blur={isLiveMode} />

      {/* Spy Messages Modal */}
      <SpyContactMessagesDialog
        open={spyOpen}
        onOpenChange={setSpyOpen}
        contactId={spyContact?.id ?? null}
        contactName={spyContact?.name}
      />

      {/* UazAPI Chat Find Dialog */}
      <Dialog open={uazapiChatFindOpen} onOpenChange={setUazapiChatFindOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {tC("uazapiChatFind")}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs">
                    {tC("uazapiChatFindTooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">{tC("uazapiChatFindSession")}</Label>
              <Select value={uazapiChatFindSession} onValueChange={setUazapiChatFindSession}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={tC("uazapiChatFindSelectSession")} />
                </SelectTrigger>
                <SelectContent>
                  {whatsapps.filter((w) => (w as any).type === "uazapi" && (w as any).status === "CONNECTED").map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{(w as any).name || w.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{tC("uazapiChatFindQuery")}</Label>
              <Input className="h-8 text-sm" value={uazapiChatFindQuery} onChange={(e) => setUazapiChatFindQuery(e.target.value)} placeholder={tC("uazapiChatFindQueryPlaceholder")} onKeyDown={(e) => e.key === "Enter" && handleUazapiChatFind()} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{tC("uazapiChatFindType")}</Label>
                <Select value={uazapiChatFindType} onValueChange={(v) => setUazapiChatFindType(v as any)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tC("uazapiChatFindTypeAll")}</SelectItem>
                    <SelectItem value="individual">{tC("uazapiChatFindTypeIndividual")}</SelectItem>
                    <SelectItem value="group">{tC("uazapiChatFindTypeGroup")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tC("uazapiChatFindLimit")}</Label>
                <Input type="number" className="h-8 text-sm" min={1} max={100} value={uazapiChatFindLimit} onChange={(e) => setUazapiChatFindLimit(Number(e.target.value) || 20)} />
              </div>
            </div>
            <Button className="w-full" size="sm" disabled={uazapiChatFindLoading || !uazapiChatFindSession || !uazapiChatFindQuery.trim()} onClick={handleUazapiChatFind}>
              {uazapiChatFindLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {tC("uazapiChatFindBtn")}
            </Button>
            {uazapiChatFindResults.length > 0 && (
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <p className="text-xs font-medium px-3 py-1.5 border-b text-muted-foreground">{tC("uazapiChatFindResults")} ({uazapiChatFindResults.length})</p>
                {uazapiChatFindResults.map((r: any, idx) => (
                  <div key={idx} className="px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/50">
                    <div className="font-medium">{r.name || r.pushname || r.id || "?"}</div>
                    <div className="text-xs text-muted-foreground">{r.id || r.number || ""}</div>
                  </div>
                ))}
              </div>
            )}
            {!uazapiChatFindLoading && uazapiChatFindResults.length === 0 && uazapiChatFindQuery && (
              <p className="text-xs text-muted-foreground text-center py-2">{tC("uazapiChatFindNoResults")}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ImportWizardDialog
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        tags={tags}
        users={users}
        queues={queues}
        onImported={() => load(1)}
      />
    </div>
  );
}
