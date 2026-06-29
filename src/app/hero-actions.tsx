"use client";

import { useSupabaseAuth } from "@/components/auth/auth-provider";
import styles from "./page.module.css";

interface HeroActionsProps {
  isAuthenticated: boolean;
  isOnboarded: boolean;
}

export function HeroActions({ isAuthenticated, isOnboarded }: HeroActionsProps) {
  const { signIn } = useSupabaseAuth();

  const handleSignIn = () => {
    void signIn();
  };

  if (isAuthenticated) {
    return (
      <div className={styles.heroActions} aria-label="Player actions">
        {isOnboarded ? (
          <a href="/dashboard" className={styles.primaryAction}>
            Open dashboard
          </a>
        ) : (
          <a href="/onboarding" className={styles.primaryAction}>
            Complete onboarding
          </a>
        )}
        <a href="#join" className={styles.secondaryAction}>
          View factions
        </a>
      </div>
    );
  }

  return (
    <div className={styles.heroActions} aria-label="Primary actions">
      <button
        type="button"
        className={styles.primaryAction}
        onClick={handleSignIn}
      >
        Sign in with GitHub
      </button>
      <a href="#founding" className={styles.secondaryAction}>
        Found a city
      </a>
    </div>
  );
}
