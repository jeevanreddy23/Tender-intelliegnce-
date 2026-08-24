# UX Rules

## Default experience

Application load opens **Active Geotechnical Tenders**. Early Leads and
Historical/Awards are separate, clearly named views. Never mix their cards in
one default queue.

An active tender card should prioritize:

1. relevance and priority;
2. title and buyer;
3. NSW location;
4. closing date and days remaining;
5. detected geotechnical services;
6. authoritative source and additional source references;
7. one clear action.

Do not let low-value metadata displace decision information.

## Filtering and navigation

- Show at most four primary filters by default: Source, Closing, Relevance, and
  a location lens only when the view is not already NSW-fixed.
- Put secondary filters in the existing advanced-filter interface.
- Default sort is relevance, urgency, strategic fit, then recency.
- Keep primary navigation concise and use plain lifecycle labels.
- A duplicate opportunity is one card with multiple source badges.

## States

- Loading must not render fake opportunities or stale demo records.
- Empty states explain whether no records matched, data is refreshing, or a
  source is unavailable.
- Error states must not imply zero tenders when the feed failed.
- Unknown dates or status must say `Needs verification`; do not present them as
  active.
- Restricted or unavailable metadata must be labelled, not invented.

## Responsive behavior

Evaluate UI changes at 1440, 1280, 1024, 768, and 390 CSS pixels. There must be
no horizontal page scrolling, clipped actions, overlapping text, unreadable
labels, or disappearing primary actions. Layout may reflow, stack, or move
secondary controls into a drawer.

New or modified interactive controls require at least a 44 by 44 CSS-pixel
target. Keyboard focus must be visible, controls must have accessible names,
and color must not be the only status signal.

## Product language

Use `tender` only for verified procurement. Use `lead`, `pipeline`, or `early
signal` for projects without a verified active procurement event. Avoid claims
such as guaranteed win probability, complete national coverage, or confirmed
scope unless supported by attributable evidence.
