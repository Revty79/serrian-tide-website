import type { SavedRaceForm } from '@/features/races/race-forms';
import type { SavedCreatureForm } from '@/features/creatures/creature-forms';
import type { FormAccessEvaluation } from './form-access';
import type { FormTransformation } from './form-transformation';
import type { EvolutionEncounterContext } from '@/features/evolutions/evolution-execution';
import type { DerivedAbilityCostPlan } from '@/features/derived-abilities/derived-ability-use';
import type { AbilityFact } from '@/features/ability-use-conditions/facts';
import type { FormLifecycleContext, FormLifecycleExecution, FormLifecycleView, FormLimitView, FormReturnDue } from './form-lifecycle';

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
  lifecycleContext: FormLifecycleContext; limits: FormLimitView[];
  equipmentDrops: import('./form-equipment-transition-service').FormEquipmentDropPlan | null;
};
export type FormRuntimeCommand = FormRuntimeSelection & {
  idempotencyKey: string; reviewToken: string; rulings: Record<string, string>; confirmTime: boolean;
  manualTiming?: { mode: 'instant' | 'initiative'; initiativeCost: number | null };
};
export type FormTransitionEvidence = {
  review: Omit<FormRuntimeReview, 'reviewToken'>; command: FormRuntimeCommand;
  initiatedByUserId: string | null; authorizedByUserId: string; authority: 'god' | 'player' | 'system/lifecycle';
  costsPaid: Array<{ system: string; amount: number; manaSpent: number; currentMana: number }>;
  completionContexts: EvolutionEncounterContext[];
  initiator?: 'user' | 'system/lifecycle';
  initiationReason?: 'player-voluntary' | 'god-voluntary' | 'god-involuntary' | 'god-manual' | 'player-return' | 'god-return' | 'system/lifecycle';
  /** Optional only for immutable pre-Pass-3 receipts. */
  lifecycleContext?: FormLifecycleContext;
  lifecycle?: FormLifecycleExecution;
  returnDue?: FormReturnDue | null;
  equipmentDrops?: Array<{ itemId: number; instanceId: number | null; quantity: number; previousStates: string[]; custodyEventId: number; sceneId: number }>;
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
  current: FormRuntimeEvent | null; forms: Array<{ definition: FrozenFormDefinition; access: FormAccessEvaluation; limits: FormLimitView[] }>;
  pending: { requestId: number; operation: 'enter' | 'return'; name: string; pendingActionId: number | null; timingStatus: string | null; blockers: string[] } | null;
  history: FormRuntimeEvent[];
  lifecycle: FormLifecycleView;
  useRefreshHistory: Array<{id:number;formName:string;scope:string;refreshKey:string|null;reason:string;actorUserId:string;executedAt:string}>;
};
