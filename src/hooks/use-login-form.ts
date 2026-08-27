"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { loginService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth-store";
import { connectWithToken } from "@/lib/socket";
import { useLocale } from "@/i18n/locale-provider";

export type LoginFormFields = {
  email: string;
  password: string;
};

export function useLoginForm() {
  const t = useTranslations("login");
  const { locale, setLocale } = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  const isDark = resolvedTheme === "dark";

  const loginSchema = z.object({
    email: z.string().min(1, t("emailError")).email(t("emailError")),
    password: z.string().min(1, t("errorMessage")),
  });

  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormFields>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (formData: LoginFormFields) => {
    setLoading(true);
    let willRedirect = false;
    try {
      const { data } = await loginService({
        email: formData.email.trim(),
        password: formData.password,
        masterkey: false,
      });

      if ("requiresA2F" in data && data.requiresA2F) {
        sessionStorage.setItem("pendingA2F", JSON.stringify({
          pendingSessionId: data.pendingSessionId,
          email: formData.email.trim(),
          channel: data.channel,
          codeSentAt: new Date().toISOString(),
        }));
        willRedirect = true;
        router.push("/validate-a2f");
        return;
      }

      if ("token" in data) {
        setAuth(data);
        try { connectWithToken(data.token); } catch {}
        toast.success(t("loginSuccess"));
        willRedirect = true;
        setRedirecting(true);

        if (data.profile === "superadmin") {
          router.push("/assinatura");
        } else if (data.profile === "admin" || data.profile === "super") {
          router.push("/");
        } else {
          router.push("/atendimento");
        }
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: string } | string };
      const errorMsg = typeof err?.data === "string" ? err.data : err?.data?.error;
      const errorMap: Record<string, string> = {
        ERROR_NO_PERMISSION_API_ADMIN: t("errorUnauthorized"),
        ERR_LIMIT_MAX: t("errorUserLimit"),
        OUT_RANGE: t("errorBusinessHours"),
        INVALID_LICENSE: t("errorUserLicense"),
        INVALID_DOMAIN: t("errorDomainLicense"),
        LICENSE_ERROR: t("errorServerLicense"),
        INVALID_TENANT: t("errorInvalidTenant"),
        ERR_USER_INACTIVE: t("errorUserInactive"),
        ERR_TENANT_INACTIVE: t("errorTenantInactive"),
        ERR_INVALID_CREDENTIALS: t("errorInvalidCredentials"),
        ENCRYPTION_KEY_MISMATCH: t("errorEncryptionMismatch"),
        INVALID_ENCRYPTED_PASSWORD: t("errorInvalidEncryptedPassword"),
        ERR_SENDING_A2F_CODE: t("errorSendingA2F"),
        ERR_A2F_TOO_MANY_ATTEMPTS: t("errorTooManyA2FAttempts"),
        INVALID_KEY: t("errorUserLicense"),
      };
      // INVALID_DOMAIN nao e erro de credencial: o servidor recusou porque o
      // dominio nao esta coberto pela licenca (ou BACKEND_URL nao esta setado no
      // .env). Sem um caminho visivel, o cliente so ve um toast e nao tem como
      // saber o motivo. Oferece atalho para a tela de recuperacao, que ja trata
      // servidor antigo sem /license/recheck. Demais erros seguem iguais.
      const message = errorMap[errorMsg || ""] || t("errorInvalidCredentials");
      if (errorMsg === "INVALID_DOMAIN") {
        toast.error(message, {
          action: {
            label: t("errorDomainLicenseAction"),
            onClick: () => router.push("/license-recovery?from=login&reason=domain"),
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      if (!willRedirect) setLoading(false);
    }
  };

  return {
    t,
    locale,
    setLocale,
    isDark,
    toggleTheme,
    register,
    handleSubmit,
    errors,
    loading,
    redirecting,
    showPassword,
    setShowPassword,
    captchaVerified,
    setCaptchaVerified,
    onSubmit,
  };
}
