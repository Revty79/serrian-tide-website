"use client";

import {
  type CSSProperties,
  startTransition,
  useMemo,
  useState,
} from "react";

import { saveAppearanceAction } from "@/app/admin/appearance/actions";
import {
  APPEARANCE_COLOR_FIELDS,
  APPEARANCE_PRESETS,
  getAppearanceCssVariables,
  parseSiteAppearance,
  type AppearanceColors,
  type AppearancePresetId,
  type SiteAppearance,
} from "@/features/appearance/appearance";

import styles from "./appearance.module.css";

const FIELD_LABELS: Record<keyof AppearanceColors, string> = {
  pageBackground: "Page background",
  surfaceBackground: "Panel / surface background",
  primaryAccent: "Primary accent",
  secondaryAccent: "Secondary accent",
  mainText: "Main text",
  mutedText: "Muted text",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function previewStyle(appearance: SiteAppearance): CSSProperties {
  try {
    return getAppearanceCssVariables(parseSiteAppearance(appearance)) as CSSProperties;
  } catch {
    return getAppearanceCssVariables(APPEARANCE_PRESETS[appearance.presetId]) as CSSProperties;
  }
}

export function AppearanceWorkspace({ initialAppearance }: { initialAppearance: SiteAppearance }) {
  const [saved, setSaved] = useState(initialAppearance);
  const [draft, setDraft] = useState(initialAppearance);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; message: string } | null>(null);
  const validationMessage = useMemo(() => {
    try {
      parseSiteAppearance(draft);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Review the selected colors.";
    }
  }, [draft]);
  const hasChanges = APPEARANCE_COLOR_FIELDS.some((field) => draft[field] !== saved[field])
    || draft.presetId !== saved.presetId;

  function selectPreset(presetId: AppearancePresetId) {
    setDraft({ ...APPEARANCE_PRESETS[presetId] });
    setStatus(null);
  }

  function updateColor(field: keyof AppearanceColors, value: string) {
    setDraft((current) => ({ ...current, [field]: value.toUpperCase() }));
    setStatus(null);
  }

  function cancelChanges() {
    setDraft({ ...saved });
    setStatus({ error: false, message: "Unsaved changes cancelled." });
  }

  function restorePreset() {
    setDraft({ ...APPEARANCE_PRESETS[draft.presetId] });
    setStatus({ error: false, message: "Preset defaults restored in the preview. Save to publish them." });
  }

  function save() {
    setPending(true);
    setStatus(null);
    startTransition(async () => {
      const result = await saveAppearanceAction(draft);
      if (result.ok) {
        setSaved(result.appearance);
        setDraft(result.appearance);
        const variables = getAppearanceCssVariables(result.appearance);
        for (const [name, value] of Object.entries(variables)) {
          document.documentElement.style.setProperty(name, value);
        }
        document.documentElement.dataset.appearancePreset = result.appearance.presetId;
        setStatus({ error: false, message: result.message });
      } else {
        setStatus({ error: true, message: result.message });
      }
      setPending(false);
    });
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.controls} aria-labelledby="appearance-controls-heading">
        <div>
          <p className={styles.eyebrow}>Theme controls</p>
          <h2 id="appearance-controls-heading">Colors</h2>
        </div>

        <fieldset className={styles.presetFieldset}>
          <legend>Built-in preset</legend>
          <div className={styles.presetGrid}>
            {(Object.keys(APPEARANCE_PRESETS) as AppearancePresetId[]).map((presetId) => (
              <button
                key={presetId}
                type="button"
                aria-pressed={draft.presetId === presetId}
                onClick={() => selectPreset(presetId)}
                className={draft.presetId === presetId ? styles.selectedPreset : undefined}
              >
                <span>{presetId === "serrian-tide" ? "Serrian Tide" : "Classic"}</span>
                <i aria-hidden="true">
                  <b style={{ background: APPEARANCE_PRESETS[presetId].primaryAccent }} />
                  <b style={{ background: APPEARANCE_PRESETS[presetId].secondaryAccent }} />
                </i>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.colorGrid}>
          {APPEARANCE_COLOR_FIELDS.map((field) => {
            const pickerValue = HEX_COLOR.test(draft[field])
              ? draft[field]
              : APPEARANCE_PRESETS[draft.presetId][field];
            return (
              <label key={field} className={styles.colorField}>
                <span>{FIELD_LABELS[field]}</span>
                <span className={styles.colorInputs}>
                  <input
                    type="color"
                    aria-label={`${FIELD_LABELS[field]} color picker`}
                    value={pickerValue}
                    onChange={(event) => updateColor(field, event.target.value)}
                  />
                  <input
                    type="text"
                    aria-label={`${FIELD_LABELS[field]} hex value`}
                    value={draft[field]}
                    maxLength={7}
                    spellCheck={false}
                    onChange={(event) => updateColor(field, event.target.value)}
                  />
                </span>
              </label>
            );
          })}
        </div>

        {validationMessage ? <p className={styles.validation} role="alert">{validationMessage}</p> : null}
        {status ? (
          <p className={status.error ? styles.errorStatus : styles.successStatus} role="status">
            {status.message}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className={styles.primaryAction} disabled={pending || !hasChanges || Boolean(validationMessage)} onClick={save}>
            {pending ? "Saving…" : "Save appearance"}
          </button>
          <button type="button" disabled={pending || !hasChanges} onClick={cancelChanges}>Cancel changes</button>
          <button type="button" disabled={pending} onClick={restorePreset}>Restore preset defaults</button>
        </div>
      </section>

      <section className={styles.previewSection} aria-labelledby="appearance-preview-heading">
        <div className={styles.previewHeading}>
          <div>
            <p className={styles.eyebrow}>Unsaved draft</p>
            <h2 id="appearance-preview-heading">Immediate preview</h2>
          </div>
          <span>{hasChanges ? "Not yet published" : "Matches saved site"}</span>
        </div>
        <div
          className={styles.preview}
          style={previewStyle(draft)}
          data-appearance-preview
          data-appearance-theme-scope
        >
          <nav>
            <strong className="font-evanescent">SERRIAN TIDE</strong>
            <span>Heavens</span><span>Realms</span><span>Crossroads</span>
          </nav>
          <article>
            <p>Campaign workspace</p>
            <h3>The Serrian Tide</h3>
            <p>Representative navigation, panel, text, input, selection, and action colors.</p>
            <label>
              Campaign name
              <input value="The Drowned Crown" readOnly />
            </label>
            <div>
              <button type="button">Primary action</button>
              <button type="button">Secondary</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
