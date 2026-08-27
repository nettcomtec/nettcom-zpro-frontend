"use client";

import { useState } from "react";
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
import { AlertTriangle, Loader2, AlertCircle, CheckCircle2, Wrench } from "lucide-react";
import {
  sanitizeInstagramPkAudit,
  sanitizeInstagramPkApply,
  sanitizeInstagramPkApplyManual,
  AuditedCandidate,
} from "@/services/instagram-pk-sanitize";
import { useAuthStore } from "@/stores/auth-store";

type Step = "warn" | "auditing" | "review" | "applying" | "result";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstagramPkSanitizeDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("instagramPkSanitize");
  const profile = useAuthStore((s) => s.user?.profile);
  const isSuperadmin = profile === "superadmin";

  const [step, setStep] = useState<Step>("warn");
  const [backupOk, setBackupOk] = useState(false);
  const [allTenants, setAllTenants] = useState(false);
  const [audited, setAudited] = useState<AuditedCandidate[] | null>(null);
  const [applyResult, setApplyResult] = useState<{ corrected: number; skipped: number; total: number } | null>(null);

  const [manualContactId, setManualContactId] = useState("");
  const [manualPk, setManualPk] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  const reset = () => {
    setStep("warn");
    setBackupOk(false);
    setAllTenants(false);
    setAudited(null);
    setApplyResult(null);
    setManualContactId("");
    setManualPk("");
    setManualBusy(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runAudit = async () => {
    setStep("auditing");
    try {
      const res = await sanitizeInstagramPkAudit({ allTenants });
      setAudited(res.audited);
      setStep("review");
    } catch (err: any) {
      toast.error(t("auditError"));
      setStep("warn");
    }
  };

  const runApplyAll = async () => {
    if (!audited) return;
    setStep("applying");
    try {
      const onlyDivergent = audited.filter(a => a.divergent).map(a => a.id);
      const res = await sanitizeInstagramPkApply({ allTenants, only: onlyDivergent });
      setApplyResult(res);
      setStep("result");
      toast.success(t("applySuccess", { corrected: res.corrected }));
    } catch (err: any) {
      toast.error(t("applyError"));
      setStep("review");
    }
  };

  const runManual = async () => {
    if (!manualContactId || !manualPk) return;
    if (!/^\d+$/.test(manualPk)) {
      toast.error(t("manualInvalidPk"));
      return;
    }
    setManualBusy(true);
    try {
      await sanitizeInstagramPkApplyManual({
        contactId: Number(manualContactId),
        correctPk: manualPk,
        allTenants,
      });
      toast.success(t("manualSuccess"));
      setManualContactId("");
      setManualPk("");
    } catch (err: any) {
      toast.error(t("manualError"));
    } finally {
      setManualBusy(false);
    }
  };

  const divergentCount = audited?.filter(a => a.divergent).length || 0;
  const selfPageCount = audited?.filter(a => a.reason === "self_page").length || 0;
  const notFoundCount = audited?.filter(a => !a.metaPk && a.reason !== "self_page").length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-600" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {step === "warn" && (
          <div className="space-y-4">
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-medium text-amber-700 dark:text-amber-500">{t("warnTitle")}</p>
                <p className="text-muted-foreground whitespace-pre-line">{t("warnBody")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="backupOk" checked={backupOk} onCheckedChange={(v) => setBackupOk(v === true)} />
              <Label htmlFor="backupOk">{t("backupCheckbox")}</Label>
            </div>

            {isSuperadmin && (
              <div className="flex items-center gap-2">
                <Checkbox id="allTenants" checked={allTenants} onCheckedChange={(v) => setAllTenants(v === true)} />
                <Label htmlFor="allTenants">{t("allTenantsCheckbox")}</Label>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={runAudit} disabled={!backupOk}>
                {t("runAudit")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "auditing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("auditingHint")}</p>
          </div>
        )}

        {step === "review" && audited && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                {t("totalCandidates")}: {audited.length}
              </Badge>
              <Badge variant="default">
                {t("divergentCount")}: {divergentCount}
              </Badge>
              {selfPageCount > 0 && (
                <Badge variant="outline" className="border-sky-500/60 text-sky-600 dark:text-sky-400">
                  {t("selfPageCount")}: {selfPageCount}
                </Badge>
              )}
              {notFoundCount > 0 && (
                <Badge variant="secondary">
                  {t("notFoundCount")}: {notFoundCount}
                </Badge>
              )}
            </div>

            {audited.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {t("noCandidatesHint")}
              </div>
            )}

            {audited.length > 0 && divergentCount === 0 && notFoundCount === 0 && selfPageCount > 0 && (
              <div className="flex items-start gap-2 text-sm p-3 border border-sky-500/40 bg-sky-500/5 rounded">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-sky-600" />
                <div>
                  <p className="font-medium text-sky-700 dark:text-sky-400">{t("allSelfPageTitle")}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{t("allSelfPageHint")}</p>
                </div>
              </div>
            )}

            {audited.length > 0 && (
              <div className="max-h-60 overflow-y-auto border rounded text-xs font-mono">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">id</th>
                      <th className="text-left p-2">tenant</th>
                      <th className="text-left p-2">name</th>
                      <th className="text-left p-2">db</th>
                      <th className="text-left p-2">meta</th>
                      <th className="text-left p-2">status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audited.map((a) => {
                      const isSelfPage = a.reason === "self_page";
                      const isSelfPageCorrupted = a.reason === "self_page_corrupted";
                      const rowClass = a.divergent
                        ? "bg-amber-500/10"
                        : isSelfPage
                          ? "bg-sky-500/5"
                          : "";
                      return (
                        <tr key={a.id} className={rowClass}>
                          <td className="p-2">{a.id}</td>
                          <td className="p-2">{a.tenantId}</td>
                          <td className="p-2 break-all">{a.name}</td>
                          <td className="p-2 break-all">{a.dbPk}</td>
                          <td className="p-2 break-all">{isSelfPage ? "—" : (a.metaPk || "—")}</td>
                          <td className="p-2">
                            {isSelfPageCorrupted ? (
                              <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">
                                {t("statusSelfPageCorrupted")}
                              </Badge>
                            ) : a.divergent ? (
                              <Badge variant="default">{t("statusDivergent")}</Badge>
                            ) : isSelfPage ? (
                              <Badge variant="outline" className="border-sky-500/60 text-sky-700 dark:text-sky-400">
                                {t("statusSelfPage")}
                              </Badge>
                            ) : a.metaPk ? (
                              <Badge variant="outline">{t("statusOk")}</Badge>
                            ) : (
                              <Badge variant="secondary">{t("statusNotFound")}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {isSuperadmin && (
              <div className="space-y-2 border rounded p-3">
                <Label className="flex items-center gap-1 text-sm">
                  <Wrench className="h-3.5 w-3.5" />
                  {t("manualSectionTitle")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("manualSectionHint")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={t("manualContactIdPlaceholder")}
                    value={manualContactId}
                    onChange={(e) => setManualContactId(e.target.value)}
                  />
                  <Input
                    placeholder={t("manualPkPlaceholder")}
                    value={manualPk}
                    onChange={(e) => setManualPk(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={runManual} disabled={manualBusy || !manualContactId || !manualPk}>
                  {manualBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("manualApplyButton")}
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t("close")}
              </Button>
              <Button onClick={runApplyAll} disabled={divergentCount === 0}>
                {t("applyAllButton", { count: divergentCount })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "applying" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("applyingHint")}</p>
          </div>
        )}

        {step === "result" && applyResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 border rounded bg-green-500/10">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">{t("resultTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("resultSummary", {
                    corrected: applyResult.corrected,
                    skipped: applyResult.skipped,
                    total: applyResult.total,
                  })}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>{t("close")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
