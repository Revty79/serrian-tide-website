import assert from "node:assert/strict";
import test from "node:test";
import { isMapOnlyWorldsApi, normalizeWorldsQuery } from "./atlas-availability";

test("retained map endpoints are disabled, including encoded paths and every nested editor",()=>{
  for(const path of ["atlas","atlas/compare","atlas/connections","atlas/milestones","atlas/states","atlas/territories","geography","geography/authoring","geography/generation","elevation","land-cover","%61tlas"]){
    assert.equal(isMapOnlyWorldsApi(`/api/worlds/world-id/${path}`),true,path);
    assert.equal(isMapOnlyWorldsApi(`/api/worlds/world-id/${path}/`),true,path);
  }
});
test("shared information APIs stay available",()=>{
  for(const path of ["/api/worlds","/api/worlds/campaign-contexts",... ["","history","milestones","peoples","links","sky","calendars","calendars/history","chronology","timelines","campaigns"].map(p=>`/api/worlds/world-id/${p}`),"/api/campaigns/1"])
    assert.equal(isMapOnlyWorldsApi(path),false,path);
});
test("old bookmarks preserve timeline, review, ordinary knowledge and non-map selections",()=>{
  const params=new URLSearchParams("tab=atlas&atlas=map&place=place&editMap=map&geography=1&geographicMap=geo&mapYear=5&timeline=branch&review=1&knowledge=ordinary&ordinary=1");
  assert.equal(normalizeWorldsQuery(params).toString(),"tab=overview&timeline=branch&review=1&knowledge=ordinary&ordinary=1");
  assert.equal(params.get("atlas"),"map","normalization never mutates its input");
  const info=new URLSearchParams("tab=cosmology&entity=realm&atPlace=place&timeline=branch&source=retained-lore&calendarVersion=rules");
  assert.equal(normalizeWorldsQuery(info).toString(),info.toString());
});
