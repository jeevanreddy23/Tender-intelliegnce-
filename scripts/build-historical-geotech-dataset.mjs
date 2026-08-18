import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import parquet from "parquetjs-lite";
import {
  MASTER_COLUMNS,
  buildRecord,
  dedupeKey,
  makeRagChunk,
  normalizeAusTenderRecord,
  toCsvLine,
} from "../lib/historical-awards.js";

function parseArgs(argv) {
  const options = {
    austender: "data/austender-awards/days",
    nsw: "data/nsw-awards",
    output: "data/historical-geotech",
    threshold: 25,
  };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (["austender", "nsw", "output"].includes(key)) options[key] = value;
    if (key === "threshold") options.threshold = Number(value);
    if (key === "help") options.help = true;
  }
  return options;
}

function usage() {
  console.log(`Historical geotechnical dataset builder

Usage:
  npm run build:historical-dataset -- --threshold=25

Inputs:
  data/austender-awards/days/*.ndjson
  data/nsw-awards/historical-awards.ndjson
  data/nsw-awards/live-notice-reports.ndjson (optional)

Outputs include master and geotech-only NDJSON, CSV and Parquet files, RAG
chunks, supplier summaries, and a machine-readable quality report.
`);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function renameWithRetry(source, destination, attempts = 6) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "EACCES"].includes(error?.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function write(stream, content) {
  if (!stream.write(content)) await new Promise((resolve) => stream.once("drain", resolve));
}

const parquetSchema = new parquet.ParquetSchema({
  recordId: { type: "UTF8" },
  tenderId: { type: "UTF8", optional: true },
  contractId: { type: "UTF8", optional: true },
  title: { type: "UTF8", optional: true },
  scope: { type: "UTF8", optional: true },
  agency: { type: "UTF8", optional: true },
  supplierName: { type: "UTF8", optional: true },
  supplierCanonical: { type: "UTF8", optional: true },
  supplierABN: { type: "UTF8", optional: true },
  awardValue: { type: "DOUBLE", optional: true },
  currency: { type: "UTF8", optional: true },
  publishDate: { type: "UTF8", optional: true },
  awardDate: { type: "UTF8", optional: true },
  startDate: { type: "UTF8", optional: true },
  endDate: { type: "UTF8", optional: true },
  location: { type: "UTF8", optional: true },
  jurisdiction: { type: "UTF8", optional: true },
  category: { type: "UTF8", optional: true },
  procurementMethod: { type: "UTF8", optional: true },
  tenderUrl: { type: "UTF8", optional: true },
  awardUrl: { type: "UTF8", optional: true },
  geotechScore: { type: "INT32" },
  geotechRelevant: { type: "BOOLEAN" },
  matchedTerms: { type: "UTF8" },
  serviceTypes: { type: "UTF8" },
  competitorGroup: { type: "UTF8", optional: true },
  sourcePortal: { type: "UTF8" },
  sourceUrl: { type: "UTF8", optional: true },
  sourceRecordId: { type: "UTF8", optional: true },
  tenderMatchStatus: { type: "UTF8" },
  scopeSource: { type: "UTF8", optional: true },
  collectedAt: { type: "UTF8" },
  provenance: { type: "UTF8" },
});

function parquetRow(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => {
    if (["matchedTerms", "serviceTypes", "provenance"].includes(key)) return [key, JSON.stringify(value)];
    return [key, value];
  }).filter(([key]) => MASTER_COLUMNS.includes(key)));
}

function refreshRecord(record, threshold) {
  return buildRecord({ ...record, description: null, scope: record.scope, recordId: record.recordId }, threshold);
}

function supplierAccumulator(record) {
  return {
    supplierName: record.supplierName,
    supplierCanonical: record.supplierCanonical,
    competitorGroup: record.competitorGroup,
    awardCount: 0,
    geotechAwardCount: 0,
    totalAwardValue: 0,
    geotechAwardValue: 0,
    clients: new Set(),
    jurisdictions: new Set(),
    serviceTypes: new Set(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100) throw new Error("--threshold must be from 0 to 100.");
  if (!(await exists(options.austender))) throw new Error(`Missing AusTender input directory: ${options.austender}`);

  const temporary = `${options.output}.build`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(join(temporary, "rag"), { recursive: true });
  await mkdir(join(temporary, "analysis"), { recursive: true });

  const paths = {
    masterNdjson: join(temporary, "master-awards.ndjson"),
    masterCsv: join(temporary, "master-awards.csv"),
    masterParquet: join(temporary, "master-awards.parquet"),
    geotechNdjson: join(temporary, "geotech-awards.ndjson"),
    geotechCsv: join(temporary, "geotech-awards.csv"),
    geotechParquet: join(temporary, "geotech-awards.parquet"),
    rag: join(temporary, "rag", "historical-geotech-chunks.ndjson"),
  };
  const streams = {
    masterNdjson: createWriteStream(paths.masterNdjson, { encoding: "utf8" }),
    masterCsv: createWriteStream(paths.masterCsv, { encoding: "utf8" }),
    geotechNdjson: createWriteStream(paths.geotechNdjson, { encoding: "utf8" }),
    geotechCsv: createWriteStream(paths.geotechCsv, { encoding: "utf8" }),
    rag: createWriteStream(paths.rag, { encoding: "utf8" }),
  };
  await write(streams.masterCsv, `${MASTER_COLUMNS.join(",")}\n`);
  await write(streams.geotechCsv, `${MASTER_COLUMNS.join(",")}\n`);
  const masterParquet = await parquet.ParquetWriter.openFile(parquetSchema, paths.masterParquet);
  const geotechParquet = await parquet.ParquetWriter.openFile(parquetSchema, paths.geotechParquet);

  const seen = new Set();
  const suppliers = new Map();
  const sourceCounts = {};
  const missing = Object.fromEntries(["tenderId", "contractId", "title", "scope", "agency", "supplierName", "awardValue", "publishDate", "awardDate", "location", "category"].map((field) => [field, 0]));
  const dateCoverage = {};
  let scanned = 0;
  let written = 0;
  let duplicatesDropped = 0;
  let geotechRelevant = 0;
  let totalAwardValue = 0;

  const accept = async (candidate) => {
    scanned += 1;
    const record = refreshRecord(candidate, options.threshold);
    const key = dedupeKey(record);
    if (seen.has(key)) {
      duplicatesDropped += 1;
      return;
    }
    seen.add(key);
    written += 1;
    sourceCounts[record.sourcePortal] = (sourceCounts[record.sourcePortal] ?? 0) + 1;
    const date = record.publishDate ?? record.awardDate ?? record.startDate;
    const coverage = dateCoverage[record.sourcePortal] ?? { min: null, max: null };
    if (date && (!coverage.min || date < coverage.min)) coverage.min = date;
    if (date && (!coverage.max || date > coverage.max)) coverage.max = date;
    dateCoverage[record.sourcePortal] = coverage;
    for (const field of Object.keys(missing)) if (record[field] === null || record[field] === "") missing[field] += 1;
    if (record.awardValue != null) totalAwardValue += record.awardValue;

    await write(streams.masterNdjson, `${JSON.stringify(record)}\n`);
    await write(streams.masterCsv, toCsvLine(record));
    await masterParquet.appendRow(parquetRow(record));

    if (record.supplierCanonical) {
      const summary = suppliers.get(record.supplierCanonical) ?? supplierAccumulator(record);
      summary.awardCount += 1;
      summary.totalAwardValue += record.awardValue ?? 0;
      if (record.agency) summary.clients.add(record.agency);
      if (record.jurisdiction) summary.jurisdictions.add(record.jurisdiction);
      if (record.geotechRelevant) {
        summary.geotechAwardCount += 1;
        summary.geotechAwardValue += record.awardValue ?? 0;
        for (const service of record.serviceTypes) summary.serviceTypes.add(service);
      }
      suppliers.set(record.supplierCanonical, summary);
    }

    if (record.geotechRelevant) {
      geotechRelevant += 1;
      await write(streams.geotechNdjson, `${JSON.stringify(record)}\n`);
      await write(streams.geotechCsv, toCsvLine(record));
      await write(streams.rag, `${JSON.stringify(makeRagChunk(record))}\n`);
      await geotechParquet.appendRow(parquetRow(record));
    }
  };

  // Newest first ensures a contract amendment wins before duplicate removal.
  const ausTenderFiles = (await readdir(options.austender)).filter((file) => file.endsWith(".ndjson")).sort().reverse();
  let filesProcessed = 0;
  for (const file of ausTenderFiles) {
    const path = join(options.austender, file);
    const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) continue;
      const sourceRecord = JSON.parse(line);
      for (const record of normalizeAusTenderRecord(sourceRecord, `${path.replaceAll("\\", "/")}:${lineNumber}`, options.threshold)) await accept(record);
    }
    filesProcessed += 1;
    if (filesProcessed % 250 === 0 || filesProcessed === ausTenderFiles.length) {
      console.log(`AusTender ${filesProcessed}/${ausTenderFiles.length} files; ${written.toLocaleString()} master, ${geotechRelevant.toLocaleString()} geotech.`);
    }
  }

  for (const file of ["historical-awards.ndjson", "live-notice-reports.ndjson"]) {
    const path = join(options.nsw, file);
    if (!(await exists(path))) continue;
    const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of reader) if (line.trim()) await accept(JSON.parse(line));
    console.log(`Merged ${file}; ${written.toLocaleString()} master, ${geotechRelevant.toLocaleString()} geotech.`);
  }

  for (const stream of Object.values(streams)) stream.end();
  await Promise.all(Object.values(streams).map((stream) => finished(stream)));
  await masterParquet.close();
  await geotechParquet.close();

  const supplierColumns = ["supplierName", "supplierCanonical", "competitorGroup", "awardCount", "geotechAwardCount", "totalAwardValue", "geotechAwardValue", "clientCount", "clients", "jurisdictions", "serviceTypes"];
  const supplierRows = [...suppliers.values()].map((summary) => ({
    ...summary,
    clientCount: summary.clients.size,
    clients: [...summary.clients].sort(),
    jurisdictions: [...summary.jurisdictions].sort(),
    serviceTypes: [...summary.serviceTypes].sort(),
  })).sort((left, right) => right.geotechAwardValue - left.geotechAwardValue || right.geotechAwardCount - left.geotechAwardCount);
  const supplierStream = createWriteStream(join(temporary, "analysis", "supplier-summary.csv"), { encoding: "utf8" });
  await write(supplierStream, `${supplierColumns.join(",")}\n`);
  for (const row of supplierRows) await write(supplierStream, toCsvLine(row, supplierColumns));
  supplierStream.end();
  await finished(supplierStream);

  const outputStats = {};
  for (const [name, path] of Object.entries(paths)) outputStats[name] = (await stat(path)).size;
  const generatedAt = new Date().toISOString();
  const quality = {
    schemaVersion: 1,
    generatedAt,
    classifierThreshold: options.threshold,
    scanned,
    records: written,
    duplicatesDropped,
    geotechRelevant,
    geotechRate: written ? Number((geotechRelevant / written).toFixed(4)) : 0,
    totalAwardValue,
    sourceCounts,
    dateCoverage,
    missing: Object.fromEntries(Object.entries(missing).map(([field, count]) => [field, { count, rate: written ? Number((count / written).toFixed(4)) : 0 }])),
    outputBytes: outputStats,
    knownCoverageLimits: [
      "NSW eTendering archive stops in February 2025; current buy NSW records require Notice Report CSV imports.",
      "NSW disclosures generally omit contracts below AUD 150,000 including GST.",
      "Award-only records show successful suppliers, not the complete bidder field; award share is not bidder win rate.",
      "Geotechnical relevance is a deterministic recall-oriented classifier and should be human-reviewed before model training.",
      "Location is sparse because many award notices do not publish a structured delivery location.",
    ],
  };
  await writeFile(join(temporary, "quality-report.json"), `${JSON.stringify(quality, null, 2)}\n`);
  await writeFile(join(temporary, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    dataset: "STS historical awarded contracts",
    generatedAt,
    records: written,
    geotechRelevant,
    sources: Object.keys(sourceCounts),
    outputs: {
      master: ["master-awards.ndjson", "master-awards.csv", "master-awards.parquet"],
      geotech: ["geotech-awards.ndjson", "geotech-awards.csv", "geotech-awards.parquet"],
      rag: "rag/historical-geotech-chunks.ndjson",
      analysis: "analysis/supplier-summary.csv",
      quality: "quality-report.json",
    },
  }, null, 2)}\n`);

  const previous = `${options.output}.previous`;
  await rm(previous, { recursive: true, force: true });
  if (await exists(options.output)) await renameWithRetry(options.output, previous);
  try {
    await renameWithRetry(temporary, options.output);
    await rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (!(await exists(options.output)) && (await exists(previous))) await renameWithRetry(previous, options.output);
    throw error;
  }
  console.log(`Complete: ${written.toLocaleString()} records, ${geotechRelevant.toLocaleString()} geotechnical candidates, ${duplicatesDropped.toLocaleString()} duplicates removed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
