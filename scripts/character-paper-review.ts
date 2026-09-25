import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {hashPassword} from "better-auth/crypto";
import type pg from "pg";
import type {Page} from "playwright-core";
import type {PaperCharacterData} from "../src/features/characters/paper-character";

const output=path.resolve("docs/samples/unified-character-printing");
type ReviewSnapshot={characterId:number;name:string;playerUserId:string;paper:PaperCharacterData;tables:Record<string,Record<string,unknown>[]>};

/** Only the disposable test database is writable. Snapshot contains no credentials. */
export async function seedPaperReview(pool:pg.Pool, file:string, password:string) {
  assert.equal((await pool.query('select current_database() name')).rows[0].name,'serrian_character_sheet_dev');
  const snapshot=JSON.parse(await readFile(file,'utf8')) as ReviewSnapshot;
  assert.equal(snapshot.name,'Adrian Vale');
  const tx=await pool.connect();
  try {
    await tx.query('begin');
    await tx.query("set local session_replication_role='replica'");
    for(const [table,rows] of Object.entries(snapshot.tables)) {
      assert.match(table,/^[a-z_]+$/);
      assert.ok(!['account','session','verification'].includes(table));
      await tx.query(`delete from "${table}"`);
      if(rows.length) await tx.query(`insert into "${table}" select * from jsonb_populate_recordset(null::"${table}",$1::jsonb)`,[JSON.stringify(rows)]);
    }
    await tx.query('commit');
  } catch(error) { await tx.query('rollback'); throw error; } finally {tx.release();}
  const email=(await pool.query('select email from "user" where id=$1',[snapshot.playerUserId])).rows[0].email;
  // This account exists only in the throwaway database; source credentials were never read.
  await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values('paper-local-review','local:credential',$1,'credential',$1,$2,now())",[snapshot.playerUserId,await hashPassword(password)]);
  return {snapshot,email};
}

export async function capturePaperPdf(page:Page,label:string,expected:{name:string;campaign:string}) {
  await mkdir(output,{recursive:true});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>(".paper-masthead-art image")).map(element => new Promise<void>((resolve,reject) => {
      const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error("Missing print artwork")); image.src = element.href.baseVal;
    })));
  });
  const root=page.locator('.paper-character-sheet');
  const paragraphs=await root.locator('[data-paper-check="text"]').allTextContents();
  const rows=await root.locator('[data-paper-check="row"]').evaluateAll(elements=>elements.map(element=>Array.from(element.querySelectorAll('th,td')).map(cell=>cell.textContent??'')));
  const sections=await root.locator('[data-print-section]').evaluateAll(elements=>elements.map(element=>({key:element.getAttribute('data-print-section'),title:element.querySelector('.paper-sheet-title span')?.textContent,text:element.textContent})));
  const manifest={...expected,paragraphs,rows,sections,checks:paragraphs,rowIds:[],rowCount:rows.length};
  await writeFile(path.join(output,`${label}-checks.json`),JSON.stringify(manifest,null,2));
  await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(output,`${label}.pdf`),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  await page.emulateMedia({media:'screen'});
}

export async function reviewSavedPaperCharacter(pool:pg.Pool,login:(email:string)=>Promise<Page>,baseUrl:string,review:Awaited<ReturnType<typeof seedPaperReview>>) {
  const {snapshot:s,email}=review;
  const characterSnapshot=async()=> (await pool.query("select jsonb_build_object('character',to_jsonb(c),'profile',to_jsonb(p)) value from campaign_character c join campaign_character_profile p on p.character_id=c.id where c.id=$1",[s.characterId])).rows[0].value;
  const before=await characterSnapshot();
  const page=await login(email);
  await page.addInitScript("window.print = function () { document.documentElement.dataset.paperPrintCalls = String(Number(document.documentElement.dataset.paperPrintCalls || 0) + 1); };");
  await page.goto(`${baseUrl}/realms/characters/${s.characterId}`);
  await page.getByText('Print options',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/^Tabletop Quick Reference/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/^Paper Character Sheet/}).click();
  await page.getByText(/^Ready:/).waitFor();
  assert.equal(await page.locator('.paper-reference-start').count(),0);
  const root=page.locator('.paper-character-sheet');
  const inventory=await root.locator('.paper-inventory tbody tr').allTextContents();
  assert.equal(inventory.length,s.paper.inventory.length);
  assert.equal(inventory.length,9);
  for(const item of s.paper.inventory) assert.ok(inventory.some(row=>row.includes(item.name)&&row.includes(item.state)&&(!item.status||row.includes(item.status))));
  assert.equal(await root.locator('.paper-skills tbody tr').count(),s.paper.skills.length);
  const grasp=await root.locator('.paper-spell').filter({has: page.getByRole('heading',{name:'Charged Grasp',exact:true,includeHidden:true})}).locator('[data-playable-mana], [data-playable-initiative]').allTextContents();
  assert.deepEqual(grasp,['4','2'],'Current Novice casting cost and Initiative must match the authoritative preview');
  await page.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.paperPrintCalls==='1');
  await capturePaperPdf(page,'adrian-core',{name:s.name,campaign:s.paper.campaign});
  await page.getByLabel('Spell Book — Spellcraft',{exact:true}).check();
  await page.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.paperPrintCalls==='2');
  assert.equal(await root.locator('.paper-spell').count(),s.paper.spells.length*2);
  await capturePaperPdf(page,'adrian-with-references',{name:s.name,campaign:s.paper.campaign});
  assert.deepEqual(await characterSnapshot(),before);
  console.log('PASS: Adrian actual selected saved record, 15 skill rows, 9 inventory rows, 6 spells, core-only and optional-reference exports; 4 mana / 2 Initiative Charged Grasp');
}
