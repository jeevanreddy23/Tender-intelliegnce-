"use client";

import { useMemo, useState } from "react";

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
  value: number;
  geotechRevenue: [number, number];
  closeDate: string;
  constructionStart: string;
  relationship: number;
  competition: number;
  risk: number;
  strategic: number;
  winProbability: number;
  travel: number;
  resourceFit: number;
  signals: string[];
  scope: string[];
  nextAction: string;
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
    value: 185000000,
    geotechRevenue: [45000, 70000],
    closeDate: "Contact window: 48 hours",
    constructionStart: "Q2 2027",
    relationship: 62,
    competition: 44,
    risk: 38,
    strategic: 81,
    winProbability: 72,
    travel: 88,
    resourceFit: 78,
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
    nextAction:
      "Send developer briefing and ask who is leading early works procurement.",
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
    value: 420000000,
    geotechRevenue: [140000, 210000],
    closeDate: "Tender forecast: Oct 2026",
    constructionStart: "Q3 2027",
    relationship: 54,
    competition: 61,
    risk: 43,
    strategic: 92,
    winProbability: 68,
    travel: 74,
    resourceFit: 84,
    signals: [
      "Bridge concept design released",
      "Rock excavation likely",
      "Creek crossing access constraints",
      "Historical flood study updated",
    ],
    scope: [
      "Rock coring",
      "Bridge footing investigation",
      "Slope stability",
      "Laboratory strength testing",
      "Instrumentation plan",
      "Temporary works advice",
    ],
    nextAction:
      "Prepare capability pack for bridge investigations and request consultant intro.",
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
    value: 310000000,
    geotechRevenue: [85000, 130000],
    closeDate: "No tender yet",
    constructionStart: "Q4 2027",
    relationship: 76,
    competition: 39,
    risk: 35,
    strategic: 88,
    winProbability: 81,
    travel: 91,
    resourceFit: 73,
    signals: [
      "Developer acquired 19 ha site",
      "Warehouse zoning uplift lodged",
      "STS completed 3 previous sheds nearby",
      "Likely heavy pavement program",
    ],
    scope: [
      "DCP grid",
      "CBR testing",
      "Plate load tests",
      "Pavement design inputs",
      "Earthworks validation",
      "Imported fill assessment",
    ],
    nextAction:
      "Ask relationship owner to book a pre-design geotech risk workshop.",
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
    value: 260000000,
    geotechRevenue: [60000, 95000],
    closeDate: "Planning response: Sep 2026",
    constructionStart: "Q1 2028",
    relationship: 41,
    competition: 58,
    risk: 49,
    strategic: 86,
    winProbability: 59,
    travel: 67,
    resourceFit: 69,
    signals: [
      "Substation tie-in noted",
      "Slope stability concerns",
      "Bushfire access upgrades",
      "Possible shallow groundwater",
    ],
    scope: [
      "Boreholes at inverter pads",
      "Electrical trench assessment",
      "Slope stability review",
      "Permeability tests",
      "Aggressivity testing",
      "Construction traffic pavements",
    ],
    nextAction:
      "Track EPC shortlist and build renewables geotech evidence pack.",
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
    value: 520000000,
    geotechRevenue: [120000, 190000],
    closeDate: "Tender forecast: Jan 2027",
    constructionStart: "Q4 2027",
    relationship: 35,
    competition: 66,
    risk: 57,
    strategic: 79,
    winProbability: 52,
    travel: 42,
    resourceFit: 58,
    signals: [
      "Capital allocation published",
      "Clinical services plan complete",
      "Basement and services tunnel likely",
      "High stakeholder complexity",
    ],
    scope: [
      "Deep boreholes",
      "Groundwater monitoring",
      "Retention advice",
      "Contamination investigation",
      "Vibration monitoring",
      "Foundation options study",
    ],
    nextAction:
      "Qualify whether QLD partner capacity is available before pursuit.",
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
    value: 95000000,
    geotechRevenue: [30000, 52000],
    closeDate: "Closes 31 Jul 2026",
    constructionStart: "Q1 2027",
    relationship: 58,
    competition: 53,
    risk: 31,
    strategic: 64,
    winProbability: 66,
    travel: 55,
    resourceFit: 86,
    signals: [
      "Bundle of 7 schools",
      "Fast turnaround required",
      "Repeat agency scope pattern",
      "Regional crew availability good",
    ],
    scope: [
      "Shallow boreholes",
      "DCP testing",
      "Waste classification",
      "Pavement CBR",
      "Site classification",
      "Short-form factual reports",
    ],
    nextAction:
      "Generate fixed-fee proposal with alternate schedule for simultaneous crews.",
  },
];

const agents: Agent[] = [
  {
    name: "Tender crawler",
    status: "Live",
    coverage: "AusTender, VendorPanel, TenderLink, NSW Buy",
    output: "16 new tender signals",
  },
  {
    name: "Planning approval crawler",
    status: "Live",
    coverage: "Council DA, SSD, SSI, EIS, rezoning",
    output: "42 approval changes",
  },
  {
    name: "Developer tracker",
    status: "Live",
    coverage: "Land purchases, repeat clients, strategic sites",
    output: "9 pre-tender leads",
  },
  {
    name: "Document reader",
    status: "Learning",
    coverage: "PDF, Word, drawings, specs, BOQ",
    output: "6 scopes extracted",
  },
  {
    name: "Proposal generator",
    status: "Queued",
    coverage: "Methodology, assumptions, price schedule",
    output: "3 drafts ready",
  },
  {
    name: "Competitor tracker",
    status: "Learning",
    coverage: "SMEC, GHD, WSP, Douglas Partners, Arcadis",
    output: "11 client overlaps",
  },
];

const competitors = [
  { name: "SMEC", movement: "Transport and high-rise repeat work", heat: 72 },
  { name: "GHD", movement: "Bridge package influence rising", heat: 68 },
  { name: "WSP", movement: "Renewables approvals visible", heat: 61 },
  { name: "Douglas Partners", movement: "Sydney apartment work steady", heat: 55 },
];

function money(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortMoney(value: number) {
  if (value >= 1000000) return `$${Math.round(value / 1000000)}m`;
  return `$${Math.round(value / 1000)}k`;
}

function scoreOpportunity(opportunity: Opportunity) {
  const revenue = Math.min(100, opportunity.geotechRevenue[1] / 2000);
  const relationship = opportunity.relationship;
  const competition = 100 - opportunity.competition;
  const risk = 100 - opportunity.risk;
  const probability = opportunity.winProbability;
  const travel = opportunity.travel;
  const resource = opportunity.resourceFit;
  const strategic = opportunity.strategic;

  return Math.round(
    revenue * 0.18 +
      relationship * 0.16 +
      competition * 0.12 +
      risk * 0.1 +
      probability * 0.18 +
      travel * 0.08 +
      resource * 0.08 +
      strategic * 0.1,
  );
}

function scoreClass(score: number) {
  if (score >= 78) return "hot";
  if (score >= 65) return "warm";
  return "watch";
}

export default function Home() {
  const [activeId, setActiveId] = useState(opportunities[0].id);
  const [stageFilter, setStageFilter] = useState("All");

  const ranked = useMemo(
    () =>
      opportunities
        .map((opportunity) => ({
          ...opportunity,
          score: scoreOpportunity(opportunity),
        }))
        .sort((a, b) => b.score - a.score),
    [],
  );

  const stages = ["All", ...Array.from(new Set(ranked.map((item) => item.stage)))];
  const visible =
    stageFilter === "All"
      ? ranked
      : ranked.filter((item) => item.stage === stageFilter);
  const active = ranked.find((item) => item.id === activeId) ?? ranked[0];
  const pipeline = ranked.reduce(
    (total, item) => total + item.geotechRevenue[1],
    0,
  );
  const predicted = ranked.filter(
    (item) => item.stage !== "Tender open" && item.stage !== "Pre-tender notice",
  ).length;

  return (
    <main className="app-shell">
      <section className="hero-band">
        <nav className="topbar" aria-label="Primary">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              STS
            </span>
            <div>
              <p className="eyebrow">GeoFlow Opportunity Intelligence</p>
              <h1>STS Tender Intelligence</h1>
            </div>
          </div>
          <div className="nav-actions">
            <button type="button">Daily Brief</button>
            <button type="button">Generate Proposal</button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="kicker">Construction intelligence before tender time</p>
            <h2>
              Predict, score, and pursue geotechnical opportunities months
              earlier.
            </h2>
            <p>
              A daily operating system for STS business development across
              tenders, planning approvals, developers, builders, consultants,
              competitors, and proposal readiness.
            </p>
          </div>
          <div className="command-panel" aria-label="Today summary">
            <div>
              <span>Today</span>
              <strong>{ranked.length}</strong>
              <small>qualified opportunities</small>
            </div>
            <div>
              <span>Pipeline</span>
              <strong>{shortMoney(pipeline)}</strong>
              <small>potential geotech revenue</small>
            </div>
            <div>
              <span>Early</span>
              <strong>{predicted}</strong>
              <small>pre-tender predictions</small>
            </div>
            <div>
              <span>Best score</span>
              <strong>{ranked[0].score}</strong>
              <small>{ranked[0].name}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Opportunity workspace">
        <aside className="left-rail" aria-label="Intelligence filters">
          <div className="panel">
            <div className="section-heading">
              <span>Monitor</span>
              <strong>Source coverage</strong>
            </div>
            {[
              "Government tenders",
              "Planning approvals",
              "Developer activity",
              "Private portals",
              "Competitor movement",
              "Relationship CRM",
            ].map((item) => (
              <label className="check-row" key={item}>
                <input type="checkbox" defaultChecked />
                <span>{item}</span>
              </label>
            ))}
          </div>

          <div className="panel">
            <div className="section-heading">
              <span>Stage</span>
              <strong>Pipeline lens</strong>
            </div>
            <div className="stage-list">
              {stages.map((stage) => (
                <button
                  className={stage === stageFilter ? "active" : ""}
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  type="button"
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="opportunity-board" aria-label="Ranked opportunities">
          <div className="board-header">
            <div>
              <p className="eyebrow">Opportunity scoring</p>
              <h3>Ranked pursuit queue</h3>
            </div>
            <span>{visible.length} shown</span>
          </div>

          <div className="opportunity-list">
            {visible.map((item) => (
              <button
                className={`opportunity-row ${
                  item.id === active.id ? "selected" : ""
                }`}
                key={item.id}
                onClick={() => setActiveId(item.id)}
                type="button"
              >
                <span className={`score-pill ${scoreClass(item.score)}`}>
                  {item.score}
                </span>
                <span className="opportunity-main">
                  <strong>{item.name}</strong>
                  <small>
                    {item.location} - {item.stage} - {item.source}
                  </small>
                </span>
                <span className="revenue-range">
                  {shortMoney(item.geotechRevenue[0])}-
                  {shortMoney(item.geotechRevenue[1])}
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="detail-panel" aria-label="Selected opportunity detail">
          <div className="detail-title">
            <span>{active.id}</span>
            <h3>{active.name}</h3>
            <p>{active.nextAction}</p>
          </div>

          <div className="metric-grid">
            <div>
              <span>Project value</span>
              <strong>{money(active.value)}</strong>
            </div>
            <div>
              <span>STS revenue</span>
              <strong>
                {shortMoney(active.geotechRevenue[0])}-
                {shortMoney(active.geotechRevenue[1])}
              </strong>
            </div>
            <div>
              <span>Win probability</span>
              <strong>{active.winProbability}%</strong>
            </div>
            <div>
              <span>Start</span>
              <strong>{active.constructionStart}</strong>
            </div>
          </div>

          <div className="info-stack">
            <div>
              <span>Client</span>
              <strong>{active.client}</strong>
            </div>
            <div>
              <span>Builder</span>
              <strong>{active.builder}</strong>
            </div>
            <div>
              <span>Consultant</span>
              <strong>{active.consultant}</strong>
            </div>
            <div>
              <span>Timing</span>
              <strong>{active.closeDate}</strong>
            </div>
          </div>

          <div className="split-panel">
            <div>
              <h4>Detected signals</h4>
              <ul>
                {active.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Likely geotech scope</h4>
              <ul>
                {active.scope.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </section>

      <section className="lower-grid" aria-label="Operations intelligence">
        <div className="panel agent-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">AI agents</p>
              <h3>Continuous collection and reasoning</h3>
            </div>
          </div>
          <div className="agent-grid">
            {agents.map((agent) => (
              <div className="agent-card" key={agent.name}>
                <span className={`agent-status ${agent.status.toLowerCase()}`}>
                  {agent.status}
                </span>
                <strong>{agent.name}</strong>
                <p>{agent.coverage}</p>
                <small>{agent.output}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel proposal-panel">
          <div className="section-heading">
            <span>Proposal automation</span>
            <strong>Draft pack for selected lead</strong>
          </div>
          <div className="proposal-grid">
            {[
              "Technical methodology",
              "Investigation schedule",
              "Assumptions and exclusions",
              "Risk register",
              "Relevant past projects",
              "Pricing schedule",
            ].map((item) => (
              <label className="check-row" key={item}>
                <input type="checkbox" defaultChecked />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <div className="draft-box">
            <span>Generated opening</span>
            <p>
              STS Geotechnics can support {active.client} with a targeted
              investigation for {active.name}, prioritising early ground risk,
              foundation parameters, construction access, and programme certainty.
            </p>
          </div>
        </div>

        <div className="panel competitor-panel">
          <div className="section-heading">
            <span>Competitor intelligence</span>
            <strong>Market heat</strong>
          </div>
          {competitors.map((competitor) => (
            <div className="heat-row" key={competitor.name}>
              <div>
                <strong>{competitor.name}</strong>
                <span>{competitor.movement}</span>
              </div>
              <meter min="0" max="100" value={competitor.heat}>
                {competitor.heat}
              </meter>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
