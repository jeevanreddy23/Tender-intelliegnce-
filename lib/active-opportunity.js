const ACTIVE_STATUSES = new Set(["open", "active", "current", "published"]);
const ACTIVE_PROCUREMENT_TYPES = new Set(["tender", "rfq", "rfp", "rfi", "eoi", "scheme"]);
const ACTIVE_GEOTECH_TIERS = new Set(["A", "B"]);

const DEFAULT_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1_000;

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function instant(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Defensive JavaScript equivalent of the backend Active Tenders SQL gate.
 * Authoritative lifecycle and procurement fields remain the deciding inputs;
 * optional AI analysis cannot make an excluded record active.
 */
export function isActiveNswGeotechnicalTender(record, options = {}) {
  const requestedNow = options.now ?? Date.now();
  const parsedNow = requestedNow instanceof Date ? requestedNow.valueOf() : instant(requestedNow);
  const now = parsedNow === null || Number.isNaN(parsedNow) ? Date.now() : parsedNow;
  const freshnessMs = Number(options.freshnessMs ?? DEFAULT_FRESHNESS_MS);
  const tier = String(record?.deterministic_geotech_tier ?? "").trim().toUpperCase();
  const score = Number(record?.deterministic_geotech_score);

  if (String(record?.state ?? "").trim().toUpperCase() !== "NSW") return false;
  if (!ACTIVE_STATUSES.has(normalized(record?.status))) return false;
  if (normalized(record?.deterministic_record_kind) !== "opportunity") return false;
  if (!ACTIVE_GEOTECH_TIERS.has(tier) || !Number.isFinite(score) || score < 70) return false;
  if (!ACTIVE_PROCUREMENT_TYPES.has(normalized(record?.procurement_type))) return false;

  const closingAt = instant(record?.closing_date);
  if (Number.isNaN(closingAt)) return false;
  if (closingAt !== null) return closingAt >= now;

  const observedAt = instant(record?.updated_at ?? record?.last_updated ?? record?.extracted_at);
  return observedAt !== null
    && !Number.isNaN(observedAt)
    && observedAt <= now
    && observedAt >= now - freshnessMs;
}

/**
 * D1 predicate for the authoritative Active Tenders query. Keep this aligned
 * with isActiveNswGeotechnicalTender through tests in active-opportunity.test.mjs.
 */
export const activeNswGeotechnicalTenderSql = `
  LOWER(TRIM(COALESCE(json_extract(r.authoritative_json, '$.status'), ''))) IN ('open', 'active', 'current', 'published')
  AND UPPER(TRIM(COALESCE(json_extract(r.authoritative_json, '$.state'), ''))) = 'NSW'
  AND LOWER(TRIM(COALESCE(json_extract(r.authoritative_json, '$.deterministic_record_kind'), ''))) = 'opportunity'
  AND UPPER(TRIM(COALESCE(json_extract(r.authoritative_json, '$.deterministic_geotech_tier'), ''))) IN ('A', 'B')
  AND CAST(COALESCE(json_extract(r.authoritative_json, '$.deterministic_geotech_score'), 0) AS REAL) >= 70
  AND LOWER(TRIM(COALESCE(json_extract(r.authoritative_json, '$.procurement_type'), ''))) IN ('tender', 'rfq', 'rfp', 'rfi', 'eoi', 'scheme')
  AND (
    (r.closing_at IS NOT NULL AND TRIM(r.closing_at) <> '' AND datetime(r.closing_at) >= datetime('now'))
    OR ((r.closing_at IS NULL OR TRIM(r.closing_at) = '') AND datetime(r.updated_at) BETWEEN datetime('now', '-7 days') AND datetime('now'))
  )
`;
