import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWinLossPremise,
  buildPremiseEvidenceReviewPlan,
  buildWinLossValidationSummary,
  evaluateWinLossRecord,
  runWinLossNli,
  WIN_LOSS_VERDICTS,
} from "../lib/win-loss-validation.js";

const award = {
  recordId: "AWARD-1",
  title: "Marine geotechnical investigation",
  scope: "Over-water boreholes, CPTu and NATA laboratory testing.",
  agency: "Transport Agency",
  supplierName: "Example Geotechnics Pty Ltd",
  awardValue: 420000,
  awardUrl: "https://procurement.example/awards/AWARD-1",
};

function evidence(driver, kind, excerpt, sourceText) {
  const datedCapability = ["our_capability", "winner_capability"].includes(kind);
  return {
    driver,
    kind,
    excerpt,
    sourceText,
    sourceUrl: "https://procurement.example/evaluation/AWARD-1",
    observedAt: "2026-08-25T00:00:00.000Z",
    ...(datedCapability ? { effectiveAt: "2025-Q3", activeAtRelevantDate: true } : {}),
  };
}

test("rejects evidence that cannot be verified against its attributed source text", () => {
  const premise = buildWinLossPremise(award, [evidence(
    "capability",
    "winner_capability",
    "The winner owned a marine jack-up rig.",
    "The evaluation report did not disclose fleet ownership.",
  )]);

  assert.equal(premise.acceptedEvidence.length, 0);
  assert.deepEqual(premise.rejectedEvidence, [{ index: 0, reason: "evidence excerpt was not found in the supplied source text" }]);
  assert.doesNotMatch(premise.premise, /jack-up rig/i);
});

test("builds labelled structured context without promoting inferred scope into NLI", () => {
  const capabilitySource = "At Q3 2025, STS operated two sonic rigs. The awarded supplier operated a marine jack-up rig at Q3 2025.";
  const standardSource = "The tender required investigation in accordance with AS 1726.";
  const premise = buildWinLossPremise({
    ...award,
    scope: "Over-water boreholes to AS 1726 with an integrated field and laboratory package.",
    location: "Newcastle Harbour, NSW",
    turnkeyRequired: true,
  }, [
    evidence("capability", "our_capability", "At Q3 2025, STS operated two sonic rigs.", capabilitySource),
    evidence("capability", "winner_capability", "The awarded supplier operated a marine jack-up rig at Q3 2025.", capabilitySource),
    evidence("capability", "mandatory_standard", "The tender required investigation in accordance with AS 1726.", standardSource),
  ], {
    inferredScopeCandidate: "Likely requires unverified category-based acid sulfate testing.",
  });

  assert.match(premise.premise, /\[TENDER_SCOPE\]\[RECORDED\]/);
  assert.match(premise.premise, /\[OUR_ASSETS\]\[VERIFIED_AT_RELEVANT_DATE\]/);
  assert.match(premise.premise, /\[WINNER_ASSETS\]\[VERIFIED_AT_RELEVANT_DATE\]/);
  assert.match(premise.premise, /\[REGULATORY\]\[RECORDED\].*AS 1726/);
  assert.doesNotMatch(premise.premise, /unverified category-based acid sulfate/i);
  assert.deepEqual(premise.structuredPremise.tenderScope.inferenceCandidate, {
    status: "INFERENCE_CANDIDATE",
    value: "Likely requires unverified category-based acid sulfate testing.",
    allowedForNli: false,
  });
  assert.equal(premise.structuredPremise.guardrails.scoreMutationAllowed, false);
  assert.ok(premise.structuredPremise.ourAssets.claims.every((item) => !Object.hasOwn(item, "sourceText")));
});

test("requires dated capability evidence and turns repeated neutral results into review only", () => {
  const sourceText = "The supplier operated a specialist rig.";
  const premise = buildWinLossPremise({ ...award, scope: null, description: null }, [{
    driver: "capability",
    kind: "winner_capability",
    excerpt: sourceText,
    sourceText,
    sourceUrl: "https://procurement.example/evaluation/AWARD-1",
  }], { inferredScopeCandidate: "Category-derived drilling suggestion." });
  assert.equal(premise.acceptedEvidence.length, 0);
  assert.match(premise.rejectedEvidence[0].reason, /observation date or quarter/i);
  assert.equal(premise.structuredPremise.tenderScope.status, "UNKNOWN");

  const postdated = buildWinLossPremise({ ...award, awardDate: "2025-01-15" }, [
    evidence("capability", "winner_capability", sourceText, sourceText),
  ]);
  assert.equal(postdated.acceptedEvidence.length, 0);
  assert.match(postdated.rejectedEvidence[0].reason, /post-dates the relevant tender or award date/i);

  const threeNeutral = buildPremiseEvidenceReviewPlan(premise, ["neutral", "neutral", "neutral"]);
  assert.equal(threeNeutral.status, "NO_ACTION");
  const fourNeutral = buildPremiseEvidenceReviewPlan(premise, ["neutral", "neutral", "neutral", "neutral"]);
  assert.equal(fourNeutral.status, "EVIDENCE_REVIEW_REQUIRED");
  assert.ok(fourNeutral.missingSections.includes("tender_scope"));
  assert.equal(fourNeutral.autoCollectionAllowed, false);
  assert.equal(fourNeutral.nliRerunAllowed, false);
  assert.equal(fourNeutral.scoreMutationAllowed, false);
});

test("blocks award-only hypotheses before an NLI model is called", async () => {
  let calls = 0;
  const result = await runWinLossNli(award, {
    evaluateNli: async () => {
      calls += 1;
      return { entailment: 1, contradiction: 0, neutral: 0 };
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.evaluations.length, 4);
  assert.ok(result.evaluations.every(({ verdict }) => verdict === WIN_LOSS_VERDICTS.INSUFFICIENT));
  assert.ok(result.evaluations.every(({ causalClaimAllowed }) => causalClaimAllowed === false));

  const summary = buildWinLossValidationSummary([award]);
  assert.equal(summary.status, "BLOCKED_BY_EVIDENCE");
  assert.equal(summary.hypothesesGenerated, 4);
  assert.equal(summary.verdictCounts.insufficientEvidence, 4);
  assert.equal(summary.nliEvaluationsRun, 0);
});

test("returns supported and contradicted only after evidence and NLI gates pass", async () => {
  const capabilitySource = "The panel verified the supplier's marine rig and laboratory capacity. The evaluation found this capability was decisive for the specialist scope.";
  const priceSource = "The awarded bid was AUD 420000. The lowest competing conforming bid was AUD 360000. The evaluation stated that the higher-priced award was selected on methodology, not lowest price.";
  const evidenceItems = [
    evidence("capability", "winner_capability", "The panel verified the supplier's marine rig and laboratory capacity.", capabilitySource),
    evidence("capability", "selection_rationale", "The evaluation found this capability was decisive for the specialist scope.", capabilitySource),
    evidence("price", "winner_bid_price", "The awarded bid was AUD 420000.", priceSource),
    evidence("price", "comparison_bid_price", "The lowest competing conforming bid was AUD 360000.", priceSource),
    evidence("price", "selection_rationale", "The evaluation stated that the higher-priced award was selected on methodology, not lowest price.", priceSource),
  ];
  const calledDrivers = [];
  const result = await runWinLossNli(award, {
    evidence: evidenceItems,
    evaluateNli: async ({ driver, structuredPremise }) => {
      calledDrivers.push(driver);
      assert.equal(structuredPremise.tenderScope.status, "RECORDED");
      assert.equal(structuredPremise.guardrails.causalClaimAllowed, false);
      return driver === "capability"
        ? { scores: { entailment: 0.94, contradiction: 0.03, neutral: 0.03 }, model: "test-nli" }
        : { scores: { entailment: 0.04, contradiction: 0.91, neutral: 0.05 }, model: "test-nli" };
    },
  });

  assert.deepEqual(calledDrivers.sort(), ["capability", "price"]);
  const capability = result.evaluations.find(({ driver }) => driver === "capability");
  const price = result.evaluations.find(({ driver }) => driver === "price");
  assert.equal(capability.verdict, WIN_LOSS_VERDICTS.SUPPORTED);
  assert.equal(capability.confidence, 0.94);
  assert.equal(price.verdict, WIN_LOSS_VERDICTS.CONTRADICTED);
  assert.equal(price.confidence, 0.91);
  assert.equal(result.evaluations.find(({ driver }) => driver === "relationship").verdict, WIN_LOSS_VERDICTS.INSUFFICIENT);
  assert.ok(capability.evidence.every((item) => !("sourceText" in item)));

  const summary = buildWinLossValidationSummary([award], {
    evidenceByRecord: { "AWARD-1": evidenceItems },
    nliResultsByRecord: {
      "AWARD-1": {
        capability: { entailment: 0.94, contradiction: 0.03, neutral: 0.03, model: "test-nli" },
        price: { entailment: 0.04, contradiction: 0.91, neutral: 0.05, model: "test-nli" },
      },
    },
  });
  assert.equal(summary.nliEvaluationsRun, 2);
  assert.equal(summary.verdictCounts.supported, 1);
  assert.equal(summary.verdictCounts.contradicted, 1);
  assert.equal(summary.verdictCounts.insufficientEvidence, 2);
  assert.equal(summary.topSupportedHypotheses.length, 1);
  assert.equal(summary.topSupportedHypotheses[0].causalClaimAllowed, false);
});

test("keeps low-separation NLI output insufficient even when evidence is complete", () => {
  const sourceText = "The evaluation verified the specialist rig. The evaluation cited the verified rig in its selection rationale.";
  const result = evaluateWinLossRecord(award, {
    evidence: [
      evidence("capability", "winner_capability", "The evaluation verified the specialist rig.", sourceText),
      evidence("capability", "selection_rationale", "The evaluation cited the verified rig in its selection rationale.", sourceText),
    ],
    nliResults: {
      capability: { entailment: 0.46, contradiction: 0.1, neutral: 0.44, model: "uncertain-test-nli" },
    },
  });
  const capability = result.evaluations.find(({ driver }) => driver === "capability");
  assert.equal(capability.verdict, WIN_LOSS_VERDICTS.INSUFFICIENT);
  assert.match(capability.reason, /confidence and separation thresholds/i);
});

test("keeps neutral and failed model results insufficient", async () => {
  const sourceText = "The evaluation verified the specialist rig. The evaluation cited the verified rig in its selection rationale.";
  const evidenceItems = [
    evidence("capability", "winner_capability", "The evaluation verified the specialist rig.", sourceText),
    evidence("capability", "selection_rationale", "The evaluation cited the verified rig in its selection rationale.", sourceText),
  ];
  const neutral = evaluateWinLossRecord(award, {
    evidence: evidenceItems,
    nliResults: { capability: { entailment: 0.03, contradiction: 0.02, neutral: 0.95 } },
  }).evaluations.find(({ driver }) => driver === "capability");
  assert.equal(neutral.verdict, WIN_LOSS_VERDICTS.INSUFFICIENT);
  assert.match(neutral.reason, /neutral/i);

  const failed = await runWinLossNli(award, {
    evidence: evidenceItems,
    evaluateNli: async () => {
      throw new Error("model unavailable");
    },
  });
  const failedCapability = failed.evaluations.find(({ driver }) => driver === "capability");
  assert.equal(failedCapability.verdict, WIN_LOSS_VERDICTS.INSUFFICIENT);
  assert.match(failedCapability.reason, /failed/i);
});
