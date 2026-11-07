import assert from "node:assert/strict";
import test from "node:test";
import { personalCanonWorldSchema, worldCanonCommandSchema } from "./world-canon";
const requestId="f5d398c0-3366-46bd-862f-990c1eea3b26";
test("canon publication requires an explicit decision, current revision and bounded rationale",()=>{
  const command={requestId,revision:0,isCanon:true,confirm:true,note:"Reviewed ordinary publication"};
  assert.equal(worldCanonCommandSchema.parse(command).isCanon,true);
  for(const update of [{confirm:false},{note:" "},{revision:-1},{ownerId:"another"},{note:"a".repeat(2001)}])assert.equal(worldCanonCommandSchema.safeParse({...command,...update}).success,false);
});
test("personal canon variations cannot supply source content, ownership or canon overrides",()=>{
  const command={requestId,revision:1,name:"My alternate history"};
  assert.equal(personalCanonWorldSchema.parse(command).name,command.name);
  for(const update of [{revision:0},{ownerId:"another"},{isCanon:true},{maps:[]},{name:" "}])assert.equal(personalCanonWorldSchema.safeParse({...command,...update}).success,false);
});
