import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { PlayerMeResponse } from "@/lib/contracts/territory";

export async function GET() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player, error } = await supabase
    .from("players")
    .select("id, display_name, faction, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!player) {
    const response: PlayerMeResponse = { status: "needs_onboarding", player: null };
    return NextResponse.json(response);
  }

  const response: PlayerMeResponse = {
    status: "ready",
    player: {
      id: player.id,
      displayName: player.display_name,
      faction: player.faction,
    },
  };

  return NextResponse.json(response);
}
