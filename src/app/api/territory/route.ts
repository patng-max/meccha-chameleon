import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cellToGeoJSONPolygon } from "@/lib/h3-utils";
import {
  FORBIDDEN_KEYS,
  type TerritoryFeatureCollection,
  type TerritoryCellFeature,
} from "@/lib/contracts/territory";
import type { FactionId } from "@/lib/types";

export async function GET() {
  const supabase = await createServerAnonClient();

  const { data: cells, error } = await supabase
    .from("territory_cells")
    .select("h3_cell, area_label, controller_faction, state, active_hide_count, contested_hide_count");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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

  // Privacy validation: ensure no forbidden keys leak
  // The response shape is controlled by our explicit DTO, but we validate the raw
  // data to catch any schema misconfiguration.
  const raw = JSON.stringify(cells);
  for (const key of FORBIDDEN_KEYS) {
    if (raw.includes(key)) {
      console.error(`[SECURITY] Forbidden key "${key}" found in territory_cells query result`);
      return NextResponse.json(
        { error: "Internal configuration error" },
        { status: 500 },
      );
    }
  }

  const response: TerritoryFeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  return NextResponse.json(response);
}
