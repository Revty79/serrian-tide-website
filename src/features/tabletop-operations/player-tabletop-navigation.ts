import type { PlayerCalledCheckWorkspaceView } from "./called-check-service";

export const PLAYER_TABLETOP_TABS = [
  { id: "alerts", label: "Alerts" },
  { id: "table", label: "Table" },
  { id: "rolls", label: "Rolls" },
  { id: "status", label: "Status" },
  { id: "equipment", label: "Equipment" },
  { id: "spells", label: "Spells" },
  { id: "abilities", label: "Abilities" },
  { id: "history", label: "History" },
  { id: "shop", label: "Shop" },
] as const;

export type PlayerTabletopTab = typeof PLAYER_TABLETOP_TABS[number]["id"];
export type PlayerTabletopEncounter = Readonly<{ id: number; title: string; status: string }>;
export type PlayerTabletopAlert = Readonly<{
  key: string;
  kind: "encounter" | "called-check" | "high-low";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  requiresInput: boolean;
  requestKey?: string;
}>;

export function resolvePlayerTabletopTab(value: string | null, hasShop: boolean, fallback: PlayerTabletopTab = "alerts"): PlayerTabletopTab {
  const available = PLAYER_TABLETOP_TABS.filter(({ id }) => id !== "shop" || hasShop);
  return available.find(({ id }) => id === value)?.id
    ?? available.find(({ id }) => id === fallback)?.id
    ?? "alerts";
}

export function playerTabletopRequestAnchor(requestKey: string | null): string | null {
  return requestKey && /^(check|high-low)-[1-9]\d*$/.test(requestKey)
    ? `player-request-${requestKey}`
    : null;
}

export function buildPlayerTabletopAlerts(
  characterId: number,
  encounters: readonly PlayerTabletopEncounter[],
  requests: PlayerCalledCheckWorkspaceView | null,
): PlayerTabletopAlert[] {
  const base = `/realms/tabletop?character=${characterId}`;
  const alerts: PlayerTabletopAlert[] = encounters.filter(({ status }) => status === "active").map((encounter) => ({
    key: `encounter-${encounter.id}`,
    kind: "encounter",
    title: encounter.title,
    detail: "Active encounter",
    href: `${base}&combat=${encounter.id}`,
    actionLabel: "Open encounter",
    requiresInput: false,
  }));
  if (!requests || requests.characterId !== characterId || requests.session.status !== "active") return alerts;

  for (const request of requests.calledChecks) {
    if (request.status !== "pending" || request.recipientCharacterId !== characterId) continue;
    const requestKey = `check-${request.id}`;
    alerts.push({
      key: requestKey,
      kind: "called-check",
      title: request.purpose,
      detail: `Called Check: ${request.sourceLabel}`,
      href: `${base}&tab=rolls&request=${requestKey}`,
      actionLabel: "Open roll",
      requiresInput: true,
      requestKey,
    });
  }
  for (const request of requests.highLow) {
    if (request.status !== "pending" || request.participantCharacterId !== characterId || request.mode === "neutral") continue;
    const waitingForGod = request.calledSide !== null && request.mode === "player-calls-god-rolls";
    const requestKey = `high-low-${request.id}`;
    alerts.push({
      key: requestKey,
      kind: "high-low",
      title: request.purpose,
      detail: waitingForGod ? "High / Low: waiting for the G.O.D. Roll" : request.calledSide === null ? "High / Low: choose your call" : "High / Low: ready to roll",
      href: `${base}&tab=rolls&request=${requestKey}`,
      actionLabel: waitingForGod ? "View request" : request.calledSide === null ? "Make call" : "Open roll",
      requiresInput: !waitingForGod,
      requestKey,
    });
  }
  return alerts;
}
