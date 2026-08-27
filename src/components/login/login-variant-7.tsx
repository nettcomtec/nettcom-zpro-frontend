"use client";

// Variant 7 — Corporate (sidebar de marca estreita à esquerda + área de formulário)
import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Globe, Shield, Users, Zap, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useLoginForm } from "@/hooks/use-login-form";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { SliderCaptcha } from "@/components/login/slider-captcha";


const features = [
  { icon: Shield, key: "feature1" },
  { icon: Users, key: "feature2" },
  { icon: Zap, key: "feature3" },
];

function useLoginButtons() {
  const [showRegister] = useState(() => {
    try { return localStorage.getItem("loginShowRegisterButton") !== "0"; } catch { return true; }
  });
  const [showMasterKey] = useState(() => {
    try { return localStorage.getItem("loginShowMasterKeyButton") !== "0"; } catch { return true; }
  });
  return { showRegister, showMasterKey };
}

export default function LoginVariant7() {
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
    <div className="min-h-screen w-full flex bg-background">
      {/* Sidebar corporativo */}
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden md:flex md:w-72 lg:w-80 flex-col justify-between p-8 border-r border-border bg-muted/30"
      >
        <div className="space-y-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeLogo} alt="Logo" className="h-10 max-w-[150px] object-contain"
            onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">{t("welcome")}</h2>
            <p className="text-muted-foreground text-sm mt-2">{t("cardDescription")}</p>
          </div>
          <div className="space-y-4">
            {features.map(({ icon: Icon }) => (
              <div key={Icon.displayName} className="flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t("cardDescription")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()}</p>
      </motion.aside>

      {/* Área do formulário */}
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex-1 flex items-center justify-center p-8"
      >
        <div className="w-full max-w-sm space-y-6">
          {/* Logo mobile */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeLogo} alt="Logo" className="md:hidden mx-auto h-10 max-w-[140px] object-contain mb-4"
            onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">{t("loginButton")}</h1>
            <p className="text-sm text-muted-foreground">{t("cardDescription")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input id="email" type="email" placeholder={t("emailPlaceholder")} autoComplete="email" aria-label={t("ariaEmail")} error={errors.email?.message} {...register("email")} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Link href="/reset/request" className="text-xs text-primary hover:underline">{t("forgotPassword")}</Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" autoComplete="current-password" aria-label={t("ariaPassword")} error={errors.password?.message} {...register("password")} />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")} className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
            <Button type="submit" className="w-full" aria-label={t("ariaSubmit")} loading={loading} disabled={!captchaVerified}>
              <LogIn className="h-4 w-4" /> {loading ? t("loginLoading") : t("loginButton")}
            </Button>
          </form>

          <div className="space-y-3">
            {showMasterKey && (
              <Link href="/masterkey" className="block w-full text-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors">
                {t("useMasterKey")}
              </Link>
            )}
            {showRegister && <p className="text-center text-sm text-muted-foreground">{t("noAccount")}{" "}<Link href="/signup" className="text-primary hover:underline font-medium">{t("signupLink")}</Link></p>}
            <div className="flex justify-center gap-1">
              <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-muted-foreground" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-muted-foreground"><Globe className="h-4 w-4" />{localeNames[locale]}</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
                  {locales.map((loc: Locale) => (<DropdownMenuItem key={loc} onClick={() => setLocale(loc)} className={loc === locale ? "font-semibold text-primary" : ""}>{localeNames[loc]}</DropdownMenuItem>))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </motion.main>
    </div>
    </>
  );
}
