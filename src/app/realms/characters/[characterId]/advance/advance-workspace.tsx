"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  advanceCharacterSkills,
  spendCharacterQuintessence,
} from "@/app/characters/actions";
import {
  buildCharacterAdvancementPlan,
  getInitialAdvancementAllocations,
  setProjectedSkillNumber,
  type CharacterAdvancementTreeEntry,
} from "@/features/characters/character-advancement-rules";
import {
  getRaceAttributeCap,
  SPECIAL_ABILITY_EFFECTIVE_MAXIMUM,
} from "@/features/characters/character-rules";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterSkillAllocationDraft,
} from "@/features/characters/models";
import {
  ATTRIBUTE_QUINTESSENCE_COST,
  EXPERIENCE_PER_QUINTESSENCE,
  FATE_POINT_QUINTESSENCE_COST,
  getExperienceFromQuintessence,
  getMaximumQuintessenceAttributeIncrease,
  getQuintessenceCost,
  type CharacterQuintessencePurchaseType,
} from "@/features/characters/quintessence-rules";

import { AdvancementSkillTree } from "./advancement-skill-tree";

type AdvancementMode = "paths" | "experience" | "quintessence";
type PendingQuintessencePurchase = {
  purchaseType: CharacterQuintessencePurchaseType;
  quantity: number;
  attributeKey: CharacterAttributeKey | null;
};

function displayNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function AdvanceWorkspace({ initialAggregate }: { initialAggregate: CharacterAggregate }) {
  const nextDraftId = useRef(-1);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [mode, setMode] = useState<AdvancementMode>("paths");
  const [projectedAllocations, setProjectedAllocations] = useState<CharacterSkillAllocationDraft[]>(
    () => getInitialAdvancementAllocations(initialAggregate),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [reviewingExperience, setReviewingExperience] = useState(false);
  const [pendingQuintessence, setPendingQuintessence] = useState<PendingQuintessencePurchase | null>(null);
  const [attributeKey, setAttributeKey] = useState<CharacterAttributeKey>("STR");
  const [attributeQuantity, setAttributeQuantity] = useState(1);
  const [fateQuantity, setFateQuantity] = useState(1);
  const [experienceQuantity, setExperienceQuantity] = useState(1);

  const experiencePlan = useMemo(
    () => buildCharacterAdvancementPlan(aggregate, projectedAllocations),
    [aggregate, projectedAllocations],
  );
  const selectedAttributeValue = aggregate.attributes.find(
    (attribute) => attribute.attributeKey === attributeKey,
  )?.value ?? 0;
  const selectedAttributeRacialMaximum = getRaceAttributeCap(
    aggregate.selectedRace,
    attributeKey,
  );
  const maximumAttributeQuantity = getMaximumQuintessenceAttributeIncrease({
    quintessence: aggregate.profile.quintessence,
    currentAttributeValue: selectedAttributeValue,
    racialMaximum: selectedAttributeRacialMaximum,
  });
  const selectedAttributePurchaseQuantity = maximumAttributeQuantity < 1
    ? 0
    : Math.min(attributeQuantity, maximumAttributeQuantity);
  const maximumFateQuantity = Math.floor(
    aggregate.profile.quintessence / FATE_POINT_QUINTESSENCE_COST,
  );
  const maximumExperienceQuantity = Math.floor(aggregate.profile.quintessence);
  const pendingQuintessenceCost = pendingQuintessence
    ? getQuintessenceCost(
        pendingQuintessence.purchaseType,
        pendingQuintessence.quantity,
      )
    : 0;

  function resetExperiencePlan(nextAggregate = aggregate) {
    nextDraftId.current = -1;
    setProjectedAllocations(getInitialAdvancementAllocations(nextAggregate));
    setReviewingExperience(false);
  }

  function changeProjectedSkill(
    entry: CharacterAdvancementTreeEntry,
    requestedSkillNumber: number,
  ) {
    if (!Number.isFinite(requestedSkillNumber)) return;
    const next = setProjectedSkillNumber({
      aggregate,
      projectedAllocations,
      skillId: entry.skill.id,
      parentDraftId: entry.parentDraftId,
      requestedSkillNumber,
      newDraftId: nextDraftId.current--,
    });
    const nextPlan = buildCharacterAdvancementPlan(aggregate, next);
    if (nextPlan.totalExperienceCost > aggregate.profile.experience + 0.000_001) {
      setFeedback({
        kind: "error",
        message: `That plan would cost ${displayNumber(nextPlan.totalExperienceCost)} XP, but only ${displayNumber(aggregate.profile.experience)} XP is available.`,
      });
      return;
    }
    setFeedback(null);
    setProjectedAllocations(next);
  }

  async function confirmExperiencePlan() {
    if (!experiencePlan.entries.length || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await advanceCharacterSkills(
        aggregate.character.id,
        experiencePlan.entries.map((entry) => entry.request),
      );
      const spent = experiencePlan.totalExperienceCost;
      const changeCount = experiencePlan.entries.length;
      setAggregate(saved);
      resetExperiencePlan(saved);
      setFeedback({
        kind: "success",
        message: `${changeCount} Skill ${changeCount === 1 ? "advancement was" : "advancements were"} saved. ${displayNumber(spent)} Experience was spent and added to Lifetime Experience.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Advancement plan could not be saved.",
      });
      setReviewingExperience(false);
    } finally {
      setBusy(false);
    }
  }

  function beginQuintessencePurchase(purchase: PendingQuintessencePurchase) {
    const cost = getQuintessenceCost(purchase.purchaseType, purchase.quantity);
    if (cost > aggregate.profile.quintessence) return;
    setFeedback(null);
    setPendingQuintessence(purchase);
  }

  async function confirmQuintessencePurchase() {
    if (!pendingQuintessence || busy) return;
    const purchase = pendingQuintessence;
    const cost = getQuintessenceCost(purchase.purchaseType, purchase.quantity);
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await spendCharacterQuintessence(
        aggregate.character.id,
        purchase.purchaseType,
        purchase.quantity,
        purchase.attributeKey,
      );
      const result = purchase.purchaseType === "attribute"
        ? `${CHARACTER_ATTRIBUTE_LABELS[purchase.attributeKey!]} increased by ${purchase.quantity}.`
        : purchase.purchaseType === "fatePoints"
          ? `${purchase.quantity} Fate ${purchase.quantity === 1 ? "Point was" : "Points were"} added.`
          : `${getExperienceFromQuintessence(purchase.quantity)} available Experience was added.`;
      setAggregate(saved);
      resetExperiencePlan(saved);
      setPendingQuintessence(null);
      setAttributeQuantity(1);
      setFateQuantity(1);
      setExperienceQuantity(1);
      setFeedback({
        kind: "success",
        message: `${result} ${displayNumber(cost)} Quintessence was spent and added to Lifetime Quintessence.`,
      });
    } catch (error) {
      setPendingQuintessence(null);
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Quintessence purchase failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="character-page advance-page">
      <header className="character-header">
        <Link href="/realms" className="font-evanescent character-logo">SERRIAN<br />TIDE</Link>
        <div className="character-header__identity">
          <p>THE REALMS / CHARACTER ADVANCEMENT</p>
          <h1 className="font-sans">{aggregate.character.name}</h1>
          <span>{aggregate.campaign.name} · Permanent Character growth</span>
        </div>
        <div className="character-header__actions">
          <Link href="/realms">Return to Realms</Link>
          <Link href={`/realms/characters/${aggregate.character.id}`}>Character Sheet</Link>
        </div>
      </header>

      {mode !== "paths" ? (
        <div className="advancement-path-nav">
          <button type="button" disabled={busy} onClick={() => setMode("paths")}>← Advancement Paths</button>
          <span>{mode === "experience" ? "Spending Experience" : "Spending Quintessence"}</span>
        </div>
      ) : null}

      {feedback ? <p className={`character-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

      {mode === "paths" ? (
        <section className="advancement-choice" aria-labelledby="advancement-choice-heading">
          <header className="advancement-section-heading">
            <p>CHOOSE AN ADVANCEMENT PATH</p>
            <h2 id="advancement-choice-heading">How will {aggregate.character.name} grow?</h2>
            <span>Experience advances Skills. Quintessence improves Attributes, Fate, or available Experience.</span>
          </header>
          <div className="advancement-choice__cards">
            <button type="button" onClick={() => setMode("experience")}>
              <span className="advancement-choice__mark" aria-hidden="true">XP</span>
              <strong>Spend Experience</strong>
              <span>Improve owned Skills, reveal unlocked branches, and plan several advances before confirming.</span>
              <small>{displayNumber(aggregate.profile.experience)} Experience Available</small>
            </button>
            <button type="button" onClick={() => setMode("quintessence")}>
              <span className="advancement-choice__mark" aria-hidden="true">Q</span>
              <strong>Spend Quintessence</strong>
              <span>Increase Attributes, gain Fate Points, or convert Quintessence into available Experience.</span>
              <small>{displayNumber(aggregate.profile.quintessence)} Quintessence Available</small>
            </button>
          </div>
        </section>
      ) : null}

      {mode === "experience" ? (
        <section className="experience-workspace">
          <div className="advancement-ledger advancement-ledger--experience">
            <div><span>Available Experience</span><strong>{displayNumber(aggregate.profile.experience)}</strong></div>
            <div><span>Lifetime Experience</span><strong>{displayNumber(aggregate.profile.totalExperience)}</strong></div>
            <div><span>Planned XP Spending</span><strong>{displayNumber(experiencePlan.totalExperienceCost)}</strong></div>
            <div><span>XP After Advancement</span><strong>{displayNumber(experiencePlan.experienceRemaining)}</strong></div>
            <div><span>Standard Maximum</span><strong>{displayNumber(aggregate.campaign.maxPointsInSkill)}</strong></div>
            <div><span>Special Ability Maximum</span><strong>{displayNumber(SPECIAL_ABILITY_EFFECTIVE_MAXIMUM)}</strong></div>
          </div>

          <AdvancementSkillTree
            aggregate={aggregate}
            projectedAllocations={projectedAllocations}
            plan={experiencePlan}
            disabled={busy}
            onSkillNumberChange={changeProjectedSkill}
          />

          <div className="advancement-review-bar">
            <div>
              <span>{experiencePlan.entries.length ? `${experiencePlan.entries.length} planned Skill ${experiencePlan.entries.length === 1 ? "change" : "changes"}` : "No Skill changes planned"}</span>
              <strong>{displayNumber(experiencePlan.totalExperienceCost)} XP · {displayNumber(experiencePlan.experienceRemaining)} remaining</strong>
            </div>
            <button type="button" disabled={busy || !experiencePlan.entries.length} onClick={() => setReviewingExperience(true)}>Review Advancement</button>
            <button type="button" disabled={busy || !experiencePlan.entries.length} onClick={() => resetExperiencePlan()}>Cancel Plan</button>
          </div>
        </section>
      ) : null}

      {mode === "quintessence" ? (
        <section className="quintessence-workspace">
          <div className="advancement-ledger">
            <div><span>Available Quintessence</span><strong>{displayNumber(aggregate.profile.quintessence)}</strong></div>
            <div><span>Lifetime Quintessence</span><strong>{displayNumber(aggregate.profile.totalQuintessence)}</strong></div>
            <div><span>Available Experience</span><strong>{displayNumber(aggregate.profile.experience)}</strong></div>
            <div><span>Lifetime Experience</span><strong>{displayNumber(aggregate.profile.totalExperience)}</strong></div>
            <div><span>Fate Points</span><strong>{displayNumber(aggregate.profile.fatePoints ?? 0)}</strong></div>
          </div>
          <header className="advancement-section-heading">
            <p>SPEND QUINTESSENCE</p>
            <h2>Permanent Growth</h2>
            <span>Every successful purchase moves the Quintessence spent into Lifetime Quintessence.</span>
          </header>
          <div className="quintessence-purchases">
            <article className="quintessence-purchase">
              <div className="quintessence-purchase__heading"><span aria-hidden="true">A</span><div><strong>Attribute Advancement</strong><small>{ATTRIBUTE_QUINTESSENCE_COST} Q per +1</small></div></div>
              <p>Increase one core Attribute after Character Creation. {selectedAttributeRacialMaximum === null ? "No racial maximum is recorded for this Attribute." : `Racial maximum: ${displayNumber(selectedAttributeRacialMaximum)}.`}</p>
              <Field label="Attribute"><select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value as CharacterAttributeKey)}>{CHARACTER_ATTRIBUTE_KEYS.map((key) => <option key={key} value={key}>{CHARACTER_ATTRIBUTE_LABELS[key]}</option>)}</select></Field>
              <QuantityPicker label="Attribute points" value={selectedAttributePurchaseQuantity} maximum={maximumAttributeQuantity} onChange={setAttributeQuantity} disabledMessage={selectedAttributeRacialMaximum !== null && selectedAttributeValue >= selectedAttributeRacialMaximum - 0.000_001 ? `Racial maximum ${displayNumber(selectedAttributeRacialMaximum)} reached.` : undefined} displayZeroWhenDisabled />
              <div className="quintessence-purchase__result"><span>{CHARACTER_ATTRIBUTE_LABELS[attributeKey]}</span><strong>{displayNumber(selectedAttributeValue)} → {displayNumber(selectedAttributeValue + selectedAttributePurchaseQuantity)}</strong></div>
              <button type="button" disabled={busy || maximumAttributeQuantity < 1} onClick={() => beginQuintessencePurchase({ purchaseType: "attribute", quantity: selectedAttributePurchaseQuantity, attributeKey })}>{selectedAttributePurchaseQuantity > 0 ? `Review · ${getQuintessenceCost("attribute", selectedAttributePurchaseQuantity)} Q` : selectedAttributeRacialMaximum !== null && selectedAttributeValue >= selectedAttributeRacialMaximum - 0.000_001 ? "Racial Maximum Reached" : "Not Enough Quintessence"}</button>
            </article>

            <article className="quintessence-purchase">
              <div className="quintessence-purchase__heading"><span aria-hidden="true">F</span><div><strong>Fate Points</strong><small>{FATE_POINT_QUINTESSENCE_COST} Q per +1</small></div></div>
              <p>Gain additional Fate Points.</p>
              <QuantityPicker label="Fate Points" value={fateQuantity} maximum={maximumFateQuantity} onChange={setFateQuantity} />
              <div className="quintessence-purchase__result"><span>Fate Points</span><strong>{displayNumber(aggregate.profile.fatePoints ?? 0)} → {displayNumber((aggregate.profile.fatePoints ?? 0) + fateQuantity)}</strong></div>
              <button type="button" disabled={busy || maximumFateQuantity < 1} onClick={() => beginQuintessencePurchase({ purchaseType: "fatePoints", quantity: fateQuantity, attributeKey: null })}>Review · {getQuintessenceCost("fatePoints", fateQuantity)} Q</button>
            </article>

            <article className="quintessence-purchase">
              <div className="quintessence-purchase__heading"><span aria-hidden="true">XP</span><div><strong>Convert to Experience</strong><small>1 Q = {EXPERIENCE_PER_QUINTESSENCE} available XP</small></div></div>
              <p>Converted XP remains available; Lifetime Experience does not change until XP is spent.</p>
              <QuantityPicker label="Quintessence to convert" value={experienceQuantity} maximum={maximumExperienceQuantity} onChange={setExperienceQuantity} />
              <div className="quintessence-purchase__result"><span>Available Experience</span><strong>{displayNumber(aggregate.profile.experience)} → {displayNumber(aggregate.profile.experience + getExperienceFromQuintessence(experienceQuantity))}</strong></div>
              <button type="button" disabled={busy || maximumExperienceQuantity < 1} onClick={() => beginQuintessencePurchase({ purchaseType: "experience", quantity: experienceQuantity, attributeKey: null })}>Review · {getQuintessenceCost("experience", experienceQuantity)} Q</button>
            </article>
          </div>
        </section>
      ) : null}

      {reviewingExperience ? (
        <div className="advancement-dialog-backdrop" role="presentation">
          <section className="advancement-dialog advancement-dialog--review" role="dialog" aria-modal="true" aria-labelledby="experience-review-title">
            <p>REVIEW ADVANCEMENT</p>
            <h2 id="experience-review-title">Confirm the complete Skill plan</h2>
            <div className="advancement-review-table">
              <table>
                <thead><tr><th>Skill</th><th>Before</th><th>After</th><th>XP</th></tr></thead>
                <tbody>{experiencePlan.entries.map((entry) => <tr key={entry.key}><th>{entry.path}</th><td>{displayNumber(entry.before)}</td><td>{displayNumber(entry.after)}</td><td>{displayNumber(entry.experienceCost)}</td></tr>)}</tbody>
              </table>
            </div>
            <dl>
              <div><dt>Total XP</dt><dd>{displayNumber(experiencePlan.totalExperienceCost)}</dd></div>
              <div><dt>Available XP</dt><dd>{displayNumber(aggregate.profile.experience)} → {displayNumber(experiencePlan.experienceRemaining)}</dd></div>
              <div><dt>Lifetime XP</dt><dd>{displayNumber(aggregate.profile.totalExperience)} → {displayNumber(experiencePlan.lifetimeExperienceAfter)}</dd></div>
            </dl>
            <span>The server will recalculate and validate the whole plan before saving any part of it.</span>
            <div className="advancement-dialog__actions">
              <button type="button" disabled={busy} onClick={() => setReviewingExperience(false)}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirmExperiencePlan()}>{busy ? "Saving Advancement…" : `Confirm & Spend ${displayNumber(experiencePlan.totalExperienceCost)} XP`}</button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingQuintessence ? (
        <div className="advancement-dialog-backdrop" role="presentation">
          <section className="advancement-dialog" role="dialog" aria-modal="true" aria-labelledby="quintessence-review-title">
            <p>REVIEW QUINTESSENCE PURCHASE</p>
            <h2 id="quintessence-review-title">Confirm permanent growth</h2>
            <dl>
              <div><dt>Quintessence cost</dt><dd>{displayNumber(pendingQuintessenceCost)}</dd></div>
              <div><dt>Available Q</dt><dd>{displayNumber(aggregate.profile.quintessence)} → {displayNumber(aggregate.profile.quintessence - pendingQuintessenceCost)}</dd></div>
              <div><dt>Lifetime Q</dt><dd>{displayNumber(aggregate.profile.totalQuintessence)} → {displayNumber(aggregate.profile.totalQuintessence + pendingQuintessenceCost)}</dd></div>
              {pendingQuintessence.purchaseType === "experience" ? <div><dt>Lifetime XP</dt><dd>{displayNumber(aggregate.profile.totalExperience)} → {displayNumber(aggregate.profile.totalExperience)}</dd></div> : null}
            </dl>
            <span>This purchase is saved immediately after server validation.</span>
            <div className="advancement-dialog__actions">
              <button type="button" disabled={busy} onClick={() => setPendingQuintessence(null)}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirmQuintessencePurchase()}>{busy ? "Spending Quintessence…" : `Confirm & Spend ${displayNumber(pendingQuintessenceCost)} Q`}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="character-field"><span>{label}</span>{children}</label>;
}

function QuantityPicker({
  label,
  value,
  maximum,
  onChange,
  disabledMessage,
  displayZeroWhenDisabled = false,
}: {
  label: string;
  value: number;
  maximum: number;
  onChange: (value: number) => void;
  disabledMessage?: string;
  displayZeroWhenDisabled?: boolean;
}) {
  const disabled = maximum < 1;
  const displayedValue = disabled && displayZeroWhenDisabled ? 0 : value;
  const change = (requested: number) => {
    if (disabled) return;
    onChange(Math.min(maximum, Math.max(1, Math.trunc(requested))));
  };
  return (
    <div className="advancement-quantity">
      <span>{label}</span>
      <div>
        <button type="button" disabled={disabled || value <= 1} onClick={() => change(value - 1)}>−</button>
        <input type="number" min={disabled && displayZeroWhenDisabled ? 0 : 1} max={Math.max(1, maximum)} step={1} disabled={disabled} value={displayedValue} onFocus={(event) => event.currentTarget.select()} onChange={(event) => change(Number(event.target.value))} />
        <button type="button" disabled={disabled || value >= maximum} onClick={() => change(value + 1)}>+</button>
        <button type="button" disabled={disabled || value >= maximum} onClick={() => change(maximum)}>Max</button>
      </div>
      <small>{disabled ? disabledMessage ?? "Not enough Quintessence for one." : `Choose from 1 to ${maximum}.`}</small>
    </div>
  );
}
