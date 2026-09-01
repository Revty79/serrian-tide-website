import {
  decodeMechanicalEffect,
  planMechanicalEffect,
  type MechanicalEffect,
  type MechanicalEffectApplication,
  type MechanicalEffectPlan,
  type MechanicalEffectSource,
} from "@/features/mechanical-effects";
import {
  resolveActiveHealthView,
} from "@/features/active-state/health-rules";
import type {
  ActiveHealthAnatomy,
  ActiveHealthState,
  ActiveHealthView,
} from "@/features/active-state/models";

import { getItemOwnershipStrategy } from "./item-ownership";
import {
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
} from "./item-runtime";

export type ItemUseEffectSelection = {
  poolKey?: string | null;
  hitLocationNumber?: number | null;
};

export type ItemUseRequest = {
  sourceCharacterId: number;
  itemId: number;
  itemInstanceId: number | null;
  targetCharacterId: number | null;
  effectSelections: Record<string, ItemUseEffectSelection>;
};

export type PersistedItemUseEffect = {
  id: number;
  schemaVersion: number;
  effectJson: unknown;
  sortOrder: number;
};

export type ItemUseDefinition = {
  id: number;
  name: string;
  runtimeProfile: ItemRuntimeProfile;
  effects: readonly PersistedItemUseEffect[];
};

export type ItemUseResource =
  | { kind: "stack"; quantity: number }
  | { kind: "instance"; instanceId: number; currentCharges: number };

export type ItemUseTargetContext = {
  characterId: number;
  name: string;
  anatomy: ActiveHealthAnatomy;
  state: ActiveHealthState;
};

export type ItemUseResourcePreview =
  | {
      kind: "stack";
      useMode: "consume-item" | "unlimited";
      before: number;
      after: number;
      consumed: number;
    }
  | {
      kind: "instance";
      useMode: "charges";
      instanceId: number;
      before: number;
      after: number;
      consumed: number;
      maximumCharges: number;
      exceedsCurrentMaximum: boolean;
    };

export type ItemUsePlanStatus =
  | "ready"
  | "needs-selection"
  | "insufficient-resource"
  | "not-executable"
  | "invalid";

export type PlannedItemUseEffect = {
  effectId: number;
  sortOrder: number;
  effect: MechanicalEffect | null;
  plan: MechanicalEffectPlan;
};

export type ItemUsePlan = {
  status: ItemUsePlanStatus;
  ready: boolean;
  item: {
    id: number;
    name: string;
    activationLabel: string;
    useNotes: string;
    rechargeNotes: string;
    useMode: ItemRuntimeProfile["useMode"];
  };
  source: MechanicalEffectSource;
  target: { characterId: number; name: string };
  resource: ItemUseResourcePreview | null;
  effects: PlannedItemUseEffect[];
  manualEffects: Array<{ effectId: number; title: string; description: string }>;
  missingSelectionEffectIds: number[];
  issues: string[];
  initialHealth: ActiveHealthView;
  finalHealth: ActiveHealthView;
};

export type ItemUseActivatability =
  | { executable: true; reason: null }
  | { executable: false; reason: string };

export type ItemUseOwnershipRequirement = "none" | "stack" | "instance";

export function getItemUseOwnershipRequirement(
  runtimeProfile: ItemRuntimeProfile,
): ItemUseOwnershipRequirement {
  const validation = validateItemRuntimeProfile(runtimeProfile);
  if (!validation.valid) throw new Error(validation.issues.map(({ message }) => message).join(" "));
  if (validation.profile.useMode === "none") return "none";
  return getItemOwnershipStrategy(validation.profile);
}

export function getItemUseActivatability(
  runtimeProfile: ItemRuntimeProfile,
  effectCount: number,
): ItemUseActivatability {
  const validation = validateItemRuntimeProfile(runtimeProfile);
  if (!validation.valid) {
    return { executable: false, reason: validation.issues.map(({ message }) => message).join(" ") };
  }
  if (validation.profile.useMode === "none") {
    return { executable: false, reason: "This Item has no activated use." };
  }
  if (!Number.isSafeInteger(effectCount) || effectCount <= 0) {
    return {
      executable: false,
      reason: "This Item has no valid Mechanical Effects and will not consume resources.",
    };
  }
  return { executable: true, reason: null };
}

function invalidMechanicalEffectPlan(message: string): MechanicalEffectPlan {
  return {
    status: "invalid",
    effect: null,
    source: null,
    summary: "Invalid Mechanical Effect",
    requirements: [],
    missingSelections: [],
    issues: [{ code: "invalid-effect", path: "effect", message }],
    healthResult: null,
  };
}

function planResource(input: {
  profile: ItemRuntimeProfile;
  resource: ItemUseResource;
  requestedItemInstanceId: number | null;
}): { preview: ItemUseResourcePreview | null; issue: string | null } {
  const { profile, resource } = input;
  const requirement = getItemUseOwnershipRequirement(profile);
  if (requirement === "none") return { preview: null, issue: "This Item has no activated use." };

  if (requirement === "instance") {
    if (resource.kind !== "instance") {
      return { preview: null, issue: "This activated Item requires a specific owned Item copy." };
    }
    if (input.requestedItemInstanceId !== resource.instanceId) {
      return { preview: null, issue: "The selected owned Item copy does not match the locked instance." };
    }
    const consumed = profile.chargesPerUse ?? 0;
    if (resource.currentCharges < consumed) {
      return {
        preview: {
          kind: "instance",
          useMode: "charges",
          instanceId: resource.instanceId,
          before: resource.currentCharges,
          after: resource.currentCharges,
          consumed,
          maximumCharges: profile.maximumCharges ?? 0,
          exceedsCurrentMaximum: resource.currentCharges > (profile.maximumCharges ?? 0),
        },
        issue: `This Item copy needs ${consumed} Charges but has ${resource.currentCharges}.`,
      };
    }
    return {
      preview: {
        kind: "instance",
        useMode: "charges",
        instanceId: resource.instanceId,
        before: resource.currentCharges,
        after: resource.currentCharges - consumed,
        consumed,
        maximumCharges: profile.maximumCharges ?? 0,
        exceedsCurrentMaximum: resource.currentCharges > (profile.maximumCharges ?? 0),
      },
      issue: null,
    };
  }

  if (resource.kind !== "stack" || !Number.isSafeInteger(resource.quantity) || resource.quantity <= 0) {
    return { preview: null, issue: "The source Character does not own a usable Item stack." };
  }
  if (profile.useMode === "unlimited") {
    return {
      preview: {
        kind: "stack",
        useMode: "unlimited",
        before: resource.quantity,
        after: resource.quantity,
        consumed: 0,
      },
      issue: null,
    };
  }
  const consumed = profile.quantityPerUse ?? 0;
  if (resource.quantity < consumed) {
    return {
      preview: {
        kind: "stack",
        useMode: "consume-item",
        before: resource.quantity,
        after: resource.quantity,
        consumed,
      },
      issue: `This use needs ${consumed} owned Items but only ${resource.quantity} remain.`,
    };
  }
  return {
    preview: {
      kind: "stack",
      useMode: "consume-item",
      before: resource.quantity,
      after: resource.quantity - consumed,
      consumed,
    },
    issue: null,
  };
}

export function planItemUse(input: {
  definition: ItemUseDefinition;
  resource: ItemUseResource;
  requestedItemInstanceId: number | null;
  target: ItemUseTargetContext;
  effectSelections?: Readonly<Record<string, ItemUseEffectSelection>>;
}): ItemUsePlan {
  const source: MechanicalEffectSource = {
    kind: "item",
    id: input.definition.id,
    name: input.definition.name,
  };
  const runtimeValidation = validateItemRuntimeProfile(input.definition.runtimeProfile);
  const fallbackProfile = input.definition.runtimeProfile;
  const item = {
    id: input.definition.id,
    name: input.definition.name,
    activationLabel: fallbackProfile.activationLabel,
    useNotes: fallbackProfile.useNotes,
    rechargeNotes: fallbackProfile.rechargeNotes,
    useMode: fallbackProfile.useMode,
  };
  const initialHealth = resolveActiveHealthView(input.target.anatomy, input.target.state);
  const base = {
    item,
    source,
    target: { characterId: input.target.characterId, name: input.target.name },
    effects: [] as PlannedItemUseEffect[],
    manualEffects: [] as ItemUsePlan["manualEffects"],
    missingSelectionEffectIds: [] as number[],
    initialHealth,
    finalHealth: initialHealth,
  };
  if (!runtimeValidation.valid) {
    return {
      ...base,
      status: "invalid",
      ready: false,
      resource: null,
      issues: runtimeValidation.issues.map(({ message }) => message),
    };
  }
  const profile = runtimeValidation.profile;
  item.activationLabel = profile.activationLabel;
  item.useNotes = profile.useNotes;
  item.rechargeNotes = profile.rechargeNotes;
  item.useMode = profile.useMode;
  const activatability = getItemUseActivatability(profile, input.definition.effects.length);
  if (!activatability.executable) {
    return {
      ...base,
      item,
      status: "not-executable",
      ready: false,
      resource: null,
      issues: [activatability.reason],
    };
  }
  if (!Number.isInteger(input.target.characterId) || input.target.characterId <= 0) {
    return {
      ...base,
      item,
      status: "invalid",
      ready: false,
      resource: null,
      issues: ["Item use requires one saved target Character."],
    };
  }

  const resourcePlan = planResource({
    profile,
    resource: input.resource,
    requestedItemInstanceId: input.requestedItemInstanceId,
  });
  if (resourcePlan.issue) {
    return {
      ...base,
      item,
      status: resourcePlan.preview ? "insufficient-resource" : "invalid",
      ready: false,
      resource: resourcePlan.preview,
      issues: [resourcePlan.issue],
    };
  }

  const ordered = [...input.definition.effects].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
  );
  const seenIds = new Set<number>();
  const seenOrders = new Set<number>();
  let currentState = input.target.state;
  const effects: PlannedItemUseEffect[] = [];
  const manualEffects: ItemUsePlan["manualEffects"] = [];
  const missingSelectionEffectIds: number[] = [];
  const issues: string[] = [];

  for (const persisted of ordered) {
    if (!Number.isInteger(persisted.id) || persisted.id <= 0 || seenIds.has(persisted.id)) {
      issues.push("Item Mechanical Effects contain an invalid or duplicate persisted identity.");
      effects.push({
        effectId: persisted.id,
        sortOrder: persisted.sortOrder,
        effect: null,
        plan: invalidMechanicalEffectPlan(issues.at(-1)!),
      });
      continue;
    }
    seenIds.add(persisted.id);
    if (!Number.isSafeInteger(persisted.sortOrder) || persisted.sortOrder < 0 || seenOrders.has(persisted.sortOrder)) {
      issues.push(`Item Effect ${persisted.id} has an invalid or duplicate execution order.`);
      effects.push({
        effectId: persisted.id,
        sortOrder: persisted.sortOrder,
        effect: null,
        plan: invalidMechanicalEffectPlan(issues.at(-1)!),
      });
      continue;
    }
    seenOrders.add(persisted.sortOrder);

    let effect: MechanicalEffect;
    try {
      effect = decodeMechanicalEffect(persisted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Item Mechanical Effect is invalid.";
      issues.push(`Item Effect ${persisted.id}: ${message}`);
      effects.push({
        effectId: persisted.id,
        sortOrder: persisted.sortOrder,
        effect: null,
        plan: invalidMechanicalEffectPlan(message),
      });
      continue;
    }

    const selection = input.effectSelections?.[String(persisted.id)] ?? {};
    const application: MechanicalEffectApplication = {
      targetCharacterId: input.target.characterId,
      poolKey: selection.poolKey,
      hitLocationNumber: selection.hitLocationNumber,
    };
    const plan = planMechanicalEffect({
      effect,
      source,
      application,
      health: { anatomy: input.target.anatomy, state: currentState },
    });
    effects.push({ effectId: persisted.id, sortOrder: persisted.sortOrder, effect, plan });
    if (plan.status === "manual") {
      manualEffects.push({
        effectId: persisted.id,
        title: effect.kind === "manual" ? effect.title : plan.summary,
        description: effect.kind === "manual" ? effect.description : "",
      });
    } else if (plan.status === "needs-selection") {
      missingSelectionEffectIds.push(persisted.id);
    } else if (plan.status === "invalid") {
      issues.push(...plan.issues.map(({ message }) => `Item Effect ${persisted.id}: ${message}`));
    } else if (plan.healthResult) {
      currentState = plan.healthResult.nextState;
    }
  }

  const finalHealth = resolveActiveHealthView(input.target.anatomy, currentState);
  const status: ItemUsePlanStatus = issues.length
    ? "invalid"
    : missingSelectionEffectIds.length
      ? "needs-selection"
      : "ready";
  return {
    ...base,
    item,
    status,
    ready: status === "ready",
    resource: resourcePlan.preview,
    effects,
    manualEffects,
    missingSelectionEffectIds,
    issues,
    finalHealth,
  };
}

export type ItemUseExecutionResult = {
  success: true;
  item: ItemUsePlan["item"];
  target: ItemUsePlan["target"];
  resource: ItemUseResourcePreview;
  automaticEffects: Array<{ effectId: number; summary: string }>;
  manualEffects: ItemUsePlan["manualEffects"];
  finalHealth: ActiveHealthView;
};

export type ItemUseExecutionOperations = {
  loadAndPlan: () => Promise<ItemUsePlan>;
  consumeResource: (resource: ItemUseResourcePreview) => Promise<void>;
  applyAutomaticEffect: (effect: PlannedItemUseEffect) => Promise<void>;
};

export type ItemUseTransactionRunner = (
  operation: (operations: ItemUseExecutionOperations) => Promise<ItemUseExecutionResult>,
) => Promise<ItemUseExecutionResult>;

export async function executeItemUseInTransaction(
  runTransaction: ItemUseTransactionRunner,
): Promise<ItemUseExecutionResult> {
  return runTransaction(async (operations) => {
    const plan = await operations.loadAndPlan();
    if (!plan.ready || plan.status !== "ready" || !plan.resource) {
      throw new Error(plan.issues[0] ?? (
        plan.status === "needs-selection"
          ? "Item use is missing one or more required effect selections."
          : "Item use is not ready."
      ));
    }

    await operations.consumeResource(plan.resource);
    const automaticEffects: ItemUseExecutionResult["automaticEffects"] = [];
    for (const effect of plan.effects) {
      if (effect.plan.status !== "ready") continue;
      await operations.applyAutomaticEffect(effect);
      automaticEffects.push({ effectId: effect.effectId, summary: effect.plan.summary });
    }

    return {
      success: true,
      item: plan.item,
      target: plan.target,
      resource: plan.resource,
      automaticEffects,
      manualEffects: plan.manualEffects,
      finalHealth: plan.finalHealth,
    };
  });
}

export type ItemUseAccessSubject = { userId: string; roles: readonly string[] };
export type ItemUseAccessEntity = {
  characterId: number;
  campaignId: number;
  playerUserId: string;
  campaignOwnerUserId: string;
  isNpc: boolean;
  isCampaignMember: boolean;
};

export function canExecuteItemUse(
  subject: ItemUseAccessSubject,
  source: ItemUseAccessEntity,
  target: ItemUseAccessEntity,
): boolean {
  if (source.campaignId !== target.campaignId) return false;
  if (
    subject.roles.includes("god")
    && subject.userId === source.campaignOwnerUserId
    && subject.userId === target.campaignOwnerUserId
  ) {
    return true;
  }
  return (
    subject.roles.includes("player")
    && source.characterId === target.characterId
    && !source.isNpc
    && !target.isNpc
    && source.isCampaignMember
    && target.isCampaignMember
    && source.playerUserId === subject.userId
    && target.playerUserId === subject.userId
  );
}
