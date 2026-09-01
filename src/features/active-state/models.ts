export type ActiveHealthPoolAnatomy = {
  key: string;
  name: string;
  maximumHp: number | null;
  percentage: number | null;
  sortOrder: number;
};

export type ActiveHealthHitLocation = {
  result: number;
  name: string;
  bodyParts: string;
  poolKey: string | null;
  poolName: string | null;
};

export type ActiveHealthAnatomy = {
  kind: "humanoid" | "creature";
  totalMaximumHp: number | null;
  maximumHpNote: string | null;
  pools: ActiveHealthPoolAnatomy[];
  hitLocations: ActiveHealthHitLocation[];
};

export type ActiveHealthPoolState = {
  poolKey: string;
  poolNameSnapshot: string;
  damage: number;
};

export type ActiveHealthInjury = {
  id: number;
  characterId: number;
  poolKey: string;
  poolNameSnapshot: string;
  hitLocationNumber: number | null;
  hitLocationNameSnapshot: string | null;
  name: string;
  notes: string;
  damageAmount: number | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActiveHealthState = {
  characterId: number;
  totalDamage: number;
  pools: ActiveHealthPoolState[];
  injuries: ActiveHealthInjury[];
};

export type ActiveHealthTrack = {
  key: string;
  name: string;
  maximumHp: number | null;
  damage: number;
  remainingHp: number | null;
  overDamage: number | null;
  percentage: number | null;
  orphaned: boolean;
};

export type ActiveHealthView = ActiveHealthState & {
  anatomy: ActiveHealthAnatomy;
  total: Omit<ActiveHealthTrack, "key" | "percentage" | "orphaned">;
  tracks: ActiveHealthTrack[];
  unresolvedInjuryCount: number;
};

export type LocalizedDamageInput = {
  amount: number;
  hitLocationNumber?: number | null;
  poolKey?: string | null;
};

export type ResolvedLocalizedDamage = {
  amount: number;
  poolKey: string;
  poolName: string;
  hitLocationNumber: number | null;
  hitLocationName: string | null;
};
