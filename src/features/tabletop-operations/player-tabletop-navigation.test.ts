import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerCalledCheckWorkspaceView } from "./called-check-service";
import { buildPlayerTabletopAlerts, playerTabletopRequestAnchor, resolvePlayerTabletopTab } from "./player-tabletop-navigation";

function workspace(): PlayerCalledCheckWorkspaceView {
  return {
    characterId: 7,
    session: { id: 1, campaignId: 1, title: "Session", status: "active" },
    calledChecks: [{
      id: 11, batchId: 1, recipientCharacterId: 7, recipientName: "Player", recipientKind: "pc", status: "pending",
      governingSource: null, sourceLabel: "Perception", originalTarget: 50, finalTarget: 50, modifiers: [], resolution: null,
      rollId: null, parentRequestId: null, cancellationReason: "", rerollReason: "", rulingText: "", revealedVisibility: null,
      issuedAt: "2026-09-13T12:00:00Z", respondedAt: null, resolvedAt: null, cancelledAt: null, events: [],
      purpose: "Watch the doorway", instructions: "", visibility: "table", rollMethod: "random",
    }],
    highLow: [{
      id: 12, mode: "player-calls-rolls", participantCharacterId: 7, participantName: "Player", visibility: "table", rollMethod: "random",
      purpose: "A turn of fortune", status: "pending", calledSide: null, rollId: null, result: null, parentRequestId: null,
      cancellationReason: "", rerollReason: "", rulingText: "", calledAt: null, respondedAt: null, resolvedAt: null,
      cancelledAt: null, createdAt: "2026-09-13T12:00:00Z", events: [],
    }],
  };
}

test("active encounters retain their existing exact Character/encounter route", () => {
  const alerts = buildPlayerTabletopAlerts(7, [
    { id: 22, title: "Ambush", status: "active" },
    { id: 23, title: "Old battle", status: "completed" },
    { id: 24, title: "Later", status: "planned" },
  ], null);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].href, "/realms/tabletop?character=7&combat=22");
  assert.equal(alerts[0].kind, "encounter");
});

test("own pending requests link to Rolls and the exact request without performing a Roll", () => {
  const view = workspace();
  const before = structuredClone(view);
  const alerts = buildPlayerTabletopAlerts(7, [], view);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].href, "/realms/tabletop?character=7&tab=rolls&request=check-11");
  assert.equal(alerts[1].href, "/realms/tabletop?character=7&tab=rolls&request=high-low-12");
  assert.equal(alerts[1].actionLabel, "Make call");
  assert.ok(alerts.every(({ requiresInput }) => requiresInput));
  assert.deepEqual(view, before);
});

test("other Characters, nonpending requests, neutral High/Low, and old Sessions do not create alerts", () => {
  const view = workspace();
  assert.deepEqual(buildPlayerTabletopAlerts(8, [], view), []);
  assert.deepEqual(buildPlayerTabletopAlerts(7, [], { ...view, session: { ...view.session, status: "completed" } }), []);
  for (const status of ["answered", "resolved", "cancelled", "superseded", "requires-god-ruling"] as const) {
    assert.deepEqual(buildPlayerTabletopAlerts(7, [], {
      ...view, calledChecks: view.calledChecks.map((entry) => ({ ...entry, status })), highLow: view.highLow.map((entry) => ({ ...entry, status })),
    }), []);
  }
  assert.deepEqual(buildPlayerTabletopAlerts(7, [], {
    ...view, calledChecks: view.calledChecks.map((entry) => ({ ...entry, recipientCharacterId: 8 })),
    highLow: view.highLow.map((entry) => ({ ...entry, mode: "neutral" })),
  }), []);
});

test("a locked G.O.D.-rolled High/Low stays inspectable but is not counted as needing player input", () => {
  const view = workspace();
  const alert = buildPlayerTabletopAlerts(7, [], { ...view, calledChecks: [], highLow: [{ ...view.highLow[0], mode: "player-calls-god-rolls", calledSide: "high" }] })[0];
  assert.equal(alert.requiresInput, false);
  assert.equal(alert.actionLabel, "View request");
  assert.match(alert.detail, /waiting for the G.O.D./);
});

test("entered results and locked player High/Low calls retain the correct next action", () => {
  const view = workspace();
  const alerts = buildPlayerTabletopAlerts(7, [], { ...view,
    calledChecks: [{ ...view.calledChecks[0], rollMethod: "entered" }],
    highLow: [{ ...view.highLow[0], calledSide: "low" }],
  });
  assert.equal(alerts[0].actionLabel, "Open roll");
  assert.equal(alerts[1].actionLabel, "Open roll");
});

test("tab resolution is bounded and a closed Shop cannot strand navigation", () => {
  assert.equal(resolvePlayerTabletopTab("rolls", false), "rolls");
  assert.equal(resolvePlayerTabletopTab("shop", true), "shop");
  assert.equal(resolvePlayerTabletopTab("shop", false, "shop"), "alerts");
  assert.equal(resolvePlayerTabletopTab(null, true, "shop"), "shop");
  for (const value of [null, "", "unknown", "__proto__", "https://example.invalid"]) assert.equal(resolvePlayerTabletopTab(value, false), "alerts");
});

test("request anchors allow only exact request identities", () => {
  assert.equal(playerTabletopRequestAnchor("check-11"), "player-request-check-11");
  assert.equal(playerTabletopRequestAnchor("high-low-12"), "player-request-high-low-12");
  for (const value of [null, "check-0", "check--1", "check-1#other", "body", "other-12"]) assert.equal(playerTabletopRequestAnchor(value), null);
});
