import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium, type Page } from "playwright-core";

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("Shared character sheet: real actions, owner controls, player totals, printing and responsive tabs", { timeout: 600_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-character-sheet-")));
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith("serrian-character-sheet-"));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const databasePort = await freePort();
  const appPort = await freePort();
  const baseUrl = `http://localhost:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_character_sheet_dev`;
  const distName = `.next-character-sheet-${appPort}`;
  const distPath = path.resolve(distName);
  assert.equal(path.dirname(distPath), process.cwd());
  const tsconfigPath = path.resolve("tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let started = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_character_sheet_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const password = "Character-Sheet-Test-Only!";
    for (const [id, roles] of [["sheet-owner", ["god", "player"]], ["sheet-player", ["player"]], ["sheet-foreign", ["god", "player"]], ["sheet-admin", ["admin"]]] as const) {
      await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [id, `${id}@example.invalid`]);
      await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`, id, await hashPassword(password)]);
      for (const role of roles) await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
    }
    const campaignId = (await pool.query("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id) values('The Ember Coast',180,11,100,10,100,100,'Credits','Assigned',3,'sheet-owner') returning id")).rows[0].id;
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'sheet-player'),($1,'sheet-owner')", [campaignId]);
    await pool.query("insert into campaign_allowed_system(campaign_id,system) values($1,'Spellcraft'),($1,'Tier 1')", [campaignId]);
    const raceId = (await pool.query("insert into races(name,size,base_magic) values('Coastborn','Medium',3) returning id")).rows[0].id;
    for (const table of ["campaign_race", "campaign_allowed_race"]) await pool.query(`insert into ${table}(campaign_id,race_id) values($1,$2)`, [campaignId,raceId]);
    const skills = (await pool.query("insert into skill(name,classification,tier,primary_attribute) values('Spellcraft','standard',1,'INT'),('Channeling','standard',1,'WIS') returning id")).rows;
    const itemId = (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits) values('SHEET-COMPASS','Brass Compass','equipment','general','Item','Travel','Travel','unit',0) returning id")).rows[0].id;
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id) values($1,$2)",[campaignId,itemId]);
    const extraItems = [] as number[];
    for (const [canonical,name,scope,group,recordType] of [["BATON","Practice Baton","equipment","weapon","Weapon"],["ARMOR","Leather Armor","equipment","armor","Armor"],["POTION","Healing Potion","inventory",null,"Item"],["SUPPLY","Trail Rations","inventory",null,"Item"],["WAND","Restorative Wand","equipment","general","Item"]]) {
      const extraId = (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits,description) values($1,$2,$3,$4,$5,'Travel','Travel','unit',0,'Disposable browser fixture') returning id",[`SHEET-${canonical}`,name,scope,group,recordType])).rows[0].id;
      extraItems.push(extraId);
      await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)",[campaignId,extraId,extraItems.length]);
    }
    const [batonId,armorId,potionId,supplyId,wandId] = extraItems;
    await pool.query("insert into weapon_profiles(item_id,profile_record_type,weapon_type,damage,initiative_cost,damage_type) values($1,'Weapon','Baton','4',4,'Blunt')",[batonId]);
    await pool.query("insert into item_runtime_profiles(item_id,use_mode,quantity_per_use,activation_label) values($1,'consume-item',1,'Drink')",[potionId]);
    await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use,activation_label) values($1,'charges',5,1,'Use')",[wandId]);
    for (const id of [potionId,wandId]) await pool.query("insert into item_effects(item_id,schema_version,effect_json,sort_order) values($1,2,$2,0)",[id,JSON.stringify({kind:"health.heal",amount:3,scope:"full-body"})]);
    const characters: number[] = [];
    for (const [name, player, completed] of [["Aerin Tidewalker","sheet-player",true],["Rowan Draft","sheet-player",false],["Owner Adventurer","sheet-owner",true],["Zora Navigator","sheet-player",true]] as const) {
      const id = (await pool.query("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,$3) returning id", [campaignId,player,name])).rows[0].id;
      characters.push(id);
      for (const extraId of [batonId,armorId,potionId,supplyId]) await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,$3,0)",[id,extraId,extraId===armorId ? 3 : extraId===potionId ? 2 : 1]);
      if (completed) for (const [charges,state] of [[2,"inactive"],[4,"equipped"]]) await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits,equipment_state) values($1,$2,$3,0,$4)",[id,wandId,charges,state]);
      await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,0)",[id,itemId]);
      await pool.query("insert into campaign_character_profile(character_id,race_id,age,sex,height_feet,height_inches,weight,skin_color,eye_color,hair_color,deity,defining_marks,personality,goals,secrets,backstory,motivations,fate_points,fame,experience,total_experience,quintessence,total_quintessence,credits_remaining,creation_completed_at) values($1,$2,28,'Female',5,9,145,'Tan','Green','Brown','None','Compass tattoo','Curious','Chart the coast','A hidden map','Raised by sailors','Find home',3,7,123,456,12,34,100,$3)", [id,raceId,completed ? new Date():null]);
      for (const key of ['STR','DEX','CON','INT','WIS','CHR']) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,30)",[id,key]);
      await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,1),($1,$3,10)",[id,skills[0].id,skills[1].id]);
      await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,5)",[id]);
      await pool.query("insert into campaign_character_active_mana(character_id,system,mana_spent) values($1,'Spellcraft',4)",[id]);
    }
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseUrl, SERRIAN_TEST_NEXT_DIST_DIR: distName, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_SHEET_FIXTURES: JSON.stringify(characters) };
    delete environment.NODE_TEST_CONTEXT;
    let actionOutput: string;
    try { actionOutput = execFileSync(process.execPath, ["--experimental-test-module-mocks","--conditions=react-server","--import","tsx","--test","--test-reporter=tap","scripts/character-sheet-actions-db.test.mjs"], {env: environment,windowsHide:true,encoding:"utf8",timeout:120_000}); } catch (error) { const failure = error as { stdout?: string; stderr?: string }; process.stdout.write(failure.stdout ?? ""); process.stderr.write(failure.stderr ?? ""); throw error; }
    process.stdout.write(actionOutput);
    assert.match(actionOutput, /# fail 0\b/);
    if (process.env.SERRIAN_SHEET_ACTIONS_ONLY === "true") return;
    const localPaperReview = process.env.SERRIAN_PAPER_LOCAL_SNAPSHOT
      ? await (await import("./character-paper-review")).seedPaperReview(pool,process.env.SERRIAN_PAPER_LOCAL_SNAPSHOT,password) : null;
    if (!localPaperReview) {
    await pool.query("update campaign_character_profile set fame=7,experience=123,total_experience=456,quintessence=12,total_quintessence=34");
    // Reset only disposable fixtures after action tests for reproducible screenshots.
    await pool.query("update campaign_character_active_health set total_damage=5");
    await pool.query("update campaign_character_active_mana set mana_spent=4");
    await pool.query("update campaign_character_profile set creation_completed_at=null where character_id=$1", [characters[1]]);
    }
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], { env: environment, stdio: "inherit", windowsHide: true });
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, "The test app must stay running");
      try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, "The test app must become ready");
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const artifacts = path.resolve("artifacts/character-sheet-pass-one");
    await mkdir(artifacts, {recursive:true});
    const errors: string[] = [];
    async function login(id: string) {
      const context = await browser!.newContext({viewport:{width:1440,height:1000}});
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${baseUrl}/login`);
      await page.getByLabel("Username or Email").fill(id.includes('@') ? id : `${id}@example.invalid`);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button",{name:/^Enter$/}).click();
      await page.waitForURL(url => !url.pathname.startsWith("/login"));
      return page;
    }
    if (localPaperReview) {
      const {reviewSavedPaperCharacter}=await import("./character-paper-review");
      await reviewSavedPaperCharacter(pool,login,baseUrl,localPaperReview);
      assert.deepEqual(errors,[]);
      return;
    }
    if (process.env.SERRIAN_PAPER_ONLY === "true") {
      const { rehearsePaperCharacterSheets } = await import("./character-paper-browser");
      await rehearsePaperCharacterSheets(pool, login, baseUrl);
      assert.deepEqual(errors, []);
      return;
    }
    const tabs = ["Identity","Attributes","Skills & Abilities","Story & Personality","Equipment"];
    async function checkTabs(page: Page, owner: boolean) {
      assert.deepEqual(await page.getByRole("tab").allTextContents(), owner ? [...tabs,"G.O.D."] : tabs);
      assert.equal(await page.getByRole("tablist").count(),1);
      assert.equal(await page.getByRole("button",{name:"Print / Save as PDF",exact:true}).isVisible(),true);
    }
    const player = await login("sheet-player");
    // Rehearse the actual header links, including a non-first completed Character.
    const characterTables = (await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_')) order by table_name")).rows;
    async function characterSnapshot() {
      const rows = [];
      for (const { table_name: table } of characterTables) {
        assert.match(table, /^campaign_character(?:_[a-z_]+)?$/);
        const result = await pool!.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb) as snapshot from "${table}" r`);
        rows.push({ table, rows: result.rows[0].snapshot });
      }
      return rows;
    }
    const beforeNavigation = await characterSnapshot();
    const headerLink = (destination: "tabletop" | "back" | "logo") => destination === "logo"
      ? player.locator(".character-header .character-logo")
      : player.locator(".character-header__actions").getByRole("link", { name: destination === "tabletop" ? "Player Tabletop" : "← Back", exact: true });
    async function assertTabletop(characterId: number, name: string) {
      await player.waitForURL(url => url.pathname === "/realms/tabletop" && url.searchParams.get("character") === String(characterId));
      await player.getByText("PLAYER TABLETOP CONSOLE", { exact: true }).waitFor();
      await player.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
      assert.equal(await player.getByLabel("Campaign Character", { exact: true }).inputValue(), String(characterId));
      assert.deepEqual(await player.locator("#tabletop-character option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), [characters[0], characters[1], characters[3]].map(String));
      assert.equal(await player.getByRole("heading", { name: /not found|404/i }).count(), 0);
    }
    async function assertRealms() {
      await player.waitForURL(url => url.pathname === "/realms" && !url.search);
      await player.getByRole("heading", { name: "The Realms", exact: true, level: 1 }).waitFor();
    }
    await player.goto(`${baseUrl}/realms/tabletop?character=${characters[0]}`);
    await assertTabletop(characters[0], "Aerin Tidewalker");
    await player.goto(`${baseUrl}/realms/characters/${characters[3]}`);
    assert.equal(await player.getByLabel(/Character Name/).isDisabled(), true);
    await headerLink("tabletop").click();
    await assertTabletop(characters[3], "Zora Navigator");
    assert.equal(await player.getByRole("alertdialog", { name: "Unsaved changes" }).count(), 0);
    for (const destination of ["back", "logo"] as const) {
      await player.goto(`${baseUrl}/realms/characters/${characters[3]}`);
      await headerLink(destination).click();
      await assertRealms();
    }
    const editableUrl = `${baseUrl}/realms/characters/${characters[1]}`;
    for (const destination of ["tabletop", "back", "logo"] as const) {
      await player.goto(editableUrl);
      const draftName = `Unsaved ${destination}`;
      await player.getByLabel(/Character Name/).fill(draftName);
      // Cancel both this exit and a different one: discard must use the latest click.
      for (const cancelledDestination of [destination, destination === "tabletop" ? "back" : "tabletop"] as const) {
        await headerLink(cancelledDestination).scrollIntoViewIfNeeded();
        const scrollBefore = await player.evaluate(() => window.scrollY);
        await headerLink(cancelledDestination).click();
        const dialog = player.getByRole("alertdialog", { name: "Unsaved changes", exact: true });
        await dialog.waitFor();
        assert.equal(player.url(), editableUrl);
        await dialog.getByRole("button", { name: "Keep Editing", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(player.url(), editableUrl);
        assert.equal(await player.getByLabel(/Character Name/).inputValue(), draftName);
        await player.waitForFunction(scroll => Math.abs(window.scrollY - scroll) < 2, scrollBefore);
      }
      await headerLink(destination).click();
      await player.getByRole("alertdialog", { name: "Unsaved changes", exact: true }).getByRole("link", { name: "Discard Changes", exact: true }).click();
      if (destination === "tabletop") await assertTabletop(characters[1], "Rowan Draft");
      else await assertRealms();
      assert.deepEqual(await characterSnapshot(), beforeNavigation, "Navigation must not save, complete creation, or mutate Character/runtime data");
    }
    await player.goto(editableUrl);
    assert.equal(await player.getByLabel(/Character Name/).inputValue(), "Rowan Draft");
    assert.equal(await player.getByLabel(/Character Name/).isDisabled(), false);
    console.log("PASS: actual Player Tabletop header reaches the exact non-first Character; clean/dirty Back and logo; cancel/discard destinations; draft/scroll and persisted runtime state preserved");
    await player.goto(`${baseUrl}/realms/characters/${characters[0]}`);
    await checkTabs(player,false);
    const tracking = player.getByRole("region",{name:"Character tracking totals"});
    assert.match(await tracking.innerText(), /Total Experience[\s\S]*456[\s\S]*Total Quintessence[\s\S]*34/);
    assert.equal(await tracking.locator("input").count(),0);
    assert.equal(await player.getByLabel(/Character Name/).isDisabled(),true);
    for (const tab of tabs) {
      await player.getByRole("tab",{name:tab,exact:true}).click();
      assert.equal(await player.getByRole("button",{name:/Manage Health|Manage Mana|Restore All/}).count(),0);
    }
    await player.getByRole("tab",{name:"Equipment",exact:true}).click();
    const ownedList = player.getByRole("region",{name:"Owned equipment",exact:true});
    assert.equal(await player.locator(".equipment-state-panel").count(),0,"No duplicate runtime dashboard");
    const rations = ownedList.locator("article.character-owned-equipment__row").filter({hasText:"Trail Rations"});
    assert.equal(await rations.locator("select,button").count(),0,"Ordinary supplies have no nonfunctional actions");
    for (const [name,role] of [["Brass Compass","equipped"],["Practice Baton","wielded"]]) {
      const control = player.getByLabel(`Equipment state for ${name}`,{exact:true});
      await control.selectOption(role);
      await player.waitForFunction(({name,role}) => (document.querySelector(`select[aria-label="Equipment state for ${name}"]`) as HTMLSelectElement)?.value===role,{name,role});
      await control.selectOption("inactive");
      await player.waitForFunction(name => (document.querySelector(`select[aria-label="Equipment state for ${name}"]`) as HTMLSelectElement)?.value==="inactive",name);
    }
    await player.getByLabel("Equipment state for Leather Armor",{exact:true}).selectOption("worn");
    await player.getByLabel("Active quantity for Leather Armor",{exact:true}).fill("2");
    await player.getByRole("button",{name:"Apply equipment state for Leather Armor",exact:true}).click();
    await ownedList.getByText("1 inactive \u00b7 2 worn",{exact:true}).waitFor();
    const potionRow = ownedList.locator("article.character-owned-equipment__row").filter({hasText:"Healing Potion"});
    await potionRow.getByRole("button",{name:"Drink",exact:true}).click();
    await player.getByRole("button",{name:"Confirm Drink",exact:true}).click();
    await player.getByRole("button",{name:"Close Item use",exact:true}).click();
    await potionRow.getByText("1 owned",{exact:true}).waitFor();
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1",[characters[0]])).rows[0].total_damage,2);
    await player.reload();
    await player.getByRole("tab",{name:"Equipment",exact:true}).click();
    await ownedList.getByText("1 inactive \u00b7 2 worn",{exact:true}).waitFor();
    await potionRow.getByText("1 owned",{exact:true}).waitFor();
    const wands = ownedList.locator("article.character-owned-equipment__row").filter({hasText:"Restorative Wand"});
    assert.equal(await wands.count(),2);
    assert.match(await wands.nth(0).innerText(),/2.*5/);
    assert.match(await wands.nth(1).innerText(),/4.*5/);
    await player.evaluate(() => window.scrollTo(0,0));
    await player.screenshot({path:path.join(artifacts,"player-equipment-desktop.png"),fullPage:true});
    await player.setViewportSize({width:390,height:844});
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth<=innerWidth),true);
    await player.screenshot({path:path.join(artifacts,"player-equipment-mobile.png"),fullPage:true});
    await player.setViewportSize({width:1440,height:1000});
    await player.getByRole("tab",{name:"Story & Personality"}).click();
    assert.equal(await player.getByLabel(/Secrets/).inputValue(),"A hidden map");
    await player.getByRole("tab",{name:"Attributes",exact:true}).click();
    await player.evaluate(() => window.scrollTo(0,0));
    await player.screenshot({path:path.join(artifacts,"player-attributes-desktop.png"),fullPage:true});
    await player.getByRole("tab",{name:"Identity",exact:true}).click();
    await player.getByRole("tab",{name:"Identity",exact:true}).press("ArrowRight");
    assert.equal(await player.getByRole("tab",{name:"Attributes",exact:true}).getAttribute("aria-selected"),"true");
    await player.setViewportSize({width:390,height:844});
    for (const tab of tabs) {
      await player.getByRole("tab",{name:tab,exact:true}).click();
      const overflowing = await player.evaluate(() => [...document.querySelectorAll("main *")].filter(el => {const r=el.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+1 && !el.closest(".character-sheet__table-scroll");}).map(el => ({tag:el.tagName,classes:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,20));
      if (await player.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {console.log(JSON.stringify(overflowing)); await player.screenshot({path:path.join(artifacts,"mobile-overflow.png"),fullPage:true});}
      assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`Mobile ${tab} fits`);
    }
    await player.getByRole("tab",{name:"Identity",exact:true}).click();
    await player.evaluate(() => window.scrollTo(0,0));
    await player.screenshot({path:path.join(artifacts,"player-identity-mobile.png"),fullPage:true});
    const owner = await login("sheet-owner");
    await owner.goto(`${baseUrl}/heavens/characters/${characters[0]}`);
    await checkTabs(owner,true);
    await owner.getByRole("tab",{name:"Equipment",exact:true}).click();
    assert.equal(await owner.getByRole("heading",{name:"Starting Equipment Store",exact:true}).count(),0);
    assert.match(await owner.getByRole("tabpanel").innerText(),/Brass Compass/);
    assert.equal(await player.getByRole("button",{name:"Add Item",exact:true}).count(),0);
    const ownerList=owner.getByRole("region",{name:"Owned equipment",exact:true});
    const addItem=async(name:string,quantity:number)=>{
      await owner.getByRole("button",{name:"Add Item",exact:true}).click();
      const modal=owner.getByRole("dialog",{name:"Add Item",exact:true});
      await modal.getByLabel("Search campaign items").fill(name);
      await modal.getByRole("radio",{name:new RegExp(name)}).check();
      await modal.getByLabel("Quantity to add").fill(String(quantity));
      await modal.getByRole("button",{name:"Confirm Addition",exact:true}).click();
      await modal.waitFor({state:"hidden"});
    };
    await addItem("Healing Potion",2);
    const ownerPotion=ownerList.locator("article.character-owned-equipment__row").filter({hasText:"Healing Potion"});
    await ownerPotion.getByText("3 owned",{exact:true}).waitFor();
    await ownerPotion.getByRole("button",{name:"Remove",exact:true}).click();
    let removeDialog=owner.getByRole("dialog",{name:"Remove Healing Potion",exact:true});
    await removeDialog.getByLabel("Quantity to remove").fill("1");
    await removeDialog.getByRole("button",{name:"Confirm Removal",exact:true}).click();
    await removeDialog.waitFor({state:"hidden"});
    await ownerPotion.getByText("2 owned",{exact:true}).waitFor();
    await addItem("Restorative Wand",2);
    let ownerWands=ownerList.locator("article.character-owned-equipment__row").filter({hasText:"Restorative Wand"});
    assert.equal(await ownerWands.count(),4);
    assert.match(await ownerWands.nth(3).innerText(),/5.*5 Charges/);
    await ownerWands.nth(3).getByRole("combobox").selectOption("equipped");
    await ownerWands.nth(3).getByRole("button",{name:"Remove",exact:true}).waitFor({state:"visible"});
    await ownerWands.nth(3).getByRole("button",{name:"Remove",exact:true}).click();
    removeDialog=owner.getByRole("dialog",{name:"Remove Restorative Wand",exact:true});
    assert.match(await removeDialog.innerText(),/Exact copy #[0-9]+.*5.*5 Charges/);
    await removeDialog.getByRole("button",{name:"Confirm Removal",exact:true}).click();
    await removeDialog.waitFor({state:"hidden"});
    const ownerArmor=ownerList.locator("article.character-owned-equipment__row").filter({hasText:"Leather Armor"});
    await ownerArmor.getByRole("button",{name:"Remove",exact:true}).click();
    removeDialog=owner.getByRole("dialog",{name:"Remove Leather Armor",exact:true});
    await removeDialog.getByLabel("Remove from state").selectOption("worn");
    await removeDialog.getByRole("button",{name:"Confirm Removal",exact:true}).click();
    await removeDialog.waitFor({state:"hidden"});
    await ownerArmor.getByText("1 inactive \u00b7 1 worn",{exact:true}).waitFor();
    await owner.reload();
    await owner.getByRole("tab",{name:"Equipment",exact:true}).click();
    await ownerArmor.getByText("2 owned",{exact:true}).waitFor();
    await ownerPotion.getByText("2 owned",{exact:true}).waitFor();
    ownerWands=ownerList.locator("article.character-owned-equipment__row").filter({hasText:"Restorative Wand"});
    assert.equal(await ownerWands.count(),3);
    assert.match(await ownerWands.nth(0).innerText(),/2.*5 Charges/);
    assert.match(await ownerWands.nth(1).innerText(),/4.*5 Charges/);
    assert.equal((await pool.query("select credits_remaining from campaign_character_profile where character_id=$1",[characters[0]])).rows[0].credits_remaining,100);
    await owner.evaluate(()=>window.scrollTo(0,0));
    await owner.screenshot({path:path.join(artifacts,"owner-inventory-desktop.png"),fullPage:true});
    await owner.setViewportSize({width:390,height:844});
    await owner.evaluate(()=>window.scrollTo(0,0));
    await owner.getByRole("button",{name:"Add Item",exact:true}).click();
    const addDialog=owner.getByRole("dialog",{name:"Add Item",exact:true});
    await addDialog.getByLabel("Search campaign items").fill("Healing");
    await addDialog.getByRole("radio",{name:/Healing Potion/}).check();
    assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await owner.screenshot({path:path.join(artifacts,"owner-add-item-mobile.png"),fullPage:true});
    await addDialog.getByRole("button",{name:"Cancel",exact:true}).click();
    await owner.evaluate(()=>window.scrollTo(0,0));
    await owner.screenshot({path:path.join(artifacts,"owner-inventory-mobile.png"),fullPage:true});
    await owner.setViewportSize({width:1440,height:1000});

    await owner.getByRole("tab",{name:"G.O.D.",exact:true}).click();
    await owner.getByRole("button",{name:"Manage Health",exact:true}).click();
    await owner.getByRole("button",{name:/^Restore All Health/}).click();
    await owner.getByRole("button",{name:"Yes, Restore All",exact:true}).click();
    await owner.getByText("All health was restored. Injury history was retained.",{exact:true}).waitFor();
    await owner.getByRole("button",{name:"Manage Mana",exact:true}).click();
    await owner.getByRole("button",{name:"Restore All Mana",exact:true}).click();
    await owner.getByRole("button",{name:"Confirm Restore All",exact:true}).click();
    await owner.getByText("All current Mana pools were restored.",{exact:true}).waitFor();
    await owner.getByLabel("Fame",{exact:true}).fill("9");
    await owner.getByRole("button",{name:"Save Character",exact:true}).click();
    await owner.getByText("G.O.D. changes were saved to the Character record.",{exact:true}).waitFor();
    await owner.evaluate(() => window.scrollTo(0,0));
    await owner.screenshot({path:path.join(artifacts,"owner-controls-desktop.png"),fullPage:true});
    await owner.setViewportSize({width:390,height:844});
    assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await owner.evaluate(() => window.scrollTo(0,0));
    await owner.screenshot({path:path.join(artifacts,"owner-controls-mobile.png"),fullPage:true});
    await owner.reload();
    await owner.getByRole("tab",{name:"Attributes",exact:true}).click();
    const persisted = await pool.query("select h.total_damage,m.mana_spent,p.fame,p.creation_completed_at from campaign_character_profile p join campaign_character_active_health h using(character_id) join campaign_character_active_mana m using(character_id) where character_id=$1",[characters[0]]);
    assert.equal(persisted.rows[0].total_damage,0); assert.equal(persisted.rows[0].mana_spent,0); assert.equal(persisted.rows[0].fame,9); assert.ok(persisted.rows[0].creation_completed_at);
    await owner.goto(`${baseUrl}/realms/characters/${characters[2]}`);
    await checkTabs(owner,true);
    const beforePrint=(await pool.query("select * from campaign_character_profile order by character_id")).rows;
    // Printing is independent of the selected tab and sends no mutation request.
    for (const page of [owner,player]) {
      await page.locator(".character-print-center summary").click();
      for (const preset of ["Tabletop Quick Reference","Full Tabletop Character","Complete Character Record","Custom Print"]) {
        await page.locator(".character-print-center__presets button").filter({has:page.locator("strong",{hasText:preset})}).click();
        await page.emulateMedia({media:"print"});
        assert.equal(await page.locator(".printable-character-sheet").isVisible(),true);
        assert.equal(await page.locator(".character-workspace").isVisible(),false);
        assert.match(await page.locator(".printable-character-sheet").innerText(),/Experience/i);
        await page.emulateMedia({media:"screen"});
      }
    }
    assert.deepEqual((await pool.query("select * from campaign_character_profile order by character_id")).rows,beforePrint);
    await player.goto(`${baseUrl}/realms/characters/${characters[1]}`);
    await player.getByRole("tab",{name:"Equipment",exact:true}).click();
    assert.equal(await player.getByRole("heading",{name:"Starting Equipment Store",exact:true}).isVisible(),true);
    await player.getByRole("tab",{name:"Identity",exact:true}).click();
    await player.getByLabel(/Character Name/).fill("Rowan Revised");
    await player.getByRole("tab",{name:"Skills & Abilities"}).click();
    await player.getByRole("tab",{name:"Identity",exact:true}).click();
    assert.equal(await player.getByLabel(/Character Name/).inputValue(),"Rowan Revised");
    await player.getByRole("button",{name:"Save Character",exact:true}).click();
    await player.getByText("Character draft saved.",{exact:true}).waitFor();
    await player.getByRole("button",{name:"Complete Character",exact:true}).click();
    await player.getByRole("alertdialog").getByRole("button",{name:"Complete Character",exact:true}).click();
    await player.getByText("Character creation is complete. The Player creation record is now permanently locked.",{exact:true}).waitFor();
    assert.equal(await player.getByLabel(/Character Name/).isDisabled(),true);
    const admin = await login("sheet-admin");
    await admin.goto(`${baseUrl}/heavens/characters/${characters[0]}`);
    await checkTabs(admin,false);
    await admin.getByRole("tab",{name:"Attributes",exact:true}).click();
    assert.equal(await admin.getByRole("button",{name:/Manage Health|Manage Mana/}).count(),0);
    const foreign = await login("sheet-foreign");
    await foreign.goto(`${baseUrl}/heavens/characters/${characters[0]}`);
    assert.equal(await foreign.getByRole("tablist").count(),0);
    if (process.env.SERRIAN_PAPER_SAMPLES === "true") {
      const { rehearsePaperCharacterSheets } = await import("./character-paper-browser");
      await rehearsePaperCharacterSheets(pool, login, baseUrl);
    }
    assert.deepEqual(errors,[]);
    console.log("PASS: owner/player/admin/foreign routes; totals; saved creation and locks; restores and reload; keyboard/mobile; all print presets; screenshots");
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      else { server.kill(); await new Promise<void>((resolve) => server!.once("exit", () => resolve())); }
    }
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false);
    await rm(root, { recursive: true, force: true });
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
});
