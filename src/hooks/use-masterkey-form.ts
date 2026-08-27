"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { loginService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth-store";
import { connectWithToken } from "@/lib/socket";
import { useLocale } from "@/i18n/locale-provider";

export type MasterkeyFormFields = {
  email: string;
  password: string;
};

export function useMasterkeyForm() {
  const t = useTranslations("login");
  const { locale, setLocale } = useLocale();

  const schema = z.object({
    email: z.string().min(1, t("emailError")).email(t("emailError")),
    password: z.string().min(1, t("errorMessage")),
  });

  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<MasterkeyFormFields>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (formData: MasterkeyFormFields) => {
    setLoading(true);
    try {
      const { data } = await loginService({
        email: formData.email.trim(),
        password: formData.password,
        masterkey: true,
      });

      if ("requiresA2F" in data && data.requiresA2F) {
        sessionStorage.setItem("pendingA2F", JSON.stringify({
          pendingSessionId: data.pendingSessionId,
          email: formData.email.trim(),
          channel: data.channel,
          codeSentAt: new Date().toISOString(),
        }));
        router.push("/validate-a2f");
        return;
      }

      if ("token" in data) {
        setAuth(data);
        try { connectWithToken(data.token); } catch {}
        toast.success(t("loginSuccess"));

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
        ERR_MASTERKEY_DISABLED: t("errorMasterkeyDisabled"),
        ERR_INVALID_MASTERKEY: t("errorInvalidMasterkey"),
        ERR_INVALID_CREDENTIALS: t("errorInvalidCredentials"),
        ENCRYPTION_KEY_MISMATCH: t("errorEncryptionMismatch"),
        INVALID_KEY: t("errorUserLicense"),
      };
      // Mesmo atalho do login por senha: recusa por dominio nao e erro de
      // credencial, e sem um caminho visivel o cliente so ve um toast sem saber o
      // motivo. Antes esta tela mapeava o codigo mas nao oferecia a saida.
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
      setLoading(false);
    }
  };

  return {
    t,
    locale,
    setLocale,
    register,
    handleSubmit,
    errors,
    loading,
    showPassword,
    setShowPassword,
    onSubmit,
  };
}
