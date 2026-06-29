import { describe, it, expect } from "vitest";
import { onboardSchema } from "@/lib/contracts/territory";

describe("onboarding schema", () => {
  describe("displayName validation", () => {
    it("accepts valid display names (3-24 chars)", () => {
      const valid = ["abc", "MossRunner", "Shadow_Paw", "ember-42", "A".repeat(24)];
      for (const name of valid) {
        const result = onboardSchema.safeParse({ displayName: name, faction: "verdant" });
        expect(result.success).toBe(true);
      }
    });

    it("rejects too-short display names (< 3 chars)", () => {
      const tooShort = ["", "a", "ab"];
      for (const name of tooShort) {
        const result = onboardSchema.safeParse({ displayName: name, faction: "verdant" });
        expect(result.success).toBe(false);
      }
    });

    it("rejects too-long display names (> 24 chars)", () => {
      const tooLong = "A".repeat(25);
      const result = onboardSchema.safeParse({ displayName: tooLong, faction: "verdant" });
      expect(result.success).toBe(false);
    });

    it("trims leading/trailing whitespace", () => {
      const result = onboardSchema.safeParse({ displayName: "  MossRunner  ", faction: "verdant" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe("MossRunner");
      }
    });

    it("collapses internal whitespace", () => {
      const result = onboardSchema.safeParse({ displayName: "Moss  Runner", faction: "verdant" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe("Moss Runner");
      }
    });
  });

  describe("faction validation", () => {
    it("accepts valid factions: verdant, ember, tide", () => {
      for (const faction of ["verdant", "ember", "tide"] as const) {
        const result = onboardSchema.safeParse({ displayName: "TestUser", faction });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid faction values", () => {
      const invalid = ["water", "air", "shadow", "VERDANT", "Verdant", ""];
      for (const faction of invalid) {
        const result = onboardSchema.safeParse({ displayName: "TestUser", faction });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("complete valid input", () => {
    it("accepts a fully valid payload", () => {
      const result = onboardSchema.safeParse({
        displayName: "MossRunner",
        faction: "verdant",
        turnstileToken: "test-token",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe("MossRunner");
        expect(result.data.faction).toBe("verdant");
        expect(result.data.turnstileToken).toBe("test-token");
      }
    });
  });
});
