import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";

/** Viewport captures remain readable inside the editors' scrolling panels. */
export async function captureFormViewport(page: Page, target: Locator, path: string) {
  // A user scroll releases the editor's recent-save scroll restoration. Wait for
  // responsive layout to settle before centering the section for its capture.
  await page.mouse.wheel(0, 1);
  await target.scrollIntoViewIfNeeded();
  // Center headings/controls so the site's sticky navigation cannot cover them.
  await target.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await target.waitFor({ state: "visible" });
  const box = await target.boundingBox();
  await page.screenshot({ path });
  assert.ok(box && box.y < page.viewportSize()!.height && box.y + box.height > 0, `The reviewed section is in the screenshot: ${JSON.stringify(box)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "Form page fits the viewport");
}
