import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import strategicSnapshot from "../../data/strategic-insights.json";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { tenderAiAnalyses, tenderRecords } from "../../../db/schema";
import {
  generateStrategyWithDeepSeek,
  StrategyEligibilityError,
  StrategyValidationError,
} from "../../../lib/strategy-synthesis.js";

const MAX_REQUEST_BYTES = 2_048;
const inFlightUsers = new Set<string>();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value: unknown, maximum: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maximum) : null;
}

function parseObject(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {} as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Strategy request is too large." }, 413);
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Unable to read request body." }, 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "Strategy request is too large." }, 413);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "opportunityId")) {
    return json({ error: "Only opportunityId is accepted." }, 400);
  }
  const opportunityId = clean(payload.opportunityId, 300);
  if (!opportunityId) return json({ error: "A valid opportunityId is required." }, 400);

  const user = await getChatGPTUser();
  const hostname = new URL(request.url).hostname;
  const userId = user?.email ?? (["localhost", "127.0.0.1"].includes(hostname) ? "local-preview" : null);
  if (!userId) return json({ error: "Sign in is required to generate a strategy memo." }, 401);
  if (inFlightUsers.has(userId)) return json({ error: "A strategy memo is already being generated for this user." }, 429);

  let row: typeof tenderRecords.$inferSelect | undefined;
  let analysisRow: typeof tenderAiAnalyses.$inferSelect | undefined;
  try {
    const db = await getDb();
    [row] = await db.select().from(tenderRecords).where(eq(tenderRecords.opportunityId, opportunityId)).limit(1);
    [analysisRow] = await db.select().from(tenderAiAnalyses)
      .where(eq(tenderAiAnalyses.opportunityId, opportunityId))
      .orderBy(desc(tenderAiAnalyses.createdAt))
      .limit(1);
  } catch (error) {
    console.error("Unable to resolve strategy inputs from D1", error);
    return json({ error: "Strategy inputs are temporarily unavailable." }, 503);
  }
  if (!row) return json({ error: "The selected opportunity was not found." }, 404);

  const authoritative = parseObject(row.authoritativeJson);
  const analysis = parseObject(analysisRow?.analysisJson ?? null);
  const state = clean(authoritative.state, 80);
  const location = clean(authoritative.address, 500)
    ?? [clean(authoritative.suburb, 200), state].filter(Boolean).join(", ")
    ?? null;
  const contractValue = row.contractValue
    ?? Number(authoritative.estimated_value ?? authoritative.contract_value);
  const opportunity = {
    opportunityId: row.opportunityId,
    title: row.title,
    buyer: row.buyer ?? authoritative.agency,
    location,
    state,
    status: authoritative.status,
    recordKind: authoritative.deterministic_record_kind ?? authoritative.geotech_relevance ?? authoritative.record_kind,
    contractValue,
    closingDate: row.closingAt,
    lastVerifiedAt: row.updatedAt,
    sourceUrl: row.sourceUrl,
    authoritativeHash: row.authoritativeHash,
    description: authoritative.description,
    scope: authoritative.scope,
    estimatedScope: analysis.estimated_scope,
    services: analysis.services,
  };
  const findings = strategicSnapshot.winLossValidation.topSupportedHypotheses;
  const { env } = await import("cloudflare:workers");
  const apiKey = clean(env.DEEPSEEK_API_KEY, 500);
  if (!apiKey) return json({ error: "DeepSeek strategy synthesis is not configured." }, 503);

  if (inFlightUsers.has(userId)) return json({ error: "A strategy memo is already being generated for this user." }, 429);
  inFlightUsers.add(userId);
  try {
    const result = await generateStrategyWithDeepSeek(opportunity, findings, {
      apiKey,
      model: clean(env.DEEPSEEK_STRATEGY_MODEL, 100) ?? undefined,
    });
    return json({
      memo: result.memo,
      findings: result.selectedFindings.map(({ hypothesisId, driver, confidence }) => ({ hypothesisId, driver, confidence })),
      model: result.model,
      promptVersion: result.promptVersion,
      usage: result.usage,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    if (error instanceof StrategyEligibilityError) {
      return json({ error: "Strategy evidence gate is not satisfied.", reasons: error.reasons }, 422);
    }
    if (error instanceof StrategyValidationError) {
      console.error("DeepSeek strategy output failed validation", error.message);
      return json({ error: "The generated strategy did not pass evidence and schema validation." }, 502);
    }
    console.error("DeepSeek strategy generation failed", error);
    return json({ error: "DeepSeek strategy generation is temporarily unavailable." }, 502);
  } finally {
    inFlightUsers.delete(userId);
  }
}
