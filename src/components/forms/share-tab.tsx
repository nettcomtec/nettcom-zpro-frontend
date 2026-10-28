"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  Check, Code, Copy, Download, ExternalLink, Globe, Link2, QrCode, ShieldAlert, SlidersHorizontal, TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FORM_LIMITS,
  buildFormEmbedSnippet,
  buildFormExternalHtmlExample,
  buildFormIframeOnlySnippet,
  buildFormSubmitEndpoint,
  type FormField,
} from "@/lib/forms";
import { getFormsApiBase } from "@/services/forms";
import { FormSlugField } from "@/components/forms/editor/slug-field";
import type { FormSlugState } from "@/components/forms/editor/use-form-slug";
import { FieldNote, InfoHint, NoticeBox, useCopyFeedback } from "@/components/forms/editor/form-editor-shared";

export interface ShareTabProps {
  /** Endereço, nome, situação e campos SALVOS (o link e os códigos valem para o que está no servidor). */
  savedSlug: string;
  savedName: string;
  savedIsActive: boolean;
  savedFields: FormField[];
  hasChannel: boolean;
  /** Há alterações não salvas na tela. */
  dirty: boolean;
  /** Parâmetros dos campos ocultos da versão em edição (para avisar quando o código precisa ser copiado de novo). */
  draftHiddenParams: string[];
  slug: string;
  onSlugChange: (value: string) => void;
  onSlugBlur: () => void;
  slugState: FormSlugState;
  slugSuggestion: string;
  onUseSuggestion: () => void;
  acceptExternalPosts: boolean;
  onAcceptExternalPostsChange: (value: boolean) => void;
  dailyLimit: number;
  onDailyLimitChange: (value: number) => void;
  minFillSeconds: number;
  onMinFillSecondsChange: (value: number) => void;
  /** Número do formulário salvo (formId da rota de formulários da API). */
  formId?: number | null;
}

function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm font-semibold">{title}</p>
        {hint && <InfoHint text={hint} />}
      </div>
      {children}
    </section>
  );
}

function CodeBlock({ code, copyId, copiedId, onCopy, label }: {
  code: string;
  copyId: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  label: string;
}) {
  const t = useTranslations("formsPage");
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onCopy(copyId, code)}>
          {copiedId === copyId ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedId === copyId ? t("share.copied") : t("share.copyCode")}
        </Button>
      </div>
      <pre className="max-h-60 w-full min-w-0 max-w-full overflow-auto whitespace-pre rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

/** Número com faixa: aceita apagar enquanto digita e ajusta à faixa ao sair do campo. */
function BoundedNumberInput({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.floor(n)));
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(Math.floor(n));
      }}
      onBlur={() => {
        const n = Number(text);
        const next = text.trim() === "" || !Number.isFinite(n) ? value : clamp(n);
        setText(String(next));
        if (next !== value) onChange(next);
      }}
      className="max-w-[10rem]"
    />
  );
}

export function ShareTab({
  savedSlug,
  savedName,
  savedIsActive,
  savedFields,
  hasChannel,
  dirty,
  draftHiddenParams,
  slug,
  onSlugChange,
  onSlugBlur,
  slugState,
  slugSuggestion,
  onUseSuggestion,
  acceptExternalPosts,
  onAcceptExternalPostsChange,
  dailyLimit,
  onDailyLimitChange,
  minFillSeconds,
  onMinFillSecondsChange,
  formId,
}: ShareTabProps) {
  const t = useTranslations("formsPage");
  const { copiedId, copy } = useCopyFeedback();
  const [origin, setOrigin] = useState("");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ids = { external: useId(), daily: useId(), minFill: useId() };

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const apiBase = getFormsApiBase();
  const link = origin && savedSlug ? `${origin}/f/${savedSlug}` : "";
  const savedHiddenParams = useMemo(
    () =>
      savedFields
        .filter((f) => f.type === "hidden" && !!f.hiddenParam)
        .map((f) => String(f.hiddenParam)),
    [savedFields]
  );
  const hiddenParamsPending = draftHiddenParams.some((p) => !savedHiddenParams.includes(p));

  const embedCode = useMemo(
    () =>
      origin && savedSlug
        ? buildFormEmbedSnippet({ panelOrigin: origin, slug: savedSlug, title: savedName, hiddenParams: savedHiddenParams })
        : "",
    [origin, savedSlug, savedName, savedHiddenParams]
  );
  const iframeCode = useMemo(
    () => (origin && savedSlug ? buildFormIframeOnlySnippet({ panelOrigin: origin, slug: savedSlug, title: savedName }) : ""),
    [origin, savedSlug, savedName]
  );
  const endpoint = savedSlug ? buildFormSubmitEndpoint(apiBase, savedSlug) : "";
  const htmlExample = useMemo(
    () =>
      savedSlug
        ? buildFormExternalHtmlExample({ apiBase, slug: savedSlug, fields: savedFields, submitLabel: t("share.htmlSubmit") })
        : "",
    [apiBase, savedSlug, savedFields, t]
  );

  const doCopy = async (id: string, text: string) => {
    if (!text) return;
    const ok = await copy(id, text);
    if (ok) toast.success(t("share.copiedToast"));
    else toast.error(t("share.copyFailed"));
  };

  const downloadQr = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${savedSlug || "form"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error(t("share.qrDownloadFailed"));
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      {dirty && (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p>{t("share.unsavedNote")}</p>
        </NoticeBox>
      )}
      {!savedIsActive && (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p>{t("share.inactiveNote")}</p>
        </NoticeBox>
      )}
      {!hasChannel && (
        <NoticeBox icon={TriangleAlert} tone="warning">
          <p>{t("share.noChannelNote")}</p>
        </NoticeBox>
      )}

      {/* ── Endereço e link ── */}
      <Section icon={Link2} title={t("share.linkSection")}>
        <FormSlugField
          value={slug}
          onChange={onSlugChange}
          onBlur={onSlugBlur}
          state={slugState}
          linkBase={origin ? `${origin}/f/` : "/f/"}
          suggestion={slugSuggestion}
          onUseSuggestion={onUseSuggestion}
        />
        {slug && slug !== savedSlug && <FieldNote tone="warning">{t("share.slugChangeNote")}</FieldNote>}
        <div className="grid min-w-0 gap-1.5">
          <Label>{t("share.link")}</Label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <Input value={link} readOnly className="min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={() => void doCopy("link", link)} disabled={!link} className="gap-1.5">
                {copiedId === "link" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {t("share.copyLink")}
              </Button>
              {link && (
                <Button variant="outline" size="icon" asChild>
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label={t("share.openLink")} title={t("share.openLink")}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── QR ── */}
      <Section icon={QrCode} title={t("share.qr")} hint={t("share.qrHint")}>
        {link ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="rounded-md bg-white p-3" style={{ colorScheme: "light" }}>
              <QRCodeSVG value={link} size={168} bgColor="#ffffff" fgColor="#000000" marginSize={0} title={savedName} />
            </div>
            <div className="grid gap-2 text-center sm:text-left">
              <FieldNote>{t("share.qrNote")}</FieldNote>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={downloadQr} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  {t("share.downloadQr")}
                </Button>
              </div>
            </div>
            {/* Cópia grande e fora da tela só para baixar a imagem com boa resolução */}
            <div className="hidden" aria-hidden>
              <QRCodeCanvas ref={qrCanvasRef} value={link} size={720} marginSize={4} bgColor="#ffffff" fgColor="#000000" />
            </div>
          </div>
        ) : (
          <FieldNote>{t("share.loadingLink")}</FieldNote>
        )}
      </Section>

      {/* ── Embutir no site ── */}
      <Section icon={Code} title={t("share.embed")} hint={t("share.embedHint")}>
        <FieldNote>{t("share.embedDesc")}</FieldNote>
        {hiddenParamsPending && (
          <NoticeBox icon={TriangleAlert} tone="warning">
            <p>{t("share.embedRecopyHint")}</p>
          </NoticeBox>
        )}
        {embedCode && (
          <CodeBlock
            code={embedCode}
            copyId="embed"
            copiedId={copiedId}
            onCopy={(id, text) => void doCopy(id, text)}
            label={t("share.embedWithScript")}
          />
        )}
        {savedHiddenParams.length > 0 && (
          <FieldNote>{t("share.embedParams", { params: savedHiddenParams.join(", ") })}</FieldNote>
        )}
        <FieldNote>{t("share.embedRecopyNote")}</FieldNote>
        {iframeCode && (
          <CodeBlock
            code={iframeCode}
            copyId="iframe"
            copiedId={copiedId}
            onCopy={(id, text) => void doCopy(id, text)}
            label={t("share.embedNoScript")}
          />
        )}
        <FieldNote>{t("share.embedNoScriptHint")}</FieldNote>
      </Section>

      {/* ── Envio por outros sites ── */}
      <Section icon={Globe} title={t("share.externalSection")} hint={t("share.externalPostsHint")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={ids.external}>{t("share.externalPosts")}</Label>
            <FieldNote>{t("share.externalPostsDesc")}</FieldNote>
          </div>
          <Switch id={ids.external} checked={acceptExternalPosts} onCheckedChange={onAcceptExternalPostsChange} />
        </div>
        {!acceptExternalPosts && (
          <NoticeBox icon={ShieldAlert} tone="info">
            <p>{t("share.externalOffNote")}</p>
          </NoticeBox>
        )}
        {acceptExternalPosts && (
          <div className="grid min-w-0 gap-4">
            <NoticeBox icon={ShieldAlert} tone="warning">
              <p>{t("share.externalOnNote")}</p>
            </NoticeBox>
            <div className="grid min-w-0 gap-1.5">
              <Label>{t("share.endpoint")}</Label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input value={endpoint} readOnly className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={() => void doCopy("endpoint", endpoint)} className="shrink-0 gap-1.5">
                  {copiedId === "endpoint" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  {t("share.copyEndpoint")}
                </Button>
              </div>
              <FieldNote>{t("share.endpointHint")}</FieldNote>
            </div>

            {htmlExample && (
              <CodeBlock
                code={htmlExample}
                copyId="html"
                copiedId={copiedId}
                onCopy={(id, text) => void doCopy(id, text)}
                label={t("share.htmlExample")}
              />
            )}
            <FieldNote>{t("share.htmlExampleHint")}</FieldNote>
          </div>
        )}
        <FieldNote>{t("share.apiNote")}</FieldNote>
        {formId && savedSlug ? (
          <FieldNote>
            {t.rich("share.apiIds", {
              id: formId,
              slug: savedSlug,
              code: (chunks) => <code className="rounded bg-muted px-1 font-mono text-[11px]">{chunks}</code>,
            })}
          </FieldNote>
        ) : null}
        <div className="grid min-w-0 gap-1.5">
          <div className="flex items-center gap-1">
            <Label>{t("share.fieldKeys")}</Label>
            <InfoHint text={t("share.fieldKeysHint")} />
          </div>
          {savedFields.length === 0 ? (
            <FieldNote>{t("share.noFields")}</FieldNote>
          ) : (
            <ul className="divide-y rounded-md border">
              {savedFields.map((field) => (
                <li key={field.key} className="grid min-w-0 gap-1 p-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{field.key}</code>
                    <span className="min-w-0 truncate text-sm">{field.label}</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                      {t(`fields.types.${field.type}`)}
                    </Badge>
                    {field.required && field.type !== "hidden" && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                        {t("share.requiredBadge")}
                      </Badge>
                    )}
                  </div>
                  {(field.type === "select" || field.type === "multiselect") && (field.options?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(field.options ?? []).map((option) => (
                        <span key={option.id} className="inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]">
                          <code className="font-mono">{option.id}</code>
                          <span className="truncate text-muted-foreground">{option.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {field.type === "checkbox" && <FieldNote>{t("share.checkboxValueHint")}</FieldNote>}
                  {field.type === "multiselect" && <FieldNote>{t("share.multiselectValueHint")}</FieldNote>}
                  {field.type === "date" && <FieldNote>{t("share.dateValueHint")}</FieldNote>}
                  {field.type === "phone" && <FieldNote>{t("share.phoneValueHint")}</FieldNote>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* ── Limites ── */}
      <Section icon={SlidersHorizontal} title={t("share.limitsSection")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.daily}>{t("share.dailyLimit")}</Label>
              <InfoHint text={t("share.dailyLimitHint")} />
            </div>
            <BoundedNumberInput
              id={ids.daily}
              value={dailyLimit}
              min={FORM_LIMITS.dailyLimitMin}
              max={FORM_LIMITS.dailyLimitMax}
              onChange={onDailyLimitChange}
            />
            <FieldNote>{t("share.dailyLimitNote", { max: FORM_LIMITS.dailyLimitMax })}</FieldNote>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.minFill}>{t("share.minFill")}</Label>
              <InfoHint text={t("share.minFillHint")} />
            </div>
            <BoundedNumberInput
              id={ids.minFill}
              value={minFillSeconds}
              min={0}
              max={FORM_LIMITS.minFillSecondsMax}
              onChange={onMinFillSecondsChange}
            />
            <FieldNote className={cn(minFillSeconds === 0 && "text-amber-700 dark:text-amber-400")}>
              {minFillSeconds === 0 ? t("share.minFillOff") : t("share.minFillNote", { seconds: minFillSeconds })}
            </FieldNote>
          </div>
        </div>
      </Section>
    </div>
  );
}
