const field = (name, table, type, nullable, description, leakageRole = "predictor") => ({
  name, table, type, nullable, description, leakageRole,
});

export const ML_FIELD_DEFINITIONS = [
  field("schema_version", "tender_master", "integer", false, "Canonical dataset schema version", "metadata"),
  field("record_id", "tender_master", "text", false, "Stable row identifier", "key"),
  field("tender_id", "tenders", "text", true, "Portal tender identifier", "key"),
  field("contract_id", "awards", "text", true, "Contract identifier", "key"),
  field("notice_id", "tenders", "text", true, "Published notice identifier", "key"),
  field("source_record_id", "tender_master", "text", true, "Identifier assigned by source portal", "key"),
  field("source_portal", "tender_master", "text", false, "Originating procurement portal", "predictor"),
  field("source_url", "tender_master", "text", true, "Machine-readable source URL", "metadata"),
  field("tender_url", "tenders", "text", true, "Public tender URL", "metadata"),
  field("award_url", "awards", "text", true, "Public award URL", "metadata"),
  field("jurisdiction", "tenders", "text", true, "Government jurisdiction", "predictor"),
  field("source_quality_score", "tender_features", "integer", false, "Traceability and source reliability score", "predictor"),
  field("collected_at", "tender_master", "datetime", false, "Collection timestamp", "metadata"),
  field("provenance_json", "tender_master", "json", true, "Raw provenance metadata", "metadata"),

  field("title", "tenders", "text", true, "Tender or contract title"),
  field("description", "tenders", "text", true, "Source description"),
  field("scope_text", "tenders", "text", true, "Normalised full scope for RAG and NLP"),
  field("category", "tenders", "text", true, "Portal category labels"),
  field("unspsc_codes", "tenders", "json", true, "Normalised UNSPSC code list"),
  field("procurement_method", "tenders", "text", true, "Procurement method"),
  field("opportunity_type", "tenders", "text", true, "Tender, quotation, EOI, award, or pipeline signal"),
  field("tender_status", "tenders", "text", true, "Lifecycle status", "post_outcome"),
  field("document_urls_json", "tenders", "json", true, "Associated public documents", "metadata"),
  field("scope_source", "tenders", "text", true, "Source used for scope extraction", "metadata"),
  field("tender_match_status", "tenders", "text", true, "Tender-to-award match status", "metadata"),

  field("publish_date", "tenders", "date", true, "Notice publication date"),
  field("close_date", "tenders", "date", true, "Submission closing date"),
  field("award_date", "awards", "date", true, "Award date", "post_outcome"),
  field("contract_start_date", "awards", "date", true, "Contract start date", "post_outcome"),
  field("contract_end_date", "awards", "date", true, "Contract end date", "post_outcome"),
  field("last_updated_date", "tenders", "date", true, "Latest source update date", "metadata"),
  field("days_open", "tender_features", "integer", true, "Days between publication and close"),
  field("days_to_award", "tender_features", "integer", true, "Days between publication and award", "post_outcome"),
  field("contract_duration_days", "tender_features", "integer", true, "Contract duration in days", "post_outcome"),
  field("calendar_year", "tender_features", "integer", true, "Publication calendar year"),
  field("financial_year", "tender_features", "text", true, "Australian publication financial year"),
  field("award_month", "tender_features", "integer", true, "Award month", "post_outcome"),

  field("country", "tenders", "text", true, "Country"),
  field("state", "tenders", "text", true, "State or territory"),
  field("region", "tenders", "text", true, "Operational region"),
  field("council", "tenders", "text", true, "Local government area"),
  field("suburb", "tenders", "text", true, "Suburb or locality"),
  field("postcode", "tenders", "text", true, "Postal code"),
  field("latitude", "tenders", "real", true, "Latitude"),
  field("longitude", "tenders", "real", true, "Longitude"),
  field("location_text", "tenders", "text", true, "Original location text"),

  field("agency_id", "agencies", "text", true, "Stable agency dimension identifier", "key"),
  field("agency_name", "agencies", "text", true, "Buyer or agency name"),
  field("agency_canonical", "agencies", "text", true, "Normalised agency name"),
  field("buyer_type", "agencies", "text", true, "Buyer segment"),
  field("client_priority_score", "tender_features", "integer", true, "Internal client attractiveness score"),
  field("supplier_id", "suppliers", "text", true, "Stable supplier dimension identifier", "key"),
  field("supplier_name", "suppliers", "text", true, "Awarded supplier name", "post_outcome"),
  field("supplier_canonical", "suppliers", "text", true, "Normalised supplier name", "post_outcome"),
  field("supplier_abn", "suppliers", "text", true, "Australian Business Number", "post_outcome"),
  field("competitor_group", "suppliers", "text", true, "Normalised competitor group", "post_outcome"),
  field("project_id", "projects", "text", true, "Stable project identifier", "key"),
  field("project_name", "projects", "text", true, "Matched infrastructure project"),
  field("incumbency_strength", "tender_features", "integer", true, "Time-aware buyer-supplier incumbency score"),
  field("relationship_score", "tender_features", "integer", true, "Internal relationship pathway score"),
  field("existing_client_flag", "tender_features", "boolean", true, "Buyer is an existing client"),
  field("known_contact_flag", "tender_features", "boolean", true, "Known decision-maker contact exists"),
  field("repeat_buyer_flag", "tender_features", "boolean", true, "Buyer has prior observed opportunities"),
  field("bidder_count", "bidder_outcomes", "integer", true, "Number of known participants", "post_outcome"),

  field("award_value", "awards", "real", true, "Awarded contract value", "target_award_value"),
  field("currency", "awards", "text", true, "Contract currency"),
  field("estimated_value_min", "tenders", "real", true, "Pre-award lower value estimate"),
  field("estimated_value_max", "tenders", "real", true, "Pre-award upper value estimate"),
  field("value_known_flag", "tender_features", "boolean", false, "A usable value is available", "target_derived"),
  field("value_band", "tender_features", "text", true, "Normalised monetary band", "target_derived"),
  field("commercial_value_score", "tender_features", "integer", false, "Commercial fee-potential component score", "target_derived"),
  field("minimum_fee_pass", "tender_features", "boolean", true, "Known or estimated fee meets internal threshold", "target_derived"),
  field("pricing_deviation_from_median", "bidder_outcomes", "real", true, "Bid divided by historical median", "participant_only"),
  field("bid_price", "bidder_outcomes", "real", true, "Participant bid price", "participant_only"),
  field("median_historical_price", "tender_features", "real", true, "Time-aware comparable historical median"),

  field("geotech_relevance_score", "tender_features", "integer", false, "Contextual geotechnical relevance score"),
  field("geo_tier", "tender_features", "text", false, "Geotechnical relevance tier A, B, or C"),
  field("rejection_reason", "tender_features", "text", true, "Deterministic suppression reason"),
  field("positive_keyword_hits", "tender_features", "json", false, "Matched positive evidence"),
  field("negative_keyword_hits", "tender_features", "json", false, "Matched exclusion evidence"),
  field("service_types", "tender_features", "json", false, "Extracted service families"),
  field("required_capabilities", "tender_features", "json", false, "Extracted delivery capabilities"),
  field("capability_match_score", "tender_features", "integer", false, "Internal capability fit component score"),
  field("procurement_readiness_score", "tender_features", "integer", false, "Pre-award procurement maturity score"),
  field("competitive_position_score", "tender_features", "integer", false, "Competition and incumbency component score"),
  field("bundle_score", "tender_features", "integer", false, "Multi-service turnkey fit component score"),
  field("location_fit_score", "tender_features", "integer", false, "Mobilisation and geography component score"),
  field("operational_region_pass", "tender_features", "boolean", true, "Location falls in supported operating region"),
  field("urgency_score", "tender_features", "integer", true, "Time-to-close urgency indicator"),
  field("multi_service_flag", "tender_features", "boolean", false, "More than one service family is present"),
  field("turnkey_package_flag", "tender_features", "boolean", false, "Drilling, laboratory, and engineering are bundled"),
  field("planning_only_flag", "tender_features", "boolean", false, "Signal has no procurement pathway yet"),
  field("hard_exclusion_flag", "tender_features", "boolean", false, "Hard exclusion matched"),
  field("contextual_exclusion_flag", "tender_features", "boolean", false, "Context-sensitive exclusion matched"),
  field("capability_gap_flag", "tender_features", "boolean", false, "At least one required capability is unavailable"),

  field("opportunity_score", "tender_features", "integer", false, "Weighted operational score; not a probability"),
  field("decision_queue", "tender_features", "text", false, "Pursue, Watch, or Archive queue"),
  field("human_decision", "bidder_outcomes", "text", true, "Estimator Pursue, Watch, or Pass decision", "human_label"),
  field("decision_reason", "bidder_outcomes", "text", true, "Structured or free-text decision rationale", "human_label"),
  field("pursued_flag", "bidder_outcomes", "boolean", true, "Opportunity entered bid workflow", "human_label"),
  field("proposal_submitted", "bidder_outcomes", "boolean", true, "A proposal was submitted", "human_label"),
  field("won_flag", "bidder_outcomes", "boolean", true, "Participant-level win/loss target", "target_win_loss"),
  field("loss_reason", "bidder_outcomes", "text", true, "Known reason a submitted bid lost", "post_outcome"),
  field("model_version", "tender_features", "text", false, "Classifier and scoring version", "metadata"),
];

if (ML_FIELD_DEFINITIONS.length !== 104) {
  throw new Error(`ML dataset schema must contain exactly 104 fields; found ${ML_FIELD_DEFINITIONS.length}`);
}

export const ML_COLUMN_NAMES = ML_FIELD_DEFINITIONS.map(({ name }) => name);

export const ML_TABLES = Object.freeze([
  "tenders", "awards", "suppliers", "agencies", "projects", "tender_features",
  "bidder_outcomes", "ml_award_value_training", "ml_win_loss_training", "tender_master",
]);

export function fieldsForTable(table) {
  return ML_FIELD_DEFINITIONS.filter((definition) => definition.table === table);
}

export function assertNoTargetLeakage(featureNames, target) {
  const forbiddenRoles = target === "award_value"
    ? new Set(["target_award_value", "target_derived", "post_outcome", "target_win_loss"])
    : new Set(["target_win_loss", "post_outcome"]);
  const definitions = new Map(ML_FIELD_DEFINITIONS.map((definition) => [definition.name, definition]));
  const leaking = featureNames.filter((name) => forbiddenRoles.has(definitions.get(name)?.leakageRole));
  if (leaking.length) throw new Error(`Target leakage detected for ${target}: ${leaking.join(", ")}`);
  return true;
}
