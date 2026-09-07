import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { runInThisContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

import { buildCombatRollPrompts, buildFirearmRollPrompts, selectCombatRollPrompt, type CombatRollPrompt } from "./combat-roll-prompts";
import type { CombatRollInput, CombatRollRecorded } from "../../components/tabletop/combat-roll-panel";

type Node = { type: unknown; props: Record<string, unknown> };
type Submit = (prompt: CombatRollPrompt, input: CombatRollInput) => Promise<CombatRollRecorded>;
const jsx = (type: unknown, props: Node["props"]): Node => ({ type, props });
const promptModule = { buildCombatRollPrompts, buildFirearmRollPrompts, selectCombatRollPrompt };

// Execute the real client adapters with only their framework/server boundaries
// replaced. These tests exercise onSubmit and click handlers, not text matching.
function loadClient(path: string, modules: Record<string, unknown>): Record<string, unknown> {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  }).outputText;
  const exports: Record<string, unknown> = {};
  const dependencies = { "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" }, ...modules };
  const evaluate = runInThisContext(`(function(require, exports, crypto) { ${code}\n})`, { filename: path }) as (
    require: (name: string) => unknown, exports: Record<string, unknown>, crypto: unknown,
  ) => void;
  evaluate((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name as keyof typeof dependencies];
  }, exports, webcrypto);
  return exports;
}

function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function findNode(value: unknown, type: string, text?: string): Node {
  const found = nodes(value).find((node) => node.type === type && (text === undefined || node.props.children === text));
  assert.ok(found, `Missing ${type}: ${text ?? ""}`);
  return found;
}
function declaration(id = 101, actor = 1) {
  return {
    id, actorCharacterId: actor, actorName: `Actor ${actor}`, pendingActionId: id + 1000, status: "rolling-ready",
    draft: { label: "Sword", actionKind: "attack" }, lockedSnapshot: { label: "Sword", governing: { status: "resolved" } },
    rollState: { attackRollId: null as number | null, missingResponseRolls: 0, resolved: false, message: "Waiting for a Roll." },
    opportunities: [], timing: { status: "completed", remainingInitiativeCost: 0 },
  };
}
function firearm() {
  return {
    id: 401, actorParticipantId: 1, targetParticipantId: -7, actorName: "Shooter", itemName: "Pistol",
    effectiveStatus: "committed", status: "committed", triggerDeclarationId: 103,
    triggerTimingStatus: "completed", attackRollId: null as number | null, responderOpportunities: [{ status: "declared" }],
  };
}
function adapter(role: "god" | "player", missingResponseRolls = 1, staged = false) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const spy = (name: string, value: unknown = 901) => async (...args: unknown[]) => { calls.push({ name, args }); return value; };
  const shot = firearm();
  if (staged) shot.attackRollId = 904;
  const trigger = { ...declaration(103), draft: { label: "Pistol", actionKind: "firearm-trigger" } };
  trigger.rollState = { ...trigger.rollState, attackRollId: shot.attackRollId, missingResponseRolls };
  const declarations = {
    participants: [{ characterId: 1, choiceOwner: "god" }, { characterId: 2, choiceOwner: "player" }],
    declarations: [declaration(), declaration(102, 2), trigger],
  };
  const defenses = { reactions: [{ id: 301, declarationId: 102, responderCharacterId: 1, responderName: "Defender", reactionType: "dodge", rollRequired: true, rollId: null, status: "declared" }] };
  const common = {
    "@/components/tabletop/combat-roll-panel": { CombatRollPanel: "panel" },
    "@/features/tabletop-operations/combat-roll-prompts": promptModule,
  };
  let tree: unknown;
  if (role === "god") {
    const clientModule = loadClient("src/app/heavens/tabletop/god-combat-rolls.tsx", {
      ...common,
      "./defense-intervention-actions": { recordDeclaredAttackRoll: spy("attack"), recordDeclaredResponseRoll: spy("defense") },
      "./firearm-attack-actions": { commitFirearmAttackTrigger: spy("trigger"), fireFirearmAttack: spy("firearm", { rollId: 904, waitingForDefenseRolls: missingResponseRolls > 0 }) },
      "./roll-actions": { recordGodRoll: spy("free", { resultTotal: 63 }) },
    });
    tree = (clientModule.GodCombatRolls as (props: unknown) => Node)({ encounterId: 77, selectedCombatantId: -99, declarations, defenses, firearms: { attacks: [shot] }, workspace: { session: { id: 55, status: "active" }, initialHistory: { rolls: [] } }, runtimeClosed: false });
  } else {
    const clientModule = loadClient("src/app/realms/tabletop/player-combat-console.tsx", {
      ...common,
      "@/app/realms/characters/[characterId]/player-called-check-panel": { PlayerCalledCheckPanel: "called-checks" },
      "./actions": { recordPlayerTabletopFreeRoll: spy("free", { resultTotal: 63 }) },
      "./player-combat-actions": { rollPlayerDeclaredAttack: spy("attack"), rollPlayerDeclaredResponse: spy("defense"), commitPlayerFirearmTrigger: spy("trigger"), firePlayerFirearmAttack: spy("firearm", 904) },
      "./player-combat-console-core": { PlayerCombatConsole: "core", PlayerCombatIntentButton: "intent" },
    });
    tree = (clientModule.PlayerCombatConsole as (props: unknown) => Node)({ characterId: 1, combat: { context: { encounterId: 77 }, declarations, defenses, firearmAttacks: { attacks: [shot] } } });
  }
  const panel = findNode(tree, "panel");
  return { calls, submit: panel.props.onSubmit as Submit, prompts: panel.props.prompts as CombatRollPrompt[] };
}

for (const role of ["god", "player"] as const) {
  test(`${role} battle submits the exact attack/defense slot, never the general roller`, async () => {
    const { prompts, submit, calls } = adapter(role);
    for (const [kind, id] of [["attack", 101], ["defense", 301]] as const) {
      const prompt = prompts.find((entry) => entry.kind === kind);
      assert.ok(prompt);
      assert.equal(prompt.recordId, id);
      const receipt = await submit(prompt, { method: "entered", enteredTotal: 100 });
      assert.equal(receipt.rollId, 901);
      assert.deepEqual(calls.at(-1), { name: kind, args: [...(role === "player" ? [1] : []), 77, id, { method: "entered", enteredTotal: 100 }] });
    }
    assert.equal(prompts.some(({ kind, recordId }) => kind === "attack" && recordId === 102), false);
    assert.equal(calls.some(({ name }) => name === "free"), false);
  });
  test(`${role} staged firearm waits for this shot's defense Rolls, then uses its recorded result`, async () => {
    const waiting = adapter(role, 1, true);
    const waitingPrompt = waiting.prompts.find(({ kind }) => kind === "firearm-finish");
    assert.ok(waitingPrompt);
    assert.equal(waitingPrompt.ready, false);
    assert.match(waitingPrompt.detail, /waiting for 1 defense Roll/);
    const ready = adapter(role, 0, true);
    const prompt = ready.prompts.find(({ kind }) => kind === "firearm-finish");
    assert.ok(prompt?.ready);
    const receipt = await ready.submit(prompt, { method: "random" });
    assert.equal(receipt.rollId, 904);
    assert.deepEqual(ready.calls[0], { name: "firearm", args: role === "god"
      ? [77, 401, [1, -7], { method: "random" }]
      : [1, 77, 401, { method: "random", enteredTotal: undefined }] });
  });
  test(`${role} invalid combat kind cannot silently become a general Roll`, async () => {
    const { submit, calls } = adapter(role);
    await assert.rejects(submit({ key: "stale", kind: "stale", recordId: 9, label: "Stale", ready: true, detail: "" } as unknown as CombatRollPrompt, { method: "random" }), /Refresh combat/);
    assert.equal(calls.length, 0);
  });
}

test("G.O.D. receives an honest waiting receipt when the first firearm Roll precedes defenses", async () => {
  const { prompts, submit } = adapter("god");
  const prompt = prompts.find(({ kind }) => kind === "firearm-roll");
  assert.ok(prompt?.ready);
  assert.match((await submit(prompt, { method: "entered", enteredTotal: 82 })).text, /waiting for defense Rolls/);
});

test("another declaration's completed defenses cannot enable a staged shot", () => {
  const shot = { ...firearm(), attackRollId: 904 };
  const unrelated = declaration(999);
  unrelated.rollState.resolved = true;
  const [prompt] = buildFirearmRollPrompts([shot], [1], [unrelated]);
  assert.equal(prompt.ready, false);
  assert.match(prompt.detail, /load this shot's defense state/);
});

function panelHarness(initialPrompts: CombatRollPrompt[], onSubmit: Submit, parse: (value: string) => number = () => 100) {
  const slots: unknown[] = [];
  let cursor = 0;
  let refreshes = 0;
  let prompts = initialPrompts;
  const clientModule = loadClient("src/components/tabletop/combat-roll-panel.tsx", {
    "react": {
      useId: () => "test-roll",
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
      },
      useRef: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
    },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/features/tabletop-operations/roll-runtime": { parsePhysicalPercentileInput: parse },
    "@/features/tabletop-operations/combat-roll-prompts": promptModule,
    "./battle-layout": { BattleStage: "stage" },
  });
  const render = () => { cursor = 0; return (clientModule.CombatRollPanel as (props: unknown) => Node)({ prompts, onSubmit, emptyMessage: "No Rolls." }); };
  const click = (text: string) => { const button = findNode(render(), "button", text); assert.equal(button.props.disabled, false); (button.props.onClick as () => void)(); };
  const change = (type: string, value: string) => (findNode(render(), type).props.onChange as (event: unknown) => void)({ target: { value } });
  return { render, click, change, refreshes: () => refreshes, setPrompts: (next: CombatRollPrompt[]) => { prompts = next; } };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function prompt(kind: CombatRollPrompt["kind"], id: number): CombatRollPrompt { return { key: `${kind}:${id}`, kind, recordId: id, label: `${kind} ${id}`, ready: true, detail: "Exact combat slot" }; }

test("physical entry uses the shared parser, submits the chosen defense, and refreshes combat", async () => {
  const selected = prompt("defense", 301);
  const submitted: unknown[] = [];
  const parsed: string[] = [];
  const panel = panelHarness([selected], async (...args) => { submitted.push(args); return { rollId: 901, text: "Recorded" }; }, (text) => { parsed.push(text); return 100; });
  panel.change("input", "00");
  panel.click("Enter roll");
  await tick();
  assert.deepEqual(parsed, ["00"]);
  assert.deepEqual(submitted, [[selected, { method: "entered", enteredTotal: 100 }]]);
  assert.equal(panel.refreshes(), 1);
  assert.equal(findNode(panel.render(), "button", "Roll d100").props.disabled, true);
});

test("double-clicks and switching between completed slots cannot submit another Roll", async () => {
  let calls = 0;
  let complete: (value: CombatRollRecorded) => void = () => { throw new Error("No submission"); };
  const a = prompt("attack", 101), b = prompt("defense", 301);
  const panel = panelHarness([a, b], () => { calls++; return new Promise((resolve) => { complete = resolve; }); });
  const click = findNode(panel.render(), "button", "Roll d100").props.onClick as () => void;
  click(); click();
  assert.equal(calls, 1);
  complete({ text: "Recorded" }); await tick();
  panel.change("select", b.key);
  panel.click("Roll d100");
  complete({ text: "Recorded" }); await tick();
  panel.change("select", a.key);
  assert.equal(findNode(panel.render(), "button", "Roll d100").props.disabled, true);
  assert.equal(calls, 2);
});

test("finishing a staged firearm stays retryable after an incomplete response race and never asks for dice", async () => {
  let calls = 0;
  const panel = panelHarness([prompt("firearm-finish", 401)], async () => { calls++; return { rollId: 904, text: "Still waiting" }; });
  assert.equal(nodes(panel.render()).some(({ type }) => type === "input"), false);
  panel.click("Finish firing — use recorded Roll"); await tick();
  panel.click("Finish firing — use recorded Roll"); await tick();
  assert.equal(calls, 2);
  assert.equal(panel.refreshes(), 2);
});

test("a failed physical submission preserves its value and never generates a replacement Roll", async () => {
  const attempts: CombatRollInput[] = [];
  const panel = panelHarness([prompt("attack", 101)], async (_prompt, input) => { attempts.push(input); throw new Error("Connection lost"); }, () => 72);
  panel.change("input", "72");
  panel.click("Enter roll"); await tick();
  assert.equal(findNode(panel.render(), "input").props.value, "72");
  assert.deepEqual(attempts, [{ method: "entered", enteredTotal: 72 }]);
  assert.ok(nodes(panel.render()).some(({ props }) => props.role === "alert" && props.children === "Connection lost"));
});
