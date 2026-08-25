# Spec-Driven Agent Instructions

This repository uses spec-driven and evaluation-driven agentic development.
Treat a task prompt as an objective, not as the complete product specification.

## Instruction priority

When instructions conflict, apply this order:

1. Platform safety rules and [`docs/SECURITY_RULES.md`](docs/SECURITY_RULES.md).
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
3. [`docs/DATA_RULES.md`](docs/DATA_RULES.md).
4. [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).
5. [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) and [`docs/UX_RULES.md`](docs/UX_RULES.md).
6. [`docs/ACCEPTANCE_CRITERIA.md`](docs/ACCEPTANCE_CRITERIA.md) and [`docs/DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md).
7. Relevant files under [`docs/specs/`](docs/specs/).
8. Existing automated tests.
9. The current GitHub issue or task.
10. Agent assumptions.

Never silently override a higher-priority rule. Record unresolved conflicts in
the plan and pull request.

## Product mission

Read [`docs/PRODUCT_MISSION.md`](docs/PRODUCT_MISSION.md) before changing tender
collection, classification, lifecycle, deduplication, scoring, or dashboard
behavior. The default dashboard is an actionable NSW geotechnical opportunity
feed, not a mirror of everything found on procurement portals.

## Required development loop

Use this loop for every non-trivial change:

`Understand -> Plan -> Implement -> Evaluate -> Repair -> Review -> PR -> Human approval`

### Understand

Gather the smallest relevant context:

- applicable specifications and policies;
- affected workflows and modules;
- existing utilities and design-system patterns;
- canonical schemas, migrations, and source boundaries;
- related tests and recent changes.

Search before adding a component, utility, API, database field, token, or
dependency. Prefer existing patterns and do not load unrelated code.

### Plan

Do not modify production code until a bounded plan exists. State:

- problem and measurable goal;
- scope and explicit non-scope;
- likely files and components;
- behavior that must remain unchanged;
- tests and evaluations required;
- risks and rollback approach;
- definition of success.

The planning role does not edit production code.

### Implement

Make the smallest correct change. Preserve module boundaries and validation
layers. Do not perform opportunistic refactors, broad formatting changes,
silent API changes, or unrelated redesign. Add regression coverage for
behavioral fixes whenever practical.

### Evaluate

Compilation is not completion. Run relevant unit, integration, regression,
rendering, type, lint, build, security, accessibility, performance, and data
quality checks. UI changes require rendered review at 1440, 1280, 1024, 768,
and 390 CSS pixels where tooling permits.

### Repair

Agents may repair failures introduced by their change for at most three
iterations. Each iteration must identify the actual failure, make the smallest
fix, rerun the failed evaluation, and run relevant regression tests. After the
same failure survives three repair attempts, stop and request human review with
the failure, suspected cause, attempted fixes, and uncertainty.

### Review and PR

Significant work follows `branch -> pull request -> automated evaluation ->
review -> human approval -> merge`. A PR must include:

- what changed and why;
- scope and non-scope;
- tests and evidence;
- risks and rollback;
- specification or policy changes;
- known limitations.

Do not autonomously merge high-impact changes. Human approval is required for
production deployments where policy requires it, destructive database work,
authentication or authorization changes, security-policy changes, major
architecture changes, breaking APIs or schemas, removal of significant
functionality, irreversible operations, and uncertain business-impact changes.

## Permanent engineering rules

- Keep authoritative portal data separate from AI analysis.
- AI cannot overwrite source identity, title, buyer, dates, status, value,
  award data, supplier, URL, or provenance.
- Validate external data before persistence and schema-validate structured
  model output.
- Do not bypass authentication, portal access controls, subscriptions,
  CAPTCHAs, robots policies, or source terms.
- Never commit or log secrets; keep keys server-side in managed secrets.
- Preserve backward compatibility unless an approved specification requires a
  breaking change.
- Keep business rules out of presentation components.
- Reuse approved components, tokens, and utilities; do not introduce a
  dependency when existing code can reasonably solve the problem.

## UI rules

- Use the tokens in `app/globals.css`; do not introduce arbitrary colors or
  spacing when a token or existing pattern applies.
- New or modified interactive targets must be at least 44 by 44 CSS pixels.
- Avoid horizontal scrolling at supported widths.
- Show no more than four primary filters by default; secondary filters belong
  in the advanced-filter interface.
- Keep primary navigation concise and prioritize decisions over metadata.
- Do not scale the main application with CSS transforms.
- Maintain contrast, typography, loading, empty, error, desktop, tablet, and
  mobile behavior.

## Tender-specific invariants

- The default feed shows active NSW geotechnical tenders only.
- Expired, closed, awarded, cancelled, completed, and unverifiable records do
  not appear in the active feed.
- Early BCI/EstimateOne/project signals belong in Early Leads unless they are a
  verified active procurement event.
- Historical and award data remain stored for intelligence but separate from
  active opportunities.
- Aggregators aid discovery; original procurement authorities win conflicts.
- Duplicate advertisements become one canonical opportunity with retained
  source references.
- Status, expiry, authority, and deterministic gates run before optional AI.

Detailed contracts are in:

- [`docs/specs/tender-ingestion.md`](docs/specs/tender-ingestion.md)
- [`docs/specs/tender-status.md`](docs/specs/tender-status.md)
- [`docs/specs/geotech-classification.md`](docs/specs/geotech-classification.md)
- [`docs/specs/deduplication.md`](docs/specs/deduplication.md)
- [`docs/specs/source-priority.md`](docs/specs/source-priority.md)
- [`docs/specs/dashboard.md`](docs/specs/dashboard.md)

## Repeated feedback

When the same correction recurs, determine whether it is a permanent product,
data, UX, architecture, security, or acceptance rule. Propose a visible spec and
test update instead of relying on another prompt. Agents may propose governing
policy changes but must not silently rewrite them.
