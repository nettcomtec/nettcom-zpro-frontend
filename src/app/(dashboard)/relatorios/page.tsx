"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users, Tag, MapPin, LayoutGrid, Briefcase, FileText, UserCheck, PauseCircle,
  CalendarClock,
} from "lucide-react";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";

const reportItems = [
  {
    titleKey: "reportContatos",
    descriptionKey: "reportContatosDesc",
    href: "/relatorios/lista-contatos",
    icon: Users,
  },
  {
    titleKey: "reportContatosEtiqueta",
    descriptionKey: "reportContatosEtiquetaDesc",
    href: "/relatorios/contatos-por-etiquetas",
    icon: Tag,
  },
  {
    titleKey: "reportContatosEstado",
    descriptionKey: "reportContatosEstadoDesc",
    href: "/relatorios/contatos-por-estado",
    icon: MapPin,
  },
  {
    titleKey: "reportContatosKanban",
    descriptionKey: "reportContatosKanbanDesc",
    href: "/relatorios/contatos-por-kanban",
    icon: LayoutGrid,
  },
  {
    titleKey: "reportContatosCarteira",
    descriptionKey: "reportContatosCarteiraDesc",
    href: "/relatorios/contatos-por-carteira",
    icon: Briefcase,
  },
  {
    titleKey: "reportAtendimentos",
    descriptionKey: "reportAtendimentosDesc",
    href: "/relatorios/atendimentos-por-parametros",
    icon: FileText,
  },
  {
    titleKey: "reportResumoUsuario",
    descriptionKey: "reportResumoUsuarioDesc",
    href: "/relatorios/estatisticas-atendimentos-usuarios",
    icon: UserCheck,
  },
  {
    titleKey: "reportPausas",
    descriptionKey: "reportPausasDesc",
    href: "/relatorios/pausas",
    icon: PauseCircle,
  },
  {
    titleKey: "reportProdutividadeDiaria",
    descriptionKey: "reportProdutividadeDiariaDesc",
    href: "/relatorios/produtividade-diaria",
    icon: CalendarClock,
  },
];

export default function RelatoriosPage() {
  const t = useTranslations("relatoriosPage");
  const allowed = usePageAccess("relatorios", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  return (
    <div className="space-y-6">
    <PageHeader title={t("title")} description={t("description")} help={{
      description: t("helpDesc"),
      sections: [
        { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
        { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
      ],
    }} />
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...reportItems]
        .sort((a, b) => t(a.titleKey).localeCompare(t(b.titleKey), undefined, { sensitivity: "base" }))
        .map((report) => {
        const Icon = report.icon;
        return (
          <Link key={report.href} href={report.href}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t(report.titleKey)}</CardTitle>
                    <CardDescription className="text-xs mt-1">{t(report.descriptionKey)}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
    </div>
  );
}
