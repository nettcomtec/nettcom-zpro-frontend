"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Phone, User, Eye, EyeOff, ExternalLink, PhoneCall, Save, Loader2 } from "lucide-react";
import { FloatingSaveButton } from "@/components/ui/floating-save-button";
import { toast } from "sonner";
import { fetchTenantById, updateTenantVapiToken } from "@/services/tenants";
import { fetchVapiAssistants, fetchVapiPhoneNumbers, createVapiCall, type VapiAssistant, type VapiPhoneNumber } from "@/services/vapi";
import { useAuthStore } from "@/stores/auth-store";

export default function VapiPage() {
  const t = useTranslations("configVapiPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vapiToken, setVapiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<VapiPhoneNumber[]>([]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await fetchTenantById(tenantId);
        const tenant = Array.isArray(data) ? data[0] : data;
        setVapiToken((tenant as Record<string, string>)?.vapiToken || "");

        const [assistantsRes, phonesRes] = await Promise.allSettled([
          fetchVapiAssistants(tenantId),
          fetchVapiPhoneNumbers(tenantId),
        ]);

        if (assistantsRes.status === "fulfilled") {
          const d = assistantsRes.value.data;
          setAssistants(
            Array.isArray(d) ? d : (d as { assistants?: VapiAssistant[]; data?: VapiAssistant[] })?.assistants || (d as { data?: VapiAssistant[] })?.data || []
          );
        }
        if (phonesRes.status === "fulfilled") {
          const d = phonesRes.value.data;
          setPhoneNumbers(
            Array.isArray(d) ? d : (d as { phoneNumbers?: VapiPhoneNumber[]; data?: VapiPhoneNumber[] })?.phoneNumbers || (d as { data?: VapiPhoneNumber[] })?.data || []
          );
        }
      } catch {
        toast.error(t("errorLoad"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateTenantVapiToken(tenantId, { vapiToken });
      toast.success(t("tokenSaved"));
    } catch {
      toast.error(t("errorSaveToken"));
    } finally {
      setSaving(false);
    }
  }, [tenantId, vapiToken]);

  const fazerChamadaTeste = useCallback(async () => {
    if (!selectedAssistantId || !selectedPhoneNumberId || !customerNumber) {
      toast.error(t("fillAllFields"));
      return;
    }
    setCalling(true);
    try {
      await createVapiCall(tenantId, [{ number: customerNumber }], selectedAssistantId, selectedPhoneNumberId);
      toast.success(t("callStarted"));
      setDialogVisible(false);
      setSelectedAssistantId("");
      setSelectedPhoneNumberId("");
      setCustomerNumber("");
    } catch {
      toast.error(t("errorStartCall"));
    } finally {
      setCalling(false);
    }
  }, [tenantId, selectedAssistantId, selectedPhoneNumberId, customerNumber]);

  // A ajuda precisa existir tambem no skeleton: sem isso o botao de ajuda
  // some da pagina enquanto os dados carregam.
  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
    ],
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("description")} help={pageHelp} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("descriptionFull")}
        help={pageHelp}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("https://vapi.ai/", "_blank", "noopener,noreferrer")}>
            <ExternalLink className="mr-2 h-4 w-4" /> {t("createAccount")}
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("saveButton")}
          </Button>
        </div>
      </PageHeader>

      {/* Token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> VAPI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("tokenLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={vapiToken}
                onChange={(e) => setVapiToken(e.target.value)}
                placeholder={t("tokenPlaceholder")}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assistentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> {t("assistantsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assistants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAssistants")}</p>
          ) : (
            <ul className="divide-y">
              {assistants.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <User className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Números de Telefone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> {t("phoneNumbersTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {phoneNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPhoneNumbers")}</p>
          ) : (
            <ul className="divide-y">
              {phoneNumbers.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-2">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{n.number}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Chamada de Teste */}
      <Button onClick={() => setDialogVisible(true)}>
        <PhoneCall className="mr-2 h-4 w-4" /> {t("testCallButton")}
      </Button>

      {/* Dialog chamada */}
      <Dialog open={dialogVisible} onOpenChange={setDialogVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("testCallTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("assistantLabel")}</Label>
              <Select value={selectedAssistantId} onValueChange={setSelectedAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectAssistantPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("phoneNumberLabel")}</Label>
              <Select value={selectedPhoneNumberId} onValueChange={setSelectedPhoneNumberId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectPhoneNumberPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {phoneNumbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("customerNumberLabel")}</Label>
              <Input
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder={t("customerNumberPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogVisible(false)}>{t("cancelButton")}</Button>
            <Button onClick={fazerChamadaTeste} disabled={calling}>
              {calling ? t("callingButton") : t("makeCallButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FloatingSaveButton saving={saving} onClick={handleSave} />
    </div>
  );
}
