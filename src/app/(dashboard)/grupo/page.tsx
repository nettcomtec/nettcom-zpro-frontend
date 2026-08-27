"use client";

import { redirect } from "next/navigation";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function GrupoPage() {
  const allowed = usePageAccess("grupo");
  if (!allowed) return <AccessDenied />;
  redirect("/grupo/massagrupos");
}
