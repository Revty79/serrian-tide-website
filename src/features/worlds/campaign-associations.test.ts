import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { associationCommandSchema, contextUnavailableReason, worldCreationSchema, type CampaignContext } from "./campaign-associations";

const choice = { id: 41, updatedAt: "2026-10-10T10:00:00.000Z" };
test("World creation is independent of Campaigns and rejects duplicate or forged identifier types", () => {
  assert.deepEqual(worldCreationSchema.parse({ name: "Independent" }).associatedCampaigns, []);
  assert.equal(worldCreationSchema.safeParse({ name: "Linked", associatedCampaigns: [choice, choice] }).success, false);
  for (const id of ["41", randomUUID(), 0, -1, 2147483648]) assert.equal(worldCreationSchema.safeParse({ name: "Forged", associatedCampaigns: [{ ...choice, id }] }).success, false);
  assert.equal(worldCreationSchema.parse({ name: "Linked", associatedCampaigns: [choice] }).associatedCampaigns[0].id, 41);
});
test("historical context retains blank, zero, negative and chronology extremes without calendar precision", () => {
  for (const startingYear of [null, 0, -900, -1e12, 1e12]) { const parsed=associationCommandSchema.parse({ action: "edit", campaignId: 41, id: randomUUID(), revision: 1, startingYear });assert.ok(parsed.action==="edit");assert.equal(parsed.startingYear, startingYear); }
  for (const startingYear of [1e12 + 1, NaN, 1.5, "900"]) assert.equal(associationCommandSchema.safeParse({ action: "edit", campaignId: 41, id: randomUUID(), revision: 1, startingYear }).success, false);
  assert.equal(associationCommandSchema.safeParse({ action: "edit", campaignId: 41, id: randomUUID(), revision: 1, startingYear: 900, calendarDay: 1 }).success, false);
});
test("authoring selection and home use independent revisions and accept clearing without invented dates", () => {
  const selected=associationCommandSchema.parse({ action: "select", campaignId: 41, revision: 0, contextId: null, viewingYear: null });assert.ok(selected.action==="select");assert.equal(selected.revision, 0);
  assert.equal(associationCommandSchema.safeParse({ action: "home", campaignId: 41, revision: 0, contextId: null }).success, false);
  assert.equal(associationCommandSchema.safeParse({ action: "select", campaignId: 41, revision: 1, contextId: randomUUID(), viewingYear: 900, moveCharacters: true }).success, false);
});
test("unavailable relationship states are explicit without a replacement or date", () => {
  const context = { ownershipAvailable: true, removed: false, worldArchived: false, campaignArchived: false, timelineArchived: true } as CampaignContext;
  assert.equal(contextUnavailableReason(context), "Timeline archived");
  assert.match(contextUnavailableReason({ ...context, removed: true }), /removed.*restoration/);
  assert.match(contextUnavailableReason({ ...context, ownershipAvailable: false }), /ownership/);
});
