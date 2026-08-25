import {
  parseAusTenderAtmHtml,
  parseAustralianTendersPayload,
  parseBciCentralHtml,
  parseBuyNswSearchHtml,
  parseEstimateOneHtml,
  parseTenderLinkPublicHtml,
  parseVendorPanelRss,
} from "./source-adapters.js";

export const sourceCollectionConfiguration = Object.freeze({
  cron: "15 18 * * *",
  buyNswBaseUrl: "https://buy.nsw.gov.au/opportunity/search/",
  vendorPanelRssUrl: "https://www.vendorpanel.com.au/PublicTendersRssV2.aspx?mode=all",
  ausTenderBaseUrl: "https://www.tenders.gov.au/Atm",
  estimateOneNswUrl: "https://estimateone.com/tenders/new-south-wales-tenders/",
  tenderLinkNswUrl: "https://illion.tenderlink.com/tenders/all/australasia/australia/new-south-wales?keywords=",
  australianTendersSearchUrl: "https://www.australiantenders.com.au/algolia/tenders-search",
  australianTendersPublicUrl: "https://www.australiantenders.com.au/search/tenders/",
  bciCentralPublicUrl: "https://www.bcicentral.com/find-projects/",
  maxBuyNswPages: 50,
  maxAustralianTendersPages: 100,
  australianTendersPageSize: 100,
  queuePayloadBytes: 85_000,
  queueChunkRecords: 12,
});

const PUBLIC_BROWSER_HEADERS = Object.freeze({
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
});

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function chunkRecordsForQueue(records, {
  maxBytes = sourceCollectionConfiguration.queuePayloadBytes,
  maxRecords = sourceCollectionConfiguration.queueChunkRecords,
} = {}) {
  const chunks = [];
  let chunk = [];
  for (const record of records) {
    const candidate = [...chunk, record];
    if (chunk.length && (candidate.length > maxRecords || byteLength(candidate) > maxBytes)) {
      chunks.push(chunk);
      chunk = [record];
    } else {
      chunk = candidate;
    }
    if (byteLength(chunk) > maxBytes) {
      throw new Error(`A ${record.source} record exceeds the collector queue payload limit`);
    }
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

async function enqueueRecordChunks(queue, source, records, delayOffset = 0) {
  const chunks = chunkRecordsForQueue(records);
  await Promise.all(chunks.map((chunk, index) => queue.send({
    type: "ingest-records",
    source,
    records: chunk,
  }, { delaySeconds: delayOffset + index })));
  return chunks.length;
}

async function responseText(response, label) {
  if (!response?.ok) throw new Error(`${label} returned HTTP ${response?.status ?? "unknown"}`);
  return response.text();
}

async function scrapeRenderedHtml(browser, { url, selector, wrapperTag = "div", wrapperClass = "" }, label) {
  if (!browser?.quickAction) throw new Error("Cloudflare Browser Run binding is unavailable");
  const response = await browser.quickAction("scrape", {
    url,
    elements: [{ selector }],
    gotoOptions: { waitUntil: "networkidle2", timeout: 60_000 },
    waitForSelector: { selector, timeout: 60_000 },
    rejectResourceTypes: ["image", "media", "font", "stylesheet"],
  });
  if (!response?.ok) throw new Error(`${label} returned HTTP ${response?.status ?? "unknown"}`);
  const payload = await response.json();
  const groups = Array.isArray(payload?.result) ? payload.result : [];
  const elements = groups.flatMap((group) => Array.isArray(group?.results) ? group.results : []);
  const classAttribute = wrapperClass ? ` class="${wrapperClass}"` : "";
  const html = elements.map((element) => `<${wrapperTag}${classAttribute}>${element?.html ?? ""}</${wrapperTag}>`).join("\n");
  if (!html) throw new Error(`${label} returned no elements for ${selector}`);
  return html;
}

export async function enqueuePublicPortalCollection(queue, { sources } = {}) {
  if (!queue) throw new Error("Tender queue binding is unavailable");
  const jobs = [
    { source: "vendorpanel", body: { type: "collect-vendorpanel" }, delaySeconds: 0 },
    { source: "australian-tenders", body: { type: "collect-australian-tenders-page", page: 1 }, delaySeconds: 2 },
    { source: "estimateone", body: { type: "collect-estimateone" }, delaySeconds: 4 },
    { source: "bci-central", body: { type: "collect-bci-central" }, delaySeconds: 8 },
    { source: "tenderlink", body: { type: "collect-tenderlink" }, delaySeconds: 20 },
    { source: "buy-nsw", body: { type: "collect-buy-nsw-page", page: 1 }, delaySeconds: 32 },
    { source: "austender", body: { type: "collect-austender-page", page: 1 }, delaySeconds: 200 },
  ];
  const requested = Array.isArray(sources) && sources.length ? new Set(sources.map(String)) : null;
  const selected = requested ? jobs.filter(({ source }) => requested.has(source)) : jobs;
  if (!selected.length) throw new Error("No supported public sources were selected");
  await Promise.all(selected.map(({ body, delaySeconds }) => queue.send(body, delaySeconds ? { delaySeconds } : undefined)));
  return { queued: selected.map(({ source }) => source) };
}

export async function collectVendorPanel({ fetchImpl = fetch, queue, now = new Date().toISOString() }) {
  const response = await fetchImpl(sourceCollectionConfiguration.vendorPanelRssUrl, {
    headers: { Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8" },
  });
  const xml = await responseText(response, "VendorPanel RSS");
  const records = parseVendorPanelRss(xml, { extractedAt: now });
  if (!records.length) throw new Error("VendorPanel RSS returned no tender records");
  const chunks = await enqueueRecordChunks(queue, "vendorpanel", records);
  return { source: "vendorpanel", records: records.length, pages: 1, chunks };
}

export async function collectAusTender({ fetchImpl = fetch, queue, now = new Date().toISOString() }) {
  const records = [];
  let totalPages = 1;
  let expectedTotal = 0;
  for (let page = 1; page <= totalPages; page += 1) {
    const url = `${sourceCollectionConfiguration.ausTenderBaseUrl}?page=${page}`;
    const response = await fetchImpl(url, {
      headers: PUBLIC_BROWSER_HEADERS,
    });
    const html = await responseText(response, `AusTender page ${page}`);
    const parsed = parseAusTenderAtmHtml(html, { extractedAt: now, baseUrl: url });
    if (page === 1) {
      totalPages = Math.min(Math.max(parsed.totalPages, 1), 100);
      expectedTotal = parsed.total;
    }
    if (!parsed.records.length) throw new Error(`AusTender page ${page} returned no ATM records`);
    records.push(...parsed.records);
  }
  if (expectedTotal && records.length < expectedTotal) {
    throw new Error(`AusTender returned ${records.length} of ${expectedTotal} expected records`);
  }
  const chunks = await enqueueRecordChunks(queue, "austender", records);
  return { source: "austender", records: records.length, pages: totalPages, chunks };
}

export async function collectAusTenderPage({ page = 1 }, {
  fetchImpl = fetch,
  browser,
  queue,
  now = new Date().toISOString(),
}) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const url = `${sourceCollectionConfiguration.ausTenderBaseUrl}?page=${pageNumber}`;
  let response = await fetchImpl(url, { headers: PUBLIC_BROWSER_HEADERS });
  const html = response?.ok
    ? await response.text()
    : await scrapeRenderedHtml(browser, { url, selector: "main", wrapperTag: "main" }, `AusTender page ${pageNumber}`);
  const parsed = parseAusTenderAtmHtml(html, { extractedAt: now, baseUrl: url });
  if (!parsed.records.length) throw new Error(`AusTender page ${pageNumber} returned no ATM records`);
  const chunks = await enqueueRecordChunks(queue, "austender", parsed.records);

  if (pageNumber === 1) {
    const totalPages = Math.min(Math.max(parsed.totalPages, 1), 100);
    await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, (_value, index) => {
      const nextPage = index + 2;
      return queue.send({ type: "collect-austender-page", page: nextPage }, { delaySeconds: (nextPage - 1) * 12 });
    }));
  }

  return {
    source: "austender",
    records: parsed.records.length,
    pages: pageNumber === 1 ? parsed.totalPages : 1,
    page: pageNumber,
    chunks,
  };
}

export async function collectAustralianTendersPage({ page = 1 }, {
  fetchImpl = fetch,
  queue,
  now = new Date().toISOString(),
}) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = sourceCollectionConfiguration.australianTendersPageSize;
  const response = await fetchImpl(sourceCollectionConfiguration.australianTendersSearchUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": PUBLIC_BROWSER_HEADERS["User-Agent"],
      Origin: "https://www.australiantenders.com.au",
      Referer: sourceCollectionConfiguration.australianTendersPublicUrl,
    },
    body: JSON.stringify({
      currentPage: pageNumber - 1,
      previousCount: -1,
      sortBy: 2,
      pageSize,
      categoriesSearch: [],
      regionsSearch: [],
      issuerTypeSearch: [],
      title: "",
      status: 14,
      match: null,
      issuersSearch: [],
    }),
  });
  if (!response?.ok) throw new Error(`Australian Tenders page ${pageNumber} returned HTTP ${response?.status ?? "unknown"}`);
  const payload = await response.json();
  const parsed = parseAustralianTendersPayload(payload, {
    extractedAt: now,
    baseUrl: sourceCollectionConfiguration.australianTendersPublicUrl,
    pageSize,
  });
  if (!parsed.records.length) throw new Error(`Australian Tenders page ${pageNumber} returned no public records`);
  const chunks = await enqueueRecordChunks(queue, "australian-tenders", parsed.records);

  if (pageNumber === 1) {
    const totalPages = Math.min(parsed.totalPages, sourceCollectionConfiguration.maxAustralianTendersPages);
    await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, (_value, index) => {
      const nextPage = index + 2;
      return queue.send({ type: "collect-australian-tenders-page", page: nextPage }, { delaySeconds: (nextPage - 1) * 3 });
    }));
  }

  return {
    source: "australian-tenders",
    records: parsed.records.length,
    pages: pageNumber === 1 ? parsed.totalPages : 1,
    page: pageNumber,
    chunks,
  };
}

export async function collectEstimateOne({ fetchImpl = fetch, queue, now = new Date().toISOString() }) {
  const response = await fetchImpl(sourceCollectionConfiguration.estimateOneNswUrl, {
    headers: PUBLIC_BROWSER_HEADERS,
  });
  const html = await responseText(response, "EstimateOne public NSW listings");
  const records = parseEstimateOneHtml(html, {
    extractedAt: now,
    baseUrl: sourceCollectionConfiguration.estimateOneNswUrl,
  });
  if (!records.length) throw new Error("EstimateOne returned no public NSW project cards");
  const chunks = await enqueueRecordChunks(queue, "estimateone", records);
  return { source: "estimateone", records: records.length, pages: 1, chunks };
}

export async function collectBciCentral({ fetchImpl = fetch, browser, queue, now = new Date().toISOString() }) {
  const html = browser?.quickAction
    ? await scrapeRenderedHtml(browser, {
        url: sourceCollectionConfiguration.bciCentralPublicUrl,
        selector: ".search-details",
        wrapperClass: "search-details",
      }, "BCI Central public project search")
    : await responseText(
        await fetchImpl(sourceCollectionConfiguration.bciCentralPublicUrl, { headers: PUBLIC_BROWSER_HEADERS }),
        "BCI Central public project search",
      );
  const records = parseBciCentralHtml(html, {
    extractedAt: now,
    baseUrl: sourceCollectionConfiguration.bciCentralPublicUrl,
  });
  if (!records.length) throw new Error("BCI Central returned no anonymous public project leads");
  const chunks = await enqueueRecordChunks(queue, "bci-central", records);
  return { source: "bci-central", records: records.length, pages: 1, chunks };
}

export async function collectTenderLink({ browser, queue, now = new Date().toISOString() }) {
  const html = await scrapeRenderedHtml(browser, {
    url: sourceCollectionConfiguration.tenderLinkNswUrl,
    selector: ".tenders",
    wrapperClass: "tenders",
  }, "TenderLink public NSW listings");
  const records = parseTenderLinkPublicHtml(html, {
    extractedAt: now,
    baseUrl: sourceCollectionConfiguration.tenderLinkNswUrl,
  });
  if (!records.length) throw new Error("TenderLink returned no rendered public NSW listings");
  const chunks = await enqueueRecordChunks(queue, "tenderlink", records);
  return { source: "tenderlink", records: records.length, pages: 1, chunks };
}

export async function collectBuyNswPage({ page = 1 }, {
  browser,
  queue,
  now = new Date().toISOString(),
}) {
  if (!browser?.quickAction) throw new Error("Cloudflare Browser Run binding is unavailable");
  const pageNumber = Math.max(1, Number(page) || 1);
  const url = `${sourceCollectionConfiguration.buyNswBaseUrl}?page=${pageNumber}`;
  const html = await scrapeRenderedHtml(browser, {
    url,
    selector: "#search-results",
    wrapperClass: "search-results",
  }, `buy.NSW page ${pageNumber}`);
  const parsed = parseBuyNswSearchHtml(html, { extractedAt: now, baseUrl: url });
  if (!parsed.records.length) throw new Error(`buy.NSW page ${pageNumber} returned no opportunity records`);
  const chunks = await enqueueRecordChunks(queue, "buy-nsw", parsed.records);

  if (pageNumber === 1) {
    const totalPages = Math.min(parsed.totalPages, sourceCollectionConfiguration.maxBuyNswPages);
    await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, (_value, index) => {
      const nextPage = index + 2;
      return queue.send({ type: "collect-buy-nsw-page", page: nextPage }, { delaySeconds: (nextPage - 1) * 12 });
    }));
  }

  return {
    source: "buy-nsw",
    records: parsed.records.length,
    pages: pageNumber === 1 ? parsed.totalPages : 1,
    page: pageNumber,
    chunks,
  };
}

export function isCollectorMessage(message) {
  return [
    "collect-vendorpanel",
    "collect-austender",
    "collect-austender-page",
    "collect-australian-tenders-page",
    "collect-estimateone",
    "collect-bci-central",
    "collect-tenderlink",
    "collect-buy-nsw-page",
    "ingest-records",
  ].includes(message?.type);
}
