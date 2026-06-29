"use client";

import { useSupabaseAuth } from "./auth-provider";
import styles from "./auth-header.module.css";

export function AuthHeader() {
  const { session, signIn, signOut } = useSupabaseAuth();

  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/">
        Meccha Chameleon
      </a>
      <button
        className={styles.authButton}
        type="button"
        onClick={() => {
          void (session ? signOut() : signIn());
        }}
      >
        {session ? "Sign out" : "Sign in"}
      </button>
    </header>
  );
}
