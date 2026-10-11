import { z } from "zod";
import { endpointSchema, elapsedDaySchema } from "./calendar-dates";

export const astronomyFamilies = { skyCycle: "Celestial and seasonal cycles", skyObservation: "Sky observations and exceptional accounts", skyCalendarLink: "Calendar and sky associations" } as const;
export const isAstronomyFamily = (family: string): family is keyof typeof astronomyFamilies => Object.hasOwn(astronomyFamilies, family);
export const astronomyFields = {
  skyCycle: { classification: "Phenomenon type", behavior: "Authored behavior", progression: "Direction and progression", conditions: "Exceptional or metaphysical conditions", perspective: "Perspective and evidence", calculation: "Calculation confidentiality", development: "Historical model changes" },
  skyObservation: { classification: "Phenomenon type", accountKind: "Observation, forecast claim or exceptional account", state: "Named observed state", perspective: "Observer and evidence", conditions: "Original conditions", interpretation: "Interpretation and uncertainty" },
  skyCalendarLink: { classification: "Association type", convention: "Observational, ceremonial or defining convention", interpretation: "Claimed calendar relationship", perspective: "Perspective and evidence" },
} as const;

export type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < BigInt("0") ? -a : a; while (b) { const next = a % b; a = b; b = next; } return a || BigInt("1"); };
export function rational(n: bigint, d = BigInt("1")): Rational { if (!d) throw new Error("A denominator cannot be zero."); if (d < BigInt("0")) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; }
export function exact(value: string): Rational {
  if (!/^-?\d{1,24}(?:\.\d{1,12}|\/\d{1,12})?$/.test(value)) throw new Error("Use an exact integer, decimal (up to twelve places) or fraction; scientific notation is unsupported.");
  if (value.includes("/")) { const [n, d] = value.split("/"); return rational(BigInt(n), BigInt(d)); }
  if (value.includes(".")) { const [whole, fraction] = value.split("."), d = BigInt("10") ** BigInt(fraction.length); return rational(BigInt(whole) * d + BigInt(fraction) * (value.startsWith("-") ? -BigInt("1") : BigInt("1")), d); }
  return rational(BigInt(value));
}
export const add = (a: Rational, b: Rational) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => add(a, { ...b, n: -b.n });
export const mul = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
export const compare = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const floor = (a: Rational) => a.n / a.d - (a.n < BigInt("0") && a.n % a.d !== BigInt("0") ? BigInt("1") : BigInt("0"));
export const exactLabel = (a: Rational) => a.d === BigInt("1") ? String(a.n) : `${a.n}/${a.d}`;
// Computed fractions can have a longer numerator than an authored period:
// e.g. a twentieth-digit day plus a twelve-place fractional interval.
export function projectionPosition(value: string): Rational {
  if (!/^-?\d{1,80}(?:\/\d{1,60})?$/.test(value)) throw new Error("Invalid calculated position.");
  const [n, d] = value.split("/"); return rational(BigInt(n), d ? BigInt(d) : BigInt("1"));
}
const numberText = z.string().max(40).refine(value => { try { exact(value); return true; } catch { return false; } }, "Enter an exact integer, decimal or fraction with a nonzero denominator.");
const positive = numberText.refine(value => exact(value).n > BigInt("0"), "Duration must be positive.");
export const phaseSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(160), duration: positive.nullable(), description: z.string().max(4000).default("") }).strict();
export const cycleSchema = z.object({
  scale: z.enum(["world-year", "elapsed-day"]), unit: z.enum(["year", "day", "hour", "minute"]),
  period: positive.nullable(), anchor: elapsedDaySchema.nullable(), anchorCalendar: endpointSchema.nullable(),
  approximate: z.boolean().default(false), offset: numberText.default("0"), window: positive.nullable(),
  beginning: elapsedDaySchema.nullable(), ending: elapsedDaySchema.nullable(), phases: z.array(phaseSchema).max(40).default([]),
}).strict().superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if ((c.scale === "world-year") !== (c.unit === "year")) fail("World-year cycles use year units; day/hour/minute cycles use the shared elapsed-day scale.");
  if (c.anchor && c.anchorCalendar) fail("Choose one explicit anchor, not two conflicting origins.");
  if (c.anchorCalendar && c.scale !== "elapsed-day") fail("Calendar days cannot supply a canonical World-year anchor.");
  if (c.scale === "world-year" && [c.anchor, c.beginning, c.ending].some(value => value && (BigInt(value) < -BigInt("1000000000000") || BigInt(value) > BigInt("1000000000000")))) fail("Canonical years must be within the supported signed trillion-year range.");
  if (c.beginning && c.ending && BigInt(c.beginning) > BigInt(c.ending)) fail("The model's ending must not precede its beginning.");
  if (new Set(c.phases.map(p => p.id)).size !== c.phases.length) fail("Keep each phase identity once.");
  if (c.period && c.phases.length && c.phases.every(p => p.duration) && compare(c.phases.reduce((sum, p) => add(sum, exact(p.duration!)), rational(BigInt("0"))), exact(c.period)) !== 0) fail("Explicit phase durations must sum exactly to the authored period.");
  if (c.period && c.window && compare(exact(c.window), exact(c.period)) > 0) fail("An occurrence window cannot exceed its period.");
});
export type SkyCycle = z.infer<typeof cycleSchema>;
export const blankCycle = (): SkyCycle => ({ scale: "elapsed-day", unit: "day", period: null, anchor: null, anchorCalendar: null, approximate: false, offset: "0", window: null, beginning: null, ending: null, phases: [] });
export const bindingSchema = z.object({ id: z.string().uuid(), calendarVersionId: z.string().uuid(), revision: z.number().int().positive(), role: z.string().trim().min(1).max(160), account: z.string().max(4000).default(""), protected: z.boolean().default(false) }).strict();
export type CalendarBinding = z.infer<typeof bindingSchema>;
export type SkyProjection = { position: string; end: string | null; index: string; phase: string | null; approximate: boolean };
export const SKY_LIMITS = { cycles: 50, results: 200, page: 100, spanDays: BigInt("1000000"), spanYears: BigInt("1000000") } as const;

export function projectCycle(cycle: SkyCycle, anchor: string | null, start: string, end: string, factor = rational(BigInt("1"))): { phase: string | null; occurrences: SkyProjection[]; truncated: boolean; reason: string | null } {
  const empty = (reason: string) => ({ phase: null, occurrences: [], truncated: false, reason });
  const a = exact(start), b = exact(end);
  if (compare(a, b) > 0) throw new Error("The range ending must not precede its beginning.");
  if (compare(sub(b, a), rational(cycle.scale === "world-year" ? SKY_LIMITS.spanYears : SKY_LIMITS.spanDays)) > 0) throw new Error("Choose a bounded range of at most one million years or shared days.");
  if (!cycle.period || anchor === null) return empty("This is authored information: an exact period and known anchor are needed for projection.");
  if (factor.n <= BigInt("0")) return empty("This unit has no explicit compatible calendar-day definition.");
  const period = mul(exact(cycle.period), factor), origin = add(exact(anchor), mul(exact(cycle.offset), factor));
  const lower = cycle.beginning === null ? null : exact(cycle.beginning), upper = cycle.ending === null ? null : exact(cycle.ending);
  const outside = (p: Rational) => !!(lower && compare(p, lower) < 0 || upper && compare(p, upper) > 0);
  const division = (value: Rational) => rational(value.n * period.d, value.d * period.n);
  let phase: string | null = null;
  if (!outside(a) && cycle.phases.length && cycle.phases.every(p => p.duration)) {
    const elapsed = sub(a, origin), completed = floor(division(elapsed)), position = sub(elapsed, mul(period, rational(completed))); let total = rational(BigInt("0"));
    for (const p of cycle.phases) { total = add(total, mul(exact(p.duration!), factor)); if (compare(position, total) < 0) { phase = p.name; break; } }
  }
  const window = cycle.window ? mul(exact(cycle.window), factor) : rational(BigInt("0"));
  const boundedStart = lower && compare(a, lower) < 0 ? lower : a;
  let index = floor(division(sub(sub(boundedStart, origin), window)));
  const occurrences: SkyProjection[] = []; let truncated = false;
  for (let examined = 0; examined < SKY_LIMITS.results + 3; examined++, index++) {
    const position = add(origin, mul(period, rational(index))), ending = add(position, window);
    if (compare(position, b) > 0 || upper && compare(position, upper) > 0) break;
    if (compare(ending, a) < 0 || lower && compare(ending, lower) < 0) continue;
    if (occurrences.length === SKY_LIMITS.results) { truncated = true; break; }
    const clippedStart = lower && compare(position, lower) < 0 ? lower : position, clippedEnd = upper && compare(ending, upper) > 0 ? upper : ending;
    if (compare(clippedEnd, a) < 0 || compare(clippedStart, b) > 0) continue;
    occurrences.push({ position: exactLabel(clippedStart), end: cycle.window ? exactLabel(clippedEnd) : null, index: String(index), phase: cycle.phases[0]?.name ?? null, approximate: cycle.approximate });
  }
  return { phase, occurrences, truncated, reason: outside(a) ? "The selected date is outside this model's explicitly authored applicability; review another source or model." : null };
}
