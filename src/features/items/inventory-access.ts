import type { PhysicalGraph, PhysicalAttachment } from "./container-physics";

export type CustodyStatus = "carried" | "dropped" | "stolen" | "lost";
export type ContainerAccessState = "open" | "closed" | "locked" | "sealed";
export type InventoryAccessGraph = PhysicalGraph & {
  attachments: PhysicalAttachment[];
  exactCustody: Array<{ instanceId: number; status: string; sceneId: number | null; contextLabel: string; note: string }>;
  stackCustody: Array<{ id: number; itemId: number; quantity: number; status: string; sceneId: number | null; contextLabel: string; note: string }>;
  containers: Array<{ instanceId: number; closureMode: string; state: string | null; name: string }>;
};
export type InventoryAvailability = {
  containerInstanceId: number | null; ancestors: number[]; rootInstanceId: number | null; custody: CustodyStatus;
  accessible: boolean; usable: boolean; attached: boolean; blocker: string | null;
  blockingContainerId: number | null; contextLabel: string; note: string;
};
export function containerAccessState(graph: InventoryAccessGraph, instanceId: number): ContainerAccessState {
  const container = graph.containers.find(row => row.instanceId === instanceId);
  if (!container || container.closureMode === "always-accessible") return "open";
  return (container.state ?? "closed") as ContainerAccessState;
}
export function resolveInventoryAvailability(graph: InventoryAccessGraph, target: { instanceId: number } | { itemId: number; containerInstanceId: number | null; custodyId?: number }): InventoryAvailability {
  const exact = "instanceId" in target ? graph.instances.find(row => row.instanceId === target.instanceId) : null;
  if ("instanceId" in target && !exact) throw new Error("Choose an active exact Item owned by this Character.");
  const attachment = exact ? graph.attachments.find(row => row.magazineInstanceId === exact.instanceId) : null;
  const parent = attachment?.weaponInstanceId ?? exact?.containerInstanceId ?? ("containerInstanceId" in target ? target.containerInstanceId : null);
  const ancestors: number[] = [], seen = new Set<number>(exact ? [exact.instanceId] : []);
  let next = parent;
  while (next !== null) {
    if (seen.has(next)) throw new Error("Circular inventory ancestry is invalid.");
    seen.add(next); ancestors.push(next);
    const copy = graph.instances.find(row => row.instanceId === next);
    if (!copy) throw new Error("Inventory ancestry changed. Reload inventory.");
    next = graph.attachments.find(row => row.magazineInstanceId === copy.instanceId)?.weaponInstanceId ?? copy.containerInstanceId;
  }
  const rootInstanceId = ancestors.at(-1) ?? exact?.instanceId ?? null;
  const stored = rootInstanceId !== null ? graph.exactCustody.find(row => row.instanceId === rootInstanceId)
    : "custodyId" in target && target.custodyId !== undefined ? graph.stackCustody.find(row => row.id === target.custodyId && row.itemId === target.itemId) : undefined;
  if ("custodyId" in target && target.custodyId !== undefined && !stored) throw new Error("This root custody allocation changed. Reload inventory.");
  const custody = (stored?.status ?? "carried") as CustodyStatus;
  const blockingContainerId = ancestors.find(id => containerAccessState(graph, id) !== "open") ?? null;
  const rootName = rootInstanceId === null ? "This stack portion" : `${graph.containers.find(row => row.instanceId === rootInstanceId)?.name ?? "Item"} #${rootInstanceId}`;
  const blocker = custody !== "carried" ? `Unavailable: ${rootName} is ${custody}${stored?.contextLabel ? ` (${stored.contextLabel})` : ""}.`
    : blockingContainerId !== null ? `Open ${graph.containers.find(row => row.instanceId === blockingContainerId)?.name ?? "container"} #${blockingContainerId} first (${containerAccessState(graph, blockingContainerId)}).` : null;
  return { containerInstanceId: parent, ancestors, rootInstanceId, custody, accessible: blocker === null, usable: blocker === null && parent === null && !attachment,
    attached: !!attachment, blocker, blockingContainerId, contextLabel: stored?.contextLabel ?? "", note: stored?.note ?? "" };
}
export function availableLooseQuantity(graph: InventoryAccessGraph, itemId: number): number {
  const stack = graph.stacks.find(row => row.itemId === itemId);
  if (!stack) return 0;
  const result = stack.ownedQuantity - stack.allocations.reduce((total, row) => total + row.quantity, 0)
    - graph.stackCustody.filter(row => row.itemId === itemId).reduce((total, row) => total + row.quantity, 0);
  if (result < 0) throw new Error("Inventory allocations exceed ownership. Resolve this inventory before use.");
  return result;
}
export function requireInventoryAvailability(availability: InventoryAvailability, loose = true) {
  if (availability.blocker) throw new Error(availability.blocker);
  if (loose && !availability.usable) throw new Error(availability.attached ? "Detach this magazine before handling it independently." : "Retrieve this Item to Loose before using or handling it.");
}
