/** Pinned C1 conversion: public downloads -> verified bounded files; no database writes. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import * as shapefile from "shapefile";
import {coordinateCount,geometryParts,sourceGeometrySchema,sourceImportSchema} from "../src/features/worlds/geographic.ts";
import {validateSourceGeometry} from "../src/features/worlds/geographic-geometry.ts";
const directory="artifacts/guidance/geo-c",reference={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`:JSON.stringify(value);
const manifest=JSON.parse(await readFile("data/geography/natural-earth-physical-sources.json","utf8"));
assert.equal(manifest.version,1);assert.equal(manifest.sources.length,7);await mkdir(`${directory}/batches`,{recursive:true});
const reports=[],batches=[];
for(const layer of manifest.sources){
  assert.match(layer.stem,/^ne_10m_(rivers_lake_centerlines|lakes|geography_regions_polys|geography_regions_points|geography_regions_elevation_points|geography_marine_polys|populated_places)$/);
  const folder=path.resolve(directory,"sources",layer.stem),archive=path.join(folder,`${layer.stem}.zip`),extracted=path.join(folder,"extracted");await mkdir(folder,{recursive:true});let bytes;
  try{bytes=await readFile(archive);}catch{const response=await fetch(layer.url,{signal:AbortSignal.timeout(60000)});assert.ok(response.ok);bytes=Buffer.from(await response.arrayBuffer());await writeFile(archive,bytes);}
  assert.equal(bytes.length,layer.zipBytes);assert.equal(sha(bytes),layer.zipSha256);
  try{await readFile(path.join(extracted,`${layer.stem}.shp`));}catch{const quote=s=>"'"+s.replaceAll("'","''")+"'";execFileSync("powershell.exe",["-NoProfile","-Command",`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)}`],{windowsHide:true,stdio:"pipe"});}
  assert.equal((await readFile(path.join(extracted,`${layer.stem}.VERSION.txt`),"utf8")).trim(),layer.edition);assert.match(await readFile(path.join(extracted,`${layer.stem}.prj`),"utf8"),/WGS_1984/);
  const features=(await shapefile.read(path.join(extracted,`${layer.stem}.shp`),path.join(extracted,`${layer.stem}.dbf`),{encoding:"utf-8"})).features;assert.equal(features.length,layer.expectedFeatures);
  for(const f of features)f.properties=Object.fromEntries(Object.entries(f.properties).map(([k,v])=>[k,typeof v==="string"?v.replace(/\u0000+$/g,"").trimEnd():v]));
  assert.equal(features.reduce((n,f)=>n+coordinateCount(f.geometry),0),layer.expectedCoordinates);
  const omissions=[],records=[],primaries=new Map();
  for(const [sourceRow,f] of features.entries()){
    const properties=f.properties,classification=String(properties.featurecla??properties.FEATURECLA??"Unclassified"),originalName=String(properties.name??properties.NAME??"").trim();
    if(classification==="Dragons-be-here"){omissions.push({sourceRow,sourceIdentity:String(properties.NE_ID??properties.ne_id??`source-${sourceRow}`),name:originalName,reason:"Provider's fictional Dragons-be-here sentinel is not real Earth geography.",geometrySha256:sha(canonical(f.geometry))});continue;}
    const river=layer.stem.endsWith("rivers_lake_centerlines"),water=layer.stem.endsWith("lakes"),marine=layer.stem.endsWith("marine_polys"),city=layer.stem.endsWith("populated_places"),peak=layer.stem.endsWith("elevation_points");
    const theme=river?"rivers":water||classification==="Lake"?"inland-water":marine?"marine":city?"cities":/Range\/mtn|Foothills/.test(classification)||peak&&/mountain|spot elevation|pass/i.test(classification)?"mountains":"landscapes";
    const style=river?"river":theme==="inland-water"?"water":marine?"marine":city?"city":f.geometry.type==="Point"?"peak":"region";
    const rankValue=Number(properties.scalerank??properties.SCALERANK??99),rank=Number.isInteger(rankValue)&&rankValue>=0?Math.min(100,rankValue):99;
    const display={theme,style,lods:rank<=2?["overview","regional","detail"]:rank<=5?["regional","detail"]:["detail"],priority:0,exact:false,labels:!!originalName,labelRank:rank};
    const geometry=sourceGeometrySchema.parse(f.geometry),validation=water?{retainCoincidentVertices:true}:undefined;validateSourceGeometry(geometry,reference,validation);
    const sourceIdentity=String(properties.NE_ID??properties.ne_id??`source-${sourceRow}`),externalId=`${sourceIdentity}:row:${sourceRow}`,logicalGroup=river&&Number(properties.rivernum)>0&&originalName?`${properties.rivernum}:${originalName}`:null;
    if(logicalGroup&&!primaries.has(logicalGroup))primaries.set(logicalGroup,externalId);
    records.push({record:{externalId,name:originalName||`Unnamed ${classification} — source ${sourceRow+1}`,semantic:"physical-geography",context:city?/populated place|capital/i.test(classification)?"settlement":"place":f.geometry.type==="Point"?"place":"region",geometry,properties,protected:false},display,validation,descriptor:{sourceRow,sourceIdentity,externalId,name:originalName,logicalGroup,primaryExternalId:logicalGroup?primaries.get(logicalGroup):null,geometrySha256:sha(canonical(geometry)),propertiesSha256:sha(canonical(properties))}});
  }
  // Source-proven river number + exact supplied name establishes deliberate
  // identity reuse. Import primary members before any linked centerline rows.
  for(const secondary of [false,true]){
    const groups=new Map();for(const item of records){if((item.descriptor.primaryExternalId!==null&&item.descriptor.primaryExternalId!==item.record.externalId)!==secondary)continue;const key=JSON.stringify(item.display);const group=groups.get(key)??[];group.push(item);groups.set(key,group);}
    for(const group of groups.values()){
      let pending=[];const provenance={provider:manifest.provider,dataset:layer.dataset,edition:layer.edition,sourceUrl:layer.url,license:manifest.license,licenseUrl:manifest.licenseUrl,attribution:manifest.attribution,attributionRequired:false,fileSha256:layer.zipSha256,originalCrs:"EPSG:4326",parameters:"Complete worldwide source inventory; shapefile 0.6.6 UTF-8; remove trailing DBF NUL/space padding only. Exact original geometry and attributes retained. External identity includes native row to disambiguate repeated provider IDs. River number plus identical supplied name explicitly shares a place with its source centerlines. No inferred country, founding date, allegiance or historical control. Display ranks select detail bands; geometry is never rewritten for display.",display:group[0].display,...group[0].validation?{validation:group[0].validation}:{}};
      async function emit(){if(!pending.length)return;const source=sourceImportSchema.parse({version:1,provenance,records:pending.map(i=>i.record)}),text=JSON.stringify(source)+"\n",file=`batches/${String(batches.length).padStart(4,"0")}.json`;assert.ok(Buffer.byteLength(text)<7_500_000);await writeFile(`${directory}/${file}`,text);batches.push({file,sha256:sha(text),bytes:Buffer.byteLength(text),layer:layer.stem,dataset:layer.dataset,records:pending.map(i=>i.descriptor)});pending=[];}
      for(const item of group){if(pending.length===32||Buffer.byteLength(JSON.stringify({version:1,provenance,records:[...pending,item].map(i=>i.record)}))>7_000_000||item.descriptor.logicalGroup&&pending.some(p=>p.descriptor.logicalGroup===item.descriptor.logicalGroup))await emit();pending.push(item);}await emit();
    }
  }
  reports.push({layer:layer.stem,dataset:layer.dataset,sourceRows:features.length,importRecords:records.length,sourceCoordinates:records.reduce((n,i)=>n+coordinateCount(i.record.geometry),0),sourceComponents:records.reduce((n,i)=>n+geometryParts(i.record.geometry).length,0),zipSha256:layer.zipSha256,edition:layer.edition,omissions});console.log(`Prepared ${layer.stem}: ${records.length} complete records, ${omissions.length} explicit omissions`);
}
const plan={version:1,manifestSha256:sha(canonical(manifest)),sources:reports,batches};await writeFile(`${directory}/import-plan.json`,JSON.stringify({...plan,planSha256:sha(canonical(plan))},null,2)+"\n");console.log(`Prepared ${batches.length} deterministic bounded batches; no database writes.`);
