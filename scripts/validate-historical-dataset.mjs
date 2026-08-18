import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import parquet from "parquetjs-lite";
import { dedupeKey } from "../lib/historical-awards.js";

function parseArgs(argv) {
  const options = { input: "data/historical-geotech" };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (key === "input") options.input = value;
  }
  return options;
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function countParquet(path) {
  const reader = await parquet.ParquetReader.openFile(path);
  try { return Number(reader.getRowCount()); } finally { await reader.close(); }
}

async function inspectNdjson(path, onRecord) {
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let count = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    count += 1;
    onRecord(JSON.parse(line), count);
  }
  return count;
}

async function main() {
  const { input } = parseArgs(process.argv.slice(2));
  const manifest = await json(join(input, "manifest.json"));
  const quality = await json(join(input, "quality-report.json"));
  const failures = [];
  const warnings = [];
  const recordIds = new Set();
  const awardKeys = new Set();
  let duplicateIds = 0;
  let duplicateAwardKeys = 0;
  let invalidDates = 0;
  let impossiblePeriods = 0;
  let missingRequired = 0;

  const masterCount = await inspectNdjson(join(input, "master-awards.ndjson"), (record) => {
    if (recordIds.has(record.recordId)) duplicateIds += 1;
    recordIds.add(record.recordId);
    const key = dedupeKey(record);
    if (awardKeys.has(key)) duplicateAwardKeys += 1;
    awardKeys.add(key);
    if (!record.contractId || !record.agency || !record.supplierName || !record.sourcePortal || !record.provenance) missingRequired += 1;
    for (const field of ["publishDate", "awardDate", "startDate", "endDate"]) {
      if (record[field] && !/^\d{4}-\d{2}-\d{2}$/.test(record[field])) invalidDates += 1;
    }
    if (record.startDate && record.endDate && record.startDate > record.endDate) impossiblePeriods += 1;
    if (record.awardValue != null && !Number.isFinite(record.awardValue)) failures.push(`Non-finite award value in ${record.recordId}`);
  });

  let nonRelevantGeotechRows = 0;
  const geotechCount = await inspectNdjson(join(input, "geotech-awards.ndjson"), (record) => {
    if (!record.geotechRelevant) nonRelevantGeotechRows += 1;
  });
  const ragCount = await inspectNdjson(join(input, "rag", "historical-geotech-chunks.ndjson"), () => {});
  const masterParquetCount = await countParquet(join(input, "master-awards.parquet"));
  const geotechParquetCount = await countParquet(join(input, "geotech-awards.parquet"));

  const expectedMaster = manifest.records;
  const expectedGeotech = manifest.geotechRelevant;
  for (const [label, actual, expected] of [
    ["master NDJSON", masterCount, expectedMaster],
    ["master Parquet", masterParquetCount, expectedMaster],
    ["geotech NDJSON", geotechCount, expectedGeotech],
    ["geotech Parquet", geotechParquetCount, expectedGeotech],
    ["RAG chunks", ragCount, expectedGeotech],
    ["quality master count", quality.records, expectedMaster],
    ["quality geotech count", quality.geotechRelevant, expectedGeotech],
  ]) if (actual !== expected) failures.push(`${label}: expected ${expected}, found ${actual}`);

  if (duplicateIds) failures.push(`${duplicateIds} duplicate record IDs`);
  if (duplicateAwardKeys) failures.push(`${duplicateAwardKeys} duplicate contract/supplier grain keys`);
  if (missingRequired) failures.push(`${missingRequired} records missing a required contract, agency, supplier, source, or provenance field`);
  if (invalidDates) failures.push(`${invalidDates} malformed dates`);
  if (impossiblePeriods) warnings.push(`${impossiblePeriods} records have start dates after end dates and require source review`);
  if (nonRelevantGeotechRows) failures.push(`${nonRelevantGeotechRows} rows in the geotech extract are below threshold`);
  if ((quality.missing?.location?.rate ?? 0) > 0.9) warnings.push(`Location is sparse (${(quality.missing.location.rate * 100).toFixed(1)}% missing), limiting geographic modelling.`);
  if (!quality.sourceCounts?.["buy NSW Register of notices"]) warnings.push("Current post-February-2025 buy NSW Notice Report data has not been imported.");

  console.log(JSON.stringify({
    status: failures.length ? "fail" : "pass",
    masterCount,
    geotechCount,
    ragCount,
    masterParquetCount,
    geotechParquetCount,
    duplicateIds,
    duplicateAwardKeys,
    invalidDates,
    impossiblePeriods,
    missingRequired,
    failures,
    warnings,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
