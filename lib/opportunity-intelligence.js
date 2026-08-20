const STRONG_A = [
  ["geotechnical investigation", /\bgeotech(?:nical)?.{0,35}\binvestigations?\b/i],
  ["ground investigation", /\bground investigation\b/i],
  ["rock coring", /\brock cor(?:e|ing)\b/i],
  ["CPT/CPTu", /\bcptu?\b|\bcone penetration\b/i],
  ["plate load test", /\bplate load tests?\b/i],
  ["subsurface investigation", /\bsub[ -]?surface investigation\b/i],
];

const CONTEXT_A = [
  ["drilling", /\bdrill(?:ing|holes?| rigs?)\b/i],
  ["boreholes", /\bbore[ -]?holes?\b/i],
  ["piezometers", /\bpiezometers?\b/i],
];

const GROUND_CONTEXT = [
  ["geotechnical", /\bgeotechnical\b/i],
  ["soil", /\bsoils?\b/i],
  ["rock", /\brock\b/i],
  ["subsurface", /\bsub[ -]?surface\b/i],
  ["foundation", /\bfoundations?\b/i],
  ["pavement", /\bpavements?\b/i],
];

const TIER_B = [
  ["geotechnical services", /\bgeotech(?:nical)?.{0,30}\b(?:services?|consultancy|consultants?|advisory|advice|assessments?|tests?|testing|inspections?|surveys?|support|engineers?)\b/i],
  ["DCP", /\bdynamic cone penetrometer\b|\bdcp (?:testing|tests?|investigation)\b/i],
  ["soil testing", /\bsoil (?:laboratory )?testing\b/i],
  ["rock testing", /\brock (?:laboratory )?testing\b/i],
  ["test pits", /\btest pits?\b/i],
  ["pavement investigation", /\bpavement (?:condition |geotechnical )?investigation\b/i],
  ["slope stability", /\bslope stability\b/i],
  ["geohazard assessment", /\b(?:(?:geohazards?|landslides?|rockfalls?|slope instability).{0,45}(?:assessment|investigation|analysis|review|risk|stability|geotechnical)|(?:assessment|investigation|analysis|review|risk|stability|geotechnical).{0,45}(?:geohazards?|landslides?|rockfalls?|slope instability))\b/i],
  ["groundwater monitoring", /\bgroundwater (?:level )?monitoring\b/i],
  ["geophysical investigation", /\bgeophysical (?:investigation|survey|services?)\b/i],
  ["construction materials testing", /\b(?:(?:construction|civil|pavement|soil|rock|structures?) (?:and )?materials testing|materials testing.{0,35}(?:construction|civil|pavement|soil|rock|structures?))\b/i],
  ["foundation assessment", /\bfoundation (?:assessment|design)\b/i],
];

const HARD_EXCLUSIONS = [
  ["acoustic assessment", /\bacoustic assessment\b/i],
  ["traffic survey", /\btraffic survey\b/i],
  ["cadastral survey", /\bcadastral survey\b/i],
  ["arborist report", /\barborist report\b/i],
];

const CONTEXTUAL_EXCLUSIONS = [
  ["contaminated site investigation", /\bcontaminated site investigation\b/i],
  ["contamination scope", /\bcontaminat(?:ed|ion)\b/i],
  ["environmental drilling", /\benvironmental drilling\b/i],
  ["groundwater contamination", /\bgroundwater contamination\b/i],
  ["supply-only scope", /\b(?:consumables?|spare parts?|equipment hire|supply and deliver|replacement parts?)\b/i],
  ["geological research drilling", /\b(?:chemostratigraphic|sedimentary|mineral exploration|borehole logging system|gamma logging)\b/i],
];

const CAPABILITY_REQUIREMENTS = [
  ["Borehole drilling", /\bbore[ -]?holes?\b|\bgeotechnical drilling\b/i],
  ["Rock coring", /\brock cor(?:e|ing)\b|\bcore drilling\b/i],
  ["CPT", /\bcptu?\b|\bcone penetration\b/i],
  ["DCP", /\bdynamic cone penetrometer\b|\bdcp\b/i],
  ["SPT", /\bstandard penetration test\b|\bspt\b/i],
  ["Groundwater wells", /\bpiezometers?\b|\bmonitoring wells?\b/i],
  ["Geotechnical reporting", /\bgeotechnical (?:report|reporting|design)\b/i],
  ["Footing inspections", /\bfooting inspections?\b/i],
  ["Pavement investigation", /\bpavement (?:condition |geotechnical )?investigation\b/i],
  ["Slope stability", /\bslope stability\b/i],
  ["Marine geotech", /\bmarine geotech(?:nical)?\b/i],
  ["Offshore drilling", /\boffshore drilling\b/i],
  ["Specialist seismic", /\bseismic (?:survey|testing|investigation)\b/i],
];

export const DEFAULT_CAPABILITY_MATRIX = Object.freeze({
  "Borehole drilling": "YES",
  "Rock coring": "YES",
  CPT: "YES",
  DCP: "YES",
  SPT: "YES",
  "Groundwater wells": "YES",
  "Geotechnical reporting": "YES",
  "Footing inspections": "YES",
  "Pavement investigation": "YES",
  "Slope stability": "MAYBE",
  "Marine geotech": "NO",
  "Offshore drilling": "NO",
  "Specialist seismic": "NO",
});

const CAPABILITY_VALUES = { YES: 100, MAYBE: 60, NO: 0, UNKNOWN: 50 };

export const OPPORTUNITY_WEIGHTS = Object.freeze({
  geotechRelevance: 0.25,
  capabilityMatch: 0.17,
  commercialValue: 0.14,
  procurementReadiness: 0.12,
  relationshipStrength: 0.09,
  clientPriority: 0.07,
  competitivePosition: 0.06,
  bundleFit: 0.04,
  locationFit: 0.03,
  sourceQuality: 0.03,
});

function bounded(value, fallback = 50) {
  const numeric = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : fallback)));
}

function matched(text, rules) {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function unique(values) {
  return [...new Set(values)];
}

export function classifyGeotechTier(record) {
  const text = [record.title, record.scope, record.description, record.category]
    .filter(Boolean)
    .join(". ");
  const strongHits = matched(text, STRONG_A);
  const contextHits = matched(text, CONTEXT_A);
  const groundHits = matched(text, GROUND_CONTEXT);
  const tierBHits = matched(text, TIER_B);
  const hardHits = matched(text, HARD_EXCLUSIONS);
  const contextualHits = matched(text, CONTEXTUAL_EXCLUSIONS);
  const contextualCoreHits = unique([
    ...strongHits,
    ...tierBHits,
    ...groundHits.filter((hit) => hit !== "geotechnical"),
  ]);
  const pairedContext = contextHits.length > 0 && groundHits.length > 0;
  const positiveKeywordHits = unique([...strongHits, ...contextHits, ...groundHits, ...tierBHits]);
  const negativeKeywordHits = unique([...hardHits, ...contextualHits]);
  let rejectionReason = null;

  if (hardHits.length) {
    rejectionReason = `Hard exclusion: ${hardHits.join(", ")}`;
  } else if (contextualHits.length && contextualCoreHits.length < 2) {
    rejectionReason = `Contextual exclusion without two core geotechnical signals: ${contextualHits.join(", ")}`;
  }

  let geoTier = "C";
  let geotechRelevanceScore = positiveKeywordHits.length ? 35 : 5;
  if (!rejectionReason && (strongHits.length || pairedContext)) {
    geoTier = "A";
    geotechRelevanceScore = Math.min(100, 82 + strongHits.length * 5 + tierBHits.length * 3 + (pairedContext ? 5 : 0));
  } else if (!rejectionReason && tierBHits.length) {
    geoTier = "B";
    geotechRelevanceScore = Math.min(79, 62 + tierBHits.length * 5 + groundHits.length * 2);
  } else if (rejectionReason) {
    geotechRelevanceScore = Math.min(24, positiveKeywordHits.length * 5);
  }

  return {
    geoTier,
    geotechRelevanceScore,
    rejectionReason,
    positiveKeywordHits,
    negativeKeywordHits,
    requiredCapabilities: matched(text, CAPABILITY_REQUIREMENTS),
    hardExclusionFlag: hardHits.length > 0,
    contextualExclusionFlag: contextualHits.length > 0,
  };
}

export function scoreCapabilityMatch(requiredCapabilities, capabilityMatrix = DEFAULT_CAPABILITY_MATRIX) {
  const requirements = unique(requiredCapabilities ?? []);
  if (!requirements.length) return { score: 50, capabilityGap: false, statuses: {} };
  const statuses = Object.fromEntries(requirements.map((name) => [name, capabilityMatrix[name] ?? "UNKNOWN"]));
  const values = Object.values(statuses).map((status) => CAPABILITY_VALUES[status] ?? CAPABILITY_VALUES.UNKNOWN);
  return {
    score: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    capabilityGap: Object.values(statuses).includes("NO"),
    statuses,
  };
}

export function scoreOpportunityComponents(input) {
  const components = {
    geotechRelevance: bounded(input.geotechRelevance),
    capabilityMatch: bounded(input.capabilityMatch),
    commercialValue: bounded(input.commercialValue, 35),
    procurementReadiness: bounded(input.procurementReadiness),
    relationshipStrength: bounded(input.relationshipStrength),
    clientPriority: bounded(input.clientPriority),
    competitivePosition: bounded(input.competitivePosition),
    bundleFit: bounded(input.bundleFit),
    locationFit: bounded(input.locationFit),
    sourceQuality: bounded(input.sourceQuality),
  };
  const adjustments = [];
  const apply = (condition, points, reason) => {
    if (condition) adjustments.push({ points, reason });
  };

  apply(input.strongIncumbent, -10, "Strong incumbent");
  apply(input.noRelationshipPathway, -6, "No relationship pathway");
  apply(input.singleSpecialistService, -5, "Single specialist service");
  apply(input.outsidePreferredGeography, -5, "Outside preferred geography");
  apply(input.planningOnly, -8, "Planning only");
  apply(input.weakSourceConfidence, -6, "Weak source confidence");
  apply(input.belowMinimumFee, -15, "Likely fee below threshold");
  apply(input.capabilityGap, -20, "Capability gap");
  apply(input.existingClient, 8, "Existing client");
  apply(input.knownContact, 5, "Known contact");
  apply(input.repeatBuyer, 5, "Repeat buyer");
  apply(input.rigUtilisationOpportunity, 6, "Rig utilisation opportunity");
  apply(input.turnkeyPackage, 8, "Drilling + lab + engineering package");
  apply(input.closingWithin14Days, 4, "Closing within 14 days");
  apply(input.earlyMoverSignal, 5, "Early mover signal");

  const weightedScore = Object.entries(OPPORTUNITY_WEIGHTS).reduce(
    (total, [key, weight]) => total + components[key] * weight,
    0,
  );
  const adjustmentTotal = adjustments.reduce((total, adjustment) => total + adjustment.points, 0);
  const opportunityScore = bounded(weightedScore + adjustmentTotal, 0);
  const decisionQueue = opportunityScore >= 80 ? "Pursue" : opportunityScore >= 65 ? "Watch" : "Archive";
  return { components, weightedScore: Math.round(weightedScore), adjustments, opportunityScore, decisionQueue };
}
