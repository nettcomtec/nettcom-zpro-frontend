"use client";

import { redirect } from "next/navigation";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function MassaPage() {
  const allowed = usePageAccess("massa");
  if (!allowed) return <AccessDenied />;
  redirect("/massa/template");
}
