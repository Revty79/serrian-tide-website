import { FORM_ACCESS_HELP, FORM_ACCESS_LABELS, type FormAccessEvaluation } from "@/features/forms/form-access";
import styles from "./form-preview.module.css";

export function FormAccessSummary({ evaluation, entity }: { evaluation: FormAccessEvaluation; entity: "Character" | "Creature NPC" }) {
  return <section aria-label="Form Access" data-form-access={evaluation.status}>
    <h3>Access · {FORM_ACCESS_LABELS[evaluation.status]}</h3>
    {evaluation.status === "locked" && <p className={styles.notice}><strong>Locked Form Preview — this {entity} does not currently meet the Form&apos;s access requirements. Previewing it does not grant access or change its actual state.</strong></p>}
    <p>{evaluation.explanation}</p><p>{FORM_ACCESS_HELP}</p>
    <p>Access checks this {entity}&apos;s saved normal state. Save changes to the normal sheet to check again. Benefits shown in a Form preview cannot unlock that Form.</p>
    {evaluation.groups.map((group, index) => <div key={group.groupNumber} className={styles.card}><h4>{index ? "OR — " : ""}Way to qualify #{index + 1} · {FORM_ACCESS_LABELS[group.status]}</h4><ul>{group.requirements.map(row => <li key={row.key}>{FORM_ACCESS_LABELS[row.status]} — {row.explanation}</li>)}</ul></div>)}
  </section>;
}
