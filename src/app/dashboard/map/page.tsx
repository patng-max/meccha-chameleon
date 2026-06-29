import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cellToGeoJSONPolygon } from "@/lib/h3-utils";
import { TerritoryMap } from "@/components/map/TerritoryMap";
import type { TerritoryCellFeature } from "@/lib/contracts/territory";
import type { FactionId } from "@/lib/types";
import styles from "./map.module.css";

export default async function MapPage() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    redirect("/onboarding");
  }

  const { data: cells } = await supabase
    .from("territory_cells")
    .select("h3_cell, area_label, controller_faction, state, active_hide_count, contested_hide_count");

  const features: TerritoryCellFeature[] = (cells ?? []).map((cell) => ({
    type: "Feature",
    id: cell.h3_cell,
    properties: {
      h3Cell: cell.h3_cell,
      areaLabel: cell.area_label,
      controllerFaction: cell.controller_faction as FactionId | null,
      state: cell.state as "unclaimed" | "controlled" | "contested",
      activeHideCount: cell.active_hide_count,
      contestedHideCount: cell.contested_hide_count,
    },
    geometry: cellToGeoJSONPolygon(cell.h3_cell),
  }));

  return (
    <main className={styles.page}>
      <div className={styles.mapHeader}>
        <h1 className={styles.mapTitle}>Reading territory map</h1>
        <a href="/dashboard" className={styles.backLink}>
          ← Back to dashboard
        </a>
      </div>
      <div className={styles.mapContainer}>
        <TerritoryMap cells={features} />
      </div>
      <div className={styles.legend} aria-label="Map legend">
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#15803d" }} />
          Verdant
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#c2410c" }} />
          Ember
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#0369a1" }} />
          Tide
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#ca8a04" }} />
          Contested
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#9ca3af" }} />
          Unclaimed
        </span>
      </div>
    </main>
  );
}
