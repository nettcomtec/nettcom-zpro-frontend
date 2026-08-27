"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Globe, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useMasterkeyForm } from "@/hooks/use-masterkey-form";
import { SliderCaptcha } from "@/components/login/slider-captcha";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

export default function MasterkeyPage() {
  const { locale, setLocale, register, handleSubmit, errors, loading, showPassword, setShowPassword, onSubmit } = useMasterkeyForm();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const { resolvedTheme } = useTheme();
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const activeLogo = resolvedTheme === "dark" ? logoDarkUrl : logoUrl;
  const t = useTranslations("login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md px-4"
      >
        <Card className="border-0 shadow-2xl shadow-black/5">
          <CardHeader className="space-y-2 text-center pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLogo}
              alt="Logo"
              className="mx-auto mb-2 h-14 max-w-[180px] object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <CardTitle className="text-2xl font-bold">Acesso Master Key</CardTitle>
            <CardDescription>Acesso administrativo via chave mestra</CardDescription>
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
              <div className="space-y-2">
                <Label htmlFor="password">Master Key</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    {...register("password")}
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
              </div>
              <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
              <Button type="submit" className="w-full" loading={loading} disabled={!captchaVerified}>
                <LogIn className="h-4 w-4" /> {loading ? t("loginLoading") : t("loginButton")}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-0">
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar ao login normal
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" />{localeNames[locale]}
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
    </div>
  );
}
