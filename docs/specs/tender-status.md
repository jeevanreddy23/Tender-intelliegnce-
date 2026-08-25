# Tender Status Specification

## Goal

Determine whether an opportunity is actionable now before geotechnical or
commercial ranking.

## Canonical states

- `ACTIVE`: source reliably says open/current and the close has not passed.
- `CLOSING_SOON`: ACTIVE and within the configured urgency window.
- `EXPIRED`: reliable closing instant is earlier than current Sydney time.
- `CLOSED`: source explicitly says closed.
- `AWARDED`: source explicitly records an award or contract.
- `CANCELLED`: source withdrew or cancelled the procurement.
- `COMPLETED`: project/procurement is complete.
- `NEEDS_VERIFICATION`: status cannot be established reliably.

## Active rule

A record may appear in Active Geotechnical Tenders only when:

```text
source status is OPEN or CURRENT
AND
closing instant is not earlier than current Australia/Sydney time
```

Alternatively, a record with no reliable closing date may be active only when
the source explicitly and reliably marks it OPEN/CURRENT and the observation is
within a documented source-specific freshness window.

Missing close plus unknown status is NEEDS_VERIFICATION and hidden from the
active feed.

## Time handling

- Interpret portal wall-clock dates in `Australia/Sydney` unless the source
  supplies another explicit timezone.
- Respect daylight-saving transitions.
- Store normalized instants in UTC while retaining original text and precision.
- Treat date-only closes as end of the source-defined business day; otherwise
  end of that Sydney calendar day.

## Enforcement points

Run expiry and terminal-status validation:

1. during ingestion;
2. before active-view persistence/publication;
3. in the backend API query.

The frontend may defensively filter but is not the authoritative guard.

## Transition behavior

When an active tender closes, expires, is awarded, or is cancelled, remove it
from Active Tenders automatically and retain it in Historical/Awards. Never
delete solely because of lifecycle transition.

## Evaluation cases

Cover exact close instant, one second before/after, Sydney DST start/end,
date-only close, malformed date, missing date with open status, missing date
with unknown status, status variants, and source-status/closing-date conflict.
