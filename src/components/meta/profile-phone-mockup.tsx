"use client";

import React from "react";
import { CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

// ─── Phone shell ────────────────────────────────────────────────────────────

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      {/* outer frame */}
      <div className="relative w-[220px] rounded-[2.4rem] border-[6px] border-zinc-800 bg-zinc-800 shadow-2xl shadow-zinc-900/40">
        {/* side buttons */}
        <div className="absolute -left-[9px] top-16 h-8 w-[4px] rounded-full bg-zinc-700" />
        <div className="absolute -left-[9px] top-28 h-12 w-[4px] rounded-full bg-zinc-700" />
        <div className="absolute -left-[9px] top-44 h-12 w-[4px] rounded-full bg-zinc-700" />
        <div className="absolute -right-[9px] top-24 h-16 w-[4px] rounded-full bg-zinc-700" />

        {/* screen */}
        <div className="overflow-hidden rounded-[1.9rem] bg-white">
          {/* notch */}
          <div className="flex items-center justify-center bg-zinc-800 py-1.5">
            <div className="h-[6px] w-20 rounded-full bg-zinc-900" />
          </div>
          {/* content */}
          <div className="h-[420px] overflow-y-auto scrollbar-hide">
            {children}
          </div>
          {/* home bar */}
          <div className="flex items-center justify-center bg-white py-1.5">
            <div className="h-1 w-16 rounded-full bg-zinc-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Avatar placeholder ──────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  size = 56,
  bgColor = "#25d366",
}: {
  src?: string;
  name?: string;
  size?: number;
  bgColor?: string;
}) {
  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  if (src) {
    return (
      <img
        src={src}
        alt={name || "avatar"}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: bgColor }}
      className="rounded-full flex items-center justify-center text-white font-semibold text-base"
    >
      {initials}
    </div>
  );
}

// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="px-3 py-2 border-b border-zinc-100 last:border-0">
      <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-[11px] text-zinc-800 leading-tight">{value}</p>
    </div>
  );
}

// ─── 1. WhatsApp Business Phone Mockup ──────────────────────────────────────

export interface WBAProfileData {
  name?: string;
  phone?: string;
  about?: string;
  description?: string;
  email?: string;
  vertical?: string;
  address?: string;
  websites?: string[];
  profilePicUrl?: string;
  verified?: boolean;
  currency?: string;
  country?: string;
  namespace?: string;
  id?: string;
}

export function WhatsAppBusinessMockup({ data }: { data: WBAProfileData }) {
  const t = useTranslations("profilePhoneMockup");
  return (
    <PhoneShell>
      {/* WA header */}
      <div className="bg-[#075e54] px-3 pt-2 pb-3 text-white">
        <div className="flex items-center gap-1 text-[9px] opacity-70 mb-2">
          <span>←</span>
          <span>{t("whatsappBusiness")}</span>
        </div>
        {/* avatar + name row */}
        <div className="flex flex-col items-center gap-1.5 pb-1">
          <div className="ring-2 ring-white/30 rounded-full">
            <Avatar
              src={data.profilePicUrl}
              name={data.name}
              size={60}
              bgColor="#128c7e"
            />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <p className="text-[13px] font-semibold leading-tight">
                {data.name || "Business Name"}
              </p>
              {data.verified && (
                <CheckCircle className="w-3 h-3 text-emerald-300 shrink-0" />
              )}
            </div>
            <p className="text-[9px] opacity-70 mt-0.5">{t("whatsappBusinessAccount")}</p>
          </div>
        </div>
      </div>

      {/* action chips */}
      <div className="flex justify-around bg-[#f0f2f5] py-2 border-b border-zinc-200">
        {[t("messageAction"), t("callAction"), t("emailAction")].map((a) => (
          <div key={a} className="flex flex-col items-center gap-0.5">
            <div className="w-6 h-6 rounded-full bg-[#25d366] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
            <span className="text-[8px] text-zinc-500">{a}</span>
          </div>
        ))}
      </div>

      {/* info list */}
      <div className="bg-white divide-y divide-zinc-100">
        <InfoRow label={t("phone")} value={data.phone} />
        <InfoRow label={t("about")} value={data.about} />
        <InfoRow label={t("description")} value={data.description} />
        <InfoRow label={t("emailAction")} value={data.email} />
        <InfoRow label={t("category")} value={data.vertical} />
        <InfoRow label={t("address")} value={data.address} />
        {data.websites?.filter(Boolean).map((w, i) => (
          <InfoRow key={i} label={i === 0 ? t("website") : t("website2")} value={w} />
        ))}
        <InfoRow label={t("currency")} value={data.currency} />
        <InfoRow label={t("country")} value={data.country} />
      </div>

      {/* WABA badge */}
      {data.id && (
        <div className="px-3 py-2 bg-zinc-50">
          <p className="text-[8px] text-zinc-400 uppercase tracking-wide mb-0.5">{t("wabaId")}</p>
          <p className="text-[9px] font-mono text-zinc-500 break-all">{data.id}</p>
        </div>
      )}
    </PhoneShell>
  );
}

// ─── 2. Instagram Phone Mockup ───────────────────────────────────────────────

export interface InstagramProfileData {
  username?: string;
  name?: string;
  bio?: string;
  profilePicUrl?: string;
  followersCount?: number;
  followingCount?: number;
  mediaCount?: number;
  website?: string;
  id?: string;
  isVerified?: boolean;
}

export function InstagramMockup({ data }: { data: InstagramProfileData }) {
  const t = useTranslations("profilePhoneMockup");
  const fmt = (n?: number) =>
    n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <PhoneShell>
      {/* IG top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
        <span className="text-[9px] text-zinc-400">←</span>
        <span className="text-[11px] font-semibold text-zinc-800">
          {data.username || "username"}
        </span>
        <span className="text-[13px] text-zinc-400">⋮</span>
      </div>

      {/* profile header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 mb-3">
          {/* avatar with gradient ring */}
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="p-[2px] bg-white rounded-full">
              <Avatar
                src={data.profilePicUrl}
                name={data.name || data.username}
                size={52}
                bgColor="#c13584"
              />
            </div>
          </div>

          {/* stats */}
          <div className="flex gap-4 flex-1 justify-around">
            {[
              { label: t("posts"), val: fmt(data.mediaCount) },
              { label: t("followersLabel"), val: fmt(data.followersCount) },
              { label: t("followingLabel"), val: fmt(data.followingCount) },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <p className="text-[12px] font-bold text-zinc-900">{val}</p>
                <p className="text-[8px] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* name + bio */}
        <div className="mb-2">
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-semibold text-zinc-900">
              {data.name || data.username}
            </p>
            {data.isVerified && (
              <CheckCircle className="w-3 h-3 text-blue-500 shrink-0" />
            )}
          </div>
          {data.bio && (
            <p className="text-[10px] text-zinc-700 leading-tight mt-0.5 whitespace-pre-line">
              {data.bio}
            </p>
          )}
          {data.website && (
            <p className="text-[9px] text-blue-600 mt-0.5 truncate">{data.website}</p>
          )}
        </div>

        {/* action buttons */}
        <div className="flex gap-2 mb-3">
          <button className="flex-1 py-1 rounded-md bg-zinc-100 text-[9px] font-semibold text-zinc-700 border border-zinc-200">
            {t("followBtn")}
          </button>
          <button className="flex-1 py-1 rounded-md bg-zinc-100 text-[9px] font-semibold text-zinc-700 border border-zinc-200">
            {t("messageAction")}
          </button>
          <button className="px-2 py-1 rounded-md bg-zinc-100 border border-zinc-200 text-[10px] text-zinc-600">
            ▼
          </button>
        </div>
      </div>

      {/* divider + grid placeholder */}
      <div className="border-t border-zinc-200 flex justify-around py-1.5 mb-0.5">
        <span className="text-[10px] text-zinc-800 border-b-2 border-zinc-800 pb-0.5 px-2">⊞</span>
        <span className="text-[10px] text-zinc-400 pb-0.5 px-2">☰</span>
        <span className="text-[10px] text-zinc-400 pb-0.5 px-2">♟</span>
      </div>

      {/* placeholder post grid */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square bg-zinc-100 rounded-[2px]" />
        ))}
      </div>

      {/* ID row */}
      {data.id && (
        <div className="px-3 py-2 bg-zinc-50 mt-1">
          <p className="text-[8px] text-zinc-400 uppercase tracking-wide mb-0.5">ID</p>
          <p className="text-[9px] font-mono text-zinc-500 break-all">{data.id}</p>
        </div>
      )}
    </PhoneShell>
  );
}

// ─── 3. Facebook Page Phone Mockup ───────────────────────────────────────────

export interface FacebookPageData {
  name?: string;
  category?: string;
  about?: string;
  website?: string;
  phone?: string;
  email?: string;
  location?: string;
  pictureUrl?: string;
  coverUrl?: string;
  followersCount?: number;
  likesCount?: number;
  id?: string;
  isVerified?: boolean;
}

export function FacebookPageMockup({ data }: { data: FacebookPageData }) {
  const t = useTranslations("profilePhoneMockup");
  const fmt = (n?: number) =>
    n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <PhoneShell>
      {/* FB top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1877f2]">
        <span className="text-[9px] text-white/70">←</span>
        <span className="text-[10px] font-bold text-white">f</span>
        <span className="text-[11px] text-white/70">⋮</span>
      </div>

      {/* cover area */}
      <div className="relative">
        <div
          className="h-20 w-full"
          style={{
            background: data.coverUrl
              ? `url(${data.coverUrl}) center/cover`
              : "linear-gradient(135deg, #1877f2 0%, #0d5cb8 100%)",
          }}
        />
        {/* avatar overlapping cover */}
        <div className="absolute -bottom-6 left-3">
          <div className="ring-2 ring-white rounded-full">
            <Avatar
              src={data.pictureUrl}
              name={data.name}
              size={48}
              bgColor="#1877f2"
            />
          </div>
        </div>
      </div>

      {/* name section */}
      <div className="pt-8 px-3 pb-2">
        <div className="flex items-center gap-1">
          <p className="text-[13px] font-bold text-zinc-900 leading-tight">
            {data.name || "Page Name"}
          </p>
          {data.isVerified && (
            <CheckCircle className="w-3 h-3 text-[#1877f2] shrink-0" />
          )}
        </div>
        {data.category && (
          <p className="text-[9px] text-zinc-500 mt-0.5">{data.category}</p>
        )}

        {/* likes + followers */}
        <div className="flex gap-3 mt-1.5">
          {data.likesCount != null && (
            <div>
              <span className="text-[11px] font-semibold text-zinc-800">{fmt(data.likesCount)}</span>
              <span className="text-[8px] text-zinc-500 ml-0.5">{t("likesLabel")}</span>
            </div>
          )}
          {data.followersCount != null && (
            <div>
              <span className="text-[11px] font-semibold text-zinc-800">{fmt(data.followersCount)}</span>
              <span className="text-[8px] text-zinc-500 ml-0.5">{t("followersLabel")}</span>
            </div>
          )}
        </div>

        {/* action buttons */}
        <div className="flex gap-1.5 mt-2">
          <button className="flex-1 py-1 rounded bg-[#1877f2] text-[9px] font-semibold text-white">
            {t("likeBtn")}
          </button>
          <button className="flex-1 py-1 rounded bg-zinc-100 text-[9px] font-semibold text-zinc-700 border border-zinc-200">
            {t("followBtn")}
          </button>
          <button className="flex-1 py-1 rounded bg-zinc-100 text-[9px] font-semibold text-zinc-700 border border-zinc-200">
            {t("messageAction")}
          </button>
        </div>
      </div>

      {/* info list */}
      <div className="bg-white border-t border-zinc-100 divide-y divide-zinc-100">
        <InfoRow label={t("about")} value={data.about} />
        <InfoRow label={t("website")} value={data.website} />
        <InfoRow label={t("phone")} value={data.phone} />
        <InfoRow label={t("emailAction")} value={data.email} />
        <InfoRow label={t("location")} value={data.location} />
      </div>

      {data.id && (
        <div className="px-3 py-2 bg-zinc-50">
          <p className="text-[8px] text-zinc-400 uppercase tracking-wide mb-0.5">{t("pageId")}</p>
          <p className="text-[9px] font-mono text-zinc-500 break-all">{data.id}</p>
        </div>
      )}
    </PhoneShell>
  );
}
