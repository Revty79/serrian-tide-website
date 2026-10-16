/** Compare old inline vector instances with shared verified-original SVG image instances. */
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {chromium} from "playwright-core";
import {latestIslandAssets,islandAssets} from "../src/features/worlds/island-assets";

async function main(){
 const root="docs/screenshots/worlds-geo-ux0a/full-library/rendering";await mkdir(root,{recursive:true});const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true}),results=[];
 try{const page=await browser.newPage({viewport:{width:620,height:330}});
  for(const asset of [...latestIslandAssets,...islandAssets.filter(a=>a.revision===1&&["mountain-rounded","woodland-broadleaf-grove","settlement-city"].includes(a.id))]){
   const svg=(await readFile(`public/cartography/${asset.libraryId}/${asset.libraryRevision}/${asset.file}`,"utf8")).replaceAll("\r\n","\n"),body=svg.replace(/^<svg[^>]+>/,"").replace(/<\/svg>\s*$/,""),[x,y,w,h]=asset.viewBox.split(" ").map(Number),box=`${x-20} ${y-20} ${w+40} ${h+40}`,url=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x-32} ${y-32} ${w+64} ${h+64}">${body}</svg>`)}`;
   await page.setContent(`<body style="margin:0;background:#f4efdd;display:flex;gap:20px"><svg id="inline" width="300" height="300" viewBox="${box}"><defs><g id="old">${body}</g></defs><use href="#old"/></svg><svg id="shared" width="300" height="300" viewBox="${box}"><defs><g id="new"><image href="${url}" x="${x-32}" y="${y-32}" width="${w+64}" height="${h+64}"/></g></defs><use href="#new"/></svg></body>`);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete));await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const before=await page.locator("#inline").screenshot(),after=await page.locator("#shared").screenshot(),a=await sharp(before).removeAlpha().raw().toBuffer(),b=await sharp(after).removeAlpha().raw().toBuffer();let squared=0,changed=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);squared+=delta*delta;if(delta>8)changed++;}const rmse=Math.sqrt(squared/a.length),fraction=changed/a.length;assert.ok(rmse<=2&&fraction<.005,`${asset.id}:${asset.revision} changed visibly: rmse ${rmse}, fraction ${fraction}`);
   if(asset.revision!==1||!latestIslandAssets.some(a=>a.id===asset.id&&a.revision!==1))await sharp(after).resize(96,96).png().toFile(`${root}/${asset.id}-shared-96.png`);
   await page.locator("#shared").evaluate(async(svg,{width,height})=>{const node=svg.querySelector("image")!,source=node.getAttribute("href")!,image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Original SVG decode failed"));image.src=source;});const scale=Math.min(2,1024/Math.max(width,height)),canvas=document.createElement("canvas");canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);canvas.getContext("2d")!.drawImage(image,0,0,canvas.width,canvas.height);node.setAttribute("href",canvas.toDataURL("image/png"));},{width:w+64,height:h+64});
   const bitmap=await page.locator("#shared").screenshot(),c=await sharp(bitmap).removeAlpha().raw().toBuffer();let displaySquared=0,displayChanged=0;for(let i=0;i<b.length;i++){const delta=Math.abs(b[i]-c[i]);displaySquared+=delta*delta;if(delta>8)displayChanged++;}const displayRmse=Math.sqrt(displaySquared/b.length),displayFraction=displayChanged/b.length;assert.ok(displayRmse<8&&displayFraction<.08,asset.id+" display cache visibly diverged");
   results.push({asset:asset.id,revision:asset.revision,rmse,channelsChangedOver8:fraction,displayCacheAt300px:{rmse:displayRmse,channelsChangedOver8:displayFraction},exportUsesOriginal:true});
  }
  await writeFile(`${root}/original-image-comparison.json`,JSON.stringify({passed:true,browser:browser.version(),scope:"All latest subjects and three retained v1 pins, including margin outside each declared viewbox; former inline SVG use versus shared original SVG image use. This is rendering equivalence, not artistic acceptance.",results},null,2));console.log("PASS original image equivalence for 14 latest subjects and 3 retained pins");
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
