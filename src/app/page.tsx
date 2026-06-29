import {
  activeHides,
  factionById,
  factions,
  launchCities,
  readingCells,
  safetyRules,
  type FactionId,
} from "@/lib/game-data";
import styles from "./page.module.css";

const controllerLabels: Record<string, string> = {
  unclaimed: "Founding",
  contested: "Contested",
  verdant: "Verdant",
  ember: "Ember",
  tide: "Tide",
};

function factionStyle(factionId: FactionId) {
  const faction = factionById(factionId);

  return {
    "--accent": faction?.accent,
    "--soft-accent": faction?.softAccent,
  } as React.CSSProperties;
}

export default function Home() {
  const totalTerritories = factions.reduce(
    (sum, faction) => sum + faction.territories,
    0,
  );
  const pendingModeration = activeHides.filter(
    (hide) => hide.state === "awaiting_moderation",
  ).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroContent}>
          <p className={styles.kicker}>Reading pilot ready</p>
          <h1 id="hero-title">Meccha Chameleon: Faction Hunt</h1>
          <p className={styles.heroCopy}>
            Place original Meccha Chameleon figures in safe public locations,
            publish clue photos without exact coordinates, and help your faction
            conquer real-world territory one H3 cell at a time.
          </p>
          <div className={styles.heroActions} aria-label="Primary actions">
            <a href="#join" className={styles.primaryAction}>
              Join a faction
            </a>
            <a href="#founding" className={styles.secondaryAction}>
              Found a city
            </a>
          </div>
        </div>

        <div className={styles.mapPanel} aria-label="Reading territory preview">
          <div className={styles.mapHeader}>
            <span>Reading control map</span>
            <strong>{totalTerritories} claimed cells</strong>
          </div>
          <div className={styles.hexMap}>
            {readingCells.map((cell) => (
              <article
                key={cell.id}
                className={`${styles.hexCell} ${styles[cell.controller]}`}
              >
                <span>{controllerLabels[cell.controller]}</span>
                <strong>{cell.label}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Pilot status">
        <div>
          <strong>{factions.length}</strong>
          <span>original factions</span>
        </div>
        <div>
          <strong>{readingCells.length}</strong>
          <span>Reading pilot cells</span>
        </div>
        <div>
          <strong>{pendingModeration}</strong>
          <span>hide awaiting moderation</span>
        </div>
      </section>

      <section id="join" className={styles.section} aria-labelledby="factions">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Faction choice</p>
          <h2 id="factions">Pick a side before you place or pursue.</h2>
        </div>
        <div className={styles.factionGrid}>
          {factions.map((faction) => (
            <article
              key={faction.id}
              className={styles.factionCard}
              style={factionStyle(faction.id)}
            >
              <div className={styles.factionBadge} aria-hidden="true" />
              <div>
                <h3>{faction.name}</h3>
                <p>{faction.signal}</p>
              </div>
              <blockquote>{faction.motto}</blockquote>
              <dl className={styles.factionStats}>
                <div>
                  <dt>Score</dt>
                  <dd>{faction.score.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Cells</dt>
                  <dd>{faction.territories}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.gameBoard} aria-labelledby="hunt-flow">
        <div className={styles.boardColumn}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>Live hunt loop</p>
            <h2 id="hunt-flow">Every action protects exact location privacy.</h2>
          </div>
          <div className={styles.flowList}>
            <article>
              <span>1</span>
              <div>
                <h3>Place safely</h3>
                <p>
                  Player submits exact GPS privately, approximate public area,
                  and a clue photo with EXIF stripped before storage.
                </p>
              </div>
            </article>
            <article>
              <span>2</span>
              <div>
                <h3>Moderate first</h3>
                <p>
                  Staff approve safety, public access, clue quality, and city
                  eligibility before a hide affects territory.
                </p>
              </div>
            </article>
            <article>
              <span>3</span>
              <div>
                <h3>Capture fairly</h3>
                <p>
                  Rivals submit proof privately. Approved captures weaken or
                  flip the H3 cell without exposing finder coordinates.
                </p>
              </div>
            </article>
          </div>
        </div>

        <div className={styles.hideList} aria-label="Sample hides">
          {activeHides.map((hide) => {
            const faction = factionById(hide.faction);

            return (
              <article key={hide.id} className={styles.hideCard}>
                <div>
                  <span>{faction?.name}</span>
                  <strong>{hide.codename}</strong>
                </div>
                <p>{hide.clue}</p>
                <dl>
                  <div>
                    <dt>Area</dt>
                    <dd>{hide.approximateArea}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{hide.state.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <small>{hide.safety}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section id="founding" className={styles.section} aria-labelledby="cities">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Global growth</p>
          <h2 id="cities">Unclaimed cities become founding missions.</h2>
          <p>
            Reading launches with seeded moderation and territory. Everywhere
            else starts as a clear first-player opportunity: choose a faction,
            place a safe public hide, pass moderation, and establish the first
            visible cell cluster.
          </p>
        </div>
        <div className={styles.cityGrid}>
          {launchCities.map((city) => (
            <article key={city.name} className={styles.cityCard}>
              <span>{city.state}</span>
              <h3>{city.name}</h3>
              <p>{city.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.safetyPanel} aria-labelledby="safety">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Privacy and safety</p>
          <h2 id="safety">The public game never needs exact coordinates.</h2>
        </div>
        <ul>
          {safetyRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
