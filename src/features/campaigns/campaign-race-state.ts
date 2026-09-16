export function addCampaignRace(
  currentCampaignRaceIds: number[],
  currentAllowedRaceIds: number[],
  raceId: number,
): {
  campaignRaceIds: number[];
  allowedRaceIds: number[];
} {
  const alreadyInCampaign = currentCampaignRaceIds.includes(raceId);

  return {
    campaignRaceIds: alreadyInCampaign
      ? currentCampaignRaceIds
      : [...currentCampaignRaceIds, raceId],
    allowedRaceIds: currentAllowedRaceIds,
  };
}

export function removeCampaignRace(
  currentCampaignRaceIds: number[],
  currentAllowedRaceIds: number[],
  raceId: number,
): {
  campaignRaceIds: number[];
  allowedRaceIds: number[];
} {
  return {
    campaignRaceIds: currentCampaignRaceIds.filter((id) => id !== raceId),
    allowedRaceIds: currentAllowedRaceIds.filter((id) => id !== raceId),
  };
}

export function togglePlayableRace(
  currentCampaignRaceIds: number[],
  currentAllowedRaceIds: number[],
  raceId: number,
): {
  campaignRaceIds: number[];
  allowedRaceIds: number[];
} {
  if (!currentCampaignRaceIds.includes(raceId)) {
    return {
      campaignRaceIds: currentCampaignRaceIds,
      allowedRaceIds: currentAllowedRaceIds,
    };
  }

  return {
    campaignRaceIds: currentCampaignRaceIds,
    allowedRaceIds: currentAllowedRaceIds.includes(raceId)
      ? currentAllowedRaceIds.filter((id) => id !== raceId)
      : [...currentAllowedRaceIds, raceId],
  };
}
