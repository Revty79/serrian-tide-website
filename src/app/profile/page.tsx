import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AuthenticatedNavigation } from "@/app/authenticated-navigation";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { getCurrentCatalogPreferences } from "@/features/catalog-visibility/actions";
import { CatalogPreferencesEditor } from "@/features/catalog-visibility/catalog-preferences-editor";
import { auth } from "@/lib/auth";
import styles from "./profile.module.css";
import { countPasswordRecoveryCodes } from "@/features/authorization/password-recovery-service";
import { PasswordRecoveryControl } from "./password-recovery-control";

export const metadata: Metadata = { title: "Profile | Serrian Tide" };

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [preferences, assignments, remainingCodes] = await Promise.all([
    getCurrentCatalogPreferences(),
    db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, session.user.id)),
    countPasswordRecoveryCodes(session.user.id),
  ]);
  return <>
    <AuthenticatedNavigation context={null} roles={assignments.map(({ role }) => role)} username={session.user.displayUsername || session.user.username || session.user.name} />
    <main className={styles.page}>
      <header><h1>Profile</h1><p>Your account information and personal content preferences.</p></header>
      <section className={styles.section} aria-labelledby="profile-account">
        <h2 id="profile-account">Account</h2>
        <dl className={styles.account}>
          <div><dt>Name</dt><dd>{session.user.name}</dd></div>
          <div><dt>Username</dt><dd>{session.user.displayUsername || session.user.username || "Not set"}</dd></div>
          <div><dt>Email</dt><dd>{session.user.email}</dd></div>
        </dl>
      </section>
      <section className={styles.section} aria-labelledby="profile-recovery">
        <h2 id="profile-recovery">Password recovery</h2>
        <PasswordRecoveryControl remainingCodes={remainingCodes} accountLabel={session.user.username || session.user.email} />
      </section>
      <section className={styles.section} aria-labelledby="profile-visibility">
        <h2 id="profile-visibility">Content Visibility</h2>
        <p>Choose what you want to discover when browsing each catalog. Each catalog remembers its own setting, even after you log out.</p>
        <p className={styles.notice}>Each catalog uses your saved choice once an Administrator enables filtering for it in this database. Inactive catalogs show System Canon and content you created. Other users&apos; non-canon content stays private; Campaign members can see content assigned to their Campaign. Equipment and Inventory remain independent; Campaign discovery uses its creator&apos;s choices and retains existing selections.</p>
        <p>Changing visibility does not delete content or remove anything already used by an existing Campaign.</p>
        <dl className={styles.meanings}>
          <div><dt>Canon Only</dt><dd>Official Serrian Tide content.</dd></div>
          <div><dt>Canon + Mine</dt><dd>Official Serrian Tide content plus content you created.</dd></div>
          <div><dt>Mine Only</dt><dd>Content you created.</dd></div>
        </dl>
        <CatalogPreferencesEditor key={session.user.id} initialPreferences={preferences} />
      </section>
    </main>
  </>;
}
