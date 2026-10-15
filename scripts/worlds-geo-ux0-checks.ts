/** Additional D1 artwork acceptance gets its own exact disposable copy. No shared DB configuration. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {environment} from './worlds-geo-d1a-harness';
async function main(){
 const e=await environment();assert.equal(process.versions.node.split('.')[0],'22');
 const database=`serrian_geo_ux0_d1a_${Date.now()}`,admin=new pg.Pool({connectionString:e.url.replace(/serrian_geo_d1a$/,'postgres')});
 assert.match(database,/^serrian_geo_ux0_d1a_\d+$/);
 try{assert.equal(Number((await admin.query("select count(*) n from pg_stat_activity where datname='serrian_geo_d1a'")).rows[0].n),0);await admin.query(`create database "${database}" template serrian_geo_d1a`);await mkdir('artifacts/guidance/geo-ux0',{recursive:true});await writeFile('artifacts/guidance/geo-ux0/d1a-copy.json',JSON.stringify({database,source:e.url},null,2));console.log('PASS exact disposable D1 artwork copy created');}finally{await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
