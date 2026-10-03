import type { CharacterSpecialAbility, CharacterSpecialAbilityView } from "./character-models";
import { MechanicsRuleSummary } from "./mechanics-preview";
import { mechanicsContextSummary, mechanicsDocumentState, mechanicsPossessionSummary, MECHANICS_READ_ONLY_NOTICE, MECHANICS_STATUS_LABELS, presentationDiagnostics, presentationReferences, qualificationExplanation } from "./presentation";
import "./reference.css";

function AbilityContent({ ability, print }: { ability: CharacterSpecialAbility; print: boolean }) {
  const view = ability.mechanics, references = presentationReferences(view), diagnostics = presentationDiagnostics(view);
  return <div className="special-ability-reference__body">
    <p className="special-ability-reference__definition" data-paper-check={print ? "text" : undefined}><strong>Definition: </strong>{ability.definition || "No Definition recorded."}</p>
    <p>{mechanicsPossessionSummary(ability)}</p>
    <p>{mechanicsDocumentState(view)}</p>
    {diagnostics.length > 0 && <div className="special-ability-reference__notice"><strong>Reference diagnostics</strong><ul>{diagnostics.map((message, i) => <li key={i}>{message}</li>)}</ul></div>}
    {view.rules.map(rule => {
      const content = <>
        <p className="special-ability-reference__status"><strong>{MECHANICS_STATUS_LABELS[rule.status]}</strong>{MECHANICS_STATUS_LABELS[rule.status].endsWith(".") ? " " : ". "}{rule.explanation}</p>
        <MechanicsRuleSummary rule={rule.authored} rules={view.rules.map(row => row.authored)} references={references} />
        {rule.kind === "choice" && <p>Choice required when this ability is fully supported. No Character selection has been made by this definition.</p>}
        {rule.groups.length > 0 && <div className="special-ability-reference__qualification"><strong>Saved qualification details</strong>{rule.groups.map((group, index) => <div key={group.key}><p>Way {index + 1}: {group.result === "satisfied" ? "Satisfied" : group.result === "unsatisfied" ? "Not satisfied" : "Manual / G.O.D."}</p><ul>{group.conditions.map(condition => <li key={condition.key}>{qualificationExplanation(condition.explanation)}</li>)}</ul></div>)}</div>}
      </>;
      return print ? <article className="special-ability-reference__rule" key={rule.key}>{content}</article>
        : <details className="special-ability-reference__rule" key={rule.key}><summary>{rule.title} — {MECHANICS_STATUS_LABELS[rule.status]}</summary>{content}</details>;
    })}
  </div>;
}

/** Same definition rendering for saved Character, tabletop and optional print.
 * This module contains no action imports or runtime controls. */
export function CharacterSpecialAbilityReference({ view, print = false }: { view: CharacterSpecialAbilityView; print?: boolean }) {
  return <section className={`special-ability-reference${print ? " special-ability-reference--print" : ""}`} aria-label="Special Ability mechanics">
    <h3>Special Ability mechanics</h3>
    <p>{MECHANICS_READ_ONLY_NOTICE}</p><p>{mechanicsContextSummary(view)}</p>
    {view.context === "saved-normal" && !view.abilities.length && <p>No possessed Special Abilities are recorded in the saved Character facts.</p>}
    {view.abilities.map(ability => print ? <article className="special-ability-reference__ability" key={ability.mechanics.source.id}><h3>{ability.mechanics.source.name}</h3><AbilityContent ability={ability} print /></article>
      : <details className="special-ability-reference__ability" key={ability.mechanics.source.id}><summary><strong>{ability.mechanics.source.name}</strong><span>{mechanicsDocumentState(ability.mechanics)}</span></summary><AbilityContent ability={ability} print={false} /></details>)}
  </section>;
}
