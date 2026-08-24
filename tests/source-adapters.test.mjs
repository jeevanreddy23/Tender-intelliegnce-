import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateGroups,
  findProjectLinkCandidates,
  linkProjectSignals,
  normalizeSourceRecord,
  parseAusTenderAtmHtml,
  parseAusTenderPayload,
  parseAustralianTendersPayload,
  parseBciCentralHtml,
  parseBuyNswLiveRecords,
  parseBuyNswNoticeReportRow,
  parseBuyNswSearchHtml,
  parseEprocurePayload,
  parseEstimateOneHtml,
  parseIcnPayload,
  parseTenderLinkPublicHtml,
  parseTenderNotification,
  parseVendorPanelRss,
  scoreIngestedRecord,
  supportedSourcePolicies,
  validateCanonicalRecord,
} from "../lib/source-adapters.js";

const extractedAt = "2026-08-24T00:00:00.000Z";

test("supports the public and approved source families with bounded access policies", () => {
  assert.deepEqual(Object.keys(supportedSourcePolicies).sort(), [
    "austender", "australian-tenders", "bci-central", "buy-nsw", "eprocure", "estimateone", "icn", "tenderlink", "vendorpanel",
  ]);
  assert.equal(supportedSourcePolicies.vendorpanel.extraction_method, "rss");
  assert.equal(supportedSourcePolicies.eprocure.access, "approved-integration");
  assert.equal(supportedSourcePolicies.tenderlink.access, "public-metadata");
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
  const [record, alternateOffsetRecord] = parseVendorPanelRss(`
    <rss><channel><item>
      <guid>VP-42</guid><link>https://vendorpanel.example/tenders/42</link>
      <title><![CDATA[Ground investigation services]]></title>
      <description><![CDATA[<b>Tender Details : </b> Pavement testing and boreholes<br /><br />
        <b>Issued by : </b> Example Council<br />
        <b>Closing Date</b> : 01/Sep/2026 05:00 PM (UTC+10:00)<br />
        <b>Reference number</b> : VP522464]]></description>
      <pubDate>Sun, 23 Aug 2026 00:00:00 GMT</pubDate>
    </item><item>
      <guid>VP-43</guid><link>https://vendorpanel.example/tenders/43</link>
      <title>Ground investigation services</title>
      <description><![CDATA[<b>Tender Details : </b> Boreholes<br /><br />
        <b>Closing Date</b> : 01/Sep/2026 05:00 PM (UTC+11:00)]]></description>
    </item></channel></rss>`, { extractedAt });
  assert.equal(record.source_id, "VP522464");
  assert.equal(record.buyer, "Example Council");
  assert.equal(record.closing_date, "2026-09-01T07:00:00.000Z");
  assert.equal(record.state, null);
  assert.match(record.scope, /Pavement testing and boreholes/);
  assert.equal(record.extraction_method, "rss");
  assert.equal(record.access_basis, "public");
  assert.deepEqual(record.documents, []);
  assert.equal(alternateOffsetRecord.closing_date, "2026-09-01T06:00:00.000Z");
});

test("classifies known NSW VendorPanel councils without admitting New Zealand buyers", () => {
  const records = parseVendorPanelRss(`<rss><channel>
    <item><guid>VP-NSW</guid><link>https://vendorpanel.example/NSW</link><title>Road investigation</title>
      <description><![CDATA[<b>Tender Details : </b> Pavement investigation<br /><br /><b>Issued by : </b> Gwydir Shire Council<br /><b>Closing Date</b> : 11/Sep/2026 05:00 PM (UTC+10:00)]]></description></item>
    <item><guid>VP-NZ</guid><link>https://vendorpanel.example/NZ</link><title>Road investigation</title>
      <description><![CDATA[<b>Tender Details : </b> Pavement investigation in Auckland<br /><br /><b>Issued by : </b> Auckland Council<br /><b>Closing Date</b> : 11/Sep/2026 05:00 PM (UTC+10:00)]]></description></item>
  </channel></rss>`, { extractedAt });
  assert.equal(records[0].state, "NSW");
  assert.equal(records[1].state, null);
});

test("parses every result and page count from a buy NSW search page", () => {
  const html = `
    <p>126 total opportunities</p><h2>Displaying 1-10 of 126 results</h2>
    <a href="?page=13">Page 13</a>
    <ul><li><h3>Geotechnical investigation for regional bridge</h3>
      <p><b>Closes:</b> 11-Sep-2026 15:00</p>
      <p class="subcat">Engineering and technical</p>
      <ul class="pills"><li>RFT-900</li></ul>
      <p class="limit L5">Boreholes, SPT and rock coring.</p>
      <dl><dt>Opportunity type</dt><dd>Request for tender (RFT)</dd><dt>Agency</dt><dd>Transport for NSW</dd></dl>
      <a href="/prcOpportunity/ABC-900">See details</a></li></ul>`;
  const parsed = parseBuyNswSearchHtml(html, { extractedAt });
  assert.equal(parsed.total, 126);
  assert.equal(parsed.totalPages, 13);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].source_id, "RFT-900");
  assert.equal(parsed.records[0].buyer, "Transport for NSW");
  assert.equal(parsed.records[0].closing_date, "2026-09-11T15:00:00.000Z");
  assert.equal(parsed.records[0].geotech_tier, "A");
});

test("parses current AusTender ATM pages with full pagination metadata", () => {
  const html = `
    <div>Showing 1-15 of <strong>82</strong> records</div><a href="?page=6">Page 6</a>
    <div class="row"><div class="col-sm-4"><div><p class="lead">Ground investigation services</p></div></div>
      <div class="col-sm-8"><div class="box boxW listInner">
        <div class="list-desc"><span>ATM ID:</span><div class="list-desc-inner"><a href="/Atm/Show/ATM-GUID">ATM-100</a></div></div>
        <div class="list-desc"><span>Close Date &amp; Time:</span><div class="list-desc-inner">25-Aug-2026 2:00 pm <span>(ACT Local Time)</span></div></div>
        <div class="list-desc"><span>Agency:</span><div class="list-desc-inner">Department of Infrastructure</div></div>
        <div class="list-desc"><span>Category:</span><div class="list-desc-inner">Engineering services</div></div>
        <div class="list-desc"><span>Description:</span><div class="list-desc-inner">Boreholes and pavement investigation</div></div>
        <div class="last-updated"><strong>Last Updated:</strong> 11-Aug-2026 3:43 pm <span>(ACT Local Time)</span></div>
      </div></div></div>`;
  const parsed = parseAusTenderAtmHtml(html, { extractedAt });
  assert.equal(parsed.total, 82);
  assert.equal(parsed.totalPages, 6);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].source_id, "ATM-100");
  assert.equal(parsed.records[0].buyer, "Department of Infrastructure");
  assert.equal(parsed.records[0].closing_date, "2026-08-25T14:00:00.000Z");
  assert.equal(parsed.records[0].source_stream, "live");
});

test("parses EstimateOne public NSW project cards without subscription-only fields", () => {
  const records = parseEstimateOneHtml(`<div class="project-card">
    <div class="project-card__header"><h3 class="project-card__title"><a class="project-card__link" href="https://estimateone.com/project/bridge-upgrade/">Regional bridge upgrade</a></h3>
    <div class="project-card__location project-card__location--display_sm">Maitland, NSW, Australia</div></div>
    <div class="project-card__details"><div class="project-card__budget"><span class="point__text">$1.5m - $2m</span></div>
    <div class="project-card__category"><span class="point__text">Civil</span></div></div></div>`, { extractedAt });
  assert.equal(records.length, 1);
  assert.equal(records[0].source_id, "bridge-upgrade");
  assert.equal(records[0].suburb, "Maitland");
  assert.equal(records[0].estimated_value, 2_000_000);
  assert.equal(records[0].access_basis, "public-metadata");
  assert.deepEqual(records[0].documents, []);
});

test("parses TenderLink rendered public listings and marks already-closed samples", () => {
  const records = parseTenderLinkPublicHtml(`<div class="row"><div class="col-md-9">
    <h4>Road pavement investigation RFQ</h4><p><strong>State/Region:</strong> Hunter (New South Wales)</p></div>
    <div class="col-md-12 details"><p><strong>Notice Type</strong>: Request for Quotation</p>
    <p><strong>illion TenderLink Ref</strong>: TEST-100</p><p><strong>Closing Date</strong>: 2026-08-20</p>
    <p><strong>Organisation</strong>: Example Council</p></div></div>`, { extractedAt });
  assert.equal(records.length, 1);
  assert.equal(records[0].source_id, "TEST-100");
  assert.equal(records[0].buyer, "Example Council");
  assert.equal(records[0].status, "closed");
  assert.equal(records[0].access_basis, "public-metadata");
});

test("normalizes every Australian Tenders public search result and page count", () => {
  const parsed = parseAustralianTendersPayload({ recordsTotal: 4_246, records: [{
    id: 619637,
    slug: "ulan-line-bearing-replacements",
    title: "Ulan Line Bearing Replacements",
    overview: "Provision of services to undertake culvert replacement in NSW.",
    status: "Current",
    issuer: "",
    issuerType: "Sign-up to see organisation name",
    region: "NSW",
    closingDate: "2026-09-24T00:00:00Z",
  }] }, { extractedAt, pageSize: 100 });
  assert.equal(parsed.total, 4_246);
  assert.equal(parsed.totalPages, 43);
  assert.equal(parsed.records[0].source_id, "619637");
  assert.equal(parsed.records[0].buyer, null);
  assert.equal(parsed.records[0].state, "NSW");
  assert.equal(parsed.records[0].access_basis, "public-metadata");
});

test("parses BCI anonymous public project leads without inventing hidden names", () => {
  const records = parseBciCentralHtml(`<div class="search-details"><ul>
    <li><span>Project Type</span>: <span class="result_content">SUBDIVISION (120 lots)</span></li>
    <li><span>Approximate Value</span>: <span class="result_content">AUD 3.50 million</span></li>
    <li><span>Sector</span>: <span class="result_content">Infrastructure</span></li></ul><ul>
    <li><span>Stage</span>: <span class="result_content">Design &amp; Documentation</span></li>
    <li><span>Location</span>: <span class="result_content">Newcastle, New South Wales</span></li>
    <li><span>Project ID</span>: <span class="result_content">79622010</span></li></ul></div>`, { extractedAt });
  assert.equal(records.length, 1);
  assert.equal(records[0].source_id, "79622010");
  assert.equal(records[0].title, "SUBDIVISION (120 lots) — Newcastle, New South Wales");
  assert.equal(records[0].estimated_value, 3_500_000);
  assert.equal(records[0].state, "NSW");
  assert.equal(records[0].geotech_relevance, "potential_geotech_lead");
  assert.equal(records[0].access_basis, "public-metadata");
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

test("maps buy NSW live types and notice-report awards into separate canonical streams", () => {
  const [live] = parseBuyNswLiveRecords({ opportunities: [{
    opportunity_id: "P-RFT-77",
    title: "Proposed geotechnical investigation for a bridge replacement",
    agency: "Transport for NSW",
    opportunity_type: "Proposed opportunity (P-RFT)",
    closing_date: "2026-09-30T15:00:00+10:00",
    category: "Engineering and technical",
  }] }, { extractedAt });
  const award = parseBuyNswNoticeReportRow({
    "Notice ID": "CAN-88",
    "Notice type": "Contract award",
    "Notice title": "Geotechnical investigation services",
    "Department/Agency": "Transport for NSW",
    "Successful supplier": "Example Geotech Pty Ltd",
    "Supplier ABN": "11 222 333 444",
    "Contract value": "$185,000",
    "Contract start date": "01/08/2026",
    "Contract end date": "31/12/2026",
    "Method of tendering": "Open tender",
    "Related opportunity ID": "RFT-80",
  }, { extractedAt });

  assert.equal(live.procurement_type, "proposed-opportunity");
  assert.equal(live.source_stream, "live");
  assert.equal(live.status, "planned");
  assert.equal(award.procurement_type, "contract-award");
  assert.equal(award.source_stream, "historical");
  assert.equal(award.status, "awarded");
  assert.equal(award.contract_value, 185000);
  assert.equal(award.contract_start, "2026-08-01T00:00:00.000Z");
  assert.equal(award.contract_end, "2026-12-31T00:00:00.000Z");
  assert.equal(award.successful_supplier, "Example Geotech Pty Ltd");
  assert.equal(award.related_opportunity_id, "RFT-80");
  assert.deepEqual(validateCanonicalRecord(award), { valid: true, missing: [] });
});

test("enforces eProcure approval and normalizes approved API results", () => {
  const payload = { tenders: [{
    tenderNumber: "EP-12",
    publicUrl: "https://eprocure.example/EP-12",
    name: "Ground investigation services",
    organization: "Example Council",
    tenderType: "RFP",
    status: "Open",
  }] };
  assert.throws(() => parseEprocurePayload(payload), /approved integration access/i);
  const [record] = parseEprocurePayload(payload, { integrationApproved: true, extractedAt });
  assert.equal(record.procurement_type, "rfp");
  assert.equal(record.buyer, "Example Council");
  assert.equal(record.access_basis, "approved-integration");
});

test("keeps AusTender live opportunities separate from historical awards", () => {
  const [live] = parseAusTenderPayload([{ atmId: "ATM-1", publicUrl: "https://austender.example/ATM-1", title: "Pavement investigation", closeDate: "2026-09-01" }], { stream: "live", extractedAt });
  const [award] = parseAusTenderPayload([{ contractId: "CN-1", publicUrl: "https://austender.example/CN-1", description: "Geotechnical drilling", value: 420000, supplier: "Drill Co", atmId: "ATM-1" }], { stream: "historical", extractedAt });
  assert.equal(live.source_stream, "live");
  assert.equal(live.status, "open");
  assert.equal(award.source_stream, "historical");
  assert.equal(award.status, "awarded");
  assert.equal(award.related_opportunity_id, "ATM-1");
  assert.equal(award.geotech_relevance, "archive");
});

test("links ICN work packages to their parent infrastructure project", () => {
  const records = parseIcnPayload({
    projects: [{ id: "ICN-P1", url: "https://icn.example/P1", name: "Western Sydney transmission line", owner: "Energy Co" }],
    work_packages: [{ id: "ICN-W1", project_id: "ICN-P1", url: "https://icn.example/W1", name: "Ground investigation EOI", type: "EOI" }],
  }, { extractedAt });
  assert.equal(records.length, 2);
  assert.equal(records[0].parent_project_id, "project:icn:ICN-P1");
  assert.equal(records[1].parent_project_id, records[0].parent_project_id);
  assert.equal(records[1].procurement_type, "eoi");
});

test("reuses tender IDs for addenda and keeps authorised attachments separate", () => {
  const record = parseTenderNotification("tenderlink", {
    message_id: "mail-addendum-2",
    subject: "Addendum 2: Borehole investigation",
    text: "Tender ID: TL-10\nOrganisation: Example Council\nhttps://portal.example/TL-10",
    attachments: [{ title: "Addendum 2", url: "authorised://mail-addendum-2" }],
  }, { extractedAt });
  assert.equal(record.source_id, "TL-10");
  assert.deepEqual(record.documents, []);
  assert.equal(record.addenda.length, 1);
});

test("flags conservative cross-source project candidates without silently merging them", () => {
  const records = [
    normalizeSourceRecord("buy-nsw", { id: "B2", url: "https://buy.example/B2", title: "Western Sydney road upgrade RFQ", project_name: "Western Sydney road upgrade", suburb: "Parramatta", state: "NSW" }, { extractedAt }),
    normalizeSourceRecord("estimateone", { id: "E2", url: "https://estimate.example/E2", title: "Western Sydney road upgrade package", project_name: "Western Sydney road upgrade", suburb: "Parramatta", state: "NSW" }, { extractedAt }),
  ];
  const candidates = findProjectLinkCandidates(records);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].review_required, true);
  assert.equal(new Set(records.map(({ parent_project_id }) => parent_project_id)).size, 2);
});

test("finds duplicate advertisements and produces an auditable opportunity score", () => {
  const records = [
    normalizeSourceRecord("buy-nsw", { id: "B3", url: "https://buy.example/B3", title: "Geotechnical investigation", buyer: "Example Council", closing_date: "2026-09-01", state: "NSW", scope: "Boreholes, SPT and rock coring" }, { extractedAt }),
    normalizeSourceRecord("vendorpanel", { id: "V3", url: "https://vendor.example/V3", title: "Geotechnical investigation", buyer: "Example Council", closing_date: "2026-09-01", state: "NSW", scope: "Boreholes, SPT and rock coring" }, { extractedAt }),
  ];
  assert.equal(findDuplicateGroups(records).length, 1);
  const assessment = scoreIngestedRecord(records[0], {
    now: "2026-08-24T00:00:00.000Z",
    relationshipStrength: 80,
    clientPriority: 85,
  });
  assert.ok(assessment.opportunityScore >= 80);
  assert.equal(assessment.decisionQueue, "Pursue");
  assert.ok(assessment.components.geotechRelevance >= 80);
});
