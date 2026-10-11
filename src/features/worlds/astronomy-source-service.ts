import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { worldSkyRule, worldSkyPhase, worldSkyCalendarBinding } from "@/db/world-peoples-schema";
import { worldDayReference } from "@/db/world-calendar-history-schema";
import { worldCalendar, worldCalendarVersion } from "@/db/world-calendar-schema";
import { resolveHistoryCalendarSource } from "./calendar-evolution-service";
import { WorldError } from "./world-service";
import type { HistoryTx } from "./history-version-service";
import type { LoreDraft, LoreRecord } from "./peoples";
import type { SkyCycle, CalendarBinding } from "./astronomy";
import type { CalendarSource } from "./calendar-dates";

export type AstronomySources = { anchor: CalendarSource | null; calendars: (CalendarBinding & { calendarName: string; versionTitle: string })[] };
export async function readAstronomySource(tx: HistoryTx, worldId: string, versionId: string) {
  const [rule] = await tx.select().from(worldSkyRule).where(and(eq(worldSkyRule.versionId, versionId), eq(worldSkyRule.worldId, worldId)));
  const phases = await tx.select({ id: worldSkyPhase.id, name: worldSkyPhase.name, duration: worldSkyPhase.duration, description: worldSkyPhase.description }).from(worldSkyPhase).where(eq(worldSkyPhase.versionId, versionId)).orderBy(asc(worldSkyPhase.position));
  const calendars = await tx.select().from(worldSkyCalendarBinding).where(and(eq(worldSkyCalendarBinding.versionId, versionId), eq(worldSkyCalendarBinding.worldId, worldId))).orderBy(asc(worldSkyCalendarBinding.position));
  const calendarBindings = calendars.map(({ id, calendarVersionId, revision, role, account, protected: secret }) => ({ id, calendarVersionId, revision, role, account, protected: secret }));
  const cycle: SkyCycle | null = rule ? { scale: rule.scale, unit: rule.unit, period: rule.period, anchor: rule.anchor, anchorCalendar: rule.anchorSource ? { versionId: rule.anchorSource.start.versionId, revision: rule.anchorSource.start.revision, date: rule.anchorSource.start.date } : null, approximate: rule.approximate, offset: rule.offset, window: rule.window, beginning: rule.beginning, ending: rule.ending, phases } : null;
  return { cycle, calendarBindings, sources: { anchor: rule?.anchorSource ?? null, calendars: calendars.map((c, i) => ({ ...calendarBindings[i], calendarName: c.calendarName, versionTitle: c.versionTitle })) } satisfies AstronomySources };
}
export async function appendAstronomySource(tx: HistoryTx, worldId: string, versionId: string, draft: LoreDraft, previous?: LoreRecord) {
  const cycle = draft.cycle === undefined ? previous?.draft.cycle : draft.cycle;
  if (draft.family === "skyCycle" && cycle) {
    let dayReferenceWorldId: string | null = null;
    if (cycle.scale === "elapsed-day" && cycle.anchor !== null) {
      const [reference] = await tx.select().from(worldDayReference).where(eq(worldDayReference.worldId, worldId));
      if (!reference) throw new WorldError("Establish this World's shared day reference in Calendars before using an elapsed-day anchor. An unanchored descriptive cycle can still be saved.", 400);
      dayReferenceWorldId = worldId;
    }
    const anchorSource = cycle.anchorCalendar ? await resolveHistoryCalendarSource(tx, worldId, { kind: cycle.approximate ? "approximate" : "known", start: cycle.anchorCalendar }, previous?.skySources?.anchor) : null;
    if (cycle.unit === "hour" || cycle.unit === "minute") {
      if (!anchorSource) throw new WorldError("Hour/minute periods require a saved anchored calendar version with explicit day units. Keep other units descriptive until a correspondence is known.", 400);
      const [calendar] = await tx.select().from(worldCalendarVersion).where(eq(worldCalendarVersion.id, anchorSource.start.versionId));
      if (!calendar.rules.timeUnits) throw new WorldError("This calendar has no explicit hours-per-day and minutes-per-hour definition.", 400);
    }
    const { phases, anchorCalendar: _, ...columns } = cycle; void _;
    await tx.insert(worldSkyRule).values({ ...columns, versionId, worldId, anchorSource, anchorVersionId: anchorSource?.start.versionId ?? null, dayReferenceWorldId });
    if (phases.length) await tx.insert(worldSkyPhase).values(phases.map((phase, position) => ({ ...phase, versionId, worldId, position })));
  }
  const bindings = draft.calendarBindings ?? previous?.draft.calendarBindings ?? [];
  const versions = bindings.length ? await tx.select({ version: worldCalendarVersion, calendar: worldCalendar }).from(worldCalendarVersion).innerJoin(worldCalendar, eq(worldCalendar.id, worldCalendarVersion.calendarId)).where(and(eq(worldCalendarVersion.worldId, worldId), inArray(worldCalendarVersion.id, bindings.map(b => b.calendarVersionId)))) : [];
  const rows = bindings.map((binding, position) => {
    const retained = previous?.skySources?.calendars.find(old => old.id === binding.id && old.calendarVersionId === binding.calendarVersionId && old.revision === binding.revision);
    const current = versions.find(v => v.version.id === binding.calendarVersionId);
    if (!current) throw new WorldError("Choose a calendar version in this World.", 400);
    if (!retained && (current.version.archivedAt || current.calendar.archivedAt)) throw new WorldError("Restore this calendar version before creating a new sky association.", 400);
    if (!retained && current.version.revision !== binding.revision) throw new WorldError("The selected calendar version changed. Your draft is retained; reload its definitions.", 409);
    return { ...binding, versionId, worldId, position, calendarName: retained?.calendarName ?? current.calendar.name, versionTitle: retained?.versionTitle ?? current.version.title };
  });
  if (rows.length) await tx.insert(worldSkyCalendarBinding).values(rows);
}
