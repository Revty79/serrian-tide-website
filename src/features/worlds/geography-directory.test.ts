import {test} from "node:test";
import assert from "node:assert/strict";
import {geographyDirectoryQuery,geographySearchPattern} from "./geography-directory";

test("geography search treats wildcard and escape characters as literal names",()=>{
 assert.equal(geographySearchPattern("100%_place\\name"),"%100\\%\\_place\\\\name%");
 assert.equal(geographySearchPattern("Côte d’Ivoire"),"%Côte d’Ivoire%");
});
test("directory rejects foreign query controls and malformed parent or cursor identities",()=>{
 for(const q of [{parentId:"all"},{after:"../../other"},{search:"x".repeat(161)},{worldId:"another-world"},{limit:1000000}])assert.equal(geographyDirectoryQuery.safeParse(q).success,false);
 assert.deepEqual(geographyDirectoryQuery.parse({}),{parentId:null,search:"",headersOnly:false});
});
