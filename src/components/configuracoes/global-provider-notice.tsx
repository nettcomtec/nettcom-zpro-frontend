"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import api from "@/lib/api";

interface GlobalProviderNoticeProps {
  providerType: string;
}

// Aviso exibido nas páginas de configuração de integração quando existe um
// provedor global ativo do mesmo tipo para o tenant: a configuração global
// tem prioridade sobre os campos preenchidos na página (resolução GPC-first
// do backend via Show*Host/GetGlobalProviderConfig). Sem provedor global,
// não renderiza nada.
export function GlobalProviderNotice({ providerType }: GlobalProviderNoticeProps) {
  const t = useTranslations("globalProviderNotice");
  const [hasGlobal, setHasGlobal] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get("/globalProviderConfig/public", { params: { providerType, status: "active" } })
      .then(({ data }) => {
        if (active) setHasGlobal(Array.isArray(data) && data.length > 0);
      })
      .catch(() => {
        // silencioso: sem info de provedor global, apenas não exibe o aviso
      });
    return () => {
      active = false;
    };
  }, [providerType]);

  if (!hasGlobal) return null;

  return (
    <Alert variant="info-soft">
      <Info className="h-4 w-4" />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>{t("message")}</AlertDescription>
    </Alert>
  );
}
