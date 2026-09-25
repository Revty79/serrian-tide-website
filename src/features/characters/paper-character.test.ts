import assert from "node:assert/strict";
import test from "node:test";
import {arrangePaperSkillGroups} from "./paper-character";

const row=(id:number,parentId:number|null,name:string,depth:number,special=false)=>({id,parentId,name,depth,special,system:"Spellcraft"});
test("Paper skill columns keep later-purchased children under their actual parent",()=>{
  const groups=arrangePaperSkillGroups([row(1,null,"Spellcraft",0),row(2,1,"Spellcraft → Water",1),row(3,1,"Spellcraft → Fire",1),row(4,2,"Spellcraft → Water → Grasp",2),row(5,3,"Spellcraft → Fire → Grasp",2)]);
  assert.deepEqual(groups[0].rows.map(({id,displayName,displayDepth})=>[id,displayName,displayDepth]),[[1,"Spellcraft",0],[2,"Water",1],[4,"Grasp",2],[3,"Fire",1],[5,"Grasp",2]]);
});
test("A separately grouped ability retains its complete saved path",()=>{
  const groups=arrangePaperSkillGroups([row(1,null,"Spellcraft",0),row(2,1,"Spellcraft → Unusual gift",1,true)]);
  assert.equal(groups[1].rows[0].displayName,"Spellcraft → Unusual gift");
  assert.equal(groups[1].rows[0].displayDepth,0);
});
