import { createHash } from "node:crypto";

export const MASTER_SCHEMA_VERSION = 1;

export const MASTER_COLUMNS = [
  "recordId",
  "tenderId",
  "contractId",
  "title",
  "scope",
  "agency",
  "supplierName",
  "supplierCanonical",
  "supplierABN",
  "awardValue",
  "currency",
  "publishDate",
  "awardDate",
  "startDate",
  "endDate",
  "location",
  "jurisdiction",
  "category",
  "procurementMethod",
  "tenderUrl",
  "awardUrl",
  "geotechScore",
  "geotechRelevant",
  "matchedTerms",
  "serviceTypes",
  "competitorGroup",
  "sourcePortal",
  "sourceUrl",
  "sourceRecordId",
  "tenderMatchStatus",
  "scopeSource",
  "collectedAt",
  "provenance",
];

const TERM_RULES = [
  { term: "geotechnical", pattern: /\bgeotechnical\b/i, score: 50, service: "Geotechnical consulting" },
  { term: "geotech", pattern: /\bgeotech\b/i, score: 45, service: "Geotechnical consulting" },
  { term: "ground investigation", pattern: /\bground investigation\b/i, score: 45, service: "Ground investigation" },
  { term: "soil investigation", pattern: /\bsoil investigation\b/i, score: 40, service: "Ground investigation" },
  { term: "subsurface investigation", pattern: /\bsub[ -]?surface investigation\b/i, score: 45, service: "Ground investigation" },
  { term: "subsurface", pattern: /\bsub[ -]?surface\b/i, score: 20, service: "Ground investigation" },
  { term: "foundation investigation", pattern: /\bfoundation investigation\b/i, score: 40, service: "Foundation investigation" },
  { term: "borehole", pattern: /\bbore[ -]?holes?\b/i, score: 35, service: "Boreholes" },
  { term: "rock coring", pattern: /\brock cor(?:e|ing)\b/i, score: 38, service: "Rock coring" },
  { term: "core drilling", pattern: /\bcore drilling\b/i, score: 30, service: "Rock coring" },
  { term: "CPT/CPTu", pattern: /\bCPTu?\b/i, score: 42, service: "CPT/CPTu" },
  { term: "pavement investigation", pattern: /\bpavement (?:condition |geotechnical )?investigation\b/i, score: 38, service: "Pavement investigation" },
  { term: "DCP", pattern: /\bdynamic cone penetrometer\b|\bdcp (?:testing|tests?|investigation)\b|\b(?:pavement|subgrade|soil|geotechnical).{0,80}\bdcp\b|\bdcp\b.{0,80}\b(?:pavement|subgrade|soil|geotechnical)\b/i, score: 32, service: "DCP" },
  { term: "groundwater monitoring", pattern: /\bgroundwater (?:level )?monitoring\b/i, score: 28, service: "Groundwater monitoring" },
  { term: "slope stability", pattern: /\bslope stability\b/i, score: 30, service: "Slope stability" },
  { term: "geotechnical instrumentation", pattern: /\bgeotechnical instrumentation\b/i, score: 42, service: "Geotechnical instrumentation" },
  { term: "soil testing", pattern: /\bsoil (?:laboratory )?testing\b/i, score: 28, service: "Soil testing" },
  { term: "rock testing", pattern: /\brock (?:laboratory )?testing\b/i, score: 28, service: "Rock testing" },
  { term: "test pit", pattern: /\btest pits?\b/i, score: 18, service: "Test pits" },
  { term: "drilling", pattern: /\bdrill(?:ing|holes?| rigs?)\b/i, score: 18, service: "Drilling" },
  { term: "site investigation", pattern: /\bsite investigation\b/i, score: 18, service: "Site investigation" },
  { term: "foundation design", pattern: /\bfoundation (?:assessment|design)\b/i, score: 16, service: "Foundation engineering" },
  { term: "soil sampling", pattern: /\bsoil sampl(?:e|es|ing)\b/i, score: 20, service: "Soil sampling" },
  { term: "rock mechanics", pattern: /\brock mechanics\b/i, score: 24, service: "Rock engineering" },
  { term: "geophysical investigation", pattern: /\bgeophysical (?:investigation|survey|services?)\b/i, score: 28, service: "Geophysical investigation" },
  { term: "construction materials testing", pattern: /\b(?:construction )?materials testing\b/i, score: 20, service: "Construction materials testing" },
  { term: "environmental site investigation", pattern: /\benvironmental site (?:assessment|investigation)\b/i, score: 22, service: "Environmental site investigation" },
  { term: "acid sulfate soils", pattern: /\bacid sulfate soils?\b/i, score: 20, service: "Acid sulfate soil assessment" },
  { term: "permeability testing", pattern: /\bpermeability testing\b/i, score: 24, service: "Permeability testing" },
  { term: "piezometer", pattern: /\bpiezometers?\b/i, score: 24, service: "Groundwater monitoring" },
  { term: "monitoring well", pattern: /\bmonitoring wells?\b/i, score: 22, service: "Groundwater monitoring" },
];

const SUPPORTING_PATTERN = /\b(engineering|civil|earthworks?|tunnel|bridge|road|rail|highway|dam|embankment|subgrade|foundation|landslide|retaining wall)\b/i;
const SUPPLY_ONLY_PATTERN = /\b(supplies|supply only|equipment hire|spare parts|consumables)\b/i;

const COMPETITOR_RULES = [
  ["Douglas Partners", /\bdouglas partners\b/i],
  ["WSP", /\bwsp\b|\bparsons brinckerhoff\b/i],
  ["GHD", /\bghd\b/i],
  ["Aurecon", /\baurecon\b/i],
  ["Tetra Tech", /\btetra tech\b|\bcoffey\b/i],
  ["SMEC", /\bsmec\b/i],
  ["AECOM", /\baECOM\b/i],
  ["Arcadis", /\barcadis\b/i],
  ["Jacobs", /\bjacobs\b/i],
  ["Stantec", /\bstantec\b/i],
  ["SNC-Lavalin / AtkinsRealis", /\batkinsr[eé]alis\b|\bsnc[- ]lavalin\b/i],
];

const COMPANY_SUFFIXES = new Set([
  "pty", "ltd", "limited", "proprietary", "inc", "incorporated", "llc", "llp",
  "plc", "company", "co", "australia", "australian", "holdings", "group",
]);

export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#x2f;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text.replace(/^(\w+),\s+(\d{1,2})\s+(\d{4})/, "$1 $2 $3"));
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

export function normalizeMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCompanyName(value) {
  const display = cleanText(value);
  if (!display) return null;
  const tokens = display
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(" ");
}

export function identifyCompetitor(value) {
  const name = cleanText(value) ?? "";
  return COMPETITOR_RULES.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}

export function classifyGeotechnical(record, threshold = 25) {
  const title = cleanText(record.title) ?? "";
  const scope = cleanText(record.scope ?? record.description) ?? "";
  const category = cleanText(record.category) ?? "";
  const fullText = `${title}. ${scope}. ${category}`;
  const matchedTerms = [];
  const serviceTypes = [];
  let score = 0;

  for (const rule of TERM_RULES) {
    const inTitle = rule.pattern.test(title);
    const inBody = rule.pattern.test(`${scope}. ${category}`);
    if (!inTitle && !inBody) continue;
    matchedTerms.push(rule.term);
    serviceTypes.push(rule.service);
    score += Math.round(rule.score * (inTitle ? 1.2 : 1));
  }

  if (matchedTerms.length >= 2 && SUPPORTING_PATTERN.test(fullText)) score += 10;
  else if (matchedTerms.length >= 1 && SUPPORTING_PATTERN.test(fullText)) score += 8;
  if (SUPPLY_ONLY_PATTERN.test(fullText) && !/\bgeotechnical\b|\bground investigation\b/i.test(fullText)) score -= 15;
  score = Math.max(0, Math.min(100, score));

  return {
    geotechScore: score,
    geotechRelevant: score >= threshold,
    matchedTerms: [...new Set(matchedTerms)],
    serviceTypes: [...new Set(serviceTypes)],
  };
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compact(values) {
  return values.map(cleanText).filter(Boolean);
}

export function buildRecord(input, threshold = 25) {
  const supplierName = cleanText(input.supplierName);
  const supplierCanonical = normalizeCompanyName(supplierName);
  const title = cleanText(input.title);
  const scope = compact([input.scope, input.description]).join(". ") || null;
  const classification = classifyGeotechnical({ title, scope, category: input.category }, threshold);
  const sourcePortal = cleanText(input.sourcePortal) ?? "Unknown";
  const sourceRecordId = cleanText(input.sourceRecordId ?? input.contractId ?? input.tenderId);
  const identity = compact([
    sourcePortal,
    sourceRecordId,
    supplierCanonical,
    input.agency,
    title,
    input.awardValue,
  ]).join("|");

  const tenderId = cleanText(input.tenderId);
  return {
    schemaVersion: MASTER_SCHEMA_VERSION,
    recordId: input.recordId ?? stableHash(identity).slice(0, 24),
    tenderId,
    contractId: cleanText(input.contractId),
    title,
    scope,
    agency: cleanText(input.agency),
    supplierName,
    supplierCanonical,
    supplierABN: cleanText(input.supplierABN)?.replace(/\s+/g, "") ?? null,
    awardValue: normalizeMoney(input.awardValue),
    currency: cleanText(input.currency) ?? "AUD",
    publishDate: normalizeDate(input.publishDate),
    awardDate: normalizeDate(input.awardDate),
    startDate: normalizeDate(input.startDate),
    endDate: normalizeDate(input.endDate),
    location: cleanText(input.location),
    jurisdiction: cleanText(input.jurisdiction),
    category: cleanText(input.category),
    procurementMethod: cleanText(input.procurementMethod),
    tenderUrl: cleanText(input.tenderUrl),
    awardUrl: cleanText(input.awardUrl),
    ...classification,
    competitorGroup: identifyCompetitor(supplierName),
    sourcePortal,
    sourceUrl: cleanText(input.sourceUrl),
    sourceRecordId,
    tenderMatchStatus: cleanText(input.tenderMatchStatus) ?? (tenderId ? "matched" : "award-only"),
    scopeSource: cleanText(input.scopeSource),
    collectedAt: cleanText(input.collectedAt) ?? new Date().toISOString(),
    provenance: input.provenance ?? {},
  };
}

export function normalizeAusTenderRecord(record, localSource, threshold = 25) {
  const supplierNames = Array.isArray(record.supplier) ? record.supplier : [record.supplier];
  return supplierNames.filter(Boolean).map((supplierName) => buildRecord({
    tenderId: record.ocid,
    contractId: record.noticeId,
    title: record.title,
    scope: record.description,
    agency: record.buyer,
    supplierName,
    awardValue: record.valueAmount,
    currency: record.currency,
    publishDate: record.publishedAt,
    awardDate: record.awardDate,
    startDate: record.contractStart,
    endDate: record.contractEnd,
    jurisdiction: "Commonwealth",
    category: record.unspscCodes?.map((code) => `UNSPSC ${code}`).join("; "),
    procurementMethod: record.procurementMethodDetails ?? record.procurementMethod,
    tenderUrl: record.ocid ? `https://api.tenders.gov.au/ocds/findById/${encodeURIComponent(record.ocid)}` : null,
    awardUrl: record.noticeId ? `https://www.tenders.gov.au/Cn/Show/${encodeURIComponent(record.noticeId)}` : null,
    sourcePortal: "AusTender",
    sourceUrl: record.sourceUrl,
    sourceRecordId: record.noticeId ?? record.releaseId ?? record.ocid,
    tenderMatchStatus: record.ocid ? "contracting-process-match" : "award-only",
    scopeSource: "AusTender contract/tender description",
    collectedAt: record.collectedAt,
    provenance: {
      sourceSystem: record.source,
      localSource,
      ocid: record.ocid ?? null,
      releaseId: record.releaseId ?? null,
      extractionMethod: "official-oCDS-api",
    },
  }, threshold));
}

export function normalizeNswOcdsRelease(release, sourceUrl, collectedAt, threshold = 25) {
  const tender = release.tender ?? {};
  return (release.awards ?? []).flatMap((award) => {
    const suppliers = award.suppliers?.length ? award.suppliers : [{}];
    const itemDescriptions = compact([
      ...(tender.items ?? []).map((item) => item.description),
      ...(award.items ?? []).map((item) => item.description),
      award.summaryOfInfo,
      award.otherKeyElements,
      award.descriptionServices,
    ]);
    const categories = compact([
      ...(tender.items ?? []).map((item) => item.classification?.description ?? item.classification?.id),
      ...(award.items ?? []).map((item) => item.classification?.description ?? item.classification?.id),
    ]);
    const location = compact([
      award.industrialRelationsDetails?.locationOfWork,
      ...(award.items ?? []).map((item) => item.deliveryLocation?.description),
    ]).join("; ") || null;
    const canId = cleanText(award.id ?? award.CNUUID);
    const tenderId = cleanText(tender.id ?? award.RFTID);
    const buyer = award.buyer?.name ?? release.buyer?.name;

    return suppliers.map((supplier) => buildRecord({
      tenderId,
      contractId: canId,
      title: award.title ?? tender.title ?? tender.description,
      scope: compact([tender.description, ...itemDescriptions]).join(". "),
      agency: buyer,
      supplierName: supplier.name ?? supplier.identifier?.legalName,
      supplierABN: supplier.identifier?.scheme === "AU-ABN" ? supplier.identifier.id : null,
      awardValue: award.value?.amount,
      currency: award.value?.currency,
      publishDate: award.publishedDate ?? release.publishDate ?? release.date,
      awardDate: award.date,
      startDate: award.contractPeriod?.startDate,
      endDate: award.contractPeriod?.endDate,
      location,
      jurisdiction: "NSW",
      category: [...new Set(categories)].join("; "),
      procurementMethod: award.eTenderProcurementMethod ?? award.procurementMethod ?? tender.procurementMethod,
      tenderUrl: tenderId ? `https://buy.nsw.gov.au/opportunities/${encodeURIComponent(tenderId)}` : null,
      awardUrl: "https://buy.nsw.gov.au/notices",
      sourcePortal: "NSW eTendering archive",
      sourceUrl,
      sourceRecordId: award.CNUUID ?? canId ?? release.ocid,
      tenderMatchStatus: tenderId ? "source-id-match" : "award-only",
      scopeSource: tender.description ? "NSW tender and award item descriptions" : "NSW award item descriptions",
      collectedAt,
      provenance: {
        sourceSystem: "NSW Treasury eTendering",
        archive: "Open Contracting Data Registry publication 11",
        ocid: release.ocid ?? null,
        releaseId: release.id ?? null,
        extractionMethod: "official-ocds-archive",
        license: "CC BY 3.0 AU",
      },
    }, threshold));
  });
}

export function dedupeKey(record) {
  if (record.contractId) {
    return stableHash(compact([
      record.jurisdiction,
      record.sourcePortal,
      record.contractId,
      record.supplierCanonical,
    ]).join("|")).slice(0, 32);
  }
  return stableHash(compact([
    record.jurisdiction,
    record.contractId ?? record.tenderId,
    record.agency,
    record.supplierCanonical,
    record.title,
    record.awardValue,
    record.startDate,
  ]).join("|")).slice(0, 32);
}

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsvLine(record, columns = MASTER_COLUMNS) {
  return `${columns.map((column) => csvCell(record[column])).join(",")}\n`;
}

export function makeRagChunk(record) {
  const text = compact([
    record.title,
    record.scope,
    record.agency && `Agency: ${record.agency}`,
    record.supplierName && `Awarded supplier: ${record.supplierName}`,
    record.awardValue != null && `Award value: ${record.currency} ${record.awardValue}`,
    record.location && `Location: ${record.location}`,
    record.category && `Category: ${record.category}`,
    record.serviceTypes?.length && `Detected services: ${record.serviceTypes.join(", ")}`,
  ]).join(". ");
  return {
    id: record.recordId,
    sourceType: "historical-geotech-award",
    title: record.title ?? "Historical awarded contract",
    text,
    source: record.sourcePortal,
    sourceUrl: record.awardUrl ?? record.sourceUrl,
    tags: [
      "historical-award",
      record.jurisdiction,
      ...record.serviceTypes,
      ...record.matchedTerms,
    ].filter(Boolean),
    metadata: {
      tenderId: record.tenderId,
      contractId: record.contractId,
      agency: record.agency,
      supplierName: record.supplierName,
      awardValue: record.awardValue,
      currency: record.currency,
      geotechScore: record.geotechScore,
      sourceRecordId: record.sourceRecordId,
    },
  };
}
