import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkRecordsForQueue,
  collectAusTender,
  collectAusTenderPage,
  collectAustralianTendersPage,
  collectBciCentral,
  collectBuyNswPage,
  collectEstimateOne,
  collectTenderLink,
  collectVendorPanel,
  enqueuePublicPortalCollection,
} from "../lib/public-portal-collectors.js";

const now = "2026-08-24T00:00:00.000Z";

function queueDouble() {
  const messages = [];
  return {
    messages,
    async send(body, options) { messages.push({ body, options }); },
  };
}

function scrapeResponse(selector, html) {
  return Response.json({ success: true, result: [{ selector, results: [{ html, attributes: [] }] }] });
}

test("chunks collector records below queue payload and count limits", () => {
  const records = Array.from({ length: 25 }, (_value, index) => ({ id: index, text: "x".repeat(1_000) }));
  const chunks = chunkRecordsForQueue(records, { maxBytes: 20_000, maxRecords: 10 });
  assert.deepEqual(chunks.map((chunk) => chunk.length), [10, 10, 5]);
});

test("queues all public portal collectors for a scheduled refresh", async () => {
  const queue = queueDouble();
  const result = await enqueuePublicPortalCollection(queue);
  assert.deepEqual(result.queued, ["vendorpanel", "australian-tenders", "estimateone", "bci-central", "tenderlink", "buy-nsw", "austender"]);
  assert.deepEqual(queue.messages.map(({ body }) => body.type), [
    "collect-vendorpanel", "collect-australian-tenders-page", "collect-estimateone", "collect-bci-central",
    "collect-tenderlink", "collect-buy-nsw-page", "collect-austender-page",
  ]);
});

test("can queue one selected source for an operational retry", async () => {
  const queue = queueDouble();
  const result = await enqueuePublicPortalCollection(queue, { sources: ["bci-central"] });
  assert.deepEqual(result.queued, ["bci-central"]);
  assert.equal(queue.messages.length, 1);
  assert.equal(queue.messages[0].body.type, "collect-bci-central");
});

test("collects the complete VendorPanel RSS payload into ingestion chunks", async () => {
  const queue = queueDouble();
  const xml = `<rss><channel><item><title>Geotechnical services</title><guid>VP-1</guid>
    <link>https://vendorpanel.example/VP-1</link><description>Boreholes and SPT</description></item></channel></rss>`;
  const result = await collectVendorPanel({
    queue,
    now,
    fetchImpl: async () => new Response(xml, { status: 200 }),
  });
  assert.equal(result.records, 1);
  assert.equal(queue.messages[0].body.type, "ingest-records");
  assert.equal(queue.messages[0].body.records[0].source, "vendorpanel");
});

test("paginates every current AusTender ATM result page", async () => {
  const queue = queueDouble();
  const pageHtml = (page) => `<div>Showing ${page}-${page} of <strong>2</strong> records</div><a href="?page=2">Page 2</a>
    <div class="row"><div class="col-sm-4"><p class="lead">Ground investigation ${page}</p></div>
    <div class="col-sm-8"><div class="list-desc"><span>ATM ID:</span><div class="list-desc-inner"><a href="/Atm/Show/G-${page}">ATM-${page}</a></div></div>
    <div class="list-desc"><span>Description:</span><div class="list-desc-inner">Boreholes</div></div></div></div>`;
  const fetched = [];
  const result = await collectAusTender({
    queue,
    now,
    fetchImpl: async (url) => {
      fetched.push(url);
      return new Response(pageHtml(new URL(url).searchParams.get("page")), { status: 200 });
    },
  });
  assert.equal(result.records, 2);
  assert.equal(fetched.length, 2);
  assert.equal(queue.messages[0].body.records.length, 2);
});

test("falls back to Browser Run for blocked AusTender pages and staggers pagination", async () => {
  const queue = queueDouble();
  const html = `<div>Showing 1-15 of <strong>30</strong> records</div><a href="?page=2">Page 2</a>
    <div class="row"><div class="col-sm-4"><p class="lead">Ground investigation</p></div>
    <div class="col-sm-8"><div class="list-desc"><span>ATM ID:</span><div class="list-desc-inner"><a href="/Atm/Show/G-1">ATM-1</a></div></div>
    <div class="list-desc"><span>Description:</span><div class="list-desc-inner">Boreholes</div></div></div></div>`;
  const browser = { async quickAction(action) { assert.equal(action, "scrape"); return scrapeResponse("main", html); } };
  const result = await collectAusTenderPage({ page: 1 }, {
    browser,
    queue,
    now,
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  });
  assert.equal(result.records, 1);
  assert.equal(result.pages, 2);
  const secondPage = queue.messages.find(({ body }) => body.type === "collect-austender-page");
  assert.equal(secondPage.body.page, 2);
  assert.equal(secondPage.options.delaySeconds, 12);
});

test("paginates the complete Australian Tenders public active search", async () => {
  const queue = queueDouble();
  const result = await collectAustralianTendersPage({ page: 1 }, {
    queue,
    now,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.currentPage, 0);
      assert.equal(body.pageSize, 100);
      assert.equal(body.status, 14);
      return Response.json({ recordsTotal: 250, records: [{
        id: 100,
        slug: "ground-investigation",
        title: "Ground investigation",
        overview: "Boreholes and SPT",
        status: "Current",
        region: "NSW",
        closingDate: "2026-09-01T00:00:00Z",
      }] });
    },
  });
  assert.equal(result.records, 1);
  assert.equal(result.pages, 3);
  assert.ok(queue.messages.some(({ body }) => body.type === "ingest-records"));
  const pages = queue.messages.filter(({ body }) => body.type === "collect-australian-tenders-page");
  assert.deepEqual(pages.map(({ body }) => body.page), [2, 3]);
  assert.deepEqual(pages.map(({ options }) => options.delaySeconds), [3, 6]);
});

test("collects EstimateOne and BCI public metadata without login-only details", async () => {
  const estimateQueue = queueDouble();
  const estimate = await collectEstimateOne({
    queue: estimateQueue,
    now,
    fetchImpl: async () => new Response(`<div class="project-card"><h3><a class="project-card__link" href="https://estimateone.com/project/test-project/">Test project</a></h3><div class="project-card__location project-card__location--display_sm">Sydney, NSW</div></div>`, { status: 200 }),
  });
  assert.equal(estimate.records, 1);
  assert.equal(estimateQueue.messages[0].body.records[0].access_basis, "public-metadata");

  const bciQueue = queueDouble();
  const bci = await collectBciCentral({
    queue: bciQueue,
    now,
    browser: { async quickAction(action) {
      assert.equal(action, "scrape");
      return scrapeResponse(".search-details", `<ul><li><span>Project Type</span>: <span class="result_content">BRIDGE</span></li></ul><ul><li><span>Location</span>: <span class="result_content">Sydney, New South Wales</span></li><li><span>Project ID</span>: <span class="result_content">BCI-1</span></li></ul>`);
    } },
  });
  assert.equal(bci.records, 1);
  assert.equal(bciQueue.messages[0].body.records[0].title, "BRIDGE — Sydney, New South Wales");
});

test("uses Browser Run element scraping only for TenderLink rendered public metadata", async () => {
  const queue = queueDouble();
  const html = `<div class="row"><div class="col-md-9"><h4>Ground investigation</h4><p><strong>State/Region:</strong> NSW</p></div><div class="details"><p><strong>Notice Type</strong>: Request for Tender</p><p><strong>illion TenderLink Ref</strong>: TL-1</p><p><strong>Closing Date</strong>: 2026-09-20</p><p><strong>Organisation</strong>: Example Council</p></div></div>`;
  const browser = { async quickAction(action) { assert.equal(action, "scrape"); return scrapeResponse(".tenders", html); } };
  const result = await collectTenderLink({ browser, queue, now });
  assert.equal(result.records, 1);
  assert.equal(queue.messages[0].body.records[0].source, "tenderlink");
  assert.equal(queue.messages[0].body.records[0].access_basis, "public-metadata");
});

test("uses Browser Run for buy NSW and schedules every discovered page", async () => {
  const queue = queueDouble();
  const html = `<p>20 total opportunities</p><h2>Displaying 1-10 of 20 results</h2><a href="?page=2">Page 2</a>
    <ul><li><h3>Geotechnical investigation</h3><p><b>Closes:</b> 11-Sep-2026 15:00</p>
    <ul class="pills"><li>RFT-1</li></ul><p class="limit">Boreholes</p>
    <dl><dt>Agency</dt><dd>Transport for NSW</dd></dl><a href="/prcOpportunity/G-1">See details</a></li></ul>`;
  const browser = { async quickAction(action) { assert.equal(action, "scrape"); return scrapeResponse("#search-results", html); } };
  const result = await collectBuyNswPage({ page: 1 }, { browser, queue, now });
  assert.equal(result.records, 1);
  assert.equal(result.pages, 2);
  assert.ok(queue.messages.some(({ body }) => body.type === "ingest-records"));
  const pageTwo = queue.messages.find(({ body }) => body.type === "collect-buy-nsw-page");
  assert.equal(pageTwo.body.page, 2);
  assert.equal(pageTwo.options.delaySeconds, 12);
});
