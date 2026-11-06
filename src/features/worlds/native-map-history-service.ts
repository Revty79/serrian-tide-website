import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {worldMapStateComponent} from "@/db/world-native-map-state-schema";
import {nativeConditionsSchema} from "./native-map-history";
import { db } from "@/db";
import { worldMapState, worldMapStateHead as heads } from "@/db/world-map-state-schema";
import { worldMapStateNativeRequest as requests } from "@/db/world-native-map-state-schema";
import { selectedTimeline } from "./history-version-service";
import { worldReadAccess, worldWriteTransaction, WorldError } from "./world-service";
import { yearSchema } from "./world-year";
import { nativeTargetInfo } from "./native-map-history-target";
import { captureNativeBaseline, retainCapturedNativeSource } from "./native-map-history-capture";
import { appendNativeVersion, loadNativeVersion, nativeChoices, nativeChoice, nativeContentHash, nativeHistoryAvailable, nativeHistoryConflict, nativeHistoryMissing, nativeManifestOf, nativeRevisionChoices, nativeVersionReachable, type NativeHistoryTx } from "./native-map-history-store";
import { NATIVE_HISTORY_LIMITS, nativeHistoryCommandSchema, nativeMapTargetSchema, nativeTargetKey, resolveNativeHistory, type NativeHistoryBundle, type NativeMapTarget, type NativeStateChoice } from "./native-map-history";
import type { MapStateDetails } from "./map-states";
import {bindNativeTownBackdrop} from "./native-map-history-backdrop";
import { bindNativeRegion } from "./native-map-history-geography";

async function requireAvailable(tx: NativeHistoryTx) {
  if (!await nativeHistoryAvailable(tx)) throw new WorldError("Migration 0158 is required for native historical appearances. Existing maps, earlier history and drafts remain intact.", 409);
}
function checkPeriod(states: NativeStateChoice[], details: MapStateDetails, except?: string) {
  if (states.some(s => s.id !== except && !s.archived && s.startYear <= details.endYear && s.endYear >= details.startYear))
    throw new WorldError("This period overlaps an active appearance of the same map in this timeline. Adjust the years or archive that appearance first.", 409);
}
export async function getNativeMapHistory(userId: string, worldId: string, input: NativeMapTarget, timelineId: string, options: {
  review?: boolean; ordinary?: boolean; year?: number; stateId?: string; versionId?: string;geographyVersionId?:string; prepareBaseline?: boolean;
} = {}): Promise<NativeHistoryBundle> {
  const access = await worldReadAccess(userId, worldId, !!options.review);
  if (options.ordinary) throw nativeHistoryMissing();
  const target = nativeMapTargetSchema.parse(input);
  if (options.year !== undefined) yearSchema.parse(options.year);
  const read = async (tx: NativeHistoryTx) => {
    await requireAvailable(tx);
    const timeline = await selectedTimeline(tx, worldId, timelineId);
    const parent = timeline.parentId ? await selectedTimeline(tx, worldId, timeline.parentId) : null;
    const info = await nativeTargetInfo(tx, worldId, target);
    if(options.geographyVersionId&&target.kind!=="town"&&(target.kind!=="terrain"||target.id===info.anchorMapId))throw new WorldError("Choose a separate dated World source only for a Region.",400);
    const states = await nativeChoices(tx, worldId, timelineId, target);
    let selected = options.stateId ? states.find(s => s.id === options.stateId) ?? null
      : options.year !== undefined ? resolveNativeHistory(states, target, options.year) : null;
    if (options.stateId && !selected) throw nativeHistoryMissing();
    const revisions = selected ? await nativeRevisionChoices(tx, worldId, selected) : [];
    if (options.versionId) {
      if (!selected || !await nativeVersionReachable(tx, worldId, timelineId, target, options.versionId)) throw nativeHistoryMissing();
      const retained = await loadNativeVersion(tx, worldId, options.versionId, target);
      if (retained.stateId !== selected.id) throw nativeHistoryMissing();
      selected = { ...selected, ...nativeChoice(retained, { timelineId, worldId, mapId: retained.mapId, stateId: selected.id, versionId: retained.id, revision: selected.revision, mode: selected.mode }) };
    }
    const result: NativeHistoryBundle = {
      available: true,baselineAvailable:info.baselineAvailable!==false, target, anchorMapId: info.anchorMapId, targetName: info.name,
      timelineId, timelineName: timeline.name, parentTimelineName: parent?.name ?? null,
      year: options.year ?? null, states, parentStates: parent ? await nativeChoices(tx, worldId, parent.id, target) : [],
      revisions, selected, coverage: selected && !selected.archived && (options.year === undefined || selected.startYear <= options.year && selected.endYear >= options.year)
        ? "established" : options.year !== undefined ? "unknown" : "baseline",
      canEdit: access.ownerId === userId && !access.archivedAt && !options.review && !timeline.archivedAt,
    };
    if ((target.kind === "town" || target.kind === "terrain" && target.id !== info.anchorMapId) && options.year !== undefined) {
      const parentTarget = { kind: "terrain" as const, id: info.anchorMapId };
      const retained = options.versionId ? await loadNativeVersion(tx, worldId, options.versionId, target) : undefined;
      const dependency = options.geographyVersionId?{versionId:options.geographyVersionId}:retained ? nativeManifestOf(retained).dependencies.find(d => nativeTargetKey(d.target) === nativeTargetKey(parentTarget)) : undefined;
      if(options.geographyVersionId&&!await nativeVersionReachable(tx,worldId,timelineId,parentTarget,options.geographyVersionId))throw nativeHistoryMissing();
      if (dependency) {
        const exact = await loadNativeVersion(tx, worldId, dependency.versionId, parentTarget);
        result.geographySource = exact.stateId ? { stateId: exact.stateId, versionId: exact.id, name: exact.name } : null;
        if(exact.archived||exact.startYear!>options.year||exact.endYear!<options.year){if(target.kind==="terrain")result.coverage="unknown";result.geographySource=null;}
        if(!await nativeVersionReachable(tx,worldId,timelineId,parentTarget,exact.id)){result.geographySource=null;if(target.kind==="terrain")result.coverage="unknown";}
      } else {
        const geography = retained&&target.kind==="town"?null:resolveNativeHistory(await nativeChoices(tx, worldId, timelineId, parentTarget), parentTarget, options.year);
        result.geographySource = geography ? { stateId: geography.id, versionId: geography.versionId, name: geography.name } : null;
        if(!geography&&target.kind==="terrain")result.coverage="unknown";
      }
    }
    if(selected){
      const version=await loadNativeVersion(tx,worldId,(target.kind==="terrain"?result.geographySource?.versionId:undefined)??selected.versionId);
      const ref=nativeManifestOf(version).resources.find(r=>r.key==="conditions");
      if(ref){const [component]=await tx.select().from(worldMapStateComponent).where(and(eq(worldMapStateComponent.id,ref.componentId),eq(worldMapStateComponent.worldId,worldId)));if(component)result.conditions=nativeConditionsSchema.parse(component.payload.values);}
    }
    if (options.prepareBaseline&&info.baselineAvailable!==false) {
      if (!result.canEdit) throw new WorldError("Only the World owner can prepare a new historical authoring source.", 403);
      const captured = await captureNativeBaseline(tx, userId, worldId, info);
      result.baselinePin = captured.pin; result.sourceSummary = captured.summary;
    }
    return result;
  };
  // Deliberate baseline preparation holds the established World writer lock so
  // the native read services see a coherent exact source. It writes no records.
  if (options.prepareBaseline) return worldWriteTransaction(userId, worldId, read);
  return db.transaction(read, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function changeNativeMapHistory(userId: string, worldId: string, raw: unknown) {
  const command = nativeHistoryCommandSchema.parse(raw), inputHash = nativeContentHash(command);
  return worldWriteTransaction(userId, worldId, async tx => {
    await requireAvailable(tx);
    const targetKey = nativeTargetKey(command.target);
    const [retry] = await tx.select().from(requests).where(eq(requests.requestId, command.requestId));
    if (retry) {
      if (retry.worldId !== worldId || retry.timelineId !== command.timelineId || retry.targetKey !== targetKey || retry.authorId !== userId || retry.inputHash !== inputHash) throw nativeHistoryConflict();
      return retry.result;
    }
    const timeline = await selectedTimeline(tx, worldId, command.timelineId);
    if (timeline.archivedAt) throw new WorldError("Restore this timeline before authoring historical map content.", 409);
    const info = await nativeTargetInfo(tx, worldId, command.target);
    const states = await nativeChoices(tx, worldId, timeline.id, command.target);
    let result: Record<string, unknown>;
    if (command.action === "retain") {
      if (!timeline.parentId) throw nativeHistoryMissing();
      const parent = (await nativeChoices(tx, worldId, timeline.parentId, command.target)).find(s => s.id === command.stateId);
      if (!parent || parent.archived) throw nativeHistoryMissing();
      if (parent.versionId !== command.sourceVersionId || parent.revision !== command.sourceRevision) throw nativeHistoryConflict();
      if (states.some(s => s.id === parent.id)) throw new WorldError("This appearance is already retained. Its exact source will not be replaced by a later parent revision.", 409);
      if (states.length >= NATIVE_HISTORY_LIMITS.appearances) throw new WorldError("This map has reached 128 retained appearances in this timeline.", 413);
      checkPeriod(states, parent);
      const source = await loadNativeVersion(tx, worldId, parent.versionId, command.target);
      await tx.insert(heads).values({ timelineId: timeline.id, worldId, mapId: source.mapId, stateId: parent.id, versionId: source.id, revision: 1, mode: "retained" });
      result = { id: parent.id, versionId: source.id, revision: 1 };
    } else if (command.action === "create") {
      if (states.length >= NATIVE_HISTORY_LIMITS.appearances) throw new WorldError("This map has reached 128 retained appearances in this timeline.", 413);
      checkPeriod(states, command.details);
      let source;
      if (command.sourceVersionId) {
        if (!await nativeVersionReachable(tx, worldId, timeline.id, command.target, command.sourceVersionId)) throw nativeHistoryMissing();
        source = await loadNativeVersion(tx, worldId, command.sourceVersionId, command.target);
      } else {
        if(info.baselineAvailable===false)throw new WorldError("This map was introduced by a dated appearance and has no current baseline. Choose an exact retained historical source.",409);
        const captured = await captureNativeBaseline(tx, userId, worldId, info);
        if (captured.pin !== command.baselinePin) throw new WorldError("The baseline changed after source review. Your historical settings are retained; review its new exact source before creating this appearance.", 409);
        const manifest = await retainCapturedNativeSource(tx, userId, worldId, info, captured);
        source = await appendNativeVersion(tx, { worldId, anchorMapId: info.anchorMapId, timelineId: timeline.id, authorId: userId, stateId: null, manifest, baselineRevision: info.revision });
      }
      const stateId = randomUUID();
      await tx.insert(worldMapState).values({ id: stateId, worldId, mapId: source.mapId, originTimelineId: timeline.id });
      let manifest = await bindNativeRegion(tx, worldId, userId, timeline.id, command.details.startYear, nativeManifestOf(source), command.geographyVersionId);
      manifest=await bindNativeTownBackdrop(tx,worldId,userId,timeline.id,command.details.startYear,manifest,command.geographyVersionId,true);
      const version = await appendNativeVersion(tx, { worldId, anchorMapId: source.mapId, timelineId: timeline.id, authorId: userId, stateId, source, details: command.details, manifest, baselineRevision: source.baselineRevision });
      await tx.insert(heads).values({ timelineId: timeline.id, worldId, mapId: source.mapId, stateId, versionId: version.id, revision: 1, mode: "authored" });
      result = { id: stateId, versionId: version.id, revision: 1 };
    }else if(command.action==="split"){
      const current=states.find(s=>s.id===command.stateId);if(!current)throw nativeHistoryMissing();
      if(current.revision!==command.revision)throw nativeHistoryConflict();
      if(current.archived||command.year<=current.startYear||command.year>current.endYear)throw new WorldError("Choose a later year inside this active appearance to start an independent period.",400);
      if(states.length>=NATIVE_HISTORY_LIMITS.appearances)throw new WorldError("This map has reached 128 retained appearances in this timeline.",413);
      const source=await loadNativeVersion(tx,worldId,current.versionId,command.target),original=nativeManifestOf(source);
      const earlier=await appendNativeVersion(tx,{worldId,anchorMapId:source.mapId,timelineId:timeline.id,authorId:userId,stateId:current.id,source,details:{...current,endYear:command.year-1},manifest:original,baselineRevision:source.baselineRevision});
      await tx.update(heads).set({versionId:earlier.id,revision:current.revision+1,mode:current.mode==="retained"?"interpretation":current.mode}).where(and(eq(heads.timelineId,timeline.id),eq(heads.stateId,current.id)));
      const stateId=randomUUID();await tx.insert(worldMapState).values({id:stateId,worldId,mapId:source.mapId,originTimelineId:timeline.id});
      let manifest=await bindNativeRegion(tx,worldId,userId,timeline.id,command.year,original,command.geographyVersionId);
      manifest=await bindNativeTownBackdrop(tx,worldId,userId,timeline.id,command.year,manifest,command.geographyVersionId,true);
      const version=await appendNativeVersion(tx,{worldId,anchorMapId:source.mapId,timelineId:timeline.id,authorId:userId,stateId,source,details:{...current,name:command.name,startYear:command.year},manifest,baselineRevision:source.baselineRevision});
      await tx.insert(heads).values({timelineId:timeline.id,worldId,mapId:source.mapId,stateId,versionId:version.id,revision:1,mode:"authored"});
      result={id:stateId,versionId:version.id,revision:1,earlierStateId:current.id,earlierVersionId:earlier.id};
    } else {
      const current = states.find(s => s.id === command.stateId);
      if (!current) throw nativeHistoryMissing();
      if (current.revision !== command.revision) throw nativeHistoryConflict();
      if (command.action === "details" && current.archived) throw new WorldError("Restore this historical appearance before editing its details.", 409);
      const details = command.action === "details" ? command.details : current;
      const archived = command.action === "archive" ? true : command.action === "restore" ? false : current.archived;
      if (!archived) checkPeriod(states, details, current.id);
      const source = await loadNativeVersion(tx, worldId, current.versionId, command.target);
      let manifest = command.action === "details" ? await bindNativeRegion(tx, worldId, userId, timeline.id, details.startYear, nativeManifestOf(source), command.geographyVersionId) : nativeManifestOf(source);
      if(command.action==="details")manifest=await bindNativeTownBackdrop(tx,worldId,userId,timeline.id,details.startYear,manifest,command.geographyVersionId,true);
      const version = await appendNativeVersion(tx, { worldId, anchorMapId: source.mapId, timelineId: timeline.id, authorId: userId, stateId: current.id, source, details, archived, manifest, baselineRevision: source.baselineRevision });
      await tx.update(heads).set({ versionId: version.id, revision: current.revision + 1, mode: current.mode === "retained" ? "interpretation" : current.mode }).where(and(eq(heads.timelineId, timeline.id), eq(heads.stateId, current.id)));
      result = { id: current.id, versionId: version.id, revision: current.revision + 1 };
    }
    await tx.insert(requests).values({ requestId: command.requestId, worldId, timelineId: timeline.id, targetKey, inputHash, authorId: userId, result });
    return result;
  });
}
