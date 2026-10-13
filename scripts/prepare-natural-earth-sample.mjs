/** Reproducible, development-only converter. Does not connect to a database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as shapefile from "shapefile";

const sourceUrl="https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip";
const folder=path.resolve("artifacts/guidance/geo-a/natural-earth-5.1.1"),archive=path.join(folder,"ne_110m_admin_0_countries.zip");
assert.ok(folder.startsWith(path.resolve("artifacts/guidance/geo-a")+path.sep));
await mkdir(folder,{recursive:true});
let bytes;try{bytes=await readFile(archive);}catch{const response=await fetch(sourceUrl);assert.ok(response.ok,`Natural Earth download ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length<2_000_000&&bytes.subarray(0,2).toString()==="PK");await writeFile(archive,bytes);}
const extracted=path.join(folder,"extracted");
try{await readFile(path.join(extracted,"ne_110m_admin_0_countries.shp"));}catch{const quoted=value=>"'"+value.replaceAll("'","''")+"'";execFileSync("powershell.exe",["-NoProfile","-Command",`Expand-Archive -LiteralPath ${quoted(archive)} -DestinationPath ${quoted(extracted)}`],{windowsHide:true,stdio:"ignore"});}
const version=(await readFile(path.join(extracted,"ne_110m_admin_0_countries.VERSION.txt"),"utf8")).trim();assert.equal(version,"5.1.1");
const prj=await readFile(path.join(extracted,"ne_110m_admin_0_countries.prj"),"utf8");assert.match(prj,/WGS_1984/);
const all=await shapefile.read(path.join(extracted,"ne_110m_admin_0_countries.shp"),path.join(extracted,"ne_110m_admin_0_countries.dbf"),{encoding:"utf-8"});
const selected=all.features.filter(f=>["FJI","NZL","ZAF"].includes(f.properties.ADM0_A3)).sort((a,b)=>a.properties.ADM0_A3.localeCompare(b.properties.ADM0_A3));assert.equal(selected.length,3);
const properties=f=>Object.fromEntries(Object.entries(f.properties).map(([k,v])=>[k,typeof v==="string"?v.replace(/\u0000+$/g,"").trimEnd():v]));
const sample={version:1,provenance:{provider:"Natural Earth",dataset:"Admin 0 Countries 1:110m",edition:version,sourceUrl,license:"Public domain",licenseUrl:"https://www.naturalearthdata.com/about/terms-of-use/",attribution:"Made with Natural Earth",attributionRequired:false,fileSha256:createHash("sha256").update(bytes).digest("hex"),originalCrs:"EPSG:4326",parameters:"Select ADM0_A3 FJI,NZL,ZAF; preserve original source coordinates/properties; shapefile 0.6.6; no simplification, inferred sovereignty or source reprojection; remove trailing DBF NUL/space text padding."},records:selected.map(f=>({externalId:String(f.properties.NE_ID),name:properties(f).NAME_EN,semantic:"administrative-boundary",geometry:f.geometry,properties:properties(f),protected:false}))};
await mkdir("data/geography",{recursive:true});const output=JSON.stringify(sample)+"\n";await writeFile("data/geography/natural-earth-110m-sample.json",output);
await writeFile(path.join(folder,"preparation-receipt.json"),JSON.stringify({sourceUrl,edition:version,archiveSha256:sample.provenance.fileSha256,sampleSha256:createHash("sha256").update(output).digest("hex"),archiveBytes:bytes.length,sampleBytes:Buffer.byteLength(output),records:selected.map(f=>({name:properties(f).NAME_EN,type:f.geometry.type,components:f.geometry.type==="MultiPolygon"?f.geometry.coordinates.length:1}))},null,2));
console.log(`Prepared ${selected.length} real source records; ${Buffer.byteLength(output)} sample bytes. No database writes.`);
