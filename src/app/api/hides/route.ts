import { createServerAnonClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { stripImageExif } from "@/lib/exif-strip";
import { latLngToCell } from "@/lib/h3-utils";
import { writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";

const MEDIA_BASE = process.env.MEDIA_BASE_DIR ?? "/srv/meccha-chameleon-staging/media";
const CLUES_DIR = join(MEDIA_BASE, "private", "clues");
const PROOFS_DIR = join(MEDIA_BASE, "private", "proofs");

const READING_LAT_MIN = 51.4;
const READING_LAT_MAX = 51.6;
const READING_LNG_MIN = -1.3;
const READING_LNG_MAX = -0.8;

const SAFETY_CHECKLIST_KEYS = [
  "noTrespass",
  "noDangerousLocation",
  "noRestrictedArea",
  "safePublicAccess",
  "noPII",
  "noUnsafeImagery",
] as const;

const submitHideSchema = z.object({
  exact_lat: z.coerce.number().min(READING_LAT_MIN).max(READING_LAT_MAX),
  exact_lng: z.coerce.number().min(READING_LNG_MIN).max(READING_LNG_MAX),
  broad_area_label: z.string().min(1).max(100).trim(),
  codename: z.string().min(3).max(40).trim(),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  safety_declaration: z.object(
    SAFETY_CHECKLIST_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: z.boolean() }),
      {} as Record<(typeof SAFETY_CHECKLIST_KEYS)[number], z.ZodBoolean>,
    ),
  ),
  faction_colour_confirmed: z.literal(true),
});

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const anonClient = await createServerAnonClient();
  const {
    data: { user },
  } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Onboarded player check ───────────────────────────────────────────────────
  const { data: player, error: playerError } = await anonClient
    .from("players")
    .select("id, faction")
    .eq("user_id", user.id)
    .maybeSingle();

  if (playerError || !player) {
    return NextResponse.json(
      { error: "Player not onboarded" },
      { status: 403 },
    );
  }

  // ── Parse FormData ───────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const identityPhoto = formData.get("identity_photo");
  const cluePhoto = formData.get("clue_photo");
  const raw_lat = formData.get("exact_lat");
  const raw_lng = formData.get("exact_lng");
  const broad_area_label = formData.get("broad_area_label");
  const codename = formData.get("codename");
  const difficulty = formData.get("difficulty");
  const faction_colour_confirmed = formData.get("faction_colour_confirmed");
  const safety_noTrespass = formData.get("safety_noTrespass");
  const safety_noDangerousLocation = formData.get("safety_noDangerousLocation");
  const safety_noRestrictedArea = formData.get("safety_noRestrictedArea");
  const safety_safePublicAccess = formData.get("safety_safePublicAccess");
  const safety_noPII = formData.get("safety_noPII");
  const safety_noUnsafeImagery = formData.get("safety_noUnsafeImagery");

  // Validate photos
  if (!identityPhoto || !(identityPhoto instanceof File)) {
    return NextResponse.json({ error: "Identity photo is required" }, { status: 400 });
  }
  if (!cluePhoto || !(cluePhoto instanceof File)) {
    return NextResponse.json({ error: "Clue photo is required" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(identityPhoto.type)) {
    return NextResponse.json({ error: "Identity photo must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (!allowedTypes.includes(cluePhoto.type)) {
    return NextResponse.json({ error: "Clue photo must be JPEG, PNG, or WebP" }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (identityPhoto.size > MAX_SIZE || cluePhoto.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 400 });
  }

  // Validate safety checklist
  const safety_declaration = {
    noTrespass: safety_noTrespass === "true",
    noDangerousLocation: safety_noDangerousLocation === "true",
    noRestrictedArea: safety_noRestrictedArea === "true",
    safePublicAccess: safety_safePublicAccess === "true",
    noPII: safety_noPII === "true",
    noUnsafeImagery: safety_noUnsafeImagery === "true",
  };

  const allSafetyChecked = Object.values(safety_declaration).every(Boolean);
  if (!allSafetyChecked) {
    return NextResponse.json(
      { error: "All safety checklist items must be confirmed" },
      { status: 400 },
    );
  }

  // Validate schema fields
  const parsed = submitHideSchema.safeParse({
    exact_lat: raw_lat,
    exact_lng: raw_lng,
    broad_area_label,
    codename,
    difficulty,
    safety_declaration,
    faction_colour_confirmed: faction_colour_confirmed === "true",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { exact_lat, exact_lng } = parsed.data;

  // ── Sanitise photos ───────────────────────────────────────────────────────────
  let identityBuffer: ArrayBuffer;
  let clueBuffer: ArrayBuffer;
  try {
    const [identityRaw, clueRaw] = await Promise.all([
      identityPhoto.arrayBuffer(),
      cluePhoto.arrayBuffer(),
    ]);
    [identityBuffer, clueBuffer] = await Promise.all([
      stripImageExif(identityRaw),
      stripImageExif(clueRaw),
    ]);
  } catch {
    return NextResponse.json(
      { error: "Failed to process images" },
      { status: 500 },
    );
  }

  // ── H3 computation (server-side) ─────────────────────────────────────────────
  const h3_public_cell = latLngToCell(exact_lat, exact_lng, 7);

  // ── File paths ────────────────────────────────────────────────────────────────
  const clueUuid = randomUUID();
  const proofUuid = randomUUID();
  const cluePath = join(CLUES_DIR, `${clueUuid}.jpg`);
  const proofPath = join(PROOFS_DIR, `${proofUuid}.jpg`);

  // ── DB insert via service role ───────────────────────────────────────────────
  const serviceClient = createServiceRoleClient();

  let hideRecord: { id: string; mc_id: string } | null = null;

  try {
    // Transaction: insert private_hide_locations + public_hides
    // We do this as two separate inserts (Supabase transactions via rpc if needed,
    // but here we rely on the service role RLS bypass)
    const { data: privLoc, error: privError } = await serviceClient
      .from("private_hide_locations")
      .insert({
        player_id: player.id,
        exact_location: `SRID=4326;POINT(${exact_lng} ${exact_lat})`,
        h3_private_cell: h3_public_cell,
      })
      .select("id")
      .single();

    if (privError || !privLoc) {
      return NextResponse.json(
        { error: "Failed to record location" },
        { status: 500 },
      );
    }

    const { data: pubHide, error: pubError } = await serviceClient
      .from("public_hides")
      .insert({
        private_location_id: privLoc.id,
        player_id: player.id,
        faction: player.faction, // Server-authoritative — from DB
        h3_public_cell,
        codename: parsed.data.codename,
        difficulty: parsed.data.difficulty,
        broad_area_label: parsed.data.broad_area_label,
        faction_colour_confirmed: true,
        safety_declaration,
        status: "awaiting_moderation",
        identity_photo_url: `/media/private/proofs/${proofUuid}.jpg`,
        clue_photo_url: `/media/private/clues/${clueUuid}.jpg`,
        clue_text: "(pending moderation)",
        approximate_area_label: parsed.data.broad_area_label,
      })
      .select("id, mc_id")
      .single();

    if (pubError || !pubHide) {
      // Rollback private location
      await serviceClient
        .from("private_hide_locations")
        .delete()
        .eq("id", privLoc.id);
      return NextResponse.json(
        { error: "Failed to create hide record" },
        { status: 500 },
      );
    }

    hideRecord = pubHide;
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // ── Write sanitised files (after DB success) ─────────────────────────────────
  try {
    await Promise.all([
      writeFile(cluePath, Buffer.from(clueBuffer)),
      writeFile(proofPath, Buffer.from(identityBuffer)),
    ]);
  } catch (fileErr) {
    // Best-effort cleanup of DB records if file write fails
    console.error("[M4] File write failed, rolling back DB records:", fileErr);
    try {
      await serviceClient.from("public_hides").delete().eq("id", hideRecord!.id);
    } catch {}
    return NextResponse.json(
      { error: "Failed to save images" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      hideId: hideRecord!.id,
      mcId: hideRecord!.mc_id,
      status: "awaiting_moderation",
    },
    { status: 201 },
  );
}
