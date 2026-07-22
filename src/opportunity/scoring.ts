import type { OpportunityAssessment } from "./schema";

export interface ScoringInputs {
  strategicFit: number;
  winProbability: number;
  revenuePotential: number;
  timing: number;
  relationshipPathway: number;
  evidenceConfidence: number;
}

const weights = {
  strategicFit: 0.3,
  winProbability: 0.2,
  revenuePotential: 0.15,
  timing: 0.15,
  relationshipPathway: 0.1,
  evidenceConfidence: 0.1,
} as const;

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreOpportunity(input: ScoringInputs): OpportunityAssessment {
  const scores = {
    strategicFit: bounded(input.strategicFit),
    winProbability: bounded(input.winProbability),
    revenuePotential: bounded(input.revenuePotential),
    timing: bounded(input.timing),
    relationshipPathway: bounded(input.relationshipPathway),
    evidenceConfidence: bounded(input.evidenceConfidence),
  };

  return {
    ...scores,
    overall: Math.round(
      scores.strategicFit * weights.strategicFit +
        scores.winProbability * weights.winProbability +
        scores.revenuePotential * weights.revenuePotential +
        scores.timing * weights.timing +
        scores.relationshipPathway * weights.relationshipPathway +
        scores.evidenceConfidence * weights.evidenceConfidence,
    ),
  };
}

export const scoringWeights = [
  { key: "strategicFit", label: "Strategic fit", weight: "30%" },
  { key: "winProbability", label: "Win probability", weight: "20%" },
  { key: "revenuePotential", label: "Revenue potential", weight: "15%" },
  { key: "timing", label: "Timing", weight: "15%" },
  { key: "relationshipPathway", label: "Relationship pathway", weight: "10%" },
  { key: "evidenceConfidence", label: "Evidence confidence", weight: "10%" },
] as const;
