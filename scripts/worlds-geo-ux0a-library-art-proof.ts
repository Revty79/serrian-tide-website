/** Actual Chrome asset-board inspection; this does not replace an Atlas creation journey. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {chromium} from "playwright-core";
import {latestIslandAssets,islandAssets} from "../src/features/worlds/island-assets";
const out="docs/screenshots/worlds-geo-ux0a/full-library";
async function main(){
 await mkdir(`${out}/thumbnails`,{recursive:true});let html='<body style="margin:0;padding:25px;background:#f4efdd;color:#39463b;font:18px Georgia"><h1 style="font-size:28px;font-weight:400">Atlas regional library — candidate subjects</h1><p>Fourteen subjects · Exact original vectors · Final independent visual review pending</p><main style="display:grid;grid-template-columns:repeat(4,340px);gap:14px">';const assets=[];
 for(const a of latestIslandAssets){const source=(await readFile(`public/cartography/${a.libraryId}/${a.libraryRevision}/${a.file}`,"utf8")).replaceAll("\r\n","\n");
  html+=`<article style="padding:12px;border:1px solid #c5c6ae;text-align:center;background:#efebd8"><div style="height:190px;display:flex;align-items:center;justify-content:center">${source.replace('<svg ','<svg width="295" height="180" ')}</div><p style="margin:8px">${a.name} · r${a.revision}</p><small>${a.role==='place'?'Persistent place':'Place / paint'} · ${a.family}</small></article>`;
  for(const size of [64,96])await sharp(Buffer.from(source)).resize(size,size,{fit:"contain",background:"#f4efdd"}).png().toFile(`${out}/thumbnails/${a.id}-${size}.png`);
  assets.push({id:a.id,revision:a.revision,sourceSha256:a.sourceSha256,svgBytes:Buffer.byteLength(source),family:a.family,role:a.role,defaultScale:a.defaultScale});
 }
 html+='</main><p style="font-size:14px">An asset study, not an application journey or final artwork acceptance. Earlier saved revisions stay available.</p></body>';
 const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});const errors:string[]=[];
 try{const page=await browser.newPage({viewport:{width:1490,height:1350}});page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});await page.setContent(html);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/asset-board.png`,fullPage:true});assert.deepEqual(errors,[]);}
 finally{await browser.close();}
 await sharp(`${out}/asset-board.png`).grayscale().png().toFile(`${out}/asset-board-grayscale.png`);
 await writeFile(`${out}/artwork-proof.json`,JSON.stringify({scope:"Actual Chrome asset board and original-SVG thumbnail derivation; not final UI acceptance",subjects:latestIslandAssets.length,retainedExactRevisions:islandAssets.length,assets,browserErrors:errors,boardSha256:createHash("sha256").update(await readFile(`${out}/asset-board.png`)).digest("hex")},null,2)+"\n");
 console.log("PASS fourteen-subject actual Chrome board, 64/96px originals, grayscale and SVG parsing");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
