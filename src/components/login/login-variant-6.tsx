"use client";

// Variant 6 — Soft Nature (tons suaves, cantos arredondados, acolhedor)
import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Globe, Sparkles, Moon, Sun } from "lucide-react";
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

export default function LoginVariant6() {
  const { t, locale, setLocale, register, handleSubmit, errors, loading, redirecting, showPassword, setShowPassword, captchaVerified, setCaptchaVerified, onSubmit, isDark, toggleTheme } = useLoginForm();
  const { showRegister, showMasterKey } = useLoginButtons();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const activeLogo = isDark ? logoDarkUrl : logoUrl;

  const backgroundGradient = isDark
    ? "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #334155 100%)"
    : "linear-gradient(160deg, #f0fdf4 0%, #fef9f0 50%, #f0f9ff 100%)";

  return (
    <>
    {redirecting && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )}
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: backgroundGradient }}
    >
      {/* Elementos decorativos orgânicos */}
      <div className="absolute top-10 right-10 w-48 h-48 rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, hsl(var(--positive) / 0.3), transparent)" }} />
      <div className="absolute bottom-10 left-10 w-64 h-64 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.2), transparent)" }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className={`backdrop-blur-sm rounded-3xl p-8 shadow-xl border space-y-6 ${isDark ? 'bg-slate-900/80 border-slate-700/60 shadow-black/20' : 'bg-white/80 border-white/60 shadow-black/5'}`}>
          <div className="text-center space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeLogo} alt="Logo" className="mx-auto mb-2 h-14 max-w-[180px] object-contain"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
            <div className="flex items-center justify-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold text-foreground">{t("welcome")}</span>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">{t("cardDescription")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                aria-label={t("ariaEmail")}
                error={errors.email?.message}
                className={`rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 ${isDark ? 'bg-slate-800' : 'bg-white'}`}
                {...register("email")}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">{t("passwordLabel")}</Label>
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
                  className={`rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 ${isDark ? 'bg-slate-800' : 'bg-white'}`}
                  {...register("password")}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")} className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
            <Button type="submit" className="w-full rounded-xl" aria-label={t("ariaSubmit")} loading={loading} disabled={!captchaVerified}>
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
              <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-muted-foreground rounded-full" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-muted-foreground rounded-full"><Globe className="h-4 w-4" />{localeNames[locale]}</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto">
                  {locales.map((loc: Locale) => (<DropdownMenuItem key={loc} onClick={() => setLocale(loc)} className={loc === locale ? "font-semibold text-primary" : ""}>{localeNames[loc]}</DropdownMenuItem>))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
