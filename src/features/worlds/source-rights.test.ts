import test from "node:test";
import assert from "node:assert/strict";
import {assetOriginSchema,sourceReviewSchema,sourceUseProblem,type RightsSource,type SourceReview} from "./source-rights";

const reviewed=(patch:Partial<SourceReview>={}):RightsSource["reviews"][number]=>({decision:"approved",classification:"public-domain",reason:"Independent synthetic test review",evidence:"Synthetic evidence, not an external rights grant",uses:["display","modify","customer-access","digital-images","print","editable-data"],credits:"Synthetic source credit",serviceVerified:true,upstreamVerified:true,noCostVerified:true,outputVerified:true,recipientRightsVerified:true,revision:1,reviewerId:"reviewer",createdAt:"2026-11-12T00:00:00Z",...patch});
test("an uploader's free/PD claim never substitutes for a recorded review",()=>{
 assert.match(sourceUseProblem({original:false,parentIds:[],reviews:[]},"display")!,/review/);
 assert.equal(sourceUseProblem({original:true,parentIds:[],reviews:[]},"modify"),null);
 assert.equal(assetOriginSchema.safeParse({kind:"original",attestation:false}).success,false);
 assert.equal(assetOriginSchema.safeParse({kind:"public-domain",attestation:true}).success,false);
});
test("a later hold overrides prior approval and original declarations",()=>{
 const hold=reviewed({decision:"hold",reason:"New evidence requires review"});
 for(const original of [true,false])assert.equal(sourceUseProblem({original,parentIds:[],reviews:[hold,reviewed()]},"display"),hold.reason);
});
test("source clearance does not imply product/output compliance or unreviewed uses",()=>{
 const s={original:false,parentIds:[],reviews:[reviewed({outputVerified:false})]};
 assert.equal(sourceUseProblem(s,"modify"),null);
 assert.match(sourceUseProblem(s,"digital-images",true)!,/product attribution/);
 assert.match(sourceUseProblem({...s,reviews:[reviewed({recipientRightsVerified:false})]},"customer-access")!,/recipient/);
 assert.match(sourceUseProblem({...s,reviews:[reviewed({uses:["display"]})]},"print",true)!,/not approved/);
});
test("incompatible and special-review decisions cannot become approvals",()=>{
 for(const classification of ["unverified","incompatible","special-review"] as const){
  const {revision:_,reviewerId:__,createdAt:___,...r}=reviewed({classification});void _;void __;void ___;
  assert.equal(sourceReviewSchema.safeParse(r).success,false);
  assert.match(sourceUseProblem({original:false,parentIds:[],reviews:[reviewed({classification})]},"display")!,/incomplete/);
 }
});
test("missing service, ownership, no-cost or mandatory-credit verification fails closed",()=>{
 for(const patch of [{serviceVerified:false},{upstreamVerified:false},{noCostVerified:false},{classification:"attribution" as const,credits:""}]){
  assert.ok(sourceUseProblem({original:false,parentIds:[],reviews:[reviewed(patch)]},"display"));
 }
});
