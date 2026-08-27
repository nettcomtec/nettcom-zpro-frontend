"use client";

// Variant 8 — Bold Hero (tipografia dramática, dominância de cor primária, impacto visual)
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Globe, ArrowRight, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useLoginForm } from "@/hooks/use-login-form";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { SliderCaptcha } from "@/components/login/slider-captcha";

import { getLoginSideBgUrl } from "@/lib/branding-urls";

type SideMedia = { type: "image" | "video"; src: string } | null;

function useSideMedia(): SideMedia {
  const [media, setMedia] = useState<SideMedia>(null);

  useEffect(() => {
    const ts = Date.now();
    const url = getLoginSideBgUrl(ts);
    fetch(url, { method: "HEAD" })
      .then((r) => {
        if (!r.ok) return;
        const ct = r.headers.get("Content-Type") ?? "";
        setMedia({ type: ct.startsWith("video/") ? "video" : "image", src: url });
      })
      .catch(() => {});
  }, []);

  return media;
}

function useShowSideText() {
  const [show] = useState(() => {
    try { return localStorage.getItem("loginSideText") !== "0"; } catch { return true; }
  });
  return show;
}

function useLoginButtons() {
  const [showRegister] = useState(() => {
    try { return localStorage.getItem("loginShowRegisterButton") !== "0"; } catch { return true; }
  });
  const [showMasterKey] = useState(() => {
    try { return localStorage.getItem("loginShowMasterKeyButton") !== "0"; } catch { return true; }
  });
  return { showRegister, showMasterKey };
}

export default function LoginVariant8() {
  const { t, locale, setLocale, register, handleSubmit, errors, loading, redirecting, showPassword, setShowPassword, captchaVerified, setCaptchaVerified, onSubmit, isDark, toggleTheme } = useLoginForm();
  const sideMedia = useSideMedia();
  const showSideText = useShowSideText();
  const { showRegister, showMasterKey } = useLoginButtons();
  const { logoDarkUrl } = usePublicBranding();

  return (
    <>
    {redirecting && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )}
    <div className="min-h-screen w-full flex flex-col lg:flex-row">
      {/* Hero panel esquerdo */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative flex-1 flex flex-col items-center justify-center p-12 lg:p-20 overflow-hidden"
        style={{ background: "hsl(var(--primary))" }}
      >
        {/* Mídia lateral (imagem ou vídeo) se configurada */}
        {sideMedia?.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sideMedia.src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {sideMedia?.type === "video" && (
          <video
            src={sideMedia.src}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Overlay para legibilidade: forte quando é cor sólida, sutil quando há mídia */}
        <div className={sideMedia ? "absolute inset-0 bg-black/20" : "absolute inset-0 bg-primary/65"} />

        {/* Padrão geométrico de fundo — visível quando não há mídia */}
        {!sideMedia && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.1) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.1) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.1) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.1) 75%)",
              backgroundSize: "40px 40px",
              backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
            }}
          />
        )}

        {/* Círculos decorativos — apenas quando não há mídia (evita halo difuso sobre o vídeo) */}
        {!sideMedia && (
          <>
            <div
              className="absolute top-[-15%] right-[-15%] w-[60vw] lg:w-[35vw] h-[60vw] lg:h-[35vw] rounded-full opacity-20"
              style={{ background: "rgba(255,255,255,0.3)", filter: "blur(60px)" }}
            />
            <div
              className="absolute bottom-[-10%] left-[-10%] w-[40vw] lg:w-[25vw] h-[40vw] lg:h-[25vw] rounded-full opacity-15"
              style={{ background: "rgba(255,255,255,0.4)", filter: "blur(40px)" }}
            />
          </>
        )}

        {showSideText && (
          <div className="relative z-10 text-center lg:text-left max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoDarkUrl}
              alt="Logo"
              className="mb-8 h-14 max-w-[180px] object-contain brightness-0 invert mx-auto lg:mx-0"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }}
            />
            <h1
              className="font-black text-white leading-none mb-6"
              style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", letterSpacing: "-0.03em", textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}
            >
              {t("welcome")}
            </h1>
            <p className="text-white/80 text-lg leading-relaxed" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
              {t("cardDescription")}
            </p>
            <div className="mt-10 flex items-center gap-3 justify-center lg:justify-start">
              <div className="h-1 w-12 rounded-full bg-white/40" />
              <div className="h-1 w-4 rounded-full bg-white/20" />
              <div className="h-1 w-2 rounded-full bg-white/10" />
            </div>
          </div>
        )}
      </motion.div>

      {/* Painel do formulário */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        className="flex items-center justify-center p-8 lg:p-16 bg-background"
        style={{ minWidth: "min(100%, 480px)" }}
      >
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-foreground" style={{ letterSpacing: "-0.02em" }}>
              {t("loginButton")}
            </h2>
            <p className="text-muted-foreground">{t("cardDescription")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                autoComplete="email"
                aria-label={t("ariaEmail")}
                error={errors.email?.message}
                className="h-12 text-base border-2 focus-visible:border-primary focus-visible:ring-0 transition-colors"
                {...register("email")}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">{t("passwordLabel")}</Label>
                <Link href="/reset/request" className="text-xs font-medium text-primary hover:underline">{t("forgotPassword")}</Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-label={t("ariaPassword")}
                  error={errors.password?.message}
                  className="h-12 text-base border-2 focus-visible:border-primary focus-visible:ring-0 transition-colors"
                  {...register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? t("ariaHidePassword") : t("ariaShowPassword")}
                  className="absolute right-0 top-0 h-12 w-12 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <SliderCaptcha onVerified={setCaptchaVerified} label={t("validateCaptcha")} />
            <Button
              type="submit"
              className="w-full h-12 text-base font-bold gap-2 group"
              aria-label={t("ariaSubmit")}
              loading={loading}
              disabled={!captchaVerified}
            >
              {loading ? t("loginLoading") : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t("loginButton")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>

          <div className="space-y-4">
            {showMasterKey && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-3 text-muted-foreground font-medium">{t("orSeparator")}</span>
                  </div>
                </div>
                <Link href="/masterkey" className="block w-full text-center text-xs text-muted-foreground hover:text-primary hover:underline transition-colors">
                  {t("useMasterKey")}
                </Link>
              </>
            )}

            {showRegister && (
              <p className="text-center text-sm text-muted-foreground">
                {t("noAccount")}{" "}
                <Link href="/signup" className="text-primary hover:underline font-semibold">
                  {t("signupLink")}
                </Link>
              </p>
            )}

            <div className="flex justify-center gap-1">
              <Button variant="ghost" size="sm" aria-label={t("ariaToggleTheme")} className="gap-2 text-muted-foreground" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={t("ariaLanguage")} className="gap-2 text-muted-foreground hover:text-foreground">
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
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
