"use client";

import { useState } from "react";

import { serrianTideRules } from "@/features/spell-construction/data/spellRules";
import { calculateModifierCost } from "@/features/spell-construction/engine/calculateSpell";
import type { ModifierSelection } from "@/features/spell-construction/models/spell";
import { createModifierSelection } from "@/features/spell-construction/utilities/spellFactory";

type SpellModifierEditorProps = {
  selections: ModifierSelection[];
  excludedRuleIds?: readonly string[];
  onChange: (selections: ModifierSelection[]) => void;
};

export function SpellModifierEditor({
  selections,
  excludedRuleIds = [],
  onChange,
}: SpellModifierEditorProps) {
  const [ruleId, setRuleId] = useState("");

  const availableRules = serrianTideRules.modifiers.filter(
    (rule) =>
      rule.allowedScopes.includes("spell") &&
      !excludedRuleIds.includes(rule.id) &&
      !(
        rule.stacking === "single" &&
        selections.some((selection) => selection.ruleId === rule.id)
      ),
  );

  function addModifier() {
    const rule = availableRules.find((candidate) => candidate.id === ruleId);
    if (!rule) return;

    const existing = selections.find((selection) => selection.ruleId === rule.id);
    if (existing && rule.stacking === "multiple") {
      const quantity =
        rule.maximumQuantity === undefined
          ? existing.quantity + 1
          : Math.min(rule.maximumQuantity, existing.quantity + 1);
      onChange(
        selections.map((selection) =>
          selection.id === existing.id ? { ...selection, quantity } : selection,
        ),
      );
    } else if (!existing) {
      onChange([...selections, createModifierSelection(rule.id)]);
    }

    setRuleId("");
  }

  return (
    <section className="spell-builder__subsection">
      <div className="spell-builder__subheading">
        <div>
          <p>SPELL-WIDE</p>
          <h5>Modifiers</h5>
        </div>

        <div className="spell-builder__add-row">
          <select value={ruleId} onChange={(event) => setRuleId(event.target.value)}>
            <option value="">Choose modifier</option>
            {availableRules.map((rule) => (
              <option key={rule.id} value={rule.id}>{rule.name}</option>
            ))}
          </select>
          <button type="button" disabled={!ruleId} onClick={addModifier}>Add</button>
        </div>
      </div>

      {selections.length === 0 ? (
        <p className="spell-builder__empty">No spell-wide modifiers attached.</p>
      ) : (
        <div className="spell-builder__selection-list">
          {selections.map((selection) => {
            const rule = serrianTideRules.modifiers.find(
              (candidate) => candidate.id === selection.ruleId,
            );
            if (!rule) return null;

            const cost = calculateModifierCost(rule, selection.quantity);

            return (
              <article className="spell-builder__selection" key={selection.id}>
                <div className="spell-builder__selection-heading">
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{rule.componentMastery} component mastery</span>
                  </div>
                  <b className={cost < 0 ? "is-negative" : ""}>
                    {cost >= 0 ? "+" : ""}{cost} Mana
                  </b>
                </div>

                {(rule.stacking === "multiple" || rule.initiativePerQuantity !== undefined) && (
                  <label>
                    <span>{rule.quantityLabel ?? "Quantity"}</span>
                    <input
                      type="number"
                      min={1}
                      max={rule.maximumQuantity}
                      value={selection.quantity}
                      onChange={(event) =>
                        onChange(
                          selections.map((item) =>
                            item.id === selection.id
                              ? {
                                  ...item,
                                  quantity: Math.max(1, Number(event.target.value) || 1),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                )}

                <label>
                  <span>Component description</span>
                  <textarea
                    rows={2}
                    value={selection.description ?? ""}
                    onChange={(event) =>
                      onChange(
                        selections.map((item) =>
                          item.id === selection.id
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <button
                  className="spell-builder__remove"
                  type="button"
                  onClick={() =>
                    onChange(selections.filter((item) => item.id !== selection.id))
                  }
                >
                  Remove Modifier
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
