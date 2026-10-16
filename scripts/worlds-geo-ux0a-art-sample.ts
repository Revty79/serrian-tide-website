/** Original SVG art-direction proof only. No database, fixture or runtime acceptance claim. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import sharp from "sharp";
import {generateGeography,type GeographicRecipe} from "../src/features/worlds/geographic-generation";

const source="public/cartography/serrian-atlas-island/1";
const output="docs/screenshots/worlds-geo-ux0a/art-direction";
const subjects=["mountain-rounded","woodland-broadleaf-grove","settlement-city"] as const;
async function main(){
 const assets=await Promise.all(subjects.map(async id=>{
  const svg=await readFile(`${source}/${id}-1.svg`,"utf8");
  assert.ok(!/<(?:script|foreignObject|image|style)\b|(?:href|on\w+)\s*=/i.test(svg),"Self-contained original vectors only");
  const body=svg.replace(/^<svg[^>]+>/,"").replace(/<\/svg>\s*$/,"");
  return {id,revision:1,sha256:createHash("sha256").update(svg).digest("hex"),body};
 }));
 const recipe:GeographicRecipe={version:1,algorithm:"serrian-geography-v1",seed:"island-art-direction-20261015",reference:{version:1,kind:"plane",crs:"AUTHORED:island-art-direction",units:"map units",bounds:[0,0,2000,1200]},extent:[0,0,2000,1200],settings:{continents:0,islands:1,landCoverage:40,complexity:88,size:"large",shape:"balanced"}};
 const generated=generateGeography(recipe),geometry=generated.features[0].geometry;
 assert.equal(geometry.type,"Polygon");if(geometry.type!=="Polygon")throw Error("Expected single island");
 const ring=geometry.coordinates[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
 const left=Math.min(...xs),top=Math.min(...ys),scale=Math.min(1500/(Math.max(...xs)-left),850/(Math.max(...ys)-top));
 const points=ring.map(([x,y])=>[250+(x-left)*scale,285+(y-top)*scale]);
 const land=points.map(([x,y],i)=>`${i?"L":"M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")+" Z";
 const inside=(x:number,y:number)=>{let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const marks:string[]=[];
 const ridge=[[620,515,.48],[684,552,.57],[747,583,.44],[729,624,.61],[808,645,.52],[850,694,.60],[905,718,.47],[952,763,.55],[1025,784,.40]];
 for(const [x,y,size] of ridge)if(inside(x,y))marks.push(`<use href="#mountain-rounded" transform="translate(${x} ${y}) scale(${size})"/>`);
 let randomState=4417;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 for(let i=0;i<210;i++){
  const x=380+random()*830,y=650+random()*360;
  const grove=(x<680&&y>700)||(x>800&&y>830)||(x>520&&x<830&&y>940);
  if(grove&&inside(x,y)&&inside(x,y-45)&&!(x>980&&y>835))marks.push(`<use href="#woodland-broadleaf-grove" transform="translate(${x} ${y}) scale(${.14+random()*.10})"/>`);
 }
 const coast=points.find(([x,y])=>x>1000&&y>870&&y<1040)??[1120,940];
 const city:[number,number]=[coast[0]-80,coast[1]-30];
 const [cx,cy]=city;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400" viewBox="0 0 2000 1400">
 <defs>${assets.map(a=>`<g id="${a.id}">${a.body}</g>`).join("\n")}
 <clipPath id="land"><path d="${land}"/></clipPath>
 <pattern id="paper" width="61" height="47" patternUnits="userSpaceOnUse"><path d="M4 11h2m26 18h3m18-22h1M12 39h2" stroke="#978f72" stroke-width=".5" opacity=".15"/></pattern>
 <pattern id="waves" width="130" height="90" patternUnits="userSpaceOnUse"><path d="M12 45q12-5 24 0t24 0m35-29q7-3 14 0" fill="none" stroke="#738f91" stroke-width=".8" opacity=".23"/></pattern></defs>
 <rect width="2000" height="1400" fill="#f4efdd"/><rect width="2000" height="1400" fill="url(#paper)"/>
 <rect x="60" y="190" width="1880" height="1000" fill="#c7d9d6"/><rect x="60" y="190" width="1880" height="1000" fill="url(#waves)"/>
 <path d="${land}" fill="none" stroke="#b2cbca" stroke-width="18" stroke-linejoin="round"/><path d="${land}" fill="none" stroke="#edf0de" stroke-width="8" stroke-linejoin="round"/>
 <path d="${land}" fill="#e5ddbc" stroke="#697265" stroke-width="1.8"/>
 <g clip-path="url(#land)"><path d="${land}" fill="url(#paper)"/>
 ${marks.join("\n")}
 <path d="M820 650Q855 720 965 805T${cx+25} ${cy+5}T${coast[0]+18} ${coast[1]+8}" fill="none" stroke="#f5efdc" stroke-width="10"/>
 <path d="M820 650Q855 720 965 805T${cx+25} ${cy+5}T${coast[0]+18} ${coast[1]+8}" fill="none" stroke="#72999f" stroke-width="5"/>
 <path d="M${cx-75} ${cy+110}q-140-70-220-28t-190-25" fill="none" stroke="#ac8a60" stroke-width="2" stroke-dasharray="5 5"/>
 <use href="#settlement-city" transform="translate(${cx} ${cy}) scale(.48)"/></g>
 <g font-family="Georgia,serif" fill="#4c544b"><text x="1000" y="107" text-anchor="middle" font-size="51" letter-spacing="7">THE FIRST ISLAND</text><text x="1000" y="151" text-anchor="middle" font-size="18" letter-spacing="3">AN ORIGINAL INK-AND-WASH CARTOGRAPHIC STUDY</text>
 <text x="${cx}" y="${cy+47}" text-anchor="middle" font-size="24">Harbor city</text><text x="735" y="462" font-size="22" letter-spacing="4" transform="rotate(-12 735 462)">THE HIGH COUNTRY</text>
 <text x="630" y="1050" font-size="23" font-style="italic" letter-spacing="2">The greenward woods</text><text x="1510" y="1060" font-size="29" font-style="italic" letter-spacing="4" fill="#6a8587">The open sea</text><text x="1020" y="795" font-size="18" font-style="italic" fill="#658b94" transform="rotate(55 1020 795)">Silverwater</text></g>
 <g transform="translate(1750 350)" fill="none" stroke="#6a7669" stroke-width="1.3"><circle r="55"/><circle r="45"/><path d="M0-78 12-12 78 0 12 12 0 78-12 12-78 0-12-12Z"/><path d="M0-78 0 0 12-12Z M78 0 0 0 12 12Z M0 78 0 0-12 12Z M-78 0 0 0-12-12Z" fill="#6a7669"/><text y="-94" text-anchor="middle" fill="#4c544b" stroke="none" font-family="Georgia,serif" font-size="23">N</text></g>
 <g fill="none" stroke="#a39c80"><rect x="42" y="173" width="1916" height="1034"/><rect x="52" y="183" width="1896" height="1014" stroke-width=".6"/></g>
 <g font-family="Georgia,serif" fill="#6c705f" text-anchor="middle"><text x="1000" y="1260" font-size="22">Editable coastlines · Illustrated terrain · Persistent places</text><text x="1000" y="1301" font-size="17">Three original SVG subjects, composed with the retained seeded coastline generator.</text><text x="1000" y="1340" font-size="15" letter-spacing="1">INTERNAL ART-DIRECTION SAMPLE / NOT CANON / NOT APPLICATION ACCEPTANCE EVIDENCE</text></g></svg>`;
 await mkdir(output,{recursive:true});await writeFile(`${output}/first-island.svg`,svg);
 await sharp(Buffer.from(svg)).png().toFile(`${output}/first-island.png`);
 await writeFile(`${output}/sample-provenance.json`,JSON.stringify({createdBy:"Codex-assisted original SVG authoring",purpose:"Ember independent artwork gate; not runtime acceptance",libraryExpansionApproved:false,recipe,assets:assets.map(a=>({id:a.id,revision:a.revision,sha256:a.sha256})),artworkSource:source},null,2)+"\n");
 console.log(`${output}/first-island.png`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
