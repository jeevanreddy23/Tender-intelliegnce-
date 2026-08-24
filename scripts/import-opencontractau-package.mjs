import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import {
  dedupeKey,
  normalizeOpenContractAuRelease,
} from "../lib/historical-awards.js";

const AUDITED_COMMIT = "bcc98623003c6dbc5b94263964459bf9e9d7e4d5";

function parseArgs(argv) {
  const options = {
    output: "data/opencontractau-awards",
    threshold: 25,
    upstreamCommit: AUDITED_COMMIT,
  };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (["input", "output", "jurisdiction", "upstream-commit"].includes(key)) {
      options[key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = value;
    }
    if (key === "threshold") options.threshold = Number(value);
    if (key === "help") options.help = true;
  }
  return options;
}

function usage() {
  console.log(`OpenContractAU OCDS package importer

Usage:
  npm run import:opencontractau -- --input=data/opencontractau-raw/act.json --jurisdiction=ACT

Options:
  --input=file[;file]       One or more OpenContractAU OCDS release packages
  --output=directory       Output directory (default: data/opencontractau-awards)
  --jurisdiction=KEY       Fallback jurisdiction when release metadata omits it
  --threshold=25           Geotechnical classifier threshold
  --upstream-commit=SHA    Audited upstream commit recorded in provenance
`);
}

async function write(stream, content) {
  if (!stream.write(content)) await new Promise((resolveDrain) => stream.once("drain", resolveDrain));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.input) throw new Error("--input is required.");
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100) {
    throw new Error("--threshold must be from 0 to 100.");
  }

  const inputs = options.input.split(";").map((path) => resolve(path.trim())).filter(Boolean);
  const outputFile = join(options.output, "normalized-awards.ndjson");
  const temporaryFile = `${outputFile}.part`;
  await mkdir(options.output, { recursive: true });
  await rm(temporaryFile, { force: true });
  const output = createWriteStream(temporaryFile, { encoding: "utf8" });
  const collectedAt = new Date().toISOString();
  const seen = new Set();
  const inputSummaries = [];
  const jurisdictionCounts = {};
  let releases = 0;
  let awards = 0;
  let records = 0;
  let duplicatesDropped = 0;
  let earliestRecordDate = null;
  let latestRecordDate = null;

  try {
    for (const input of inputs) {
      const raw = (await readFile(input, "utf8")).replace(/^\uFEFF/, "");
      const payload = JSON.parse(raw);
      const packages = Array.isArray(payload) ? payload : [payload];
      let inputReleases = 0;
      let inputRecords = 0;
      for (const releasePackage of packages) {
        if (!Array.isArray(releasePackage.releases)) {
          throw new Error(`${input} is not an OCDS release package with a releases array.`);
        }
        const metadata = {
          uri: releasePackage.uri,
          license: releasePackage.license,
          publisher: releasePackage.publisher,
          jurisdiction: options.jurisdiction,
          upstreamCommit: options.upstreamCommit,
          collectedAt,
        };
        for (const release of releasePackage.releases) {
          releases += 1;
          inputReleases += 1;
          awards += release.awards?.length ?? 0;
          const normalized = normalizeOpenContractAuRelease(
            release,
            metadata,
            input.replaceAll("\\", "/"),
            options.threshold,
          );
          for (const record of normalized) {
            const key = dedupeKey(record);
            if (seen.has(key)) {
              duplicatesDropped += 1;
              continue;
            }
            seen.add(key);
            records += 1;
            inputRecords += 1;
            jurisdictionCounts[record.jurisdiction] = (jurisdictionCounts[record.jurisdiction] ?? 0) + 1;
            const recordDate = record.publishDate ?? record.awardDate ?? record.startDate;
            if (recordDate && (!earliestRecordDate || recordDate < earliestRecordDate)) earliestRecordDate = recordDate;
            if (recordDate && (!latestRecordDate || recordDate > latestRecordDate)) latestRecordDate = recordDate;
            await write(output, `${JSON.stringify(record)}\n`);
          }
        }
      }
      inputSummaries.push({ file: input.replaceAll("\\", "/"), releases: inputReleases, records: inputRecords });
    }
    output.end();
    await finished(output);
    await rename(temporaryFile, outputFile);
  } catch (error) {
    output.destroy();
    await rm(temporaryFile, { force: true });
    throw error;
  }

  const outputStats = await stat(outputFile);
  const manifest = {
    schemaVersion: 1,
    source: "OpenContractAU OCDS release packages",
    upstreamRepository: "https://github.com/demitonapp/opencontractau",
    upstreamCommit: options.upstreamCommit,
    auditedCommit: AUDITED_COMMIT,
    collectedAt,
    inputs: inputSummaries,
    releases,
    awards,
    records,
    duplicatesDropped,
    jurisdictionCounts,
    collectionWindow: {
      earliestRecordDate,
      latestRecordDate,
    },
    outputFile: outputFile.replaceAll("\\", "/"),
    outputBytes: outputStats.size,
    attribution: "OpenContractAU code Apache-2.0; generated packages declare CC-BY-4.0.",
  };
  await writeFile(join(options.output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Imported ${records.toLocaleString()} normalized records from ${releases.toLocaleString()} releases (${duplicatesDropped.toLocaleString()} duplicates removed).`);
  console.log(`Output: ${basename(outputFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
