"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";

export const TOUR_KEY = "zpro-tour-v1";
export const TOUR_RESTART_EVENT = "zpro:restart-tour";

interface Step {
  anchorId?: string;
  titleKey: string;
  descKey: string;
  /** If set, only show this step for the listed profiles */
  profiles?: string[];
}

// All possible tour steps — filtered at runtime by profile + anchor presence in DOM
const ALL_STEPS: Step[] = [
  // ── Welcome ──────────────────────────────────────────────────────────────
  { titleKey: "welcome.title",           descKey: "welcome.desc" },
  // ── Header (busca global, sino, nova conversa) ───────────────────────────
  // Nova Conversa só renderiza p/ !superadmin && !restrictedUser — o filtro de
  // anchor no DOM (buildSteps) descarta o step sozinho quando o botão não existe.
  { anchorId: "tour-header-search",      titleKey: "headerSearch.title",          descKey: "headerSearch.desc"          },
  { anchorId: "tour-header-bell",        titleKey: "headerNotifications.title",   descKey: "headerNotifications.desc"   },
  { anchorId: "tour-header-new-conversation", titleKey: "headerNewConversation.title", descKey: "headerNewConversation.desc" },
  // ── Overview ─────────────────────────────────────────────────────────────
  { anchorId: "tour-dashboard",          titleKey: "dashboard.title",      descKey: "dashboard.desc"      },
  // ── Core attendance ──────────────────────────────────────────────────────
  { anchorId: "tour-atendimento",        titleKey: "atendimento.title",    descKey: "atendimento.desc"    },
  { anchorId: "tour-chat-privado",       titleKey: "chatPrivado.title",    descKey: "chatPrivado.desc"    },
  { anchorId: "tour-contatos",           titleKey: "contacts.title",       descKey: "contacts.desc"       },
  // ── Marketing & communication ─────────────────────────────────────────────
  { anchorId: "tour-campanhas",          titleKey: "campaigns.title",      descKey: "campaigns.desc"      },
  { anchorId: "tour-mensagens-rapidas",  titleKey: "quickMessages.title",  descKey: "quickMessages.desc"  },
  { anchorId: "tour-massa",              titleKey: "bulk.title",           descKey: "bulk.desc"           },
  { anchorId: "tour-galeria",            titleKey: "gallery.title",        descKey: "gallery.desc"        },
  { anchorId: "tour-grupos",             titleKey: "groups.title",         descKey: "groups.desc"         },
  // ── Management ────────────────────────────────────────────────────────────
  { anchorId: "tour-kanban",             titleKey: "kanban.title",         descKey: "kanban.desc"         },
  { anchorId: "tour-funil",              titleKey: "funnel.title",         descKey: "funnel.desc"         },
  { anchorId: "tour-tarefas",            titleKey: "tasks.title",          descKey: "tasks.desc"          },
  { anchorId: "tour-agenda",             titleKey: "schedule.title",       descKey: "schedule.desc"       },
  // ── Administration (super + admin) ────────────────────────────────────────
  { anchorId: "tour-sessoes",            titleKey: "channels.title",       descKey: "channels.desc",       profiles: ["admin", "super"] },
  { anchorId: "tour-equipes",            titleKey: "teams.title",          descKey: "teams.desc",          profiles: ["admin", "super"] },
  { anchorId: "tour-agendamentos",       titleKey: "scheduledMessages.title", descKey: "scheduledMessages.desc", profiles: ["admin", "super"] },
  { anchorId: "tour-chatflow",           titleKey: "chatflow.title",       descKey: "chatflow.desc",       profiles: ["admin", "super"] },
  { anchorId: "tour-filas",              titleKey: "queues.title",         descKey: "queues.desc",         profiles: ["admin", "super"] },
  { anchorId: "tour-etiquetas",          titleKey: "labels.title",         descKey: "labels.desc",         profiles: ["admin", "super"] },
  { anchorId: "tour-horario",            titleKey: "businessHours.title",  descKey: "businessHours.desc",  profiles: ["admin", "super"] },
  { anchorId: "tour-avaliacoes",         titleKey: "ratings.title",        descKey: "ratings.desc",        profiles: ["admin", "super"] },
  { anchorId: "tour-relatorios",         titleKey: "reports.title",        descKey: "reports.desc",        profiles: ["admin", "super"] },
  // ── Admin only ────────────────────────────────────────────────────────────
  { anchorId: "tour-usuarios",           titleKey: "users.title",          descKey: "users.desc",          profiles: ["admin"] },
  { anchorId: "tour-painel",             titleKey: "panel.title",          descKey: "panel.desc",          profiles: ["admin"] },
  { anchorId: "tour-aniversarios",       titleKey: "birthdays.title",      descKey: "birthdays.desc",      profiles: ["admin"] },
  { anchorId: "tour-api",                titleKey: "api.title",            descKey: "api.desc",            profiles: ["admin"] },
  { anchorId: "tour-auditlog",           titleKey: "auditLog.title",       descKey: "auditLog.desc",       profiles: ["admin"] },
  { anchorId: "tour-config",             titleKey: "config.title",         descKey: "config.desc",         profiles: ["admin"] },
  // ── Done ─────────────────────────────────────────────────────────────────
  { titleKey: "done.title",              descKey: "done.desc" },
];

interface AnchorRect { top: number; left: number; width: number; height: number; }

export function AppTour() {
  const t = useTranslations("tour");
  const { user } = useAuthStore();
  const { setTourActive, setSidebarCollapsed } = useUIStore();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  /** Build the effective step list for the current user: filter by profile +
   *  presença do anchor no DOM no momento de iniciar. Anchor ausente (menu oculto
   *  por permissão, recurso desativado, botão não renderizado) → step descartado
   *  em vez de virar card sem alvo. Steps sem anchorId (welcome/done) sempre entram. */
  const buildSteps = useCallback((): Step[] => {
    const profile = user?.profile ?? "user";
    return ALL_STEPS.filter(s => {
      if (s.profiles && !s.profiles.includes(profile)) return false;
      if (s.anchorId && typeof document !== "undefined" && !document.getElementById(s.anchorId)) return false;
      return true;
    });
  }, [user?.profile]);

  // Show on first access after a short delay (never for superadmin)
  useEffect(() => {
    if (user?.profile === "superadmin") return;
    try {
      if (localStorage.getItem(TOUR_KEY) === "done") return;
    } catch { return; }
    const timer = setTimeout(() => {
      setSteps(buildSteps());
      setStep(0);
      setVisible(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [user?.profile, buildSteps]);

  // Listen for manual restart (triggered by meu-perfil replay button)
  useEffect(() => {
    if (user?.profile === "superadmin") return;
    const handler = () => {
      try { localStorage.removeItem(TOUR_KEY); } catch {}
      setSteps(buildSteps());
      setStep(0);
      setVisible(true);
    };
    window.addEventListener(TOUR_RESTART_EVENT, handler);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, handler);
  }, [user?.profile, buildSteps]);

  // Sync tourActive with visibility + ensure sidebar is expanded
  useEffect(() => {
    if (visible) {
      setTourActive(true);
      setSidebarCollapsed(false);
    } else {
      setTourActive(false);
    }
  }, [visible, setTourActive, setSidebarCollapsed]);

  // Update spotlight rect whenever step changes — delay to let collapsibles open, then scroll into view
  useEffect(() => {
    if (!visible || steps.length === 0) return;
    const current = steps[step];
    if (!current?.anchorId) { setAnchorRect(null); return; }
    const timer = setTimeout(() => {
      const el = document.getElementById(current.anchorId!);
      if (!el) { setAnchorRect(null); return; }
      // Scroll element into view — target the Radix ScrollArea viewport directly
      const viewport = el.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
      if (viewport) {
        const vpRect = viewport.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // Compute how much to scroll so the element lands in the center of the viewport
        const offset = elRect.top - vpRect.top + viewport.scrollTop - vpRect.height / 2 + elRect.height / 2;
        viewport.scrollTop = Math.max(0, offset);
      } else {
        el.scrollIntoView({ behavior: "instant", block: "center" });
      }
      // Read rect after scroll has settled
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { setAnchorRect(null); return; }
        setAnchorRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [step, visible, steps]);

  const finish = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, "done"); } catch {}
    setVisible(false);
  }, []);

  const next = useCallback(() => {
    if (step < steps.length - 1) setStep((s) => s + 1);
    else finish();
  }, [step, steps.length, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;
  const hasAnchor = !!anchorRect;

  if (!visible || !current) return null;

  return (
    <div className="fixed inset-0 z-[9000]" role="dialog" aria-modal="true">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Spotlight — box-shadow creates the surrounding dark area */}
      {hasAnchor && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: anchorRect!.top - 4,
            left: anchorRect!.left - 4,
            width: anchorRect!.width + 8,
            height: anchorRect!.height + 8,
            borderRadius: 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            border: "2px solid hsl(var(--primary) / 0.85)",
            background: "transparent",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Centering wrapper — flexbox keeps the card centered without conflicting with framer-motion transforms */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 2 }}>
        {/* Tooltip card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ width: "min(320px, calc(100vw - 32px))" }}
            className="pointer-events-auto bg-card border border-border rounded-xl shadow-2xl p-5 space-y-3"
          >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 flex-1">
              <p className="text-[11px] text-muted-foreground font-medium tracking-wide">
                {step + 1} / {steps.length}
              </p>
              <h3 className="font-semibold text-base leading-snug">{t(current.titleKey)}</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1 -mr-1" onClick={finish}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{t(current.descKey)}</p>

          {/* Progress dots */}
          <div className="flex gap-1 justify-center pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step ? "w-4 bg-primary" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-0.5">
            <Button variant="ghost" size="sm" onClick={finish} className="text-xs text-muted-foreground h-8 px-2">
              {t("skip")}
            </Button>
            <div className="flex gap-2">
              {!isFirst && (
                <Button variant="outline" size="sm" onClick={prev} className="h-8 gap-1">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t("prev")}
                </Button>
              )}
              <Button size="sm" onClick={next} className="h-8 gap-1">
                {isLast ? t("doneBtn") : t("next")}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
