"use client"

// Page wrapper minimal pra satisfazer o contrato PageProps do Next 15
// (que proibe named exports adicionais em page.tsx). Todo o conteudo do
// painel vive em components/configuracoes/dialog360-page-content.tsx e
// é reusado tambem por /configuracoes/bsp via o named export.
import { Dialog360PageContent } from "@/components/configuracoes/dialog360-page-content"

export default function Page() {
  return <Dialog360PageContent />
}
