import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Page} from "playwright-core";
import type {TerrainFrame} from "../src/features/worlds/terrain-refinement";
/** Saved-source output is requested exclusively through the normal Export UI. */
export async function resolutionBrowserExports(p:Page,out:string,frames:{name:string;frame?:TerrainFrame}[]){
 const folder=path.join(out,"exports");await mkdir(folder,{recursive:true});const receipts=[];
 for(const {name,frame}of frames){
  await p.getByRole("button",{name:"Export / Print",exact:true}).filter({visible:true}).last().click();const d=p.getByRole("dialog",{name:"Atlas export and print",exact:true});await d.getByRole("status").filter({hasText:"Accepted saved source ready"}).waitFor({timeout:180000});const show=d.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();
  if(frame){await d.getByLabel("Area",{exact:true}).selectOption("selected");for(const key of["width","height","x","y"] as const)await d.getByLabel("Area "+key,{exact:true}).fill(String(frame[key]));}
  await d.getByLabel("Resolution / DPI",{exact:true}).selectOption("96");
  for(const format of["png","pdf"]){await d.getByLabel("Format",{exact:true}).selectOption(format);if(format==="png")await d.getByLabel("Image size",{exact:true}).selectOption("1200");
   const pending=p.waitForEvent("download",{timeout:300000});await d.getByRole("button",{name:/^(Generate & download|Download print PDF)$/}).click();const file=path.join(folder,name+"."+format),download=await pending;assert.equal(await download.failure(),null);await download.saveAs(file);const bytes=await readFile(file);assert(bytes.length>1000);receipts.push({name,format,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
  }
  await p.screenshot({path:path.join(folder,name+"-print-controls.png"),fullPage:true});await d.getByRole("button",{name:"Close export",exact:true}).click();
 }
 await writeFile(path.join(folder,"receipts.json"),JSON.stringify({passed:true,receipts,normalVisibleExportControls:true},null,2));return receipts;
}
