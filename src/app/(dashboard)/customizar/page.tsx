"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Palette, Image, LogOut, Key, Lock, BookOpen, Plus, Pencil, Trash2, Copy, CheckCircle, XCircle, Zap, Monitor, Eye, Smartphone, Moon, Sun, GripVertical, Volume2, Upload, AlertTriangle, Type, Square, Circle as CircleIcon, Code2, RotateCcw, UserPlus, ScrollText } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import api from "@/lib/api";
import { applyBrandColors } from "@/lib/brand-colors";
import { setBaseTitle } from "@/lib/tab-title";
import {
  uploadLogoNovo,
  uploadLogoDarkNovo,
  uploadFaviconNovo,
  uploadPwaIconNovo,
  updateAppNameNovo,
  fetchBranding,
  fetchSystemColors,
  saveSystemColors,
  fetchSystemColorsDark,
  saveSystemColorsDark,
  fetchNotificationSounds,
  uploadNotificationSound,
  deleteNotificationSound,
  deleteLogoNovo,
  deleteLogoDarkNovo,
  deleteFaviconNovo,
} from "@/services/superadmin";
import { fetchTenants, updateTenantPostmanLink, fetchTenantLicensePolicy } from "@/services/tenants";
import {
  fetchTutorials, createTutorial, updateTutorial, deleteTutorial, type Tutorial,
} from "@/services/tutorials";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable as useDndSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { fetchSocketModelNovo, updateSocketModelNovo, fetchLoginVariantNovo, updateLoginVariantNovo, updateLoginSideTextNovo, updateLoginShowRegisterButtonNovo, updateLoginShowMasterKeyButtonNovo, uploadLoginSideBg, deleteLoginSideBg, fetchSignupVariantNovo, updateSignupVariantNovo, type SignupVariantConfig } from "@/services/superadmin";
import { useBrandingStore } from "@/stores/branding-store";
import { NotificationSoundPlayer } from "@/components/customizar/notification-sound-player";
import { TypographyPanel } from "@/components/customizar/typography-panel";
import { ResellerTermsPanel } from "@/components/customizar/reseller-terms-panel";
import { AvatarShapePanel } from "@/components/customizar/avatar-shape-panel";
import { getLogoUrl, getLogoDarkUrl, getFaviconUrl, getLoginSideBgUrl, getPwaIconUrl, getNotificationSoundUrl } from "@/lib/branding-urls";

type TFunc = (key: string) => string;

function getColorFields(t: TFunc) {
  return [
    { key: "primary", label: t("colorPrimary") },
    { key: "secondary", label: t("colorSecondary") },
    { key: "accent", label: t("colorAccent") },
    { key: "warning", label: t("colorWarning") },
    { key: "negative", label: t("colorNegative") },
    { key: "positive", label: t("colorPositive") },
    { key: "neutral", label: t("colorNeutral") },
    { key: "light", label: t("colorLight") },
  ];
}

interface ColorPalette {
  name: string;
  colors: Record<string, string>;
}

function getPresets(t: TFunc): ColorPalette[] {
  return [
    {
      name: t("presetBlue"),
      colors: { primary: "#1976d2", secondary: "#26c6da", accent: "#9c27b0", warning: "#fb8c00", negative: "#c10015", positive: "#21ba45", neutral: "#6c757d", light: "#f5f5f5" },
    },
    {
      name: t("presetOcean"),
      colors: { primary: "#0077b6", secondary: "#00b4d8", accent: "#48cae4", warning: "#f4a261", negative: "#e63946", positive: "#2ec4b6", neutral: "#6d6875", light: "#f0f9ff" },
    },
    {
      name: t("presetForest"),
      colors: { primary: "#2d6a4f", secondary: "#52b788", accent: "#74c69d", warning: "#e9c46a", negative: "#d62828", positive: "#40916c", neutral: "#6b705c", light: "#f0fdf4" },
    },
    {
      name: t("presetSunset"),
      colors: { primary: "#e85d04", secondary: "#f48c06", accent: "#faa307", warning: "#ffba08", negative: "#d00000", positive: "#70e000", neutral: "#8d99ae", light: "#fff8f0" },
    },
    {
      name: t("presetViolet"),
      colors: { primary: "#7b2d8b", secondary: "#9b5de5", accent: "#c77dff", warning: "#f4a261", negative: "#e63946", positive: "#06d6a0", neutral: "#6d6875", light: "#fdf4ff" },
    },
    {
      name: t("presetPink"),
      colors: { primary: "#c9184a", secondary: "#ff4d6d", accent: "#ff758f", warning: "#f9c74f", negative: "#a4133c", positive: "#25a244", neutral: "#8d99ae", light: "#fff0f3" },
    },
    {
      name: t("presetGraphite"),
      colors: { primary: "#343a40", secondary: "#495057", accent: "#6c757d", warning: "#f4a261", negative: "#e63946", positive: "#2dc653", neutral: "#868e96", light: "#f8f9fa" },
    },
    {
      name: t("presetIndigo"),
      colors: { primary: "#3730a3", secondary: "#6366f1", accent: "#818cf8", warning: "#f59e0b", negative: "#ef4444", positive: "#22c55e", neutral: "#6b7280", light: "#eef2ff" },
    },
  ];
}

const DARK_COLOR_DEFAULTS: Record<string, string> = {
  primary: "#6366f1", secondary: "#818cf8", accent: "#a78bfa",
  warning: "#f59e0b", negative: "#ef4444", positive: "#22c55e",
  neutral: "#6b7280", light: "#1e1e2e",
};

function getDarkPresets(t: TFunc): ColorPalette[] {
  return [
    {
      name: t("presetDarkIndigo"),
      colors: { primary: "#6366f1", secondary: "#818cf8", accent: "#a78bfa", warning: "#f59e0b", negative: "#ef4444", positive: "#22c55e", neutral: "#6b7280", light: "#1e1e2e" },
    },
    {
      name: t("presetDarkSlate"),
      colors: { primary: "#94a3b8", secondary: "#64748b", accent: "#7dd3fc", warning: "#fbbf24", negative: "#f87171", positive: "#4ade80", neutral: "#475569", light: "#0f172a" },
    },
    {
      name: t("presetDarkEmerald"),
      colors: { primary: "#34d399", secondary: "#6ee7b7", accent: "#a7f3d0", warning: "#fcd34d", negative: "#f87171", positive: "#4ade80", neutral: "#6b7280", light: "#064e3b" },
    },
    {
      name: t("presetDarkRose"),
      colors: { primary: "#fb7185", secondary: "#f43f5e", accent: "#fda4af", warning: "#fbbf24", negative: "#ef4444", positive: "#4ade80", neutral: "#6b7280", light: "#1c0010" },
    },
    {
      name: t("presetDarkAmber"),
      colors: { primary: "#f59e0b", secondary: "#fbbf24", accent: "#fcd34d", warning: "#fb923c", negative: "#f87171", positive: "#4ade80", neutral: "#78716c", light: "#1c1100" },
    },
    {
      name: t("presetDarkCyan"),
      colors: { primary: "#22d3ee", secondary: "#67e8f9", accent: "#a5f3fc", warning: "#fbbf24", negative: "#f87171", positive: "#4ade80", neutral: "#6b7280", light: "#0c1a2a" },
    },
  ];
}

function generateKey(length = 32): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

interface Tenant { id: number; name: string; forceLogout?: string; }

function SortableTutorialRow({ tut, t, onEdit, onDuplicate, onDelete }: {
  tut: Tutorial;
  t: (key: string) => string;
  onEdit: (tut: Tutorial) => void;
  onDuplicate: (tut: Tutorial) => void;
  onDelete: (tut: Tutorial) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDndSortable({ id: tut.id });
  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground focus:outline-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">{tut.sortOrder ?? "—"}</span>
        </div>
      </TableCell>
      <TableCell className="font-medium">{tut.title}</TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{tut.link || "—"}</TableCell>
      <TableCell>
        {tut.isActive
          ? <CheckCircle className="h-4 w-4 text-green-500" />
          : <XCircle className="h-4 w-4 text-muted-foreground" />}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(tut)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(tut)}>
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(tut)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ColorPreviewCarousel({ colors, isDark, slide, setSlide, t }: {
  colors: Record<string, string>;
  isDark: boolean;
  slide: number;
  setSlide: (n: number) => void;
  t: TFunc;
}) {
  const TOTAL = 4;
  const bg = isDark ? "#0f0f1a" : "#ffffff";
  const bgAlt = isDark ? "#12122a" : "#f9fafb";
  const textMain = isDark ? "#e2e8f0" : "#1e293b";
  const textMuted = isDark ? "#94a3b8" : "#6b7280";
  const border = isDark ? "#2d2d4a" : "#e5e7eb";
  const msgBg = isDark ? "#1e293b" : "#f1f5f9";
  const inputBg = isDark ? "#1a1a2e" : "#f8fafc";

  const mockSessions = [
    { name: "Carlos Silva",    msg: "Olá, preciso de ajuda!",   time: "09:12", unread: 3, color: colors.primary },
    { name: "Ana Paula",       msg: "Quando posso receber?",     time: "09:05", unread: 1, color: colors.secondary },
    { name: "João Ferreira",   msg: "Ok, obrigado!",             time: "08:55", unread: 0, color: colors.accent },
    { name: "Maria Costa",     msg: "Aguardando retorno",        time: "08:40", unread: 2, color: colors.warning },
    { name: "Pedro Alves",     msg: "Problema resolvido?",       time: "08:22", unread: 0, color: colors.positive },
    { name: "Lucia Mendes",    msg: "Boa tarde!",                time: "08:10", unread: 5, color: colors.negative },
    { name: "Roberto Lima",    msg: "Vou verificar isso",        time: "Ontem",  unread: 0, color: colors.neutral },
    { name: "Fernanda Santos", msg: "Perfeito, obrigada!",       time: "Ontem",  unread: 0, color: colors.secondary },
    { name: "Grupo Vendas",    msg: "Reunião amanhã às 10h",     time: "Seg",    unread: 7, color: colors.accent },
    { name: "Suporte Bot",     msg: "Fluxo iniciado...",         time: "Seg",    unread: 0, color: colors.neutral },
  ];

  const mockContacts = [
    { name: "Ana Paula Souza",   phone: "+55 11 91234-5678", tag: "Cliente",   tagColor: colors.primary },
    { name: "Carlos Roberto",    phone: "+55 21 99876-5432", tag: "Parceiro",  tagColor: colors.secondary },
    { name: "Fernanda Lima",     phone: "+55 31 98765-4321", tag: "Prospect",  tagColor: colors.accent },
    { name: "João Pedro Alves",  phone: "+55 41 97654-3210", tag: "Inativo",   tagColor: colors.neutral },
    { name: "Maria das Graças",  phone: "+55 85 96543-2109", tag: "Cliente",   tagColor: colors.primary },
  ];

  const slides: React.ReactNode[] = [
    // Slide 0: Visão Geral
    <div key="overview" className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: border }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: colors.primary }}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-white/20" />
          <div className="h-2.5 w-24 rounded-full bg-white/60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 rounded-full bg-white/40" />
          <div className="w-6 h-6 rounded-full bg-white/25" />
        </div>
      </div>
      <div className="flex" style={{ backgroundColor: bg }}>
        <div className="w-44 border-r p-3 space-y-1" style={{ backgroundColor: bgAlt, borderColor: border }}>
          {(["primary","secondary","accent","neutral","warning"] as string[]).map((k, i) => (
            <div key={k} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md"
              style={{ backgroundColor: i === 0 ? colors[k] + "dd" : "transparent" }}>
              <div className="w-3.5 h-3.5 rounded shrink-0" style={{ backgroundColor: i === 0 ? "rgba(255,255,255,0.5)" : colors[k] }} />
              <div className="h-2 rounded-full flex-1" style={{ backgroundColor: i === 0 ? "rgba(255,255,255,0.6)" : colors[k] + "55" }} />
            </div>
          ))}
        </div>
        <div className="flex-1 p-4 space-y-3" style={{ backgroundColor: bg }}>
          <div className="grid grid-cols-3 gap-3">
            {([["positive", "↑ 12%"], ["warning", "⚠ 3"], ["negative", "↓ 2"]] as [string, string][]).map(([k, label]) => (
              <div key={k} className="rounded-lg p-2.5" style={{ backgroundColor: colors[k] + "18", borderLeft: `3px solid ${colors[k]}` }}>
                <div className="h-2 w-12 rounded mb-1.5" style={{ backgroundColor: colors[k] + "66" }} />
                <div className="text-[11px] font-semibold" style={{ color: colors[k] }}>{label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="px-3 py-1.5 rounded-md text-white text-xs font-medium" style={{ backgroundColor: colors.primary }}>Salvar</div>
            <div className="px-3 py-1.5 rounded-md text-xs font-medium border" style={{ borderColor: colors.primary, color: colors.primary }}>Cancelar</div>
            <div className="px-3 py-1.5 rounded-md text-white text-xs font-medium" style={{ backgroundColor: colors.positive }}>Aprovar</div>
            <div className="px-3 py-1.5 rounded-md text-white text-xs font-medium" style={{ backgroundColor: colors.negative }}>Rejeitar</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["primary", "secondary", "accent", "warning", "positive", "negative"] as string[]).map(k => (
              <div key={k} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: colors[k] }}>{k}</div>
            ))}
          </div>
        </div>
      </div>
    </div>,

    // Slide 1: Atendimentos
    <div key="attendance" className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: border }}>
      <div className="px-3 py-2 flex items-center justify-between border-b" style={{ backgroundColor: bgAlt, borderColor: border }}>
        <div className="flex gap-1">
          {["Abertos", "Pendentes", "Fechados"].map((tab, i) => (
            <div key={tab} className="px-2.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1"
              style={{ backgroundColor: i === 0 ? colors.primary : "transparent", color: i === 0 ? "white" : textMuted }}>
              {tab}
              {i === 0 && <span className="px-1 rounded-full text-[9px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>12</span>}
              {i === 1 && <span className="px-1 rounded-full text-[9px] font-bold" style={{ backgroundColor: colors.warning + "33", color: colors.warning }}>4</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px]" style={{ borderColor: border, color: textMuted, backgroundColor: inputBg }}>
          <div className="w-2 h-2 rounded-sm border" style={{ borderColor: textMuted }} />
          <span>Buscar...</span>
        </div>
      </div>
      <div className="flex" style={{ minHeight: 220 }}>
        <div className="w-52 border-r flex flex-col overflow-hidden" style={{ borderColor: border }}>
          {mockSessions.map((item, i) => (
            <div key={item.name} className="flex items-center gap-2 px-2.5 py-2 border-b shrink-0"
              style={{
                backgroundColor: i === 0 ? colors.primary + "15" : (i % 2 === 0 ? bg : bgAlt + "88"),
                borderColor: border,
                borderLeft: i === 0 ? `3px solid ${colors.primary}` : "3px solid transparent",
              }}>
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: item.color }}>
                {item.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold truncate" style={{ color: textMain }}>{item.name}</span>
                  <span className="text-[8px] shrink-0 ml-1" style={{ color: textMuted }}>{item.time}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] truncate" style={{ color: textMuted }}>{item.msg}</span>
                  {item.unread > 0 && (
                    <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] text-white font-bold shrink-0 ml-1"
                      style={{ backgroundColor: colors.primary }}>
                      {item.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 flex flex-col" style={{ backgroundColor: bg }}>
          <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: border, backgroundColor: bgAlt }}>
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[8px] text-white font-bold"
              style={{ backgroundColor: colors.primary }}>CS</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold truncate" style={{ color: textMain }}>Carlos Silva</div>
              <div className="text-[8px]" style={{ color: colors.positive }}>● online</div>
            </div>
            <div className="flex gap-1">
              {[colors.primary, colors.secondary, colors.neutral].map((c, i) => (
                <div key={i} className="w-4 h-4 rounded opacity-60" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex-1 p-2 space-y-1.5 flex flex-col justify-end overflow-hidden" style={{ backgroundColor: bg }}>
            <div className="self-start max-w-[75%] px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: msgBg, color: textMain }}>
              Olá, preciso de ajuda com meu pedido!
            </div>
            <div className="self-end max-w-[75%] px-2 py-1.5 rounded-lg text-[9px] text-white" style={{ backgroundColor: colors.primary }}>
              Pois não! Qual o número do pedido?
            </div>
            <div className="self-start max-w-[75%] px-2 py-1.5 rounded-lg text-[9px]" style={{ backgroundColor: msgBg, color: textMain }}>
              Pedido #12345, fiz ontem à tarde.
            </div>
            <div className="self-end max-w-[75%] px-2 py-1.5 rounded-lg text-[9px] text-white" style={{ backgroundColor: colors.primary }}>
              Encontrei aqui! Está em separação 📦
            </div>
          </div>
          <div className="px-2 py-1.5 border-t flex items-center gap-1.5" style={{ borderColor: border, backgroundColor: bgAlt }}>
            <div className="flex-1 h-6 rounded-full border px-2 flex items-center text-[9px]"
              style={{ borderColor: colors.primary + "44", color: textMuted, backgroundColor: inputBg }}>
              Mensagem...
            </div>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: colors.primary }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>,

    // Slide 2: Conversa detalhada
    <div key="conversation" className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: border }}>
      <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: border, backgroundColor: bgAlt }}>
        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ backgroundColor: colors.secondary }}>FL</div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: textMain }}>Fernanda Lima</div>
          <div className="text-[9px]" style={{ color: textMuted }}>+55 31 98765-4321 · WhatsApp</div>
        </div>
        <div className="flex gap-1.5">
          <div className="px-2 py-0.5 rounded-full text-[8px] font-medium text-white" style={{ backgroundColor: colors.positive }}>Aberto</div>
          <div className="px-2 py-0.5 rounded-full text-[8px] font-medium text-white" style={{ backgroundColor: colors.accent }}>Suporte</div>
        </div>
      </div>
      <div className="p-3 space-y-2 flex flex-col" style={{ backgroundColor: bg, minHeight: 160 }}>
        <div className="self-start flex gap-1.5 items-end max-w-[80%]">
          <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[7px] text-white font-bold mb-0.5" style={{ backgroundColor: colors.secondary }}>FL</div>
          <div className="px-2.5 py-1.5 rounded-lg rounded-bl-none text-[9px]" style={{ backgroundColor: msgBg, color: textMain }}>
            Boa tarde! Tenho uma dúvida sobre o plano Pro.
            <div className="text-[7px] mt-0.5 text-right" style={{ color: textMuted }}>14:22</div>
          </div>
        </div>
        <div className="self-end flex gap-1.5 items-end max-w-[80%]">
          <div className="px-2.5 py-1.5 rounded-lg rounded-br-none text-[9px] text-white" style={{ backgroundColor: colors.primary }}>
            Olá! Claro, pode perguntar! 😊
            <div className="text-[7px] mt-0.5 text-right opacity-75">14:23 ✓✓</div>
          </div>
        </div>
        <div className="self-start flex gap-1.5 items-end max-w-[80%]">
          <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[7px] text-white font-bold mb-0.5" style={{ backgroundColor: colors.secondary }}>FL</div>
          <div className="px-2.5 py-1.5 rounded-lg rounded-bl-none text-[9px]" style={{ backgroundColor: msgBg, color: textMain }}>
            Quantos usuários posso ter no plano Pro?
            <div className="text-[7px] mt-0.5 text-right" style={{ color: textMuted }}>14:24</div>
          </div>
        </div>
        <div className="self-end flex gap-1.5 items-end max-w-[80%]">
          <div className="px-2.5 py-1.5 rounded-lg rounded-br-none text-[9px] text-white" style={{ backgroundColor: colors.primary }}>
            No plano Pro você pode ter até <span className="font-bold">25 usuários</span> simultâneos!
            <div className="text-[7px] mt-0.5 text-right opacity-75">14:25 ✓✓</div>
          </div>
        </div>
        <div className="self-start flex gap-1.5 items-end max-w-[80%]">
          <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[7px] text-white font-bold mb-0.5" style={{ backgroundColor: colors.secondary }}>FL</div>
          <div className="px-2.5 py-1.5 rounded-lg rounded-bl-none text-[9px]" style={{ backgroundColor: msgBg, color: textMain }}>
            Ótimo! Vou contratar então 🎉
            <div className="text-[7px] mt-0.5 text-right" style={{ color: textMuted }}>14:26</div>
          </div>
        </div>
      </div>
      <div className="px-2.5 py-2 border-t flex items-center gap-2" style={{ borderColor: border, backgroundColor: bgAlt }}>
        <div className="w-5 h-5 rounded" style={{ backgroundColor: colors.neutral + "44" }} />
        <div className="flex-1 h-6 rounded-full border px-2.5 flex items-center text-[9px]"
          style={{ borderColor: colors.primary + "55", color: textMuted, backgroundColor: inputBg }}>
          Digite uma mensagem...
        </div>
        <div className="w-5 h-5 rounded" style={{ backgroundColor: colors.neutral + "44" }} />
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: colors.primary }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
        </div>
      </div>
    </div>,

    // Slide 3: Contatos
    <div key="contacts" className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: border }}>
      <div className="px-3 py-2 flex items-center justify-between border-b" style={{ borderColor: border, backgroundColor: bgAlt }}>
        <div className="text-[10px] font-semibold" style={{ color: textMain }}>Contatos <span className="font-normal" style={{ color: textMuted }}>(5)</span></div>
        <div className="flex gap-1.5">
          <div className="px-2 py-0.5 rounded text-[9px] text-white font-medium" style={{ backgroundColor: colors.primary }}>+ Novo</div>
          <div className="px-2 py-0.5 rounded text-[9px] font-medium border" style={{ borderColor: border, color: textMuted }}>Importar</div>
          <div className="px-2 py-0.5 rounded text-[9px] font-medium border" style={{ borderColor: border, color: textMuted }}>Exportar</div>
        </div>
      </div>
      <div className="px-3 py-1.5 border-b" style={{ borderColor: border, backgroundColor: inputBg }}>
        <div className="flex items-center gap-1.5 text-[9px]" style={{ color: textMuted }}>
          <div className="w-3 h-3 rounded-sm border" style={{ borderColor: textMuted + "66" }} />
          <span className="flex-1">Nome do Contato</span>
          <span className="w-28 shrink-0">Telefone</span>
          <span className="w-16 shrink-0">Tag</span>
          <span className="w-12 shrink-0 text-right">Ações</span>
        </div>
      </div>
      {mockContacts.map((c, i) => (
        <div key={c.name} className="flex items-center gap-1.5 px-3 py-2 border-b text-[9px]"
          style={{ borderColor: border, backgroundColor: i % 2 === 0 ? bg : bgAlt + "66" }}>
          <div className="w-3 h-3 rounded-sm border shrink-0" style={{ borderColor: border }} />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[7px] text-white font-bold"
              style={{ backgroundColor: c.tagColor }}>
              {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <span className="truncate font-medium" style={{ color: textMain }}>{c.name}</span>
          </div>
          <span className="w-28 shrink-0" style={{ color: textMuted }}>{c.phone}</span>
          <span className="w-16 shrink-0">
            <span className="px-1.5 py-0.5 rounded-full text-[8px] text-white font-medium" style={{ backgroundColor: c.tagColor }}>{c.tag}</span>
          </span>
          <div className="w-12 shrink-0 flex justify-end gap-1">
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: colors.primary + "33" }} />
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: colors.negative + "33" }} />
          </div>
        </div>
      ))}
      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: bgAlt, borderTop: `1px solid ${border}` }}>
        <span className="text-[9px]" style={{ color: textMuted }}>Mostrando 1–5 de 142</span>
        <div className="flex gap-1">
          {[1, 2, 3].map(p => (
            <div key={p} className="w-5 h-5 rounded flex items-center justify-center text-[9px]"
              style={{ backgroundColor: p === 1 ? colors.primary : border, color: p === 1 ? "white" : textMuted }}>
              {p}
            </div>
          ))}
        </div>
      </div>
    </div>,
  ];

  const slideNames = [t("mockSlide0"), t("mockSlide1"), t("mockSlide2"), t("mockSlide3")];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />{t("previewColors")}</CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSlide((slide - 1 + TOTAL) % TOTAL)}
              className="flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors hover:bg-muted"
              aria-label={t("mockPrev")}
            >
              ‹
            </button>
            {Array.from({ length: TOTAL }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlide(i)}
                className={`h-2 rounded-full transition-all ${i === slide ? "w-5" : "w-2 opacity-40 hover:opacity-70"}`}
                style={{ backgroundColor: i === slide ? colors.primary : undefined }}
                aria-label={slideNames[i]}
              />
            ))}
            <button
              type="button"
              onClick={() => setSlide((slide + 1) % TOTAL)}
              className="flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors hover:bg-muted"
              aria-label={t("mockNext")}
            >
              ›
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{slideNames[slide]}</p>
        {isDark && <p className="text-xs text-muted-foreground mt-0.5">{t("darkPaletteDesc")}</p>}
        {!isDark && <p className="text-xs text-muted-foreground mt-0.5">{t("lightPaletteDesc")}</p>}
      </CardHeader>
      <CardContent>
        {slides[slide]}
      </CardContent>
    </Card>
  );
}

export default function CustomizarPage() {
  const { resolvedTheme } = useTheme();
  const t = useTranslations("customizarPage");
  const tErrors = useTranslations("errors");
  const setBrandingSocketModel = useBrandingStore((s) => s.setSocketModelOptimized);

  const COLOR_FIELDS = getColorFields(t as TFunc);
  const PRESETS = getPresets(t as TFunc);
  const DARK_PRESETS = getDarkPresets(t as TFunc);

  // Paleta claro
  const [colors, setColors] = useState<Record<string, string>>({
    primary: "#1976d2", secondary: "#26c6da", accent: "#9c27b0",
    warning: "#fb8c00", negative: "#c10015", positive: "#21ba45",
    neutral: "#6c757d", light: "#f5f5f5",
  });
  const [savingColors, setSavingColors] = useState(false);

  // Paleta dark mode
  const [colorsDark, setColorsDark] = useState<Record<string, string>>(DARK_COLOR_DEFAULTS);
  const [savingColorsDark, setSavingColorsDark] = useState(false);

  // Toggle light/dark no editor de cores
  const [paletteMode, setPaletteMode] = useState<"light" | "dark">("light");

  // Slide do carousel de preview de cores
  const [previewSlide, setPreviewSlide] = useState(0);

  // Branding
  const [appName, setAppName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const logoDarkRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const pwaIconRef = useRef<HTMLInputElement>(null);
  // Cache-busting timestamp para forçar reload dos previews após upload
  const [logoTimestamp, setLogoTimestamp] = useState(() => Date.now());
  const [logoDarkTimestamp, setLogoDarkTimestamp] = useState(() => Date.now());
  const [faviconTimestamp, setFaviconTimestamp] = useState(() => Date.now());
  const [pwaIconTimestamp, setPwaIconTimestamp] = useState(() => Date.now());
  const [pwaIconErrors, setPwaIconErrors] = useState({ s128: false, s192: false, s512: false });
  const [previewErrors, setPreviewErrors] = useState({ favicon: false, logo: false, pwa: false, ios: false });
  // Timestamps de arquivos custom (0 = não customizado, >0 = ativo)
  const [logoCustomTimestamp, setLogoCustomTimestamp] = useState(0);
  const [logoDarkCustomTimestamp, setLogoDarkCustomTimestamp] = useState(0);
  const [faviconCustomTimestamp, setFaviconCustomTimestamp] = useState(0);
  const [deletingBranding, setDeletingBranding] = useState({ logo: false, logoDark: false, favicon: false });

  // Force Logout
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [forceLogout, setForceLogout] = useState(false);
  const [savingLogout, setSavingLogout] = useState(false);

  // Masterkey (always tenant id=1)
  const [masterkeyEnabled, setMasterkeyEnabled] = useState(false);
  const [masterkey, setMasterkey] = useState("");
  const [savingMasterkey, setSavingMasterkey] = useState(false);

  // Criptografia (always tenant id=1)
  const [encryptionKey, setEncryptionKey] = useState("");
  const [savingEncryption, setSavingEncryption] = useState(false);

  // Socket Model Novo
  const [socketModelOptimized, setSocketModelOptimized] = useState(false);
  const [savingSocketModel, setSavingSocketModel] = useState(false);

  // Termos para clientes (PLANO_ACEITE_TERMOS_REVENDA §5.6.3): a aba some na
  // licença de empresa única. null = ainda consultando (a aba só aparece depois
  // da resposta, sem piscar). Rota aditiva: backend antigo dá 404 → false.
  const [singleTenantLicense, setSingleTenantLicense] = useState<boolean | null>(null);
  useEffect(() => {
    fetchTenantLicensePolicy()
      .then((res) => setSingleTenantLicense(res.data?.singleTenant === true))
      .catch(() => setSingleTenantLicense(false));
  }, []);

  // Postman link (override do botao "Postman" em /api-service; salvo no banco — coluna Tenant.postmanLink)
  const POSTMAN_LINK_DEFAULT = "https://www.postman.com/comunidade-zdg/z-pro/collection/s16subg/postman-v3-x-x-x?action=share&creator=25151510";
  const [postmanLink, setPostmanLink] = useState("");
  const [savingPostmanLink, setSavingPostmanLink] = useState(false);
  async function handleSavePostmanLink() {
    setSavingPostmanLink(true);
    try {
      await updateTenantPostmanLink(1, postmanLink.trim());
      toast.success(t("postmanLinkSaved"));
    } catch {
      toast.error(tErrors("saveFailed"));
    } finally {
      setSavingPostmanLink(false);
    }
  }
  async function handleResetPostmanLink() {
    setSavingPostmanLink(true);
    try {
      await updateTenantPostmanLink(1, "");
      setPostmanLink("");
      toast.success(t("postmanLinkReset"));
    } catch {
      toast.error(tErrors("saveFailed"));
    } finally {
      setSavingPostmanLink(false);
    }
  }

  // Sons de notificação
  const [soundTimestamps, setSoundTimestamps] = useState({ ticket: 0, chat: 0, support: 0 });
  const [uploadingSounds, setUploadingSounds] = useState({ ticket: false, chat: false, support: false });
  const ticketSoundRef = useRef<HTMLInputElement>(null);
  const chatSoundRef = useRef<HTMLInputElement>(null);
  const supportSoundRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNotificationSounds()
      .then(({ data }: any) => {
        setSoundTimestamps({
          ticket:  data.ticketTimestamp  || 0,
          chat:    data.chatTimestamp    || 0,
          support: data.supportTimestamp || 0,
        });
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  async function handleSoundUpload(type: 'ticket' | 'chat' | 'support', file: File) {
    setUploadingSounds(prev => ({ ...prev, [type]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      await uploadNotificationSound(type, fd);
      setSoundTimestamps(prev => ({ ...prev, [type]: Date.now() }));
      toast.success(t("soundUploaded"));
    } catch { toast.error(t("errorUploadSound")); }
    finally { setUploadingSounds(prev => ({ ...prev, [type]: false })); }
  }

  const [deletingSounds, setDeletingSounds] = useState({ ticket: false, chat: false, support: false });

  async function handleSoundDelete(type: 'ticket' | 'chat' | 'support') {
    setDeletingSounds(prev => ({ ...prev, [type]: true }));
    try {
      await deleteNotificationSound(type);
      setSoundTimestamps(prev => ({ ...prev, [type]: 0 }));
      toast.success(t("soundDeleted"));
    } catch { toast.error(tErrors("saveFailed")); }
    finally { setDeletingSounds(prev => ({ ...prev, [type]: false })); }
  }

  async function handleBrandingDelete(asset: 'logo' | 'logoDark' | 'favicon') {
    setDeletingBranding(prev => ({ ...prev, [asset]: true }));
    try {
      if (asset === 'logo') {
        await deleteLogoNovo();
        setLogoCustomTimestamp(0);
        setLogoTimestamp(Date.now());
        toast.success(t("logoDeleted"));
      } else if (asset === 'logoDark') {
        await deleteLogoDarkNovo();
        setLogoDarkCustomTimestamp(0);
        setLogoDarkTimestamp(Date.now());
        toast.success(t("logoDarkDeleted"));
      } else {
        await deleteFaviconNovo();
        setFaviconCustomTimestamp(0);
        setFaviconTimestamp(Date.now());
        toast.success(t("faviconDeleted"));
      }
    } catch { toast.error(tErrors("saveFailed")); }
    finally { setDeletingBranding(prev => ({ ...prev, [asset]: false })); }
  }

  // Login Variant Novo
  const [loginVariant, setLoginVariant] = useState("variant-1");
  const [loginPreviewDark, setLoginPreviewDark] = useState(false);
  const [loginSideText, setLoginSideText] = useState(true);
  const [loginShowRegisterButton, setLoginShowRegisterButton] = useState(true);
  const [loginShowMasterKeyButton, setLoginShowMasterKeyButton] = useState(true);
  const [savingLoginVariant, setSavingLoginVariant] = useState(false);
  const [savingSideText, setSavingSideText] = useState(false);
  const [savingShowRegisterButton, setSavingShowRegisterButton] = useState(false);
  const [savingShowMasterKeyButton, setSavingShowMasterKeyButton] = useState(false);
  const [uploadingSideBg, setUploadingSideBg] = useState(false);
  const [deletingSideBg, setDeletingSideBg] = useState(false);
  const [sideBgTimestamp, setSideBgTimestamp] = useState(() => Date.now());
  const [sideBgMediaType, setSideBgMediaType] = useState<'image' | 'video' | null>(null);
  const sideBgRef = useRef<HTMLInputElement>(null);

  // Signup Variant Novo (internacionalização do signup)
  const [signupConfig, setSignupConfig] = useState<SignupVariantConfig>({
    enabled: true,
    documentMode: "br",
    documentRequired: true,
    documentLabel: "",
    phoneFormat: "br",
    phoneRequired: true,
    defaultCountry: "BR",
    skipPaymentGateway: false,
  });
  const [savingSignup, setSavingSignup] = useState<string | null>(null);

  useEffect(() => {
    fetchSignupVariantNovo()
      .then(({ data }) => { if (data) setSignupConfig(data); })
      .catch(() => { /* silenciar */ });
  }, []);

  async function patchSignupConfig(updates: Partial<SignupVariantConfig>, key: string) {
    setSavingSignup(key);
    const previous = signupConfig;
    setSignupConfig((p) => ({ ...p, ...updates }));
    try {
      const { data } = await updateSignupVariantNovo(updates);
      if (data) setSignupConfig(data);
    } catch {
      setSignupConfig(previous);
      toast.error(tErrors("saveFailed"));
    } finally {
      setSavingSignup(null);
    }
  }

  useEffect(() => {
    const url = getLoginSideBgUrl(sideBgTimestamp);
    fetch(url, { method: 'HEAD' })
      .then(r => {
        if (!r.ok) { setSideBgMediaType(null); return; }
        const ct = r.headers.get('Content-Type') ?? '';
        setSideBgMediaType(ct.startsWith('video/') ? 'video' : 'image');
      })
      .catch(() => setSideBgMediaType(null));
  }, [sideBgTimestamp]);

  // Tutorials
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [tutorialsLoading, setTutorialsLoading] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialEditing, setTutorialEditing] = useState<Tutorial | null>(null);
  const [tutorialDel, setTutorialDel] = useState<Tutorial | null>(null);
  const [tutorialTitle, setTutorialTitle] = useState("");
  const [tutorialDesc, setTutorialDesc] = useState("");
  const [tutorialLink, setTutorialLink] = useState("");
  const [tutorialActive, setTutorialActive] = useState(true);
  const [tutorialOrder, setTutorialOrder] = useState<number | "">("");
  const [tutorialFile, setTutorialFile] = useState<File | null>(null);
  const [tutorialPreview, setTutorialPreview] = useState<string>("");
  const [tutorialSaving, setTutorialSaving] = useState(false);
  const [tutPage, setTutPage] = useState(1);
  const [tutTotal, setTutTotal] = useState(0);
  const tutorialFileRef = useRef<HTMLInputElement>(null);

  // Carregar login variant do frontendNovo
  useEffect(() => {
    fetchLoginVariantNovo()
      .then(({ data }) => {
        const d = data as { variant?: string; showSideText?: boolean; showRegisterButton?: boolean; showMasterKeyButton?: boolean };
        const v = d?.variant ?? "variant-1";
        const st = d?.showSideText !== false;
        const srb = d?.showRegisterButton !== false;
        const smkb = d?.showMasterKeyButton !== false;
        setLoginVariant(v);
        setLoginSideText(st);
        setLoginShowRegisterButton(srb);
        setLoginShowMasterKeyButton(smkb);
        try {
          localStorage.setItem("loginVariantNovo", v);
          localStorage.setItem("loginSideText", st ? "1" : "0");
          localStorage.setItem("loginShowRegisterButton", srb ? "1" : "0");
          localStorage.setItem("loginShowMasterKeyButton", smkb ? "1" : "0");
        } catch { /* silenciar */ }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  async function handleSaveLoginVariant() {
    setSavingLoginVariant(true);
    try {
      await updateLoginVariantNovo(loginVariant, loginSideText);
      try {
        localStorage.setItem("loginVariantNovo", loginVariant);
        localStorage.setItem("loginSideText", loginSideText ? "1" : "0");
      } catch { /* silenciar */ }
      toast.success(t("loginVariantSaved"));
    } catch { toast.error(t("loginVariantError")); }
    finally { setSavingLoginVariant(false); }
  }

  async function handleSaveSideText(value: boolean) {
    setLoginSideText(value);
    setSavingSideText(true);
    try {
      await updateLoginSideTextNovo(value);
      try { localStorage.setItem("loginSideText", value ? "1" : "0"); } catch { /* silenciar */ }
    } catch { toast.error(t("loginVariantError")); }
    finally { setSavingSideText(false); }
  }

  async function handleSaveShowRegisterButton(value: boolean) {
    setLoginShowRegisterButton(value);
    setSavingShowRegisterButton(true);
    try {
      await updateLoginShowRegisterButtonNovo(value);
      try { localStorage.setItem("loginShowRegisterButton", value ? "1" : "0"); } catch { /* silenciar */ }
    } catch { toast.error(t("loginVariantError")); }
    finally { setSavingShowRegisterButton(false); }
  }

  async function handleSaveShowMasterKeyButton(value: boolean) {
    setLoginShowMasterKeyButton(value);
    setSavingShowMasterKeyButton(true);
    try {
      await updateLoginShowMasterKeyButtonNovo(value);
      try { localStorage.setItem("loginShowMasterKeyButton", value ? "1" : "0"); } catch { /* silenciar */ }
    } catch { toast.error(t("loginVariantError")); }
    finally { setSavingShowMasterKeyButton(false); }
  }

  async function handleUploadSideBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSideBg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await uploadLoginSideBg(fd);
      setSideBgTimestamp(Date.now());
      toast.success(t("loginSideBgUploaded"));
    } catch { toast.error(t("loginVariantError")); }
    finally {
      setUploadingSideBg(false);
      if (sideBgRef.current) sideBgRef.current.value = "";
    }
  }

  async function handleDeleteSideBg() {
    setDeletingSideBg(true);
    try {
      await deleteLoginSideBg();
      setSideBgTimestamp(Date.now());
      toast.success(t("loginSideBgDeleted"));
    } catch { toast.error(t("loginVariantError")); }
    finally { setDeletingSideBg(false); }
  }

  // Carregar configuração de socket model do frontendNovo
  useEffect(() => {
    fetchSocketModelNovo()
      .then(({ data }) => {
        const optimized = !!(data as { isOptimized?: boolean })?.isOptimized;
        setSocketModelOptimized(optimized);
        try {
          localStorage.setItem("socketModelNovo", optimized ? "optimized" : "standard");
        } catch { /* silenciar */ }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  async function handleSaveSocketModel() {
    setSavingSocketModel(true);
    try {
      await updateSocketModelNovo(socketModelOptimized);
      try {
        localStorage.setItem("socketModelNovo", socketModelOptimized ? "optimized" : "standard");
      } catch { /* silenciar */ }
      // Atualiza o store para que os hooks reajam imediatamente sem reload
      setBrandingSocketModel(socketModelOptimized);
      toast.success(t("socketModelSaved"));
    } catch { toast.error(t("socketModelError")); }
    finally { setSavingSocketModel(false); }
  }

  // Carregar branding (nome do app, timestamps) e paleta de cores ao abrir a página
  useEffect(() => {
    fetchBranding()
      .then(({ data }) => {
        if (data?.appName) setAppName(data.appName);
        if (data?.pwaIconTimestamp) setPwaIconTimestamp(data.pwaIconTimestamp as number);
        if (data?.logoTimestamp) setLogoCustomTimestamp(data.logoTimestamp as number);
        if (data?.logoDarkTimestamp) setLogoDarkCustomTimestamp(data.logoDarkTimestamp as number);
        if (data?.faviconTimestamp) setFaviconCustomTimestamp(data.faviconTimestamp as number);
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });

    fetchSystemColors()
      .then(({ data }) => {
        const savedColors = data?.colors as Record<string, string> | undefined;
        if (savedColors && typeof savedColors === "object") {
          setColors((prev) => ({ ...prev, ...savedColors }));
        }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });

    fetchSystemColorsDark()
      .then(({ data }) => {
        const saved = data?.colors as Record<string, string> | undefined;
        if (saved && typeof saved === "object" && Object.values(saved).some((v) => !!v)) {
          setColorsDark((prev) => ({ ...prev, ...saved }));
        }
      })
      .catch(() => { toast.error(tErrors("loadFailed")); });
  }, []);

  // Load tenants for force logout + masterkey/encryption initial values
  useEffect(() => {
    async function loadTenants() {
      try {
        const { data } = await fetchTenants();
        const list: Tenant[] = Array.isArray(data) ? data : (data as { tenants?: Tenant[] })?.tenants ?? [];
        setTenants(list);
        // Load masterkey, encryption & postmanLink from tenant id=1
        const master = list.find((ten) => ten.id === 1);
        if (master) {
          setMasterkeyEnabled((master as unknown as Record<string, string>).masterkeyEnabled === "enabled");
          setMasterkey((master as unknown as Record<string, string>).masterkey || "");
          setEncryptionKey((master as unknown as Record<string, string>).encryptionkey || "");
          setPostmanLink((master as unknown as Record<string, string>).postmanLink || "");
        }
      } catch { /* silent */ }
    }
    loadTenants();
  }, []);

  async function handleSaveColors() {
    setSavingColors(true);
    try {
      await saveSystemColors(colors);
      const isDark = document.documentElement.classList.contains("dark");
      applyBrandColors(colors, isDark, colorsDark);
      localStorage.setItem("storedColors", JSON.stringify([colors]));
      toast.success(t("colorsSaved"));
    } catch { toast.error(t("errorSaveColors")); }
    finally { setSavingColors(false); }
  }

  async function handleSaveDarkColors() {
    setSavingColorsDark(true);
    try {
      await saveSystemColorsDark(colorsDark);
      const isDark = document.documentElement.classList.contains("dark");
      applyBrandColors(colors, isDark, colorsDark);
      localStorage.setItem("storedColorsDark", JSON.stringify(colorsDark));
      toast.success(t("colorsDarkSaved"));
    } catch { toast.error(t("errorSaveColorsDark")); }
    finally { setSavingColorsDark(false); }
  }

  async function handleSaveName() {
    if (!appName.trim()) { toast.error(t("nameMandatory")); return; }
    setSavingName(true);
    try {
      await updateAppNameNovo(appName.trim());
      // Atualiza o <title> da aba imediatamente
      setBaseTitle(appName.trim());
      toast.success(t("nameUpdated"));
    } catch { toast.error(t("errorUpdateName")); }
    finally { setSavingName(false); }
  }

  async function handleUpload(type: "logo" | "logoDark" | "favicon" | "pwaIcon", file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      if (type === "logo") {
        await uploadLogoNovo(fd);
        const ts = Date.now();
        setLogoTimestamp(ts);
        setLogoCustomTimestamp(ts);
        setPreviewErrors(p => ({ ...p, logo: false }));
      } else if (type === "logoDark") {
        await uploadLogoDarkNovo(fd);
        const ts = Date.now();
        setLogoDarkTimestamp(ts);
        setLogoDarkCustomTimestamp(ts);
        setPreviewErrors(p => ({ ...p, logo: false }));
      } else if (type === "pwaIcon") {
        await uploadPwaIconNovo(fd);
        setPwaIconTimestamp(Date.now());
        setPwaIconErrors({ s128: false, s192: false, s512: false });
        setPreviewErrors(p => ({ ...p, pwa: false, ios: false }));
      } else {
        await uploadFaviconNovo(fd);
        const ts = Date.now();
        setFaviconTimestamp(ts);
        setFaviconCustomTimestamp(ts);
        setPreviewErrors(p => ({ ...p, favicon: false }));
      }
      toast.success(t("fileSent"));
    } catch { toast.error(t("errorSendFile")); }
  }

  async function handleSaveLogout() {
    if (!selectedTenantId) { toast.error(t("selectTenantError")); return; }
    setSavingLogout(true);
    try {
      await api.put(`/tenantsForceLogout/${selectedTenantId}`, {
        id: selectedTenantId,
        forceLogout: forceLogout ? "enabled" : "disabled",
      });
      setTenants((prev) => prev.map((t) =>
        t.id === selectedTenantId ? { ...t, forceLogout: forceLogout ? "enabled" : "disabled" } : t
      ));
      toast.success(t("configSaved"));
    } catch { toast.error(t("errorSave")); }
    finally { setSavingLogout(false); }
  }

  async function handleSaveMasterkey() {
    setSavingMasterkey(true);
    try {
      await api.put("/tenantsMasterKey/1", {
        id: 1,
        masterkey,
        masterkeyEnabled: masterkeyEnabled ? "enabled" : "disabled",
      });
      toast.success(t("masterkeySaved"));
    } catch { toast.error(t("errorSaveMasterkey")); }
    finally { setSavingMasterkey(false); }
  }

  const TUTS_PER_PAGE = 10;
  const tutsTotalPages = Math.max(1, Math.ceil(tutTotal / TUTS_PER_PAGE));

  const tutorialSensors = useSensors(useSensor(PointerSensor));

  const loadTutorials = useCallback(async (page = 1) => {
    setTutorialsLoading(true);
    try {
      const { data } = await fetchTutorials({ pageNumber: page, pageSize: TUTS_PER_PAGE });
      setTutorials(Array.isArray(data.tutorials) ? data.tutorials : []);
      setTutTotal(data.count ?? 0);
      setTutPage(page);
    } catch { toast.error(t("errorLoadTutorials")); }
    finally { setTutorialsLoading(false); }
  }, [t]);

  const handleTutorialDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tutorials.findIndex((t) => t.id === active.id);
    const newIndex = tutorials.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(tutorials, oldIndex, newIndex).map((tut, i) => ({
      ...tut,
      sortOrder: i + 1,
    }));
    setTutorials(reordered);
    try {
      await Promise.all(
        reordered.map((tut) => {
          const fd = new FormData();
          fd.append("sortOrder", String(tut.sortOrder));
          return updateTutorial(tut.id, fd);
        })
      );
      toast.success(t("tutorialUpdated"));
    } catch {
      toast.error(t("errorSaveTutorial"));
      loadTutorials();
    }
  };

  const openCreateTutorial = () => {
    setTutorialEditing(null);
    setTutorialTitle(""); setTutorialDesc(""); setTutorialLink("");
    setTutorialActive(true); setTutorialOrder(""); setTutorialFile(null); setTutorialPreview("");
    setTutorialOpen(true);
  };

  const openEditTutorial = (tut: Tutorial) => {
    setTutorialEditing(tut);
    setTutorialTitle(tut.title); setTutorialDesc(tut.description || "");
    setTutorialLink(tut.link || ""); setTutorialActive(tut.isActive);
    setTutorialOrder(tut.sortOrder ?? "");
    setTutorialFile(null); setTutorialPreview(tut.thumbnailUrl || "");
    setTutorialOpen(true);
  };

  const handleTutorialSave = async () => {
    if (!tutorialTitle.trim()) { toast.error(t("titleRequired")); return; }
    setTutorialSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", tutorialTitle.trim());
      fd.append("description", tutorialDesc);
      fd.append("link", tutorialLink);
      fd.append("isActive", String(tutorialActive));
      fd.append("sortOrder", tutorialOrder !== "" ? String(tutorialOrder) : "");
      if (tutorialFile) fd.append("thumbnail", tutorialFile);
      if (tutorialEditing) {
        await updateTutorial(tutorialEditing.id, fd);
        toast.success(t("tutorialUpdated"));
      } else {
        await createTutorial(fd);
        toast.success(t("tutorialCreated"));
      }
      setTutorialOpen(false);
      loadTutorials();
    } catch { toast.error(t("errorSaveTutorial")); }
    finally { setTutorialSaving(false); }
  };

  const handleTutorialDelete = async () => {
    if (!tutorialDel) return;
    try {
      await deleteTutorial(tutorialDel.id);
      toast.success(t("tutorialDeleted"));
      setTutorialDel(null);
      loadTutorials();
    } catch { toast.error(t("errorDeleteTutorial")); }
  };

  const handleDuplicate = async (tut: Tutorial) => {
    try {
      const fd = new FormData();
      fd.append("title", `${tut.title} ${t("copySuffix")}`);
      fd.append("description", tut.description || "");
      fd.append("link", tut.link || "");
      fd.append("isActive", String(tut.isActive));
      await createTutorial(fd);
      toast.success(t("tutorialDuplicated"));
      loadTutorials();
    } catch { toast.error(t("errorDuplicateTutorial")); }
  };

  async function handleSaveEncryption() {
    if (encryptionKey && encryptionKey.length > 0 && encryptionKey.length < 16) {
      toast.error(t("encryptionMinChars"));
      return;
    }
    setSavingEncryption(true);
    try {
      await api.put("/tenantsEncryptionKey/1", {
        id: 1,
        encryptionkey: encryptionKey,
      });
      toast.success(t("encryptionSaved"));
    } catch { toast.error(t("errorSaveEncryption")); }
    finally { setSavingEncryption(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("descriptionFull")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1"), t("helpS2I2")] },
            // Só onde a aba Termos existe (fora da licença de empresa única).
            ...(singleTenantLicense === false
              ? [{ title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2")] }]
              : []),
          ],
        }}
      />

      <Tabs defaultValue="cores">
        <div className="mb-4">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 xl:grid-cols-7 h-auto gap-1">
            <TabsTrigger value="cores" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Palette className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabColors")}</TabsTrigger>
            <TabsTrigger value="sons" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Volume2 className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabSounds")}</TabsTrigger>
            <TabsTrigger value="branding" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Image className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabBranding")}</TabsTrigger>
            <TabsTrigger value="tipografia" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Type className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabTypography")}</TabsTrigger>
            <TabsTrigger value="login" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Monitor className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabLogin")}</TabsTrigger>
            <TabsTrigger value="signup" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><UserPlus className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabSignup")}</TabsTrigger>
            <TabsTrigger value="api" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Code2 className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabApi")}</TabsTrigger>
            <TabsTrigger value="tutoriais" onClick={() => loadTutorials(1)} className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><BookOpen className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabTutorials")}</TabsTrigger>
            <TabsTrigger value="logout" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><LogOut className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabForceLogout")}</TabsTrigger>
            <TabsTrigger value="masterkey" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Key className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabMasterkey")}</TabsTrigger>
            <TabsTrigger value="criptografia" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Lock className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabEncryption")}</TabsTrigger>
            <TabsTrigger value="socket" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><Zap className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabSocket")}</TabsTrigger>
            {singleTenantLicense === false && (
              <TabsTrigger value="termos" className="min-w-0 h-full whitespace-normal text-center leading-tight px-2 md:px-3 text-xs md:text-sm"><ScrollText className="mr-1.5 h-3.5 w-3.5 shrink-0 md:mr-2 md:h-4 md:w-4" />{t("tabTerms")}</TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Cores */}
        <TabsContent value="cores">
          <div className="space-y-4">
            {/* Toggle Light / Dark */}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-1 w-fit">
              <button
                type="button"
                onClick={() => setPaletteMode("light")}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${paletteMode === "light" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Sun className="h-4 w-4" />{t("lightPalette")}
              </button>
              <button
                type="button"
                onClick={() => setPaletteMode("dark")}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${paletteMode === "dark" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Moon className="h-4 w-4" />{t("darkPalette")}
              </button>
            </div>

            {paletteMode === "light" ? (
              <>
                {/* Preview claro — carousel */}
                <ColorPreviewCarousel
                  colors={colors}
                  isDark={false}
                  slide={previewSlide}
                  setSlide={setPreviewSlide}
                  t={t as TFunc}
                />

                {/* Presets claro */}
                <Card>
                  <CardHeader><CardTitle>{t("presetPalettes")}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {PRESETS.map((preset) => (
                        <button key={preset.name} type="button"
                          onClick={() => setColors({ ...colors, ...preset.colors })}
                          className="group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted/40"
                        >
                          <div className="flex gap-1">
                            {["primary","secondary","accent","positive","negative"].map((k) => (
                              <span key={k} className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: preset.colors[k] }} />
                            ))}
                          </div>
                          <span className="text-xs font-medium leading-none">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Editor manual claro */}
                <Card>
                  <CardHeader><CardTitle>{t("systemColors")}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {COLOR_FIELDS.map(({ key, label }) => (
                        <div key={key} className="space-y-1.5">
                          <Label>{label}</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={colors[key] || "#000000"}
                              onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                              className="h-9 w-9 cursor-pointer rounded border p-0.5"
                            />
                            <Input value={colors[key] || ""}
                              onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                              className="font-mono text-sm" placeholder="#000000"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button onClick={handleSaveColors} disabled={savingColors}>
                      {savingColors ? t("saving") : t("save")}
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                {/* Preview dark — carousel */}
                <ColorPreviewCarousel
                  colors={colorsDark}
                  isDark={true}
                  slide={previewSlide}
                  setSlide={setPreviewSlide}
                  t={t as TFunc}
                />

                {/* Presets dark */}
                <Card>
                  <CardHeader><CardTitle>{t("presetPalettesDark")}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {DARK_PRESETS.map((preset) => (
                        <button key={preset.name} type="button"
                          onClick={() => setColorsDark({ ...colorsDark, ...preset.colors })}
                          className="group flex flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-left transition-colors hover:border-primary"
                        >
                          <div className="flex gap-1">
                            {["primary","secondary","accent","positive","negative"].map((k) => (
                              <span key={k} className="h-5 w-5 rounded-full border border-white/10" style={{ backgroundColor: preset.colors[k] }} />
                            ))}
                          </div>
                          <span className="text-xs font-medium leading-none text-neutral-200">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Editor manual dark */}
                <Card>
                  <CardHeader><CardTitle>{t("systemColorsDark")}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {COLOR_FIELDS.map(({ key, label }) => (
                        <div key={key} className="space-y-1.5">
                          <Label>{label}</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={colorsDark[key] || "#000000"}
                              onChange={(e) => setColorsDark({ ...colorsDark, [key]: e.target.value })}
                              className="h-9 w-9 cursor-pointer rounded border p-0.5"
                            />
                            <Input value={colorsDark[key] || ""}
                              onChange={(e) => setColorsDark({ ...colorsDark, [key]: e.target.value })}
                              className="font-mono text-sm" placeholder="#000000"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button onClick={handleSaveDarkColors} disabled={savingColorsDark}>
                      {savingColorsDark ? t("saving") : t("saveDark")}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 mb-5 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
            <span className="mt-0.5 shrink-0">ℹ️</span>
            <span>{t("mediaFileNote")}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t("appName")}</CardTitle></CardHeader>
              <CardContent className="flex gap-3">
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder={t("appNameInputPlaceholder")}
                  className="max-w-sm"
                />
                <Button onClick={handleSaveName} disabled={savingName}>
                  {savingName ? t("saving") : t("save")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("logoLight")}</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4 flex-wrap">
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("logo", f); }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={logoTimestamp}
                  src={getLogoUrl(logoTimestamp)}
                  alt="Logo atual"
                  className="h-12 max-w-[160px] rounded border object-contain p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <Button variant="outline" onClick={() => logoRef.current?.click()}>
                  {t("changeLogoLight")}
                </Button>
                {logoCustomTimestamp > 0 && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={deletingBranding.logo} onClick={() => handleBrandingDelete("logo")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <span className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", logoCustomTimestamp > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-muted bg-muted/40 text-muted-foreground"].join(" ")}>
                  <span className={["h-1.5 w-1.5 rounded-full", logoCustomTimestamp > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"].join(" ")} />
                  {logoCustomTimestamp > 0 ? t("fileCustomized") : t("fileDefault")}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("logoDark")}</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4 flex-wrap">
                <input
                  ref={logoDarkRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("logoDark", f); }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={logoDarkTimestamp}
                  src={getLogoDarkUrl(logoDarkTimestamp)}
                  alt="Logo escuro atual"
                  className="h-12 max-w-[160px] rounded border bg-gray-800 object-contain p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <Button variant="outline" onClick={() => logoDarkRef.current?.click()}>
                  {t("changeLogoDark")}
                </Button>
                {logoDarkCustomTimestamp > 0 && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={deletingBranding.logoDark} onClick={() => handleBrandingDelete("logoDark")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <span className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", logoDarkCustomTimestamp > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-muted bg-muted/40 text-muted-foreground"].join(" ")}>
                  <span className={["h-1.5 w-1.5 rounded-full", logoDarkCustomTimestamp > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"].join(" ")} />
                  {logoDarkCustomTimestamp > 0 ? t("fileCustomized") : t("fileDefault")}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("favicon")}</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4 flex-wrap">
                <input
                  ref={faviconRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("favicon", f); }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={faviconTimestamp}
                  src={getFaviconUrl(faviconTimestamp)}
                  alt="Favicon atual"
                  className="h-10 w-10 rounded border object-contain p-0.5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <Button variant="outline" onClick={() => faviconRef.current?.click()}>
                  {t("changeFavicon")}
                </Button>
                {faviconCustomTimestamp > 0 && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={deletingBranding.favicon} onClick={() => handleBrandingDelete("favicon")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <span className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", faviconCustomTimestamp > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-muted bg-muted/40 text-muted-foreground"].join(" ")}>
                  <span className={["h-1.5 w-1.5 rounded-full", faviconCustomTimestamp > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"].join(" ")} />
                  {faviconCustomTimestamp > 0 ? t("fileCustomized") : t("fileDefault")}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("pwaIcon")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("pwaIconDesc")}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={pwaIconRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload("pwaIcon", f); if (pwaIconRef.current) pwaIconRef.current.value = ""; }}
                />
                <div className="flex flex-wrap items-end gap-6">
                  <div className="flex flex-col items-center gap-1.5">
                    {pwaIconErrors.s192 ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed text-[10px] text-muted-foreground">sem ícone</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPwaIconUrl("icon-192x192.png", pwaIconTimestamp)}
                        alt="PWA icon 192x192"
                        className="h-16 w-16 rounded-xl border object-contain p-1"
                        onError={() => setPwaIconErrors((p) => ({ ...p, s192: true }))}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">192×192</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    {pwaIconErrors.s512 ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed text-[10px] text-muted-foreground">sem ícone</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPwaIconUrl("icon-512x512.png", pwaIconTimestamp)}
                        alt="PWA icon 512x512"
                        className="h-16 w-16 rounded-xl border object-contain p-1"
                        onError={() => setPwaIconErrors((p) => ({ ...p, s512: true }))}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">512×512</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    {pwaIconErrors.s128 ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed text-[9px] text-muted-foreground">–</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPwaIconUrl("icon-128x128.png", pwaIconTimestamp)}
                        alt="PWA icon 128x128"
                        className="h-8 w-8 rounded-lg border object-contain p-0.5"
                        onError={() => setPwaIconErrors((p) => ({ ...p, s128: true }))}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">128×128</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Button variant="outline" onClick={() => pwaIconRef.current?.click()}>
                    {t("changePwaIcon")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("pwaIconHint")}</p>
                </div>
              </CardContent>
            </Card>

          </div>{/* fim col esquerda branding */}
          <div className="space-y-4 lg:sticky lg:top-4">
            {/* Preview do branding */}
            <p className="text-sm text-muted-foreground">{t("previewDesc")}</p>

            {/* Browser / App Web mock */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" />{t("previewBrowser")}</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg overflow-hidden border shadow-md max-w-2xl">
                  {/* Chrome bar */}
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 flex items-center gap-2 border-b">
                    <div className="flex gap-1.5 shrink-0">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 rounded-t-md border border-b-0 px-2 py-1 text-[11px] max-w-[180px] shrink-0">
                      {previewErrors.favicon
                        ? <div className="w-3 h-3 rounded-sm bg-muted shrink-0" />
                        : <img src={getFaviconUrl(faviconTimestamp)} className="w-3 h-3 object-contain shrink-0" onError={() => setPreviewErrors(p => ({ ...p, favicon: true }))} alt="" />}
                      <span className="truncate">{appName || "App"}</span>
                      <span className="text-muted-foreground shrink-0 ml-1">×</span>
                    </div>
                    <div className="flex-1 bg-white dark:bg-gray-900 border rounded-full px-3 py-0.5 text-[11px] text-muted-foreground truncate min-w-0">
                      🔒 localhost:3000
                    </div>
                  </div>
                  {/* App layout */}
                  <div className="flex h-44">
                    {/* Sidebar */}
                    <div className="w-14 shrink-0 flex flex-col items-center gap-2 py-3" style={{ backgroundColor: colors.primary }}>
                      {previewErrors.logo
                        ? <div className="w-8 h-6 rounded bg-white/20" />
                        : <img src={getLogoUrl(logoTimestamp)} className="w-8 h-6 object-contain" onError={() => setPreviewErrors(p => ({ ...p, logo: true }))} alt="" />}
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className={`w-8 h-8 rounded-lg ${i === 0 ? "bg-white/30" : "bg-white/15"}`} />
                      ))}
                    </div>
                    {/* Content */}
                    <div className="flex-1 bg-background p-3 space-y-2.5 overflow-hidden">
                      <div className="h-3 w-32 rounded-full" style={{ backgroundColor: colors.primary + "44" }} />
                      <div className="grid grid-cols-3 gap-2">
                        {([colors.primary, colors.positive, colors.negative] as string[]).map((c, i) => (
                          <div key={i} className="h-14 rounded-lg p-2" style={{ backgroundColor: c + "18", borderLeft: `3px solid ${c}` }}>
                            <div className="h-2 w-8 rounded-full mb-1.5" style={{ backgroundColor: c + "66" }} />
                            <div className="h-4 w-10 rounded" style={{ backgroundColor: c + "44" }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <div className="h-7 w-20 rounded-md" style={{ backgroundColor: colors.primary }} />
                        <div className="h-7 w-20 rounded-md border" style={{ borderColor: colors.primary, backgroundColor: colors.primary + "18" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mobile mocks */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" />{t("previewMobile")}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-8 items-end">

                  {/* Android PWA install prompt */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("previewAndroid")}</span>
                    <div className="w-52 rounded-3xl border-[3px] border-gray-700 overflow-hidden bg-gray-900 shadow-xl">
                      <div className="h-5 bg-gray-800 flex items-center justify-between px-3">
                        <span className="text-[9px] text-white">9:41</span>
                        <div className="flex gap-0.5 items-center">
                          <div className="w-3 h-2 bg-white/50 rounded-sm" />
                          <div className="w-3 h-2 bg-white/50 rounded-sm" />
                        </div>
                      </div>
                      <div className="h-28 p-2 space-y-1.5 opacity-30" style={{ backgroundColor: colors.primary + "22" }}>
                        <div className="h-3 w-16 bg-white/30 rounded" />
                        <div className="h-10 bg-white/10 rounded" />
                        <div className="h-3 w-20 bg-white/20 rounded" />
                      </div>
                      <div className="bg-white dark:bg-gray-100 rounded-t-2xl p-3">
                        <div className="w-8 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                        <div className="flex items-center gap-2.5 mb-3">
                          {previewErrors.pwa
                            ? <div className="w-12 h-12 rounded-xl bg-gray-100 border shrink-0" />
                            : <img src={getPwaIconUrl("icon-192x192.png", pwaIconTimestamp)} className="w-12 h-12 rounded-xl object-contain border shrink-0" onError={() => setPreviewErrors(p => ({ ...p, pwa: true }))} alt="" />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{appName || "App"}</p>
                            <p className="text-[10px] text-gray-500">localhost:3000</p>
                            <p className="text-[10px] text-gray-400">Verificado pelo Google</p>
                          </div>
                        </div>
                        <button className="w-full text-white text-xs py-2 rounded-full font-medium" style={{ backgroundColor: colors.primary }}>
                          Instalar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* iOS home screen */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("previewIos")}</span>
                    <div className="w-44 rounded-3xl border-[3px] border-gray-700 overflow-hidden shadow-xl bg-gray-900">
                      <div className="h-6 bg-gray-900 flex items-center justify-between px-3">
                        <span className="text-[9px] text-white">9:41</span>
                        <div className="w-16 h-3 bg-gray-700 rounded-full" />
                        <span className="text-[9px] text-white">100%</span>
                      </div>
                      <div className="bg-gradient-to-b from-sky-500 to-indigo-700 p-3 space-y-2 pb-5">
                        <div className="grid grid-cols-4 gap-2">
                          {[...Array(4)].map((_, i) => <div key={i} className="w-9 h-9 rounded-2xl bg-white/20" />)}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="flex flex-col items-center gap-0.5">
                            {previewErrors.ios
                              ? <div className="w-9 h-9 rounded-2xl bg-white/20" />
                              : <img src={getPwaIconUrl("apple-icon-180x180.png", pwaIconTimestamp)} className="w-9 h-9 rounded-2xl object-contain" onError={() => setPreviewErrors(p => ({ ...p, ios: true }))} alt="" />}
                            <span className="text-white text-[8px] font-medium leading-tight text-center truncate w-10">{(appName || "App").slice(0, 8)}</span>
                          </div>
                          {[...Array(3)].map((_, i) => <div key={i} className="w-9 h-9 rounded-2xl bg-white/20" />)}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[...Array(4)].map((_, i) => <div key={i} className="w-9 h-9 rounded-2xl bg-white/20" />)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dark mode sidebar preview */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("previewDark")}</span>
                    <div className="w-36 rounded-xl border overflow-hidden shadow-md bg-gray-950">
                      <div className="flex flex-col gap-1 p-2 h-52" style={{ backgroundColor: colors.primary + "cc" }}>
                        <div className="flex items-center gap-2 mb-2">
                          {resolvedTheme === "dark"
                            ? (previewErrors.logo
                              ? <div className="w-12 h-5 rounded bg-white/20" />
                              : <img src={getLogoDarkUrl(logoDarkTimestamp)} className="w-12 h-5 object-contain" onError={() => setPreviewErrors(p => ({ ...p, logo: true }))} alt="" />)
                            : (previewErrors.logo
                              ? <div className="w-12 h-5 rounded bg-white/20" />
                              : <img src={getLogoUrl(logoTimestamp)} className="w-12 h-5 object-contain" onError={() => setPreviewErrors(p => ({ ...p, logo: true }))} alt="" />)
                          }
                        </div>
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i === 0 ? "bg-white/25" : "hover:bg-white/10"}`}>
                            <div className="w-3 h-3 rounded bg-white/50 shrink-0" />
                            <div className="h-2 rounded-full bg-white/40 flex-1" style={{ width: `${50 + i * 8}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>{/* fim col direita branding */}
          </div>{/* fim grid branding */}

          <div className="mt-6">
            <AvatarShapePanel />
          </div>
        </TabsContent>

        {/* Force Logout */}
        <TabsContent value="logout">
          <Card>
            <CardHeader><CardTitle>{t("forceLogout")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("selectTenantLabel")}</Label>
                <Select
                  value={selectedTenantId ? String(selectedTenantId) : ""}
                  onValueChange={(v) => {
                    const id = Number(v);
                    setSelectedTenantId(id);
                    const ten = tenants.find((x) => x.id === id);
                    setForceLogout(ten?.forceLogout === "enabled");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t("selectTenantPlaceholder")} /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false} className="max-h-60 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    {tenants.map((ten) => (
                      <SelectItem key={ten.id} value={String(ten.id)}>
                        {ten.name} — Force Logout: {ten.forceLogout === "enabled" ? t("enabled") : t("disabled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTenantId && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{t("forceLogoutUsers")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("forceLogoutUsersDesc")}
                    </p>
                  </div>
                  <Switch checked={forceLogout} onCheckedChange={setForceLogout} />
                </div>
              )}
              <Button onClick={handleSaveLogout} disabled={savingLogout || !selectedTenantId}>
                {savingLogout ? t("saving") : t("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Masterkey */}
        <TabsContent value="masterkey">
          <Card>
            <CardHeader><CardTitle>{t("masterkey")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>{t("enableMasterkey")}</Label>
                <Switch
                  checked={masterkeyEnabled}
                  onCheckedChange={setMasterkeyEnabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("masterkeyKey")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={masterkey}
                    onChange={(e) => setMasterkey(e.target.value)}
                    placeholder={t("masterkeyPlaceholder")}
                    className="font-mono"
                  />
                  <Button variant="outline" onClick={() => setMasterkey(generateKey())}>
                    {t("generate")}
                  </Button>
                </div>
              </div>
              <Button onClick={handleSaveMasterkey} disabled={savingMasterkey}>
                {savingMasterkey ? t("saving") : t("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Criptografia */}
        <TabsContent value="criptografia">
          <Card>
            <CardHeader><CardTitle>{t("encryptionKey")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("encryptionLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    placeholder={t("encryptionPlaceholder")}
                    className="font-mono"
                  />
                  <Button variant="outline" onClick={() => setEncryptionKey(generateKey())}>
                    {t("generate")}
                  </Button>
                </div>
              </div>
              <Button onClick={handleSaveEncryption} disabled={savingEncryption}>
                {savingEncryption ? t("saving") : t("save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tutoriais */}
        <TabsContent value="tutoriais">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("tutorials")}</CardTitle>
              <Button size="sm" onClick={openCreateTutorial}>
                <Plus className="mr-2 h-4 w-4" /> {t("newTutorial")}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {tutorialsLoading ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : tutorials.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("noTutorials")}</p>
                  <Button size="sm" onClick={openCreateTutorial}><Plus className="mr-2 h-4 w-4" /> {t("createTutorial")}</Button>
                </div>
              ) : (
                <DndContext sensors={tutorialSensors} collisionDetection={closestCenter} onDragEnd={handleTutorialDragEnd}>
                  <SortableContext items={tutorials.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">{t("colOrder")}</TableHead>
                          <TableHead>{t("colTitle")}</TableHead>
                          <TableHead>{t("colLink")}</TableHead>
                          <TableHead className="w-20">{t("colActive")}</TableHead>
                          <TableHead className="w-32">{t("colActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tutorials.map((tut) => (
                          <SortableTutorialRow
                            key={tut.id}
                            tut={tut}
                            t={t}
                            onEdit={openEditTutorial}
                            onDuplicate={handleDuplicate}
                            onDelete={(tut) => setTutorialDel(tut)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </SortableContext>
                </DndContext>
              )}
              {!tutorialsLoading && tutsTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tutPage <= 1}
                    onClick={() => loadTutorials(tutPage - 1)}
                  >
                    {t("tutsPrev")}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t("tutsPage")} {tutPage} {t("tutsOf")} {tutsTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tutPage >= tutsTotalPages}
                    onClick={() => loadTutorials(tutPage + 1)}
                  >
                    {t("tutsNext")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Socket Model */}
        <TabsContent value="socket">
          <Card>
            <CardHeader><CardTitle>{t("socketModelTitle")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("socketModelDescription")}</p>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{t("socketModelOptimized")}</p>
                  <p className="text-sm text-muted-foreground">{t("socketModelOptimizedDesc")}</p>
                </div>
                <Switch checked={socketModelOptimized} onCheckedChange={setSocketModelOptimized} />
              </div>

              <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex gap-2 items-start text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p className="font-medium text-sm">{t("socketModelWarningTitle")}</p>
                  <p>{t("socketModelWarningIntro")}</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>{t("socketModelWarningBullet1")}</li>
                    <li>{t("socketModelWarningBullet2")}</li>
                    <li>{t("socketModelWarningBullet3")}</li>
                    <li>{t("socketModelWarningBullet4")}</li>
                  </ul>
                  <p className="pt-1 italic">{t("socketModelWarningRecommendation")}</p>
                </div>
              </div>

              <Button onClick={handleSaveSocketModel} disabled={savingSocketModel}>
                {savingSocketModel ? t("socketModelSaving") : t("socketModelSave")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API — Postman link override */}
        <TabsContent value="api">
          <Card>
            <CardHeader><CardTitle>{t("postmanLinkTitle")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("postmanLinkDescription")}</p>

              <div className="space-y-2">
                <Label htmlFor="postman-link">{t("postmanLinkLabel")}</Label>
                <Input
                  id="postman-link"
                  type="url"
                  inputMode="url"
                  value={postmanLink}
                  onChange={(e) => setPostmanLink(e.target.value)}
                  placeholder={POSTMAN_LINK_DEFAULT}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("postmanLinkHint")}
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">{t("postmanLinkDefaultLabel")}:</span>{" "}
                <a
                  href={POSTMAN_LINK_DEFAULT}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline hover:text-foreground"
                >
                  {POSTMAN_LINK_DEFAULT}
                </a>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSavePostmanLink} disabled={savingPostmanLink}>
                  {savingPostmanLink ? t("postmanLinkSaving") : t("postmanLinkSave")}
                </Button>
                <Button variant="outline" onClick={handleResetPostmanLink} disabled={savingPostmanLink || !postmanLink}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("postmanLinkResetButton")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Login Variant */}
        <TabsContent value="login">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 mb-5 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
            <span className="mt-0.5 shrink-0">ℹ️</span>
            <span>{t("mediaFileNote")}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Coluna esquerda — seletor de variantes + controles */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>{t("loginVariantTitle")}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">{t("loginVariantDescription")}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "variant-1", label: t("loginVariant1"), desc: t("loginVariant1Desc") },
                    { id: "variant-2", label: t("loginVariant2"), desc: t("loginVariant2Desc") },
                    { id: "variant-3", label: t("loginVariant3"), desc: t("loginVariant3Desc") },
                    { id: "variant-4", label: t("loginVariant4"), desc: t("loginVariant4Desc") },
                    { id: "variant-5", label: t("loginVariant5"), desc: t("loginVariant5Desc") },
                    { id: "variant-6", label: t("loginVariant6"), desc: t("loginVariant6Desc") },
                    { id: "variant-7", label: t("loginVariant7"), desc: t("loginVariant7Desc") },
                    { id: "variant-8", label: t("loginVariant8"), desc: t("loginVariant8Desc") },
                  ].map(({ id, label, desc }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLoginVariant(id)}
                      className={[
                        "relative flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all hover:bg-muted/50",
                        loginVariant === id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card",
                      ].join(" ")}
                    >
                      {loginVariant === id && (
                        <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                          <CheckCircle className="h-3 w-3 text-primary-foreground" />
                        </span>
                      )}
                      <Monitor className={`h-6 w-6 mb-1 ${loginVariant === id ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xs font-semibold ${loginVariant === id ? "text-primary" : "text-foreground"}`}>{label}</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
                <Button onClick={handleSaveLoginVariant} disabled={savingLoginVariant}>
                  {savingLoginVariant ? t("loginVariantSaving") : t("loginVariantSave")}
                </Button>
              </CardContent>
            </Card>

            {/* Mídia lateral — só relevante para Split Screen (variant-2) e Bold Hero (variant-8) */}
            <Card>
              <CardHeader>
                <CardTitle>{t("loginSideBgTitle")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{t("loginSideBgDescription")}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
                  <span className="mt-0.5 shrink-0">ℹ️</span>
                  <span>{t("mediaFileNote")}</span>
                </div>
                {/* Opção: mostrar ou ocultar texto sobre a mídia lateral */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{t("loginSideTextTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("loginSideTextDesc")}</p>
                  </div>
                  <Switch
                    checked={loginSideText}
                    onCheckedChange={handleSaveSideText}
                    disabled={savingSideText}
                  />
                </div>
                {/* Opção: mostrar ou ocultar botão Cadastre-se */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{t("loginShowRegisterButtonTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("loginShowRegisterButtonDesc")}</p>
                  </div>
                  <Switch
                    checked={loginShowRegisterButton}
                    onCheckedChange={handleSaveShowRegisterButton}
                    disabled={savingShowRegisterButton}
                  />
                </div>
                {/* Opção: mostrar ou ocultar botão Masterkey */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{t("loginShowMasterKeyButtonTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("loginShowMasterKeyButtonDesc")}</p>
                  </div>
                  <Switch
                    checked={loginShowMasterKeyButton}
                    onCheckedChange={handleSaveShowMasterKeyButton}
                    disabled={savingShowMasterKeyButton}
                  />
                </div>
                {/* Preview da mídia atual */}
                <div className="relative w-full max-w-xs h-32 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                  {sideBgMediaType === 'image' && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getLoginSideBgUrl(sideBgTimestamp)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {sideBgMediaType === 'video' && (
                    <video
                      src={getLoginSideBgUrl(sideBgTimestamp)}
                      muted
                      autoPlay
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {!sideBgMediaType && (
                    <span className="text-xs text-muted-foreground z-10">{t("loginSideBgNoMedia")}</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input
                    ref={sideBgRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleUploadSideBg}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingSideBg}
                    onClick={() => sideBgRef.current?.click()}
                  >
                    {uploadingSideBg ? t("loginSideBgUploading") : t("loginSideBgUpload")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingSideBg}
                    onClick={handleDeleteSideBg}
                    className="text-destructive hover:text-destructive"
                  >
                    {deletingSideBg ? t("loginSideBgDeleting") : t("loginSideBgDelete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>{/* fim col esquerda login */}

          {/* Coluna direita — preview da tela de login */}
          <div className="space-y-4 lg:sticky lg:top-4">
            <p className="text-sm text-muted-foreground">{t("loginPreviewDesc")}</p>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />{t("loginPreviewTitle")}</CardTitle>
                  <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => setLoginPreviewDark(false)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!loginPreviewDark ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Sun className="h-3.5 w-3.5" />{t("lightPalette")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginPreviewDark(true)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${loginPreviewDark ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Moon className="h-3.5 w-3.5" />{t("darkPalette")}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl overflow-hidden border shadow-md">
                  {/* Chrome bar */}
                  <div className={`px-3 py-2 flex items-center gap-2 border-b ${loginPreviewDark ? "bg-gray-800" : "bg-gray-100"}`}>
                    <div className="flex gap-1.5 shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    </div>
                    <div className={`flex-1 border rounded-full px-3 py-0.5 text-[10px] truncate ${loginPreviewDark ? "bg-gray-900 text-gray-400 border-gray-700" : "bg-white text-gray-500 border-gray-200"}`}>
                      {appName || "App"} — Login
                    </div>
                  </div>
                  {/* Login mockup area */}
                  {(() => {
                    const lpd = loginPreviewDark;
                    const previewLogoSrc = lpd ? getLogoDarkUrl(logoDarkTimestamp) : getLogoUrl(logoTimestamp);
                    const bgPage = lpd ? "#0a0a0a" : "#ffffff";
                    const bgPageAlt = lpd ? "#111111" : "#f9fafb";
                    const bgCard = lpd ? "#18181b" : "#ffffff";
                    const bgInput = lpd ? "#27272a" : "rgba(0,0,0,0.04)";
                    const borderInput = lpd ? "#3f3f46" : "#e5e7eb";
                    const textMuted = lpd ? "#71717a" : "#a1a1aa";
                    const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).style.display = "none"; };
                    return (
                    <div className="h-72 relative overflow-hidden">
                      {loginVariant === "variant-1" && (
                        /* Clássico — card centralizado sobre gradiente */
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: lpd ? "linear-gradient(135deg, #18181b, #27272a)" : "linear-gradient(135deg, #f9fafb, #e5e7eb)" }}>
                          <div className="w-52 rounded-xl shadow-lg p-4 space-y-2.5" style={{ backgroundColor: bgCard, border: `1px solid ${borderInput}` }}>
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewLogoSrc} alt="" className="h-6 object-contain" onError={onImgError} />
                            </div>
                            <div className="h-2 w-20 mx-auto rounded-full" style={{ backgroundColor: textMuted + "44" }} />
                            <div className="space-y-1.5">
                              <div className="h-6 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-6 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-6 w-full rounded-md text-white text-[9px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-2" && (
                        /* Split Screen — painel de marca à esquerda + form à direita */
                        <div className="absolute inset-0 flex">
                          <div className="w-1/2 flex flex-col items-center justify-center gap-2 p-3 relative overflow-hidden" style={{ backgroundColor: colors.primary }}>
                            {sideBgMediaType === 'image' && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={getLoginSideBgUrl(sideBgTimestamp)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                            )}
                            <div className="relative z-10 flex flex-col items-center gap-1.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getLogoUrl(logoTimestamp)} alt="" className="h-5 object-contain brightness-0 invert" onError={onImgError} />
                              <div className="h-2 w-16 rounded-full bg-white/40" />
                              <div className="h-1.5 w-24 rounded-full bg-white/25" />
                            </div>
                          </div>
                          <div className="w-1/2 flex items-center justify-center p-3" style={{ backgroundColor: bgCard }}>
                            <div className="w-full max-w-[140px] space-y-2">
                              <div className="h-2 w-16 rounded-full" style={{ backgroundColor: textMuted + "44" }} />
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md text-white text-[8px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-3" && (
                        /* Minimal — campos flutuantes sem card */
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgPage }}>
                          <div className="w-48 space-y-2.5">
                            <div className="flex justify-center mb-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewLogoSrc} alt="" className="h-6 object-contain" onError={onImgError} />
                            </div>
                            <div className="h-6 w-full rounded-md border-b-2 bg-transparent" style={{ borderColor: colors.primary + "44" }} />
                            <div className="h-6 w-full rounded-md border-b-2 bg-transparent" style={{ borderColor: colors.primary + "44" }} />
                            <div className="h-6 w-full rounded-full text-white text-[9px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-4" && (
                        /* Glassmorphism — gradiente com vidro fosco */
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-500 to-cyan-400 flex items-center justify-center">
                          <div className="w-52 rounded-2xl p-4 space-y-2.5 border border-white/20" style={{ backgroundColor: "rgba(255,255,255,0.15)", backdropFilter: "blur(12px)" }}>
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getLogoUrl(logoTimestamp)} alt="" className="h-6 object-contain brightness-0 invert" onError={onImgError} />
                            </div>
                            <div className="h-2 w-20 mx-auto rounded-full bg-white/30" />
                            <div className="space-y-1.5">
                              <div className="h-6 w-full rounded-md border border-white/20 bg-white/10" />
                              <div className="h-6 w-full rounded-md border border-white/20 bg-white/10" />
                              <div className="h-6 w-full rounded-md bg-white/90 text-[9px] font-medium flex items-center justify-center" style={{ color: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-5" && (
                        /* Dark Midnight — fundo escuro com neon (sempre escuro) */
                        <div className="absolute inset-0 bg-gray-950 flex items-center justify-center">
                          <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 30% 50%, ${colors.primary}66, transparent 50%), radial-gradient(circle at 70% 50%, #8b5cf666, transparent 50%)` }} />
                          <div className="relative w-52 bg-gray-900/80 rounded-xl p-4 space-y-2.5 border border-gray-700">
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getLogoDarkUrl(logoDarkTimestamp)} alt="" className="h-6 object-contain brightness-0 invert" onError={onImgError} />
                            </div>
                            <div className="h-2 w-20 mx-auto rounded-full bg-gray-700" />
                            <div className="space-y-1.5">
                              <div className="h-6 w-full rounded-md border border-gray-700 bg-gray-800" />
                              <div className="h-6 w-full rounded-md border border-gray-700 bg-gray-800" />
                              <div className="h-6 w-full rounded-md text-white text-[9px] font-medium flex items-center justify-center shadow-lg" style={{ backgroundColor: colors.primary, boxShadow: `0 0 20px ${colors.primary}66` }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-6" && (
                        /* Soft Nature — tons suaves e acolhedores */
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: lpd ? "linear-gradient(135deg, #052e16, #451a03, #4c0519)" : "linear-gradient(135deg, #ecfdf5, #fffbeb, #fff1f2)" }}>
                          <div className="w-52 rounded-2xl p-4 space-y-2.5 shadow-sm" style={{ backgroundColor: lpd ? "rgba(24,24,27,0.8)" : "rgba(255,255,255,0.8)", border: `1px solid ${lpd ? "rgba(5,46,22,0.3)" : "rgba(167,243,208,0.5)"}` }}>
                            <div className="flex justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewLogoSrc} alt="" className="h-6 object-contain" onError={onImgError} />
                            </div>
                            <div className="h-2 w-20 mx-auto rounded-full" style={{ backgroundColor: lpd ? "#064e3b44" : "#a7f3d044" }} />
                            <div className="space-y-1.5">
                              <div className="h-6 w-full rounded-lg border" style={{ backgroundColor: lpd ? "rgba(39,39,42,0.6)" : "rgba(255,255,255,0.6)", borderColor: borderInput }} />
                              <div className="h-6 w-full rounded-lg border" style={{ backgroundColor: lpd ? "rgba(39,39,42,0.6)" : "rgba(255,255,255,0.6)", borderColor: borderInput }} />
                              <div className="h-6 w-full rounded-lg text-white text-[9px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-7" && (
                        /* Corporate — sidebar de marca à esquerda */
                        <div className="absolute inset-0 flex">
                          <div className="w-16 flex flex-col items-center justify-center gap-2 py-3" style={{ backgroundColor: colors.primary }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={getLogoUrl(logoTimestamp)} alt="" className="h-5 w-10 object-contain brightness-0 invert" onError={onImgError} />
                            <div className="h-1.5 w-8 rounded-full bg-white/30" />
                            <div className="h-1 w-10 rounded-full bg-white/20" />
                            <div className="h-1 w-8 rounded-full bg-white/20" />
                          </div>
                          <div className="flex-1 flex items-center justify-center p-3" style={{ backgroundColor: bgPageAlt }}>
                            <div className="w-full max-w-[160px] space-y-2">
                              <div className="h-2.5 w-24 rounded-full" style={{ backgroundColor: textMuted + "44" }} />
                              <div className="h-1.5 w-32 rounded-full" style={{ backgroundColor: textMuted + "22" }} />
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgCard, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgCard, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md text-white text-[8px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {loginVariant === "variant-8" && (
                        /* Bold Hero — tipografia dramática */
                        <div className="absolute inset-0 flex">
                          <div className="w-1/2 flex flex-col items-start justify-center gap-1 p-4 relative overflow-hidden" style={{ backgroundColor: colors.primary }}>
                            {sideBgMediaType === 'image' && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={getLoginSideBgUrl(sideBgTimestamp)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                            )}
                            <div className="relative z-10">
                              <div className="h-3 w-20 rounded bg-white/60 mb-2" />
                              <div className="h-5 w-28 rounded bg-white/30 mb-1" />
                              <div className="h-1.5 w-24 rounded bg-white/20" />
                            </div>
                          </div>
                          <div className="w-1/2 flex items-center justify-center p-3" style={{ backgroundColor: bgCard }}>
                            <div className="w-full max-w-[140px] space-y-2">
                              <div className="flex justify-center mb-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewLogoSrc} alt="" className="h-5 object-contain" onError={onImgError} />
                              </div>
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md" style={{ backgroundColor: bgInput, border: `1px solid ${borderInput}` }} />
                              <div className="h-5 w-full rounded-md text-white text-[8px] font-medium flex items-center justify-center" style={{ backgroundColor: colors.primary }}>Login</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>{/* fim col direita login */}
          </div>{/* fim grid login */}
        </TabsContent>

        {/* Customização do Signup (internacionalização) */}
        <TabsContent value="signup">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 mb-5 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
            <span className="mt-0.5 shrink-0">ℹ️</span>
            <span>{t("signupConfigNote")}</span>
          </div>
          {signupConfig.paymentGateway && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 mb-5 flex gap-2 items-start text-xs text-amber-800 dark:text-amber-300">
              <span className="mt-0.5 shrink-0">💳</span>
              <span>{t("signupActiveGatewayInfo", { gateway: signupConfig.paymentGateway.toUpperCase() })}</span>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>{t("signupGeneralTitle")}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{t("signupEnabledTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("signupEnabledDesc")}</p>
                    </div>
                    <Switch
                      checked={signupConfig.enabled}
                      onCheckedChange={(v) => patchSignupConfig({ enabled: v }, "enabled")}
                      disabled={savingSignup === "enabled"}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{t("signupSkipGatewayTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("signupSkipGatewayDesc")}</p>
                    </div>
                    <Switch
                      checked={signupConfig.skipPaymentGateway}
                      onCheckedChange={(v) => patchSignupConfig({ skipPaymentGateway: v }, "skipPaymentGateway")}
                      disabled={savingSignup === "skipPaymentGateway"}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("signupDocumentTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{t("signupDocumentDesc")}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("signupDocumentModeLabel")}</Label>
                    <Select
                      value={signupConfig.documentMode}
                      onValueChange={(v) => patchSignupConfig({ documentMode: v as SignupVariantConfig["documentMode"] }, "documentMode")}
                      disabled={savingSignup === "documentMode"}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="br">{t("signupDocumentModeBr")}</SelectItem>
                        <SelectItem value="international">{t("signupDocumentModeInternational")}</SelectItem>
                        <SelectItem value="hidden">{t("signupDocumentModeHidden")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {signupConfig.documentMode !== "hidden" && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{t("signupDocumentRequiredTitle")}</p>
                          <p className="text-xs text-muted-foreground">{t("signupDocumentRequiredDesc")}</p>
                        </div>
                        <Switch
                          checked={signupConfig.documentRequired}
                          onCheckedChange={(v) => patchSignupConfig({ documentRequired: v }, "documentRequired")}
                          disabled={savingSignup === "documentRequired"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("signupDocumentLabelTitle")}</Label>
                        <Input
                          placeholder={t("signupDocumentLabelPlaceholder")}
                          value={signupConfig.documentLabel}
                          onChange={(e) => setSignupConfig((p) => ({ ...p, documentLabel: e.target.value }))}
                          onBlur={(e) => {
                            if (e.target.value !== "" || signupConfig.documentLabel !== "") {
                              patchSignupConfig({ documentLabel: e.target.value }, "documentLabel");
                            }
                          }}
                          disabled={savingSignup === "documentLabel"}
                        />
                        <p className="text-xs text-muted-foreground">{t("signupDocumentLabelHint")}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("signupPhoneTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{t("signupPhoneDesc")}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("signupPhoneFormatLabel")}</Label>
                    <Select
                      value={signupConfig.phoneFormat}
                      onValueChange={(v) => patchSignupConfig({ phoneFormat: v as SignupVariantConfig["phoneFormat"] }, "phoneFormat")}
                      disabled={savingSignup === "phoneFormat"}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="br">{t("signupPhoneFormatBr")}</SelectItem>
                        <SelectItem value="international">{t("signupPhoneFormatInternational")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{t("signupPhoneRequiredTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("signupPhoneRequiredDesc")}</p>
                    </div>
                    <Switch
                      checked={signupConfig.phoneRequired}
                      onCheckedChange={(v) => patchSignupConfig({ phoneRequired: v }, "phoneRequired")}
                      disabled={savingSignup === "phoneRequired"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("signupDefaultCountryLabel")}</Label>
                    <Input
                      placeholder="BR"
                      maxLength={2}
                      value={signupConfig.defaultCountry}
                      onChange={(e) => setSignupConfig((p) => ({ ...p, defaultCountry: e.target.value.toUpperCase() }))}
                      onBlur={(e) => {
                        const v = e.target.value.toUpperCase().slice(0, 2);
                        if (v !== signupConfig.defaultCountry) {
                          patchSignupConfig({ defaultCountry: v }, "defaultCountry");
                        }
                      }}
                      disabled={savingSignup === "defaultCountry"}
                    />
                    <p className="text-xs text-muted-foreground">{t("signupDefaultCountryHint")}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("signupPreviewTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{t("signupPreviewDesc")}</p>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border bg-card p-5 space-y-3 max-w-sm mx-auto">
                    <div className="text-center space-y-1">
                      <p className="font-semibold text-sm">{t("signupPreviewHeader")}</p>
                      <p className="text-xs text-muted-foreground">{t("signupPreviewSubheader")}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">{t("signupPreviewName")} *</Label>
                      <div className="h-8 rounded-md border bg-muted/40" />
                    </div>
                    {signupConfig.documentMode !== "hidden" && (
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {signupConfig.documentLabel.trim() !== ""
                            ? signupConfig.documentLabel
                            : signupConfig.documentMode === "br"
                              ? t("signupPreviewCpfCnpj")
                              : t("signupPreviewTaxId")}
                          {signupConfig.documentRequired ? " *" : ""}
                        </Label>
                        <div className="h-8 rounded-md border bg-muted/40 flex items-center px-2 text-[10px] text-muted-foreground">
                          {signupConfig.documentMode === "br" ? "000.000.000-00 / 00.000.000/0000-00" : t("signupPreviewTaxIdHint")}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-xs">{t("signupPreviewEmail")} *</Label>
                      <div className="h-8 rounded-md border bg-muted/40" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {t("signupPreviewPhone")}{signupConfig.phoneRequired ? " *" : ""}
                      </Label>
                      <div className="h-8 rounded-md border bg-muted/40 flex items-center px-2 text-[10px] text-muted-foreground">
                        {signupConfig.phoneFormat === "br" ? "(11) 99999-9999" : `+${signupConfig.defaultCountry === "BR" ? "55" : "1"} ${t("signupPreviewPhoneIntlHint")}`}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">{t("signupPreviewPassword")} *</Label>
                      <div className="h-8 rounded-md border bg-muted/40" />
                    </div>
                    {!signupConfig.skipPaymentGateway && (
                      <div className="space-y-2">
                        <Label className="text-xs">{t("signupPreviewPlan")} *</Label>
                        <div className="h-8 rounded-md border bg-muted/40" />
                      </div>
                    )}
                    <div className="h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      {t("signupPreviewSubmit")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Sons de Notificação */}
        <TabsContent value="sons">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 mb-5 flex gap-2 items-start text-xs text-blue-700 dark:text-blue-300">
            <span className="mt-0.5 shrink-0">ℹ️</span>
            <span>{t("mediaFileNote")}</span>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("soundsDescription")}</p>
            {(
              [
                { type: "ticket" as const, label: t("soundTicket"), desc: t("soundTicketDesc"), ref: ticketSoundRef },
                { type: "chat"   as const, label: t("soundChat"),   desc: t("soundChatDesc"),   ref: chatSoundRef },
                { type: "support" as const, label: t("soundSupport"), desc: t("soundSupportDesc"), ref: supportSoundRef },
              ]
            ).map(({ type, label, desc, ref }) => (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    {label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t("soundFormats")}</p>
                  <input
                    ref={ref}
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSoundUpload(type, f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <NotificationSoundPlayer
                        src={getNotificationSoundUrl(type, soundTimestamps[type] || undefined)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={uploadingSounds[type]}
                      onClick={() => ref.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline ml-1.5">{uploadingSounds[type] ? t("saving") : t("soundUpload")}</span>
                    </Button>
                    {soundTimestamps[type] > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={deletingSounds[type]}
                        onClick={() => handleSoundDelete(type)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <span className={[
                      "shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      soundTimestamps[type] > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-muted bg-muted/40 text-muted-foreground",
                    ].join(" ")}>
                      <span className={[
                        "h-1.5 w-1.5 rounded-full",
                        soundTimestamps[type] > 0 ? "bg-emerald-500" : "bg-muted-foreground/40",
                      ].join(" ")} />
                      {soundTimestamps[type] > 0 ? t("soundCustomized") : t("soundDefault")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tipografia */}
        <TabsContent value="tipografia">
          <TypographyPanel />
        </TabsContent>

        {/* Termos para clientes */}
        {singleTenantLicense === false && (
          <TabsContent value="termos">
            <ResellerTermsPanel />
          </TabsContent>
        )}
      </Tabs>

      {/* Tutorial Form Dialog */}
      <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
        <DialogContent className="flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{tutorialEditing ? t("editTutorial") : t("newTutorialTitle")}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 py-2 pr-1">
            <div className="space-y-2">
              <Label>{t("tutorialTitleLabel")}</Label>
              <Input value={tutorialTitle} onChange={(e) => setTutorialTitle(e.target.value)} placeholder={t("tutorialTitleLabel")} />
            </div>
            <div className="space-y-2">
              <Label>{t("tutorialDescLabel")}</Label>
              <Textarea value={tutorialDesc} onChange={(e) => setTutorialDesc(e.target.value)} rows={3} placeholder={t("tutorialDescLabel")} />
            </div>
            <div className="space-y-2">
              <Label>{t("tutorialLinkLabel")}</Label>
              <Input value={tutorialLink} onChange={(e) => setTutorialLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("tutorialActiveLabel")}</Label>
              <Switch checked={tutorialActive} onCheckedChange={setTutorialActive} />
            </div>
            <div className="space-y-2">
              <Label>{t("tutorialOrderLabel")}</Label>
              <Input
                type="number"
                min={1}
                value={tutorialOrder}
                onChange={(e) => setTutorialOrder(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={t("tutorialOrderPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tutorialThumbnailLabel")}</Label>
              <input
                ref={tutorialFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setTutorialFile(f);
                    setTutorialPreview(URL.createObjectURL(f));
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => tutorialFileRef.current?.click()}>
                {t("selectImage")}
              </Button>
              {tutorialPreview && (
                <img src={tutorialPreview} alt="preview" className="mt-2 h-24 rounded border object-cover" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTutorialOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleTutorialSave} disabled={tutorialSaving || !tutorialTitle.trim()}>
              {tutorialSaving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tutorial Delete Dialog */}
      <Dialog open={!!tutorialDel} onOpenChange={() => setTutorialDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTutorialTitle")}</DialogTitle>
            <DialogDescription>{t("actionCannotBeUndone")}</DialogDescription>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">{t("deleteTutorialConfirm", { title: tutorialDel?.title ?? "" })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTutorialDel(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleTutorialDelete}>{t("delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
