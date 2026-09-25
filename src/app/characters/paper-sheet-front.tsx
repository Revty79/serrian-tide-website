import {paperNumber as n, paperSigned, type PaperCharacterData} from "@/features/characters/paper-character";
import {CharacterHitLocationSilhouette} from "./character-hit-location-chart";
import {Box, Lines, Table, Text, target} from "./paper-sheet-content";

export function PaperSheetFront({data: d}: {data: PaperCharacterData}) {
  return <>
    <header className="paper-identity"><div><h1 data-paper-check="text">{d.name}</h1><p>Player: {d.player} · Campaign: {d.campaign}</p></div><p data-paper-check="text"><b>{d.race}</b>{d.identity ? <><br />{d.identity}</> : null}</p></header>
    <div className="paper-totals">{d.totals.map(total => <div key={total.name}><span>{total.name}</span><strong>{n(total.value)}</strong></div>)}</div>
    <div className="paper-front-primary">
      <Box title="Attributes"><Table headings={["Attribute", "Score", "Mod", "Target"]}>{d.attributes.map(a => <tr key={a.key}><th>{a.key}</th><td>{n(a.score)}</td><td>{paperSigned(a.modifier)}</td><td>{target(a.target)}</td></tr>)}</Table>
        <div className="paper-attribute-reference">{d.attributeReferences.map(row => <span key={row.attribute + row.label}>{row.label}: <b>{n(row.value)}</b></span>)}</div>
        <p className="paper-caption">%+ is a roll target. Permanent values; apply current conditions and situational rules.</p>
      </Box>
      <Box title="Health & hit locations"><div className="paper-health-grid"><Table headings={["HP pool / hit", "Current", "Max", "Damage", "Now"]}>
        <tr className="paper-total"><th>Total HP</th><td>{n(d.health.total.remainingHp)}</td><td>{n(d.health.total.maximumHp)}</td><td>{n(d.health.total.damage)}</td><td className="paper-write" /></tr>
        {d.health.tracks.map(track => <tr key={track.key}><th>{track.name}{track.orphaned ? " (old pool)" : ""}<small className="paper-hit-number">{d.health.anatomy.hitLocations.filter(location => location.poolKey === track.key).map(hit => hit.result).join(", ")}</small></th><td>{n(track.remainingHp)}</td><td>{n(track.maximumHp)}</td><td>{n(track.damage)}</td><td className="paper-write" /></tr>)}
      </Table>{d.health.anatomy.kind === "humanoid" ? <CharacterHitLocationSilhouette className="paper-bob" title="Body Shot Bob — hit locations" /> : null}</div>
        <div className="paper-hit-key"><p>{d.health.anatomy.hitLocations.map(hit => `${hit.result} ${hit.name}`).join(" · ")}<br /><span className="paper-caption">Repeated hit results share one HP pool.</span></p></div>
        {d.health.anatomy.hitLocations.filter(hit => hit.locationEffect).map(hit => <Text key={hit.result}>{hit.result} {hit.name}: {hit.locationEffect}</Text>)}
      </Box>
    </div>
    <div className="paper-front-resources">
      {d.mana.length ? <Box title="Mana"><Table headings={["System / level", "Current / max"]}>{d.mana.map(pool => <tr key={pool.system}><th>{pool.system}<small>{pool.spellAccessLevel} · {n(pool.manaSpent)} spent</small></th><td>{n(pool.currentMana)} / {n(pool.maximumMana)}<small className="paper-inline-write">Now</small></td></tr>)}</Table></Box> : null}
      <Box title="Movement & Initiative"><p><b>Base Initiative {n(d.initiative)}</b><span className="paper-inline-write">Now</span></p><Table headings={["Mode", "Base", "Initiative"]}>{d.movement.map(mode => <tr key={mode.name}><th>{mode.name}</th><td>{n(mode.base)}</td><td>{n(mode.value)}</td></tr>)}</Table>{!d.movement.length ? <p>Movement not recorded.</p> : null}{d.movement.filter(mode => mode.notes).map(mode => <Text key={mode.name}>{mode.name}: {mode.notes}</Text>)}</Box>
      <div><Box title="Currency">{d.currency.map(row => <p key={row.name}>{row.name}: <b>{n(row.quantity)}</b></p>)}</Box><Box title="Quick rolls"><div className="paper-quick-rolls">{d.quickRolls.map(row => <span key={row.id}>{row.name.split(" → ").at(-1)} <b>{target(row.target)}</b></span>)}</div></Box></div>
    </div>
    <Box title="Weapons">{d.activeWeapons.length ? <Table headings={["Weapon / state", "Roll", "Damage / conditional modifier", "Ini.", "Reach / range"]} className="paper-weapons">{d.activeWeapons.map(weapon => <tr key={weapon.key + weapon.mode}><th>{weapon.name}{weapon.mode ? ` / ${weapon.mode}` : ""}<small>{weapon.state}</small></th><td>{weapon.target == null ? "Ruling" : target(weapon.target)}</td><td>{weapon.damage}</td><td>{weapon.initiative}</td><td>{weapon.range}</td></tr>)}</Table> : null}{!d.activeWeapons.length ? <p>No active weapons recorded.</p> : null}{d.activeWeapons.length ? <p className="paper-caption">Damage depends on successes and attack rules. The modifier is conditional, not a fixed total.</p> : null}
      {d.activeWeapons.flatMap(weapon => weapon.timing.map((line, i) => <Text key={weapon.key + weapon.mode + i}>{weapon.name}: {line}</Text>))}
    </Box>
    <div className="paper-bottom-pair">
      <Box title="Protection">{d.protection.length ? <Table headings={["Protection / state", "Coverage", "Soak"]}>{d.protection.map((entry, i) => <tr key={i}><th>{entry.name}<small>{entry.state}</small></th><td>{entry.coverage}</td><td>{entry.soak}</td></tr>)}</Table> : null}{!d.protection.length ? <p>None recorded.</p> : null}{d.protection.flatMap((entry, i) => [...new Set([entry.summary, entry.rules].filter(Boolean))].map((text, j) => <Text key={i + ":" + j}>{text}</Text>))}{d.interactions.map((rule, i) => <Text key={i}>{rule}</Text>)}</Box>
      <Box title="Conditions & play notes">{d.effects.length ? d.effects.map((effect, i) => <Text key={i}>{effect}</Text>) : <p>No active conditions recorded.</p>}<Lines count={d.mana.length > 2 ? 1 : 2} /></Box>
    </div>
    {d.gaps.length ? <Box title="Recorded information needing review">{d.gaps.map((gap, i) => <Text key={i}>{gap}</Text>)}</Box> : null}
  </>;
}
