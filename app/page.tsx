"use client";

import { useMemo, useState } from "react";

import strategicSnapshot from "./data/strategic-insights.json";
import { buildPublicProfileQueries } from "../lib/contact-discovery.js";
import { classifyGeotechTier } from "../lib/opportunity-intelligence.js";
import { analyseScopeBundle } from "../lib/strategic-insights.js";
import type { AustraliaOpportunity, Jurisdiction, OpportunityStage, OpportunityType } from "../src/opportunity/schema";
import { scoreOpportunity as calculateOpportunityScore, scoringWeights } from "../src/opportunity/scoring";

type Opportunity = {
  id: string;
  name: string;
  stage: string;
  source: string;
  sector: string;
  state: string;
  location: string;
  client: string;
  builder: string;
  consultant: string;
  owner: string;
  value: number;
  geotechRevenue: [number, number];
  closeDate: string;
  constructionStart: string;
  relationship: number;
  competition: number;
  risk: number;
  strategic: number;
  travel: number;
  resourceFit: number;
  confidence: number;
  lastVerified: string;
  signals: string[];
  scope: string[];
  evidence: { title: string; source: string; age: string; confidence: string }[];
  contacts: { initials: string; name: string; role: string; strength: string }[];
  risks: { risk: string; response: string; level: "High" | "Medium" | "Low" }[];
  nextAction: string;
  sourceUrl?: string;
  opportunityType?: OpportunityType;
  jurisdiction?: Jurisdiction;
  normalizedStage?: OpportunityStage;
};

type Agent = {
  name: string;
  status: "Live" | "Learning" | "Queued";
  coverage: string;
  output: string;
};

const opportunities: Opportunity[] = [
  {
    id: "OP-2418",
    name: "Parramatta Civic Quarter towers",
    stage: "DA approved",
    source: "Council planning portal",
    sector: "Residential mixed use",
    state: "NSW",
    location: "Parramatta, NSW",
    client: "Harbourline Developments",
    builder: "TBA",
    consultant: "Northrop",
    owner: "M. Chen",
    value: 185000000,
    geotechRevenue: [45000, 70000],
    closeDate: "Contact window: 48 hours",
    constructionStart: "Q2 2027",
    relationship: 62,
    competition: 44,
    risk: 38,
    strategic: 81,
    travel: 88,
    resourceFit: 78,
    confidence: 86,
    lastVerified: "Today, 08:42",
    signals: [
      "150 apartments approved",
      "Two basement levels",
      "SMEC used on prior client project",
      "Flood planning note attached",
    ],
    scope: [
      "8 boreholes",
      "4 CPTs",
      "Groundwater monitoring",
      "Contamination screening",
      "Pile design parameters",
      "Acid sulfate soil assessment",
    ],
    evidence: [
      { title: "Determination of consent", source: "City of Parramatta", age: "2h", confidence: "Verified" },
      { title: "Basement excavation note", source: "Planning attachment", age: "2h", confidence: "Verified" },
      { title: "Early-works procurement signal", source: "Relationship CRM", age: "1d", confidence: "Corroborated" },
    ],
    contacts: [
      { initials: "HP", name: "H. Patel", role: "Development Director", strength: "Warm" },
      { initials: "JM", name: "J. Murray", role: "Civil lead, Northrop", strength: "Known" },
      { initials: "MC", name: "M. Chen", role: "STS pursuit owner", strength: "Internal" },
    ],
    risks: [
      { risk: "Early works consultant may be pre-aligned", response: "Use Northrop relationship to confirm procurement route.", level: "High" },
      { risk: "Flood and groundwater scope can expand", response: "Offer staged investigation with an approval gate.", level: "Medium" },
      { risk: "Builder appointment unknown", response: "Keep client-side brief independent of contractor assumptions.", level: "Low" },
    ],
    nextAction: "Send developer briefing and ask who is leading early works procurement.",
  },
  {
    id: "OP-2422",
    name: "Hunter bridge renewal package",
    stage: "Pre-tender notice",
    source: "Transport NSW pipeline",
    sector: "Roads and bridges",
    state: "NSW",
    location: "Maitland, NSW",
    client: "Transport for NSW",
    builder: "Likely Fulton Hogan",
    consultant: "GHD",
    owner: "S. Wilcox",
    value: 420000000,
    geotechRevenue: [140000, 210000],
    closeDate: "Tender forecast: Oct 2026",
    constructionStart: "Q3 2027",
    relationship: 54,
    competition: 61,
    risk: 43,
    strategic: 92,
    travel: 74,
    resourceFit: 84,
    confidence: 79,
    lastVerified: "Today, 07:15",
    signals: ["Bridge concept design released", "Rock excavation likely", "Creek crossing access constraints", "Historical flood study updated"],
    scope: ["Rock coring", "Bridge footing investigation", "Slope stability", "Laboratory strength testing", "Instrumentation plan", "Temporary works advice"],
    evidence: [
      { title: "Infrastructure pipeline entry", source: "Transport for NSW", age: "6h", confidence: "Verified" },
      { title: "Concept design issue", source: "Project document register", age: "1d", confidence: "Verified" },
      { title: "Builder interest pattern", source: "Competitor monitor", age: "3d", confidence: "Indicative" },
    ],
    contacts: [
      { initials: "RS", name: "R. Singh", role: "Transport client contact", strength: "Warm" },
      { initials: "AL", name: "A. Lee", role: "Geotechnical lead, GHD", strength: "Known" },
      { initials: "SW", name: "S. Wilcox", role: "STS pursuit owner", strength: "Internal" },
    ],
    risks: [
      { risk: "Strong incumbent transport competitors", response: "Lead with constrained-access bridge investigation examples.", level: "High" },
      { risk: "Fieldwork access window uncertain", response: "Price a mobilised crew and alternate possession plan.", level: "Medium" },
      { risk: "Forecast timing may move", response: "Retain monthly watch and update influence plan.", level: "Low" },
    ],
    nextAction: "Prepare capability pack for bridge investigations and request consultant intro.",
  },
  {
    id: "OP-2427",
    name: "Western Sydney logistics estate",
    stage: "Land acquisition",
    source: "Property transaction monitor",
    sector: "Industrial",
    state: "NSW",
    location: "Kemps Creek, NSW",
    client: "Axis Industrial",
    builder: "Richard Crookes Construction",
    consultant: "Arcadis",
    owner: "M. Chen",
    value: 310000000,
    geotechRevenue: [85000, 130000],
    closeDate: "No tender yet",
    constructionStart: "Q4 2027",
    relationship: 76,
    competition: 39,
    risk: 35,
    strategic: 88,
    travel: 91,
    resourceFit: 73,
    confidence: 74,
    lastVerified: "Yesterday, 16:24",
    signals: ["Developer acquired 19 ha site", "Warehouse zoning uplift lodged", "STS completed 3 previous sheds nearby", "Likely heavy pavement program"],
    scope: ["DCP grid", "CBR testing", "Plate load tests", "Pavement design inputs", "Earthworks validation", "Imported fill assessment"],
    evidence: [
      { title: "Property transaction notice", source: "Market monitor", age: "1d", confidence: "Corroborated" },
      { title: "Zoning uplift application", source: "NSW planning portal", age: "3d", confidence: "Verified" },
      { title: "Nearby STS project history", source: "Relationship CRM", age: "5d", confidence: "Verified" },
    ],
    contacts: [
      { initials: "CB", name: "C. Brown", role: "Development Manager", strength: "Warm" },
      { initials: "AG", name: "A. Green", role: "Project lead, Arcadis", strength: "Known" },
      { initials: "MC", name: "M. Chen", role: "STS pursuit owner", strength: "Internal" },
    ],
    risks: [
      { risk: "Design brief remains unformed", response: "Offer an early risk workshop rather than a fixed scope.", level: "Medium" },
      { risk: "Pavement scope may be split", response: "Position STS as one ground-data source for all packages.", level: "Medium" },
      { risk: "Land settlement dependencies", response: "Track settlement milestones through planning monitor.", level: "Low" },
    ],
    nextAction: "Ask relationship owner to book a pre-design geotech risk workshop.",
  },
  {
    id: "OP-2434",
    name: "Illawarra battery energy storage system",
    stage: "EIS exhibition",
    source: "Major projects portal",
    sector: "Renewables",
    state: "NSW",
    location: "Dapto, NSW",
    client: "Southern Grid Storage",
    builder: "TBA EPC",
    consultant: "WSP",
    owner: "E. Dawson",
    value: 260000000,
    geotechRevenue: [60000, 95000],
    closeDate: "Planning response: Sep 2026",
    constructionStart: "Q1 2028",
    relationship: 41,
    competition: 58,
    risk: 49,
    strategic: 86,
    travel: 67,
    resourceFit: 69,
    confidence: 71,
    lastVerified: "Yesterday, 13:08",
    signals: ["Substation tie-in noted", "Slope stability concerns", "Bushfire access upgrades", "Possible shallow groundwater"],
    scope: ["Boreholes at inverter pads", "Electrical trench assessment", "Slope stability review", "Permeability tests", "Aggressivity testing", "Construction traffic pavements"],
    evidence: [
      { title: "EIS exhibition notice", source: "NSW major projects", age: "1d", confidence: "Verified" },
      { title: "Geology and hazards appendix", source: "EIS attachments", age: "1d", confidence: "Verified" },
      { title: "EPC market watch", source: "Competitor monitor", age: "4d", confidence: "Indicative" },
    ],
    contacts: [
      { initials: "ED", name: "E. Dawson", role: "STS pursuit owner", strength: "Internal" },
      { initials: "KS", name: "K. Singh", role: "Energy lead, WSP", strength: "Cold" },
      { initials: "MP", name: "M. Park", role: "Grid development contact", strength: "Known" },
    ],
    risks: [
      { risk: "EPC selection may be offshore-led", response: "Prepare a local ground-risk briefing for the asset owner.", level: "High" },
      { risk: "Slope scope needs specialist review", response: "Line up partner capacity before outreach.", level: "Medium" },
      { risk: "Long programme to construction", response: "Maintain a light-touch quarterly cadence.", level: "Low" },
    ],
    nextAction: "Track EPC shortlist and build renewables geotech evidence pack.",
  },
  {
    id: "OP-2441",
    name: "Gold Coast health precinct expansion",
    stage: "Budget allocation",
    source: "Health infrastructure capital works",
    sector: "Health",
    state: "QLD",
    location: "Southport, QLD",
    client: "Queensland Health",
    builder: "TBA",
    consultant: "Aurecon",
    owner: "T. Nguyen",
    value: 520000000,
    geotechRevenue: [120000, 190000],
    closeDate: "Tender forecast: Jan 2027",
    constructionStart: "Q4 2027",
    relationship: 35,
    competition: 66,
    risk: 57,
    strategic: 79,
    travel: 42,
    resourceFit: 58,
    confidence: 67,
    lastVerified: "Yesterday, 10:11",
    signals: ["Capital allocation published", "Clinical services plan complete", "Basement and services tunnel likely", "High stakeholder complexity"],
    scope: ["Deep boreholes", "Groundwater monitoring", "Retention advice", "Contamination investigation", "Vibration monitoring", "Foundation options study"],
    evidence: [
      { title: "Capital programme allocation", source: "Queensland Health", age: "1d", confidence: "Verified" },
      { title: "Clinical services plan", source: "Public project library", age: "7d", confidence: "Corroborated" },
      { title: "QLD delivery capacity check", source: "STS resourcing", age: "1d", confidence: "Verified" },
    ],
    contacts: [
      { initials: "TN", name: "T. Nguyen", role: "STS pursuit owner", strength: "Internal" },
      { initials: "PA", name: "P. Adams", role: "Health infrastructure contact", strength: "Cold" },
      { initials: "SL", name: "S. Lewis", role: "Project lead, Aurecon", strength: "Known" },
    ],
    risks: [
      { risk: "Queensland delivery capability is limited", response: "Decide a delivery partner before bid influence begins.", level: "High" },
      { risk: "Heavy incumbent consultant presence", response: "Use an early differentiator around tunnel groundwater risk.", level: "High" },
      { risk: "Multiple approval stakeholders", response: "Map the decision chain before committing bid cost.", level: "Medium" },
    ],
    nextAction: "Qualify whether QLD partner capacity is available before pursuit.",
  },
  {
    id: "OP-2446",
    name: "Regional school renewal bundle",
    stage: "Tender open",
    source: "VendorPanel",
    sector: "Education",
    state: "NSW",
    location: "Dubbo, Orange, Bathurst",
    client: "School Infrastructure NSW",
    builder: "TBA",
    consultant: "Meinhardt",
    owner: "R. Hall",
    value: 95000000,
    geotechRevenue: [30000, 52000],
    closeDate: "Closes 31 Jul 2026",
    constructionStart: "Q1 2027",
    relationship: 58,
    competition: 53,
    risk: 31,
    strategic: 64,
    travel: 55,
    resourceFit: 86,
    confidence: 91,
    lastVerified: "Today, 09:06",
    signals: ["Bundle of 7 schools", "Fast turnaround required", "Repeat agency scope pattern", "Regional crew availability good"],
    scope: ["Shallow boreholes", "DCP testing", "Waste classification", "Pavement CBR", "Site classification", "Short-form factual reports"],
    evidence: [
      { title: "Tender notice and schedules", source: "VendorPanel", age: "1h", confidence: "Verified" },
      { title: "Conditions of tendering", source: "Tender package", age: "1h", confidence: "Verified" },
      { title: "Comparable STS delivery history", source: "Project archive", age: "2d", confidence: "Verified" },
    ],
    contacts: [
      { initials: "RH", name: "R. Hall", role: "STS pursuit owner", strength: "Internal" },
      { initials: "DW", name: "D. Wong", role: "Agency procurement contact", strength: "Known" },
      { initials: "EL", name: "E. Long", role: "Regional operations lead", strength: "Internal" },
    ],
    risks: [
      { risk: "Seven-site programme compression", response: "Price two simultaneous field crews and staged reporting.", level: "Medium" },
      { risk: "Scope comparison may favour lowest price", response: "Make assumptions and delivered outputs easy to compare.", level: "Medium" },
      { risk: "Travel costs can erode margin", response: "Lock crew plan and accommodation allowances early.", level: "Low" },
    ],
    nextAction: "Generate fixed-fee proposal with alternate schedule for simultaneous crews.",
  },
];

const stageMap: Record<string, OpportunityStage> = {
  "DA approved": "planning",
  "Pre-tender notice": "pre-procurement",
  "Land acquisition": "signal",
  "EIS exhibition": "planning",
  "Budget allocation": "funding",
  "Tender open": "open",
};

const opportunityTypeMap: Record<string, OpportunityType> = {
  "Council planning portal": "planning-application",
  "Transport NSW pipeline": "project-pipeline",
  "Property transaction monitor": "private-project",
  "Major projects portal": "planning-application",
  "Health infrastructure capital works": "project-pipeline",
  VendorPanel: "tender",
};

const sourceUrlMap: Record<string, string> = {
  "Council planning portal": "https://www.planningportal.nsw.gov.au/",
  "Transport NSW pipeline": "https://www.transport.nsw.gov.au/projects",
  "Property transaction monitor": "https://www.planningportal.nsw.gov.au/",
  "Major projects portal": "https://www.planningportal.nsw.gov.au/major-projects",
  "Health infrastructure capital works": "https://www.infrastructure.nsw.gov.au/",
  VendorPanel: "https://www.vendorpanel.com.au/",
};

const normalizedOpportunities: AustraliaOpportunity[] = opportunities.map((item) => ({
  id: item.id,
  sourceName: item.source,
  sourceUrl: sourceUrlMap[item.source] ?? "https://www.nsw.gov.au/",
  title: item.name,
  description: `${item.name} is a ${item.sector.toLowerCase()} opportunity in ${item.location}.`,
  opportunityType: opportunityTypeMap[item.source] ?? "private-project",
  jurisdiction: item.state as Jurisdiction,
  locations: [{ state: item.state, suburb: item.location.split(",")[0] }],
  buyer: item.client,
  principalContractor: item.builder === "TBA" ? undefined : item.builder,
  sectors: [item.sector],
  categories: item.scope.slice(0, 3),
  keywords: item.signals,
  expectedConstructionAt: item.constructionStart,
  estimatedValueMin: item.value,
  estimatedValueMax: item.value,
  currency: "AUD",
  stage: stageMap[item.stage] ?? "signal",
  documents: item.evidence.map((evidence) => ({ title: evidence.title, url: sourceUrlMap[item.source] ?? "https://www.nsw.gov.au/" })),
  provenance: {
    fetchedAt: "2026-07-22T09:15:00+10:00",
    extractionMethod: "manual",
    confidence: item.confidence,
    accessMethod: "public source snapshot",
    termsChecked: true,
  },
}));

const agents: Agent[] = [
  { name: "Tender crawler", status: "Live", coverage: "AusTender, VendorPanel, TenderLink, NSW Buy", output: "16 new tender signals" },
  { name: "Planning approval crawler", status: "Live", coverage: "Council DA, SSD, SSI, EIS, rezoning", output: "42 approval changes" },
  { name: "Developer tracker", status: "Live", coverage: "Land purchases, repeat clients, strategic sites", output: "9 pre-tender leads" },
  { name: "Document reader", status: "Learning", coverage: "PDF, Word, drawings, specs, BOQ", output: "6 scopes extracted" },
  { name: "Proposal generator", status: "Queued", coverage: "Methodology, assumptions, price schedule", output: "3 draft packs ready" },
  { name: "Competitor tracker", status: "Learning", coverage: "SMEC, GHD, WSP, Douglas Partners, Arcadis", output: "11 client overlaps" },
];

const competitors = [
  { name: "SMEC", movement: "Transport and high-rise repeat work", heat: 72 },
  { name: "GHD", movement: "Bridge package influence rising", heat: 68 },
  { name: "WSP", movement: "Renewables approvals visible", heat: 61 },
  { name: "Douglas Partners", movement: "Sydney apartment work steady", heat: 55 },
];

const workflow = [
  { step: "Confirm procurement route", owner: "M. Chen", due: "Today", state: "Ready" },
  { step: "Send ground-risk briefing", owner: "M. Chen", due: "Tomorrow", state: "Ready" },
  { step: "Secure consultant intelligence", owner: "J. Murray", due: "15 Jul", state: "Watching" },
  { step: "Price staged investigation", owner: "Bid team", due: "On trigger", state: "Blocked" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function shortMoney(value: number) {
  if (value >= 1000000) return `$${Math.round(value / 1000000)}m`;
  return `$${Math.round(value / 1000)}k`;
}

function timingScore(opportunity: Opportunity) {
  if (["Land acquisition", "Budget allocation"].includes(opportunity.stage)) return 92;
  if (["DA approved", "EIS exhibition"].includes(opportunity.stage)) return 84;
  if (opportunity.stage === "Pre-tender notice") return 76;
  return 62;
}

function scoreOpportunity(opportunity: Opportunity) {
  const scope = opportunity.scope.join(". ");
  const classification = classifyGeotechTier({ title: opportunity.name, scope });
  const bundle = analyseScopeBundle({ title: opportunity.name, scope });
  const assessment = calculateOpportunityScore({
    geotechRelevance: classification.geotechRelevanceScore,
    capabilityMatch: opportunity.resourceFit,
    commercialValue: Math.min(100, opportunity.geotechRevenue[1] / 2_000),
    procurementReadiness: timingScore(opportunity),
    relationshipStrength: opportunity.relationship,
    clientPriority: opportunity.strategic,
    competitivePosition: 100 - opportunity.competition,
    bundleFit: bundle.isTurnkey ? 95 : bundle.isBundled ? 75 : 35,
    locationFit: opportunity.travel,
    sourceQuality: opportunity.confidence,
    strongIncumbent: opportunity.competition >= 65,
    noRelationshipPathway: opportunity.relationship < 45,
    singleSpecialistService: !bundle.isBundled,
    outsidePreferredGeography: opportunity.travel < 50,
    planningOnly: ["Land acquisition", "Budget allocation"].includes(opportunity.stage),
    weakSourceConfidence: opportunity.confidence < 65,
    belowMinimumFee: opportunity.geotechRevenue[1] < 20_000,
    capabilityGap: opportunity.resourceFit < 50,
    existingClient: opportunity.relationship >= 70,
    knownContact: opportunity.contacts.some((contact) => contact.strength === "Warm"),
    repeatBuyer: opportunity.signals.some((signal) => /previous|repeat|prior/i.test(signal)),
    rigUtilisationOpportunity: /borehole|drilling|rock coring/i.test(scope),
    turnkeyPackage: bundle.isTurnkey,
    closingWithin14Days: opportunity.stage === "Tender open",
    earlyMoverSignal: !["Tender open", "Pre-tender notice"].includes(opportunity.stage),
  });
  return { ...assessment, geoTier: classification.geoTier as "A" | "B" | "C" };
}

function scoreClass(score: number) {
  if (score >= 80) return "hot";
  if (score >= 65) return "warm";
  return "watch";
}

export default function Home() {
  const [activeId, setActiveId] = useState("OP-2422");
  const [queueFilter, setQueueFilter] = useState<"Pursue" | "Watch" | "Archive">("Pursue");
  const [stageFilter, setStageFilter] = useState("All");
  const [detailView, setDetailView] = useState<"intel" | "pursuit">("intel");
  const [briefOpen, setBriefOpen] = useState(false);
  const [proposalReady, setProposalReady] = useState(false);
  const [feedbackChoice, setFeedbackChoice] = useState<"Pursue" | "Watch" | "Pass" | null>(null);
  const [passReason, setPassReason] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const ranked = useMemo(() => opportunities.map((opportunity) => {
    const assessment = scoreOpportunity(opportunity);
    return { ...opportunity, assessment, score: assessment.overall };
  }).sort((a, b) => b.score - a.score), []);
  const stages = ["All", ...Array.from(new Set(ranked.map((item) => item.stage)))];
  const queued = ranked.filter((item) => item.assessment.decisionQueue === queueFilter);
  const visible = stageFilter === "All" ? queued : queued.filter((item) => item.stage === stageFilter);
  const active = ranked.find((item) => item.id === activeId) ?? ranked[0];
  const pursuitPipeline = ranked.filter((item) => item.assessment.decisionQueue === "Pursue").reduce((total, item) => total + item.geotechRevenue[1], 0);
  const early = ranked.filter((item) => !["Tender open", "Pre-tender notice"].includes(item.stage)).length;
  const highPriority = ranked.filter((item) => item.assessment.decisionQueue === "Pursue").length;
  const tones = ["gold", "green", "ink", "blue", "red", "green", "blue", "gold", "ink", "green"];
  const drivers = scoringWeights.map((driver, index) => ({
    ...driver,
    value: active.assessment[driver.key],
    tone: tones[index],
  }));
  const signalChain = active.signals.slice(0, 4).map((signal, index) => ({
    label: ["Funding / intent", "Planning / approval", "Procurement route", "Delivery pathway"][index],
    signal,
    state: index === active.signals.slice(0, 4).length - 1 ? "Current" : "Verified",
  }));
  const activeBundle = analyseScopeBundle({ title: active.name, scope: active.scope.join(". ") });
  const publicProfileSearches = buildPublicProfileQueries({
    company: active.consultant,
    agency: active.client,
    project: active.name,
    location: active.location,
    roles: ["Geotechnical Lead", "Project Director", "Estimating Manager"],
  });
  const snapshotDate = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(strategicSnapshot.generatedAt));
  const bundledBuyerSegment = strategicSnapshot.buyerSegments.find((segment) => segment.label === "Bundled program buyers");

  async function submitFeedback(decision: "Pursue" | "Watch" | "Pass", reasonCategory?: string) {
    setFeedbackChoice(decision);
    setFeedbackStatus("saving");
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenderId: active.id,
        decision,
        reasonCategory: reasonCategory || null,
        scoreAtDecision: active.score,
        tierAtDecision: active.assessment.geoTier,
        modelVersion: "contextual-rules-2.0.0",
      }),
    });
    setFeedbackStatus(response.ok ? "saved" : "error");
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <nav className="topbar" aria-label="Primary">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">STS</span>
            <div>
              <p className="eyebrow">GeoFlow opportunity intelligence</p>
              <h1>Australia Opportunity Radar</h1>
            </div>
          </div>
          <div className="nav-actions">
            <button aria-pressed={briefOpen} className={briefOpen ? "active-action" : ""} onClick={() => setBriefOpen((value) => !value)} type="button">
              {briefOpen ? "Brief open" : "Daily brief"}
            </button>
            <button className="primary-action" onClick={() => setProposalReady(true)} type="button">
              {proposalReady ? "Proposal pack ready" : "Generate proposal"}
            </button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="kicker">NSW construction and professional services radar</p>
            <h2>Find Australian work before it becomes an obvious tender.</h2>
            <p>Link planning, funding, procurement, buyer, and contractor signals into one commercial project thread — then give each pursuit a next action.</p>
          </div>
          <div className="command-panel" aria-label="Today summary">
            <div><span>Live opportunities</span><strong>{normalizedOpportunities.length}</strong><small>normalised records in the Australian demo slice</small></div>
            <div><span>Pursuit pipeline</span><strong>{shortMoney(pursuitPipeline)}</strong><small>upper fee range in the Pursue queue</small></div>
            <div><span>Early signal projects</span><strong>{early}</strong><small>before a formal tender appears</small></div>
            <div><span>Priority today</span><strong>{highPriority}</strong><small>auditable scores of 80 or above</small></div>
          </div>
        </div>
      </section>

      {briefOpen && (
        <section className="brief-strip" aria-label="Daily brief">
              <div><span className="brief-label">Daily brief</span><strong>Two planning movements, one open tender, and three relationship-led actions ready for owners.</strong></div>
          <span className="brief-time">Prepared 09:15 AEST</span>
        </section>
      )}

      <section className="workspace-grid" aria-label="Opportunity workspace">
        <aside className="left-rail" aria-label="Intelligence filters">
          <div className="panel">
            <div className="section-heading"><span>Signal coverage</span><strong>Monitored sources</strong></div>
            {["Government tenders", "Planning approvals", "Infrastructure pipelines", "Developer activity", "Private projects", "Relationship CRM"].map((item) => (
              <label className="check-row" key={item}><input defaultChecked suppressHydrationWarning type="checkbox" /><span>{item}</span><small>Public</small></label>
            ))}
          </div>
          <div className="panel">
            <div className="section-heading"><span>Commercial action</span><strong>Queue</strong></div>
            <div className="stage-list">{(["Pursue", "Watch", "Archive"] as const).map((queue) => <button className={queue === queueFilter ? "active" : ""} key={queue} onClick={() => setQueueFilter(queue)} type="button">{queue}<span>{ranked.filter((item) => item.assessment.decisionQueue === queue).length}</span></button>)}</div>
          </div>
          <div className="panel">
            <div className="section-heading"><span>Pipeline lens</span><strong>Stage</strong></div>
            <div className="stage-list">{stages.map((stage) => <button className={stage === stageFilter ? "active" : ""} key={stage} onClick={() => setStageFilter(stage)} type="button">{stage}<span>{stage === "All" ? ranked.length : ranked.filter((item) => item.stage === stage).length}</span></button>)}</div>
          </div>
          <div className="panel cadence-panel">
            <span className="eyebrow">Cadence</span><strong>Next intelligence refresh</strong><b>01h 44m</b><p>Source monitors run continuously. Relationship and proposal signals are reviewed at 16:00.</p>
          </div>
        </aside>

        <section className="opportunity-board" aria-label="Ranked opportunities">
          <div className="board-header">
            <div><p className="eyebrow">Decision queue</p><h3>{queueFilter} opportunities</h3><p className="board-description">Ten visible components separate geotechnical relevance from commercial fit, capability, readiness, relationships, and source quality.</p></div>
            <span>{visible.length} shown</span>
          </div>
          <div className="queue-head"><span>Score</span><span>Opportunity</span><span>Value / timing</span></div>
          <div className="opportunity-list">
            {visible.length === 0 && <div className="queue-empty"><strong>No opportunities in this view</strong><span>Change the queue or stage filter to inspect other records.</span></div>}
            {visible.map((item) => (
              <button className={`opportunity-row ${item.id === active.id ? "selected" : ""}`} key={item.id} onClick={() => { setActiveId(item.id); setDetailView("intel"); setFeedbackChoice(null); setFeedbackStatus("idle"); setPassReason(""); }} type="button">
                <span className={`score-pill ${scoreClass(item.score)}`}>{item.score}<small>score</small></span>
                <span className="opportunity-main"><strong>{item.name}</strong><small>{item.location} <i>•</i> {item.stage} <i>•</i> {item.opportunityType ?? "project signal"}</small><em>{item.sector} <i>•</i> {item.source}</em></span>
                <span className="revenue-range"><strong>{shortMoney(item.geotechRevenue[0])}-{shortMoney(item.geotechRevenue[1])}</strong><small>{item.closeDate}</small></span>
              </button>
            ))}
          </div>
        </section>

        <aside className="detail-panel" aria-label="Selected opportunity detail">
          <div className="detail-title">
            <div className="detail-meta"><span>{active.id} <i>•</i> {active.opportunityType ?? "opportunity"}</span><b>{active.confidence}% confidence</b></div>
            <h3>{active.name}</h3>
            <p>{active.location} <i>•</i> {active.source} <i>•</i> last verified {active.lastVerified}</p>
          </div>
          <div className="detail-tabs" role="tablist" aria-label="Opportunity detail view">
            <button aria-selected={detailView === "intel"} className={detailView === "intel" ? "selected" : ""} onClick={() => setDetailView("intel")} role="tab" type="button">Intelligence</button>
            <button aria-selected={detailView === "pursuit"} className={detailView === "pursuit" ? "selected" : ""} onClick={() => setDetailView("pursuit")} role="tab" type="button">Pursuit plan</button>
          </div>
          {detailView === "intel" ? (
            <>
              <div className="metric-grid">
                <div><span>Project value</span><strong>{money(active.value)}</strong></div>
                <div><span>STS revenue</span><strong>{shortMoney(active.geotechRevenue[0])}-{shortMoney(active.geotechRevenue[1])}</strong></div>
                <div><span>Decision queue</span><strong>{active.assessment.decisionQueue}</strong></div>
                <div><span>Construction start</span><strong>{active.constructionStart}</strong></div>
              </div>
              <div className="info-stack">
                <div><span>Client</span><strong>{active.client}</strong></div><div><span>Builder</span><strong>{active.builder}</strong></div><div><span>Consultant</span><strong>{active.consultant}</strong></div><div><span>Pursuit owner</span><strong>{active.owner}</strong></div>
              </div>
              <div className="recommendation"><span>Recommended next move</span><p>{active.nextAction}</p><small>Timing: {active.closeDate} <i>•</i> source fields remain un-inferred</small></div>
              <div className="feedback-panel">
                <div><span>Estimator decision</span><strong>Tier {active.assessment.geoTier} · score {active.score}</strong></div>
                <div className="feedback-actions" aria-label="Estimator decision">
                  {(["Pursue", "Watch", "Pass"] as const).map((decision) => <button aria-pressed={feedbackChoice === decision} className={feedbackChoice === decision ? "selected" : ""} key={decision} onClick={() => { if (decision === "Pass") { setFeedbackChoice("Pass"); setFeedbackStatus("idle"); } else void submitFeedback(decision); }} type="button">{decision}</button>)}
                </div>
                {feedbackChoice === "Pass" && <div className="pass-reason"><select aria-label="Pass reason" onChange={(event) => setPassReason(event.target.value)} value={passReason}><option value="">Select reason</option>{["Below minimum fee", "Capability gap", "No relationship pathway", "Strong incumbent", "Outside operational region", "Insufficient information", "Timing or capacity", "Other"].map((reason) => <option key={reason}>{reason}</option>)}</select><button disabled={!passReason || feedbackStatus === "saving"} onClick={() => void submitFeedback("Pass", passReason)} type="button">Store decision</button></div>}
                {feedbackStatus !== "idle" && <small className={`feedback-status ${feedbackStatus}`}>{feedbackStatus === "saving" ? "Saving decision..." : feedbackStatus === "saved" ? "Decision stored for model calibration." : "Database storage is not configured."}</small>}
              </div>
            </>
          ) : (
            <>
              <div className="strategy-callout"><span>Win theme</span><strong>De-risk programme early with a practical, staged ground investigation.</strong><p>Lead with fast mobilisation, clear groundwater contingencies, and relevant local delivery evidence.</p></div>
              <div className="workflow-list">{workflow.map((item) => <div className="workflow-row" key={item.step}><span className={`workflow-state ${item.state.toLowerCase()}`}>{item.state}</span><div><strong>{item.step}</strong><small>{item.owner} <i>•</i> {item.due}</small></div></div>)}</div>
              {proposalReady && <div className="proposal-ready">Proposal pack assembled for this pursuit. Review assumptions before release.</div>}
            </>
          )}
        </aside>
      </section>

      <section className="intelligence-grid" aria-label="Pursuit intelligence">
        <section className="panel score-panel">
          <div className="section-heading"><div><span>Why this ranks here</span><strong>Score drivers</strong></div><b>{active.score}/100</b></div>
          <p className="panel-intro">A transparent ten-component operational score, not a win probability. Missing evidence remains unknown rather than receiving an implicit advantage.</p>
          <div className="driver-list">{drivers.map((driver) => <div className="driver-row" key={driver.label}><span>{driver.label}<small>{driver.weight}</small></span><div className="progress-track"><i className={driver.tone} style={{ width: `${driver.value}%` }} /></div><b>{driver.value}</b></div>)}</div>
          <div className="signal-scope"><div><h4>Detected signals</h4><ul>{active.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul></div><div><h4>Likely geotech scope</h4><ul>{active.scope.map((scope) => <li key={scope}>{scope}</li>)}</ul></div></div>
        </section>

        <section className="panel evidence-panel">
          <div className="section-heading"><div><span>Research trail</span><strong>Evidence and verification</strong></div><b>{active.confidence}%</b></div>
          <div className="evidence-list">{active.evidence.map((item) => <div className="evidence-row" key={item.title}><div><strong>{item.title}</strong><small>{item.source} <i>•</i> {item.age} ago</small></div><span className={item.confidence.toLowerCase()}>{item.confidence}</span></div>)}</div>
          <div className="source-note">Every pursuit should carry a traceable research trail. Confirmed sources lift confidence; indicative signals stay visible but do not drive procurement assumptions alone.</div>
        </section>

        <section className="panel relationship-panel">
          <div className="section-heading"><div><span>Influence map</span><strong>People and access</strong></div><b>{active.relationship}/100</b></div>
          <div className="contact-list">{active.contacts.map((contact) => <div className="contact-row" key={contact.name}><span className="initials">{contact.initials}</span><div><strong>{contact.name}</strong><small>{contact.role}</small></div><em>{contact.strength}</em></div>)}</div>
          <div className="relationship-foot"><span>Relationship posture</span><strong>{active.relationship >= 65 ? "Actively influence" : active.relationship >= 50 ? "Develop access" : "Create entry point"}</strong></div>
          <div className="public-search-row">
            <div><span>Public role discovery</span><strong>{active.consultant} decision makers</strong><small>Search-result evidence only · no profile-page automation</small></div>
            <a href={publicProfileSearches[0].googleUrl} rel="noreferrer" target="_blank">Open search</a>
          </div>
        </section>
      </section>

      <section className="strategic-panel panel" aria-label="Historical procurement strategy">
        <div className="board-header">
          <div><p className="eyebrow">Award pattern mining</p><h3>Strategic win drivers</h3><p className="board-description">Observed scope bundles, buyer concentration, and service associations from attributable Commonwealth and NSW award records.</p></div>
          <span>Snapshot {snapshotDate}</span>
        </div>
        <div className="strategic-metrics">
          <div><span>Awards analysed</span><strong>{strategicSnapshot.metrics.eligibleAwards}</strong><small>classified geotech records</small></div>
          <div><span>Bundled scope</span><strong>{strategicSnapshot.metrics.bundledAwards}</strong><small>{(strategicSnapshot.metrics.bundleRate * 100).toFixed(1)}% detected rate</small></div>
          <div><span>Turnkey pattern</span><strong>{strategicSnapshot.metrics.turnkeyAwards}</strong><small>field + lab + engineering</small></div>
          <div><span>Buyer coverage</span><strong>{strategicSnapshot.metrics.buyers}</strong><small>{strategicSnapshot.metrics.suppliers} awarded suppliers</small></div>
        </div>
        <div className="strategic-body">
          <div className="insight-list">
            {strategicSnapshot.insights.map((insight) => (
              <article className="insight-row" key={insight.id}>
                <span className={`confidence-tag ${insight.confidence}`}>{insight.confidence}</span>
                <div><strong>{insight.title}</strong><p>{insight.finding}</p><small>Commercial response: {insight.action}</small></div>
              </article>
            ))}
          </div>
          <aside className="scope-model">
            <span className="eyebrow">Selected pursuit</span>
            <strong>{activeBundle.bundleLabel}</strong>
            <p>{activeBundle.serviceFamilies.length} service families detected from the current scope.</p>
            <div className="capability-tags">{activeBundle.capabilities.slice(0, 6).map((capability) => <span key={capability.id}>{capability.label}</span>)}</div>
            {bundledBuyerSegment && <div className="segment-benchmark"><span>Historical benchmark</span><b>{bundledBuyerSegment.label}</b><small>{bundledBuyerSegment.buyerCount} buyers · {(bundledBuyerSegment.averageBundleRate * 100).toFixed(1)}% bundle rate · {money(bundledBuyerSegment.medianAwardValue ?? 0)} median disclosed value</small></div>}
            <div className="model-gate"><span>Win model</span><b>Data gated</b><small>{strategicSnapshot.modelReadiness.reason}</small></div>
          </aside>
        </div>
        <div className="strategy-foot"><span>Source: {strategicSnapshot.source}</span><strong>Association is not causation · award share is not bidder win rate</strong></div>
      </section>

      <section className="signal-thread panel" aria-label="Commercial project signal chain">
        <div className="board-header"><div><p className="eyebrow">Project correlation</p><h3>Commercial signal thread</h3><p className="board-description">Fragmented signals are grouped as one project so the team can act before the formal tender.</p></div><span>{active.stage}</span></div>
        <div className="signal-chain">
          {signalChain.map((item, index) => <div className="signal-node" key={`${item.label}-${item.signal}`}><div className="signal-node-top"><span>{String(index + 1).padStart(2, "0")}</span><em>{item.state}</em></div><strong>{item.label}</strong><p>{item.signal}</p>{index < signalChain.length - 1 && <i className="signal-arrow" aria-hidden="true">→</i>}</div>)}
        </div>
        <div className="thread-action"><span>Recommended pathway</span><strong>{active.nextAction}</strong><small>Source: {active.source} · {active.confidence}% evidence confidence · {active.lastVerified}</small></div>
      </section>

      <section className="lower-grid" aria-label="Operations intelligence">
        <div className="panel agent-panel"><div className="board-header"><div><p className="eyebrow">Intelligence operations</p><h3>Collection and reasoning agents</h3></div><span>6 active</span></div><div className="agent-grid">{agents.map((agent) => <div className="agent-card" key={agent.name}><span className={`agent-status ${agent.status.toLowerCase()}`}>{agent.status}</span><strong>{agent.name}</strong><p>{agent.coverage}</p><small>{agent.output}</small></div>)}</div></div>
        <div className="panel risk-panel"><div className="section-heading"><div><span>Bid discipline</span><strong>Risks to manage</strong></div></div><div className="risk-list">{active.risks.map((item) => <div className="risk-row" key={item.risk}><span className={item.level.toLowerCase()}>{item.level}</span><div><strong>{item.risk}</strong><p>{item.response}</p></div></div>)}</div></div>
        <div className="panel competitor-panel"><div className="section-heading"><div><span>Competitor intelligence</span><strong>Market heat</strong></div></div>{competitors.map((competitor) => <div className="heat-row" key={competitor.name}><div><strong>{competitor.name}</strong><span>{competitor.movement}</span></div><meter min="0" max="100" value={competitor.heat}>{competitor.heat}</meter></div>)}</div>
      </section>
    </main>
  );
}
