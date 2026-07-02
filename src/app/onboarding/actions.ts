"use server";

import { redirect } from "next/navigation";
import { onboardSchema } from "@/lib/contracts/territory";
import { createServerAnonClient } from "@/lib/supabase/server";

export type OnboardState = {
  error?: string;
  issues?: { field: string; message: string }[];
};

async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  // Explicit flag to disable Turnstile — checked before any key presence
  if (process.env.TURNSTILE_ENABLED === "false") {
    return true;
  }

  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Skip verification in non-production if keys not configured
    return process.env.NODE_ENV !== "production";
  }
  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: formData },
  );
  const result = (await response.json()) as { success?: boolean };
  return Boolean(result.success);
}

export async function onboardAction(
  prevState: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to onboard." };
  }

  const raw = {
    displayName: formData.get("displayName"),
    faction: formData.get("faction"),
    turnstileToken: formData.get("turnstileToken"),
  };

  const parsed = onboardSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return { error: "Validation failed", issues };
  }

  // Verify Turnstile token
  const turnstileValid = await verifyTurnstile(parsed.data.turnstileToken ?? null);
  if (!turnstileValid) {
    return { error: "Turnstile verification failed. Please try again." };
  }

  const { displayName, faction } = parsed.data;

  // Check if player already exists
  const { data: existing } = await supabase
    .from("players")
    .select("id, faction")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Faction is locked after initial creation
    if (existing.faction !== faction) {
      return { error: "Faction choice is locked after initial selection." };
    }
    // Update display name
    const { error: updateError } = await supabase
      .from("players")
      .update({ display_name: displayName })
      .eq("id", existing.id);

    if (updateError) {
      if (updateError.code === "23505") {
        return { error: "Display name is already taken." };
      }
      return { error: updateError.message };
    }

    redirect("/dashboard");
  }

  // Insert new player
  const { error: insertError } = await supabase
    .from("players")
    .insert({ user_id: user.id, faction, display_name: displayName });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "Display name is already taken." };
    }
    return { error: insertError.message };
  }

  redirect("/dashboard");
}
