"use client";

import { useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Bot, Info, ListOrdered, Mail, Phone, Send, SquareKanban, Tags, TriangleAlert, Workflow, type LucideIcon,
} from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PanelAppMultiSelect } from "@/components/panel-apps/panel-app-multi-select";
import { BookingTemplatePicker } from "@/components/agendamento-publico/booking-template-picker";
import { cn } from "@/lib/utils";
import {
  FORM_DESTINATION_MODES,
  FORM_LIMITS,
  isFormEmailChannelType,
  isFormOfficialChannelType,
  isFormPhoneChannelType,
  type FormConfig,
  type FormDestinationMode,
} from "@/lib/forms";
import {
  FieldNote,
  InfoHint,
  NoticeBox,
  useChannelTypeLabel,
  type EditorField,
  type FormChannelOption,
  type FormFlowOption,
  type FormNamedOption,
  type FormStageOption,
} from "./form-editor-shared";

export type OnSubmitInvalidKey =
  | "channel"
  | "fallback"
  | "queue"
  | "flow"
  | "agent"
  | "fallbackQueue"
  | "pipeline"
  | "stage"
  | "tags"
  | "template";

export interface OnSubmitTabProps {
  config: FormConfig;
  /** Campos em edição (as chaves viram variáveis da confirmação). */
  fields: EditorField[];
  onChange: (patch: Partial<FormConfig>) => void;
  channels: FormChannelOption[];
  queues: FormNamedOption[];
  flows: FormFlowOption[];
  agents: FormNamedOption[];
  tags: FormNamedOption[];
  pipelines: FormNamedOption[];
  /** Etapas do funil escolhido. */
  stages: FormStageOption[];
  stagesLoading: boolean;
  optionsLoading: boolean;
  canUseFlows: boolean;
  canUseAgents: boolean;
  canUseFunnel: boolean;
  /** Canal e template gravados: voltar ao canal salvo devolve o template salvo. */
  savedWhatsappId: number | null;
  savedTemplate: string | null;
  invalid: Partial<Record<OnSubmitInvalidKey, boolean>>;
}

const MODE_ICONS: Record<FormDestinationMode, LucideIcon> = {
  queue: ListOrdered,
  chatflow: Workflow,
  ai_agent: Bot,
};

const MODE_LABEL_KEYS: Record<FormDestinationMode, string> = {
  queue: "onSubmit.destinationQueue",
  chatflow: "onSubmit.destinationFlow",
  ai_agent: "onSubmit.destinationAgent",
};

const MODE_DESC_KEYS: Record<FormDestinationMode, string> = {
  queue: "onSubmit.destinationQueueDesc",
  chatflow: "onSubmit.destinationFlowDesc",
  ai_agent: "onSubmit.destinationAgentDesc",
};

// Variáveis que a confirmação entende (o servidor também aceita os nomes em inglês).
const BASE_VARS: Array<{ token: string; labelKey: string }> = [
  { token: "{{nome}}", labelKey: "onSubmit.varName" },
  { token: "{{primeiroNome}}", labelKey: "onSubmit.varFirstName" },
  { token: "{{respostas}}", labelKey: "onSubmit.varAnswers" },
  { token: "{{nomeFormulario}}", labelKey: "onSubmit.varFormName" },
  { token: "{{protocolo}}", labelKey: "onSubmit.varProtocol" },
];

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-lg border p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm font-semibold">{title}</p>
        {hint && <InfoHint text={hint} />}
      </div>
      {children}
    </section>
  );
}

export function OnSubmitTab({
  config,
  fields,
  onChange,
  channels,
  queues,
  flows,
  agents,
  tags,
  pipelines,
  stages,
  stagesLoading,
  optionsLoading,
  canUseFlows,
  canUseAgents,
  canUseFunnel,
  savedWhatsappId,
  savedTemplate,
  invalid,
}: OnSubmitTabProps) {
  const t = useTranslations("formsPage");
  const channelTypeLabel = useChannelTypeLabel();
  const ids = {
    channel: useId(),
    fallback: useId(),
    queue: useId(),
    flow: useId(),
    agent: useId(),
    pipeline: useId(),
    stage: useId(),
    confirmation: useId(),
    text: useId(),
    subject: useId(),
    opportunity: useId(),
  };
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const mainChannel = channels.find((c) => c.id === config.whatsappId) ?? null;
  const mainIsEmail = !!mainChannel && isFormEmailChannelType(mainChannel.type);
  const mainIsPhone = !!mainChannel && isFormPhoneChannelType(mainChannel.type);
  const mainIsOfficial = !!mainChannel && isFormOfficialChannelType(mainChannel.type);
  const phoneChannels = channels.filter((c) => isFormPhoneChannelType(c.type));
  const emailChannels = channels.filter((c) => isFormEmailChannelType(c.type));
  const hasFallback = config.emailFallbackWhatsappId !== null;
  const usesEmail = mainIsEmail || (mainIsPhone && hasFallback);
  const mode = config.destinationMode;

  const channelItemText = (c: FormChannelOption) => {
    const disconnected = isFormPhoneChannelType(c.type) && String(c.status || "").toUpperCase() !== "CONNECTED";
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate">{c.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{channelTypeLabel(c.type)}</span>
        {disconnected && <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">{t("onSubmit.channelOffline")}</span>}
      </span>
    );
  };

  const handleChannelChange = (value: string) => {
    const id = value === "none" ? null : Number(value);
    if (id === config.whatsappId) return;
    const channel = channels.find((c) => c.id === id) ?? null;
    const patch: Partial<FormConfig> = {
      whatsappId: id,
      // O template é do canal: trocar pede escolher de novo; voltar ao salvo devolve o salvo.
      confirmationTemplate: id !== null && id === savedWhatsappId ? savedTemplate : null,
    };
    if (channel && isFormEmailChannelType(channel.type)) {
      patch.destinationMode = "queue";
      patch.emailFallbackWhatsappId = null;
    }
    if (!channel) patch.emailFallbackWhatsappId = null;
    onChange(patch);
  };

  const missingLabel = (id: number) => t("onSubmit.missingItem", { id });

  const insertVariable = (token: string) => {
    const current = config.confirmationText ?? "";
    const el = textRef.current;
    const start = el ? el.selectionStart ?? current.length : current.length;
    const end = el ? el.selectionEnd ?? current.length : current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`.slice(0, FORM_LIMITS.confirmationTextMax);
    onChange({ confirmationText: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = Math.min(start + token.length, next.length);
      el.setSelectionRange(caret, caret);
    });
  };

  const fieldVars = fields
    .filter((f) => /^[a-z][a-z0-9_]{1,39}$/.test(f.key))
    .map((f) => ({ token: `{{${f.key}}}`, label: f.label.trim() || f.key }));

  const templateVarsList = BASE_VARS.map((v) => v.token).join(", ");

  const opportunityOn = config.opportunityPipelineId !== null;

  return (
    <div className="grid gap-4">
      {/* ── Canal ── */}
      <Section icon={Phone} title={t("onSubmit.channelSection")} hint={t("onSubmit.channelHint")}>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.channel}>{t("onSubmit.channel")}</Label>
          <Select value={config.whatsappId ? String(config.whatsappId) : "none"} onValueChange={handleChannelChange}>
            <SelectTrigger id={ids.channel} className={cn("min-w-0", invalid.channel && "border-destructive")}>
              <SelectValue placeholder={t("onSubmit.channelNone")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("onSubmit.channelNone")}</SelectItem>
              {phoneChannels.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t("onSubmit.channelGroupPhone")}</SelectLabel>
                    {phoneChannels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {channelItemText(c)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {emailChannels.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t("onSubmit.channelGroupEmail")}</SelectLabel>
                    {emailChannels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {channelItemText(c)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {config.whatsappId !== null && !mainChannel && (
                <SelectItem value={String(config.whatsappId)}>{missingLabel(config.whatsappId)}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {invalid.channel && <FieldNote tone="error">{t("onSubmit.channelInvalid")}</FieldNote>}
          {!optionsLoading && channels.length === 0 && <FieldNote tone="warning">{t("onSubmit.noChannels")}</FieldNote>}
          {config.whatsappId === null && <FieldNote tone="warning">{t("onSubmit.channelRequiredNote")}</FieldNote>}
          {mainIsOfficial && <FieldNote>{t("onSubmit.officialChannelNote")}</FieldNote>}
          {mainIsEmail && <FieldNote>{t("onSubmit.emailChannelNote")}</FieldNote>}
        </div>

        {mainIsPhone && (
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.fallback}>{t("onSubmit.fallbackEmail")}</Label>
              <InfoHint text={t("onSubmit.fallbackEmailHint")} />
            </div>
            <Select
              value={config.emailFallbackWhatsappId ? String(config.emailFallbackWhatsappId) : "none"}
              onValueChange={(v) => onChange({ emailFallbackWhatsappId: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger id={ids.fallback} className={cn("min-w-0", invalid.fallback && "border-destructive")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("onSubmit.fallbackNone")}</SelectItem>
                {emailChannels.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {channelItemText(c)}
                  </SelectItem>
                ))}
                {config.emailFallbackWhatsappId !== null &&
                  !emailChannels.some((c) => c.id === config.emailFallbackWhatsappId) && (
                    <SelectItem value={String(config.emailFallbackWhatsappId)}>
                      {missingLabel(config.emailFallbackWhatsappId)}
                    </SelectItem>
                  )}
              </SelectContent>
            </Select>
            {invalid.fallback && <FieldNote tone="error">{t("onSubmit.fallbackInvalid")}</FieldNote>}
            <FieldNote>{hasFallback ? t("onSubmit.fallbackOnNote") : t("onSubmit.fallbackOffNote")}</FieldNote>
            {emailChannels.length === 0 && <FieldNote>{t("onSubmit.noEmailChannels")}</FieldNote>}
          </div>
        )}
      </Section>

      {/* ── Destino ── */}
      <Section icon={ListOrdered} title={t("onSubmit.destination")} hint={t("onSubmit.destinationHint")}>
        <RadioGroup
          value={mode}
          onValueChange={(v) => onChange({ destinationMode: v as FormDestinationMode })}
          className="grid gap-2 sm:grid-cols-3"
          aria-label={t("onSubmit.destination")}
        >
          {FORM_DESTINATION_MODES.map((option) => {
            const Icon = MODE_ICONS[option];
            const disabled =
              option !== "queue" &&
              (mainIsEmail || (option === "chatflow" && !canUseFlows) || (option === "ai_agent" && !canUseAgents));
            const itemId = `${ids.queue}-${option}`;
            return (
              <label
                key={option}
                htmlFor={itemId}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 transition-colors",
                  mode === option ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <RadioGroupItem value={option} id={itemId} disabled={disabled} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {t(MODE_LABEL_KEYS[option])}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(MODE_DESC_KEYS[option])}</span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
        {mainIsEmail && <FieldNote tone="warning">{t("onSubmit.emailForcesQueue")}</FieldNote>}
        {!mainIsEmail && !canUseFlows && <FieldNote>{t("onSubmit.flowNotInPlan")}</FieldNote>}
        {!mainIsEmail && !canUseAgents && <FieldNote>{t("onSubmit.agentNotInPlan")}</FieldNote>}

        {mode === "chatflow" && (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.flow}>{t("onSubmit.flow")}</Label>
            <Select
              value={config.chatFlowId ? String(config.chatFlowId) : "none"}
              onValueChange={(v) => onChange({ chatFlowId: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger id={ids.flow} className={cn("min-w-0", invalid.flow && "border-destructive")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("onSubmit.flowNone")}</SelectItem>
                {flows.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.isActive ? f.name : t("onSubmit.flowInactive", { name: f.name })}
                  </SelectItem>
                ))}
                {config.chatFlowId !== null && !flows.some((f) => f.id === config.chatFlowId) && (
                  <SelectItem value={String(config.chatFlowId)}>{missingLabel(config.chatFlowId)}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {invalid.flow && (
              <FieldNote tone="error">{config.chatFlowId ? t("onSubmit.flowInvalid") : t("onSubmit.flowRequired")}</FieldNote>
            )}
            <FieldNote>{t("onSubmit.flowStartsNote")}</FieldNote>
          </div>
        )}

        {mode === "ai_agent" && (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.agent}>{t("onSubmit.agent")}</Label>
            <Select
              value={config.aiAgentId ? String(config.aiAgentId) : "none"}
              onValueChange={(v) => onChange({ aiAgentId: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger id={ids.agent} className={cn("min-w-0", invalid.agent && "border-destructive")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("onSubmit.agentNone")}</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
                {config.aiAgentId !== null && !agents.some((a) => a.id === config.aiAgentId) && (
                  <SelectItem value={String(config.aiAgentId)}>{missingLabel(config.aiAgentId)}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {invalid.agent && (
              <FieldNote tone="error">{config.aiAgentId ? t("onSubmit.agentInvalid") : t("onSubmit.agentRequired")}</FieldNote>
            )}
            {!optionsLoading && agents.length === 0 && <FieldNote>{t("onSubmit.noAgents")}</FieldNote>}
            <FieldNote>{t("onSubmit.agentStartsNote")}</FieldNote>
          </div>
        )}

        <div className="grid min-w-0 gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={ids.queue}>{mode === "queue" ? t("onSubmit.queue") : t("onSubmit.fallbackQueue")}</Label>
            <InfoHint text={mode === "queue" ? t("onSubmit.queueHint") : t("onSubmit.fallbackQueueHint")} />
          </div>
          <Select
            value={config.queueId ? String(config.queueId) : "none"}
            onValueChange={(v) => onChange({ queueId: v === "none" ? null : Number(v) })}
          >
            <SelectTrigger
              id={ids.queue}
              className={cn("min-w-0", (invalid.fallbackQueue || invalid.queue) && "border-destructive")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("onSubmit.queueDefault")}</SelectItem>
              {queues.map((q) => (
                <SelectItem key={q.id} value={String(q.id)}>
                  {q.name}
                </SelectItem>
              ))}
              {config.queueId !== null && !queues.some((q) => q.id === config.queueId) && (
                <SelectItem value={String(config.queueId)}>{missingLabel(config.queueId)}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {invalid.queue && <FieldNote tone="error">{t("onSubmit.queueInvalid")}</FieldNote>}
          {invalid.fallbackQueue && <FieldNote tone="error">{t("onSubmit.fallbackQueueRequired")}</FieldNote>}
          {mode !== "queue" && hasFallback && !invalid.fallbackQueue && (
            <FieldNote tone="warning">{t("onSubmit.fallbackQueueNeeded")}</FieldNote>
          )}
        </div>

        <NoticeBox icon={Info} tone="info">
          <p>{t("onSubmit.existingTicketHint")}</p>
        </NoticeBox>
      </Section>

      {/* ── Etiquetas ── */}
      <Section icon={Tags} title={t("onSubmit.tags")} hint={t("onSubmit.tagsHint")}>
        <PanelAppMultiSelect
          options={tags}
          value={config.tagIds}
          onChange={(tagIds) => onChange({ tagIds })}
          max={FORM_LIMITS.maxTagIds}
          label={t("onSubmit.tags")}
          emptyText={t("onSubmit.noTags")}
          loading={optionsLoading}
        />
        {invalid.tags && <FieldNote tone="error">{t("onSubmit.tagsInvalid")}</FieldNote>}
        <FieldNote>{t("onSubmit.tagsNote")}</FieldNote>
      </Section>

      {/* ── Oportunidade ── */}
      {(canUseFunnel || opportunityOn) && (
        <Section icon={SquareKanban} title={t("onSubmit.opportunity")} hint={t("onSubmit.opportunityHint")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor={ids.opportunity}>{t("onSubmit.opportunityToggle")}</Label>
              <FieldNote>{t("onSubmit.opportunityNote")}</FieldNote>
            </div>
            <Switch
              id={ids.opportunity}
              checked={opportunityOn}
              disabled={!canUseFunnel && !opportunityOn}
              onCheckedChange={(on) =>
                onChange(
                  on
                    ? { opportunityPipelineId: pipelines[0]?.id ?? null, opportunityStageId: null }
                    : { opportunityPipelineId: null, opportunityStageId: null }
                )
              }
            />
          </div>
          {!canUseFunnel && opportunityOn && <FieldNote tone="warning">{t("onSubmit.funnelNotInPlan")}</FieldNote>}
          {canUseFunnel && pipelines.length === 0 && !optionsLoading && (
            <FieldNote tone="warning">{t("onSubmit.noPipelines")}</FieldNote>
          )}
          {opportunityOn && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={ids.pipeline}>{t("onSubmit.pipeline")}</Label>
                <Select
                  value={config.opportunityPipelineId ? String(config.opportunityPipelineId) : "none"}
                  onValueChange={(v) =>
                    onChange({ opportunityPipelineId: v === "none" ? null : Number(v), opportunityStageId: null })
                  }
                >
                  <SelectTrigger id={ids.pipeline} className={cn("min-w-0", invalid.pipeline && "border-destructive")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("onSubmit.pipelineNone")}</SelectItem>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                    {config.opportunityPipelineId !== null &&
                      !pipelines.some((p) => p.id === config.opportunityPipelineId) && (
                        <SelectItem value={String(config.opportunityPipelineId)}>
                          {missingLabel(config.opportunityPipelineId)}
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
                {invalid.pipeline && <FieldNote tone="error">{t("onSubmit.pipelineInvalid")}</FieldNote>}
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={ids.stage}>{t("onSubmit.stage")}</Label>
                <Select
                  value={config.opportunityStageId ? String(config.opportunityStageId) : "none"}
                  onValueChange={(v) => onChange({ opportunityStageId: v === "none" ? null : Number(v) })}
                  disabled={config.opportunityPipelineId === null}
                >
                  <SelectTrigger id={ids.stage} className={cn("min-w-0", invalid.stage && "border-destructive")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{stagesLoading ? t("onSubmit.loading") : t("onSubmit.stageNone")}</SelectItem>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                    {config.opportunityStageId !== null && !stages.some((s) => s.id === config.opportunityStageId) && (
                      <SelectItem value={String(config.opportunityStageId)}>
                        {missingLabel(config.opportunityStageId)}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {invalid.stage && (
                  <FieldNote tone="error">
                    {config.opportunityStageId ? t("onSubmit.stageInvalid") : t("onSubmit.stageRequired")}
                  </FieldNote>
                )}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Confirmação ao cliente ── */}
      <Section icon={Send} title={t("onSubmit.confirmation")} hint={t("onSubmit.confirmationHint")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={ids.confirmation}>{t("onSubmit.confirmationToggle")}</Label>
            <FieldNote>{t("onSubmit.confirmationNote")}</FieldNote>
          </div>
          <Switch
            id={ids.confirmation}
            checked={config.confirmationEnabled}
            onCheckedChange={(on) => onChange({ confirmationEnabled: on })}
          />
        </div>

        {config.confirmationEnabled && !mainChannel && (
          <FieldNote tone="warning">{t("onSubmit.confirmationNeedsChannel")}</FieldNote>
        )}

        {config.confirmationEnabled && mainChannel && (
          <div className="grid gap-4">
            {mainIsOfficial && (
              <div className="grid gap-1.5">
                <NoticeBox icon={TriangleAlert} tone="warning">
                  <p>{t("onSubmit.officialWindowNote")}</p>
                </NoticeBox>
                <BookingTemplatePicker
                  channel={{ id: mainChannel.id, type: mainChannel.type, tokenAPI: mainChannel.tokenAPI }}
                  value={config.confirmationTemplate}
                  onChange={(json) => onChange({ confirmationTemplate: json || null })}
                  label={t("onSubmit.confirmationTemplate")}
                  hint={t("onSubmit.templateHint", { vars: templateVarsList })}
                  allowCharge={false}
                />
                {invalid.template && <FieldNote tone="error">{t("onSubmit.templateVarsRequired")}</FieldNote>}
              </div>
            )}

            {usesEmail && (
              <div className="grid min-w-0 gap-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor={ids.subject}>{t("onSubmit.emailSubject")}</Label>
                  <InfoHint text={t("onSubmit.emailSubjectHint")} />
                </div>
                <Input
                  id={ids.subject}
                  value={config.confirmationEmailSubject ?? ""}
                  maxLength={FORM_LIMITS.emailSubjectMax}
                  onChange={(e) => onChange({ confirmationEmailSubject: e.target.value || null })}
                  placeholder={t("onSubmit.emailSubjectPlaceholder")}
                />
              </div>
            )}

            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor={ids.text}>{t("onSubmit.confirmationText")}</Label>
              <Textarea
                id={ids.text}
                ref={textRef}
                rows={4}
                value={config.confirmationText ?? ""}
                maxLength={FORM_LIMITS.confirmationTextMax}
                onChange={(e) => onChange({ confirmationText: e.target.value || null })}
                placeholder={t("onSubmit.confirmationTextPlaceholder")}
              />
              <FieldNote>
                {mainIsOfficial ? t("onSubmit.confirmationTextOfficialNote") : t("onSubmit.confirmationTextNote")}
              </FieldNote>
              <div className="grid gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-muted-foreground">{t("onSubmit.confirmationVars")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {BASE_VARS.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token)}
                      title={v.token}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] hover:bg-accent"
                    >
                      <span className="truncate">{t(v.labelKey)}</span>
                    </button>
                  ))}
                  {fieldVars.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token)}
                      title={v.token}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:bg-accent"
                    >
                      <span className="truncate">{v.label}</span>
                    </button>
                  ))}
                </div>
                <FieldNote>{t("onSubmit.confirmationVarsHint")}</FieldNote>
              </div>
            </div>
            {usesEmail && !mainIsEmail && (
              <NoticeBox icon={Mail} tone="info">
                <p>{t("onSubmit.confirmationFallbackNote")}</p>
              </NoticeBox>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
