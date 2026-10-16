/** Deterministic review derivatives from actual website PNG downloads; never substitute a study image. */
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
const root="docs/screenshots/worlds-geo-ux0a/full-library",directory=`${root}/journeys`;
await mkdir(`${directory}/details`,{recursive:true});const images=[];
for(const branch of ["manual","generated"]){
 const file=`${directory}/${branch}-visible.png`,bytes=await readFile(file),metadata=await sharp(bytes).metadata();
 await sharp(bytes).resize({width:600}).png().toFile(`${directory}/${branch}-600.png`);
 await sharp(bytes).grayscale().png().toFile(`${directory}/${branch}-grayscale.png`);
 images.push({branch,width:metadata.width,height:metadata.height,sha256:createHash("sha256").update(bytes).digest("hex"),source:"Actual Atlas website visible PNG download"});
}
for(const [name,left,top,width,height] of [["mountains",560,180,830,260],["hills-and-woodland",360,420,1140,300],["settlements-and-labels",370,700,1260,320],["castle-and-river",800,420,440,320],["coast",160,520,250,320]])await sharp(`${directory}/manual-visible.png`).extract({left,top,width,height}).png().toFile(`${directory}/details/${name}.png`);
await writeFile(`${directory}/visual-review-index.json`,JSON.stringify({images,derivatives:"Only size/grayscale and native-pixel crops of the website downloads. Source originals remain unchanged; no drawn replacement composition.",decision:"Pending independent final artwork review"},null,2));
console.log("PASS actual-download review derivatives and source hashes");
