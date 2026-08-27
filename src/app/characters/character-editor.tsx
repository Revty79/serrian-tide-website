"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import "./character-sheet.css";

import { getAllowedRaceForCharacter, saveCharacter } from "./actions";
import { CharacterSheet } from "./character-sheet";
import {
  getCharacterCreationTabs,
  type CharacterCreationTab,
} from "@/features/characters/character-creation";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
  type CharacterReadiness,
  type CharacterSkillReference,
} from "@/features/characters/models";
import {
  SPECIAL_ABILITY_EFFECTIVE_MAXIMUM,
  canAccessSupernaturalSkillAtLevel,
  characterAggregateToDraft,
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributePointsUsed,
  getAttributeRollTarget,
  getBaseInitiative,
  getCharacterHp,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillGroupKey,
  getCharacterSkillRanks,
  getCreationPurchasedSkillMaximum,
  getEffectiveSkillPoints,
  getMovementInitiative,
  getPurchasedSkillMaximum,
  getRaceAttributeCap,
  getRacialSkillGrant,
  getSkillPointsUsed,
  getSkillRank,
  getSkillRollTarget,
  getSkillTierLabel,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  getStartingFundsRemaining,
  hasSkillPoints,
  isSkillAllowedByCampaign,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
  reconcileRacialSkillAnchors,
  removeSkillAllocationDescendants,
  requiresCastingLevel,
  type CharacterManaProfile,
} from "@/features/characters/character-rules";
import {
  formatCampaignMoney,
  getCampaignMoneyBreakdown,
  getCanonicalCreditsFromHoldings,
  getStoredCampaignMoneyBreakdown,
} from "@/features/characters/currency-rules";
import { getCharacterWeaponDamage } from "@/features/characters/character-sheet-rules";

type EquipmentFilter = "all" | "weapon" | "armor" | "general" | "inventory";

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value: number): string {
  return value > 0 ? `+${displayNumber(value)}` : displayNumber(value);
}

function numericValue(value: string, fallback = 0): number {
  if (!value.trim()) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function allocationFor(
  draft: CharacterDraft,
  skillId: number,
  parentDraftId: number | null,
) {
  return draft.skillAllocations.find(
    (allocation) =>
      allocation.skillId === skillId && allocation.parentDraftId === parentDraftId,
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "character-field character-field--wide" : "character-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function OptionalNumber({
  value,
  onChange,
  ...props
}: {
  value: number | null;
  onChange: (value: number | null) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      type="number"
      value={value ?? ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? null : Number(event.target.value))
      }
    />
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  wide?: boolean;
}) {
  return (
    <header
      className={wide ? "character-section-heading character-field--wide" : "character-section-heading"}
    >
      <div>
        <p>{eyebrow}</p>
        <h2 className="font-sans">{title}</h2>
      </div>
      {detail ? <span>{detail}</span> : null}
    </header>
  );
}

type SkillBranchProps = {
  skill: CharacterSkillReference;
  rootSkill: CharacterSkillReference;
  parentDraftId: number | null;
  parentRank: number | null;
  depth: number;
  visited: ReadonlySet<number>;
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  ranks: ReadonlyMap<number, number>;
  childrenByParent: ReadonlyMap<number, CharacterSkillReference[]>;
  selectedRace: CharacterRaceAggregate | null;
  administrativeOverride: boolean;
  enforceCampaignTierLimits: boolean;
  manaProfiles: readonly CharacterManaProfile[];
  disabled: boolean;
  onPointsChange: (
    skillId: number,
    parentDraftId: number | null,
    points: number,
  ) => void;
  onShowDescription: (skill: CharacterSkillReference) => void;
};

function SkillBranch({
  skill,
  rootSkill,
  parentDraftId,
  parentRank,
  depth,
  visited,
  aggregate,
  draft,
  ranks,
  childrenByParent,
  selectedRace,
  administrativeOverride,
  enforceCampaignTierLimits,
  manaProfiles,
  disabled,
  onPointsChange,
  onShowDescription,
}: SkillBranchProps) {
  if (visited.has(skill.id)) return null;
  const racialGrant = getRacialSkillGrant(selectedRace, skill.id);
  if (
    !isSkillAllowedByCampaign(
      skill,
      rootSkill,
      aggregate.campaign.allowedSystems,
      enforceCampaignTierLimits,
      racialGrant.granted,
    )
  ) {
    return null;
  }

  const allocation = allocationFor(draft, skill.id, parentDraftId);
  const points = allocation?.points ?? 0;
  const effectivePoints = getEffectiveSkillPoints(points, selectedRace, skill.id);
  const hasPoints = hasSkillPoints(effectivePoints);
  const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
  const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
  const rank = hasPoints && allocation
    ? ranks.get(allocation.draftId) ?? 0
    : hasPoints
      ? getSkillRank(
          effectivePoints,
          attributeKey ? getAttributeModifier(attributeScore) : 0,
          parentRank,
          skill.tier,
        )
      : 0;
  const unlockThreshold = getSkillUnlockThreshold(
    rootSkill,
    aggregate.campaign.pointsToUnlockNextTier,
  );
  const nextVisited = new Set(visited).add(skill.id);
  const children = childrenByParent.get(skill.id) ?? [];
  const magicSystem = getCharacterMagicSystem(rootSkill);
  const spellAccessLevel = magicSystem
    ? manaProfiles.find((profile) => profile.system === magicSystem)?.spellAccessLevel ?? null
    : null;
  const visibleChildren = children.filter(
    (child) =>
      (effectivePoints >= unlockThreshold ||
        getRacialSkillGrant(selectedRace, child.id).granted) &&
      (administrativeOverride ||
        canAccessSupernaturalSkillAtLevel(child, rootSkill, spellAccessLevel)),
  );
  const hiddenSpellCount =
    children.filter((child) => requiresCastingLevel(child, rootSkill)).length -
    visibleChildren.filter((child) => requiresCastingLevel(child, rootSkill)).length;
  const maxPurchased = administrativeOverride
    ? getPurchasedSkillMaximum(
        skill,
        aggregate.campaign.maxPointsInSkill,
        racialGrant.minimum,
      )
    : getCreationPurchasedSkillMaximum(
        skill,
        aggregate.campaign.maxStartingSkill,
        aggregate.campaign.maxPointsInSkill,
        racialGrant.minimum,
      );
  const maxTotal = racialGrant.minimum + maxPurchased;
  const rollTarget = !hasPoints
    ? null
    : attributeKey
      ? getSkillRollTarget(attributeScore, rank)
      : isSpecialAbilitySkill(skill)
        ? getSpecialAbilityRollTarget(rank)
        : null;

  return (
    <div
      className="character-skill-branch"
      style={{ "--skill-depth": depth } as CSSProperties}
    >
      <div className="character-skill-row">
        <div className="character-skill-row__identity">
          <div>
            <strong>{skill.name}</strong>
            <button
              type="button"
              aria-label={`Read ${skill.name} description`}
              title={`Read ${skill.name} description`}
              onClick={() => onShowDescription(skill)}
            >
              ?
            </button>
          </div>
          <span>
            {getSkillTierLabel(skill)}
            {skill.manaCost !== null ? ` · ${displayNumber(skill.manaCost)} Mana` : ""}
            {attributeKey ? ` · ${attributeKey}` : ""}
            {racialGrant.granted
              ? racialGrant.minimum > 0
                ? ` · Racial +${displayNumber(racialGrant.minimum)}`
                : " · Racially granted"
              : ""}
          </span>
        </div>
        <label>
          <span>{racialGrant.granted ? "Total Points" : "Points"}</span>
          <input
            aria-label={`${skill.name} Points Invested`}
            type="number"
            min={racialGrant.minimum}
            max={maxTotal}
            step={1}
            disabled={disabled}
            value={effectivePoints}
            onChange={(event) =>
              onPointsChange(
                skill.id,
                parentDraftId,
                Math.max(0, numericValue(event.target.value) - racialGrant.minimum),
              )
            }
          />
          {racialGrant.granted ? <small>{displayNumber(points)} purchased</small> : null}
        </label>
        <div><span>Rank</span><strong>{displayNumber(rank)}</strong></div>
        <div><span>Roll Target</span><strong>{rollTarget === null ? "N/A" : `${displayNumber(rollTarget)}%`}</strong></div>
      </div>
      {allocation && visibleChildren.length > 0 ? (
        <div className="character-skill-children">
          {visibleChildren.map((child) => (
            <SkillBranch
              key={`${allocation.draftId}:${child.id}`}
              skill={child}
              rootSkill={rootSkill}
              parentDraftId={allocation.draftId}
              parentRank={rank}
              depth={depth + 1}
              visited={nextVisited}
              aggregate={aggregate}
              draft={draft}
              ranks={ranks}
              childrenByParent={childrenByParent}
              selectedRace={selectedRace}
              administrativeOverride={administrativeOverride}
              enforceCampaignTierLimits={enforceCampaignTierLimits}
              manaProfiles={manaProfiles}
              disabled={disabled}
              onPointsChange={onPointsChange}
              onShowDescription={onShowDescription}
            />
          ))}
        </div>
      ) : null}
      {allocation && !administrativeOverride && hiddenSpellCount > 0 ? (
        <p className="character-spell-access-note">
          Higher-level {magicSystem ?? "supernatural"} spells remain hidden at{" "}
          {spellAccessLevel ?? "Below Apprentice"} spell access.
        </p>
      ) : null}
    </div>
  );
}

export function CharacterEditor({
  initialAggregate,
  godMode,
  backHref,
  backLabel = "Back",
}: {
  initialAggregate: CharacterAggregate;
  godMode: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const nextDraftId = useRef(-1_000_000);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [selectedRace, setSelectedRace] = useState(initialAggregate.selectedRace);
  const [draft, setDraft] = useState<CharacterDraft>(() => {
    const initial = characterAggregateToDraft(initialAggregate);
    let initialDraftId = -1;
    return {
      ...initial,
      skillAllocations: reconcileRacialSkillAnchors(
        initial.skillAllocations,
        initialAggregate.selectedRace,
        initialAggregate.skillRelationships,
        () => initialDraftId--,
      ),
    };
  });
  const [activeTab, setActiveTab] = useState<CharacterCreationTab>(() =>
    godMode ? "god" : initialAggregate.profile.creationCompletedAt ? "sheet" : "identity",
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [raceLoading, setRaceLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [describedSkill, setDescribedSkill] = useState<CharacterSkillReference | null>(null);
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentFilter>("all");
  const [activeSkillGroup, setActiveSkillGroup] = useState("STR");

  const playerLocked = !godMode && Boolean(aggregate.profile.creationCompletedAt);
  const enforceCampaignTierLimits = !godMode && !aggregate.profile.creationCompletedAt;
  const isNpc = aggregate.character.isNpc;
  const returnHref = backHref ?? (godMode ? "/heavens" : "/realms");
  const visibleTabs = getCharacterCreationTabs(godMode);
  const readiness = useMemo(
    () => evaluateCharacterReadiness(draft, aggregate, selectedRace),
    [aggregate, draft, selectedRace],
  );
  const manaProfiles = useMemo(
    () => getCharacterManaProfiles(draft, aggregate.skillCatalog, selectedRace),
    [aggregate.skillCatalog, draft, selectedRace],
  );
  const ranks = useMemo(
    () => getCharacterSkillRanks(draft, aggregate.skillCatalog, selectedRace),
    [aggregate.skillCatalog, draft, selectedRace],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const childrenByParent = useMemo(() => {
    const result = new Map<number, CharacterSkillReference[]>();
    const skills = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
    for (const relationship of aggregate.skillRelationships) {
      if (relationship.relationshipType.toLowerCase() !== "parent") continue;
      const child = skills.get(relationship.skillId);
      if (!child) continue;
      const children = result.get(relationship.relatedSkillId) ?? [];
      if (!children.some((candidate) => candidate.id === child.id)) children.push(child);
      result.set(relationship.relatedSkillId, children);
    }
    for (const children of result.values()) {
      children.sort((left, right) => left.name.localeCompare(right.name));
    }
    return result;
  }, [aggregate.skillCatalog, aggregate.skillRelationships]);

  const skillGroups = useMemo(() => {
    const childIds = new Set(
      aggregate.skillRelationships
        .filter((relationship) => relationship.relationshipType.toLowerCase() === "parent")
        .map((relationship) => relationship.skillId),
    );
    const groups = new Map<string, CharacterSkillReference[]>();
    for (const skill of aggregate.skillCatalog) {
      if (childIds.has(skill.id) || (skill.tier !== null && skill.tier > 1)) continue;
      if (
        !isSkillAllowedByCampaign(
          skill,
          skill,
          aggregate.campaign.allowedSystems,
          enforceCampaignTierLimits,
          getRacialSkillGrant(selectedRace, skill.id).granted,
        )
      ) continue;
      const key = getCharacterSkillGroupKey(skill);
      const rows = groups.get(key) ?? [];
      rows.push(skill);
      groups.set(key, rows);
    }
    return [
      ...CHARACTER_ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: CHARACTER_ATTRIBUTE_LABELS[key],
        skills: (groups.get(key) ?? []).sort((left, right) => left.name.localeCompare(right.name)),
      })),
      { key: "SPECIAL", label: "Special Abilities", skills: (groups.get("SPECIAL") ?? []).sort((left, right) => left.name.localeCompare(right.name)) },
      { key: "OTHER", label: "Other Skills", skills: (groups.get("OTHER") ?? []).sort((left, right) => left.name.localeCompare(right.name)) },
    ].filter((group) => group.skills.length > 0);
  }, [aggregate, enforceCampaignTierLimits, selectedRace]);

  function change(updater: (current: CharacterDraft) => CharacterDraft) {
    if (playerLocked) return;
    setDraft((current) => updater(current));
    setDirty(true);
    setFeedback(null);
  }

  async function chooseRace(value: string) {
    if (playerLocked) return;
    if (!value) {
      setSelectedRace(null);
      change((current) => ({
        ...current,
        profile: { ...current.profile, raceId: null },
        skillAllocations: reconcileRacialSkillAnchors(current.skillAllocations, null, aggregate.skillRelationships, () => nextDraftId.current--),
      }));
      return;
    }
    setRaceLoading(true);
    setFeedback(null);
    try {
      const race = await getAllowedRaceForCharacter(aggregate.character.id, Number(value), godMode);
      setSelectedRace(race);
      change((current) => {
        const attributes = { ...current.attributes };
        for (const key of CHARACTER_ATTRIBUTE_KEYS) {
          const cap = getRaceAttributeCap(race, key);
          if (cap !== null) attributes[key] = Math.min(attributes[key], cap);
        }
        return {
          ...current,
          attributes,
          profile: { ...current.profile, raceId: race.race.id },
          skillAllocations: reconcileRacialSkillAnchors(current.skillAllocations, race, aggregate.skillRelationships, () => nextDraftId.current--),
        };
      });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The selected Race could not be loaded." });
    } finally {
      setRaceLoading(false);
    }
  }

  function setAttribute(key: CharacterAttributeKey, requested: number) {
    if (playerLocked) return;
    const otherPoints = getAttributePointsUsed(draft) - draft.attributes[key];
    const budgetMaximum = Math.max(0, aggregate.campaign.attributePoints - otherPoints);
    const cap = getRaceAttributeCap(selectedRace, key);
    const maximum = godMode ? Number.MAX_SAFE_INTEGER : cap === null ? budgetMaximum : Math.min(budgetMaximum, cap);
    const value = Math.min(Math.max(0, requested), maximum);
    change((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
  }

  function getRootSkillForPath(skillId: number, parentDraftId: number | null) {
    let rootSkillId = skillId;
    let cursor = parentDraftId;
    const visited = new Set<number>();
    while (cursor !== null && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = draft.skillAllocations.find((allocation) => allocation.draftId === cursor);
      if (!parent) break;
      rootSkillId = parent.skillId;
      cursor = parent.parentDraftId;
    }
    return aggregate.skillCatalog.find((skill) => skill.id === rootSkillId) ?? null;
  }

  function setSkillPoints(skillId: number, parentDraftId: number | null, requested: number) {
    if (playerLocked) return;
    const currentAllocation = allocationFor(draft, skillId, parentDraftId);
    const currentPoints = currentAllocation?.points ?? 0;
    const skill = aggregate.skillCatalog.find((candidate) => candidate.id === skillId);
    if (!skill) return;
    const racialGrant = getRacialSkillGrant(selectedRace, skillId);
    const remainingWithCurrent = aggregate.campaign.skillPoints - getSkillPointsUsed(draft) + currentPoints;
    const rulesMaximum = godMode
      ? getPurchasedSkillMaximum(skill, aggregate.campaign.maxPointsInSkill, racialGrant.minimum)
      : getCreationPurchasedSkillMaximum(skill, aggregate.campaign.maxStartingSkill, aggregate.campaign.maxPointsInSkill, racialGrant.minimum);
    const maximum = Math.min(rulesMaximum, godMode ? rulesMaximum : Math.max(0, remainingWithCurrent));
    const points = Math.min(Math.max(0, requested), maximum);
    const rootSkill = getRootSkillForPath(skillId, parentDraftId);
    const unlockThreshold = rootSkill ? getSkillUnlockThreshold(rootSkill, aggregate.campaign.pointsToUnlockNextTier) : aggregate.campaign.pointsToUnlockNextTier;

    change((current) => {
      let allocations = [...current.skillAllocations];
      const existing = allocationFor(current, skillId, parentDraftId);
      if (!existing && (points > 0 || racialGrant.minimum > 0)) {
        allocations.push({ draftId: nextDraftId.current--, skillId, parentDraftId, points });
      } else if (existing && points <= 0) {
        if (racialGrant.minimum > 0) {
          if (racialGrant.minimum < unlockThreshold) allocations = removeSkillAllocationDescendants(allocations, existing.draftId);
          allocations = allocations.map((allocation) => allocation.draftId === existing.draftId ? { ...allocation, points: 0 } : allocation);
        } else {
          allocations = removeSkillAllocationDescendants(allocations, existing.draftId).filter((allocation) => allocation.draftId !== existing.draftId);
        }
      } else if (existing) {
        allocations = allocations.map((allocation) => allocation.draftId === existing.draftId ? { ...allocation, points } : allocation);
        if (points + racialGrant.minimum < unlockThreshold) allocations = removeSkillAllocationDescendants(allocations, existing.draftId);
      }
      return { ...current, skillAllocations: allocations };
    });
  }

  function currentFunds() {
    return godMode || Boolean(aggregate.profile.creationCompletedAt)
      ? draft.profile.creditsRemaining
      : getStartingFundsRemaining(draft, aggregate.campaign.startingCreditAmount);
  }

  function characterPurse(canonicalCredits = currentFunds()) {
    return godMode || Boolean(aggregate.profile.creationCompletedAt)
      ? getStoredCampaignMoneyBreakdown(canonicalCredits, aggregate.campaign.currencySystem, aggregate.campaign.derivedCurrencies, draft.currencyHoldings)
      : getCampaignMoneyBreakdown(canonicalCredits, aggregate.campaign.currencySystem, aggregate.campaign.derivedCurrencies);
  }

  function campaignMoney(canonicalCredits: number) {
    return formatCampaignMoney(canonicalCredits, aggregate.campaign.currencySystem, aggregate.campaign.derivedCurrencies);
  }

  function changeItemQuantity(itemId: number, requestedQuantity: number) {
    if (playerLocked) return;
    const catalogItem = aggregate.authorizedItems.find((item) => item.id === itemId);
    if (!catalogItem || (catalogItem.credits !== null && catalogItem.credits < 0)) return;
    const existing = draft.items.find((item) => item.itemId === itemId);
    const unitCostCredits = catalogItem.credits ?? existing?.unitCostCredits ?? 0;
    if (!godMode && catalogItem.credits === null) return;
    const spentWithoutItem = draft.items.filter((item) => item.itemId !== itemId).reduce((sum, item) => sum + item.quantity * item.unitCostCredits, 0);
    const maximumQuantity = godMode ? Number.MAX_SAFE_INTEGER : catalogItem.credits === 0 ? 999 : Math.floor((aggregate.campaign.startingCreditAmount - spentWithoutItem) / unitCostCredits);
    const quantity = Math.min(Math.max(0, Math.trunc(requestedQuantity)), maximumQuantity);
    change((current) => ({
      ...current,
      items: quantity === 0
        ? current.items.filter((item) => item.itemId !== itemId)
        : existing
          ? current.items.map((item) => item.itemId === itemId ? { ...item, quantity, unitCostCredits } : item)
          : [...current.items, { itemId, quantity, unitCostCredits }],
    }));
  }

  function changeAdministrativeNumber(field: "fame" | "experience" | "totalExperience" | "quintessence" | "totalQuintessence" | "creditsRemaining", value: number) {
    if (!godMode) return;
    change((current) => ({ ...current, profile: { ...current.profile, [field]: Math.max(0, value) } }));
  }

  function changeCurrency(currencyId: number, requested: number) {
    if (!godMode) return;
    const purse = characterPurse(draft.profile.creditsRemaining);
    const currencyHoldings = purse.entries.map((entry) => ({ currencyId: entry.id, quantity: entry.id === currencyId ? Math.max(0, Math.trunc(requested)) : entry.quantity }));
    const creditsRemaining = getCanonicalCreditsFromHoldings(aggregate.campaign.derivedCurrencies, currencyHoldings);
    change((current) => ({ ...current, profile: { ...current.profile, creditsRemaining }, currencyHoldings }));
  }

  async function persist(completeCreation = false) {
    if (saving || playerLocked) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCharacter(aggregate.character.id, draft, completeCreation, godMode);
      const savedDraft = characterAggregateToDraft(saved);
      setAggregate(saved);
      setSelectedRace(saved.selectedRace);
      setDraft({
        ...savedDraft,
        skillAllocations: reconcileRacialSkillAnchors(savedDraft.skillAllocations, saved.selectedRace, saved.skillRelationships, () => nextDraftId.current--),
      });
      setDirty(false);
      setConfirmCompletion(false);
      if (completeCreation) setActiveTab("sheet");
      setFeedback({
        kind: "success",
        message: completeCreation
          ? "Character creation is complete. The Player creation record is now permanently locked."
          : godMode ? "G.O.D. changes were saved to the Character record." : "Character draft saved.",
      });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Character could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  const statusPurse = characterPurse();

  return (
    <main className="character-page">
      <header className="character-header">
        <Link href={returnHref} className="font-evanescent character-logo" onClick={(event) => { if (dirty) { event.preventDefault(); setConfirmExit(true); } }}>SERRIAN<br />TIDE</Link>
        <div className="character-header__identity">
          <p>{isNpc ? "THE HEAVENS / NPC ADMINISTRATION" : godMode ? "THE HEAVENS / CHARACTER ADMINISTRATION" : "THE REALMS / CHARACTER CREATION"}</p>
          <h1 className="font-sans">{isNpc ? "Edit NPC" : godMode ? "Edit Character" : "Character Creation"}</h1>
          <span>Campaign: {aggregate.campaign.name} · {isNpc ? "Record: NPC" : `Player: ${aggregate.character.playerUsername}`} · Character: {draft.name || "New Character"}</span>
        </div>
        <div className="character-header__actions"><Link href={returnHref} onClick={(event) => { if (dirty) { event.preventDefault(); setConfirmExit(true); } }}>← {backLabel}</Link></div>
      </header>

      <section className="character-status-strip" aria-live="polite">
        <div><span>Attributes</span><strong>{displayNumber(readiness.attributesUsed)}{isNpc ? " total" : ` / ${displayNumber(aggregate.campaign.attributePoints)}`}</strong></div>
        <div><span>Skills</span><strong>{displayNumber(readiness.skillPointsUsed)}{isNpc ? " invested" : ` / ${displayNumber(aggregate.campaign.skillPoints)}`}</strong></div>
        <div><span>Race</span><strong>{readiness.raceComplete ? "✓" : "—"}</strong></div>
        <div><span>Story</span><strong>{readiness.storyComplete ? "✓" : "—"}</strong></div>
        <div><span>Equipment</span><strong>{readiness.equipmentComplete ? "✓" : "—"}</strong></div>
        <div><span>{godMode ? "Current Funds" : "Starting Funds"}</span><strong>{statusPurse.formatted}</strong></div>
        <div className="character-status-strip__state"><span>Status</span><strong>{godMode ? "G.O.D. Full Access" : playerLocked ? "Creation Complete" : readiness.ready ? "Character Ready" : "Character Draft"}</strong><small>{dirty ? "Unsaved changes" : "Saved record"}</small></div>
        {!playerLocked ? <div className="character-status-strip__actions"><button type="button" disabled={saving || !dirty} onClick={() => void persist(false)}>{saving ? "Saving…" : isNpc ? "Save NPC" : "Save Character"}</button>{!isNpc && readiness.ready && !aggregate.profile.creationCompletedAt ? <button type="button" className="is-primary" disabled={saving} onClick={() => setConfirmCompletion(true)}>Complete Character</button> : null}</div> : null}
      </section>

      {feedback ? <p className={`character-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

      <div className="character-workspace">
        <nav className="character-tabs" aria-label="Character creation sections">
          {visibleTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)}><span>{tab.label}</span>{tabStatus(tab.id, readiness) ? <i>✓</i> : null}</button>)}
        </nav>
        <section className="character-editor">
          {godMode ? <aside className="character-admin-notice"><strong>G.O.D. administrative access is active.</strong><span>You may edit the full record even after Player creation is complete.</span></aside> : playerLocked ? <aside className="character-admin-notice is-locked"><strong>Character creation is complete.</strong><span>Identity, Attributes, starting Skills, Story, and starting Equipment are read-only.</span></aside> : null}
          {activeTab === "identity" ? <IdentityTab draft={draft} aggregate={aggregate} selectedRace={selectedRace} disabled={playerLocked} godMode={godMode} raceLoading={raceLoading} onChange={change} onChooseRace={chooseRace} /> : null}
          {activeTab === "attributes" ? <AttributesTab draft={draft} aggregate={aggregate} race={selectedRace} disabled={playerLocked} godMode={godMode} onSetAttribute={setAttribute} /> : null}
          {activeTab === "skills" ? <SkillsTab draft={draft} aggregate={aggregate} race={selectedRace} disabled={playerLocked} godMode={godMode} enforceCampaignTierLimits={enforceCampaignTierLimits} ranks={ranks} manaProfiles={manaProfiles} childrenByParent={childrenByParent} skillGroups={skillGroups} activeSkillGroup={activeSkillGroup} onSelectSkillGroup={setActiveSkillGroup} onSetSkillPoints={setSkillPoints} onShowDescription={setDescribedSkill} /> : null}
          {activeTab === "story" ? <StoryTab draft={draft} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "equipment" ? <EquipmentTab draft={draft} aggregate={aggregate} disabled={playerLocked} godMode={godMode} filter={equipmentFilter} search={equipmentSearch} purse={characterPurse()} onFilter={setEquipmentFilter} onSearch={setEquipmentSearch} onQuantityChange={changeItemQuantity} campaignMoney={campaignMoney} /> : null}
          {activeTab === "god" && godMode ? <GodControlsTab draft={draft} aggregate={aggregate} purse={characterPurse(draft.profile.creditsRemaining)} onNumberChange={changeAdministrativeNumber} onCurrencyChange={changeCurrency} /> : null}
          {activeTab === "sheet" ? <CharacterSheet aggregate={aggregate} draft={draft} selectedRace={selectedRace} ready={readiness.ready} /> : null}
          {!godMode && !playerLocked && !readiness.ready && readiness.issues.length ? <aside className="character-issues"><h3>Before this Character is ready</h3><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></aside> : null}
        </section>
      </div>

      {confirmCompletion ? <div className="character-dialog-backdrop" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="complete-character-title"><h2 id="complete-character-title">Complete this Character?</h2><p>This permanently locks Player Character creation. Later changes use their controlled workflows.</p><div><button type="button" onClick={() => setConfirmCompletion(false)}>Keep Editing</button><button type="button" className="is-primary" disabled={saving} onClick={() => void persist(true)}>Complete Character</button></div></section></div> : null}
      {confirmExit ? <div className="character-dialog-backdrop" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="exit-character-title"><h2 id="exit-character-title">Unsaved changes</h2><p>Leave this Character and discard the changes you have not saved?</p><div><button type="button" onClick={() => setConfirmExit(false)}>Keep Editing</button><Link href={returnHref}>Discard Changes</Link></div></section></div> : null}
      {describedSkill ? <div className="character-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDescribedSkill(null); }}><section className="character-skill-description" role="dialog" aria-modal="true" aria-labelledby="skill-description-title"><header><div><p>SKILL DESCRIPTION</p><h2 id="skill-description-title">{describedSkill.name}</h2></div><button type="button" aria-label="Close Skill description" onClick={() => setDescribedSkill(null)}>×</button></header><div className="character-skill-description__facts"><span>{getSkillTierLabel(describedSkill)}</span>{describedSkill.primaryAttribute ? <span>Primary: {normalizeSkillAttributeKey(describedSkill.primaryAttribute) ?? describedSkill.primaryAttribute}</span> : null}{describedSkill.secondaryAttribute ? <span>Secondary: {normalizeSkillAttributeKey(describedSkill.secondaryAttribute) ?? describedSkill.secondaryAttribute}</span> : null}{describedSkill.spellLevel ? <span>Spell Level: {describedSkill.spellLevel}</span> : null}{describedSkill.manaCost !== null ? <span>Mana Cost: {displayNumber(describedSkill.manaCost)}</span> : null}</div><p>{describedSkill.definition.trim() || "No description is currently recorded for this Skill."}</p><footer><button type="button" onClick={() => setDescribedSkill(null)}>Close</button></footer></section></div> : null}
    </main>
  );
}

function tabStatus(tab: CharacterCreationTab, readiness: CharacterReadiness) {
  if (tab === "identity") return readiness.identityComplete && readiness.raceComplete;
  if (tab === "attributes") return readiness.attributesComplete;
  if (tab === "skills") return readiness.skillsComplete;
  if (tab === "story") return readiness.storyComplete;
  if (tab === "equipment") return readiness.equipmentComplete;
  if (tab === "god") return true;
  return readiness.ready;
}

function IdentityTab({ draft, aggregate, selectedRace, disabled, godMode, raceLoading, onChange, onChooseRace }: { draft: CharacterDraft; aggregate: CharacterAggregate; selectedRace: CharacterRaceAggregate | null; disabled: boolean; godMode: boolean; raceLoading: boolean; onChange: (updater: (current: CharacterDraft) => CharacterDraft) => void; onChooseRace: (value: string) => Promise<void> }) {
  const profile = draft.profile;
  const setProfile = (update: Partial<CharacterDraft["profile"]>) => onChange((current) => ({ ...current, profile: { ...current.profile, ...update } }));
  const race = selectedRace?.race;
  return <div className="character-section character-form-grid">
    <SectionHeading eyebrow="PERSONAL RECORD" title="Identity" detail="Fields marked Required determine readiness." wide />
    <Field label={`${aggregate.character.isNpc ? "NPC Name" : "Character Name"} · Required`}><input disabled={disabled} value={draft.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} /></Field>
    <Field label={aggregate.character.isNpc ? "Record Type" : "Player"}><input readOnly value={aggregate.character.isNpc ? "Non-Player Character" : aggregate.character.playerUsername} /></Field>
    <Field label="Campaign"><input readOnly value={aggregate.campaign.name} /></Field>
    <Field label="Race · Required"><select disabled={disabled || raceLoading} value={draft.profile.raceId ?? ""} onChange={(event) => void onChooseRace(event.target.value)}><option value="">Choose a Campaign Race</option>{aggregate.allowedRaces.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
    <Field label="Age · Required"><OptionalNumber disabled={disabled} min={0} value={profile.age} onChange={(age) => setProfile({ age })} /></Field>
    <Field label="Sex · Required"><input disabled={disabled} value={profile.sex} onChange={(event) => setProfile({ sex: event.target.value })} /></Field>
    <div className="character-height-field"><span>Height · Required</span><div><Field label="Feet"><OptionalNumber aria-label="Height in feet" disabled={disabled} min={0} step={1} value={profile.heightFeet} onChange={(heightFeet) => setProfile({ heightFeet: heightFeet === null ? null : Math.max(0, Math.trunc(heightFeet)) })} /></Field><Field label="Inches"><OptionalNumber aria-label="Additional height in inches" disabled={disabled} min={0} max={11} step={1} value={profile.heightInches} onChange={(heightInches) => setProfile({ heightInches: heightInches === null ? null : Math.min(11, Math.max(0, Math.trunc(heightInches))) })} /></Field></div></div>
    <Field label="Weight · Required"><OptionalNumber disabled={disabled} min={0} step="0.01" value={profile.weight} onChange={(weight) => setProfile({ weight })} /></Field>
    <Field label="Skin Color · Required"><input disabled={disabled} value={profile.skinColor} onChange={(event) => setProfile({ skinColor: event.target.value })} /></Field>
    <Field label="Eye Color · Required"><input disabled={disabled} value={profile.eyeColor} onChange={(event) => setProfile({ eyeColor: event.target.value })} /></Field>
    <Field label="Hair Color · Required"><input disabled={disabled} value={profile.hairColor} onChange={(event) => setProfile({ hairColor: event.target.value })} /></Field>
    <Field label="Deity · Required"><input disabled={disabled} value={profile.deity} placeholder="Enter None if the Character has no deity" onChange={(event) => setProfile({ deity: event.target.value })} /></Field>
    <Field label={`Fate Points${aggregate.campaign.fatePointMethod === "Rolled" && !godMode ? " · Rolled Result · Required" : ""}`}><OptionalNumber disabled={disabled || (!godMode && aggregate.campaign.fatePointMethod === "Assigned")} min={0} step={1} value={profile.fatePoints} onChange={(fatePoints) => setProfile({ fatePoints: fatePoints === null ? null : Math.max(0, Math.trunc(fatePoints)) })} /><small>{aggregate.campaign.fatePointMethod === "Assigned" ? `Assigned by this Campaign${godMode ? "; G.O.D. may override it" : ""}.` : "Enter the result rolled for this Character."}</small></Field>
    <Field label="Defining Marks & Character Quirks · Required" wide><textarea disabled={disabled} rows={3} value={profile.definingMarks} placeholder="Enter None if there are no defining marks or quirks" onChange={(event) => setProfile({ definingMarks: event.target.value })} /></Field>
    {race ? <section className="character-race-card character-field--wide"><header><div><p>RACE RECORD</p><h3>{race.name}</h3></div></header><div className="character-race-summary"><div><span>Size</span><strong>{race.size || "Not recorded"}</strong></div><div><span>Base Magic</span><strong>{race.baseMagic ?? "Not recorded"}</strong></div><div className="is-wide"><span>Racial Quirk</span><strong>{race.racialQuirkName || "None recorded"}</strong><small>{[race.quirkSuccessEffect, race.quirkFailureEffect].filter(Boolean).join(" · ")}</small></div></div><div className="character-race-grid"><section><h4>Movement Modes</h4>{selectedRace.movementModes.length ? selectedRace.movementModes.map((mode) => <p key={mode.movementMode}>{mode.movementMode} · Base {displayNumber(mode.baseValue)}{mode.notes ? ` · ${mode.notes}` : ""}</p>) : <p>No movement modes recorded.</p>}</section><section><h4>Racial Skill Links</h4>{selectedRace.skillLinks.length ? selectedRace.skillLinks.map((link) => <p key={`${link.skillId}:${link.linkType}`}>{link.skillName} · {link.linkType}{link.value === null ? "" : ` ${displayNumber(link.value)}`}</p>) : <p>No racial Skill links recorded.</p>}</section></div></section> : null}
  </div>;
}

function AttributesTab({ draft, aggregate, race, disabled, godMode, onSetAttribute }: { draft: CharacterDraft; aggregate: CharacterAggregate; race: CharacterRaceAggregate | null; disabled: boolean; godMode: boolean; onSetAttribute: (key: CharacterAttributeKey, value: number) => void }) {
  const used = getAttributePointsUsed(draft);
  return <div className="character-section"><SectionHeading eyebrow="CAMPAIGN ALLOCATION" title="Attributes" detail={godMode ? `${displayNumber(used)} total points` : `${displayNumber(used)} used · ${displayNumber(aggregate.campaign.attributePoints - used)} remaining`} />{!race ? <p className="character-notice">Choose a Race to apply its recorded Attribute caps. Missing Race caps are never replaced with an invented maximum.</p> : null}<div className="character-attribute-grid">{CHARACTER_ATTRIBUTE_KEYS.map((key) => { const score = draft.attributes[key]; const cap = getRaceAttributeCap(race, key); return <article key={key}><header><div><span>{key}</span><h3>{CHARACTER_ATTRIBUTE_LABELS[key]}</h3></div><small>{cap === null ? "No recorded cap" : `Race cap ${displayNumber(cap)}`}</small></header><label><span>Score</span><input aria-label={`${CHARACTER_ATTRIBUTE_LABELS[key]} Score`} disabled={disabled} type="number" min={0} step={1} value={score} onChange={(event) => onSetAttribute(key, numericValue(event.target.value))} /></label><dl><div><dt>Modifier</dt><dd>{signedNumber(getAttributeModifier(score))}</dd></div><div><dt>Roll Target</dt><dd>{displayNumber(getAttributeRollTarget(score))}%</dd></div></dl></article>; })}</div><div className="character-derived-strip"><div><span>HP Total</span><strong>{displayNumber(getCharacterHp(draft.attributes.CON))}</strong></div><div><span>Base Initiative</span><strong>{displayNumber(getBaseInitiative(draft.attributes.DEX))}</strong></div>{race?.movementModes.map((mode) => <div key={mode.movementMode}><span>{mode.movementMode} Initiative</span><strong>{displayNumber(getMovementInitiative(draft.attributes.DEX, mode.baseValue))}</strong></div>)}</div></div>;
}

function SkillsTab({ draft, aggregate, race, disabled, godMode, enforceCampaignTierLimits, ranks, manaProfiles, childrenByParent, skillGroups, activeSkillGroup, onSelectSkillGroup, onSetSkillPoints, onShowDescription }: { draft: CharacterDraft; aggregate: CharacterAggregate; race: CharacterRaceAggregate | null; disabled: boolean; godMode: boolean; enforceCampaignTierLimits: boolean; ranks: ReadonlyMap<number, number>; manaProfiles: readonly CharacterManaProfile[]; childrenByParent: ReadonlyMap<number, CharacterSkillReference[]>; skillGroups: Array<{ key: string; label: string; skills: CharacterSkillReference[] }>; activeSkillGroup: string; onSelectSkillGroup: (group: string) => void; onSetSkillPoints: (skillId: number, parentDraftId: number | null, points: number) => void; onShowDescription: (skill: CharacterSkillReference) => void }) {
  const used = getSkillPointsUsed(draft);
  const selectedGroup = skillGroups.find((group) => group.key === activeSkillGroup) ?? skillGroups[0];
  const activeManaProfiles = manaProfiles.filter((profile) => aggregate.campaign.allowedSystems.includes(profile.system));
  return <div className="character-section"><SectionHeading eyebrow="CURRENT SKILL CATALOG" title="Skills & Abilities" detail={godMode ? `${displayNumber(used)} invested points` : `${displayNumber(used)} / ${displayNumber(aggregate.campaign.skillPoints)} points`} /><div className="character-rule-ledger"><span>Max Starting Points per Skill <strong>{displayNumber(aggregate.campaign.maxStartingSkill)}</strong></span><span>Unlock Next Tier <strong>{displayNumber(aggregate.campaign.pointsToUnlockNextTier)}</strong><small>Supernatural systems require 1.</small></span><span>Standard Skill Maximum <strong>{displayNumber(aggregate.campaign.maxPointsInSkill)}</strong></span><span>Special Ability Maximum <strong>{displayNumber(SPECIAL_ABILITY_EFFECTIVE_MAXIMUM)}</strong></span><span>Allowed <strong>{aggregate.campaign.allowedSystems.join(" · ") || "None"}</strong></span></div><p className="character-notice">A nested Skill appears beneath each valid parent path. Only Campaign-authorized tiers and systems are shown.</p>{activeManaProfiles.length ? <section className="character-mana-ledger"><header><div><p>SUPERNATURAL CAPACITY</p><h3>Mana & Spell Access</h3></div><span>Base Magic {displayNumber(race?.race.baseMagic ?? 0)}</span></header><div>{activeManaProfiles.map((profile) => <article key={profile.system}><span>{profile.system}</span><strong>{displayNumber(profile.manaPool)} Mana</strong><small>{profile.spellAccessLevel ?? "Below Apprentice"} spell access · {displayNumber(profile.sourceSkillPoints)} {profile.sourceSkillName}</small>{profile.nextLevel && profile.nextRequiredMana !== null ? <em>{displayNumber(profile.nextRequiredMana - profile.manaPool)} more Mana to unlock {profile.nextLevel} spells</em> : <em>All spell levels unlocked</em>}</article>)}</div></section> : null}{!aggregate.campaign.allowedSystems.includes("Special Abilities") ? <p className="character-notice">General Special Ability purchasing is disabled. Racially granted Special Abilities still appear and may be improved.</p> : null}<nav className="character-skill-group-tabs" role="tablist" aria-label="Skill Attribute groups">{skillGroups.map((group) => <button key={group.key} type="button" role="tab" aria-selected={selectedGroup?.key === group.key} className={selectedGroup?.key === group.key ? "is-active" : ""} onClick={() => onSelectSkillGroup(group.key)}><span>{group.label}</span><small>{group.skills.length}</small></button>)}</nav><div className="character-skill-groups" role="tabpanel">{selectedGroup ? <section className="character-skill-group"><header><span>{selectedGroup.label}</span><small>{selectedGroup.skills.length} root {selectedGroup.skills.length === 1 ? "Skill" : "Skills"}</small></header><div>{selectedGroup.skills.map((skill) => <SkillBranch key={skill.id} skill={skill} rootSkill={skill} parentDraftId={null} parentRank={null} depth={0} visited={new Set()} aggregate={aggregate} draft={draft} ranks={ranks} childrenByParent={childrenByParent} selectedRace={race} administrativeOverride={godMode} enforceCampaignTierLimits={enforceCampaignTierLimits} manaProfiles={manaProfiles} disabled={disabled} onPointsChange={onSetSkillPoints} onShowDescription={onShowDescription} />)}</div></section> : <p className="character-notice">This Campaign does not currently authorize any root Skills.</p>}</div></div>;
}

function StoryTab({ draft, disabled, onChange }: { draft: CharacterDraft; disabled: boolean; onChange: (updater: (current: CharacterDraft) => CharacterDraft) => void }) {
  const fields = [["personality", "Personality Summary"], ["goals", "Goals"], ["secrets", "Secrets"], ["backstory", "Backstory"], ["motivations", "Motivations"]] as const;
  return <div className="character-section"><SectionHeading eyebrow="REQUIRED NARRATIVE RECORD" title="Story & Personality" detail="Every field is required before completion." /><div className="character-story-grid">{fields.map(([field, label]) => <Field key={field} label={`${label} · Required`}><textarea disabled={disabled} rows={field === "backstory" ? 8 : 5} value={draft.profile[field]} onChange={(event) => onChange((current) => ({ ...current, profile: { ...current.profile, [field]: event.target.value } }))} /></Field>)}</div></div>;
}

function EquipmentTab({ draft, aggregate, disabled, godMode, filter, search, purse, onFilter, onSearch, onQuantityChange, campaignMoney }: { draft: CharacterDraft; aggregate: CharacterAggregate; disabled: boolean; godMode: boolean; filter: EquipmentFilter; search: string; purse: ReturnType<typeof getCampaignMoneyBreakdown>; onFilter: (filter: EquipmentFilter) => void; onSearch: (search: string) => void; onQuantityChange: (itemId: number, quantity: number) => void; campaignMoney: (credits: number) => string }) {
  const normalizedSearch = search.trim().toLowerCase();
  const options: Array<[EquipmentFilter, string]> = [["all", "All Items"], ["weapon", "Weapons"], ["armor", "Armor"], ["general", "General Equipment"], ["inventory", "Inventory"]];
  const matchesFilter = (item: CharacterAggregate["authorizedItems"][number], target: EquipmentFilter) => target === "all" || (target === "inventory" && item.catalogScope.toLowerCase() === "inventory") || item.equipmentGroup?.toLowerCase() === target;
  const available = aggregate.authorizedItems.filter((item) => matchesFilter(item, filter) && (!normalizedSearch || [item.name, item.canonicalId, item.category, item.recordType, item.description, item.weaponType, item.damageType, item.ammunitionItemName, item.ammunitionDamageType, item.armorType, item.coverage].some((value) => value?.toLowerCase().includes(normalizedSearch))));
  const remaining = godMode ? draft.profile.creditsRemaining : getStartingFundsRemaining(draft, aggregate.campaign.startingCreditAmount);
  return <div className="character-section"><SectionHeading eyebrow="CAMPAIGN-AUTHORIZED CATALOG" title="Starting Equipment Store" detail={`${purse.formatted} ${godMode ? "currently held" : "remaining"}`} />{aggregate.campaign.currencySystem === "Derived Currency" ? <><div className="character-currency-ledger">{purse.entries.map((currency) => <div key={currency.id}><strong>{displayNumber(currency.quantity)} {currency.name}</strong><span>{currency.description || "Campaign currency"}</span></div>)}</div>{!purse.fullyRepresented ? <p className="character-notice">The configured denominations cannot exactly represent this balance.</p> : null}</> : null}<div className="character-equipment-toolbar"><Field label="Search permitted Items"><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Name, ID, category, damage, armor, or type" /></Field><nav>{options.map(([value, label]) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => onFilter(value)}><span>{label}</span><strong>{aggregate.authorizedItems.filter((item) => matchesFilter(item, value)).length}</strong></button>)}</nav></div>{!godMode && !draft.items.some((owned) => aggregate.authorizedItems.find((item) => item.id === owned.itemId)?.catalogScope.toLowerCase() === "equipment") ? <p className="character-notice">Purchase at least one Equipment item before completing Character creation. Inventory supplies alone do not satisfy starting equipment.</p> : null}<div className="character-equipment-list">{available.map((item) => {
    const owned = draft.items.find((row) => row.itemId === item.id); const quantity = owned?.quantity ?? 0; const details: Array<[string, string]> = []; const damageProfile = getCharacterWeaponDamage(item);
    if (item.weaponType) details.push(["Weapon", item.weaponType]); if (item.handedness) details.push(["Hands", item.handedness]); if (damageProfile.damage) details.push(["Damage", `${damageProfile.damage}${damageProfile.damageType ? ` ${damageProfile.damageType}` : ""}`]); if (damageProfile.sourceName) details.push(["Ammunition", damageProfile.sourceName]); if (item.rangeText) details.push(["Range", item.rangeText]); if (item.reachText) details.push(["Reach", item.reachText]); if (item.armorType) details.push(["Armor", item.armorType]); if (item.coverage) details.push(["Coverage", item.coverage]); if (item.baseSoak !== null) details.push(["Base Soak", displayNumber(item.baseSoak)]); if (item.armorDamageModifiers) details.push(["Damage Modifiers", item.armorDamageModifiers]); if (item.weight !== null) details.push(["Weight", `${displayNumber(item.weight)} ${item.weightUnit}`.trim()]); if (item.durability !== null) details.push(["Durability", displayNumber(item.durability)]);
    return <article key={item.id} className={quantity > 0 ? "is-owned" : ""}><div className="character-equipment-list__identity"><p>{item.canonicalId} · {item.recordType}</p><h3>{item.name}</h3><span>{item.category}{item.equipmentGroup ? ` · ${item.equipmentGroup}` : " · Inventory"}</span>{item.description ? <small>{item.description}</small> : null}</div>{details.length ? <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="character-equipment-list__empty">No additional mechanics recorded.</p>}{item.weaponRulesText || item.armorRulesText ? <p className="character-equipment-list__rules">{item.weaponRulesText || item.armorRulesText}</p> : null}<div className="character-equipment-list__purchase"><div><span>Cost</span><strong>{item.credits === null ? "Not priced" : campaignMoney(item.credits)}</strong><small>{item.priceBasis}</small></div><label><span>Owned</span><input aria-label={`${item.name} Quantity`} type="number" min={0} step={1} disabled={disabled || (!godMode && item.credits === null)} value={quantity} onChange={(event) => onQuantityChange(item.id, numericValue(event.target.value))} /></label><button type="button" disabled={disabled || (!godMode && (item.credits === null || (item.credits > remaining && quantity === 0)))} onClick={() => onQuantityChange(item.id, quantity + 1)}>Buy One</button></div></article>;
  })}{!available.length ? <p className="character-notice">No Campaign-authorized Items match this search.</p> : null}</div></div>;
}

function GodControlsTab({ draft, aggregate, purse, onNumberChange, onCurrencyChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; purse: ReturnType<typeof getCampaignMoneyBreakdown>; onNumberChange: (field: "fame" | "experience" | "totalExperience" | "quintessence" | "totalQuintessence" | "creditsRemaining", value: number) => void; onCurrencyChange: (currencyId: number, quantity: number) => void }) {
  const fields = [["fame", "Fame"], ["experience", "Available Experience"], ["totalExperience", "Lifetime Experience"], ["quintessence", "Available Quintessence"], ["totalQuintessence", "Lifetime Quintessence"]] as const;
  return <div className="character-section"><SectionHeading eyebrow="ADMINISTRATIVE OVERRIDE" title="G.O.D. Controls" detail="Changes apply to the permanent Character record." /><p className="character-notice">Identity, Attributes, Skills, Story, and Equipment remain editable from their normal tabs, even after Character creation is complete.</p><div className="character-god-grid">{fields.map(([field, label]) => <Field key={field} label={label}><input type="number" min={0} step={1} value={draft.profile[field]} onChange={(event) => onNumberChange(field, numericValue(event.target.value))} /></Field>)}</div><section className="character-god-currency"><header><div><p>CURRENT CAMPAIGN MONEY</p><h3>{purse.formatted}</h3></div><span>Saved independently from inventory changes.</span></header>{aggregate.campaign.currencySystem === "Credits" ? <Field label="Current Credits"><input type="number" min={0} step="0.01" value={draft.profile.creditsRemaining} onChange={(event) => onNumberChange("creditsRemaining", numericValue(event.target.value))} /></Field> : purse.entries.length ? <div className="character-god-grid">{purse.entries.map((currency) => <Field key={currency.id} label={currency.name}><input type="number" min={0} step={1} value={currency.quantity} onChange={(event) => onCurrencyChange(currency.id, numericValue(event.target.value))} /><small>{currency.description || "Campaign currency"}</small></Field>)}</div> : <p className="character-notice">This Campaign has no usable derived Currency denominations.</p>}{!purse.fullyRepresented ? <p className="character-notice">The configured denominations do not exactly represent the stored balance.</p> : null}</section></div>;
}
