# Architecture

## Required processing order

```text
Approved sources
      |
Source-specific fetch and parse
      |
Raw immutable source observation
      |
Canonical normalization and validation
      |
Lifecycle/status gate ---------> historical / verification queue
      |
Source authority and deduplication
      |
Deterministic geotechnical rules
      |
Optional bounded AI analysis
      |
Canonical active tender / early lead / historical views
      |
Dashboard, API, reporting, and human decisions
```

Status, expiry, source authority, mandatory criteria, margin, resource
availability, and final bid approval are deterministic. AI may interpret and
explain evidence but cannot clear a hard gate.

## Module boundaries

- `lib/public-portal-collectors.js`: scheduling and permitted source retrieval.
- `lib/source-adapters.js`: source parsing, normalization, provenance, and
  deterministic evidence extraction.
- `lib/tender-ai-pipeline.js`: canonical persistence, deterministic prefilter,
  queueing, bounded AI calls, and schema validation.
- `lib/opportunity-intelligence.js`: geotechnical and commercial scoring rules.
- `worker/index.ts`: Cloudflare HTTP, Queue, Browser Run, cron, and API boundary.
- `db/schema.ts` and `drizzle/`: persistent schema and forward migrations.
- `src/opportunity/`: typed product contracts and auditable opportunity scoring.
- `app/`: presentation and user interaction; no authoritative lifecycle logic.
- `services/tender_analysis/`: bounded parallel analysis after deterministic
  shortlisting; see [`parallel-analysis.md`](parallel-analysis.md).

The current normalizer co-locates some deterministic geotechnical
classification in `lib/source-adapters.js`. New work must not add source-network
logic to that module or move business rules into React. A future separation of
normalization and classification requires behavior-preserving tests and a
reviewed architecture change.

## Runtime

The production runtime is a Cloudflare Worker with:

- D1 as the relational and authoritative record store;
- Queues for ingestion and optional AI analysis;
- Browser Run only for permitted public JavaScript-rendered pages when a
  machine-readable source is unavailable;
- managed secrets for ingestion and model credentials;
- scheduled source collection and analysis retry.

API, RSS, CSV, or ordinary public HTTP sources are preferred over Browser Run.
External collection must not execute inside user-facing request paths.

## Source adapter contract

Each source adapter has one bounded responsibility:

`fetch -> parse -> normalize -> return validated source observations`

Adapters do not merge unrelated records, approve bids, infer protected source
fields, or bypass access controls. Add a new source through a separate adapter,
fixture-based tests, source-registry entry, access review, and provenance rules.

## Authority and analysis separation

Authoritative source observations and AI analysis are separate records. The
authoritative hash binds an analysis to the exact source state it interpreted.
Changed source data invalidates stale analysis and may be re-evaluated. Model
output never mutates source truth.

## Change constraints

- Prefer forward-only migrations and backward-compatible APIs.
- Preserve queue idempotency and source identity.
- Keep collectors resumable and bounded by payload, pagination, timeout,
  concurrency, retry, and cost limits.
- Record partial failure explicitly; do not present partial coverage as
  complete.
- Major module-boundary, schema, or deployment changes require human approval.
