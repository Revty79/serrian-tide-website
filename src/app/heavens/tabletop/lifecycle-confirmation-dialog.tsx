"use client";

import { useEffect, useRef } from "react";

import type { TabletopLifecyclePreview } from "@/features/lifecycle/tabletop-lifecycle-types";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

export function LifecycleConfirmationDialog({
  open,
  titleId,
  eyebrow,
  title,
  entityType,
  preview,
  consequence,
  dependencies = [],
  notice = "This cannot be undone. Recovery protection may disable permanent deletion on the server.",
  confirmLabel,
  confirmDisabled = false,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  titleId: string;
  eyebrow: string;
  title: string;
  entityType: string;
  preview: TabletopLifecyclePreview | null;
  consequence: string;
  dependencies?: readonly string[];
  notice?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const preserveScroll = useInPlaceScrollPreservation();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  if (!open) return null;
  const cancel = () => void preserveScroll(onCancel);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(38rem,calc(100vw-2rem))] rounded-2xl border border-red-400/35 bg-[#080d13] p-0 text-slate-100 shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section className="grid gap-4 p-6">
        <header>
          <p className="text-xs uppercase tracking-[0.16em] text-red-300">{eyebrow}</p>
          <h2 id={titleId} className="font-sans mt-2 text-2xl text-slate-100">{title}</h2>
        </header>
        {preview ? <dl className="grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Entity type</dt><dd>{entityType}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Entity name</dt><dd>{preview.entityName}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Campaign</dt><dd>{preview.campaignName}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Owner</dt><dd>{preview.ownerLabel}</dd></div>
        </dl> : null}
        <p className="text-sm leading-6 text-slate-300">{consequence}</p>
        {dependencies.length ? (
          <ul className="grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">
            {dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}
          </ul>
        ) : null}
        <p className="text-sm font-semibold text-red-200">{notice}</p>
        {error ? <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{error}</p> : null}
        <footer className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={cancel} className="min-h-10 rounded-full border border-white/15 px-5 text-sm text-slate-300 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={busy || confirmDisabled} onClick={() => void preserveScroll(onConfirm)} className="min-h-10 rounded-full border border-red-400/55 bg-red-500/20 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-40">{busy ? "Working…" : confirmLabel}</button>
        </footer>
      </section>
    </dialog>
  );
}
