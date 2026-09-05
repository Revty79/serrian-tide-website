"use client";

import { useEffect, useRef, useState } from "react";

import {
  archiveLifecycleEntity,
  permanentlyDeleteLifecycleEntity,
  previewLifecycleEntity,
  restoreLifecycleEntity,
} from "@/app/heavens/lifecycle-actions";
import type {
  LifecycleEntityKind,
  LifecyclePreview,
  LifecycleTargetInput,
} from "@/features/lifecycle/types";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import styles from "./lifecycle-controls.module.css";

export type LifecycleCompletionEvent = {
  action: "archive" | "restore" | "delete";
};

type LifecycleControlsProps = {
  target: LifecycleTargetInput;
  archived: boolean;
  disabled?: boolean;
  onCompleted: (event: LifecycleCompletionEvent) => void | Promise<void>;
};

type DialogMode = LifecycleCompletionEvent["action"];

const KIND_LABELS: Record<LifecycleEntityKind, string> = {
  campaign: "Campaign",
  "player-character": "Player Character",
  "race-npc": "Race NPC",
  "creature-npc": "Creature NPC",
  race: "Race",
  creature: "Creature",
  skill: "Skill",
  item: "Item",
  "derived-ability": "Derived Ability",
};

function actionLabel(mode: DialogMode): string {
  if (mode === "archive") return "Archive";
  if (mode === "restore") return "Restore";
  return "Permanently Delete";
}

function consequence(mode: DialogMode, preview: LifecyclePreview): string {
  if (mode === "archive") {
    return `${preview.entityName} will leave normal selectors and new runtime workflows. Stored references and history remain intact.`;
  }
  if (mode === "restore") {
    return `${preview.entityName} will return to normal active libraries and selectors.`;
  }
  if (preview.entityKind === "campaign") {
    return `This permanently deletes the entire Campaign-owned world shown below. Shared libraries and user accounts are preserved.`;
  }
  return `This permanently deletes only this ${KIND_LABELS[preview.entityKind]} aggregate and its intentional owned children. This cannot be undone.`;
}

export function LifecycleControls(props: LifecycleControlsProps) {
  const { target } = props;
  return (
    <LifecycleControlsForTarget
      key={`${target.entityKind}:${target.entityId}`}
      {...props}
    />
  );
}

function LifecycleControlsForTarget({
  target,
  archived,
  disabled = false,
  onCompleted,
}: LifecycleControlsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const preserveScroll = useInPlaceScrollPreservation();
  const [mode, setMode] = useState<DialogMode | null>(null);
  const [preview, setPreview] = useState<LifecyclePreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mode && dialog && !dialog.open) dialog.showModal();
  }, [mode]);

  async function openDialog(nextMode: DialogMode): Promise<void> {
    await preserveScroll(async () => {
      setMode(nextMode);
      setPreview(null);
      setReason("");
      setConfirmation("");
      setError("");
      setLoading(true);
      try {
        setPreview(await previewLifecycleEntity(target));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The lifecycle impact preview could not be loaded.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function closeDialog(): Promise<void> {
    await preserveScroll(() => {
      dialogRef.current?.close();
      setMode(null);
      setPreview(null);
      setError("");
      setReason("");
      setConfirmation("");
    });
  }

  async function submit(): Promise<void> {
    if (!mode || !preview) return;
    await preserveScroll(async () => {
      setSubmitting(true);
      setError("");
      try {
        if (mode === "archive") {
          await archiveLifecycleEntity(target, reason);
        } else if (mode === "restore") {
          await restoreLifecycleEntity(target);
        } else {
          await permanentlyDeleteLifecycleEntity(target, confirmation);
        }
        dialogRef.current?.close();
        setMode(null);
        setPreview(null);
        setReason("");
        setConfirmation("");
        await onCompleted({ action: mode });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : `The ${actionLabel(mode).toLowerCase()} action failed.`);
        try {
          setPreview(await previewLifecycleEntity(target));
        } catch {
          // Keep the mutation error visible if a refreshed preview is unavailable.
        }
      } finally {
        setSubmitting(false);
      }
    });
  }

  const permitted = preview
    ? mode === "archive"
      ? preview.canArchive
      : mode === "restore"
        ? preview.canRestore
        : preview.canDelete
          && preview.permanentDeletionEnabled
          && confirmation === preview.entityName
    : false;

  return (
    <>
      <div className={styles.controls} aria-label={`${KIND_LABELS[target.entityKind]} lifecycle controls`}>
        {archived ? (
          <button className={styles.action} type="button" disabled={disabled} onClick={() => void openDialog("restore")}>Restore</button>
        ) : (
          <button className={styles.action} type="button" disabled={disabled} onClick={() => void openDialog("archive")}>Archive</button>
        )}
        <button className={styles.danger} type="button" disabled={disabled} onClick={() => void openDialog("delete")}>Review permanent deletion</button>
      </div>

      {mode ? (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby="lifecycle-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            void closeDialog();
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void closeDialog();
          }}
        >
          <section className={styles.body}>
            <header className={styles.heading}>
              <p>{actionLabel(mode)} {preview ? KIND_LABELS[preview.entityKind] : KIND_LABELS[target.entityKind]}</p>
              <h2 id="lifecycle-dialog-title">{preview?.entityName ?? "Loading lifecycle impact…"}</h2>
              {preview ? <span>{preview.archived ? "Archived" : "Active"}{preview.canonical ? " · Protected content" : ""}</span> : null}
            </header>

            {loading ? <p className={styles.empty}>Calculating dependencies and authorization…</p> : null}
            {preview ? (
              <>
                <p className={styles.context}>
                  {preview.campaignName ? `Campaign: ${preview.campaignName}. ` : ""}
                  {preview.ownerLabel ? `Owner: ${preview.ownerLabel}.` : ""}
                </p>
                <p>{consequence(mode, preview)}</p>
                {preview.dependencies.length ? (
                  <ul className={styles.summary} aria-label="Dependency summary">
                    {preview.dependencies.map((dependency) => (
                      <li className={dependency.blocking ? styles.blocking : undefined} key={dependency.label}>
                        <span>{dependency.label}{dependency.blocking ? " · blocks deletion" : ""}</span>
                        <strong>{dependency.count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.empty}>No dependent records were found.</p>}
                {preview.blockers.map((blocker) => <p className={styles.notice} key={blocker}>{blocker}</p>)}
                {mode === "delete" && !preview.permanentDeletionEnabled ? (
                  <p className={styles.notice}>Permanent deletion is unavailable because production recovery protection is active. Archive remains available.</p>
                ) : null}
                {mode === "archive" ? (
                  <label className={styles.field}>
                    <span>Archive reason (optional)</span>
                    <textarea maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                ) : null}
                {mode === "delete" ? (
                  <label className={styles.field}>
                    <span>Type the exact name <strong>{preview.entityName}</strong> to confirm</span>
                    <input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}

            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <footer className={styles.footer}>
              <button className={styles.cancel} type="button" disabled={submitting} onClick={() => void closeDialog()}>Cancel</button>
              <button
                className={mode === "delete" ? styles.confirm : styles.action}
                type="button"
                disabled={loading || submitting || !permitted}
                onClick={() => void submit()}
              >
                {submitting ? "Working…" : actionLabel(mode)}
              </button>
            </footer>
          </section>
        </dialog>
      ) : null}
    </>
  );
}
