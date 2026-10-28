import { describe, it, expect } from "vitest";
import { computeWabaSentCost, wabaSentRowCost, wabaSentAvoidableCost } from "@/lib/waba-sent-cost";

const day = (d: string, service: number, template = 0, linked = 0, app = 0) => ({ day: d, service, template, linked, app });
const byDayOf = (detail: Array<{ day: string; service: number; template: number; linked: number; app?: number }>) =>
  detail.map((d) => ({ day: d.day, count: d.service + d.template + d.linked + (d.app || 0) }));

describe("computeWabaSentCost", () => {
  it("resposta antes de 01/10/2026 não é cobrada; template sim", () => {
    const detail = [day("2026-09-29", 300, 2), day("2026-09-30", 250)];
    const r = computeWabaSentCost({ startDate: "2026-09-29", rate: 0.035, byDay: byDayOf(detail), byDayDetail: detail });
    expect(r.paid).toBe(2);
    expect(r.free).toBe(550);
    expect(r.cost).toBeCloseTo(0.07, 6);
  });

  it("franquia de 1.000 por mês: a cobrança começa no dia em que ela acaba", () => {
    // outubro real da conta da ZDG: 902 até o dia 7, 134 no dia 8
    const detail = [day("2026-10-01", 211), day("2026-10-05", 691), day("2026-10-08", 134), day("2026-10-09", 72)];
    const r = computeWabaSentCost({ startDate: "2026-10-01", rate: 0.035, byDay: byDayOf(detail), byDayDetail: detail });
    expect(r.days.map((d) => d.paid)).toEqual([0, 0, 36, 72]);
    expect(r.paid).toBe(108);
    expect(r.free).toBe(1000);
  });

  it("período no meio do mês desconta o que a franquia já gastou antes", () => {
    const detail = [day("2026-10-10", 100)];
    const r = computeWabaSentCost({ startDate: "2026-10-10", rate: 0.035, byDay: byDayOf(detail), byDayDetail: detail, serviceBeforeStart: 950 });
    expect(r.paid).toBe(50);
  });

  it("a franquia recomeça no mês seguinte e não acumula", () => {
    const detail = [day("2026-10-31", 1200), day("2026-11-01", 900), day("2026-11-02", 200)];
    const r = computeWabaSentCost({ startDate: "2026-10-31", rate: 1, byDay: byDayOf(detail), byDayDetail: detail });
    expect(r.days.map((d) => d.paid)).toEqual([200, 0, 100]);
  });

  it("canal vinculado não é cobrado e vira economia pelo que custaria na oficial", () => {
    const detail = [day("2026-10-01", 1000, 0, 0), day("2026-10-02", 0, 0, 40)];
    const r = computeWabaSentCost({ startDate: "2026-10-01", rate: 0.5, byDay: byDayOf(detail), byDayDetail: detail });
    expect(r.paid).toBe(0);
    expect(r.free).toBe(1040);
    expect(r.linkedSavings).toBeCloseTo(20, 6);
  });

  it("economia do vinculado conta o que o vinculado já gastou antes do período (achado da auditoria)", () => {
    // 01-14/10: 800 pela oficial + 300 pelo vinculado; 15-31/10: 300 pelo vinculado
    const detail = [day("2026-10-20", 0, 0, 300)];
    const r = computeWabaSentCost({
      startDate: "2026-10-15", rate: 1, byDay: byDayOf(detail), byDayDetail: detail,
      serviceBeforeStart: 800, linkedBeforeStart: 300,
    });
    expect(r.linkedSavings).toBeCloseTo(300, 6);
  });

  it("app do celular (coexistência) e histórico importado não são cobrados nem gastam a franquia", () => {
    const detail = [day("2026-10-01", 1000, 0, 0, 500), day("2026-10-02", 10, 0, 0, 0)];
    const r = computeWabaSentCost({ startDate: "2026-10-01", rate: 1, byDay: byDayOf(detail), byDayDetail: detail });
    expect(r.days.map((d) => d.paid)).toEqual([0, 10]);
    expect(r.free).toBe(1500);
    expect(r.total).toBe(1510);
  });

  it("backend anterior (sem o detalhe por dia) conta tudo como cobrado, como antes", () => {
    const r = computeWabaSentCost({ startDate: "2026-10-01", rate: 0.035, byDay: [{ day: "2026-10-01", count: 10 }] });
    expect(r.detailed).toBe(false);
    expect(r.paid).toBe(10);
    expect(r.cost).toBeCloseTo(0.35, 6);
  });
});

describe("custo por linha e custo evitável", () => {
  const detail = [day("2026-10-01", 500, 10)];
  const summary = computeWabaSentCost({ startDate: "2026-10-01", rate: 0.035, byDay: byDayOf(detail), byDayDetail: detail });

  it("template leva o próprio custo; resposta dentro da franquia fica em zero (achado da auditoria)", () => {
    expect(wabaSentRowCost({ service: 500, template: 0, linked: 0 }, summary, 0.035)).toBeCloseTo(0, 6);
    expect(wabaSentRowCost({ service: 0, template: 10, linked: 0 }, summary, 0.035)).toBeCloseTo(0.35, 6);
  });

  it("evitável só conta resposta pela oficial das origens de conversa (achado da auditoria)", () => {
    const d2 = [day("2026-10-01", 1100, 0, 600)];
    const s2 = computeWabaSentCost({ startDate: "2026-10-01", rate: 0.035, byDay: byDayOf(d2), byDayDetail: d2 });
    const rows = [
      { sendType: "external", service: 1100, template: 0, linked: 0, app: 0 },
      { sendType: "chat", service: 0, template: 0, linked: 600, app: 0 },
    ];
    expect(wabaSentAvoidableCost(rows, ["chat", "bot", "schedule"], s2, 0.035)).toBeCloseTo(0, 6);
  });
});
