"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Calendar, Check, MapPin, Video, ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getManageBooking, getPublicSlots, cancelManageBooking, rescheduleManageBooking,
  type ManageBooking, type PublicSlot,
} from "@/services/booking-public";
import { getBookingStrings, resolveBookingLang, intlLocale } from "@/lib/booking-strings";

function localDayOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function ManagePortal() {
  const params = useParams();
  const sp = useSearchParams();
  const slug = String((params as Record<string, string>)?.slug || "");
  const token = sp.get("token") || "";
  const lang = resolveBookingLang(sp.get("lang"));
  const s = getBookingStrings(lang);
  const locale = intlLocale(lang);

  const [booking, setBooking] = useState<ManageBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tz, setTz] = useState("America/Sao_Paulo");

  const [step, setStep] = useState<"view" | "reschedule">("view");
  const [done, setDone] = useState<"cancelled" | "rescheduled" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  const primary = booking?.page?.primaryColor || undefined;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const res = await getManageBooking(token);
        if (!alive) return;
        setBooking(res);
        setTz(res.timezone || "America/Sao_Paulo");
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const fullLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
      .format(new Date(iso));
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
      .format(new Date(`${d}T12:00:00Z`));
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const openReschedule = useCallback(async () => {
    if (!booking?.slug || !booking?.eventTypeId) return;
    setStep("reschedule");
    setLoadingSlots(true);
    setSlots([]);
    setDay(null);
    try {
      const res = await getPublicSlots(booking.slug, booking.eventTypeId);
      setSlots(res.slots);
      setTz(res.timezone || tz);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [booking, tz]);

  const slotsByDay = useMemo(() => {
    const m = new Map<string, PublicSlot[]>();
    for (const sl of slots) {
      const d = localDayOf(sl.start, tz);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(sl);
    }
    return m;
  }, [slots, tz]);
  const days = useMemo(() => [...slotsByDay.keys()].sort(), [slotsByDay]);
  useEffect(() => { if (!day && days.length) setDay(days[0]); }, [days, day]);

  const doCancel = async () => {
    setWorking(true);
    try {
      await cancelManageBooking(token);
      setDone("cancelled");
    } catch {
      setError(s.errGeneric);
    } finally {
      setWorking(false);
      setConfirmingCancel(false);
    }
  };

  const doReschedule = async (slot: PublicSlot) => {
    setWorking(true);
    setError("");
    try {
      const res = await rescheduleManageBooking(token, slot.start);
      setBooking((b) => (b ? { ...b, startAt: res.startAt } : b));
      setDone("rescheduled");
      setStep("view");
    } catch (e: any) {
      if (e?.response?.status === 409) { setError(s.errSlot); openReschedule(); }
      else setError(s.errGeneric);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (notFound || !booking) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-sm text-muted-foreground">{s.notFound}</p></div>;
  }

  const inactive = ["cancelled"].includes(booking.status);
  const closed = ["completed", "no_show"].includes(booking.status);

  return (
    <main className="min-h-screen bg-muted/30 py-8 px-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-md">
        <div className="text-center mb-6">
          {booking.page?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={booking.page.logoUrl} alt="" className="mx-auto mb-3 h-14 w-auto max-w-[160px] object-contain" />
          )}
          <h1 className="text-xl font-bold" style={primary ? { color: primary } : undefined}>{booking.page?.title || booking.title}</h1>
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-4">
          {/* done banners */}
          {done === "cancelled" && (
            <div className="text-center py-3 space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><X className="h-6 w-6" /></div>
              <p className="text-sm font-medium">{s.cancelledMsg}</p>
            </div>
          )}
          {done === "rescheduled" && (
            <div className="text-center py-2 space-y-1">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600"><Check className="h-6 w-6" /></div>
              <p className="text-sm font-semibold">{s.rescheduledMsg}</p>
            </div>
          )}

          {/* booking summary (hide when just cancelled) */}
          {done !== "cancelled" && (
            <div>
              <h2 className="text-sm font-semibold mb-1">{s.yourBooking}</h2>
              <div className="rounded-lg border p-3">
                <div className="font-medium text-sm">{booking.title}</div>
                <div className="text-sm text-muted-foreground mt-0.5 capitalize">{fullLabel(booking.startAt)}</div>
                {booking.meetingLink && (
                  <a href={booking.meetingLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    <Video className="h-4 w-4" />{booking.meetingLink}
                  </a>
                )}
                {booking.location && (
                  <div className="mt-1 text-sm text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{booking.location}</div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* actions */}
          {!done && step === "view" && (
            <>
              {inactive ? (
                <p className="text-sm text-muted-foreground text-center">{s.cancelledMsg}</p>
              ) : closed ? (
                <p className="text-sm text-muted-foreground text-center">{s.cannotManage}</p>
              ) : confirmingCancel ? (
                <div className="space-y-2">
                  <p className="text-sm text-center">{s.confirmCancel}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setConfirmingCancel(false)} disabled={working}>{s.back}</Button>
                    <Button variant="destructive" className="flex-1" onClick={doCancel} disabled={working}>
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : s.cancelBtn}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button onClick={openReschedule} style={primary ? { backgroundColor: primary } : undefined}>{s.rescheduleBtn}</Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setConfirmingCancel(true)}>{s.cancelBtn}</Button>
                </div>
              )}
            </>
          )}

          {/* reschedule picker */}
          {!done && step === "reschedule" && (
            <div className="space-y-3">
              <button onClick={() => { setStep("view"); setError(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" />{s.back}
              </button>
              <h2 className="text-sm font-semibold flex items-center gap-1"><Calendar className="h-4 w-4" />{s.chooseNewTime}</h2>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : days.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{s.noDays}</p>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {days.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDay(d)}
                        className={["shrink-0 rounded-lg border px-3 py-2 text-xs capitalize", day === d ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted/50"].join(" ")}
                        style={day === d && primary ? { borderColor: primary, color: primary } : undefined}
                      >
                        {dayLabel(d)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(day ? slotsByDay.get(day) || [] : []).map((sl) => (
                      <button
                        key={sl.start}
                        disabled={working}
                        onClick={() => doReschedule(sl)}
                        className="rounded-lg border py-2 text-sm hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                      >
                        {timeLabel(sl.start)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function GerenciarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <ManagePortal />
    </Suspense>
  );
}
