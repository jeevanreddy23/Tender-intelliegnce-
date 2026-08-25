# Evidence-Gated Strategy Synthesis Specification

## Goal

Turn a small set of attributable, NLI-supported historical findings into a
four-part geotechnical bid memo for one verified NSW tender. DeepSeek is a
derived recommendation layer. It does not reclassify the tender, change source
truth, approve a bid, or prove why a prior supplier won.

## Required processing order

```text
authoritative current tender from D1
              +
server-owned NLI snapshot findings
              |
deterministic eligibility and cost gate
              |
top three eligible findings by confidence
              |
one bounded DeepSeek request
              |
strict strategy-memo validation
              |
human bid-manager review
```

The browser supplies only the selected opportunity ID. The server resolves the
current tender and the NLI findings; it must not trust client-supplied contract
values, evidence, confidence scores, or verdicts.

## Eligibility

DeepSeek may run only when all of the following are true:

- the user is authenticated;
- the opportunity exists in authoritative D1 storage;
- the opportunity is a verified NSW procurement event, not an early lead or a
  terminal/expired record;
- an opportunity without a reliable closing time was verified within the last
  seven days;
- disclosed or estimated contract value is greater than AUD 500,000;
- at least three distinct findings have verdict `SUPPORTED`, confidence
  strictly greater than `0.90`, attributable evidence, a stable premise hash,
  and `causalClaimAllowed: false`;
- the DeepSeek key is present as a server-side Cloudflare secret.

The input may contain at most ten validated findings. The strategy layer uses
only the three highest-confidence eligible findings. `entailment` is an NLI
model label; it is not accepted as a strategy-ready verdict until the
win/loss validator has converted it to `SUPPORTED` after its evidence gates.

## Model contract

The default strategy model is `deepseek-v4-flash` with thinking enabled at
high effort. `deepseek-v4-pro` is also allowed through
`DEEPSEEK_STRATEGY_MODEL`. Legacy `deepseek-chat` and `deepseek-reasoner` model
names are not accepted.

The request:

- uses one `/chat/completions` call and no automatic retry;
- has a 45-second default timeout capped at 60 seconds;
- limits output tokens and uses JSON mode;
- treats tender and evidence text as untrusted data, never as instructions;
- does not request, expose, store, or render private chain-of-thought.

The structured result contains exactly four sections:

1. fleet and equipment;
2. pricing and packaging;
3. geotechnical risk mitigation;
4. competitor counter-positioning.

Every section must contain a recommendation, one or more selected hypothesis
IDs, and checks that a bid manager must complete before relying on it. Unknown
fields, unknown hypothesis references, missing review checks, malformed or
truncated JSON, and outputs that permit a causal claim are rejected.

## Language and evidence rules

- Use `supported historical finding`, not `winning causal driver`.
- NLI confidence is not a probability of winning.
- Do not infer rig ownership, laboratory capacity, competitor assets, bid
  price, environmental conditions, or client priorities unless the supplied
  evidence states them.
- When current-tender evidence is absent, recommend a verification action
  rather than inventing a fact.
- The memo must display that human review is required and causal claims are not
  allowed.

## UI states

The Strategic Narrative panel has `blocked`, `ready`, `generating`, `complete`,
and `error` states. A blocked panel explains the failed deterministic gate and
does not call DeepSeek. The action is at least 44 by 44 CSS pixels, has a
visible focus state, remains usable at supported widths, and cannot be
double-submitted while a request is running.

## Evaluation

Tests must cover value thresholds, unsupported/low-confidence findings,
selection of the top three, fabricated or missing evidence, prompt-injection
content remaining quoted data, strict output validation, unknown evidence
references, empty/truncated provider responses, provider errors, timeouts, and
absence of credentials from prompts and returned results.
