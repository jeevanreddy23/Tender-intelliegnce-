import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateWinProbability,
  calculateCommercialCase,
  evaluateBidScenarios,
  retrieveGrounding,
  verifyOperationalRules,
} from "../lib/bid-decision.js";

const commercialInput = {
  price: 100000,
  costBase: 70000,
  targetMarginPercent: 25,
  marginPercent: 30,
  revenueScore: 80,
  marginScore: 90,
  winProbability: 70,
  strategicFit: 75,
  deliveryReadiness: 85,
};

test("grounds a scope query in attributable evidence", () => {
  const results = retrieveGrounding("groundwater boreholes basement", [
    { id: "award-1", title: "Basement groundwater investigation", text: "Boreholes and groundwater monitoring", tags: ["historical-award"], source: "AusTender" },
    { id: "standard-1", title: "Pavement guidance", text: "Subgrade testing", tags: ["standard"], source: "Approved library" },
  ]);
  assert.equal(results[0].id, "award-1");
  assert.equal(results[0].source, "AusTender");
});

test("keeps numeric bid calculations explicit and repeatable", () => {
  const result = calculateCommercialCase(commercialInput);
  assert.equal(result.targetPrice, 93333);
  assert.equal(result.expectedValue, 70000);
  assert.equal(result.expectedContribution, 21000);
  assert.equal(result.investmentDecisionIndex, 80);
});

test("compares bid scenarios, aggregates probability samples, and applies final operating gates", () => {
  const scenarios = evaluateBidScenarios(commercialInput, [
    { id: "base", label: "Base", assumptions: "Current conditions", priceChangePercent: 0, probabilityDelta: 0, capacityDelta: 0 },
    { id: "price-pressure", label: "Incumbent price pressure", assumptions: "Incumbent reduces price", priceChangePercent: -8, probabilityDelta: -12, capacityDelta: 0 },
    { id: "crew-loss", label: "Crew constraint", assumptions: "One crew becomes unavailable", priceChangePercent: 0, probabilityDelta: -8, capacityDelta: -25 },
  ]);
  assert.equal(scenarios[1].winProbability, 58);
  assert.equal(scenarios[2].deliveryReadiness, 60);

  const probability = aggregateWinProbability([64, 67, 68, 70, 71]);
  assert.deepEqual(probability, { estimate: 68, spread: 1.2, consistency: "high", samples: [64, 67, 68, 70, 71] });

  const compliance = verifyOperationalRules({
    availableCrews: 2,
    requiredCrews: 2,
    marginPercent: 30,
    minimumMarginPercent: 25,
    evidenceConfidence: 86,
    minimumEvidenceConfidence: 75,
  });
  assert.equal(compliance.status, "pass");
});
