/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { activeNswGeotechnicalTenderSql } from "../lib/active-opportunity.js";
import {
  ingestTenderRecords,
  processTenderAnalysisMessage,
  requeuePendingAnalyses,
  tenderAiConfiguration,
} from "../lib/tender-ai-pipeline.js";
import {
  collectAusTender,
  collectAusTenderPage,
  collectAustralianTendersPage,
  collectBciCentral,
  collectBuyNswPage,
  collectEstimateOne,
  collectTenderLink,
  collectVendorPanel,
  enqueuePublicPortalCollection,
  isCollectorMessage,
  sourceCollectionConfiguration,
} from "../lib/public-portal-collectors.js";

interface FetcherBinding {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatementBinding {
  bind(...values: unknown[]): D1PreparedStatementBinding;
  run(): Promise<unknown>;
  first(): Promise<Record<string, unknown> | null>;
  all(): Promise<{ results?: Record<string, unknown>[] }>;
}

interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementBinding;
}

interface TenderQueueBinding {
  send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

interface BrowserRunBinding {
  quickAction(action: "content" | "scrape", options: Record<string, unknown>): Promise<Response>;
}

interface TenderQueueMessage {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface TenderQueueBatch {
  messages: TenderQueueMessage[];
}

interface Env {
  ASSETS: FetcherBinding;
  DB: D1DatabaseBinding;
  TENDER_AI_QUEUE?: TenderQueueBinding;
  BROWSER?: BrowserRunBinding;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_STRATEGY_MODEL?: string;
  TENDER_SOURCE_CRON?: string;
  INGESTION_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function hasIngestionAccess(request: Request, env: Env) {
  if (!env.INGESTION_TOKEN) return false;
  return request.headers.get("Authorization") === `Bearer ${env.INGESTION_TOKEN}`;
}

const visibleOpportunityPredicate = activeNswGeotechnicalTenderSql;

async function handleTenderIngestion(request: Request, env: Env): Promise<Response> {
  if (!hasIngestionAccess(request, env)) {
    return Response.json({ error: "A valid ingestion bearer token is required." }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const records = Array.isArray(payload.records) ? payload.records : payload.record ? [payload.record] : [];
  try {
    const queue = env.DEEPSEEK_API_KEY ? env.TENDER_AI_QUEUE : undefined;
    const outcomes = await ingestTenderRecords(records, { db: env.DB, queue });
    return Response.json({ accepted: outcomes.length, outcomes }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tender ingestion failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

async function handleOpportunityFeed(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const [countRow, rows, sourceRows] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM tender_records r
      WHERE ${visibleOpportunityPredicate}
    `).first(),
    env.DB.prepare(`
      SELECT
        r.opportunity_id, r.source, r.source_id, r.source_url, r.title, r.buyer,
        r.published_at, r.closing_at, r.contract_value, r.prefilter_score,
        r.ai_status, r.authoritative_json, r.updated_at,
        (
          SELECT a.analysis_json
          FROM tender_ai_analyses a
          WHERE a.opportunity_id = r.opportunity_id
          ORDER BY a.created_at DESC
          LIMIT 1
        ) AS analysis_json
      FROM tender_records r
      WHERE ${visibleOpportunityPredicate}
      ORDER BY
        CASE WHEN r.closing_at IS NULL THEN 1 ELSE 0 END,
        r.closing_at ASC,
        r.prefilter_score DESC,
        r.updated_at DESC
      LIMIT ?1 OFFSET ?2
    `).bind(limit, offset).all(),
    env.DB.prepare(`
      SELECT source, COUNT(*) AS count, MAX(updated_at) AS last_updated
      FROM tender_records r
      WHERE ${visibleOpportunityPredicate}
      GROUP BY source
      ORDER BY count DESC
    `).all(),
  ]);
  const records = (rows.results ?? []).map((row) => {
    let authoritative: Record<string, unknown> = {};
    let analysis: Record<string, unknown> | null = null;
    try {
      authoritative = JSON.parse(String(row.authoritative_json ?? "{}"));
      delete authoritative.raw_source;
    } catch {
      authoritative = {};
    }
    try {
      analysis = row.analysis_json ? JSON.parse(String(row.analysis_json)) : null;
    } catch {
      analysis = null;
    }
    return {
      ...authoritative,
      opportunity_id: row.opportunity_id,
      source: row.source,
      source_id: row.source_id,
      source_url: row.source_url,
      title: row.title,
      buyer: row.buyer,
      published_date: row.published_at,
      closing_date: row.closing_at,
      contract_value: row.contract_value,
      prefilter_score: row.prefilter_score,
      ai_status: row.ai_status,
      analysis,
      updated_at: row.updated_at,
    };
  });
  const total = Number(countRow?.total) || 0;
  return Response.json({
    total,
    limit,
    offset,
    has_more: offset + records.length < total,
    records,
    sources: sourceRows.results ?? [],
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}

async function processCollectorMessage(body: Record<string, unknown>, env: Env) {
  if (!env.TENDER_AI_QUEUE) throw new Error("Tender queue binding is unavailable");
  const context = { queue: env.TENDER_AI_QUEUE, now: new Date().toISOString() };
  switch (body.type) {
    case "collect-vendorpanel":
      return collectVendorPanel(context);
    case "collect-austender":
      return collectAusTender(context);
    case "collect-austender-page":
      return collectAusTenderPage({ page: Number(body.page) || 1 }, { browser: env.BROWSER, ...context });
    case "collect-australian-tenders-page":
      return collectAustralianTendersPage({ page: Number(body.page) || 1 }, context);
    case "collect-estimateone":
      return collectEstimateOne(context);
    case "collect-bci-central":
      return collectBciCentral({ browser: env.BROWSER, ...context });
    case "collect-tenderlink":
      return collectTenderLink({ browser: env.BROWSER, ...context });
    case "collect-buy-nsw-page":
      return collectBuyNswPage({ page: Number(body.page) || 1 }, { browser: env.BROWSER, ...context });
    case "ingest-records": {
      const records = Array.isArray(body.records) ? body.records : [];
      if (!records.length) throw new Error("Collector ingestion message contains no records");
      const analysisQueue = env.DEEPSEEK_API_KEY ? env.TENDER_AI_QUEUE : undefined;
      return ingestTenderRecords(records, { db: env.DB, queue: analysisQueue });
    }
    default:
      throw new Error(`Unsupported collector message: ${String(body.type)}`);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/ingestion/health" && request.method === "GET") {
      return Response.json({
        ready: Boolean(env.DB && env.TENDER_AI_QUEUE && env.INGESTION_TOKEN),
        database: Boolean(env.DB),
        queue: Boolean(env.TENDER_AI_QUEUE),
        browser: Boolean(env.BROWSER),
        deepseek: Boolean(env.DEEPSEEK_API_KEY),
        ingestion_auth: Boolean(env.INGESTION_TOKEN),
        model: env.DEEPSEEK_MODEL ?? tenderAiConfiguration.defaultModel,
        strategy_model: env.DEEPSEEK_STRATEGY_MODEL ?? "deepseek-v4-flash",
        prompt_version: tenderAiConfiguration.promptVersion,
        source_cron: env.TENDER_SOURCE_CRON ?? sourceCollectionConfiguration.cron,
      });
    }

    if (url.pathname === "/api/opportunities" && request.method === "GET") {
      return handleOpportunityFeed(request, env);
    }

    if (url.pathname === "/api/ingestion/tenders" && request.method === "POST") {
      return handleTenderIngestion(request, env);
    }

    if (url.pathname === "/api/ingestion/collect" && request.method === "POST") {
      if (!hasIngestionAccess(request, env)) {
        return Response.json({ error: "A valid ingestion bearer token is required." }, { status: 401 });
      }
      let payload: { sources?: unknown[] } = {};
      if (request.headers.get("Content-Type")?.includes("application/json")) {
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }
      }
      const result = await enqueuePublicPortalCollection(env.TENDER_AI_QUEUE, {
        sources: Array.isArray(payload.sources) ? payload.sources.map(String) : undefined,
      });
      return Response.json(result, { status: 202 });
    }

    return handler.fetch(request, env, ctx);
  },

  async queue(batch: TenderQueueBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (isCollectorMessage(message.body)) {
          await processCollectorMessage(message.body as Record<string, unknown>, env);
        } else {
          await processTenderAnalysisMessage(message.body, {
            db: env.DB,
            apiKey: env.DEEPSEEK_API_KEY,
            model: env.DEEPSEEK_MODEL,
          });
        }
        message.ack();
      } catch (error) {
        console.error("Tender queue processing failed", error);
        message.retry({ delaySeconds: 60 });
      }
    }
  },

  async scheduled(controller: { cron?: string }, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.TENDER_AI_QUEUE) {
      console.warn("Tender queue is unavailable; scheduled work skipped.");
      return;
    }
    const sourceCron = env.TENDER_SOURCE_CRON ?? sourceCollectionConfiguration.cron;
    if (controller?.cron === sourceCron) {
      ctx.waitUntil(enqueuePublicPortalCollection(env.TENDER_AI_QUEUE));
      return;
    }
    if (!env.DEEPSEEK_API_KEY) {
      console.warn("DeepSeek key is unavailable; scheduled AI replay skipped.");
      return;
    }
    ctx.waitUntil(requeuePendingAnalyses(env.DB, env.TENDER_AI_QUEUE));
  },
};

export default worker;
