export const cosmologyFamilies = {
  cosmicFramework: "Cosmic frameworks", realm: "Planes and realms",
  celestial: "Celestial bodies and structures", cosmicPrinciple: "Cosmic principles",
  cosmicConnection: "Cosmic connections and accounts",
} as const;

// Kinds are saved, searchable classifications, not mandatory physics or a tree.
export const cosmicKinds = {
  cosmicFramework: ["cosmology", "universe", "multiverse", "reality", "existence framework"],
  realm: ["plane", "dimension", "pocket reality", "divine realm", "spirit realm", "dream realm", "conceptual realm"],
  celestial: ["galaxy", "star system", "star", "planet", "moon", "asteroid", "comet", "constellation", "nebula", "cosmic structure", "cosmic phenomenon"],
  cosmicPrinciple: ["physical law", "metaphysical law", "cosmic principle"],
  cosmicConnection: ["containment", "overlap", "origin claim", "gateway", "boundary", "reflection", "influence", "symbolic association"],
} as const;

export const cosmologyFields = {
  cosmicFramework: { aliases: "Alternate names", classification: "Cosmic kind or classification", nature: "Nature of existence", extent: "Finite, infinite or original extent", structure: "Authored internal structure", space: "Spatial or nonspatial properties", time: "Relationship to time", matter: "Relationship to matter", consciousness: "Relationship to consciousness", magic: "Relationship to magic", origins: "Origin interpretations", development: "Historical transformations" },
  realm: { aliases: "Alternate names", classification: "Cosmic kind or classification", nature: "Nature of existence", form: "Physical or nonphysical form", space: "Spatial or nonspatial properties", boundaries: "Boundaries", structure: "Authored internal structure", environment: "Environmental conditions", matter: "Relationship to matter", consciousness: "Relationship to consciousness", magic: "Relationship to magic", time: "Relationship to time", accessibility: "Public accessibility account", hiddenAccess: "Confidential access account", inhabitants: "Inhabitants", development: "Historical transformations" },
  celestial: { aliases: "Alternate names", classification: "Cosmic kind or classification", appearance: "Appearance", composition: "Physical composition", scale: "Size or scale", shape: "Shape", mass: "Mass account", gravity: "Gravity account", atmosphere: "Atmosphere", surface: "Surface environment", temperature: "Temperature and climate", rotation: "Rotation description", orbit: "Orbital description", satellites: "Natural satellite account", rings: "Rings", features: "Significant features", habitability: "Habitability", life: "Life forms", extraordinary: "Magical or extraordinary properties", development: "Historical transformations" },
  cosmicPrinciple: { classification: "Cosmic kind or classification", statement: "Authored principle", scope: "Claimed scope", conditions: "Conditions", exceptions: "Exceptions and conflicting laws", interpretations: "Disputed interpretations", provenance: "Evidence and attributed sources", development: "Historical changes" },
  cosmicConnection: { classification: "Cosmic kind or classification", relationshipType: "Original relationship type", conditions: "Authored access or relationship conditions", reliability: "Reliability and uncertainty", interpretations: "Competing interpretations", provenance: "Evidence and attributed sources" },
} as const;

export const cosmicMilestoneTypes = ["creation", "formation", "first observation", "discovery", "appearance", "cosmic collision", "planar convergence", "divine manifestation", "portal opens", "connection closes", "transformation", "destruction", "reformation", "disappearance"];
export const cosmicRelationshipFamilies = ["cosmicPrinciple", "cosmicConnection"] as const;
export function isCosmologyFamily(family: string): family is keyof typeof cosmologyFamilies { return Object.hasOwn(cosmologyFamilies, family); }

export function cosmologyFieldHelp(key: string): string {
  const help: Record<string, string> = {
    classification: "Choose a suggested kind or write your own. This saved category is searchable; it imposes no hierarchy, astronomy or physical rules.",
    scale: "Optionally describe size or scale in your own units, or explain why measurement has no meaning. No numerical value is required.",
    mass: "Optionally describe mass, including your own units or impossible properties. No Earth-like default or calculation is applied.",
    gravity: "Describe any gravity, lack of gravity or original behavior. This account does not change gameplay rules.",
    rotation: "Describe rotation if it applies. This does not calculate cycles or change calendars.",
    orbit: "Describe an orbit, suspension or another arrangement. Link the other saved bodies under participants; no orbital mechanics are computed.",
    satellites: "Describe satellites and link actual saved moons or other identities under participants. Names in prose do not create relationships.",
    time: "Describe timelessness, reversed time or another behavior. Link a saved principle if useful; canonical World years and calendar conversions stay unchanged.",
    scope: "Describe the claimed scope and select the saved frameworks, realms, bodies or Atlas places it concerns. Periods can retain historical scope; the selected timeline retains its interpretation.",
    statement: "Write the claimed physical or metaphysical law. Several laws may conflict; the software records claims without enforcing them.",
    relationshipType: "Describe containment, overlap, origin, reflection, a gateway or your own relationship. Participant roles identify origins, destinations and observers; several destinations and cycles are allowed.",
    conditions: "Record original conditions or claims. This is authored information and does not create Character movement, Campaign travel or a usable VTT portal.",
    hiddenAccess: "Write confidential access knowledge. This field starts protected; protect the whole realm if its name or existence is secret.",
    provenance: "Attribute observers, historical sources and evidence. Use saved participants for existing people, beliefs or organizations; contradictory accounts can coexist in one timeline.",
    origins: "Describe attributed origin interpretations without deciding objective truth. Create separate saved cosmic accounts when several perspectives need their own identities and references.",
    development: "Describe transformations. Only an explicitly authored milestone creates History; creation, observation and discovery are different events.",
  };
  return help[key] ?? "Optional authored information about this reality. Physical form, ordinary distance, measurable numbers, a solar system and a Campaign are unnecessary. Leave irrelevant fields blank or add an original custom section.";
}
