# Cloudflare and DeepSeek processing

Portal adapters remain the source of truth. The first-pass classifier receives
only bounded title, description and scope text after deterministic
prefiltering. The optional strategy endpoint receives a server-resolved current
tender plus three attributable NLI-supported historical findings. DeepSeek
output remains derived analysis and cannot overwrite source identity, buyer,
dates, value, supplier, URL, documents or status.

The bounded `raw_source` snapshot is retained inside the authoritative D1 JSON
record for audit purposes but is excluded from the DeepSeek prompt. Source
evidence returned by the model must be a literal substring of the attributed
title, description or scope field or the analysis is rejected and retried.

```text
API / RSS / CSV / public HTML / authorised email
                         |
                  source adapters
                         |
             canonical authoritative record
                         |
              deterministic rule prefilter
                         |
               Cloudflare Queue (optional)
                         |
              DeepSeek V4 Flash JSON mode
                         |
                strict schema validation
                         |
                    Cloudflare D1
```

The runtime implementation is in `lib/tender-ai-pipeline.js`. The existing
Worker exposes:

- `GET /api/ingestion/health` for non-secret binding readiness.
- `POST /api/ingestion/tenders` for authenticated canonical records.
- a Queue consumer for DeepSeek analysis with retry support.
- a scheduled handler that requeues pending or retrying D1 records.

The DeepSeek integration follows the official OpenAI-compatible
`/chat/completions` API, uses `deepseek-v4-flash` by default, enables JSON mode,
and disables thinking for the first-pass classifier. JSON mode can still return
empty or truncated content, so both conditions are treated as retryable
failures. DeepSeek's tool calling is deliberately not used for portal fetching;
the application executes each approved adapter itself.

The authenticated `POST /api/strategy` path is separate from ingestion. The
browser sends only `opportunityId`; the server resolves the authoritative D1
record and the checked-in NLI snapshot. It requires a verified NSW opportunity,
value greater than AUD 500,000, and at least three `SUPPORTED` findings with
confidence greater than 90%. It selects the top three, makes one request with
thinking enabled, and validates a four-part memo. There is no automatic retry,
and private reasoning is neither requested for display nor returned to the UI.
See [`specs/strategy-synthesis.md`](specs/strategy-synthesis.md).

Current DeepSeek model IDs are `deepseek-v4-flash` and `deepseek-v4-pro`.
Legacy `deepseek-chat` and `deepseek-reasoner` IDs are not used; DeepSeek's
[official API guide](https://api-docs.deepseek.com/guides/function_calling/)
marks those aliases as deprecated.

## Required Cloudflare configuration

Create the queue and dead-letter queue before enabling their bindings:

```powershell
npx wrangler queues create sts-tender-ai
npx wrangler queues create sts-tender-ai-dlq
```

Configure non-secret GitHub deployment variables:

```text
TENDER_AI_QUEUE_NAME=sts-tender-ai
TENDER_AI_DLQ_NAME=sts-tender-ai-dlq
TENDER_AI_CRON=0 */3 * * *
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_STRATEGY_MODEL=deepseek-v4-flash
```

Configure secrets directly on the Cloudflare Worker. Never place either value
in GitHub source, workflow variables or `.env` files committed to the repo:

```powershell
npx wrangler secret put DEEPSEEK_API_KEY --name sts-tender-intelligence
npx wrangler secret put INGESTION_TOKEN --name sts-tender-intelligence
```

The Queue and cron bindings are opt-in. `vite.config.ts` includes them only when
`TENDER_AI_QUEUE_NAME` is present during the production build. Without the
binding, canonical records are safely stored with `ai_status = pending` and the
health endpoint reports that automation is not ready.

An unchanged record that already has a validated analysis is not queued again.
If publishing to Queues fails, its state is reset to `pending`; the scheduled
handler can safely replay it later rather than losing the tender or repeatedly
charging the model for unchanged content.

`DEEPSEEK_STRATEGY_MODEL` is a non-secret Worker variable. The strategy endpoint
reuses the `DEEPSEEK_API_KEY` managed secret. The default Flash model uses
high-effort thinking; `deepseek-v4-pro` can be selected after a reviewed cost
and quality evaluation. Provider pricing is operationally variable and should
be checked against the [official pricing page](https://api-docs.deepseek.com/quick_start/pricing)
before changing thresholds or call volume.

Apply D1 migrations before enabling ingestion:

```powershell
npm run build
npx wrangler d1 migrations apply sts-tender-intelligence-db --remote --config dist/server/wrangler.json
```

## Ingestion request

```http
POST /api/ingestion/tenders
Authorization: Bearer <INGESTION_TOKEN>
Content-Type: application/json
```

```json
{
  "records": [
    {
      "source": "buy-nsw",
      "source_id": "RFT-12345",
      "source_url": "https://buy.nsw.gov.au/opportunity/RFT-12345",
      "title": "Site investigation services",
      "buyer": "Transport for NSW",
      "closing_date": "2026-09-15T05:00:00.000Z",
      "scope": "Boreholes, SPT and groundwater monitoring",
      "status": "open"
    }
  ]
}
```

The endpoint accepts no more than 100 records per request. Invalid identities,
non-HTTP source URLs and malformed records fail before database persistence.
Records below the deterministic threshold or already closed/awarded are stored
but not sent to DeepSeek.

## Deployment controls

`.github/workflows/ci.yml` runs lint, the production build, JavaScript tests and
Python orchestration tests for pull requests. `.github/workflows/deploy.yml`
deploys only from `main` or a manual workflow run and expects scoped Cloudflare
credentials in the protected `production` environment.

The first production collectors should remain buy.NSW, VendorPanel and
AusTender. eProcure stays disabled until integration approval exists;
TenderLink and EstimateOne remain authorised-email inputs; ICN remains public
project/work-package metadata. Browser Run should be added only for a public,
JavaScript-rendered page that cannot be collected through an API, RSS, CSV or
ordinary HTTP fetch.
