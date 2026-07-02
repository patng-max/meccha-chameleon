import { createServerAnonClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { stripImageExif } from "@/lib/exif-strip";
import { latLngToCell } from "@/lib/h3-utils";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";

const MEDIA_BASE =
  process.env.MEDIA_BASE_DIR ?? "/srv/meccha-chameleon-staging/media";
const PRIVATE_CLUES_DIR = join(MEDIA_BASE, "private", "clues");
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

const MAX_SUBMISSIONS_PER_HOUR = 3;

const submitHideSchema = z.object({
  exact_lat: z.coerce
    .number()
    .min(READING_LAT_MIN)
    .max(READING_LAT_MAX),
  exact_lng: z.coerce
    .number()
    .min(READING_LNG_MIN)
    .max(READING_LNG_MAX),
  clue_text: z.string().min(10).max(500).trim(),
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
  turnstileToken: z.string().optional(),
});

// ── Rate limiter ────────────────────────────────────────────────────────────────
async function checkRateLimit(
  supabase: ReturnType<typeof createServiceRoleClient>,
  playerId: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

  const { data: rate } = await supabase
    .from("hide_submission_rate")
    .select("submissions_last_hour, window_start")
    .eq("player_id", playerId)
    .single();

  if (!rate) {
    // First submission — insert record and allow
    await supabase
      .from("hide_submission_rate")
      .insert({ player_id: playerId, submissions_last_hour: 1, window_start: now });
    return { allowed: true };
  }

  // Reset window if expired
  if (new Date(rate.window_start) < windowStart) {
    await supabase
      .from("hide_submission_rate")
      .update({ submissions_last_hour: 1, window_start: now })
      .eq("player_id", playerId);
    return { allowed: true };
  }

  // Within window — check count
  if (rate.submissions_last_hour >= MAX_SUBMISSIONS_PER_HOUR) {
    const resetAt = new Date(
      new Date(rate.window_start).getTime() + 60 * 60 * 1000,
    );
    return { allowed: false, retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000) };
  }

  await supabase
    .from("hide_submission_rate")
    .update({ submissions_last_hour: rate.submissions_last_hour + 1 })
    .eq("player_id", playerId);
  return { allowed: true };
}

// ── Turnstile verifier (inline — avoids importing server action) ────────────────
async function verifyTurnstile(token: string | null): Promise<boolean> {
  if (process.env.TURNSTILE_ENABLED === "false") {
    return true;
  }
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  const result = (await res.json()) as { success?: boolean };
  return Boolean(result.success);
}

export async function POST(request: Request) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const anonClient = await createServerAnonClient();
  const {
    data: { user },
  } = await anonClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Onboarded player check ─────────────────────────────────────────────────
  const { data: player, error: playerError } = await anonClient
    .from("players")
    .select("id, faction")
    .eq("user_id", user.id)
    .maybeSingle();

  if (playerError || !player) {
    return NextResponse.json({ error: "Player not onboarded" }, { status: 403 });
  }

  // ── Parse FormData ─────────────────────────────────────────────────────────
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
  const clue_text = formData.get("clue_text");
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
  const turnstileToken = formData.get("turnstileToken");

  // ── Photo validation ────────────────────────────────────────────────────────
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

  // ── Safety checklist ────────────────────────────────────────────────────────
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

  // ── Schema validation ───────────────────────────────────────────────────────
  const parsed = submitHideSchema.safeParse({
    exact_lat: raw_lat,
    exact_lng: raw_lng,
    clue_text,
    broad_area_label,
    codename,
    difficulty,
    safety_declaration,
    faction_colour_confirmed: faction_colour_confirmed === "true",
    turnstileToken: turnstileToken instanceof File ? undefined : turnstileToken,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // ── Turnstile (when enabled) ────────────────────────────────────────────────
  const turnstileValid = await verifyTurnstile(
    typeof turnstileToken === "string" ? turnstileToken : null,
  );
  if (!turnstileValid) {
    return NextResponse.json(
      { error: "Turnstile verification failed. Please try again." },
      { status: 403 },
    );
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const serviceClient = createServiceRoleClient();
  const rateCheck = await checkRateLimit(serviceClient, player.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many submissions. Please wait before submitting another hide.",
        retryAfter: rateCheck.retryAfter,
      },
      { status: 429 },
    );
  }

  const { exact_lat, exact_lng, clue_text: validatedClueText } = parsed.data;

  // ── Sanitise photos ────────────────────────────────────────────────────────
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
    return NextResponse.json({ error: "Failed to process images" }, { status: 500 });
  }

  // ── H3 computation (server-side) ────────────────────────────────────────────
  const h3_public_cell = latLngToCell(exact_lat, exact_lng, 7);

  // ── Generate media paths ────────────────────────────────────────────────────
  const clueUuid = randomUUID();
  const proofUuid = randomUUID();
  const cluePath = join(PRIVATE_CLUES_DIR, `${clueUuid}.jpg`);
  const proofPath = join(PROOFS_DIR, `${proofUuid}.jpg`);
  // Private URLs — not publicly accessible
  const privateClueUrl = `/media/private/clues/${clueUuid}.jpg`;
  const privateProofUrl = `/media/private/proofs/${proofUuid}.jpg`;

  // ── Write sanitised files FIRST ─────────────────────────────────────────────
  // If file write fails, there is nothing to clean up (no DB records yet).
  // If DB insert fails below, we clean up both files.
  try {
    await Promise.all([
      writeFile(cluePath, Buffer.from(clueBuffer)),
      writeFile(proofPath, Buffer.from(identityBuffer)),
    ]);
  } catch (fileErr) {
    console.error("[M4] File write failed:", fileErr);
    return NextResponse.json({ error: "Failed to save images" }, { status: 500 });
  }

  // ── DB insert via service role ─────────────────────────────────────────────
  // Faction is server-authoritative — read from DB player.faction, never from client.
  let hideRecord: { id: string; mc_id: string } | null = null;

  try {
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
      // DB failure — clean up already-written files
      await Promise.all([
        unlink(cluePath).catch(() => {}),
        unlink(proofPath).catch(() => {}),
      ]).catch(() => {});
      return NextResponse.json({ error: "Failed to record location" }, { status: 500 });
    }

    const { data: pubHide, error: pubError } = await serviceClient
      .from("public_hides")
      .insert({
        private_location_id: privLoc.id,
        player_id: player.id,
        faction: player.faction,
        h3_public_cell,
        codename: parsed.data.codename,
        clue_text: validatedClueText,
        difficulty: parsed.data.difficulty,
        broad_area_label: parsed.data.broad_area_label,
        faction_colour_confirmed: true,
        safety_declaration,
        status: "awaiting_moderation",
        identity_photo_url: privateProofUrl,
        clue_photo_url: privateClueUrl,
        approximate_area_label: parsed.data.broad_area_label,
      })
      .select("id, mc_id")
      .single();

    if (pubError || !pubHide) {
      // DB failure — clean up both private_location AND already-written files
      await Promise.all([
        (async () => {
          try {
            await serviceClient
              .from("private_hide_locations")
              .delete()
              .eq("id", privLoc.id);
          } catch {}
        })(),
        unlink(cluePath).catch(() => {}),
        unlink(proofPath).catch(() => {}),
      ]);
      return NextResponse.json({ error: "Failed to create hide record" }, { status: 500 });
    }

    hideRecord = pubHide;
  } catch {
    // Unexpected error — clean up files
    await Promise.all([
      unlink(cluePath).catch(() => {}),
      unlink(proofPath).catch(() => {}),
    ]).catch(() => {});
    return NextResponse.json({ error: "Database error" }, { status: 500 });
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
