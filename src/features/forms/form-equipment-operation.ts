/** Exact physical operation identities shared by the ruling UI and runtime.
 * Initiative, request keys and commerce versions do not describe capability. */
export function inventoryFormOperationRef(command: {
  operation: string; itemId: number; instanceId: number | null; quantity: number; containerInstanceId: number | null;
}) {
  return `inventory:${command.operation}:${command.itemId}:${command.instanceId ?? 'stack'}:${command.quantity}:${command.containerInstanceId ?? 'loose'}`;
}

export function magazineFormOperationRef(command: { instanceId: number; ammunitionItemId: number; rounds: number }) {
  return `magazine-fill:${command.instanceId}:${command.ammunitionItemId}:${command.rounds}`;
}
