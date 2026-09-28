import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignRaceTree, campaignPlayableRaceIds, type CampaignRaceEntry, type CampaignRaceNode } from "./campaign-race-tree";

const races: CampaignRaceEntry[] = [
  { id: 1, name: "Human", size: "Medium", parentRaceId: null },
  { id: 2, name: "Scholarly Human", size: "Medium", parentRaceId: 1 },
  { id: 3, name: "Versatile Human", size: "Medium", parentRaceId: 1 },
  { id: 4, name: "Elf", size: "Medium", parentRaceId: null },
  { id: 5, name: "Wild Elf", size: "Medium", parentRaceId: 4 },
  { id: 6, name: "Forest Wild Elf", size: "Small", parentRaceId: 5 },
];
const ids = (nodes: CampaignRaceNode[]): number[] => nodes.flatMap(node => [node.race.id, ...ids(node.children)]);

test("hidden Campaign world Races retain saved playability without becoming new playable choices", () => {
  const pool: CampaignRaceEntry[] = races.map((race) => ({ ...race, existingSelection: race.id < 4, existingPlayableSelection: race.id === 2, catalogSource: race.id === 4 ? "context" : "mine" }));
  assert.deepEqual(campaignPlayableRaceIds(pool, [1, 2, 3, 4, 5]), [2, 5]);
});

test("campaign browsing lists parent races first and preserves nested variants", () => {
  const tree = buildCampaignRaceTree(races, undefined, "");
  assert.deepEqual(tree.map(node => node.race.name), ["Elf", "Human"]);
  assert.deepEqual(ids(tree[0].children), [5, 6]);
  assert.deepEqual(ids(tree[1].children), [2, 3]);
});

test("a selected variant retains unselected parent context without allowing that parent", () => {
  const tree = buildCampaignRaceTree(races, [6], "");
  assert.deepEqual(ids(tree), [4, 5, 6]);
  assert.equal(tree[0].selectable, false);
  assert.equal(tree[0].children[0].selectable, false);
  assert.equal(tree[0].children[0].children[0].selectable, true);
  assert.deepEqual(buildCampaignRaceTree(races, [], ""), []);
});

test("search finds nested variants with ancestors and includes a matching parent's family", () => {
  assert.deepEqual(ids(buildCampaignRaceTree(races, undefined, " forest ")), [4, 5, 6]);
  assert.deepEqual(ids(buildCampaignRaceTree(races, undefined, "human")), [1, 2, 3]);
  assert.deepEqual(ids(buildCampaignRaceTree(races, [2], "human")), [1, 2]);
  assert.deepEqual(ids(buildCampaignRaceTree(races, undefined, "small")), [4, 5, 6]);
  assert.deepEqual(buildCampaignRaceTree(races, undefined, "missing"), []);
});

test("unlinked races remain separate even when their names resemble a parent", () => {
  const unlinked = [...races, { id: 7, name: "Another Human", size: "Medium", parentRaceId: null }];
  assert.deepEqual(buildCampaignRaceTree(unlinked, undefined, "").map(node => node.race.id), [7, 4, 1]);
});

test("missing parents and cyclic data never hide races or duplicate rows", () => {
  const unusual = [
    { id: 1, name: "Missing parent", size: "", parentRaceId: 99 },
    { id: 2, name: "Cycle A", size: "", parentRaceId: 3 },
    { id: 3, name: "Cycle B", size: "", parentRaceId: 2 },
  ];
  assert.deepEqual(ids(buildCampaignRaceTree(unusual, undefined, "")).sort(), [1, 2, 3]);
});
