import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertExactAccountDeletionConfirmation,
  getAccountDeletionConfirmation,
  getAccountDeletionProhibitions,
  parseAccountDeletionUserId,
  parseRequiredAccountDeletionReason,
} from "./admin-account-lifecycle-policy";
import {
  USER_ACCOUNT_FOREIGN_KEY_COUNT,
  USER_ACCOUNT_FOREIGN_KEY_PLAN,
} from "./user-account-delete-plan";

type SnapshotForeignKey = {
  name: string;
  tableTo: string;
  columnsFrom: string[];
  onDelete: "cascade" | "no action" | "restrict" | "set null";
};

type SnapshotTable = {
  name: string;
  foreignKeys: Record<string, SnapshotForeignKey>;
};

const snapshot = JSON.parse(
  readFileSync("drizzle/meta/0034_snapshot.json", "utf8"),
) as { tables: Record<string, SnapshotTable> };
const serviceSource = readFileSync(
  "src/features/lifecycle/admin-account-lifecycle-service.ts",
  "utf8",
);
const adminRosterLockSource = readFileSync(
  "src/features/authorization/admin-roster-lock.ts",
  "utf8",
);
const userRoleServiceSource = readFileSync(
  "src/features/authorization/user-role-service.ts",
  "utf8",
);
const userRoleActionsSource = readFileSync(
  "src/app/admin/users/actions.ts",
  "utf8",
);
const migration = readFileSync(
  "drizzle/0033_admin_account_lifecycle.sql",
  "utf8",
);
const verificationGuardMigration = readFileSync(
  "drizzle/0034_verification_user_delete_guard.sql",
  "utf8",
);

function byConstraint<T extends { constraintName: string }>(
  left: T,
  right: T,
): number {
  return left.constraintName.localeCompare(right.constraintName);
}

test("the account plan classifies the exact 67-FK User closure", () => {
  const actual = Object.values(snapshot.tables).flatMap((table) => (
    Object.values(table.foreignKeys ?? {})
      .filter(({ tableTo }) => tableTo === "user")
      .map((foreignKey) => ({
        tableName: table.name,
        columnName: foreignKey.columnsFrom[0] ?? "",
        constraintName: foreignKey.name,
        onDelete: foreignKey.onDelete,
      }))
  )).sort(byConstraint);
  const planned = USER_ACCOUNT_FOREIGN_KEY_PLAN.map((entry) => ({
    tableName: entry.tableName,
    columnName: entry.columnName,
    constraintName: entry.constraintName,
    onDelete: entry.onDelete,
  })).sort(byConstraint);

  assert.equal(USER_ACCOUNT_FOREIGN_KEY_PLAN.length, USER_ACCOUNT_FOREIGN_KEY_COUNT);
  assert.equal(USER_ACCOUNT_FOREIGN_KEY_COUNT, 67);
  assert.equal(new Set(planned.map(({ constraintName }) => constraintName)).size, 67);
  assert.deepEqual(planned, actual);
});

test("only authentication and membership associations are cleanup FKs", () => {
  assert.deepEqual(
    USER_ACCOUNT_FOREIGN_KEY_PLAN
      .filter(({ disposition }) => disposition === "cleanup")
      .map(({ constraintName }) => constraintName)
      .sort(),
    [
      "account_user_id_user_id_fk",
      "campaign_player_user_id_user_id_fk",
      "chat_room_member_user_id_user_id_fk",
      "session_user_id_user_id_fk",
      "user_role_user_id_user_id_fk",
    ],
  );
  assert.equal(
    USER_ACCOUNT_FOREIGN_KEY_PLAN.filter(({ disposition }) => disposition === "block").length,
    62,
  );
  assert.ok(
    USER_ACCOUNT_FOREIGN_KEY_PLAN
      .filter(({ onDelete }) => onDelete === "set null")
      .every(({ disposition }) => disposition === "block"),
    "nullable attribution must remain a deletion blocker",
  );
  assert.equal(
    USER_ACCOUNT_FOREIGN_KEY_PLAN.find(
      ({ constraintName }) => constraintName === "campaign_character_player_user_id_user_id_fk",
    )?.disposition,
    "block",
    "the database cascade must never silently delete Characters or NPCs",
  );
});

test("account inputs require an exact User ID, reason, and DELETE-email confirmation", () => {
  assert.equal(parseAccountDeletionUserId("user-2"), "user-2");
  assert.throws(() => parseAccountDeletionUserId(""), /valid User account/);
  assert.throws(() => parseAccountDeletionUserId("   "), /valid User account/);
  assert.equal(
    parseRequiredAccountDeletionReason("  Duplicate registration  "),
    "Duplicate registration",
  );
  assert.throws(() => parseRequiredAccountDeletionReason(""), /reason is required/);
  assert.throws(() => parseRequiredAccountDeletionReason("x".repeat(1001)), /1,000/);

  assert.equal(
    getAccountDeletionConfirmation("player@example.com"),
    "DELETE player@example.com",
  );
  assert.doesNotThrow(() => assertExactAccountDeletionConfirmation(
    "player@example.com",
    "DELETE player@example.com",
  ));
  for (const invalid of [
    "player@example.com",
    "delete player@example.com",
    "DELETE PLAYER@EXAMPLE.COM",
    "DELETE player@example.com ",
  ]) {
    assert.throws(
      () => assertExactAccountDeletionConfirmation("player@example.com", invalid),
      /Type exactly/,
    );
  }
});

test("self deletion and deletion of the last administrator are prohibited", () => {
  assert.deepEqual(getAccountDeletionProhibitions({
    actingUserId: "admin-1",
    targetUserId: "admin-1",
    targetIsAdministrator: true,
    activeAdministratorCount: 1,
  }), [
    "Administrators cannot delete their own account.",
    "The last administrator account cannot be deleted.",
  ]);
  assert.deepEqual(getAccountDeletionProhibitions({
    actingUserId: "admin-1",
    targetUserId: "admin-2",
    targetIsAdministrator: true,
    activeAdministratorCount: 2,
  }), []);
});

test("migration 0033 extends only the lifecycle audit entity-kind constraint", () => {
  assert.match(migration, /DROP CONSTRAINT "lifecycle_audit_event_entity_kind_valid"/);
  assert.match(migration, /ADD CONSTRAINT "lifecycle_audit_event_entity_kind_valid"/);
  assert.match(migration, /'campaign-player',\s*'user-account'/);
  assert.doesNotMatch(
    migration,
    /\b(?:CREATE TABLE|DROP TABLE|ADD COLUMN|DROP COLUMN|DELETE FROM|UPDATE|INSERT INTO|TRUNCATE)\b/i,
  );
});

test("migration 0034 serializes User-bound verification writes and rejects deleted IDs", () => {
  assert.match(
    verificationGuardMigration,
    /BEFORE INSERT OR UPDATE OF "value" ON public\."verification"/,
  );
  assert.match(
    verificationGuardMigration,
    /FROM public\."user"[\s\S]*?WHERE "id" = NEW\."value"[\s\S]*?FOR KEY SHARE/,
  );
  assert.match(
    verificationGuardMigration,
    /FROM public\."lifecycle_audit_event"[\s\S]*?"entity_kind" = 'user-account'[\s\S]*?"action" = 'delete'[\s\S]*?"target_id" = NEW\."value"/,
  );
  assert.match(verificationGuardMigration, /ERRCODE = '23503'/);
  assert.doesNotMatch(
    verificationGuardMigration,
    /(?:reset-password|delete-account|revoke-unproven-account-access)/,
    "the guard must preserve polymorphic values without brittle identifier-prefix guesses",
  );
});

test("the server-only service reloads Admin authority and serializes destructive checks", () => {
  assert.match(serviceSource, /^import "server-only";/);
  assert.match(serviceSource, /export async function previewAdminAccountDeletion/);
  assert.match(serviceSource, /export async function permanentlyDeleteAdminAccount/);
  assert.match(serviceSource, /lockAdministratorRosterInTransaction\(tx\)/);
  assert.match(adminRosterLockSource, /from user_role\s+where role = 'admin'[\s\S]*?for update/);
  assert.match(adminRosterLockSource, /pg_advisory_xact_lock\(19372026, 1\)/);
  assert.match(serviceSource, /from "user"[\s\S]*?order by id\s+for update/);
  assert.doesNotMatch(serviceSource, /lock table "verification"/);
  assert.match(serviceSource, /activeAdministratorIds\.includes\(actingUserId\)/);
  const lockedContextStart = serviceSource.indexOf("async function loadLockedDeletionContext");
  const lockedContextEnd = serviceSource.indexOf(
    "export async function previewAdminAccountDeletion",
    lockedContextStart,
  );
  const lockedContext = serviceSource.slice(lockedContextStart, lockedContextEnd);
  assert.ok(
    lockedContext.indexOf("activeAdministratorIds.includes(actingUserId)")
      < lockedContext.indexOf("where id = ${actingUserId} or id = ${targetUserId}"),
    "a non-Admin actor must be rejected before target identity lookup",
  );
  assert.doesNotMatch(serviceSource, /input\.(?:roles|isAdmin|dependencies|blockers)/);
});

test("role mutation shares the account-deletion lock and reauthorizes after acquiring it", () => {
  const actionStart = userRoleActionsSource.indexOf("export async function setUserRole");
  const actionEnd = userRoleActionsSource.indexOf(
    "export async function deleteAdminAccount",
    actionStart,
  );
  const actionBlock = userRoleActionsSource.slice(actionStart, actionEnd);
  assert.ok(
    actionBlock.indexOf("assertPreliminaryAdministratorAccess(session.user.id)")
      < actionBlock.indexOf("db.transaction"),
    "a non-Admin role request must be rejected before it can contend on the roster lock",
  );

  assert.match(
    adminRosterLockSource,
    /export async function assertPreliminaryAdministratorAccess[\s\S]*?\.where\(and\(eq\(userRole\.userId, actingUserId\), eq\(userRole\.role, "admin"\)\)\)/,
  );
  const lockIndex = userRoleServiceSource.indexOf(
    "lockAdministratorRosterInTransaction(tx)",
  );
  const authorizationIndex = userRoleServiceSource.indexOf(
    ".where(and(eq(userRole.userId, actingUserId)",
  );
  const writeIndex = userRoleServiceSource.indexOf("const changedRows");
  assert.ok(lockIndex >= 0);
  assert.ok(lockIndex < authorizationIndex);
  assert.ok(authorizationIndex < writeIndex);
});

test("permanent deletion gates twice, rechecks every dependency, audits, and cleans only allowlisted rows", () => {
  const deleteStart = serviceSource.indexOf(
    "export async function permanentlyDeleteAdminAccount",
  );
  const deleteBlock = serviceSource.slice(deleteStart);
  assert.equal(
    (deleteBlock.match(/assertPermanentDeletionEnabled\(\)/g) ?? []).length,
    2,
  );
  assert.ok(
    deleteBlock.indexOf("await assertPreliminaryAdministratorAccess(actingUserId)")
      < deleteBlock.indexOf("assertPermanentDeletionEnabled()"),
    "the actor must prove current Admin authority before feature-gate or input disclosure",
  );
  assert.ok(
    deleteBlock.indexOf("assertPermanentDeletionEnabled()")
      < deleteBlock.indexOf("db.transaction"),
  );
  assert.ok(
    deleteBlock.lastIndexOf("assertPermanentDeletionEnabled()")
      > deleteBlock.indexOf("db.transaction"),
  );
  assert.match(deleteBlock, /collectDependencies\(tx, targetUserId\)/);
  assert.doesNotMatch(deleteBlock, /lockVerificationWritesForDeletion/);
  assert.match(deleteBlock, /preview\.blockers\.length > 0/);
  assert.match(deleteBlock, /entityKind: "user-account"/);
  assert.match(deleteBlock, /ownerUserIdSnapshot: preview\.target\.id/);
  assert.ok(
    deleteBlock.indexOf("tx.insert(lifecycleAuditEvent)")
      < deleteBlock.indexOf("deleteCleanupRows(tx, targetUserId)"),
  );
  assert.match(deleteBlock, /testSeam\.afterDelete/);
  assert.match(
    deleteBlock,
    /publishChatDirectoryInvalidationInTransaction\(tx\)/,
  );

  const cleanupStart = serviceSource.indexOf("async function deleteCleanupRows");
  const cleanupEnd = serviceSource.indexOf(
    "export async function permanentlyDeleteAdminAccount",
    cleanupStart,
  );
  const cleanupBlock = serviceSource.slice(cleanupStart, cleanupEnd);
  for (const table of [
    "session",
    "account",
    "verification",
    "chatRoomMember",
    "campaignPlayer",
    "userRole",
  ]) {
    assert.match(cleanupBlock, new RegExp(`tx\\.delete\\(${table}\\)`));
  }
  assert.match(cleanupBlock, /eq\(verification\.value, targetUserId\)/);
  assert.doesNotMatch(cleanupBlock, /campaignCharacter|lifecycleAuditEvent|chatMessage/);
});
