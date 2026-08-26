import { getCharacterHpBreakdown } from "@/features/characters/character-rules";

type Props = {
  totalHp: number;
};

type CharacterHpPoolKey = ReturnType<
  typeof getCharacterHpBreakdown
>["pools"][number]["key"];

const TARGET_POSITIONS: Record<number, { x: number; y: number }> = {
  0: { x: 210, y: 62 },
  1: { x: 91, y: 226 },
  2: { x: 329, y: 226 },
  3: { x: 166, y: 505 },
  4: { x: 180, y: 389 },
  5: { x: 254, y: 505 },
  6: { x: 240, y: 389 },
  7: { x: 210, y: 304 },
  8: { x: 210, y: 234 },
  9: { x: 210, y: 158 },
};

function poolClass(poolKey: CharacterHpPoolKey): string {
  return `character-hit-chart__pool--${poolKey.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`,
  )}`;
}

export function CharacterHitLocationChart({ totalHp }: Props) {
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
          <svg
            viewBox="0 0 420 610"
            role="img"
            aria-labelledby="character-hit-chart-title character-hit-chart-description"
          >
            <title id="character-hit-chart-title">
              Humanoid hit-location body target
            </title>
            <desc id="character-hit-chart-description">
              Results zero through nine identify the Head, arms, upper and lower
              legs, Groin, Stomach, and Chest. Repeated regions share one HP pool.
            </desc>
            <g className="character-hit-chart__silhouette">
              <circle cx="210" cy="62" r="46" />
              <path d="M188 103h44l9 31h-62z" />
              <path d="M150 126Q210 108 270 126l15 75-14 76-31 63h-60l-31-63-14-76z" />
              <path d="M148 136Q116 143 103 178L66 307q-6 25 18 33 23 7 32-17l45-123z" />
              <path d="M272 136q32 7 45 42l37 129q6 25-18 33-23 7-32-17l-45-123z" />
              <path d="M180 326h30v263h-50l5-137z" />
              <path d="M210 326h30l15 126 5 137h-50z" />
              <path d="M145 589h66v14h-77q-8-8 11-14z" />
              <path d="M209 589h66q19 6 11 14h-77z" />
            </g>

            {breakdown.locations.map((location) => {
              const position = TARGET_POSITIONS[location.result];
              return (
                <g
                  key={location.result}
                  className={`character-hit-chart__target ${poolClass(location.poolKey)}`}
                  transform={`translate(${position.x} ${position.y})`}
                >
                  <title>{`Result ${location.result}: ${location.name}; ${location.hp} HP in the shared ${location.poolName} pool.`}</title>
                  <circle r="25" />
                  <text
                    className="character-hit-chart__target-number"
                    textAnchor="middle"
                    y="5"
                  >
                    {location.result}
                  </text>
                </g>
              );
            })}
          </svg>
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
