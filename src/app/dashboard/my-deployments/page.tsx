import { createServerAnonClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import styles from "./my-deployments.module.css";

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    awaiting_moderation: { label: "Pending review", cls: styles.badgePending },
    live: { label: "Live", cls: styles.badgeLive },
    retired: { label: "Retired", cls: styles.badgeRetired },
  };
  const cfg = configs[status] ?? { label: status, cls: styles.badgePending };
  return <span className={`${styles.badge} ${cfg.cls}`}>{cfg.label}</span>;
}

export default async function MyDeploymentsPage() {
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

  const { data: hides } = await supabase
    .from("public_hides")
    .select("id, mc_id, broad_area_label, codename, difficulty, status, created_at")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <a href="/dashboard" className={styles.backLink}>← Dashboard</a>
          <h1 className={styles.title}>My Deployments</h1>
          <a href="/dashboard/deploy" className={styles.newButton}>
            + New deployment
          </a>
        </div>

        {!hides || hides.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              You haven&apos;t submitted any hides yet.
            </p>
            <a href="/dashboard/deploy" className={styles.emptyLink}>
              Deploy your first hide
            </a>
          </div>
        ) : (
          <ul className={styles.list}>
            {hides.map((h) => (
              <li key={h.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIds}>
                    <span className={styles.mcId}>{h.mc_id ?? "—"}</span>
                    <StatusBadge status={h.status} />
                  </div>
                  <time className={styles.date} dateTime={h.created_at}>
                    {new Date(h.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.codename}>{h.codename}</p>
                  <dl className={styles.meta}>
                    <div>
                      <dt>Area</dt>
                      <dd>{h.broad_area_label}</dd>
                    </div>
                    <div>
                      <dt>Difficulty</dt>
                      <dd>{h.difficulty}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
