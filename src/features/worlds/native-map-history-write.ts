import { lockWorldForWrite,worldProtectedContent } from "./world-access-service";
import { projectWorldPinnedContent } from "./world-pinned-content";
import { preservePrivateCreatorNotes } from "./world-content-projection";
import { redactUnderground,undergroundDesignSchema } from "./underground";
import type { WorldScope } from "./world-permissions";
import { nativeWorldScope } from "./world-permissions";
import "server-only";
import { and, eq } from "drizzle-orm";
import { worldMapStateHead as heads } from "@/db/world-map-state-schema";
import { worldMapStateNativeRequest as requests } from "@/db/world-native-map-state-schema";
import { nativeContentContext, nativeResource, type NativeContentContext } from "./native-map-history-context";
import { appendNativeVersion, nativeContentHash, nativeHistoryConflict, nativeManifestOf, storeNativeComponent, type NativeHistoryTx } from "./native-map-history-store";
import { nativeHistoryScopeSchema, nativeManifestSchema, nativeTargetKey, type NativeHistoryScope, type NativeResource, type NativeManifest } from "./native-map-history";
import { worldWriteTransaction, WorldError } from "./world-service";
import {nativeGeographicResource} from "./native-map-history-geography";
import type {LabelsLayer} from "./terrain-labels";
import {assertNativeRevision} from "./native-map-history-resources";
import {bindNativeTownBackdrop} from "./native-map-history-backdrop";
import { atlasId } from "./atlas";
import {assertCraftBudget} from "./craft-budget";

export type NativeComponentUpdate = { key: string; kind: NativeResource["kind"]; payload: Record<string, unknown> };
export type NativeWriteResult = { updates: NativeComponentUpdate[]; result: Record<string, unknown>;unchangedParent?:true;dependencies?:NativeManifest["dependencies"] };


export async function commitNativeUpdates(tx: NativeHistoryTx, context: NativeContentContext, updates: NativeComponentUpdate[], input?: NativeManifest) {
  const required=new Set<WorldScope>([nativeWorldScope(context.scope.target.kind)]);
  for(const update of updates){
    if(update.key==="composition")required.add("assets");
    if(update.key==="territories"){required.add("politics");required.add("atlas");}
    if(update.key==="places")required.add("settlements");
    if(update.key==="craft-positions"){required.add("craft");required.add("atlas");}
    if(update.key==="connections")required.add("underground");
    if(["town","floor","underground","craft","deck","craft-context"].includes(update.key))required.add(nativeWorldScope(update.key==="craft-context"?"craft":update.key));
    if(!worldProtectedContent(context.worldId)){
      const previous=context.manifest.resources.some(r=>r.key===update.key)?(await nativeResource(tx,context,update.key)).payload:undefined;
      if(previous&&JSON.stringify(await projectWorldPinnedContent(previous,context.worldId,context.scope.timelineId,tx))!==JSON.stringify(previous))throw new WorldError("This saved layer retains sources outside your current permission. Ask the owner to include those sources before editing this layer; the original remains retained.",403);
      if(update.key==="underground"){
        const old=(previous?.bundle as {document?:{design:unknown}}|undefined)?.document?.design;
        const incoming=(update.payload.bundle as {document?:{design:unknown}}|undefined)?.document?.design;if(incoming){const design=undergroundDesignSchema.parse(incoming);if(JSON.stringify(redactUnderground(design).features)!==JSON.stringify(design.features))throw new WorldError("Hidden underground details require the owner's protected-content permission.",403);}
        if(old){const design=undergroundDesignSchema.parse(old);if(JSON.stringify(redactUnderground(design).features)!==JSON.stringify(design.features))throw new WorldError("This dated level includes hidden content. Ask the owner for protected-content permission before changing it.",403);}
      }
      try{update.payload=preservePrivateCreatorNotes(update.payload,previous);}catch(error){throw new WorldError((error as Error).message,403);}
    }
  }
  await lockWorldForWrite(tx,context.userId,context.worldId,[...required]);
  let manifest = input ?? nativeManifestOf(context.version);
  if(context.authority){
    const key=nativeTargetKey(context.authority.scope.target),before=nativeManifestOf(context.version).dependencies.find(d=>nativeTargetKey(d.target)===key),incoming=manifest.dependencies.find(d=>nativeTargetKey(d.target)===key);
    // A geographical write may already have supplied a newly committed Root.
    // Local writes retain the exact dated World they actually read as well.
    if(!incoming||incoming.versionId===before?.versionId){const authority=nativeManifestOf(context.authority.version);manifest.resources=[...manifest.resources.filter(r=>!nativeGeographicResource(r.key)),...authority.resources.filter(r=>nativeGeographicResource(r.key))];manifest.dependencies=[...manifest.dependencies.filter(d=>nativeTargetKey(d.target)!==key),{target:context.authority.scope.target,versionId:context.authority.version.id}];}
  }
    for (const update of updates) {
      const previous = manifest.resources.find(r => r.key === update.key);
      if (previous && previous.kind !== update.kind) throw new WorldError("A historical component cannot change its native family.", 400);
      const componentId = await storeNativeComponent(tx, context.worldId, context.userId, update.kind, update.payload);
      const resource = { key: update.key, kind: update.kind, componentId };
      if (previous) manifest.resources = manifest.resources.map(r => r.key === update.key ? resource : r);
      else manifest.resources.push(resource);
    }
    manifest=await bindNativeTownBackdrop(tx,context.worldId,context.userId,context.scope.timelineId,context.scope.year,manifest);
    nativeManifestSchema.parse(manifest);
    const version = await appendNativeVersion(tx, { worldId: context.worldId, anchorMapId: context.version.mapId, timelineId: context.scope.timelineId, authorId: context.userId,
      stateId: context.scope.stateId, source: context.version, details: context.selected, manifest, baselineRevision: context.version.baselineRevision });
    const revision = context.selected.revision + 1;
    await tx.update(heads).set({ versionId: version.id, revision, mode: context.selected.mode === "retained" ? "interpretation" : context.selected.mode })
      .where(and(eq(heads.timelineId, context.scope.timelineId), eq(heads.stateId, context.scope.stateId)));
  return { version, revision, manifest };
}

/** The only native historical content commit path. It appends existing map-state
 * authority and never calls a current-day map writer. Native validators run in
 * the callback before any returned component is committed. */
export async function withNativeHistoryWrite(userId: string, worldId: string, rawScope: NativeHistoryScope, request: {
  requestId: string; endpoint: string; command: unknown;
}, run: (tx: NativeHistoryTx, context: NativeContentContext) => Promise<NativeWriteResult>) {
  const scope = nativeHistoryScopeSchema.parse(rawScope);
  atlasId.parse(request.requestId);
  if (!scope.edit || scope.versionId) throw new WorldError("Choose Edit This Appearance before changing dated content. Retained revision references are read-only.", 403);
  // Year is navigation inside one inclusive appearance, not a different write
  // target. State + timeline + target bind retry identity across that period.
  const binding = { timelineId: scope.timelineId, stateId: scope.stateId, target: scope.target, ...scope.geographyStateId?{geographyStateId:scope.geographyStateId}:{} };
  const inputHash = nativeContentHash({ binding, endpoint: request.endpoint, command: request.command });
  return worldWriteTransaction(userId, worldId, async (tx, parent) => {
    const targetKey = nativeTargetKey(scope.target);
    const [retry] = await tx.select().from(requests).where(eq(requests.requestId, request.requestId));
    if (retry) {
      if (retry.worldId !== worldId || retry.timelineId !== scope.timelineId || retry.targetKey !== targetKey || retry.authorId !== userId || retry.inputHash !== inputHash) throw nativeHistoryConflict();
      return retry.result;
    }
    const context = await nativeContentContext(tx, userId, worldId, scope, { ownerId: parent.ownerId, archived: !!parent.archivedAt, review: false, ordinary: false });
    if (!context.canEdit) throw new WorldError("This historical appearance is read-only or archived. Your draft remains retained.", 403);
    const accepted = await run(tx, context);
    if (!accepted.updates.length&&!accepted.unchangedParent || new Set(accepted.updates.map(u => u.key)).size !== accepted.updates.length) throw new WorldError("Choose distinct historical content components to save.", 400);
    const manifest = nativeManifestOf(context.version);
    for(const dependency of accepted.dependencies??[])manifest.dependencies=[...manifest.dependencies.filter(value=>nativeTargetKey(value.target)!==nativeTargetKey(dependency.target)),dependency];
    let updates = accepted.updates, geographyVersionId: string | undefined;
    if (context.authority && updates.some(update => nativeGeographicResource(update.key))) {
      const authority = context.authority;
      if (!authority.canEdit) throw new WorldError("Explicitly retain and open the editable dated parent World before changing regional geography.", 409);
      const local = updates.filter(update => !nativeGeographicResource(update.key)), shared: NativeComponentUpdate[] = [];
      for (const update of updates.filter(update => nativeGeographicResource(update.key))) {
        const payload = structuredClone(update.payload); delete payload.regional;
        if (update.key.startsWith("refinement:") && payload.meta) payload.meta = { ...payload.meta as Record<string, unknown>, mapId: authority.scope.target.id };
        if (update.key === "refinements" && payload.index) {const index = payload.index as {refinements:Record<string,unknown>[]}; payload.index = {...index,refinements:index.refinements.map(meta=>({...meta,mapId:authority.scope.target.id}))};}
        if (update.key === "labels") {
          const previous = await nativeResource(tx, authority, "labels"), incoming = payload.layer as LabelsLayer, before = previous.payload.layer as LabelsLayer;
          const saved = context.manifest.resources.some(r=>r.key==="label-view") ? (await nativeResource(tx, context, "label-view")).payload : {revision:0,visible:before.visible,suggestions:before.suggestions,composition:before.composition};
          const expected = request.command as {regional?:{compositionRevision?:number}};
          assertNativeRevision(Number(saved.revision), expected.regional?.compositionRevision ?? 0);
          const presentation = {visible:incoming.visible,suggestions:incoming.suggestions,composition:incoming.composition};
          if (nativeContentHash(presentation)!==nativeContentHash({visible:saved.visible,suggestions:saved.suggestions,composition:saved.composition})) local.push({key:"label-view",kind:"labels",payload:{...presentation,revision:Number(saved.revision)+1}});
          payload.layer = {...incoming,visible:before.visible,suggestions:before.suggestions,composition:before.composition};
          if (nativeContentHash(payload.layer)===nativeContentHash(before)) {accepted.result.revision=previous.revision;continue;}
        }
        shared.push({...update,payload});
      }
      const geographic = shared.length ? await commitNativeUpdates(tx, authority, shared) : {version:authority.version,manifest:nativeManifestOf(authority.version)};
      geographyVersionId=geographic.version.id;
      manifest.resources=[...manifest.resources.filter(r=>!nativeGeographicResource(r.key)),...geographic.manifest.resources.filter(r=>nativeGeographicResource(r.key))];
      manifest.dependencies=[...manifest.dependencies.filter(d=>nativeTargetKey(d.target)!==nativeTargetKey(authority.scope.target)),{target:authority.scope.target,versionId:geographyVersionId}];
      updates=local;
    }
    // Creating a separately dated child identity can leave the parent design
    // byte-exact. The child and original request still commit atomically here.
    const {version,revision}=updates.length?await commitNativeUpdates(tx,context,updates,manifest):{version:context.version,revision:context.selected.revision};
    const result = { ...accepted.result, historical: { stateId: scope.stateId, versionId: version.id, revision, timelineId: scope.timelineId, ...geographyVersionId?{geographyVersionId}:{} } };
    await tx.insert(requests).values({ requestId: request.requestId, worldId, timelineId: scope.timelineId, targetKey, inputHash, authorId: userId, result,originalScope:scope });
    if(request.endpoint.startsWith("crafts")||scope.target.kind==="craft"||scope.target.kind==="deck")await assertCraftBudget(tx,worldId);
    return result;
  },["history","appearances",nativeWorldScope(scope.target.kind)]);
}
