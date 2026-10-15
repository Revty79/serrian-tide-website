import assert from "node:assert/strict";
import {test} from "node:test";
import {mapExportLayout} from "./map-export-layout";
test("export credits retain Unicode attribution and full provider links without silent truncation",()=>{
 const credit="© ESA WorldCover project 2021 · CC BY 4.0 · https://creativecommons.org/licenses/by/4.0/",result=mapExportLayout([credit,credit,"Primary History · Year 1900 · unknown dated coverage"]);
 assert.ok(result.lines.join(" ").includes("© ESA WorldCover project 2021"));assert.ok(result.lines.join(" ").includes("https://creativecommons.org/licenses/by/4.0/"));assert.equal(result.lines.join(" ").split("ESA").length,2);assert.ok(result.height>1200);assert.equal(result.pixelBytes,result.width*result.height*4);assert.equal(result.svgRasterBytes,9_600_000);
});
test("export dimensions and required credit lists remain bounded",()=>{
 const plain=mapExportLayout([]);assert.equal(plain.width,2000);assert.equal(plain.height,1200);
 assert.throws(()=>mapExportLayout(Array.from({length:30},(_,i)=>`${i} ${"required-credit ".repeat(10)}`)),/source credit/);
 const full=mapExportLayout(["地".repeat(180)]);assert.ok(full.lines.every(line=>line.length<=90));assert.equal(full.lines.join("").replaceAll(" ","").length,180);
});
