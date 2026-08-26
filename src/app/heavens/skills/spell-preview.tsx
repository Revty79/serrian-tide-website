import {
  SPELL_IDENTITY_BY_TRADITION,
  getSpellFrameworkName,
} from "@/features/spell-construction/data/spellIdentity";
import {
  rulesById,
  serrianTideRules,
} from "@/features/spell-construction/data/spellRules";
import {
  calculateModifierCost,
  calculateRuleCost,
  type SpellCalculation,
} from "@/features/spell-construction/engine/calculateSpell";
import { hasProgressiveSpellModifier } from "@/features/spell-construction/engine/progressiveSpell";
import type { ValidationResult } from "@/features/spell-construction/engine/validateSpell";
import type {
  ModifierSelection,
  ProgressiveChange,
  SpellContainer,
  SpellDocument,
} from "@/features/spell-construction/models/spell";
import {
  formatCalculationNumber,
  formatDurationSeconds,
} from "@/features/spell-construction/utilities/format";

function mana(cost: number) {
  return `${cost >= 0 ? "+" : ""}${formatCalculationNumber(cost)} Mana`;
}

function textOrFallback(value: string | undefined, fallback = "Not specified") {
  return value?.trim() || fallback;
}

function outOfCombatTime(seconds: number) {
  return formatDurationSeconds(seconds) ?? `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function modifierDetail(selection: ModifierSelection) {
  const rule = rulesById.modifiers.get(selection.ruleId);
  if (!rule) return `Quantity: ${selection.quantity}`;
  if (rule.stacking === "multiple" || rule.initiativePerQuantity !== undefined) {
    return `${rule.quantityLabel ?? "Quantity"}: ${selection.quantity}`;
  }
  return undefined;
}

function ModifierList({ selections }: { selections: ModifierSelection[] }) {
  if (selections.length === 0) {
    return <p className="skill-preview__empty">No modifiers attached.</p>;
  }
  return (
    <ul className="skill-preview__component-list">
      {selections.map((selection) => {
        const rule = rulesById.modifiers.get(selection.ruleId);
        const cost = rule ? calculateModifierCost(rule, selection.quantity) : 0;
        return (
          <li key={selection.id}>
            <div>
              <strong>{rule?.name ?? selection.ruleId}</strong>
              {modifierDetail(selection) ? <span>{modifierDetail(selection)}</span> : null}
              {selection.description ? <p>{selection.description}</p> : null}
            </div>
            <b className={cost < 0 ? "is-negative" : ""}>{mana(cost)}</b>
          </li>
        );
      })}
    </ul>
  );
}

function ContainerPreview({
  container,
  ordinal,
  depth,
}: {
  container: SpellContainer;
  ordinal: string;
  depth: number;
}) {
  const containerRule = rulesById.containers.get(container.containerRuleId);
  const containerCost = containerRule ? calculateRuleCost(containerRule.cost) : 0;
  const components: Array<{
    key: string;
    name: string;
    detail?: string;
    description?: string;
    cost: number;
  }> = container.effects.map((selection) => {
    const rule = rulesById.effects.get(selection.ruleId);
    return {
      key: selection.id,
      name: rule?.name ?? selection.ruleId,
      detail:
        rule?.cost.kind === "scalable"
          ? `${rule.quantityLabel ?? "Quantity"}: ${selection.quantity}`
          : undefined,
      description: selection.description,
      cost: rule ? calculateRuleCost(rule.cost, selection.quantity) : 0,
    };
  });

  if (container.rangeRuleId) {
    const rule = rulesById.ranges.get(container.rangeRuleId);
    components.push({
      key: `${container.id}:range`,
      name: `Range: ${rule?.name ?? container.rangeRuleId}`,
      description: container.rangeDescription,
      cost: rule ? calculateRuleCost(rule.cost) : 0,
    });
  }
  if (container.shape) {
    const rule = rulesById.shapes.get(container.shape.ruleId);
    components.push({
      key: container.shape.id,
      name: `Shape: ${rule?.name ?? container.shape.ruleId}`,
      detail:
        container.shape.quantity > 0
          ? `${rule?.incrementLabel ?? "Additional increments"}: ${container.shape.quantity}`
          : "Base shape",
      description: container.shape.description,
      cost: rule ? calculateRuleCost(rule.cost, container.shape.quantity) : 0,
    });
  }
  for (const duration of container.durations) {
    const rule = rulesById.durations.get(duration.ruleId);
    components.push({
      key: duration.id,
      name: `Duration: ${rule?.name ?? duration.ruleId}`,
      detail:
        rule?.quantitySemantics === "total-quantity"
          ? `${rule.quantityLabel ?? rule.incrementLabel ?? "Quantity"}: ${duration.quantity}`
          : undefined,
      description: duration.description,
      cost: rule ? calculateRuleCost(rule.cost, duration.quantity) : 0,
    });
  }
  if (container.multiTarget) {
    const selection = container.multiTarget;
    components.push({
      key: `${container.id}:multi-target`,
      name: serrianTideRules.multiTarget.name,
      detail: `Additional targets: ${selection.additionalTargets}`,
      description: selection.description,
      cost: calculateRuleCost(
        serrianTideRules.multiTarget.cost,
        selection.additionalTargets,
      ),
    });
  }

  return (
    <article className="skill-preview__container">
      <header>
        <div>
          <span>Container {ordinal} · Depth {depth}</span>
          <h6>{containerRule?.name ?? container.containerRuleId}</h6>
        </div>
        <b>{mana(containerCost)}</b>
      </header>
      <ul className="skill-preview__component-list">
        {components.map((component) => (
          <li key={component.key}>
            <div>
              <strong>{component.name}</strong>
              {component.detail ? <span>{component.detail}</span> : null}
              {component.description ? <p>{component.description}</p> : null}
            </div>
            <b>{mana(component.cost)}</b>
          </li>
        ))}
      </ul>
      {container.modifiers.length > 0 ? (
        <div className="skill-preview__container-modifiers">
          <h6>Container Modifiers</h6>
          <ModifierList selections={container.modifiers} />
        </div>
      ) : null}
      {container.children.map((child, index) => (
        <ContainerPreview
          key={child.id}
          container={child}
          ordinal={`${ordinal}.${index + 1}`}
          depth={depth + 1}
        />
      ))}
    </article>
  );
}

function progressiveChangeLabel(change: ProgressiveChange) {
  switch (change.kind) {
    case "add-container":
      return `Add ${rulesById.containers.get(change.container.containerRuleId)?.name ?? change.container.containerRuleId} container`;
    case "remove-container":
      return `Remove container ${change.containerId}`;
    case "set-container-rule":
      return `Set container to ${rulesById.containers.get(change.containerRuleId)?.name ?? change.containerRuleId}`;
    case "add-effect":
    case "set-effect":
      return `${change.kind === "add-effect" ? "Add" : "Update"} ${rulesById.effects.get(change.effect.ruleId)?.name ?? change.effect.ruleId}`;
    case "remove-effect":
      return `Remove effect ${change.effectId}`;
    case "set-range":
      return change.rangeRuleId
        ? `Set range to ${rulesById.ranges.get(change.rangeRuleId)?.name ?? change.rangeRuleId}`
        : "Remove range";
    case "set-shape":
      return change.shape
        ? `Set shape to ${rulesById.shapes.get(change.shape.ruleId)?.name ?? change.shape.ruleId}`
        : "Remove shape";
    case "add-duration":
    case "set-duration":
      return `${change.kind === "add-duration" ? "Add" : "Update"} ${rulesById.durations.get(change.duration.ruleId)?.name ?? change.duration.ruleId} duration`;
    case "remove-duration":
      return `Remove duration ${change.durationId}`;
    case "set-multi-target":
      return change.multiTarget
        ? `Set ${change.multiTarget.additionalTargets} additional targets`
        : "Remove Multi-Target";
    case "add-modifier":
    case "set-modifier":
      return `${change.kind === "add-modifier" ? "Add" : "Update"} ${rulesById.modifiers.get(change.modifier.ruleId)?.name ?? change.modifier.ruleId}`;
    case "remove-modifier":
      return `Remove modifier ${change.modifierId}`;
  }
}

function ProgressivePreview({ spell }: { spell: SpellDocument }) {
  if (!hasProgressiveSpellModifier(spell)) return null;
  return (
    <div className="skill-preview__detail-group">
      <h5>Progressive Spell</h5>
      <p className="skill-preview__policy">
        Original-base casting: later tiers change effectiveness without replacing the base Mana or casting time.
      </p>
      <div className="skill-preview__milestones">
        {spell.progressive.milestones.map((milestone) => (
          <article key={milestone.level}>
            <header><span>{milestone.level}</span><strong>{milestone.tierName}</strong></header>
            <dl>
              <div><dt>Condition</dt><dd>{textOrFallback(milestone.condition)}</dd></div>
              <div><dt>Description</dt><dd>{textOrFallback(milestone.description)}</dd></div>
              <div><dt>Notes</dt><dd>{textOrFallback(milestone.notes)}</dd></div>
              <div><dt>Flavor Line</dt><dd>{textOrFallback(milestone.flavorLine)}</dd></div>
            </dl>
            <div className="skill-preview__changes">
              <span>Construction Changes</span>
              {milestone.changes.length === 0 ? (
                <p>None recorded.</p>
              ) : (
                <ul>
                  {milestone.changes.map((change, index) => (
                    <li key={`${change.kind}-${index}`}>{progressiveChangeLabel(change)}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SpellPreview({
  spell,
  calculation,
  validation,
}: {
  spell: SpellDocument;
  calculation: SpellCalculation;
  validation: ValidationResult;
}) {
  const identity = SPELL_IDENTITY_BY_TRADITION[spell.tradition];
  const frameworkName = getSpellFrameworkName(spell);
  return (
    <section className="skill-preview__spell">
      <h4>Spell Construction</h4>
      <dl className="skill-preview__facts skill-preview__facts--spell">
        <div><dt>Tradition</dt><dd>{spell.tradition}</dd></div>
        <div><dt>{identity.label}</dt><dd>{textOrFallback(frameworkName)}</dd></div>
        <div><dt>Base Mana</dt><dd>{calculation.baseSpellManaCost}</dd></div>
        <div><dt>Spell Mastery</dt><dd>{calculation.baseSpellMastery}</dd></div>
        <div><dt>Base Combat</dt><dd>{calculation.baseCombatCastingTime} Initiative</dd></div>
        <div><dt>Combat Casting</dt><dd>{calculation.combatCastingTime} Initiative</dd></div>
        <div><dt>Out of Combat</dt><dd>{outOfCombatTime(calculation.outOfCombatCastingTimeSeconds)}</dd></div>
        <div><dt>Validation</dt><dd>{validation.status}</dd></div>
      </dl>

      <div className="skill-preview__detail-group">
        <h5>Spell Details</h5>
        <dl className="skill-preview__text-facts">
          <div><dt>Description</dt><dd>{textOrFallback(spell.description)}</dd></div>
          <div><dt>Notes / Special Conditions</dt><dd>{textOrFallback(spell.notes)}</dd></div>
          <div><dt>Flavor Line</dt><dd>{textOrFallback(spell.flavorLine)}</dd></div>
        </dl>
      </div>

      <div className="skill-preview__detail-group">
        <h5>Base Construction</h5>
        <div className="skill-preview__containers">
          {spell.containers.map((container, index) => (
            <ContainerPreview
              key={container.id}
              container={container}
              ordinal={String(index + 1)}
              depth={0}
            />
          ))}
        </div>
      </div>

      <div className="skill-preview__detail-group">
        <h5>Spell-Wide Modifiers</h5>
        <ModifierList selections={spell.modifiers} />
      </div>

      <ProgressivePreview spell={spell} />

      <div className="skill-preview__detail-group">
        <h5>Validation Details</h5>
        {validation.issues.length === 0 ? (
          <p className="skill-preview__empty">No validation issues.</p>
        ) : (
          <ul className="skill-preview__issues">
            {validation.issues.map((issue, index) => (
              <li key={`${issue.id}-${index}`}>
                <strong>{issue.severity}: {issue.message}</strong>
                <span>{issue.explanation}</span>
                {issue.path?.length ? <small>{issue.path.join(" → ")}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="skill-preview__detail-group">
        <h5>Mana Breakdown</h5>
        <div className="skill-preview__table-wrap">
          <table>
            <thead>
              <tr><th>Component</th><th>Category</th><th>Mana</th></tr>
            </thead>
            <tbody>
              {calculation.breakdown.map((line, index) => (
                <tr key={`${line.id}-${index}`}>
                  <td style={{ paddingLeft: `${12 + line.depth * 14}px` }}>
                    <strong>{line.label}</strong>
                    {line.detail ? <span>{line.detail}</span> : null}
                    {line.componentDescription ? <small>{line.componentDescription}</small> : null}
                  </td>
                  <td>{line.category}</td>
                  <td>{mana(line.cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={2}>Base Mana</th><th>{calculation.baseSpellManaCost}</th></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
