import type { SpellContainer } from '../models/spell';

export function updateContainer(
  containers: readonly SpellContainer[],
  containerId: string,
  updater: (container: SpellContainer) => SpellContainer,
): SpellContainer[] {
  return containers.map((container) => {
    if (container.id === containerId) return updater(container);
    const children = updateContainer(container.children, containerId, updater);
    return children === container.children ? container : { ...container, children };
  });
}

export function removeContainer(
  containers: readonly SpellContainer[],
  containerId: string,
): SpellContainer[] {
  return containers
    .filter((container) => container.id !== containerId)
    .map((container) => ({
      ...container,
      children: removeContainer(container.children, containerId),
    }));
}

export function findContainer(
  containers: readonly SpellContainer[],
  containerId: string,
): SpellContainer | undefined {
  for (const container of containers) {
    if (container.id === containerId) return container;
    const child = findContainer(container.children, containerId);
    if (child) return child;
  }
  return undefined;
}

