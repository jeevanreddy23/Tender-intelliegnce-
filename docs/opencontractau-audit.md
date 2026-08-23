# `opencontractau` adoption audit

**Status:** candidate reference implementation; not an approved production dependency  
**Reviewed:** 23 August 2026  
**Upstream:** <https://github.com/demitonapp/opencontractau>

`opencontractau` is the closest community project to the historical-award
collection problem addressed by this repository. It should initially be used to
compare source mappings and adapter behaviour, not as a trusted data feed. The
source registry therefore labels it `reference-only`.

## Required gate

Pin a commit SHA before completing this audit. Record evidence for every item;
an unchecked item is a release blocker, not an implicit pass.

| Area | Acceptance evidence | Status |
| --- | --- | --- |
| Licence | Repository licence permits the intended commercial use and redistribution; dependency notices are recorded. | Pending |
| Coverage | Each claimed jurisdiction and date range is measured against an official source total, including amendments and cancellations. | Pending |
| Source mappings | Buyer, supplier, amount/currency, award and publication dates, category, identifiers and URLs are mapped to the master schema with fixtures. | Pending |
| Provenance | Every output retains upstream URL, source identifier, retrieval time, extraction method and pinned adapter version. | Pending |
| Tests | Parser fixtures cover missing values, multiple suppliers, amendments, pagination, malformed records and upstream schema drift. | Pending |
| Operations | Retries, rate limits, checkpoints, idempotency, monitoring and quarantine behaviour are demonstrated. | Pending |
| Access | Robots, portal terms, authentication boundaries and redistribution constraints have been reviewed per source. | Pending |
| Security | Dependencies and collector inputs are scanned; untrusted documents cannot execute code or write outside controlled storage. | Pending |

## Adoption procedure

1. Fork or vendor a pinned upstream revision for repeatable review.
2. Build a field-level mapping into `MASTER_COLUMNS` in
   `lib/historical-awards.js`; preserve raw input separately from normalized
   output.
3. Compare a stratified sample with official Commonwealth and NSW records.
   Report record recall, field completeness, duplicate rate and value/date
   discrepancies by jurisdiction and year.
4. Run the existing historical validation and add upstream-specific fixtures.
5. Approve one source adapter at a time. A passing NSW adapter does not approve
   any other jurisdiction.
6. Change the registry status from `reference-only` only after the evidence is
   reviewed and captured in this document.

This gate deliberately avoids treating repository popularity or a successful
demo run as evidence of data completeness.
