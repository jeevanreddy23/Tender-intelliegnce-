import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { buildStrategicInsightSnapshot } from "../lib/strategic-insights.js";

function parseArgs(argv) {
  const options = {
    input: "data/historical-geotech/geotech-awards.ndjson",
    manifest: "data/historical-geotech/manifest.json",
    quality: "data/historical-geotech/quality-report.json",
    output: "app/data/strategic-insights.json",
  };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value] = argument.slice(2).split("=", 2);
    if (value && key in options) options[key] = value;
  }
  return options;
}

async function readNdjson(path) {
  const records = [];
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) records.push(JSON.parse(line));
  return records;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [records, manifest, quality] = await Promise.all([
    readNdjson(options.input),
    readJson(options.manifest),
    readJson(options.quality),
  ]);
  const snapshot = buildStrategicInsightSnapshot(records, {
    generatedAt: manifest.generatedAt,
    source: manifest.dataset,
    coverage: quality.dateCoverage,
  });
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Strategic snapshot: ${snapshot.metrics.eligibleAwards} awards, ${snapshot.metrics.bundledAwards} bundled, ${snapshot.insights.length} evidence-backed insights.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

