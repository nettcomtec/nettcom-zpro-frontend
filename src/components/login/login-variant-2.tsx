"use client";

// Variant 2 — Split Screen (painel de marca à esquerda + formulário à direita)
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

export default function LoginVariant2() {
  const { t, locale, setLocale, register, handleSubmit, errors, loading, redirecting, showPassword, setShowPassword, captchaVerified, setCaptchaVerified, onSubmit, isDark, toggleTheme } = useLoginForm();
  const sideMedia = useSideMedia();
  const showSideText = useShowSideText();
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
    <div className="min-h-screen w-full flex">
      {/* Painel esquerdo — marca */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex lg:w-1/2 bg-primary flex-col items-center justify-center p-12 relative overflow-hidden"
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
        <div className={sideMedia ? "absolute inset-0 bg-black/20" : "absolute inset-0 bg-primary/70"} />

        {/* Círculos decorativos — visíveis quando não há mídia */}
        {!sideMedia && (
          <>
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
            <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-white/5" />
            <div className="absolute top-1/3 right-10 w-32 h-32 rounded-full bg-white/10" />
          </>
        )}

        {showSideText && (
          <div className="relative z-10 text-center text-primary-foreground space-y-6 max-w-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDarkUrl} alt="Logo" className="mx-auto h-16 max-w-[200px] object-contain brightness-0 invert"
              onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />
            <h1 className="text-4xl font-bold leading-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{t("welcome")}</h1>
            <p className="text-primary-foreground/90 text-lg leading-relaxed" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>{t("cardDescription")}</p>
            <div className="flex items-center justify-center gap-2 text-primary-foreground/70 text-sm">
              <ArrowRight className="h-4 w-4" />
              <span>{t("loginButton")}</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* Painel direito — formulário */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full lg:w-1/2 flex items-center justify-center bg-background p-8"
      >
        <div className="w-full max-w-sm space-y-6">
          {/* Logo mobile */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeLogo} alt="Logo" className="lg:hidden mx-auto h-12 max-w-[160px] object-contain mb-4"
            onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = "none"; }} />

          <div>
            <h2 className="text-2xl font-bold text-foreground">{t("welcome")}</h2>
            <p className="text-muted-foreground text-sm mt-1">{t("cardDescription")}</p>
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
      </motion.div>
    </div>
    </>
  );
}
