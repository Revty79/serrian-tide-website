import assert from "node:assert/strict";
import {test} from "node:test";
import type {AtlasBundle,AtlasMap} from "./atlas";
import {isWorldOverviewMap,worldOverviewMapChoices} from "./world-overview-map";

test("World overview cannot substitute a continent, region, plan or unavailable map",()=>{
  const map:AtlasMap={id:"world",name:"The whole World",description:"Retained description",scope:"world",width:2000,height:1200,revision:1,archived:false,features:[]};
  const maps=[map,...(["continent","regional","local"] as const).map(scope=>({...map,id:scope,scope})),{...map,id:"archived",archived:true},{...map,id:"unavailable",unavailable:true},...(["settlement","interior","dungeon"] as const).map(mapKind=>({...map,id:mapKind,mapKind}))];
  const bundle:AtlasBundle={maps,canEdit:false,geographies:[]},original=structuredClone(bundle);
  const choices=worldOverviewMapChoices(bundle);
  assert.deepEqual(choices.map(map=>map.id),["world"]);
  assert.equal(choices[0].revision,map.revision);
  assert.ok(!("features" in choices[0])&&!("drawings" in choices[0]));
  assert.deepEqual(worldOverviewMapChoices({...bundle,maps:maps.slice(1)}),[]);
  assert.deepEqual(bundle,original);
  assert.equal(isWorldOverviewMap({...map,mapKind:"generic"}),true);
});
