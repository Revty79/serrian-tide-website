import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import type { Page, BrowserContext } from "playwright-core";
import type pg from "pg";

export async function evolutionPassFiveBrowser({page, context, pool, base, password, artifacts}: {page: Page; context: BrowserContext; pool: pg.Pool; base: string; password: string; artifacts: string}) {
  assert.equal((await pool.query("select current_database() name")).rows[0].name,"serrian_creature_evolution_dev");
  const query = async (sql: string, values: unknown[] = []) => (await pool.query(sql, values)).rows;
  for (const id of ["returns-god", "returns-player"]) {
    await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1',[id]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${id}-credential`,id,await hashPassword(password)]);
  }
  async function login(id: string) {
    await context.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});
    const response = await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${id}@example.invalid`,password}});
    assert.equal(response.status(),200);
  }
  await login("returns-god");
  await page.addInitScript(() => { window.print = () => {document.documentElement.dataset.paperPrintCalls = String(Number(document.documentElement.dataset.paperPrintCalls ?? 0)+1);}; });
  const panel = page.getByRole("region",{name:"Individual Evolution",exact:true});
  const dialog = page.getByRole("dialog");
  const root = page.locator(".paper-character-sheet");
  const subjects = await query("select id,name,npc_kind,is_npc from campaign_character where name like 'Pass Five %' order by id");
  assert.equal(subjects.length,3);
  const gameplay = async () => {
    const tables = await query("select tablename from pg_tables where schemaname='public' and (tablename like 'campaign_character%' or tablename like 'campaign_creature_npc%' or tablename like 'inventory_%' or tablename like '%evolution_events') order by tablename");
    return Promise.all(tables.map(async ({tablename}) => (await query(`select to_jsonb(t) body from ${tablename} t order by to_jsonb(t)::text`))));
  };
  async function options() {
    const details = page.locator(".character-print-center__options");
    if (!await details.getAttribute("open").then(value=>value!==null)) await details.locator("summary").first().click();
    await page.getByText(/^Ready:/).waitFor();
    return page.getByRole("group",{name:"Form references",exact:true});
  }
  async function capture(label: string) {
    await page.getByLabel("Print theme",{exact:true}).selectOption("Plain");
    await page.getByRole("button",{name:"Print / Save as PDF",exact:true}).click();
    await page.waitForFunction(()=>Number(document.documentElement.dataset.paperPrintCalls)>0);
    await page.evaluate(()=>document.fonts.ready);
    const checks = await root.locator('[data-paper-check="text"]').allTextContents();
    const rows = await root.locator('[data-paper-check="row"]').evaluateAll(elements=>elements.map(element=>Array.from(element.querySelectorAll("th,td")).map(cell=>cell.textContent ?? "")));
    await writeFile(path.join(artifacts,`${label}.json`),JSON.stringify({checks,rows},null,2));
    await page.emulateMedia({media:"print"});
    await page.pdf({path:path.join(artifacts,`${label}.pdf`),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:"screen"});
  }
  for (const subject of subjects) {
    const creature = subject.npc_kind === "creature", route = `${base}/heavens/${creature ? "npcs" : "characters"}/${subject.id}`;
    await page.setViewportSize({width:1365,height:1000}); await page.goto(route);
    const openPanel = async () => { await (creature ? page.getByRole("button",{name:"Evolution",exact:true}) : page.locator("#character-tab-god")).click(); await panel.getByRole("heading",{name:"Available Evolutions",exact:true}).waitFor(); };
    await openPanel();
    assert.ok((await panel.innerText()).includes("No prior Evolution state"));
    const before = await gameplay();
    if (!creature) {
      const choices = await options();
      assert.equal(await root.locator(".paper-form-reference").count(),0,"Quick defaults to normal only");
      assert.equal(await choices.locator('input[type="checkbox"]').count(),4);
      assert.match(await choices.innerText(),/Young Locked Form/); assert.match(await choices.innerText(),/Needs G.O.D. Review/);
      const normal = await root.locator('[data-print-section="front"]').textContent();
      if (!subject.is_npc) {
        await page.getByLabel("View Form",{exact:true}).selectOption({label:"Young Available Form — Available"});
        assert.equal(await root.locator('[data-print-section="front"]').textContent(),normal);
      }
      await choices.getByLabel(/Young Locked Form/).check(); assert.equal(await root.locator(".paper-form-reference").count(),1);
      assert.match(await root.locator(".paper-form-reference").textContent() ?? "",/Access: Locked/);
      await choices.getByLabel(/Include all authored Forms/).check(); assert.equal(await root.locator(".paper-form-reference").count(),3);
      assert.equal(await root.locator('[data-print-section="front"]').textContent(),normal);
      await capture(subject.is_npc ? "race-npc-form-packet" : "character-form-packet");
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator(".character-print-center").evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
      await page.locator(".paper-form-selection").scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(artifacts,`form-options-${subject.id}-390.png`)});
      assert.deepEqual(await gameplay(),before,"View Form, selection and PDF print are read-only");
    }
    for (const returning of [false,true]) {
      await page.setViewportSize({width:returning?390:1365,height:returning?844:1000});
      await openPanel();
      await panel.getByRole("button",{name:returning ? /^Review Return/ : /^Review Evolution/}).first().click();
      await dialog.getByRole("heading",{name:returning ? "After Return" : "After Evolution",exact:true}).waitFor();
      assert.equal(await dialog.getByLabel("Find Character",{exact:true}).count(),0); assert.equal(await dialog.getByLabel("Find individual Creature",{exact:true}).count(),0);
      await dialog.getByLabel(/I have reviewed the permanent mechanical/).check();
      const override = dialog.getByLabel(/I confirm replacing/); if(await override.count()) await override.check();
      const submit = dialog.getByRole("button",{name:returning ? /^Return Pass Five/ : /^Evolve Pass Five/});
      await submit.scrollIntoViewIfNeeded();
      const bounds=await dialog.boundingBox(); assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=(await page.viewportSize())!.width+1&&bounds.y>=0&&bounds.y+bounds.height<=(await page.viewportSize())!.height+1);
      assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
      await page.screenshot({path:path.join(artifacts,`${subject.id}-${returning?'return':'evolution'}.png`)});
      if (!creature && !subject.is_npc && returning) {
        let dropped=false;
        await page.route(route,async intercepted=>{
          if (!dropped&&intercepted.request().method()==="POST"&&intercepted.request().postData()?.includes('"expectedEventId"')) { dropped=true; await intercepted.fetch(); await intercepted.abort("connectionfailed"); } else await intercepted.continue();
        });
        await submit.click(); await dialog.getByRole("alert").waitFor(); await dialog.getByRole("button",{name:"Retry confirmed transition",exact:true}).waitFor();
        await page.unroute(route); assert.equal(dropped,true);
        await page.reload(); await openPanel(); await panel.getByRole("button",{name:"Resume pending transition",exact:true}).click();
        await dialog.getByRole("button",{name:"Retry confirmed transition",exact:true}).click();
      } else await submit.click();
      await dialog.waitFor({state:"hidden"});
      await panel.getByRole("button",{name:returning ? /^Review Evolution/ : /^Review Return/}).first().waitFor();
      assert.equal((await query(`select count(*)::int n from ${creature?'creature':'race'}_evolution_events where character_id=$1`,[subject.id]))[0].n,returning?2:1);
      if(creature) {
        const names=await page.getByLabel("View Form",{exact:true}).innerText();
        assert.ok(names.includes(returning ? "Winged Form" : "Adult Form"));
        assert.ok(!names.includes(returning ? "Adult Form" : "Winged Form"));
      }
      if(!creature) {
        const choices=await options(); assert.match(await choices.innerText(),returning ? /Young Available Form/ : /Ascended Available Form/);
        assert.ok(!(await choices.innerText()).includes(returning ? "Ascended Available Form" : "Young Available Form"));
        assert.equal(await root.locator(".paper-form-reference").count(),0,"Race change clears former selections");
        if(!subject.is_npc) assert.ok((await page.getByLabel("View Form",{exact:true}).innerText()).includes(returning?"Young Available Form":"Ascended Available Form"));
      }
    }
  }
  await login("returns-player");
  const pc=subjects.find(subject=>!subject.is_npc)!;
  await page.goto(`${base}/realms/characters/${pc.id}`);
  assert.equal(await panel.count(),0); assert.equal(await page.locator("#character-tab-god").count(),0);
  assert.equal(await page.getByRole("button",{name:/Review Return|Review Evolution|Resume pending transition/}).count(),0);
  const choices = await options(); assert.match(await choices.innerText(),/Young Available Form/);
  await choices.getByLabel(/Young Locked Form/).check(); await capture("player-locked-form");
  console.log("PASS: Pass 5 real PC/Race NPC/Creature NPC Evolution and Return, same identity, immediate Race/Form/print refresh, private controls, read-only prints, desktop/390px dialogs and Form selection, interrupted Return replay across reload, three PDFs.");
}
