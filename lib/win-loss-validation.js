import { createHash } from "node:crypto";

export const WIN_LOSS_PROMPT_VERSION = "win-loss-evidence-v1";
const MAX_EVIDENCE_ITEMS = 40;
const DEFAULT_NLI_TIMEOUT_MS = 30_000;

export const WIN_DRIVER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "capability",
    label: "Capability fit",
    requiredEvidenceKinds: Object.freeze(["winner_capability", "selection_rationale"]),
    statement(winner) {
      return `${winner} was selected because verified capability at award time matched the specialist geotechnical scope.`;
    },
  }),
  Object.freeze({
    id: "price",
    label: "Evaluated price",
    requiredEvidenceKinds: Object.freeze(["winner_bid_price", "comparison_bid_price", "selection_rationale"]),
    statement(winner) {
      return `${winner} was selected because it submitted the lowest evaluated commercial offer.`;
    },
  }),
  Object.freeze({
    id: "relationship",
    label: "Evaluated relationship advantage",
    requiredEvidenceKinds: Object.freeze(["prior_relationship", "selection_rationale"]),
    statement(winner) {
      return `${winner} was selected because incumbent experience or prior site knowledge was an evaluated advantage.`;
    },
  }),
  Object.freeze({
    id: "timeline",
    label: "Evaluated delivery timeline",
    requiredEvidenceKinds: Object.freeze(["timeline_requirement", "winner_timeline_commitment", "selection_rationale"]),
    statement(winner) {
      return `${winner} was selected because its evaluated mobilisation or reporting timeline was superior.`;
    },
  }),
]);

const DRIVER_IDS = new Set(WIN_DRIVER_DEFINITIONS.map(({ id }) => id));
const EVIDENCE_KINDS = new Set(WIN_DRIVER_DEFINITIONS.flatMap(({ requiredEvidenceKinds }) => requiredEvidenceKinds));
const VERDICTS = Object.freeze({
  SUPPORTED: "SUPPORTED",
  CONTRADICTED: "CONTRADICTED",
  INSUFFICIENT: "INSUFFICIENT_EVIDENCE",
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function recordId(record) {
  return clean(record.recordId ?? record.opportunityId ?? record.contractId ?? record.tenderId ?? record.sourceRecordId) || "unknown-award";
}

function sourceUrl(record) {
  return clean(record.awardUrl ?? record.sourceUrl ?? record.tenderUrl) || null;
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateWinLossEvidenceItem(item) {
  const driver = clean(item?.driver).toLowerCase();
  const kind = clean(item?.kind).toLowerCase();
  const excerpt = clean(item?.excerpt);
  const fullSourceText = clean(item?.sourceText);
  const evidenceUrl = clean(item?.sourceUrl);

  if (!DRIVER_IDS.has(driver)) return { valid: false, reason: "unknown driver" };
  if (!EVIDENCE_KINDS.has(kind)) return { valid: false, reason: "unknown evidence kind" };
  if (!evidenceUrl || !isHttpUrl(evidenceUrl)) return { valid: false, reason: "evidence source URL must use HTTP or HTTPS" };
  if (!excerpt || excerpt.length > 500) return { valid: false, reason: "evidence excerpt must contain 1 to 500 characters" };
  if (!fullSourceText) return { valid: false, reason: "source text is required to verify the excerpt" };
  if (!fullSourceText.toLocaleLowerCase("en-AU").includes(excerpt.toLocaleLowerCase("en-AU"))) {
    return { valid: false, reason: "evidence excerpt was not found in the supplied source text" };
  }

  return {
    valid: true,
    evidence: {
      driver,
      kind,
      excerpt,
      sourceUrl: evidenceUrl,
      page: Number.isInteger(item.page) && item.page > 0 ? item.page : null,
      observedAt: clean(item.observedAt) || null,
    },
  };
}

export function buildWinLossPremise(record, evidenceItems = []) {
  const identity = recordId(record);
  const winner = clean(record.supplierName ?? record.successfulSupplier) || "the awarded supplier";
  const scope = clean(record.scope ?? record.description ?? record.title);
  const buyer = clean(record.agency ?? record.buyer);
  const awardValue = Number(record.awardValue ?? record.contractValue);
  const suppliedEvidence = Array.isArray(evidenceItems) ? evidenceItems : [];
  const evidenceResults = suppliedEvidence.slice(0, MAX_EVIDENCE_ITEMS).map((item, index) => ({
    ...validateWinLossEvidenceItem(item),
    index,
  }));
  const acceptedEvidence = evidenceResults.filter(({ valid }) => valid).map(({ evidence }) => evidence);
  const rejectedEvidence = [
    ...evidenceResults.filter(({ valid }) => !valid).map(({ reason, index }) => ({ index, reason })),
    ...suppliedEvidence.slice(MAX_EVIDENCE_ITEMS).map((_, index) => ({
      index: index + MAX_EVIDENCE_ITEMS,
      reason: `evidence limit of ${MAX_EVIDENCE_ITEMS} items exceeded`,
    })),
  ];
  const facts = [
    `Award record: ${identity}.`,
    `Awarded supplier: ${winner}.`,
    buyer ? `Buyer: ${buyer}.` : null,
    scope ? `Recorded scope: ${scope}.` : null,
    Number.isFinite(awardValue) ? `Disclosed award value: AUD ${awardValue}.` : null,
    ...acceptedEvidence.map((item) => `Evidence [${item.driver}/${item.kind}]: ${item.excerpt}`),
  ].filter(Boolean);
  const premise = facts.join(" ");

  return {
    recordId: identity,
    winner,
    premise,
    premiseHash: stableHash(premise),
    sourceUrl: sourceUrl(record),
    hasAwardIdentity: identity !== "unknown-award" && winner !== "the awarded supplier",
    hasScope: Boolean(scope),
    acceptedEvidence,
    rejectedEvidence,
  };
}

export function generateWinHypotheses(record) {
  const identity = recordId(record);
  const winner = clean(record.supplierName ?? record.successfulSupplier) || "the awarded supplier";
  return WIN_DRIVER_DEFINITIONS.map((definition) => ({
    hypothesisId: `${identity}:${definition.id}`,
    driver: definition.id,
    label: definition.label,
    statement: definition.statement(winner),
    requiredEvidenceKinds: [...definition.requiredEvidenceKinds],
  }));
}

function normalizeNliResult(result) {
  const raw = result?.scores ?? result ?? {};
  const scores = {
    entailment: Number(raw.entailment),
    contradiction: Number(raw.contradiction),
    neutral: Number(raw.neutral),
  };
  if (Object.values(scores).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return null;
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  for (const label of Object.keys(scores)) scores[label] = Number((scores[label] / total).toFixed(6));
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  return {
    scores,
    label: ranked[0][0],
    confidence: ranked[0][1],
    margin: Number((ranked[0][1] - ranked[1][1]).toFixed(6)),
    model: clean(result?.model) || null,
  };
}

export function evaluateWinHypothesis(premisePackage, hypothesis, nliResult, options = {}) {
  const evidence = premisePackage.acceptedEvidence.filter(({ driver }) => driver === hypothesis.driver);
  const observedKinds = new Set(evidence.map(({ kind }) => kind));
  const missingEvidence = hypothesis.requiredEvidenceKinds.filter((kind) => !observedKinds.has(kind));
  if (!premisePackage.hasAwardIdentity) missingEvidence.unshift("award_identity");
  if (!premisePackage.hasScope && hypothesis.driver === "capability") missingEvidence.unshift("recorded_scope");
  const normalized = normalizeNliResult(nliResult);
  const confidenceThreshold = options.confidenceThreshold ?? 0.85;
  const marginThreshold = options.marginThreshold ?? 0.15;
  let verdict = VERDICTS.INSUFFICIENT;
  let reason = "required evidence is missing";

  if (!missingEvidence.length && !normalized) {
    reason = nliResult?.error ? "NLI evaluation failed" : "NLI evaluation was not run";
  } else if (!missingEvidence.length && (normalized.confidence < confidenceThreshold || normalized.margin < marginThreshold)) {
    reason = "NLI result did not meet confidence and separation thresholds";
  } else if (!missingEvidence.length && normalized.label === "entailment") {
    verdict = VERDICTS.SUPPORTED;
    reason = "the hypothesis is semantically supported by the attributable evidence";
  } else if (!missingEvidence.length && normalized.label === "contradiction") {
    verdict = VERDICTS.CONTRADICTED;
    reason = "the hypothesis is semantically contradicted by the attributable evidence";
  } else if (!missingEvidence.length && normalized.label === "neutral") {
    reason = "the attributable evidence is neutral toward the hypothesis";
  }

  return {
    recordId: premisePackage.recordId,
    hypothesisId: hypothesis.hypothesisId,
    driver: hypothesis.driver,
    label: hypothesis.label,
    statement: hypothesis.statement,
    verdict,
    confidence: verdict === VERDICTS.INSUFFICIENT ? 0 : normalized.confidence,
    reason,
    readyForNli: missingEvidence.length === 0,
    missingEvidence,
    evidence,
    nli: normalized,
    premiseHash: premisePackage.premiseHash,
    promptVersion: WIN_LOSS_PROMPT_VERSION,
    causalClaimAllowed: false,
    interpretation: "NLI measures semantic consistency with recorded evidence; it does not prove why an award decision occurred.",
  };
}

export function evaluateWinLossRecord(record, options = {}) {
  const premisePackage = buildWinLossPremise(record, options.evidence ?? []);
  const evaluations = generateWinHypotheses(record).map((hypothesis) => evaluateWinHypothesis(
    premisePackage,
    hypothesis,
    options.nliResults?.[hypothesis.driver],
    options,
  ));
  return {
    recordId: premisePackage.recordId,
    sourceUrl: premisePackage.sourceUrl,
    premise: premisePackage.premise,
    premiseHash: premisePackage.premiseHash,
    rejectedEvidence: premisePackage.rejectedEvidence,
    evaluations,
  };
}

function optionForRecord(collection, identity) {
  if (collection instanceof Map) return collection.get(identity);
  return collection?.[identity];
}

export function buildWinLossValidationSummary(records, options = {}) {
  const evaluations = records.flatMap((record) => {
    const identity = recordId(record);
    return evaluateWinLossRecord(record, {
      ...options,
      evidence: optionForRecord(options.evidenceByRecord, identity) ?? [],
      nliResults: optionForRecord(options.nliResultsByRecord, identity) ?? {},
    }).evaluations;
  });
  const verdictCounts = {
    supported: evaluations.filter(({ verdict }) => verdict === VERDICTS.SUPPORTED).length,
    contradicted: evaluations.filter(({ verdict }) => verdict === VERDICTS.CONTRADICTED).length,
    insufficientEvidence: evaluations.filter(({ verdict }) => verdict === VERDICTS.INSUFFICIENT).length,
  };
  const byDriver = Object.fromEntries(WIN_DRIVER_DEFINITIONS.map(({ id }) => {
    const matches = evaluations.filter(({ driver }) => driver === id);
    return [id, {
      hypotheses: matches.length,
      readyForNli: matches.filter(({ readyForNli }) => readyForNli).length,
      supported: matches.filter(({ verdict }) => verdict === VERDICTS.SUPPORTED).length,
      contradicted: matches.filter(({ verdict }) => verdict === VERDICTS.CONTRADICTED).length,
      insufficientEvidence: matches.filter(({ verdict }) => verdict === VERDICTS.INSUFFICIENT).length,
    }];
  }));
  const nliEvaluationsRun = evaluations.filter(({ nli }) => nli).length;

  return {
    method: "evidence-gated NLI semantic validation",
    status: nliEvaluationsRun ? "PARTIAL_OR_COMPLETE" : "BLOCKED_BY_EVIDENCE",
    recordsEvaluated: records.length,
    hypothesesGenerated: evaluations.length,
    nliEvaluationsRun,
    verdictCounts,
    byDriver,
    reason: nliEvaluationsRun
      ? "Only hypotheses with complete attributable evidence were sent to NLI."
      : "Award-only records lack the selection, comparative price, capability-at-award, relationship-evaluation, and delivery-evaluation evidence required for NLI.",
    guardrails: [
      "SUPPORTED means semantic support in the recorded evidence, not proof of causation.",
      "Observed award scope does not prove fleet ownership, accreditation, bid price, or the buyer's decision rationale.",
      "INSUFFICIENT_EVIDENCE is the required result when evidence gates or model thresholds fail.",
    ],
  };
}

export async function runWinLossNli(record, options = {}) {
  if (typeof options.evaluateNli !== "function") throw new TypeError("evaluateNli must be a function");
  const premisePackage = buildWinLossPremise(record, options.evidence ?? []);
  const hypotheses = generateWinHypotheses(record);
  const nliResults = {};
  const requestedTimeout = Number(options.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(requestedTimeout, 120_000))
    : DEFAULT_NLI_TIMEOUT_MS;

  await Promise.all(hypotheses.map(async (hypothesis) => {
    const readiness = evaluateWinHypothesis(premisePackage, hypothesis, null, options);
    if (!readiness.readyForNli) return;
    try {
      let timeout;
      try {
        nliResults[hypothesis.driver] = await Promise.race([
          options.evaluateNli({
            premise: premisePackage.premise,
            premiseHash: premisePackage.premiseHash,
            hypothesis: hypothesis.statement,
            hypothesisId: hypothesis.hypothesisId,
            driver: hypothesis.driver,
            promptVersion: WIN_LOSS_PROMPT_VERSION,
          }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`NLI evaluation timed out after ${timeoutMs} ms`)), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      nliResults[hypothesis.driver] = { error: String(error?.message ?? error).slice(0, 300) };
    }
  }));

  return evaluateWinLossRecord(record, { ...options, nliResults });
}

export { VERDICTS as WIN_LOSS_VERDICTS };
