import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ML_COLUMN_NAMES,
  ML_FIELD_DEFINITIONS,
  assertNoTargetLeakage,
} from "../lib/ml-dataset-schema.js";

test("canonical ML contract has exactly 104 unique fields", () => {
  assert.equal(ML_FIELD_DEFINITIONS.length, 104);
  assert.equal(new Set(ML_COLUMN_NAMES).size, 104);
});

test("canonical ML contract includes operational feedback labels", () => {
  for (const required of [
    "geo_tier", "rejection_reason", "capability_match_score", "decision_queue",
    "human_decision", "proposal_submitted", "won_flag", "loss_reason", "model_version",
  ]) assert.ok(ML_COLUMN_NAMES.includes(required), required);
});

test("leakage guard rejects post-outcome award-value predictors", () => {
  assert.throws(
    () => assertNoTargetLeakage(["title", "supplier_name", "award_date", "commercial_value_score"], "award_value"),
    /supplier_name, award_date, commercial_value_score/,
  );
  assert.equal(assertNoTargetLeakage(["title", "geo_tier", "publish_date"], "award_value"), true);
});

test("portal registry covers every Australian government jurisdiction", async () => {
  const registry = JSON.parse(await readFile(new URL("../config/procurement-portals.json", import.meta.url)));
  const jurisdictions = new Set(registry.portals.map(({ jurisdiction }) => jurisdiction));
  for (const jurisdiction of ["Commonwealth", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"])
    assert.ok(jurisdictions.has(jurisdiction), jurisdiction);
  assert.equal(registry.portals.filter(({ collectionStatus }) => collectionStatus === "implemented").length, 2);
});
