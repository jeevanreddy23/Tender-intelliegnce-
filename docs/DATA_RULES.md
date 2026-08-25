# Data Rules

## Authoritative observations

Every source observation must retain, directly or through an auditable mapping:

- source and source record identifier;
- source URL and source status;
- first seen and last seen timestamps;
- source publication and closing timestamps;
- collection timestamp and extraction method;
- access basis and raw bounded source record;
- canonical opportunity and duplicate-group identifiers when assigned.

The current schema does not yet expose every lifecycle field as a dedicated
column. Until a reviewed migration adds them, preserve them in authoritative
JSON and do not claim complete last-seen reconciliation.

## Lifecycle

Canonical lifecycle states are:

- `ACTIVE`
- `CLOSING_SOON`
- `EXPIRED`
- `CLOSED`
- `AWARDED`
- `CANCELLED`
- `COMPLETED`
- `NEEDS_VERIFICATION`

Compare closing instants using `Australia/Sydney`, including daylight-saving
transitions. Convert reliable instants to UTC for storage. A source date with no
time uses the source-defined close-of-business rule; if none exists, use the end
of that Australia/Sydney calendar day and retain the original precision.

Missing closing date plus unknown source status becomes NEEDS_VERIFICATION and
does not enter the active feed. Missing closing date plus a reliable explicit
OPEN/CURRENT source status may enter only while its source observation remains
fresh under a documented source-specific TTL.

Expired records remain in historical storage. Do not delete a tender merely
because it expired.

## Source truth and AI

Protected authoritative fields include source identity, title, buyer, agency,
publication and closing dates, source status, value, award status, awarded
supplier, documents, source URL, and provenance.

AI-derived fields include classification, relevance score, detected services,
scope summary, likely scope, risk flags, priority, and bid recommendation. Store
them separately with model, prompt version, confidence, evidence, authoritative
hash, and timestamp. AI cannot overwrite protected fields.

## Validation and quarantine

- Validate identity, URLs, dates, amounts, enums, and provenance before
  persistence.
- Preserve raw input for audit within size and sensitivity bounds.
- Quarantine malformed or policy-violating observations with an explicit
  reason.
- Do not turn missing values into inferred facts.
- Schema-validate structured AI output and verify evidence against source text.

## Deduplication and authority

Use deterministic identifiers first, then buyer/project/date/value/address
signals, then probabilistic or AI review only for ambiguous cases. Original
procurement authorities outrank aggregators. Lower-authority sources may fill
missing fields but cannot silently overwrite verified primary values.

Keep every source observation after creating one canonical opportunity. A
merge, split, or conflict resolution must be reversible and auditable.

## Data quality

Coverage metrics must distinguish collected, parsed, validated, quarantined,
active, expired, classified, deduplicated, and published records by source.
Partial source failure must not be reported as zero opportunities or complete
coverage.
