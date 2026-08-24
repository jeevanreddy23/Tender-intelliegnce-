# Source Priority Specification

## Principle

Original procurement authorities are authoritative. Aggregators and project
intelligence products expand discovery and context but do not silently replace
better primary data.

## Default hierarchy

1. Original official procurement authority, including buy.NSW.
2. Official buyer/agency or authorized supplier integration.
3. Original private buyer/builder publication.
4. TenderLink, Australian Tenders, and other aggregators.
5. BCI, EstimateOne, planning, funding, and project-intelligence signals.
6. AI interpretation.

Source-specific exceptions must be documented, tested, and auditable.

## Source roles

### buy.NSW

Use current Opportunities for NSW government procurement. Closed and Register
of Notices records belong in Historical/Awards. Categories aid discovery but do
not determine geotechnical relevance alone.

### EstimateOne

Treat as private construction, builder-procurement, and early project
intelligence. Only verified open-for-quoting procurement belongs in Active
Tenders. Awarded, closed, and past quote-due records do not.

### TenderLink NSW

Treat as discovery/public metadata unless an authorized notification supplies
more. Check closing date and status for every record; collection does not imply
it is active.

### Australian Tenders

Treat primarily as an aggregator/discovery source. Identify and retain the
original authority when available.

### BCI Central / LeadManager

Treat primarily as Early Project Intelligence. Only a publicly verifiable
active procurement stage such as Tender Called or Subcontractor Tender Called
may enter Active Tenders. Concept, planning, DA, documentation, and design
stages belong in Early Leads. Closed, awarded, and completed stages belong in
Historical/Awards.

### VendorPanel and AusTender

VendorPanel public RSS supports council and marketplace discovery subject to
jurisdiction/status verification. AusTender is authoritative for Commonwealth
procurement but does not enter the NSW-only default feed unless the product
scope explicitly permits it.

## Access boundaries

No hierarchy permits bypassing portal access controls. Account-only metadata
remains unavailable until the user provides an authorized integration or
export. Preserve access basis with each observation.
