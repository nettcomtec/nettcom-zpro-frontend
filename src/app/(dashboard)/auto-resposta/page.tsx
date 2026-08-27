"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { MessageSquare, Plus, Search, Pencil, Trash2 } from "lucide-react";

interface AutoResponse {
  id: number;
  name: string;
  trigger: string;
  status: "active" | "inactive";
  updatedAt: string;
}

export default function AutoRespostaPage() {
  const t = useTranslations("autoRespostaPage");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AutoResponse[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filtered = data.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button>
          <Plus className="mr-2 h-4 w-4" /> {t("newAutoResponse")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[160px]" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            >
              <Button>
                <Plus className="mr-2 h-4 w-4" /> {t("newAutoResponse")}
              </Button>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("trigger")}: {item.trigger}
                      </p>
                    </div>
                    <Badge variant={item.status === "active" ? "success" : "secondary"}>
                      {item.status === "active" ? t("active") : t("inactive")}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {t("updated")}: {item.updatedAt}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
