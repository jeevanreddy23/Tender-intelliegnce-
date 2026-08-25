# Tender Ingestion Specification

## Goal

Collect approved source data with high recall, preserve provenance, and produce
validated source observations without pretending every collected record belongs
in the active dashboard.

## Adapter contract

Each source adapter must:

1. fetch only through an approved access method;
2. parse source-specific fields;
3. retain the raw bounded observation and provenance;
4. normalize into the canonical source-observation schema;
5. validate required identity and data types;
6. return records or quarantine reasons;
7. emit source metrics and explicit failures.

An adapter does not decide final bid approval, overwrite another source, merge
ambiguous opportunities, or use AI to invent missing portal fields.

## Required fields

- `source`
- `source_tender_id`
- `source_url`
- `source_status`
- `first_seen_at`
- `last_seen_at`
- `source_published_at`
- `source_closing_at`
- extraction method and access basis
- raw bounded source record

Where the current persistence schema lacks dedicated columns, keep values in
authoritative JSON and add a reviewed migration before depending on indexed
queries.

## Refresh workflow

`fetch -> parse -> normalize -> validate -> lifecycle -> deduplicate -> classify -> publish`

Refresh active sources at a documented cadence. Reconcile records observed in a
complete source snapshot. If a previously active record disappears, do not
silently keep it active forever; apply source-specific reconciliation or mark it
NEEDS_VERIFICATION.

Collectors must use bounded pagination, concurrency, timeouts, retries, queue
payloads, and source rate limits. One source failure must not block other
sources or be reported as a valid empty result.

## Approved initial adapters

- buy.NSW public Opportunities metadata
- EstimateOne permitted public NSW metadata and authorized alerts
- TenderLink NSW public metadata and authorized notifications
- Australian Tenders public discovery metadata
- BCI Central anonymous public project metadata
- VendorPanel public RSS
- AusTender official public data

Authenticated documents and account-only details remain manual or require an
approved integration. See [`../source-adapters.md`](../source-adapters.md).

## Tests

Each adapter requires saved representative fixtures for valid, malformed,
expired, missing-date, non-NSW, pagination, empty, and changed-markup cases.
Tests must assert source identity, provenance, closing precision, state, status,
and access boundary.
