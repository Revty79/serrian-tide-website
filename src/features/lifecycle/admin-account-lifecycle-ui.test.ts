import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("Admin account detail loads a server-authorized deletion preview", () => {
  const page = source("src/app/admin/users/[userId]/page.tsx");
  assert.match(page, /const session = await requireAdmin\(\)/);
  assert.match(page, /previewAdminAccountDeletion\(session\.user\.id, userId\)/);
  assert.match(page, /<AccountDeletionControl preview=\{deletionPreview\}/);
});

test("account deletion action derives the actor from the session and forwards only untrusted form values", () => {
  const actions = source("src/app/admin/users/actions.ts");
  const start = actions.indexOf("export async function deleteAdminAccount");
  const block = actions.slice(start);
  assert.ok(start >= 0);
  assert.match(block, /auth\.api\.getSession/);
  assert.match(block, /permanentlyDeleteAdminAccount\(session\.user\.id, \{/);
  assert.match(block, /targetUserId: formData\.get\("targetUserId"\)/);
  assert.match(block, /confirmationText: formData\.get\("confirmationText"\)/);
  assert.match(block, /reason: formData\.get\("reason"\)/);
  assert.doesNotMatch(block, /testSeam|roles:|isAdmin:|blockers:/);
  assert.match(block, /revalidatePath\("\/admin\/users"\)/);
});

test("Danger Zone presents blockers and requires a reason plus exact confirmation in an accessible dialog", () => {
  const control = source("src/app/admin/users/[userId]/account-deletion-control.tsx");
  assert.match(control, /preview\.blockers/);
  assert.match(control, /preview\.cleanup/);
  assert.match(control, /disabled=\{!preview\.canDelete\}/);
  assert.match(control, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(control, /<dialog/);
  assert.match(control, /aria-labelledby="delete-account-dialog-heading"/);
  assert.match(control, /name="reason"/);
  assert.match(control, /maxLength=\{1000\}/);
  assert.match(control, /name="confirmationText"/);
  assert.match(control, /confirmationText === preview\.expectedConfirmation/);
  assert.doesNotMatch(control, /window\.confirm|confirm\(/);
});

test("successful deletion returns to User Management with a neutral status message", () => {
  const control = source("src/app/admin/users/[userId]/account-deletion-control.tsx");
  const usersPage = source("src/app/admin/users/page.tsx");
  assert.match(control, /router\.replace\("\/admin\/users\?deleted=1"\)/);
  assert.match(usersPage, /query\.deleted === "1"/);
  assert.match(usersPage, /The User account was permanently deleted/);
});
