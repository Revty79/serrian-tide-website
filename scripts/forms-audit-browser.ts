import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";

/** Viewport captures remain readable inside the editors' scrolling panels. */
export async function captureFormViewport(page: Page, target: Locator, path: string) {
  // Center headings/controls so the site's sticky navigation cannot cover them.
  await target.evaluate(element => element.scrollIntoView({ block: "center" }));
  await target.waitFor({ state: "visible" });
  const box = await target.boundingBox();
  assert.ok(box && box.y < page.viewportSize()!.height && box.y + box.height > 0, "The reviewed section is in the screenshot");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "Form page fits the viewport");
  await page.screenshot({ path });
}
