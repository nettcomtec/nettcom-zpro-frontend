"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Package } from "lucide-react";
import { WooCommerceProdutosView } from "@/components/woocommerce/produtos-view";
import { WooCommercePedidosView } from "@/components/woocommerce/pedidos-view";

export default function WooCommercePage() {
  const t = useTranslations("woocommercePage");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = searchParams.get("tab") === "produtos" ? "produtos" : "pedidos";
  const [tab, setTab] = React.useState<string>(initialTab);

  const handleTabChange = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
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
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="pedidos" className="gap-2">
            <Receipt className="h-4 w-4" />
            {t("tabPedidos")}
          </TabsTrigger>
          <TabsTrigger value="produtos" className="gap-2">
            <Package className="h-4 w-4" />
            {t("tabProdutos")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-6">
          <WooCommercePedidosView embedded />
        </TabsContent>

        <TabsContent value="produtos" className="mt-6">
          <WooCommerceProdutosView embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
