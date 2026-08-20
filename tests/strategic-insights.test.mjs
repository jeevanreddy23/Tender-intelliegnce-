import assert from "node:assert/strict";
import test from "node:test";
import {
  analyseScopeBundle,
  buildStrategicInsightSnapshot,
  calculateIncumbency,
  clusterBuyerSegments,
  explainLinearLogit,
  extractProcurementCapabilities,
  minePairAssociations,
} from "../lib/strategic-insights.js";

const records = [
  {
    title: "Western Sydney ground investigation",
    scope: "Supply 14 cored boreholes, CPTu, NATA laboratory UCS and CBR testing, and a geotechnical design report certified by a CPEng engineer.",
    category: "UNSPSC 71110000; UNSPSC 81101500",
    agency: "Transport Agency",
    supplierName: "Full Scope Consulting Pty Ltd",
    supplierCanonical: "full scope consulting",
    awardValue: 420000,
    awardDate: "2024-06-01",
  },
  {
    title: "Bridge drilling",
    scope: "Borehole drilling and rock coring with laboratory testing.",
    category: "UNSPSC 71110000",
    agency: "Transport Agency",
    supplierName: "Full Scope Consulting Pty Ltd",
    supplierCanonical: "full scope consulting",
    awardValue: 180000,
    awardDate: "2023-05-01",
  },
  {
    title: "Standalone boreholes",
    scope: "Six boreholes and factual logs.",
    category: "UNSPSC 71110000",
    agency: "Transport Agency",
    supplierName: "Regional Drilling Pty Ltd",
    supplierCanonical: "regional drilling",
    awardValue: 90000,
    awardDate: "2022-03-01",
  },
  {
    title: "Pavement investigation",
    scope: "DCP, CBR laboratory testing and pavement design advice.",
    category: "UNSPSC 81101500",
    agency: "Regional Council",
    supplierName: "Full Scope Consulting Pty Ltd",
    supplierCanonical: "full scope consulting",
    awardValue: 160000,
    awardDate: "2023-08-01",
  },
];

test("extracts auditable capability entities and detects turnkey bundles", () => {
  const capabilities = extractProcurementCapabilities(records[0]);
  assert.ok(capabilities.capabilityIds.includes("drilling"));
  assert.ok(capabilities.capabilityIds.includes("nata"));
  assert.ok(capabilities.capabilityIds.includes("cpeng"));
  assert.deepEqual(capabilities.unspscCodes, ["71110000", "81101500"]);

  const bundle = analyseScopeBundle(records[0]);
  assert.equal(bundle.isMultiCode, true);
  assert.equal(bundle.isTurnkey, true);
  assert.equal(bundle.bundleLabel, "Turnkey investigation + testing + engineering");
});

test("calculates association lift and incumbent award concentration", () => {
  const associations = minePairAssociations(records, { minCount: 2, minSupport: 0 });
  const relation = associations.find((item) => item.antecedent === "family:laboratory-testing" && item.consequent === "family:field-investigation");
  assert.ok(relation);
  assert.equal(relation.count, 3);
  assert.equal(relation.confidence, 1);

  const incumbency = calculateIncumbency(records[0], records);
  assert.equal(incumbency.priorClientAwards, 2);
  assert.equal(incumbency.priorSupplierAwards, 1);
  assert.equal(incumbency.awardCountShare, 0.5);
  assert.match(incumbency.interpretation, /not a bidder win rate/i);
});

test("returns exact linear-logit SHAP contributions and data-readiness guards", () => {
  const explanation = explainLinearLogit(
    { rigs: 1, nata: 1, priceDeviation: -0.1 },
    {
      intercept: -0.4,
      coefficients: { rigs: 0.8, nata: 1.1, priceDeviation: -0.5 },
      backgroundMeans: { rigs: 0.4, nata: 0.5, priceDeviation: 0 },
    },
  );
  assert.equal(explanation.method, "linear-logit SHAP");
  assert.equal(explanation.contributions[0].feature, "nata");
  assert.ok(explanation.probability > explanation.baselineProbability);

  const snapshot = buildStrategicInsightSnapshot(records, { generatedAt: "2026-08-19T00:00:00.000Z" });
  assert.equal(snapshot.metrics.eligibleAwards, 4);
  assert.equal(snapshot.metrics.turnkeyAwards, 2);
  assert.equal(snapshot.modelReadiness.winProbabilityTraining, "blocked");
  assert.ok(snapshot.guardrails.some((item) => /not bidder win rate/i.test(item)));

  const segments = clusterBuyerSegments([
    { agency: "Major Transport", awards: 20, medianAwardValue: 800000, bundleRate: 0.7, complianceSignalRate: 0.5, leadingSupplierAwardShare: 0.2 },
    { agency: "Local Council", awards: 8, medianAwardValue: 90000, bundleRate: 0.1, complianceSignalRate: 0, leadingSupplierAwardShare: 0.25 },
    { agency: "Repeat Buyer", awards: 10, medianAwardValue: 180000, bundleRate: 0.2, complianceSignalRate: 0.1, leadingSupplierAwardShare: 0.7 },
  ]);
  assert.equal(segments.length, 3);
  assert.ok(segments.some((segment) => segment.label === "Bundled program buyers" && segment.agencies.includes("Major Transport")));
});
