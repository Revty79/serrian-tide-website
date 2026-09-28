/** Order a single-parent browse page with its context without changing pagination. */
export function orderCatalogLineage<T extends { id: number; parentId: number | null; name?: string; canonicalName?: string }>(rows: readonly T[]): Array<T & { depth: number; parentName: string | null }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const emitted = new Set<number>();
  const ordered: Array<T & { depth: number; parentName: string | null }> = [];
  function visit(row: T, path = new Set<number>()): number {
    if (path.has(row.id)) return 0;
    if (emitted.has(row.id)) return ordered.find((entry) => entry.id === row.id)?.depth ?? 0;
    path.add(row.id);
    const parent = row.parentId === null ? undefined : byId.get(row.parentId);
    const depth = parent ? visit(parent, path) + 1 : 0;
    if (!emitted.has(row.id)) {
      emitted.add(row.id);
      ordered.push({ ...row, depth, parentName: parent?.name ?? parent?.canonicalName ?? null });
    }
    return depth;
  }
  rows.forEach((row) => visit(row));
  return ordered;
}
