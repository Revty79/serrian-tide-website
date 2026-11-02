import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";

/** Print the PDF itself and inspect both driver sizes; never submit a physical job. */
export async function inspectNativePdfPreview(page: Page, output: string) {
  await new Promise(resolve => setTimeout(resolve, 1500));
  const session = await page.context().browser()!.newBrowserCDPSession();
  const pending = page.evaluate(() => window.print()).catch(() => undefined);
  let targetId: string | undefined;
  for (let i = 0; i < 40; i++) {
    targetId = (await session.send("Target.getTargets")).targetInfos.find(target => target.url.startsWith("chrome://print"))?.targetId;
    if (targetId) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(targetId, "The PDF viewer must open native print preview");
  const { sessionId } = await session.send("Target.attachToTarget", { targetId, flatten: false });
  let sequence = 0;
  const requests = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  session.on("Target.receivedMessageFromTarget", event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), request = requests.get(message.id);
    if (request) { requests.delete(message.id); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result); }
  });
  async function command(method: string, params: Record<string, unknown> = {}) {
    const id = ++sequence;
    const answer = new Promise<Record<string, unknown>>((resolve, reject) => requests.set(id, { resolve, reject }));
    await session.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
    return Promise.race([answer, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Native preview command timed out")), 12000))]);
  }
  const expression = `(() => { let summary = '', paper; const selects = []; function visit(root) { for (const el of root.children || []) { if (el.shadowRoot) visit(el.shadowRoot); if (el.localName === 'select') { selects.push({value:el.value, options:[...el.options].map(option=>({text:option.text,value:option.value}))}); try { const value = JSON.parse(el.value); if(value.width_microns) paper = value; } catch {} } if (!el.children.length && /^\\d+ sheets? of paper$/.test(el.textContent.trim())) summary = el.textContent.trim(); visit(el); } } visit(document.body); return {summary,paper,selects}; })()`;
  try {
    await command("Page.enable");
    await new Promise(resolve => setTimeout(resolve, 1500));
    await writeFile(path.join(output, "native-pdf-default.json"), JSON.stringify(await command("Runtime.evaluate", { expression, returnByValue: true }), null, 2));
    for (const [name, height] of [["letter", 279400], ["legal", 355600]] as const) {
      const selected = await command("Runtime.evaluate", { expression: `(() => { let paper; function visit(root) { for (const el of root.children || []) { if (el.shadowRoot) visit(el.shadowRoot); if(el.localName==='select') { const option=[...el.options].find(option=>{ try { const size=JSON.parse(option.value); return size.width_microns===215900 && size.height_microns===${height}; } catch{return false;} }); if(option) paper={el,option}; } visit(el); } } visit(document.body); if(!paper) return false; paper.el.value=paper.option.value; paper.el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, returnByValue: true });
      assert.equal((selected.result as { value: boolean }).value, true, `Printer must offer ${name}`);
      const scaling = await command("Runtime.evaluate", { expression: `(() => { let select; function visit(root) { for(const el of root.children||[]) { if(el.shadowRoot) visit(el.shadowRoot); if(el.localName==='select' && [...el.options].some(option=>option.text==='Fit to printable area')) select=el; visit(el); } } visit(document.body); if(!select)return false; select.value='${name === "letter" ? "1" : "0"}'; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, returnByValue: true });
      assert.equal((scaling.result as { value: boolean }).value, true, "PDF scaling choices must be available");
      let state: { summary: string; paper: { width_microns: number; height_microns: number } } | undefined;
      for (let i = 0; i < 24; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        const result = await command("Runtime.evaluate", { expression, returnByValue: true });
        state = (result.result as { value: typeof state }).value;
        if (state?.summary === "2 sheets of paper" && state.paper?.height_microns === height) break;
      }
      assert.equal(state?.summary, "2 sheets of paper", `${name} must print one complete PDF page per sheet`);
      assert.equal(state?.paper.width_microns, 215900); assert.equal(state?.paper.height_microns, height);
      await new Promise(resolve => setTimeout(resolve, 750));
      await writeFile(path.join(output, `native-pdf-${name}.json`), JSON.stringify({ ...state, verifiedScaling: name === "letter" ? "Fit to printable area" : "Default (full-size Legal)" }, null, 2));
      const shot = await command("Page.captureScreenshot", { format: "png" });
      await writeFile(path.join(output, `native-pdf-${name}.png`), Buffer.from(shot.data as string, "base64"));
    }
  } finally {
    await command("Runtime.evaluate", { expression: `(() => { let cancel; function visit(root){for(const el of root.children||[]){if(el.shadowRoot)visit(el.shadowRoot);if(el.localName==='cr-button'&&el.textContent.trim()==='Cancel')cancel=el;visit(el);}}visit(document.body);if(cancel)setTimeout(()=>cancel.click(),10);return !!cancel;})()`, returnByValue: true }).catch(() => undefined);
    await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 1500))]);
    await session.detach();
  }
}
