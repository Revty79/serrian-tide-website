import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { worldStoryContext, worldStorySource } from "@/db/world-story-schema";
import { worldLoreHead, worldLoreVersion, worldStoryVersion } from "@/db/world-peoples-schema";
import { sourceDatingFor, WorldError } from "./world-service";
import { resolveHistoryCalendarSource } from "./calendar-evolution-service";
import type { HistoryTx } from "./history-version-service";
import type { LoreDraft, LoreRecord } from "./peoples";
import type { StorySources } from "./stories";
import type { CalendarSource } from "./calendar-dates";

function calendarDraft(source: CalendarSource | null) {
  if (!source) return undefined;
  const start = { versionId: source.start.versionId, revision: source.start.revision, date: source.start.date };
  return source.kind === "duration" || source.kind === "window" ? { kind: source.kind, start, end: { versionId: source.end!.versionId, revision: source.end!.revision, date: source.end!.date } } : { kind: source.kind, start };
}
export async function readStorySource(tx: HistoryTx, worldId: string, timelineId: string, versionId: string) {
  const [context] = await tx.select().from(worldStoryContext).where(and(eq(worldStoryContext.worldId, worldId), eq(worldStoryContext.versionId, versionId)));
  if (!context) throw new WorldError("This story's retained context is unavailable.", 404);
  const originals = await tx.select({ link: worldStorySource, source: worldLoreVersion, name: worldStoryVersion.name }).from(worldStorySource)
    .innerJoin(worldLoreVersion, eq(worldLoreVersion.id, worldStorySource.sourceVersionId)).innerJoin(worldStoryVersion, eq(worldStoryVersion.versionId, worldLoreVersion.id))
    .where(and(eq(worldStorySource.worldId, worldId), eq(worldStorySource.versionId, versionId))).orderBy(asc(worldStorySource.position));
  const heads = originals.length ? await tx.select({ id: worldLoreHead.entityId, mode: worldLoreHead.mode, archived: worldLoreVersion.archived }).from(worldLoreHead).innerJoin(worldLoreVersion, eq(worldLoreVersion.id, worldLoreHead.versionId))
    .where(and(eq(worldLoreHead.worldId, worldId), eq(worldLoreHead.timelineId, timelineId), inArray(worldLoreHead.entityId, originals.map(o => o.link.entityId)))) : [];
  const storySources = originals.map(({ link }) => ({ id: link.id, entityId: link.entityId, versionId: link.sourceVersionId, revision: link.sourceRevision, relationshipType: link.relationshipType, account: link.account, protected: link.protected }));
  return {
    storyContext: { time: context.time, protected: context.protected, datingSystemId: context.datingSystemId, datingSystemRevision: context.sourceDating?.revision, calendarDate: calendarDraft(context.calendarSource) }, storySources,
    sources: { context: { sourceDating: context.sourceDating, calendarSource: context.calendarSource }, originals: originals.map(({ source, name, link }, i) => {
      const current = heads.find(h => h.id === link.entityId);
      return { ...storySources[i], name, sourceTimelineId: source.timelineId, archived: source.archived, unavailable: !current || current.archived || current.mode === "pending" || current.mode === "excluded" };
    }) } satisfies StorySources,
  };
}
export async function appendStorySource(tx: HistoryTx, worldId: string, timelineId: string, versionId: string, draft: LoreDraft, previous?: LoreRecord) {
  const context = draft.storyContext ?? { time: { version: 1 as const, scale: "world-year" as const, kind: "undated" as const }, protected: false };
  const years = context.time.kind === "undated" ? [] : "year" in context.time ? [context.time.year] : [context.time.startYear, context.time.endYear];
  const dating = await sourceDatingFor(tx, worldId, context.datingSystemId, context.datingSystemRevision, years, previous?.storySources ? { datingSystemId: previous.draft.storyContext?.datingSystemId ?? null, sourceDating: previous.storySources.context.sourceDating } : undefined);
  const calendarSource = await resolveHistoryCalendarSource(tx, worldId, context.calendarDate, previous?.storySources?.context.calendarSource);
  await tx.insert(worldStoryContext).values({ versionId, worldId, time: context.time, protected: context.protected, ...dating, calendarSource, startVersionId: calendarSource?.start.versionId ?? null, endVersionId: calendarSource?.end?.versionId ?? null });
  for (const [position, link] of (draft.storySources ?? []).entries()) {
    const retained = previous?.draft.storySources?.some(old => old.id === link.id && old.entityId === link.entityId && old.versionId === link.versionId && old.revision === link.revision);
    const [source] = await tx.select().from(worldLoreVersion).where(and(eq(worldLoreVersion.id, link.versionId), eq(worldLoreVersion.worldId, worldId), eq(worldLoreVersion.entityId, link.entityId), eq(worldLoreVersion.family, "story")));
    if (!source) throw new WorldError("Choose an earlier story saved in this World.", 400);
    if (!retained) {
      const [head] = await tx.select().from(worldLoreHead).where(and(eq(worldLoreHead.worldId, worldId), eq(worldLoreHead.timelineId, timelineId), eq(worldLoreHead.entityId, link.entityId)));
      if (!head || head.versionId !== link.versionId || head.revision !== link.revision || source.archived || head.mode === "pending" || head.mode === "excluded") throw new WorldError("The earlier account changed or is unavailable. Your draft is retained; refresh the saved choices.", 409);
    }
    // An author may explicitly retain their own previous account as a source.
    await tx.insert(worldStorySource).values({ versionId, worldId, id: link.id, position, entityId: link.entityId, sourceVersionId: link.versionId, sourceRevision: link.revision, relationshipType: link.relationshipType, account: link.account, protected: link.protected });
  }
}
