import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecord,
  classifyGeotechnical,
  dedupeKey,
  normalizeCompanyName,
  normalizeNswOcdsRelease,
} from "../lib/historical-awards.js";

test("classifies full scope text instead of relying on the title", () => {
  const result = classifyGeotechnical({
    title: "Western Sydney infrastructure investigation services",
    scope: "The works include boreholes, CPTu and groundwater monitoring.",
    category: "Engineering and technical",
  });
  assert.equal(result.geotechRelevant, true);
  assert.deepEqual(result.serviceTypes.sort(), ["Boreholes", "CPT/CPTu", "Groundwater monitoring"].sort());
});

test("does not treat drilling supplies alone as a geotechnical investigation", () => {
  const result = classifyGeotechnical({
    title: "Emergency drilling supplies",
    scope: "Supply of consumables and spare parts.",
  });
  assert.equal(result.geotechRelevant, false);
});

test("requires geotechnical context for the ambiguous DCP acronym", () => {
  assert.equal(classifyGeotechnical({ title: "DCP licences and support" }).geotechRelevant, false);
  assert.equal(classifyGeotechnical({ title: "Pavement DCP testing" }).geotechRelevant, true);
});

test("normalizes legal suffixes for supplier grouping", () => {
  assert.equal(normalizeCompanyName("AECOM Australia Pty Ltd"), "aecom");
  assert.equal(normalizeCompanyName("Douglas Partners Pty Limited"), "douglas partners");
});

test("normalizes NSW OCDS award scope, supplier and provenance", () => {
  const records = normalizeNswOcdsRelease({
    ocid: "ocds-43qwtd-CN-example",
    id: "release-1",
    publishDate: "2024-06-25T00:00:00Z",
    tender: { id: "RFT-42", description: "Ground investigation for a new bridge" },
    awards: [{
      id: "CAN-42",
      buyer: { name: "Transport for NSW" },
      title: "Site investigation services",
      date: "2024-06-20T00:00:00Z",
      value: { amount: 925345, currency: "AUD" },
      contractPeriod: { startDate: "2024-07-01", endDate: "2024-12-31" },
      items: [{ description: "Boreholes and rock coring", classification: { description: "Engineering and technical" } }],
      suppliers: [{ name: "Example Geotech Pty Ltd", identifier: { scheme: "AU-ABN", id: "12 345 678 901" } }],
    }],
  }, "https://data.open-contracting.org/en/publication/11", "2026-08-19T00:00:00Z");

  assert.equal(records.length, 1);
  assert.equal(records[0].agency, "Transport for NSW");
  assert.equal(records[0].supplierABN, "12345678901");
  assert.equal(records[0].geotechRelevant, true);
  assert.match(records[0].scope, /Boreholes and rock coring/);
  assert.equal(records[0].provenance.extractionMethod, "official-ocds-archive");
  assert.equal(records[0].publishDate, "2024-06-25");
  assert.equal(records[0].tenderMatchStatus, "source-id-match");
});

test("produces stable duplicate keys across cosmetic company-name changes", () => {
  const left = buildRecord({ jurisdiction: "NSW", contractId: "CAN-1", agency: "TfNSW", supplierName: "Example Pty Ltd", title: "Ground investigation", awardValue: 100000 });
  const right = buildRecord({ jurisdiction: "NSW", contractId: "CAN-1", agency: "TfNSW", supplierName: "EXAMPLE PROPRIETARY LIMITED", title: "Ground investigation", awardValue: "$100,000" });
  assert.equal(dedupeKey(left), dedupeKey(right));
});

test("treats contract amendments as one supplier award", () => {
  const original = buildRecord({ jurisdiction: "Commonwealth", sourcePortal: "AusTender", contractId: "CN-1", supplierName: "Example Pty Ltd", awardValue: 100000 });
  const amendment = buildRecord({ jurisdiction: "Commonwealth", sourcePortal: "AusTender", contractId: "CN-1", supplierName: "Example Pty Ltd", awardValue: 125000 });
  assert.equal(dedupeKey(original), dedupeKey(amendment));
});
