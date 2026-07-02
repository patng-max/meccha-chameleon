import { createServerAnonClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { copyFile, unlink, access, constants } from "fs/promises";
import { join } from "path";
import { z } from "zod";

const MEDIA_BASE =
  process.env.MEDIA_BASE_DIR ?? "/srv/meccha-chameleon-staging/media";
const PRIVATE_CLUES_DIR = join(MEDIA_BASE, "private", "clues");
const PUBLIC_CLUES_DIR = join(MEDIA_BASE, "public", "clues");

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "request-info"]),
  reason: z.string().optional(),
});

// ── Territory projection ──────────────────────────────────────────────────────
// Called after every hide state change.  Determines whether to write a
// territory_cells upsert and/or a territory_event, based on whether the
// material territory state has actually changed.
async function projectTerritoryForCell(
  h3Cell: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  triggeringHideId: string,
) {
  // 1. Derive current state from live approved hides only
  const { data: liveHides } = await supabase
    .from("public_hides")
    .select("faction, h3_public_cell")
    .eq("h3_public_cell", h3Cell)
    .eq("status", "live");

  const counts: Record<string, number> = {};
  for (const h of liveHides ?? []) {
    counts[h.faction] = (counts[h.faction] ?? 0) + 1;
  }

  const factionEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const totalActive = Object.values(counts).reduce((s, n) => s + n, 0);

  let newState: "unclaimed" | "controlled" | "contested";
  let newController: string | null;

  if (factionEntries.length === 0) {
    newState = "unclaimed";
    newController = null;
  } else if (factionEntries.length === 1) {
    newState = "controlled";
    newController = factionEntries[0][0];
  } else {
    newState = "contested";
    // Tie → contested with no clear controller
    if (factionEntries[0][1] === factionEntries[1][1]) {
      newController = null;
    } else {
      newController = factionEntries[0][0];
    }
  }

  // 2. Fetch existing territory record to detect actual state change
  const { data: existing } = await supabase
    .from("territory_cells")
    .select("state, controller_faction")
    .eq("h3_cell", h3Cell)
    .maybeSingle();

  const priorState: string = existing?.state ?? "unclaimed";
  const priorController: string | null = existing?.controller_faction ?? null;

  // 3. Determine area label from first live hide in cell
  const { data: firstHide } = await supabase
    .from("public_hides")
    .select("broad_area_label")
    .eq("h3_public_cell", h3Cell)
    .eq("status", "live")
    .limit(1)
    .maybeSingle();

  const areaLabel = firstHide?.broad_area_label ?? h3Cell;

  // 4. Upsert territory_cells only if something materially changed
  const stateChanged =
    priorState !== newState || priorController !== newController;

  if (stateChanged) {
    await supabase
      .from("territory_cells")
      .upsert(
        {
          h3_cell: h3Cell,
          area_label: areaLabel,
          state: newState,
          controller_faction: newController,
          active_hide_count: totalActive,
          contested_hide_count:
            newState === "contested" ? factionEntries.length : 0,
        },
        { onConflict: "h3_cell" },
      );

    // 5. Record a state-change event only when territory state changes
    await supabase.from("territory_events").insert({
      h3_cell: h3Cell,
      event_type: "territory_state_change",
      territory_state: newState,
      faction: newController as "verdant" | "ember" | "tide" | null,
      hide_id: triggeringHideId,
    });
  } else {
    // 5-alt. No state change — record a hide-approval event (no state mutation)
    await supabase.from("territory_events").insert({
      h3_cell: h3Cell,
      event_type: "hide_approved",
      territory_state: newState,
      faction: newController as "verdant" | "ember" | "tide" | null,
      hide_id: triggeringHideId,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: hideId } = await params;

  // ── Auth: player + moderator ───────────────────────────────────────────────
  const anonClient = await createServerAnonClient();
  const {
    data: { user },
  } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // ── Parse + validate action ────────────────────────────────────────────────
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

  // ── Load hide ───────────────────────────────────────────────────────────────
  const serviceClient = createServiceRoleClient();

  const { data: hide } = await serviceClient
    .from("public_hides")
    .select(
      "id, status, clue_photo_url, h3_public_cell, broad_area_label, clue_text",
    )
    .eq("id", hideId)
    .maybeSingle();

  if (!hide) {
    return NextResponse.json({ error: "Hide not found" }, { status: 404 });
  }

  if (hide.status !== "awaiting_moderation") {
    // Idempotent — already processed
    return NextResponse.json({ success: true, status: hide.status });
  }

  // ── Execute action ────────────────────────────────────────────────────────────
  if (action === "approve") {
    // ── APPROVE: fail-closed on file promotion ──────────────────────────────

    // 1. Identify source (private) clue path
    const privateUuid = hide.clue_photo_url
      ? hide.clue_photo_url.split("/").pop()?.replace(".jpg", "")
      : null;

    if (!hide.clue_photo_url || !privateUuid) {
      return NextResponse.json(
        {
          error:
            "Clue photo is missing from this hide. Cannot approve without a valid clue image.",
        },
        { status: 422 },
      );
    }

    const srcPath = join(PRIVATE_CLUES_DIR, `${privateUuid}.jpg`);
    const dstPath = join(PUBLIC_CLUES_DIR, `${privateUuid}.jpg`);

    // 2. Copy private → public
    try {
      await copyFile(srcPath, dstPath);
      // 3. Verify the promoted file is readable before proceeding
      await access(dstPath, constants.R_OK);
    } catch (promoteErr) {
      console.error("[M4] Clue promotion failed:", promoteErr);
      // Fail closed: hide stays in awaiting_moderation, clue stays inaccessible.
      // Moderator receives an actionable error with the failed file reference.
      return NextResponse.json(
        {
          error:
            "Clue photo promotion failed. The file may be missing or unreadable. Please re-upload the clue photo and try again.",
          code: "PROMOTION_FAILED",
        },
        { status: 422 },
      );
    }

    // 4. Only now update hide to live (promotion verified)
    const publicClueUrl = hide.clue_photo_url.replace(
      "/media/private/clues",
      "/media/public/clues",
    );

    const { error: updateError } = await serviceClient
      .from("public_hides")
      .update({
        status: "live",
        moderated_at: new Date().toISOString(),
        moderated_by: player.id,
        clue_photo_url: publicClueUrl,
        // clue_text is already set by the submitter; it stays and is now public
      })
      .eq("id", hideId);

    if (updateError) {
      // DB update failed — roll back the promoted file
      try {
        await unlink(dstPath);
      } catch {}
      return NextResponse.json(
        { error: "Failed to update hide status. Promotion rolled back." },
        { status: 500 },
      );
    }

    // 5. Write moderator action (append-only)
    await serviceClient.from("moderator_actions").insert({
      moderator_id: player.id,
      action_type: "approve",
      target_id: hideId,
      target_type: "hide",
    });

    // 6. Territory projection (with state-change vs event distinction)
    await projectTerritoryForCell(hide.h3_public_cell, serviceClient, hideId);
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

    // Re-projection: this hide is now retired, update territory
    await projectTerritoryForCell(hide.h3_public_cell, serviceClient, hideId);
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
    // No territory change for request-info
  }

  return NextResponse.json({ success: true });
}
