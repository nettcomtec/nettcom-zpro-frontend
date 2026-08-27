"use client";

// Variant 3 — Minimal Float (sem card, campos flutuantes sobre fundo limpo)
import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Globe, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useLoginForm } from "@/hooks/use-login-form";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { SliderCaptcha } from "@/components/login/slider-captcha";


function useLoginButtons() {
  const [showRegister] = useState(() => {
    try { return localStorage.getItem("loginShowRegisterButton") !== "0"; } catch { return true; }
  });
  const [showMasterKey] = useState(() => {
    try { return localStorage.getItem("loginShowMasterKeyButton") !== "0"; } catch { return true; }
  });
  return { showRegister, showMasterKey };
}

export default function LoginVariant3() {
  const { t, locale, setLocale, register, handleSubmit, errors, loading, redirecting, showPassword, setShowPassword, captchaVerified, setCaptchaVerified, onSubmit, isDark, toggleTheme } = useLoginForm();
  const { showRegister, showMasterKey } = useLoginButtons();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const activeLogo = isDark ? logoDarkUrl : logoUrl;

  return (
    <>
    {redirecting && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )}
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/20">
      {/* Linha decorativa superior */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-primary" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-sm px-6 py-10"
      >
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeLogo} alt="Logo" className="mx-auto mb-6 h-12 max-w-[160px] object-contain"
            onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("cardDescription")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              aria-label={t("ariaEmail")}
              error={errors.email?.message}
              className="border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary h-10"
              {...register("email")}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">{t("passwordLabel")}</Label>
              <Link href="/reset/request" className="text-xs text-primary hover:underline">{t("forgotPassword")}</Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-label={t("ariaPassword")}
                error={errors.password?.message}
                className="border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary h-10"
                {...register("password")}
              />
              <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")} className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
          <Button type="submit" className="w-full mt-2" aria-label={t("ariaSubmit")} loading={loading} disabled={!captchaVerified}>
            <LogIn className="h-4 w-4" /> {loading ? t("loginLoading") : t("loginButton")}
          </Button>
        </form>

        <div className="mt-6 space-y-3">
          {showMasterKey && (
            <Link href="/masterkey" className="block w-full text-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors">
              {t("useMasterKey")}
            </Link>
          )}
          {showRegister && <p className="text-center text-xs text-muted-foreground">{t("noAccount")}{" "}<Link href="/signup" className="text-primary hover:underline font-medium">{t("signupLink")}</Link></p>}
          <div className="flex justify-center gap-1">
            <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-muted-foreground" onClick={toggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-muted-foreground text-xs"><Globe className="h-3.5 w-3.5" />{localeNames[locale]}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
                {locales.map((loc: Locale) => (<DropdownMenuItem key={loc} onClick={() => setLocale(loc)} className={loc === locale ? "font-semibold text-primary" : ""}>{localeNames[loc]}</DropdownMenuItem>))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
