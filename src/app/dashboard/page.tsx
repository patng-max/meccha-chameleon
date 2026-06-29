import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { factions } from "@/lib/game-data";
import type { FactionId } from "@/lib/types";
import styles from "./dashboard.module.css";

export default async function DashboardPage() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, display_name, faction, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    redirect("/onboarding");
  }

  // Fetch territory counts
  const { data: cells } = await supabase
    .from("territory_cells")
    .select("h3_cell, controller_faction, state, active_hide_count, contested_hide_count");

  const factionIds: FactionId[] = ["verdant", "ember", "tide"];
  const standings = factionIds.map((fid) => {
    const def = factions.find((f) => f.id === fid)!;
    const myCells = (cells ?? []).filter(
      (c) => c.controller_faction === fid && c.state === "controlled",
    );
    const contested = (cells ?? []).filter(
      (c) => c.controller_faction === fid && c.state === "contested",
    );
    const activeHides = (cells ?? []).reduce(
      (sum, c) => (c.controller_faction === fid ? sum + c.active_hide_count : sum),
      0,
    );
    return { ...def, controlledCells: myCells.length, contestedCells: contested.length, activeHides };
  });

  const myFaction = standings.find((s) => s.id === player.faction)!;
  const unclaimedCells = (cells ?? []).filter((c) => c.state === "unclaimed");

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* Player identity card */}
        <section className={styles.identityCard} aria-label="Your player identity">
          <div
            className={styles.factionBadge}
            style={{ "--accent": myFaction.accent } as React.CSSProperties}
            aria-hidden="true"
          />
          <div className={styles.identityInfo}>
            <p className={styles.factionName}>{myFaction.name}</p>
            <h1 className={styles.displayName}>{player.display_name}</h1>
            <p className={styles.motto}>{myFaction.motto}</p>
          </div>
        </section>

        {/* Faction standings */}
        <section className={styles.section} aria-labelledby="standings-title">
          <h2 id="standings-title" className={styles.sectionTitle}>
            Reading territory standings
          </h2>
          <div className={styles.standingsGrid}>
            {standings.map((standing) => {
              const isPlayer = standing.id === player.faction;
              return (
                <article
                  key={standing.id}
                  className={`${styles.standingCard} ${isPlayer ? styles.playerFaction : ""}`}
                  style={{ "--accent": standing.accent } as React.CSSProperties}
                >
                  <div className={styles.standingHeader}>
                    <span className={styles.standingName}>{standing.name}</span>
                    {isPlayer && <span className={styles.youBadge}>You</span>}
                  </div>
                  <dl className={styles.standingStats}>
                    <div>
                      <dt>Cells</dt>
                      <dd>{standing.controlledCells}</dd>
                    </div>
                    <div>
                      <dt>Active hides</dt>
                      <dd>{standing.activeHides}</dd>
                    </div>
                    <div>
                      <dt>Contested</dt>
                      <dd>{standing.contestedCells}</dd>
                    </div>
                    <div>
                      <dt>Score</dt>
                      <dd>{standing.score?.toLocaleString()}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        {/* Founding mission card */}
        {unclaimedCells.length > 0 && (
          <section className={styles.missionCard} aria-label="Founding mission">
            <p className={styles.missionLabel}>Reading founding mission</p>
            <h2 className={styles.missionTitle}>
              {unclaimedCells.length} unclaimed cell{unclaimedCells.length > 1 ? "s" : ""} in Reading
            </h2>
            <p className={styles.missionBody}>
              Be the first to place a hide in one of Reading&apos;s unclaimed H3 cells.
              Found a cell for your faction and establish territory that no rival can challenge
              until they place their own approved hide nearby.
            </p>
          </section>
        )}

        {/* Territory map entry */}
        <section className={styles.mapEntry} aria-label="Territory map">
          <div className={styles.mapEntryContent}>
            <h2 className={styles.mapEntryTitle}>Reading control map</h2>
            <p className={styles.mapEntryBody}>
              View live H3 cell territory, faction control status, and active hide density
              across Reading&apos;s pilot grid.
            </p>
            <a href="/dashboard/map" className={styles.mapEntryButton}>
              Open territory map
            </a>
          </div>
          <div className={styles.mapPreview} aria-hidden="true">
            <div className={styles.hexGrid}>
              {(cells ?? []).slice(0, 6).map((cell) => (
                <div
                  key={cell.h3_cell}
                  className={`${styles.hex} ${cell.controller_faction ? styles.controlled : styles.unclaimed}`}
                  style={{
                    background: cell.controller_faction
                      ? factions.find((f) => f.id === cell.controller_faction)?.accent
                      : "#4b5563",
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
