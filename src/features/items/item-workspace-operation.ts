export type ItemWorkspaceOperationKind = "item-save" | "governance-save" | "variant-create";

export type ItemWorkspaceOperation = Readonly<{
  id: number;
  kind: ItemWorkspaceOperationKind;
}>;

/** One Item workspace mutation may own the editor at a time. */
export function createItemWorkspaceOperationGuard() {
  let nextId = 0;
  let active: ItemWorkspaceOperation | null = null;
  return {
    begin(kind: ItemWorkspaceOperationKind): ItemWorkspaceOperation | null {
      if (active) return null;
      active = { id: ++nextId, kind };
      return active;
    },
    active(): ItemWorkspaceOperation | null {
      return active;
    },
    finish(operation: ItemWorkspaceOperation): boolean {
      if (active?.id !== operation.id) return false;
      active = null;
      return true;
    },
  };
}
