import {terrainTool} from "./worlds-terrain-browser-ui";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {Page} from "playwright-core";
import {regionalFixtureIds as ids,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {click,stable} from "./worlds-regional-editing-browser-checks";

/** Exercise visible navigation guidance while real appearance and paint drafts exist. */
export async function freeformDirty({f,page:p,base,groups}:{f:RegionalFixture;page:Page;base:string;groups:string[]}){
 const url=`${base}/worlds/${f.world}?tab=atlas&terrainMap=${ids.parent}`;
 await p.goto(url);await p.getByRole("button",{name:"Expand editor",exact:true}).click();await stable(p);
 await p.getByRole("button",{name:"Advanced settings",exact:true}).click();await p.getByRole("tab",{name:"World",exact:true}).click();
 const appearance=p.getByLabel("Map Appearance",{exact:true}),original=await appearance.inputValue();
 await appearance.selectOption(original==="realistic-terrain"?"topographic":"realistic-terrain");
 const changed=await appearance.inputValue();await p.getByRole("button",{name:"Choose Existing Region",exact:true}).click();
 await p.getByTestId("region-block-reasons").filter({hasText:"Unsaved map appearance"}).waitFor();
 await p.getByLabel("Choose linked region",{exact:true}).selectOption(ids.a);assert.equal(new URL(p.url()).searchParams.get("terrainMap"),ids.parent);assert.equal(await appearance.inputValue(),changed);
 await p.getByRole("button",{name:"Create New Region",exact:true}).click();await p.getByText(/Create New Region is waiting:.*Unsaved map appearance/).waitFor();
 await p.getByRole("button",{name:"Advanced settings",exact:true}).click();await p.getByRole("tab",{name:"World",exact:true}).click();assert.equal(await appearance.inputValue(),changed);
 await p.getByRole("button",{name:"Save map appearance",exact:true}).click();await p.getByRole("button",{name:"Rectangle",exact:true}).waitFor();await p.getByRole("button",{name:"Cancel",exact:true}).click();
 await p.getByRole("button",{name:"Paint",exact:true}).click();await p.getByLabel("Paint layer",{exact:true}).selectOption("ground");await p.getByLabel("Ground material",{exact:true}).selectOption("rock");await p.getByLabel(/^Paint brush size/).fill("1");
 await p.waitForFunction(()=>document.querySelector('[aria-label="Everyday Atlas editing"]')?.getAttribute("aria-busy")==="false");
 await p.getByRole("button",{name:"Fit map",exact:true}).click();
 await p.route("**/terrain/materials?**",route=>route.request().method()==="POST"?route.abort("failed"):route.continue(),{times:1});
 await click(p,110000,45000);await p.getByTestId("paint-status").filter({hasText:/failed|fetch|network/i}).waitFor();
 await p.getByRole("button",{name:"Choose Existing Region",exact:true}).click();await p.getByTestId("region-block-reasons").filter({hasText:"Material draft waiting to save"}).waitFor();
 await p.getByLabel("Choose linked region",{exact:true}).selectOption(ids.a);assert.equal(new URL(p.url()).searchParams.get("terrainMap"),ids.parent);
 await p.getByRole("button",{name:"Create New Region",exact:true}).click();await p.getByText(/Create New Region is waiting:.*Material draft waiting to save/).waitFor();
 await p.getByRole("button",{name:"Paint",exact:true}).click();assert.equal(await p.getByLabel("Ground material",{exact:true}).inputValue(),"rock");await p.getByRole("button",{name:"Save Changes",exact:true}).click();
 await p.getByRole("button",{name:"Rectangle",exact:true}).waitFor();await p.getByRole("button",{name:"Cancel",exact:true}).click();
 await p.screenshot({path:path.join(f.out,"dirty-navigation-resolved.png")});
 await p.getByRole("button",{name:"Sculpt",exact:true}).click();await p.getByLabel("Sculpt tool",{exact:true}).selectOption({label:"Sample a height"});await p.getByText(/Tap or click to copy land height into Flatten ground/).waitFor();await p.getByRole("button",{name:"Advanced settings",exact:true}).click();await terrainTool(p,{label:"Artwork"});await p.getByRole("region",{name:"Everyday Atlas editing",exact:true}).getByText(/Place and resize map illustrations/).waitFor();await terrainTool(p,{label:"Labels & Layout"});await p.getByRole("region",{name:"Everyday Atlas editing",exact:true}).getByText(/Write names and captions on the map/).waitFor();await p.screenshot({path:path.join(f.out,"contextual-guide-controls.png")});await p.getByRole("button",{name:"Paint",exact:true}).click();groups.push("sample, artwork and label guidance accurately describes the next action and what changes");
 groups.push("unsaved appearance and failed paint save block region switching/creation with specific guidance; selections and drafts retained; saving resumes queued creation");
 await writeFile(path.join(f.out,"dirty-navigation.json"),JSON.stringify({passed:true,appearanceDraftRetained:true,failedPaintDraftRetained:true,reasonSpecificGuidance:true,queuedCreationAfterSave:true},null,2));
}
