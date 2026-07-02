import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ModerationClient } from "./moderation-client";

export default async function ModerationPage() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!player) redirect("/onboarding");

  // Server-side moderator check
  const { data: isMod } = await supabase.rpc("is_moderator");
  if (!isMod) redirect("/dashboard");

  return <ModerationClient />;
}
