/** New synthetic World content is authored through visible website controls only. */
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture,collaborationPassword} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";

process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-a6-browser-${Date.now()}`;
withCollaborationFixture(async f=>{
 const existingWorlds=async()=>(await f.pool.query("select to_jsonb(w) as value from world w where id=any($1::text[]) order by id",[[f.worldA,f.worldB]])).rows;
 const originalWorlds=await existingWorlds();
 await withCollaborationBrowser(f,async b=>{
  const context=await b.browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{"cf-connecting-ip":"198.51.100.232"}});
  const p=await context.newPage();p.setDefaultTimeout(30000);const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto(b.base+"/login");await p.getByLabel("Username or Email",{exact:true}).fill("owner_a");await p.getByLabel("Password",{exact:true}).fill(collaborationPassword);await p.getByRole("button",{name:"Enter",exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith("/login"));
  await p.goto(b.base+"/worlds");await p.getByRole("button",{name:"Create world",exact:true}).click();
  const dialog=p.getByRole("dialog",{name:"Create a world",exact:true});await dialog.getByLabel("World name",{exact:true}).fill("A6 First Island");await dialog.getByRole("button",{name:"Create world",exact:true}).click();
  await p.getByRole("link",{name:"Open A6 First Island",exact:true}).click();
  await p.waitForURL(/\/worlds\/[a-f0-9-]{36}/);const worldId=new URL(p.url()).pathname.split("/").at(-1)!;
  assert.equal((await f.pool.query("select count(*)::int n from world_terrain where world_id=$1",[worldId])).rows[0].n,0);
  await writeFile(path.join(f.out,"created-world.json"),JSON.stringify({worldId,throughVisibleUI:true,emptyTerrain:true}));
  await p.screenshot({path:path.join(f.out,"new-world.png")});await writeFile(path.join(f.out,"new-world.txt"),await p.locator("body").innerText());
  const atlas=p.getByRole("button",{name:"Atlas",exact:true});await atlas.click();await claimOwnedWorldPage(p,b.base);
  await p.getByRole("button",{name:"Create flat world",exact:true}).click();
  await p.getByLabel("Map name",{exact:true}).fill("First Island Map");await p.getByRole("button",{name:"Create map",exact:true}).click();
  await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();
  await p.screenshot({path:path.join(f.out,"blank-map.png")});await writeFile(path.join(f.out,"blank-map.txt"),await p.locator("body").innerText());
  const {guidanceChecks}=await import("./worlds-guidance-a6-checks");await guidanceChecks(f,b,p,context,worldId);
  assert.deepEqual(await existingWorlds(),originalWorlds,"Existing synthetic Worlds remain unchanged");
  assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"baseline.json"),JSON.stringify({passed:true,sourceHash:b.sourceHash,worldId,route:p.url()},null,2));
 });
}).catch(e=>{console.error(e);process.exitCode=1;});
