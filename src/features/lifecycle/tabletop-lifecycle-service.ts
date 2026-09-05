import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";

import {
  assertOwnedRootManager,
  assertPermanentDeletionEnabled,
  isLifecycleActor,
  isPermanentDeletionEnabled,
} from "./policy";
import type { LifecycleActor, LifecycleDependency } from "./types";
import {
  TABLETOP_LIFECYCLE_ENTITY_KINDS,
  type TabletopLifecycleEntityKind,
  type TabletopLifecyclePreview,
  type TabletopLifecycleStatus,
  type TabletopLifecycleTargetInput,
} from "./tabletop-lifecycle-types";

export type TabletopLifecycleTransaction =
  Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TabletopLifecycleRootSnapshot = {
  id: number;
  title: string;
  sequence_number: number;
  status: TabletopLifecycleStatus;
  campaign_id: number;
  campaign_name: string;
  owner_user_id: string;
  owner_label: string;
  parent_session_status: TabletopLifecycleStatus | null;
  parent_scene_status: TabletopLifecycleStatus | null;
};

type CountRow = { value: number | string };

type DependencySpec = {
  label: string;
  blocking: boolean;
  query: SQL<CountRow>;
};

const ENTITY_LABELS: Record<TabletopLifecycleEntityKind, string> = {
  "campaign-session": "Session",
  scene: "Scene",
  encounter: "Encounter",
};

const INITIATIVE_TABLES = [
  "campaign_session_encounter_initiative",
  "campaign_session_encounter_initiative_participant",
] as const;

const ACTION_HISTORY_TABLES = [
  "campaign_session_encounter_pending_action",
  "campaign_session_encounter_pending_action_source",
  "campaign_session_encounter_reaction",
  "campaign_session_encounter_reaction_event",
  "campaign_session_encounter_action_declaration",
  "campaign_session_encounter_action_declaration_event",
  "campaign_session_encounter_responder_opportunity",
] as const;

const EFFECT_HISTORY_TABLES = [
  "campaign_session_encounter_effect_plan",
  "campaign_session_encounter_effect",
  "campaign_session_encounter_effect_plan_event",
] as const;

const CHECK_AND_RULING_TABLES = [
  "campaign_session_called_check_batch",
  "campaign_session_called_check_request",
  "campaign_session_high_low_request",
  "campaign_session_player_ruling_request",
  "campaign_session_player_ruling_request_event",
] as const;

const FIREARM_HISTORY_TABLES = [
  "campaign_session_encounter_firearm_attack",
  "campaign_session_encounter_firearm_bullet",
  "campaign_session_encounter_firearm_attack_event",
  "campaign_character_firearm_preparation",
] as const;

const DERIVED_ABILITY_HISTORY_TABLES = [
  "character_derived_ability_use",
  "character_derived_ability_recharge",
] as const;

function parseTabletopLifecycleTarget(
  input: TabletopLifecycleTargetInput,
): TabletopLifecycleTargetInput {
  if (
    !input
    || typeof input.entityKind !== "string"
    || !(TABLETOP_LIFECYCLE_ENTITY_KINDS as readonly string[]).includes(input.entityKind)
  ) {
    throw new Error("A supported Tabletop lifecycle entity type is required.");
  }
  if (!Number.isInteger(input.entityId) || input.entityId <= 0) {
    throw new Error("A saved Tabletop lifecycle record must be selected.");
  }
  return { entityKind: input.entityKind, entityId: input.entityId };
}

function ownerDisplaySql(alias = "u") {
  return sql.raw(
    `coalesce(nullif(trim(${alias}.display_username), ''), nullif(trim(${alias}.name), ''), ${alias}.email, ${alias}.id)`,
  );
}

async function loadRootSnapshot(
  tx: TabletopLifecycleTransaction,
  target: TabletopLifecycleTargetInput,
  lock: boolean,
): Promise<TabletopLifecycleRootSnapshot> {
  const lockClause = lock ? sql.raw("for update of t") : sql.raw("");
  let query: SQL<TabletopLifecycleRootSnapshot>;

  switch (target.entityKind) {
    case "campaign-session":
      query = sql<TabletopLifecycleRootSnapshot>`
        select t.id, t.title, t.sequence_number, t.status,
               t.campaign_id, c.name as campaign_name,
               c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label,
               null::campaign_session_status as parent_session_status,
               null::campaign_session_scene_status as parent_scene_status
        from campaign_session t
        inner join campaign c on c.id = t.campaign_id
        left join "user" u on u.id = c.created_by_user_id
        where t.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "scene":
      query = sql<TabletopLifecycleRootSnapshot>`
        select t.id, t.title, t.sequence_number, t.status,
               t.campaign_id, c.name as campaign_name,
               c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label,
               s.status as parent_session_status,
               null::campaign_session_scene_status as parent_scene_status
        from campaign_session_scene t
        inner join campaign_session s
          on s.id = t.session_id and s.campaign_id = t.campaign_id
        inner join campaign c on c.id = t.campaign_id
        left join "user" u on u.id = c.created_by_user_id
        where t.id = ${target.entityId}
        ${lockClause}
      `;
      break;
    case "encounter":
      query = sql<TabletopLifecycleRootSnapshot>`
        select t.id, t.title, t.sequence_number, t.status,
               t.campaign_id, c.name as campaign_name,
               c.created_by_user_id as owner_user_id,
               ${ownerDisplaySql()} as owner_label,
               s.status as parent_session_status,
               sc.status as parent_scene_status
        from campaign_session_encounter t
        inner join campaign_session_scene sc
          on sc.id = t.scene_id
         and sc.session_id = t.session_id
         and sc.campaign_id = t.campaign_id
        inner join campaign_session s
          on s.id = t.session_id and s.campaign_id = t.campaign_id
        inner join campaign c on c.id = t.campaign_id
        left join "user" u on u.id = c.created_by_user_id
        where t.id = ${target.entityId}
        ${lockClause}
      `;
      break;
  }

  const result = await tx.execute(query);
  const root = result.rows[0] as TabletopLifecycleRootSnapshot | undefined;
  if (!root) {
    throw new Error(`That ${ENTITY_LABELS[target.entityKind]} no longer exists.`);
  }
  return root;
}

function scopeColumn(kind: TabletopLifecycleEntityKind): string {
  if (kind === "campaign-session") return "session_id";
  if (kind === "scene") return "scene_id";
  return "encounter_id";
}

function directCountPart(
  tableName: string,
  columnName: string,
  entityId: number,
): SQL {
  return sql`(
    select count(*)
    from ${sql.identifier(tableName)}
    where ${sql.identifier(columnName)} = ${entityId}
  )`;
}

function sumCountQuery(parts: readonly SQL[]): SQL<CountRow> {
  if (parts.length === 0) return sql<CountRow>`select 0::int as value`;
  return sql<CountRow>`select (${sql.join([...parts], sql` + `)})::int as value`;
}

function countTables(
  tables: readonly string[],
  kind: TabletopLifecycleEntityKind,
  entityId: number,
  extras: readonly SQL[] = [],
): SQL<CountRow> {
  const column = scopeColumn(kind);
  return sumCountQuery([
    ...tables.map((tableName) => directCountPart(tableName, column, entityId)),
    ...extras,
  ]);
}

function relatedEventCountParts(
  kind: TabletopLifecycleEntityKind,
  entityId: number,
): SQL[] {
  const column = scopeColumn(kind);
  return [
    sql`(
      select count(*) from campaign_session_roll_amendment a
      inner join campaign_session_roll r on r.id = a.roll_id
      where r.${sql.identifier(column)} = ${entityId}
    )`,
    sql`(
      select count(*) from campaign_session_called_check_event e
      inner join campaign_session_called_check_request r on r.id = e.request_id
      where r.${sql.identifier(column)} = ${entityId}
    )`,
    sql`(
      select count(*) from campaign_session_high_low_event e
      inner join campaign_session_high_low_request r on r.id = e.request_id
      where r.${sql.identifier(column)} = ${entityId}
    )`,
  ];
}

function firearmEventCountPart(
  kind: TabletopLifecycleEntityKind,
  entityId: number,
): SQL {
  const column = scopeColumn(kind);
  return sql`(
    select count(*) from campaign_character_firearm_event e
    inner join campaign_character_firearm_preparation p on p.id = e.preparation_id
    where p.${sql.identifier(column)} = ${entityId}
  )`;
}

function preparationDependencySpecs(
  target: TabletopLifecycleTargetInput,
): DependencySpec[] {
  const id = target.entityId;
  if (target.entityKind === "campaign-session") {
    return [
      { label: "Roster references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_roster", "session_id", id)]) },
      { label: "Scenes", blocking: false, query: sumCountQuery([directCountPart("campaign_session_scene", "session_id", id)]) },
      { label: "Active or completed Scenes", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_scene where session_id = ${id} and status <> 'planned'` },
      { label: "Scene member references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_scene_member", "session_id", id)]) },
      { label: "Encounters", blocking: false, query: sumCountQuery([directCountPart("campaign_session_encounter", "session_id", id)]) },
      { label: "Active or completed Encounters", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter where session_id = ${id} and status <> 'planned'` },
      { label: "Encounter participant references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_encounter_participant", "session_id", id)]) },
    ];
  }
  if (target.entityKind === "scene") {
    return [
      { label: "Scene member references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_scene_member", "scene_id", id)]) },
      { label: "Encounters", blocking: false, query: sumCountQuery([directCountPart("campaign_session_encounter", "scene_id", id)]) },
      { label: "Active or completed Encounters", blocking: true, query: sql<CountRow>`select count(*)::int as value from campaign_session_encounter where scene_id = ${id} and status <> 'planned'` },
      { label: "Encounter participant references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_encounter_participant", "scene_id", id)]) },
    ];
  }
  return [
    { label: "Encounter participant references", blocking: false, query: sumCountQuery([directCountPart("campaign_session_encounter_participant", "encounter_id", id)]) },
  ];
}

function dependencySpecs(target: TabletopLifecycleTargetInput): DependencySpec[] {
  const { entityKind, entityId } = target;
  return [
    ...preparationDependencySpecs(target),
    { label: "Initiative runtime and history", blocking: true, query: countTables(INITIATIVE_TABLES, entityKind, entityId) },
    { label: "Action and reaction runtime/history", blocking: true, query: countTables(ACTION_HISTORY_TABLES, entityKind, entityId) },
    { label: "Effect plans, effects, and duration history", blocking: true, query: countTables(
      [...EFFECT_HISTORY_TABLES, "campaign_session_effect_duration_binding"],
      entityKind,
      entityId,
    ) },
    { label: "Encounter reward history", blocking: true, query: countTables(
      ["campaign_session_encounter_reward"],
      entityKind,
      entityId,
    ) },
    { label: "Roll, check, and ruling history", blocking: true, query: countTables(
      ["campaign_session_roll", ...CHECK_AND_RULING_TABLES],
      entityKind,
      entityId,
      relatedEventCountParts(entityKind, entityId),
    ) },
    { label: "Firearm runtime and history", blocking: true, query: countTables(
      FIREARM_HISTORY_TABLES,
      entityKind,
      entityId,
      [firearmEventCountPart(entityKind, entityId)],
    ) },
    { label: "Derived Ability use and recharge history", blocking: true, query: countTables(
      DERIVED_ABILITY_HISTORY_TABLES,
      entityKind,
      entityId,
    ) },
  ];
}

async function collectDependencies(
  tx: TabletopLifecycleTransaction,
  specs: readonly DependencySpec[],
): Promise<LifecycleDependency[]> {
  const dependencies: LifecycleDependency[] = [];
  for (const spec of specs) {
    const result = await tx.execute(spec.query);
    const count = Number((result.rows[0] as CountRow | undefined)?.value ?? 0);
    dependencies.push({
      label: spec.label,
      count: Number.isFinite(count) ? count : 0,
      blocking: spec.blocking,
    });
  }
  return dependencies;
}

function parentLifecycleBlockers(
  kind: TabletopLifecycleEntityKind,
  root: TabletopLifecycleRootSnapshot,
): string[] {
  if (kind === "scene" && root.parent_session_status === "completed") {
    return ["The parent Session is completed."];
  }
  if (kind === "encounter") {
    const blockers: string[] = [];
    if (root.parent_session_status === "completed") {
      blockers.push("The parent Session is completed.");
    }
    if (root.parent_scene_status === "completed") {
      blockers.push("The parent Scene is completed.");
    }
    return blockers;
  }
  return [];
}

async function buildPreview(
  tx: TabletopLifecycleTransaction,
  actor: LifecycleActor,
  target: TabletopLifecycleTargetInput,
  lock: boolean,
): Promise<{
  root: TabletopLifecycleRootSnapshot;
  preview: TabletopLifecyclePreview;
}> {
  if (!isLifecycleActor(actor)) {
    throw new Error("G.O.D. or administrator access is required.");
  }
  const root = await loadRootSnapshot(tx, target, lock);
  assertOwnedRootManager(actor, root.owner_user_id, ENTITY_LABELS[target.entityKind]);
  const dependencies = await collectDependencies(tx, dependencySpecs(target));
  const permanentDeletionEnabled = isPermanentDeletionEnabled();
  const dependencyBlockers = dependencies.filter(({ blocking, count }) => blocking && count > 0);
  const parentBlockers = parentLifecycleBlockers(target.entityKind, root);
  const blockers: string[] = [];
  if (root.status !== "planned") {
    blockers.push(`Only a planned ${ENTITY_LABELS[target.entityKind]} can be permanently deleted.`);
  }
  blockers.push(...parentBlockers);
  for (const dependency of dependencyBlockers) {
    blockers.push(`${dependency.label}: ${dependency.count}`);
  }
  if (!permanentDeletionEnabled) {
    blockers.push("Permanent deletion is disabled by production recovery protection.");
  }

  const parentsActive = target.entityKind === "campaign-session"
    || (
      root.parent_session_status === "active"
      && (target.entityKind === "scene" || root.parent_scene_status === "active")
    );
  return {
    root,
    preview: {
      entityKind: target.entityKind,
      entityId: target.entityId,
      entityName: root.title,
      campaignId: root.campaign_id,
      campaignName: root.campaign_name,
      ownerLabel: root.owner_label,
      status: root.status,
      canComplete: root.status === "active" && parentsActive,
      canReopen: root.status === "completed" && parentsActive,
      canDelete: blockers.length === 0,
      permanentDeletionEnabled,
      dependencies,
      blockers,
    },
  };
}

export async function previewTabletopLifecycleEntityForActor(
  input: TabletopLifecycleTargetInput,
  actor: LifecycleActor,
): Promise<TabletopLifecyclePreview> {
  const target = parseTabletopLifecycleTarget(input);
  return db.transaction(async (tx) => (
    await buildPreview(tx, actor, target, false)
  ).preview);
}

export async function prepareTabletopLifecycleMutationInTransaction(
  tx: TabletopLifecycleTransaction,
  input: TabletopLifecycleTargetInput,
  actor: LifecycleActor,
): Promise<{
  root: TabletopLifecycleRootSnapshot;
  preview: TabletopLifecyclePreview;
}> {
  const target = parseTabletopLifecycleTarget(input);
  return buildPreview(tx, actor, target, true);
}

export function assertTabletopPermanentDeletionAllowed(
  preview: TabletopLifecyclePreview,
): void {
  assertPermanentDeletionEnabled();
  if (preview.status !== "planned") {
    throw new Error(
      `Only a planned ${ENTITY_LABELS[preview.entityKind]} can be permanently deleted.`,
    );
  }
  const blockers = preview.dependencies.filter(
    ({ blocking, count }) => blocking && count > 0,
  );
  const parentBlockers = preview.blockers.filter((message) => message.startsWith("The parent"));
  if (parentBlockers.length > 0 || blockers.length > 0) {
    const dependencyText = blockers
      .map(({ label, count }) => `${label} (${count})`)
      .join(", ");
    throw new Error(
      `${ENTITY_LABELS[preview.entityKind]} cannot be permanently deleted while runtime or historical references remain: ${[
        ...parentBlockers,
        ...(dependencyText ? [dependencyText] : []),
      ].join(" ")}`,
    );
  }
}

export async function recordTabletopLifecycleAuditInTransaction(
  tx: TabletopLifecycleTransaction,
  actor: LifecycleActor,
  action: "archive" | "restore" | "delete",
  root: TabletopLifecycleRootSnapshot,
  preview: TabletopLifecyclePreview,
): Promise<void> {
  await tx.insert(lifecycleAuditEvent).values({
    action,
    entityKind: preview.entityKind,
    targetId: String(root.id),
    targetName: root.title,
    campaignIdSnapshot: root.campaign_id,
    ownerUserIdSnapshot: root.owner_user_id,
    actorUserId: actor.userId,
    reason: action === "archive"
      ? "Completed Tabletop domain lifecycle."
      : action === "restore"
        ? "Reopened Tabletop domain lifecycle."
        : "Permanently deleted planned Tabletop root.",
    dependencySummaryJson: {
      status: root.status,
      dependencies: preview.dependencies,
      blockers: preview.blockers,
    },
  });
}
