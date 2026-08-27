"use client"

// Formulario de cobranca do template "Detalhes do pedido" (ORDER_DETAILS).
// docs/PLANO_TEMPLATE_ORDER_DETAILS.md — F2 / F6.0.
//
// Componente unico reusado por todas as superficies que enviam template
// (atendimento, Nova Conversa, kanban, massa, campanha...). Modo `compact`
// encolhe para caber em paineis laterais e dialogs pequenos.
//
// Valores trafegam SEMPRE em centavos (lib/order-details.ts). O total e
// derivado — nunca digitado — para nao divergir do que a Meta valida.
// Overflow nativo (sem Radix ScrollArea), conforme padrao de modal novo.

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, X, Info, TriangleAlert, Lock } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type OrderDetailsValue,
  type OrderDetailsPaymentKind,
  emptyOrderDetailsItem,
  parseCurrencyToCents,
  formatCentsToInput,
  formatCentsBRL,
  computeSubtotal,
  computeTotal,
  orderDetailsBillableItems,
  isBrCodeCrcValid,
  isPixBrCode,
  guessPixKeyType,
  parseBrCodeAmountCents,
  parseBrCodeKey,
  parseBrCodeMerchant,
  epochSecondsToDateTimeInput,
  dateTimeInputToEpochSeconds,
  MIN_EXPIRATION_SECONDS,
} from "@/lib/order-details"

interface OrderDetailsFieldsProps {
  value: OrderDetailsValue
  onChange: (value: OrderDetailsValue) => void
  compact?: boolean
  /** Aviso extra para telas de envio em lote (mesmo codigo para todos). */
  bulkWarning?: boolean
}

export function OrderDetailsFields({
  value,
  onChange,
  compact = false,
  bulkWarning = false,
}: OrderDetailsFieldsProps) {
  const t = useTranslations("orderDetails")
  // Espelha canProfileSendCharge do backend. `user` so cobra quando o tenant liga
  // o interruptor em /configuracoes/geral; admin, super, superadmin e custom com
  // payments_manage nao dependem dele.
  const canSendCharge = useAuthStore((s) => s.canSendCharge())

  const patch = (partial: Partial<OrderDetailsValue>) => onChange({ ...value, ...partial })

  const updateItem = (idx: number, partial: Partial<OrderDetailsValue["items"][number]>) => {
    const items = value.items.map((it, i) => (i === idx ? { ...it, ...partial } : it))
    patch({ items })
  }

  // Subtotal e total saem da MESMA lista que vai para o envio (item sem nome nao
  // e cobrado). Somar o item sem nome so no total da tela fazia o operador ver um
  // total que fecha e o envio ser recusado por divergencia de valor.
  const subtotal = computeSubtotal(orderDetailsBillableItems(value.items))
  const total = computeTotal(value)

  // A referencia da cobranca (referenceId) serve para retry/duplo clique cairem na
  // mesma cobranca. Isso so vale para envio 1:1. Quando o MESMO formulario alimenta
  // varios disparos — lote, campanha, acao de funil, lembrete — repetir a referencia
  // colaria todos os destinatarios na mesma cobranca e o backend abortaria do
  // segundo em diante. Nesses casos a referencia e responsabilidade do servidor,
  // uma por disparo, e o formulario nao manda a sua.
  useEffect(() => {
    if (bulkWarning && value.referenceId) {
      onChange({ ...value, referenceId: undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkWarning, value.referenceId])

  const pixCode = value.payment.code || ""
  const pixTouched = pixCode.trim().length > 0
  // "Parece um Pix copia e cola?" — CRC fecha E o BRCode traz chave (estatico)
  // ou URL do PSP (dinamico). Quando nao parece, o codigo NAO e recusado: vira
  // aviso. O operador pode estar colando um dado proprio de proposito, e o campo
  // sai verbatim para a Meta de qualquer forma.
  const pixLooksBrCode = pixTouched && isBrCodeCrcValid(pixCode) && isPixBrCode(pixCode)
  const pixAmount = pixLooksBrCode ? parseBrCodeAmountCents(pixCode) : null
  const pixMismatch = pixAmount != null && pixAmount !== total
  // Codigo dinamico (o caso normal do copia-e-cola do banco) nao carrega valor:
  // nao ha como comparar com o total digitado, nem aqui nem no servidor.
  const pixAmountUnverified = pixLooksBrCode && pixAmount == null

  const linkTouched = Boolean(value.payment.uri?.trim())
  const linkLooksUrl = /^https?:\/\//i.test(value.payment.uri || "")
  const boletoTouched = Boolean(value.payment.digitableLine?.trim())
  // 44 a 48 digitos: 47 no boleto bancario, 48 no convenio/arrecadacao.
  const boletoDigits = (value.payment.digitableLine || "").replace(/\D/g, "")
  const boletoLooksValid = boletoDigits.length >= 44 && boletoDigits.length <= 48

  const setPaymentKind = (kind: OrderDetailsPaymentKind) =>
    patch({ payment: { ...value.payment, kind } })

  // Aviso amarelo: informa sem impedir. Todo dado de pagamento e digitado pelo
  // operador e sai verbatim — a tela sinaliza o que nao fecha, o envio nao trava.
  const advice = (text: string) => (
    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>{text}</p>
        <p>{t("warnNotBlocking")}</p>
      </div>
    </div>
  )

  // Recebedor e chave sao preenchidos PELO codigo enquanto ninguem os edita a
  // mao; o que o operador digitar fica. E o unico jeito de a ficha sair com
  // recebedor quando o campo Pix nao e um BRCode. A referencia guarda o ultimo
  // valor que o proprio codigo colocou — sem ela, ou o codigo novo apaga o que
  // foi digitado, ou o recebedor de um Pix gruda no codigo de outro.
  const autoFilled = useRef<{ key?: string; merchant?: string }>({
    key: value.payment.key,
    merchant: value.payment.merchantName,
  })

  const onPixCodeChange = (code: string) => {
    const cur = value.payment
    const parsedKey = parseBrCodeKey(code)
    const parsedMerchant = parseBrCodeMerchant(code)
    const keepKey = Boolean(cur.key) && cur.key !== autoFilled.current.key
    const keepMerchant = Boolean(cur.merchantName) && cur.merchantName !== autoFilled.current.merchant
    autoFilled.current = { key: parsedKey, merchant: parsedMerchant }
    const key = keepKey ? cur.key : parsedKey
    patch({
      payment: {
        ...cur,
        code,
        key,
        merchantName: keepMerchant ? cur.merchantName : parsedMerchant,
        keyType: key ? guessPixKeyType(key) : cur.keyType,
      },
    })
  }

  // O tipo da chave acompanha a chave: a Meta recusa o par divergente (chave de
  // CPF declarada como aleatoria), e ninguem precisa escolher isso na mao.
  const onPixKeyChange = (key: string) =>
    patch({
      payment: {
        ...value.payment,
        key,
        keyType: key.trim() ? guessPixKeyType(key) : value.payment.keyType,
      },
    })

  // O `min` do vencimento depende do relogio do operador: calculado so no cliente
  // para nao divergir do HTML gerado no servidor durante a hidratacao.
  const [minExpirationInput, setMinExpirationInput] = useState("")
  useEffect(() => {
    setMinExpirationInput(
      epochSecondsToDateTimeInput(Math.floor(Date.now() / 1000) + MIN_EXPIRATION_SECONDS)
    )
  }, [])

  const expirationInput = epochSecondsToDateTimeInput(value.expirationTimestamp)
  const expirationTooSoon =
    Boolean(minExpirationInput) &&
    Boolean(value.expirationTimestamp) &&
    (value.expirationTimestamp as number) - Math.floor(Date.now() / 1000) < MIN_EXPIRATION_SECONDS

  // Expiracao sem descricao e recusada no envio (a descricao aparece na ficha do
  // cliente), entao a data ja entra com um texto padrao quando o operador nao
  // escreveu o dele. Limpar a data limpa as duas pontas.
  const onExpirationChange = (raw: string) => {
    const timestamp = dateTimeInputToEpochSeconds(raw)
    if (!timestamp) {
      patch({ expirationTimestamp: undefined, expirationDescription: undefined })
      return
    }
    patch({
      expirationTimestamp: timestamp,
      expirationDescription:
        value.expirationDescription?.trim() || t("expirationDefaultDescription"),
    })
  }

  const gap = compact ? "space-y-3" : "space-y-4"

  // Gate de cobranca DEPOIS de todos os hooks (early return antes quebraria a
  // ordem de hooks). Bloquear aqui — e nao em cada tela — porque este e o
  // formulario de TODAS as superficies de cobranca: sem isso o operador preenche
  // valor, chave Pix, recebedor e vencimento para levar 403 so no clique final.
  if (!canSendCharge) {
    return (
      <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("notAllowedTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("notAllowedBody")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={gap}>
      {/* ── Itens ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">{t("itemsLabel")}</Label>
        {value.items.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input
              className="flex-1 min-w-0"
              placeholder={t("itemNamePlaceholder")}
              value={item.name}
              onChange={(e) => updateItem(idx, { name: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                className="w-16 shrink-0"
                type="number"
                min={1}
                aria-label={t("itemQuantity")}
                value={item.quantity}
                onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
              <Input
                className="w-28 shrink-0"
                inputMode="decimal"
                placeholder="0,00"
                aria-label={t("itemAmount")}
                defaultValue={item.amount ? formatCentsToInput(item.amount) : ""}
                onBlur={(e) => {
                  const cents = parseCurrencyToCents(e.target.value)
                  e.target.value = cents ? formatCentsToInput(cents) : ""
                  updateItem(idx, { amount: cents })
                }}
              />
              {value.items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => patch({ items: value.items.filter((_, i) => i !== idx) })}
                  aria-label={t("removeItem")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patch({ items: [...value.items, emptyOrderDetailsItem()] })}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addItem")}
        </Button>
      </div>

      {/* ── Tipo de produto ───────────────────────────────────────────── */}
      {/* Pertence a COBRANCA, nao ao canal: o mesmo numero vende produto digital
          e fisico. Estava fixo em "digital-goods" e quem vende fisico nao tinha
          como mudar. */}
      <div className="space-y-1">
        <Label className="text-xs">{t("goodsTypeLabel")}</Label>
        <Select
          value={value.goodsType}
          onValueChange={(v) => patch({ goodsType: v as OrderDetailsValue["goodsType"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="digital-goods">{t("goodsTypeDigital")}</SelectItem>
            <SelectItem value="physical-goods">{t("goodsTypePhysical")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Ajustes ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["discount", "shipping", "tax"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-xs">{t(`${field}Label`)}</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={value[field] ? formatCentsToInput(value[field]) : ""}
              onBlur={(e) => {
                const cents = parseCurrencyToCents(e.target.value)
                e.target.value = cents ? formatCentsToInput(cents) : ""
                patch({ [field]: cents } as Partial<OrderDetailsValue>)
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Totais (derivados) ────────────────────────────────────────── */}
      <div className="rounded-md border bg-muted/30 p-2 text-sm">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t("subtotalLabel")}</span>
          <span>{formatCentsBRL(subtotal)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>{t("totalLabel")}</span>
          <span>{formatCentsBRL(total)}</span>
        </div>
      </div>

      {/* ── Pagamento ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">{t("paymentLabel")}</Label>
        <Select value={value.payment.kind} onValueChange={(v) => setPaymentKind(v as OrderDetailsPaymentKind)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pix">{t("paymentPix")}</SelectItem>
            <SelectItem value="link">{t("paymentLink")}</SelectItem>
            <SelectItem value="boleto">{t("paymentBoleto")}</SelectItem>
          </SelectContent>
        </Select>

        {value.payment.kind === "pix" && (
          <div className="space-y-2">
            <Input
              placeholder={t("pixPlaceholder")}
              value={pixCode}
              onChange={(e) => onPixCodeChange(e.target.value)}
            />
            {pixTouched && !pixLooksBrCode && advice(t("errorPixInvalid"))}
            {pixMismatch && advice(t("errorPixMismatch"))}
            {pixAmountUnverified && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-muted-foreground">{t("pixAmountUnverified")}</p>
              </div>
            )}

            {/* Recebedor e chave saem na ficha do cliente. Vem do codigo quando
                ele e um copia e cola; digitados a mao no resto dos casos. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("pixMerchantLabel")}</Label>
                <Input
                  className="min-w-0"
                  value={value.payment.merchantName || ""}
                  onChange={(e) => patch({ payment: { ...value.payment, merchantName: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pixKeyLabel")}</Label>
                <Input
                  className="min-w-0"
                  value={value.payment.key || ""}
                  onChange={(e) => onPixKeyChange(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("pixManualHint")}</p>
          </div>
        )}

        {value.payment.kind === "link" && (
          <div className="space-y-2">
            <Input
              placeholder="https://"
              value={value.payment.uri || ""}
              onChange={(e) => patch({ payment: { ...value.payment, uri: e.target.value } })}
            />
            {linkTouched && !linkLooksUrl && advice(t("errorLinkInvalid"))}
          </div>
        )}

        {value.payment.kind === "boleto" && (
          <div className="space-y-2">
            <Input
              placeholder={t("boletoPlaceholder")}
              value={value.payment.digitableLine || ""}
              onChange={(e) => patch({ payment: { ...value.payment, digitableLine: e.target.value } })}
            />
            {boletoTouched && !boletoLooksValid && advice(t("errorBoletoInvalid"))}
          </div>
        )}
      </div>

      {/* ── Vencimento (opcional) ─────────────────────────────────────── */}
      {/* Sem data a cobranca fica em aberto para sempre: nada no sistema a encerra
          sozinha, so a baixa manual. Com data, ela vence e sai do painel. */}
      <div className="space-y-1">
        <Label className="text-xs">{t("expirationLabel")}</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            type="datetime-local"
            className="min-w-0"
            aria-label={t("expirationLabel")}
            value={expirationInput}
            min={minExpirationInput || undefined}
            onChange={(e) => onExpirationChange(e.target.value)}
          />
          <Input
            className="min-w-0"
            maxLength={120}
            placeholder={t("expirationDescriptionPlaceholder")}
            aria-label={t("expirationDescriptionPlaceholder")}
            disabled={!value.expirationTimestamp}
            value={value.expirationDescription || ""}
            onChange={(e) => patch({ expirationDescription: e.target.value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("expirationHint")}</p>
        {expirationTooSoon && (
          <p className="text-xs text-destructive">{t("errorExpirationTooSoon")}</p>
        )}
        {bulkWarning && Boolean(value.expirationTimestamp) && (
          <p className="text-xs text-amber-600">{t("expirationNoteScheduled")}</p>
        )}
      </div>

      {/* ── Notas ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t("noteManualSettlement")}</p>
          {bulkWarning && <p>{t("noteBulkSharedCode")}</p>}
        </div>
      </div>
    </div>
  )
}
