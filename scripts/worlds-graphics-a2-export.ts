import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {Page} from "playwright-core";
import type {GraphicsFixture} from "./worlds-graphics-a2-browser";
/** Real normal export controls. No saved geography or appearance is changed. */
export async function graphicsA2Exports(p:Page,base:string,f:GraphicsFixture,out:string){
 const records=[];for(const [family,map]of [["world",f.map],["regional",f.region]]){
  await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${map}`);await p.getByRole("button",{name:"Export / Print",exact:true}).filter({visible:true}).last().click();const d=p.getByRole("dialog",{name:"Atlas export and print",exact:true});await d.getByRole("status").filter({hasText:"Accepted saved source ready"}).waitFor();const show=d.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();
  await d.getByLabel("Image size",{exact:true}).selectOption("1200");
  for(const format of ["png","pdf"]){
   await d.getByLabel("Format",{exact:true}).selectOption(format);if(format==="pdf"){await d.getByLabel("Resolution / DPI",{exact:true}).selectOption("96");await d.getByRole("button",{name:"Preview output",exact:true}).click();await d.getByAltText("Prepared pdf output, page 1").waitFor();await p.screenshot({path:path.join(out,`${family}-pdf-preview.png`)});}
   const pending=Promise.race([p.waitForEvent("download"),d.getByRole("alert").waitFor({state:"visible"}).then(async()=>{throw Error(await d.getByRole("alert").innerText());})]);await d.getByRole("button",{name:/^(Generate & download|Download print PDF)$/}).click();const file=path.join(out,`${family}-saved.${format}`);await(await pending).saveAs(file);const bytes=await readFile(file);assert(bytes.length>1000);let metadata:unknown;
   if(format==="png"){metadata=await sharp(file).metadata();assert(new Set(await sharp(file).resize(100,100).removeAlpha().raw().toBuffer()).size>25);}else assert(bytes.subarray(0,5).equals(Buffer.from("%PDF-")));
   records.push({family,map,format,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),metadata,file:path.basename(file)});
  }await d.getByRole("button",{name:"Close export",exact:true}).click();
 }
 await writeFile(path.join(out,"export-results.json"),JSON.stringify({passed:true,records,nativeSavedSource:true,ownerPrintAcceptance:false},null,2));
}
