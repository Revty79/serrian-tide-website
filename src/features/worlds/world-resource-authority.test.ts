import assert from "node:assert/strict";
import test from "node:test";
import {refreshWorldResourceAuthority} from "./world-resource-authority";
test("reclaimed authority preserves the exact retained source and local drawing",()=>{
 const document={id:"floor",revision:4,design:{points:[1,2,3]}},retained={canEdit:false,reason:"Control held elsewhere",document},fresh={canEdit:true,document:{...document,revision:8}};
 const result=refreshWorldResourceAuthority(retained,fresh);assert.equal(result.canEdit,true);assert.equal(result.reason,undefined);assert.equal(result.document,document);assert.equal(result.document.revision,4);assert.equal(retained.canEdit,false);
});
test("a fresh denial disables a retained editor without replacing its source",()=>{
 const document={revision:9},retained={canEdit:true,document},result=refreshWorldResourceAuthority(retained,{canEdit:false,reason:"Source unavailable"});assert.equal(result.canEdit,false);assert.equal(result.document,document);assert.equal((result as typeof result&{reason:string}).reason,"Source unavailable");
});
test("unchanged authority keeps object identity and avoids periodic editor renders",()=>{
 const retained={canEdit:true,document:{revision:3}};assert.equal(refreshWorldResourceAuthority(retained,{canEdit:true}),retained);
});
