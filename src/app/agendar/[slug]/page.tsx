"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Calendar, Clock, MapPin, Video, Check, ChevronLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getPublicBookingPage, getPublicSlots, createPublicBooking,
  type PublicBookingPage, type PublicEventType, type PublicSlot, type PublicProfessional,
} from "@/services/booking-public";
import { getBookingStrings, resolveBookingLang, intlLocale } from "@/lib/booking-strings";

function localDayOf(iso: string, tz: string): string {
  // "YYYY-MM-DD" da data civil no fuso da página (en-CA = formato ISO).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

// País padrão (ISO2) do seletor de telefone, derivado do fuso da página. O número
// é gravado COM DDI (ex.: 55) — sem ele o ZPRO não consegue enviar a confirmação.
// O visitante pode trocar o país no seletor (multi-país). Fallback: Brasil.
function countryFromTimezone(tz: string | null | undefined): string {
  const map: Record<string, string> = {
    "America/Argentina/Buenos_Aires": "AR",
    "America/Lima": "PE",
    "America/Mexico_City": "MX",
    "America/Bogota": "CO",
    "America/Santiago": "CL",
    "America/Asuncion": "PY",
    "America/Montevideo": "UY",
    "America/La_Paz": "BO",
    "America/Caracas": "VE",
    "America/Guayaquil": "EC",
    "Europe/Lisbon": "PT",
    "Atlantic/Azores": "PT",
    "Europe/Madrid": "ES",
  };
  // Demais fusos (todos os America/* do Brasil, UTC, etc.) → Brasil.
  return (tz && map[tz]) || "BR";
}

function BookingPortal() {
  const params = useParams();
  const sp = useSearchParams();
  const slug = String((params as Record<string, string>)?.slug || "");
  const lang = resolveBookingLang(sp.get("lang"));
  const s = getBookingStrings(lang);
  const locale = intlLocale(lang);

  const [data, setData] = useState<PublicBookingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<"service" | "professional" | "datetime" | "form" | "done">("service");
  const [event, setEvent] = useState<PublicEventType | null>(null);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [selectedProfId, setSelectedProfId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ startAt: string; location?: string | null; meetingLink?: string | null } | null>(null);

  const primary = data?.page.primaryColor || undefined;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getPublicBookingPage(slug);
        if (!alive) return;
        setData(res);
        setTimezone(res.page.timezone || "America/Sao_Paulo");
        if (typeof document !== "undefined" && res.page.title) document.title = res.page.title;
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const loadSlots = useCallback(async (ev: PublicEventType, profId?: number | null) => {
    setLoadingSlots(true);
    setSlots([]);
    setDay(null);
    setSlot(null);
    try {
      const res = await getPublicSlots(slug, ev.id, profId ? { professionalId: profId } : {});
      setSlots(res.slots);
      setTimezone(res.timezone || timezone);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, timezone]);

  const profsForEvent = (ev: PublicEventType): PublicProfessional[] => {
    const profs = data?.professionals || [];
    if (!profs.length) return [];
    const ids = ev.professionalIds || [];
    return ids.length > 0 ? profs.filter((p) => ids.includes(p.id)) : profs;
  };

  // Turma única (capacityScope "shared") não escolhe profissional: pula a etapa.
  const hasProfStep = (ev: PublicEventType): boolean =>
    ev.capacityScope !== "shared" && profsForEvent(ev).length > 0;

  const pickService = (ev: PublicEventType) => {
    setEvent(ev);
    setAnswers({});
    setSlot(null);
    setDay(null);
    setSelectedProfId(null);
    if (hasProfStep(ev)) {
      setStep("professional");
    } else {
      setStep("datetime");
      loadSlots(ev);
    }
  };

  const pickProfessional = (profId: number | null) => {
    setSelectedProfId(profId);
    setStep("datetime");
    if (event) loadSlots(event, profId);
  };

  const slotsByDay = useMemo(() => {
    const m = new Map<string, PublicSlot[]>();
    for (const sl of slots) {
      const d = localDayOf(sl.start, timezone);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(sl);
    }
    return m;
  }, [slots, timezone]);

  const days = useMemo(() => [...slotsByDay.keys()].sort(), [slotsByDay]);

  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [days, day]);

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
      .format(new Date(`${d}T12:00:00Z`));

  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
      .format(new Date(iso));

  const fullLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
      .format(new Date(iso));

  const submit = async () => {
    if (!event || !slot) return;
    if (!name.trim() || phone.replace(/\D/g, "").length < 8) { setError(s.requiredField); return; }
    for (const f of event.formFields) {
      if (f.required && !String(answers[String(f.id)] || "").trim()) { setError(s.requiredField); return; }
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await createPublicBooking(slug, event.id, {
        startAt: slot.start,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        formAnswers: answers,
        professionalId: slot.professionalId,
      });
      setResult({ startAt: res.startAt, location: res.location, meetingLink: res.meetingLink });
      setStep("done");
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setError(s.errSlot);
        if (event) loadSlots(event);
        setStep("datetime");
      } else {
        setError(s.errGeneric);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">{s.notFound}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 py-8 px-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-6">
          {data.page.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.page.logoUrl} alt="" className="mx-auto mb-3 h-14 w-auto max-w-[160px] object-contain" />
          )}
          <h1 className="text-xl font-bold" style={primary ? { color: primary } : undefined}>{data.page.title}</h1>
          {data.page.welcomeMessage && (
            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{data.page.welcomeMessage}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
          {/* STEP: service */}
          {step === "service" && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold mb-1">{s.chooseService}</h2>
              {data.eventTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{s.noDays}</p>
              ) : data.eventTypes.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => pickService(ev)}
                  className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-muted/50 transition-colors"
                  style={ev.color ? { borderLeftColor: ev.color, borderLeftWidth: 3 } : undefined}
                >
                  <div className="font-medium text-sm">{ev.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{ev.durationMinutes} {s.minLabel}</span>
                    {ev.price != null && <span>· {new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(ev.price)}</span>}
                  </div>
                  {ev.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.description}</div>}
                </button>
              ))}
            </div>
          )}

          {/* STEP: professional (F6) */}
          {step === "professional" && event && (
            <div className="space-y-3">
              <button onClick={() => setStep("service")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" />{event.name} · {event.durationMinutes} {s.minLabel}
              </button>
              <h2 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4" />{s.chooseProfessional}</h2>
              <div className="space-y-2">
                <button
                  onClick={() => pickProfessional(null)}
                  className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-muted/50 transition-colors font-medium text-sm"
                >
                  {s.anyProfessional}
                </button>
                {profsForEvent(event).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickProfessional(p.id)}
                    className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-muted/50 transition-colors flex items-center gap-2"
                    style={p.color ? { borderLeftColor: p.color, borderLeftWidth: 3 } : undefined}
                  >
                    {p.color && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />}
                    <span className="font-medium text-sm">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP: datetime */}
          {step === "datetime" && event && (
            <div className="space-y-3">
              <button onClick={() => setStep(hasProfStep(event) ? "professional" : "service")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" />{event.name} · {event.durationMinutes} {s.minLabel}
              </button>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : days.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{s.noDays}</p>
              ) : (
                <>
                  <div>
                    <h2 className="text-sm font-semibold mb-2 flex items-center gap-1"><Calendar className="h-4 w-4" />{s.chooseDate}</h2>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {days.map((d) => (
                        <button
                          key={d}
                          onClick={() => { setDay(d); setSlot(null); }}
                          className={[
                            "shrink-0 rounded-lg border px-3 py-2 text-xs capitalize transition-colors",
                            day === d ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted/50",
                          ].join(" ")}
                          style={day === d && primary ? { borderColor: primary, color: primary } : undefined}
                        >
                          {dayLabel(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold mb-2">{s.availableTimes}</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {(day ? slotsByDay.get(day) || [] : []).map((sl) => (
                        <button
                          key={`${sl.start}-${sl.professionalId ?? ""}`}
                          onClick={() => { setSlot(sl); setError(""); setStep("form"); }}
                          className="rounded-lg border py-1.5 text-sm hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center"
                        >
                          <span>{timeLabel(sl.start)}</span>
                          {event && (event.capacity ?? 1) > 1 && sl.remaining != null && (
                            <span className="text-[10px] text-muted-foreground">{s.seatsLeft.replace("{n}", String(sl.remaining))}</span>
                          )}
                          {selectedProfId === null && sl.professionalName && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-full px-1">{sl.professionalName}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {/* STEP: form */}
          {step === "form" && event && slot && (
            <div className="space-y-3">
              <button onClick={() => setStep("datetime")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" />{fullLabel(slot.start)}
              </button>
              <h2 className="text-sm font-semibold">{s.yourDetails}</h2>
              <div className="grid gap-2">
                <Label className="text-xs">{s.nameLabel} *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">{s.phoneLabel} *</Label>
                <PhoneInput value={phone} onChange={setPhone} defaultCountry={countryFromTimezone(timezone)} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">{s.emailLabel}</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" />
              </div>
              {event.formFields.map((f) => (
                <div key={f.id} className="grid gap-2">
                  <Label className="text-xs">{f.label}{f.required ? " *" : ""}</Label>
                  {f.type === "textarea" ? (
                    <Textarea value={answers[String(f.id)] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(f.id)]: e.target.value }))} rows={2} />
                  ) : f.type === "select" ? (
                    <Select value={answers[String(f.id)] || ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [String(f.id)]: v }))}>
                      <SelectTrigger><SelectValue placeholder={s.selectPlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={answers[String(f.id)] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [String(f.id)]: e.target.value }))}
                      type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                    />
                  )}
                </div>
              ))}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                className="w-full mt-1"
                onClick={submit}
                disabled={submitting}
                style={primary ? { backgroundColor: primary } : undefined}
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{s.booking}</> : s.confirmBtn}
              </Button>
            </div>
          )}

          {/* STEP: done */}
          {step === "done" && result && (
            <div className="text-center py-4 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <Check className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold">{s.confirmedTitle}</h2>
              <p className="text-sm font-medium capitalize">{fullLabel(result.startAt)}</p>
              {result.meetingLink && (
                <a href={result.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <Video className="h-4 w-4" />{result.meetingLink}
                </a>
              )}
              {result.location && (
                <p className="text-sm text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{result.location}</p>
              )}
              <p className="text-xs text-muted-foreground">{s.confirmedDesc}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("service"); setEvent(null); setSlot(null); setDay(null);
                  setName(""); setPhone(""); setEmail(""); setAnswers({}); setResult(null); setError("");
                }}
              >
                {s.newBooking}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AgendarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <BookingPortal />
    </Suspense>
  );
}
