import { storedIncomingResolution, incomingObject } from "@/features/incoming-effects/effect-proposal";

const stageNames = { source: "Source qualification", worn: "Worn armor", interaction: "Interaction Rules", natural: "Natural protection", temporary: "Temporary protection", final: "Final result" };

export function IncomingEffectEvidence({ value, status }: { value: unknown; status?: string }) {
  const resolution = storedIncomingResolution(value);
  const publicSummary = incomingObject(incomingObject(value).incomingEffectSummary);
  const decisionRecorded = Boolean(status && status !== "requires-god-ruling"
    && (resolution?.status ?? publicSummary.status) === "requires-god-ruling");
  if (!resolution) return typeof publicSummary.message === "string" ? <p>{decisionRecorded
    ? "The original target interaction required a G.O.D. ruling. A decision has been recorded."
    : publicSummary.message}</p> : null;
  return <div>
    {decisionRecorded ? <p>Original calculation required a G.O.D. ruling. A decision has been recorded.</p> : <p><strong>{resolution.status === "requires-god-ruling" ? "G.O.D. Ruling Required" : resolution.status.replaceAll("-", " ")}</strong>{resolution.finalEffect
      ? `: ${resolution.finalEffect.damage} damage, ${resolution.finalEffect.healing} healing` : ": G.O.D. decision required"}.</p>
    }
    <details><summary>Protection and interaction calculation</summary>
      {resolution.input.effect.amount !== null && <p>Incoming damage: {resolution.input.effect.amount}</p>}
      <ol>{resolution.stages.map((stage) => <li key={stage.key}>
        <strong>{stageNames[stage.key]}</strong>: {stage.status}{stage.damageAfter !== null ? `; damage ${stage.damageAfter}` : ""}{stage.healingAfter ? `; healing ${stage.healingAfter}` : ""}
        <ul>{stage.entries.filter(({ operation }) => operation !== "source-facts").map((entry, index) => <li key={index}>{entry.message.replace(" Planning only; no HP or effect was applied.", "")}</li>)}</ul>
      </li>)}</ol>
      {resolution.status === "requires-god-ruling" && resolution.candidates.length > 0 && <><p>{decisionRecorded ? "Original candidate outcomes:" : "Possible outcomes requiring a ruling:"}</p><ul>{resolution.candidates.map((candidate, index) => <li key={index}>{candidate.description} — damage {candidate.damage ?? "unknown"}, healing {candidate.healing ?? "unknown"}</li>)}</ul></>}
      {resolution.issues.map((issue, index) => <p key={index}>{issue.message}</p>)}
      <details><summary>Frozen source, target and rule details</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(resolution, null, 2)}</pre></details>
    </details>
  </div>;
}
