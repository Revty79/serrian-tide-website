import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";

/** Inspect Chrome's real print-preview UI, then close it without submitting a print job. */
export async function inspectNativeSpreadsheetPreview(page: Page, output: string) {
  const browser = page.context().browser()!;
  await page.emulateMedia({ media: null });
  const session = await browser.newBrowserCDPSession();
  const pending = page.evaluate(() => Reflect.get(window, "__nativeSpreadsheetPrint")());
  let targetId: string | undefined;
  for (let i = 0; i < 40; i++) {
    targetId = (await session.send("Target.getTargets")).targetInfos.find(target => target.url.startsWith("chrome://print"))?.targetId;
    if (targetId) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(targetId, "Chrome must expose its native print preview");
  const { sessionId } = await session.send("Target.attachToTarget", { targetId, flatten: false });
  let sequence = 0;
  const requests = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  session.on("Target.receivedMessageFromTarget", event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = requests.get(message.id);
    if (request) { requests.delete(message.id); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result); }
  });
  async function command(method: string, params: Record<string, unknown> = {}) {
    const id = ++sequence;
    const answer = new Promise<Record<string, unknown>>((resolve, reject) => requests.set(id, { resolve, reject }));
    await session.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
    return answer;
  }
  try {
    await command("Page.enable");
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await command("Runtime.evaluate", { expression: `(() => { const text = []; function visit(root) { for (const element of root.children || []) { if (element.shadowRoot) visit(element.shadowRoot); if (element.tagName === 'SELECT') text.push({select:element.id,value:element.value,options:[...element.options].map(option=>({text:option.text,value:option.value}))}); if (!element.children.length && element.textContent.trim()) text.push(element.textContent.trim()); visit(element); } } visit(document.body); return text; })()`, returnByValue: true });
    await writeFile(path.join(output, "native-print-preview.json"), JSON.stringify(result, null, 2));
    const shot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(output, "native-print-preview.png"), Buffer.from(shot.data as string, "base64"));
    const selected = await command("Runtime.evaluate", { expression: `(() => { let paper; function visit(root) { for (const element of root.children || []) { if (element.shadowRoot) visit(element.shadowRoot); if (element.localName === 'select') { const option = [...element.options].find(option => option.text === '8 x 10 in'); if (option) paper = { element, option }; } visit(element); } } visit(document.body); if (!paper) return false; paper.element.value = paper.option.value; paper.element.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`, returnByValue: true });
    await writeFile(path.join(output, "native-8x10-selection.json"), JSON.stringify(selected, null, 2));
    await new Promise(resolve => setTimeout(resolve, 1500));
    const sizedShot = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(output, "native-print-preview-8x10.png"), Buffer.from(sizedShot.data as string, "base64"));
  } finally {
    await command("Runtime.evaluate", { expression: `(() => { let cancel; function visit(root) { for (const element of root.children || []) { if (element.shadowRoot) visit(element.shadowRoot); if (element.localName === 'cr-button' && element.textContent.trim() === 'Cancel') cancel = element; visit(element); } } visit(document.body); if (cancel) setTimeout(() => cancel.click(), 10); return !!cancel; })()`, returnByValue: true });
    await Promise.race([pending.catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1500))]);
    await session.detach();
  }
}
