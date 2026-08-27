"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ConfigTutoriaisPage() {
  const t = useTranslations("tutoriaisPage");
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium">{t("managedBySuperadmin")}</p>
            <p className="text-sm text-muted-foreground">
              {t("accessHint")}
            </p>
          </div>
          <Button asChild>
            <Link href="/customizar">
              {t("goToCustomize")} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
