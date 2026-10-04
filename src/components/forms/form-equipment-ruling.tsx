'use client';
import { useCallback, useEffect, useState } from 'react';
import { getCurrentForm } from '@/app/characters/form-runtime-actions';
import { TabletopLiveRefresh } from '@/features/tabletop-operations/tabletop-live-refresh';
import type { IndividualFormRuntime } from '@/features/forms/form-runtime';
import { ruleCombatSourceResolution } from '@/app/heavens/tabletop/action-declaration-actions';

/** Optional operation-specific evidence; server owners recheck both capability
 * and current Campaign-owning G.O.D. authority before accepting the reason. */
export function FormEquipmentRulingField({ characterId, value, onChange, combatSource }: {
  characterId: number; value: string; onChange: (value: string) => void;
  combatSource?: { encounterId: number; kind: 'weapon' | 'equipment-operation'; ref: string; disabled?: boolean; refresh: () => Promise<void> };
}) {
  const [state, setState] = useState<IndividualFormRuntime | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const refresh = useCallback(async () => { try { setState(await getCurrentForm(characterId)); } catch { setState(null); } }, [characterId]);
  useEffect(() => { let active = true; getCurrentForm(characterId).then(result => { if (active) setState(result); }).catch(() => {}); return () => { active = false; }; }, [characterId]);
  const mechanics = state?.current?.evidence.review.definition.form.mechanics;
  const limited = mechanics?.manipulation.state === 'limited' || mechanics?.equipment.state === 'custom';
  return <>
    {state?.authority === 'god' ? <TabletopLiveRefresh mode="god" campaignId={state.campaignId} onRefresh={refresh}/> : state?.authority === 'player' ? <TabletopLiveRefresh mode="player" characterId={characterId} onRefresh={refresh}/> : null}
    {limited ? state?.authority === 'god' ? <><label className="st-field">Form equipment use ruling
      <input className="st-control" maxLength={2000} value={value} onChange={event => onChange(event.target.value)} />
      <span>Explain why this exact operation is possible in {state.current!.evidence.review.definition.name}. The ruling applies to the operation you submit.</span>
    </label>{combatSource ? <><button type="button" className="st-button" disabled={busy || combatSource.disabled || !combatSource.ref || !value.trim()} onClick={async () => {
      setBusy(true); setMessage('');
      try {
        await ruleCombatSourceResolution(combatSource.encounterId, { participantId: characterId, sourceKind: combatSource.kind, sourceRef: combatSource.ref,
          mode: 'manual-god-ruling', governing: null, effectScaling: {}, reason: value, useRequirementsReason: value });
        await combatSource.refresh(); setMessage('Form equipment ruling recorded. The controller can now submit the reviewed operation.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'The ruling was not recorded.'); }
      finally { setBusy(false); }
    }}>Record Form equipment ruling</button><p>This approves physical use for the selected source in this Form entry. The controller still chooses the action and pays its normal Initiative cost.</p></> : null}
    {message ? <p role="status">{message}</p> : null}</> : <p>Current Form has limited object manipulation or custom equipment use. Ask the Campaign-owning G.O.D. to rule on this operation.</p> : null}
  </>;
}
