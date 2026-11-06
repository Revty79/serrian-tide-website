import assert from "node:assert/strict";
import test from "node:test";
import { nativeHistoryCommandSchema, nativeHistoryRecoveryScope, nativeHistoryScopeSchema, nativeHistoryUrl, nativeManifestSchema, nativeObjectPresent, resolveNativeHistory, type NativeStateChoice } from "./native-map-history";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const target = { kind: "town" as const, id: id(1) };
const scope = { timelineId: id(2), year: 0, target, stateId: id(3), edit: true };
test("native historical transport and recovery bind the exact appearance, timeline and map", () => {
  const url = new URL(nativeHistoryUrl(`/api/worlds/${id(4)}/town-maps?map=${id(1)}`, scope), "https://atlas.invalid");
  assert.deepEqual(JSON.parse(url.searchParams.get("historicalAtlas")!), scope);
  assert.equal(url.searchParams.get("map"), id(1));
  assert.notEqual(nativeHistoryRecoveryScope(scope), "");
  assert.notEqual(nativeHistoryRecoveryScope(scope), nativeHistoryRecoveryScope({ ...scope, year: scope.year + 1 }));
  assert.notEqual(nativeHistoryRecoveryScope(scope), nativeHistoryRecoveryScope({ ...scope, stateId: id(5) }));
  assert.throws(() => nativeHistoryUrl("https://external.invalid/api/worlds/other/town-maps", scope));
  assert.equal(nativeHistoryScopeSchema.safeParse({ ...scope, versionId: id(6) }).success, false);
});
test("native history reuses inclusive canonical years, including zero and negative years, without filling gaps", () => {
  const state = (startYear: number, endYear: number) => ({ target, startYear, endYear, archived: false }) as NativeStateChoice;
  const values = [state(-100, 0), state(100, 500)];
  assert.equal(resolveNativeHistory(values, target, 0), values[0]);
  assert.equal(resolveNativeHistory(values, target, 100), values[1]);
  assert.equal(resolveNativeHistory(values, target, 50), null);
  assert.equal(resolveNativeHistory(values, { ...target, id: id(8) }, 100), null);
  assert.throws(() => resolveNativeHistory([...values, state(0, 2)], target, 0));
});
test("native manifests pin unchanged resources and reject ambiguous or oversized reference sets", () => {
  const manifest = { version: 1, target, resources: [{ key: "town", kind: "town", componentId: id(9) }], dependencies: [] };
  assert.equal(nativeManifestSchema.parse(manifest).resources[0].componentId, id(9));
  assert.equal(nativeManifestSchema.safeParse({ ...manifest, resources: [...manifest.resources, ...manifest.resources] }).success, false);
  const resources = Array.from({ length: 513 }, (_, n) => ({ ...manifest.resources[0], key: "layer:" + n }));
  assert.equal(nativeManifestSchema.safeParse({ ...manifest, resources: resources.slice(0, 512) }).success, true);
  assert.equal(nativeManifestSchema.safeParse({ ...manifest, resources }).success, false);
});
test("creation requires one explicit accepted source and reuses the existing period validation", () => {
  const value = { action: "create", requestId: id(10), timelineId: id(2), target, sourceVersionId: id(11), baselinePin: null, details: { name: "Year zero", startYear: 0, endYear: 0, account: "A deliberate source account", protected: false } };
  assert.equal(nativeHistoryCommandSchema.safeParse(value).success, true);
  assert.equal(nativeHistoryCommandSchema.safeParse({ ...value, baselinePin: "a".repeat(64) }).success, false);
  assert.equal(nativeHistoryCommandSchema.safeParse({ ...value, sourceVersionId: null }).success, false);
  assert.equal(nativeHistoryCommandSchema.safeParse({ ...value, details: { ...value.details, startYear: 1 } }).success, false);
});
test("native object availability retains the accepted historical condition vocabulary", () => {
  assert.equal(nativeObjectPresent([{ id: id(1), condition: "ruined", account: "" }], id(1)), true);
  assert.equal(nativeObjectPresent([{ id: id(1), condition: "not established", account: "" }], id(1)), false);
  assert.equal(nativeObjectPresent([{ id: id(1), condition: "unknown", account: "" }], id(1)), false);
});

// Rendering a dated absence must never rewrite its stored geometry.
test("historical conditions hide retained geometry without destructive archival",async()=>{
 const {nativeVisibleDesign,nativeObjectPresent}=await import("./native-map-history");
 const id="00000000-0000-4000-8000-000000000001",wall="00000000-0000-4000-8000-000000000002";
 const original={features:[{id,archived:false},{id:wall,roomId:id,archived:false}]};
 const rendered=nativeVisibleDesign(original,[{id,condition:"destroyed",account:"Recorded ruin"}]);
 assert.ok(rendered.features.every(f=>f.archived));assert.ok(original.features.every(f=>!f.archived));
 assert.equal(nativeObjectPresent([{id,condition:"unknown",account:""}],id),false);
 assert.equal(nativeObjectPresent([{id,condition:"rebuilt",account:""}],id),true);
 assert.equal(nativeVisibleDesign(original,[]),original);
});

test("immutable geography sources do not receive mutable-head or other-version refresh packets",async()=>{
 const {nativeGeographyContext}=await import("./native-map-history");
 const state={...scope,target:{kind:"terrain" as const,id:id(11)}};
 const current=nativeGeographyContext(state),earlier=nativeGeographyContext({...state,edit:false,versionId:id(12)}),later=nativeGeographyContext({...state,edit:false,versionId:id(13)});
 assert.notEqual(current,earlier);assert.notEqual(earlier,later);
 assert.equal(nativeGeographyContext({...state,geographyStateId:id(14),geographyVersionId:id(15),edit:false}),nativeGeographyContext({...state,stateId:id(14),versionId:id(15),edit:false}));
});
