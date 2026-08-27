"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star } from "lucide-react";
import api from "@/lib/api";
import { PLAN_CAPABILITIES } from "@/lib/plan-capabilities";

interface PricingPlan {
  id: number;
  name: string;
  value: number;
  connections: number;
  users: number;
  description?: string;
  isPublic?: boolean;
  displayOrder?: number;
  highlight?: boolean;
  features?: { caps?: Record<string, boolean> } | null;
}

export default function PrecosPage() {
  const t = useTranslations("pricingPage");
  const tc = useTranslations("planosPage");
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/plan/")
      .then(({ data }) => {
        const list: PricingPlan[] = data?.plan || data || [];
        // Vitrine só mostra planos marcados como públicos, na ordem definida.
        const pub = list
          .filter((p) => p.isPublic === true)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        setPlans(pub);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Caps habilitadas no plano (cap ausente ou true = incluída; false = excluída).
  function enabledCaps(p: PricingPlan): string[] {
    const caps = p.features?.caps || {};
    return PLAN_CAPABILITIES.filter((c) => caps[c.key] !== false).map((c) => c.key);
  }

  return (
    <div className="w-full max-w-6xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">{t("loading")}</p>
      ) : plans.length === 0 ? (
        <p className="text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const hasFeatures = !!p.features?.caps;
            const caps = enabledCaps(p);
            return (
              <Card key={p.id} className={p.highlight ? "relative border-primary shadow-lg" : "relative"}>
                {p.highlight && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Star className="mr-1 h-3 w-3" />
                    {t("mostPopular")}
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">R$ {Number(p.value).toFixed(2)}</span>
                    <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
                  </div>
                  {p.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      {t("featureUsers", { n: p.users || 0 })}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      {t("featureConnections", { n: p.connections || 0 })}
                    </li>
                    {!hasFeatures ? (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        {t("allFeatures")}
                      </li>
                    ) : (
                      caps.map((k) => (
                        <li key={k} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                          {tc(`planCap.${k}` as Parameters<typeof tc>[0])}
                        </li>
                      ))
                    )}
                  </ul>
                  <Button asChild className="w-full">
                    <Link href={`/signup?plano=${p.id}`}>{t("subscribe")}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
