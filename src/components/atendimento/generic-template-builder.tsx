"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { GalleryHorizontalEnd, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GenericTemplatePreview } from "@/components/meta/meta-template-mobile-preview";
import { GalleryPickerWithUploadDialog } from "@/components/gallery/gallery-picker-with-upload-dialog";

export type GenericTemplateButton = {
  type: "web_url" | "postback";
  title: string;
  url: string;
  payload: string;
};

export type GenericTemplateElement = {
  title: string;
  subtitle: string;
  image_url: string;
  default_action_url: string;
  buttons: GenericTemplateButton[];
};

export function emptyGenericElement(): GenericTemplateElement {
  return { title: "", subtitle: "", image_url: "", default_action_url: "", buttons: [] };
}

const MAX_ELEMENTS = 10;
const MAX_BUTTONS = 3;

/**
 * Constroi o payload `elements` (formato Meta) a partir do estado estruturado.
 * Descarta cards sem titulo e botoes incompletos.
 */
export function buildGenericElements(elements: GenericTemplateElement[]): Array<Record<string, unknown>> {
  return elements
    .filter((el) => el.title.trim())
    .map((el) => {
      const out: Record<string, unknown> = { title: el.title.trim() };
      if (el.subtitle.trim()) out.subtitle = el.subtitle.trim();
      if (el.image_url.trim()) out.image_url = el.image_url.trim();
      if (el.default_action_url.trim()) {
        out.default_action = { type: "web_url", url: el.default_action_url.trim() };
      }
      const buttons = el.buttons
        .filter((b) => b.title.trim() && (b.type === "postback" ? b.payload.trim() : b.url.trim()))
        .map((b) =>
          b.type === "web_url"
            ? { type: "web_url", title: b.title.trim(), url: b.url.trim() }
            : { type: "postback", title: b.title.trim(), payload: b.payload.trim() }
        );
      if (buttons.length) out.buttons = buttons;
      return out;
    });
}

/** True quando ha pelo menos um card valido (com titulo). */
export function hasValidGenericElement(elements: GenericTemplateElement[]): boolean {
  return elements.some((el) => el.title.trim());
}

interface GenericTemplateBuilderProps {
  value: GenericTemplateElement[];
  onChange: (next: GenericTemplateElement[]) => void;
  channel?: "instagram" | "messenger";
}

export function GenericTemplateBuilder({ value, onChange, channel = "messenger" }: GenericTemplateBuilderProps) {
  const t = useTranslations("messageInput.genericTemplateBuilder");

  const elements = value.length > 0 ? value : [emptyGenericElement()];

  // Indice do card cuja imagem esta selecionando da galeria (null = dialog fechado)
  const [galleryForIdx, setGalleryForIdx] = useState<number | null>(null);

  const patchElement = (idx: number, patch: Partial<GenericTemplateElement>) => {
    onChange(elements.map((el, i) => (i === idx ? { ...el, ...patch } : el)));
  };

  const removeElement = (idx: number) => {
    const next = elements.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : [emptyGenericElement()]);
  };

  const addElement = () => {
    if (elements.length >= MAX_ELEMENTS) return;
    onChange([...elements, emptyGenericElement()]);
  };

  const patchButton = (elIdx: number, btnIdx: number, patch: Partial<GenericTemplateButton>) => {
    patchElement(elIdx, {
      buttons: elements[elIdx].buttons.map((b, i) => (i === btnIdx ? { ...b, ...patch } : b)),
    });
  };

  const addButton = (elIdx: number) => {
    const el = elements[elIdx];
    if (el.buttons.length >= MAX_BUTTONS) return;
    patchElement(elIdx, {
      buttons: [...el.buttons, { type: "web_url", title: "", url: "", payload: "" }],
    });
  };

  const removeButton = (elIdx: number, btnIdx: number) => {
    patchElement(elIdx, {
      buttons: elements[elIdx].buttons.filter((_, i) => i !== btnIdx),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("hint")}</p>

      {elements.map((el, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t("card")} {i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => removeElement(i)}
              disabled={elements.length === 1}
              title={t("removeCard")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div>
            <Label className="text-[11px]">{t("titleLabel")} *</Label>
            <Input
              value={el.title}
              onChange={(e) => patchElement(i, { title: e.target.value })}
              placeholder={t("titlePlaceholder")}
              maxLength={80}
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label className="text-[11px]">{t("subtitleLabel")}</Label>
            <Input
              value={el.subtitle}
              onChange={(e) => patchElement(i, { subtitle: e.target.value })}
              placeholder={t("subtitlePlaceholder")}
              maxLength={80}
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label className="text-[11px]">{t("imageUrlLabel")}</Label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                value={el.image_url}
                onChange={(e) => patchElement(i, { image_url: e.target.value })}
                placeholder="https://..."
                className="h-8 text-sm flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                title={t("pickFromGallery")}
                onClick={() => setGalleryForIdx(i)}
              >
                <GalleryHorizontalEnd className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-[11px]">{t("actionUrlLabel")}</Label>
            <Input
              value={el.default_action_url}
              onChange={(e) => patchElement(i, { default_action_url: e.target.value })}
              placeholder="https://..."
              className="mt-1 h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("actionUrlHint")}</p>
          </div>

          {/* Buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">{t("buttonsLabel")}</Label>
              {el.buttons.length < MAX_BUTTONS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => addButton(i)}
                >
                  <Plus className="h-3 w-3 mr-1" /> {t("addButton")}
                </Button>
              )}
            </div>
            {el.buttons.map((b, j) => (
              <div key={j} className="space-y-1 rounded border p-1.5 bg-background">
                <div className="flex items-center gap-1.5">
                  <Select value={b.type} onValueChange={(v) => patchButton(i, j, { type: v as GenericTemplateButton["type"] })}>
                    <SelectTrigger className="h-7 text-[11px] w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web_url">{t("btnWebUrl")}</SelectItem>
                      <SelectItem value="postback">{t("btnPostback")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={b.title}
                    onChange={(e) => patchButton(i, j, { title: e.target.value })}
                    placeholder={t("btnTitlePlaceholder")}
                    maxLength={20}
                    className="h-7 text-[11px] flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeButton(i, j)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {b.type === "web_url" ? (
                  <Input
                    value={b.url}
                    onChange={(e) => patchButton(i, j, { url: e.target.value })}
                    placeholder="https://..."
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <Input
                    value={b.payload}
                    onChange={(e) => patchButton(i, j, { payload: e.target.value })}
                    placeholder={t("btnPayloadPlaceholder")}
                    className="h-7 text-[11px]"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {elements.length < MAX_ELEMENTS && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addElement}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("addCard")}
        </Button>
      )}

      <div className="pt-1 space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">{t("previewLabel")}</p>
        <GenericTemplatePreview channel={channel} elements={elements} />
      </div>

      <GalleryPickerWithUploadDialog
        open={galleryForIdx !== null}
        onOpenChange={(o) => { if (!o) setGalleryForIdx(null); }}
        onPick={(item) => {
          if (galleryForIdx !== null) patchElement(galleryForIdx, { image_url: item.url });
          setGalleryForIdx(null);
        }}
        galleryFileType="image"
        uploadAccept="image/*"
      />
    </div>
  );
}

export default GenericTemplateBuilder;
