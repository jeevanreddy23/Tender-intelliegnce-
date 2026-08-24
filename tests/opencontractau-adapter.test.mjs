import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildRecord,
  dedupeKey,
  normalizeOpenContractAuRelease,
} from "../lib/historical-awards.js";

const release = {
  ocid: "ocau-qld-tmr-TMR-2025-001",
  id: "ocau-qld-tmr-TMR-2025-001-award-1",
  date: "2025-07-02T00:00:00Z",
  buyer: { id: "qld-tmr", name: "Transport and Main Roads" },
  tender: {
    id: "TMR-2025-001",
    title: "Western corridor ground investigation",
    procurementMethod: "selective",
    items: [{
      description: "Boreholes, rock coring and geotechnical reporting",
      classification: { id: "81101500", description: "Civil engineering" },
      deliveryLocation: { description: "Western Queensland" },
    }],
  },
  awards: [{
    id: "award-1",
    date: "2025-06-30T00:00:00Z",
    title: "Ground investigation package",
    value: { amount: 480000, currency: "AUD" },
    suppliers: [
      { name: "Example Geotech Pty Ltd", identifier: { scheme: "AU-ABN", id: "12345678901" } },
      { name: "Partner Drilling Pty Ltd" },
    ],
  }],
  contracts: [{
    id: "contract-1",
    awardID: "award-1",
    value: { amount: 500000, currency: "AUD" },
    period: { startDate: "2025-07-15", endDate: "2026-01-31" },
  }],
  source: { _jurisdiction: "QLD_TMR", url: "https://www.data.qld.gov.au/example" },
};

test("normalizes OpenContractAU releases into one attributable record per supplier", () => {
  const records = normalizeOpenContractAuRelease(release, {
    uri: "https://data.example/qld-tmr.json",
    license: "https://creativecommons.org/licenses/by/4.0/",
    publisher: { uid: "https://github.com/demitonapp/opencontractau" },
    upstreamCommit: "bcc98623003c6dbc5b94263964459bf9e9d7e4d5",
    collectedAt: "2026-08-23T00:00:00.000Z",
  }, "data/opencontractau-raw/qld-tmr.json");

  assert.equal(records.length, 2);
  assert.equal(records[0].jurisdiction, "QLD");
  assert.equal(records[0].agency, "Transport and Main Roads");
  assert.equal(records[0].supplierABN, "12345678901");
  assert.equal(records[0].awardValue, 500000);
  assert.equal(records[0].startDate, "2025-07-15");
  assert.equal(records[0].geotechRelevant, true);
  assert.equal(records[0].provenance.upstreamCommit, "bcc98623003c6dbc5b94263964459bf9e9d7e4d5");
  assert.equal(records[0].provenance.originalSource._jurisdiction, "QLD_TMR");
});

test("deduplicates the same jurisdiction contract across official and community sources", () => {
  const official = buildRecord({
    jurisdiction: "QLD",
    sourcePortal: "Queensland official disclosure",
    contractId: "TMR-2025-001",
    agency: "Transport and Main Roads",
    supplierName: "Example Geotech Pty Ltd",
  });
  const community = buildRecord({
    jurisdiction: "QLD",
    sourcePortal: "OpenContractAU QLD_TMR",
    contractId: "TMR-2025-001",
    agency: "Transport and Main Roads",
    supplierName: "Example Geotech Pty Limited",
  });
  assert.equal(dedupeKey(official), dedupeKey(community));
});

test("imports an OCDS package into NDJSON with a reproducible manifest", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sts-opencontractau-"));
  const input = join(temporary, "qld-tmr.json");
  const output = join(temporary, "normalized");
  try {
    await writeFile(input, JSON.stringify({
      version: "1.1",
      uri: "https://data.example/qld-tmr.json",
      license: "https://creativecommons.org/licenses/by/4.0/",
      publisher: { name: "OpenContractsAU", uid: "https://github.com/demitonapp/opencontractau" },
      releases: [release],
    }));
    const result = spawnSync(process.execPath, [
      "scripts/import-opencontractau-package.mjs",
      `--input=${input}`,
      `--output=${output}`,
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const lines = (await readFile(join(output, "normalized-awards.ndjson"), "utf8"))
      .trim()
      .split("\n");
    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    assert.equal(lines.length, 2);
    assert.equal(manifest.records, 2);
    assert.equal(manifest.releases, 1);
    assert.equal(manifest.jurisdictionCounts.QLD, 2);
    assert.equal(manifest.collectionWindow.earliestRecordDate, "2025-07-02");
    assert.equal(manifest.collectionWindow.latestRecordDate, "2025-07-02");
    assert.equal(manifest.upstreamCommit, "bcc98623003c6dbc5b94263964459bf9e9d7e4d5");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
