import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { factions } from "@/lib/game-data";
import { DeployForm } from "./deploy-form";
import styles from "./deploy.module.css";

export default async function DeployPage() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, display_name, faction")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    redirect("/onboarding");
  }

  const playerFaction = factions.find((f) => f.id === player.faction);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <p className={styles.kicker}>Scout deployment</p>
          <h1 className={styles.title}>Place a hide</h1>
          <p className={styles.subtitle}>
            Submit your hide for moderator review. Approved hides appear on the territory map.
          </p>
        </div>

        <DeployForm
          playerFaction={playerFaction!}
          turnstileEnabled={
            process.env.NEXT_PUBLIC_TURNSTILE_ENABLED !== "false" &&
            Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
          }
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        />
      </div>
    </main>
  );
}
