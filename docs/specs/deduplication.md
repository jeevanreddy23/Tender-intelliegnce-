# Deduplication Specification

## Goal

Represent one procurement opportunity as one user-facing card while retaining
all source observations and conflicts.

## Matching order

Apply the strongest available match first:

1. jurisdiction plus official tender/contract identifier;
2. explicit original-source URL or identifier referenced by an aggregator;
3. buyer/ABN plus project name, closing date, value, and address;
4. normalized supplier/buyer/project/value/date combinations;
5. conservative probabilistic similarity;
6. AI review only for ambiguous candidates.

Title alone is never a sufficient merge key.

## Canonical model

```text
CanonicalOpportunity
  |- original authority observation
  |- TenderLink discovery observation
  |- Australian Tenders discovery observation
  `- related project/source observations
```

The canonical record exposes one title, buyer, date, value, and status selected
through source-authority rules plus a list of contributing sources. Source
observations remain immutable and independently auditable.

## Conflict behavior

- Original procurement authority wins protected-field conflicts.
- Aggregators may fill missing values but do not overwrite verified primary
  values.
- Record every conflicting value and resolution reason.
- Ambiguous matches remain separate and enter a review queue.
- Merges and splits must be reversible.

Project linkage and tender deduplication are different. An EstimateOne or BCI
project lead may share a parent project with a buy.NSW tender without being the
same procurement event.

## Evaluation

Maintain labelled duplicate and non-duplicate pairs, including same-title
different-buyer, amended tender, recurring panel, multi-stage package,
aggregator repost, and parent-project/child-package cases. Duplicate active-card
leakage target is below 2%, with false merges reported separately.
