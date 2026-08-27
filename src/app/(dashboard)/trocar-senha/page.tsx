"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { changeOwnPassword } from "@/services/users";

// Beco-sem-saída da troca de senha obrigatória (modo forceChange do tenant):
// o use-auth-guard prende o usuário flagado aqui e o backend nega o resto com
// 403 ERR_MUST_CHANGE_PASSWORD até a senha ser trocada.
export default function TrocarSenhaPage() {
  const t = useTranslations("trocarSenhaPage");
  const router = useRouter();
  const { user, patchUser } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const completedRef = useRef(false);

  const goHome = React.useCallback(() => {
    const profile = user?.profile;
    if (profile === "superadmin") router.replace("/assinatura");
    else if (profile === "admin" || profile === "super") router.replace("/");
    else router.replace("/atendimento");
  }, [router, user?.profile]);

  // Sem flag (URL direta) não há o que trocar aqui — volta para a home do perfil
  useEffect(() => {
    if (user && !user.mustChangePassword && !completedRef.current) {
      goHome();
    }
  }, [user, goHome]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t("errorFillAll"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("errorMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("errorLength"));
      return;
    }
    setSaving(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      completedRef.current = true;
      patchUser({ mustChangePassword: false });
      toast.success(t("success"));
      goHome();
    } catch (err) {
      const code =
        (err as { data?: { error?: string; message?: string } })?.data?.error ??
        (err as { data?: { error?: string; message?: string } })?.data?.message ??
        "";
      if (code === "ERR_CURRENT_PASSWORD_INVALID") {
        toast.error(t("errorCurrentInvalid"));
      } else if (code === "ERR_PASSWORD_TOO_SHORT") {
        toast.error(t("errorLength"));
      } else {
        toast.error(t("errorGeneric"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trocar-senha-atual">{t("currentPassword")}</Label>
              <Input
                id="trocar-senha-atual"
                type={showPasswords ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">{t("currentPasswordHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trocar-senha-nova">{t("newPassword")}</Label>
              <Input
                id="trocar-senha-nova"
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trocar-senha-confirmar">{t("confirmPassword")}</Label>
              <Input
                id="trocar-senha-confirmar"
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPasswords ? t("hidePasswords") : t("showPasswords")}
            </button>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("submit")}
            </Button>
            <p className="text-xs text-muted-foreground text-center">{t("note")}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
