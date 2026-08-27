"use client";

import { redirect } from "next/navigation";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default function KanbanPage() {
  const allowed = usePageAccess("kanban");
  if (!allowed) return <AccessDenied />;
  redirect("/kanban/board");
}
