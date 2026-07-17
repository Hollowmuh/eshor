/**
 * Nigeria's 36 states + FCT (confirmed live 2026-07-17 -- Wikipedia/
 * Intelpoint cross-check: 36 states, 774 LGAs total, Kano highest at 44
 * LGAs, FCT lowest at 6). State-level is the right granularity for the
 * delivery-zone dropdown -- LGAs (774 of them) are far too granular for
 * a flat-rate courier menu; the delivery_zone model's optional `area`
 * field covers the few zones (e.g. Lagos mainland/outskirts) that
 * genuinely need finer-grained rates, not every LGA.
 */
export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];
