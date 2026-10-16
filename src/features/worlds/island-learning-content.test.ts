import assert from "node:assert/strict";
import test from "node:test";
import {islandLessonChecks,type IslandLessonFacts} from "./island-learning-content";
const facts=():IslandLessonFacts=>({surface:true,land:[{id:"island",revision:1}],terrain:true,river:true,city:true,dirty:false,mapRevision:2,savedDrawingIds:["city","label","river"],exported:false});
test("lesson coastline step needs a genuinely newer saved source",()=>{const f=facts();assert.equal(islandLessonChecks(f,{island:1},false)[2],false);f.land[0].revision=2;assert.equal(islandLessonChecks(f,{island:1},false)[2],true);assert.equal(islandLessonChecks({...f,land:[]},{island:1},false)[1],false);});
test("lesson save and export cannot be verified while an independent domain is dirty",()=>{const f={...facts(),exported:true,dirty:true},checks=islandLessonChecks(f,{island:1},true);assert.equal(checks[6],false);assert.equal(checks[8],false);});
test("lesson completion needs a real reopen plus successful export and actual island content",()=>{const f=facts();f.land[0].revision=2;assert.equal(islandLessonChecks({...f,exported:true},{island:1},false)[8],false);assert.equal(islandLessonChecks(f,{island:1},true)[8],false);assert.equal(islandLessonChecks({...f,exported:true},{island:1},true)[8],true);assert.equal(islandLessonChecks({...f,city:false},{island:1},true)[6],false);});
