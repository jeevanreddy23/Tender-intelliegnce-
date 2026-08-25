const DIRECT_TERMS = [
  "geotechnical", "geotech", "borehole", "boreholes", "cpt", "cptu", "spt",
  "dcp", "rock coring", "core drilling", "geotechnical investigation",
];

const HIDDEN_TERMS = [
  "site investigation", "ground investigation", "subsurface investigation",
  "pavement investigation", "pavement testing", "intrusive investigation",
  "groundwater monitoring", "monitoring wells", "soil testing", "materials testing",
  "foundation investigation", "slope stability", "drilling", "piling",
];

const PROJECT_TRIGGER_TERMS = [
  "road upgrade", "bridge replacement", "railway upgrade", "station upgrade",
  "school redevelopment", "hospital redevelopment", "subdivision", "retaining wall",
  "bulk excavation", "earthworks", "dam", "tunnel", "transmission line",
  "renewable energy", "industrial development", "foundation works",
];

const AUTHORITATIVE_FIELDS = new Set([
  "opportunity_id", "source", "source_id", "source_url", "tender_id", "title",
  "buyer", "buyer_abn", "agency", "published_date", "closing_date", "award_date",
  "contract_start", "contract_end", "estimated_value", "contract_value",
  "successful_supplier", "supplier_abn", "status", "documents", "addenda",
]);

const ALLOWED_ANALYSIS_FIELDS = new Set([
  "geotech_relevance", "services", "project_type", "estimated_scope",
  "mandatory_requirements", "evidence", "recommended_action", "confidence",
]);

const SERVICE_NAMES = new Set([
  "boreholes", "drilling", "rock_coring", "cpt", "spt", "dcp", "groundwater",
  "pavement", "lab_testing", "pile_inspection", "foundation_recommendations",
  "slope_stability", "construction_inspections", "contamination_assessment",
]);

const RECOMMENDED_ACTIONS = new Set([
  "discard", "low_priority_lead", "monitor", "engineer_review", "immediate_opportunity",
]);

const PROMPT_VERSION = "deepseek-geotech-1.0.0";
const DEFAULT_MODEL = "deepseek-v4-flash";
const SUPPORTED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const MAX_TEXT_LENGTH = 24_000;
const MAX_RAW_SOURCE_LENGTH = 64_000;

function cleanString(value, maxLength = 2_000) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanStringList(value, maxItems = 50, maxLength = 500) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanString(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDocuments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((document) => ({
    title: cleanString(document?.title ?? document?.name, 500),
    url: cleanString(document?.url, 2_000),
    document_type: cleanString(document?.document_type ?? document?.type, 100),
    published_at: cleanString(document?.published_at, 80),
  })).filter(({ title, url }) => title || url);
}

function cleanRawSource(value) {
  if (value === null || value === undefined) return null;
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("raw_source must be JSON serializable");
  }
  if (serialized.length > MAX_RAW_SOURCE_LENGTH) throw new Error("raw_source exceeds the 64 KB ingestion limit");
  return JSON.parse(serialized);
}

function boundedNumber(value, minimum, maximum, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJsonObject(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is empty`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

export function validateAuthoritativeTender(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tender record must be an object");
  }
  const source = cleanString(input.source, 80);
  const sourceId = cleanString(input.source_id ?? input.tender_id, 200);
  const sourceUrl = cleanString(input.source_url, 2_000);
  const title = cleanString(input.title, 1_000);
  if (!source || !sourceId || !sourceUrl || !title) {
    throw new Error("source, source_id, source_url and title are required authoritative fields");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("source_url must be an absolute URL");
  }
  if (!["https:", "http:"].includes(parsedUrl.protocol)) throw new Error("source_url must use HTTP or HTTPS");

  const opportunityId = cleanString(input.opportunity_id, 300) ?? `${source}:${sourceId}`;
  return Object.freeze({
    opportunity_id: opportunityId,
    source,
    source_id: sourceId,
    source_url: sourceUrl,
    title,
    description: cleanString(input.description, MAX_TEXT_LENGTH),
    scope: cleanString(input.scope, MAX_TEXT_LENGTH),
    buyer: cleanString(input.buyer, 500),
    buyer_abn: cleanString(input.buyer_abn, 40),
    agency: cleanString(input.agency, 500),
    project_name: cleanString(input.project_name, 1_000),
    project_type: cleanString(input.project_type, 200),
    sector: cleanString(input.sector, 200),
    address: cleanString(input.address, 1_000),
    suburb: cleanString(input.suburb, 200),
    state: cleanString(input.state, 80),
    postcode: cleanString(input.postcode, 20),
    published_date: cleanString(input.published_date, 80),
    closing_date: cleanString(input.closing_date, 80),
    award_date: cleanString(input.award_date, 80),
    contract_start: cleanString(input.contract_start, 80),
    contract_end: cleanString(input.contract_end, 80),
    procurement_type: cleanString(input.procurement_type, 100),
    tender_method: cleanString(input.tender_method, 200),
    estimated_value: finiteNumber(input.estimated_value),
    contract_value: finiteNumber(input.contract_value),
    successful_supplier: cleanString(input.successful_supplier, 500),
    supplier_abn: cleanString(input.supplier_abn, 40),
    status: cleanString(input.status, 100) ?? "unknown",
    categories: cleanStringList(input.categories, 50, 300),
    documents: cleanDocuments(input.documents),
    addenda: cleanDocuments(input.addenda),
    parent_project_id: cleanString(input.parent_project_id, 300),
    duplicate_group_id: cleanString(input.duplicate_group_id, 300),
    deterministic_geotech_score: finiteNumber(input.deterministic_geotech_score ?? input.geotech_score),
    deterministic_geotech_tier: cleanString(input.deterministic_geotech_tier ?? input.geotech_tier, 10),
    deterministic_record_kind: cleanString(
      input.deterministic_record_kind ?? input.geotech_relevance ?? input.record_kind,
      80,
    ),
    raw_source: cleanRawSource(input.raw_source),
  });
}

export function rulePrefilter(tender) {
  const record = validateAuthoritativeTender(tender);
  const text = [record.title, record.description, record.scope, record.project_name, record.project_type, record.sector, ...record.categories]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matches = (terms) => terms.filter((term) => text.includes(term));
  const direct = matches(DIRECT_TERMS);
  const hidden = matches(HIDDEN_TERMS);
  const triggers = matches(PROJECT_TRIGGER_TERMS);
  const deterministic = record.deterministic_geotech_score;
  const score = deterministic !== null
    ? Math.max(0, Math.min(100, Math.round(deterministic)))
    : direct.length ? Math.min(100, 82 + direct.length * 3)
      : hidden.length ? Math.min(79, 58 + hidden.length * 4)
        : triggers.length ? Math.min(50, 32 + triggers.length * 3)
          : 0;
  const historical = record.status === "awarded" || record.status === "closed" || record.deterministic_record_kind === "archive";
  return {
    eligible: !historical && score >= 31,
    historical,
    score,
    matched_terms: [...new Set([...direct, ...hidden, ...triggers])],
    tier: direct.length ? "A" : hidden.length ? "B" : triggers.length ? "C" : null,
    reason: historical ? "historical_record" : score >= 31 ? "candidate" : "below_prefilter_threshold",
  };
}

export function validateAiAnalysis(output) {
  const parsed = typeof output === "string" ? parseJsonObject(output, "DeepSeek response") : output;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DeepSeek response must be an object");
  const wrapped = Object.hasOwn(parsed, "ai_analysis");
  for (const field of Object.keys(parsed)) {
    if (AUTHORITATIVE_FIELDS.has(field)) throw new Error(`AI response attempted to overwrite authoritative field: ${field}`);
    if (wrapped && field !== "ai_analysis") throw new Error(`Unexpected DeepSeek response field: ${field}`);
  }
  const analysis = parsed.ai_analysis ?? parsed;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("ai_analysis must be an object");
  for (const field of Object.keys(analysis)) {
    if (AUTHORITATIVE_FIELDS.has(field)) throw new Error(`AI response attempted to overwrite authoritative field: ${field}`);
    if (!ALLOWED_ANALYSIS_FIELDS.has(field)) throw new Error(`Unexpected AI analysis field: ${field}`);
  }
  const services = cleanStringList(analysis.services, 30, 100);
  if (services.some((service) => !SERVICE_NAMES.has(service))) throw new Error("AI response contains an unsupported service name");
  const recommendedAction = cleanString(analysis.recommended_action, 80);
  if (!RECOMMENDED_ACTIONS.has(recommendedAction)) throw new Error("AI response contains an invalid recommended_action");
  const evidence = Array.isArray(analysis.evidence) ? analysis.evidence.slice(0, 20).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("AI evidence must contain objects");
    const sourceField = cleanString(item.source_field, 40);
    if (!["title", "description", "scope"].includes(sourceField)) throw new Error("AI evidence source_field is invalid");
    const text = cleanString(item.text, 500);
    if (!text) throw new Error("AI evidence text is required");
    return { source_field: sourceField, text };
  }) : [];
  return Object.freeze({
    geotech_relevance: Math.round(boundedNumber(analysis.geotech_relevance, 0, 100, "geotech_relevance")),
    services,
    project_type: cleanString(analysis.project_type, 200),
    estimated_scope: cleanString(analysis.estimated_scope, 4_000),
    mandatory_requirements: cleanStringList(analysis.mandatory_requirements, 30, 500),
    evidence,
    recommended_action: recommendedAction,
    confidence: boundedNumber(analysis.confidence, 0, 1, "confidence"),
  });
}

function deepSeekPrompt(tender, prefilter) {
  return [
    "Return JSON only. Analyse geotechnical relevance from the supplied source text.",
    "Authoritative fields are immutable. Do not return or modify IDs, buyer, dates, values, supplier, URL, documents, or status.",
    "Use only evidence present in title, description, or scope. Do not invent quantities or mandatory requirements.",
    "Allowed services: boreholes, drilling, rock_coring, cpt, spt, dcp, groundwater, pavement, lab_testing, pile_inspection, foundation_recommendations, slope_stability, construction_inspections, contamination_assessment.",
    "Allowed recommended_action: discard, low_priority_lead, monitor, engineer_review, immediate_opportunity.",
    "Required JSON shape:",
    JSON.stringify({
      ai_analysis: {
        geotech_relevance: 0,
        services: [],
        project_type: null,
        estimated_scope: null,
        mandatory_requirements: [],
        evidence: [{ source_field: "scope", text: "short attributable excerpt" }],
        recommended_action: "monitor",
        confidence: 0,
      },
    }),
    "Deterministic prefilter:",
    JSON.stringify(prefilter),
    "Source text:",
    JSON.stringify({ title: tender.title, description: tender.description, scope: tender.scope }),
  ].join("\n");
}

export async function analyzeTenderWithDeepSeek(tenderInput, config, fetchImpl = fetch) {
  const tender = validateAuthoritativeTender(tenderInput);
  const prefilter = rulePrefilter(tender);
  if (!prefilter.eligible) throw new Error(`Tender is not eligible for AI analysis: ${prefilter.reason}`);
  if (!config?.apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  const model = cleanString(config.model, 100) ?? DEFAULT_MODEL;
  if (!SUPPORTED_MODELS.has(model)) throw new Error(`Unsupported DeepSeek model: ${model}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 45_000);
  let response;
  try {
    response = await fetchImpl("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a geotechnical tender analyst. Return strict json grounded only in supplied source text." },
          { role: "user", content: deepSeekPrompt(tender, prefilter) },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0.1,
        max_tokens: 1_600,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = cleanString(await response.text(), 500);
    throw new Error(`DeepSeek request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json();
  const choice = payload?.choices?.[0];
  if (!choice?.message?.content) throw new Error("DeepSeek returned empty analysis content");
  if (choice.finish_reason === "length") throw new Error("DeepSeek analysis was truncated");
  const analysis = validateAiAnalysis(choice.message.content);
  for (const evidence of analysis.evidence) {
    const sourceText = tender[evidence.source_field];
    if (!sourceText?.toLowerCase().includes(evidence.text.toLowerCase())) {
      throw new Error("DeepSeek evidence is not present in the attributed source field");
    }
  }
  return {
    analysis,
    model,
    prompt_version: PROMPT_VERSION,
    usage: payload.usage ?? null,
  };
}

export async function authoritativeTenderHash(tenderInput) {
  const hashable = { ...validateAuthoritativeTender(tenderInput) };
  delete hashable.raw_source;
  return sha256(canonicalJson(hashable));
}

async function setAiState(db, opportunityId, status, error, now) {
  await db.prepare(`
    UPDATE tender_records
    SET ai_status = ?2, last_ai_error = ?3, updated_at = ?4
    WHERE opportunity_id = ?1
  `).bind(opportunityId, status, error, now).run();
}

export async function persistAuthoritativeTender(db, tenderInput, prefilter, aiStatus, now = new Date().toISOString()) {
  const tender = validateAuthoritativeTender(tenderInput);
  const authoritativeHash = await authoritativeTenderHash(tender);
  const existing = await db.prepare(`
    SELECT authoritative_hash, ai_status
    FROM tender_records
    WHERE opportunity_id = ?1
  `).bind(tender.opportunity_id).first();
  const unchangedAnalyzed = existing?.authoritative_hash === authoritativeHash && existing?.ai_status === "analyzed";
  await db.prepare(`
    INSERT INTO tender_records (
      opportunity_id, source, source_id, source_url, title, buyer, published_at,
      closing_at, contract_value, successful_supplier, authoritative_hash,
      authoritative_json, prefilter_score, prefilter_terms_json, ai_status,
      last_ai_error, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, ?16, ?16)
    ON CONFLICT(opportunity_id) DO UPDATE SET
      source = excluded.source,
      source_id = excluded.source_id,
      source_url = excluded.source_url,
      title = excluded.title,
      buyer = excluded.buyer,
      published_at = excluded.published_at,
      closing_at = excluded.closing_at,
      contract_value = excluded.contract_value,
      successful_supplier = excluded.successful_supplier,
      authoritative_hash = excluded.authoritative_hash,
      authoritative_json = excluded.authoritative_json,
      prefilter_score = excluded.prefilter_score,
      prefilter_terms_json = excluded.prefilter_terms_json,
      ai_status = CASE
        WHEN tender_records.authoritative_hash = excluded.authoritative_hash AND tender_records.ai_status = 'analyzed'
          THEN tender_records.ai_status
        ELSE excluded.ai_status
      END,
      last_ai_error = NULL,
      updated_at = excluded.updated_at
  `).bind(
    tender.opportunity_id,
    tender.source,
    tender.source_id,
    tender.source_url,
    tender.title,
    tender.buyer,
    tender.published_date,
    tender.closing_date,
    tender.contract_value,
    tender.successful_supplier,
    authoritativeHash,
    JSON.stringify(tender),
    prefilter.score,
    JSON.stringify(prefilter.matched_terms),
    aiStatus,
    now,
  ).run();
  return { tender, authoritativeHash, unchangedAnalyzed };
}

export async function ingestTenderRecords(records, {
  db,
  queue = /** @type {{ send(message: unknown): Promise<void> } | null } */ (null),
  now = new Date().toISOString(),
}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("At least one tender record is required");
  if (records.length > 100) throw new Error("A maximum of 100 tender records may be ingested per request");
  const outcomes = [];
  for (const input of records) {
    const tender = validateAuthoritativeTender(input);
    const prefilter = rulePrefilter(tender);
    const aiStatus = prefilter.eligible ? (queue ? "queued" : "pending") : "skipped";
    const { authoritativeHash, unchangedAnalyzed } = await persistAuthoritativeTender(db, tender, prefilter, aiStatus, now);
    if (prefilter.eligible && queue && !unchangedAnalyzed) {
      try {
        await queue.send({
          version: 1,
          kind: "analyze_tender",
          opportunity_id: tender.opportunity_id,
          authoritative_hash: authoritativeHash,
          authoritative: tender,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await setAiState(db, tender.opportunity_id, "pending", messageText.slice(0, 1_000), now);
        throw error;
      }
    }
    outcomes.push({ opportunity_id: tender.opportunity_id, ai_status: unchangedAnalyzed ? "analyzed" : aiStatus, prefilter });
  }
  return outcomes;
}

export async function processTenderAnalysisMessage(message, { db, apiKey, model, fetchImpl = fetch, now = new Date().toISOString() }) {
  if (!message || message.kind !== "analyze_tender" || message.version !== 1) throw new Error("Unsupported tender queue message");
  const tender = validateAuthoritativeTender(message.authoritative);
  const currentHash = await authoritativeTenderHash(tender);
  if (message.opportunity_id !== tender.opportunity_id || message.authoritative_hash !== currentHash) {
    throw new Error("Tender queue message identity or authoritative hash is invalid");
  }
  await setAiState(db, tender.opportunity_id, "processing", null, now);
  try {
    const result = await analyzeTenderWithDeepSeek(tender, { apiKey, model }, fetchImpl);
    const analysisId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO tender_ai_analyses (
        analysis_id, opportunity_id, authoritative_hash, model, prompt_version,
        geotech_relevance, recommended_action, confidence, analysis_json,
        usage_json, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `).bind(
      analysisId,
      tender.opportunity_id,
      currentHash,
      result.model,
      result.prompt_version,
      result.analysis.geotech_relevance,
      result.analysis.recommended_action,
      result.analysis.confidence,
      JSON.stringify(result.analysis),
      result.usage ? JSON.stringify(result.usage) : null,
      now,
    ).run();
    await setAiState(db, tender.opportunity_id, "analyzed", null, now);
    return { opportunity_id: tender.opportunity_id, analysis_id: analysisId, ...result };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await setAiState(db, tender.opportunity_id, "retrying", messageText.slice(0, 1_000), now);
    throw error;
  }
}

export async function requeuePendingAnalyses(db, queue, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await db.prepare(`
    SELECT opportunity_id, authoritative_hash, authoritative_json
    FROM tender_records
    WHERE ai_status IN ('pending', 'retrying')
    ORDER BY updated_at ASC
    LIMIT ?1
  `).bind(safeLimit).all();
  let queued = 0;
  for (const row of result.results ?? []) {
    const authoritative = parseJsonObject(row.authoritative_json, "Stored authoritative tender");
    await queue.send({
      version: 1,
      kind: "analyze_tender",
      opportunity_id: row.opportunity_id,
      authoritative_hash: row.authoritative_hash,
      authoritative,
    });
    await setAiState(db, row.opportunity_id, "queued", null, new Date().toISOString());
    queued += 1;
  }
  return queued;
}

export const tenderAiConfiguration = Object.freeze({
  defaultModel: DEFAULT_MODEL,
  promptVersion: PROMPT_VERSION,
  authoritativeFields: [...AUTHORITATIVE_FIELDS],
});
