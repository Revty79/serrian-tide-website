import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { userRole } from "@/db/authorization-schema";
import { world, worldTimeline } from "@/db/world-schema";
import { worldAuthoringSelection, worldCampaignContext, worldCampaignContextChange, worldCampaignHome } from "@/db/world-campaign-schema";
import { WorldError, worldReadAccess } from "./world-service";
import { associationCommandSchema, CONTEXT_LIMIT, type AssociationBundle, type CampaignChoice, type CampaignContext } from "./campaign-associations";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Tx;
type ContextRow = typeof worldCampaignContext.$inferSelect;
const unavailable = () => new WorldError("This World–Campaign context is unavailable.", 404);
const stale = () => new WorldError("A newer version was saved in another tab. Your draft is retained. Load the latest associations before trying again.", 409);
async function actor(userId: string) {
  const roles = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  if (!roles.some(row => row.role === "god" || row.role === "admin")) throw new WorldError("G.O.D. or administrator access is required.", 403);
}
export async function eligibleCampaigns(userId: string): Promise<CampaignChoice[]> {
  await actor(userId);
  const rows = await db.select({ id: campaign.id, name: campaign.name, updatedAt: campaign.updatedAt }).from(campaign)
    .where(and(eq(campaign.createdByUserId, userId), isNull(campaign.archivedAt))).orderBy(asc(campaign.name), asc(campaign.id)).limit(CONTEXT_LIMIT + 1);
  if (rows.length > CONTEXT_LIMIT) throw new WorldError(`Campaign selection supports up to ${CONTEXT_LIMIT} eligible Campaigns.`, 400);
  return rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}
async function selection(connection: Connection, userId: string) {
  const [row] = await connection.select().from(worldAuthoringSelection).where(eq(worldAuthoringSelection.userId, userId));
  return { contextId: row?.contextId ?? null, viewingYear: row?.viewingYear ?? null, revision: row?.revision ?? 0 };
}
async function contexts(connection: Connection, filter: { worldId?: string; campaignId?: number; creatorId?: string; contextId?:string }) {
  const rows = await connection.select({ row: worldCampaignContext, world: world, timeline: worldTimeline,
    campaign: { id: campaign.id, name: campaign.name, archivedAt: campaign.archivedAt }, home: worldCampaignHome }).from(worldCampaignContext)
    .innerJoin(world, eq(world.id, worldCampaignContext.worldId))
    .innerJoin(worldTimeline, and(eq(worldTimeline.id, worldCampaignContext.timelineId), eq(worldTimeline.worldId, world.id)))
    .leftJoin(campaign, and(eq(campaign.id, worldCampaignContext.campaignId), eq(campaign.createdByUserId, world.ownerId), eq(campaign.createdByUserId, worldCampaignContext.creatorId)))
    .leftJoin(worldCampaignHome, eq(worldCampaignHome.campaignId, worldCampaignContext.campaignId))
    .where(and(filter.worldId ? eq(worldCampaignContext.worldId, filter.worldId) : undefined, filter.campaignId ? eq(worldCampaignContext.campaignId, filter.campaignId) : undefined, filter.creatorId ? and(eq(world.ownerId,filter.creatorId),eq(worldCampaignContext.creatorId,filter.creatorId)) : undefined,filter.contextId?eq(worldCampaignContext.id,filter.contextId):undefined))
    .orderBy(asc(worldCampaignContext.campaignId), asc(worldTimeline.name)).limit(CONTEXT_LIMIT + 1);
  if (rows.length > CONTEXT_LIMIT) throw new WorldError(`This view exceeds ${CONTEXT_LIMIT} retained associations.`, 400);
  const homes = new Map<number, AssociationBundle["homes"][number]>();
  const records: CampaignContext[] = rows.map(({ row, world: w, timeline, campaign: c, home }) => {
    homes.set(row.campaignId, { campaignId: row.campaignId, contextId: home?.contextId ?? null, revision: home?.revision ?? 1 });
    const ownershipAvailable = !!c;
    return { id: row.id, campaignId: row.campaignId, campaignName: c?.name ?? "Campaign unavailable", worldId: row.worldId,
      worldName: ownershipAvailable ? w.name : "World context unavailable", timelineId: row.timelineId,
      timelineName: ownershipAvailable ? timeline.name : "Timeline unavailable", startingYear: row.startingYear, revision: row.revision,
      removed: !!row.removedAt, worldArchived: !!w.archivedAt, campaignArchived: !!c?.archivedAt, timelineArchived: !!timeline.archivedAt,
      ownershipAvailable, available: ownershipAvailable && !row.removedAt && !w.archivedAt && !c?.archivedAt && !timeline.archivedAt,
      home: home?.contextId === row.id };
  });
  return { contexts: records, homes: [...homes.values()] };
}
export async function worldCampaignAssociations(userId: string, worldId: string, review = false): Promise<AssociationBundle> {
  const parent = await worldReadAccess(userId, worldId, review);
  const result = await db.transaction(async tx => ({ ...await contexts(tx, { worldId }), selection: review ? { contextId: null, viewingYear: null, revision: 0 } : await selection(tx, userId) }), { isolationLevel: "repeatable read", accessMode: "read only" });
  return { ...result, choices: review ? [] : await eligibleCampaigns(userId), canManage: !review && parent.ownerId === userId };
}
export async function campaignWorldAssociations(userId: string, campaignId: number): Promise<AssociationBundle> {
  await actor(userId);
  const [owned] = await db.select({ id: campaign.id, archivedAt: campaign.archivedAt }).from(campaign).where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, userId)));
  if (!owned) throw unavailable();
  return db.transaction(async tx => ({ ...await contexts(tx, { campaignId,creatorId:userId }), selection: await selection(tx, userId), choices: [], canManage: !owned.archivedAt }), { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function authoringContextSummary(userId:string){
  await actor(userId);
  return db.transaction(async tx=>{
    const current=await selection(tx,userId);
    const row=current.contextId?(await contexts(tx,{contextId:current.contextId,creatorId:userId})).contexts[0]??null:null;
    return {selection:current,context:row};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function audit(tx: Tx, actorId: string, row: ContextRow, action: "link" | "edit" | "remove" | "restore" | "home", extra: object = {}) {
  await tx.insert(worldCampaignContextChange).values({ contextId: row.id, actorId, action, snapshot: { ...row, ...extra } });
}
async function link(tx: Tx, userId: string, worldId: string, campaignId: number, timelineId: string, startingYear: number | null) {
  const existing = await tx.select({ id: worldCampaignContext.id }).from(worldCampaignContext).where(and(eq(worldCampaignContext.campaignId, campaignId), eq(worldCampaignContext.worldId, worldId), eq(worldCampaignContext.timelineId, timelineId)));
  if (existing.length) throw new WorldError("This Campaign and timeline already have a retained association. Reload to edit or restore it.", 409);
  const [counts] = await tx.select({ world: sql<number>`(select count(*)::integer from world_campaign_context where world_id=${worldId})`, campaign: sql<number>`(select count(*)::integer from world_campaign_context where campaign_id=${campaignId})` }).from(campaign).where(eq(campaign.id,campaignId));
  if (counts.world >= CONTEXT_LIMIT || counts.campaign >= CONTEXT_LIMIT) throw new WorldError(`Each World and Campaign supports ${CONTEXT_LIMIT} retained associations.`, 400);
  const [row] = await tx.insert(worldCampaignContext).values({ id: randomUUID(), worldId, campaignId, timelineId, creatorId: userId, startingYear }).returning();
  await tx.insert(worldCampaignHome).values({ campaignId }).onConflictDoNothing();
  await audit(tx, userId, row, "link");
  return row.id;
}
/** Called inside World creation after Campaign locks, before committing any records. */
export async function initialCampaignAssociations(tx: Tx, userId: string, worldId: string, choices: { id: number; updatedAt: string }[]) {
  const [primary] = await tx.select().from(worldTimeline).where(and(eq(worldTimeline.worldId, worldId), eq(worldTimeline.primary, true)));
  for (const choice of choices) await link(tx, userId, worldId, choice.id, primary.id, null);
}
/** Campaign locks always precede existing World locks, in ascending ID order. */
export async function lockCreationCampaigns(tx: Tx, userId: string, choices: { id: number; updatedAt: string }[]) {
  if (!choices.length) return;
  const rows = await tx.select().from(campaign).where(and(inArray(campaign.id, choices.map(item => item.id)), eq(campaign.createdByUserId, userId))).orderBy(asc(campaign.id)).for("update");
  if (rows.length !== choices.length) throw unavailable();
  for (const row of rows) {
    if (row.archivedAt) throw new WorldError("Choose an active Campaign owned by you.", 400);
    if (row.updatedAt.toISOString() !== choices.find(item => item.id === row.id)!.updatedAt) throw new WorldError("A selected Campaign changed. Refresh the choices; your World draft is retained.", 409);
  }
}
export async function changeCampaignAssociation(userId: string, worldId: string, input: unknown) {
  await actor(userId);
  const command = associationCommandSchema.parse(input);
  return db.transaction(async tx => {
    const [ownedCampaign] = await tx.select().from(campaign).where(and(eq(campaign.id, command.campaignId), eq(campaign.createdByUserId, userId))).for("update");
    if (!ownedCampaign) throw unavailable();
    const replacementId = command.action === "remove" ? command.replacementId : null;
    const [replacement] = replacementId ? await tx.select().from(worldCampaignContext).where(and(eq(worldCampaignContext.id, replacementId), eq(worldCampaignContext.campaignId, command.campaignId), eq(worldCampaignContext.creatorId, userId))) : [];
    if (replacementId && !replacement) throw unavailable();
    const worldIds = [...new Set([worldId, ...(replacement ? [replacement.worldId] : [])])].sort();
    const ownedWorlds = await tx.select().from(world).where(and(inArray(world.id, worldIds), eq(world.ownerId, userId))).orderBy(asc(world.id)).for("update");
    if (ownedWorlds.length !== worldIds.length) throw unavailable();
    const parent = ownedWorlds.find(row => row.id === worldId)!;
    const availableContext = async (row: ContextRow, restoring = false) => {
      const [timeline] = await tx.select().from(worldTimeline).where(and(eq(worldTimeline.id, row.timelineId), eq(worldTimeline.worldId, row.worldId)));
      if (!timeline || row.creatorId !== userId) throw unavailable();
      if (ownedCampaign.archivedAt || ownedWorlds.find(item => item.id === row.worldId)?.archivedAt || timeline.archivedAt || row.removedAt && !restoring) throw new WorldError("Restore the Campaign, World, timeline and association before using this context.", 400);
    };
    if (command.action === "link") {
      if (ownedCampaign.updatedAt.toISOString() !== command.campaignUpdatedAt) throw stale();
      const [timeline] = await tx.select().from(worldTimeline).where(and(eq(worldTimeline.id, command.timelineId), eq(worldTimeline.worldId, worldId)));
      if (!timeline) throw unavailable();
      if (parent.archivedAt || ownedCampaign.archivedAt || timeline.archivedAt) throw new WorldError("Choose an active World, Campaign and timeline.", 400);
      return link(tx, userId, worldId, command.campaignId, timeline.id, command.startingYear);
    }
    const [home] = await tx.select().from(worldCampaignHome).where(eq(worldCampaignHome.campaignId, command.campaignId)).for("update");
    const readContext = async (id: string) => {
      const [row] = await tx.select().from(worldCampaignContext).where(and(eq(worldCampaignContext.id, id), eq(worldCampaignContext.worldId, worldId), eq(worldCampaignContext.campaignId, command.campaignId), eq(worldCampaignContext.creatorId, userId))).for("update");
      if (!row) throw unavailable();
      return row;
    };
    if (!home) throw unavailable();
    if (command.action === "select") {
      if (command.contextId) await availableContext(await readContext(command.contextId));
      else if (command.viewingYear !== null) throw new WorldError("Choose a context before entering a viewing year.", 400);
      // The preference is private to this creator. Initialize under the same lock
      // path so two first selections also receive a real revision conflict.
      await tx.insert(worldAuthoringSelection).values({ userId }).onConflictDoNothing();
      const [current] = await tx.select().from(worldAuthoringSelection).where(eq(worldAuthoringSelection.userId, userId)).for("update");
      if (current.revision !== command.revision) throw stale();
      await tx.update(worldAuthoringSelection).set({ contextId: command.contextId, viewingYear: command.viewingYear, revision: current.revision + 1, updatedAt: new Date() }).where(eq(worldAuthoringSelection.userId, userId));
      return;
    }
    if (command.action === "home") {
      if (home.revision !== command.revision) throw stale();
      const row = command.contextId ? await readContext(command.contextId) : home.contextId ? await tx.select().from(worldCampaignContext).where(eq(worldCampaignContext.id, home.contextId)).then(rows => rows[0]) : null;
      if (command.contextId && row) await availableContext(row);
      // Require an actual retained relationship with this World, even when clearing.
      if (!(await tx.select({ id: worldCampaignContext.id }).from(worldCampaignContext).where(and(eq(worldCampaignContext.campaignId, command.campaignId), eq(worldCampaignContext.worldId, worldId))).limit(1)).length) throw unavailable();
      await tx.update(worldCampaignHome).set({ contextId: command.contextId, revision: home.revision + 1, updatedAt: new Date() }).where(eq(worldCampaignHome.campaignId, command.campaignId));
      if (row) await audit(tx, userId, row, "home", { previousHome: home.contextId, nextHome: command.contextId });
      return;
    }
    const row = await readContext(command.id);
    if (row.revision !== command.revision) throw stale();
    if (command.action === "remove") {
      if (home.revision !== command.homeRevision) throw stale();
      if (row.removedAt) throw new WorldError("This association is already removed. Restore it deliberately.", 400);
      if (home.contextId === row.id) {
        if (!command.homeOutcome) throw new WorldError("Choose a replacement home or explicitly clear the home designation before removing it.", 400);
        if (command.homeOutcome === "replace") {
          if (!replacement || replacement.id === row.id) throw new WorldError("Choose another available home context.", 400);
          await availableContext(replacement);
        }
        await tx.update(worldCampaignHome).set({ contextId: command.homeOutcome === "replace" ? replacement!.id : null, revision: home.revision + 1, updatedAt: new Date() }).where(eq(worldCampaignHome.campaignId, command.campaignId));
        await audit(tx, userId, row, "home", { previousHome: row.id, nextHome: command.homeOutcome === "replace" ? replacement!.id : null });
      }
    } else {
      await availableContext(row, command.action === "restore");
      if (command.action === "restore" && !row.removedAt) throw new WorldError("This association is already active.", 400);
    }
    const [saved] = await tx.update(worldCampaignContext).set({ revision: row.revision + 1, updatedAt: new Date(),
      ...(command.action === "edit" ? { startingYear: command.startingYear } : { removedAt: command.action === "remove" ? new Date() : null }) }).where(eq(worldCampaignContext.id, row.id)).returning();
    await audit(tx, userId, saved, command.action);
  });
}
