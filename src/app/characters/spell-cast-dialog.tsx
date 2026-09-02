"use client";

import { useEffect, useState } from "react";

import {
  executeCharacterSpellCastAction,
  prepareCharacterSpellCast,
} from "./spell-runtime-actions";
import type {
  SpellCastExecutionResult,
  SpellCastRequest,
  SpellCastRuntimeSelections,
  SpellCastSourceRequest,
} from "@/features/characters/character-spell-runtime";
import type { SpellCastPreparation } from "@/features/characters/character-spell-runtime-service";

import "./spell-cast-dialog.css";

const EMPTY_SELECTIONS: SpellCastRuntimeSelections = {
  targetGroups: {},
  applications: {},
};

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The Spell cast could not be prepared.";
}

function statusLabel(status: SpellCastPreparation["plan"]["status"]): string {
  if (status === "needs-selection") return "Selections required";
  if (status === "insufficient-mana") return "Insufficient Mana";
  if (status === "invalid") return "Invalid cast";
  return "Ready to cast";
}

const executeImmediateSpellCast = (request: SpellCastRequest) => (
  executeCharacterSpellCastAction(request, true)
);

export function SpellCastDialog({
  casterCharacterId,
  source,
  onClose,
  onCast,
  prepareCast = prepareCharacterSpellCast,
  executeCast = executeImmediateSpellCast,
  confirmationLabel,
}: {
  casterCharacterId: number;
  source: SpellCastSourceRequest;
  onClose: () => void;
  onCast?: (result: SpellCastExecutionResult) => void;
  prepareCast?: (request: SpellCastRequest) => Promise<SpellCastPreparation>;
  executeCast?: (request: SpellCastRequest) => Promise<SpellCastExecutionResult | null>;
  confirmationLabel?: string;
}) {
  const [selections, setSelections] = useState<SpellCastRuntimeSelections>(EMPTY_SELECTIONS);
  const [preparation, setPreparation] = useState<SpellCastPreparation | null>(null);
  const [result, setResult] = useState<SpellCastExecutionResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestFor(nextSelections = selections): SpellCastRequest {
    return { casterCharacterId, source, selections: nextSelections };
  }

  async function preview(nextSelections = selections) {
    setBusy(true);
    setError(null);
    try {
      setPreparation(await prepareCast(requestFor(nextSelections)));
      setPreviewDirty(false);
    } catch (caught) {
      setPreparation(null);
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = {
      targetGroups: {},
      applications: {},
    } satisfies SpellCastRuntimeSelections;
    let cancelled = false;
    void prepareCast({ casterCharacterId, source, selections: initial })
      .then((next) => {
        if (cancelled) return;
        setPreparation(next);
        setBusy(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(messageFor(caught));
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [casterCharacterId, prepareCast, source]);

  function selectTarget(groupId: string, characterId: number, selected: boolean) {
    setSelections((current) => {
      const existing = current.targetGroups[groupId] ?? [];
      const nextIds = selected
        ? [...existing, characterId]
        : existing.filter((id) => id !== characterId);
      return {
        ...current,
        targetGroups: { ...current.targetGroups, [groupId]: nextIds },
        applications: selected
          ? current.applications
          : Object.fromEntries(
              Object.entries(current.applications).filter(
                ([applicationKey]) => !applicationKey.endsWith(`:${characterId}`),
              ),
            ),
      };
    });
    setPreviewDirty(true);
    setResult(null);
  }

  function setApplicationSelection(
    applicationKey: string,
    value: string,
  ) {
    setSelections((current) => ({
      ...current,
      applications: {
        ...current.applications,
        [applicationKey]: value.startsWith("hit:")
          ? { hitLocationNumber: Number(value.slice(4)), poolKey: null }
          : value.startsWith("pool:")
            ? { poolKey: value.slice(5), hitLocationNumber: null }
            : { poolKey: null, hitLocationNumber: null },
      },
    }));
    setPreviewDirty(true);
    setResult(null);
  }

  async function execute() {
    if (!preparation?.plan.ready || previewDirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await executeCast(requestFor());
      if (next) {
        setResult(next);
        onCast?.(next);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(messageFor(caught));
      setPreviewDirty(true);
    } finally {
      setBusy(false);
    }
  }

  const plan = preparation?.plan ?? null;

  return (
    <div className="spell-cast-dialog" role="dialog" aria-modal="true" aria-labelledby="spell-cast-dialog-title">
      <div className="spell-cast-dialog__surface">
        <header className="spell-cast-dialog__header">
          <div>
            <p>AUTHORITATIVE RUNTIME CAST</p>
            <h2 id="spell-cast-dialog-title">{result?.spell.name ?? plan?.spell.name ?? "Prepare Spell Cast"}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        {error ? <p className="spell-cast-dialog__error" role="alert">{error}</p> : null}
        {busy && !plan ? <p className="spell-cast-dialog__loading">Resolving caster, Spell, and Active State…</p> : null}

        {result ? (
          <section className="spell-cast-dialog__result" aria-live="polite">
            <p>CAST RESOLVED</p>
            <h3>{result.finalManaCost} {result.caster.system} Mana spent</h3>
            <dl className="spell-cast-dialog__facts">
              <div><dt>Current Mana</dt><dd>{result.finalMana.currentMana} / {result.finalMana.maximumMana}</dd></div>
              <div><dt>Automatic Results</dt><dd>{result.automaticEffects.length}</dd></div>
              <div><dt>Manual Results</dt><dd>{result.manualEffects.length}</dd></div>
            </dl>
            {result.automaticEffects.length > 0 ? (
              <div className="spell-cast-dialog__section">
                <h4>Automatic bookkeeping applied</h4>
                <ol>{result.automaticEffects.map((effect) => (
                  <li key={effect.applicationKey}><strong>{effect.targetName}</strong> — {effect.summary}</li>
                ))}</ol>
              </div>
            ) : null}
            {result.manualEffects.length > 0 ? (
              <div className="spell-cast-dialog__section is-manual">
                <h4>Manual G.O.D. resolution required</h4>
                {result.manualEffects.map((effect) => (
                  <article key={effect.spellEffectId}>
                    <strong>{effect.title}</strong>
                    <p>{effect.description}</p>
                  </article>
                ))}
              </div>
            ) : null}
            <button type="button" className="spell-cast-dialog__primary" onClick={onClose}>Done</button>
          </section>
        ) : plan ? (
          <>
            <div className={`spell-cast-dialog__status is-${plan.status}`}>
              <strong>{statusLabel(plan.status)}</strong>
              <span>{previewDirty ? "Selections changed — refresh the preview before casting." : "This preview has not changed Active State."}</span>
            </div>

            <dl className="spell-cast-dialog__facts">
              <div><dt>Caster</dt><dd>{plan.caster.name}</dd></div>
              <div><dt>Casting System</dt><dd>{plan.caster.system}</dd></div>
              <div><dt>Practitioner Level</dt><dd>{plan.caster.practitionerLevel}</dd></div>
              <div><dt>Circumstance</dt><dd>{plan.castingCircumstance}</dd></div>
              <div><dt>Current Mana</dt><dd>{plan.currentMana} / {plan.maximumMana}</dd></div>
              <div><dt>Final Mana Cost</dt><dd>{plan.finalManaCost}</dd></div>
              <div><dt>Mana After Cast</dt><dd>{plan.manaAfterCast}</dd></div>
              <div><dt>Initiative Cost</dt><dd>{plan.finalInitiativeCost}</dd></div>
              <div><dt>Out-of-Combat Time</dt><dd>{plan.finalOutOfCombatCastingTimeSeconds}s</dd></div>
              {plan.activeProgressiveTier ? <div><dt>Active Progressive Tier</dt><dd>{plan.activeProgressiveTier}</dd></div> : null}
            </dl>

            {plan.warnings.length > 0 ? (
              <div className="spell-cast-dialog__section is-warning">
                <h3>Warnings</h3>
                <ul>{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : null}
            {plan.issues.length > 0 ? (
              <div className="spell-cast-dialog__section is-error">
                <h3>{plan.status === "needs-selection" ? "Required selections" : "Cast issues"}</h3>
                <ul>{plan.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            ) : null}

            {plan.targetGroups.length > 0 ? (
              <div className="spell-cast-dialog__section">
                <h3>Automatic effects</h3>
                <ol>{plan.automaticEffects.map((effect) => (
                  <li key={effect.spellEffectId}>
                    {effect.summary}
                    {effect.targetGroupId ? ` · Target group ${effect.targetGroupId}` : ""}
                  </li>
                ))}</ol>
              </div>
            ) : null}

            {plan.targetGroups.length > 0 ? (
              <div className="spell-cast-dialog__section">
                <h3>Runtime target groups</h3>
                {plan.targetGroups.map((group) => {
                  const selectedIds = selections.targetGroups[group.id] ?? group.selectedTargetIds;
                  const atCapacity = group.capacity !== null && selectedIds.length >= group.capacity;
                  return (
                    <fieldset key={group.id} className="spell-cast-dialog__target-group">
                      <legend>{group.label}</legend>
                      <p>
                        {[group.rangeLabel, group.shapeLabel].filter(Boolean).join(" · ") || "No range detail"}
                        {group.kind === "aoe" ? " · Human-selected affected Characters; geometry is not automated." : ""}
                      </p>
                      <small>
                        {group.selfTargeted
                          ? `Self range resolves to ${plan.caster.name}.`
                          : group.capacity === null
                            ? "Select every Character the table determines is affected."
                            : `Choose 1–${group.capacity} Character${group.capacity === 1 ? "" : "s"}.`}
                      </small>
                      {group.selfTargeted ? null : (
                        <div className="spell-cast-dialog__target-options">
                          {(preparation?.targetOptions ?? []).map((option) => {
                            const checked = selectedIds.includes(option.characterId);
                            return (
                              <label key={option.characterId}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!checked && atCapacity}
                                  onChange={(event) => selectTarget(group.id, option.characterId, event.target.checked)}
                                />
                                <span>{option.name}{option.isNpc ? ` · ${option.npcKind} NPC` : " · PC"}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            ) : null}

            {plan.automaticApplications.length > 0 ? (
              <div className="spell-cast-dialog__section">
                <h3>Automatic effects</h3>
                <ol className="spell-cast-dialog__applications">
                  {plan.automaticApplications.map((application) => {
                    const target = plan.targetResults.find(({ characterId }) => (
                      characterId === application.targetCharacterId
                    ));
                    const selection = selections.applications[application.applicationKey];
                    const value = selection?.hitLocationNumber !== null && selection?.hitLocationNumber !== undefined
                      ? `hit:${selection.hitLocationNumber}`
                      : selection?.poolKey
                        ? `pool:${selection.poolKey}`
                        : "";
                    const needsLocation = application.plan.requirements.includes("hit-location-or-hp-pool");
                    const needsPool = application.plan.requirements.includes("hp-pool");
                    return (
                      <li key={application.applicationKey}>
                        <div><strong>{application.targetName}</strong><span>{application.plan.summary}</span></div>
                        {target && (needsLocation || needsPool) ? (
                          <label>
                            <span>{needsLocation ? "Exact hit location or HP Pool" : "HP Pool"}</span>
                            <select value={value} onChange={(event) => setApplicationSelection(application.applicationKey, event.target.value)}>
                              <option value="">Choose from {application.targetName}&apos;s anatomy</option>
                              {needsLocation ? target.anatomy.hitLocations.map((location) => (
                                <option key={`hit:${location.result}`} value={`hit:${location.result}`}>
                                  Roll {location.result}: {location.name} → {location.poolName}
                                </option>
                              )) : null}
                              {target.anatomy.pools.map((pool) => (
                                <option key={`pool:${pool.key}`} value={`pool:${pool.key}`}>HP Pool: {pool.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {application.plan.missingSelections.length > 0 ? (
                          <small>Still needed: {application.plan.missingSelections.join(", ")}</small>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            {plan.manualEffects.length > 0 ? (
              <div className="spell-cast-dialog__section is-manual">
                <h3>Manual effects</h3>
                {plan.manualEffects.map((effect) => (
                  <article key={effect.spellEffectId}>
                    <strong>{effect.title}</strong>
                    <p>{effect.description}</p>
                  </article>
                ))}
              </div>
            ) : null}

            <footer className="spell-cast-dialog__actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void preview()}>
                {busy ? "Recalculating…" : "Refresh Preview"}
              </button>
              <button
                type="button"
                className="spell-cast-dialog__primary"
                disabled={busy || previewDirty || !plan.ready}
                onClick={() => void execute()}
              >
                {confirmationLabel ?? `Confirm · Spend ${plan.finalManaCost} Mana`}
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
