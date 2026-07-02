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

  // Check moderator via service role (RLS check via policy also works)
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Call is_moderator() via a RPC or direct query
  const { data: modCheck } = await supabase.rpc("is_moderator");
  if (!modCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: hides, error } = await supabase
    .from("public_hides")
    .select(
      "id, mc_id, h3_public_cell, broad_area_label, codename, clue_text, difficulty, submitted_by, created_at, identity_photo_url, clue_photo_url, safety_declaration, faction_colour_confirmed",
    )
    .eq("status", "awaiting_moderation")
    .order("created_at", { ascending: true }); // oldest first

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = (hides ?? []).map((h) => ({
    id: h.id,
    mcId: h.mc_id,
    h3PublicCell: h.h3_public_cell,
    broadAreaLabel: h.broad_area_label,
    codename: h.codename,
    clueText: h.clue_text,
    difficulty: h.difficulty,
    submittedAt: h.created_at,
    playerId: h.submitted_by,
    identityPhotoUrl: h.identity_photo_url,
    cluePhotoUrl: h.clue_photo_url,
    safetyDeclaration: h.safety_declaration,
    factionColourConfirmed: h.faction_colour_confirmed,
  }));

  return NextResponse.json({ hides: response });
}
