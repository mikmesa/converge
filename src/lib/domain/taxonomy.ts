/**
 * Fixed, generic preference taxonomies.
 *
 * These lists are shown on the blind preference form BEFORE reveal. They are
 * deliberately generic categories (§40.5): no destination names, costs or
 * option-specific details. The same values are enforced by CHECK constraints
 * in supabase/migrations — keep both in sync (a unit test asserts this).
 */

export const OPTION_TYPES = [
  "beach",
  "hills",
  "high_mountains",
  "heritage",
  "backwaters",
  "wildlife",
  "adventure",
] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const OPTION_TYPE_LABELS: Record<OptionType, string> = {
  beach: "Beach",
  hills: "Hills & plantations",
  high_mountains: "High mountains",
  heritage: "Heritage & palaces",
  backwaters: "Backwaters",
  wildlife: "Wildlife & jungle",
  adventure: "River & adventure",
};

export const OPTION_TYPE_HINTS: Record<OptionType, string> = {
  beach: "Sea, sand, coastal towns",
  hills: "Cool green hill stations, coffee and tea country",
  high_mountains: "Remote Himalayan valleys, long drives, altitude",
  heritage: "Forts, palaces, ruins, old cities",
  backwaters: "Lagoons, canals, houseboats",
  wildlife: "National parks and safaris",
  adventure: "Rafting, camping, outdoor activity bases",
};

export const ACTIVITIES = [
  "beaches_swimming",
  "water_sports",
  "trekking",
  "rafting",
  "safari",
  "forts_palaces",
  "food_markets",
  "nightlife",
  "yoga_wellness",
  "cafes",
  "boating",
  "camping",
  "scenic_drives",
  "plantations",
  "photography",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  beaches_swimming: "Beaches & swimming",
  water_sports: "Water sports",
  trekking: "Trekking & hikes",
  rafting: "River rafting",
  safari: "Wildlife safari",
  forts_palaces: "Forts & palaces",
  food_markets: "Food & markets",
  nightlife: "Nightlife",
  yoga_wellness: "Yoga & wellness",
  cafes: "Cafés",
  boating: "Boating & houseboats",
  camping: "Camping",
  scenic_drives: "Scenic drives",
  plantations: "Coffee & tea plantations",
  photography: "Photography",
};

export const MAX_DATE_RANGES = 5;
export const MAX_NOTES_LENGTH = 1000;
export const MAX_NAME_LENGTH = 40;
export const MAX_DECISION_NAME_LENGTH = 80;
export const MAX_BUDGET_VALUE = 10_000_000;
export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 8;
