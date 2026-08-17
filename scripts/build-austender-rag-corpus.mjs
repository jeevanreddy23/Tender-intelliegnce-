import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";

const output = "data/austender-awards/rag";
const daysDirectory = "data/austender-awards/days";
const chunkFile = join(output, "historical-award-chunks.ndjson");
const temporaryFile = `${chunkFile}.part`;

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== "");
}

function makeChunk(record, sourceFile, lineNumber) {
  const supplier = Array.isArray(record.supplier) ? record.supplier.join(", ") : record.supplier;
  const context = compact([
    record.title,
    record.description,
    record.buyer && `Buyer: ${record.buyer}`,
    supplier && `Supplier: ${supplier}`,
    record.valueAmount != null && `Award value: ${record.currency ?? "AUD"} ${record.valueAmount}`,
    record.awardDate && `Award date: ${record.awardDate}`,
    record.contractStart && `Contract start: ${record.contractStart}`,
    record.contractEnd && `Contract end: ${record.contractEnd}`,
    record.procurementMethodDetails && `Procurement method: ${record.procurementMethodDetails}`,
    record.unspscCodes?.length && `UNSPSC: ${record.unspscCodes.join(", ")}`,
  ]).join(". ");

  return {
    id: record.noticeId ?? record.releaseId ?? `${sourceFile}:${lineNumber}`,
    sourceType: "historical-award",
    source: record.source,
    sourceUrl: record.sourceUrl,
    collectedAt: record.collectedAt,
    title: record.title ?? record.description ?? "AusTender contract notice",
    text: context,
    tags: compact([
      "AusTender",
      "historical-award",
      record.procurementMethod,
      ...(record.unspscCodes ?? []).map((code) => `UNSPSC-${code}`),
    ]),
    metadata: {
      ocid: record.ocid,
      noticeId: record.noticeId,
      buyer: record.buyer,
      supplier: record.supplier,
      valueAmount: record.valueAmount,
      currency: record.currency,
      awardDate: record.awardDate,
      localSource: `${sourceFile}:${lineNumber}`,
    },
  };
}

async function main() {
  const files = (await readdir(daysDirectory)).filter((file) => file.endsWith(".ndjson")).sort();
  if (!files.length) throw new Error("No collected AusTender day files found. Run collect:austender first.");

  await mkdir(output, { recursive: true });
  await rm(temporaryFile, { force: true });
  const stream = createWriteStream(temporaryFile, { encoding: "utf8" });
  const sources = new Set();
  let chunks = 0;
  let filesProcessed = 0;

  for (const file of files) {
    let lineNumber = 0;
    const sourceFile = join(daysDirectory, file).replaceAll("\\", "/");
    const reader = createInterface({ input: createReadStream(join(daysDirectory, file), { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of reader) {
      lineNumber += 1;
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      const chunk = makeChunk(record, sourceFile, lineNumber);
      stream.write(`${JSON.stringify(chunk)}\n`);
      sources.add(record.source);
      chunks += 1;
    }
    filesProcessed += 1;
    if (filesProcessed % 250 === 0 || filesProcessed === files.length) {
      console.log(`Indexed ${filesProcessed}/${files.length} daily files (${chunks.toLocaleString()} chunks).`);
    }
  }

  stream.end();
  await finished(stream);
  await rename(temporaryFile, chunkFile);
  const outputStats = await stat(chunkFile);
  await writeFile(join(output, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    corpus: "AusTender historical awards",
    sourceTypes: ["historical-award", "approved-standard"],
    sources: [...sources].sort(),
    chunks,
    filesProcessed,
    bytes: outputStats.size,
    createdAt: new Date().toISOString(),
    standardsStatus: "Awaiting approved standards documents; do not scrape copyrighted standards into this corpus.",
  }, null, 2)}\n`);
  console.log(`RAG corpus complete: ${chunks.toLocaleString()} historical award chunks, ${(outputStats.size / 1024 / 1024).toFixed(1)} MB.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
