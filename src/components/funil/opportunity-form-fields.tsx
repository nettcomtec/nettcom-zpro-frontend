"use client";

// Corpo do formulário de oportunidade (criar e editar), usado pelo diálogo "Nova
// oportunidade" do quadro e pelo modo Editar da ficha (PLANO_FUNIL_OPORTUNIDADES_KOMMO
// 5.0-3). Mesma regra do formulário que vivia na página. O Google Agenda fica na casca
// (quem monta o formulário): o diálogo fecha logo depois de criar e desmontaria o hook.

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useRegion } from "@/hooks/use-region";
import { currencySymbol } from "@/lib/region";
import { fetchContacts } from "@/services/contacts";
import { createOpportunity, updateOpportunity } from "@/services/funnel";
import { dateInputToClosingForecastISO, closingForecastToDateInput } from "@/lib/opportunity-date";
import type { OpportunityEventData } from "@/components/funil/opportunity-calendar-event";
import { useAuthStore } from "@/stores/auth-store";
import {
  convertBRToISO,
  convertISOToBR,
  restrictedContactName,
  type ContactOption,
  type Opportunity,
  type Pipeline,
  type Responsible,
  type Stage,
} from "@/components/funil/opportunity-shared";

export interface OpportunityFormBodyProps {
  /** null = criar */
  oportunidade: Opportunity | null;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
  /** Só na criação: funil e etapa já escolhidos */
  defaultPipelineId?: number | null;
  defaultStageId?: number | null;
  /** Depois de gravar, com a resposta do backend (sem `contact`) */
  onSaved: (resp: Partial<Opportunity> | null) => void;
  onCancel: () => void;
  /** Só na criação: dados para a pergunta do Google Agenda (a casca decide) */
  onCreated?: (data: OpportunityEventData) => void;
  /** Só na edição: botão "Criar evento" (aparece com showCalendarButton) */
  onRequestCalendarEvent?: (data: OpportunityEventData) => void;
  showCalendarButton?: boolean;
  calendarButtonLabel?: string;
  /** Muda os paddings/rodapé quando o formulário mora dentro da ficha */
  className?: string;
}

interface FormState {
  name: string;
  pipelineId: string | number;
  stageId: string | number;
  responsibleId: string | number;
  contactId: string | number;
  closingForecastBR: string;
  closingForecast: string;
  value: number;
  description: string;
  status: string;
}

function emptyForm(defaultPipelineId?: number | null, defaultStageId?: number | null): FormState {
  return {
    name: "",
    pipelineId: defaultPipelineId ?? "",
    stageId: defaultPipelineId && defaultStageId ? defaultStageId : "",
    responsibleId: "",
    contactId: "",
    closingForecast: "",
    closingForecastBR: "",
    value: 0,
    description: "",
    status: "open",
  };
}

function formFromOpportunity(o: Opportunity): FormState {
  const cf = closingForecastToDateInput(o.closingForecast);
  return {
    name: o.name || "",
    pipelineId: o.pipelineId || "",
    stageId: o.stageId || "",
    responsibleId: o.responsibleId || "",
    contactId: o.contactId || "",
    closingForecast: cf,
    closingForecastBR: cf ? convertISOToBR(cf) : "",
    value: o.value || 0,
    description: o.description || "",
    status: o.status || "open",
  };
}

export function OpportunityFormBody({
  oportunidade,
  pipelines,
  stages,
  responsaveis,
  defaultPipelineId,
  defaultStageId,
  onSaved,
  onCancel,
  onCreated,
  onRequestCalendarEvent,
  showCalendarButton,
  calendarButtonLabel,
  className,
}: OpportunityFormBodyProps) {
  const t = useTranslations("funilKanbanPage");
  const { isLiveMode } = useLiveMode();
  // Usuário restrito: nome cortado e sem número na busca de contato (regra do restrito)
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  const { currency: regionCurrency, country: regionCountry } = useRegion();
  // O estado já nasce com os valores (não só no efeito): o Select do Radix, quando o
  // valor muda logo depois de montar e a opção ainda não foi registrada, devolve ""
  // pelo onValueChange e zerava funil, etapa e responsável na edição.
  const [form, setForm] = useState<FormState>(() =>
    oportunidade ? formFromOpportunity(oportunidade) : emptyForm(defaultPipelineId, defaultStageId)
  );
  const [contatoSelecionado, setContatoSelecionado] = useState<ContactOption | null>(
    () => oportunidade?.contact ?? null
  );
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>(
    () => (oportunidade?.contact ? [oportunidade.contact] : [])
  );
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditing = !!oportunidade?.id;

  // Preenche ao editar; na criação parte do funil/etapa escolhidos no quadro
  useEffect(() => {
    if (oportunidade) {
      setForm(formFromOpportunity(oportunidade));
      if (oportunidade.contact) {
        setContatoSelecionado(oportunidade.contact);
        setContactOptions([oportunidade.contact]);
      }
    } else {
      setForm(emptyForm(defaultPipelineId, defaultStageId));
      setContatoSelecionado(null);
      setContactOptions([]);
      setContactSearch("");
    }
  }, [oportunidade, defaultPipelineId, defaultStageId]);

  useEffect(() => () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  }, []);

  const etapasFiltradas = stages.filter(s => String(s.pipelineId) === String(form.pipelineId));

  function onPipelineChange(val: string) {
    setForm(f => ({ ...f, pipelineId: val, stageId: "" }));
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
    setContactSearch(restrictedContactName(c.name, isRestricted));
    setContactOptions([]);
  }

  function eventData(): OpportunityEventData {
    return {
      name: form.name,
      description: form.description,
      closingForecast: form.closingForecast,
      contactEmail: contatoSelecionado?.email,
    };
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
      let resp: Partial<Opportunity> | null = null;
      if (isEditing && oportunidade) {
        const res = await updateOpportunity(oportunidade.id, payload);
        resp = (res?.data as Partial<Opportunity>) ?? null;
        toast.success(t("updateSuccess"));
      } else {
        const res = await createOpportunity(payload);
        resp = (res?.data as Partial<Opportunity>) ?? null;
        toast.success(t("createSuccess"));
        onCreated?.(eventData());
      }
      onSaved(resp);
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className={cn("space-y-4", className)}>
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
                  <div className={cn("font-medium", isLiveMode && "live-blur-text")}>{restrictedContactName(c.name, isRestricted)}</div>
                  {c.number && !isRestricted && <div className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{c.number}</div>}
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
          <p className="text-xs text-muted-foreground">{t("contactSelected")} <strong className={cn(isLiveMode && "live-blur-text")}>{restrictedContactName(contatoSelecionado.name, isRestricted)}</strong></p>
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
        <Label>{t("labelValue", { currency: currencySymbol(regionCurrency, regionCountry) })}</Label>
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {isEditing && showCalendarButton && onRequestCalendarEvent && (
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => onRequestCalendarEvent(eventData())}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {calendarButtonLabel}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>{t("cancel")}</Button>
        <Button type="submit" disabled={saving}>
          {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
