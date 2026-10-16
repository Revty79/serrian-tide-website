/** Read-only resource receipt for the owned technical benchmark and pinned library. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile,readdir} from "node:fs/promises";
import path from "node:path";
import {gzipSync} from "node:zlib";
import {ownedPool,UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
async function main(){
 const full=process.argv.includes("--full-library");
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,full?"library-performance-current.json":"performance-current.json"),"utf8")),pool=await ownedPool(f.environment,"empty");
 try{
  const map=(await pool.query("select id,revision,pg_column_size(m) map_row_bytes,pg_column_size(presentation) presentation_bytes from world_atlas_map m where id=$1",[f.map])).rows[0];
  const drawings=(await pool.query("select id,pg_column_size(content) bytes,md5(content::text) digest from world_atlas_drawing where map_id=$1 order by sort_order",[f.map])).rows;assert.deepEqual(drawings.map(d=>d.id),f.drawingIds);
  const sources=(await pool.query("select v.feature_id,v.id,v.revision,pg_column_size(v.geometry) geometry_bytes,md5(v.geometry::text) geometry_digest from world_geo_version v where v.surface_id=$1 order by v.feature_id,v.revision",[f.surface])).rows;
  const history=(await pool.query("select count(*)::int versions,coalesce(sum(pg_column_size(payload)),0)::int payload_bytes from world_map_state_version where map_id=$1",[f.map])).rows[0];
  const root="public/cartography/serrian-atlas-island/1",catalogBytes=await readFile(path.join(root,"catalog.json")),catalog=JSON.parse(catalogBytes.toString("utf8")),assets=[];
  for(const asset of catalog.assets){const bytes=await readFile(path.join(root,asset.file));assert.equal(createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g,"\n")).digest("hex"),asset.sourceSha256);assets.push({id:asset.id,revision:asset.revision,file:asset.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,sha256:asset.sourceSha256});}
  const originals=[];for(const name of await readdir(root))if(name.endsWith(".svg")){const data=await readFile(path.join(root,name));originals.push({file:name,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")});}
  const generated=await readFile("src/features/worlds/island-assets.generated.ts"),result={fixture:f.map,scope:f.scope,map,drawings:{count:drawings.length,contentBytes:drawings.reduce((s,d)=>s+d.bytes,0),identitiesAndDigests:drawings},sources,history,library:{runtimeAssets:assets,pinnedSvgGzipBytes:assets.reduce((s,a)=>s+a.gzipBytes,0),catalogJsonBytes:catalogBytes.length,generatedCatalogModuleBytes:generated.length,generatedCatalogModuleGzipBytes:gzipSync(generated).length,retainedOriginals:originals,limitation:full?"14 latest candidate subjects; 18 exact catalog entries including the three retained revision-1 pins and the approved two grove footprints. Independent full-library artwork review remains pending.":"Three retained revision-1 runtime assets only. Revised studies are retained files, not promoted. Final 12-16-asset/lazy-material transfer gate remains pending art approval and expansion."},limits:f.limits};await writeFile(path.join(UX0A_DIRECTORY,full?"library-resource-receipt.json":"resource-receipt.json"),JSON.stringify(result,null,2));console.log("PASS read-only benchmark storage/identity and exact pinned-asset receipt");
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
