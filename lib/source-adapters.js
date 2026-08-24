import { createHash } from "node:crypto";
import {
  classifyGeotechTier,
  scoreCapabilityMatch,
  scoreOpportunityComponents,
} from "./opportunity-intelligence.js";

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
  tenderlink: { extraction_method: "html", access: "public-metadata", signal_kind: "opportunity" },
  estimateone: { extraction_method: "html", access: "public-metadata", signal_kind: "lead" },
  austender: { extraction_method: "api", access: "public", signal_kind: "opportunity" },
  icn: { extraction_method: "html", access: "public-metadata", signal_kind: "lead" },
  "australian-tenders": { extraction_method: "api", access: "public-metadata", signal_kind: "opportunity" },
  "bci-central": { extraction_method: "html", access: "public-metadata", signal_kind: "lead" },
});

const PROCUREMENT_TYPES = [
  ["proposed-opportunity", /\b(?:proposed opportunity|p-rft|advanced tender notice)\b/i],
  ["scheme", /\b(?:scheme|prequalification scheme|standing offer)\b/i],
  ["contract-award", /\b(?:contract award|award notice|contract notice)\b/i],
  ["planned-procurement", /\b(?:planned procurement|annual procurement plan|procurement plan)\b/i],
  ["rfq", /\b(?:request for quote|request for quotation|rfq|quotation)\b/i],
  ["rfi", /\b(?:request for information|rfi)\b/i],
  ["rfp", /\b(?:request for proposal|rfp)\b/i],
  ["eoi", /\b(?:expression of interest|eoi)\b/i],
  ["tender", /\b(?:request for tender|rft|tender)\b/i],
];

const REQUIRED_CANONICAL_FIELDS = [
  "opportunity_id", "source", "source_id", "source_url", "title",
  "status", "parent_project_id", "duplicate_group_id", "raw_source",
  "extracted_at", "last_updated",
];

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
  const text = String(value).trim();
  const australianDate = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const namedMonthDate = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?)?/i);
  const slashDateTime = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?)?/i);
  const monthIndex = namedMonthDate
    ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(namedMonthDate[2].toLowerCase())
    : -1;
  const timedMatch = namedMonthDate ?? slashDateTime;
  let timedDate = null;
  if (timedMatch && (namedMonthDate ? monthIndex >= 0 : true)) {
    let hours = Number(timedMatch[4] ?? 0);
    const meridiem = String(timedMatch[6] ?? "").toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    timedDate = new Date(Date.UTC(
      Number(timedMatch[3]),
      namedMonthDate ? monthIndex : Number(timedMatch[2]) - 1,
      Number(timedMatch[1]),
      hours,
      Number(timedMatch[5] ?? 0),
    ));
  }
  const parsed = timedDate ?? (australianDate
    ? new Date(Date.UTC(Number(australianDate[3]), Number(australianDate[2]) - 1, Number(australianDate[1])))
    : new Date(text));
  if (australianDate && (
    parsed.getUTCDate() !== Number(australianDate[1])
    || parsed.getUTCMonth() !== Number(australianDate[2]) - 1
    || parsed.getUTCFullYear() !== Number(australianDate[3])
  )) return null;
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function decodeHtml(value) {
  const decoded = String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
  return clean(decoded);
}

function htmlText(value) {
  return decodeHtml(String(value ?? "").replace(/<br\s*\/?>/gi, "\n"));
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(decodeHtml(value), baseUrl).toString();
  } catch {
    return null;
  }
}

function monetaryUpperBound(value) {
  const matches = [...String(value ?? "").matchAll(/(?:AUD|A\$|\$)?\s*([\d,.]+)\s*(billion|million|thousand|bn|[bmk])?/gi)];
  const amounts = matches.map((match) => {
    const base = Number(match[1].replace(/,/g, ""));
    const unit = String(match[2] ?? "").toLowerCase();
    const multiplier = /^(?:b|bn|billion)$/.test(unit) ? 1_000_000_000
      : /^(?:m|million)$/.test(unit) ? 1_000_000
        : /^(?:k|thousand)$/.test(unit) ? 1_000 : 1;
    return base * multiplier;
  }).filter(Number.isFinite);
  return amounts.length ? Math.max(...amounts) : null;
}

function stateFromLocation(value) {
  const text = clean(value) ?? "";
  const match = text.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
  if (match) return match[1].toUpperCase();
  const names = [
    ["New South Wales", "NSW"], ["Victoria", "VIC"], ["Queensland", "QLD"],
    ["South Australia", "SA"], ["Western Australia", "WA"], ["Tasmania", "TAS"],
    ["Northern Territory", "NT"], ["Australian Capital Territory", "ACT"],
  ];
  return names.find(([name]) => text.toLowerCase().includes(name.toLowerCase()))?.[1] ?? null;
}

function statusFromClosingDate(value, extractedAt) {
  const closing = isoDate(value);
  const observed = Date.parse(extractedAt ?? "");
  return closing && Number.isFinite(observed) && Date.parse(closing) < observed ? "closed" : "open";
}

function key(value) {
  return clean(value)?.toLowerCase().replace(/\b(?:pty|proprietary|limited|ltd)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

const NSW_LOCAL_GOVERNMENT_BUYERS = [
  "Albury City", "Armidale Regional", "Ballina Shire", "Balranald Shire", "Bathurst Regional",
  "Bayside", "Bega Valley Shire", "Bellingen Shire", "Berrigan Shire", "Blacktown City",
  "Bland Shire", "Blayney Shire", "Blue Mountains City", "Bogan Shire", "Bourke Shire",
  "Brewarrina Shire", "Broken Hill City", "Burwood", "Byron Shire", "Cabonne",
  "Camden", "Campbelltown City", "Canada Bay", "Canterbury Bankstown", "Carrathool Shire",
  "Central Coast", "Central Darling Shire", "Cessnock City", "Clarence Valley", "Cobar Shire",
  "Coffs Harbour City", "Coolamon Shire", "Coonamble Shire", "Cootamundra Gundagai Regional", "Cowra Shire",
  "Cumberland City", "Dubbo Regional", "Dungog Shire", "Edward River", "Eurobodalla Shire",
  "Fairfield City", "Federation", "Forbes Shire", "Georges River", "Gilgandra Shire",
  "Glen Innes Severn", "Goulburn Mulwaree", "Greater Hume Shire", "Griffith City", "Gunnedah Shire",
  "Gwydir Shire", "Hawkesbury City", "Hay Shire", "Hilltops", "Hornsby Shire",
  "Hunters Hill", "Inner West", "Inverell Shire", "Junee Shire", "Kempsey Shire",
  "Kiama Municipal", "Ku ring gai", "Kyogle", "Lachlan Shire", "Lake Macquarie City",
  "Lane Cove", "Leeton Shire", "Lismore City", "Lithgow City", "Liverpool City",
  "Liverpool Plains Shire", "Lockhart Shire", "Maitland City", "MidCoast", "Mid Western Regional",
  "Moree Plains Shire", "Mosman", "Murray River", "Murrumbidgee", "Muswellbrook Shire",
  "Nambucca Valley", "Narrabri Shire", "Narrandera Shire", "Narromine Shire", "Newcastle City",
  "North Sydney", "Northern Beaches", "Oberon", "Orange City", "Parkes Shire",
  "Parramatta City", "Penrith City", "Port Macquarie Hastings", "Port Stephens", "Queanbeyan Palerang Regional",
  "Randwick City", "Richmond Valley", "Ryde", "Shellharbour City", "Shoalhaven City",
  "Singleton", "Snowy Monaro Regional", "Snowy Valleys", "Strathfield", "Sutherland Shire",
  "Sydney City", "Tamworth Regional", "Temora Shire", "Tenterfield Shire", "The Hills Shire",
  "Tweed Shire", "Upper Hunter Shire", "Upper Lachlan Shire", "Uralla Shire", "Wagga Wagga City",
  "Walcha", "Walgett Shire", "Warren Shire", "Warrumbungle Shire", "Waverley",
  "Weddin Shire", "Wentworth Shire", "Willoughby City", "Wingecarribee Shire", "Wollondilly Shire",
  "Wollongong City", "Woollahra", "Yass Valley",
].map(key);

function vendorPanelState(buyer, description) {
  const buyerText = clean(buyer) ?? "";
  const explicitBuyerState = stateFromLocation(buyerText);
  if (explicitBuyerState) return explicitBuyerState;
  const buyerKey = key(buyerText);
  if (/\b(?:nsw|new south wales)\b/i.test(buyerText)
    || NSW_LOCAL_GOVERNMENT_BUYERS.some((name) => buyerKey.includes(name))) return "NSW";
  if (/\b(?:nsw|new south wales)\b/i.test(clean(description) ?? "")) return "NSW";
  return null;
}

function stableId(...parts) {
  return createHash("sha256").update(parts.map(key).join("|")).digest("hex").slice(0, 20);
}

function normalizedHeading(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rowValue(row, aliases) {
  const entries = Object.entries(row ?? {});
  for (const alias of aliases) {
    const wanted = normalizedHeading(alias);
    const match = entries.find(([heading]) => normalizedHeading(heading) === wanted);
    if (match && clean(match[1])) return match[1];
  }
  return null;
}

function payloadItems(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const name of keys) {
    if (Array.isArray(payload?.[name])) return payload[name];
  }
  return payload && typeof payload === "object" ? [payload] : [];
}

function canonicalProcurementType(value) {
  const text = clean(value);
  if (!text) return null;
  return PROCUREMENT_TYPES.find(([, pattern]) => pattern.test(text))?.[0] ?? text.toLowerCase();
}

function canonicalStatus(value, procurementType) {
  const text = clean(value)?.toLowerCase();
  if (procurementType === "contract-award") return "awarded";
  if (procurementType === "planned-procurement" || procurementType === "proposed-opportunity") return "planned";
  if (!text) return "unknown";
  if (/award|complete/.test(text)) return "awarded";
  if (/open|active|current|published/.test(text)) return "open";
  if (/close|expired|cancel/.test(text)) return "closed";
  return text;
}

function projectCandidateKey(record) {
  const project = key(record.project_name)
    .replace(/\b(?:rft|rfq|rfi|rfp|eoi|tender|opportunity|package|stage|works?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const place = key(record.suburb ?? record.address ?? record.state);
  return project && place ? `candidate:${stableId(project, place)}` : null;
}

function commercialValueScore(value) {
  if (!Number.isFinite(value)) return 35;
  if (value >= 250_000) return 100;
  if (value >= 100_000) return 85;
  if (value >= 50_000) return 70;
  if (value >= 20_000) return 55;
  return 30;
}

function procurementReadinessScore(record) {
  if (record.status === "awarded" || record.status === "closed") return 0;
  if (record.status === "open") return 90;
  if (["proposed-opportunity", "planned-procurement"].includes(record.procurement_type)) return 65;
  if (record.geotech_relevance === "potential_geotech_lead") return 40;
  return 50;
}

function sourceQualityScore(record) {
  if (["api", "csv", "rss"].includes(record.extraction_method) && record.access_basis !== "authorised-alert") return 90;
  if (record.extraction_method === "email") return 72;
  if (record.extraction_method === "html") return 75;
  return 60;
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

  const procurement_type = canonicalProcurementType(
    input.procurement_type ?? input.tender_type ?? input.opportunity_type ?? input.notice_type ?? input.type,
  );

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
    procurement_type,
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
    consultants: list(input.consultants ?? input.consultant),
    categories: list(input.categories ?? input.category),
    status: canonicalStatus(input.status, procurement_type),
    source_program: clean(input.source_program),
    source_stream: clean(input.source_stream) ?? (procurement_type === "contract-award" ? "historical" : "live"),
    related_opportunity_id: clean(input.related_opportunity_id ?? input.atm_id),
    parent_contract_id: clean(input.parent_contract_id),
    amendment_id: clean(input.amendment_id),
    raw_source: input,
    extracted_at: extractedAt,
    last_updated: isoDate(input.last_updated) ?? extractedAt,
    extraction_method: clean(input.extraction_method) ?? policy.extraction_method,
    access_basis: clean(input.access_basis) ?? policy.access,
  };
  const classification = classifyIngestedRecord(record);
  const isHistorical = record.source_stream === "historical" || ["awarded", "closed"].includes(record.status);
  record.geotech_relevance = isHistorical ? "archive" : classification.record_kind;
  record.geotech_score = classification.geotechRelevanceScore;
  record.geotech_tier = classification.geoTier;
  record.geotech_evidence = classification.positiveKeywordHits;
  record.geotech_required_capabilities = classification.requiredCapabilities;
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
  record.parent_project_id = clean(input.parent_project_id) ?? `project:${stableId(source, record.project_name, record.buyer, record.suburb, record.state)}`;
  record.duplicate_group_id = clean(input.duplicate_group_id) ?? `opportunity:${stableId(record.title, record.buyer, record.closing_date)}`;
  record.candidate_project_key = projectCandidateKey(record);
  return record;
}

export function parseBuyNswLiveRecords(payload, options) {
  return payloadItems(payload, ["items", "results", "opportunities", "data"]).map((item) => {
    const sourceId = item.source_id ?? item.id ?? item.opportunity_id ?? item.tender_id ?? item.reference;
    return normalizeSourceRecord("buy-nsw", {
      ...item,
      source_id: sourceId,
      source_url: item.source_url ?? item.url ?? `https://buy.nsw.gov.au/opportunity/${encodeURIComponent(sourceId)}`,
      title: item.title ?? item.name,
      description: item.description ?? item.summary ?? item.details,
      agency: item.agency ?? item.department,
      buyer: item.buyer ?? item.agency ?? item.department,
      categories: item.categories ?? item.category,
      state: item.state ?? "NSW",
      procurement_type: item.procurement_type ?? item.opportunity_type ?? item.type,
      closing_date: item.closing_date ?? item.closes_at ?? item.close_date,
      published_date: item.published_date ?? item.published_at ?? item.publish_date,
      status: item.status ?? "open",
      source_stream: "live",
    }, options);
  });
}

export function parseBuyNswSearchHtml(html, options = {}) {
  const source = String(html ?? "");
  const total = Number(source.match(/([\d,]+)\s+total opportunities/i)?.[1]?.replace(/,/g, "") ?? 0);
  const displayed = source.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+results/i);
  const resultTotal = Number(displayed?.[1]?.replace(/,/g, "") ?? total);
  const pageLinks = [...source.matchAll(/[?&]page=(\d+)/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
  const totalPages = Math.max(1, ...pageLinks, resultTotal ? Math.ceil(resultTotal / 10) : 1);
  const baseUrl = options.baseUrl ?? "https://buy.nsw.gov.au/opportunity/search/";
  const blocks = source.split(/(?=<li[^>]*>\s*<h3[^>]*>)/i)
    .filter((block) => /^<li[^>]*>\s*<h3[^>]*>/i.test(block));
  const records = [];

  for (const block of blocks) {
    const linkMatch = block.match(/href=["']([^"']*\/(?:prcOpportunity|scheme)\/[^"']+)["']/i);
    if (!linkMatch) continue;
    const title = htmlText(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const sourceId = htmlText(block.match(/<ul[^>]*class=["'][^"']*pills[^"']*["'][^>]*>[\s\S]*?<li[^>]*>([\s\S]*?)<\/li>/i)?.[1])
      ?? decodeURIComponent(linkMatch[1].split("/").filter(Boolean).at(-1) ?? "");
    if (!title || !sourceId) continue;
    const definitions = new Map([...block.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)]
      .map((match) => [htmlText(match[1])?.toLowerCase(), htmlText(match[2])]));
    const categories = [...block.matchAll(/<p[^>]*class=["'][^"']*subcat[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => htmlText(match[1])).filter(Boolean);
    const closingDate = htmlText(block.match(/<b[^>]*>\s*Closes:\s*<\/b>\s*([\s\S]*?)<\/p>/i)?.[1]);
    const description = htmlText(block.match(/<p[^>]*class=["'][^"']*\blimit\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const procurementType = definitions.get("opportunity type") ?? definitions.get("type") ?? "tender";
    const buyer = definitions.get("agency");
    records.push(normalizeSourceRecord("buy-nsw", {
      source_id: sourceId,
      source_url: absoluteUrl(linkMatch[1], baseUrl),
      title,
      description,
      scope: description,
      buyer,
      agency: buyer,
      categories,
      state: "NSW",
      procurement_type: procurementType,
      closing_date: closingDate,
      status: "open",
      source_stream: "live",
      extraction_method: "html",
    }, options));
  }

  return { records, total: resultTotal || records.length, totalPages };
}

export function parseBuyNswNoticeReportRow(row, options = {}) {
  const noticeType = rowValue(row, ["Notice type", "Type"]);
  const sourceId = rowValue(row, ["CAN ID", "Notice ID", "Contract ID", "Award ID"]);
  const sourceUrl = rowValue(row, ["Notice URL", "Award URL", "URL"])
    ?? "https://buy.nsw.gov.au/notices";
  const contractPeriod = clean(rowValue(row, ["Contract period", "Contract duration"]))?.match(/^(.+?)\s+to\s+(.+)$/i);
  return normalizeSourceRecord("buy-nsw", {
    source_id: sourceId,
    source_url: sourceUrl,
    title: rowValue(row, ["Title", "Notice title", "Contract title", "Tender title"]),
    scope: rowValue(row, ["Scope", "Description", "Contract description", "Details", "Particulars of project"]),
    buyer: rowValue(row, ["Agency", "Department/Agency", "Department", "Buyer"]),
    agency: rowValue(row, ["Agency", "Department/Agency", "Department"]),
    successful_supplier: rowValue(row, ["Contractor name", "Supplier name", "Successful supplier", "Awarded supplier"]),
    supplier_abn: rowValue(row, ["ABN", "Supplier ABN", "Contractor ABN"]),
    contract_value: rowValue(row, [
      "Estimated amount payable to the contractor (including GST)",
      "Estimated amount payable", "Contract value", "Award value", "Value",
    ]),
    published_date: rowValue(row, ["Publish date", "Published date", "Publication date"]),
    award_date: rowValue(row, ["Award date", "Contract award date"]),
    contract_start: rowValue(row, ["Contract start date", "Start date"]) ?? contractPeriod?.[1],
    contract_end: rowValue(row, ["Contract end date", "End date"]) ?? contractPeriod?.[2],
    address: rowValue(row, ["Location", "Location of work", "Region", "Delivery location"]),
    state: "NSW",
    categories: rowValue(row, ["Category", "Industry sector", "UNSPSC"]),
    procurement_type: noticeType,
    tender_method: rowValue(row, ["Procurement method", "Method", "Method of tendering"]),
    related_opportunity_id: rowValue(row, ["Tender ID", "RFT ID", "Opportunity ID", "Related opportunity ID"]),
    amendment_id: rowValue(row, ["Amendment ID", "Amendment number"]),
    status: noticeType,
    source_program: "buy NSW Register of notices",
    source_stream: "historical",
    extraction_method: "csv",
  }, options);
}

export function parseEprocurePayload(payload, { integrationApproved = false, ...options } = {}) {
  if (!integrationApproved) {
    throw new Error("eProcure API ingestion requires approved integration access");
  }
  return payloadItems(payload, ["items", "results", "tenders", "data"]).map((item) => normalizeSourceRecord("eprocure", {
    ...item,
    source_id: item.source_id ?? item.id ?? item.tender_id ?? item.tenderNumber ?? item.reference,
    source_url: item.source_url ?? item.url ?? item.publicUrl,
    title: item.title ?? item.name,
    buyer: item.buyer ?? item.organisation ?? item.organization,
    procurement_type: item.procurement_type ?? item.type ?? item.tenderType,
    published_date: item.published_date ?? item.publishedAt ?? item.publishDate,
    closing_date: item.closing_date ?? item.closesAt ?? item.closeDate,
    contract_value: item.contract_value ?? item.awardValue,
    successful_supplier: item.successful_supplier ?? item.awardedSupplier,
    source_stream: /award|closed/i.test(String(item.status ?? item.type ?? "")) ? "historical" : "live",
  }, options));
}

export function parseAusTenderPayload(payload, { stream = "live", ...options } = {}) {
  if (!["live", "historical"].includes(stream)) throw new Error("AusTender stream must be live or historical");
  return payloadItems(payload, ["items", "results", "contracts", "approachesToMarket", "data"]).map((item) => {
    const historical = stream === "historical";
    return normalizeSourceRecord("austender", {
      ...item,
      source_id: item.source_id ?? item.id ?? item.contract_id ?? item.contractId ?? item.atm_id ?? item.atmId,
      source_url: item.source_url ?? item.url ?? item.publicUrl,
      title: item.title ?? item.description ?? item.name,
      description: item.description ?? item.summary,
      buyer: item.buyer ?? item.agency,
      categories: item.categories ?? item.unspsc_title ?? item.unspscTitle,
      procurement_type: historical ? "contract award" : (item.procurement_type ?? item.type ?? "tender"),
      published_date: item.published_date ?? item.publishDate,
      closing_date: item.closing_date ?? item.closeDate,
      award_date: item.award_date ?? item.publishDate,
      contract_start: item.contract_start ?? item.startDate,
      contract_end: item.contract_end ?? item.endDate,
      contract_value: item.contract_value ?? item.value,
      tender_method: item.tender_method ?? item.procurementMethod,
      successful_supplier: item.successful_supplier ?? item.supplier,
      supplier_abn: item.supplier_abn ?? item.supplierAbn,
      related_opportunity_id: item.related_opportunity_id ?? item.atm_id ?? item.atmId,
      parent_contract_id: item.parent_contract_id ?? item.parentContract,
      status: historical ? "awarded" : (item.status ?? "open"),
      state: item.state ?? "Commonwealth",
      source_stream: stream,
    }, options);
  });
}

export function parseAusTenderAtmHtml(html, options = {}) {
  const source = String(html ?? "");
  const resultTotal = Number(source.match(/Showing\s+\d+\s*-\s*\d+\s+of\s*(?:<[^>]+>\s*)*([\d,]+)/i)?.[1]?.replace(/,/g, "") ?? 0);
  const pageLinks = [...source.matchAll(/[?&]page=(\d+)/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
  const totalPages = Math.max(1, ...pageLinks, resultTotal ? Math.ceil(resultTotal / 15) : 1);
  const baseUrl = options.baseUrl ?? "https://www.tenders.gov.au/Atm";
  const blocks = source.split(/(?=<div[^>]*class=["'][^"']*\brow\b[^"']*["'][^>]*>\s*<div[^>]*class=["'][^"']*col-sm-4)/i)
    .filter((block) => /href=["'][^"']*\/Atm\/Show\//i.test(block));
  const records = [];

  for (const block of blocks) {
    const linkMatch = block.match(/href=["']([^"']*\/Atm\/Show\/[^"']+)["']/i);
    const title = htmlText(block.match(/<p[^>]*class=["'][^"']*\blead\b[^"']*["'][^>]*>[\s\S]*?([\s\S]*?)<\/p>/i)?.[1]);
    if (!linkMatch || !title) continue;
    const fields = new Map([...block.matchAll(/<div[^>]*class=["'][^"']*\blist-desc\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<div[^>]*class=["'][^"']*\blist-desc-inner\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map((match) => [htmlText(match[1])?.replace(/:\s*$/, "").toLowerCase(), htmlText(match[2])]));
    const sourceId = fields.get("atm id") ?? htmlText(block.match(/href=["'][^"']*\/Atm\/Show\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    if (!sourceId) continue;
    const lastUpdated = htmlText(block.match(/<div[^>]*class=["'][^"']*last-updated[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>\s*Last Updated:\s*<\/strong>([\s\S]*?)<\/div>/i)?.[1]);
    records.push(normalizeSourceRecord("austender", {
      source_id: sourceId,
      source_url: absoluteUrl(linkMatch[1], baseUrl),
      title,
      description: fields.get("description"),
      scope: fields.get("description"),
      buyer: fields.get("agency"),
      agency: fields.get("agency"),
      categories: fields.get("category"),
      state: "Commonwealth",
      procurement_type: "tender",
      closing_date: fields.get("close date & time"),
      last_updated: lastUpdated,
      status: "open",
      source_stream: "live",
      extraction_method: "html",
    }, options));
  }

  return { records, total: resultTotal || records.length, totalPages };
}

export function parseEstimateOneHtml(html, options = {}) {
  const source = String(html ?? "");
  const baseUrl = options.baseUrl ?? "https://estimateone.com/tenders/new-south-wales-tenders/";
  const blocks = source.split(/(?=<div[^>]*class=["'][^"']*\bproject-card\b[^"']*["'][^>]*>)/i)
    .filter((block) => /^<div[^>]*class=["'][^"']*\bproject-card\b/i.test(block));
  const records = [];

  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]*class=["'][^"']*\bproject-card__link\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<a[^>]*href=["']([^"']*\/project\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const sourceUrl = absoluteUrl(linkMatch?.[1], baseUrl);
    const title = htmlText(linkMatch?.[2]);
    const sourceId = sourceUrl?.match(/\/project\/([^/?#]+)/i)?.[1];
    if (!sourceUrl || !sourceId || !title) continue;
    const location = htmlText(block.match(/<div[^>]*class=["'][^"']*project-card__location--display_sm[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1])
      ?? htmlText(block.match(/<div[^>]*class=["'][^"']*\bproject-card__location\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const suburb = location?.split(",")[0]?.trim() || null;
    const budget = htmlText(block.match(/<div[^>]*class=["'][^"']*\bproject-card__budget\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\bpoint__text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const category = htmlText(block.match(/<div[^>]*class=["'][^"']*\bproject-card__category\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\bpoint__text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const titleClosingDate = title.match(/Tender\s+Close:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1];
    records.push(normalizeSourceRecord("estimateone", {
      source_id: sourceId,
      source_url: sourceUrl,
      title,
      description: [category && `Category: ${category}`, location && `Location: ${location}`, budget && `Public value range: ${budget}`].filter(Boolean).join(". "),
      project_name: title,
      sector: category,
      categories: category,
      address: location,
      suburb,
      state: stateFromLocation(location) ?? "NSW",
      estimated_value: monetaryUpperBound(budget),
      closing_date: titleClosingDate,
      procurement_type: "project pipeline",
      status: titleClosingDate ? statusFromClosingDate(titleClosingDate, options.extractedAt) : "planned",
      source_program: "EstimateOne public tender listings",
      source_stream: "live",
      extraction_method: "html",
      access_basis: "public-metadata",
    }, options));
  }

  return records;
}

export function parseTenderLinkPublicHtml(html, options = {}) {
  const source = String(html ?? "");
  const baseUrl = options.baseUrl ?? "https://illion.tenderlink.com/tenders/all/australasia/australia/new-south-wales?keywords=";
  const blocks = source.split(/(?=<div[^>]*class=["'][^"']*\brow\b[^"']*["'][^>]*>\s*<div[^>]*class=["'][^"']*col-md-9)/i)
    .filter((block) => /illion\s+TenderLink\s+Ref/i.test(block));
  const records = [];

  for (const block of blocks) {
    const title = htmlText(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1]);
    const region = htmlText(block.match(/<strong[^>]*>\s*State\/Region:\s*<\/strong>\s*([\s\S]*?)<\/p>/i)?.[1]);
    const fields = new Map([...block.matchAll(/<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*:\s*([\s\S]*?)<\/p>/gi)]
      .map((match) => [htmlText(match[1])?.toLowerCase(), htmlText(match[2])]));
    const sourceId = fields.get("illion tenderlink ref");
    const closingDate = fields.get("closing date");
    if (!sourceId || !title) continue;
    records.push(normalizeSourceRecord("tenderlink", {
      source_id: sourceId,
      source_url: `${baseUrl}#${encodeURIComponent(sourceId)}`,
      title,
      description: [fields.get("notice type"), region].filter(Boolean).join(". "),
      buyer: fields.get("organisation"),
      organisation: fields.get("organisation"),
      address: region,
      state: stateFromLocation(region) ?? "NSW",
      closing_date: closingDate,
      procurement_type: fields.get("notice type") ?? "tender",
      status: statusFromClosingDate(closingDate, options.extractedAt),
      source_program: "TenderLink public listings",
      source_stream: "live",
      extraction_method: "html",
      access_basis: "public-metadata",
    }, options));
  }

  return records;
}

export function parseAustralianTendersPayload(payload, options = {}) {
  const items = Array.isArray(payload?.records) ? payload.records : [];
  const baseUrl = options.baseUrl ?? "https://www.australiantenders.com.au/search/tenders/";
  const pageSize = Math.max(1, Number(options.pageSize) || 100);
  const records = items.map((item) => {
    const sourceId = item.id;
    const publicBuyer = clean(item.issuer) && !/sign[ -]?up|subscribe|login/i.test(String(item.issuer)) ? item.issuer : null;
    return normalizeSourceRecord("australian-tenders", {
      source_id: sourceId,
      source_url: absoluteUrl(`/tenders/${encodeURIComponent(sourceId)}/${encodeURIComponent(item.slug ?? "tender")}`, baseUrl),
      title: item.title,
      description: item.overview,
      scope: item.overview,
      buyer: publicBuyer,
      organisation: publicBuyer,
      address: item.region,
      state: stateFromLocation(item.region),
      closing_date: item.closingDate,
      procurement_type: "tender",
      status: item.status ?? "open",
      source_program: "Australian Tenders public search",
      source_stream: "live",
      extraction_method: "api",
      access_basis: "public-metadata",
    }, options);
  });
  const total = Math.max(0, Number(payload?.recordsTotal) || records.length);
  return { records, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function parseBciCentralHtml(html, options = {}) {
  const source = String(html ?? "");
  const baseUrl = options.baseUrl ?? "https://www.bcicentral.com/find-projects/";
  const blocks = source.split(/(?=<div[^>]*class=["'][^"']*\bsearch-details\b[^"']*["'][^>]*>)/i)
    .filter((block) => /Project\s+ID/i.test(block));
  const records = [];

  for (const block of blocks) {
    const fields = new Map([...block.matchAll(/<li[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*:\s*<span[^>]*class=["'][^"']*\bresult_content\b[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi)]
      .map((match) => [htmlText(match[1])?.toLowerCase(), htmlText(match[2])]));
    const sourceId = fields.get("project id") ?? block.match(/data-projectid=["']([^"']+)["']/i)?.[1];
    const projectType = fields.get("project type");
    const location = fields.get("location");
    if (!sourceId || !projectType) continue;
    const sector = fields.get("sector");
    const stage = fields.get("stage");
    const publicValue = fields.get("approximate value");
    const title = [projectType, location].filter(Boolean).join(" — ");
    records.push(normalizeSourceRecord("bci-central", {
      source_id: sourceId,
      source_url: `${baseUrl}#project-${encodeURIComponent(sourceId)}`,
      title,
      description: [stage && `Stage: ${stage}`, sector && `Sector: ${sector}`, location && `Location: ${location}`, publicValue && `Approximate value: ${publicValue}`].filter(Boolean).join(". "),
      project_name: title,
      project_type: projectType,
      sector,
      categories: sector,
      address: location,
      suburb: location?.split(",")[0]?.trim(),
      state: stateFromLocation(location),
      estimated_value: monetaryUpperBound(publicValue),
      procurement_type: "project pipeline",
      status: /construction|design|documentation|pre-construction|concept/i.test(stage ?? "") ? "planned" : "unknown",
      source_program: "BCI Central anonymous public project search",
      source_stream: "live",
      extraction_method: "html",
      access_basis: "public-metadata",
    }, options));
  }

  return records;
}

export function parseIcnPayload(payload, options) {
  const projects = payloadItems(payload?.projects ?? payload, ["projects"]);
  const packages = payloadItems(payload?.work_packages ?? payload?.packages ?? [], ["items", "packages"]);
  const projectRecords = projects.map((project) => {
    const projectId = project.source_id ?? project.id ?? project.project_id;
    return normalizeSourceRecord("icn", {
      ...project,
      source_id: projectId,
      source_url: project.source_url ?? project.url,
      title: project.title ?? project.name,
      project_name: project.project_name ?? project.title ?? project.name,
      buyer: project.buyer ?? project.owner ?? project.client,
      estimated_value: project.estimated_value ?? project.project_value,
      procurement_type: project.procurement_type ?? "project pipeline",
      parent_project_id: `project:icn:${projectId}`,
      status: project.status ?? "planned",
      source_stream: "live",
    }, options);
  });
  const parentBySourceId = new Map(projectRecords.map((record) => [record.source_id, record.parent_project_id]));
  const packageRecords = packages.map((workPackage) => {
    const sourceId = workPackage.source_id ?? workPackage.id ?? workPackage.package_id;
    const projectId = clean(workPackage.project_id ?? workPackage.parent_project_source_id);
    return normalizeSourceRecord("icn", {
      ...workPackage,
      source_id: sourceId,
      source_url: workPackage.source_url ?? workPackage.url,
      title: workPackage.title ?? workPackage.name,
      project_name: workPackage.project_name ?? projects.find((project) => String(project.id ?? project.project_id) === projectId)?.name,
      buyer: workPackage.buyer ?? workPackage.organisation ?? workPackage.client,
      procurement_type: workPackage.procurement_type ?? workPackage.type ?? "eoi",
      closing_date: workPackage.closing_date ?? workPackage.close_date,
      parent_project_id: parentBySourceId.get(projectId) ?? `project:icn:${projectId}`,
      status: workPackage.status ?? "open",
      source_stream: "live",
    }, options);
  });
  return [...projectRecords, ...packageRecords];
}

export function validateCanonicalRecord(record) {
  const missing = REQUIRED_CANONICAL_FIELDS.filter((field) => record?.[field] === null || record?.[field] === undefined || record?.[field] === "");
  return { valid: missing.length === 0, missing };
}

export function findDuplicateGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const values = groups.get(record.duplicate_group_id) ?? [];
    values.push(record);
    groups.set(record.duplicate_group_id, values);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([duplicate_group_id, values]) => ({ duplicate_group_id, opportunity_ids: values.map(({ opportunity_id }) => opportunity_id) }));
}

export function findProjectLinkCandidates(records) {
  const groups = new Map();
  for (const record of records) {
    if (!record.candidate_project_key) continue;
    const values = groups.get(record.candidate_project_key) ?? [];
    values.push(record);
    groups.set(record.candidate_project_key, values);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length > 1 && new Set(values.map(({ source }) => source)).size > 1)
    .map(([candidate_project_key, values]) => ({
      candidate_project_key,
      review_required: true,
      opportunity_ids: values.map(({ opportunity_id }) => opportunity_id),
    }));
}

export function scoreIngestedRecord(record, context = {}) {
  const capability = scoreCapabilityMatch(record.geotech_required_capabilities, context.capabilityMatrix);
  const serviceCount = ["boreholes", "rock_coring", "cpt", "spt", "dcp", "groundwater", "lab_testing", "pavement", "piling", "inspection"]
    .filter((field) => record[field]).length;
  const value = record.estimated_value ?? record.contract_value;
  const locationText = `${record.suburb ?? ""} ${record.state ?? ""}`;
  const locationFit = /sydney/i.test(locationText) ? 100 : /nsw/i.test(locationText) ? 90 : 50;
  const now = context.now ? new Date(context.now) : new Date();
  const closes = record.closing_date ? new Date(record.closing_date) : null;
  const closingWithin14Days = closes && Number.isFinite(closes.valueOf())
    ? closes.valueOf() >= now.valueOf() && closes.valueOf() - now.valueOf() <= 14 * 86_400_000
    : false;
  return scoreOpportunityComponents({
    geotechRelevance: record.geotech_score,
    capabilityMatch: capability.score,
    commercialValue: commercialValueScore(value),
    procurementReadiness: procurementReadinessScore(record),
    relationshipStrength: context.relationshipStrength ?? 50,
    clientPriority: context.clientPriority ?? 50,
    competitivePosition: context.competitivePosition ?? 50,
    bundleFit: serviceCount >= 3 ? 90 : serviceCount >= 2 ? 70 : 40,
    locationFit,
    sourceQuality: sourceQualityScore(record),
    capabilityGap: capability.capabilityGap,
    turnkeyPackage: serviceCount >= 3,
    closingWithin14Days,
    earlyMoverSignal: record.geotech_relevance === "potential_geotech_lead",
    ...context.adjustments,
  });
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

function labelledHtmlValue(value, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(value ?? "").match(new RegExp(`<b[^>]*>\\s*${escaped}\\s*:?[\\s]*<\\/b>\\s*:?[\\s]*([\\s\\S]*?)(?=<br\\s*\\/?>\\s*<br|<br\\s*\\/?>\\s*<b|$)`, "i"));
  return htmlText(match?.[1]?.replace(/\]\]>\s*$/, ""));
}

export function parseVendorPanelRss(xml, options) {
  const items = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item) => {
    const rawDescription = item.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i)?.[1]
      ?? item.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i)?.[1];
    const description = xmlValue(item, ["description", "content:encoded"]);
    const reference = labelledHtmlValue(rawDescription, "Reference number");
    const buyer = labelledHtmlValue(rawDescription, "Issued by") ?? xmlValue(item, ["author", "dc:creator"]);
    const closingDate = labelledHtmlValue(rawDescription, "Closing Date");
    const scope = labelledHtmlValue(rawDescription, "Tender Details") ?? description;
    return normalizeSourceRecord("vendorpanel", {
      source_id: reference ?? xmlValue(item, ["guid"]) ?? xmlValue(item, ["link"]),
      source_url: xmlValue(item, ["link"]),
      title: xmlValue(item, ["title"]),
      description,
      scope,
      buyer,
      organisation: buyer,
      state: vendorPanelState(buyer, description),
      categories: [...new Set((item.match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi) ?? [])
        .map((category) => decodeXml(category.replace(/^<category(?:\s[^>]*)?>|<\/category>$/gi, "")))
        .filter(Boolean))],
      procurement_type: "tender",
      closing_date: closingDate,
      published_date: xmlValue(item, ["pubDate", "dc:date"]),
      status: "open",
    }, options);
  });
}

export function parseTenderNotification(source, message, options) {
  if (!["tenderlink", "estimateone"].includes(source)) throw new Error("Email ingestion is limited to authorised TenderLink and EstimateOne notifications");
  const body = String(message.text ?? message.body ?? "").replace(/\r/g, "");
  const value = (label) => body.match(new RegExp(`(?:^|\\n)${label}\\s*[:#-]\\s*([^\\n]+)`, "i"))?.[1];
  const url = message.source_url ?? body.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.;]+$/, "");
  const sourceId = message.source_id ?? value("(?:Tender|Project) ID") ?? message.message_id;
  const isAddendum = /\b(?:addendum|addenda|clarification)\b/i.test(`${message.subject ?? ""} ${body}`);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return normalizeSourceRecord(source, {
    source_id: sourceId,
    source_url: url,
    title: message.title ?? message.subject,
    description: body,
    organisation: value("(?:Organisation|Builder|Client)"),
    project_name: value("Project"),
    estimated_value: value("(?:Project )?Value"),
    sector: value("Sector"),
    consultants: value("Consultants?"),
    suburb: value("(?:Location|Suburb)"),
    closing_date: value("(?:Closing|Close) Date"),
    documents: isAddendum ? [] : attachments,
    addenda: isAddendum ? attachments : [],
    status: "open",
    extraction_method: "email",
    access_basis: source === "tenderlink" ? "authorised-notification" : "authorised-alert",
  }, options);
}

export const supportedSourcePolicies = SOURCE_POLICIES;
