# Bounded parallel tender analysis

The graph is a processing layer **after collection, normalization and cheap
deterministic shortlisting**. It is not a replacement for source adapters, the
procurement database, document storage, retrieval or the Power Apps workflow.

![Bounded tender analysis graph](analysis-graph.svg)

## Runtime contract

`AnalysisGraph` fans shortlisted tenders out to independent structured nodes and
fans successful results into one synthesizer. Deployments construct those nodes
with `structured_node`, a small PydanticAI adapter whose `output_type` validates
every response. Model names and credentials remain deployment configuration.

The orchestrator enforces:

- a shared `asyncio.Semaphore` concurrency limit;
- per-attempt timeouts and bounded retries for transient failures;
- an analysis cost reservation cap before nodes start;
- expected and successful node counts;
- explicit succeeded, failed and skipped statuses with attempts and duration;
- evidence objects containing a source URL, optional page and short excerpt;
- a review outcome if too few nodes complete; and
- mandatory human review for high-value opportunities.

The current node result models cover scope, eligibility, history/competitors and
logistics. A resource result should be added only when it can read authoritative
staff and rig availability; it must not infer availability from tender text.

## Deterministic authority

`deterministic_blocks` owns expired deadlines, duplicate records, mandatory
criteria, resource availability and margin floors. It runs before any AI call.
If a hard block exists, no analysis node or synthesizer runs. The production
pipeline should calculate distance, mobilisation cost, insurance/certification
compliance and final bid approval in the same rules tier and persist each input
and decision.

Synthesis may explain evidence and recommend `bid`, `no_bid` or `review`, but it
cannot clear a hard block or provide final approval. The resulting validated
`TenderAssessment` is the hand-off contract for persistence and Microsoft Power
Apps.

## Operational setup

```bash
python -m pip install -e '.[test]'
pytest
```

Production code should provide four PydanticAI nodes and a structured synthesis
agent, then pass policy limits appropriate to the selected model and API quota.
Do not advertise a fixed speed-up: latency depends on provider limits, document
size, database capacity, retries and the slowest required node.
