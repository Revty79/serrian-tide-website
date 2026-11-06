import { z } from "zod";
import { atlasId } from "./atlas";
import { historicalConditions } from "./historical-places";
import { mapStateDetailsSchema, resolveMapState, type MapStateChoice } from "./map-states";
import { yearSchema } from "./world-year";

export const NATIVE_HISTORY_LIMITS = Object.freeze({
  appearances: 128, revisions: 100, sourceNodes: 4096, components: 512, dependencies: 128,
  componentBytes: 12 * 1024 * 1024, captureBytes: 64 * 1024 * 1024, manifestBytes: 96 * 1024,
  comparisonChanges: 256, recoveryCharacters: 250_000,
});
export const nativeMapKinds = ["terrain", "town", "floor", "underground", "craft", "deck"] as const;
export const nativeMapTargetSchema = z.object({ kind: z.enum(nativeMapKinds), id: atlasId }).strict();
export type NativeMapTarget = z.infer<typeof nativeMapTargetSchema>;
export const nativeTargetKey = (target: NativeMapTarget) => `${target.kind}:${target.id}`;

export const nativeResourceKinds = [
  "terrain", "refinement", "materials", "hydrology", "environment", "appearance", "artwork", "labels",
  "town", "floor", "underground", "craft", "deck", "placement", "composition", "connections", "conditions", "places",
] as const;
export const nativeResourceSchema = z.object({
  key: z.string().min(1).max(160).regex(/^[a-z0-9:-]+$/),
  kind: z.enum(nativeResourceKinds), componentId: atlasId,
}).strict();
export type NativeResource = z.infer<typeof nativeResourceSchema>;
export const nativeManifestSchema = z.object({
  version: z.literal(1), target: nativeMapTargetSchema,
  resources: z.array(nativeResourceSchema).min(1).max(NATIVE_HISTORY_LIMITS.components),
  dependencies: z.array(z.object({ target: nativeMapTargetSchema, versionId: atlasId }).strict()).max(NATIVE_HISTORY_LIMITS.dependencies),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.resources.map(r => r.key)).size !== value.resources.length)
    ctx.addIssue({ code: "custom", message: "Historical content keys must be distinct." });
  if (new Set(value.dependencies.map(d => nativeTargetKey(d.target))).size !== value.dependencies.length)
    ctx.addIssue({ code: "custom", message: "Retain one exact source for each historical destination." });
  if (JSON.stringify(value).length > NATIVE_HISTORY_LIMITS.manifestBytes)
    ctx.addIssue({ code: "custom", message: "This historical source exceeds the bounded manifest size." });
});
export type NativeManifest = z.infer<typeof nativeManifestSchema>;
export const nativeConditionsSchema = z.array(z.object({
  id: atlasId, condition: z.enum(historicalConditions), account: z.string().max(12_000),
}).strict()).max(4_096).refine(values => new Set(values.map(v => v.id)).size === values.length, "Each object has one historical condition.");
export type NativeCondition = z.infer<typeof nativeConditionsSchema>[number];
export const nativeConditionCommandSchema=z.object({action:z.literal("conditions"),requestId:atlasId,revision:z.number().int().nonnegative(),value:nativeConditionsSchema.element}).strict();
export type NativeConditionsPacket={revision:number;values:NativeCondition[];choices:{id:string;name:string;kind:string}[];canEdit:boolean};
/** Only the rendered copy is filtered; saved geometry and undo remain intact. */
export function nativeVisibleDesign<T extends {features:{id:string;archived:boolean;roomId?:string|null;wallId?:string}[]}>(design:T,conditions:NativeCondition[]):T{
  if(!conditions.length)return design;
  const absent=nativeAbsentObjects(conditions),hidden=new Set(design.features.filter(f=>absent.has(f.id)).map(f=>f.id));
  return {...design,features:design.features.map(f=>hidden.has(f.id)||f.roomId&&hidden.has(f.roomId)||f.wallId&&hidden.has(f.wallId)?{...f,archived:true}:f)};
}

// The transport binding is captured by the mounted editor, never inferred from
// a mutable request Origin, a later URL, or a current-day map with the same ID.
export const nativeHistoryScopeSchema = z.object({
  timelineId: atlasId, year: yearSchema, target: nativeMapTargetSchema,
  stateId: atlasId, versionId: atlasId.optional(), edit: z.boolean(),
  geographyStateId: atlasId.optional(), geographyVersionId: atlasId.optional(),connectionSourceVersionId:atlasId.optional(),connectionSourceId:atlasId.optional(),
}).strict().refine(v=>v.target.kind==="terrain"||!v.geographyStateId&&!v.geographyVersionId,"Only a Region chooses a separate dated World source.").refine(v=>!!v.connectionSourceId===!!v.connectionSourceVersionId,"Choose one exact connection account and source together.").refine(v => !v.edit || !v.versionId && !v.geographyVersionId && !v.connectionSourceVersionId, "An immutable revision is a read-only source.");
export type NativeHistoryScope = z.infer<typeof nativeHistoryScopeSchema>;
export function nativeGeographyContext(scope:NativeHistoryScope){const version=scope.geographyVersionId??scope.versionId;return `${scope.timelineId}:${scope.geographyStateId??scope.stateId}${version?":version:"+version:""}`;}
export function nativeRequestGeographyContext(url: string) {
  const raw = new URL(url, "https://atlas.invalid").searchParams.get("historicalAtlas");
  return raw ? nativeGeographyContext(nativeHistoryScopeSchema.parse(JSON.parse(raw))) : undefined;
}
export function nativeHistoryAppearanceBinding(scope?: NativeHistoryScope) {
  return scope ? `:historical:${scope.timelineId}:${scope.stateId}:${nativeTargetKey(scope.target)}${scope.geographyStateId ? ":geography:" + scope.geographyStateId : ""}` : "";
}
/** Unsubmitted work belongs to its original viewing year. Even two years in
 * one period can later resolve to different states after an explicit split. */
export function nativeHistoryRecoveryScope(scope?: NativeHistoryScope) {
  return scope ? nativeHistoryAppearanceBinding(scope) + `:year:${scope.year}` : "";
}
export function nativeHistoryUrl(input: string, scope: NativeHistoryScope) {
  nativeHistoryScopeSchema.parse(scope);
  const url = new URL(input, "https://atlas.invalid");
  if (url.origin !== "https://atlas.invalid" || !/^\/api\/worlds\/[^/]+\//.test(url.pathname))
    throw Error("Historical content requests must remain within the selected World's private API.");
  url.searchParams.set("historicalAtlas", JSON.stringify(scope));
  return url.pathname + url.search;
}

const revision = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const common = { requestId: atlasId, timelineId: atlasId, target: nativeMapTargetSchema };
export const nativeHistoryCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("create"), sourceVersionId: atlasId.nullable(), baselinePin: hash.nullable(), geographyVersionId: atlasId.nullable().optional(), details: mapStateDetailsSchema }).strict()
    .refine(v => Boolean(v.sourceVersionId) !== Boolean(v.baselinePin), "Choose one exact baseline or retained appearance source."),
  z.object({...common,action:z.literal("split"),stateId:atlasId,revision,year:yearSchema,name:z.string().trim().min(1).max(160),geographyVersionId:atlasId.nullable().optional()}).strict(),
  z.object({ ...common, action: z.literal("details"), stateId: atlasId, revision, geographyVersionId: atlasId.nullable().optional(), details: mapStateDetailsSchema }).strict(),
  z.object({ ...common, action: z.enum(["archive", "restore"]), stateId: atlasId, revision }).strict(),
  z.object({ ...common, action: z.literal("retain"), stateId: atlasId, sourceVersionId: atlasId, sourceRevision: revision }).strict(),
]);
export type NativeHistoryCommand = z.infer<typeof nativeHistoryCommandSchema>;
export type NativeStateChoice = MapStateChoice & { target: NativeMapTarget };
export type NativeHistoryBundle = {
  available: boolean; target: NativeMapTarget; anchorMapId: string; targetName: string;
  timelineId: string; timelineName: string; parentTimelineName: string | null;
  year: number | null; states: NativeStateChoice[]; parentStates: NativeStateChoice[];
  revisions: NativeStateChoice[]; selected: NativeStateChoice | null;
  coverage: "baseline" | "established" | "unknown"; canEdit: boolean;
  conditions?:NativeCondition[];
  baselineAvailable?:boolean;baselinePin?: string; sourceSummary?: { label: string; revision: number; resources: number; terrainSamples: number };
  geographySource?: { stateId: string; versionId: string; name: string } | null;
};
export function resolveNativeHistory(states: NativeStateChoice[], target: NativeMapTarget, year: number) {
  return resolveMapState(states.filter(s => nativeTargetKey(s.target) === nativeTargetKey(target)), year);
}
export function nativeAbsentObjects(conditions:NativeCondition[]){return new Set(conditions.filter(v=>!["present","abandoned","ruined","rebuilt"].includes(v.condition)).map(v=>v.id));}
export function nativeObjectPresent(conditions: NativeCondition[], id: string) {
  const value = conditions.find(c => c.id === id)?.condition ?? "present";
  return ["present", "abandoned", "ruined", "rebuilt"].includes(value);
}
