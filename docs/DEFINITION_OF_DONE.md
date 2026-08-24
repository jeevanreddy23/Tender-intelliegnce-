# Definition of Done

A task is done only when all applicable items are true.

## Specification and scope

- The problem, goal, scope, non-scope, risks, and success criteria were stated.
- Relevant product, architecture, data, security, UX, design, acceptance, and
  tender-specific specifications were followed.
- Any conflict or permanent policy change is visible and reviewed.
- No unrelated behavior or files were changed.

## Implementation

- The requested behavior works end to end.
- Existing relevant behavior remains intact.
- Module boundaries and validation layers are preserved.
- Authoritative and AI-derived data remain separate.
- External inputs are validated and secrets remain managed server-side.
- Behavioral fixes have regression coverage where practical.

## Evaluation

- Relevant type, lint, unit, integration, build, parser, data, and orchestration
  checks pass.
- UI work was rendered and reviewed at representative desktop, tablet, and
  mobile widths, including loading, empty, and error states.
- Accessibility and security have not materially regressed.
- Tender lifecycle, geotechnical relevance, source authority, and duplicate
  evaluations meet [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md).
- Failed evaluations were repaired in no more than three understood iterations,
  or the remaining blocker was escalated.

## Documentation and delivery

- Changed behavior, architecture, schema, access policy, or operational setup is
  documented.
- The working tree contains no secrets, generated caches, or accidental files.
- The PR explains what, why, scope, non-scope, tests, evidence, risks, rollback,
  limitations, and policy/spec changes.
- Mandatory CI checks pass.
- Required human approval is obtained before merge, deployment, destructive
  data work, or other high-impact actions.
