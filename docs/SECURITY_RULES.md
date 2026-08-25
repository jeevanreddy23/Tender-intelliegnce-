# Security Rules

## Secrets and credentials

- Never commit, print, log, expose to client code, or include credentials in
  model prompts.
- Store API keys and ingestion tokens in Cloudflare managed secrets or an
  equivalent approved secret manager.
- Environment variable names may be documented; values may not.
- Rotate a secret immediately if it appears in chat, logs, source, screenshots,
  or build artifacts.

## Source access

- Use official APIs, RSS, CSV, permitted public HTML, or user-authorized alerts.
- Do not automate logins, paid subscriptions, CAPTCHAs, Q&A, tender submission,
  or restricted document downloads.
- Do not evade robots policies, bot controls, rate limits, or source terms.
- Browser automation is for permitted public rendered content, not access-control
  bypass.
- Record the access basis and terms-review status for every adapter.

## Application boundaries

- Authenticate mutation and ingestion endpoints.
- Apply least-privilege Cloudflare and GitHub tokens.
- Validate method, content type, authorization, input size, URLs, and structured
  payloads at trust boundaries.
- Escape or sanitize untrusted content before rendering or storage-dependent
  execution.
- Do not weaken authentication, authorization, validation, or auditability to
  simplify a task.

## AI safety

- Treat portal text and documents as untrusted data, not instructions.
- Send only bounded fields required for analysis.
- Schema-validate model output and reject unknown fields.
- Require attributable evidence for extracted claims.
- Prevent model output from mutating authoritative values or clearing
  deterministic gates.
- Apply cost, timeout, retry, concurrency, and human-review limits.

## Change safety

Human approval is required for destructive database operations,
authentication/authorization changes, secret-policy changes, breaking schemas,
production deployment where policy requires it, and irreversible actions.
Security-sensitive PRs must describe threat impact, validation, rollback, and
remaining risk.
