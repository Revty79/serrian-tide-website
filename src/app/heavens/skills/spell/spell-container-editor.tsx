"use client";

import { useState, type CSSProperties } from "react";

import { serrianTideRules } from "@/features/spell-construction/data/spellRules";
import { calculateRuleCost } from "@/features/spell-construction/engine/calculateSpell";
import type { AddOnRule } from "@/features/spell-construction/models/rules";
import type {
  ScaledAddOnSelection,
  SpellContainer,
} from "@/features/spell-construction/models/spell";
import { createContainer } from "@/features/spell-construction/utilities/spellFactory";
import { createStableId } from "@/features/spell-construction/utilities/ids";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

type SpellContainerEditorProps = {
  container: SpellContainer;
  depth: number;
  ordinal: string;
  onChange: (container: SpellContainer) => void;
  onRemove: () => void;
};

function quantityForAddOn(rule: AddOnRule): number {
  return rule.quantitySemantics === "total-quantity" ? 1 : 0;
}

function EffectSelectionEditor({
  effect,
  onChange,
  onRemove,
}: {
  effect: SpellContainer["effects"][number];
  onChange: (effect: SpellContainer["effects"][number]) => void;
  onRemove: () => void;
}) {
  const preserveScroll = useInPlaceScrollPreservation();
  const rule = serrianTideRules.effects.find(({ id }) => id === effect.ruleId);
  if (!rule) return null;

  return (
    <article className="spell-builder__selection">
      <div className="spell-builder__selection-heading">
        <div>
          <strong>{rule.name}</strong>
          <span>{rule.componentMastery} component mastery</span>
        </div>
        <b>+{calculateRuleCost(rule.cost, effect.quantity)} Mana</b>
      </div>

      {rule.cost.kind === "scalable" && (
        <label>
          <span>{rule.quantityLabel ?? "Quantity"}</span>
          <input
            type="number"
            min={1}
            value={effect.quantity}
            onChange={(event) =>
              onChange({
                ...effect,
                quantity: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
      )}

      {effect.ruleId === "healing" ? (
        <label>
          <span>Healing Application</span>
          <select
            value={effect.healingScope ?? ""}
            onChange={(event) => onChange({
              ...effect,
              healingScope: event.target.value === "full-body" || event.target.value === "area"
                ? event.target.value
                : undefined,
            })}
          >
            <option value="">Unspecified / Manual Resolution</option>
            <option value="full-body">Full Body</option>
            <option value="area">Area</option>
          </select>
        </label>
      ) : null}

      <label>
        <span>Component description</span>
        <textarea
          rows={2}
          value={effect.description ?? ""}
          onChange={(event) => onChange({ ...effect, description: event.target.value })}
        />
      </label>

      <button className="spell-builder__remove" type="button" onClick={() => void preserveScroll(onRemove)}>
        Remove Effect
      </button>
    </article>
  );
}

function AddOnSelectionEditor({
  label,
  rule,
  selection,
  onChange,
  onRemove,
}: {
  label: string;
  rule: AddOnRule;
  selection: ScaledAddOnSelection;
  onChange: (selection: ScaledAddOnSelection) => void;
  onRemove: () => void;
}) {
  const preserveScroll = useInPlaceScrollPreservation();
  return (
    <article className="spell-builder__selection">
      <div className="spell-builder__selection-heading">
        <div>
          <strong>{label}: {rule.name}</strong>
          <span>{rule.componentMastery} component mastery</span>
        </div>
        <b>+{calculateRuleCost(rule.cost, selection.quantity)} Mana</b>
      </div>

      {rule.cost.kind === "scalable" && (
        <label>
          <span>{rule.quantityLabel ?? rule.incrementLabel ?? "Quantity"}</span>
          <input
            type="number"
            min={rule.quantitySemantics === "total-quantity" ? 1 : 0}
            max={rule.maximumQuantity}
            value={selection.quantity}
            onChange={(event) =>
              onChange({
                ...selection,
                quantity: Math.max(
                  rule.quantitySemantics === "total-quantity" ? 1 : 0,
                  Number(event.target.value) || 0,
                ),
              })
            }
          />
        </label>
      )}

      <label>
        <span>Component description</span>
        <textarea
          rows={2}
          value={selection.description ?? ""}
          onChange={(event) => onChange({ ...selection, description: event.target.value })}
        />
      </label>

      <button className="spell-builder__remove" type="button" onClick={() => void preserveScroll(onRemove)}>
        Remove {label}
      </button>
    </article>
  );
}

export function SpellContainerEditor({
  container,
  depth,
  ordinal,
  onChange,
  onRemove,
}: SpellContainerEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [effectRuleId, setEffectRuleId] = useState("");
  const [durationRuleId, setDurationRuleId] = useState("");
  const preserveScroll = useInPlaceScrollPreservation();

  const rule = serrianTideRules.containers.find(
    ({ id }) => id === container.containerRuleId,
  );

  const availableEffects = serrianTideRules.effects.filter(
    (candidate) =>
      !container.effects.some(({ ruleId }) => ruleId === candidate.id) ||
      candidate.stacking === "multiple" ||
      candidate.stacking === "unspecified",
  );

  function addEffect() {
    const selected = serrianTideRules.effects.find(({ id }) => id === effectRuleId);
    if (!selected) return;

    onChange({
      ...container,
      effects: [
        ...container.effects,
        {
          id: createStableId("effect"),
          ruleId: selected.id,
          quantity: 1,
          description: "",
        },
      ],
    });
    setEffectRuleId("");
  }

  function addDuration() {
    const selected = serrianTideRules.durations.find(({ id }) => id === durationRuleId);
    if (!selected) return;

    onChange({
      ...container,
      durations: [
        ...container.durations,
        {
          id: createStableId("addon"),
          ruleId: selected.id,
          quantity: quantityForAddOn(selected),
          description: "",
        },
      ],
    });
    setDurationRuleId("");
  }

  return (
    <article
      className="spell-container"
      style={{ "--container-depth": depth } as CSSProperties}
    >
      <header className="spell-container__header">
        <button type="button" onClick={() => void preserveScroll(() => setCollapsed((value) => !value))}>
          <span>CONTAINER {ordinal} · DEPTH {depth}</span>
          <strong>{collapsed ? "▸" : "▾"} {rule?.name ?? "Unknown Container"}</strong>
        </button>

        <button className="spell-builder__remove" type="button" onClick={() => void preserveScroll(onRemove)}>
          Remove
        </button>
      </header>

      {!collapsed && (
        <div className="spell-container__body">
          <label>
            <span>Container Type</span>
            <select
              value={container.containerRuleId}
              onChange={(event) =>
                onChange({ ...container, containerRuleId: event.target.value })
              }
            >
              {serrianTideRules.containers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </label>

          <section className="spell-builder__subsection">
            <div className="spell-builder__subheading">
              <h5>Effects</h5>
              <div className="spell-builder__add-row">
                <select
                  value={effectRuleId}
                  onChange={(event) => setEffectRuleId(event.target.value)}
                >
                  <option value="">Choose effect</option>
                  {availableEffects.map((effect) => (
                    <option key={effect.id} value={effect.id}>{effect.name}</option>
                  ))}
                </select>
                <button type="button" disabled={!effectRuleId} onClick={() => void preserveScroll(addEffect)}>Add</button>
              </div>
            </div>

            {container.effects.length === 0 ? (
              <p className="spell-builder__empty">No effects in this container.</p>
            ) : (
              <div className="spell-builder__selection-list">
                {container.effects.map((effect) => (
                  <EffectSelectionEditor
                    key={effect.id}
                    effect={effect}
                    onChange={(next) =>
                      onChange({
                        ...container,
                        effects: container.effects.map((candidate) =>
                          candidate.id === effect.id ? next : candidate,
                        ),
                      })
                    }
                    onRemove={() =>
                      onChange({
                        ...container,
                        effects: container.effects.filter(({ id }) => id !== effect.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="spell-builder__subsection">
            <h5>Add-ons</h5>

            <label>
              <span>Range</span>
              <select
                value={container.rangeRuleId ?? ""}
                onChange={(event) =>
                  onChange({
                    ...container,
                    rangeRuleId: event.target.value || undefined,
                    rangeDescription: event.target.value
                      ? container.rangeDescription ?? ""
                      : "",
                  })
                }
              >
                <option value="">No Range</option>
                {serrianTideRules.ranges.map((range) => (
                  <option key={range.id} value={range.id}>{range.name}</option>
                ))}
              </select>
            </label>

            {container.rangeRuleId && (
              <label>
                <span>Range description</span>
                <textarea
                  rows={2}
                  value={container.rangeDescription ?? ""}
                  onChange={(event) =>
                    onChange({ ...container, rangeDescription: event.target.value })
                  }
                />
              </label>
            )}

            <label>
              <span>Shape</span>
              <select
                value={container.shape?.ruleId ?? ""}
                onChange={(event) => {
                  const shapeRule = serrianTideRules.shapes.find(
                    ({ id }) => id === event.target.value,
                  );
                  onChange({
                    ...container,
                    shape: shapeRule
                      ? {
                          id: container.shape?.id ?? createStableId("addon"),
                          ruleId: shapeRule.id,
                          quantity: quantityForAddOn(shapeRule),
                          description: container.shape?.description ?? "",
                        }
                      : undefined,
                  });
                }}
              >
                <option value="">No Shape</option>
                {serrianTideRules.shapes.map((shape) => (
                  <option key={shape.id} value={shape.id}>{shape.name}</option>
                ))}
              </select>
            </label>

            {container.shape && (() => {
              const shapeRule = serrianTideRules.shapes.find(
                ({ id }) => id === container.shape?.ruleId,
              );
              return shapeRule ? (
                <AddOnSelectionEditor
                  label="Shape"
                  rule={shapeRule}
                  selection={container.shape}
                  onChange={(shape) => onChange({ ...container, shape })}
                  onRemove={() => onChange({ ...container, shape: undefined })}
                />
              ) : null;
            })()}

            <div className="spell-builder__subheading">
              <h5>Durations</h5>
              <div className="spell-builder__add-row">
                <select
                  value={durationRuleId}
                  onChange={(event) => setDurationRuleId(event.target.value)}
                >
                  <option value="">Choose duration</option>
                  {serrianTideRules.durations.map((duration) => (
                    <option key={duration.id} value={duration.id}>{duration.name}</option>
                  ))}
                </select>
                <button type="button" disabled={!durationRuleId} onClick={() => void preserveScroll(addDuration)}>Add</button>
              </div>
            </div>

            {container.durations.map((duration) => {
              const durationRule = serrianTideRules.durations.find(
                ({ id }) => id === duration.ruleId,
              );
              return durationRule ? (
                <AddOnSelectionEditor
                  key={duration.id}
                  label="Duration"
                  rule={durationRule}
                  selection={duration}
                  onChange={(next) =>
                    onChange({
                      ...container,
                      durations: container.durations.map((candidate) =>
                        candidate.id === duration.id ? next : candidate,
                      ),
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...container,
                      durations: container.durations.filter(({ id }) => id !== duration.id),
                    })
                  }
                />
              ) : null;
            })}

            <label className="spell-builder__checkbox">
              <input
                type="checkbox"
                checked={Boolean(container.multiTarget)}
                onChange={(event) =>
                  onChange({
                    ...container,
                    multiTarget: event.target.checked
                      ? {
                          ruleId: "multi-target",
                          additionalTargets: 1,
                          description: "",
                        }
                      : undefined,
                  })
                }
              />
              <span>Multi-Target</span>
            </label>

            {container.multiTarget && (
              <div className="spell-builder__inline-fields">
                <label>
                  <span>Additional targets</span>
                  <input
                    type="number"
                    min={1}
                    value={container.multiTarget.additionalTargets}
                    onChange={(event) =>
                      onChange({
                        ...container,
                        multiTarget: container.multiTarget
                          ? {
                              ...container.multiTarget,
                              additionalTargets: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            }
                          : undefined,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Description</span>
                  <input
                    value={container.multiTarget.description ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...container,
                        multiTarget: container.multiTarget
                          ? { ...container.multiTarget, description: event.target.value }
                          : undefined,
                      })
                    }
                  />
                </label>
              </div>
            )}
          </section>

          <section className="spell-builder__subsection">
            <div className="spell-builder__subheading">
              <h5>Child Containers</h5>
              <button
                type="button"
                onClick={() => void preserveScroll(() =>
                  onChange({
                    ...container,
                    children: [...container.children, createContainer()],
                  })
                )}
              >
                Add Child Container
              </button>
            </div>

            {container.children.map((child, index) => (
              <SpellContainerEditor
                key={child.id}
                container={child}
                depth={depth + 1}
                ordinal={`${ordinal}.${index + 1}`}
                onChange={(next) =>
                  onChange({
                    ...container,
                    children: container.children.map((candidate) =>
                      candidate.id === child.id ? next : candidate,
                    ),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...container,
                    children: container.children.filter(({ id }) => id !== child.id),
                  })
                }
              />
            ))}
          </section>
        </div>
      )}
    </article>
  );
}
