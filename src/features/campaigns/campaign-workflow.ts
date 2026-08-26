export const CAMPAIGN_SETTINGS_TABS = [
  { id: "rules", label: "Rules & Systems" },
  { id: "races", label: "Allowed Races" },
  { id: "inventory", label: "Inventory Access" },
] as const;

export type CampaignSettingsTab = (typeof CAMPAIGN_SETTINGS_TABS)[number]["id"];

export function getCampaignControlHref(input?: {
  campaignId?: number | null;
  playerUserId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.campaignId && Number.isInteger(input.campaignId) && input.campaignId > 0) {
    params.set("campaign", String(input.campaignId));
  }
  if (input?.playerUserId) params.set("player", input.playerUserId);
  const query = params.toString();
  return query ? `/heavens?${query}` : "/heavens";
}

export function getCampaignSettingsHref(campaignId?: number | null) {
  return campaignId && Number.isInteger(campaignId) && campaignId > 0
    ? `/heavens/campaigns?campaign=${campaignId}`
    : "/heavens/campaigns";
}
