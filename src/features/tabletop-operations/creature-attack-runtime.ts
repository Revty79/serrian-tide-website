import { normalizeAttackAuthoring } from "@/features/attacks/attack-authoring";
import { resolveCreatureAttackInitiativeCost } from "./runtime-integration";

/** Exact owner type decides the snapshot. Never consult a Creature master. */
export function authoritativeCreatureSnapshot(owner: { participantId: number; participantKind: string; isNpc: boolean | null; npcKind: string | null; occurrence: unknown; persistent: string | null }): unknown {
  if (owner.participantId < 0 && owner.participantKind === "creature") return owner.occurrence;
  if (owner.participantId > 0 && owner.participantKind === "campaign-character" && owner.isNpc && owner.npcKind === "creature") return owner.persistent ? JSON.parse(owner.persistent) : null;
  return null;
}

export function creatureAttackRuntime(attack: Record<string, unknown>) {
  const authoring = normalizeAttackAuthoring(attack.authoring);
  const target = typeof attack.attackPercentage === "number" && Number.isFinite(attack.attackPercentage) ? attack.attackPercentage : null;
  const initiative = resolveCreatureAttackInitiativeCost({ attackName: String(attack.attackName ?? ""),
    damage: typeof attack.damage === "string" || typeof attack.damage === "number" ? attack.damage : null,
    structuredInitiativeCost: authoring ? authoring.initiativeCost : typeof attack.initiativeCost === "number" && Number.isFinite(attack.initiativeCost) && attack.initiativeCost > 0 ? attack.initiativeCost : null, allowLegacyFallback: authoring === null });
  const descriptive = (["specialEffect", "requirements", "requiredAnatomy", "usesRecharge", "rangeReach", "notes"] as const)
    .filter(key => typeof attack[key] === "string" && (attack[key] as string).trim());
  const labels = { specialEffect: "Special Effect", requirements: "Requirements", requiredAnatomy: "Required Anatomy", usesRecharge: "Uses / Recharge", rangeReach: "Reach / Range description", notes: "Notes" };
  const warnings = [
    ...(target === null ? ["Creature Attack Roll requires a G.O.D. ruling: no valid authored Attack %."] : []),
    ...(initiative.cost === null ? ["Creature Attack needs a positive Initiative Cost or an explicit G.O.D. timing ruling."] : []),
    ...(["natural", "damage"].includes(initiative.source) ? [`Legacy snapshot timing: ${initiative.source === "natural" ? "natural action" : "numeric damage"} fallback (${initiative.cost} Initiative).`] : []),
    ...(!authoring ? ["Legacy snapshot has no structured mode/range; positioning requires G.O.D. review."] : !authoring.mode ? ["Creature Attack needs an authored Attack Mode."] : []),
    ...descriptive.map(key => `${labels[key]} — G.O.D. review information, not automatically enforced: ${attack[key]}`),
    ...(authoring?.magic ? ["Attached Magic establishes Magical status; construction effects are deferred to Pass 4."] : []),
  ];
  const range = authoring?.range;
  const description = [target === null ? "Attack % needs ruling" : `${target}%`, `${initiative.cost ?? "Unspecified"} Initiative`, authoring?.mode ?? "Mode unspecified",
    range?.reach == null ? "" : `Reach ${range.reach} ${range.unit ?? ""}`,
    range?.short == null ? "" : `Range ${range.short}/${range.medium ?? "?"}/${range.long ?? "?"} ${range.unit ?? ""}`,
    `${attack.damage ?? "Unspecified"} ${attack.damageType || "unspecified type"} damage`,
    authoring?.magic || authoring?.magical === true ? "Magical" : authoring?.magical === false ? "Nonmagical" : "Magical unspecified", ...warnings].filter(Boolean).join(" · ");
  return { authoring, target, initiative, warnings, description };
}
