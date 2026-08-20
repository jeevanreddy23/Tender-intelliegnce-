import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import parquet from "parquetjs-lite";
import { analyseScopeBundle, extractUnspscCodes } from "../lib/strategic-insights.js";
import {
  DEFAULT_CAPABILITY_MATRIX,
  classifyGeotechTier,
  scoreCapabilityMatch,
  scoreOpportunityComponents,
} from "../lib/opportunity-intelligence.js";
import { ML_COLUMN_NAMES, ML_FIELD_DEFINITIONS } from "../lib/ml-dataset-schema.js";

const MODEL_VERSION = "contextual-rules-2.0.0";

function parseArgs(argv) {
  const options = {
    input: "data/historical-geotech/master-awards.ndjson",
    output: "data/ml-tender-dataset",
    minimumFee: 20_000,
    limit: Infinity,
    parquet: true,
  };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (["input", "output"].includes(key)) options[key] = value;
    if (key === "minimum-fee") options.minimumFee = Number(value);
    if (key === "limit") options.limit = Number(value);
    if (key === "skip-parquet") options.parquet = false;
  }
  return options;
}

function hash(...parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 24);
}

function canonical(value) {
  return String(value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim() || null;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(columns, row) {
  return `${columns.map((column) => csvCell(row[column])).join(",")}\n`;
}

async function write(stream, content) {
  if (!stream.write(content)) await new Promise((resolveDrain) => stream.once("drain", resolveDrain));
}

function dateDiff(start, end) {
  if (!start || !end) return null;
  const left = Date.parse(start);
  const right = Date.parse(end);
  return Number.isFinite(left) && Number.isFinite(right) ? Math.round((right - left) / 86_400_000) : null;
}

function financialYear(date) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return null;
  const year = parsed.getUTCFullYear();
  return parsed.getUTCMonth() >= 6 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function valueBand(value) {
  if (!Number.isFinite(value)) return "Unknown";
  if (value < 20_000) return "Under $20k";
  if (value < 150_000) return "$20k-$149k";
  if (value < 500_000) return "$150k-$499k";
  if (value < 1_000_000) return "$500k-$999k";
  if (value < 5_000_000) return "$1m-$4.99m";
  return "$5m+";
}

function commercialScore(value, minimumFee) {
  if (!Number.isFinite(value) || value <= 0) return 35;
  if (value < minimumFee) return 10;
  if (value < 150_000) return 62;
  if (value < 500_000) return 78;
  if (value < 2_000_000) return 90;
  return 96;
}

function sourceQuality(sourcePortal) {
  if (/austender|buy\.nsw|nsw etender/i.test(sourcePortal ?? "")) return 95;
  return 75;
}

function serviceTypes(record, bundle) {
  return [...new Set([...(record.serviceTypes ?? []), ...bundle.capabilities.map(({ label }) => label)])];
}

function buildCanonicalRow(record, minimumFee) {
  const classification = classifyGeotechTier(record);
  const bundle = analyseScopeBundle(record);
  const capability = scoreCapabilityMatch(classification.requiredCapabilities, DEFAULT_CAPABILITY_MATRIX);
  const amount = Number(record.awardValue);
  const awardValue = Number.isFinite(amount) ? amount : null;
  const minimumFeePass = awardValue === null ? null : awardValue >= minimumFee;
  const sourceScore = sourceQuality(record.sourcePortal);
  const components = scoreOpportunityComponents({
    geotechRelevance: classification.geotechRelevanceScore,
    capabilityMatch: capability.score,
    commercialValue: commercialScore(awardValue, minimumFee),
    procurementReadiness: 100,
    relationshipStrength: 50,
    clientPriority: 50,
    competitivePosition: 50,
    bundleFit: bundle.isTurnkey ? 95 : bundle.isBundled ? 75 : 35,
    locationFit: 50,
    sourceQuality: sourceScore,
    belowMinimumFee: minimumFeePass === false,
    capabilityGap: capability.capabilityGap,
    turnkeyPackage: bundle.isTurnkey,
  });
  const publishDate = record.publishDate ?? null;
  const awardDate = record.awardDate ?? null;
  const agencyCanonical = canonical(record.agency);
  const supplierCanonical = record.supplierCanonical ?? canonical(record.supplierName);
  const agencyId = agencyCanonical ? hash("agency", agencyCanonical) : null;
  const supplierId = supplierCanonical ? hash("supplier", supplierCanonical) : null;
  const tenderId = record.tenderId ?? record.contractId ?? record.sourceRecordId ?? null;
  const projectName = null;
  const extractedServices = serviceTypes(record, bundle);
  const row = Object.fromEntries(ML_COLUMN_NAMES.map((name) => [name, null]));
  Object.assign(row, {
    schema_version: 1,
    record_id: record.recordId,
    tender_id: tenderId,
    contract_id: record.contractId,
    notice_id: record.sourceRecordId,
    source_record_id: record.sourceRecordId,
    source_portal: record.sourcePortal ?? "Unknown",
    source_url: record.sourceUrl,
    tender_url: record.tenderUrl,
    award_url: record.awardUrl,
    jurisdiction: record.jurisdiction,
    source_quality_score: sourceScore,
    collected_at: record.collectedAt ?? new Date().toISOString(),
    provenance_json: record.provenance ?? null,
    title: record.title,
    description: record.scope,
    scope_text: record.scope,
    category: record.category,
    unspsc_codes: extractUnspscCodes(record),
    procurement_method: record.procurementMethod,
    opportunity_type: "award",
    tender_status: "awarded",
    document_urls_json: [record.tenderUrl, record.awardUrl].filter(Boolean),
    scope_source: record.scopeSource,
    tender_match_status: record.tenderMatchStatus,
    publish_date: publishDate,
    close_date: null,
    award_date: awardDate,
    contract_start_date: record.startDate,
    contract_end_date: record.endDate,
    last_updated_date: null,
    days_open: null,
    days_to_award: dateDiff(publishDate, awardDate),
    contract_duration_days: dateDiff(record.startDate, record.endDate),
    calendar_year: publishDate ? Number(publishDate.slice(0, 4)) : null,
    financial_year: financialYear(publishDate),
    award_month: awardDate ? Number(awardDate.slice(5, 7)) : null,
    country: "Australia",
    state: record.jurisdiction === "Commonwealth" ? null : record.jurisdiction,
    region: null,
    council: null,
    suburb: null,
    postcode: null,
    latitude: null,
    longitude: null,
    location_text: record.location,
    agency_id: agencyId,
    agency_name: record.agency,
    agency_canonical: agencyCanonical,
    buyer_type: record.jurisdiction === "Commonwealth" ? "Commonwealth agency" : "Government agency",
    client_priority_score: 50,
    supplier_id: supplierId,
    supplier_name: record.supplierName,
    supplier_canonical: supplierCanonical,
    supplier_abn: record.supplierABN,
    competitor_group: record.competitorGroup,
    project_id: projectName ? hash("project", projectName) : null,
    project_name: projectName,
    incumbency_strength: null,
    relationship_score: 50,
    existing_client_flag: null,
    known_contact_flag: null,
    repeat_buyer_flag: null,
    bidder_count: null,
    award_value: awardValue,
    currency: record.currency ?? "AUD",
    estimated_value_min: null,
    estimated_value_max: null,
    value_known_flag: awardValue !== null,
    value_band: valueBand(awardValue),
    commercial_value_score: commercialScore(awardValue, minimumFee),
    minimum_fee_pass: minimumFeePass,
    pricing_deviation_from_median: null,
    bid_price: null,
    median_historical_price: null,
    geotech_relevance_score: classification.geotechRelevanceScore,
    geo_tier: classification.geoTier,
    rejection_reason: classification.rejectionReason,
    positive_keyword_hits: classification.positiveKeywordHits,
    negative_keyword_hits: classification.negativeKeywordHits,
    service_types: extractedServices,
    required_capabilities: classification.requiredCapabilities,
    capability_match_score: capability.score,
    procurement_readiness_score: 100,
    competitive_position_score: 50,
    bundle_score: bundle.isTurnkey ? 95 : bundle.isBundled ? 75 : 35,
    location_fit_score: 50,
    operational_region_pass: null,
    urgency_score: null,
    multi_service_flag: bundle.isBundled,
    turnkey_package_flag: bundle.isTurnkey,
    planning_only_flag: false,
    hard_exclusion_flag: classification.hardExclusionFlag,
    contextual_exclusion_flag: classification.contextualExclusionFlag,
    capability_gap_flag: capability.capabilityGap,
    opportunity_score: components.opportunityScore,
    decision_queue: components.decisionQueue,
    human_decision: null,
    decision_reason: null,
    pursued_flag: null,
    proposal_submitted: null,
    won_flag: null,
    loss_reason: null,
    model_version: MODEL_VERSION,
  });
  return row;
}

function parquetType(definition) {
  if (definition.type === "integer") return "INT64";
  if (definition.type === "real") return "DOUBLE";
  if (definition.type === "boolean") return "BOOLEAN";
  return "UTF8";
}

function parquetRow(row) {
  return Object.fromEntries(Object.entries(row).flatMap(([key, value]) => {
    if (value === null || value === undefined) return [];
    return [[key, typeof value === "object" ? JSON.stringify(value) : value]];
  }));
}

function sqlType(type) {
  if (["integer", "boolean"].includes(type)) return "INTEGER";
  if (type === "real") return "REAL";
  return "TEXT";
}

function schemaSql(tableColumns, awardTrainingColumns, winLossColumns) {
  const definitions = new Map(ML_FIELD_DEFINITIONS.map((definition) => [definition.name, definition]));
  const definitionFor = (name) => definitions.get(name) ?? { name, type: "text", nullable: true };
  const create = (table, columns) => {
    const declarations = columns.map((name) => {
      const definition = definitionFor(name);
      const required = ["record_id", "feedback_id"].includes(name) || definition.nullable === false;
      return `  ${name} ${sqlType(definition.type)}${required ? " NOT NULL" : ""}`;
    });
    return `CREATE TABLE IF NOT EXISTS ${table} (\n${declarations.join(",\n")}\n);`;
  };
  return [
    create("tender_master", ML_COLUMN_NAMES),
    ...Object.entries(tableColumns).map(([table, columns]) => create(table, columns)),
    create("ml_award_value_training", awardTrainingColumns),
    create("ml_win_loss_training", winLossColumns),
  ].join("\n\n") + "\n";
}

function safeGeneratedPath(path) {
  const absolute = resolve(path);
  const cwd = resolve(".");
  if (absolute === cwd || absolute === dirname(absolute) || !absolute.startsWith(`${cwd}\\`)) {
    throw new Error(`Refusing unsafe output path: ${absolute}`);
  }
  return absolute;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(options.minimumFee) || options.minimumFee < 0) throw new Error("--minimum-fee must be non-negative.");
  if (!Number.isFinite(options.limit) && options.limit !== Infinity) throw new Error("--limit must be numeric.");
  await access(options.input);
  const output = safeGeneratedPath(options.output);
  const temporary = safeGeneratedPath(`${options.output}.build`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });

  const tableColumns = {
    tenders: ["record_id", ...ML_FIELD_DEFINITIONS.filter(({ table }) => table === "tenders").map(({ name }) => name), "agency_id", "project_id"],
    awards: ["record_id", ...ML_FIELD_DEFINITIONS.filter(({ table }) => table === "awards").map(({ name }) => name), "supplier_id"],
    suppliers: ML_FIELD_DEFINITIONS.filter(({ table }) => table === "suppliers").map(({ name }) => name),
    agencies: ML_FIELD_DEFINITIONS.filter(({ table }) => table === "agencies").map(({ name }) => name),
    projects: ML_FIELD_DEFINITIONS.filter(({ table }) => table === "projects").map(({ name }) => name),
    tender_features: ["record_id", ...ML_FIELD_DEFINITIONS.filter(({ table }) => table === "tender_features").map(({ name }) => name)],
    bidder_outcomes: ["record_id", "tender_id", "supplier_id", ...ML_FIELD_DEFINITIONS.filter(({ table }) => table === "bidder_outcomes").map(({ name }) => name)],
  };
  for (const [table, columns] of Object.entries(tableColumns)) tableColumns[table] = [...new Set(columns)];
  const streams = Object.fromEntries([
    ["masterCsv", "tender_master.csv"], ["masterNdjson", "tender_master.ndjson"],
    ...Object.keys(tableColumns).map((table) => [table, `${table}.csv`]),
    ["awardTraining", "ml_award_value_training.csv"], ["winLossTraining", "ml_win_loss_training.csv"],
  ].map(([key, filename]) => [key, createWriteStream(join(temporary, filename), { encoding: "utf8" })]));
  await write(streams.masterCsv, `${ML_COLUMN_NAMES.join(",")}\n`);
  for (const [table, columns] of Object.entries(tableColumns)) await write(streams[table], `${columns.join(",")}\n`);
  const awardTrainingColumns = [
    "record_id", "title", "scope_text", "jurisdiction", "category", "procurement_method",
    "publish_date", "agency_canonical", "geotech_relevance_score", "geo_tier", "service_types",
    "required_capabilities", "multi_service_flag", "turnkey_package_flag", "source_portal", "award_value",
  ];
  const winLossColumns = ["record_id", "tender_id", "supplier_id", "proposal_submitted", "won_flag", "loss_reason", "model_version"];
  await write(streams.awardTraining, `${awardTrainingColumns.join(",")}\n`);
  await write(streams.winLossTraining, `${winLossColumns.join(",")}\n`);

  const parquetSchema = new parquet.ParquetSchema(Object.fromEntries(ML_FIELD_DEFINITIONS.map((definition) => [
    definition.name, { type: parquetType(definition), optional: definition.nullable },
  ])));
  const parquetWriter = options.parquet ? await parquet.ParquetWriter.openFile(parquetSchema, join(temporary, "tender_master.parquet")) : null;
  const seenTenders = new Set();
  const seenSuppliers = new Set();
  const seenAgencies = new Set();
  const counts = { inputRows: 0, masterRows: 0, tenderRows: 0, awardRows: 0, supplierRows: 0, agencyRows: 0, awardTrainingRows: 0, winLossTrainingRows: 0 };
  const tiers = { A: 0, B: 0, C: 0 };
  const queues = { Pursue: 0, Watch: 0, Archive: 0 };
  const sourceCounts = {};
  const missing = Object.fromEntries(["title", "scope_text", "agency_name", "supplier_name", "award_value", "publish_date"].map((name) => [name, 0]));
  const dateCoverage = { min: null, max: null };
  const reader = createInterface({ input: createReadStream(options.input), crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) continue;
    counts.inputRows += 1;
    const row = buildCanonicalRow(JSON.parse(line), options.minimumFee);
    counts.masterRows += 1;
    tiers[row.geo_tier] += 1;
    queues[row.decision_queue] += 1;
    sourceCounts[row.source_portal] = (sourceCounts[row.source_portal] ?? 0) + 1;
    for (const name of Object.keys(missing)) if (row[name] === null || row[name] === "") missing[name] += 1;
    if (row.publish_date && (!dateCoverage.min || row.publish_date < dateCoverage.min)) dateCoverage.min = row.publish_date;
    if (row.publish_date && (!dateCoverage.max || row.publish_date > dateCoverage.max)) dateCoverage.max = row.publish_date;
    await write(streams.masterCsv, csvLine(ML_COLUMN_NAMES, row));
    await write(streams.masterNdjson, `${JSON.stringify(row)}\n`);
    if (parquetWriter) await parquetWriter.appendRow(parquetRow(row));

    const tenderKey = row.tender_id ?? row.record_id;
    if (!seenTenders.has(tenderKey)) {
      seenTenders.add(tenderKey);
      await write(streams.tenders, csvLine(tableColumns.tenders, row));
      counts.tenderRows += 1;
    }
    await write(streams.awards, csvLine(tableColumns.awards, row));
    await write(streams.tender_features, csvLine(tableColumns.tender_features, row));
    counts.awardRows += 1;
    if (row.supplier_id && !seenSuppliers.has(row.supplier_id)) {
      seenSuppliers.add(row.supplier_id);
      await write(streams.suppliers, csvLine(tableColumns.suppliers, row));
      counts.supplierRows += 1;
    }
    if (row.agency_id && !seenAgencies.has(row.agency_id)) {
      seenAgencies.add(row.agency_id);
      await write(streams.agencies, csvLine(tableColumns.agencies, row));
      counts.agencyRows += 1;
    }
    if (row.award_value !== null) {
      await write(streams.awardTraining, csvLine(awardTrainingColumns, row));
      counts.awardTrainingRows += 1;
    }
    if (counts.masterRows % 50_000 === 0) console.log(`Processed ${counts.masterRows.toLocaleString()} records...`);
    if (counts.masterRows >= options.limit) break;
  }

  for (const stream of Object.values(streams)) stream.end();
  await Promise.all(Object.values(streams).map((stream) => finished(stream)));
  if (parquetWriter) await parquetWriter.close();
  const dictionaryColumns = ["position", "name", "table", "type", "nullable", "description", "leakage_role"];
  const dictionary = `${dictionaryColumns.join(",")}\n${ML_FIELD_DEFINITIONS.map((definition, index) => csvLine(dictionaryColumns, {
    position: index + 1,
    ...definition,
    leakage_role: definition.leakageRole,
  }).trimEnd()).join("\n")}\n`;
  await writeFile(join(temporary, "data_dictionary.csv"), dictionary);
  await writeFile(join(temporary, "schema.sql"), schemaSql(tableColumns, awardTrainingColumns, winLossColumns));
  await writeFile(join(temporary, "ml_analysis_targets.csv"), [
    "target,status,grain,notes",
    "award_value,ready,award record,Post-award supplier fields are excluded from predictors",
    "won_flag,blocked,bidder participation,Requires submitted and unsuccessful bidder outcomes",
    "human_decision,awaiting_feedback,user-opportunity,Populated through authenticated feedback workflow",
    "",
  ].join("\n"));
  const quality = {
    generatedAt: new Date().toISOString(),
    schemaFields: ML_COLUMN_NAMES.length,
    input: options.input,
    counts,
    tiers,
    queues,
    sourceCounts,
    dateCoverage,
    missing: Object.fromEntries(Object.entries(missing).map(([name, count]) => [name, { count, rate: counts.masterRows ? Number((count / counts.masterRows).toFixed(6)) : 0 }])),
    dataLimitations: [
      "Award-only records do not identify unsuccessful bidders; bidder win-rate modelling is blocked.",
      "Historical award value is a supervised target and must not be reused through derived commercial scores.",
      "Opportunity scores on award records are retrospective descriptors, not pre-award model predictions.",
      "Incumbency is null until a chronological, point-in-time feature pass prevents future-data leakage.",
      "Unknown capabilities and locations are neutral, not treated as a positive match.",
    ],
  };
  await writeFile(join(temporary, "quality-report.json"), `${JSON.stringify(quality, null, 2)}\n`);
  const filenames = ["tender_master.csv", "tender_master.ndjson", ...(options.parquet ? ["tender_master.parquet"] : []), ...Object.keys(tableColumns).map((table) => `${table}.csv`), "ml_award_value_training.csv", "ml_win_loss_training.csv", "data_dictionary.csv", "schema.sql", "ml_analysis_targets.csv", "quality-report.json"];
  const files = [];
  for (const filename of filenames) files.push({ filename, bytes: (await stat(join(temporary, filename))).size });
  await writeFile(join(temporary, "manifest.json"), `${JSON.stringify({ ...quality, files }, null, 2)}\n`);

  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
  console.log(`ML dataset complete: ${counts.masterRows.toLocaleString()} rows, ${ML_COLUMN_NAMES.length} fields.`);
  console.log(`Tier A ${tiers.A.toLocaleString()} | Tier B ${tiers.B.toLocaleString()} | Tier C ${tiers.C.toLocaleString()}`);
  console.log(`Award-value training ${counts.awardTrainingRows.toLocaleString()} | win/loss training ${counts.winLossTrainingRows}`);
}

await main();
