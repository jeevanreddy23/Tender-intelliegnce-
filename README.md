# STS Tender Intelligence

STS Tender Intelligence, also described in the product brief as GeoFlow
Opportunity Intelligence, is an Australia-focused geotechnical business
development platform prototype.

This first build is a working intelligence cockpit rather than a tender scraper.
It models how STS Geotechnics could monitor tenders, planning approvals,
developer activity, consultants, builders, competitors, and proposal readiness
in one daily operating view.

## Current Product Slice

- ranked opportunity queue with deterministic geotechnical pursuit scoring
- realistic Australian construction and infrastructure sample data
- predicted geotechnical scope, revenue range, timing, relationship context, and
  next best action for each opportunity
- source and stage filters for BD workflow triage
- AI agent status board covering tenders, planning approvals, developer
  tracking, document reading, proposal generation, and competitor monitoring
- proposal draft checklist and generated opening paragraph for the selected lead
- competitor market heat panel
- responsive dashboard layout for desktop and mobile

## Local Development

```bash
npm install
npm run dev
npm run build
npm test
```

The app runs on the vinext/Next.js starter used by OpenAI Sites and is prepared
for a future Cloudflare Worker-compatible deployment.

## Next Iterations

1. Connect live source adapters for AusTender, NSW Buy, VendorPanel, council DA
   portals, SSD/SSI/EIS feeds, and private portal exports.
2. Add persistent opportunity, company, contact, and document tables.
3. Add document ingestion for PDFs, Word files, drawings, scopes, BOQs, and
   planning reports.
4. Add authenticated CRM workflows for relationship owners, proposal drafts,
   call notes, reminders, and win/loss tracking.
5. Replace sample scoring weights with supervised scoring calibrated against STS
   historical jobs, margins, turnaround, and win rates.
