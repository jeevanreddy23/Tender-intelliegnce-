import type { OpportunityAssessment } from "./schema";

export interface ScoringInputs {
  geotechRelevance: number;
  capabilityMatch: number;
  commercialValue: number;
  procurementReadiness: number;
  relationshipStrength: number;
  clientPriority: number;
  competitivePosition: number;
  bundleFit: number;
  locationFit: number;
  sourceQuality: number;
  strongIncumbent?: boolean;
  noRelationshipPathway?: boolean;
  singleSpecialistService?: boolean;
  outsidePreferredGeography?: boolean;
  planningOnly?: boolean;
  weakSourceConfidence?: boolean;
  belowMinimumFee?: boolean;
  capabilityGap?: boolean;
  existingClient?: boolean;
  knownContact?: boolean;
  repeatBuyer?: boolean;
  rigUtilisationOpportunity?: boolean;
  turnkeyPackage?: boolean;
  closingWithin14Days?: boolean;
  earlyMoverSignal?: boolean;
}

const weights = {
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
} as const;

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreOpportunity(input: ScoringInputs): OpportunityAssessment {
  const components = {
    geotechRelevance: bounded(input.geotechRelevance),
    capabilityMatch: bounded(input.capabilityMatch),
    commercialValue: bounded(input.commercialValue),
    procurementReadiness: bounded(input.procurementReadiness),
    relationshipStrength: bounded(input.relationshipStrength),
    clientPriority: bounded(input.clientPriority),
    competitivePosition: bounded(input.competitivePosition),
    bundleFit: bounded(input.bundleFit),
    locationFit: bounded(input.locationFit),
    sourceQuality: bounded(input.sourceQuality),
  };
  const adjustments: { points: number; reason: string }[] = [];
  const apply = (condition: boolean | undefined, points: number, reason: string) => {
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
  const weightedScore = Object.entries(weights).reduce(
    (total, [key, weight]) => total + components[key as keyof typeof components] * weight,
    0,
  );
  const overall = bounded(weightedScore + adjustments.reduce((total, adjustment) => total + adjustment.points, 0));
  return {
    ...components,
    adjustments,
    weightedScore: Math.round(weightedScore),
    overall,
    decisionQueue: overall >= 80 ? "Pursue" : overall >= 65 ? "Watch" : "Archive",
  };
}

export const scoringWeights = [
  { key: "geotechRelevance", label: "Geotech relevance", weight: "25%" },
  { key: "capabilityMatch", label: "Capability match", weight: "17%" },
  { key: "commercialValue", label: "Commercial value", weight: "14%" },
  { key: "procurementReadiness", label: "Procurement readiness", weight: "12%" },
  { key: "relationshipStrength", label: "Relationship strength", weight: "9%" },
  { key: "clientPriority", label: "Client priority", weight: "7%" },
  { key: "competitivePosition", label: "Competitive position", weight: "6%" },
  { key: "bundleFit", label: "Bundle fit", weight: "4%" },
  { key: "locationFit", label: "Location fit", weight: "3%" },
  { key: "sourceQuality", label: "Source quality", weight: "3%" },
] as const;
