"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Server,
  Link2Off,
  PhoneOff,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

interface PreviewData {
  phoneNumberId: string;
  displayPhoneNumber: string;
  type: string;
  ownApp: boolean;
  banned: boolean;
  phoneStatus?: string | null;
  qualityRating?: string | null;
  tenantId: number;
  tenantName?: string | null;
  clientEmailMasked?: string | null;
  hasEmailOnFile: boolean;
  willDeregister: boolean;
  willDisassociate: boolean;
  // Número em OUTRA instalação da mesma licença: remove só do monitor central (proxy).
  remoteOnly?: boolean;
}

interface StepResult {
  ok: boolean;
  skipped?: string;
  apiOk?: boolean;
  error?: string;
}

interface DeleteResult {
  ok: boolean;
  alreadyDeleted?: boolean;
  remoteForget?: boolean;
  ownApp: boolean;
  steps: {
    deregister?: StepResult;
    disassociate?: StepResult;
    healthRowCleaned: boolean;
    snapshotForgotten: StepResult;
    localDeleted: boolean;
  };
}

const ERR_MAP: Record<string, string> = {
  ERR_EMAIL_MISMATCH: "errEmailMismatch",
  ERR_LICENSE_NO_EMAIL: "errNoEmail",
  ERR_LICENSE_NOT_CONFIGURED: "errNoEmail",
  ERR_CHANNEL_NOT_BANNED: "errNotBanned",
  ERR_CONFIRM_TEXT: "errConfirmText",
  ERR_CONSENT_REQUIRED: "errConsent",
  ERR_CHANNEL_NOT_FOUND: "errNotFound",
  ERR_NO_PERMISSION: "errNoPermission",
};

function extractErr(err: any): string {
  return err?.response?.data?.error || err?.data?.error || "generic";
}

export function DeleteBannedChannelDialog({
  open,
  onOpenChange,
  phoneNumberId,
  displayPhoneNumber,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneNumberId: string | null;
  displayPhoneNumber?: string | null;
  onDeleted?: () => void;
}) {
  const t = useTranslations("metaHealth.deleteBanned");
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [accDisclosure, setAccDisclosure] = useState(false);
  const [accOwner, setAccOwner] = useState(false);
  const [accIrrev, setAccIrrev] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DeleteResult | null>(null);

  useEffect(() => {
    if (!open || !phoneNumberId) return;
    setStep(1);
    setEmail("");
    setConfirmText("");
    setAccDisclosure(false);
    setAccOwner(false);
    setAccIrrev(false);
    setResult(null);
    setPreview(null);
    setPreviewError(null);
    setLoadingPreview(true);
    api
      .get("/meta/banned-channel/preview", { params: { phoneNumberId } })
      .then((r) => setPreview(r.data))
      .catch((err) => setPreviewError(extractErr(err)))
      .finally(() => setLoadingPreview(false));
  }, [open, phoneNumberId]);

  const display = preview?.displayPhoneNumber || displayPhoneNumber || phoneNumberId || "";

  async function handleSubmit() {
    if (!phoneNumberId) return;
    setSubmitting(true);
    try {
      const r = await api.post("/meta/banned-channel/delete", {
        phoneNumberId,
        confirmEmail: email.trim(),
        confirmText: confirmText.trim(),
        acceptDisclosure: accDisclosure,
        acceptOwner: accOwner,
        acceptIrreversible: accIrrev,
      });
      setResult(r.data as DeleteResult);
      setStep(4);
      onDeleted?.();
    } catch (err: any) {
      const code = extractErr(err);
      toast.error(t(ERR_MAP[code] || "errGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  function StepIcon({ s }: { s: StepResult | boolean }) {
    const ok = typeof s === "boolean" ? s : s.ok;
    const skipped = typeof s === "boolean" ? false : Boolean(s.skipped) && s.apiOk === undefined && !s.error;
    if (skipped) return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
    if (typeof s !== "boolean" && s.apiOk === false)
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return ok ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  }

  function resultLabel(s: StepResult): string {
    if (s.skipped && s.apiOk === undefined && !s.error) return t("s4Skipped");
    if (s.apiOk === false) return t("s4Failed");
    return t("s4Done");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("channelLabel")}: <span className="font-mono">{display}</span>
            {step < 4 && <> · {t("stepOf", { step })}</>}
          </DialogDescription>
        </DialogHeader>

        {loadingPreview && <Skeleton className="h-40 w-full" />}

        {!loadingPreview && previewError && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300">
            {previewError === "ERR_CHANNEL_NOT_FOUND" ? t("otherInstall") : t("previewError")}
          </div>
        )}

        {!loadingPreview && !previewError && preview && (
          <div className="space-y-4 text-sm">
            {/* STEP 1 — Disclosure + reversibilidade */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="font-medium">{t("s1Title")}</p>
                <p className="text-xs text-muted-foreground">{t("s1Intro")}</p>

                <div className="space-y-2">
                  {preview.remoteOnly ? (
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-2.5">
                      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs text-blue-900 dark:text-blue-200">{t("s1Remote")}</p>
                        <Badge variant="secondary" className="text-[10px]">{t("s1RemoteRev")}</Badge>
                      </div>
                    </div>
                  ) : (
                  <div className="flex items-start gap-2 rounded-md border p-2.5">
                    <Server className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
                    <div className="flex-1 space-y-1">
                      <p>{t("s1Local")}</p>
                      <Badge variant="destructive" className="text-[10px]">{t("s1LocalRev")}</Badge>
                    </div>
                  </div>
                  )}

                  {preview.willDisassociate && (
                    <div className="flex items-start gap-2 rounded-md border p-2.5">
                      <Link2Off className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                      <div className="flex-1 space-y-1">
                        <p>{t("s1Bm")}</p>
                        <Badge variant="secondary" className="text-[10px]">{t("s1BmRev")}</Badge>
                      </div>
                    </div>
                  )}

                  {preview.willDeregister && (
                    <div className="flex items-start gap-2 rounded-md border p-2.5">
                      <PhoneOff className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                      <div className="flex-1 space-y-1">
                        <p>{t("s1Dereg")}</p>
                        <Badge variant="secondary" className="text-[10px]">{t("s1DeregRev")}</Badge>
                      </div>
                    </div>
                  )}

                  {preview.ownApp && (
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-2.5">
                      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                      <p className="text-xs text-blue-900 dark:text-blue-200">{t("s1OwnApp")}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1.5">
                  <p className="text-xs text-amber-800 dark:text-amber-300">{t("s1NotRemoved")}</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">{t("s1NoUnblock")}</p>
                </div>

                {!preview.banned && (
                  <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-2.5 text-xs text-red-700 dark:text-red-300">
                    {t("errNotBanned")}
                  </div>
                )}

                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={accDisclosure} onCheckedChange={(v) => setAccDisclosure(v === true)} className="mt-0.5" />
                  <span className="text-xs">{t("s1Accept")}</span>
                </label>
              </div>
            )}

            {/* STEP 2 — Titularidade (double-check email) */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="font-medium">{t("s2Title")}</p>
                {preview.hasEmailOnFile ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {t("s2EmailOnFile", { email: preview.clientEmailMasked || "—" })}
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">{t("s2EmailLabel")}</label>
                      <Input
                        type="email"
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox checked={accOwner} onCheckedChange={(v) => setAccOwner(v === true)} className="mt-0.5" />
                      <span className="text-xs">{t("s2Accept")}</span>
                    </label>
                  </>
                ) : (
                  <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300">
                    {t("s2NoEmail")}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3 — Confirmação final */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="font-medium">{t("s3Title")}</p>
                <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-2.5 text-xs text-red-700 dark:text-red-300">
                  {t("s3Warning")}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">{t("s3ConfirmLabel", { number: display })}</label>
                  <Input
                    autoComplete="off"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={display}
                  />
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox checked={accIrrev} onCheckedChange={(v) => setAccIrrev(v === true)} className="mt-0.5" />
                  <span className="text-xs">{t("s3Accept")}</span>
                </label>
              </div>
            )}

            {/* STEP 4 — Resultado */}
            {step === 4 && result && (
              <div className="space-y-3">
                <p className="font-medium">{t("s4Title")}</p>
                <ul className="space-y-1.5 text-xs">
                  {preview.willDeregister && result.steps.deregister && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><StepIcon s={result.steps.deregister} /> {t("s4Deregister")}</span>
                      <span className="text-muted-foreground">{resultLabel(result.steps.deregister)}</span>
                    </li>
                  )}
                  {preview.willDisassociate && result.steps.disassociate && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><StepIcon s={result.steps.disassociate} /> {t("s4Disassociate")}</span>
                      <span className="text-muted-foreground">{resultLabel(result.steps.disassociate)}</span>
                    </li>
                  )}
                  {(!result.remoteForget || result.steps.healthRowCleaned) && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><StepIcon s={result.steps.healthRowCleaned} /> {t("s4HealthRow")}</span>
                      <span className="text-muted-foreground">{result.steps.healthRowCleaned ? t("s4Done") : t("s4Failed")}</span>
                    </li>
                  )}
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><StepIcon s={result.steps.snapshotForgotten} /> {t("s4Snapshot")}</span>
                    <span className="text-muted-foreground">{result.steps.snapshotForgotten.ok ? t("s4Done") : t("s4Failed")}</span>
                  </li>
                  {!result.remoteForget && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><StepIcon s={result.steps.localDeleted} /> {t("s4Local")}</span>
                      <span className="text-muted-foreground">{result.steps.localDeleted ? t("s4Done") : t("s4Failed")}</span>
                    </li>
                  )}
                </ul>

                {result.remoteForget && (
                  <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 p-2.5 text-xs text-green-800 dark:text-green-300">
                    {t("s4RemoteDone")}
                  </div>
                )}

                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                  <p className="text-xs font-semibold">{t("s4ManualTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("s4Manual")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
              <Button
                disabled={!preview || !!previewError || loadingPreview || !accDisclosure}
                onClick={() => setStep(2)}
              >
                {t("next")}
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>{t("back")}</Button>
              <Button
                disabled={!preview?.hasEmailOnFile || !email.trim() || !accOwner}
                onClick={() => setStep(3)}
              >
                {t("next")}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>{t("back")}</Button>
              <Button
                variant="destructive"
                disabled={!confirmText.trim() || !accIrrev || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("deleting")}</>
                ) : (
                  t(preview?.remoteOnly ? "confirmRemote" : "confirmDelete")
                )}
              </Button>
            </>
          )}
          {step === 4 && (
            <Button onClick={() => onOpenChange(false)}>{t("close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
