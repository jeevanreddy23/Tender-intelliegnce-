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

## Cloudflare Deployment

The application deploys as a Cloudflare Worker with static assets through the
Cloudflare Vite plugin. Authenticate Wrangler once, then preview or deploy the
production build:

```bash
npx wrangler login
npm run preview
npm run deploy
```

The production Worker is available at
<https://sts-tender-intelligence.poreddyjeevanreddy.workers.dev>.

## Historical Award Dataset

The data pipeline builds a provenance-first master dataset from Commonwealth
AusTender awards and the NSW eTendering archive. Current buy NSW awards are
ingested from official Notice Report CSV exports because the legacy public API
was retired when the Register of notices replaced eTendering.

```bash
# Existing Commonwealth collector, resumable by publication day
npm run collect:austender -- --start=2016-08-19 --end=2026-08-19

# NSW Treasury archive preserved by the Open Contracting Data Registry
npm run collect:nsw:historical -- --start=2016-08-19 --end=2026-08-19

# Optional current buy NSW Notice Report exports
npm run import:nsw:reports -- --input="downloads/notices-2025.csv;downloads/notices-2026.csv"

# CSV, NDJSON, Parquet, RAG corpus, supplier summary, and quality report
npm run build:historical-dataset
npm run validate:historical-dataset
```

Generated files are written under `data/historical-geotech/` and excluded from
Git. Every record retains its source portal, URL, source identifier, collection
timestamp, and extraction method. Geotechnical relevance is calculated across
title, scope, item descriptions, and category rather than title alone.

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
