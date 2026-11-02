import {
  CHARACTER_HUMANOID_HIT_LOCATIONS,
  getCharacterHpBreakdown,
} from "@/features/characters/character-rules";
import type { ActiveHealthAnatomy } from "@/features/active-state/models";
import { BODY_SHOT_BOB_PATHS, BODY_SHOT_BOB_TARGETS } from "@/features/characters/body-shot-bob";

type Props = {
  totalHp: number;
  anatomy?: ActiveHealthAnatomy;
};

type CharacterHpPoolKey = ReturnType<
  typeof getCharacterHpBreakdown
>["pools"][number]["key"];


type HitLocationSilhouetteTarget = {
  result: number;
  name: string;
  className?: string;
  description?: string;
};

export function CharacterHitLocationSilhouette({
  targets = CHARACTER_HUMANOID_HIT_LOCATIONS,
  className,
  title = "Humanoid hit-location body target",
  description = "Results zero through nine identify the Head, arms, upper and lower legs, Groin, Stomach, and Chest.",
}: {
  targets?: readonly HitLocationSilhouetteTarget[];
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 610"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <desc>{description}</desc>
      <g className="character-hit-chart__silhouette">
        <circle cx="210" cy="62" r="46" />
        {BODY_SHOT_BOB_PATHS.map(path => <path key={path} d={path} />)}
      </g>

      {targets.map((target) => {
        const position = BODY_SHOT_BOB_TARGETS[target.result];
        return (
          <g
            key={target.result}
            className={`character-hit-chart__target ${target.className ?? ""}`.trim()}
            transform={`translate(${position.x} ${position.y})`}
          >
            <title>{target.description ?? `Result ${target.result}: ${target.name}.`}</title>
            <circle r="25" />
            <text
              className="character-hit-chart__target-number"
              textAnchor="middle"
              y="5"
            >
              {target.result}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function poolClass(poolKey: CharacterHpPoolKey): string {
  return `character-hit-chart__pool--${poolKey.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`,
  )}`;
}

export function CharacterHitLocationChart({ totalHp, anatomy }: Props) {
  if (anatomy && anatomy.kind !== "humanoid") return <div className="character-hit-chart">
    <header><div><p>0–9 BODY TARGET</p><h4>Race Hit Locations</h4></div><strong>{totalHp} Total HP</strong></header>
    <div className="character-hit-chart__records">
      <section aria-label="Hit point pools"><h5>HP Pools</h5><div className="character-hit-chart__pools">{anatomy.pools.map((pool) => <article key={pool.key}><span>{pool.name}</span><strong>{pool.maximumHp ?? "Unknown"} HP</strong><small>{pool.percentage ?? "Unassigned"}% of Total HP</small></article>)}</div></section>
      <section aria-label="Hit location results"><h5>Hit Result Key</h5><ol className="character-hit-chart__locations">{anatomy.hitLocations.map((location) => <li key={location.result}><strong>{location.result}</strong><span>{location.name}{location.locationEffect ? ` · ${location.locationEffect} (G.O.D. ruling)` : ""}</span><small>{location.poolName ? `Uses the one ${location.poolName} pool` : "No HP pool assigned"}</small></li>)}</ol></section>
    </div>
  </div>;
  const breakdown = getCharacterHpBreakdown(totalHp);
  const resultLabelsByPool = new Map<CharacterHpPoolKey, string>();
  for (const pool of breakdown.pools) {
    resultLabelsByPool.set(
      pool.key,
      breakdown.locations
        .filter((location) => location.poolKey === pool.key)
        .map((location) => location.result)
        .join(" + "),
    );
  }

  return (
    <div className="character-hit-chart">
      <header>
        <div>
          <p>0–9 BODY TARGET</p>
          <h4>Humanoid Hit Locations</h4>
        </div>
        <strong>{breakdown.totalHp} Total HP</strong>
      </header>

      <div className="character-hit-chart__layout">
        <figure>
          <CharacterHitLocationSilhouette
            description="Results zero through nine identify the Head, arms, upper and lower legs, Groin, Stomach, and Chest. Repeated regions share one HP pool."
            targets={breakdown.locations.map((location) => ({
              result: location.result,
              name: location.name,
              className: poolClass(location.poolKey),
              description: `Result ${location.result}: ${location.name}; ${location.hp} HP in the shared ${location.poolName} pool.`,
            }))}
          />
          <figcaption>
            Character right appears on the viewer&apos;s left. Numbers identify hit
            results; HP is assigned once to each complete body region.
          </figcaption>
        </figure>

        <div className="character-hit-chart__records">
          <section aria-label="Hit point pools">
            <h5>HP Pools</h5>
            <div className="character-hit-chart__pools">
              {breakdown.pools.map((pool) => (
                <article key={pool.key} className={poolClass(pool.key)}>
                  <span>{pool.name}</span>
                  <strong>{pool.hp} HP</strong>
                  <small>
                    Shared by result
                    {resultLabelsByPool.get(pool.key)?.includes("+") ? "s" : ""}{" "}
                    {resultLabelsByPool.get(pool.key)}
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section aria-label="Hit location results">
            <h5>Hit Result Key</h5>
            <ol className="character-hit-chart__locations">
              {breakdown.locations.map((location) => (
                <li key={location.result}>
                  <strong>{location.result}</strong>
                  <span>{location.name}</span>
                  <small>Uses the one {location.poolName} pool</small>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
