import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { pool } from "@/db";

export async function checkRaceAnatomyBrowser(page: Page, parentId: number, save: (name: string) => Promise<void>, open: (id: number, name: string) => Promise<void>) {
  assert.equal(process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING, "true");
  let submitted: { action: string; body: string } | undefined;
  page.on("request", (request) => {
    const action = request.headers()["next-action"], body = request.postData();
    if (action && body?.includes("race-pool-") && body.includes("anatomy")) submitted = { action, body };
  });
  await page.getByRole("button", { name: "HP & Hit Locations", exact: true }).click();
  const anatomy = page.getByRole("region", { name: "Race HP and Hit Locations" });
  assert.equal(await anatomy.getByLabel("Body layout", { exact: true }).inputValue(), "humanoid");
  await anatomy.getByLabel("Body layout", { exact: true }).selectOption("custom");
  await anatomy.getByRole("button", { name: "Add HP Pool", exact: true }).click();
  await anatomy.getByLabel("Pool Name", { exact: true }).last().fill("Tail");
  await anatomy.getByLabel("HP %", { exact: true }).last().fill("10");
  await anatomy.getByLabel("HP %", { exact: true }).nth(5).fill("20");
  const tail = anatomy.getByRole("article", { name: "Hit Location 8", exact: true });
  await tail.getByLabel("Location Name", { exact: true }).fill("Tail");
  await tail.getByLabel("Body Parts", { exact: true }).fill("Tail");
  await tail.getByLabel("HP Pool", { exact: true }).selectOption({ label: "Tail" });
  // Invalid rolls must fail at the real save boundary and preserve the draft.
  await anatomy.getByLabel("Roll #", { exact: true }).first().fill("1");
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Each Hit Location must use a different roll from 0 to 9.", { exact: true }).waitFor();
  assert.equal((await pool.query("select anatomy_json from races where id=$1", [parentId])).rows[0].anatomy_json, null);
  await anatomy.getByLabel("Roll #", { exact: true }).first().fill("0");
  await save("Variant Authoring Parent");
  assert.ok(submitted); const saveRequest = { ...submitted };
  const persisted = (await pool.query("select anatomy_json from races where id=$1", [parentId])).rows[0].anatomy_json;
  assert.equal(persisted.hpPools.length, 7);
  assert.equal(persisted.hitLocations[7].locationName, "Tail");
  assert.equal(persisted.hpPools.find((entry: { canonicalId: string }) => entry.canonicalId === persisted.hitLocations[7].hpPoolCanonicalId).hpPercentage, 10);
  await page.reload(); await open(parentId, "Variant Authoring Parent");
  await page.getByRole("button", { name: "HP & Hit Locations", exact: true }).click();
  assert.equal(await anatomy.getByLabel("Pool Name", { exact: true }).last().inputValue(), "Tail");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `artifacts/race-authoring/anatomy-${width}.png`, fullPage: true });
    await tail.screenshot({ path: `artifacts/race-authoring/tail-location-${width}.png` });
    await anatomy.getByRole("article", { name: "HP Pool 7", exact: true }).screenshot({ path: `artifacts/race-authoring/tail-pool-${width}.png` });
  }
  // Removing an unsaved pool clears its assignments, with no dangling reference.
  await anatomy.getByRole("button", { name: "Add HP Pool", exact: true }).click();
  await anatomy.getByLabel("Pool Name", { exact: true }).last().fill("Temporary Wing");
  await anatomy.getByRole("button", { name: "Remove Pool", exact: true }).last().click();
  assert.equal(await anatomy.getByLabel("Pool Name", { exact: true }).count(), 7);
  await save("Variant Authoring Parent");
  await page.getByRole("button", { name: "Mechanics", exact: true }).click();
  await page.getByRole("region", { name: "Natural Protection", exact: true }).getByLabel("Tail", { exact: true }).waitFor();
  assert.deepEqual((await pool.query("select anatomy_json from races where id=$1", [parentId])).rows[0].anatomy_json, persisted);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("PASS: custom Race anatomy saves/reloads; invalid hit rolls reject; Tail protection labels and desktop/mobile layouts use saved anatomy");
  return saveRequest;
}
