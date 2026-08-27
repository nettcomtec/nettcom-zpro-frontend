"use client";

import { redirect } from "next/navigation";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function FunilPage() {
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  if (!allowed) return <AccessDenied />;
  redirect("/funil/dashboard");
}
