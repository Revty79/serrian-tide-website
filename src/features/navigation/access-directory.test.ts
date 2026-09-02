import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  CROSSROADS_ACCESS_CARD,
  getAccessDestinationCards,
} from "./access-directory";
import type { SerrianAppRole } from "./authenticated-navigation";

const expectedByRole: Array<{
  role: SerrianAppRole;
  titles: string[];
}> = [
  { role: "player", titles: ["THE REALMS", "THE CROSSROADS"] },
  { role: "god", titles: ["THE HEAVENS", "THE CROSSROADS"] },
  { role: "admin", titles: ["ADMIN", "THE CROSSROADS"] },
];

test("each single Serrian role receives its role destination and one universal Crossroads card", () => {
  for (const expectation of expectedByRole) {
    const cards = getAccessDestinationCards([expectation.role]);
    assert.deepEqual(cards.map(({ title }) => title), expectation.titles);
    assert.equal(cards.filter(({ href }) => href === "/chat").length, 1);
  }
});

test("multi-role Paths stays ordered and never duplicates the universal destination", () => {
  const cards = getAccessDestinationCards(["player", "god", "admin", "player"]);
  assert.deepEqual(cards.map(({ title }) => title), [
    "ADMIN",
    "THE HEAVENS",
    "THE REALMS",
    "THE CROSSROADS",
  ]);
  assert.equal(cards.filter(({ key }) => key === "crossroads").length, 1);
  assert.equal(new Set(cards.map(({ key }) => key)).size, cards.length);
});

test("Crossroads has a stable non-role identity and roleless Users receive no usable card", () => {
  assert.equal(CROSSROADS_ACCESS_CARD.key, "crossroads");
  assert.equal(CROSSROADS_ACCESS_CARD.href, "/chat");
  assert.equal(CROSSROADS_ACCESS_CARD.role, undefined);
  assert.deepEqual(getAccessDestinationCards([]), []);
});

test("two, three, and four-card Paths grids use explicit responsive layouts", () => {
  const stylesheet = readFileSync(join(process.cwd(), "src/app/access/access.module.css"), "utf8");
  assert.match(stylesheet, /data-card-count="2"/);
  assert.match(stylesheet, /data-card-count="3"/);
  assert.match(stylesheet, /data-card-count="4"/);
  assert.match(stylesheet, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(stylesheet, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesheet, /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("Paths renders stable card keys and no longer redirects a single-role User", () => {
  const page = readFileSync(join(process.cwd(), "src/app/access/page.tsx"), "utf8");
  assert.match(page, /getAccessDestinationCards/);
  assert.match(page, /data-card-count=\{availableOptions\.length\}/);
  assert.match(page, /key=\{option\.key\}/);
  assert.doesNotMatch(page, /availableOptions\.length === 1/);
  assert.doesNotMatch(page, /redirect\(availableOptions\[0\]\.href\)/);
});

test("Crossroads remains a header destination instead of being embedded in gameplay content", () => {
  const prohibitedContentRoots = [
    "src/app/characters",
    "src/app/realms/characters",
    "src/app/heavens/campaigns",
    "src/app/heavens/tabletop",
  ];

  for (const root of prohibitedContentRoots) {
    const files = readdirSync(join(process.cwd(), root), {
      recursive: true,
      withFileTypes: true,
    });

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".tsx")) {
        continue;
      }
      const sourcePath = join(file.parentPath, file.name);
      const source = readFileSync(sourcePath, "utf8");
      assert.doesNotMatch(
        source,
        /(?:href\s*=\s*["']\/chat(?:[?"']|$)|<ChatWorkspace\b)/,
        `${sourcePath} must not embed Crossroads controls or workspace content`,
      );
    }
  }
});
