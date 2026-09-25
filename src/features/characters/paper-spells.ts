import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { hasProgressiveSpellModifier, resolveProgressiveSpellForLevel } from "@/features/spell-construction/engine/progressiveSpell";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { serrianTideRules } from "@/features/spell-construction/data/spellRules";
import type { ActiveManaPool } from "@/features/active-state/active-mana";
import type { CharacterAggregate } from "./models";
import type { CharacterPrintData } from "./character-print";
import { resolveCharacterSpellCastingContext } from "./character-spell-casting";
import { planSpellCast } from "./character-spell-runtime";

/** Reuse the gameplay planner, with the saved caster's level and Known Spell context.
 * Target selection and effects are deliberately not executed by printing. */
export function buildPaperSpells(aggregate: CharacterAggregate, data: CharacterPrintData, pools: ActiveManaPool[]) {
  return data.spells.map((row) => {
    const catalog = data.skills.find((skill) => `catalog:${skill.id}` === row.key);
    const json = catalog?.spellDocumentJson ?? aggregate.personalSpellbook.find((spell) => `personal:${spell.id}` === row.key)?.documentJson;
    const document = parseSpellDocument(json!);
    const context = resolveCharacterSpellCastingContext(aggregate, document, catalog?.id);
    const mana = pools.find((pool) => pool.system === context?.system);
    const plan = mana?.spellAccessLevel && context ? planSpellCast({
      source: {kind: catalog ? "catalog" : "personal", identity: row.key, label: row.source, spell: document, circumstance: "have-spell"},
      caster: {characterId: aggregate.character.id, campaignId: aggregate.campaign.id, name: aggregate.character.name,
        system: context.system, practitionerLevel: mana.spellAccessLevel, mana},
    }) : null;
    const effective = mana?.spellAccessLevel && hasProgressiveSpellModifier(document)
      ? resolveProgressiveSpellForLevel(document, mana.spellAccessLevel).resolvedSpell : document;
    const calculation = calculateSpell(effective);
    const durationIds = new Set<string>();
    const visitDurations = (container: typeof effective.containers[number]) => {
      container.durations.forEach((duration) => durationIds.add(duration.id));
      container.children.forEach(visitDurations);
    };
    effective.containers.forEach(visitDurations);
    // These are the existing calculator's authored rule labels and descriptions,
    // without construction cost arithmetic. Keep component/concentration details.
    const rules = calculation.breakdown.filter((line) => line.category !== "container").map((line) => {
      const rule = [...serrianTideRules.effects, ...serrianTideRules.modifiers].find((entry) => entry.name === line.label);
      const detail = line.category === "modifier" ? line.detail?.replace(/^(Global|Container) modifier(?: · )?/, "")
        : line.detail === "Range" || line.detail === "Duration" ? "" : line.detail;
      const authored = line.category === "modifier"
        ? line.componentDescription?.replace(/\s*\((?:[−–-]\d+(?:\.\d+)?(?:\s*Mana)?|[+]?\d+(?:\.\d+)?\s*Mana)\)/gi, "") : line.componentDescription;
      const redundant = authored?.split(/,\s*/).every((name) => name === line.label || serrianTideRules.modifiers.some((modifier) => modifier.name === name));
      return { id: line.id, label: line.label, category: line.category, scope: line.path.join(" / "),
        compact: [detail, redundant ? "" : authored].filter(Boolean).join(". "),
        text: [...new Set([detail, redundant ? "" : authored, line.category === "effect" ? rule?.definition : "",
          ...(rule?.relatedRequirements.filter((requirement) => requirement.kind === "required").map((requirement) => requirement.guidance) ?? [])]
          .filter((part): part is string => !!part))].join(". ") };
    });
    return {...row, manaCost: plan?.finalManaCost ?? null, combatCastingTime: plan?.finalInitiativeCost ?? null,
      outOfCombatCastingTimeSeconds: plan?.finalOutOfCombatCastingTimeSeconds ?? null,
      practitionerLevel: mana?.spellAccessLevel ?? null, baseManaCost: row.manaCost, catalogManaCost: catalog?.manaCost ?? null,
      range: calculation.breakdown.filter((line) => line.id.endsWith(":range")).map((line) => line.label).join("; ") || "See authored effect",
      duration: [...new Set(calculation.breakdown.filter((line) => durationIds.has(line.id)).map((line) => `${line.label}${line.detail && line.detail !== "Duration" ? ` (${line.detail})` : ""}`))].join("; ") || "See authored effect",
      coreRules: rules.filter((rule) => !durationIds.has(rule.id) && (rule.category === "effect" || rule.category === "modifier" || (rule.category === "addon" && rule.compact))).map((rule) => plan?.automaticEffects.find((effect) => effect.spellEffectId === rule.id)?.summary ?? `${rule.label}${rule.compact && rule.compact !== rule.label ? `: ${rule.compact}` : ""}`),
      requiresGodRuling: !!plan?.manualEffects.length,
      rules, issues: plan ? [...plan.issues, ...plan.warnings] : ["No current casting context: playable cost and timing are unavailable."],
      requirements: rules.filter((rule) => rule.category === "modifier").map((rule) => `${rule.label}${rule.text ? `: ${rule.text}` : ""}`),
      effects: plan ? [...plan.automaticEffects.map((effect) => effect.summary), ...plan.manualEffects.map((effect) => `${serrianTideRules.effects.find((rule) => rule.id === effect.ruleId)?.name ?? effect.title}: G.O.D. resolution required.`)] : [],
    };
  });
}
