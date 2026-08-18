import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { finished, pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { normalizeNswOcdsRelease } from "../lib/historical-awards.js";

const DEFAULT_START = "2016-08-19";
const DEFAULT_END = new Date().toISOString().slice(0, 10);
const DEFAULT_URL = "https://fastly.data.open-contracting.org/downloads/australia_new_south_wales/2443/full.jsonl.gz";

function parseArgs(argv) {
  const options = {
    start: DEFAULT_START,
    end: DEFAULT_END,
    output: "data/nsw-awards",
    url: DEFAULT_URL,
    retryLimit: 4,
  };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (["start", "end", "output", "url"].includes(key)) options[key] = value;
    if (key === "retry-limit") options.retryLimit = Number(value);
    if (key === "force") options.force = true;
    if (key === "help") options.help = true;
  }
  return options;
}

function usage() {
  console.log(`NSW eTendering historical award collector

Usage:
  npm run collect:nsw:historical -- --start=${DEFAULT_START} --end=${DEFAULT_END}

Downloads the NSW Treasury OCDS archive preserved by the Open Contracting Data
Registry, keeps awarded contracts in the requested date range, and writes a
normalized NDJSON source file plus a provenance manifest.
`);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function assertDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be YYYY-MM-DD.`);
  }
}

async function download(url, destination, retryLimit) {
  let lastError;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "STS-Tender-Intelligence/1.0 (NSW public procurement research)" },
      });
      if (!response.ok || !response.body) throw new Error(`Archive download returned HTTP ${response.status}.`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
      return;
    } catch (error) {
      lastError = error;
      await rm(destination, { force: true });
      if (attempt < retryLimit) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

function recordDate(record) {
  return record.publishDate ?? record.awardDate ?? record.startDate;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  assertDate(options.start, "--start");
  assertDate(options.end, "--end");
  if (options.start >= options.end) throw new Error("--end must be later than --start.");

  const rawFile = join(options.output, "raw", "nsw-etendering-full.jsonl.gz");
  const outputFile = join(options.output, "historical-awards.ndjson");
  const temporaryOutput = `${outputFile}.part`;
  await mkdir(dirname(rawFile), { recursive: true });
  await mkdir(dirname(outputFile), { recursive: true });
  if (options.force || !(await exists(rawFile))) {
    const partial = `${rawFile}.part`;
    await rm(partial, { force: true });
    console.log(`Downloading NSW OCDS archive from ${options.url}`);
    await download(options.url, partial, options.retryLimit);
    await rename(partial, rawFile);
  } else {
    console.log(`Using cached archive ${rawFile}`);
  }

  await rm(temporaryOutput, { force: true });
  const output = createWriteStream(temporaryOutput, { encoding: "utf8" });
  const reader = createInterface({ input: createReadStream(rawFile).pipe(createGunzip()), crlfDelay: Infinity });
  const collectedAt = new Date().toISOString();
  let releases = 0;
  let awardsSeen = 0;
  let awardsWritten = 0;
  let malformed = 0;

  for await (const line of reader) {
    if (!line.trim()) continue;
    releases += 1;
    try {
      const release = JSON.parse(line);
      awardsSeen += release.awards?.length ?? 0;
      for (const record of normalizeNswOcdsRelease(release, options.url, collectedAt)) {
        const date = recordDate(record);
        if (!date || date < options.start || date >= options.end) continue;
        if (!output.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve) => output.once("drain", resolve));
        awardsWritten += 1;
      }
    } catch {
      malformed += 1;
    }
    if (releases % 10000 === 0) console.log(`Scanned ${releases.toLocaleString()} releases; retained ${awardsWritten.toLocaleString()} awards.`);
  }

  output.end();
  await finished(output);
  await rename(temporaryOutput, outputFile);
  const outputStats = await stat(outputFile);
  const rawStats = await stat(rawFile);
  await writeFile(join(options.output, "historical-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    source: "NSW Treasury eTendering OCDS archive",
    registryPage: "https://data.open-contracting.org/en/publication/11",
    downloadUrl: options.url,
    license: "CC BY 3.0 AU",
    coverageRequested: { start: options.start, endExclusive: options.end },
    archiveCoverage: "2005-12 to 2025-02; publisher discontinued",
    collectedAt,
    releases,
    awardsSeen,
    awardsWritten,
    malformed,
    rawBytes: rawStats.size,
    outputBytes: outputStats.size,
    outputFile: outputFile.replaceAll("\\", "/"),
  }, null, 2)}\n`);
  console.log(`Complete: ${awardsWritten.toLocaleString()} NSW award records written (${(outputStats.size / 1024 / 1024).toFixed(1)} MB).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
