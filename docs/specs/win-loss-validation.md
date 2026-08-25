# Win/Loss Evidence Validation Specification

## Goal

Evaluate whether recorded procurement evidence semantically supports or
contradicts a proposed win-driver hypothesis. This layer supports historical
post-mortems and competitor review; it does not infer protected facts or prove
why a buyer made an award decision.

## Required semantics

The only verdicts are:

- `SUPPORTED`: attributable evidence semantically supports the hypothesis.
- `CONTRADICTED`: attributable evidence semantically contradicts the
  hypothesis.
- `INSUFFICIENT_EVIDENCE`: evidence is missing, neutral, invalid, below the
  model threshold, or the model did not run.

The product must not label these verdicts as causal proof. NLI measures the
relationship between supplied text and a hypothesis; it cannot establish the
counterfactual evidence required for causality.

## Hypotheses and evidence gates

Generate four hypotheses per awarded record. NLI may run only after the listed
evidence is present and attributable.

| Driver | Required evidence |
| --- | --- |
| Capability | Winner capability at award time; buyer selection rationale; recorded specialist scope |
| Price | Winner's submitted/evaluated bid; at least one comparable conforming bid; buyer selection rationale |
| Relationship | Prior relationship or site knowledge; buyer selection rationale showing it was evaluated |
| Timeline | Tender timeline requirement; winner's committed mobilisation/reporting timeline; buyer selection rationale |

An award value is not a submitted bid. Prior awards are not proof that a
relationship caused a later win. Award scope is not proof that the supplier
owned a rig, laboratory, accreditation, or other asset.

## Evidence contract

Each evidence item must contain:

- driver and evidence kind;
- public or otherwise authorized source URL;
- excerpt of 1–500 characters;
- the bounded source text used to verify that the excerpt exists;
- optional page and observation timestamp.

Unverifiable excerpts are rejected before premise construction. Full source
text is used for validation but is not copied into the structured verdict.
Protected award and source fields remain authoritative and separate from the
derived NLI analysis.

Capability evidence for either STS or a competitor must include an observation
date, an effective date or quarter, and an explicit flag that the source
supports activity at the relevant tender date. Effective periods after the
tender or award date are rejected. If the relevant tender or award date itself
is missing or invalid, capability evidence is rejected rather than treated as
historically verified. A current website statement cannot silently
be treated as proof that an asset existed at the historical tender date.

## Structured premise contract

The premise builder emits both a labelled text premise for the cross-encoder
and a structured object with these sections:

- award identity;
- recorded tender scope;
- regulatory requirements;
- timeline, turnkey, and location constraints;
- timestamped STS capabilities;
- timestamped awarded-supplier capabilities;
- attributable selection/comparison evidence.

Every section carries a status. Missing information is `UNKNOWN`, not `None
specified`. A category-based scope suggestion may be retained as
`INFERENCE_CANDIDATE`, but it has `allowedForNli: false` and is excluded from
the text premise, hypotheses, and verdict gates.

Labels such as `[TENDER_SCOPE]`, `[OUR_ASSETS]`, and `[WINNER_ASSETS]` clarify
which party and source context a claim belongs to. They do not make a claim
true; the same URL, excerpt, source-text verification, and timestamp rules still
apply.

## NLI adapter contract

`lib/win-loss-validation.js` accepts an injected evaluator. A model adapter
receives the premise, hypothesis, stable premise hash, driver, hypothesis ID,
prompt version, and the equivalent structured premise. It returns normalized
entailment, contradiction, and neutral scores plus its model identifier.

Default acceptance requires:

- top-label confidence of at least `0.85`; and
- at least `0.15` separation from the second-highest label.

Missing evidence prevents a model call. Neutral, malformed, failed, or
low-separation output becomes `INSUFFICIENT_EVIDENCE`. The implementation does
not bundle a transformer runtime into the Cloudflare Worker. It accepts at most
40 evidence items per award, makes at most four fixed hypothesis calls, and
applies a 30-second default per-call timeout. An approved offline or external
adapter may be connected later without changing the evidence contract.

Model monitoring distinguishes calls attempted, calls returning a valid
normalized result, and calls that fail or return malformed output. A failed
model attempt remains `INSUFFICIENT_EVIDENCE`, but it must not be reported as if
the model was never called or as if evidence alone caused the block.

## Historical evidence autopsy contract

The historical detail experience may expose a sanitized four-hypothesis
assessment for an awarded record. It contains verdict, semantic confidence,
missing evidence, attributable evidence references, premise hash, prompt
version, and explicit non-causal guardrails. It must not contain the full source
text or present an active tender's opportunity score as a historical outcome.

The dashboard may also show aggregate readiness by capability, evaluated price,
evaluated relationship, and evaluated delivery timeline. This belongs in the
Historical/Awards intelligence surface, not inside active opportunity cards.
The disclosure must:

- use `supported historical finding`, not `true win driver`;
- show `Evidence required` when NLI did not run;
- distinguish attempted, completed, and failed model calls;
- keep `causalClaimAllowed` and `scoreMutationAllowed` false;
- provide a human evidence-review action for every blocked driver; and
- avoid repeating aggregate findings as though they apply to each live tender.

Autonomous generation of the four hypotheses is permitted after an awarded
record passes identity and lifecycle gates. Evidence collection, an NLI rerun,
score changes, bid decisions, and external notifications remain explicit,
reviewed actions.

## Current Phase 1 readiness result

The checked-in strategic snapshot represents 141 award-only records. It does
not include unsuccessful bidders, submitted prices, buyer evaluation reports,
capability-at-award evidence, or evaluated delivery commitments. The readiness
audit therefore generates 564 hypotheses, runs zero NLI evaluations, and marks
all 564 `INSUFFICIENT_EVIDENCE`.

The raw 141-record dataset is not checked into this repository. Rebuilding
record-level verdicts requires the historical NDJSON plus legally obtained,
attributable evaluation evidence.

## Prohibited behavior

- Do not update a competitor fleet or accreditation profile from award scope.
- Do not turn `SUPPORTED` into “proven cause.”
- Do not add a win-score multiplier until bidder/outcome data is representative
  and a reviewed, calibrated evaluation demonstrates predictive value.
- Do not deduct opportunity-score points from NLI output. Current-tender
  capability fit requires a separate deterministic, evidence-backed rule and a
  calibrated product evaluation.
- Do not use NLI to clear mandatory, lifecycle, margin, resource, or human
  approval gates.
- Do not access restricted evaluation documents without authorization.
- Do not launch a crawler or rerun NLI merely because repeated output is
  neutral. Four or more neutral labels with unknown premise sections may create
  an evidence-review plan for an approved source; collection and rerun remain
  explicit reviewed actions.

## Downstream strategy use

Only `SUPPORTED` findings with confidence strictly greater than `0.90` may be
considered by the optional DeepSeek synthesis layer. That additional threshold
does not change this validator's `0.85` acceptance threshold. Strategy
eligibility and output requirements are defined in
[`strategy-synthesis.md`](strategy-synthesis.md).

## Evaluation

Tests must cover supported, contradicted, neutral/uncertain, missing-evidence,
model-failure, and fabricated-excerpt cases. They must verify that incomplete
records do not invoke the model, source text is not emitted in verdicts, and
every verdict keeps `causalClaimAllowed: false`.

Tests for the structured builder must also cover section labels, unknown
handling, exclusion of inferred fallback scope, dated capability evidence, and
the non-automatic repeated-neutral review plan. Any claimed accuracy lift must
be demonstrated on a representative labelled evaluation set; no fixed uplift
is assumed by the product.
