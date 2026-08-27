"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { PageHeader } from "@/components/layout/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog360PageContent } from "@/components/configuracoes/dialog360-page-content"
import { GupshupConfigContent } from "@/components/configuracoes/gupshup-page-content"

type BspTab = "dialog360" | "gupshup"

function isValidTab(value: string | null): value is BspTab {
  return value === "dialog360" || value === "gupshup"
}

export default function BspPage() {
  const t = useTranslations("bspPage")
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = searchParams.get("tab")
  const [tab, setTab] = useState<BspTab>(isValidTab(initial) ? initial : "dialog360")

  // Sincroniza ?tab=... <-> state ao navegar (back/forward, ou link externo)
  useEffect(() => {
    const next = searchParams.get("tab")
    if (isValidTab(next) && next !== tab) setTab(next)
  }, [searchParams, tab])

  function handleTabChange(value: string) {
    if (!isValidTab(value)) return
    setTab(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    router.replace(`/configuracoes/bsp?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            {
              title: t("helpS0T"),
              items: [t("helpS0I0"), t("helpS0I1")],
            },
          ],
        }}
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 w-full sm:w-auto">
          <TabsTrigger value="dialog360">{t("tabDialog360")}</TabsTrigger>
          <TabsTrigger value="gupshup">{t("tabGupshup")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dialog360" className="mt-4">
          <Dialog360PageContent embedded />
        </TabsContent>

        <TabsContent value="gupshup" className="mt-4">
          <GupshupConfigContent embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
