"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Loader2, ShieldAlert, FileSpreadsheet, CheckCircle2, AlertCircle, Wrench,
  Upload, Download, Undo2, RotateCw,
} from "lucide-react";
import {
  lidConsolidationAudit,
  lidConsolidationApply,
  lidConsolidationApplyManual,
  lidConsolidationBulkMerge,
  lidConsolidationMergeLogs,
  lidConsolidationUnmerge,
  AuditedPair,
  AuditDebug,
  ApplyResponse,
  MatchKind,
  BulkMergePairInput,
  BulkMergeResponse,
  MergeLogItem,
} from "@/services/lid-consolidation";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTime } from "@/lib/utils";

type Step = "warn" | "auditing" | "review" | "applying" | "result" | "revert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const matchKindBadgeVariant = (k: MatchKind): "default" | "secondary" | "outline" => {
  if (k === "cross_collision") return "default";
  if (k === "nine_digit_variant") return "default";
  if (k === "pushname_and_profilePic") return "default";
  if (k === "profilePic") return "secondary";
  return "outline";
};

const KNOWN_MATCH_KINDS: MatchKind[] = [
  "cross_collision",
  "nine_digit_variant",
  "pushname",
  "profilePic",
  "pushname_and_profilePic",
];

const isKnownMatchKind = (k: string): k is MatchKind =>
  (KNOWN_MATCH_KINDS as string[]).includes(k);

const isPositiveInt = (s: string): boolean => /^\d+$/.test(s) && Number(s) > 0;

// U+FEFF — BOM: removido do inicio de CSVs importados e prefixado no export
// para o Excel abrir o arquivo como UTF-8.
const UTF8_BOM = String.fromCharCode(0xfeff);

const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export function LidConsolidationDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("lidConsolidation");
  const profile = useAuthStore((s) => s.user?.profile);
  const isSuperadmin = profile === "superadmin";

  const [step, setStep] = useState<Step>("warn");
  const [backupOk, setBackupOk] = useState(false);
  const [risksOk, setRisksOk] = useState(false);
  const [allTenants, setAllTenants] = useState(false);
  const [audited, setAudited] = useState<AuditedPair[] | null>(null);
  const [auditScope, setAuditScope] = useState<string | null>(null);
  const [auditDebug, setAuditDebug] = useState<AuditDebug | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [applyOnlyHigh, setApplyOnlyHigh] = useState(true);

  const [manualPrimaryId, setManualPrimaryId] = useState("");
  const [manualDuplicateId, setManualDuplicateId] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // Mesclagem em massa (CSV)
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [csvPairs, setCsvPairs] = useState<BulkMergePairInput[] | null>(null);
  const [csvInvalidCount, setCsvInvalidCount] = useState(0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvRunning, setCsvRunning] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvResult, setCsvResult] = useState<BulkMergeResponse | null>(null);

  // Reverter mesclagens (unmerge)
  const [mergeLogs, setMergeLogs] = useState<MergeLogItem[] | null>(null);
  const [revertLoading, setRevertLoading] = useState(false);
  const [revertBusyId, setRevertBusyId] = useState<number | null>(null);
  const [pendingRevert, setPendingRevert] = useState<MergeLogItem | null>(null);

  const reset = () => {
    setStep("warn");
    setBackupOk(false);
    setRisksOk(false);
    setAllTenants(false);
    setAudited(null);
    setAuditScope(null);
    setAuditDebug(null);
    setApplyResult(null);
    setApplyOnlyHigh(true);
    setManualPrimaryId("");
    setManualDuplicateId("");
    setManualBusy(false);
    setCsvText("");
    setCsvPairs(null);
    setCsvInvalidCount(0);
    setCsvError(null);
    setCsvRunning(false);
    setCsvProgress(null);
    setCsvResult(null);
    setMergeLogs(null);
    setRevertLoading(false);
    setRevertBusyId(null);
    setPendingRevert(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runAudit = async () => {
    setStep("auditing");
    try {
      const data = await lidConsolidationAudit({ allTenants: isSuperadmin && allTenants });
      setAudited(data.pairs);
      setAuditScope(data.scope);
      setAuditDebug(data.debug ?? null);
      setStep("review");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t("errorAudit"));
      setStep("warn");
    }
  };

  const runApply = async () => {
    setStep("applying");
    try {
      const matchKinds: MatchKind[] | undefined = applyOnlyHigh
        ? ["cross_collision", "nine_digit_variant", "pushname_and_profilePic", "profilePic"]
        : undefined;
      const data = await lidConsolidationApply({
        allTenants: isSuperadmin && allTenants,
        matchKinds,
      });
      setApplyResult(data);
      setStep("result");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t("errorApply"));
      setStep("review");
    }
  };

  const runManualMerge = async () => {
    const primaryId = Number(manualPrimaryId);
    const duplicateId = Number(manualDuplicateId);
    if (!primaryId || !duplicateId) {
      toast.error(t("manualErrorIds"));
      return;
    }
    if (primaryId === duplicateId) {
      toast.error(t("manualErrorSame"));
      return;
    }
    setManualBusy(true);
    try {
      const r = await lidConsolidationApplyManual({ primaryId, duplicateId });
      if (r.status === "consolidated") {
        toast.success(
          t("manualSuccess", { tickets: r.ticketsMoved ?? 0, messages: r.messagesMoved ?? 0 })
        );
        setManualPrimaryId("");
        setManualDuplicateId("");
        await runAudit();
      } else if (r.status === "skipped") {
        toast.warning(`${t("manualSkipped")}: ${r.detail}`);
      } else {
        toast.error(`${t("manualError")}: ${r.detail}`);
      }
    } catch (err: any) {
      const code = err?.response?.data?.error || err?.message || t("manualError");
      toast.error(code);
    } finally {
      setManualBusy(false);
    }
  };

  // ------------------------------------------------------------------
  // Mesclagem em massa (CSV)
  // ------------------------------------------------------------------

  const parseCsv = (raw: string) => {
    setCsvError(null);
    setCsvResult(null);
    const lines = raw
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      setCsvPairs(null);
      setCsvInvalidCount(0);
      setCsvError(t("csvEmpty"));
      return;
    }
    const splitLine = (l: string) => l.split(/[;,]/).map((c) => c.trim());
    const header = splitLine(stripBom(lines[0])).map((c) => c.toLowerCase());
    if (header.length < 2 || header[0] !== "primaryid" || header[1] !== "duplicateid") {
      setCsvPairs(null);
      setCsvInvalidCount(0);
      setCsvError(t("csvHeaderError"));
      return;
    }
    let invalid = 0;
    const seen = new Set<string>();
    const pairs: BulkMergePairInput[] = [];
    for (const line of lines.slice(1)) {
      const cols = splitLine(line);
      const primaryId = Number(cols[0]);
      const duplicateId = Number(cols[1]);
      const valid =
        cols.length >= 2 &&
        isPositiveInt(cols[0]) &&
        isPositiveInt(cols[1]) &&
        primaryId !== duplicateId &&
        cols.slice(2).every((c) => c === ""); // tolera separador final; rejeita coluna extra com conteudo
      if (!valid) {
        invalid += 1;
        continue;
      }
      const key = `${primaryId}:${duplicateId}`;
      if (seen.has(key)) continue; // dedup de pares repetidos
      seen.add(key);
      pairs.push({ primaryId, duplicateId });
    }
    if (pairs.length === 0 && invalid === 0) {
      setCsvPairs(null);
      setCsvInvalidCount(0);
      setCsvError(t("csvEmpty"));
      return;
    }
    setCsvPairs(pairs);
    setCsvInvalidCount(invalid);
  };

  const handleCsvFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      parseCsv(text);
    } finally {
      input.value = ""; // permite re-selecionar o mesmo arquivo
    }
  };

  const runCsvBulkMerge = async () => {
    if (!backupOk || !risksOk) return; // mesmo gate dos checkboxes do step warn
    if (!csvPairs || csvPairs.length === 0 || csvRunning) return;
    setCsvRunning(true);
    setCsvResult(null);
    setCsvProgress({ done: 0, total: csvPairs.length });
    try {
      const data = await lidConsolidationBulkMerge(csvPairs, {
        allTenants: isSuperadmin && allTenants,
        onProgress: (done, total) => setCsvProgress({ done, total }),
      });
      setCsvResult(data);
      toast.success(t("csvDone"));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t("errorApply"));
    } finally {
      setCsvRunning(false);
      setCsvProgress(null);
    }
  };

  const exportCsvResult = () => {
    if (!csvResult) return;
    const esc = (v: unknown) => {
      const s = v === undefined || v === null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "primaryId,duplicateId,status,code,detail";
    const rows = csvResult.results.map((r) =>
      [r.primaryId, r.duplicateId, r.status, r.code ?? "", r.detail ?? ""].map(esc).join(",")
    );
    const blob = new Blob([UTF8_BOM + [header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lid-bulk-merge-result.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------------
  // Reverter mesclagens (unmerge)
  // ------------------------------------------------------------------

  const openRevert = async () => {
    setStep("revert");
    setPendingRevert(null);
    setRevertLoading(true);
    try {
      const data = await lidConsolidationMergeLogs({
        activeOnly: true,
        allTenants: isSuperadmin && allTenants,
      });
      setMergeLogs(data.logs || []);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message;
      toast.error(detail ? `${t("revertErrorGeneric")}: ${detail}` : t("revertErrorGeneric"));
      setMergeLogs([]);
    } finally {
      setRevertLoading(false);
    }
  };

  const runUnmerge = async () => {
    if (!pendingRevert || revertBusyId !== null) return;
    const target = pendingRevert;
    setRevertBusyId(target.id);
    try {
      await lidConsolidationUnmerge({ mergeLogId: target.id });
      toast.success(t("revertSuccess"));
      setMergeLogs((prev) => (prev || []).filter((l) => l.id !== target.id));
      setPendingRevert(null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message;
      toast.error(detail ? `${t("revertErrorGeneric")}: ${detail}` : t("revertErrorGeneric"));
    } finally {
      setRevertBusyId(null);
    }
  };

  const consolidatable = (audited || []).filter(a => !a.decision.skip && !a.conflictReason);
  const ambiguous = (audited || []).filter(a => a.decision.skip);
  const conflicted = (audited || []).filter(a => !a.decision.skip && !!a.conflictReason);
  const highCount = (audited || []).filter(a => a.confidence === "high" && !a.decision.skip && !a.conflictReason).length;
  const mediumCount = (audited || []).filter(a => a.confidence === "medium" && !a.decision.skip && !a.conflictReason).length;
  const matchKindLabel = (k: MatchKind): string => {
    if (k === "cross_collision") return t("matchCrossCollision");
    if (k === "nine_digit_variant") return t("matchNineDigit");
    if (k === "pushname_and_profilePic") return t("matchPushnameAndPic");
    if (k === "profilePic") return t("matchProfilePic");
    return t("matchPushname");
  };
  // Origem de um merge log: MatchKind heuristico → label traduzido;
  // origem literal (ex.: "manual") → exibida como veio do backend.
  const originLabel = (kind: string): string =>
    isKnownMatchKind(kind) ? matchKindLabel(kind) : kind;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        {step === "warn" && (
          <div className="space-y-4 my-2">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{t("warnHeader")}</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>{t("warnFkMigration")}</li>
                    <li>{t("warnDeletesContacts")}</li>
                    <li>{t("warnRequiresRestart")}</li>
                    <li>{t("warnTransactional")}</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox id="backup" checked={backupOk} onCheckedChange={(v) => setBackupOk(v === true)} />
                <Label htmlFor="backup" className="text-sm leading-tight cursor-pointer">
                  <span className="font-medium block">{t("confirmBackupTitle")}</span>
                  <span className="text-xs text-muted-foreground">{t("confirmBackupDesc")}</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="risks" checked={risksOk} onCheckedChange={(v) => setRisksOk(v === true)} />
                <Label htmlFor="risks" className="text-sm leading-tight cursor-pointer">
                  <span className="font-medium block">{t("confirmRisksTitle")}</span>
                  <span className="text-xs text-muted-foreground">{t("confirmRisksDesc")}</span>
                </Label>
              </div>
              {isSuperadmin && (
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <Checkbox id="alltenants" checked={allTenants} onCheckedChange={(v) => setAllTenants(v === true)} />
                  <Label htmlFor="alltenants" className="text-sm leading-tight cursor-pointer">
                    <span className="font-medium block">{t("allTenantsTitle")}</span>
                    <span className="text-xs text-muted-foreground">{t("allTenantsDesc")}</span>
                  </Label>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="secondary" onClick={openRevert} className="w-full sm:w-auto sm:mr-auto">
                <Undo2 className="h-4 w-4 mr-1" />
                {t("revertTitle")}
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)} className="w-full sm:w-auto">
                {t("cancel")}
              </Button>
              <Button onClick={runAudit} disabled={!backupOk || !risksOk} className="w-full sm:w-auto">
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                {t("runAudit")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "auditing" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("auditing")}</p>
          </div>
        )}

        {step === "review" && audited && (
          <div className="space-y-4 my-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-primary">{consolidatable.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statConsolidatable")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{conflicted.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statConflicted")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{ambiguous.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statAmbiguous")}</p>
              </div>
            </div>

            {(highCount > 0 || mediumCount > 0) && (
              <div className="rounded-md border p-3 text-xs grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{t("confidenceHigh")}</Badge>
                  <span>{highCount} {t("pairs")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t("confidenceMedium")}</Badge>
                  <span>{mediumCount} {t("pairs")}</span>
                </div>
              </div>
            )}

            {mediumCount > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">{t("mediumWarnHeader")}</p>
                  <p className="text-xs text-muted-foreground">{t("mediumWarnDesc")}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Checkbox
                      id="onlyhigh"
                      checked={applyOnlyHigh}
                      onCheckedChange={(v) => setApplyOnlyHigh(v === true)}
                    />
                    <Label htmlFor="onlyhigh" className="text-xs cursor-pointer">
                      {t("applyOnlyHigh")}
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {audited.length === 0 && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm">{t("noPairsFound")}</p>
              </div>
            )}

            {auditDebug && (
              <div className="rounded-md border border-blue-500/40 bg-blue-500/5 p-3 text-xs space-y-1">
                <p className="font-medium">Diagnóstico (scope: {auditScope})</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                  <span className="text-muted-foreground">profile:</span>
                  <span>{String(auditDebug.profile)}</span>
                  <span className="text-muted-foreground">req.user.tenantId:</span>
                  <span>
                    {String(auditDebug.rawUserTenantId)} ({auditDebug.rawUserTenantIdType})
                  </span>
                  <span className="text-muted-foreground">allTenants?:</span>
                  <span>{String(auditDebug.allTenantsRequested)}</span>
                  <span className="text-muted-foreground">filtro aplicado:</span>
                  <span>
                    {auditDebug.effectiveTenantFilter === null
                      ? "ALL (sem filtro)"
                      : String(auditDebug.effectiveTenantFilter)}
                  </span>
                  <span className="text-muted-foreground">pares retornados:</span>
                  <span>{auditDebug.pairsReturned}</span>
                  {auditDebug.globalCrossPairsCount !== undefined && (
                    <>
                      <span className="text-muted-foreground">total global (DB):</span>
                      <span>{auditDebug.globalCrossPairsCount}</span>
                    </>
                  )}
                </div>
                {auditDebug.breakdownByMatchKind && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-muted-foreground mb-1">{t("breakdownByOrigin")}:</p>
                    <div className="font-mono">
                      <div>cross_collision: {auditDebug.breakdownByMatchKind.cross_collision}</div>
                      {/* backend antigo pode nao mandar a chave nova → ?? 0 */}
                      <div>nine_digit_variant: {auditDebug.breakdownByMatchKind.nine_digit_variant ?? 0}</div>
                      <div>pushname_and_profilePic: {auditDebug.breakdownByMatchKind.pushname_and_profilePic}</div>
                      <div>profilePic: {auditDebug.breakdownByMatchKind.profilePic}</div>
                      <div>pushname: {auditDebug.breakdownByMatchKind.pushname}</div>
                    </div>
                  </div>
                )}
                {auditDebug.byTenant && auditDebug.byTenant.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-muted-foreground mb-1">Distribuição por tenant (todos):</p>
                    <div className="font-mono">
                      {auditDebug.byTenant.map((t) => (
                        <div key={t.tenantId}>
                          tenant {t.tenantId}: {t.count} par(es)
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {conflicted.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
                <p className="font-medium flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> {t("conflictedHeader")}
                </p>
                <p className="text-xs text-muted-foreground">{t("conflictedDesc")}</p>
              </div>
            )}

            {ambiguous.length > 0 && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p className="font-medium">{t("ambiguousHeader")}</p>
                <p className="text-xs text-muted-foreground">{t("ambiguousDesc")}</p>
              </div>
            )}

            {audited.length > 0 && (
              <div className="border rounded-md max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">{t("colTenant")}</th>
                      <th className="text-left p-2">{t("colOrigin")}</th>
                      <th className="text-left p-2">{t("colPrimary")}</th>
                      <th className="text-left p-2">{t("colDuplicate")}</th>
                      <th className="text-right p-2">{t("colTickets")}</th>
                      <th className="text-right p-2">{t("colMessages")}</th>
                      <th className="text-left p-2">{t("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audited.map((a) => (
                      <tr key={`${a.pair.small_id}-${a.pair.big_id}`} className="border-t">
                        <td className="p-2">{a.pair.tenantId}</td>
                        <td className="p-2">
                          <Badge variant={matchKindBadgeVariant(a.matchKind)} className="text-[10px]">
                            {matchKindLabel(a.matchKind)}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {a.decision.skip ? "—" : (
                            <span>
                              <span className="font-medium">{a.primaryName || "(sem nome)"}</span>
                              <br />
                              <span className="text-muted-foreground">{a.primaryNumber}</span>
                              <span className="text-[10px] text-muted-foreground"> · #{a.decision.primaryId}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {a.decision.skip ? (
                            <span className="text-muted-foreground">{a.pair.small_number} ↔ {a.pair.big_number}</span>
                          ) : (
                            <span>
                              <span className="font-medium">{a.duplicateName || "(sem nome)"}</span>
                              <br />
                              <span className="text-muted-foreground">{a.duplicateNumber}</span>
                              <span className="text-[10px] text-muted-foreground"> · #{a.decision.duplicateId}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">{a.decision.skip ? "—" : a.ticketsToMove}</td>
                        <td className="p-2 text-right">{a.decision.skip ? "—" : a.messagesToMove}</td>
                        <td className="p-2">
                          {a.decision.skip ? (
                            <span className="text-muted-foreground">{a.decision.skip}</span>
                          ) : a.conflictReason ? (
                            <span className="text-amber-600">{t("statusConflict")}</span>
                          ) : (
                            <span className="text-primary">{t("statusReady")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4" /> {t("manualMergeTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("manualMergeDesc")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                  <Label htmlFor="primaryId" className="text-xs">{t("manualPrimaryLabel")}</Label>
                  <Input
                    id="primaryId"
                    type="number"
                    inputMode="numeric"
                    value={manualPrimaryId}
                    onChange={(e) => setManualPrimaryId(e.target.value)}
                    placeholder={t("manualPrimaryPh")}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label htmlFor="duplicateId" className="text-xs">{t("manualDuplicateLabel")}</Label>
                  <Input
                    id="duplicateId"
                    type="number"
                    inputMode="numeric"
                    value={manualDuplicateId}
                    onChange={(e) => setManualDuplicateId(e.target.value)}
                    placeholder={t("manualDuplicatePh")}
                    className="h-8"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={runManualMerge}
                  disabled={manualBusy || !manualPrimaryId || !manualDuplicateId}
                  className="h-8"
                >
                  {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("manualApplyBtn")}
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> {t("csvTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("csvDescription")}</p>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFile}
                className="hidden"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => csvFileInputRef.current?.click()}
                  disabled={csvRunning}
                  className="h-8"
                >
                  <Upload className="h-4 w-4 mr-1" /> {t("csvFileButton")}
                </Button>
              </div>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={t("csvPastePlaceholder")}
                disabled={csvRunning}
                className="min-h-24 font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={() => parseCsv(csvText)}
                disabled={csvRunning || !csvText.trim()}
                className="h-8"
              >
                {t("csvParse")}
              </Button>
              {csvError && <p className="text-xs text-destructive">{csvError}</p>}

              {csvPairs && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-medium">{t("csvPreviewLabel")}</span>
                    <span>
                      {t("csvTotalPairs")}: <span className="font-medium">{csvPairs.length}</span>
                    </span>
                    <span className={csvInvalidCount > 0 ? "text-amber-600" : "text-muted-foreground"}>
                      {t("csvInvalidLines")}: {csvInvalidCount}
                    </span>
                  </div>
                  {csvPairs.length > 0 && (
                    <div className="border rounded-md max-h-48 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left p-2">#</th>
                            <th className="text-left p-2">{t("csvColPrimary")}</th>
                            <th className="text-left p-2">{t("csvColDuplicate")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPairs.slice(0, 10).map((p, i) => (
                            <tr key={`${p.primaryId}-${p.duplicateId}`} className="border-t">
                              <td className="p-2 text-muted-foreground">{i + 1}</td>
                              <td className="p-2">#{p.primaryId}</td>
                              <td className="p-2">#{p.duplicateId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      onClick={runCsvBulkMerge}
                      disabled={!backupOk || !risksOk || csvRunning || csvPairs.length === 0}
                      className="h-8"
                    >
                      {csvRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("csvRunning")}
                        </>
                      ) : (
                        t("csvRun")
                      )}
                    </Button>
                    {csvRunning && csvProgress && (
                      <span className="text-xs text-muted-foreground">
                        {csvProgress.done}/{csvProgress.total}
                      </span>
                    )}
                  </div>
                  {csvRunning && csvProgress && csvProgress.total > 0 && (
                    <Progress value={(csvProgress.done / csvProgress.total) * 100} />
                  )}
                </div>
              )}

              {csvResult && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-medium">{t("csvDone")}</span>
                    <span>
                      {t("csvTotalPairs")}: {csvResult.summary.total}
                    </span>
                    <span className="text-green-600">
                      {t("csvStatusConsolidated")}: {csvResult.summary.consolidated}
                    </span>
                    <span className="text-muted-foreground">
                      {t("csvStatusSkipped")}: {csvResult.summary.skipped}
                    </span>
                    <span className="text-destructive">
                      {t("csvStatusError")}: {csvResult.summary.errors}
                    </span>
                  </div>
                  <div className="border rounded-md max-h-48 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">{t("csvColPrimary")}</th>
                          <th className="text-left p-2">{t("csvColDuplicate")}</th>
                          <th className="text-left p-2">{t("csvColStatus")}</th>
                          <th className="text-left p-2">{t("csvColDetail")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvResult.results.map((r) => (
                          <tr key={r.index} className="border-t">
                            <td className="p-2">#{r.primaryId}</td>
                            <td className="p-2">#{r.duplicateId}</td>
                            <td className="p-2">
                              {r.status === "consolidated" ? (
                                <span className="text-green-600">{t("csvStatusConsolidated")}</span>
                              ) : r.status === "skipped" ? (
                                <span className="text-muted-foreground">{t("csvStatusSkipped")}</span>
                              ) : (
                                <span className="text-destructive">{t("csvStatusError")}</span>
                              )}
                            </td>
                            <td className="p-2 text-muted-foreground break-all">
                              {[r.code, r.detail].filter(Boolean).join(" — ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="outline" onClick={exportCsvResult} className="h-8">
                    <Download className="h-4 w-4 mr-1" /> {t("csvExportResult")}
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} className="w-full sm:w-auto">
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={runApply}
                disabled={consolidatable.length === 0}
                className="w-full sm:w-auto"
              >
                {t("applyButton", { n: applyOnlyHigh ? highCount : consolidatable.length })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "applying" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-destructive" />
            <p className="text-sm text-muted-foreground">{t("applying")}</p>
            <p className="text-xs text-muted-foreground">{t("applyingHint")}</p>
          </div>
        )}

        {step === "result" && applyResult && (
          <div className="space-y-4 my-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{applyResult.consolidated}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statConsolidated")}</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{applyResult.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statSkipped")}</p>
              </div>
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{applyResult.errors}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("statErrors")}</p>
              </div>
            </div>
            {applyResult.consolidated > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>{t("resultRestartHint")}</span>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="link" onClick={openRevert} className="w-full sm:w-auto sm:mr-auto">
                <Undo2 className="h-4 w-4 mr-1" /> {t("revertTitle")}
              </Button>
              <Button onClick={() => handleClose(false)} className="w-full sm:w-auto">{t("close")}</Button>
            </DialogFooter>
          </div>
        )}

        {step === "revert" && (
          <div className="space-y-4 my-2">
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium text-sm flex items-center gap-2">
                <Undo2 className="h-4 w-4" /> {t("revertTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("revertDescription")}</p>
            </div>

            {revertLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{t("revertLoad")}</p>
              </div>
            ) : (mergeLogs || []).length === 0 ? (
              <div className="rounded-md border p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm text-muted-foreground">{t("revertEmpty")}</p>
              </div>
            ) : (
              <div className="border rounded-md max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">{t("revertColPair")}</th>
                      <th className="text-left p-2">{t("revertColOrigin")}</th>
                      <th className="text-left p-2">{t("revertColDate")}</th>
                      <th className="text-right p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mergeLogs || []).map((log) => (
                      <tr key={log.id} className="border-t">
                        <td className="p-2">
                          <span>
                            <span className="font-medium">{log.primaryName || "(sem nome)"}</span>{" "}
                            <span className="text-muted-foreground">
                              {log.primaryNumber || `#${log.primaryId}`}
                            </span>
                            <span className="text-muted-foreground"> ← </span>
                            <span className="font-medium">{log.duplicateName || "(sem nome)"}</span>{" "}
                            <span className="text-muted-foreground">
                              {log.duplicateNumber || `#${log.duplicateId}`}
                            </span>
                          </span>
                          {(log.unmergeable === false || log.revertedAt) && (
                            <span className="block mt-1 space-x-1">
                              {log.unmergeable === false && (
                                <Badge variant="outline" className="text-[10px]">
                                  {t("revertUnmergeable")}
                                </Badge>
                              )}
                              {log.revertedAt && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {t("revertReverted")}
                                </Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={isKnownMatchKind(log.matchKind) ? matchKindBadgeVariant(log.matchKind) : "outline"}
                            className="text-[10px]"
                          >
                            {originLabel(log.matchKind)}
                          </Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                        <td className="p-2 text-right">
                          <Button
                            variant="outline"
                            onClick={() => setPendingRevert(log)}
                            disabled={log.unmergeable === false || !!log.revertedAt || revertBusyId !== null}
                            className="h-7 px-2 text-xs"
                          >
                            {revertBusyId === log.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              t("revertButton")
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pendingRevert && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
                <p className="font-medium text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> {t("revertConfirmTitle")}
                </p>
                <p className="text-xs text-muted-foreground">{t("revertConfirmDescription")}</p>
                <p className="text-xs">
                  <span className="font-medium">
                    {pendingRevert.primaryName || pendingRevert.primaryNumber || `#${pendingRevert.primaryId}`}
                  </span>
                  <span className="text-muted-foreground"> ← </span>
                  <span className="font-medium">
                    {pendingRevert.duplicateName || pendingRevert.duplicateNumber || `#${pendingRevert.duplicateId}`}
                  </span>
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPendingRevert(null)}
                    disabled={revertBusyId !== null}
                    className="h-8"
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={runUnmerge}
                    disabled={revertBusyId !== null}
                    className="h-8"
                  >
                    {revertBusyId !== null ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("revertButton")
                    )}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="secondary"
                onClick={openRevert}
                disabled={revertLoading || revertBusyId !== null}
                className="w-full sm:w-auto sm:mr-auto"
              >
                <RotateCw className="h-4 w-4 mr-1" /> {t("revertLoad")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("warn")}
                disabled={revertBusyId !== null}
                className="w-full sm:w-auto"
              >
                {t("cancel")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
