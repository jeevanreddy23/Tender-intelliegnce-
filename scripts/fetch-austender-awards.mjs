import { createWriteStream } from "node:fs";
import { access, appendFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";

const API_BASE = "https://api.tenders.gov.au/ocds/findByDates/contractPublished";
const DEFAULT_START = "2016-08-17";
const DEFAULT_END = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const options = {
    start: DEFAULT_START,
    end: DEFAULT_END,
    output: "data/austender-awards",
    concurrency: 2,
    delayMs: 250,
    retryLimit: 4,
    maxPages: 250,
  };

  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    if (key === "start" || key === "end" || key === "output") options[key] = value;
    if (["concurrency", "delay-ms", "retry-limit", "max-pages"].includes(key)) {
      const field = key.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[field] = Number(value);
    }
    if (key === "force") options.force = true;
    if (key === "help") options.help = true;
  }

  return options;
}

function usage() {
  console.log(`AusTender awarded-contract collector

Usage:
  npm run collect:austender -- --start=2016-08-17 --end=2026-08-17

Options:
  --start=YYYY-MM-DD       Inclusive publication date (default: ${DEFAULT_START})
  --end=YYYY-MM-DD         Exclusive publication date (default: today)
  --output=path            Output directory (default: data/austender-awards)
  --concurrency=2          Number of days collected at once
  --delay-ms=250           Pause between paginated API calls
  --retry-limit=4          Retries for transient failures
  --max-pages=250          Guardrail for unexpectedly deep pagination
  --force                  Re-download completed days
`);
}

function assertDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be YYYY-MM-DD.`);
  }
}

function daysBetween(start, end) {
  const cursor = new Date(`${start}T00:00:00Z`);
  const limit = new Date(`${end}T00:00:00Z`);
  const days = [];
  while (cursor < limit) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url, retryLimit) {
  let latestError;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "STS-Tender-Intelligence/1.0 (official AusTender OCDS collector)",
        },
      });
      if (response.ok) return response.json();
      if (response.status === 400) {
        const body = await response.text();
        if (body.includes("No Records found for Date Range")) {
          return { releases: [], links: {} };
        }
        throw new Error(`AusTender returned HTTP 400 for ${url}: ${body}`);
      }
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`AusTender returned HTTP ${response.status} for ${url}`);
      }
      latestError = new Error(`AusTender returned HTTP ${response.status} for ${url}`);
    } catch (error) {
      latestError = error;
    }
    if (attempt < retryLimit) await pause(1000 * 2 ** attempt);
  }
  throw latestError;
}

function partyName(release, role) {
  return release.parties?.find((party) => party.roles?.includes(role))?.name ?? null;
}

function normalizeRelease(release, sourceUrl, collectedAt) {
  const awards = release.awards ?? [];
  const contractsByAward = new Map((release.contracts ?? []).map((contract) => [contract.awardID, contract]));

  return awards.map((award) => {
    const contract = contractsByAward.get(award.id) ?? {};
    return {
      source: "AusTender OCDS API",
      sourceUrl,
      collectedAt,
      ocid: release.ocid ?? null,
      releaseId: release.id ?? null,
      noticeId: contract.id ?? award.id ?? null,
      publishedAt: release.date ?? null,
      awardDate: award.date ?? contract.dateSigned ?? null,
      contractStart: contract.period?.startDate ?? null,
      contractEnd: contract.period?.endDate ?? null,
      buyer: partyName(release, "procuringEntity"),
      supplier: award.suppliers?.map((supplier) => supplier.name).filter(Boolean) ?? [],
      title: contract.title ?? release.tender?.title ?? null,
      description: contract.description ?? release.tender?.description ?? null,
      valueAmount: contract.value?.amount == null ? null : Number(contract.value.amount),
      currency: contract.value?.currency ?? null,
      status: contract.status ?? award.status ?? null,
      procurementMethod: release.tender?.procurementMethod ?? null,
      procurementMethodDetails: release.tender?.procurementMethodDetails ?? null,
      unspscCodes: (contract.items ?? []).map((item) => item.classification?.id).filter(Boolean),
    };
  });
}

async function collectDay(day, options) {
  const outputFile = join(options.output, "days", `${day}.ndjson`);
  const manifestFile = join(options.output, "manifests", `${day}.json`);
  if (!options.force && (await exists(outputFile)) && (await exists(manifestFile))) {
    return { day, skipped: true };
  }

  const start = `${day}T00:00:00Z`;
  const nextDay = new Date(`${day}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const end = nextDay.toISOString().replace(".000Z", "Z");
  let url = `${API_BASE}/${start}/${end}`;
  const temporaryFile = `${outputFile}.part`;
  await mkdir(dirname(outputFile), { recursive: true });
  await mkdir(dirname(manifestFile), { recursive: true });
  await rm(temporaryFile, { force: true });

  const stream = createWriteStream(temporaryFile, { encoding: "utf8" });
  let pages = 0;
  let releases = 0;
  let awards = 0;
  const collectedAt = new Date().toISOString();
  try {
    while (url) {
      if (pages >= options.maxPages) {
        throw new Error(`Pagination guard reached for ${day}; increase --max-pages after review.`);
      }
      const payload = await fetchJson(url, options.retryLimit);
      pages += 1;
      const pageReleases = payload.releases ?? [];
      releases += pageReleases.length;
      for (const record of pageReleases.flatMap((release) => normalizeRelease(release, url, collectedAt))) {
        stream.write(`${JSON.stringify(record)}\n`);
        awards += 1;
      }
      url = payload.links?.next ?? null;
      if (url) await pause(options.delayMs);
    }
    stream.end();
    await finished(stream);
    await rename(temporaryFile, outputFile);
    const fileStats = await stat(outputFile);
    await writeFile(manifestFile, `${JSON.stringify({
      source: "AusTender OCDS API",
      collectionDate: day,
      collectedAt,
      pages,
      releases,
      awards,
      outputFile: outputFile.replaceAll("\\", "/"),
      bytes: fileStats.size,
    }, null, 2)}\n`);
    return { day, pages, releases, awards, bytes: fileStats.size };
  } catch (error) {
    stream.destroy();
    await rm(temporaryFile, { force: true });
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  assertDate(options.start, "--start");
  assertDate(options.end, "--end");
  if (options.start >= options.end) throw new Error("--end must be later than --start.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) {
    throw new Error("--concurrency must be an integer from 1 to 8.");
  }

  await mkdir(options.output, { recursive: true });
  const runLog = join(options.output, "collection-log.ndjson");
  const queue = daysBetween(options.start, options.end);
  console.log(`Collecting ${queue.length} day(s) from ${options.start} to ${options.end} with concurrency ${options.concurrency}.`);

  let cursor = 0;
  let completed = 0;
  let skipped = 0;
  let awards = 0;
  let bytes = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const day = queue[cursor];
      cursor += 1;
      const result = await collectDay(day, options);
      completed += 1;
      skipped += Number(Boolean(result.skipped));
      awards += result.awards ?? 0;
      bytes += result.bytes ?? 0;
      await appendFile(runLog, `${JSON.stringify({ ...result, completedAt: new Date().toISOString() })}\n`);
      if (completed % 10 === 0 || completed === queue.length) {
        console.log(`Progress ${completed}/${queue.length}: ${awards.toLocaleString()} awards, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${skipped} resumed.`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  console.log(`Complete: ${completed} day(s), ${awards.toLocaleString()} award records, ${(bytes / 1024 / 1024).toFixed(1)} MB newly written.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
