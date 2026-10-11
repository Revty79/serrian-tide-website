import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldCalendar, worldCalendarVersion } from "@/db/world-calendar-schema";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { inheritedProjection } from "./branching-history";
import { CALENDAR_HISTORY_PAGE_SIZE, calendarHistoryQuerySchema, type CalendarHistoryPage } from "./calendar-history";
import { selectedTimeline } from "./history-version-service";
import type { EntryRecord } from "./history";
import { ordinaryHistorySource } from "./ordinary-knowledge";
import { WorldError, worldReadAccess } from "./world-service";

// Filter the selected effective sources BEFORE paging. This is independent of
// the History index's first visual page and never fills gaps from Primary.
export async function calendarHistory(userId: string, worldId: string, timelineId: string, input: unknown, review = false, ordinary = false): Promise<CalendarHistoryPage> {
  await worldReadAccess(userId, worldId, review);
  const query = calendarHistoryQuerySchema.parse(input);
  return db.transaction(async tx => {
    await selectedTimeline(tx, worldId, timelineId);
    const [definition] = await tx.select({id: worldCalendarVersion.id}).from(worldCalendarVersion)
      .innerJoin(worldCalendar, eq(worldCalendar.id, worldCalendarVersion.calendarId))
      .where(and(eq(worldCalendarVersion.id, query.versionId), eq(worldCalendarVersion.worldId, worldId), ordinary ? eq(worldCalendar.visibility, "ordinary") : undefined));
    if (!definition) throw new WorldError("This calendar definition is unavailable.", 404);
    const start = sql`coalesce((${worldHistoryVersion.payload}->'time'->>'year')::numeric,(${worldHistoryVersion.payload}->'time'->>'startYear')::numeric)`;
    const end = sql`coalesce((${worldHistoryVersion.payload}->'time'->>'year')::numeric,(${worldHistoryVersion.payload}->'time'->>'endYear')::numeric)`;
    const effectiveEnd = sql`case when ${worldHistoryHead.mode}='partial' and ${worldHistoryHead.coveredUntil} is not null then least(${end},${worldHistoryHead.coveredUntil}) else ${end} end`;
    const rows = await tx.select({head: worldHistoryHead, version: worldHistoryVersion}).from(worldHistoryHead)
      .innerJoin(worldHistoryVersion, eq(worldHistoryVersion.id, worldHistoryHead.versionId))
      .where(and(eq(worldHistoryHead.worldId, worldId), eq(worldHistoryHead.timelineId, timelineId),
        inArray(worldHistoryHead.mode, ["authored", "inherited", "partial", "interpretation"]), isNotNull(worldHistoryVersion.entryId),
        or(eq(worldHistoryVersion.startVersionId, query.versionId), eq(worldHistoryVersion.endVersionId, query.versionId)),
        query.includeArchived ? undefined : sql`not coalesce((${worldHistoryVersion.payload}->>'archived')::boolean,false)`,
        ordinary ? ordinaryHistorySource(worldId, timelineId, sql`${worldHistoryVersion.id}`) : undefined))
      .orderBy(sql`${start} asc nulls last`, sql`${effectiveEnd} asc nulls last`, sql`${worldHistoryVersion.payload}->>'title'`, asc(worldHistoryHead.entityId))
      .limit(CALENDAR_HISTORY_PAGE_SIZE + 1).offset(query.offset);
    const entries = rows.slice(0, CALENDAR_HISTORY_PAGE_SIZE).map(({head, version}) => {
      const record = inheritedProjection({...version.payload, revision: head.revision}, {
        mode: head.mode, timelineId, versionId: version.id, sourceTimelineId: head.sourceTimelineId,
        sourceVersionId: ordinary ? null : head.sourceVersionId, sourceRevision: ordinary ? null : head.sourceRevision, coveredUntil: head.coveredUntil,
        newerParent: false, parentRevision: null, parentVersionId: null,
      }) as EntryRecord;
      return ordinary ? {...record, notes: ""} : record;
    });
    return {entries, nextOffset: rows.length > CALENDAR_HISTORY_PAGE_SIZE ? query.offset + CALENDAR_HISTORY_PAGE_SIZE : null};
  }, {isolationLevel: "repeatable read", accessMode: "read only"});
}
