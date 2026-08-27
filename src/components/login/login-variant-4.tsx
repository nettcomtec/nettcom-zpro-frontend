"use client";

// Variant 4 — Glassmorphism (fundo gradiente animado + card de vidro fosco)
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

export default function LoginVariant4() {
  const { t, locale, setLocale, register, handleSubmit, errors, loading, redirecting, showPassword, setShowPassword, captchaVerified, setCaptchaVerified, onSubmit, isDark, toggleTheme } = useLoginForm();
  const { showRegister, showMasterKey } = useLoginButtons();
  const { logoDarkUrl } = usePublicBranding();

  return (
    <>
    {redirecting && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )}
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 50%, hsl(var(--accent)) 100%)",
      }}
    >
      {/* Blobs decorativos */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full opacity-30 blur-3xl"
        style={{ background: "hsl(var(--primary))" }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[45vw] h-[45vw] rounded-full opacity-25 blur-3xl"
        style={{ background: "hsl(var(--accent))" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div
          className="rounded-2xl p-8 space-y-6 shadow-2xl"
          style={{
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <div className="text-center space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDarkUrl} alt="Logo" className="mx-auto mb-3 h-13 max-w-[170px] object-contain brightness-0 invert"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
            <h1 className="text-2xl font-bold text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>{t("welcome")}</h1>
            <p className="text-white/80 text-sm">{t("cardDescription")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white text-sm font-medium">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                aria-label={t("ariaEmail")}
                error={errors.email?.message}
                className="bg-white/15 border-white/30 text-white placeholder:text-white/50 focus-visible:ring-white/30 focus-visible:border-white/60 h-10"
                {...register("email")}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-white text-sm font-medium">{t("passwordLabel")}</Label>
                <Link href="/reset/request" className="text-xs text-white/80 hover:text-white underline-offset-2 hover:underline">{t("forgotPassword")}</Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-label={t("ariaPassword")}
                  error={errors.password?.message}
                  className="bg-white/15 border-white/30 text-white placeholder:text-white/50 focus-visible:ring-white/30 focus-visible:border-white/60 h-10"
                  {...register("password")}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")} className="absolute right-0 top-0 h-10 w-10 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
            <Button
              type="submit"
              className="w-full bg-white text-primary hover:bg-white/90 font-semibold"
              style={{ textShadow: "none" }}
              aria-label={t("ariaSubmit")}
              loading={loading}
              disabled={!captchaVerified}
            >
              <LogIn className="h-4 w-4" /> {loading ? t("loginLoading") : t("loginButton")}
            </Button>
          </form>

          <div className="space-y-3">
            {showMasterKey && (
              <Link href="/masterkey" className="block w-full text-center text-xs text-white/60 hover:text-white hover:underline transition-colors">
                {t("useMasterKey")}
              </Link>
            )}
            {showRegister && (
              <p className="text-center text-sm text-white/70">
                {t("noAccount")}{" "}
                <Link href="/signup" className="text-white hover:underline font-semibold">{t("signupLink")}</Link>
              </p>
            )}
            <div className="flex justify-center gap-1">
              <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-white/70 hover:text-white hover:bg-white/10" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-white/70 hover:text-white hover:bg-white/10">
                    <Globe className="h-4 w-4" />{localeNames[locale]}
                  </Button>
                </DropdownMenuTrigger>
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
