"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Coins, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCentsBRL, formatDateTime } from "@/lib/format";
// Mesmo parser de dinheiro das telas da IA da plataforma (vírgula ou ponto, milhar com
// 3 dígitos): valor em reais digitado aqui vira centavos igual lá.
import { INVALID_FIELD_CLASS, inputToCents } from "@/components/ai-platform/connection-card";
import {
  adjustAiTenantBalance,
  fetchAiTenantStatement,
  setAiTenantEnabled,
} from "@/services/ai-platform";
import type { AiCreditTransactionType, AiCreditTransactionView } from "@/services/ai-credits";

// PLANO_CREDITOS_IA §5.1.6 — Créditos de IA de UMA empresa, na tela de empresas
// (superadmin): saldo, interruptor de liberação, ajuste manual com motivo e extrato.
// O interruptor tem rota PRÓPRIA e é gravado NA HORA — nunca no salvar do modal da
// empresa, cujo payload não conhece a coluna.

// Tipo vindo de um servidor mais novo não tem tradução: mostra o valor cru em vez de
// estourar a chave de i18n.
const KNOWN_TYPES = new Set<string>([
  "topup", "manual_credit", "manual_debit", "reversal", "dispute", "dispute_won",
]);

// O interceptor rejeita com `error.response || error`: o catch recebe o RESPONSE.
function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

function errorCode(err: unknown): string {
  const e = err as
    | { data?: { error?: unknown }; response?: { data?: { error?: unknown } } }
    | null;
  const code = e?.data?.error ?? e?.response?.data?.error ?? "";
  return typeof code === "string" ? code : "";
}

export interface AiCreditsTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number | null;
  tenantName?: string;
  /** Saldo ou interruptor mudaram: a tela de empresas relê a coluna. */
  onChanged?: () => void;
}

type LoadState = "loading" | "ready" | "outdated" | "error";

export function AiCreditsTenantDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  onChanged,
}: AiCreditsTenantDialogProps) {
  const t = useTranslations("aiCreditsTenantDialog");
  const tCredits = useTranslations("aiCreditsPage");
  const tc = useTranslations("common");

  const [state, setState] = useState<LoadState>("loading");
  const [balanceCents, setBalanceCents] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [planAllows, setPlanAllows] = useState(true);
  const [items, setItems] = useState<AiCreditTransactionView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const [mode, setMode] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [invalidAmount, setInvalidAmount] = useState(false);
  const [invalidReason, setInvalidReason] = useState(false);
  const [applying, setApplying] = useState(false);

  // Resposta em voo é descartada quando outra começa (troca de empresa, fechar/abrir).
  const seqRef = useRef(0);

  // `quiet`: releitura depois de um ajuste — não troca a tela por um spinner, o saldo e
  // o formulário continuam à vista.
  const loadPage = useCallback(
    async (cursor: string | null, opts?: { quiet?: boolean }) => {
      if (!(Number(tenantId) > 0)) return;
      seqRef.current += 1;
      const seq = seqRef.current;
      if (cursor) setLoadingMore(true);
      else if (!opts?.quiet) setState("loading");
      try {
        const { data } = await fetchAiTenantStatement(Number(tenantId), cursor);
        if (seqRef.current !== seq) return;
        const rows = Array.isArray(data?.items) ? data.items : [];
        setItems(prev => (cursor ? [...prev, ...rows] : rows));
        setNextCursor(
          typeof data?.nextCursor === "string" && data.nextCursor ? data.nextCursor : null
        );
        setBalanceCents(Number(data?.balanceCents) || 0);
        setEnabled(data?.enabled === true);
        setPlanAllows(data?.planAllows !== false);
        setState("ready");
      } catch (err: unknown) {
        if (seqRef.current !== seq) return;
        if (cursor || opts?.quiet) {
          // Página seguinte ou releitura silenciosa: o que já está na tela continua valendo.
          toast.error(tCredits("err_generic"));
          return;
        }
        const status = errorStatus(err);
        const code = errorCode(err);
        const outdated =
          status === 404 ||
          status === 405 ||
          status === 501 ||
          (status === 503 && code === "ERR_AI_PLATFORM_UNAVAILABLE");
        setItems([]);
        setNextCursor(null);
        setState(outdated ? "outdated" : "error");
      } finally {
        if (seqRef.current === seq) setLoadingMore(false);
      }
    },
    [tenantId, tCredits]
  );

  useEffect(() => {
    if (!open || !(Number(tenantId) > 0)) {
      seqRef.current += 1;
      return;
    }
    setMode("credit");
    setAmount("");
    setReason("");
    setInvalidAmount(false);
    setInvalidReason(false);
    void loadPage(null);
    return () => {
      seqRef.current += 1;
    };
  }, [open, tenantId, loadPage]);

  const handleToggleEnabled = async (next: boolean) => {
    if (!(Number(tenantId) > 0) || togglingEnabled) return;
    // Rota própria, gravada na hora — o salvar do modal da empresa não passa por aqui.
    setEnabled(next);
    setTogglingEnabled(true);
    try {
      const { data } = await setAiTenantEnabled(Number(tenantId), next);
      setEnabled(data?.enabled === true);
      setPlanAllows(data?.planAllows !== false);
      onChanged?.();
    } catch (err: unknown) {
      setEnabled(!next);
      if (errorCode(err) === "ERR_AI_CREDITS_PLAN_NOT_ALLOWED") {
        setPlanAllows(false);
        toast.error(t("planNotAllowed"));
      } else {
        toast.error(tCredits("err_generic"));
      }
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleApply = async () => {
    if (!(Number(tenantId) > 0) || applying) return;
    const cents = inputToCents(amount);
    const description = reason.trim();
    const badAmount = cents === null || cents <= 0;
    const badReason = description === "";
    setInvalidAmount(badAmount);
    setInvalidReason(badReason);
    if (badAmount) {
      toast.error(tCredits("err_ERR_AI_CREDITS_INVALID_AMOUNT"));
      return;
    }
    if (badReason) {
      toast.error(t("reasonRequired"));
      return;
    }

    setApplying(true);
    try {
      const signed = mode === "debit" ? -(cents as number) : (cents as number);
      const { data } = await adjustAiTenantBalance(Number(tenantId), signed, description);
      setBalanceCents(Number(data?.balanceCents) || 0);
      setAmount("");
      setReason("");
      toast.success(t("applied"));
      onChanged?.();
      // Relê a 1ª página: o movimento novo entra no topo do extrato.
      void loadPage(null, { quiet: true });
    } catch (err: unknown) {
      const code = errorCode(err);
      if (code === "ERR_AI_CREDITS_INVALID_AMOUNT") {
        setInvalidAmount(true);
        toast.error(tCredits("err_ERR_AI_CREDITS_INVALID_AMOUNT"));
      } else if (code === "ERR_AI_CREDITS_DESCRIPTION_REQUIRED") {
        setInvalidReason(true);
        toast.error(t("reasonRequired"));
      } else if (code === "ERR_AI_PLATFORM_DISABLED") {
        toast.error(tCredits("err_ERR_AI_PLATFORM_DISABLED"));
      } else {
        toast.error(tCredits("err_generic"));
      }
    } finally {
      setApplying(false);
    }
  };

  const typeLabel = (type: AiCreditTransactionType): string =>
    KNOWN_TYPES.has(type) ? tCredits(`type_${type}`) : String(type);

  const signedAmount = (cents: number): string =>
    cents > 0 ? `+${formatCentsBRL(cents)}` : formatCentsBRL(cents);

  const amountClass = (cents: number): string | undefined => {
    if (cents > 0) return "text-emerald-600 dark:text-emerald-400";
    if (cents < 0) return "text-destructive";
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          {tenantName ? <DialogDescription>{tenantName}</DialogDescription> : null}
        </DialogHeader>

        {state === "loading" && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {state === "outdated" && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>{tCredits("serverOutdated")}</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>{tc("errorFetchingData")}</p>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-5">
            {/* Saldo */}
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t("balance")}</p>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  balanceCents < 0 && "text-destructive"
                )}
              >
                {formatCentsBRL(balanceCents)}
              </p>
            </div>

            {/* Interruptor: rota própria, gravado na hora */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="ai-credits-tenant-enabled" className="text-sm font-semibold">
                    {t("enabled")}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("enabledNote")}</p>
                </div>
                <Switch
                  id="ai-credits-tenant-enabled"
                  checked={enabled}
                  onCheckedChange={(value) => void handleToggleEnabled(value)}
                  disabled={togglingEnabled}
                />
              </div>
              {!planAllows && (
                <p className="flex items-start gap-1.5 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{t("planNotAllowed")}</span>
                </p>
              )}
            </div>

            <Separator />

            {/* Ajuste manual */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("adjust")}</h3>

              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value === "debit" ? "debit" : "credit")}
                className="grid gap-2 sm:grid-cols-2"
                disabled={applying}
              >
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm transition-colors",
                    mode === "credit" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="credit" id="ai-credits-tenant-credit" />
                  <span className="font-medium">{t("credit")}</span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm transition-colors",
                    mode === "debit" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="debit" id="ai-credits-tenant-debit" />
                  <span className="font-medium">{t("debit")}</span>
                </label>
              </RadioGroup>

              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-credits-tenant-amount">{t("amount")}</Label>
                  <Input
                    id="ai-credits-tenant-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setInvalidAmount(false);
                    }}
                    aria-invalid={invalidAmount || undefined}
                    className={cn(invalidAmount && INVALID_FIELD_CLASS)}
                    disabled={applying}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-credits-tenant-reason">{t("reason")}</Label>
                  <Input
                    id="ai-credits-tenant-reason"
                    autoComplete="off"
                    maxLength={500}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setInvalidReason(false);
                    }}
                    aria-invalid={invalidReason || undefined}
                    className={cn(invalidReason && INVALID_FIELD_CLASS)}
                    disabled={applying}
                  />
                  {invalidReason && (
                    <p className="text-xs text-destructive">{t("reasonRequired")}</p>
                  )}
                </div>
              </div>

              <Button onClick={() => void handleApply()} disabled={applying} className="gap-1.5">
                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("apply")}
              </Button>
            </section>

            <Separator />

            {/* Extrato */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("statement")}</h3>

              {items.length === 0 ? (
                <div className="rounded-md border border-dashed py-10 text-center">
                  <p className="px-4 text-sm text-muted-foreground">{tCredits("empty")}</p>
                </div>
              ) : (
                <>
                  {/* O container da tabela rola na horizontal; o diálogo nunca rola */}
                  <div className="overflow-x-auto rounded-md border">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">{tCredits("colDate")}</TableHead>
                          <TableHead className="whitespace-nowrap">{tCredits("colType")}</TableHead>
                          <TableHead>{tCredits("colDescription")}</TableHead>
                          <TableHead className="whitespace-nowrap text-right">{tCredits("colAmount")}</TableHead>
                          <TableHead className="whitespace-nowrap text-right">{tCredits("colBalanceAfter")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((row) => {
                          const cents = Number(row.amountCents) || 0;
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {formatDateTime(row.createdAt, { dateStyle: "short", timeStyle: "short" })}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{typeLabel(row.type)}</TableCell>
                              <TableCell className="max-w-[16rem] break-words text-muted-foreground">
                                {row.description || "—"}
                              </TableCell>
                              <TableCell className={cn("whitespace-nowrap text-right font-medium", amountClass(cents))}>
                                {signedAmount(cents)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">
                                {formatCentsBRL(Number(row.balanceAfterCents) || 0)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {nextCursor && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={loadingMore}
                        onClick={() => void loadPage(nextCursor)}
                      >
                        {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                        {tCredits("loadMore")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AiCreditsTenantDialog;
