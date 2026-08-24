import assert from "node:assert/strict";
import test from "node:test";
import {
  linkProjectSignals,
  normalizeSourceRecord,
  parseTenderNotification,
  parseVendorPanelRss,
  supportedSourcePolicies,
} from "../lib/source-adapters.js";

const extractedAt = "2026-08-24T00:00:00.000Z";

test("supports exactly the seven first-build source families with bounded access policies", () => {
  assert.deepEqual(Object.keys(supportedSourcePolicies).sort(), [
    "austender", "buy-nsw", "eprocure", "estimateone", "icn", "tenderlink", "vendorpanel",
  ]);
  assert.equal(supportedSourcePolicies.vendorpanel.extraction_method, "rss");
  assert.equal(supportedSourcePolicies.eprocure.access, "approved-integration");
  assert.equal(supportedSourcePolicies.tenderlink.access, "authorised-notification");
});

test("normalizes a live buy NSW opportunity and extracts geotechnical scope", () => {
  const record = normalizeSourceRecord("buy-nsw", {
    id: "RFT-100",
    url: "https://buy.nsw.gov.au/opportunity/RFT-100",
    title: "Geotechnical investigation for Western Sydney road upgrade",
    scope: "Drill 12 boreholes with SPT and rock coring.",
    agency: "Transport for NSW",
    suburb: "Parramatta",
    state: "NSW",
    opportunity_type: "Tender",
    closes_at: "2026-09-10T17:00:00+10:00",
  }, { extractedAt });

  assert.equal(record.opportunity_id, "buy-nsw:RFT-100");
  assert.equal(record.geotech_relevance, "opportunity");
  assert.equal(record.geotech_tier, "A");
  assert.equal(record.boreholes, true);
  assert.equal(record.spt, true);
  assert.equal(record.rock_coring, true);
  assert.match(record.parent_project_id, /^project:/);
});

test("keeps project triggers as leads rather than pretending they are tenders", () => {
  const record = normalizeSourceRecord("icn", {
    id: "ICN-9",
    url: "https://gateway.icn.org.au/project/ICN-9",
    title: "Western Sydney transmission line",
    description: "Early supplier engagement for a major transmission line.",
  }, { extractedAt });
  assert.equal(record.geotech_relevance, "potential_geotech_lead");
  assert.equal(record.geotech_tier, "C");
});

test("parses VendorPanel public RSS without authenticated document access", () => {
  const [record] = parseVendorPanelRss(`
    <rss><channel><item>
      <guid>VP-42</guid><link>https://vendorpanel.example/tenders/42</link>
      <title><![CDATA[Ground investigation services]]></title>
      <description>Public metadata for pavement testing</description>
      <dc:creator>Example Council</dc:creator><pubDate>Sun, 23 Aug 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`, { extractedAt });
  assert.equal(record.source_id, "VP-42");
  assert.equal(record.extraction_method, "rss");
  assert.equal(record.access_basis, "public");
  assert.deepEqual(record.documents, []);
});

test("parses authorised TenderLink and EstimateOne notification messages", () => {
  const tender = parseTenderNotification("tenderlink", {
    message_id: "mail-1",
    subject: "RFQ: Borehole investigation",
    text: "Organisation: Example Council\nTender ID: TL-10\nClosing Date: 2026-09-01\nhttps://portal.example/TL-10",
  }, { extractedAt });
  const lead = parseTenderNotification("estimateone", {
    message_id: "mail-2",
    subject: "Builder alert: Hospital redevelopment",
    text: "Builder: Example Build\nProject: West Hospital redevelopment\nLocation: Westmead\nhttps://estimate.example/P-2",
  }, { extractedAt });
  assert.equal(tender.buyer, "Example Council");
  assert.equal(tender.access_basis, "authorised-notification");
  assert.equal(lead.geotech_relevance, "potential_geotech_lead");
  assert.equal(lead.access_basis, "authorised-alert");
});

test("links cross-source signals into one explicit parent project", () => {
  const parent_project_id = "project:western-sydney-road";
  const records = [
    normalizeSourceRecord("buy-nsw", { id: "B1", url: "https://buy.example/B1", title: "Road geotechnical investigation", parent_project_id }, { extractedAt }),
    normalizeSourceRecord("icn", { id: "I1", url: "https://icn.example/I1", title: "Western Sydney road upgrade", parent_project_id }, { extractedAt }),
  ];
  const [project] = linkProjectSignals(records);
  assert.equal(project.parent_project_id, parent_project_id);
  assert.equal(project.source_count, 2);
  assert.deepEqual(project.opportunity_ids, ["buy-nsw:B1", "icn:I1"]);
});
