import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTenderWithDeepSeek,
  authoritativeTenderHash,
  ingestTenderRecords,
  processTenderAnalysisMessage,
  rulePrefilter,
  tenderAiConfiguration,
  validateAiAnalysis,
  validateAuthoritativeTender,
} from "../lib/tender-ai-pipeline.js";

function tender(overrides = {}) {
  return {
    source: "buy-nsw",
    source_id: "RFT-100",
    source_url: "https://buy.nsw.gov.au/opportunity/RFT-100",
    title: "Geotechnical investigation for bridge replacement",
    description: "Public opportunity metadata.",
    scope: "Boreholes, SPT, rock coring and groundwater monitoring.",
    buyer: "Transport for NSW",
    closing_date: "2026-09-15T05:00:00.000Z",
    status: "open",
    ...overrides,
  };
}

function validAnalysis(overrides = {}) {
  return {
    ai_analysis: {
      geotech_relevance: 94,
      services: ["boreholes", "rock_coring", "spt", "groundwater"],
      project_type: "bridge",
      estimated_scope: "Ground investigation for bridge foundations.",
      mandatory_requirements: [],
      evidence: [{ source_field: "scope", text: "Boreholes, SPT, rock coring and groundwater monitoring." }],
      recommended_action: "immediate_opportunity",
      confidence: 0.93,
      ...overrides,
    },
  };
}

function mockDb(results = [], firstResult = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ sql, values: statement.values, method: "run" });
          return { success: true };
        },
        async first() {
          calls.push({ sql, values: statement.values, method: "first" });
          return firstResult;
        },
        async all() {
          calls.push({ sql, values: statement.values, method: "all" });
          return { results };
        },
      };
      return statement;
    },
  };
}

test("keeps authoritative portal fields separate and validates source identity", () => {
  const record = validateAuthoritativeTender(tender({ contract_value: "185000" }));
  assert.equal(record.opportunity_id, "buy-nsw:RFT-100");
  assert.equal(record.contract_value, 185000);
  assert.equal(record.buyer, "Transport for NSW");
  assert.throws(() => validateAuthoritativeTender(tender({ source_url: "javascript:alert(1)" })), /HTTP or HTTPS/);
  assert.throws(() => validateAuthoritativeTender({ title: "Missing identity" }), /required authoritative fields/);
});

test("keeps deterministic geotechnical classification across repeated validation", () => {
  const once = validateAuthoritativeTender(tender({
    geotech_score: 92,
    geotech_tier: "A",
    geotech_relevance: "opportunity",
  }));
  const twice = validateAuthoritativeTender(once);
  assert.equal(twice.deterministic_geotech_score, 92);
  assert.equal(twice.deterministic_geotech_tier, "A");
  assert.equal(twice.deterministic_record_kind, "opportunity");
});

test("prefilters direct, hidden and project-trigger records before AI", () => {
  assert.equal(rulePrefilter(tender()).eligible, true);
  const trigger = rulePrefilter(tender({
    source: "icn",
    source_id: "ICN-1",
    title: "Western Sydney transmission line",
    scope: null,
    description: "Major transmission line and earthworks project.",
  }));
  assert.equal(trigger.eligible, true);
  assert.equal(trigger.tier, "C");
  const irrelevant = rulePrefilter(tender({ title: "Office stationery supply", scope: null, description: null }));
  assert.equal(irrelevant.eligible, false);
  const historical = rulePrefilter(tender({ status: "awarded" }));
  assert.equal(historical.eligible, false);
  assert.equal(historical.reason, "historical_record");
});

test("rejects AI attempts to overwrite source-of-truth fields", () => {
  const analysis = validateAiAnalysis(validAnalysis());
  assert.equal(analysis.geotech_relevance, 94);
  assert.equal(analysis.recommended_action, "immediate_opportunity");
  assert.throws(() => validateAiAnalysis({ ...validAnalysis(), buyer: "Invented buyer" }), /authoritative field: buyer/);
  assert.throws(() => validateAiAnalysis({ ...validAnalysis(), metadata: {} }), /Unexpected DeepSeek response field/);
  assert.throws(() => validateAiAnalysis(validAnalysis({ closing_date: "invented" })), /authoritative field: closing_date/);
  assert.throws(() => validateAiAnalysis(validAnalysis({ services: ["invented_service"] })), /unsupported service/);
});

test("calls DeepSeek Flash with JSON mode and sends only interpretive source text", async () => {
  let requestBody;
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer secret-key");
    requestBody = JSON.parse(init.body);
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validAnalysis()) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  };
  const result = await analyzeTenderWithDeepSeek(tender({ raw_source: { internal_note: "do not send" } }), { apiKey: "secret-key" }, fetchImpl);
  assert.equal(requestBody.model, tenderAiConfiguration.defaultModel);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(requestBody.thinking.type, "disabled");
  assert.doesNotMatch(requestBody.messages[1].content, /Transport for NSW/);
  assert.doesNotMatch(requestBody.messages[1].content, /2026-09-15/);
  assert.doesNotMatch(requestBody.messages[1].content, /do not send/);
  assert.equal(result.analysis.geotech_relevance, 94);
  await assert.rejects(() => analyzeTenderWithDeepSeek(tender(), { apiKey: "secret-key", model: "unapproved-model" }, fetchImpl), /Unsupported DeepSeek model/);
});

test("persists authoritative records before queueing AI work", async () => {
  const db = mockDb();
  const queued = [];
  const queue = { async send(message) { queued.push(message); } };
  const [outcome] = await ingestTenderRecords([tender()], {
    db,
    queue,
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(outcome.ai_status, "queued");
  assert.equal(db.calls.length, 2);
  assert.match(db.calls.find(({ sql }) => /INSERT INTO tender_records/.test(sql)).sql, /INSERT INTO tender_records/);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, "analyze_tender");
  assert.equal(queued[0].authoritative.buyer, "Transport for NSW");

  const hash = await authoritativeTenderHash(tender());
  const analyzedDb = mockDb([], { authoritative_hash: hash, ai_status: "analyzed" });
  const duplicateQueue = [];
  const [duplicateOutcome] = await ingestTenderRecords([tender()], {
    db: analyzedDb,
    queue: { async send(message) { duplicateQueue.push(message); } },
    now: "2026-08-24T01:00:00.000Z",
  });
  assert.equal(duplicateOutcome.ai_status, "analyzed");
  assert.deepEqual(duplicateQueue, []);
});

test("validates queue identity and stores only validated AI analysis", async () => {
  const record = validateAuthoritativeTender(tender());
  const hash = await authoritativeTenderHash(record);
  const db = mockDb();
  const fetchImpl = async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validAnalysis()) } }],
  });
  const result = await processTenderAnalysisMessage({
    version: 1,
    kind: "analyze_tender",
    opportunity_id: record.opportunity_id,
    authoritative_hash: hash,
    authoritative: record,
  }, {
    db,
    apiKey: "secret-key",
    fetchImpl,
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(result.analysis.geotech_relevance, 94);
  assert.equal(db.calls.filter(({ sql }) => /INSERT INTO tender_ai_analyses/.test(sql)).length, 1);
  assert.equal(db.calls.at(-1).values[1], "analyzed");

  await assert.rejects(() => processTenderAnalysisMessage({
    version: 1,
    kind: "analyze_tender",
    opportunity_id: record.opportunity_id,
    authoritative_hash: "tampered",
    authoritative: record,
  }, { db, apiKey: "secret-key", fetchImpl }), /authoritative hash is invalid/);
});

test("rejects fabricated evidence and leaves failed queue sends recoverable", async () => {
  const fabricatedFetch = async () => Response.json({
    choices: [{
      finish_reason: "stop",
      message: { content: JSON.stringify(validAnalysis({ evidence: [{ source_field: "scope", text: "Invented 30 metre borehole quantity" }] })) },
    }],
  });
  await assert.rejects(
    () => analyzeTenderWithDeepSeek(tender(), { apiKey: "secret-key" }, fabricatedFetch),
    /evidence is not present/,
  );

  const db = mockDb();
  await assert.rejects(() => ingestTenderRecords([tender()], {
    db,
    queue: { async send() { throw new Error("queue unavailable"); } },
    now: "2026-08-24T00:00:00.000Z",
  }), /queue unavailable/);
  const stateUpdate = db.calls.at(-1);
  assert.match(stateUpdate.sql, /UPDATE tender_records/);
  assert.equal(stateUpdate.values[1], "pending");
});
