const tokenise = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2);

/**
 * Retrieval step for RAG. Chunks remain attributable to their source so an
 * answer can be grounded in historical award records or approved standards.
 */
export function retrieveGrounding(query, chunks, limit = 8) {
  const queryTokens = new Set(tokenise(query));
  return chunks
    .map((chunk) => {
      const terms = tokenise(`${chunk.title ?? ""} ${chunk.text ?? ""} ${(chunk.tags ?? []).join(" ")}`);
      const matches = terms.reduce((total, term) => total + Number(queryTokens.has(term)), 0);
      return { ...chunk, retrievalScore: queryTokens.size ? matches / queryTokens.size : 0 };
    })
    .filter((chunk) => chunk.retrievalScore > 0)
    .sort((left, right) => right.retrievalScore - left.retrievalScore)
    .slice(0, limit);
}

/**
 * PAL / Chain of Code: explicit, auditable arithmetic for I_D and pricing.
 * The weights are supplied by policy, rather than being guessed by a model.
 */
export function calculateCommercialCase(input) {
  const weights = {
    revenue: 0.3,
    margin: 0.25,
    probability: 0.25,
    strategicFit: 0.1,
    deliveryReadiness: 0.1,
    ...input.weights,
  };
  const weightedScore =
    input.revenueScore * weights.revenue +
    input.marginScore * weights.margin +
    input.winProbability * weights.probability +
    input.strategicFit * weights.strategicFit +
    input.deliveryReadiness * weights.deliveryReadiness;
  const expectedValue = input.price * (input.winProbability / 100);
  const expectedContribution = expectedValue * (input.marginPercent / 100);
  const targetPrice = input.costBase / (1 - input.targetMarginPercent / 100);

  return {
    investmentDecisionIndex: Math.round(weightedScore),
    expectedValue: Math.round(expectedValue),
    expectedContribution: Math.round(expectedContribution),
    targetPrice: Math.round(targetPrice),
    pricingGap: Math.round(input.price - targetPrice),
  };
}

/**
 * Tree of Thoughts is represented as explicit bid scenarios. The caller owns
 * scenario construction; this function makes comparable commercial outcomes.
 */
export function evaluateBidScenarios(base, scenarios) {
  return scenarios.map((scenario) => {
    const price = Math.round(base.price * (1 + scenario.priceChangePercent / 100));
    const probability = Math.max(0, Math.min(100, base.winProbability + scenario.probabilityDelta));
    const capacity = Math.max(0, Math.min(100, base.deliveryReadiness + scenario.capacityDelta));
    const result = calculateCommercialCase({ ...base, price, winProbability: probability, deliveryReadiness: capacity });
    return {
      id: scenario.id,
      label: scenario.label,
      assumptions: scenario.assumptions,
      price,
      winProbability: probability,
      deliveryReadiness: capacity,
      ...result,
    };
  });
}

/**
 * Self-consistency combines independently produced probability estimates and
 * exposes spread, instead of presenting one model pass as certainty.
 */
export function aggregateWinProbability(samples) {
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new Error("At least three independent probability samples are required.");
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const trimmed = ordered.length >= 5 ? ordered.slice(1, -1) : ordered;
  const mean = trimmed.reduce((total, value) => total + value, 0) / trimmed.length;
  const variance = trimmed.reduce((total, value) => total + (value - mean) ** 2, 0) / trimmed.length;
  const spread = Math.sqrt(variance);
  return {
    estimate: Math.round(mean),
    spread: Number(spread.toFixed(1)),
    consistency: spread <= 6 ? "high" : spread <= 12 ? "moderate" : "low",
    samples: ordered,
  };
}

/**
 * CoV remains a deterministic final gate. It does not re-estimate the win;
 * it verifies that the recommended pursuit meets internal operating rules.
 */
export function verifyOperationalRules(input) {
  const checks = [
    {
      rule: "Fleet availability",
      passed: input.availableCrews >= input.requiredCrews,
      detail: `${input.availableCrews}/${input.requiredCrews} required crews available`,
    },
    {
      rule: "Margin threshold",
      passed: input.marginPercent >= input.minimumMarginPercent,
      detail: `${input.marginPercent}% margin against ${input.minimumMarginPercent}% threshold`,
    },
    {
      rule: "Evidence confidence",
      passed: input.evidenceConfidence >= input.minimumEvidenceConfidence,
      detail: `${input.evidenceConfidence}% confidence against ${input.minimumEvidenceConfidence}% threshold`,
    },
  ];
  return {
    status: checks.every((check) => check.passed) ? "pass" : "review",
    checks,
    blockers: checks.filter((check) => !check.passed),
  };
}
