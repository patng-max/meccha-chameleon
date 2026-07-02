import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get player id
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: hides, error } = await supabase
    .from("public_hides")
    .select(
      "id, mc_id, broad_area_label, codename, difficulty, status, submitted_by, created_at, clue_photo_url",
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Privacy: only reveal clue_photo_url when live
  const response = (hides ?? []).map((h) => ({
    id: h.id,
    mcId: h.mc_id,
    broadAreaLabel: h.broad_area_label,
    codename: h.codename,
    difficulty: h.difficulty,
    status: h.status,
    submittedAt: h.created_at,
    // clue_photo_url only revealed when live (stored URL references the private path, replace prefix for public)
    cluePhotoUrl: h.status === "live"
      ? h.clue_photo_url?.replace("/media/private/clues", "/media/public/clues")
      : null,
  }));

  return NextResponse.json({ hides: response });
}
