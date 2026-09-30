import { companionRoleLabel, CONTROL_LABELS, COMBAT_PREFERENCE_LABELS, type CompanionRoleData, type CompanionControl, type CompanionCombatPreference } from "@/features/creatures/companion-profile";

export function CompanionProfileSummary({ profile, ownerAssigned = true }: { ownerAssigned?: boolean; profile: { configured: boolean; requiresOwnerReview: boolean; roles: CompanionRoleData[]; controlModel: CompanionControl | null; combatPreference: CompanionCombatPreference | null; relationshipNotes: string } }) {
  const mount = profile.roles.find(role => role.role === "mount");
  return <div aria-label="Companion Profile summary">
    {profile.requiresOwnerReview ? <p><strong>G.O.D. review required after ownership change.</strong> {ownerAssigned ? "These retained settings have not been approved for the current owner." : "These retained settings require review after an owner is assigned."}</p> : null}
    {!profile.configured ? <p>Companion behavior not yet configured</p> : <>
      <p><strong>Roles:</strong> {profile.roles.map(companionRoleLabel).join(" · ") || "None selected"}</p>
      <p><strong>Control:</strong> {profile.controlModel ? CONTROL_LABELS[profile.controlModel] : "Not configured"}</p>
      <p><strong>Combat:</strong> {profile.combatPreference ? COMBAT_PREFERENCE_LABELS[profile.combatPreference] : "Not configured"}</p>
      {mount ? <p><strong>Mount:</strong> {mount.maximumRiders} intended {mount.maximumRiders === 1 ? "rider" : "riders"}{mount.mountNotes ? ` · ${mount.mountNotes}` : ""}</p> : null}
    </>}
    {profile.relationshipNotes ? <p><strong>Relationship:</strong> {profile.relationshipNotes}</p> : null}
  </div>;
}
