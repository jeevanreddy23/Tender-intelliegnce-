import assert from "node:assert/strict";
import test from "node:test";

import {
  activeNswGeotechnicalTenderSql,
  isActiveNswGeotechnicalTender,
} from "../lib/active-opportunity.js";

const NOW = "2026-08-25T02:00:00.000Z";

function activeTender(overrides = {}) {
  return {
    state: "NSW",
    status: "open",
    deterministic_record_kind: "opportunity",
    deterministic_geotech_tier: "A",
    deterministic_geotech_score: 90,
    procurement_type: "tender",
    closing_date: "2026-08-26T07:00:00.000Z",
    updated_at: "2026-08-25T01:00:00.000Z",
    ...overrides,
  };
}

test("publishes only verified active NSW geotechnical procurement", () => {
  assert.equal(isActiveNswGeotechnicalTender(activeTender(), { now: NOW }), true);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ state: "VIC" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ state: "NZ" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ status: "closed" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: "2026-08-24T07:00:00.000Z" }), { now: NOW }), false);
});

test("keeps project leads and low-confidence geotechnical records out of Active Tenders", () => {
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ deterministic_record_kind: "potential_geotech_lead" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ deterministic_geotech_tier: "C" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ deterministic_geotech_tier: "B", deterministic_geotech_score: 69 }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ procurement_type: "planned-procurement" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ procurement_type: null }), { now: NOW }), false);
});

test("requires a valid closing time or a fresh explicit open observation", () => {
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: "not-a-date" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: null }), { now: NOW }), true);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: null, updated_at: "2026-08-17T01:00:00.000Z" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: null, updated_at: "2026-08-26T01:00:00.000Z" }), { now: NOW }), false);
  assert.equal(isActiveNswGeotechnicalTender(activeTender({ closing_date: null, status: "unknown" }), { now: NOW }), false);
});

test("backend SQL gate encodes the same mandatory publication rules", () => {
  assert.match(activeNswGeotechnicalTenderSql, /status.*IN \('open', 'active', 'current', 'published'\)/s);
  assert.match(activeNswGeotechnicalTenderSql, /state.*= 'NSW'/s);
  assert.match(activeNswGeotechnicalTenderSql, /deterministic_record_kind.*= 'opportunity'/s);
  assert.match(activeNswGeotechnicalTenderSql, /deterministic_geotech_score.*>= 70/s);
  assert.match(activeNswGeotechnicalTenderSql, /procurement_type.*IN \('tender', 'rfq', 'rfp', 'rfi', 'eoi', 'scheme'\)/s);
  assert.doesNotMatch(activeNswGeotechnicalTenderSql, /potential_geotech_lead/);
});
