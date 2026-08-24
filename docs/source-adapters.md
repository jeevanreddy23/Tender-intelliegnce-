# First-build source adapters

Ingestion precedes AI analysis. Each adapter produces the same canonical record,
then deterministic classification and project linking run before PydanticAI.
The adapter layer does not automate logins or invent supplier-side API access.

| Source | Primary input | Purpose | Access boundary |
| --- | --- | --- | --- |
| buy NSW Opportunities Hub | Public metadata | Live tenders, RFQs, EOIs, proposed opportunities and schemes | HTML enrichment is limited to public pages |
| buy NSW Register of notices | Official Notice Report CSV | Awards, standing offers and procurement plans | Prefer complete CSV reports; do not crawl every notice |
| VendorPanel | Public Marketplace RSS | Live opportunity detection | Authenticated documents remain manual/authorised |
| eProcure | Approved API integration | Public and awarded tenders | API ingestion remains disabled until access is granted |
| TenderLink | User-authorised notification email | Live tender and addendum signals | Public metadata only; no automated login |
| EstimateOne | User-authorised alerts | Builder/project lead intelligence | A project trigger is not represented as a tender |
| AusTender | Official API and bulk data | Separate live opportunity and historical award pipelines | Preserve official identifiers and provenance |
| ICN Gateway | Public project/package metadata | Early project and EOI radar | Parent projects may remain leads until a package exists |

`lib/source-adapters.js` implements the canonical normalizer, VendorPanel RSS
parser, authorised TenderLink/EstimateOne email parser, geotechnical tiering and
explicit cross-source project linking. Network collectors remain separate so a
parser can be tested against saved official samples before any scheduled fetch
is enabled.

The operational parsing entry points are:

- `parseBuyNswLiveRecords` for structured public Opportunities Hub results.
- `parseBuyNswNoticeReportRow` for official Register of Notices CSV rows.
- `parseVendorPanelRss` for the public marketplace feed.
- `parseEprocurePayload` for approved supplier integrations only; it fails
  closed until `integrationApproved` is explicitly supplied.
- `parseTenderNotification` for authorised TenderLink and EstimateOne emails.
- `parseAusTenderPayload` with mandatory `live` and `historical` stream
  separation.
- `parseIcnPayload` for parent projects and their linked work packages.

`validateCanonicalRecord` checks the ingestion contract before persistence.
`findDuplicateGroups` identifies duplicate advertisements, while
`findProjectLinkCandidates` creates review-required cross-source suggestions.
Candidate project links are never silently merged. `scoreIngestedRecord` turns
the canonical record and explicit commercial context into the existing
auditable 0–100 opportunity score.

## Canonical identity

`opportunity_id` identifies a source record. `duplicate_group_id` identifies
likely duplicate advertisements. `parent_project_id` identifies the underlying
project. Cross-source records are only joined automatically when an explicit
parent identifier has already been assigned; deterministic keys are candidates
for review, not proof that two projects are identical.

For example, an ICN parent project, an EstimateOne builder alert and a buy NSW
geotechnical RFQ can remain three procurement signals attached to one project.
They must not be collapsed into one source record because their status, dates,
documents and provenance differ.

## Classification order

1. Persist source identity, raw input, extraction method and access basis.
2. Normalize dates, money, buyer, project, location and procurement fields.
3. Apply deterministic Tier A and Tier B geotechnical terms.
4. Store Tier C infrastructure triggers as `potential_geotech_lead`, never as a
   tender solely because a project might later require geotechnical work.
5. Validate the canonical record and quarantine any missing source identity or
   provenance fields.
6. Link reviewed project signals and deduplicate advertisements.
7. Run PydanticAI only for shortlisted opportunities or leads needing document
   interpretation.

The normalized record includes the requested commercial, supplier, scope,
location, mandatory-requirement, document, addendum, provenance and project-link
fields. Boolean service indicators are derived deterministically and should be
replaced or supplemented by cited document extraction when quantities or depths
are required.
