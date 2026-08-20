import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyGeotechTier,
  scoreCapabilityMatch,
  scoreOpportunityComponents,
} from "../lib/opportunity-intelligence.js";

test("generic drilling is not a Tier A signal", () => {
  const result = classifyGeotechTier({ title: "Drilling services and equipment hire" });
  assert.equal(result.geoTier, "C");
});

test("drilling paired with ground context is Tier A", () => {
  const result = classifyGeotechTier({ title: "Drilling services", scope: "Boreholes in soil and rock for foundation design" });
  assert.equal(result.geoTier, "A");
  assert.ok(result.geotechRelevanceScore >= 80);
});

test("plural geotechnical investigations are a direct Tier A signal", () => {
  const result = classifyGeotechTier({ title: "Maritime Geotechnical Investigations" });
  assert.equal(result.geoTier, "A");
});

test("direct geotechnical services remain visible as Tier B", () => {
  const result = classifyGeotechTier({ title: "Geotechnical Advisory Services" });
  assert.equal(result.geoTier, "B");
});

test("hard exclusions always suppress a record", () => {
  const result = classifyGeotechTier({ title: "Geotechnical investigation and traffic survey" });
  assert.equal(result.geoTier, "C");
  assert.equal(result.hardExclusionFlag, true);
  assert.match(result.rejectionReason, /Hard exclusion/);
});

test("environmental scopes require two genuine core signals", () => {
  const rejected = classifyGeotechTier({ title: "Environmental drilling", scope: "Boreholes for contaminated site investigation" });
  const retained = classifyGeotechTier({
    title: "Environmental drilling and geotechnical investigation",
    scope: "Rock coring for a contaminated site investigation",
  });
  assert.equal(rejected.geoTier, "C");
  assert.equal(retained.geoTier, "A");
});

test("contamination scope survives only with a second genuine ground signal", () => {
  const rejected = classifyGeotechTier({ title: "Geotechnical and Contamination Services" });
  const retained = classifyGeotechTier({ title: "Geotechnical and Soil Contamination Investigation Services" });
  assert.equal(rejected.geoTier, "C");
  assert.equal(retained.geoTier, "A");
});

test("geohazard terms require an engineering investigation or risk context", () => {
  assert.equal(classifyGeotechTier({ title: "Humanitarian response to landslide" }).geoTier, "C");
  assert.equal(classifyGeotechTier({ title: "Quantitative rockfall risk assessment" }).geoTier, "B");
  assert.equal(classifyGeotechTier({ title: "Rockfall fence repairs" }).geoTier, "C");
});

test("supply-only and geological research drilling remain suppressed", () => {
  assert.equal(classifyGeotechTier({ title: "Rock drill rig consumables" }).geoTier, "C");
  assert.equal(classifyGeotechTier({ title: "Chemostratigraphic analysis of sedimentary rock drillholes" }).geoTier, "C");
});

test("materials testing requires a relevant construction or ground context", () => {
  assert.equal(classifyGeotechTier({ title: "Materials testing for cancer screening" }).geoTier, "C");
  assert.equal(classifyGeotechTier({ title: "Civil construction materials testing" }).geoTier, "B");
});

test("unknown capability is neutral rather than implicitly available", () => {
  const result = scoreCapabilityMatch(["Unmapped specialist service"], {});
  assert.equal(result.score, 50);
  assert.equal(result.statuses["Unmapped specialist service"], "UNKNOWN");
});

test("component scoring preserves explanations and operational queues", () => {
  const result = scoreOpportunityComponents({
    geotechRelevance: 95,
    capabilityMatch: 90,
    commercialValue: 90,
    procurementReadiness: 85,
    relationshipStrength: 60,
    clientPriority: 85,
    competitivePosition: 65,
    bundleFit: 95,
    locationFit: 90,
    sourceQuality: 95,
    existingClient: true,
    turnkeyPackage: true,
  });
  assert.equal(result.decisionQueue, "Pursue");
  assert.ok(result.opportunityScore >= 80);
  assert.deepEqual(result.adjustments.map(({ points }) => points), [8, 8]);
});
