"use client";

import { useId, useRef, type FocusEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowDown, ArrowUp, Bold, Braces, Copy, Italic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EMAIL_VARIABLES } from "@/components/email-marketing/email-html-editor";
import { getBlockIssue, isValidEmailHref, type EmailAlign, type EmailBlock } from "@/lib/email-design";
import { AlignButtons, ColorField, IconAction, NumberField, ValidatedTextField } from "./editor-fields";
import { EditorImagePanel } from "./editor-image-panel";
import { BLOCK_ICONS, insertAtSelection, useBlockLabel } from "./editor-shared";

export interface EditorBlockPropertiesProps {
  block: EmailBlock;
  isFirst: boolean;
  isLast: boolean;
  canDuplicate: boolean;
  onPatch: (id: string, patch: Partial<EmailBlock>, group?: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

type TextFieldElement = HTMLInputElement | HTMLTextAreaElement;

interface InsertTarget {
  el: TextFieldElement;
  apply: (next: string) => void;
  maxLength: number;
}

/** Limites do schema (lib/email-design): o campo nunca deixa o design ficar inválido */
const HEADING_MAX = 500;
const TEXT_MAX = 5000;
const BUTTON_TEXT_MAX = 200;
const HREF_MAX = 2048;

/**
 * Menu de variáveis: insere `{{variavel}}` no cursor do último campo de texto focado do
 * bloco (ou no campo principal). O foco volta ao campo quando o menu fecha — senão o
 * Radix devolveria o foco ao botão do menu.
 */
function VariablesMenu({ onInsert }: { onInsert: (name: string) => (() => void) | null }) {
  const tm = useTranslations("emailMarketingPage");
  const refocusRef = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Braces className="h-3.5 w-3.5" aria-hidden />
          {tm("editorVariables")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 overflow-y-auto"
        onCloseAutoFocus={event => {
          const refocus = refocusRef.current;
          if (!refocus) return;
          refocusRef.current = null;
          event.preventDefault();
          refocus();
        }}
      >
        {EMAIL_VARIABLES.map(variable => (
          <DropdownMenuItem
            key={variable}
            onSelect={() => {
              refocusRef.current = onInsert(variable);
            }}
          >
            <span className="font-mono text-xs">{`{{${variable}}}`}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FormatRow({
  bold,
  italic,
  align,
  onChange,
}: {
  bold: boolean;
  italic: boolean;
  align: EmailAlign;
  onChange: (patch: { bold?: boolean; italic?: boolean; align?: EmailAlign }) => void;
}) {
  const tm = useTranslations("emailMarketingPage");
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <IconAction label={tm("editorBold")} active={bold} onClick={() => onChange({ bold: !bold })}>
        <Bold aria-hidden />
      </IconAction>
      <IconAction label={tm("editorItalic")} active={italic} onClick={() => onChange({ italic: !italic })}>
        <Italic aria-hidden />
      </IconAction>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <AlignButtons value={align} onChange={next => onChange({ align: next })} />
    </div>
  );
}

export function EditorBlockProperties({
  block,
  isFirst,
  isLast,
  canDuplicate,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: EditorBlockPropertiesProps) {
  const t = useTranslations("emailVisualEditor");
  const tm = useTranslations("emailMarketingPage");
  const tc = useTranslations("common");
  const blockLabel = useBlockLabel();
  const uid = useId();
  const activeFieldRef = useRef<InsertTarget | null>(null);
  const mainFieldRef = useRef<TextFieldElement | null>(null);

  const id = block.id;
  const Icon = BLOCK_ICONS[block.type];
  const patch = (value: Partial<EmailBlock>, group?: string) => onPatch(id, value, group);

  const issue = getBlockIssue(block);
  const issueText =
    issue === "text" ? t("issueText") : issue === "imageSrc" ? t("issueImageSrc") : issue === "href" ? t("issueHref") : null;

  const mainMax = block.type === "heading" ? HEADING_MAX : block.type === "text" ? TEXT_MAX : BUTTON_TEXT_MAX;
  // Inserção de variável = passo próprio no desfazer (sem grupo)
  const applyMainText = (next: string) => patch({ text: next });

  const trackFocus = (apply: (next: string) => void, maxLength: number) => (event: FocusEvent<TextFieldElement>) => {
    activeFieldRef.current = { el: event.currentTarget, apply, maxLength };
  };

  const insertVariable = (name: string): (() => void) | null => {
    let target = activeFieldRef.current;
    if (!target || !target.el.isConnected) {
      const el = mainFieldRef.current;
      target = el ? { el, apply: applyMainText, maxLength: mainMax } : null;
    }
    if (!target) return null;
    const { el, apply, maxLength } = target;
    const { value: next, caret } = insertAtSelection(el.value, el.selectionStart, el.selectionEnd, `{{${name}}}`);
    if (next.length > maxLength) return null;
    apply(next);
    return () => {
      el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* campo sem seleção de texto */
      }
    };
  };

  const commonFields = (
    <div className="grid grid-cols-2 gap-3 border-t pt-3">
      <ColorField
        label={t("blockBackground")}
        value={block.backgroundColor}
        onChange={backgroundColor => patch({ backgroundColor }, "backgroundColor")}
      />
      <NumberField
        label={t("padding")}
        value={block.padding}
        min={0}
        max={80}
        onChange={padding => patch({ padding }, "padding")}
      />
    </div>
  );

  let body: ReactNode = null;

  if (block.type === "heading" || block.type === "text") {
    body = (
      <>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${uid}-text`} className="text-xs">
              {t("content")}
            </Label>
            <VariablesMenu onInsert={insertVariable} />
          </div>
          <Textarea
            id={`${uid}-text`}
            ref={el => {
              mainFieldRef.current = el;
            }}
            value={block.text}
            maxLength={mainMax}
            rows={block.type === "heading" ? 2 : 6}
            onChange={e => patch({ text: e.target.value }, "text")}
            onFocus={trackFocus(applyMainText, mainMax)}
            className="text-sm"
          />
        </div>
        <FormatRow bold={block.bold} italic={block.italic} align={block.align} onChange={value => patch(value)} />
        <div className="grid grid-cols-2 gap-3">
          <ColorField label={tm("editorColor")} value={block.color} onChange={color => patch({ color }, "color")} />
          <NumberField
            label={t("fontSize")}
            value={block.fontSize}
            min={10}
            max={64}
            onChange={fontSize => patch({ fontSize }, "fontSize")}
          />
        </div>
      </>
    );
  } else if (block.type === "button") {
    body = (
      <>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${uid}-label`} className="text-xs">
              {t("buttonLabel")}
            </Label>
            <VariablesMenu onInsert={insertVariable} />
          </div>
          <Input
            id={`${uid}-label`}
            ref={el => {
              mainFieldRef.current = el;
            }}
            value={block.text}
            maxLength={BUTTON_TEXT_MAX}
            onChange={e => patch({ text: e.target.value }, "text")}
            onFocus={trackFocus(applyMainText, BUTTON_TEXT_MAX)}
            className="h-8 text-sm"
          />
        </div>
        <ValidatedTextField
          label={t("buttonUrl")}
          value={block.href}
          isValid={isValidEmailHref}
          onChange={href => patch({ href }, "href")}
          errorText={t("issueHref")}
          placeholder="https://"
          maxLength={HREF_MAX}
          autoPrefixHttps
          onFieldFocus={(el, apply) => {
            activeFieldRef.current = { el, apply, maxLength: HREF_MAX };
          }}
        />
        <FormatRow bold={block.bold} italic={block.italic} align={block.align} onChange={value => patch(value)} />
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label={tm("editorColor")}
            value={block.textColor}
            onChange={textColor => patch({ textColor }, "textColor")}
          />
          <ColorField
            label={t("buttonColor")}
            value={block.buttonColor}
            onChange={buttonColor => patch({ buttonColor }, "buttonColor")}
          />
          <NumberField
            label={t("fontSize")}
            value={block.fontSize}
            min={10}
            max={64}
            onChange={fontSize => patch({ fontSize }, "fontSize")}
          />
          <NumberField
            label={t("radius")}
            value={block.radius}
            min={0}
            max={40}
            onChange={radius => patch({ radius }, "radius")}
          />
        </div>
      </>
    );
  } else if (block.type === "image") {
    body = <EditorImagePanel block={block} onPatch={patch} />;
  } else if (block.type === "divider") {
    body = (
      <div className="grid grid-cols-2 gap-3">
        <ColorField label={t("lineColor")} value={block.color} onChange={color => patch({ color }, "color")} />
        <NumberField
          label={t("thickness")}
          value={block.thickness}
          min={1}
          max={20}
          onChange={thickness => patch({ thickness }, "thickness")}
        />
      </div>
    );
  } else {
    body = (
      <NumberField
        label={t("height")}
        value={block.height}
        min={4}
        max={160}
        onChange={height => patch({ height }, "height")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-semibold">{blockLabel(block.type)}</span>
        </div>
        <div className="flex shrink-0 items-center">
          <IconAction label={t("moveUp")} disabled={isFirst} onClick={() => onMove(id, -1)}>
            <ArrowUp aria-hidden />
          </IconAction>
          <IconAction label={t("moveDown")} disabled={isLast} onClick={() => onMove(id, 1)}>
            <ArrowDown aria-hidden />
          </IconAction>
          <IconAction label={tc("duplicate")} disabled={!canDuplicate} onClick={() => onDuplicate(id)}>
            <Copy aria-hidden />
          </IconAction>
          <IconAction label={tc("delete")} onClick={() => onRemove(id)} className="text-destructive hover:text-destructive">
            <Trash2 aria-hidden />
          </IconAction>
        </div>
      </div>

      {issueText && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{issueText}</span>
        </div>
      )}

      {body}
      {commonFields}
    </div>
  );
}
