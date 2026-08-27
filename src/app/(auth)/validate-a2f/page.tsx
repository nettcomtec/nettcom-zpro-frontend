"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldCheck, RotateCw, Clock, AlertCircle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { validateA2F, resendA2F } from "@/services/auth";
import { useAuthStore } from "@/stores/auth-store";
import { connectWithToken } from "@/lib/socket";
import { useLocale } from "@/i18n/locale-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { useTheme } from "next-themes";

const CODE_TTL = 300; // 5 minutes
const RESEND_COOLDOWN = 60; // 60 seconds

function ValidateA2FForm() {
  const t = useTranslations("validateA2f");
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { locale, setLocale } = useLocale();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === "dark" ? logoDarkUrl : logoUrl;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const [pendingSessionId, setPendingSessionId] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState("email");

  // Countdown timer (5 min)
  const [timeRemaining, setTimeRemaining] = useState(CODE_TTL);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Resend cooldown (60 sec)
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("pendingA2F");
    if (!raw) {
      router.push("/login");
      return;
    }
    try {
      const data = JSON.parse(raw);
      setPendingSessionId(data.pendingSessionId || "");
      setEmail(data.email || "");
      setChannel(data.channel || "email");
      if (data.codeSentAt) {
        const elapsed = Math.floor((Date.now() - new Date(data.codeSentAt).getTime()) / 1000);
        const remaining = Math.max(0, CODE_TTL - elapsed);
        setTimeRemaining(remaining);
        if (remaining === 0) {
          toast.error(t("errorExpiredCode"));
          setTimeout(() => router.push("/login"), 3000);
          return;
        }
      }
    } catch {
      router.push("/login");
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          toast.error(t("errorExpiredCode"));
          setTimeout(() => router.push("/login"), 3000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown > 0]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleValidate = async () => {
    if (!code || code.length < 4) {
      setError(t("errorEnterCode"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await validateA2F({ pendingSessionId, a2fCode: code, email });
      sessionStorage.removeItem("pendingA2F");
      setAuth(data);
      try { connectWithToken(data.token); } catch {}
      toast.success(t("successVerified"));
      if (data.profile === "superadmin") {
        router.push("/assinatura");
      } else if (data.profile === "admin" || data.profile === "super") {
        router.push("/");
      } else {
        router.push("/atendimento");
      }
    } catch (err: unknown) {
      const serverData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      let msg = t("errorInvalidCode");
      if (serverData?.error === "ERR_INVALID_A2F_CODE") msg = t("errorInvalidCode");
      else if (serverData?.error === "ERR_A2F_CODE_EXPIRED") msg = t("errorExpiredCode");
      else if (serverData?.error === "ERR_INVALID_SESSION") {
        msg = t("errorVerification");
        setTimeout(() => router.push("/login"), 2500);
      } else if (serverData?.message) msg = serverData.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) {
      toast.warning(t("resendingIn", { seconds: resendCooldown }));
      return;
    }
    setResending(true);
    setError("");
    try {
      await resendA2F({ pendingSessionId, email });
      // Update codeSentAt in sessionStorage
      const raw = sessionStorage.getItem("pendingA2F");
      if (raw) {
        const stored = JSON.parse(raw);
        stored.codeSentAt = new Date().toISOString();
        sessionStorage.setItem("pendingA2F", JSON.stringify(stored));
      }
      // Reset code timer
      setTimeRemaining(CODE_TTL);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
          return prev - 1;
        });
      }, 1000);
      // Start resend cooldown
      setResendCooldown(RESEND_COOLDOWN);
      toast.success(t("successResent"));
    } catch (err: unknown) {
      const serverData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      let msg = t("errorVerification");
      if (serverData?.error === "ERR_RESEND_LIMIT") {
        msg = t("errorTooManyAttempts");
        setResendCooldown(RESEND_COOLDOWN);
      } else if (serverData?.error === "ERR_INVALID_SESSION") {
        msg = t("errorVerification");
        setTimeout(() => router.push("/login"), 2000);
      } else if (serverData?.message) msg = serverData.message;
      toast.error(msg);
    } finally {
      setResending(false);
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
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
          <CardDescription>
            {t("codeFor")} {channel === "whatsapp" ? "WhatsApp" : channel === "sms" ? "SMS" : t("emailChannel")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Timer */}
          <div className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${timeRemaining > 60 ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"}`}>
            {timeRemaining > 0 ? (
              <><Clock className="h-4 w-4" /> {t("codeExpires")} {formatTime(timeRemaining)}</>
            ) : (
              <><AlertCircle className="h-4 w-4" /> {t("codeExpired")}</>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("codeLabel")}</Label>
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-mono"
              maxLength={6}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <Button className="w-full" loading={loading} disabled={timeRemaining === 0} onClick={handleValidate}>
            {t("verify")}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            loading={resending}
            disabled={resendCooldown > 0 || resending}
            onClick={handleResend}
          >
            <RotateCw className="h-4 w-4" />
            {resendCooldown > 0 ? t("resendingIn", { seconds: resendCooldown }) : t("resendCode")}
          </Button>
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

export default function ValidateA2FPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md px-4">
        <Card className="border-0 shadow-2xl shadow-black/5">
          <CardContent className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </CardContent>
        </Card>
      </div>
    }>
      <ValidateA2FForm />
    </Suspense>
  );
}
