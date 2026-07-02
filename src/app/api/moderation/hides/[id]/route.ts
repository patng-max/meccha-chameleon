import { createServerAnonClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { copyFile, unlink } from "fs/promises";
import { join } from "path";
import { z } from "zod";

const MEDIA_BASE = process.env.MEDIA_BASE_DIR ?? "/srv/meccha-chameleon-staging/media";
const PRIVATE_CLUES_DIR = join(MEDIA_BASE, "private", "clues");
const PUBLIC_CLUES_DIR = join(MEDIA_BASE, "public", "clues");

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "request-info"]),
  reason: z.string().optional(),
});

async function projectTerritoryForCell(
  h3Cell: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
) {
  // Count live hides per faction in this cell
  const { data: liveHides } = await supabase
    .from("public_hides")
    .select("faction")
    .eq("h3_public_cell", h3Cell)
    .eq("status", "live");

  const counts: Record<string, number> = {};
  for (const h of liveHides ?? []) {
    counts[h.faction] = (counts[h.faction] ?? 0) + 1;
  }

  let state: "unclaimed" | "controlled" | "contested";
  let controllerFaction: string | null;

  const factionEntries = Object.entries(counts);
  if (factionEntries.length === 0) {
    state = "unclaimed";
    controllerFaction = null;
  } else if (factionEntries.length === 1) {
    state = "controlled";
    controllerFaction = factionEntries[0][0];
  } else {
    // 2+ factions — contested, majority wins (null if tied)
    factionEntries.sort((a, b) => b[1] - a[1]);
    const topCount = factionEntries[0][1];
    const secondCount = factionEntries[1]?.[1] ?? 0;
    if (topCount === secondCount) {
      state = "contested";
      controllerFaction = null;
    } else {
      state = "contested";
      controllerFaction = factionEntries[0][0];
    }
  }

  // Get area_label from first live hide in cell (or keep existing)
  const { data: firstHide } = await supabase
    .from("public_hides")
    .select("broad_area_label")
    .eq("h3_public_cell", h3Cell)
    .eq("status", "live")
    .limit(1)
    .maybeSingle();

  const areaLabel = firstHide?.broad_area_label ?? h3Cell;

  // Upsert territory_cells
  await supabase
    .from("territory_cells")
    .upsert(
      { h3_cell: h3Cell, area_label: areaLabel, state, controller_faction: controllerFaction },
      { onConflict: "h3_cell" },
    );

  // Insert territory_events
  await supabase.from("territory_events").insert({
    h3_cell: h3Cell,
    event_type: "hide_approved",
    territory_state: state,
    faction: controllerFaction as "verdant" | "ember" | "tide" | null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: hideId } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const anonClient = await createServerAnonClient();
  const {
    data: { user },
  } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check player + moderator status
  const { data: player } = await anonClient
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: isMod } = await anonClient.rpc("is_moderator");
  if (!isMod) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse action ─────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { action, reason } = parsed.data;

  if (action === "reject" && (!reason || reason.trim().length === 0)) {
    return NextResponse.json(
      { error: "Reject reason is required" },
      { status: 400 },
    );
  }

  // ── Load hide ────────────────────────────────────────────────────────────────
  const serviceClient = createServiceRoleClient();

  const { data: hide, error: hideError } = await serviceClient
    .from("public_hides")
    .select("id, status, clue_photo_url, h3_public_cell")
    .eq("id", hideId)
    .maybeSingle();

  if (hideError || !hide) {
    return NextResponse.json({ error: "Hide not found" }, { status: 404 });
  }

  if (hide.status !== "awaiting_moderation") {
    // Idempotent: if already processed, return success
    return NextResponse.json({ success: true, status: hide.status });
  }

  // ── Execute action ────────────────────────────────────────────────────────────
  if (action === "approve") {
    // 1. Promote clue photo: private/clues/{uuid}.jpg → public/clues/{uuid}.jpg
    if (hide.clue_photo_url) {
      const uuid = hide.clue_photo_url.split("/").pop()?.replace(".jpg", "");
      if (uuid) {
        const src = join(PRIVATE_CLUES_DIR, `${uuid}.jpg`);
        const dst = join(PUBLIC_CLUES_DIR, `${uuid}.jpg`);
        try {
          await copyFile(src, dst);
          await unlink(src).catch(() => {}); // best-effort cleanup
        } catch {
          // Non-fatal: file promotion failed but DB update proceeds
        }
      }
    }

    // 2. Update hide status → live
    await serviceClient
      .from("public_hides")
      .update({
        status: "live",
        moderated_at: new Date().toISOString(),
        moderated_by: player.id,
        clue_text: "Approved",
        clue_photo_url: hide.clue_photo_url?.replace(
          "/media/private/clues",
          "/media/public/clues",
        ),
      })
      .eq("id", hideId);

    // 3. Insert moderator_actions
    await serviceClient.from("moderator_actions").insert({
      moderator_id: player.id,
      action_type: "approve",
      target_id: hideId,
      target_type: "hide",
    });

    // 4. Territory projection
    await projectTerritoryForCell(hide.h3_public_cell, serviceClient);
  } else if (action === "reject") {
    await serviceClient
      .from("public_hides")
      .update({
        status: "retired",
        moderated_at: new Date().toISOString(),
        moderated_by: player.id,
        moderator_notes: reason,
      })
      .eq("id", hideId);

    await serviceClient.from("moderator_actions").insert({
      moderator_id: player.id,
      action_type: "reject",
      target_id: hideId,
      target_type: "hide",
      notes: reason,
    });
  } else if (action === "request-info") {
    await serviceClient
      .from("public_hides")
      .update({
        moderated_at: new Date().toISOString(),
        moderated_by: player.id,
        moderator_notes: reason ?? "(no note)",
      })
      .eq("id", hideId);

    await serviceClient.from("moderator_actions").insert({
      moderator_id: player.id,
      action_type: "request_info",
      target_id: hideId,
      target_type: "hide",
      notes: reason,
    });
  }

  return NextResponse.json({ success: true });
}
