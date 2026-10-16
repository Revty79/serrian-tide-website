/** Focused third study. Keeps the exact revision-2 source coast; no runtime promotion or asset expansion. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { studyCity, studyMountain, studyWoodland } from "./worlds-ux0a-art-study-subjects";
import { validateAuthoringGeometry } from "../src/features/worlds/geographic-authoring-geometry";
import { pointInsideGeographicRing } from "../src/features/worlds/geographic-geometry";
import type { SourceGeometry } from "../src/features/worlds/geographic";

const before="docs/screenshots/worlds-geo-ux0a/art-direction/revision-2",out="docs/screenshots/worlds-geo-ux0a/art-direction/revision-3",assets="public/cartography/serrian-atlas-island/1";
const hash=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
async function main(){
  await mkdir(`${out}/details`,{recursive:true});await mkdir(`${out}/thumbnails`,{recursive:true});
  const provenance=JSON.parse(await readFile(`${before}/sample-provenance.json`,"utf8"));
  const source=JSON.parse(await readFile(`${before}/sample-geography.geojson`,"utf8")),geometry=source.geometry as Extract<SourceGeometry,{type:"Polygon"}>;
  validateAuthoringGeometry(geometry,provenance.recipe.reference);
  const subjects=[{id:"mountain-rounded",revision:3,svg:studyMountain()},{id:"woodland-broadleaf-grove",revision:3,svg:studyWoodland()},{id:"woodland-broadleaf-grove",revision:4,svg:studyWoodland(1)},{id:"settlement-city",revision:2,svg:studyCity()}];
  for(const subject of subjects){assert.ok(!/<(?:script|foreignObject|image|style|use|a)\b|(?:href|on\w+)\s*=|url\s*\(/i.test(subject.svg));const file=`${assets}/${subject.id}-${subject.revision}.svg`;
    try{assert.equal((await readFile(file,"utf8")).replaceAll("\r\n","\n"),subject.svg,"Append a revision; never replace a published subject");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;await writeFile(file,subject.svg);}
  }
  let svg=await readFile(`${before}/first-island.svg`,"utf8");
  const start=svg.indexOf("<defs>")+6,end=svg.indexOf('<clipPath id="land">');assert.ok(start>6&&end>start);
  svg=svg.slice(0,start)+subjects.map(s=>`<g id="${s.id}-${s.revision}">${s.svg.replace(/^<svg[^>]+>/,"").replace(/<\/svg>\s*$/,"")}</g>`).join("")+svg.slice(end);
  const groves=[[650,610,.38,-6],[645,794,.62,4],[791,872,.49,-5],[955,1000,.49,7],[1200,620,.35,-6],[986,795,.35,6],[740,970,.32,-9]];
  for(const [x,y] of groves)assert.ok(pointInsideGeographicRing([x,y],geometry.coordinates[0]));
  const marks=`<use href="#mountain-rounded-3" transform="translate(900 670) scale(.94)"/>`+groves.map(([x,y,s,r],i)=>`<use href="#woodland-broadleaf-grove-${i%2?4:3}" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"/>`).join("");
  let placed=false;svg=svg.replace(/<use href="#(?:mountain-rounded|woodland-broadleaf-grove)"[^>]+\/>/g,()=>{if(placed)return "";placed=true;return marks;});assert.ok(placed);
  svg=svg.replace(/(<use href="#settlement-city" transform="translate\([^)]+\) )scale\(\.58\)/,'$1scale(.52)');
  svg=svg.replaceAll(provenance.river,"M1185 690C1188 705 1185 718 1180 745S1172 784 1213 790S1260 818 1320.722 835");
  svg=svg.replace('href="#settlement-city"','href="#settlement-city-2"');
  svg=svg.replace('y="1000" text-anchor="middle" font-size="23"','y="1020" text-anchor="middle" font-size="23"');
  svg=svg.replace('<text x="650" y="698" text-anchor="middle" font-size="18"','<text x="960" y="860" text-anchor="middle" font-size="18"');
  svg=svg.replace("The greenward woods","Greenward woods").replaceAll("1010 438","1010 408").replace('x="1010" y="438"','x="1010" y="408"');
  svg=svg.replace("Revised three-subject study, with retained originals and editable geographic source.","Third three-subject study · Open woodland edges, varied slopes and grounded town architecture.");
  await writeFile(`${out}/first-island.svg`,svg);await writeFile(`${out}/sample-geography.geojson`,await readFile(`${before}/sample-geography.geojson`));
  const png=await sharp(Buffer.from(svg)).png().toBuffer();await writeFile(`${out}/first-island.png`,png);await sharp(png).grayscale().png().toFile(`${out}/first-island-grayscale.png`);await sharp(png).resize(600,420).png().toFile(`${out}/first-island-600.png`);
  for(const s of subjects)for(const size of [64,96])await sharp(Buffer.from(s.svg)).resize(size,size,{fit:"contain",background:"#f4efdd"}).png().toFile(`${out}/thumbnails/${s.id}-r${s.revision}-${size}.png`);
  for(const [name,left,top,width,height] of [["mountains",620,430,630,370],["woodland",500,625,600,435],["city-river-label",1060,650,430,410],["coastline",380,250,650,290]] as const)await sharp(png).extract({left,top,width,height}).png().toFile(`${out}/details/${name}.png`);
  await writeFile(`${out}/sample-provenance.json`,JSON.stringify({format:"serrian-ux0a-art-study-v3",purpose:"Focused same-three-subject independent art review; no application readiness",reviewedBase:"e7c68f808cace64d88363c1e9807b5fa8954c00a",artworkMethod:"Codex-assisted original code-authored SVG contours, translucent washes and hatching; no external/downloaded/traced art",approval:"Pending independent review",libraryExpansionApproved:false,sourceRevision:{...provenance.sourceRevision,unchangedFromRevision2:true,geojsonSha256:hash(await readFile(`${out}/sample-geography.geojson`))},recipe:provenance.recipe,assets:subjects.map(s=>({id:s.id,revision:s.revision,file:`${assets}/${s.id}-${s.revision}.svg`,sha256:hash(s.svg),viewBox:s.svg.match(/viewBox="([^"]+)"/)![1]})),png:{file:"first-island.png",width:2000,height:1400,sha256:hash(png)},groves:{previousInstances:34,currentInstances:groves.length,distinctGroveFootprints:2,placements:groves,method:"Fewer uneven groupings, distinct clearings and separated woodland regions. Deterministic fixed study placements; not a new scatter algorithm or runtime readiness claim."},riverHeadwater:"Moved clear of the enlarged mountain silhouette; illustrated path only, no hydrology simulation",preserved:"All previous source/art revisions and current catalog pins unchanged"},null,2)+"\n");
  console.log(JSON.stringify({out,subjects:new Set(subjects.map(s=>s.id)).size,groves:groves.length,sha256:hash(png)},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
