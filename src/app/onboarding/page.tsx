import { factions } from "@/lib/game-data";
import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";
import styles from "./onboarding.module.css";

export default async function OnboardingPage() {
  const supabase = await createServerAnonClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Check if already onboarded
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (player) {
    redirect("/dashboard");
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.kicker}>Welcome to Meccha Chameleon</p>
          <h1>Choose your faction</h1>
          <p className={styles.subtitle}>
            Pick the faction you will fight for in Reading and beyond.
            This choice is permanent for the pilot.
          </p>
        </header>

        <OnboardingForm factions={factions} />
      </div>
    </main>
  );
}
