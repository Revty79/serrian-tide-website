"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { generateGuidedRandomCharacter } from "@/app/realms/characters/random-actions";
import {
  RANDOM_CHARACTER_EQUIPMENT_OPTIONS,
  RANDOM_CHARACTER_FOCUS_OPTIONS,
  RANDOM_CHARACTER_TEMPERAMENT_OPTIONS,
  type GuidedRandomCharacterAnswers,
  type RandomCharacterEquipment,
  type RandomCharacterFocus,
  type RandomCharacterMagic,
  type RandomCharacterTemperament,
} from "@/features/characters/random-character";
import type { CharacterMagicSystem } from "@/features/characters/character-rules";

export function GuidedRandomCharacterWorkspace({
  characterId,
  campaignName,
  currentName,
  races,
  magicSystems,
}: {
  characterId: number;
  campaignName: string;
  currentName: string;
  races: Array<{ id: number; name: string }>;
  magicSystems: CharacterMagicSystem[];
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName === "New Character" ? "" : currentName);
  const [raceId, setRaceId] = useState(races[0] ? String(races[0].id) : "");
  const [focus, setFocus] = useState<RandomCharacterFocus>("balanced");
  const [magic, setMagic] = useState<RandomCharacterMagic>(magicSystems.length ? "surprise" : "none");
  const [equipment, setEquipment] = useState<RandomCharacterEquipment>("mixed");
  const [temperament, setTemperament] = useState<RandomCharacterTemperament>("curious");
  const [generating, setGenerating] = useState(false);
  const [generatedName, setGeneratedName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");

  const magicOptions = useMemo<Array<{ value: RandomCharacterMagic; label: string; description: string }>>(
    () => [
      { value: "none", label: "No Magic Preference", description: "Avoid supernatural paths where possible." },
      ...(magicSystems.length > 1
        ? [{ value: "surprise" as const, label: "Surprise Me", description: "Choose among magic systems allowed by this Campaign." }]
        : []),
      ...magicSystems.map((system) => ({
        value: system as RandomCharacterMagic,
        label: system,
        description: `Favor the ${system} path while spending Skill Points.`,
      })),
    ],
    [magicSystems],
  );

  async function generate() {
    if (!raceId || generating) return;
    setGenerating(true);
    setError("");
    setWarnings([]);
    setGeneratedName("");
    const answers: GuidedRandomCharacterAnswers = {
      name,
      raceId: Number(raceId),
      focus,
      magic,
      equipment,
      temperament,
    };
    try {
      const result = await generateGuidedRandomCharacter(characterId, answers);
      setGeneratedName(result.name);
      setWarnings(result.warnings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Character could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  if (generatedName) {
    return (
      <main className="random-character-page">
        <section className="random-character-result">
          <p>GUIDED RANDOM COMPLETE</p>
          <h1 className="font-portcullion">{generatedName}</h1>
          <span>The generated draft has been saved, but Character creation is still unlocked for your review.</span>
          {warnings.length ? (
            <div className="random-character-warnings">
              <strong>Review these before completing creation:</strong>
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : (
            <p className="random-character-success">The generator spent the available budgets without reporting a rules conflict.</p>
          )}
          <div className="random-character-result-actions">
            <button type="button" onClick={() => router.push(`/realms/characters/${characterId}`)}>Review Character Sheet</button>
            <button type="button" className="secondary" onClick={() => { setGeneratedName(""); setWarnings([]); }}>Generate Again</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="random-character-page">
      <div className="random-character-shell">
        <header className="random-character-header">
          <div>
            <p>THE REALMS · {campaignName}</p>
            <h1 className="font-portcullion">Guided Random Character</h1>
            <span>You make the broad choices. Serrian Tide handles the legal point spending and builds a reviewable draft.</span>
          </div>
          <Link href={`/realms/characters/${characterId}`}>Cancel &amp; Return</Link>
        </header>

        <section className="random-character-form">
          <label className="random-character-field">
            <span>Character Name <small>optional</small></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Leave blank for a generated name" />
          </label>

          <label className="random-character-field">
            <span>Race</span>
            <select value={raceId} onChange={(event) => setRaceId(event.target.value)}>
              <option value="">Choose a Campaign-allowed Race</option>
              {races.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>

          <ChoiceGroup
            title="Character Focus"
            description="This weights how Attribute and Skill points are distributed."
            value={focus}
            options={RANDOM_CHARACTER_FOCUS_OPTIONS}
            onChange={(value) => setFocus(value as RandomCharacterFocus)}
          />

          <ChoiceGroup
            title="Magic"
            description="Only systems allowed by this Campaign can be favored."
            value={magic}
            options={magicOptions}
            onChange={(value) => setMagic(value as RandomCharacterMagic)}
          />

          <ChoiceGroup
            title="Starting Equipment"
            description="The generator only purchases priced Items authorized by this Campaign."
            value={equipment}
            options={RANDOM_CHARACTER_EQUIPMENT_OPTIONS}
            onChange={(value) => setEquipment(value as RandomCharacterEquipment)}
          />

          <ChoiceGroup
            title="Temperament"
            description="This shapes the generated personality, goals, secret, backstory, and motivation."
            value={temperament}
            options={RANDOM_CHARACTER_TEMPERAMENT_OPTIONS}
            onChange={(value) => setTemperament(value as RandomCharacterTemperament)}
          />

          {error ? <p className="random-character-error" role="alert">{error}</p> : null}

          <footer className="random-character-submit">
            <div>
              <strong>Nothing is permanently completed here.</strong>
              <span>The result is saved as an unfinished Character so you can change anything before locking creation.</span>
            </div>
            <button type="button" disabled={!raceId || generating} onClick={() => void generate()}>
              {generating ? "Generating Character…" : "Generate Character"}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

function ChoiceGroup({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: readonly Array<{ value: string; label: string; description: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="random-character-choice-group">
      <legend>{title}</legend>
      <p>{description}</p>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-selected" : ""}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
