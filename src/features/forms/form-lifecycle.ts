import type { AbilityFact } from '@/features/ability-use-conditions/facts';
import type { DerivedAbilityUseLimitDefinition } from '@/features/derived-abilities/models';

/** Frozen at successful entry, never rebound to a later Scene or Encounter. */
export type FormLifecycleContext = {
  sessionId: number | null; sessionName: string | null;
  sceneId: number | null; sceneName: string | null;
  encounterId: number | null; encounterName: string | null;
  round: number | null; step: number | null; initiative: number | null;
};
export type FormReturnDue = {
  reason: string; kind: 'encounter-end' | 'scene-end';
  ownerId: number; ownerName: string; completedAt: string;
  entryEventId: number;
};
export type FormLimitView = {
  limit: DerivedAbilityUseLimitDefinition; uses: number; remaining: number | null;
  status: 'available' | 'exhausted' | 'manual'; explanation: string;
};
export type FormLifecycleExecution = {
  initiator: 'system/lifecycle'; reason: 'structured-trigger' | 'encounter-end' | 'scene-end';
  explanation: string; facts: AbilityFact[]; entryEventId: number | null;
  context: FormLifecycleContext; observedBy: string;
  originalEntryContext: FormLifecycleContext | null;
};
export type FormLifecycleView = {
  scope: FormLifecycleContext;
  context: FormLifecycleContext | null; due: FormReturnDue | null;
  duration: string; blockers: string[]; manual: string[];
  limits: FormLimitView[];
  triggerCandidates: Array<{ name: string; formKey: string; status: 'satisfied' | 'unsatisfied' | 'manual'; reasons: string[] }>;
};
