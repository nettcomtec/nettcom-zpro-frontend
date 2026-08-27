"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// TipTap v3: named exports; Link e Underline já vêm no StarterKit (duplicar
// extensão gera warning de nome duplicado)
import { Image } from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Quote, Minus, Link as LinkIcon, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Code2,
  Heading1, Heading2, Braces, Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Variáveis disponíveis nos disparos de e-mail. SEM {{protocol}} de propósito:
 * campanha/massa não têm ticket no momento do envio — sairia sempre vazio.
 */
export const EMAIL_VARIABLES = [
  "name", "firstName", "lastName", "email", "phoneNumber",
  "kanban", "businessName", "cpf", "birthdayDate",
] as const;

interface EmailHtmlEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeightClass?: string;
}

export function EmailHtmlEditor({ value, onChange, minHeightClass = "min-h-[260px]" }: EmailHtmlEditorProps) {
  const t = useTranslations("emailMarketingPage");
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2",
          minHeightClass
        ),
      },
    },
  });

  // Comparação tolerante a whitespace para detectar conteúdo que o schema do
  // editor NÃO representa (tabelas/divs/atributos de e-mail)
  const normalizeForCompare = (html: string): string =>
    String(html || "").replace(/\s+/g, "");

  // Sincroniza conteúdo externo (ex.: abrir template para editar).
  // HTML avançado (tabelas, divs, bgcolor...) não existe no schema do StarterKit:
  // se o editor visual normalizasse e o usuário digitasse, a marcação seria
  // destruída em silêncio — nesse caso caímos automaticamente no modo
  // código-fonte, que preserva o HTML byte a byte.
  useEffect(() => {
    if (!editor) return;
    if (sourceMode) {
      if (value !== sourceValue) setSourceValue(value || "");
      return;
    }
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
      if (value && normalizeForCompare(editor.getHTML()) !== normalizeForCompare(value)) {
        setSourceValue(value);
        setSourceMode(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    if (!sourceMode) {
      // Fonte da verdade é o value do pai — nunca o HTML normalizado do editor
      // (só entrar/sair do modo código não pode alterar a marcação)
      setSourceValue(value || "");
      setSourceMode(true);
    } else {
      editor.commands.setContent(sourceValue || "", { emitUpdate: false });
      onChange(sourceValue);
      // Se o conteúdo não é representável no editor visual, permanece no modo código
      if (sourceValue && normalizeForCompare(editor.getHTML()) !== normalizeForCompare(sourceValue)) {
        return;
      }
      setSourceMode(false);
    }
  }, [editor, sourceMode, sourceValue, value, onChange]);

  const insertVariable = useCallback((variable: string) => {
    const token = `{{${variable}}}`;
    if (sourceMode) {
      setSourceValue(prev => {
        const next = `${prev}${token}`;
        onChange(next);
        return next;
      });
      return;
    }
    editor?.chain().focus().insertContent(token).run();
  }, [editor, sourceMode, onChange]);

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    const href = /^(https?:\/\/|mailto:)/i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkUrl("");
  }, [editor, linkUrl]);

  const applyImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    if (!/^https?:\/\//i.test(imageUrl)) return;
    editor.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl("");
  }, [editor, imageUrl]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick, active, disabled, label, children,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    label: string;
    children: React.ReactNode;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-md border bg-background">
        <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
          {!sourceMode && (
            <>
              <ToolbarButton label={t("editorBold")} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorItalic")} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorUnderline")} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                <UnderlineIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorStrike")} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
                <Strikethrough className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorH1")} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorH2")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorBulletList")} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorOrderedList")} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorQuote")} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                <Quote className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorHr")} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                <Minus className="h-4 w-4" />
              </ToolbarButton>

              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant={editor.isActive("link") ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-label={t("editorLink")}>
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 space-y-2" align="start">
                  <Input
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
                  />
                  <div className="flex justify-between gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => editor.chain().focus().unsetLink().run()}>
                      {t("editorRemoveLink")}
                    </Button>
                    <Button type="button" size="sm" onClick={applyLink}>{t("editorApply")}</Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("editorImage")}>
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 space-y-2" align="start">
                  <Input
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://.../imagem.png"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyImage(); } }}
                  />
                  <p className="text-xs text-muted-foreground">{t("editorImageHint")}</p>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={applyImage}>{t("editorApply")}</Button>
                  </div>
                </PopoverContent>
              </Popover>

              <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent" aria-label={t("editorColor")}>
                <span className="h-4 w-4 rounded-sm border" style={{ background: editor.getAttributes("textStyle").color || "currentColor" }} />
                <input
                  type="color"
                  className="sr-only"
                  onChange={e => editor.chain().focus().setColor(e.target.value).run()}
                />
              </label>

              <ToolbarButton label={t("editorAlignLeft")} active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorAlignCenter")} active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorAlignRight")} active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorClear")} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
                <Eraser className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorUndo")} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label={t("editorRedo")} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>
            </>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1">
                  <Braces className="h-3.5 w-3.5" />
                  {t("editorVariables")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {EMAIL_VARIABLES.map(v => (
                  <DropdownMenuItem key={v} onClick={() => insertVariable(v)}>
                    <span className="font-mono text-xs">{`{{${v}}}`}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ToolbarButton label={t("editorSource")} active={sourceMode} onClick={toggleSourceMode}>
              <Code2 className="h-4 w-4" />
            </ToolbarButton>
          </div>
        </div>

        {sourceMode ? (
          <Textarea
            value={sourceValue}
            onChange={e => { setSourceValue(e.target.value); onChange(e.target.value); }}
            className={cn("rounded-none border-0 font-mono text-xs focus-visible:ring-0", minHeightClass)}
            spellCheck={false}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </TooltipProvider>
  );
}
