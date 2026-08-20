export type OpportunityType =
  | "tender"
  | "quotation"
  | "eoi"
  | "grant"
  | "project-pipeline"
  | "planning-application"
  | "supplier-registration"
  | "subcontract"
  | "partnership"
  | "private-project"
  | "award";

export type Jurisdiction =
  | "Commonwealth"
  | "NSW"
  | "VIC"
  | "QLD"
  | "WA"
  | "SA"
  | "TAS"
  | "ACT"
  | "NT"
  | "Local"
  | "Private";

export type OpportunityStage =
  | "signal"
  | "planning"
  | "funding"
  | "pre-procurement"
  | "open"
  | "evaluation"
  | "awarded"
  | "delivery";

export interface OpportunityLocation {
  state?: string;
  council?: string;
  suburb?: string;
  latitude?: number;
  longitude?: number;
}

export interface OpportunityDocument {
  title: string;
  url: string;
  documentType?: string;
  publishedAt?: string;
}

export interface OpportunityProvenance {
  fetchedAt: string;
  sourcePublishedAt?: string;
  extractionMethod: "api" | "rss" | "csv" | "html" | "manual";
  confidence: number;
  accessMethod?: string;
  termsChecked?: boolean;
}

export interface AustraliaOpportunity {
  id: string;
  sourceName: string;
  sourceUrl: string;
  sourceOpportunityId?: string;

  title: string;
  description?: string;

  opportunityType: OpportunityType;
  jurisdiction: Jurisdiction;
  locations: OpportunityLocation[];

  buyer?: string;
  developer?: string;
  principalContractor?: string;

  sectors: string[];
  categories: string[];
  keywords: string[];

  publishedAt?: string;
  closesAt?: string;
  expectedProcurementAt?: string;
  expectedConstructionAt?: string;

  estimatedValueMin?: number;
  estimatedValueMax?: number;
  currency?: "AUD";

  stage: OpportunityStage;
  eligibility?: string[];
  mandatoryRequirements?: string[];
  documents?: OpportunityDocument[];

  provenance: OpportunityProvenance;
}

export type OpportunityScoreKey =
  | "geotechRelevance"
  | "capabilityMatch"
  | "commercialValue"
  | "procurementReadiness"
  | "relationshipStrength"
  | "clientPriority"
  | "competitivePosition"
  | "bundleFit"
  | "locationFit"
  | "sourceQuality";

export interface OpportunityAssessment {
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
  weightedScore: number;
  adjustments: { points: number; reason: string }[];
  overall: number;
  decisionQueue: "Pursue" | "Watch" | "Archive";
}

export interface OpportunitySignal {
  id: string;
  label: string;
  kind: "budget" | "planning" | "approval" | "procurement" | "award" | "relationship";
  sourceName: string;
  observedAt: string;
  status: "verified" | "corroborated" | "watching";
  opportunityId?: string;
}
