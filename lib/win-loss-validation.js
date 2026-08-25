import { createHash } from "node:crypto";

export const WIN_LOSS_PROMPT_VERSION = "win-loss-evidence-v1.1";
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
const CONTEXT_EVIDENCE_KINDS = Object.freeze(["our_capability", "mandatory_standard", "turnkey_requirement"]);
const EVIDENCE_KINDS = new Set([
  ...WIN_DRIVER_DEFINITIONS.flatMap(({ requiredEvidenceKinds }) => requiredEvidenceKinds),
  ...CONTEXT_EVIDENCE_KINDS,
]);
const DATED_CAPABILITY_KINDS = new Set(["our_capability", "winner_capability"]);
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

function validEvidenceDate(value) {
  if (!value) return false;
  if (/^(?:Q[1-4][ -]?\d{4}|\d{4}-Q[1-4])$/i.test(value)) return true;
  return Number.isFinite(Date.parse(value));
}

function evidencePeriod(value) {
  const cleaned = clean(value);
  const quarter = cleaned.match(/^(?:Q([1-4])[ -]?(\d{4})|(\d{4})-Q([1-4]))$/i);
  if (quarter) {
    const year = Number(quarter[2] ?? quarter[3]);
    const quarterNumber = Number(quarter[1] ?? quarter[4]);
    return year * 12 + (quarterNumber - 1) * 3;
  }
  const timestamp = Date.parse(cleaned);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractRecordedStandards(value) {
  const matches = clean(value).match(/\b(?:AS(?:\/NZS)?\s*\d{3,5}(?::\d{4})?(?:\.\d+)?|ISO\s*\d{4,5}(?::\d{4})?|NATA)\b/gi) ?? [];
  return unique(matches.map((match) => match.toUpperCase().replace(/\s+/g, " ")));
}

function evidenceClaims(evidence, kind) {
  return evidence.filter((item) => item.kind === kind).map((item) => ({
    excerpt: item.excerpt,
    sourceUrl: item.sourceUrl,
    observedAt: item.observedAt,
    effectiveAt: item.effectiveAt,
    activeAtRelevantDate: item.activeAtRelevantDate,
    page: item.page,
  }));
}

export function validateWinLossEvidenceItem(item) {
  const driver = clean(item?.driver).toLowerCase();
  const kind = clean(item?.kind).toLowerCase();
  const excerpt = clean(item?.excerpt);
  const fullSourceText = clean(item?.sourceText);
  const evidenceUrl = clean(item?.sourceUrl);
  const observedAt = clean(item?.observedAt);
  const effectiveAt = clean(item?.effectiveAt);

  if (!DRIVER_IDS.has(driver)) return { valid: false, reason: "unknown driver" };
  if (!EVIDENCE_KINDS.has(kind)) return { valid: false, reason: "unknown evidence kind" };
  if (!evidenceUrl || !isHttpUrl(evidenceUrl)) return { valid: false, reason: "evidence source URL must use HTTP or HTTPS" };
  if (!excerpt || excerpt.length > 500) return { valid: false, reason: "evidence excerpt must contain 1 to 500 characters" };
  if (!fullSourceText) return { valid: false, reason: "source text is required to verify the excerpt" };
  if (!fullSourceText.toLocaleLowerCase("en-AU").includes(excerpt.toLocaleLowerCase("en-AU"))) {
    return { valid: false, reason: "evidence excerpt was not found in the supplied source text" };
  }
  if (DATED_CAPABILITY_KINDS.has(kind) && !validEvidenceDate(observedAt)) {
    return { valid: false, reason: "capability evidence requires a valid observation date or quarter" };
  }
  if (DATED_CAPABILITY_KINDS.has(kind) && !validEvidenceDate(effectiveAt)) {
    return { valid: false, reason: "capability evidence requires a valid effective date or quarter" };
  }
  if (DATED_CAPABILITY_KINDS.has(kind) && item.activeAtRelevantDate !== true) {
    return { valid: false, reason: "capability evidence must explicitly verify activity at the relevant tender date" };
  }

  return {
    valid: true,
    evidence: {
      driver,
      kind,
      excerpt,
      sourceUrl: evidenceUrl,
      page: Number.isInteger(item.page) && item.page > 0 ? item.page : null,
      observedAt: observedAt || null,
      effectiveAt: effectiveAt || null,
      activeAtRelevantDate: DATED_CAPABILITY_KINDS.has(kind) ? true : null,
    },
  };
}

export function buildWinLossPremise(record, evidenceItems = [], options = {}) {
  const identity = recordId(record);
  const winner = clean(record.supplierName ?? record.successfulSupplier) || "the awarded supplier";
  const scope = clean(record.scope ?? record.description);
  const buyer = clean(record.agency ?? record.buyer);
  const awardValue = Number(record.awardValue ?? record.contractValue);
  const recordDate = clean(record.awardDate ?? record.tenderDate ?? record.publishedDate) || null;
  const suppliedEvidence = Array.isArray(evidenceItems) ? evidenceItems : [];
  const recordPeriod = evidencePeriod(recordDate);
  const evidenceResults = suppliedEvidence.slice(0, MAX_EVIDENCE_ITEMS).map((item, index) => {
    const result = validateWinLossEvidenceItem(item);
    if (result.valid && DATED_CAPABILITY_KINDS.has(result.evidence.kind) && recordPeriod !== null) {
      const capabilityPeriod = evidencePeriod(result.evidence.effectiveAt);
      if (capabilityPeriod !== null && capabilityPeriod > recordPeriod) {
        return { valid: false, reason: "capability evidence post-dates the relevant tender or award date", index };
      }
    }
    return { ...result, index };
  });
  const acceptedEvidence = evidenceResults.filter(({ valid }) => valid).map(({ evidence }) => evidence);
  const rejectedEvidence = [
    ...evidenceResults.filter(({ valid }) => !valid).map(({ reason, index }) => ({ index, reason })),
    ...suppliedEvidence.slice(MAX_EVIDENCE_ITEMS).map((_, index) => ({
      index: index + MAX_EVIDENCE_ITEMS,
      reason: `evidence limit of ${MAX_EVIDENCE_ITEMS} items exceeded`,
    })),
  ];
  const regulatoryClaims = evidenceClaims(acceptedEvidence, "mandatory_standard");
  const recordedStandards = unique([
    ...extractRecordedStandards([record.title, record.description, record.scope].filter(Boolean).join(" ")),
    ...regulatoryClaims.flatMap(({ excerpt }) => extractRecordedStandards(excerpt)),
  ]);
  const timelineEvidence = evidenceClaims(acceptedEvidence, "timeline_requirement");
  const recordedTimeline = clean(record.timelineRequirement ?? record.deliveryTimeline) || null;
  const location = clean(record.location ?? record.address ?? [record.suburb, record.state].filter(Boolean).join(", ")) || null;
  const turnkeyClaims = evidenceClaims(acceptedEvidence, "turnkey_requirement");
  const explicitTurnkey = typeof record.turnkeyRequired === "boolean"
    ? record.turnkeyRequired
    : /\b(?:turnkey|end-to-end|single integrated package)\b/i.test(scope) ? true : null;
  const ourAssets = evidenceClaims(acceptedEvidence, "our_capability");
  const winnerAssets = evidenceClaims(acceptedEvidence, "winner_capability");
  const evaluationEvidence = acceptedEvidence
    .filter(({ kind }) => !CONTEXT_EVIDENCE_KINDS.includes(kind) && kind !== "winner_capability" && kind !== "timeline_requirement")
    .map((item) => ({
      driver: item.driver,
      kind: item.kind,
      excerpt: item.excerpt,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt,
      page: item.page,
    }));
  const inferredScopeCandidate = clean(options.inferredScopeCandidate) || null;
  const structuredPremise = {
    award: {
      status: identity !== "unknown-award" && winner !== "the awarded supplier" ? "RECORDED" : "UNKNOWN",
      recordId: identity,
      winner,
      buyer: buyer || null,
      awardValue: Number.isFinite(awardValue) ? awardValue : null,
      recordDate,
      sourceUrl: sourceUrl(record),
    },
    tenderScope: {
      status: scope ? "RECORDED" : "UNKNOWN",
      value: scope || null,
      allowedForNli: Boolean(scope),
      inferenceCandidate: inferredScopeCandidate ? {
        status: "INFERENCE_CANDIDATE",
        value: inferredScopeCandidate,
        allowedForNli: false,
      } : null,
    },
    regulatory: {
      status: recordedStandards.length || regulatoryClaims.length ? "RECORDED" : "UNKNOWN",
      standards: recordedStandards,
      evidence: regulatoryClaims,
    },
    constraints: {
      timeline: {
        status: recordedTimeline || timelineEvidence.length ? "RECORDED" : "UNKNOWN",
        value: recordedTimeline,
        evidence: timelineEvidence,
      },
      turnkey: {
        status: explicitTurnkey !== null || turnkeyClaims.length ? "RECORDED" : "UNKNOWN",
        required: explicitTurnkey,
        evidence: turnkeyClaims,
      },
      location: {
        status: location ? "RECORDED" : "UNKNOWN",
        value: location,
      },
    },
    ourAssets: {
      status: ourAssets.length ? "VERIFIED_AT_RELEVANT_DATE" : "UNKNOWN",
      claims: ourAssets,
    },
    winnerAssets: {
      status: winnerAssets.length ? "VERIFIED_AT_RELEVANT_DATE" : "UNKNOWN",
      claims: winnerAssets,
    },
    evaluationEvidence,
    guardrails: {
      inferredScopeAllowedForNli: false,
      causalClaimAllowed: false,
      scoreMutationAllowed: false,
    },
  };
  const facts = [
    `[AWARD][${structuredPremise.award.status}] record=${identity}; winner=${winner}; buyer=${buyer || "Unknown"}; award_value=${Number.isFinite(awardValue) ? `AUD ${awardValue}` : "Unknown"}; record_date=${recordDate ?? "Unknown"}.`,
    `[TENDER_SCOPE][${structuredPremise.tenderScope.status}] ${scope || "Unknown — no attributable scope supplied"}.`,
    `[REGULATORY][${structuredPremise.regulatory.status}] ${recordedStandards.length ? recordedStandards.join(", ") : regulatoryClaims.map(({ excerpt }) => excerpt).join(" | ") || "Unknown — no attributable standards supplied"}.`,
    `[CONSTRAINTS] timeline=${recordedTimeline || timelineEvidence.map(({ excerpt }) => excerpt).join(" | ") || "Unknown"}; turnkey=${explicitTurnkey === null ? turnkeyClaims.map(({ excerpt }) => excerpt).join(" | ") || "Unknown" : String(explicitTurnkey)}; location=${location || "Unknown"}.`,
    `[OUR_ASSETS][${structuredPremise.ourAssets.status}] ${ourAssets.map(({ excerpt, effectiveAt, observedAt }) => `${excerpt} (effective ${effectiveAt}; observed ${observedAt})`).join(" | ") || "Unknown — no timestamped attributable capability evidence supplied"}.`,
    `[WINNER_ASSETS][${structuredPremise.winnerAssets.status}] ${winnerAssets.map(({ excerpt, effectiveAt, observedAt }) => `${excerpt} (effective ${effectiveAt}; observed ${observedAt})`).join(" | ") || "Unknown — no timestamped attributable capability evidence supplied"}.`,
    `[EVALUATION_EVIDENCE] ${evaluationEvidence.map((item) => `[${item.driver}/${item.kind}] ${item.excerpt}`).join(" | ") || "Unknown — no attributable comparative or selection evidence supplied"}.`,
  ];
  const premise = facts.join(" ");

  return {
    recordId: identity,
    winner,
    premise,
    premiseHash: stableHash(premise),
    sourceUrl: sourceUrl(record),
    hasAwardIdentity: identity !== "unknown-award" && winner !== "the awarded supplier",
    hasScope: Boolean(scope),
    structuredPremise,
    acceptedEvidence,
    rejectedEvidence,
  };
}

export function buildPremiseEvidenceReviewPlan(premisePackage, verdictHistory = []) {
  const history = Array.isArray(verdictHistory) ? verdictHistory : [];
  const neutralCount = history.filter((entry) => {
    const label = typeof entry === "string" ? entry : entry?.nli?.label ?? entry?.label;
    return clean(label).toLowerCase() === "neutral";
  }).length;
  const structured = premisePackage?.structuredPremise;
  if (!structured || neutralCount <= 3) {
    return {
      status: "NO_ACTION",
      neutralCount,
      missingSections: [],
      actions: [],
      autoCollectionAllowed: false,
      nliRerunAllowed: false,
      scoreMutationAllowed: false,
    };
  }
  const missingSections = [
    structured.tenderScope?.status === "UNKNOWN" ? "tender_scope" : null,
    structured.regulatory?.status === "UNKNOWN" ? "regulatory" : null,
    structured.constraints?.timeline?.status === "UNKNOWN" ? "timeline" : null,
    structured.constraints?.turnkey?.status === "UNKNOWN" ? "turnkey" : null,
    structured.constraints?.location?.status === "UNKNOWN" ? "location" : null,
    structured.ourAssets?.status === "UNKNOWN" ? "our_assets" : null,
    structured.winnerAssets?.status === "UNKNOWN" ? "winner_assets" : null,
  ].filter(Boolean);
  return {
    status: missingSections.length ? "EVIDENCE_REVIEW_REQUIRED" : "HUMAN_REVIEW_REQUIRED",
    neutralCount,
    missingSections,
    actions: missingSections.map((section) => ({
      section,
      action: "Review an approved public or authorized source and attach a timestamped, verifiable excerpt.",
    })),
    autoCollectionAllowed: false,
    nliRerunAllowed: false,
    scoreMutationAllowed: false,
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
  const premisePackage = buildWinLossPremise(record, options.evidence ?? [], options);
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
  const topSupportedHypotheses = evaluations
    .filter(({ verdict }) => verdict === VERDICTS.SUPPORTED)
    .sort((left, right) => right.confidence - left.confidence || left.hypothesisId.localeCompare(right.hypothesisId))
    .slice(0, 10)
    .map((evaluation) => ({
      recordId: evaluation.recordId,
      hypothesisId: evaluation.hypothesisId,
      driver: evaluation.driver,
      label: evaluation.label,
      statement: evaluation.statement,
      verdict: evaluation.verdict,
      confidence: evaluation.confidence,
      evidence: evaluation.evidence,
      premiseHash: evaluation.premiseHash,
      causalClaimAllowed: false,
    }));

  return {
    method: "evidence-gated NLI semantic validation",
    status: nliEvaluationsRun ? "PARTIAL_OR_COMPLETE" : "BLOCKED_BY_EVIDENCE",
    recordsEvaluated: records.length,
    hypothesesGenerated: evaluations.length,
    nliEvaluationsRun,
    verdictCounts,
    byDriver,
    topSupportedHypotheses,
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
  const premisePackage = buildWinLossPremise(record, options.evidence ?? [], options);
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
            structuredPremise: premisePackage.structuredPremise,
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
