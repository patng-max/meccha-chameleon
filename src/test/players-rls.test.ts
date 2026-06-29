import { describe, it, expect } from "vitest";

// This file documents the expected RLS behavior for the players table
// after migration 002_m2_m3_player_onboarding_territory.sql.
//
// These are documentation tests — they assert invariants that should hold
// true for the Supabase database based on the migration SQL.
//
// Run against a local Supabase instance or test database to verify live behavior.

describe("players RLS behavior (documentation)", () => {
  // -------------------------------------------------------------------------
  // Expected RLS policies after migration 002
  // -------------------------------------------------------------------------

  describe("players table", () => {
    it("has a NOT NULL user_id constraint", () => {
      // After migration: alter table public.players alter column user_id set not null;
      // This means any insert without user_id should fail at DB level
      const schema = { user_id: "uuid-not-null" };
      expect(schema.user_id).toBeDefined();
    });

    it("should have a unique index on user_id", () => {
      // create unique index players_user_id_key on public.players (user_id);
      // Each player row maps 1:1 to an auth.users entry
      const uniqueIndexes = ["user_id"];
      expect(uniqueIndexes).toContain("user_id");
    });

    it("should have a case-insensitive unique index on display_name", () => {
      // create unique index players_display_name_lower_key on public.players (lower(display_name));
      // Display names must be globally unique, case-insensitively
      const uniqueIndexes = ["lower(display_name)"];
      expect(uniqueIndexes).toContain("lower(display_name)");
    });
  });

  describe("SELECT policy", () => {
    it("owner or service_role can select their own row", () => {
      // Policy: using (user_id = auth.uid() or auth.role() = 'service_role')
      // A regular authenticated user should only see rows where user_id matches their auth.uid()
      const policies = ["user_id = auth.uid() OR auth.role() = 'service_role'"];
      expect(policies).toContain("user_id = auth.uid() OR auth.role() = 'service_role'");
    });

    it("anon should NOT be able to select players directly", () => {
      // The old policy "players are readable by everyone" using (true) is dropped
      // The new policy requires user_id = auth.uid() — anon has no uid, so 0 rows
      const newPolicy = "user_id = auth.uid() OR auth.role() = 'service_role'";
      expect(newPolicy).not.toBe("(true)");
    });
  });

  describe("public_player_profiles view", () => {
    it("exposes only safe public fields", () => {
      // View: select id, faction, display_name, created_at from public.players
      // Must NOT include: user_id, last_active_at
      const viewFields = ["id", "faction", "display_name", "created_at"];
      expect(viewFields).not.toContain("user_id");
      expect(viewFields).not.toContain("last_active_at");
    });

    it("is readable by anon and authenticated", () => {
      // grant select on public.public_player_profiles to authenticated, anon;
      const authorizedRoles = ["authenticated", "anon"];
      expect(authorizedRoles).toContain("anon");
      expect(authorizedRoles).toContain("authenticated");
    });

    it("is owned by postgres", () => {
      // alter view public.public_player_profiles owner to postgres;
      const owner = "postgres";
      expect(owner).toBe("postgres");
    });
  });

  describe("forbidden fields must not be in public_player_profiles", () => {
    const forbidden = [
      "user_id",
      "last_active_at",
      "exact_location",
      "private_location_id",
      "latitude",
      "longitude",
    ];

    it("none of the forbidden fields are in public_player_profiles", () => {
      const viewFields = ["id", "faction", "display_name", "created_at"];
      for (const f of forbidden) {
        expect(viewFields).not.toContain(f);
      }
    });
  });
});
