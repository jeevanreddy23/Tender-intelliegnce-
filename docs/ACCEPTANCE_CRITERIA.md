# Acceptance Criteria

## Mandatory product invariants

A change affecting tender ingestion, lifecycle, classification, deduplication,
or publication is acceptable only when:

- expired-tender leakage into Active Tenders is 0%;
- non-NSW and New Zealand leakage into the NSW feed is 0%;
- closed, awarded, cancelled, completed, and NEEDS_VERIFICATION records do not
  enter Active Tenders;
- active tenders and early project leads remain separate;
- source attribution and original authority are visible and preserved;
- duplicate advertisements do not create duplicate active cards;
- AI-derived fields cannot overwrite protected source truth;
- partial source failures are visible as failures, not false zero counts.

## Evaluation targets

Maintain a labelled evaluation dataset spanning direct geotechnical work,
hidden/indirect work, irrelevant procurement, expiry boundaries, missing dates,
source conflicts, and duplicate pairs. When the dataset is large enough for a
meaningful estimate, mandatory targets are:

| Metric | Target |
| --- | --- |
| Expired tender leakage | 0% |
| NSW jurisdiction leakage | 0% |
| Lifecycle/status accuracy | greater than 99% |
| Geotechnical precision in Active Tenders | at least 90% |
| Geotechnical recall across Active + Early Leads | at least 90% |
| Duplicate card leakage | less than 2% |
| Protected-field overwrite incidents | 0 |

Until a representative labelled dataset exists, report sample size and do not
claim these metrics have been achieved.

## Engineering gates

Run checks proportional to risk. Significant changes require:

- type checking;
- linting with no new errors;
- relevant unit and integration tests;
- production build;
- JavaScript and Python orchestration regression tests;
- source-parser fixtures for adapter changes;
- migration verification for data changes;
- security review for changed trust boundaries;
- rendered, responsive, loading, empty, error, keyboard, and overflow review
  for UI changes.

## UI acceptance

At 1440, 1280, 1024, 768, and 390 CSS pixels, affected views have no clipping,
overlap, horizontal page overflow, unreadable text, lost primary actions, or
unusable controls. New or modified interactive targets are at least 44 by 44
CSS pixels and have visible focus and accessible names.

## Evidence

A PR must include exact commands and results, relevant screenshots or snapshots,
data-quality counts where applicable, known limitations, and rollback steps.
Passing compilation alone is insufficient.
