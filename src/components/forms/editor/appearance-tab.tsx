"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Images, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";
import { cn } from "@/lib/utils";
import { FORM_LIMITS, FORM_THEME_DEFAULTS, type FormTheme } from "@/lib/forms";
import { FieldNote, InfoHint, isHexColor, isHttpsUrl, toAbsoluteUrl } from "./form-editor-shared";

export interface AppearanceTabProps {
  theme: FormTheme;
  onChange: (next: FormTheme) => void;
  /** Nome do formulário: título usado quando o campo de título fica vazio. */
  formName: string;
}

type OptionalThemeKey = "logoUrl" | "coverUrl" | "title" | "description" | "submitLabel" | "successMessage" | "redirectUrl";

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1 border-b pb-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {hint && <InfoHint text={hint} />}
    </div>
  );
}

/** Cor com o seletor do navegador e o código (#rrggbb) lado a lado. */
function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("formsPage");
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = !isHexColor(text);
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <Input
          id={id}
          value={text}
          maxLength={7}
          onChange={(e) => {
            const raw = e.target.value.trim();
            const next = raw.startsWith("#") ? raw : `#${raw}`;
            setText(next);
            if (isHexColor(next)) onChange(next.toLowerCase());
          }}
          className={cn("font-mono uppercase", invalid && "border-destructive")}
          spellCheck={false}
          autoComplete="off"
        />
        {value.toLowerCase() !== fallback.toLowerCase() && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => onChange(fallback)}
            aria-label={t("appearance.resetColor")}
            title={t("appearance.resetColor")}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
      {invalid && <FieldNote tone="error">{t("appearance.colorInvalid")}</FieldNote>}
    </div>
  );
}

/** Logo ou capa: endereço https + galeria + miniatura. */
function ImageField({
  label,
  hint,
  value,
  onChange,
  onPick,
  previewClassName,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  onPick: () => void;
  previewClassName: string;
}) {
  const t = useTranslations("formsPage");
  const id = useId();
  const invalid = !!value.trim() && !isHttpsUrl(value);
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        <InfoHint text={hint} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className={cn(invalid && "border-destructive")}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={onPick}
          aria-label={t("appearance.pickFromGallery")}
          title={t("appearance.pickFromGallery")}
        >
          <Images className="h-4 w-4" />
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onChange("")}
            aria-label={t("appearance.removeImage")}
            title={t("appearance.removeImage")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {invalid && <FieldNote tone="error">{t("appearance.httpsOnly")}</FieldNote>}
      {value && !invalid && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className={cn("rounded border bg-background object-contain", previewClassName)} />
      )}
    </div>
  );
}

export function AppearanceTab({ theme, onChange, formName }: AppearanceTabProps) {
  const t = useTranslations("formsPage");
  const [galleryTarget, setGalleryTarget] = useState<"logoUrl" | "coverUrl" | null>(null);
  const ids = {
    scheme: useId(),
    radius: useId(),
    width: useId(),
    title: useId(),
    description: useId(),
    submit: useId(),
    success: useId(),
    redirect: useId(),
  };

  const set = <K extends keyof FormTheme>(key: K, value: FormTheme[K]) => onChange({ ...theme, [key]: value });
  const setText = (key: OptionalThemeKey, value: string) => {
    const next: FormTheme = { ...theme };
    if (value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  };

  const redirectInvalid = !!theme.redirectUrl?.trim() && !isHttpsUrl(theme.redirectUrl ?? "");

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <SectionTitle title={t("appearance.imagesSection")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField
            label={t("appearance.logo")}
            hint={t("appearance.logoHint")}
            value={theme.logoUrl ?? ""}
            onChange={(v) => setText("logoUrl", v)}
            onPick={() => setGalleryTarget("logoUrl")}
            previewClassName="h-12 w-auto max-w-[160px]"
          />
          <ImageField
            label={t("appearance.cover")}
            hint={t("appearance.coverHint")}
            value={theme.coverUrl ?? ""}
            onChange={(v) => setText("coverUrl", v)}
            onPick={() => setGalleryTarget("coverUrl")}
            previewClassName="h-20 w-full max-w-xs object-cover"
          />
        </div>
      </div>

      <div className="grid gap-4">
        <SectionTitle title={t("appearance.colorsSection")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label={t("appearance.primaryColor")}
            value={theme.primaryColor}
            fallback={FORM_THEME_DEFAULTS.primaryColor}
            onChange={(v) => set("primaryColor", v)}
          />
          <ColorField
            label={t("appearance.backgroundColor")}
            value={theme.backgroundColor}
            fallback={FORM_THEME_DEFAULTS.backgroundColor}
            onChange={(v) => set("backgroundColor", v)}
          />
        </div>
        <FieldNote>{t("appearance.colorsHint")}</FieldNote>
      </div>

      <div className="grid gap-4">
        <SectionTitle title={t("appearance.layoutSection")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.scheme}>{t("appearance.scheme")}</Label>
              <InfoHint text={t("appearance.schemeHint")} />
            </div>
            <Select value={theme.colorScheme} onValueChange={(v) => set("colorScheme", v as FormTheme["colorScheme"])}>
              <SelectTrigger id={ids.scheme} className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("appearance.schemeAuto")}</SelectItem>
                <SelectItem value="light">{t("appearance.schemeLight")}</SelectItem>
                <SelectItem value="dark">{t("appearance.schemeDark")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.radius}>{t("appearance.radius")}</Label>
            <Select value={theme.radius} onValueChange={(v) => set("radius", v as FormTheme["radius"])}>
              <SelectTrigger id={ids.radius} className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("appearance.radiusNone")}</SelectItem>
                <SelectItem value="small">{t("appearance.radiusSmall")}</SelectItem>
                <SelectItem value="large">{t("appearance.radiusLarge")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.width}>{t("appearance.width")}</Label>
              <InfoHint text={t("appearance.widthHint")} />
            </div>
            <Select value={theme.width} onValueChange={(v) => set("width", v as FormTheme["width"])}>
              <SelectTrigger id={ids.width} className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">{t("appearance.widthNarrow")}</SelectItem>
                <SelectItem value="wide">{t("appearance.widthWide")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <SectionTitle title={t("appearance.textsSection")} hint={t("appearance.textsHint")} />
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.title}>{t("appearance.formTitle")}</Label>
          <Input
            id={ids.title}
            value={theme.title ?? ""}
            maxLength={FORM_LIMITS.themeTitleMax}
            onChange={(e) => setText("title", e.target.value)}
            placeholder={formName || t("appearance.formTitlePlaceholder")}
          />
          <FieldNote>{t("appearance.formTitleHint")}</FieldNote>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.description}>{t("appearance.formDescription")}</Label>
          <Textarea
            id={ids.description}
            rows={3}
            value={theme.description ?? ""}
            maxLength={FORM_LIMITS.themeDescriptionMax}
            onChange={(e) => setText("description", e.target.value)}
            placeholder={t("appearance.formDescriptionPlaceholder")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={ids.submit}>{t("appearance.submitLabel")}</Label>
            <Input
              id={ids.submit}
              value={theme.submitLabel ?? ""}
              maxLength={FORM_LIMITS.themeSubmitLabelMax}
              onChange={(e) => setText("submitLabel", e.target.value)}
              placeholder={t("appearance.submitLabelPlaceholder")}
            />
            <FieldNote>{t("appearance.submitLabelHint")}</FieldNote>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={ids.redirect}>{t("appearance.redirectUrl")}</Label>
              <InfoHint text={t("appearance.redirectHint")} />
            </div>
            <Input
              id={ids.redirect}
              value={theme.redirectUrl ?? ""}
              maxLength={FORM_LIMITS.urlMax}
              onChange={(e) => setText("redirectUrl", e.target.value)}
              placeholder="https://..."
              className={cn(redirectInvalid && "border-destructive")}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            {redirectInvalid ? (
              <FieldNote tone="error">{t("appearance.httpsOnly")}</FieldNote>
            ) : (
              <FieldNote>{t("appearance.redirectNote")}</FieldNote>
            )}
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={ids.success}>{t("appearance.successMessage")}</Label>
          <Textarea
            id={ids.success}
            rows={3}
            value={theme.successMessage ?? ""}
            maxLength={FORM_LIMITS.themeSuccessMessageMax}
            onChange={(e) => setText("successMessage", e.target.value)}
            placeholder={t("appearance.successMessagePlaceholder")}
          />
          <FieldNote>
            {theme.redirectUrl && !redirectInvalid ? t("appearance.successWithRedirect") : t("appearance.successHint")}
          </FieldNote>
        </div>
      </div>

      <GalleryPickerWithUploadDialog
        open={galleryTarget !== null}
        onOpenChange={(open) => {
          if (!open) setGalleryTarget(null);
        }}
        galleryFileType="image"
        uploadAccept="image/*"
        onPick={(item) => {
          if (galleryTarget) setText(galleryTarget, toAbsoluteUrl(item.url));
        }}
      />
    </div>
  );
}
