import type { SavedRaceForm } from '@/features/races/race-forms';
import type { SavedCreatureForm } from '@/features/creatures/creature-forms';
import type { FormAccessEvaluation } from './form-access';
import type { FormTransformation } from './form-transformation';
import type { EvolutionEncounterContext } from '@/features/evolutions/evolution-execution';
import type { DerivedAbilityCostPlan } from '@/features/derived-abilities/derived-ability-use';
import type { AbilityFact } from '@/features/ability-use-conditions/facts';

export const FORM_RUNTIME_NOTICE = 'Current Form governs live mechanics. Normal editing and advancement keep your saved underlying values.';
export type FrozenFormDefinition = {
  kind: 'race' | 'creature'; sourceId: number; sourceName: string;
  formId: number; key: string; name: string; sourceHash: string;
  form: SavedRaceForm | SavedCreatureForm;
};
export type FormRuntimeSelection = { characterId: number; operation: 'enter' | 'return'; formKey?: string; sourceId?: number; formId?: number; encounterId?: number | null };
export type FormRuntimeReview = {
  characterId: number; individualName: string; campaignId: number; authority: 'god' | 'player';
  operation: 'enter' | 'return'; activeEntryId: number | null; definition: FrozenFormDefinition;
  transformation: FormTransformation; access: FormAccessEvaluation;
  facts: AbilityFact[]; conditions: Array<{ label: string; result: 'satisfied' | 'unsatisfied' | 'manual' }>;
  timing: { mode: 'instant' | 'initiative' | 'time-confirm' | 'manual'; initiativeCost: number | null; description: string };
  costs: DerivedAbilityCostPlan[]; manualSteps: Array<{ key: string; label: string }>;
  blockers: string[]; warnings: string[]; encounterContexts: EvolutionEncounterContext[];
  encounterId: number | null; reviewToken: string;
};
export type FormRuntimeCommand = FormRuntimeSelection & {
  idempotencyKey: string; reviewToken: string; rulings: Record<string, string>; confirmTime: boolean;
  manualTiming?: { mode: 'instant' | 'initiative'; initiativeCost: number | null };
};
export type FormTransitionEvidence = {
  review: Omit<FormRuntimeReview, 'reviewToken'>; command: FormRuntimeCommand;
  initiatedByUserId: string; authorizedByUserId: string; authority: 'god' | 'player';
  costsPaid: Array<{ system: string; amount: number; manaSpent: number; currentMana: number }>;
  completionContexts: EvolutionEncounterContext[];
};
export type FormRuntimeEvent = {
  id: number; characterId: number; operation: 'enter' | 'return'; enteredEventId: number | null;
  executedAt: string; evidence: FormTransitionEvidence;
};
export type FormRuntimeReceipt = {
  requestId: number; status: 'pending' | 'completed' | 'cancelled'; pendingActionId: number | null;
  event: FormRuntimeEvent | null; replayed: boolean;
};
export type IndividualFormRuntime = {
  effective: import("./effective-form-view-service").EffectiveFormView | null;
  characterId: number; campaignId: number; authority: 'god' | 'player' | 'viewer';
  current: FormRuntimeEvent | null; forms: Array<{ definition: FrozenFormDefinition; access: FormAccessEvaluation }>;
  pending: { requestId: number; operation: 'enter' | 'return'; name: string; pendingActionId: number | null; timingStatus: string | null; blockers: string[] } | null;
  history: FormRuntimeEvent[];
};
