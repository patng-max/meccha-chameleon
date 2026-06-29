import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { onboardSchema } from "@/lib/contracts/territory";
import type { FactionId } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = onboardSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
  }

  const { displayName, faction } = parsed.data;

  // Check if player already exists
  const { data: existing, error: fetchError } = await supabase
    .from("players")
    .select("id, faction")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existing) {
    // Faction is locked after initial creation
    if (existing.faction !== faction) {
      return NextResponse.json(
        { error: "Faction choice is locked after initial selection." },
        { status: 409 },
      );
    }
    // Allow display name update
    const { data: updated, error: updateError } = await supabase
      .from("players")
      .update({ display_name: displayName })
      .eq("id", existing.id)
      .select("id, display_name, faction, created_at")
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "Display name is already taken." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      player: {
        id: updated.id,
        displayName: updated.display_name,
        faction: updated.faction as FactionId,
        createdAt: updated.created_at,
      },
    });
  }

  // Insert new player
  const { data: inserted, error: insertError } = await supabase
    .from("players")
    .insert({ user_id: user.id, faction, display_name: displayName })
    .select("id, display_name, faction, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Display name is already taken." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    player: {
      id: inserted.id,
      displayName: inserted.display_name,
      faction: inserted.faction as FactionId,
      createdAt: inserted.created_at,
    },
  });
}
