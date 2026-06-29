"use client";

import Link from "next/link";
import { useSupabaseAuth } from "./auth-provider";
import styles from "./auth-header.module.css";

export function AuthHeader() {
  const { session, signIn, signOut } = useSupabaseAuth();

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        Meccha Chameleon
      </Link>
      <nav className={styles.nav} aria-label="Auth navigation">
        {session ? (
          <>
            <a href="/dashboard" className={styles.navLink}>
              Dashboard
            </a>
            <button
              type="button"
              className={styles.authButton}
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.authButton}
            onClick={() => {
              void signIn();
            }}
          >
            Sign in with GitHub
          </button>
        )}
      </nav>
    </header>
  );
}
