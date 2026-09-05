"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import type { AdminAccountDeletionPreview } from "@/features/lifecycle/admin-account-lifecycle-service";

import {
  deleteAdminAccount,
  type DeleteAdminAccountActionResult,
} from "../actions";

export function AccountDeletionControl({
  preview,
}: {
  preview: AdminAccountDeletionPreview;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function closeDialog() {
    if (pending) return;
    dialogRef.current?.close();
    setConfirmationText("");
    setReason("");
    setFeedback("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback("");
    startTransition(async () => {
      let result: DeleteAdminAccountActionResult;
      try {
        result = await deleteAdminAccount(formData);
      } catch {
        result = { ok: false, message: "The User account could not be deleted." };
      }
      if (!result.ok) {
        setFeedback(result.message);
        return;
      }
      router.replace("/admin/users?deleted=1");
      router.refresh();
    });
  }

  const confirmationReady = confirmationText === preview.expectedConfirmation;
  const reasonReady = reason.trim().length > 0;

  return (
    <section
      className="mt-8 rounded-3xl border border-red-400/25 bg-red-950/20 p-6 shadow-2xl backdrop-blur-md sm:p-8"
      aria-labelledby="account-danger-heading"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.14em] text-red-200">Danger Zone</p>
          <h2 id="account-danger-heading" className="font-sans mt-2 text-2xl text-slate-100 sm:text-3xl">
            Permanently delete this account
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This removes the login, sessions, assigned roles, and safe membership rows. It never cascades through
            Characters, NPCs, Campaigns, shared content, Chat messages, or retained history.
          </p>
        </div>
        <button
          type="button"
          disabled={!preview.canDelete}
          onClick={() => dialogRef.current?.showModal()}
          className="min-h-11 shrink-0 rounded-full border border-red-300/40 bg-red-500/15 px-5 py-2.5 text-sm font-medium text-red-100 transition hover:border-red-200/70 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete account
        </button>
      </div>

      {!preview.permanentDeletionEnabled ? (
        <p className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Permanent deletion is disabled by the server safety setting.
        </p>
      ) : null}

      {preview.prohibitions.length > 0 ? (
        <DependencyList title="Account protections" entries={preview.prohibitions.map((label) => ({ label, count: null }))} tone="block" />
      ) : null}

      {preview.blockers.length > 0 ? (
        <DependencyList
          title="Deletion blockers"
          entries={preview.blockers.map(({ key, label, count }) => ({ key, label, count }))}
          tone="block"
        />
      ) : (
        <p className="mt-5 text-sm text-emerald-200">No retained content or history blocks deletion.</p>
      )}

      {preview.cleanup.length > 0 ? (
        <DependencyList
          title="Rows removed with the account"
          entries={preview.cleanup.map(({ key, label, count }) => ({ key, label, count }))}
          tone="cleanup"
        />
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-account-dialog-heading"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        className="m-auto w-[min(92vw,42rem)] rounded-3xl border border-red-300/30 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={submit} className="p-6 sm:p-8">
          <input type="hidden" name="targetUserId" value={preview.target.id} />
          <p className="text-xs uppercase tracking-[0.14em] text-red-200">Permanent account deletion</p>
          <h2 id="delete-account-dialog-heading" className="font-sans mt-2 text-2xl text-slate-100">
            Delete {preview.target.name}?
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This cannot be undone. The server will recheck Administrator authority, account protections, and every
            dependency inside the deletion transaction.
          </p>

          <label className="mt-6 block text-sm text-slate-200">
            Reason for deletion
            <textarea
              name="reason"
              required
              maxLength={1000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-slate-100 outline-none focus:border-amber-300/50"
              placeholder="Record why this account is being removed"
            />
          </label>

          <label className="mt-5 block text-sm text-slate-200">
            Type <strong className="break-all text-red-200">{preview.expectedConfirmation}</strong>
            <input
              name="confirmationText"
              required
              autoComplete="off"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-slate-100 outline-none focus:border-red-300/60"
            />
          </label>

          {feedback ? (
            <p role="alert" className="mt-5 rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {feedback}
            </p>
          ) : null}

          <footer className="mt-7 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={closeDialog}
              className="min-h-11 rounded-full border border-white/15 px-5 py-2.5 text-sm text-slate-300 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !confirmationReady || !reasonReady}
              className="min-h-11 rounded-full border border-red-300/50 bg-red-500/20 px-5 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Deleting account..." : "Permanently delete account"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

function DependencyList({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: Array<{ key?: string; label: string; count: number | null }>;
  tone: "block" | "cleanup";
}) {
  return (
    <div className="mt-5">
      <h3 className={`text-sm font-medium ${tone === "block" ? "text-red-200" : "text-slate-200"}`}>{title}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {entries.map((entry, index) => (
          <li
            key={entry.key ?? `${entry.label}-${index}`}
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-300"
          >
            {entry.label}{entry.count === null ? "" : `: ${entry.count}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
