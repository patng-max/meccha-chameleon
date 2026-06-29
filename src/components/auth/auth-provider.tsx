"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

type AuthContextValue = {
  session: Session | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function SupabaseAuthProvider({
  initialSession,
  children,
}: {
  initialSession: Session | null;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(initialSession);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      signIn: async () => {
        const origin = window.location.origin;

        await supabase.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: `${origin}/auth/callback`,
          },
        });
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
      },
    }),
    [session, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useSupabaseAuth must be used within SupabaseAuthProvider.");
  }

  return context;
}
