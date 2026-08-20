import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ML_COLUMN_NAMES } from "../lib/ml-dataset-schema.js";

const output = process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ?? "data/ml-tender-dataset";
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
async function firstLine(path) {
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of reader) {
    reader.close();
    return line;
  }
  return "";
}
const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
const header = (await firstLine(join(output, "tender_master.csv"))).split(",");
assert(header.length === 104, `Master CSV has ${header.length} columns, expected 104.`);
assert(JSON.stringify(header) === JSON.stringify(ML_COLUMN_NAMES), "Master CSV header differs from the canonical field order.");
assert(manifest.schemaFields === 104, `Manifest reports ${manifest.schemaFields} schema fields.`);
for (const file of manifest.files) {
  try { await access(join(output, file.filename)); } catch { failures.push(`Missing output file: ${file.filename}`); }
  assert(file.bytes > 0, `Output file is empty: ${file.filename}`);
}

const counts = { rows: 0, tiers: { A: 0, B: 0, C: 0 }, queues: { Pursue: 0, Watch: 0, Archive: 0 }, duplicateRecordIds: 0, invalidRows: 0, fabricatedWinLabels: 0 };
const seen = new Set();
const reader = createInterface({ input: createReadStream(join(output, "tender_master.ndjson")), crlfDelay: Infinity });
for await (const line of reader) {
  if (!line.trim()) continue;
  counts.rows += 1;
  const row = JSON.parse(line);
  if (Object.keys(row).length !== 104 || !ML_COLUMN_NAMES.every((name) => Object.hasOwn(row, name))) counts.invalidRows += 1;
  if (seen.has(row.record_id)) counts.duplicateRecordIds += 1;
  seen.add(row.record_id);
  if (Object.hasOwn(counts.tiers, row.geo_tier)) counts.tiers[row.geo_tier] += 1;
  else counts.invalidRows += 1;
  if (Object.hasOwn(counts.queues, row.decision_queue)) counts.queues[row.decision_queue] += 1;
  else counts.invalidRows += 1;
  if (row.opportunity_score < 0 || row.opportunity_score > 100) counts.invalidRows += 1;
  if (row.won_flag !== null) counts.fabricatedWinLabels += 1;
}
assert(counts.rows === manifest.counts.masterRows, `NDJSON has ${counts.rows} rows; manifest reports ${manifest.counts.masterRows}.`);
assert(JSON.stringify(counts.tiers) === JSON.stringify(manifest.tiers), "Tier counts differ from the build manifest.");
assert(JSON.stringify(counts.queues) === JSON.stringify(manifest.queues), "Queue counts differ from the build manifest.");
assert(counts.duplicateRecordIds === 0, `${counts.duplicateRecordIds} duplicate record IDs found.`);
assert(counts.invalidRows === 0, `${counts.invalidRows} rows violate the canonical contract.`);
assert(counts.fabricatedWinLabels === 0, `${counts.fabricatedWinLabels} award-only records have fabricated win labels.`);
const winLossLines = (await readFile(join(output, "ml_win_loss_training.csv"), "utf8")).trim().split(/\r?\n/);
assert(winLossLines.length === 1, "Win/loss training data must remain empty until participant outcomes are available.");

const report = { validatedAt: new Date().toISOString(), status: failures.length ? "failed" : "passed", counts, failures };
await writeFile(join(output, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) throw new Error(`ML dataset validation failed:\n- ${failures.join("\n- ")}`);
console.log(`Validation passed: ${counts.rows.toLocaleString()} rows, 104 fields, no duplicate IDs or fabricated win labels.`);
