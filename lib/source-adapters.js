import { createHash } from "node:crypto";
import { classifyGeotechTier } from "./opportunity-intelligence.js";

const PROJECT_TRIGGERS = [
  "road upgrade", "bridge replacement", "railway upgrade", "station upgrade",
  "school redevelopment", "hospital redevelopment", "subdivision", "retaining wall",
  "bulk excavation", "dam", "tunnel", "transmission line", "renewable energy",
  "industrial development",
];

const SOURCE_POLICIES = Object.freeze({
  "buy-nsw": { extraction_method: "html", access: "public", signal_kind: "opportunity" },
  vendorpanel: { extraction_method: "rss", access: "public", signal_kind: "opportunity" },
  eprocure: { extraction_method: "api", access: "approved-integration", signal_kind: "opportunity" },
  tenderlink: { extraction_method: "email", access: "authorised-notification", signal_kind: "opportunity" },
  estimateone: { extraction_method: "email", access: "authorised-alert", signal_kind: "lead" },
  austender: { extraction_method: "api", access: "public", signal_kind: "opportunity" },
  icn: { extraction_method: "html", access: "public-metadata", signal_kind: "lead" },
});

function clean(value) {
  const text = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function list(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value)?.split(/[,;|]/).map(clean).filter(Boolean) ?? [];
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function key(value) {
  return clean(value)?.toLowerCase().replace(/\b(?:pty|proprietary|limited|ltd)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function stableId(...parts) {
  return createHash("sha256").update(parts.map(key).join("|")).digest("hex").slice(0, 20);
}

export function classifyIngestedRecord(record) {
  const classification = classifyGeotechTier({
    title: record.title,
    description: record.description,
    scope: record.scope,
    category: record.categories?.join(" "),
  });
  const text = [record.title, record.description, record.scope].filter(Boolean).join(" ").toLowerCase();
  const trigger_hits = PROJECT_TRIGGERS.filter((term) => text.includes(term));
  return {
    ...classification,
    trigger_hits,
    record_kind: classification.geoTier === "A" || classification.geoTier === "B"
      ? "opportunity"
      : trigger_hits.length ? "potential_geotech_lead" : "archive",
  };
}

export function normalizeSourceRecord(source, input, { extractedAt = new Date().toISOString() } = {}) {
  const policy = SOURCE_POLICIES[source];
  if (!policy) throw new Error(`Unsupported source adapter: ${source}`);
  const source_id = clean(input.source_id ?? input.id ?? input.tender_id ?? input.notice_id);
  const source_url = clean(input.source_url ?? input.url);
  const title = clean(input.title ?? input.subject ?? input.project_name);
  if (!source_id || !source_url || !title) throw new Error(`${source} records require source_id, source_url and title`);

  const record = {
    opportunity_id: `${source}:${source_id}`,
    source,
    source_id,
    source_url,
    title,
    description: clean(input.description ?? input.summary),
    scope: clean(input.scope ?? input.scope_of_works),
    buyer: clean(input.buyer ?? input.organisation ?? input.client),
    buyer_abn: clean(input.buyer_abn),
    agency: clean(input.agency),
    client_type: clean(input.client_type),
    project_name: clean(input.project_name ?? title),
    project_type: clean(input.project_type),
    sector: clean(input.sector),
    address: clean(input.address),
    suburb: clean(input.suburb),
    state: clean(input.state),
    postcode: clean(input.postcode),
    latitude: number(input.latitude),
    longitude: number(input.longitude),
    published_date: isoDate(input.published_date ?? input.published_at),
    closing_date: isoDate(input.closing_date ?? input.closes_at),
    award_date: isoDate(input.award_date),
    contract_start: isoDate(input.contract_start),
    contract_end: isoDate(input.contract_end),
    procurement_type: clean(input.procurement_type ?? input.tender_type),
    tender_method: clean(input.tender_method),
    estimated_value: number(input.estimated_value ?? input.project_value),
    contract_value: number(input.contract_value),
    successful_supplier: clean(input.successful_supplier),
    supplier_abn: clean(input.supplier_abn),
    mandatory_briefing: clean(input.mandatory_briefing),
    prequalification: clean(input.prequalification),
    insurance_requirement: clean(input.insurance_requirement),
    rail_requirement: clean(input.rail_requirement),
    documents: Array.isArray(input.documents) ? input.documents : [],
    addenda: Array.isArray(input.addenda) ? input.addenda : [],
    categories: list(input.categories ?? input.category),
    status: clean(input.status) ?? "unknown",
    source_program: clean(input.source_program),
    raw_source: input,
    extracted_at: extractedAt,
    last_updated: isoDate(input.last_updated) ?? extractedAt,
    extraction_method: clean(input.extraction_method) ?? policy.extraction_method,
    access_basis: policy.access,
  };
  const classification = classifyIngestedRecord(record);
  record.geotech_relevance = classification.record_kind;
  record.geotech_score = classification.geotechRelevanceScore;
  record.geotech_tier = classification.geoTier;
  record.geotech_evidence = classification.positiveKeywordHits;
  record.project_trigger_evidence = classification.trigger_hits;
  const evidence = new Set([...classification.positiveKeywordHits, ...classification.requiredCapabilities]);
  record.boreholes = evidence.has("boreholes") || evidence.has("Borehole drilling");
  record.borehole_depth = number(input.borehole_depth);
  record.rock_coring = evidence.has("rock coring") || evidence.has("Rock coring");
  record.cpt = evidence.has("CPT/CPTu") || evidence.has("CPT");
  record.spt = evidence.has("SPT");
  record.dcp = evidence.has("DCP");
  record.groundwater = evidence.has("groundwater monitoring") || evidence.has("Groundwater wells");
  record.lab_testing = evidence.has("soil testing") || evidence.has("rock testing") || evidence.has("construction materials testing");
  record.pavement = evidence.has("pavement investigation") || evidence.has("Pavement investigation");
  record.contamination = classification.negativeKeywordHits.some((item) => /contamin/i.test(item));
  record.piling = /\bpil(?:e|es|ing)\b/i.test([record.title, record.description, record.scope].join(" "));
  record.inspection = /\binspection/i.test([record.title, record.description, record.scope].join(" "));
  record.parent_project_id = clean(input.parent_project_id) ?? `project:${stableId(record.project_name, record.buyer, record.suburb, record.state)}`;
  record.duplicate_group_id = clean(input.duplicate_group_id) ?? `opportunity:${stableId(record.title, record.buyer, record.closing_date)}`;
  return record;
}

export function linkProjectSignals(records) {
  const projects = new Map();
  for (const record of records) {
    const id = record.parent_project_id;
    const project = projects.get(id) ?? {
      parent_project_id: id,
      project_name: record.project_name,
      signals: [],
      source_count: 0,
      opportunity_ids: [],
    };
    project.signals.push({ source: record.source, source_id: record.source_id, source_url: record.source_url, status: record.status });
    project.opportunity_ids.push(record.opportunity_id);
    project.source_count = new Set(project.signals.map(({ source }) => source)).size;
    projects.set(id, project);
  }
  return [...projects.values()];
}

function decodeXml(value) {
  return clean(value
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'"));
}

function xmlValue(item, names) {
  for (const name of names) {
    const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (match) return decodeXml(match[1]);
  }
  return null;
}

export function parseVendorPanelRss(xml, options) {
  const items = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => normalizeSourceRecord("vendorpanel", {
    source_id: xmlValue(item, ["guid"]) ?? xmlValue(item, ["link"]),
    source_url: xmlValue(item, ["link"]),
    title: xmlValue(item, ["title"]),
    description: xmlValue(item, ["description", "content:encoded"]),
    organisation: xmlValue(item, ["author", "dc:creator"]),
    published_date: xmlValue(item, ["pubDate", "dc:date"]),
    status: "open",
  }, options));
}

export function parseTenderNotification(source, message, options) {
  if (!["tenderlink", "estimateone"].includes(source)) throw new Error("Email ingestion is limited to authorised TenderLink and EstimateOne notifications");
  const body = String(message.text ?? message.body ?? "").replace(/\r/g, "");
  const value = (label) => body.match(new RegExp(`(?:^|\\n)${label}\\s*[:#-]\\s*([^\\n]+)`, "i"))?.[1];
  const url = message.source_url ?? body.match(/https?:\/\/[^\s<>]+/i)?.[0];
  return normalizeSourceRecord(source, {
    source_id: message.source_id ?? message.message_id ?? value("(?:Tender|Project) ID"),
    source_url: url,
    title: message.title ?? message.subject,
    description: body,
    organisation: value("(?:Organisation|Builder|Client)"),
    project_name: value("Project"),
    suburb: value("(?:Location|Suburb)"),
    closing_date: value("(?:Closing|Close) Date"),
    status: "open",
    extraction_method: "email",
  }, options);
}

export const supportedSourcePolicies = SOURCE_POLICIES;
