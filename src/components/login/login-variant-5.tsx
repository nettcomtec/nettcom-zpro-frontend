"use client";

// Variant 5 — Dark Midnight (fundo escuro, bordas neon, estilo tech moderno)
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

export default function LoginVariant5() {
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
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#0a0a0f" }}>
      {/* Grid de pontos decorativo */}
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {/* Brilho central */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: "hsl(var(--primary))" }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div
          className="rounded-xl p-8 space-y-6"
          style={{
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 40px rgba(0,0,0,0.6), 0 0 1px 1px hsl(var(--primary) / 0.2)",
          }}
        >
          <div className="text-center space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeLogo} alt="Logo" className="mx-auto mb-3 h-12 max-w-[160px] object-contain"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
            <h1 className="text-2xl font-bold text-white">{t("welcome")}</h1>
            <p className="text-white/40 text-sm">{t("cardDescription")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/60 text-xs uppercase tracking-wider">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                aria-label={t("ariaEmail")}
                error={errors.email?.message}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-0 focus-visible:border-primary"
                {...register("email")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-white/60 text-xs uppercase tracking-wider">{t("passwordLabel")}</Label>
                <Link href="/reset/request" className="text-xs text-primary/70 hover:text-primary">{t("forgotPassword")}</Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-label={t("ariaPassword")}
                  error={errors.password?.message}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-0 focus-visible:border-primary"
                  {...register("password")}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")} className="absolute right-0 top-0 h-9 w-9 text-white/40 hover:text-white hover:bg-white/5" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
            <Button
              type="submit"
              className="w-full font-semibold"
              style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.4)" }}
              aria-label={t("ariaSubmit")}
              loading={loading}
              disabled={!captchaVerified}
            >
              <LogIn className="h-4 w-4" /> {loading ? t("loginLoading") : t("loginButton")}
            </Button>
          </form>

          <div className="space-y-3">
            {showMasterKey && (
              <Link href="/masterkey" className="block w-full text-center text-xs text-white/40 hover:text-white/80 hover:underline transition-colors">
                {t("useMasterKey")}
              </Link>
            )}
            {showRegister && <p className="text-center text-xs text-white/30">{t("noAccount")}{" "}<Link href="/signup" className="text-primary/80 hover:text-primary font-medium">{t("signupLink")}</Link></p>}
            <div className="flex justify-center gap-1">
              <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-white/30 hover:text-white hover:bg-white/5" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-white/30 hover:text-white hover:bg-white/5"><Globe className="h-4 w-4" />{localeNames[locale]}</Button></DropdownMenuTrigger>
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
