import { emptyRaceFormMechanics } from '@/features/races/race-form-mechanics';
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { db } from '@/db';
import { campaign } from '@/db/campaign-schema';
import { campaignCharacter } from '@/db/realm-schema';
import { userRole } from '@/db/authorization-schema';
import { campaignSessionEncounterParticipant } from '@/db/tabletop-operations-schema';
import { readActiveFormDefinitionInTransaction } from './effective-form-service';

export type FormEquipmentApproval = { userId: string; reason: string } | null;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const FORM_EQUIPMENT_NOTICE = 'Active equipment use follows the Current Form. Recorded passive Worn Armor still applies. Physical dropping, merging and equipment changes await Forms Pass 3.';

export async function readFormCapabilitiesInTransaction(tx: Tx, characterId: number) {
  const active = await readActiveFormDefinitionInTransaction(tx, characterId);
  if (!active) return null;
  const { manipulation, equipment, speech, restrictions } = active.definition.form.mechanics ?? emptyRaceFormMechanics();
  const blockers = [
    ...(manipulation.state === 'none' ? ['This Form cannot manipulate Weapons, Items or tools.'] : []),
    ...(['unusable', 'merged', 'dropped'].includes(equipment.state) ? [`Equipment is unavailable for active use in this Form (${equipment.state}).`] : []),
  ];
  const needsRuling = manipulation.state === 'limited' || equipment.state === 'custom';
  return { currentForm: active.identity, manipulation, equipment, speech, restrictions, blockers, needsRuling, notice: FORM_EQUIPMENT_NOTICE };
}

/** Only callers with an authenticated actor may supply an approval. The database
 * verifies Campaign ownership/role; an Admin flag or client boolean is insufficient. */
export async function assertFormEquipmentUseInTransaction(tx: Tx, characterId: number, approval?: FormEquipmentApproval) {
  const capabilities = await readFormCapabilitiesInTransaction(tx, characterId);
  if (!capabilities) return null;
  if (capabilities.blockers.length) throw new Error(capabilities.blockers.join(' '));
  if (!capabilities.needsRuling) return { ...capabilities, ruling: null };
  const reason = approval?.reason.trim();
  if (!reason || reason.length > 2000) throw new Error('Current Form has limited manipulation or custom equipment use. The Campaign-owning G.O.D. must record a ruling for this operation.');
  const [authorized] = await tx.select({ id: campaign.id }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .innerJoin(userRole, and(eq(userRole.userId, campaign.createdByUserId), eq(userRole.role, 'god')))
    .where(and(eq(campaignCharacter.id, characterId), eq(campaign.createdByUserId, approval!.userId))).limit(1);
  if (!authorized) throw new Error('Only the Campaign-owning G.O.D. can approve this Form equipment use.');
  return { ...capabilities, ruling: { reason, authorizedByUserId: approval!.userId } };
}

export async function readFormEquipmentApprovalInTransaction(tx: Tx, encounterId: number, characterId: number, sourceKind: string, sourceRef: string | null) {
  const active = await readActiveFormDefinitionInTransaction(tx, characterId);
  if (!active) return null;
  const [participant] = await tx.select({ local: campaignSessionEncounterParticipant.localStateJson }).from(campaignSessionEncounterParticipant)
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, encounterId), eq(campaignSessionEncounterParticipant.characterId, characterId)));
  const history = (participant?.local as { combatSourceResolutionHistory?: Array<{ sourceKind: string; sourceRef: string; currentForm?: { entryEventId: number }; useRequirementsReason?: string; recordedByUserId: string }> } | undefined)?.combatSourceResolutionHistory;
  const ruling = history?.findLast(row => row.sourceKind === sourceKind && row.sourceRef === sourceRef && row.currentForm?.entryEventId === active.identity.entryEventId && row.useRequirementsReason?.trim());
  return ruling ? { userId: ruling.recordedByUserId, reason: ruling.useRequirementsReason! } : null;
}
