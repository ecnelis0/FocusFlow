import { MOTIF_ART, type MotifName } from "@/components/app/motifs";

/** Which scene belongs to a concept.
 *
 *  Two sources, in order. The extractor picks one while it is reading, which is
 *  the good answer: it has the whole material in front of it and knows that a
 *  concept about Varennes is a flight and not a law. But two hundred concepts
 *  were filed before there was a field to put that in, and re-reading the
 *  material to decorate them is not worth a minute of anyone's time — so
 *  everything else is matched here, from its own words.
 *
 *  Scored rather than first-match. "Austria and Prussia declared war on France"
 *  contains a country, a date and a war; first-match would hand it to whichever
 *  rule happened to sit higher in the file, and scoring hands it to the one the
 *  sentence is actually about.
 */

const MOTIF_NAMES = Object.keys(MOTIF_ART) as MotifName[];

/** Word stems, matched on a boundary. `act` without one matches "fact",
 *  "practice" and "character", and a map full of scrolls is the result. */
const KEYWORDS: ReadonlyArray<readonly [MotifName, readonly string[]]> = [
  [
    "battle",
    ["war", "wars", "battle", "battles", "invasion", "invade", "army", "armies", "troops",
     "siege", "revolt", "uprising", "military", "campaign", "fought", "fighting", "soldier",
     "soldiers", "conquest", "defeat", "surrender", "militia", "artillery", "regiment"],
  ],
  [
    "crown",
    ["king", "queen", "monarch", "monarchy", "monarchs", "throne", "royal", "royalty",
     "emperor", "empress", "tsar", "czar", "reign", "dynasty", "crown", "prince", "princess",
     "sovereign", "louis", "absolutism"],
  ],
  [
    "flag",
    ["revolution", "revolutionary", "republic", "independence", "nationalism", "nationalist",
     "liberty", "rally", "protest", "march", "patriot", "patriots", "rebellion", "insurrection",
     "jacobin", "sans-culottes", "commune", "citizens"],
  ],
  [
    "carriage",
    ["flight", "fled", "flee", "escape", "journey", "travel", "route", "migration", "road",
     "caravan", "wagon", "overland", "exile", "deported", "trail"],
  ],
  [
    "ship",
    ["ship", "ships", "navy", "naval", "voyage", "sail", "sailed", "colony", "colonies",
     "colonial", "explorer", "exploration", "fleet", "port", "harbor", "harbour", "atlantic",
     "pacific", "sea", "maritime", "blockade", "boston tea"],
  ],
  [
    "assembly",
    ["assembly", "parliament", "congress", "senate", "convention", "vote", "voting", "election",
     "elected", "debate", "declaration", "declared", "estates", "speech", "address", "delegate",
     "delegates", "ratify", "ratified", "petition", "referendum"],
  ],
  [
    "law",
    ["act", "acts", "law", "laws", "constitution", "constitutional", "amendment", "decree",
     "edict", "statute", "bill", "clause", "ruling", "verdict", "legislation", "legal",
     "code", "charter", "proclamation", "ordinance", "rights"],
  ],
  [
    "treaty",
    ["treaty", "treaties", "alliance", "allied", "pact", "agreement", "accord", "compromise",
     "negotiation", "negotiated", "peace", "armistice", "diplomacy", "diplomatic"],
  ],
  [
    "money",
    ["tax", "taxes", "taxation", "tariff", "debt", "economy", "economic", "trade", "price",
     "prices", "currency", "bank", "banking", "finance", "financial", "wealth", "inflation",
     "budget", "cost", "costs", "revenue", "merchant", "mercantilism", "wages"],
  ],
  [
    "factory",
    ["industrial", "industry", "factory", "factories", "machine", "machinery", "engine",
     "production", "manufacture", "manufacturing", "technology", "railroad", "railway",
     "steam", "mill", "mills", "labor", "labour", "worker", "workers"],
  ],
  [
    "map",
    ["territory", "territories", "border", "borders", "frontier", "expansion", "geography",
     "region", "land", "lands", "settlement", "settlers", "west", "westward", "annexed",
     "boundary", "province", "colonize", "colonise"],
  ],
  [
    "institution",
    ["government", "state", "court", "courts", "school", "schools", "church", "university",
     "institution", "institutions", "bureaucracy", "department", "agency", "ministry",
     "cabinet", "federal", "administration", "office"],
  ],
  [
    "idea",
    ["enlightenment", "philosophy", "philosopher", "idea", "ideas", "ideology", "belief",
     "beliefs", "doctrine", "argument", "reason", "principle", "principles", "thinker",
     "thinkers", "intellectual", "movement", "reform"],
  ],
  [
    "eye",
    ["see", "seeing", "sight", "vision", "visual", "eye", "eyes", "retina", "depth perception",
     "colour", "color", "light", "gestalt", "figure", "ground", "illusion", "observe",
     "observation", "watch", "appear", "image", "focus", "blind"],
  ],
  [
    "ear",
    ["hear", "hearing", "sound", "sounds", "auditory", "ear", "ears", "pitch", "loudness",
     "signal", "signals", "noise", "detection", "frequency", "volume", "listen"],
  ],
  [
    "brain",
    ["brain", "memory", "perception", "cognitive", "cognition", "psychology", "psychological",
     "behavior", "behaviour", "neuron", "neurons", "stimulus", "stimuli", "conditioning",
     "emotion", "sensation", "threshold", "attention", "processing", "mind", "consciousness"],
  ],
  [
    "cell",
    ["cell", "cells", "organism", "dna", "gene", "genes", "genetic", "protein", "tissue",
     "membrane", "enzyme", "evolution", "species", "biology", "biological", "mitosis",
     "photosynthesis", "chromosome", "bacteria"],
  ],
  [
    "atom",
    ["atom", "atoms", "atomic", "electron", "electrons", "energy", "force", "forces",
     "quantum", "particle", "physics", "wave", "waves", "light", "gravity", "momentum",
     "velocity", "charge", "magnetic"],
  ],
  [
    "flask",
    ["chemical", "chemistry", "reaction", "reactions", "molecule", "molecular", "acid",
     "base", "solution", "compound", "bond", "bonds", "element", "elements", "ion",
     "oxidation", "titration", "mole", "concentration"],
  ],
  [
    "equation",
    ["equation", "equations", "formula", "solve", "solving", "theorem", "derivative",
     "integral", "integration", "function", "algebra", "geometry", "calculus", "proof",
     "math", "maths", "mathematics", "polynomial", "logarithm", "sine", "cosine"],
  ],
  [
    "graph",
    ["graph", "graphs", "data", "statistic", "statistics", "correlation", "rate", "trend",
     "percentage", "distribution", "curve", "supply", "demand", "average", "median",
     "probability", "sample", "variable"],
  ],
  [
    "clock",
    ["century", "period", "era", "timeline", "chronology", "sequence", "phase", "stage",
     "decade", "years", "before", "after", "precede", "followed"],
  ],
];

/** One regex per motif, built once. */
const MATCHERS: ReadonlyArray<readonly [MotifName, RegExp]> = KEYWORDS.map(
  ([name, words]) =>
    [name, new RegExp(`\\b(?:${words.map(escape).join("|")})\\b`, "gi")] as const,
);

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A last resort that is at least stable: the same concept keeps the same
 *  scene. Picking at random would redraw the map every time it was opened. */
function hashed(seed: string): MotifName {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return MOTIF_NAMES[Math.abs(h) % MOTIF_NAMES.length];
}

const SUBJECTS: ReadonlyArray<readonly [RegExp, MotifName]> = [
  [/psych/i, "brain"],
  [/bio/i, "cell"],
  [/chem/i, "flask"],
  [/physic/i, "atom"],
  [/math|calc|algebra|geometry|statistic/i, "equation"],
  [/econ/i, "graph"],
  [/hist|apush|civics|gov/i, "book"],
];

export function isMotif(name: string | null | undefined): name is MotifName {
  return typeof name === "string" && name in MOTIF_ART;
}

export function motifFor(concept: {
  title: string;
  body?: string | null;
  subject?: string | null;
  /** The extractor's own pick, when the concept was filed after there was one. */
  motif?: string | null;
}): MotifName {
  if (isMotif(concept.motif)) return concept.motif;

  // The title counts double: it is the claim the concept is making, and the
  // body is the supporting detail around it.
  const text = `${concept.title} ${concept.title} ${concept.body ?? ""}`;
  let best: MotifName | null = null;
  let bestScore = 0;
  for (const [name, matcher] of MATCHERS) {
    matcher.lastIndex = 0;
    const score = (text.match(matcher) ?? []).length;
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  if (best) return best;

  for (const [pattern, name] of SUBJECTS) {
    if (pattern.test(concept.subject ?? "")) return name;
  }
  return concept.title.trim() ? hashed(concept.title) : "book";
}
