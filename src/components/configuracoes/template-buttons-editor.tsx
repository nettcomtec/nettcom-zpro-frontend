"use client"

// Editor de botões de template com paridade ao criador WABA (Meta):
// tipos QUICK_REPLY, URL, PHONE_NUMBER e OTP, com adicionar/remover (padrão máx. 3).
// Reutiliza as chaves i18n do namespace `metaPage` (btnType*/placeholderButtonText/addButton),
// já presentes em todos os locales — não introduz chave nova.
// Usado nos criadores de template Dialog360 e Gupshup (backend BSP já aceita botões ricos).

import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WABA_LIMITS } from "@/lib/waba-text-limits"

export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "OTP"

export interface TemplateButton {
  type: TemplateButtonType
  text: string
  url?: string
  phone_number?: string
}

interface TemplateButtonsEditorProps {
  buttons: TemplateButton[]
  onChange: (buttons: TemplateButton[]) => void
  maxButtons?: number
  title?: string
}

/**
 * Monta o component `BUTTONS` Meta-native a partir do estado do editor.
 * Retorna null quando não há botão válido (evita enviar BUTTONS vazio).
 * O shape segue o criador WABA: URL leva `url`, PHONE_NUMBER leva `phone_number`,
 * OTP/QUICK_REPLY levam apenas `text`.
 */
export function buildTemplateButtonsComponent(
  buttons: TemplateButton[],
): Record<string, unknown> | null {
  const valid = buttons.filter(
    (b) =>
      b.text.trim() &&
      (b.type === "QUICK_REPLY" ||
        b.type === "OTP" ||
        (b.type === "URL" && (b.url || "").trim()) ||
        (b.type === "PHONE_NUMBER" && (b.phone_number || "").trim())),
  )
  if (valid.length === 0) return null
  return {
    type: "BUTTONS",
    buttons: valid.map((b) => {
      if (b.type === "URL") return { type: "URL", text: b.text.trim(), url: (b.url || "").trim() }
      if (b.type === "PHONE_NUMBER")
        return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: (b.phone_number || "").trim() }
      if (b.type === "OTP") return { type: "OTP", text: b.text.trim() }
      return { type: "QUICK_REPLY", text: b.text.trim() }
    }),
  }
}

/**
 * Converte o component `BUTTONS` de um template existente para o estado do editor
 * (usado ao abrir em modo edição). Normaliza o type para os 4 suportados.
 */
export function parseTemplateButtons(buttonsComp: unknown): TemplateButton[] {
  const raw = (buttonsComp as { buttons?: unknown[] })?.buttons
  if (!Array.isArray(raw)) return []
  const allowed: TemplateButtonType[] = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "OTP"]
  return raw.map((b) => {
    const btn = b as { type?: string; text?: string; url?: string; phone_number?: string }
    const t = String(btn.type || "").toUpperCase() as TemplateButtonType
    return {
      type: allowed.includes(t) ? t : "QUICK_REPLY",
      text: btn.text || "",
      url: btn.url || undefined,
      phone_number: btn.phone_number || undefined,
    }
  })
}

export function TemplateButtonsEditor({
  buttons,
  onChange,
  maxButtons = 3,
  title,
}: TemplateButtonsEditorProps) {
  const t = useTranslations("metaPage")

  const update = (idx: number, patch: Partial<TemplateButton>) => {
    onChange(buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }
  const remove = (idx: number) => onChange(buttons.filter((_, i) => i !== idx))
  const add = () => {
    if (buttons.length >= maxButtons) return
    onChange([...buttons, { type: "QUICK_REPLY", text: "" }])
  }

  return (
    <div className="space-y-2 border rounded-md p-3">
      {title && <p className="text-sm font-semibold text-muted-foreground">{title}</p>}
      {buttons.map((btn, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <Select value={btn.type} onValueChange={(v) => update(idx, { type: v as TemplateButtonType })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="QUICK_REPLY">{t("btnTypeQuickReply")}</SelectItem>
              <SelectItem value="URL">{t("btnTypeUrl")}</SelectItem>
              <SelectItem value="PHONE_NUMBER">{t("btnTypePhone")}</SelectItem>
              <SelectItem value="OTP">{t("btnTypeOtp")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={btn.text}
            onChange={(e) => update(idx, { text: e.target.value })}
            placeholder={t("placeholderButtonText")}
            maxLength={25}
            className="flex-1"
          />
          {btn.type === "URL" && (
            <Input
              value={btn.url || ""}
              onChange={(e) => update(idx, { url: e.target.value })}
              placeholder="https://..."
              maxLength={WABA_LIMITS.templateUrl}
              className="flex-1"
            />
          )}
          {btn.type === "PHONE_NUMBER" && (
            <Input
              value={btn.phone_number || ""}
              onChange={(e) => update(idx, { phone_number: e.target.value })}
              placeholder="+55..."
              maxLength={WABA_LIMITS.templatePhone}
              className="flex-1"
            />
          )}
          <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-red-500 h-8 w-8">
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      {buttons.length < maxButtons && (
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="w-3 h-3 mr-1" /> {t("addButton")}
        </Button>
      )}
    </div>
  )
}
