"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { requestPasswordReset } from "@/services/auth";
import { useLocale } from "@/i18n/locale-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { useTheme } from "next-themes";

// Schema is created inside the component to use translations
function makeSchema(t: (key: string) => string) {
  return z.object({
    email: z.string().min(1, t("emailRequired")).email(t("emailRequired")),
  });
}

type Form = { email: string };

export default function RequestResetPage() {
  const t = useTranslations("resetRequest");
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === "dark" ? logoDarkUrl : logoUrl;
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(makeSchema(t)),
  });

  const onSubmit = async (data: Form) => {
    setLoading(true);
    try {
      await requestPasswordReset({ email: data.email });
      toast.success(t("successEmailSent"));
      router.push("/login");
    } catch {
      toast.error(t("errorEmailSend"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md px-4">
      <Card className="border-0 shadow-2xl shadow-black/5">
        <CardHeader className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeLogo}
            alt="Logo"
            className="mx-auto mb-2 h-14 max-w-[180px] object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
            <Mail className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              <Mail className="h-4 w-4" />
              {loading ? t("sending") : t("sendLink")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              <ArrowLeft className="h-4 w-4" /> {t("backToLogin")}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
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
        </CardFooter>
      </Card>
    </motion.div>
  );
}
