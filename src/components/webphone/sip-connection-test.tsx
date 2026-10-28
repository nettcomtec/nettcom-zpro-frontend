"use client";

/**
 * Botão "Testar conexão" da Config SIP (/usuarios). O teste roda neste navegador com os
 * dados do formulário, mesmo antes de salvar — ver lib/sip-diagnostics.ts.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Copy,
  Loader2,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  runSipConnectionTest,
  type SipTestConfig,
  type SipTestResult,
  type SipTestStep,
} from "@/lib/sip-diagnostics";
import { checkSipConnectivity, resolveSipHost } from "@/services/users";

const REGISTER_COOLDOWN_MS = 30_000;
const COOLDOWN_STORAGE_KEY = "sipTestLastRegisterAt";
// Toda recusa de REGISTER (senha errada, usuário inventado da sonda, domínio que o
// servidor não atende) pode contar no fail2ban do provedor, que bloqueia a rede inteira
// do escritório. A espera conta do instante em que o REGISTER SAI, fica no módulo
// (fechar e abrir o cadastro não zera) e no navegador (outra aba ou recarregar não zera).
let lastRegisterAt = 0;

const readLastRegisterAt = (): number => {
  try {
    const stored = Number(localStorage.getItem(COOLDOWN_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > lastRegisterAt && stored <= Date.now()) lastRegisterAt = stored;
  } catch {
    /* sem armazenamento: vale só o do módulo */
  }
  return lastRegisterAt;
};

const markRegisterNow = () => {
  lastRegisterAt = Date.now();
  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, String(lastRegisterAt));
  } catch {
    /* ignore */
  }
};

interface SipConnectionTestProps {
  config: SipTestConfig;
  disabled?: boolean;
  /** Os dados do formulário ainda não são os salvos: o WebPhone usa os salvos. */
  unsaved?: boolean;
  onUseDomain?: (domain: string) => void;
}

export function SipConnectionTest({ config, disabled, unsaved, onUseDomain }: SipConnectionTestProps) {
  const t = useTranslations("sipDiagnostics");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<SipTestStep[]>([]);
  const [result, setResult] = useState<SipTestResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const runIdRef = useRef(0);
  const unmountedRef = useRef(false);

  const isUdp = config.transport === "udp";
  const configKey = JSON.stringify([
    config.server,
    config.port,
    config.username,
    config.password,
    config.domain,
    config.transport,
  ]);

  // Dado mudou: o resultado anterior não vale mais (e um teste em curso é abandonado).
  useEffect(() => {
    runIdRef.current += 1;
    setRunning(false);
    setSteps([]);
    setResult(null);
  }, [configKey]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      runIdRef.current += 1;
    };
  }, []);

  const cooldownLeft = Math.max(0, Math.ceil((readLastRegisterAt() + REGISTER_COOLDOWN_MS - now) / 1000));
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (running || disabled || isUdp || cooldownLeft > 0) return;
    const runId = ++runIdRef.current;
    const isCurrent = () => !unmountedRef.current && runIdRef.current === runId;
    setRunning(true);
    setSteps([]);
    setResult(null);
    try {
      const res = await runSipConnectionTest(config, {
        checkConnectivity: checkSipConnectivity,
        resolveHost: resolveSipHost,
        onUpdate: (next) => {
          if (isCurrent()) setSteps(next);
        },
        onRegisterSent: () => {
          markRegisterNow();
          if (!unmountedRef.current) setNow(Date.now());
        },
        isCancelled: () => !isCurrent(),
      });
      if (isCurrent()) {
        setSteps(res.steps);
        setResult(res);
        setNow(Date.now());
      }
    } catch {
      if (isCurrent()) {
        setSteps((prev) => [
          ...prev.filter((s) => s.id !== "connect"),
          { id: "connect", status: "fail", code: "checkUnavailable" },
        ]);
      }
    } finally {
      if (isCurrent()) setRunning(false);
    }
  };

  const stepTitle = (step: SipTestStep) => t(`codes.${step.code}.title`, step.params ?? {});
  const stepHint = (step: SipTestStep) =>
    t.has(`codes.${step.code}.hint`) ? t(`codes.${step.code}.hint`, step.params ?? {}) : "";

  const copyDetails = async () => {
    if (!result) return;
    const transport = config.transport === "ws" ? "ws" : "wss";
    const lines = [
      `${t("copyHeader")} - ${new Date().toISOString()}`,
      `${t("copyServer")}: ${transport}://${config.server.trim()}:${config.port}/ws`,
      `${t("copyUser")}: ${config.username.trim()}`,
      `${t("copyDomain")}: ${(config.domain || "").trim() || config.server.trim()}`,
      "",
      ...result.steps.map((step) => `[${step.status}] ${t(`steps.${step.id}`)}: ${stepTitle(step)}`),
      "",
      result.transcript,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const allOk = !running && steps.length > 0 && steps.every((s) => s.status === "ok");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={start}
          disabled={running || disabled || isUdp || cooldownLeft > 0}
        >
          {running ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Stethoscope className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {running
            ? t("testing")
            : cooldownLeft > 0
              ? t("waitSeconds", { seconds: cooldownLeft })
              : t("testButton")}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={t("help.label")}
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)] max-h-[60vh] space-y-2 overflow-y-auto text-xs"
          >
            <p className="text-sm font-semibold">{t("help.title")}</p>
            <p>{t("help.what")}</p>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              <li>{t("help.alertNoCall")}</li>
              <li>{t("help.alertNoDisrupt")}</li>
              <li>{t("help.alertPassword")}</li>
              <li>{t("help.alertServer")}</li>
              <li>{t("help.alertNetwork")}</li>
            </ul>
          </PopoverContent>
        </Popover>
        {isUdp && <span className="text-xs text-muted-foreground">{t("udpNotSupportedNote")}</span>}
      </div>

      {steps.length > 0 && (
        <div className="space-y-2 rounded-md border p-3" aria-live="polite">
          <ul className="space-y-2.5">
            {steps.map((step) => {
              const hint = stepHint(step);
              return (
                <li key={step.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0">
                    {step.status === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : step.status === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : step.status === "warn" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="break-words">
                      <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`steps.${step.id}`)}
                      </span>
                      <span className="font-medium">{stepTitle(step)}</span>
                    </p>
                    {hint && <p className="break-words text-xs text-muted-foreground">{hint}</p>}
                    {step.code === "domainHintFound" && result?.suggestedDomain && onUseDomain && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-1 h-7"
                        onClick={() => onUseDomain(result.suggestedDomain as string)}
                      >
                        {t("useDomain", { domain: result.suggestedDomain })}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {allOk && <p className="text-xs text-success">{t("summaryOk")}</p>}
          {!running && unsaved && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("unsavedNote")}</span>
            </p>
          )}
          {result && result.transcript && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copyDetails}>
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("copyDetails")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
