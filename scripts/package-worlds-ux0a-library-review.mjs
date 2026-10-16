/** Deterministic review derivatives from actual website PNG downloads; never substitute a study image. */
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
const root="docs/screenshots/worlds-geo-ux0a/full-library",directory=`${root}/corrections`;
await mkdir(`${directory}/details`,{recursive:true});const images=[];
for(const branch of ["manual","generated"]){
 const file=`${directory}/${branch}-visible.png`,bytes=await readFile(file),metadata=await sharp(bytes).metadata();
 await sharp(bytes).resize({width:600}).png().toFile(`${directory}/${branch}-600.png`);
 await sharp(bytes).grayscale().png().toFile(`${directory}/${branch}-grayscale.png`);
 images.push({branch,width:metadata.width,height:metadata.height,sha256:createHash("sha256").update(bytes).digest("hex"),source:"Actual Atlas website visible PNG download"});
}
for(const branch of ["manual","generated"]){
 const file=`${directory}/${branch}-visible.png`,{width,height}=await sharp(file).metadata();
 // Native crops are deliberately broad enough to retain the coastline/label context.
 for(const [name,x,y,w,h] of [["settlements-and-labels",.2,.50,.65,.32],["river-mouth",.47,.62,.22,.20],["harbor",.60,.48,.25,.30]]){
  await sharp(file).extract({left:Math.floor(width*x),top:Math.floor(height*y),width:Math.floor(width*w),height:Math.floor(height*h)}).png().toFile(`${directory}/details/${branch}-${name}.png`);
 }
}
await writeFile(`${directory}/visual-review-index.json`,JSON.stringify({images,derivatives:"Only size/grayscale and native-pixel crops of the website downloads. Source originals remain unchanged; no drawn replacement composition.",decision:"Pending independent final artwork review"},null,2));
console.log("PASS actual-download review derivatives and source hashes");
