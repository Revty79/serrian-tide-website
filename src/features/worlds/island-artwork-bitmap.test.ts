import assert from "node:assert/strict";
import test from "node:test";
import {adequateIslandBitmap} from "./island-artwork-bitmap";

test("display caches require oversampled physical pixels and fall back to originals at deep zoom",()=>{
 assert.equal(adequateIslandBitmap({scale:2},2,.7,1),true);
 assert.equal(adequateIslandBitmap({scale:2},2,.7,2),true);
 assert.equal(adequateIslandBitmap({scale:2},2,4,1),false);
 assert.equal(adequateIslandBitmap({scale:2},2,2,2),false);
});
