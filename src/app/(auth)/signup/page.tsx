"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, User, CreditCard, Mail, Lock, Building, Globe, Moon, Sun, ShieldCheck, CheckCircle2, ExternalLink, Gift, Clock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCountryIso } from "@/lib/region";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { useLocale } from "@/i18n/locale-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useTheme } from "next-themes";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { fetchSignupVariantNovoPublic, type SignupVariantConfig } from "@/services/superadmin";

interface Plan {
  id: number;
  name: string;
  value: number;
  connections: number;
  users: number;
  // O servidor manda texto ("enabled" | "disabled"); boolean fica pelo tipo antigo.
  trial: boolean | string;
  trialPeriod?: number;
  isPublic?: boolean;
}

function formatPlanLabel(plan: Plan, t: (key: string, values?: Record<string, string | number | Date>) => string) {
  return t("planLabelFormat", {
    name: plan.name,
    value: plan.value,
    connections: plan.connections,
    users: plan.users,
    // Comparação exata: "disabled" é texto não vazio (verdadeiro em JS) e o rótulo
    // aparecia em todo plano.
    trial: plan.trial === "enabled" || plan.trial === true ? " | Trial" : "",
  });
}

function validateCpfCnpj(cpfCnpj: string): boolean {
  const v = cpfCnpj.replace(/[^\d]+/g, "");
  if (v.length === 11) {
    if (/^(\d)\1+$/.test(v)) return false;
    let soma = 0;
    for (let i = 1; i <= 9; i++) soma += parseInt(v[i - 1]) * (11 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(v[9])) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(v[i - 1]) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(v[10]);
  }
  if (v.length === 14) {
    let tamanho = v.length - 2;
    let numeros = v.substring(0, tamanho);
    const digitos = v.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos[0])) return false;
    tamanho += 1;
    numeros = v.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado === parseInt(digitos[1]);
  }
  return false;
}

function validatePassword(senha: string): boolean {
  const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};:,.?/|~])[A-Za-z\d!@#$%^&*()_\-+=\[\]{};:,.?/|~]{7,}$/;
  return regex.test(senha);
}

function validateInternationalPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d]+/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

// O PhoneInput devolve só dígitos COM o DDI, sem "+" ("" = vazio). No modo br o
// Asaas espera o celular NACIONAL (sem o 55), como sempre foi; no internacional vai
// "+" + DDI + número. Número sem o 55 no modo br não é brasileiro: sai sem mexer
// (o submit recusa antes de chegar aqui).
function buildSignupPhone(value: string, format: SignupVariantConfig["phoneFormat"]): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (format === "br") return digits.startsWith("55") ? digits.slice(2) : digits;
  return `+${digits}`;
}

const DEFAULT_SIGNUP_CONFIG: SignupVariantConfig = {
  enabled: true,
  documentMode: "br",
  documentRequired: true,
  documentLabel: "",
  phoneFormat: "br",
  phoneRequired: true,
  defaultCountry: "BR",
  skipPaymentGateway: false,
};

// Resultado do cadastro mostrado no próprio cartão ("conta criada"). Os campos além do
// `paymentUrl` são aditivos do backend novo; o antigo manda só a URL e a tela funciona igual.
interface SignupDone {
  paymentUrl?: string;
  accessPendingPayment: boolean;
  trialDays: number;
  /**
   * `authorize` = o link é a autorização da assinatura (Mercado Pago: o cliente cadastra a
   * forma de pagamento e a cobrança sai sozinha, inclusive no fim do teste grátis). Ausente
   * ou `pay` = fatura a pagar, como antes.
   */
  paymentAction: "pay" | "authorize";
}

function parseSignupDone(raw: unknown): SignupDone {
  const res = (raw && typeof raw === "object" ? raw : {}) as {
    paymentUrl?: unknown;
    accessPendingPayment?: unknown;
    trialDays?: unknown;
    paymentAction?: unknown;
  };
  // Só link http(s) vira botão: a URL vem do gateway e entra num <a href>.
  const paymentUrl =
    typeof res.paymentUrl === "string" && /^https?:\/\//i.test(res.paymentUrl.trim())
      ? res.paymentUrl.trim()
      : undefined;
  const trialDays =
    typeof res.trialDays === "number" && Number.isFinite(res.trialDays) && res.trialDays > 0
      ? Math.floor(res.trialDays)
      : 0;
  return {
    paymentUrl,
    accessPendingPayment: res.accessPendingPayment === true,
    trialDays,
    paymentAction: res.paymentAction === "authorize" ? "authorize" : "pay",
  };
}

// Recusas do cadastro com texto próprio (o resto segue o motivo do servidor ou o genérico).
const SIGNUP_ERROR_KEYS: Record<string, string> = {
  ERR_GATEWAY_CUSTOMER_IN_USE: "errGatewayCustomerInUse",
  ERR_PAYMENT_RETURN_URL_MISSING: "errPaymentReturnUrlMissing",
};

// Código cru do servidor (ERR_...) não é texto para quem se cadastra.
const BACKEND_CODE_RE = /^ERR_[A-Z0-9_]+$/;

// Motivo legível da recusa do cadastro: o servidor manda texto em `error` (validações
// próprias) ou o código em `error` e o motivo em `message` (recusa do gateway, dado
// inválido). O interceptor rejeita com o response, então o corpo vem em `err.data`.
function readableSignupError(err: unknown, code: string): string {
  if (code && !BACKEND_CODE_RE.test(code)) return code;
  const e = (err && typeof err === "object" ? err : {}) as {
    data?: { message?: unknown } | null;
    response?: { data?: { message?: unknown } | null } | null;
  };
  for (const message of [e.data?.message, e.response?.data?.message]) {
    if (typeof message === "string" && message.trim() && !BACKEND_CODE_RE.test(message.trim())) {
      return message.trim();
    }
  }
  return "";
}

// Nomes comerciais dos gateways (marca — não traduzível). Espelha payment-config.json (/planos).
const GATEWAY_LABELS: Record<string, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  pagarme: "Pagar.me",
  mercadopago: "Mercado Pago",
};

export default function SignupPage() {
  const t = useTranslations("signup");
  const { locale, setLocale } = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  const isDark = resolvedTheme === "dark";
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const activeLogo = isDark ? logoDarkUrl : logoUrl;
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [lockedPlanId, setLockedPlanId] = useState<number | null>(null);
  const [signupConfig, setSignupConfig] = useState<SignupVariantConfig>(DEFAULT_SIGNUP_CONFIG);
  // Cadastro concluído: o cartão troca para a tela "conta criada".
  const [done, setDone] = useState<SignupDone | null>(null);
  const [form, setForm] = useState({
    name: "",
    cpfCnpj: "",
    email: "",
    mobilePhone: "",
    password: "",
  });

  useEffect(() => {
    fetchSignupVariantNovoPublic()
      .then(({ data }) => { if (data) setSignupConfig(data); })
      .catch(() => { /* mantém defaults */ });
  }, []);

  // Plano travado vindo da pricing pública: /signup?plano=<id> (aceita planId/plan tb).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("plano") || params.get("planId") || params.get("plan");
    const id = raw ? Number(raw) : NaN;
    if (!Number.isNaN(id) && id > 0) setLockedPlanId(id);
  }, []);

  const activeGateway = signupConfig.paymentGateway ?? "asaas";
  const gatewayRequiresBrDoc = activeGateway === "asaas" || activeGateway === "pagarme";

  useEffect(() => {
    // Frontend espelha a lógica do backend (AsaasController): pula gateway quando
    // admin desliga, ou quando gateway exige doc BR mas o signup não está em modo BR.
    const docBlocks = gatewayRequiresBrDoc && signupConfig.documentMode !== "br";
    if (signupConfig.skipPaymentGateway || docBlocks) {
      setPlans([]);
      setSelectedPlan(null);
      return;
    }
    api.get("/plan/").then(({ data }) => {
      // Só planos públicos (a mesma regra da vitrine /precos): o servidor recusa
      // plano oculto no cadastro.
      const raw: unknown = data?.plan || data || [];
      const list: Plan[] = Array.isArray(raw) ? (raw as Plan[]).filter((p) => p.isPublic === true) : [];
      setPlans(list);
      // Plano travado vindo da pricing pública (?plano=<id>): pré-seleciona.
      if (lockedPlanId) {
        const locked = list.find((p) => p.id === lockedPlanId);
        if (locked) setSelectedPlan(locked);
      }
    }).catch(() => {});
  }, [signupConfig.skipPaymentGateway, signupConfig.documentMode, gatewayRequiresBrDoc, lockedPlanId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const showDocument = signupConfig.documentMode !== "hidden";
  const documentRequired = showDocument && signupConfig.documentRequired;
  const isBrDocument = signupConfig.documentMode === "br";
  // Espelha lógica do backend: pula gateway quando admin desliga OU gateway exige BR doc
  // mas o signup está em modo não-BR. Gateways internacionais (stripe/MP) aceitam.
  const docBlocksGateway = gatewayRequiresBrDoc && signupConfig.documentMode !== "br";
  const gatewaySkipped = signupConfig.skipPaymentGateway || docBlocksGateway;
  const planRequired = !gatewaySkipped;

  const documentLabelText = signupConfig.documentLabel.trim() !== ""
    ? signupConfig.documentLabel
    : isBrDocument
      ? t("cpfCnpjLabel")
      : t("documentLabelInternational");

  const documentPlaceholder = isBrDocument
    ? t("cpfCnpjFormatHint")
    : t("documentPlaceholderInternational");

  // País do telefone: modo br = Brasil travado (o payload leva só o número nacional);
  // internacional = país da Região padrão, que o GET público do signup já devolve
  // em `defaultCountry` (sem request novo). O placeholder vem do próprio campo.
  const isBrPhone = signupConfig.phoneFormat === "br";
  const phoneCountry = isBrPhone
    ? "BR"
    : isCountryIso(signupConfig.defaultCountry)
      ? signupConfig.defaultCountry.toUpperCase()
      : "BR";
  const phoneValue = buildSignupPhone(form.mobilePhone, signupConfig.phoneFormat);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast.error(t("errorRequiredFields"));
      return;
    }
    if (documentRequired && !form.cpfCnpj.trim()) {
      toast.error(t("errorRequiredFields"));
      return;
    }
    if (signupConfig.phoneRequired && !phoneValue) {
      toast.error(t("errorRequiredFields"));
      return;
    }
    if (planRequired && !selectedPlan) {
      toast.error(t("errorRequiredFields"));
      return;
    }

    if (showDocument && form.cpfCnpj.trim() !== "" && isBrDocument && !validateCpfCnpj(form.cpfCnpj)) {
      toast.error(t("errorInvalidDocument"));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error(t("errorInvalidEmail"));
      return;
    }

    if (signupConfig.phoneRequired && signupConfig.phoneFormat === "international" && !validateInternationalPhone(form.mobilePhone)) {
      toast.error(t("errorInvalidPhone"));
      return;
    }

    // Modo br: número de outro país (colado com "+…") não pode ir ao gateway como
    // celular brasileiro (A1-12).
    if (isBrPhone && phoneValue && !String(form.mobilePhone).replace(/\D/g, "").startsWith("55")) {
      toast.error(t("errorInvalidPhone"));
      return;
    }

    if (!validatePassword(form.password)) {
      toast.error(t("errorPasswordLength"));
      return;
    }

    setLoading(true);
    try {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + 30);
      const nextDueDate = currentDate.toISOString().split("T")[0];

      const cleanedPhone = phoneValue;

      const basePayload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        mobilePhone: cleanedPhone,
        password: form.password,
        status: "active",
        userName: form.name,
      };

      if (showDocument && form.cpfCnpj.trim() !== "") {
        basePayload.cpfCnpj = form.cpfCnpj;
      }

      if (planRequired && selectedPlan) {
        Object.assign(basePayload, {
          planId: selectedPlan.id,
          maxUsers: selectedPlan.users,
          maxConnections: selectedPlan.connections,
          billingType: "BOLETO",
          value: selectedPlan.value,
          nextDueDate,
          cycle: "MONTHLY",
          trial: selectedPlan.trial,
          trialPeriod: selectedPlan.trialPeriod,
        });
      } else {
        // Modo internacional sem gateway — defaults mínimos pro Tenant
        Object.assign(basePayload, {
          maxUsers: 1,
          maxConnections: 1,
          trial: true,
          trialPeriod: 7,
        });
      }

      const { data: signupRes } = await api.post("/asaas/client", basePayload);
      // Tela "conta criada" no próprio cartão, no lugar de ir direto à fatura na mesma
      // aba: a fatura abre em NOVA aba por link (window.open depois do await é bloqueado
      // no Safari/iOS) e "Acessar o sistema" leva ao login. Vale também para o cadastro
      // sem gateway (sem fatura).
      setDone(parseSignupDone(signupRes));
      setForm((p) => ({ ...p, password: "" }));
    } catch (err: unknown) {
      const errCode = getBackendErrorCode(err);
      // Licenca de empresa unica (ZPRO_1_TENANT): o servidor recusa o autocadastro,
      // porque a nova empresa nunca conseguiria entrar. Mensagem propria em vez do
      // erro generico.
      if (errCode === "ERR_LICENSE_SINGLE_TENANT") {
        toast.error(t("errorSingleTenantLicense"));
        return;
      }
      // Mercado Pago/Pagar.me: e-mail já ligado a outra empresa no gateway, ou a instalação
      // sem o endereço de volta do pagamento. Nenhuma das duas cria nada no gateway.
      const mappedKey = SIGNUP_ERROR_KEYS[errCode];
      if (mappedKey) {
        toast.error(t(mappedKey));
        return;
      }
      toast.error(readableSignupError(err, errCode) || t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md px-4"
    >
      <Card className="border-0 shadow-2xl shadow-black/5">
        <CardHeader className="space-y-2 text-center pb-2">
          <div className="mx-auto flex h-14 w-auto max-w-[200px] items-center justify-center mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLogo}
              alt="Logo"
              className="h-full w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLDivElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl">
              Z
            </div>
          </div>
          {done ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">{t("doneTitle")}</CardTitle>
              <CardDescription>{t("doneDesc")}</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl font-bold">{t("create")}</CardTitle>
              <CardDescription>{t("title")}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              {done.trialDays > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <Gift className="h-4 w-4 shrink-0" />
                  <span>{t("doneTrial", { days: done.trialDays })}</span>
                </div>
              )}
              {done.paymentUrl && (
                <div className="space-y-2">
                  <Button asChild className="w-full">
                    <a href={done.paymentUrl} target="_blank" rel="noopener noreferrer">
                      <CreditCard className="mr-2 h-4 w-4" />
                      {done.paymentAction === "authorize" ? t("doneAuthorize") : t("donePayInvoice")}
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {done.paymentAction === "authorize"
                      ? t("doneAuthorizeNote", { days: done.trialDays })
                      : t("donePayNote")}
                  </p>
                </div>
              )}
              {done.accessPendingPayment && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t("doneAccessPending")}</span>
                </p>
              )}
              <Button asChild variant={done.paymentUrl ? "outline" : "default"} className="w-full">
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  {t("doneAccess")}
                </Link>
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("nameLabel")} *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("namePlaceholder2")} value={form.name} onChange={set("name")} />
              </div>
            </div>

            {showDocument && (
              <div className="space-y-2">
                <Label>{documentLabelText}{documentRequired ? " *" : ""}</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder={documentPlaceholder} value={form.cpfCnpj} onChange={set("cpfCnpj")} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("emailLabel")} *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" type="email" placeholder={t("emailInputPlaceholder")} value={form.email} onChange={set("email")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("phoneLabel")}{signupConfig.phoneRequired ? " *" : ""}</Label>
              <PhoneInput
                value={form.mobilePhone}
                onChange={(v) => setForm((p) => ({ ...p, mobilePhone: v }))}
                defaultCountry={phoneCountry}
                lockCountry={isBrPhone}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("passwordLabel")} *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder2")}
                  value={form.password}
                  onChange={set("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
            </div>

            {planRequired && (
              <div className="space-y-2">
                <Label>{t("planLabel2")} *</Label>
                <Select
                  value={selectedPlan ? String(selectedPlan.id) : ""}
                  onValueChange={(v) => setSelectedPlan(plans.find((p) => p.id === Number(v)) || null)}
                  disabled={lockedPlanId != null && selectedPlan != null}
                >
                  <SelectTrigger className="w-full">
                    <Building className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                    <SelectValue placeholder={plans.length === 0 ? t("loadingPlans") : t("selectPlan")} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {formatPlanLabel(plan, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
                  {t("paymentGatewayNotice", { gateway: GATEWAY_LABELS[activeGateway] ?? activeGateway })}
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creating") : t("create")}
            </Button>
          </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {!done && (
            <p className="text-center text-sm text-muted-foreground w-full">
              {t("hasAccount")}{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">{t("loginLink")}</Link>
            </p>
          )}
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={toggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <Globe className="h-4 w-4" />
                {localeNames[locale]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
              {locales.map((loc: Locale) => (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={loc === locale ? "font-semibold text-primary" : ""}
                >
                  {localeNames[loc]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
