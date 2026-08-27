"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFoundPage");
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-8xl font-bold text-primary/20">404</h1>
        <h2 className="text-2xl font-semibold mt-4">{t("title")}</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          {t("description")}
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Button>
          <Button asChild>
            <Link href="/"><Home className="h-4 w-4" /> {t("home")}</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
