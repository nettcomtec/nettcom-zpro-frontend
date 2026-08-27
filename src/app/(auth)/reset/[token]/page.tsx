"use client";

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPassword } from "@/services/auth";
import { usePublicBranding } from "@/hooks/use-public-branding";
import { useTheme } from "next-themes";

export default function ResetPasswordPage() {
  const t = useTranslations("resetTokenPage");
  const router = useRouter();
  const params = useParams();
  const { logoUrl, logoDarkUrl } = usePublicBranding();
  const { resolvedTheme } = useTheme();
  const activeLogo = resolvedTheme === "dark" ? logoDarkUrl : logoUrl;
  const [loading, setLoading] = useState(false);

  const schema = z.object({
    password: z.string().min(6, t("errorPasswordMin")),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t("errorPasswordMismatch"), path: ["confirmPassword"],
  });

  type Form = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    setLoading(true);
    try {
      await resetPassword({ token: params.token as string, password: data.password });
      toast.success(t("successReset"));
      router.push("/login");
    } catch {
      toast.error(t("errorReset"));
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
            <KeyRound className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("newPasswordLabel")}</Label>
              <Input type="password" placeholder="••••••••" error={errors.password?.message} {...register("password")} />
            </div>
            <div className="space-y-2">
              <Label>{t("confirmPasswordLabel")}</Label>
              <Input type="password" placeholder="••••••••" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              <KeyRound className="h-4 w-4" /> {t("submitButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
