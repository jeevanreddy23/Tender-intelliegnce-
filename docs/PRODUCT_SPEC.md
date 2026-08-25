# Product Specification

## Users and decisions

Primary users are STS business-development, estimating, engineering, and
leadership staff. The product must help them decide:

- Is this a real, current opportunity?
- Is geotechnical work explicit, indirect, or only a future possibility?
- What is the closing date and urgency?
- Which source is authoritative?
- Is this the same opportunity seen elsewhere?
- What evidence supports pursuing, watching, or archiving it?

## Launch scope

The active product scope is NSW. National sources may be collected for
historical analysis or future expansion, but the default live feed must not
silently broaden beyond NSW.

Initial approved source families are:

| Priority | Source | Role |
| --- | --- | --- |
| P1 | buy.NSW | Original NSW government procurement authority |
| P1 | EstimateOne | Private construction and builder-procurement leads |
| P1 | TenderLink NSW | Public procurement discovery and alerts |
| P2 | Australian Tenders | Aggregated public/private discovery |
| P2 | BCI Central / LeadManager | Early project and construction procurement signals |
| Supporting | VendorPanel | Public marketplace and NSW council opportunities |
| Supporting | AusTender | Commonwealth opportunities and historical awards |

Every adapter must comply with the access policy in
[`source-adapters.md`](source-adapters.md) and the registry in
`config/procurement-portals.json`.

## User-facing feeds

### Active Geotechnical Tenders

Include only records that are:

- reliably ACTIVE or CLOSING_SOON;
- within NSW;
- a verified procurement opportunity rather than only a project signal;
- DIRECT_GEOTECH or INDIRECT_GEOTECH with relevance score at least 70;
- canonicalized so duplicate advertisements appear once.

Sort by geotechnical relevance, closing urgency, strategic fit, then recency.

### Early Geotechnical Leads

Include current POTENTIAL_GEOTECH records scoring 50–69 and suitable project
signals from BCI, EstimateOne, ICN, planning, funding, or infrastructure
pipelines. Clearly label them as leads. Do not represent them as open tenders.

### Historical and Awards Intelligence

Store and expose expired, closed, awarded, and completed records separately for
trend, buyer, competitor, supplier, scope, and pricing analysis.

Win/loss post-mortems may use evidence-gated semantic validation under
[`specs/win-loss-validation.md`](specs/win-loss-validation.md). They must show
insufficient evidence rather than convert award correlations into causal claims.
Structured premises may contrast recorded tender, STS, and awarded-supplier
context only when every capability claim is attributable and dated. Inferred
category scope remains outside NLI and opportunity scoring.

For a verified high-value NSW tender, an authenticated bid manager may request
a four-part DeepSeek Strategic Narrative under
[`specs/strategy-synthesis.md`](specs/strategy-synthesis.md). The action remains
blocked unless the value and evidence gates pass. Its recommendations require
human review and cannot modify source truth or represent a win probability.

## Functional requirements

- Continuously collect permitted public or authorized data from approved
  sources.
- Preserve raw provenance and canonical source identity.
- Normalize dates, money, buyer, location, status, and procurement fields.
- Determine lifecycle status before geotechnical analysis.
- Quarantine unverifiable records from active publication.
- Classify direct, indirect, potential, irrelevant, and uncertain geotechnical
  relevance using full available scope rather than title only.
- Resolve source authority and deduplicate cross-posted opportunities.
- Keep deterministic decisions and AI analysis separately attributable.
- Automatically remove a record from the active feed when it closes or expires,
  without deleting its historical record.

## Non-goals

- Mirroring every record from every portal in the default feed.
- Automating portal logins, subscriptions, CAPTCHAs, tender submission, Q&A, or
  restricted document access.
- Treating every construction project as an active geotechnical tender.
- Allowing AI to approve bids or overwrite authoritative source fields.
- Claiming national live coverage until each jurisdiction adapter and its
  access policy are implemented and evaluated.

## Existing implementation and target gaps

The repository currently provides public collectors, canonical normalization,
deterministic geotechnical tiering, D1 persistence, optional DeepSeek analysis,
an evidence-gated DeepSeek strategy endpoint, and an active NSW API guard.
Three-feed persistence, complete source
reconciliation, explicit NEEDS_VERIFICATION lifecycle storage, canonical
multi-source opportunity records, and labelled evaluation datasets remain
target capabilities and require reviewed implementation work.
