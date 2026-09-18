export type GovernanceDraftIdentity = Readonly<{
  profileKey: string;
  dirty: boolean;
}>;

export function shouldApplyGovernanceRead(
  activeProfileKey: string | null,
  currentDraft: GovernanceDraftIdentity | null,
  responseProfileKey: string,
): boolean {
  if (activeProfileKey !== responseProfileKey) return false;
  return currentDraft === null || currentDraft.profileKey !== responseProfileKey || !currentDraft.dirty;
}
