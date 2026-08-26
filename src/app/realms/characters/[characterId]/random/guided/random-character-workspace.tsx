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
  const steps = ["Identity", "Approach", "Magic", "Equipment", "Temperament"] as const;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(currentName === "New Character" ? "" : currentName);
  const [raceId, setRaceId] = useState("");
  const [focus, setFocus] = useState<RandomCharacterFocus>("balanced");
  const [magic, setMagic] = useState<RandomCharacterMagic>("surprise");
  const [equipment, setEquipment] = useState<RandomCharacterEquipment>("mixed");
  const [temperament, setTemperament] = useState<RandomCharacterTemperament>("curious");
  const [generating, setGenerating] = useState(false);
  const [generatedName, setGeneratedName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");

  const magicOptions = useMemo<Array<{ value: RandomCharacterMagic; label: string; description: string }>>(
    () => [
      { value: "none", label: "No Magical Focus", description: "Favor ordinary Skills and physical or social training." },
      { value: "surprise", label: "Surprise Me", description: "The program may choose any permitted magical direction." },
      ...magicSystems.map((system) => ({
        value: system as RandomCharacterMagic,
        label: system,
        description: `Favor ${system} access, its Mana skill, and legal branches.`,
      })),
    ],
    [magicSystems],
  );

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError("");
    setWarnings([]);
    setGeneratedName("");
    const answers: GuidedRandomCharacterAnswers = {
      name,
      raceId: raceId ? Number(raceId) : null,
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
          <h1 className="font-sans">{generatedName}</h1>
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
            <h1 className="font-sans">Guided Random Character</h1>
            <span>You make the broad choices. Serrian Tide handles the legal point spending and builds a reviewable draft.</span>
          </div>
          <Link href={`/realms/characters/${characterId}`}>Cancel &amp; Return</Link>
        </header>

        <section className="random-character-form">
          <header className="random-character-step-header">
            <div><p>GUIDED RANDOM · QUESTION {step + 1} OF {steps.length}</p><h2 className="font-sans">{steps[step]}</h2></div>
            <strong>{Math.round(((step + 1) / steps.length) * 100)}%</strong>
          </header>
          <div className="random-character-progress"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

          {step === 0 ? <section className="random-character-question">
            <h3>Who should the program begin with?</h3>
            <p>A name is optional. Leave it blank and the program will provide one.</p>
          <label className="random-character-field">
            <span>Character Name <small>Optional</small></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Generate a name for me" />
          </label>

          <label className="random-character-field">
            <span>Race</span>
            <select value={raceId} onChange={(event) => setRaceId(event.target.value)}>
              <option value="">Surprise Me</option>
              {races.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          </section> : null}

          {step === 1 ? <ChoiceGroup
            title="How do they tend to solve problems?"
            description="This guides Attributes and makes matching Skills more likely. The program still spends every legal point."
            value={focus}
            options={RANDOM_CHARACTER_FOCUS_OPTIONS}
            onChange={(value) => setFocus(value as RandomCharacterFocus)}
          /> : null}

          {step === 2 ? <ChoiceGroup
            title="Should magic shape this Character?"
            description="Only magic systems permitted by this Campaign are offered."
            value={magic}
            options={magicOptions}
            onChange={(value) => setMagic(value as RandomCharacterMagic)}
          /> : null}

          {step === 3 ? <ChoiceGroup
            title="What should their starting gear favor?"
            description="The program buys only priced Equipment authorized by this Campaign."
            value={equipment}
            options={RANDOM_CHARACTER_EQUIPMENT_OPTIONS}
            onChange={(value) => setEquipment(value as RandomCharacterEquipment)}
          /> : null}

          {step === 4 ? <ChoiceGroup
            title="What is at the heart of their personality?"
            description="This shapes the generated personality, goals, secret, backstory, and motivation."
            value={temperament}
            options={RANDOM_CHARACTER_TEMPERAMENT_OPTIONS}
            onChange={(value) => setTemperament(value as RandomCharacterTemperament)}
          /> : null}

          {error ? <p className="random-character-error" role="alert">{error}</p> : null}

          <footer className="random-character-submit">
            <button type="button" disabled={generating} onClick={step === 0 ? () => router.push(`/realms/characters/${characterId}`) : () => setStep((current) => current - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
            {step < steps.length - 1 ? <button type="button" onClick={() => setStep((current) => current + 1)}>Next Question</button> : <button type="button" disabled={generating || races.length === 0} onClick={() => void generate()}>{generating ? "Creating Character…" : "Generate Character"}</button>}
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
  options: ReadonlyArray<{ value: string; label: string; description: string }>;
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
