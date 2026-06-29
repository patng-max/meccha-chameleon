export type FactionId = "verdant" | "ember" | "tide";

export type Faction = {
  id: FactionId;
  name: string;
  signal: string;
  motto: string;
  accent: string;
  softAccent: string;
  score: number;
  territories: number;
};

export type TerritoryCell = {
  id: string;
  label: string;
  area: string;
  controller: FactionId | "unclaimed" | "contested";
  status: "secure" | "weakened" | "moderating" | "founding";
  activity: string;
};

export type Hide = {
  id: string;
  codename: string;
  faction: FactionId;
  approximateArea: string;
  clue: string;
  state: "awaiting_moderation" | "live" | "weakened" | "captured";
  safety: string;
};

export const factions: Faction[] = [
  {
    id: "verdant",
    name: "Verdant Circuit",
    signal: "Patient scouts who turn parks, plazas, and paths into living routes.",
    motto: "Blend in. Branch out.",
    accent: "#15803d",
    softAccent: "#dcfce7",
    score: 1240,
    territories: 18,
  },
  {
    id: "ember",
    name: "Ember Relay",
    signal: "Fast challengers who use street-level clues and quick captures.",
    motto: "Spark the chase.",
    accent: "#c2410c",
    softAccent: "#ffedd5",
    score: 1115,
    territories: 15,
  },
  {
    id: "tide",
    name: "Tide Assembly",
    signal: "Coordinated crews who sweep riverside routes and transport hubs.",
    motto: "Move as one.",
    accent: "#0369a1",
    softAccent: "#e0f2fe",
    score: 980,
    territories: 13,
  },
];

export const readingCells: TerritoryCell[] = [
  {
    id: "89194ad2c6fffff",
    label: "Forbury Loop",
    area: "Reading town centre",
    controller: "verdant",
    status: "secure",
    activity: "2 active hides, 1 clue refreshed today",
  },
  {
    id: "89194ad2c2bffff",
    label: "Oracle Crossing",
    area: "Riverside and shopping approaches",
    controller: "contested",
    status: "weakened",
    activity: "Capture proof under moderator review",
  },
  {
    id: "89194ad35a7ffff",
    label: "Station North",
    area: "Station public concourse radius",
    controller: "ember",
    status: "moderating",
    activity: "New hide queued for safety review",
  },
  {
    id: "89194ad2837ffff",
    label: "Abbey Quarter",
    area: "Public paths near abbey ruins",
    controller: "tide",
    status: "secure",
    activity: "1 active hide, 3 failed searches",
  },
  {
    id: "89194ad34cbffff",
    label: "Caversham Bridge",
    area: "Public riverside approaches",
    controller: "unclaimed",
    status: "founding",
    activity: "First approved hide establishes the cell",
  },
  {
    id: "89194ad2813ffff",
    label: "Museum Quarter",
    area: "Public civic spaces",
    controller: "unclaimed",
    status: "founding",
    activity: "Open founding opportunity",
  },
];

export const activeHides: Hide[] = [
  {
    id: "hide-rdg-014",
    codename: "Glasshouse Wink",
    faction: "verdant",
    approximateArea: "Forbury Loop",
    clue: "Look for a public bench with a view of old stone and new glass.",
    state: "live",
    safety: "No climbing, no private land, visible from a public path.",
  },
  {
    id: "hide-rdg-018",
    codename: "Copper Current",
    faction: "ember",
    approximateArea: "Station North",
    clue: "The clue photo shows railings, paving, and a red reflection.",
    state: "awaiting_moderation",
    safety: "Moderator must approve visibility and crowd flow before launch.",
  },
  {
    id: "hide-rdg-021",
    codename: "Blue Wake",
    faction: "tide",
    approximateArea: "Abbey Quarter",
    clue: "A chameleon watches the water without getting wet.",
    state: "weakened",
    safety: "Approximate area only. Finder proof does not reveal exact GPS.",
  },
];

export const safetyRules = [
  "Exact coordinates are stored privately and never shown to players.",
  "Uploaded clue and proof photos must be stripped of EXIF metadata.",
  "New hides stay invisible until a moderator approves safety and quality.",
  "Private land, roads, restricted areas, schools, and risky placements are rejected.",
  "Captures reveal proof to moderators first, then update public territory state.",
];

export const launchCities = [
  {
    name: "Reading",
    state: "Pilot live",
    detail: "Seeded H3 cells, moderator workflow, and public-place safety rules.",
  },
  {
    name: "Bristol",
    state: "Unclaimed",
    detail: "The first approved faction hide founds a visible territory cluster.",
  },
  {
    name: "Manchester",
    state: "Unclaimed",
    detail: "Players see a founding mission instead of an empty map.",
  },
];

export function factionById(id: FactionId) {
  return factions.find((faction) => faction.id === id);
}
