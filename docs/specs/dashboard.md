# Dashboard Specification

## Default view

Open on **Active Geotechnical Tenders**. The view contains only current NSW
procurement opportunities with relevance score at least 70. Expired, closed,
awarded, cancelled, completed, unverifiable, duplicate, interstate, New
Zealand, and project-only records are excluded by the backend.

## Views

1. **Active Tenders** — actionable procurement now.
2. **Early Leads** — potential future geotechnical work, including suitable BCI
   and EstimateOne project signals.
3. **Historical / Awards** — closed lifecycle and award intelligence.

Each view has a distinct heading, empty state, count, and source metrics.
Historical/Awards may include a progressive win-driver evidence autopsy with
four fixed hypotheses. It must display semantic support, contradiction, or
insufficient evidence without claiming causation, changing an active
opportunity score, or repeating aggregate findings on live tender cards.

## Ordering

Default Active Tenders order:

1. relevance score descending;
2. closing urgency ascending;
3. strategic fit descending;
4. source recency descending.

Unknown closing dates never sort as if urgent and require verified current
status to appear.

## Primary controls

Show no more than four primary filters:

- Source
- Closing window
- Relevance
- Location only if the view is not already fixed to NSW

Secondary fields belong in an advanced-filter drawer. Filtering semantics must
not change merely because controls move.

## Card contract

Each card displays:

- relevance and priority label;
- authoritative title and buyer;
- NSW location;
- closing date and days remaining;
- detected geotechnical services;
- authoritative source plus contributing source badges;
- clear link/action.

Do not display invented buyer, value, scope, contact, or deadline. Clearly label
metadata-only and early-lead records.

## API and state behavior

- The backend enforces lifecycle, NSW, and feed membership.
- Load all pages needed for the displayed count or use explicit pagination;
  never silently show only the first page as the full total.
- Loading states contain no fake tenders.
- Source failures are separate from valid empty results.
- Empty, error, and partial-coverage states explain next action.

## Responsive and accessibility

Meet [`../UX_RULES.md`](../UX_RULES.md) and
[`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Verify 1440, 1280, 1024, 768,
and 390 CSS-pixel layouts, 44-pixel modified touch targets, visible focus,
accessible labels, keyboard operation, contrast, and no horizontal page scroll.
