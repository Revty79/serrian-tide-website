import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { db, pool } from "@/db";

assert.equal(process.env.SERRIAN_OWNERSHIP_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const artifacts = path.resolve("artifacts/guidance/creature-commerce");
import { startOrAddShopVisitInTransaction } from "@/features/tabletop-operations/shop-visit-service";
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  await mkdir(artifacts, { recursive: true });
  const tsconfig = await readFile("tsconfig.json"), nextEnv = await readFile("next-env.d.ts");
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object");
  const port = address.port; await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`, userId = "ownership-god", password = "Ownership-Browser-Only!";
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, serverLog = "";
  const errors: string[] = [];
  try {
    for (const id of [userId, "ownership-player"]) {
      await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1', [id]);
      await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`, id, await hashPassword(password)]);
    }
    const campaign = (await pool.query("select id from campaign where name='Ownership Campaign' and created_by_user_id=$1",[userId])).rows[0].id;
    const ownerA = (await pool.query("select id from campaign_character where campaign_id=$1 and name='Owner A'", [campaign])).rows[0].id;
    const ownerB = (await pool.query("select id from campaign_character where campaign_id=$1 and name='Owner B'", [campaign])).rows[0].id;
    const source = (await pool.query("select id from creatures where canonical_name='Ownership Horse'")).rows[0].id;
    await pool.query("update campaign_character set archived_at=null,archived_by_user_id=null,archive_reason='' where id in ($1,$2)",[ownerA,ownerB]);
    await pool.query("update campaign_character_profile set credits_remaining=1000 where character_id in ($1,$2)",[ownerA,ownerB]);
    const item = (await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis,created_by_user_id) values('BROWSER-CREATURE','Browser Horse listing','inventory','misc','Animals','Animals',10,'Each',$1) returning id",[userId])).rows[0].id;
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id) values($1,$2)",[campaign,item]);
    const gear=(await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit) values('BROWSER-HARNESS','Browser harness','equipment','general','misc','Companion','Gear',3,'Each',12,'lb') returning id")).rows[0].id;
    await pool.query("insert into item_power_resources(item_id,maximum_charges) values($1,10)",[gear]);
    const harness=(await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,7,3) returning id",[ownerA,gear])).rows[0].id;
    const potion=(await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit) values('BROWSER-REMEDY','Browser healing potion','equipment','general','misc','Remedies','Remedies',3,'Each',1,'lb') returning id")).rows[0].id;
    await pool.query("insert into item_runtime_profiles(item_id,use_mode,quantity_per_use) values($1,'consume-item',1)",[potion]);
    await pool.query("insert into item_effects(item_id,schema_version,effect_json,sort_order) values($1,2,$2,0)",[potion,{kind:'health.heal',amount:3,scope:'full-body'}]);
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,3,3)",[ownerA,potion]);
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,10),($1,$3,11)",[campaign,gear,potion]);
    const shop = (await pool.query("insert into shop(campaign_id,name,category,storefront_state,balance_credits,character_purchase_mode,sold_item_handling) values($1,'Browser Stable','Animals','open',1000,'immediate','add-to-shop-stock') returning id",[campaign])).rows[0].id;
    await pool.query("insert into shop_offering(shop_id,campaign_id,item_id,enabled,fulfillment_kind,unlimited_stock,limited_quantity) values($1,$2,$3,true,'inventory-transfer',false,2)",[shop,campaign,item]);
    const sessionId = (await pool.query("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Browser Creature Commerce',1,'active',now()) returning id",[campaign])).rows[0].id;
    const sceneId = (await pool.query("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Market',1,'active',now()) returning id",[sessionId,campaign])).rows[0].id;
    for (const id of [ownerA,ownerB]) {
      await pool.query("insert into campaign_session_roster(session_id,campaign_id,character_id) values($1,$2,$3)",[sessionId,campaign,id]);
      await pool.query("insert into campaign_session_scene_member(scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4)",[sceneId,sessionId,campaign,id]);
    }
    await pool.query("insert into campaign_session_prepared_shop(session_id,campaign_id,shop_id) values($1,$2,$3)",[sessionId,campaign,shop]);
    await pool.query("insert into campaign_session_scene_shop(scene_id,session_id,campaign_id,shop_id,revealed) values($1,$2,$3,$4,true)",[sceneId,sessionId,campaign,shop]);
    await db.transaction(tx=>startOrAddShopVisitInTransaction(tx,{sceneId,shopId:shop,placement:{kind:"independent"},characterIds:[ownerA,ownerB],mode:"shopping",closedShopOverrideReason:""},{userId,roles:["god"]}));
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-creature-ownership-browser" }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before startup."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next startup");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(40_000); page.setDefaultNavigationTimeout(180_000);
    page.on("pageerror", (error) => errors.push(error.message));
    const auth = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${userId}@example.invalid`, password } }); assert.equal(auth.status(), 200);
    await page.goto(`${base}/heavens/inventory`);
    await page.locator("#item-search").fill("Browser Horse listing");
    await page.locator(".skill-library__row").filter({hasText:"Browser Horse listing"}).click();
    await page.getByLabel("Grants Creature on Purchase",{exact:true}).check();
    await page.getByLabel("Find granted Creature",{exact:true}).fill("Ownership Horse");
    await page.getByLabel("Granted Creature definition",{exact:true}).selectOption(String(source));
    await page.getByRole("button",{name:"Save Item",exact:true}).click();
    await until(async()=>!!(await pool.query("select item_id from item_creature_grant where item_id=$1",[item])).rows.length,"grant saved");
    await page.screenshot({path:path.join(artifacts,"grant-desktop.png"),fullPage:true});
    const playerContext=await browser.newContext({viewport:{width:1365,height:1000}});
    const login=await playerContext.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:"ownership-player@example.invalid",password}});assert.equal(login.status(),200);
    const player=await playerContext.newPage();player.setDefaultTimeout(40_000);player.setDefaultNavigationTimeout(180_000);player.on("pageerror",error=>errors.push(error.message));
    await player.goto(`${base}/realms/tabletop?character=${ownerA}`);
    await player.getByRole("button",{name:"Buy",exact:true}).click();
    const buy=player.getByRole("dialog").filter({hasText:"Buy from Browser Stable"});
    await buy.getByLabel(/Browser Horse listing/).fill("2");
    await buy.getByRole("button",{name:"Complete Purchase",exact:true}).click();
    await player.getByText(/Purchase completed. Receipt/).waitFor();
    const bought=(await pool.query("select c.creature_character_id id from shop_transaction_creature c join shop_transaction_line l on l.id=c.transaction_line_id join shop_transaction t on t.id=l.transaction_id where t.shop_id=$1 and t.kind='purchase' order by c.id",[shop])).rows;
    assert.equal(bought.length,2);assert.notEqual(bought[0].id,bought[1].id);const individual=bought[0].id;
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,11)",[individual]);
    await player.goto(`${base}/realms/characters/${ownerA}`);await player.locator("#character-tab-equipment").click();
    const animals=player.getByRole("region",{name:"Animals & Companions",exact:true});
    const row=animals.locator("li").filter({hasText:`Individual #${individual}`});
    await row.getByRole("button",{name:"View companion",exact:true}).click();
    const detail=player.getByRole("dialog");await detail.getByLabel("Individual name",{exact:true}).fill("Storm");
    assert.equal(await detail.getByLabel("Owning Character",{exact:true}).count(),0);
    assert.equal(await detail.locator('a[href^="/heavens"]').count(),0);
    await detail.getByRole("button",{name:"Save name",exact:true}).click();await row.getByText("Storm",{exact:true}).waitFor();
    await player.setViewportSize({width:390,height:844});await row.getByRole("button",{name:"View companion",exact:true}).click();
    await detail.getByLabel("Move personal equipment to Creature",{exact:true}).selectOption(`copy:${harness}`);
    await detail.getByRole("button",{name:"Move gear to Creature",exact:true}).click();
    await until(async()=>(await pool.query("select character_id from campaign_character_item_instance where id=$1",[harness])).rows[0].character_id===individual,"harness moved to persistent NPC");
    const harnessRow=detail.getByRole("region",{name:"Companion personal equipment"}).locator("li").filter({hasText:"Browser harness"});
    await harnessRow.getByText(/1 worn/).waitFor();
    await player.getByRole("region",{name:"Owned equipment",exact:true}).getByText("Browser harness",{exact:true}).waitFor({state:"hidden"});
    await harnessRow.getByRole("button",{name:"Unequip",exact:true}).click();await harnessRow.getByText(/1 inactive/).waitFor();
    await harnessRow.getByRole("button",{name:"Wear",exact:true}).click();await harnessRow.getByText(/1 worn/).waitFor();
    await harnessRow.getByRole("button",{name:"Unequip and return to Character",exact:true}).click();
    await until(async()=>(await pool.query("select character_id from campaign_character_item_instance where id=$1",[harness])).rows[0].character_id===ownerA,"same harness returned");
    assert.equal((await pool.query("select count(*)::int n from campaign_character_item_instance where item_id=$1",[gear])).rows[0].n,1);
    await detail.getByRole("button",{name:"Close",exact:true}).scrollIntoViewIfNeeded();
    assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const bounds=await detail.boundingBox();assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=391);
    await player.screenshot({path:path.join(artifacts,"companion-phone.png"),fullPage:false});await detail.getByRole("button",{name:"Close",exact:true}).click();
    const ownerHealthBefore=(await pool.query("select total_damage from campaign_character_active_health where character_id=$1",[ownerA])).rows;
    const potionRow=player.getByRole("region",{name:"Owned equipment",exact:true}).locator("article.character-owned-equipment__row").filter({hasText:"Browser healing potion"});
    await potionRow.getByRole("button",{name:"Use",exact:true}).click();
    const useDialog=player.getByRole("dialog");await useDialog.getByLabel("Target",{exact:true}).selectOption(String(individual));
    await useDialog.getByRole("button",{name:"Confirm Use",exact:true}).click();
    await useDialog.getByText("Use completed.",{exact:true}).waitFor();await useDialog.getByRole("button",{name:"Done",exact:true}).click();
    await until(async()=>(await pool.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,potion])).rows[0].quantity===2,"source potion consumed");
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1",[individual])).rows[0].total_damage,8);
    assert.deepEqual((await pool.query("select total_damage from campaign_character_active_health where character_id=$1",[ownerA])).rows,ownerHealthBefore);
    await player.screenshot({path:path.join(artifacts,"healed-companion-phone.png"),fullPage:false});
    await page.goto(`${base}/heavens/characters/${ownerA}`);await page.locator("#character-tab-equipment").click();
    const godRow=page.getByRole("region",{name:"Animals & Companions",exact:true}).locator("li").filter({hasText:`Individual #${individual}`});
    await godRow.getByRole("button",{name:"View companion",exact:true}).click();
    const godDetail=page.getByRole("dialog");await godDetail.getByLabel("Owning Character",{exact:true}).selectOption(String(ownerB));await godDetail.getByRole("button",{name:"Assign owner",exact:true}).click();
    await until(async()=>!await godDetail.isVisible(),"God transfer");assert.equal((await pool.query("select owner_character_id from campaign_character where id=$1",[individual])).rows[0].owner_character_id,ownerB);
    await player.goto(`${base}/realms/tabletop?character=${ownerB}`);await player.getByRole("button",{name:"Sell",exact:true}).click();
    const sale=player.getByRole("dialog").filter({hasText:"Offer owned Items or Creatures"});
    await sale.getByLabel(new RegExp(`Storm.*Individual #${individual}`)).check();await sale.getByRole("button",{name:"Submit Sale Request",exact:true}).click();
    await player.getByText(/Sale request.*awaiting/).waitFor();
    await page.goto(`${base}/heavens/tabletop?campaign=${campaign}&session=${sessionId}&scene=${sceneId}`);
    await page.getByRole("button",{name:/Scenes/}).click();
    await page.locator(".tabletop-shop-visit-list article").filter({hasText:"Browser Stable"}).getByRole("button",{name:"View Visit",exact:true}).click();
    const commerce=page.locator(".tabletop-shop-commerce-card").filter({has:page.getByRole("heading",{name:"Owner B",exact:true})});
    await commerce.getByRole("button",{name:"Approve Current Terms",exact:true}).click();await page.getByText("Sale request reviewed.",{exact:true}).waitFor();
    await player.reload();await player.getByRole("button",{name:"Buy",exact:true}).click();
    const rebuy=player.getByRole("dialog").filter({hasText:"Buy from Browser Stable"});
    await rebuy.getByLabel(new RegExp(`Storm.*#${individual}`)).fill("1");await rebuy.getByRole("button",{name:"Complete Purchase",exact:true}).click();await player.getByText(/Purchase completed. Receipt/).waitFor();
    assert.equal((await pool.query("select owner_character_id from campaign_character where id=$1",[individual])).rows[0].owner_character_id,ownerB);
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1",[individual])).rows[0].total_damage,8);
    assert.equal((await pool.query("select count(*)::int n from shop_transaction_creature where creature_character_id=$1",[individual])).rows[0].n,3);
    await player.goto(`${base}/realms/characters/${ownerB}`);await player.locator("#character-tab-equipment").click();await player.getByRole("region",{name:"Animals & Companions",exact:true}).getByText("Storm",{exact:true}).waitFor();
    await player.screenshot({path:path.join(artifacts,"repurchased-phone.png"),fullPage:true});assert.deepEqual(errors,[]);
    console.log("PASS: authored Creature grant, two individual purchases, Player-safe details/name, exact harness move/equip/return, authored healing on companion, desktop and phone scrolling, God transfer, sale approval and exact injured repurchase, persisted identity, no browser errors.");
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    for (const [index,context] of (browser?.contexts() ?? []).entries()) for (const [pageIndex,tab] of context.pages().entries()) {
      await writeFile(path.join(artifacts,`failure-${index}-${pageIndex}.txt`),await tab.locator("body").innerText().catch(()=>""));
      await tab.screenshot({path:path.join(artifacts,`failure-${index}-${pageIndex}.png`),fullPage:true}).catch(()=>undefined);
    }
    if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => undefined); await writeFile(path.join(artifacts, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 3000); server!.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
    await writeFile(path.join(artifacts, "server.log"), serverLog);
    await pool.end(); await writeFile("tsconfig.json", tsconfig); await writeFile("next-env.d.ts", nextEnv);
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
