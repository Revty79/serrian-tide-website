import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { chromium } from "playwright-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const screenshotDirectory = process.env.CHAT_INTERFACE_SCREENSHOTS_DIR?.trim() || null;
const stylesheet = readFileSync(join(process.cwd(), "src/app/chat/chat.module.css"), "utf8");

function fixtureHtml(): string {
  const longUrl = `https://serrian.example/${"unbroken-crossroads-path-".repeat(12)}`;
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          html, body { min-height: 100%; margin: 0; background: radial-gradient(circle at 65% 15%, #261543, #080b15 45%, #03050b); font: 16px Arial, sans-serif; }
          ${stylesheet}
        </style>
      </head>
      <body>
        <main class="page" data-chat-workspace>
          <div class="shell">
            <header class="hero">
              <div class="brandBlock"><span class="brand">SERRIAN TIDE</span><span class="eyebrow">Communication Center</span></div>
              <div class="heroCopy"><p class="eyebrow">Where paths converge</p><h1>The Crossroads</h1><p>Gather with the Serrian Tide community, continue Campaign conversations, and send private messages.</p></div>
              <div class="accountBlock"><span>Signed in as <strong>Brannan</strong></span><a href="#">Return to Paths</a></div>
            </header>
            <div class="mobileRoomPicker"><label for="room">Conversation</label><div class="mobileRoomControls"><select id="room"><option>The Crossroads</option><option>The Long Road</option></select><button>New Message</button></div></div>
            <div class="workspace">
              <aside class="sidebar" aria-label="Chat rooms">
                <section class="roomGroup"><h2>Crossroads</h2><button class="roomButton roomButtonActive"><span class="roomButtonText"><strong>The Crossroads</strong></span></button></section>
                <section class="roomGroup"><h2>Campaigns</h2><button class="roomButton"><span class="roomButtonText"><strong>The Long Road</strong><small>The Long Road Chat</small></span></button><button class="roomButton"><span class="roomButtonText"><strong>Archived Chronicle</strong><small>Archived Chronicle Chat</small></span><span class="archivedBadge">Archived</span></button></section>
                <section class="roomGroup"><div class="roomGroupHeading"><h2>Direct Messages</h2><button class="smallAction">New Message</button></div><button class="roomButton"><span class="roomButtonText"><strong>Mara</strong><small>Private conversation</small></span></button></section>
              </aside>
              <section class="conversation">
                <header class="conversationHeader"><div><div class="scopeLine"><span>Global</span></div><h2>The Crossroads</h2><p>Open to every current Serrian Tide role</p></div><button>Refresh Messages</button></header>
                <div class="history">
                  <div class="olderControl"><button>Load Older Messages</button></div>
                  <ol class="messageList">
                    <li class="message"><div class="messageMeta"><strong>Mara</strong><time datetime="2026-09-01T20:45:00.000Z">Sep 1, 2026, 2:45 PM</time></div><p class="messageContent">The caravan reaches the old gate at dusk.\nBring the map.</p></li>
                    <li class="message ownMessage"><div class="messageMeta"><strong>Brannan · You</strong><time datetime="2026-09-02T04:10:00.000Z">10:10 PM</time></div><p class="messageContent">I will meet you there. ${longUrl}</p><div class="messageActions"><button>Delete</button></div></li>
                    <li class="message deletedMessage"><div class="messageMeta"><strong>Aster</strong><time datetime="2026-09-02T04:11:00.000Z">10:11 PM</time></div><p class="removedText">Message removed</p></li>
                  </ol>
                </div>
                <form class="composer"><label for="message">Message The Crossroads</label><textarea id="message" rows="3" placeholder="Write a message…"></textarea><div class="composerFooter"><span>Enter sends · Shift+Enter adds a new line</span><span>0 / 1000</span><button>Send</button></div><p class="inlineError"></p></form>
              </section>
            </div>
          </div>
        </main>
      </body>
    </html>`;
}

test("the Crossroads stylesheet provides a usable desktop and narrow-phone workspace", async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(fixtureHtml(), { waitUntil: "load" });
    if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });

    for (const viewport of [
      { width: 1440, height: 900, mode: "desktop" },
      { width: 1024, height: 768, mode: "laptop" },
      { width: 768, height: 1024, mode: "tablet" },
      { width: 390, height: 844, mode: "phone" },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const sidebar = document.querySelector<HTMLElement>(".sidebar");
        const picker = document.querySelector<HTMLElement>(".mobileRoomPicker");
        const conversation = document.querySelector<HTMLElement>(".conversation");
        const longMessage = document.querySelectorAll<HTMLElement>(".messageContent")[1];
        return {
          horizontalOverflow: root.scrollWidth > root.clientWidth || document.body.scrollWidth > root.clientWidth,
          sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : "missing",
          pickerDisplay: picker ? getComputedStyle(picker).display : "missing",
          conversationWidth: conversation?.getBoundingClientRect().width ?? 0,
          messageWithinConversation: Boolean(longMessage && conversation
            && longMessage.getBoundingClientRect().right <= conversation.getBoundingClientRect().right + 1),
        };
      });
      assert.equal(layout.horizontalOverflow, false, `${viewport.mode} layout overflowed horizontally.`);
      assert.ok(layout.conversationWidth > 300, `${viewport.mode} conversation became impractically narrow.`);
      assert.equal(layout.messageWithinConversation, true, `${viewport.mode} long message escaped its panel.`);
      if (viewport.width <= 720) {
        assert.equal(layout.sidebarDisplay, "none");
        assert.notEqual(layout.pickerDisplay, "none");
      } else {
        assert.notEqual(layout.sidebarDisplay, "none");
        assert.equal(layout.pickerDisplay, "none");
      }
      if (screenshotDirectory) {
        await page.screenshot({
          path: join(screenshotDirectory, `crossroads-${viewport.width}x${viewport.height}.png`),
          fullPage: true,
        });
      }
    }

    assert.equal(await page.locator(".removedText").textContent(), "Message removed");
    assert.equal((await page.locator("body").innerText()).includes("stored deleted content"), false);
  } finally {
    await browser.close();
  }
});
