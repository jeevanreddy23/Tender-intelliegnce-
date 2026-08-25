# Geotechnical Classification Specification

## Goal

Identify realistic work for geotechnical consultants, drilling contractors,
testing laboratories, ground engineers, and related providers without requiring
`geotechnical` in the title.

## Inputs

Use available title, description, scope, categories, documents,
specifications, project type, buyer, and work packages. Do not infer inaccessible
documents or account-only content.

## Classes

- `DIRECT_GEOTECH`: explicit ground investigation, testing, design, monitoring,
  or geotechnical services.
- `INDIRECT_GEOTECH`: scope contains credible ground-engineering work even if
  the procurement title is broader.
- `POTENTIAL_GEOTECH`: project type suggests future geotechnical demand but a
  current geotechnical procurement scope is not verified.
- `NOT_GEOTECH`: no credible ground-engineering role or an explicit exclusion.
- `UNCERTAIN`: evidence is insufficient or conflicting.

## Direct and indirect signals

Signals include geotechnical/ground/site/subsurface investigation, boreholes,
drilling with ground context, rock coring, CPT/CPTu, SPT, DCP with testing
context, test pits, monitoring wells, groundwater monitoring, soil/rock/lab
testing, construction materials testing with relevant context, pavement
investigation/testing, foundation assessment, slope stability, landslide,
retaining walls, earthworks, ground improvement, piling/testing/inspection,
and geotechnical instrumentation.

Ambiguous acronyms and generic drilling require context. Supply-only,
unrelated geological research, acoustics, traffic surveys, cadastral-only work,
and other hard exclusions do not qualify.

## Hidden project signals

Roads, bridges, rail, stations, tunnels, subdivisions, schools, hospitals,
industrial/warehouse/apartment projects, renewables, transmission, water, dams,
retaining structures, bulk excavation, and major earthworks may become
POTENTIAL_GEOTECH. Project type alone does not turn them into active tenders.

## Scores and publication

Produce a 0–100 relevance score with evidence:

- 85–100: high-priority active tender when lifecycle and procurement gates pass.
- 70–84: relevant active tender when lifecycle and procurement gates pass.
- 50–69: Potential/Review; publish only in Early Leads.
- 0–49: hidden from default feeds; retain for audit or archive.

Rules perform cheap deterministic classification first. Optional AI may resolve
ambiguous active candidates and must return class, score, detected services,
reason, confidence, and attributable evidence through a validated schema.

## Evaluation

Track precision and recall against a labelled corpus. Include direct, hidden,
ambiguous, excluded, acronym, generic drilling, multidisciplinary, and project
lead examples. Never report precision/recall without dataset size and label
quality.
