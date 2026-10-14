/** Reproducible content preparation only. No database connection or writes. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import * as shapefile from "shapefile";
import {coordinateCount,geometryParts,sourceGeometrySchema,sourceImportSchema} from "../src/features/worlds/geographic.ts";
import {validateSourceGeometry} from "../src/features/worlds/geographic-geometry.ts";

const directory="artifacts/guidance/geo-b",sphere={version:1,kind:"sphere",crs:"EPSG:4326",units:"degrees"};
const sha=value=>createHash("sha256").update(value).digest("hex");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`:JSON.stringify(value);
const manifest=JSON.parse((await readFile("data/geography/natural-earth-world-sources.json","utf8")).replace(/^\uFEFF/,""));
assert.equal(manifest.version,1);assert.equal(manifest.provider,"Natural Earth");assert.equal(manifest.sources.length,8);
await mkdir(`${directory}/batches`,{recursive:true});
const converted=new Map(),reports=[],batches=[];
for(const layer of manifest.sources){
  assert.match(layer.stem,/^ne_(110m|50m|10m)_(land|admin_0_countries|admin_0_boundary_lines_land|admin_0_disputed_areas)$/);
  const folder=path.resolve(directory,"sources",layer.stem),archive=path.join(folder,`${layer.stem}.zip`),extracted=path.join(folder,"extracted");
  await mkdir(folder,{recursive:true});let bytes;try{bytes=await readFile(archive);}catch{const response=await fetch(layer.url,{signal:AbortSignal.timeout(60000)});assert.ok(response.ok);bytes=Buffer.from(await response.arrayBuffer());await writeFile(archive,bytes);}
  assert.equal(bytes.length,layer.zipBytes);assert.equal(sha(bytes),layer.zipSha256);
  try{await readFile(path.join(extracted,`${layer.stem}.shp`));}catch{const quote=s=>"'"+s.replaceAll("'","''")+"'";execFileSync("powershell.exe",["-NoProfile","-Command",`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)}`],{windowsHide:true,stdio:"pipe"});}
  assert.equal((await readFile(path.join(extracted,`${layer.stem}.VERSION.txt`),"utf8")).trim(),layer.edition);
  assert.match(await readFile(path.join(extracted,`${layer.stem}.prj`),"utf8"),/WGS_1984/);
  const collection=await shapefile.read(path.join(extracted,`${layer.stem}.shp`),path.join(extracted,`${layer.stem}.dbf`),{encoding:"utf-8"});
  assert.equal(collection.features.length,layer.expectedFeatures);let coordinates=0;
  for(const f of collection.features){assert.ok(f.geometry);coordinates+=coordinateCount(f.geometry);f.properties=Object.fromEntries(Object.entries(f.properties).map(([k,v])=>[k,typeof v==="string"?v.replace(/\u0000+$/g,"").trimEnd():v]));}
  assert.equal(coordinates,layer.expectedCoordinates);converted.set(layer.stem,collection.features);
}
const idsAt=scale=>new Set(converted.get(`ne_${scale}_admin_0_countries`).map(f=>String(f.properties.NE_ID)));
const overviewIds=idsAt("110m"),regionalIds=idsAt("50m");
for(const layer of manifest.sources){
  const features=converted.get(layer.stem),scale=/^ne_(110m|50m|10m)_/.exec(layer.stem)[1],physical=layer.stem.endsWith("_land")&&!layer.stem.includes("boundary"),countries=layer.stem.endsWith("_countries"),disputed=layer.stem.endsWith("_disputed_areas");
  const dataset=countries?`Admin 0 Countries 1:${scale}`:physical?`Physical land 1:${scale}`:disputed?"Admin 0 disputed areas 1:10m":"Admin 0 land boundary lines 1:10m";
  const defaultBand=scale==="110m"?"overview":scale==="50m"?"regional":"detail",priority=scale==="110m"?10:scale==="50m"?20:30;
  const records=[];let components=0;
  for(const [index,f] of features.entries()){
    const originalParts=geometryParts(f.geometry);components+=originalParts.length;
    const identity=String(f.properties.NE_ID??f.properties.ne_id??`source-${index}`),name=String(f.properties.NAME_EN||f.properties.NAME||f.properties.BRK_NAME||f.properties.FEATURECLA||f.properties.featurecla||"Source outline");
    const style=physical?"land":disputed||/disputed|uncertain|indefinite|unrecognized|line of control/i.test(String(f.properties.FEATURECLA))?"disputed":"outline";
    const lods=countries?(scale==="110m"?["overview"]:scale==="50m"?(overviewIds.has(identity)?["regional"]:["overview","regional"]):regionalIds.has(identity)?["detail"]:["overview","regional","detail"]):disputed?["overview","regional","detail"]:physical?[defaultBand]:["detail"];
    if(!physical){
      const geometry=sourceGeometrySchema.parse(f.geometry);validateSourceGeometry(geometry,sphere);
      records.push({record:{externalId:countries?identity:disputed?`${identity}:${f.properties.BRK_A3}:${f.properties.ADM0_A3}:${index}`:`${identity}:source:${index}`,name:countries?name:disputed?`${f.properties.BRK_NAME||name} — source interpretation`:`${f.properties.ADM0_LEFT||"Unspecified side"} / ${f.properties.ADM0_RIGHT||"Unspecified side"} — ${f.properties.FEATURECLA||"boundary"}`,semantic:"administrative-boundary",geometry,properties:f.properties,protected:false},descriptor:{sourceRow:index,sourceIdentity:identity,sourceGeometrySha256:sha(canonical(f.geometry)),sourcePropertiesSha256:sha(canonical(f.properties)),componentFirst:0,componentCount:originalParts.length,country:countries},display:{lods,priority,style,exact:true}});
      continue;
    }
    // Complete rings/holes are indivisible. Partition only the multipolygon's
    // component list and retain exact ranges for reconstructing the source row.
    let first=0,current=[],count=0,size=0;
    function emit(){if(!current.length)return;const geometry=f.geometry.type==="Polygon"?current[0]:{type:"MultiPolygon",coordinates:current.map(p=>p.coordinates)};
      sourceGeometrySchema.parse(geometry);validateSourceGeometry(geometry,sphere);
      records.push({record:{externalId:`${identity}:components:${first}-${first+current.length-1}`,name:`Physical land ${scale} — source ${index+1}, components ${first+1}–${first+current.length}`,semantic:"physical-geography",geometry,properties:{...f.properties,SOURCE_FEATURE_INDEX:index,SOURCE_COMPONENT_FIRST:first,SOURCE_COMPONENT_COUNT:current.length,SOURCE_GEOMETRY_SHA256:sha(canonical(f.geometry)),SOURCE_GEOMETRY_TYPE:f.geometry.type},protected:false},descriptor:{sourceRow:index,sourceIdentity:identity,sourceGeometrySha256:sha(canonical(f.geometry)),sourcePropertiesSha256:sha(canonical(f.properties)),componentFirst:first,componentCount:current.length,country:false},display:{lods,priority,style,exact:true}});
      first+=current.length;current=[];count=0;size=0;
    }
    for(const part of originalParts){const amount=coordinateCount(part),bytes=Buffer.byteLength(JSON.stringify(part));
      const polar=part.type==="Polygon"&&part.coordinates[0].some(p=>Math.abs(p[1])>=90-1e-9);
      if(current.length&&(count+amount>120_000||size+bytes>3_400_000||current.length>=512||polar))emit();
      current.push(part);count+=amount;size+=bytes;if(polar)emit();
    }emit();
  }
  assert.equal(new Set(records.map(r=>r.record.externalId)).size,records.length,`duplicate ${layer.stem} source identity`);
  const groups=new Map();for(const item of records){const key=JSON.stringify(item.display);const group=groups.get(key)||[];group.push(item);groups.set(key,group);}
  for(const group of groups.values()){
    group.sort((a,b)=>a.record.externalId.localeCompare(b.record.externalId));let pending=[];
    const provenance={provider:manifest.provider,dataset,edition:layer.edition,sourceUrl:layer.url,license:manifest.license,licenseUrl:manifest.licenseUrl,attribution:manifest.attribution,attributionRequired:false,fileSha256:layer.zipSha256,originalCrs:"EPSG:4326",parameters:"Worldwide source inventory; shapefile 0.6.6 UTF-8; remove trailing DBF NUL/space padding only. No source coordinate rounding, reprojection or simplification. Physical multipart partitions retain complete components, original row index/range and geometry checksum. Countries keep NE_ID across scales; de facto/disputed classifications are provider accounts, not sovereignty adjudication.",display:group[0].display};
    async function emitBatch(){if(!pending.length)return;const source=sourceImportSchema.parse({version:1,provenance,records:pending.map(item=>item.record)}),text=JSON.stringify(source)+"\n",file=`batches/${String(batches.length).padStart(4,"0")}.json`;
      assert.ok(Buffer.byteLength(text)<7_500_000);await writeFile(`${directory}/${file}`,text);
      batches.push({file,sha256:sha(text),bytes:Buffer.byteLength(text),layer:layer.stem,dataset,records:pending.map(({record,descriptor})=>({...descriptor,externalId:record.externalId,name:record.name,geometrySha256:sha(canonical(record.geometry))}))});pending=[];
    }
    for(const item of group){if(pending.length===32||Buffer.byteLength(JSON.stringify({version:1,provenance,records:[...pending,item].map(i=>i.record)}))>7_000_000)await emitBatch();pending.push(item);}await emitBatch();
  }
  const report={layer:layer.stem,sourceRows:features.length,sourceComponents:components,importRecords:records.length,sourceCoordinates:layer.expectedCoordinates,zipSha256:layer.zipSha256,edition:layer.edition,dataset};reports.push(report);console.log(`Prepared ${layer.stem}: ${features.length} original rows, ${components} components, ${records.length} bounded records`);
}
const plan={version:1,manifestSha256:sha(canonical(manifest)),sources:reports,batches};
await writeFile(`${directory}/import-plan.json`,JSON.stringify({...plan,planSha256:sha(canonical(plan))},null,2)+"\n");
console.log(`Prepared ${batches.length} deterministic batches; original sources retained; no database writes.`);
