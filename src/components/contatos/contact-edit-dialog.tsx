"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { X, Plus, Trash2, RefreshCw, Bot, Loader2, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  fetchContact, updateContact, updateContactTags, updateContactLidFromContactId,
  updateContactName, updateContactNumber,
  type ContactPayload,
} from "@/services/contacts";
import { fetchTags, type Tag } from "@/services/tags";
import { fetchWallets, type Wallet } from "@/services/wallets";
import { fetchQueues, type Queue } from "@/services/queues";
import { cn } from "@/lib/utils";
import { formatBirthdayInput } from "@/lib/birthday-format";

// Validation messages are set dynamically in the component via useTranslations
const contactSchema = z.object({
  name: z.string().min(2, "nameMin"),
  number: z.string().min(8, "numberMin"),
  email: z.string().email("emailInvalid").or(z.literal("")).optional(),
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

type ContactForm = z.infer<typeof contactSchema>;

interface ContactEditDialogProps {
  contactId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function ContactEditDialog({ contactId, open, onClose, onSaved }: ContactEditDialogProps) {
  const t = useTranslations("contactEditDialog");
  const tErrors = useTranslations("errors");
  const [tags, setTags] = useState<Tag[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(null);
  const [extraInfo, setExtraInfo] = useState<{ name: string; value: string }[]>([]);
  const [isLidForm, setIsLidForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

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

  // Load tags & wallets once on mount
  useEffect(() => {
    fetchTags().then(({ data }) => setTags(Array.isArray(data) ? data : (data as { data?: Tag[] }).data ?? [])).catch(() => { toast.error(tErrors("loadFailed")); });
    fetchWallets().then(({ data }) => setWallets(Array.isArray(data) ? data : (data as { wallets?: Wallet[] }).wallets ?? [])).catch(() => { toast.error(tErrors("loadFailed")); });
    fetchQueues().then(({ data }) => setQueues(Array.isArray(data) ? data : [])).catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  // Load contact when dialog opens
  useEffect(() => {
    if (!open || !contactId) return;
    setLoading(true);
    fetchContact(contactId)
      .then(({ data }) => {
        const fc = (data as { contact?: typeof data })?.contact ?? data;
        const c = fc as Record<string, unknown>;
        setIsLidForm(!!c.isLid);
        form.reset({
          name: (c.name as string) || "",
          number: (c.number as string) || "",
          email: (c.email as string) || "",
          cpf: (c.cpf as string) || "",
          birthDate: formatBirthdayInput((c.birthDate || c.birthdayDate) as string),
          firstName: (c.firstName as string) || "",
          lastName: (c.lastName as string) || "",
          businessName: (c.businessName as string) || "",
          lid: (c.lid as string) || "",
          isLid: !!c.isLid,
          messengerId: (c.messengerId as string) || "",
          instagramPK: (c.instagramPK as string) || "",
          hubWhatsapp: (c.hubWhatsapp as string) || "",
          cep: (c.cep as string) || "",
          cidade: (c.cidade as string) || "",
          estado: (c.estado as string) || "",
          telegramId: (c.telegramId as string) || "",
          webchatId: (c.webchatId as string) || "",
          mercadolivreId: (c.mercadolivreId as string) || "",
          linkedinId: (c.linkedinId as string) || "",
          youtubeChannelId: (c.youtubeChannelId as string) || "",
          tiktokId: (c.tiktokId as string) || "",
          hubMercadolivre: (c.hubMercadolivre as string) || "",
          hubTiktok: (c.hubTiktok as string) || "",
          hubLikedin: (c.hubLikedin as string) || "",
          hubOlx: (c.hubOlx as string) || "",
          hubYoutube: (c.hubYoutube as string) || "",
          hubIfood: (c.hubIfood as string) || "",
          hubTwitter: (c.hubTwitter as string) || "",
          hubSms: (c.hubSms as string) || "",
          hubTelegram: (c.hubTelegram as string) || "",
          hubWidget: (c.hubWidget as string) || "",
          hubWebchat: (c.hubWebchat as string) || "",
          hubEmail: (c.hubEmail as string) || "",
        });
        setExtrasOpen(false);
        const tids = ((c.tags as { id: number }[]) || []).map((t) => t.id);
        setSelectedTagIds(tids);
        const wallet = ((c.wallets as { walletId?: number; id?: number }[]) || [])[0];
        setSelectedWalletId(wallet?.walletId ?? wallet?.id ?? (c.wallet as { id?: number } | null)?.id ?? null);
        setSelectedQueueId((c.queueId as number | null | undefined) ?? null);
        const ei = c.extraInfo as { name?: string; value?: string }[] | undefined;
        setExtraInfo(Array.isArray(ei) ? ei.map((x) => ({ name: x.name ?? "", value: x.value ?? "" })) : []);
      })
      .catch(() => toast.error(t("errors.loadContact")))
      .finally(() => setLoading(false));
  }, [open, contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCepSearch = async () => {
    const cep = form.getValues("cep")?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) {
      toast.error(t("errors.invalidCep"));
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error(t("errors.cepNotFound"));
        return;
      }
      form.setValue("cidade", data.localidade || "");
      form.setValue("estado", data.uf || "");
    } catch {
      toast.error(t("errors.cepSearch"));
    } finally {
      setCepLoading(false);
    }
  };

  const handleRefreshLid = async () => {
    if (!contactId) return;
    try {
      await updateContactLidFromContactId(contactId);
      toast.success(t("success.lidUpdated"));
    } catch {
      toast.error(t("errors.updateLid"));
    }
  };

  const handleUpdateName = async () => {
    if (!contactId) return;
    const value = form.getValues("name")?.trim();
    if (!value || value.length < 2) {
      toast.error(t("validation.nameMin"));
      return;
    }
    try {
      await updateContactName(contactId, value);
      toast.success(t("success.nameUpdated"));
      onSaved?.();
    } catch (err: unknown) {
      const backendMsg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message;
      if (backendMsg) {
        toast.error(backendMsg);
      } else {
        toast.error(t("errors.updateName"));
      }
    }
  };

  const handleUpdateNumber = async () => {
    if (!contactId) return;
    const value = form.getValues("number")?.trim();
    if (!value) {
      toast.error(t("errors.numberRequired"));
      return;
    }
    try {
      await updateContactNumber(contactId, value);
      toast.success(t("success.numberUpdated"));
      onSaved?.();
    } catch (err: unknown) {
      const backendMsg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message;
      if (backendMsg === "ERR_CONTACT_NUMBER_ALREADY_EXISTS") {
        toast.error(t("errors.numberAlreadyExists"));
      } else if (backendMsg === "ERR_NO_CONTACT_FOUND") {
        toast.error(t("errors.loadContact"));
      } else if (backendMsg) {
        toast.error(backendMsg);
      } else {
        toast.error(t("errors.updateNumber"));
      }
    }
  };

  const hasDuplicateExtraName = (index: number): boolean => {
    const name = extraInfo[index]?.name?.trim();
    if (!name) return false;
    return extraInfo.some((item, i) => i !== index && item.name.trim() === name);
  };

  const onSubmit = async (values: ContactForm) => {
    if (!contactId) return;
    const names = extraInfo.filter((e) => e.name.trim()).map((e) => e.name.trim());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      toast.error(t("errors.duplicateExtraFields") + ": " + [...new Set(dupes)].join(", "));
      return;
    }
    try {
      // Strings vazias viram undefined: evita escrever "" em colunas que devem ficar NULL
      // (webchatId="" some do list de contatos por causa do filtro IS NULL).
      // name e number sao required (validados pelo schema), passam direto.
      const blank = (v: string | undefined) => (v && v.length > 0 ? v : undefined);
      const payload: ContactPayload & Record<string, unknown> = {
        name: values.name,
        number: values.number,
        email: blank(values.email),
        cpf: blank(values.cpf),
        birthdayDate: blank(values.birthDate),
        firstName: blank(values.firstName),
        lastName: blank(values.lastName),
        businessName: blank(values.businessName),
        lid: blank(values.lid),
        isLid: values.isLid,
        messengerId: blank(values.messengerId),
        instagramPK: blank(values.instagramPK),
        hubWhatsapp: blank(values.hubWhatsapp),
        cep: blank(values.cep),
        cidade: blank(values.cidade),
        estado: blank(values.estado),
        telegramId: blank(values.telegramId),
        webchatId: blank(values.webchatId),
        mercadolivreId: blank(values.mercadolivreId),
        linkedinId: blank(values.linkedinId),
        youtubeChannelId: blank(values.youtubeChannelId),
        tiktokId: blank(values.tiktokId),
        hubMercadolivre: blank(values.hubMercadolivre),
        hubTiktok: blank(values.hubTiktok),
        hubLikedin: blank(values.hubLikedin),
        hubOlx: blank(values.hubOlx),
        hubYoutube: blank(values.hubYoutube),
        hubIfood: blank(values.hubIfood),
        hubTwitter: blank(values.hubTwitter),
        hubSms: blank(values.hubSms),
        hubTelegram: blank(values.hubTelegram),
        hubWidget: blank(values.hubWidget),
        hubWebchat: blank(values.hubWebchat),
        hubEmail: blank(values.hubEmail),
      };
      // Always send wallets and extraInfo so backend removes them when empty
      payload.wallets = selectedWalletId != null ? [selectedWalletId] : [];
      // Always send queueId (null clears the contact's queue), mirroring wallets
      payload.queueId = selectedQueueId;
      payload.extraInfo = extraInfo.filter((e) => e.name.trim());
      await updateContact(contactId, payload);
      await updateContactTags(contactId, selectedTagIds);
      toast.success(t("success.contactUpdated"));
      onClose();
      onSaved?.();
    } catch (err: unknown) {
      const backendMsg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message;
      if (backendMsg === "ERR_CONTACT_NUMBER_ALREADY_EXISTS") {
        toast.error(t("errors.numberAlreadyExists"));
      } else if (backendMsg) {
        toast.error(backendMsg);
      } else {
        toast.error(t("errors.updateContact"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !form.formState.isSubmitting && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 relative">
            {form.formState.isSubmitting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/80">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{t("saving")}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("labels.name")}</Label>
                <div className="flex gap-2">
                  <Input {...form.register("name")} placeholder={t("placeholders.name")} />
                  <Button type="button" variant="ghost" size="icon" title={t("refreshNameTitle")} onClick={handleUpdateName}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {form.formState.errors.name && <p className="text-xs text-destructive">{t(`validation.${form.formState.errors.name.message}`)}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("labels.number")}</Label>
                <div className="flex gap-2">
                  <Input {...form.register("number")} placeholder="5511999999999" />
                  <Button type="button" variant="ghost" size="icon" title={t("refreshNumberTitle")} onClick={handleUpdateNumber}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {form.formState.errors.number && <p className="text-xs text-destructive">{t(`validation.${form.formState.errors.number.message}`)}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("labels.firstName")}</Label>
                <Input {...form.register("firstName")} placeholder={t("placeholders.firstName")} />
              </div>
              <div className="space-y-2">
                <Label>{t("labels.lastName")}</Label>
                <Input {...form.register("lastName")} placeholder={t("placeholders.lastName")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("labels.email")}</Label>
                <Input {...form.register("email")} placeholder={t("placeholders.email")} type="email" />
                {form.formState.errors.email && <p className="text-xs text-destructive">{t(`validation.${form.formState.errors.email.message}`)}</p>}
              </div>
            </div>

            <Collapsible open={extrasOpen} onOpenChange={setExtrasOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  <span>{t("extraFieldsSection")}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", extrasOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("labels.cpf")}</Label>
                    <Input {...form.register("cpf")} placeholder={t("placeholders.cpf")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.birthDate")}</Label>
                    <Input {...form.register("birthDate")} type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.businessName")}</Label>
                    <Input {...form.register("businessName")} placeholder={t("placeholders.businessName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.cep")}</Label>
                    <div className="flex gap-2">
                      <Input {...form.register("cep")} placeholder={t("placeholders.cep")} maxLength={9} />
                      <Button type="button" variant="outline" size="icon" title={t("searchCepTitle")} onClick={handleCepSearch} disabled={cepLoading}>
                        {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.cidade")}</Label>
                    <Input {...form.register("cidade")} placeholder={t("placeholders.cidade")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.estado")}</Label>
                    <Input {...form.register("estado")} placeholder={t("placeholders.estado")} maxLength={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.messengerId")}</Label>
                    <Input {...form.register("messengerId")} placeholder={t("placeholders.messengerId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.instagramPK")}</Label>
                    <Input {...form.register("instagramPK")} placeholder="Instagram PK" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubWhatsapp")}</Label>
                    <Input {...form.register("hubWhatsapp")} placeholder="Hub WhatsApp" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.lid")}</Label>
                    <div className="flex gap-2">
                      <Input {...form.register("lid")} placeholder={t("placeholders.lid")} />
                      <Button type="button" variant="ghost" size="icon" title={t("refreshLidTitle")} onClick={handleRefreshLid}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.telegramId")}</Label>
                    <Input {...form.register("telegramId")} placeholder={t("placeholders.telegramId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.webchatId")}</Label>
                    <Input {...form.register("webchatId")} placeholder={t("placeholders.webchatId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.mercadolivreId")}</Label>
                    <Input {...form.register("mercadolivreId")} placeholder={t("placeholders.mercadolivreId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.linkedinId")}</Label>
                    <Input {...form.register("linkedinId")} placeholder={t("placeholders.linkedinId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.youtubeChannelId")}</Label>
                    <Input {...form.register("youtubeChannelId")} placeholder={t("placeholders.youtubeChannelId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.tiktokId")}</Label>
                    <Input {...form.register("tiktokId")} placeholder={t("placeholders.tiktokId")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubMercadolivre")}</Label>
                    <Input {...form.register("hubMercadolivre")} placeholder="Hub Mercado Livre" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubTiktok")}</Label>
                    <Input {...form.register("hubTiktok")} placeholder="Hub TikTok" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubLikedin")}</Label>
                    <Input {...form.register("hubLikedin")} placeholder="Hub LinkedIn" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubOlx")}</Label>
                    <Input {...form.register("hubOlx")} placeholder="Hub OLX" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubYoutube")}</Label>
                    <Input {...form.register("hubYoutube")} placeholder="Hub YouTube" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubIfood")}</Label>
                    <Input {...form.register("hubIfood")} placeholder="Hub iFood" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubTwitter")}</Label>
                    <Input {...form.register("hubTwitter")} placeholder="Hub Twitter" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubSms")}</Label>
                    <Input {...form.register("hubSms")} placeholder="Hub SMS" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubTelegram")}</Label>
                    <Input {...form.register("hubTelegram")} placeholder="Hub Telegram" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubWidget")}</Label>
                    <Input {...form.register("hubWidget")} placeholder="Hub Widget" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubWebchat")}</Label>
                    <Input {...form.register("hubWebchat")} placeholder="Hub Webchat" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("labels.hubEmail")}</Label>
                    <Input {...form.register("hubEmail")} placeholder="Hub Email" />
                  </div>
                </div>

                <div className="flex items-center gap-3 border rounded-md p-3">
                  <Switch
                    id="isLid"
                    checked={isLidForm}
                    onCheckedChange={(v) => { setIsLidForm(v); form.setValue("isLid", v); }}
                  />
                  <Label htmlFor="isLid" className="cursor-pointer">
                    <Bot className="inline h-4 w-4 mr-1" /> {t("labels.isLid")}
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <Label>{t("labels.tags")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {selectedTagIds.length ? t("tagsSelected", { count: selectedTagIds.length }) : t("placeholders.selectTags")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-48 overflow-y-auto">
                  {tags
                    .filter((tag) => tag.isActive !== false || selectedTagIds.includes(tag.id))
                    .map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={(checked) =>
                          setSelectedTagIds((prev) => checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id))
                        }
                      >
                        {tag.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTagIds.map((id) => {
                  const tag = tags.find((tg) => tg.id === id);
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
              <Label>{t("labels.wallet")}</Label>
              <Select
                value={selectedWalletId != null ? String(selectedWalletId) : "none"}
                onValueChange={(v) => setSelectedWalletId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger><SelectValue placeholder={t("placeholders.selectWallet")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noWallet")}</SelectItem>
                  {wallets.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("labels.queue")}</Label>
              <Select
                value={selectedQueueId != null ? String(selectedQueueId) : "none"}
                onValueChange={(v) => setSelectedQueueId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger><SelectValue placeholder={t("placeholders.selectQueue")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noQueue")}</SelectItem>
                  {queues
                    .filter((q) => q.isActive !== false || q.id === selectedQueueId)
                    .map((q) => <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("queueRoutingNote")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("labels.extraFields")}</Label>
              {extraInfo.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Input placeholder={t("placeholders.extraFieldName")} value={item.name} maxLength={255} onChange={(e) => setExtraInfo((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} className={hasDuplicateExtraName(idx) ? "border-destructive" : ""} />
                    {hasDuplicateExtraName(idx) ? (
                      <p className="text-xs text-destructive mt-1">{t("errors.duplicateName")}</p>
                    ) : item.name.length >= 200 ? (
                      <p className={cn("text-[10px] mt-1 text-right", item.name.length >= 255 ? "text-destructive" : "text-muted-foreground")}>{item.name.length}/255</p>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input placeholder={t("placeholders.extraFieldValue")} value={item.value} maxLength={255} onChange={(e) => setExtraInfo((p) => p.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} />
                    {item.value.length >= 200 && (
                      <p className={cn("text-[10px] mt-1 text-right", item.value.length >= 255 ? "text-destructive" : "text-muted-foreground")}>{item.value.length}/255</p>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setExtraInfo((p) => p.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setExtraInfo((p) => [...p, { name: "", value: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> {t("addField")}
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>{t("cancel")}</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("savingButton") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
