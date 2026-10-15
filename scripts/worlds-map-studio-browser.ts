import type {Page} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {environment} from './worlds-geo-d1a-harness';
export async function studioEnvironment(){
 const e=await environment();if(!process.argv.includes('--studio-copy'))return e;
 const copy=JSON.parse(await readFile('artifacts/guidance/geo-ux0/d1a-copy.json','utf8'));
 assert.equal(copy.source,e.url);assert.match(copy.database,/^serrian_geo_ux0_d1a_\d+$/);
 return {...e,url:e.url.replace(/serrian_geo_d1a$/,copy.database)};
}
/** Explicit navigation for retained regression journeys after the UX-0 reorganization. */
export async function studioSection(page:Page,name:string){
 const palette=page.getByRole('navigation',{name:'Studio tools'});
 if(new URL(page.url()).searchParams.has("editMap")||await palette.count()){await palette.waitFor({timeout:120000});await palette.getByRole('button',{name,exact:true}).click();}
}
export async function artworkTool(page:Page,name:string){
 await studioSection(page,'Artwork');
 const picker=page.getByLabel('Artwork tool',{exact:true});
 if(await picker.count())await picker.selectOption({label:name});
 else await page.getByRole('button',{name,exact:true}).click();
}
export async function dismissStudioSettings(page:Page){
 const close=page.getByRole('button',{name:'Close tool settings',exact:true});
 if((page.viewportSize()?.width??1440)<=1050&&await close.isVisible())await close.click();
}
/** A retained editor may already own this source and hide its saved scene path. */
export async function selectedGeographicSource(page:Page){
 const button=page.getByRole('button',{name:'Download geographic draft',exact:true});
 if(!await button.count()||!await button.isEnabled())return null;
 const event=page.waitForEvent('download');await button.click();const stream=await(await event).createReadStream();if(!stream)return null;
 const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));
 return JSON.parse(Buffer.concat(chunks).toString('utf8')).sourceId as string|null;
}
