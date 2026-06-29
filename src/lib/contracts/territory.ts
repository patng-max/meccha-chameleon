import { z } from "zod";
import type { FactionId } from "@/lib/types";

// ─── Onboarding ─────────────────────────────────────────────────────────────

export const onboardSchema = z.object({
  displayName: z
    .string()
    .min(3, "Display name must be at least 3 characters")
    .max(24, "Display name must be at most 24 characters")
    .trim()
    .transform((val) => val.replace(/\s+/g, " ")),
  faction: z.enum(["verdant", "ember", "tide"]),
  turnstileToken: z.string().optional(),
});

export type OnboardInput = z.infer<typeof onboardSchema>;

// ─── Territory cell GeoJSON ─────────────────────────────────────────────────

export const territoryCellSchema = z.object({
  h3_cell: z.string(),
  area_label: z.string(),
  controller_faction: z.string().nullable(),
  state: z.enum(["unclaimed", "controlled", "contested"]),
  active_hide_count: z.number().int().min(0),
  contested_hide_count: z.number().int().min(0),
});

export type TerritoryCellRow = z.infer<typeof territoryCellSchema>;

export interface TerritoryCellFeature {
  type: "Feature";
  id: string;
  properties: {
    h3Cell: string;
    areaLabel: string;
    controllerFaction: FactionId | null;
    state: "unclaimed" | "controlled" | "contested";
    activeHideCount: number;
    contestedHideCount: number;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface TerritoryFeatureCollection {
  type: "FeatureCollection";
  features: TerritoryCellFeature[];
}

// ─── Forbidden keys (must never appear in public responses) ─────────────────

/** Keys that must never appear in any public-facing API response */
export const FORBIDDEN_KEYS = [
  "exact_location",
  "private_location_id",
  "latitude",
  "longitude",
  "ST_X",
  "ST_Y",
  "user_id",
  "last_active_at",
] as const;

// ─── Player me ───────────────────────────────────────────────────────────────

export type PlayerMeResponse =
  | { status: "needs_onboarding"; player: null }
  | {
      status: "ready";
      player: {
        id: string;
        displayName: string;
        faction: FactionId;
        createdAt: string;
      };
    };

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface FactionStanding {
  id: FactionId;
  name: string;
  controlledCells: number;
  activeHides: number;
  contestedCells: number;
  score: number;
}

export interface DashboardResponse {
  player: {
    id: string;
    displayName: string;
    faction: FactionId;
    createdAt: string;
  };
  factions: FactionStanding[];
  map: {
    center: [number, number]; // [lng, lat]
    zoom: number;
  };
}
