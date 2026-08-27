"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, ExternalLink, Globe, KeyRound, LogIn, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchLicenseStatus,
  recheckLicense,
  recoverLicense,
  recoverLicenseDomain,
} from "@/services/license";
import { loginService } from "@/services/auth";
import type { AxiosError } from "axios";

// F5 — os dominios da licenca passaram a ser geridos no Painel do Licenciado.
const LICENSE_PANEL_URL = process.env.NEXT_PUBLIC_LICENSE_PANEL_URL || "https://painel.zdg.com.br";

/** "https://api.exemplo.com:3101/x" -> "api.exemplo.com" (host puro, como a licenca guarda). */
function hostOf(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

/** `licensed_domains` chega ora como array, ora como CSV — normaliza os dois. */
function toDomainList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((v) => String(v))
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const domain = item.trim();
    if (domain && !out.some((d) => d.toLowerCase() === domain.toLowerCase())) out.push(domain);
  }
  return out;
}

/** Fallback do endereco deste servidor quando o backend nao informa o BACKEND_URL. */
const API_HOST_FALLBACK = hostOf(process.env.NEXT_PUBLIC_API_URL || "");

type Reason =
  | "is_blocked"
  | "status_false"
  | "domain_mismatch"
  | "heartbeat_failed"
  | null;

const reasonKey: Record<Exclude<Reason, null>, string> = {
  is_blocked: "reason.isBlocked",
  status_false: "reason.statusFalse",
  domain_mismatch: "reason.domainMismatch",
  heartbeat_failed: "reason.heartbeatFailed",
};

function readToken(): string | null {
  try {
    const raw = localStorage.getItem("token");
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

function readProfile(): { profile?: string; tenantId?: number } {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return {};
    const u = JSON.parse(raw) as { profile?: string; tenantId?: number };
    return { profile: u.profile, tenantId: u.tenantId };
  } catch {
    return {};
  }
}

export default function LicenseRecoveryPage() {
  const t = useTranslations("licenseRecovery");

  const [recovery, setRecovery] = useState<boolean | null>(null);
  const [reason, setReason] = useState<Reason>(null);
  // Bloqueio pelo ENDERECO desta instalacao (quem administra a licenca recusou este
  // dominio). Chega em campo proprio para nao quebrar front antigo; aqui muda a
  // mensagem e, principalmente, oferece o caminho de saida — sem isso a tela so
  // pede "informe outra chave", que nao resolve nada neste caso.
  const [blockedReason, setBlockedReason] = useState<"domain" | "domain_enforced" | null>(null);

  const [hasToken, setHasToken] = useState<boolean>(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  // Chegou pelo atalho do toast de INVALID_DOMAIN na tela de login. Existe porque
  // a recusa por dominio no login NAO implica servidor em recuperacao: quando
  // BACKEND_URL nao esta setado, /license/status responde recovery:false e a tela
  // diria "a licenca esta valida", que e o oposto do que o cliente precisa ouvir.
  // Lido de window.location.search (e nao de useSearchParams) para nao exigir
  // fronteira de Suspense nem forcar bailout de renderizacao estatica no build.
  const [fromLoginDomain, setFromLoginDomain] = useState<boolean>(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [licenseCode, setLicenseCode] = useState("");

  // Correcao de dominio NESTA tela (POST /license/recover-domain, allowlistado no
  // modo de recuperacao). A tela so instrui a usar o painel quando o servidor de
  // licenca RECUSA a alteracao (ERR_DOMAINS_LOCKED_PANEL_ONLY) — antes disso ela
  // assumia que toda licenca era gerida pelo painel, o que prendia no painel quem
  // nunca ativou essa trava.
  const [licensedDomains, setLicensedDomains] = useState<string[] | null>(null);
  const [backendHost, setBackendHost] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  // Quem administra mais de uma licenca pode ter posto a chave da instalacao A na
  // instalacao B: o erro e identico ao de "falta cadastrar o dominio". Mostrar a
  // chave mascarada + os dominios que ELA autoriza + o endereco deste servidor e o
  // que separa os dois casos na hora — e por isso o form de chave tambem aparece aqui.
  const [licenseMasked, setLicenseMasked] = useState<string | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  // A identificação da licença é buscada uma única vez por sessão desta tela.
  const [discoveryDone, setDiscoveryDone] = useState(false);
  // Remover um dominio da lista pode derrubar OUTRA instalacao da mesma licenca (o
  // servidor de licenca reescreve o CSV inteiro e nao valida isso): exigimos um
  // segundo clique quando a lista informada tira algum dominio que existe hoje.
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  // Recusa do servidor de licenca: dominios desta licenca so mudam pelo painel.
  const [panelOnly, setPanelOnly] = useState(false);
  const [panelOnlyMessage, setPanelOnlyMessage] = useState<string | null>(null);

  const [loginLoading, setLoginLoading] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Aviso neutro (nem erro nem sucesso): usado quando o servidor desta instalacao
  // ainda nao tem a verificacao imediata.
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setFromLoginDomain(params.get("from") === "login" && params.get("reason") === "domain");
    } catch {
      setFromLoginDomain(false);
    }

    const token = readToken();
    setHasToken(!!token);
    if (token) {
      const { profile, tenantId } = readProfile();
      setIsAuthorized(profile === "superadmin" && Number(tenantId) === 1);
    }

    fetchLicenseStatus()
      .then(({ data }) => {
        setRecovery(data.recovery);
        setReason(data.reason);
        setBlockedReason(data.blockedReason ?? null);
      })
      .catch(() => {
        setRecovery(null);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginLoading(true);
    try {
      const { data } = await loginService({ email, password });
      if ("requiresA2F" in data) {
        setError(t("a2fNotSupported"));
        return;
      }
      if (data.profile !== "superadmin" || Number(data.tenantId) !== 1) {
        setError(t("onlySuperadmin"));
        return;
      }
      localStorage.setItem("token", JSON.stringify(data.token));
      localStorage.setItem(
        "user",
        JSON.stringify({
          userId: data.userId,
          username: data.username,
          email: data.email,
          profile: data.profile,
          tenantId: data.tenantId,
        })
      );
      setHasToken(true);
      setIsAuthorized(true);
    } catch (err) {
      const ax = err as AxiosError<{ error?: string }> & { data?: { error?: string } };
      setError(ax?.data?.error || ax?.response?.data?.error || t("loginFailed"));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setRecoverLoading(true);
    try {
      await recoverLicense(licenseCode.trim());
      setSuccess(t("recoverSuccess"));
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    } catch (err) {
      const ax = err as AxiosError<{ error?: string; licensedDomains?: string[] }> & {
        data?: { error?: string; licensedDomains?: string[] };
      };
      const detail = ax?.data || ax?.response?.data;
      const code = detail?.error || "ERR_UNKNOWN";
      // A chave recusada por domínio devolve os domínios QUE ELA autoriza: mostrar
      // isso na mensagem é o que revela "esta é a chave da outra instalação".
      const rejectedDomains = toDomainList(detail?.licensedDomains);
      const domainMismatchMessage = !rejectedDomains.length
        ? t("errors.keyDomainMismatch")
        : targetHost
          ? t("errors.keyAuthorizesOthers", { domains: rejectedDomains.join(", "), host: targetHost })
          : t("errors.keyAuthorizesOthersNoHost", { domains: rejectedDomains.join(", ") });
      const map: Record<string, string> = {
        ERR_INVALID_LICENSE_CODE: t("errors.invalidLicenseCode"),
        ERR_LICENSE_SERVER_UNREACHABLE: t("errors.serverUnreachable"),
        ERR_LICENSE_SIGNATURE_INVALID: t("errors.signatureInvalid"),
        ERR_LICENSE_STATUS_FALSE: t("errors.keyInactive"),
        ERR_LICENSE_IS_BLOCKED: t("errors.keyBlocked"),
        ERR_LICENSE_DOMAIN_MISMATCH: domainMismatchMessage,
        ERR_NO_PERMISSION: t("errors.noPermissionUpdate"),
        ERR_AUTH_INVALID_TOKEN: t("errors.invalidSession"),
        ERR_LIMIT_MAX: t("errors.rateLimited"),
      };
      setError(map[code] || t("errors.recoverFailed", { code }));
    } finally {
      setRecoverLoading(false);
    }
  };

  // Guarda o que a licença tem hoje: a lista da licença é REESCRITA INTEIRA a cada
  // gravação, então o campo precisa nascer com os domínios atuais (e não vazio) —
  // digitar do zero apagaria o domínio das outras instalações da mesma licença.
  const applyDomainDetail = useCallback(
    (
      detail:
        | { licensedDomains?: unknown; backendUrl?: string; licenseCodeMasked?: string }
        | undefined
    ) => {
      const list = toDomainList(detail?.licensedDomains);
      setLicensedDomains(list);
      setDomainInput((current) => (current.trim() ? current : list.join(", ")));
      const host = detail?.backendUrl ? hostOf(detail.backendUrl) : "";
      if (host) setBackendHost(host);
      if (detail?.licenseCodeMasked) setLicenseMasked(detail.licenseCodeMasked);
    },
    []
  );

  // Descoberta silenciosa (1×): o /license/recheck devolve, no erro de domínio, a
  // chave mascarada, a lista atual da licença e o endereço deste servidor — é o que
  // identifica a licença e preenche o formulário abaixo. Se a licença já estiver
  // válida, ele encerra a recuperação. Backend antigo (sem a rota) ou qualquer outra
  // falha: segue sem preencher, o formulário continua utilizável.
  useEffect(() => {
    if (discoveryDone || reason !== "domain_mismatch" || !isAuthorized) return;
    // Marca ANTES da chamada: qualquer re-render (inclusive troca de idioma) não
    // pode disparar uma segunda verificação — o limite da rota é 10 por 5 minutos.
    setDiscoveryDone(true);
    let cancelled = false;
    recheckLicense()
      .then(({ data }) => {
        if (cancelled) return;
        setSuccess(t("recheckSuccess"));
        applyDomainDetail({
          licensedDomains: data?.licensedDomains,
          licenseCodeMasked: data?.licenseCodeMasked,
        });
        setTimeout(() => {
          window.location.href = "/";
        }, 2500);
      })
      .catch((err) => {
        if (cancelled) return;
        type DetailBody = {
          error?: string;
          licensedDomains?: unknown;
          backendUrl?: string;
          licenseCodeMasked?: string;
        };
        const ax = err as AxiosError<DetailBody> & { data?: DetailBody };
        const detail = ax?.data || ax?.response?.data;
        if (detail?.error === "ERR_LICENSE_DOMAIN_MISMATCH") {
          applyDomainDetail(detail);
          return;
        }
        // Sem lista conhecida: marca como "já perguntamos" para não repetir a chamada.
        setLicensedDomains([]);
        if (detail?.licenseCodeMasked) setLicenseMasked(detail.licenseCodeMasked);
      });
    return () => {
      cancelled = true;
    };
  }, [reason, isAuthorized, discoveryDone, applyDomainDetail, t]);

  const parsedDomains = toDomainList(domainInput);
  const removedDomains = (licensedDomains ?? []).filter(
    (d) => !parsedDomains.some((p) => p.toLowerCase() === d.toLowerCase())
  );
  // Endereço que a licença precisa cobrir. Vem do servidor (BACKEND_URL real); se
  // ele não respondeu, cai no endereço de API que este front usa — que é o mesmo
  // valor em instalação normal e serve para orientar o cliente.
  const targetHost = backendHost || API_HOST_FALLBACK || null;
  const coversHost = (domains: string[]): boolean =>
    !targetHost ||
    domains.some((d) => {
      const clean = hostOf(d);
      return clean && (targetHost === clean || targetHost.endsWith(`.${clean}`));
    });
  // A licença configurada HOJE autoriza este servidor? Falso = ou falta cadastrar o
  // domínio, ou esta instalação está com a chave de outra.
  const licenseCoversHost = licensedDomains !== null && coversHost(licensedDomains);
  const backendCovered = coversHost(parsedDomains);

  const setDomains = (value: string) => {
    setDomainInput(value);
    setConfirmRemoval(false);
  };

  // Corrige os domínios daqui mesmo. O servidor de licença continua sendo a
  // autoridade: se a licença for gerida pelo painel, ele recusa e só então a tela
  // passa a instruir o painel.
  const handleSaveDomains = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInfo(null);

    const domains = parsedDomains;
    if (domains.length === 0) {
      setError(t("errors.atLeastOneDomain"));
      return;
    }
    if (removedDomains.length > 0 && !confirmRemoval) {
      setConfirmRemoval(true);
      return;
    }

    setDomainLoading(true);
    try {
      await recoverLicenseDomain(domains);
      setSuccess(t("domainsSuccess"));
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    } catch (err) {
      const ax = err as AxiosError<{ error?: string; message?: string; backendUrl?: string }> & {
        status?: number;
        data?: { error?: string; message?: string; backendUrl?: string };
      };
      const status = ax?.status ?? ax?.response?.status;
      const detail = ax?.data || ax?.response?.data;
      const code = detail?.error || "ERR_UNKNOWN";

      // Recusa do servidor de licença: esta licença é gerida no painel. É AQUI que
      // a tela passa a mandar o cliente para lá — nunca por suposição.
      if (code === "ERR_DOMAINS_LOCKED_PANEL_ONLY") {
        setPanelOnly(true);
        setPanelOnlyMessage(detail?.message || null);
        return;
      }
      // Servidor desta instalação sem a rota de correção de domínio.
      if (status === 404 || status === 405 || status === 501) {
        setPanelOnly(true);
        setPanelOnlyMessage(null);
        setInfo(t("domainFixNotAvailable"));
        return;
      }

      const map: Record<string, string> = {
        ERR_DOMAIN_IN_USE_BY_OTHER_INSTALL: t("errors.domainInUseOther"),
        ERR_NO_DOMAINS_INFORMATION: t("errors.atLeastOneDomain"),
        ERR_INVALID_DOMAIN: t("errors.invalidDomain"),
        ERR_LICENSE_NOT_CONFIGURED: t("errors.licenseNotConfigured"),
        ERR_LICENSE_SERVER_UNREACHABLE: t("errors.serverUnreachable"),
        ERR_LICENSE_SERVER_INVALID_RESPONSE: t("errors.serverInvalidResponse"),
        ERR_LICENSE_SIGNATURE_INVALID: t("errors.signatureInvalid"),
        ERR_LICENSE_STATUS_FALSE: t("errors.keyInactive"),
        ERR_LICENSE_IS_BLOCKED: t("errors.keyBlocked"),
        ERR_LICENSE_DOMAIN_MISMATCH: detail?.backendUrl
          ? t("errors.savedDomainsStillMismatchWithUrl", { url: detail.backendUrl })
          : t("errors.savedDomainsStillMismatch"),
        ERR_NO_PERMISSION: t("errors.noPermissionDomains"),
        ERR_AUTH_TOKEN_MISSING: t("errors.invalidSession"),
        ERR_AUTH_INVALID_TOKEN: t("errors.invalidSession"),
        ERR_LIMIT_MAX: t("errors.rateLimited"),
      };
      setError(map[code] || detail?.message || t("errors.saveDomainsFailed", { code }));
    } finally {
      setDomainLoading(false);
      setConfirmRemoval(false);
    }
  };

  // F5 — depois de ajustar os domínios (aqui ou no Painel do Licenciado), revalida
  // a licença na hora em vez de esperar o ciclo automático (~10 min).
  const handleRecheck = async () => {
    setError(null);
    setSuccess(null);
    setInfo(null);
    setRecheckLoading(true);
    try {
      await recheckLicense();
      setSuccess(t("recheckSuccess"));
      setTimeout(() => {
        window.location.href = "/";
      }, 2500);
    } catch (err) {
      type RecheckErrorBody = {
        error?: string;
        code?: string;
        backendUrl?: string;
        licensedDomains?: unknown;
        licenseCodeMasked?: string;
      };
      const ax = err as AxiosError<RecheckErrorBody> & {
        status?: number;
        data?: RecheckErrorBody;
      };
      const status = ax?.status ?? ax?.response?.status;
      const detail = ax?.data || ax?.response?.data;
      const code = detail?.error || detail?.code || "ERR_UNKNOWN";

      // Continua sem cobrir o domínio: aproveita a resposta para manter a
      // identificação e o formulário em dia com o que a licença tem AGORA (o
      // licenciado pode ter mexido nos domínios entre uma tentativa e outra).
      if (code === "ERR_LICENSE_DOMAIN_MISMATCH") {
        applyDomainDetail(detail);
      }

      // Servidor desta instalação ainda não tem a verificação imediata: a rota não
      // existe (404/405/501) ou é barrada pelo bloqueio de licença por não estar na
      // lista de exceções da versão antiga (402 LICENSE_BLOCKED). Nunca é erro do
      // usuário — avisamos que a verificação automática resolve em alguns minutos.
      const notAvailableHere =
        status === 404 || status === 405 || status === 501 || code === "LICENSE_BLOCKED";
      if (notAvailableHere) {
        setInfo(t("recheckNotAvailable"));
        return;
      }

      const map: Record<string, string> = {
        ERR_LICENSE_NOT_CONFIGURED: t("errors.licenseNotConfigured"),
        ERR_LICENSE_SERVER_UNREACHABLE: t("errors.serverUnreachable"),
        ERR_LICENSE_SERVER_INVALID_RESPONSE: t("errors.serverInvalidResponse"),
        ERR_LICENSE_SIGNATURE_INVALID: t("errors.signatureInvalid"),
        ERR_LICENSE_STATUS_FALSE: t("errors.currentLicenseInactive"),
        ERR_LICENSE_IS_BLOCKED: t("errors.currentLicenseBlocked"),
        ERR_LICENSE_DOMAIN_MISMATCH: detail?.backendUrl
          ? t("errors.recheckDomainMismatchWithUrl", { url: detail.backendUrl })
          : t("errors.recheckDomainMismatch"),
        ERR_NO_PERMISSION: t("errors.noPermissionRecheck"),
        ERR_AUTH_TOKEN_MISSING: t("errors.invalidSession"),
        ERR_AUTH_INVALID_TOKEN: t("errors.invalidSession"),
        ERR_LIMIT_MAX: t("errors.rateLimited"),
      };
      setError(map[code] || t("errors.recheckFailed"));
    } finally {
      setRecheckLoading(false);
    }
  };

  const handleLogoutLocal = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setHasToken(false);
    setIsAuthorized(false);
  };

  // Recusa por dominio no login COM o servidor fora de recuperacao: caso que o
  // fluxo padrao desta tela nao cobre (ele assume instalacao bloqueada). Se o
  // servidor estiver mesmo bloqueado (recovery === true), nada muda aqui.
  const showLoginDomainHelp = fromLoginDomain && recovery !== true;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 px-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl font-bold">{t("title")}</CardTitle>
          <CardDescription>
            {showLoginDomainHelp ? (
              t("loginDomain.description")
            ) : (
              <>
                {recovery === null && t("checkingStatus")}
                {recovery === false && t("licenseValid")}
                {/* Bloqueio por endereco tem causa e solucao proprias: dizer
                    "licenca bloqueada" mandaria o cliente para o financeiro. */}
                {recovery === true && blockedReason && t("reason.domainBlocked")}
                {recovery === true && !blockedReason && reason && t(reasonKey[reason])}
                {recovery === true && !blockedReason && !reason && t("blockedGeneric")}
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {showLoginDomainHelp ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-2">{t("loginDomain.intro")}</p>
                <p className="mb-2">
                  <strong className="text-foreground">{t("loginDomain.cause1Title")}</strong>{" "}
                  {t("loginDomain.cause1Text")}
                </p>
                <p>
                  <strong className="text-foreground">{t("loginDomain.cause2Title")}</strong>{" "}
                  {t.rich("loginDomain.cause2Text", {
                    code: (chunks) => (
                      <code className="rounded bg-background px-1 py-0.5">{chunks}</code>
                    ),
                  })}
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <a href={LICENSE_PANEL_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> {t("openPanel")}
                </a>
              </Button>
              <Button type="button" className="w-full" onClick={() => (window.location.href = "/login")}>
                <LogIn className="h-4 w-4" /> {t("backToLogin")}
              </Button>
            </div>
          ) : recovery === false ? (
            <Button className="w-full" onClick={() => (window.location.href = "/")}>
              {t("backToSystem")}
            </Button>
          ) : !hasToken ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-xs text-muted-foreground text-center">{t("loginHint")}</p>
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" className="w-full" loading={loginLoading}>
                <LogIn className="h-4 w-4" /> {t("signIn")}
              </Button>
            </form>
          ) : !isAuthorized ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{t("noPermissionCard")}</span>
              </div>
              <Button variant="outline" className="w-full" onClick={handleLogoutLocal}>
                {t("logoutTryAnother")}
              </Button>
            </div>
          ) : reason === "domain_mismatch" ? (
            /* Erro de domínio: a tela identifica QUAL chave está aqui e quais domínios
               ela autoriza (é o que separa "falta cadastrar o domínio" de "esta
               instalação está com a chave de outra"), e oferece os dois caminhos de
               correção. O Painel do Licenciado deixa de ser imposto: só vira o único
               caminho quando o servidor de licença recusa a alteração. */
            <div className="space-y-4">
              <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {licenseMasked && (
                  <p className="flex flex-wrap items-baseline gap-1">
                    <span>{t("currentKeyLabel")}</span>
                    <code className="rounded bg-background px-1 py-0.5 font-mono text-foreground break-all">
                      {licenseMasked}
                    </code>
                  </p>
                )}
                {licensedDomains && licensedDomains.length > 0 && (
                  <p className="flex flex-wrap items-baseline gap-1">
                    <span>{t("authorizedDomainsLabel")}</span>
                    <strong className="text-foreground break-all">{licensedDomains.join(", ")}</strong>
                  </p>
                )}
                {targetHost && (
                  <p className="flex flex-wrap items-baseline gap-1">
                    <span>{t("serverAddressLabel")}</span>
                    <strong className="text-foreground break-all">{targetHost}</strong>
                  </p>
                )}
                {/* Só com a lista REAL em mãos a dica faz sentido: ela manda comparar
                    valores que precisam estar na tela. */}
                {licensedDomains !== null && licensedDomains.length > 0 && !licenseCoversHost && (
                  <p className="pt-1">{t("multiLicenseHint")}</p>
                )}
              </div>

              {panelOnly ? (
                <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  {panelOnlyMessage || t("panelOnlyDefault")}
                </div>
              ) : (
                <form onSubmit={handleSaveDomains} className="space-y-2">
                  <Label htmlFor="domains">{t("domainsLabel")}</Label>
                  <Input
                    id="domains"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("domainsPlaceholder")}
                    value={domainInput}
                    onChange={(e) => setDomains(e.target.value)}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("domainsHelp")}
                  </p>
                  {targetHost && !backendCovered && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setDomains(
                          parsedDomains.length ? `${parsedDomains.join(", ")}, ${targetHost}` : targetHost
                        )
                      }
                    >
                      <Globe className="h-4 w-4" /> {t("includeHost", { host: targetHost })}
                    </Button>
                  )}
                  {removedDomains.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                      {t("removalWarning", { domains: removedDomains.join(", ") })}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    loading={domainLoading}
                    disabled={parsedDomains.length === 0}
                  >
                    <Globe className="h-4 w-4" />
                    {confirmRemoval ? t("confirmSaveDomains") : t("saveDomains")}
                  </Button>
                </form>
              )}

              {showKeyForm ? (
                <form onSubmit={handleRecover} className="space-y-2 border-t pt-4">
                  <Label htmlFor="licenseCodeDomain">{t("keyLabel")}</Label>
                  <Input
                    id="licenseCodeDomain"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t("keyPlaceholder")}
                    value={licenseCode}
                    onChange={(e) => setLicenseCode(e.target.value)}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("keyHelpDomain")}
                  </p>
                  <Button
                    type="submit"
                    className="w-full"
                    loading={recoverLoading}
                    disabled={licenseCode.trim().length < 8}
                  >
                    <KeyRound className="h-4 w-4" /> {t("updateAndRestore")}
                  </Button>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={() => setShowKeyForm(true)}
                >
                  <KeyRound className="h-4 w-4" /> {t("useAnotherKey")}
                </Button>
              )}

              <Button asChild variant="outline" className="w-full">
                <a href={LICENSE_PANEL_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> {t("openPanel")}
                </a>
              </Button>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                  {info}
                </div>
              )}
              {success && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs text-emerald-600 dark:text-emerald-400">
                  {success}
                </div>
              )}
              <Button type="button" className="w-full" loading={recheckLoading} onClick={handleRecheck}>
                <RefreshCw className="h-4 w-4" /> {t("recheck")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRecover} className="space-y-4">
              {/* Bloqueio por endereco: quem resolve e quem administra a licenca,
                  no painel dela — trocar a chave aqui nao adianta, porque o
                  bloqueio e do ENDERECO, nao da chave. Sem este bloco a tela era
                  um beco sem saida: pedia uma chave nova e recusava todas. */}
              {blockedReason && (
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <p className="mb-2">
                      {blockedReason === "domain_enforced"
                        ? t("domainBlocked.introEnforced")
                        : t("domainBlocked.intro")}
                    </p>
                    {targetHost && (
                      <p className="flex flex-wrap items-baseline gap-1">
                        <span>{t("serverAddressLabel")}</span>
                        <strong className="text-foreground break-all">{targetHost}</strong>
                      </p>
                    )}
                    <p className="pt-2">{t("domainBlocked.whatToDo")}</p>
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <a href={LICENSE_PANEL_URL} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" /> {t("openPanel")}
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    loading={recheckLoading}
                    onClick={handleRecheck}
                  >
                    <RefreshCw className="h-4 w-4" /> {t("recheck")}
                  </Button>
                  {info && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                      {info}
                    </div>
                  )}
                  <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {t("domainBlocked.keyHint")}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="licenseCode">{t("keyLabel")}</Label>
                <Input
                  id="licenseCode"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("keyPlaceholder")}
                  value={licenseCode}
                  onChange={(e) => setLicenseCode(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs text-emerald-600 dark:text-emerald-400">
                  {success}
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                loading={recoverLoading}
                disabled={licenseCode.trim().length < 8}
              >
                <KeyRound className="h-4 w-4" /> {t("updateAndRestore")}
              </Button>
            </form>
          )}
        </CardContent>

        {hasToken && isAuthorized && (
          <CardFooter className="justify-center pt-0">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-primary hover:underline"
              onClick={handleLogoutLocal}
            >
              {t("logoutSession")}
            </button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
