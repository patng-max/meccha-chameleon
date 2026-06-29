import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { factions } from "@/lib/game-data";
import type { DashboardResponse } from "@/lib/contracts/territory";
import type { FactionId } from "@/lib/types";

// Reading town centre: approx [-1.0, 51.45]
const MAP_CENTER_LNG = -1.0;
const MAP_CENTER_LAT = 51.45;
const MAP_ZOOM = 13;

export async function GET() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get player row
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, display_name, faction, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  if (!player) {
    return NextResponse.json({ error: "Player not onboarded" }, { status: 403 });
  }

  // Get territory counts per faction
  const { data: cells, error: cellsError } = await supabase
    .from("territory_cells")
    .select("controller_faction, state, active_hide_count, contested_hide_count");

  if (cellsError) {
    return NextResponse.json({ error: cellsError.message }, { status: 500 });
  }

  // Build faction standings
  const factionIds: FactionId[] = ["verdant", "ember", "tide"];
  const standings = factionIds.map((fid) => {
    const factionDef = factions.find((f) => f.id === fid)!;
    const myCells = (cells ?? []).filter(
      (c) => c.controller_faction === fid && c.state === "controlled",
    );
    const contestedCells = (cells ?? []).filter(
      (c) => c.controller_faction === fid && c.state === "contested",
    );
    const activeHides = (cells ?? []).reduce(
      (sum, c) => (c.controller_faction === fid ? sum + c.active_hide_count : sum),
      0,
    );
    return {
      id: fid,
      name: factionDef.name,
      controlledCells: myCells.length,
      activeHides,
      contestedCells: contestedCells.length,
      score: factionDef.score ?? 0,
    };
  });

  const response: DashboardResponse = {
    player: {
      id: player.id,
      displayName: player.display_name,
      faction: player.faction as FactionId,
    },
    factions: standings,
    map: {
      center: [MAP_CENTER_LNG, MAP_CENTER_LAT],
      zoom: MAP_ZOOM,
    },
  };

  return NextResponse.json(response);
}
