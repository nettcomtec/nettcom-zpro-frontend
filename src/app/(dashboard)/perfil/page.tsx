"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";
import { Save, Loader2, User, Shield, Key, Eye, EyeOff, Camera, Smartphone, Download, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandingStore } from "@/stores/branding-store";
import { updateUser, uploadUserProfilePicture, changeOwnPassword } from "@/services/users";
import { getInitials } from "@/lib/utils";
import { useInstallPWA } from "@/hooks/use-install-pwa";
import { ImageCropModal } from "@/components/ui/image-crop-modal";

export default function SuperAdminProfilePage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Guard: only superadmin
  if (user && user.profile !== "superadmin") {
    router.replace("/");
    return null;
  }

  return <ProfileForm />;
}

function ProfileForm() {
  const t = useTranslations("configPerfilPage");
  const { user, setProfilePicture: setStorePicture, patchUser } = useAuthStore();

  const [name, setName] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState((user as any)?.phone || "");
  const [saving, setSaving] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string>(user?.profilePicture || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error(t("errorPhotoTooLarge"));
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) setCropSrc(ev.target.result as string); };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleCropConfirm = async (file: File) => {
    if (!user?.userId) return;
    setCropSrc(null);
    setUploadingPhoto(true);
    try {
      const { data } = await uploadUserProfilePicture(user.userId, file);
      setProfilePicture(data.profilePicture);
      setStorePicture(data.profilePicture);
      toast.success(t("photoUpdated"));
    } catch {
      toast.error(t("errorUpdatePhoto"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.userId) return;
    setUploadingPhoto(true);
    try {
      await updateUser(user.userId, { profilePicture: "" });
      setProfilePicture("");
      setStorePicture("");
      toast.success(t("photoRemoved"));
    } catch {
      toast.error(t("errorRemovePhoto"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const initials = getInitials(name || user?.username || "S");
  const appName = useBrandingStore(s => s.appName);
  const {
    showButton,
    canPromptInstall,
    canOpenApp,
    install,
    isIOS,
    showIOSInstructions,
    setShowIOSInstructions,
  } = useInstallPWA();

  const handleSaveProfile = async () => {
    if (!user?.userId) return;
    setSaving(true);
    try {
      // `email` VAI no payload: o strip de auto-edição do backend
      // (UserControllerZPRO.ts:564-565) só dispara em `isSelf && !canManageOwnAccessScope`,
      // e `canManageOwnAccessScope = canManageOthers && profile !== "super"`. Esta tela é
      // exclusiva de superadmin (guard no componente de página), perfil que está em
      // `canManageOthers` e não é `super` — logo o campo nunca é descartado aqui.
      await updateUser(user.userId, { name, email, phone });
      patchUser({ username: name, email, ...(phone ? { phone } as Record<string, unknown> : {}) });
      toast.success(t("profileUpdated"));
    } catch {
      toast.error(t("errorUpdateProfile"));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.userId) return;
    if (!currentPassword || !newPassword) {
      toast.error(t("errorFillPassword"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("errorPasswordMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("errorPasswordLength"));
      return;
    }
    setSavingPassword(true);
    try {
      // Endpoint dedicado (mesmo de /trocar-senha): valida a SENHA ATUAL no servidor
      // e opera sempre no usuário do token. O legado PUT /users/:id trocava a senha
      // sem exigir a atual — sessão roubada virava takeover permanente — e hoje o
      // backend descarta `password` na auto-edição, o que daria sucesso falso.
      await changeOwnPassword({ currentPassword, newPassword });
      toast.success(t("passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const code =
        (err as { data?: { error?: string; message?: string } })?.data?.error ??
        (err as { data?: { error?: string; message?: string } })?.data?.message ??
        "";
      if (code === "ERR_CURRENT_PASSWORD_INVALID") {
        toast.error(t("errorCurrentPasswordInvalid"));
      } else if (code === "ERR_PASSWORD_TOO_SHORT") {
        toast.error(t("errorPasswordLength"));
      } else {
        toast.error(t("errorChangePassword"));
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
    {cropSrc && (
      <ImageCropModal
        imageSrc={cropSrc}
        onConfirm={handleCropConfirm}
        onClose={() => setCropSrc(null)}
      />
    )}
    <div className="space-y-6">
      <PageHeader
        title={t("myProfile")}
        description={t("profileDesc")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      <div className="max-w-2xl space-y-6">
        {/* Dados do perfil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> {t("myProfile")}
            </CardTitle>
            <CardDescription>{t("profileDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profilePicture} alt={name} />
                  <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingPhoto
                    ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                    : <Camera className="h-5 w-5 text-white" />}
                </button>
                {profilePicture && !uploadingPhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    title={t("removePhotoTooltip")}
                    aria-label={t("removePhotoTooltip")}
                    className="absolute -top-1 -right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{user?.username}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {t("roleSuperAdmin")}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>{t("nameLabel")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("emailLabel")}</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  type="email"
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("phoneLabel")}</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("phonePlaceholder")}
                  type="tel"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Save className="mr-2 h-4 w-4" />}
                {t("saveProfile")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instalar PWA */}
        {showButton && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" /> {t("installApp")}
              </CardTitle>
              <CardDescription>{t("installAppDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {canPromptInstall && (
                <Button onClick={install} className="gap-2">
                  <Download className="h-4 w-4" />
                  {t("installBtn")}
                </Button>
              )}
              {canOpenApp && (
                <div className="flex items-center gap-4 rounded-lg border bg-muted/40 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Smartphone className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{appName || "App"}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("appInstalledTitle")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("appInstalledDesc")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Modal iOS */}
        {showIOSInstructions && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
            onClick={() => setShowIOSInstructions(false)}
          >
            <div
              className="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">{t("iosInstructions")}</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowIOSInstructions(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>{t("iosStep1")}</li>
                <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>{t("iosStep2")}</li>
                <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>{t("iosStep3")}</li>
              </ol>
              <Button className="mt-5 w-full" onClick={() => setShowIOSInstructions(false)}>
                {t("close")}
              </Button>
            </div>
          </div>
        )}

        {/* Alterar senha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> {t("changePassword")}
            </CardTitle>
            <CardDescription>{t("changePasswordDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("currentPassword")}</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                  onClick={() => setShowCurrent(!showCurrent)}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("newPassword")}</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                  onClick={() => setShowNew(!showNew)}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("confirmPassword")}</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleChangePassword} disabled={savingPassword}>
                {savingPassword
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Key className="mr-2 h-4 w-4" />}
                {t("changePasswordBtn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
