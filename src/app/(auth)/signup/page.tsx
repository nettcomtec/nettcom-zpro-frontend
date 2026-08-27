"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, User, CreditCard, Mail, Phone, Lock, Building, Globe, Moon, Sun, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
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
  trial: boolean;
  trialPeriod?: number;
}

function formatPlanLabel(plan: Plan, t: (key: string, values?: Record<string, string | number | Date>) => string) {
  return t("planLabelFormat", {
    name: plan.name,
    value: plan.value,
    connections: plan.connections,
    users: plan.users,
    trial: plan.trial ? " | Trial" : "",
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
      const list: Plan[] = data?.plan || data || [];
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

  const phonePlaceholder = signupConfig.phoneFormat === "br"
    ? t("phonePlaceholder")
    : t("phonePlaceholderInternational");

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
    if (signupConfig.phoneRequired && !form.mobilePhone.trim()) {
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

    if (!validatePassword(form.password)) {
      toast.error(t("errorPasswordLength"));
      return;
    }

    setLoading(true);
    try {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + 30);
      const nextDueDate = currentDate.toISOString().split("T")[0];

      const cleanedPhone = signupConfig.phoneFormat === "br"
        ? form.mobilePhone.replace(/[^\d]/g, "")
        : form.mobilePhone.replace(/[^\d+]/g, "");

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
      toast.success(t("successCreated"));
      // Tela de pagamento logo após o cadastro: se o gateway retornou a URL do 1º
      // boleto/fatura, leva o usuário direto ao pagamento; senão, segue para o login.
      const paymentUrl = (signupRes as { paymentUrl?: string } | undefined)?.paymentUrl;
      window.location.href = paymentUrl || "/login";
    } catch (err: unknown) {
      // Licenca de empresa unica (ZPRO_1_TENANT): o servidor recusa o autocadastro,
      // porque a nova empresa nunca conseguiria entrar. Mensagem propria em vez do
      // erro generico — o codigo pode vir no corpo cru ou dentro de `response`.
      const errCode =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { data?: { error?: string } })?.data?.error;
      if ((errCode ?? "") === "ERR_LICENSE_SINGLE_TENANT") {
        toast.error(t("errorSingleTenantLicense"));
        return;
      }
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t("errorGeneric"));
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
          <CardTitle className="text-2xl font-bold">{t("create")}</CardTitle>
          <CardDescription>{t("title")}</CardDescription>
        </CardHeader>
        <CardContent>
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
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder={phonePlaceholder} value={form.mobilePhone} onChange={set("mobilePhone")} />
              </div>
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
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <p className="text-center text-sm text-muted-foreground w-full">
            {t("hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">{t("loginLink")}</Link>
          </p>
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
