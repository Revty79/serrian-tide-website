export function initiativeAffordabilityIssue(cost: number, currentInitiative: number): string | null {
  return cost > currentInitiative
    ? `This action costs ${cost} Initiative; only ${currentInitiative} remains. Choose an affordable action or Hold. Pass ends your choices for this round and carries unused Initiative into the next round.`
    : null;
}
