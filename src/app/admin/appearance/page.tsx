import Link from "next/link";

import { AppearanceWorkspace } from "@/app/admin/appearance/appearance-workspace";
import { getPublicSiteAppearance } from "@/features/appearance/appearance-service";

export default async function AppearancePage() {
  const appearance = await getPublicSiteAppearance();
  return (
    <main className="relative z-10 min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <Link
          href="/admin"
          className="text-sm text-slate-400 transition hover:text-amber-200"
        >
          ← Admin Dashboard
        </Link>
        <header className="mt-5 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.16em] text-purple-200">
            Administration
          </p>
          <h1 className="mt-2 text-3xl text-slate-100 sm:text-4xl">Site Appearance</h1>
          <p className="mt-3 text-slate-400">
            Choose a preset or tune the six shared colors. Saving publishes the appearance across the whole site.
          </p>
        </header>
        <AppearanceWorkspace initialAppearance={appearance} />
      </div>
    </main>
  );
}
