import type { Page, Locator } from "playwright-core";
// Bridge A: functional browser checks continue; screenshots are opt-in for visual investigations.
export async function captureWorldsScreenshot(page:Page|Locator,options:Parameters<Page["screenshot"]>[0]){
  if(process.env.SERRIAN_WORLDS_SCREENSHOTS==="1")await page.screenshot(options);
}
