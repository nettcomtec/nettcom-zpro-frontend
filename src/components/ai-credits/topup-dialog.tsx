"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Gift, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCentsBRL } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import {
  createAiTopup,
  type AiCreditsStatusResponse,
  type AiTopupCreated,
  type CreateAiTopupPayload,
} from "@/services/ai-credits";

// ── Utilitários do módulo (usados também pela página e pelos outros cartões) ──

// O `catch` de request recebe o RESPONSE (lib/api.ts rejeita com `error.response || error`),
// então status e código se leem com fallback nas duas formas.
type RequestErrorShape = {
  status?: number;
  data?: { error?: unknown };
  response?: { status?: number; data?: { error?: unknown } };
} | null | undefined;

export function aiCreditsErrorStatus(err: unknown): number | undefined {
  const e = err as RequestErrorShape;
  return e?.status ?? e?.response?.status;
}

export function aiCreditsErrorCode(err: unknown): string | undefined {
  const e = err as RequestErrorShape;
  const code = e?.data?.error ?? e?.response?.data?.error;
  return typeof code === "string" ? code : undefined;
}

// Códigos que têm texto próprio em `aiCreditsPage.err_<código>`.
const TRANSLATED_ERROR_CODES = new Set([
  "ERR_AI_CREDITS_INSUFFICIENT",
  "ERR_AI_PLATFORM_DISABLED",
  "ERR_AI_CREDITS_NO_GATEWAY",
  "ERR_AI_CREDITS_CUSTOMER_DATA_REQUIRED",
  "ERR_AI_CREDITS_INVALID_AMOUNT",
  "ERR_AI_CREDITS_DAILY_LIMIT",
]);

// Códigos sem texto próprio que ainda assim têm um texto MELHOR que o genérico: o meio
// de pagamento fora do ar é exatamente o que "recarga indisponível" descreve.
const REUSED_ERROR_KEYS: Record<string, string> = {
  ERR_AI_CREDITS_GATEWAY_UNAVAILABLE: "topupUnavailable",
  ERR_AI_PLATFORM_UNAVAILABLE: "topupUnavailable"
};

/** Chave de tradução do erro dentro de `aiCreditsPage`; código desconhecido = genérica. */
export function aiCreditsErrorKey(err: unknown): string {
  const code = aiCreditsErrorCode(err);
  if (!code) return "err_generic";
  if (TRANSLATED_ERROR_CODES.has(code)) return `err_${code}`;
  // Cursor/período inválidos ficam de fora de propósito: só aparecem por falha de
  // montagem do request, nunca por algo que o usuário digitou.
  return REUSED_ERROR_KEYS[code] ?? "err_generic";
}

/**
 * Valor em reais digitado ("50", "50,00", "1.234,56", "1,234.56") → centavos inteiros.
 * Um único separador seguido de exatamente 3 dígitos é milhar ("1.000" = mil): dinheiro
 * não tem 3 casas. Devolve null quando não é um valor.
 */
export function parseReaisToCents(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/[^\d.,]/g, "");
  if (!s || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    normalized = s.split(thousands).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    if (parts.length > 2) normalized = parts.join("");
    else if (parts[1].length === 3 && parts[0] !== "" && parts[0] !== "0") normalized = parts.join("");
    else normalized = parts.join(".");
  }
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Centavos → texto de campo em reais, no formato brasileiro de digitação ("50,00"). */
export function centsToReaisInput(cents: number): string {
  const value = Number(cents);
  if (!Number.isFinite(value)) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Diálogo ─────────────────────────────────────────────────────────────────

export interface TopupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: AiCreditsStatusResponse | null;
  /** Cobrança criada: a página recarrega o status (a recarga passa a constar como pendente). */
  onCreated: (topup: AiTopupCreated) => void;
  /** "Verificar pagamento" — a consulta é da página, que também atualiza saldo e extrato. */
  onCheckPayment: (topupId: string) => void;
  /** true enquanto a página consulta o pagamento (o servidor limita a 1 consulta a cada 30 s). */
  checking: boolean;
}

export function TopupDialog({ open, onOpenChange, status, onCreated, onCheckPayment, checking }: TopupDialogProps) {
  const t = useTranslations("aiCreditsPage");
  const userEmail = useAuthStore((s) => s.user?.email);

  const [amount, setAmount] = useState("");
  const [packageId, setPackageId] = useState<string | null>(null);
  const [needCustomerData, setNeedCustomerData] = useState(false);
  const [documentValue, setDocumentValue] = useState("");
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState<{ amount?: boolean; document?: boolean; email?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<AiTopupCreated | null>(null);

  const documentRef = useRef<HTMLInputElement>(null);

  // Cada abertura começa limpa.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setPackageId(null);
    setNeedCustomerData(false);
    setDocumentValue("");
    setEmail(userEmail || "");
    setInvalid({});
    setSaving(false);
    setCreated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (needCustomerData) documentRef.current?.focus();
  }, [needCustomerData]);

  const packages = status?.packages ?? [];
  const isPackages = status?.saleMode === "packages";
  const minTopupCents = Number(status?.minTopupCents) || 0;
  // Sem meio de pagamento — ou modo pacotes sem nenhum pacote cadastrado: não há o que vender.
  const unavailable = !status || status.topupAvailable === false || (isPackages && packages.length === 0);

  const handleSubmit = async () => {
    if (saving || unavailable) return;

    const payload: CreateAiTopupPayload = {};
    const nextInvalid: typeof invalid = {};

    if (isPackages) {
      if (!packageId) {
        toast.error(t("err_ERR_AI_CREDITS_INVALID_AMOUNT"));
        return;
      }
      payload.packageId = packageId;
    } else {
      const cents = parseReaisToCents(amount);
      if (cents === null || cents <= 0 || cents < minTopupCents) nextInvalid.amount = true;
      else payload.amountCents = cents;
    }

    if (needCustomerData) {
      const digits = documentValue.replace(/\D/g, "");
      if (digits.length !== 11 && digits.length !== 14) nextInvalid.document = true;
      else payload.document = digits;
      const mail = email.trim();
      if (!EMAIL_PATTERN.test(mail)) nextInvalid.email = true;
      else payload.email = mail;
    }

    setInvalid(nextInvalid);
    if (nextInvalid.amount) {
      toast.error(t("err_ERR_AI_CREDITS_INVALID_AMOUNT"));
      return;
    }
    if (nextInvalid.document || nextInvalid.email) {
      toast.error(t("err_ERR_AI_CREDITS_CUSTOMER_DATA_REQUIRED"));
      return;
    }

    setSaving(true);
    try {
      const { data } = await createAiTopup(payload);
      setCreated(data);
      onCreated(data);
      toast.success(t("topupCreated"));
      if (data?.paymentUrl) {
        // Alguns navegadores bloqueiam a nova aba aberta depois da espera — por isso a
        // tela seguinte mantém o botão "Abrir pagamento".
        window.open(data.paymentUrl, "_blank", "noopener");
      }
    } catch (err: unknown) {
      const code = aiCreditsErrorCode(err);
      if (code === "ERR_AI_CREDITS_CUSTOMER_DATA_REQUIRED" && !needCustomerData) {
        // 1ª recusa: revela os campos; o próprio texto abaixo deles explica o motivo.
        setNeedCustomerData(true);
      } else {
        toast.error(t(aiCreditsErrorKey(err)));
      }
    } finally {
      setSaving(false);
    }
  };

  const bonusOf = (priceCents: number, creditCents: number) => creditCents > priceCents;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("topupTitle")}</DialogTitle>
          {!created && !unavailable && !isPackages && minTopupCents > 0 && (
            <DialogDescription>{t("topupMin", { value: formatCentsBRL(minTopupCents) })}</DialogDescription>
          )}
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p>{t("topupCreated")}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("pendingTopup")}</p>
              <p className="text-lg font-semibold tabular-nums">{formatCentsBRL(created.priceCents)}</p>
              {bonusOf(created.priceCents, created.creditCents) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Gift className="h-3.5 w-3.5 shrink-0" />
                  {t("topupBonus", { value: formatCentsBRL(created.creditCents) })}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {created.paymentUrl && (
                <Button asChild className="gap-1.5 sm:flex-1">
                  <a href={created.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t("openPayment")}
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-1.5 sm:flex-1"
                disabled={checking}
                onClick={() => onCheckPayment(created.id)}
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t("checkPayment")}
              </Button>
            </div>
          </div>
        ) : unavailable ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>{t("topupUnavailable")}</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            {isPackages ? (
              <div className="space-y-2">
                <Label>{t("topupPackages")}</Label>
                <div role="radiogroup" aria-label={t("topupPackages")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {packages.map((pkg) => {
                    const selected = packageId === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={saving}
                        onClick={() => setPackageId(pkg.id)}
                        className={cn(
                          "min-w-0 rounded-lg border p-3 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-ring/50"
                        )}
                      >
                        {pkg.label && (
                          <span className="block break-words text-xs text-muted-foreground">{pkg.label}</span>
                        )}
                        <span className="block text-lg font-semibold tabular-nums">{formatCentsBRL(pkg.priceCents)}</span>
                        {bonusOf(pkg.priceCents, pkg.creditCents) && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Gift className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 break-words">
                              {t("topupBonus", { value: formatCentsBRL(pkg.creditCents) })}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="ai-topup-amount">{t("topupFreeValue")}</Label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">R$</span>
                  <Input
                    id="ai-topup-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={minTopupCents > 0 ? centsToReaisInput(minTopupCents) : "0,00"}
                    value={amount}
                    disabled={saving}
                    aria-invalid={invalid.amount || undefined}
                    className={cn(invalid.amount && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (invalid.amount) setInvalid((prev) => ({ ...prev, amount: false }));
                    }}
                  />
                </div>
                {minTopupCents > 0 && (
                  <p className={cn("text-xs", invalid.amount ? "text-destructive" : "text-muted-foreground")}>
                    {t("topupMin", { value: formatCentsBRL(minTopupCents) })}
                  </p>
                )}
              </div>
            )}

            {needCustomerData && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <p className="text-xs text-muted-foreground">{t("topupDataNote")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-topup-document">{t("topupDocument")}</Label>
                  <Input
                    id="ai-topup-document"
                    ref={documentRef}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={18}
                    value={documentValue}
                    disabled={saving}
                    aria-invalid={invalid.document || undefined}
                    className={cn(invalid.document && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={(e) => {
                      setDocumentValue(e.target.value);
                      if (invalid.document) setInvalid((prev) => ({ ...prev, document: false }));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-topup-email">{t("topupEmail")}</Label>
                  <Input
                    id="ai-topup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    disabled={saving}
                    aria-invalid={invalid.email || undefined}
                    className={cn(invalid.email && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20")}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (invalid.email) setInvalid((prev) => ({ ...prev, email: false }));
                    }}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving || (isPackages && !packageId)} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("topupOpenPayment")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
