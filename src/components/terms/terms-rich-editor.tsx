"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// TipTap v3: Link e Underline JÁ vêm no StarterKit — importar à parte gera
// warning de nome duplicado (mesma nota do email-html-editor).
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus,
  Link as LinkIcon, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TERMS_DOC_PROSE, isSafeTermsHref, type TermsDocNode } from "@/lib/terms-doc";

// PLANO_ACEITE_TERMOS_REVENDA §5.6.1 — editor dos termos do revendedor.
// Grava o JSON do documento (getJSON), nunca HTML. O schema do StarterKit (sem
// code/codeBlock, títulos 1–3) é a allowlist: o validador do servidor aceita
// exatamente esses nós/marcas. Estilo = TERMS_DOC_PROSE, o mesmo do renderer.

interface TermsRichEditorProps {
  value: TermsDocNode;
  onChange: (doc: TermsDocNode) => void;
  /** Muda quando o conteúdo deve ser recarregado de fora (troca de seção ou
   * conteúdo devolvido pelo servidor). Não muda a cada tecla. */
  resetKey?: string;
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function ToolbarButton({
  onClick, active, disabled, label, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
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
          aria-pressed={active}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function TermsRichEditor({ value, onChange, resetKey }: TermsRichEditorProps) {
  const t = useTranslations("resellerTermsPanel");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;
  // Conteúdo inicial fixo: o `useEditor` compara as opções a cada render e
  // chamaria setOptions a cada tecla se `content` mudasse junto com o valor.
  const initialContentRef = useRef(value);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        code: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
    ],
    []
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: cn(TERMS_DOC_PROSE, "min-h-[320px] p-3 focus:outline-none"),
      },
    }),
    []
  );

  const editor = useEditor({
    extensions,
    content: initialContentRef.current,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getJSON() as TermsDocNode);
    },
    editorProps,
  });

  // Recarrega o conteúdo só quando a chave muda (troca de seção / resposta do
  // servidor). Fora do histórico: desfazer nunca traz o texto de outra seção.
  const appliedKeyRef = useRef(resetKey);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (appliedKeyRef.current === resetKey) return;
    appliedKeyRef.current = resetKey;
    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(valueRef.current, { emitUpdate: false })
      .run();
  }, [editor, resetKey]);

  // TipTap v3 não re-renderiza a cada transação: o estado da barra é assinado.
  // Com immediatelyRender:false o seletor pode seguir nulo até a primeira
  // transação — por isso a barra usa estado padrão em vez de esperar por ele.
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
        link: e.isActive("link"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
  const toolbar = toolbarState ?? {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    h1: false,
    h2: false,
    h3: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    link: false,
    canUndo: false,
    canRedo: false,
  };

  const onLinkOpenChange = useCallback(
    (open: boolean) => {
      setLinkOpen(open);
      setLinkInvalid(false);
      if (open && editor) {
        const current = editor.getAttributes("link")?.href;
        setLinkUrl(typeof current === "string" ? current : "");
      }
    },
    [editor]
  );

  const applyLink = useCallback(() => {
    if (!editor) return;
    const raw = linkUrl.trim();
    if (!raw) {
      setLinkInvalid(true);
      return;
    }
    const href = SCHEME_RE.test(raw) ? raw : `https://${raw}`;
    if (!isSafeTermsHref(href)) {
      setLinkInvalid(true);
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      // Sem seleção: insere o próprio endereço já como link.
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkUrl("");
    setLinkInvalid(false);
    setLinkOpen(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkUrl("");
    setLinkInvalid(false);
    setLinkOpen(false);
  }, [editor]);

  if (!editor) {
    return <div className="min-h-[360px] rounded-md border bg-background" />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-md border bg-background">
        <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
          <ToolbarButton label={t("editorBold")} active={toolbar.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorItalic")} active={toolbar.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorUnderline")} active={toolbar.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorStrike")} active={toolbar.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <ToolbarButton label={t("editorH1")} active={toolbar.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorH2")} active={toolbar.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorH3")} active={toolbar.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <ToolbarButton label={t("editorBulletList")} active={toolbar.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorOrderedList")} active={toolbar.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorQuote")} active={toolbar.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorRule")} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </ToolbarButton>

          <Popover open={linkOpen} onOpenChange={onLinkOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant={toolbar.link ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t("editorLink")}
                    aria-pressed={toolbar.link}
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("editorLink")}</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-2" align="start">
              <Input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  if (linkInvalid) setLinkInvalid(false);
                }}
                placeholder={t("editorLinkPlaceholder")}
                aria-label={t("editorLink")}
                aria-invalid={linkInvalid}
                inputMode="url"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
              />
              {linkInvalid && (
                <p className="text-xs text-destructive">{t("editorLinkInvalid")}</p>
              )}
              <div className="flex justify-between gap-2">
                <Button type="button" size="sm" variant="outline" onClick={removeLink} disabled={!toolbar.link}>
                  {t("editorLinkRemove")}
                </Button>
                <Button type="button" size="sm" onClick={applyLink}>
                  {t("editorLinkApply")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <ToolbarButton label={t("editorUndo")} disabled={!toolbar.canUndo} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label={t("editorRedo")} disabled={!toolbar.canRedo} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <EditorContent editor={editor} />
      </div>
    </TooltipProvider>
  );
}

export default TermsRichEditor;
