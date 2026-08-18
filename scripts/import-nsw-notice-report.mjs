import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import { parse } from "csv-parse";
import { buildRecord, cleanText, normalizeDate, normalizeMoney } from "../lib/historical-awards.js";

function parseArgs(argv) {
  const options = { output: "data/nsw-awards/live-notice-reports.ndjson" };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (key === "input") options.inputs = value.split(";").filter(Boolean);
    if (key === "output") options.output = value;
    if (key === "help") options.help = true;
  }
  return options;
}

function usage() {
  console.log(`buy NSW Notice Report importer

Usage:
  npm run import:nsw:reports -- --input="downloads/notices-2025.csv;downloads/notices-2026.csv"

In buy NSW, open Register of notices > Notice reports, choose Contract award and
a publish-date range, then export CSV. Multiple files may be separated by ';'.
`);
}

function normalizedHeading(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lookup(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const wanted = normalizedHeading(alias);
    const match = entries.find(([key]) => normalizedHeading(key) === wanted);
    if (match && cleanText(match[1])) return match[1];
  }
  return null;
}

function splitPeriod(value) {
  const match = cleanText(value)?.match(/^(.+?)\s+to\s+(.+)$/i);
  return match ? [normalizeDate(match[1]), normalizeDate(match[2])] : [null, null];
}

function mapRow(row, sourceFile, collectedAt) {
  const period = splitPeriod(lookup(row, ["Contract period", "Contract duration"]));
  const contractId = lookup(row, ["CAN ID", "Notice ID", "Contract ID", "Award ID"]);
  const noticeUrl = lookup(row, ["Notice URL", "Award URL", "URL"]);
  return buildRecord({
    tenderId: lookup(row, ["Tender ID", "RFT ID", "Opportunity ID"]),
    contractId,
    title: lookup(row, ["Title", "Notice title", "Contract title", "Tender title"]),
    scope: lookup(row, ["Scope", "Description", "Contract description", "Details", "Particulars of project"]),
    agency: lookup(row, ["Agency", "Department/Agency", "Department", "Buyer"]),
    supplierName: lookup(row, ["Contractor name", "Supplier name", "Successful supplier", "Awarded supplier"]),
    supplierABN: lookup(row, ["ABN", "Supplier ABN", "Contractor ABN"]),
    awardValue: normalizeMoney(lookup(row, [
      "Estimated amount payable to the contractor (including GST)",
      "Estimated amount payable", "Contract value", "Award value", "Value",
    ])),
    currency: lookup(row, ["Currency"]) ?? "AUD",
    publishDate: lookup(row, ["Publish date", "Published date", "Publication date"]),
    awardDate: lookup(row, ["Award date", "Contract award date"]),
    startDate: lookup(row, ["Contract start date", "Start date"]) ?? period[0],
    endDate: lookup(row, ["Contract end date", "End date"]) ?? period[1],
    location: lookup(row, ["Location", "Location of work", "Region", "Delivery location"]),
    jurisdiction: "NSW",
    category: lookup(row, ["Category", "Industry sector", "UNSPSC"]),
    procurementMethod: lookup(row, ["Procurement method", "Method"]),
    tenderUrl: lookup(row, ["Tender URL", "Opportunity URL"]),
    awardUrl: noticeUrl ?? "https://buy.nsw.gov.au/notices",
    sourcePortal: "buy NSW Register of notices",
    sourceUrl: noticeUrl ?? "https://buy.nsw.gov.au/notices",
    sourceRecordId: contractId,
    tenderMatchStatus: lookup(row, ["Tender ID", "RFT ID", "Opportunity ID"]) ? "source-id-match" : "award-only",
    scopeSource: "buy NSW Notice Report CSV",
    collectedAt,
    provenance: {
      sourceSystem: "buy NSW Register of notices",
      localSource: sourceFile,
      extractionMethod: "official-notice-report-csv",
      disclosureThresholdNote: "NSW contract disclosure generally applies at AUD 150,000 including GST; smaller awards may be incomplete.",
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.inputs?.length) throw new Error("Provide at least one --input CSV path. Use --help for an example.");

  await mkdir(dirname(options.output), { recursive: true });
  const temporary = `${options.output}.part`;
  await rm(temporary, { force: true });
  const output = createWriteStream(temporary, { encoding: "utf8" });
  const collectedAt = new Date().toISOString();
  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsRejected = 0;
  const inputs = [];

  for (const input of options.inputs) {
    const path = resolve(input);
    const stats = await stat(path);
    inputs.push({ path, bytes: stats.size });
    const parser = createReadStream(path).pipe(parse({ columns: true, bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }));
    for await (const row of parser) {
      rowsRead += 1;
      const record = mapRow(row, basename(path), collectedAt);
      if (!record.contractId || !record.supplierName) {
        rowsRejected += 1;
        continue;
      }
      if (!output.write(`${JSON.stringify(record)}\n`)) await new Promise((resolveDrain) => output.once("drain", resolveDrain));
      rowsWritten += 1;
    }
  }

  output.end();
  await finished(output);
  await rename(temporary, options.output);
  await writeFile(join(dirname(options.output), "live-notice-reports-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    source: "buy NSW Register of notices",
    sourceUrl: "https://buy.nsw.gov.au/notices",
    collectedAt,
    inputs,
    rowsRead,
    rowsWritten,
    rowsRejected,
    outputFile: options.output.replaceAll("\\", "/"),
  }, null, 2)}\n`);
  console.log(`Imported ${rowsWritten.toLocaleString()} buy NSW awards; rejected ${rowsRejected.toLocaleString()} incomplete rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
