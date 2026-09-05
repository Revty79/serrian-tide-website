import "server-only";

import { eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaignPlayer } from "@/db/campaign-schema";
import { chatRoomMember } from "@/db/chat-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import {
  assertPreliminaryAdministratorAccess,
  lockAdministratorRosterInTransaction,
} from "@/features/authorization/admin-roster-lock";
import { publishLiveSessionRevocationInTransaction } from "@/features/authorization/live-session-revocation";
import { publishChatDirectoryInvalidationInTransaction } from "@/features/chat/chat-live-events";

import {
  assertPermanentDeletionEnabled,
  isPermanentDeletionEnabled,
} from "./policy";
import {
  USER_ACCOUNT_FOREIGN_KEY_PLAN,
} from "./user-account-delete-plan";
import {
  assertExactAccountDeletionConfirmation,
  getAccountDeletionConfirmation,
  getAccountDeletionProhibitions,
  parseAccountDeletionUserId,
  parseRequiredAccountDeletionReason,
} from "./admin-account-lifecycle-policy";

export type AdminAccountLifecycleTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type AccountIdentityRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  display_username: string | null;
};

type ReferenceCountRow = {
  plan_index: number | string;
  value: number | string;
};

export type AdminAccountDeletionDependency = {
  key: string;
  label: string;
  tableName: string;
  columnName: string;
  count: number;
  blocking: boolean;
};

export type AdminAccountDeletionPreview = {
  target: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    displayUsername: string | null;
  };
  expectedConfirmation: string;
  targetIsAdministrator: boolean;
  activeAdministratorCount: number;
  permanentDeletionEnabled: boolean;
  dependencies: AdminAccountDeletionDependency[];
  blockers: AdminAccountDeletionDependency[];
  cleanup: AdminAccountDeletionDependency[];
  prohibitions: string[];
  canDelete: boolean;
};

export type DeleteAdminAccountInput = {
  targetUserId: unknown;
  confirmationText: unknown;
  reason: unknown;
};

export type AdminAccountDeletionResult = {
  deletedUserId: string;
  deletedEmail: string;
};

export type AdminAccountDeletionTestSeam = {
  /** @internal Never accept this hook from a Server Action or client payload. */
  afterDelete?: () => void | Promise<void>;
};

const VERIFICATION_DEPENDENCY_KEY = "verification_value_user_id_semantic_ref";

function trustedIdentifier(value: string): SQL {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error("The User-account dependency plan contains an invalid identifier.");
  }
  return sql.raw(`\"${value}\"`);
}

async function collectForeignKeyDependencies(
  tx: AdminAccountLifecycleTransaction,
  targetUserId: string,
): Promise<AdminAccountDeletionDependency[]> {
  const countStatements = USER_ACCOUNT_FOREIGN_KEY_PLAN.map((entry, index) => sql`
    select ${index}::integer as plan_index, count(*)::integer as value
    from ${trustedIdentifier(entry.tableName)}
    where ${trustedIdentifier(entry.columnName)} = ${targetUserId}
  `);
  const query = sql<ReferenceCountRow>`${sql.join(
    countStatements,
    sql.raw(" union all "),
  )}`;
  const result = await tx.execute(query);
  const counts = new Map<number, number>();
  for (const row of result.rows as ReferenceCountRow[]) {
    counts.set(Number(row.plan_index), Number(row.value));
  }

  return USER_ACCOUNT_FOREIGN_KEY_PLAN.map((entry, index) => ({
    key: entry.constraintName,
    label: entry.label,
    tableName: entry.tableName,
    columnName: entry.columnName,
    count: counts.get(index) ?? 0,
    blocking: entry.disposition === "block",
  }));
}

async function collectDependencies(
  tx: AdminAccountLifecycleTransaction,
  targetUserId: string,
): Promise<AdminAccountDeletionDependency[]> {
  const dependencies = await collectForeignKeyDependencies(tx, targetUserId);
  const [verificationCount] = await tx
    .select({ value: sql<number>`count(*)::integer` })
    .from(verification)
    .where(eq(verification.value, targetUserId));

  dependencies.push({
    key: VERIFICATION_DEPENDENCY_KEY,
    label: "Password-reset and account-verification tokens",
    tableName: "verification",
    columnName: "value",
    count: Number(verificationCount?.value ?? 0),
    blocking: false,
  });
  return dependencies;
}

function buildPreview(
  actingUserId: string,
  target: AccountIdentityRow,
  activeAdministratorIds: readonly string[],
  dependencies: AdminAccountDeletionDependency[],
): AdminAccountDeletionPreview {
  const targetIsAdministrator = activeAdministratorIds.includes(target.id);
  const prohibitions = getAccountDeletionProhibitions({
    actingUserId,
    targetUserId: target.id,
    targetIsAdministrator,
    activeAdministratorCount: activeAdministratorIds.length,
  });

  const blockers = dependencies.filter(({ blocking, count }) => blocking && count > 0);
  const cleanup = dependencies.filter(({ blocking, count }) => !blocking && count > 0);
  const permanentDeletionEnabled = isPermanentDeletionEnabled();

  return {
    target: {
      id: target.id,
      name: target.name,
      email: target.email,
      username: target.username,
      displayUsername: target.display_username,
    },
    expectedConfirmation: getAccountDeletionConfirmation(target.email),
    targetIsAdministrator,
    activeAdministratorCount: activeAdministratorIds.length,
    permanentDeletionEnabled,
    dependencies,
    blockers,
    cleanup,
    prohibitions,
    canDelete: permanentDeletionEnabled
      && blockers.length === 0
      && prohibitions.length === 0,
  };
}

async function loadPreviewContext(
  tx: AdminAccountLifecycleTransaction,
  actingUserId: string,
  targetUserId: string,
): Promise<{
  target: AccountIdentityRow;
  activeAdministratorIds: string[];
}> {
  const administratorRows = await tx
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(eq(userRole.role, "admin"));
  const activeAdministratorIds = administratorRows.map(({ userId }) => userId);
  if (!activeAdministratorIds.includes(actingUserId)) {
    throw new Error("Administrator access is required.");
  }

  const targetResult = await tx.execute(sql<AccountIdentityRow>`
    select id, name, email, username, display_username
    from "user"
    where id = ${targetUserId}
  `);
  const target = targetResult.rows[0] as AccountIdentityRow | undefined;
  if (!target) {
    throw new Error("That User account no longer exists.");
  }
  return { target, activeAdministratorIds };
}

async function loadLockedDeletionContext(
  tx: AdminAccountLifecycleTransaction,
  actingUserId: string,
  targetUserId: string,
): Promise<{
  target: AccountIdentityRow;
  activeAdministratorIds: string[];
}> {
  const activeAdministratorIds = await lockAdministratorRosterInTransaction(tx);

  if (!activeAdministratorIds.includes(actingUserId)) {
    throw new Error("Administrator access is required.");
  }

  const identityResult = await tx.execute(sql<AccountIdentityRow>`
    select id, name, email, username, display_username
    from "user"
    where id = ${actingUserId} or id = ${targetUserId}
    order by id
    for update
  `);
  const identities = new Map(
    (identityResult.rows as AccountIdentityRow[]).map((identity) => [
      identity.id,
      identity,
    ]),
  );
  if (!identities.has(actingUserId)) {
    throw new Error("The authenticated administrator account no longer exists.");
  }
  const target = identities.get(targetUserId);
  if (!target) {
    throw new Error("That User account no longer exists.");
  }
  return { target, activeAdministratorIds };
}

export async function previewAdminAccountDeletion(
  actingUserId: string,
  targetUserIdInput: unknown,
): Promise<AdminAccountDeletionPreview> {
  const targetUserId = parseAccountDeletionUserId(targetUserIdInput);
  return db.transaction(async (tx) => {
    const context = await loadPreviewContext(tx, actingUserId, targetUserId);
    const dependencies = await collectDependencies(tx, targetUserId);
    return buildPreview(
      actingUserId,
      context.target,
      context.activeAdministratorIds,
      dependencies,
    );
  });
}

function blockerSummary(blockers: readonly AdminAccountDeletionDependency[]): string {
  const labels = blockers.slice(0, 3).map(({ label, count }) => `${label} (${count})`);
  const remainder = blockers.length - labels.length;
  return `${labels.join(", ")}${remainder > 0 ? `, and ${remainder} more` : ""}`;
}

function auditDependencySummary(
  dependencies: readonly AdminAccountDeletionDependency[],
): Record<string, unknown> {
  return {
    planVersion: 1,
    blockers: Object.fromEntries(
      dependencies
        .filter(({ blocking, count }) => blocking && count > 0)
        .map(({ key, label, count }) => [key, { label, count }]),
    ),
    cleanup: Object.fromEntries(
      dependencies
        .filter(({ blocking, count }) => !blocking && count > 0)
        .map(({ key, label, count }) => [key, { label, count }]),
    ),
  };
}

async function deleteCleanupRows(
  tx: AdminAccountLifecycleTransaction,
  targetUserId: string,
): Promise<void> {
  await tx.delete(session).where(eq(session.userId, targetUserId));
  await tx.delete(account).where(eq(account.userId, targetUserId));
  await tx.delete(verification).where(eq(verification.value, targetUserId));
  await tx.delete(chatRoomMember).where(eq(chatRoomMember.userId, targetUserId));
  await tx.delete(campaignPlayer).where(eq(campaignPlayer.userId, targetUserId));
  await tx.delete(userRole).where(eq(userRole.userId, targetUserId));
}

export async function permanentlyDeleteAdminAccount(
  actingUserId: string,
  input: DeleteAdminAccountInput,
  testSeam: AdminAccountDeletionTestSeam = {},
): Promise<AdminAccountDeletionResult> {
  await assertPreliminaryAdministratorAccess(actingUserId);
  assertPermanentDeletionEnabled();
  const targetUserId = parseAccountDeletionUserId(input.targetUserId);
  const reason = parseRequiredAccountDeletionReason(input.reason);

  return db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const context = await loadLockedDeletionContext(
      tx,
      actingUserId,
      targetUserId,
    );
    const dependencies = await collectDependencies(tx, targetUserId);
    const preview = buildPreview(
      actingUserId,
      context.target,
      context.activeAdministratorIds,
      dependencies,
    );

    if (preview.target.id === actingUserId) {
      throw new Error("Administrators cannot delete their own account.");
    }
    if (
      preview.targetIsAdministrator
      && preview.activeAdministratorCount <= 1
    ) {
      throw new Error("The last administrator account cannot be deleted.");
    }
    assertExactAccountDeletionConfirmation(
      preview.target.email,
      input.confirmationText,
    );
    if (preview.blockers.length > 0) {
      throw new Error(
        `Account deletion is blocked by retained content or history: ${blockerSummary(preview.blockers)}. Resolve those records explicitly before deleting the login account.`,
      );
    }

    await tx.insert(lifecycleAuditEvent).values({
      action: "delete",
      entityKind: "user-account",
      targetId: preview.target.id,
      targetName: preview.target.email,
      campaignIdSnapshot: null,
      ownerUserIdSnapshot: preview.target.id,
      actorUserId: actingUserId,
      reason,
      dependencySummaryJson: auditDependencySummary(dependencies),
    });

    await deleteCleanupRows(tx, targetUserId);
    const deleted = await tx
      .delete(user)
      .where(eq(user.id, targetUserId))
      .returning({ id: user.id });
    if (deleted.length !== 1) {
      throw new Error("That User account changed before deletion could finish.");
    }

    await publishChatDirectoryInvalidationInTransaction(tx);
    await publishLiveSessionRevocationInTransaction(tx, targetUserId);
    await testSeam.afterDelete?.();
    return {
      deletedUserId: targetUserId,
      deletedEmail: preview.target.email,
    };
  });
}
