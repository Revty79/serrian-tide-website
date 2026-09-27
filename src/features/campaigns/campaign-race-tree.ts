export type CampaignRaceEntry = {
  id: number;
  name: string;
  size: string;
  parentRaceId: number | null;
};

export type CampaignRaceNode = {
  race: CampaignRaceEntry;
  selectable: boolean;
  children: CampaignRaceNode[];
};

/** Keep parent context when a search or campaign subset contains only variants. */
export function buildCampaignRaceTree(
  races: readonly CampaignRaceEntry[],
  availableIds: readonly number[] | undefined,
  search: string,
): CampaignRaceNode[] {
  const sorted = [...races].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const byId = new Map(sorted.map((race) => [race.id, race]));
  const byParent = new Map<number, CampaignRaceEntry[]>();
  for (const race of sorted) {
    if (race.parentRaceId !== null && race.parentRaceId !== race.id && byId.has(race.parentRaceId)) {
      const siblings = byParent.get(race.parentRaceId) ?? [];
      siblings.push(race);
      byParent.set(race.parentRaceId, siblings);
    }
  }
  const visited = new Set<number>();
  const build = (race: CampaignRaceEntry): CampaignRaceNode => {
    visited.add(race.id);
    const children: CampaignRaceNode[] = [];
    for (const child of byParent.get(race.id) ?? []) {
      if (!visited.has(child.id)) children.push(build(child));
    }
    return { race, selectable: true, children };
  };
  const roots = sorted.filter((race) => race.parentRaceId === null
    || race.parentRaceId === race.id || !byId.has(race.parentRaceId));
  const forest = roots.map(build);
  // A missing/archived parent or malformed cycle must not hide a selectable race.
  for (const race of sorted) if (!visited.has(race.id)) forest.push(build(race));

  const available = availableIds === undefined ? null : new Set(availableIds);
  const query = search.trim().toLowerCase();
  const filter = (node: CampaignRaceNode, ancestorMatches: boolean): CampaignRaceNode | null => {
    const matches = ancestorMatches || !query || [node.race.name, node.race.size]
      .some((value) => value.toLowerCase().includes(query));
    const children = node.children.map((child) => filter(child, matches))
      .filter((child): child is CampaignRaceNode => child !== null);
    const selectable = available === null || available.has(node.race.id);
    return (selectable && matches) || children.length
      ? { ...node, selectable, children }
      : null;
  };
  return forest.map((root) => filter(root, false))
    .filter((root): root is CampaignRaceNode => root !== null);
}
