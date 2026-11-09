import test from "node:test";
import assert from "node:assert/strict";
import {parseTerrainCoordinates} from "./terrain-coordinate-list";
test("coordinate lists preserve decimals, downstream order and explicit boundary policy",()=>{
 assert.deepEqual(parseTerrainCoordinates("1.25, 3\r\n4 5\n",10,8),[{x:1.25,y:3},{x:4,y:5}]);
 assert.deepEqual(parseTerrainCoordinates("10,8",10,8,256,true),[{x:10,y:8}]);
 for(const text of ["","1,2,3","1,","NaN,2","Infinity,2","-1,2","10,3","1,8"])assert.throws(()=>parseTerrainCoordinates(text,10,8));
 assert.throws(()=>parseTerrainCoordinates("1,2\n3,4",10,8,1));
});
