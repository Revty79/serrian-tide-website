import assert from "node:assert/strict";
import path from "node:path";
import type { Pool } from "pg";
import type { Page, Request, Route } from "playwright-core";

export async function runAdminCatalogBrowserChecks({ page, pool, baseUrl, screenshots, login }: {
  page: Page; pool: Pool; baseUrl: string; screenshots: string;
  login: (page: Page, baseUrl: string, identity: string) => Promise<void>;
}) {
  const configs = [
    { key: "race", route: "races", table: "races" },
    { key: "creature", route: "creatures", table: "creatures" },
    { key: "skill", route: "skills", table: "skill" },
    { key: "derivedAbility", route: "derived-abilities", table: "derived_ability" },
    ...["equipment", "inventory"].map((key) => ({ key, route: key, table: "items" })),
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/profile`);
  await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).click();
  await login(page, baseUrl, "admin");
  const row = (name: string) => page.locator(".skill-library__row").filter({ has: page.locator(".skill-library__row-name").filter({ hasText: new RegExp(`^${name}(?:\\s+#\\d+)?$`) }) });
  let forgedRequest: Request | undefined;
  for (const config of configs) {
    const prefix = `Admin Browser ${config.key}`;
    for (const [index, creator, canon] of [[0, "profile-god", true], [1, "profile-admin", false], [2, "profile-admin", true], [3, "profile-god", false], [4, null, false]] as const) {
      const columns = [config.table === "creatures" ? "canonical_name" : "name", "created_by_user_id", "is_system_canon", "canon_marked_by_user_id", "canon_marked_at"];
      const values: unknown[] = [`${prefix} ${index}`, creator, canon, canon ? "profile-admin" : null, canon ? new Date() : null];
      if (config.table === "creatures" || config.table === "items") { columns.push("canonical_id"); values.push(`${prefix} ${index}`.toUpperCase()); }
      if (config.table === "creatures") { columns.push("size"); values.push("Medium"); }
      if (config.table === "skill") { columns.push("classification", "tier", "primary_attribute"); values.push("standard", 1, "STR"); }
      if (config.table === "items") { columns.push("catalog_scope", "record_type", "family", "category", "price_basis"); values.push(config.key, "Item", "Test", "Test", "Each"); }
      await pool.query(`insert into ${config.table}(${columns.join(",")}) values(${values.map((_, i) => `$${i + 1}`).join(",")})`, values);
    }
    await page.goto(`${baseUrl}/heavens/${config.route}`);
    await page.locator('.skill-library input[type="search"]').first().fill(prefix);
    const choose = async (label: string) => {
      const radio = page.getByRole("radio", { name: label, exact: true });
      if (!await radio.isChecked()) await radio.check();
    };
    const matches = async (indexes: number[]) => {
      for (let index = 0; index < 5; index++) await row(`${prefix} ${index}`).waitFor({ state: indexes.includes(index) ? "visible" : "detached" });
    };
    await choose("Mine Only"); await matches([1, 2]);
    await row(`${prefix} 2`).getByText("Serrian Tide Canon", { exact: true }).waitFor();
    await choose("Canon Only"); await matches([0, 2]);
    await choose("Canon + Mine"); await matches([0, 1, 2]);
    if (config.key === "race") {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const fail = async (route: Route) => {
        if (route.request().method() === "POST" && route.request().postData()?.includes('"catalog":"race"')) { await gate; await route.abort("failed"); }
        else await route.continue();
      };
      await page.route("**/heavens/races", fail);
      try {
        await choose("Canon Only");
        await page.getByRole("status").filter({ hasText: "Saving" }).waitFor();
        assert.equal(await page.getByRole("radio", { name: "Canon Only", exact: true }).isChecked(), true);
        assert.equal(await page.getByRole("combobox", { name: "Created by", exact: true }).isDisabled(), true);
        release();
        await page.getByRole("group", { name: "Administrator view", exact: true }).getByRole("alert").waitFor();
        assert.equal(await page.getByRole("radio", { name: "Canon + Mine", exact: true }).isChecked(), true);
      } finally { release(); await page.unroute("**/heavens/races", fail); }
    }
    const capture = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.postData()?.includes('"adminBrowse"') && request.postData()?.includes('"all":true')));
    await choose("All");
    forgedRequest = await capture;
    await matches([0, 1, 2, 3, 4]);
    await row(`${prefix} 3`).getByText("Created by: Profile god", { exact: true }).waitFor();
    await row(`${prefix} 4`).getByText("Created by: No recorded creator", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Created by", exact: true }).selectOption("profile-god");
    await matches([0, 3]);
    await page.getByRole("combobox", { name: "Created by", exact: true }).selectOption("__unattributed__");
    await matches([4]);
    await page.getByRole("combobox", { name: "Created by", exact: true }).selectOption("");
    await matches([0, 1, 2, 3, 4]);
    await page.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("user");
    await page.waitForFunction((prefix) => {
      const rows = [...document.querySelectorAll(".skill-library__row-name")].map((node) => node.textContent?.replace(/\s+#\d+$/, "").trim()).filter((name) => name?.startsWith(prefix));
      return JSON.stringify(rows) === JSON.stringify([4, 1, 2, 0, 3].map((index) => `${prefix} ${index}`));
    }, prefix);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${config.route} admin mobile overflow`);
    await page.locator('[data-field-guidance="Created by"] summary').click();
    await page.locator('[data-field-guidance="Created by"] [role="note"]').getByText(/original creator/).waitFor();
    await page.locator('[data-field-guidance="Created by"] summary').press("Escape");
    await page.getByRole("group", { name: "Administrator view", exact: true }).locator("..").screenshot({ path: path.join(screenshots, `admin-${config.route}-390.png`) });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal((await pool.query(`select ${config.key === "derivedAbility" ? "derived_ability" : config.key}_visibility as mode from user_catalog_preferences where user_id='profile-admin'`)).rows[0].mode, "canon-and-mine", "All must preserve the saved personal preference");
  }
  await page.goto(`${baseUrl}/profile`);
  await page.locator('.authenticated-navigation button:visible').filter({ hasText: /^Log Out$/ }).click();
  await login(page, baseUrl, "god");
  for (const config of configs) {
    await page.goto(`${baseUrl}/heavens/${config.route}`);
    assert.equal(await page.getByRole("radio", { name: "All", exact: true }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Created by", exact: true }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Sort by", exact: true }).count(), 0);
  }
  assert.ok(forgedRequest);
  const response = await page.request.post(forgedRequest.url(), { headers: {
    "next-action": forgedRequest.headers()["next-action"], "content-type": forgedRequest.headers()["content-type"], origin: baseUrl,
  }, data: forgedRequest.postData()! });
  const responseText = await response.text();
  assert.match(responseText, /Administrator|"digest"/, "A G.O.D. cannot replay an admin All request");
  assert.ok(!responseText.includes("Admin Browser inventory 1"), "The rejected response must not disclose the other user's records");
  console.log("PASS: Admin-only four views, original-creator filtering/labels, user sort, Profile preservation, six mobile layouts, guidance and forged-request rejection.");
}
