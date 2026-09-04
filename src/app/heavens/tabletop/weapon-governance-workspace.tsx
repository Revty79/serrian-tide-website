"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  CharacterWeaponGoverningSelection,
  CharacterWeaponGovernanceResult,
  CharacterWeaponOneActionOverride,
  CharacterWeaponResolvedSource,
} from "@/features/items/character-weapon-governance";
import type { CharacterWeaponGoverningChoice } from "@/features/items/character-weapon-governance-service";
import type { GodWeaponGovernanceWorkspaceView } from "@/features/items/weapon-governance-management-service";
import type { RollWorkspaceView } from "@/features/tabletop-operations/roll-runtime-service";

import {
  previewGodWeaponGovernanceOneAction,
  removeGodWeaponGovernanceOverride,
  saveGodWeaponGovernanceOverride,
} from "./weapon-governance-actions";
import { RollTray, type RollTrayPrefill } from "./roll-tray";
import styles from "./weapon-governance-workspace.module.css";

type Feedback = { kind: "success" | "error"; message: string };

function isResolved(result: CharacterWeaponGovernanceResult): result is Extract<
  CharacterWeaponGovernanceResult,
  { status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override" }
> {
  return result.status === "resolved-normal"
    || result.status === "resolved-persistent-override"
    || result.status === "resolved-one-action-override";
}

function sourceLabel(result: CharacterWeaponGovernanceResult): string {
  if (!isResolved(result)) return "No authoritative source resolved";
  if (result.source.kind === "skill") {
    return `${result.source.skillName} - allocation #${result.source.allocationId}`;
  }
  if (result.source.kind === "attribute") return `${result.source.attributeKey} straight Attribute`;
  return result.source.label;
}

function sourceDetail(result: CharacterWeaponGovernanceResult): string | null {
  if (!isResolved(result)) return null;
  if (result.source.kind === "skill") {
    return result.source.allocationPath.map(({ skillName, skillId, allocationId }) => (
      `${skillName} (#${skillId}, allocation #${allocationId})`
    )).join(" -> ");
  }
  if (result.source.kind === "attribute") {
    return `${result.source.attributeDisplayName}: 100 - ${result.source.attributeValue}`;
  }
  return "Manual one-action G.O.D. target";
}

function resolvedSourceLabel(source: CharacterWeaponResolvedSource): string {
  if (source.kind === "skill") return `${source.skillName} - allocation #${source.allocationId}`;
  if (source.kind === "attribute") return `${source.attributeKey} straight Attribute`;
  return source.label;
}

function resultLabel(result: CharacterWeaponGovernanceResult): string {
  if (result.status === "resolved-normal") return "Normal governance";
  if (result.status === "resolved-persistent-override") return "Persistent override";
  if (result.status === "resolved-one-action-override") return "One-action override";
  if (result.status === "override-invalid") return "Override invalid";
  return "G.O.D. ruling needed";
}

function selectionFromKey(
  choices: readonly CharacterWeaponGoverningChoice[],
  key: string,
): CharacterWeaponGoverningSelection | null {
  return choices.find((choice) => choice.key === key)?.selection ?? null;
}

function selectionKey(selection: CharacterWeaponGoverningSelection | undefined): string {
  if (!selection) return "";
  return selection.kind === "skill"
    ? `skill:${selection.allocationId}`
    : `attribute:${selection.attributeKey}`;
}

export function WeaponGovernanceWorkspace({
  view,
  rollWorkspace,
  sessionId,
  sceneId,
  encounterId,
}: {
  view: GodWeaponGovernanceWorkspaceView;
  rollWorkspace: RollWorkspaceView | null;
  sessionId: number | null;
  sceneId: number | null;
  encounterId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [persistentChoice, setPersistentChoice] = useState(
    selectionKey(view.detail?.persistentOverride?.selection) || view.detail?.governingChoices[0]?.key || "",
  );
  const [persistentScope, setPersistentScope] = useState<"weapon" | "mode">(
    view.persistentOverride?.firingModeId != null ? "mode" : "weapon",
  );
  const [persistentReason, setPersistentReason] = useState(view.persistentOverride?.reason ?? "");
  const [oneKind, setOneKind] = useState<"exact" | "manual">("exact");
  const [oneChoice, setOneChoice] = useState(view.detail?.governingChoices[0]?.key ?? "");
  const [oneLabel, setOneLabel] = useState("");
  const [oneTarget, setOneTarget] = useState("");
  const [oneReason, setOneReason] = useState("");
  const [onePreview, setOnePreview] = useState<CharacterWeaponGovernanceResult | null>(null);
  const [preparedRoll, setPreparedRoll] = useState<RollTrayPrefill | null>(null);

  const selectedMode = view.detail?.governance.modes.find(({ id }) => id === view.selectedFiringModeId) ?? null;
  const canonicalScope = selectedMode?.canonicalBehavior === "mode-override"
    ? selectedMode.scope
    : view.detail?.governance.weaponDefault ?? null;
  const approvedOptions = selectedMode
    ? selectedMode.applicableApprovedOptions
    : view.detail?.governance.weaponDefault.approvedOptions ?? [];
  const normal = view.detail?.resolution.normalResolution ?? null;
  const normalSummary = normal?.status === "resolved"
    ? `${resolvedSourceLabel(normal.selectedAlternative.source)} at ${normal.selectedAlternative.source.originalTarget}%`
    : normal?.explanation ?? "No normal resolution is available.";
  const persistentPreviewChoice = view.detail?.governingChoices.find(({ key }) => key === persistentChoice) ?? null;
  const onePreviewChoice = view.detail?.governingChoices.find(({ key }) => key === oneChoice) ?? null;

  const navigationPrefix = useMemo(() => {
    const params = new URLSearchParams({ campaign: String(view.campaignId), workspace: "weapons" });
    if (sessionId) params.set("session", String(sessionId));
    if (sceneId) params.set("scene", String(sceneId));
    if (encounterId) params.set("encounter", String(encounterId));
    return params;
  }, [encounterId, sceneId, sessionId, view.campaignId]);

  function navigate(characterId: number, itemId: number | null, firingModeId: number | null): void {
    const params = new URLSearchParams(navigationPrefix);
    params.set("weaponCharacter", String(characterId));
    if (itemId === null) params.delete("weaponItem"); else params.set("weaponItem", String(itemId));
    if (firingModeId === null) params.delete("weaponMode"); else params.set("weaponMode", String(firingModeId));
    router.push(`/heavens/tabletop?${params}`);
  }

  function baseRequest() {
    if (!view.selectedCharacter || !view.selectedWeapon) throw new Error("Select a Character and an owned canonical Weapon first.");
    return {
      campaignId: view.campaignId,
      characterId: view.selectedCharacter.id,
      itemId: view.selectedWeapon.itemId,
      firingModeId: view.selectedFiringModeId,
    };
  }

  function oneActionRequest(): CharacterWeaponOneActionOverride {
    if (!oneReason.trim()) throw new Error("A one-action ruling requires a reason.");
    if (oneKind === "manual") {
      if (!oneLabel.trim() || oneTarget.trim() === "" || !Number.isFinite(Number(oneTarget))) {
        throw new Error("A manual one-action ruling requires a label and finite target.");
      }
      return { kind: "manual", label: oneLabel, originalTarget: Number(oneTarget), reason: oneReason };
    }
    if (!view.detail) throw new Error("Weapon governance is not loaded.");
    const selection = selectionFromKey(view.detail.governingChoices, oneChoice);
    if (!selection) throw new Error("Choose an exact owned Skill allocation or Character Attribute.");
    return { ...selection, reason: oneReason };
  }

  async function perform(work: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message: success });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Weapon governance could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  async function savePersistent(): Promise<void> {
    await perform(async () => {
      if (!view.detail) throw new Error("Weapon governance is not loaded.");
      const selection = selectionFromKey(view.detail.governingChoices, persistentChoice);
      if (!selection) throw new Error("Choose an exact owned Skill allocation or Character Attribute.");
      if (!persistentReason.trim()) throw new Error("A persistent override requires a reason.");
      const request = baseRequest();
      await saveGodWeaponGovernanceOverride({
        ...request,
        firingModeId: persistentScope === "mode" ? request.firingModeId : null,
        selection,
        reason: persistentReason,
      });
      setPersistentReason("");
      setOnePreview(null);
      setPreparedRoll(null);
      router.refresh();
    }, "Persistent weapon override saved. It remains in force until removed or replaced.");
  }

  async function removePersistent(): Promise<void> {
    if (!view.persistentOverride) return;
    await perform(async () => {
      await removeGodWeaponGovernanceOverride({
        ...baseRequest(),
        firingModeId: view.persistentOverride!.firingModeId,
      });
      setOnePreview(null);
      setPreparedRoll(null);
      router.refresh();
    }, "Persistent weapon override removed. Normal dynamic resolution is restored.");
  }

  async function previewOneAction(): Promise<void> {
    await perform(async () => {
      const oneActionOverride = oneActionRequest();
      const preview = await previewGodWeaponGovernanceOneAction({ ...baseRequest(), oneActionOverride });
      if (preview.status !== "resolved-one-action-override") throw new Error(preview.explanation);
      setOnePreview(preview);
      setPreparedRoll(null);
    }, "One-action ruling previewed. It has not changed canonical or persistent governance.");
  }

  function prepare(result: CharacterWeaponGovernanceResult, oneActionOverride?: CharacterWeaponOneActionOverride): void {
    if (!isResolved(result) || !view.selectedCharacter || !view.selectedWeapon) return;
    const label = `${view.selectedWeapon.name}${selectedMode ? ` - ${selectedMode.name}` : ""}`;
    setPreparedRoll({
      scope: encounterId && rollWorkspace?.selectedEncounter ? "encounter" : sceneId && rollWorkspace?.selectedScene ? "scene" : "session",
      rollerCharacterId: view.selectedCharacter.id,
      purposeKind: "attack",
      label,
      weaponGovernance: {
        request: { ...baseRequest(), oneActionOverride: oneActionOverride ?? null },
        sourceLabel: sourceLabel(result),
        sourceDetail: sourceDetail(result) ?? "Exact governing source",
        originalTarget: result.originalTarget,
      },
    });
  }

  function prepareOneAction(): void {
    try {
      if (onePreview) prepare(onePreview, oneActionRequest());
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The one-action ruling is incomplete." });
    }
  }

  function cancelOneAction(clearFeedback = true): void {
    setOnePreview(null);
    setOneReason("");
    setOneLabel("");
    setOneTarget("");
    setPreparedRoll(null);
    if (clearFeedback) setFeedback(null);
  }

  if (!view.selectedCharacter) return <section className={styles.workspace}><p className={styles.empty}>This Campaign has no Characters to govern.</p></section>;

  return <section className={styles.workspace} aria-label="G.O.D. Character weapon governance">
    <div className={styles.selectors}>
      <label className={styles.field}><span>Campaign Character</span><select value={view.selectedCharacter.id} onChange={(event) => navigate(Number(event.target.value), null, null)}>{view.characters.map((character) => <option value={character.id} key={character.id}>{character.name} - {character.kindLabel}{character.playerName ? ` (${character.playerName})` : ""}</option>)}</select></label>
      <label className={styles.field}><span>Owned canonical Weapon</span><select value={view.selectedWeapon?.itemId ?? ""} onChange={(event) => navigate(view.selectedCharacter!.id, Number(event.target.value), null)}><option value="" disabled>Select a Weapon</option>{view.weapons.map((weapon) => <option value={weapon.itemId} key={weapon.itemId}>{weapon.name} - {weapon.canonicalId}{weapon.owned ? ` - ${weapon.quantity} owned` : " - retained override only"}</option>)}</select></label>
      <label className={styles.field}><span>Firing mode</span><select disabled={!view.selectedWeapon} value={view.selectedFiringModeId ?? ""} onChange={(event) => navigate(view.selectedCharacter!.id, view.selectedWeapon!.itemId, event.target.value ? Number(event.target.value) : null)}><option value="">Weapon default</option>{view.detail?.governance.modes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name} - {mode.canonicalBehavior === "mode-override" ? "own canonical paths" : "inherits default"}</option>)}</select></label>
    </div>

    {!view.selectedWeapon || !view.detail ? <article className={styles.card}><p className={styles.empty}>This Character owns no canonical Weapon Profile. Item ownership is managed on the Character record.</p></article> : <>
      {view.selectedWeapon.retainedOverrideOnly ? <p className={styles.warning}>Administrative preview: this Character no longer owns this weapon. It remains listed only so the preserved override can be reviewed or removed. A Roll cannot be prepared.</p> : null}
      {feedback ? <p className={`${styles.feedback} ${feedback.kind === "success" ? styles.success : styles.error}`} role="status">{feedback.message}</p> : null}

      <div className={styles.summaryGrid}>
        <article className={styles.card}>
          <header><div><p>CANONICAL PATH REVIEW</p><h3>{view.selectedWeapon.name}</h3></div><span className={`${styles.status} ${canonicalScope?.status === "approved" ? styles.approved : canonicalScope?.status === "review-required" ? styles.review : canonicalScope?.status === "invalid" ? styles.invalid : styles.missing}`}>{canonicalScope?.status ?? "missing"}</span></header>
          <dl className={styles.identity}>
            <div><dt>Canonical ID</dt><dd>{view.selectedWeapon.canonicalId}</dd></div>
            <div><dt>Profile</dt><dd>#{view.selectedWeapon.weaponProfileId}</dd></div>
            <div><dt>Mode</dt><dd>{selectedMode?.name ?? "Weapon default"}</dd></div>
            <div><dt>Behavior</dt><dd>{selectedMode ? selectedMode.canonicalBehavior === "mode-override" ? "Mode paths" : "Inherits weapon default" : "Weapon default"}</dd></div>
          </dl>
          {selectedMode && selectedMode.canonicalBehavior === "inherits-weapon-default" ? <p className={styles.notice}>The {selectedMode.name} scope is {selectedMode.scope.status}; it has no usable approved mode path, so the approved weapon default applies.</p> : null}
          <ul className={styles.pathList}>
            {approvedOptions.map((option) => <li className={styles.path} key={option.id}><strong>Approved option #{option.id}</strong><p className={styles.chain}>{option.path.rootToEndpoint.map(({ name, id }) => `${name} (#${id})`).join(" -> ")}</p><p className={styles.meta}>Fallback Attribute: {option.path.fallbackAttribute ?? "unresolved"}{option.notes ? ` - ${option.notes}` : " - No canonical notes."}</p></li>)}
          </ul>
          {!approvedOptions.length ? <p className={styles.warning}>This weapon has no approved governing Skill path. The program will not guess.</p> : null}
          {canonicalScope?.problems.length ? <ul className={styles.alternativeList}>{canonicalScope.problems.map((problem, index) => <li className={styles.meta} key={`${problem}-${index}`}>{problem}</li>)}</ul> : null}
          <div className={styles.actions}><Link className={styles.authorLink} href={view.selectedWeapon.catalogScope === "equipment" ? "/heavens/equipment" : "/heavens/inventory"}>{canonicalScope?.status === "approved" ? "Review" : "Fix"} canonical mapping for everyone in {view.selectedWeapon.catalogScope === "equipment" ? "Equipment" : "Inventory"}</Link></div>
        </article>

        <article className={styles.card}>
          <header><div><p>CHARACTER RESOLUTION</p><h3>{view.selectedCharacter.name}</h3></div><span className={`${styles.status} ${isResolved(view.detail.resolution) ? styles.approved : styles.invalid}`}>{resultLabel(view.detail.resolution)}</span></header>
          {isResolved(view.detail.resolution) ? <div className={styles.current}><strong>{sourceLabel(view.detail.resolution)}</strong><b>Roll over {view.detail.resolution.originalTarget}%</b><span>{sourceDetail(view.detail.resolution)}</span><small>{view.detail.resolution.explanation}</small></div> : <p className={styles.warning}>{view.detail.resolution.explanation}</p>}
          <p className={styles.notice}><strong>Normal alternative:</strong> {normalSummary}</p>
          {normal?.status === "resolved" ? <ul className={styles.alternativeList}>{normal.alternatives.map((alternative) => <li className={styles.alternative} key={alternative.canonicalMappingId}><strong>Canonical option #{alternative.canonicalMappingId}{alternative.status === "resolved" && normal.selectedAlternative.canonicalMappingId === alternative.canonicalMappingId ? " - recommended" : ""}</strong><p className={styles.chain}>{alternative.canonicalPath.rootToEndpoint.map(({ name, id }) => `${name} (#${id})`).join(" -> ")}</p>{alternative.status === "resolved" ? <><p className={styles.meta}>Deepest result: {alternative.source.kind === "skill" ? `${alternative.source.skillName}, allocation #${alternative.source.allocationId}` : `${alternative.source.kind === "attribute" ? alternative.source.attributeKey : alternative.source.label}`} - target {alternative.source.originalTarget}%</p><p className={styles.explanation}>{alternative.explanation}</p></> : <p className={styles.warning}>{alternative.explanation}</p>}</li>)}</ul> : null}
          {normal?.status === "resolved" && normal.hasTie ? <p className={styles.notice}>Equal best targets remain visible. Stable canonical order recommends option #{normal.selectedAlternative.canonicalMappingId}; tied mappings: {normal.tiedCanonicalMappingIds.map((id) => `#${id}`).join(", ")}.</p> : null}
          <div className={styles.actions}>{isResolved(view.detail.resolution) && view.selectedWeapon.owned ? <button type="button" className={styles.primary} onClick={() => prepare(view.detail!.resolution)}>Prepare Roll</button> : null}</div>
        </article>
      </div>

      <div className={styles.summaryGrid}>
        <article className={styles.card}>
          <header><div><p>PERSISTENT CHARACTER EXCEPTION</p><h3>{view.persistentOverride ? `Override #${view.persistentOverride.id}` : "No persistent override"}</h3></div>{view.detail.resolution.status === "override-invalid" ? <span className={`${styles.status} ${styles.invalid}`}>Override invalid</span> : view.persistentOverride ? <span className={`${styles.status} ${styles.review}`}>In force</span> : null}</header>
          {view.persistentOverride ? <div className={styles.current}><strong>{view.persistentOverride.sourceLabel}</strong>{view.detail.resolution.status === "resolved-persistent-override" ? <b>Current target: roll over {view.detail.resolution.originalTarget}%</b> : null}<span>{view.persistentOverride.scopeLabel}</span><small>Reason: {view.persistentOverride.reason}</small><small>Author: {view.persistentOverride.updatedByName} - updated {new Date(view.persistentOverride.updatedAt).toLocaleString()}</small></div> : <p className={styles.explanation}>Normal governance remains dynamic until a G.O.D. saves an exact Character exception.</p>}
          {view.detail.resolution.status === "override-invalid" ? <p className={styles.warning}>Override invalid: {view.detail.resolution.reason} The preserved identity and reason remain authoritative; the normal alternative above is not silently used. If this source is a Skill allocation, remove or replace this override before deleting that allocation.</p> : null}
          <div className={styles.overrideGrid}>
            <label className={styles.field}><span>Exact source</span><select value={persistentChoice} onChange={(event) => setPersistentChoice(event.target.value)}>{view.detail.governingChoices.map((choice) => <option value={choice.key} key={choice.key}>{choice.label}</option>)}</select><small>{persistentPreviewChoice?.detail ?? "Choose a current exact Character source."}</small></label>
            <label className={styles.field}><span>Scope</span><select value={persistentScope} onChange={(event) => setPersistentScope(event.target.value as "weapon" | "mode")}><option value="weapon">All uses of this canonical weapon</option>{selectedMode ? <option value="mode">{selectedMode.name} only</option> : null}</select><small>The override remains in force until removed or replaced.</small></label>
          </div>
          <label className={styles.field}><span>Required reason</span><textarea rows={3} maxLength={1000} value={persistentReason} onChange={(event) => setPersistentReason(event.target.value)} placeholder="Why this Character uses a different governing source" /></label>
          <div className={styles.preview}><strong>Save preview: {persistentPreviewChoice ? `${persistentPreviewChoice.label}; target ${persistentPreviewChoice.originalTarget}%; ${persistentScope === "mode" && selectedMode ? `${selectedMode.name} only` : "all weapon uses"}` : "choose a source"}</strong><span>Normal resolution would select {normalSummary}. The server recalculates the target before saving. This exception remains in force until removed or replaced.</span></div>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || !persistentPreviewChoice || !persistentReason.trim() || !view.selectedWeapon.owned} onClick={() => void savePersistent()}>{view.persistentOverride ? "Replace Override" : "Save Persistent Override"}</button>{view.persistentOverride ? <button type="button" className={styles.danger} disabled={busy} onClick={() => void removePersistent()}>Remove Override</button> : null}</div>
        </article>

        <article className={styles.card}>
          <header><div><p>ONE ACTION ONLY</p><h3>Quick G.O.D. ruling</h3></div><span className={`${styles.status} ${styles.review}`}>Not persistent</span></header>
          <p className={styles.notice}>This selection applies only to the prepared Roll/action. It never changes canonical mapping or the persistent override.</p>
          <div className={styles.choiceGrid}>
            <label className={styles.field}><span>Source type</span><select value={oneKind} onChange={(event) => { setOneKind(event.target.value as "exact" | "manual"); setOnePreview(null); setPreparedRoll(null); }}><option value="exact">Owned Skill allocation / Attribute</option><option value="manual">Manual G.O.D. target</option></select></label>
            {oneKind === "exact" ? <label className={styles.field}><span>Exact source</span><select value={oneChoice} onChange={(event) => { setOneChoice(event.target.value); setOnePreview(null); setPreparedRoll(null); }}>{view.detail.governingChoices.map((choice) => <option value={choice.key} key={choice.key}>{choice.label}</option>)}</select><small>{onePreviewChoice?.detail}</small></label> : <div className={styles.choiceGrid}><label className={styles.field}><span>Manual label</span><input maxLength={200} value={oneLabel} onChange={(event) => { setOneLabel(event.target.value); setOnePreview(null); }} placeholder="Close-range table ruling" /></label><label className={styles.field}><span>Manual roll-over target</span><input type="number" step="any" value={oneTarget} onChange={(event) => { setOneTarget(event.target.value); setOnePreview(null); }} /></label></div>}
          </div>
          <label className={styles.field}><span>Required one-action reason</span><textarea rows={3} maxLength={1000} value={oneReason} onChange={(event) => { setOneReason(event.target.value); setOnePreview(null); setPreparedRoll(null); }} placeholder="What makes this Roll an exception" /></label>
          <div className={styles.preview}><strong>Currently overrides: {view.persistentOverride ? `${view.persistentOverride.sourceLabel} (${view.persistentOverride.scopeLabel})` : normalSummary}</strong><span>Preview is calculated by the server through the Pass 4 one-action resolver.</span></div>
          {onePreview && isResolved(onePreview) ? <div className={styles.current}><strong>{sourceLabel(onePreview)}</strong><b>Roll over {onePreview.originalTarget}%</b><span>{sourceDetail(onePreview)}</span><small>{onePreview.explanation}</small></div> : null}
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || !view.selectedWeapon.owned} onClick={() => void previewOneAction()}>Preview One-Action Ruling</button>{onePreview && isResolved(onePreview) ? <button type="button" disabled={busy} onClick={prepareOneAction}>Prepare This Roll</button> : null}{oneKind === "exact" && onePreviewChoice ? <button type="button" onClick={() => { setPersistentChoice(oneChoice); setPersistentReason(oneReason); }}>Copy Choice to Persistent Form</button> : null}<button type="button" onClick={() => cancelOneAction()}>Cancel One-Action Ruling</button></div>
        </article>
      </div>

      {preparedRoll && rollWorkspace ? <section className={styles.roll}><div className={styles.actions}><button type="button" className={styles.danger} onClick={() => cancelOneAction()}>Cancel Prepared Roll</button></div><RollTray key={JSON.stringify(preparedRoll)} workspace={rollWorkspace} defaultScope="session" prefill={preparedRoll} onRecorded={(roll) => { cancelOneAction(false); setFeedback({ kind: "success", message: `Roll #${roll.id} recorded with its immutable weapon-governance snapshot.` }); }} /></section> : preparedRoll ? <p className={styles.warning}>Create or select a Session before recording this prepared Roll. Governance selection did not roll automatically.</p> : null}
    </>}
  </section>;
}
