import assert from "node:assert/strict";
import { test } from "node:test";
import { associationAtYear, associationPeriodAtYear } from "./world-atlas-discovery";
import { sameWorldReturn, worldAtlasYear, worldContextUrl } from "./world-atlas-context";
import {atlasRecordViewBinding,readAtlasRecordView} from "./atlas-record-view";
const worldId = "10101010-1010-4010-8010-101010101010", timelineId = "20202020-2020-4020-8020-202020202020";
const known = (year: number) => ({ version: 1 as const, scale: "world-year" as const, kind: "known" as const, year });
test("a World viewing year preserves zero and negative canonical years without guessing malformed or absent dates", () => {
  assert.equal(worldAtlasYear(new URLSearchParams("atlasYear=0")), 0);
  assert.equal(worldAtlasYear(new URLSearchParams("atlasYear=-500")), -500);
  for (const query of ["", "atlasYear=", "atlasYear=1.5", "atlasYear=1e2", "atlasYear=1000000000001"]) assert.equal(worldAtlasYear(new URLSearchParams(query)), undefined);
});
test("geographic relationship precision keeps uncertain and undated accounts unknown", () => {
  assert.equal(associationAtYear(known(0), 0), "established");
  assert.equal(associationAtYear(known(100), 500), "outside");
  assert.equal(associationAtYear({ version: 1, scale: "world-year", kind: "duration", startYear: -20, endYear: 0 }, 0), "established");
  for (const kind of ["approximate", "window", "undated"] as const) {
    const time = kind === "window" ? { version: 1 as const, scale: "world-year" as const, kind, startYear: 100, endYear: 500 } : kind === "approximate" ? { version: 1 as const, scale: "world-year" as const, kind, year: 100 } : { version: 1 as const, scale: "world-year" as const, kind };
    assert.equal(associationAtYear(time, 100), "unknown");
  }
  assert.equal(associationAtYear(known(100)), "current-reference");
});
test("Realm relationship endpoints are inclusive and unknown endpoints do not establish forever", () => {
  assert.equal(associationPeriodAtYear(known(100), known(500), 500), "established");
  assert.equal(associationPeriodAtYear(known(100), known(500), 501), "outside");
  assert.equal(associationPeriodAtYear(known(100), null, 500), "unknown");
  assert.equal(associationPeriodAtYear(null, known(500), 100), "unknown");
});
test("record and map links preserve selected context and only accept a return in the same World", () => {
  const context = { worldId, timelineId, year: 0, review: true, ordinary: true };
  const returnTo = `/worlds/${worldId}?tab=atlas&atlasYear=0&atlasView=%7B%7D`;
  const url = new URL(worldContextUrl(context, { tab: "peoples", entity: worldId }, returnTo), "https://world.invalid");
  for (const name of ["timeline", "atlasTimeline"]) assert.equal(url.searchParams.get(name), timelineId);
  assert.equal(url.searchParams.get("atlasYear"), "0"); assert.equal(url.searchParams.get("review"), "1"); assert.equal(url.searchParams.get("knowledge"), "ordinary");
  assert.equal(sameWorldReturn(worldId, url.searchParams.get("worldReturn")), returnTo);
  for (const invalid of ["https://evil.invalid/worlds/" + worldId, "//evil.invalid/worlds/" + worldId, "/worlds/" + timelineId, "/login", "javascript:alert(1)"]) assert.equal(sameWorldReturn(worldId, invalid), undefined);
});
test("a map return restores its camera only for the same map, year, timeline and exact source",()=>{
  const url=new URL(worldContextUrl({worldId,timelineId,year:100,review:false,ordinary:false},{tab:"atlas",townMap:worldId,atlasState:timelineId}),"https://world.invalid");
  url.searchParams.set("atlasView",JSON.stringify({binding:atlasRecordViewBinding(url),kind:"local",x:123,y:234,scale:3}));
  assert.equal(readAtlasRecordView(url,"local")?.x,123);
  assert.equal(readAtlasRecordView(url,"terrain"),undefined);
  for(const [key,value] of [["townMap",timelineId],["atlasYear","500"],["timeline",worldId],["atlasVersion",worldId]]){const other=new URL(url);other.searchParams.set(key,value);assert.equal(readAtlasRecordView(other,"local"),undefined);}
});
