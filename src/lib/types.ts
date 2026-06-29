export type FactionId = "verdant" | "ember" | "tide";

export type HideStatus =
  | "awaiting_moderation"
  | "live"
  | "weakened"
  | "captured"
  | "lost"
  | "expired"
  | "retired"
  | "disputed";

export type CaptureState =
  | "submitted"
  | "needs_more_evidence"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export type CheckInState = "pending" | "confirmed" | "missed";

export interface Faction {
  id: FactionId;
  name: string;
  signal?: string;
  motto?: string;
  accent: string;
  softAccent: string;
  score?: number;
  territories?: number;
}

export interface Player {
  id: string;
  user_id: string;
  faction: FactionId;
  display_name: string;
  created_at: string;
  last_active_at: string;
}

export interface TerritoryCell {
  id: string;
  h3_cell?: string;
  label: string;
  area?: string;
  controller: FactionId | "unclaimed" | "contested";
  status?: "secure" | "weakened" | "moderating" | "founding";
  activity?: string;
  territory_state?: string;
}

export interface Hide {
  id: string;
  private_location_id?: string;
  player_id?: string;
  faction: FactionId;
  codename: string;
  clue_photo_url?: string | null;
  clue_text?: string;
  clue?: string;
  approximate_area_label?: string;
  approximateArea?: string;
  h3_public_cell?: string;
  difficulty?: "easy" | "medium" | "hard";
  safety_checklist?: Record<string, unknown>;
  status?: HideStatus;
  state?: HideStatus;
  moderated_at?: string | null;
  moderated_by?: string | null;
  created_at?: string;
}

export interface CaptureClaim {
  id: string;
  hide_id: string;
  claimant_id: string;
  proof_photo_url?: string | null;
  verification_code?: string | null;
  state: CaptureState;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
}

export interface CheckIn {
  id: string;
  hide_id: string;
  player_id: string;
  state: CheckInState;
  checked_in_at?: string | null;
  reminder_sent_at?: string | null;
}
