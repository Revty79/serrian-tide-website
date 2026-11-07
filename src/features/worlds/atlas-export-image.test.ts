import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {exportCrc32,pngExportMetadata,jpegExportDensity,exportXml} from "./atlas-export-image";

test("PNG DPI and Unicode source metadata preserve the actual encoded map pixels",async()=>{
 assert.equal(exportCrc32(new TextEncoder().encode("123456789")),0xcbf43926);
 const source=await sharp({create:{width:7,height:5,channels:4,background:{r:72,g:120,b:156,alpha:.4}}}).png().toBuffer(),output=Buffer.from(pngExportMetadata(source,300,{title:"A map <&> Ω",worldId:"fixture-only"})),metadata=await sharp(output).metadata();
 assert.equal(metadata.width,7);assert.equal(metadata.height,5);assert.equal(metadata.density,300);assert.deepEqual(await sharp(output).raw().toBuffer(),await sharp(source).raw().toBuffer());
 let phys=0,sourceText=0;for(let i=8;i<output.length;){const length=output.readUInt32BE(i),type=output.toString("ascii",i+4,i+8);if(type==="pHYs"){phys++;assert.equal(output.readUInt32BE(i+8),11811);assert.equal(output.readUInt32BE(i+12),11811);assert.equal(output[i+16],1);}if(type==="iTXt"&&output.toString("utf8",i+8,i+length+8).includes("fixture-only"))sourceText++;i+=length+12;}assert.equal(phys,1);assert.equal(sourceText,1);
 assert.throws(()=>pngExportMetadata(source.subarray(0,26),300,{}),/incomplete|image data/);
});
test("JPEG print density is real metadata while SVG text cannot inject markup or external sources",async()=>{
 const source=await sharp({create:{width:11,height:7,channels:3,background:"#48789c"}}).jpeg({quality:95}).toBuffer(),output=Buffer.from(jpegExportDensity(source,150)),metadata=await sharp(output).metadata();assert.equal(metadata.format,"jpeg");assert.equal(metadata.width,11);assert.equal(metadata.height,7);assert.equal(metadata.density,150);assert.deepEqual(await sharp(output).raw().toBuffer(),await sharp(source).raw().toBuffer());
 assert.equal(exportXml('<script onload="bad">&\'</script>'),"&lt;script onload=&quot;bad&quot;&gt;&amp;&apos;&lt;/script&gt;");assert.throws(()=>jpegExportDensity(source.subarray(0,20),300),/signature/);
});
