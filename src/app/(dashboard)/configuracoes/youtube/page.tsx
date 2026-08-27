"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Youtube, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import api from "@/lib/api";

interface YouTubeChannel {
  id: number;            // whatsappId
  name: string;          // "YT - <channelTitle>"
  channelId?: string;    // wabaId = UCxxxxx
  customUrl?: string;    // @handle ou customUrl
  profilePic?: string;
  status?: string;
  isDefault?: boolean;
  number?: string;
  // Phase 16 — info enriquecida (vem do sync, nao persiste no banco)
  bannerUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
  viewCount?: string;
}

function ChannelCard({ ch, onSync }: { ch: YouTubeChannel; onSync: (id: number) => void }) {
  const t = useTranslations("configYoutubePage");
  const [syncing, setSyncing] = useState(false);
  const channelTitle = (ch.name || "").replace(/^YT\s*-\s*/i, "") || "YouTube Channel";
  const handle = ch.customUrl && ch.customUrl.startsWith("@")
    ? ch.customUrl
    : ch.customUrl
      ? `@${ch.customUrl}`
      : null;
  const channelId = ch.channelId || ch.number;
  const channelUrl = handle
    ? `https://www.youtube.com/${handle}`
    : channelId
      ? `https://www.youtube.com/channel/${channelId}`
      : null;
  const isConnected = ch.status === "CONNECTED";
  const hasPic =
    ch.profilePic &&
    ch.profilePic !== "disabled" &&
    !ch.profilePic.includes("nopicture.png") &&
    (ch.profilePic.startsWith("http") || ch.profilePic.startsWith("/"));

  // Phase 16 — banner: usa o real do canal (brandingSettings.image.bannerExternalUrl)
  // ou fallback para gradiente vermelho YouTube.
  const bannerStyle: React.CSSProperties = ch.bannerUrl
    ? {
        backgroundImage: `url(${ch.bannerUrl}=w1280)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <Card className="overflow-hidden">
      <div
        className={`h-32 relative ${ch.bannerUrl ? "" : "bg-gradient-to-br from-red-600 via-red-500 to-red-700"}`}
        style={bannerStyle}
      >
        {!ch.bannerUrl && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.15),transparent_70%)]" />
        )}
        <div className="absolute top-3 right-3">
          {isConnected ? (
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t("connected")}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" />
              {t("disconnected")}
            </Badge>
          )}
        </div>
      </div>

      <CardContent className="p-4 pt-0 relative">
        {/* Profile pic — half over the banner; relative+z-10 fica acima do banner */}
        <div className="-mt-10 mb-3 flex relative z-10">
          <div className="shrink-0 rounded-full ring-4 ring-background bg-background shadow-lg">
            {hasPic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ch.profilePic!}
                alt={channelTitle}
                className="w-20 h-20 rounded-full object-cover"
                /* Phase 16 — Google avatars (yt3.ggpht.com / lh3.googleusercontent.com)
                   exigem no-referrer pra nao serem bloqueados */
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white">
                <Youtube className="h-8 w-8" />
              </div>
            )}
          </div>
        </div>

        {/* Title + handle abaixo da profile pic, alinhado a esquerda */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-bold text-base truncate">{channelTitle}</h3>
            {ch.isDefault && (
              <Badge variant="outline" className="text-[10px] h-5">
                {t("default")}
              </Badge>
            )}
          </div>
          {handle && (
            <p className="text-xs text-muted-foreground font-mono truncate">{handle}</p>
          )}
          {channelId && (
            <p className="text-[10px] text-muted-foreground/80 font-mono truncate">{channelId}</p>
          )}
        </div>

        {/* Phase 16 — Stats: subs / videos / views */}
        {(ch.subscriberCount || ch.videoCount || ch.viewCount) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {ch.subscriberCount !== undefined && (
              <div className="rounded-md bg-muted/50 py-1.5 px-2">
                <div className="font-bold">{Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(ch.subscriberCount) || 0)}</div>
                <div className="text-[10px] text-muted-foreground">{t("subscribers")}</div>
              </div>
            )}
            {ch.videoCount !== undefined && (
              <div className="rounded-md bg-muted/50 py-1.5 px-2">
                <div className="font-bold">{Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(ch.videoCount) || 0)}</div>
                <div className="text-[10px] text-muted-foreground">{t("videos")}</div>
              </div>
            )}
            {ch.viewCount !== undefined && (
              <div className="rounded-md bg-muted/50 py-1.5 px-2">
                <div className="font-bold">{Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(ch.viewCount) || 0)}</div>
                <div className="text-[10px] text-muted-foreground">{t("views")}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {channelUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(channelUrl, "_blank", "noopener,noreferrer")}
              className="flex-1"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {t("openOnYoutube")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try { await onSync(ch.id); } finally { setSyncing(false); }
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {t("syncChannel")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(`/sessoes`, "_self")}
          >
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            {t("manageInSessoes")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConfigYoutubePage() {
  const t = useTranslations("configYoutubePage");
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await fetchWhatsapps();
      const list = Array.isArray(data) ? data : [];
      const yt: YouTubeChannel[] = list
        .filter((w: Whatsapp) => w.type === "youtube")
        .map((w: Whatsapp) => ({
          id: w.id,
          name: w.name,
          channelId: w.wabaId,
          customUrl: w.number,
          profilePic: w.profilePic,
          status: w.status,
          isDefault: w.isDefault,
          number: w.number,
        }));
      setChannels(yt);

      // Phase 16 — sempre faz sync para canais CONNECTED (busca banner + stats frescos)
      const connected = yt.filter((c) => c.status === "CONNECTED");
      if (connected.length > 0) {
        // Sequencial pra nao matar quota Google
        const enriched = new Map<number, Partial<YouTubeChannel>>();
        for (const ch of connected) {
          try {
            const { data: info } = await api.post<{
              profilePicUrl?: string;
              bannerUrl?: string;
              subscriberCount?: string;
              videoCount?: string;
              viewCount?: string;
              channelTitle?: string;
              customUrl?: string;
            }>(`/yt-channel/${ch.id}/sync-info`);
            enriched.set(ch.id, {
              bannerUrl: info?.bannerUrl,
              subscriberCount: info?.subscriberCount,
              videoCount: info?.videoCount,
              viewCount: info?.viewCount,
              profilePic: info?.profilePicUrl || ch.profilePic,
              customUrl: info?.customUrl || ch.customUrl,
            });
          } catch { /* canal sem token / quota cheia — ignora silencioso */ }
        }
        // Merge enriched data
        setChannels((prev) =>
          prev.map((c) => ({ ...c, ...(enriched.get(c.id) || {}) }))
        );
      }
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function syncOne(channelId: number) {
    try {
      await api.post(`/yt-channel/${channelId}/sync-info`);
      toast.success(t("syncSuccess"));
      await load();
    } catch {
      toast.error(t("syncError"));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const total = channels.length;
  const connected = useMemo(
    () => channels.filter((c) => c.status === "CONNECTED").length,
    [channels]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      >
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </PageHeader>

      {/* Resumo */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("totalChannels")}</div>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("connected")}</div>
            <div className="text-2xl font-bold text-green-600">{connected}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("disconnected")}</div>
            <div className="text-2xl font-bold text-red-600">{total - connected}</div>
          </CardContent></Card>
        </div>
      )}

      {/* Lista de canais */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={Youtube}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button onClick={() => window.open("/sessoes", "_self")}>
            <Globe className="h-4 w-4 mr-2" />
            {t("goToSessoes")}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <ChannelCard key={ch.id} ch={ch} onSync={syncOne} />
          ))}
        </div>
      )}
    </div>
  );
}
