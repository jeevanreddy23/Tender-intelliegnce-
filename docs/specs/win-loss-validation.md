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

## NLI adapter contract

`lib/win-loss-validation.js` accepts an injected evaluator. A model adapter
receives the premise, hypothesis, stable premise hash, driver, hypothesis ID,
and prompt version. It returns normalized entailment, contradiction, and
neutral scores plus its model identifier.

Default acceptance requires:

- top-label confidence of at least `0.85`; and
- at least `0.15` separation from the second-highest label.

Missing evidence prevents a model call. Neutral, malformed, failed, or
low-separation output becomes `INSUFFICIENT_EVIDENCE`. The implementation does
not bundle a transformer runtime into the Cloudflare Worker. It accepts at most
40 evidence items per award, makes at most four fixed hypothesis calls, and
applies a 30-second default per-call timeout. An approved offline or external
adapter may be connected later without changing the evidence contract.

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
- Do not use NLI to clear mandatory, lifecycle, margin, resource, or human
  approval gates.
- Do not access restricted evaluation documents without authorization.

## Evaluation

Tests must cover supported, contradicted, neutral/uncertain, missing-evidence,
model-failure, and fabricated-excerpt cases. They must verify that incomplete
records do not invoke the model, source text is not emitted in verdicts, and
every verdict keeps `causalClaimAllowed: false`.
