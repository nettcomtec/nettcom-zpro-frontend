"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Phone, PhoneOff, Plus, X, Upload, Volume2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";

interface ExpandedSession {
  id: string;
  originalId: number;
  name: string;
  wavoipToken: string;
  tokenIndex?: number;
  type?: string;
  status?: string;
}

interface CurrentCall {
  phone: string;
  sessionId: string;
  sessionName: string;
  status: "outcoming_calling" | "accept" | "terminate" | "offer" | "reject";
  tag?: string;
}

/** Espelha o DeviceStateEntry do SDK WaVoIP (@wavoip/wavoip-webphone device.get()) */
interface WavoipDeviceEntry {
  token: string;
  status?: string;
  connectionStatus?: "connected" | "disconnected" | "reconnecting";
  restricted?: boolean;
  restrictedUntil?: string | Date | null;
  contact?: { phone?: string; name?: string } | null;
  enable?: boolean;
  persist?: boolean;
}

declare global {
  interface Window {
    currentMP3Stream?: MediaStream;
    originalGetUserMedia?: typeof navigator.mediaDevices.getUserMedia;
    getUserMediaIntercepted?: boolean;
  }
}

function expandSessions(whatsapps: Whatsapp[]): ExpandedSession[] {
  const result: ExpandedSession[] = [];
  whatsapps
    .filter((w) => !(w as any).isDeleted && w.status === "CONNECTED" && w.wavoipToken)
    .forEach((w) => {
      const tokens = w.wavoipToken!.split(",").map((t) => t.trim()).filter(Boolean);
      if (tokens.length === 1) {
        result.push({ id: String(w.id), originalId: w.id, name: w.name, wavoipToken: tokens[0], type: w.type, status: w.status });
      } else {
        tokens.forEach((token, i) => {
          result.push({
            id: `${w.id}_token_${i + 1}`,
            originalId: w.id,
            name: `${w.name} - Token ${i + 1}`,
            wavoipToken: token,
            tokenIndex: i + 1,
            type: w.type,
            status: w.status,
          });
        });
      }
    });
  return result;
}

export default function MassaWavoipPage() {
  const t = useTranslations("massaWavoipPage");
  // Dois gates por AND: permissão da página de disparo em massa E o interruptor do
  // WaVoIP no tenant (plano + Tenant.wavoipEnabled) — a aba some do layout, mas a
  // URL direta continuaria acessível sem este segundo gate.
  const allowed = usePageAccess("massa");
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  if (!allowed || !wavoipEnabled) return <AccessDenied />;
  const [sessions, setSessions] = useState<ExpandedSession[]>([]);
  // Status real por token, lido do SDK WaVoIP (device.get()) — igual ao painel nativo.
  const [deviceStates, setDeviceStates] = useState<Record<string, WavoipDeviceEntry>>({});
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Áudio a injetar na chamada (buffer decodificado + nós Web Audio ativos)
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const preparedSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const callPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSessions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchWhatsapps();
      // Restringe ao whatsappAllowed do usuário (espelha o Atendimento).
      const list = filterWhatsappsForCurrentUser(Array.isArray(res.data) ? res.data : []);
      setSessions(expandSessions(list));
    } catch {
      toast.error(t("errorLoadingSessions"));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    // Initialize AudioContext
    if (typeof window !== "undefined" && (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AC();
    }
  }, [loadSessions]);

  // Interceptação global do getUserMedia: quando houver um stream preparado
  // (window.currentMP3Stream), devolve ele no lugar do microfone real → o destinatário
  // ouve o arquivo de áudio em vez do mic. Restaura o original ao sair da página.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    if (!window.originalGetUserMedia) {
      window.originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    }
    const original = window.originalGetUserMedia;
    navigator.mediaDevices.getUserMedia = (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
      if (constraints?.audio && window.currentMP3Stream) {
        return Promise.resolve(window.currentMP3Stream);
      }
      return original!(constraints);
    };
    window.getUserMediaIntercepted = true;
    return () => {
      if (callPollRef.current) { clearInterval(callPollRef.current); callPollRef.current = null; }
      if (window.originalGetUserMedia) {
        navigator.mediaDevices.getUserMedia = window.originalGetUserMedia;
        window.getUserMediaIntercepted = false;
      }
      // Encerra qualquer áudio em injeção ao sair da página
      activeSourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* noop */ } });
      activeSourcesRef.current = [];
      preparedSourceRef.current = null;
      window.currentMP3Stream?.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } });
      window.currentMP3Stream = undefined;
    };
  }, []);

  // Poll do status real de cada token no SDK WaVoIP. As sessões já são registradas
  // globalmente pelo wavoip-initializer (device.add); aqui só refletimos o estado real
  // (conectado/desconectado/restrito) que o SDK mantém, sem inventar "conectado".
  useEffect(() => {
    const poll = () => {
      try {
        const dev = (window as any).wavoip?.device;
        // get() é a API atual; getDevices() é o fallback deprecado (resiliência a drift do CDN)
        const list: WavoipDeviceEntry[] = dev?.get?.() || dev?.getDevices?.() || [];
        const map: Record<string, WavoipDeviceEntry> = {};
        for (const d of list) if (d?.token) map[d.token] = d;
        setDeviceStates(map);
      } catch {
        /* SDK ainda não carregado — próximo tick resolve */
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, []);

  const addPhone = () => {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    if (phoneNumbers.includes(trimmed)) { toast.warning(t("numberAlreadyAdded")); return; }
    setPhoneNumbers((prev) => [...prev, trimmed]);
    setNewPhone("");
  };

  const removePhone = (idx: number) => setPhoneNumbers((prev) => prev.filter((_, i) => i !== idx));

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    if (audioContextRef.current) {
      try {
        const buf = await file.arrayBuffer();
        const decoded = await audioContextRef.current.decodeAudioData(buf);
        audioBufferRef.current = decoded;
      } catch {
        toast.error(t("errorLoadAudio"));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearFile = () => { setUploadedFile(null); audioBufferRef.current = null; };

 // ---- Injeção de áudio na chamada (porta do MassaWavoip) ----
  // Monta um MediaStream a partir do arquivo (source -> gain -> MediaStreamDestination)
  // e o publica em window.currentMP3Stream para o getUserMedia interceptado devolver.
  // Fica SILENCIOSO até source.start() (chamado no aceite do destinatário).
  const prepareAudioInterception = () => {
    const ctx = audioContextRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    const destination = ctx.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(destination);
    window.currentMP3Stream = destination.stream;
    preparedSourceRef.current = source;
  };

  const startAudioPlayback = async () => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* noop */ } }
    if (!preparedSourceRef.current) prepareAudioInterception();
    const source = preparedSourceRef.current;
    if (!source) return;
    source.onended = () => {
      setIsPlayingAudio(false);
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) window.currentMP3Stream = undefined;
    };
    try {
      source.start();
      activeSourcesRef.current.push(source);
      preparedSourceRef.current = null;
      setIsPlayingAudio(true);
    } catch { /* BufferSource só inicia uma vez */ }
  };

  const stopAllAudio = () => {
    setIsPlayingAudio(false);
    activeSourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* noop */ } });
    activeSourcesRef.current = [];
    preparedSourceRef.current = null;
    if (window.currentMP3Stream) {
      try { window.currentMP3Stream.getTracks().forEach((tr) => tr.stop()); } catch { /* noop */ }
      window.currentMP3Stream = undefined;
    }
  };

  // ---- Detecção de estado da chamada de saída (porta do wavoip-api.js placeCall) ----
  // O SDK WaVoIP 1.x NÃO expõe callbacks de aceite confiáveis na chamada de saída
  // (call.start/startCall resolvem em {call:{id,peer},err}, sem onPeerAccept utilizável).
  // A superfície pública é call.getCallActive(): a chamada aparece nesse slot quando é
  // ATENDIDA e some quando encerra. Então POLLAMOS — igual à extensão ZDG que funciona.
  const digitsOnly = (s: unknown) => String(s ?? "").replace(/\D/g, "");
  const getActiveCall = (): { peer?: { phone?: string; number?: string; id?: string }; status?: string } | null => {
    try { return (window as any).wavoip?.call?.getCallActive?.() || null; } catch { return null; }
  };
  const matchesPhone = (active: ReturnType<typeof getActiveCall>, phone: string): boolean => {
    if (!active) return false;
    const p = active.peer && (active.peer.phone || active.peer.number || active.peer.id);
    if (!p) return true; // softphone de uma linha: a única ativa é a nossa
    const a = digitsOnly(p), b = digitsOnly(phone);
    return !!a && !!b && (a === b || a.slice(-8) === b.slice(-8));
  };
  const isAnswered = (active: ReturnType<typeof getActiveCall>, phone: string): boolean => {
    if (!matchesPhone(active, phone)) return false;
    const st = String(active?.status || "").toUpperCase();
    if (!st) return true; // presente no slot "active" → atendida
    return st === "ACTIVE" || st === "ACCEPTED" || st === "IN_CALL" || st === "ONGOING";
  };
  const stopCallPoll = () => {
    if (callPollRef.current) { clearInterval(callPollRef.current); callPollRef.current = null; }
  };

  const makeCall = async (sessionId: string, phone: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) { toast.error(t("sessionNotConnected")); return; }
    if (!uploadedFile || !audioBufferRef.current) { toast.error(t("noAudioFile")); return; }

    const callApi = (window as any).wavoip?.call;
    if (!callApi?.start && !callApi?.startCall) { toast.error(t("errorCalling")); return; }

    // Zera estado de chamada anterior
    stopCallPoll();
    stopAllAudio();

    // Retoma o AudioContext dentro do gesto (clique) e prepara o stream do MP3 ANTES de
    // discar — o SDK captura o "microfone" (getUserMedia) ao montar a chamada, e cacheia.
    if (audioContextRef.current?.state === "suspended") {
      try { await audioContextRef.current.resume(); } catch { /* noop */ }
    }
    prepareAudioInterception();

    setCurrentCall({ phone, sessionId, sessionName: session.name, status: "outcoming_calling", tag: t("directCall") });
    toast.success(t("callStarted"));

    // Inicia — API nova call.start(to,{fromTokens}); fallback startCall (deprecado)
    try {
      const ret = typeof callApi.start === "function"
        ? callApi.start(phone, { fromTokens: [session.wavoipToken] })
        : callApi.startCall(phone, [session.wavoipToken]);
      // start é async e resolve em { call, err }
      Promise.resolve(ret).then((r: { err?: { message?: string } } | null) => {
        if (r?.err) {
          stopCallPoll(); stopAllAudio(); setCurrentCall(null);
          toast.error(r.err.message || t("errorCalling"));
        }
      }).catch(() => {});
    } catch (err: unknown) {
      stopCallPoll(); stopAllAudio(); setCurrentCall(null);
      toast.error((err as { message?: string })?.message || t("errorCalling"));
      return;
    }

    // Polla getCallActive() para saber quando ATENDEU (injeta o áudio) e quando ENCERROU
    const startedAt = Date.now();
    const ringTimeoutMs = 60000;
    let answered = false;
    callPollRef.current = setInterval(() => {
      const active = getActiveCall();
      if (!answered) {
        if (isAnswered(active, phone)) {
          answered = true;
          setCurrentCall((c) => (c ? { ...c, status: "accept" } : c));
          // toca o áudio ao atender (pequeno atraso p/ a mídia estabelecer)
          setTimeout(() => { startAudioPlayback(); }, 800);
        } else if (Date.now() - startedAt > ringTimeoutMs) {
          stopCallPoll(); stopAllAudio(); setCurrentCall(null);
        }
      } else if (!matchesPhone(active, phone)) {
        // já atendida e saiu do slot ativo → a ligação encerrou
        stopCallPoll(); stopAllAudio(); setCurrentCall(null);
      }
    }, 500);
  };

  const acceptCall = () => {
    (window as any).wavoip?.call?.accept?.();
    setCurrentCall((c) => c ? { ...c, status: "accept" } : null);
  };

  const rejectCall = () => {
    (window as any).wavoip?.call?.reject?.();
    stopCallPoll();
    stopAllAudio();
    setCurrentCall(null);
  };

  const endCall = () => {
    // O bundle CDN não expõe hangup programático (a extensão ZDG patcha o bundle p/ isso);
    // tentamos best-effort e limpamos o estado local de qualquer forma.
    const c = (window as any).wavoip?.call;
    try { (c?.end || c?.hangup || c?.terminate)?.call(c); } catch { /* noop */ }
    stopCallPoll();
    stopAllAudio();
    setCurrentCall(null);
  };

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatRestrictedUntil = (v: string | Date | null | undefined): string => {
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  // "open" = número WhatsApp vinculado e online (definição da extensão ZDG que funciona);
  // é o estado que realmente permite ligar — mais preciso que connectionStatus (só o WS).
  const isDeviceOpen = (token: string) =>
    String(deviceStates[token]?.status || "").toLowerCase() === "open";
  // Sessões realmente conectadas no WaVoIP (podem receber chamada). Restrito continua
  // conectado (só sinaliza remoção futura), então segue chamável — com aviso.
  const callableSessions = sessions.filter((s) => isDeviceOpen(s.wavoipToken));

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left panel */}
      <div className="space-y-4">
        {/* Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" /> {t("title")}
            </CardTitle>
            <div className="flex items-center gap-0.5">
              <PageHelp
                description={t("helpDesc")}
                sections={[
                  { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                  { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
                  { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
                ]}
              />
              <Button variant="ghost" size="icon" onClick={loadSessions} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                {t("noWavoipSessions")}
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const dev = deviceStates[s.wavoipToken];
                  const connected = String(dev?.status || "").toLowerCase() === "open";
                  const restricted = !!dev?.restricted;
                  const restrictedUntil = formatRestrictedUntil(dev?.restrictedUntil);
                  return (
                    <div key={s.id} className="rounded border p-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.wavoipToken.substring(0, 24)}...
                            {s.tokenIndex && <span className="ml-1">(Token {s.tokenIndex})</span>}
                          </p>
                          <p className="text-xs">
                            Status:{" "}
                            <span className={connected ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                              {connected ? t("connected") : t("disconnected")}
                            </span>
                          </p>
                        </div>
                      </div>
                      {restricted && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t("restricted")}
                          </span>
                          {restrictedUntil && (
                            <span className="ml-auto text-[11px] text-amber-600/80">
                              {t("restrictedUntil", { date: restrictedUntil })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phone numbers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" /> {t("phoneNumbers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="5511999999999"
                onKeyDown={(e) => e.key === "Enter" && addPhone()}
              />
              <Button variant="outline" size="icon" onClick={addPhone}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {phoneNumbers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-2">{t("noNumbers")}</p>
            ) : (
              <div className="space-y-1">
                {phoneNumbers.map((num, i) => (
                  <div key={i} className="flex items-center justify-between rounded border px-3 py-1.5">
                    <span className="text-sm">{num}</span>
                    <button onClick={() => removePhone(i)}>
                      <X className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audio file */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> {t("audioFile")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {t("selectAudioFile")}
            </Button>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileUpload} />
            {uploadedFile && (
              <div className="mt-3 flex items-center justify-between rounded border p-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(uploadedFile.size)}</p>
                  </div>
                </div>
                <button onClick={clearFile}><X className="h-4 w-4 text-destructive" /></button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right panel */}
      <div className="space-y-4">
        {/* Connected sessions with call buttons */}
        {callableSessions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("connectedSessions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {callableSessions.map((s) => {
                  const restricted = !!deviceStates[s.wavoipToken]?.restricted;
                  return (
                    <div key={s.id} className="rounded border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="font-medium text-sm">{s.name}</span>
                        {restricted && (
                          <Badge variant="outline" className="ml-auto border-amber-500/40 text-amber-600">
                            <AlertTriangle className="mr-1 h-3 w-3" /> {t("restricted")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {s.wavoipToken.substring(0, 24)}...
                      </p>
                      {phoneNumbers.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("calling")}</Label>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {phoneNumbers.map((num, i) => (
                              <Button
                                key={i}
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                disabled={!!currentCall}
                                onClick={() => makeCall(s.id, num)}
                              >
                                <Phone className="mr-1 h-3 w-3" />
                                {num}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active call controls */}
        {currentCall && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4" />
                {currentCall.status === "offer" ? t("incomingCall") : t("activeCall")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-4">
                <p className="text-lg font-semibold">{currentCall.tag || t("unknown")}</p>
                <p className="text-muted-foreground">{currentCall.phone}</p>
                <p className="text-sm">Status: <span className="font-medium">{currentCall.status}</span></p>
                {isPlayingAudio && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-primary text-sm">
                    <Volume2 className="h-4 w-4" /> {t("transmittingAudio")}
                  </div>
                )}
              </div>

              {currentCall.status === "offer" ? (
                <div className="flex justify-center gap-3">
                  <Button onClick={acceptCall} className="bg-green-600 hover:bg-green-700">
                    <Phone className="mr-2 h-4 w-4" /> {t("accept")}
                  </Button>
                  <Button variant="destructive" onClick={rejectCall}>
                    <PhoneOff className="mr-2 h-4 w-4" /> {t("reject")}
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center gap-3">
                  <Button variant="destructive" onClick={endCall}>
                    <PhoneOff className="mr-2 h-4 w-4" /> {t("hangup")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {callableSessions.length === 0 && !currentCall && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Phone className="mx-auto mb-3 h-8 w-8 opacity-30" />
              <p className="text-sm">{t("connectFirst")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
