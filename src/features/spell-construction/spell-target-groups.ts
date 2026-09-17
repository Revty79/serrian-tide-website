import { rulesById } from "./data/spellRules";
import type { AdaptedSpellMechanicalEffect } from "./mechanical-effects-adapter";
import type { SpellContainer } from "./models/spell";

export type SpellTargetGroupKind = "target" | "aoe";

export type SpellTargetGroup = Readonly<{
  id: string;
  kind: SpellTargetGroupKind;
  containerPath: readonly string[];
  label: string;
  rangeLabel: string | null;
  shapeLabel: string | null;
  capacity: number | null;
  selfTargeted: boolean;
  automaticEffectIds: readonly string[];
}>;

type ContainerLocation = Readonly<{
  container: SpellContainer;
  path: readonly string[];
}>;

export type SpellTargetGroupAnalysis = Readonly<{
  groups: readonly SpellTargetGroup[];
  groupByEffectId: ReadonlyMap<string, string>;
}>;

function locateContainers(containers: readonly SpellContainer[]): Map<string, ContainerLocation> {
  const locations = new Map<string, ContainerLocation>();
  const visit = (container: SpellContainer, ancestors: readonly string[]) => {
    const path = [...ancestors, container.id];
    locations.set(container.id, { container, path });
    container.children.forEach((child) => visit(child, path));
  };
  containers.forEach((container) => visit(container, []));
  return locations;
}

function targetContainerFor(
  effect: AdaptedSpellMechanicalEffect,
  locations: ReadonlyMap<string, ContainerLocation>,
): ContainerLocation | null {
  for (const containerId of [...effect.containerPath].reverse()) {
    const location = locations.get(containerId);
    if (location && (location.container.containerRuleId === "target" || location.container.containerRuleId === "aoe")) {
      return location;
    }
  }
  return null;
}

export function analyzeSpellTargetGroups(
  spell: { containers: readonly SpellContainer[] },
  effects: readonly AdaptedSpellMechanicalEffect[],
): SpellTargetGroupAnalysis {
  const locations = locateContainers(spell.containers);
  const effectsByGroup = new Map<string, string[]>();
  const groupLocations = new Map<string, ContainerLocation>();
  const groupByEffectId = new Map<string, string>();

  for (const effect of effects) {
    const location = targetContainerFor(effect, locations);
    if (!location) continue;
    const groupId = location.container.id;
    groupByEffectId.set(effect.spellEffectId, groupId);
    groupLocations.set(groupId, location);
    effectsByGroup.set(groupId, [...(effectsByGroup.get(groupId) ?? []), effect.spellEffectId]);
  }

  const groups = [...effectsByGroup].map(([groupId, automaticEffectIds]) => {
    const location = groupLocations.get(groupId)!;
    const { container, path } = location;
    const kind: SpellTargetGroupKind = container.containerRuleId === "aoe" ? "aoe" : "target";
    const rangeRule = container.rangeRuleId ? rulesById.ranges.get(container.rangeRuleId) : null;
    const shapeRule = container.shape ? rulesById.shapes.get(container.shape.ruleId) : null;
    return {
      id: groupId,
      kind,
      containerPath: path,
      label: `${kind === "aoe" ? "AoE" : "Target"} container`,
      rangeLabel: rangeRule?.name ?? null,
      shapeLabel: shapeRule
        ? `${shapeRule.name}${container.shape && container.shape.quantity > 0 ? ` +${container.shape.quantity}` : ""}`
        : null,
      capacity: kind === "target" ? 1 + Math.max(0, container.multiTarget?.additionalTargets ?? 0) : null,
      selfTargeted: kind === "target" && container.rangeRuleId === "self",
      automaticEffectIds,
    } satisfies SpellTargetGroup;
  });

  return { groups, groupByEffectId };
}
