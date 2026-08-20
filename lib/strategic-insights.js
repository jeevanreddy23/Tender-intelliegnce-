const CAPABILITY_RULES = [
  { id: "drilling", family: "field-investigation", label: "Drilling / boreholes", pattern: /\b(?:bore[ -]?holes?|drill(?:ing|holes?| rigs?)|rock cor(?:e|ing)|core drilling)\b/i },
  { id: "cpt", family: "field-investigation", label: "CPT / CPTu", pattern: /\b(?:cptu?|cone penetration test(?:ing)?)\b/i },
  { id: "dcp", family: "field-investigation", label: "DCP", pattern: /\b(?:dcp|dynamic cone penetrometer)\b/i },
  { id: "test-pits", family: "field-investigation", label: "Test pits", pattern: /\btest pits?\b/i },
  { id: "lab-testing", family: "laboratory-testing", label: "Laboratory testing", pattern: /\b(?:laboratory|lab) (?:soil |rock |materials? )?test(?:ing|s)?\b|\b(?:ucs|cbr|atterberg|triaxial|oedometer|particle size distribution)\b/i },
  { id: "nata", family: "laboratory-testing", label: "NATA accreditation", pattern: /\bnata(?:\s+(?:accredit(?:ed|ation)|endorse(?:d|ment)))?\b/i },
  { id: "engineering", family: "professional-engineering", label: "Engineering assessment / design", pattern: /\b(?:geotechnical|foundation|pavement|slope) (?:assessment|advice|analysis|design|engineering|model|report)\b|\bdesign parameters?\b/i },
  { id: "cpeng", family: "professional-engineering", label: "CPEng / NER certification", pattern: /\b(?:cpeng|chartered professional engineer|ner engineer|national engineering register)\b/i },
  { id: "groundwater", family: "monitoring", label: "Groundwater monitoring", pattern: /\b(?:groundwater monitoring|piezometers?|monitoring wells?)\b/i },
  { id: "instrumentation", family: "monitoring", label: "Geotechnical instrumentation", pattern: /\b(?:geotechnical instrumentation|inclinometers?|settlement monitoring|vibration monitoring)\b/i },
  { id: "pavement", family: "pavement", label: "Pavement investigation", pattern: /\b(?:pavement investigation|pavement testing|subgrade testing|cbr|dcp)\b/i },
  { id: "environmental", family: "environmental", label: "Environmental ground assessment", pattern: /\b(?:contamination|waste classification|acid sulfate soils?|environmental site (?:assessment|investigation))\b/i },
];

const TURNKEY_FAMILIES = ["field-investigation", "laboratory-testing", "professional-engineering"];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function median(values) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function recordDate(record) {
  const value = record.awardDate ?? record.publishDate ?? record.startDate;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function extractUnspscCodes(record) {
  const explicit = Array.isArray(record.unspscCodes) ? record.unspscCodes : [];
  const embedded = clean(record.category).match(/\b\d{8}\b/g) ?? [];
  return unique([...explicit, ...embedded].map(String));
}

/**
 * Deterministic entity extraction for procurement scope text. Every detected
 * capability retains the term that triggered it so an analyst can audit it.
 */
export function extractProcurementCapabilities(record) {
  const text = [record.title, record.scope, record.description, record.category]
    .map(clean)
    .filter(Boolean)
    .join(". ");
  const capabilities = CAPABILITY_RULES.flatMap((rule) => {
    const match = text.match(rule.pattern);
    return match ? [{ id: rule.id, family: rule.family, label: rule.label, evidence: match[0] }] : [];
  });
  return {
    capabilities,
    capabilityIds: capabilities.map((item) => item.id),
    serviceFamilies: unique(capabilities.map((item) => item.family)),
    unspscCodes: extractUnspscCodes(record),
  };
}

export function analyseScopeBundle(record) {
  const extracted = extractProcurementCapabilities(record);
  const observedServices = unique((record.serviceTypes ?? []).map(clean));
  const familyCount = extracted.serviceFamilies.length;
  const turnkeyFamilies = TURNKEY_FAMILIES.filter((family) => extracted.serviceFamilies.includes(family));
  const isMultiCode = extracted.unspscCodes.length > 1;
  const isBundled = isMultiCode || familyCount >= 2 || observedServices.length >= 3;
  const isTurnkey = turnkeyFamilies.length === TURNKEY_FAMILIES.length;
  return {
    ...extracted,
    observedServices,
    familyCount,
    isMultiCode,
    isBundled,
    isTurnkey,
    bundleLabel: isTurnkey ? "Turnkey investigation + testing + engineering" : isBundled ? "Multi-service package" : "Standalone service",
  };
}

/**
 * Apriori-style pair mining over small, already-filtered procurement baskets.
 * Support, confidence, and lift use the full eligible record set denominator.
 */
export function minePairAssociations(records, options = {}) {
  const minSupport = options.minSupport ?? 0.02;
  const minCount = options.minCount ?? 2;
  const baskets = records.map((record) => {
    if (options.getItems) return unique(options.getItems(record));
    const scope = analyseScopeBundle(record);
    return unique([
      ...scope.serviceFamilies.map((item) => `family:${item}`),
      ...scope.unspscCodes.map((item) => `unspsc:${item}`),
    ]);
  }).filter((basket) => basket.length > 0);
  const itemCounts = new Map();
  const pairCounts = new Map();

  for (const basket of baskets) {
    for (const item of basket) itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
    for (let left = 0; left < basket.length; left += 1) {
      for (let right = left + 1; right < basket.length; right += 1) {
        const pair = [basket[left], basket[right]].sort();
        const key = JSON.stringify(pair);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const associations = [];
  for (const [key, count] of pairCounts) {
    if (count < minCount || ratio(count, baskets.length) < minSupport) continue;
    const [first, second] = JSON.parse(key);
    for (const [antecedent, consequent] of [[first, second], [second, first]]) {
      const antecedentCount = itemCounts.get(antecedent) ?? 0;
      const consequentCount = itemCounts.get(consequent) ?? 0;
      const confidence = ratio(count, antecedentCount);
      const consequentSupport = ratio(consequentCount, baskets.length);
      associations.push({
        antecedent,
        consequent,
        count,
        support: ratio(count, baskets.length),
        confidence,
        lift: consequentSupport ? Number((confidence / consequentSupport).toFixed(3)) : 0,
      });
    }
  }
  return associations.sort((left, right) => right.lift - left.lift || right.count - left.count);
}

/**
 * Client/supplier repeat-award concentration. This is award share, not bidder
 * win rate, because unsuccessful bidders are absent from award-only datasets.
 */
export function calculateIncumbency(record, historicalRecords) {
  const agency = clean(record.agency).toLowerCase();
  const supplier = clean(record.supplierCanonical ?? record.supplierName).toLowerCase();
  const cutoff = recordDate(record);
  const eligible = historicalRecords.filter((candidate) => {
    if (clean(candidate.agency).toLowerCase() !== agency) return false;
    const date = recordDate(candidate);
    return cutoff === null || date === null || date < cutoff;
  });
  const supplierAwards = eligible.filter((candidate) => clean(candidate.supplierCanonical ?? candidate.supplierName).toLowerCase() === supplier);
  const clientValue = eligible.reduce((total, candidate) => total + (Number(candidate.awardValue) || 0), 0);
  const supplierValue = supplierAwards.reduce((total, candidate) => total + (Number(candidate.awardValue) || 0), 0);
  return {
    priorClientAwards: eligible.length,
    priorSupplierAwards: supplierAwards.length,
    awardCountShare: ratio(supplierAwards.length, eligible.length),
    awardValueShare: ratio(supplierValue, clientValue),
    interpretation: "Historical repeat-award concentration; not a bidder win rate.",
  };
}

/**
 * Exact SHAP values for a linear logistic model in log-odds space. A calibrated
 * model must provide coefficients and background means from its training set.
 */
export function explainLinearLogit(features, model) {
  const names = Object.keys(model.coefficients ?? {});
  if (!names.length) throw new Error("The model must include at least one coefficient.");
  const baselineLogOdds = names.reduce(
    (total, name) => total + model.coefficients[name] * (model.backgroundMeans?.[name] ?? 0),
    model.intercept ?? 0,
  );
  const contributions = names.map((name) => {
    const value = Number(features[name] ?? 0);
    const background = Number(model.backgroundMeans?.[name] ?? 0);
    const shapValue = model.coefficients[name] * (value - background);
    return { feature: name, value, background, shapValue: Number(shapValue.toFixed(4)) };
  }).sort((left, right) => Math.abs(right.shapValue) - Math.abs(left.shapValue));
  const logOdds = baselineLogOdds + contributions.reduce((total, item) => total + item.shapValue, 0);
  const sigmoid = (value) => 1 / (1 + Math.exp(-value));
  return {
    probability: Number((sigmoid(logOdds) * 100).toFixed(1)),
    baselineProbability: Number((sigmoid(baselineLogOdds) * 100).toFixed(1)),
    logOdds: Number(logOdds.toFixed(4)),
    contributions,
    method: "linear-logit SHAP",
  };
}

function supplierBreadthProfiles(records) {
  const profiles = new Map();
  for (const record of records) {
    const key = clean(record.supplierCanonical ?? record.supplierName);
    if (!key) continue;
    const current = profiles.get(key) ?? { supplier: record.supplierName ?? key, awards: 0, families: new Set(), clients: new Set(), value: 0 };
    const bundle = analyseScopeBundle(record);
    current.awards += 1;
    current.value += Number(record.awardValue) || 0;
    bundle.serviceFamilies.forEach((family) => current.families.add(family));
    if (record.agency) current.clients.add(record.agency);
    profiles.set(key, current);
  }
  return [...profiles.values()].map((profile) => ({
    supplier: profile.supplier,
    awards: profile.awards,
    familyBreadth: profile.families.size,
    clientCount: profile.clients.size,
    awardValue: profile.value,
    observedArchetype: profile.families.size >= 4 ? "broad-scope" : profile.families.size >= 2 ? "multi-service" : "specialist",
  })).sort((left, right) => right.familyBreadth - left.familyBreadth || right.awards - left.awards);
}

function buyerProfiles(records) {
  const buyers = new Map();
  for (const record of records) {
    const key = clean(record.agency);
    if (!key) continue;
    const current = buyers.get(key) ?? { agency: key, records: [], suppliers: new Map() };
    current.records.push(record);
    const supplier = clean(record.supplierCanonical ?? record.supplierName);
    current.suppliers.set(supplier, (current.suppliers.get(supplier) ?? 0) + 1);
    buyers.set(key, current);
  }
  return [...buyers.values()].map((buyer) => {
    const bundles = buyer.records.map(analyseScopeBundle);
    const values = buyer.records.map((record) => Number(record.awardValue)).filter(Number.isFinite);
    const leadingSupplierAwards = Math.max(0, ...buyer.suppliers.values());
    const complianceCount = bundles.filter((bundle) => bundle.capabilityIds.includes("nata") || bundle.capabilityIds.includes("cpeng")).length;
    return {
      agency: buyer.agency,
      awards: buyer.records.length,
      medianAwardValue: median(values),
      bundleRate: ratio(bundles.filter((bundle) => bundle.isBundled).length, bundles.length),
      turnkeyRate: ratio(bundles.filter((bundle) => bundle.isTurnkey).length, bundles.length),
      complianceSignalRate: ratio(complianceCount, bundles.length),
      leadingSupplierAwardShare: ratio(leadingSupplierAwards, buyer.records.length),
    };
  }).sort((left, right) => right.awards - left.awards);
}

function standardize(rows) {
  if (!rows.length) return [];
  const width = rows[0].length;
  const means = Array.from({ length: width }, (_, index) => rows.reduce((total, row) => total + row[index], 0) / rows.length);
  const deviations = means.map((mean, index) => {
    const variance = rows.reduce((total, row) => total + (row[index] - mean) ** 2, 0) / rows.length;
    return Math.sqrt(variance) || 1;
  });
  return rows.map((row) => row.map((value, index) => (value - means[index]) / deviations[index]));
}

function distance(left, right) {
  return left.reduce((total, value, index) => total + (value - right[index]) ** 2, 0);
}

/**
 * Deterministic K-means for buyer segmentation. Labels describe the observed
 * cluster profile and are assigned after convergence, not supplied as targets.
 */
export function clusterBuyerSegments(profiles, requestedClusters = 3) {
  const eligible = profiles.filter((profile) => profile.awards >= 2);
  if (!eligible.length) return [];
  const k = Math.max(1, Math.min(requestedClusters, eligible.length));
  const vectors = standardize(eligible.map((profile) => [
    Math.log1p(profile.medianAwardValue ?? 0),
    profile.bundleRate,
    profile.complianceSignalRate,
    profile.leadingSupplierAwardShare,
    Math.log1p(profile.awards),
  ]));
  const orderedIndexes = eligible.map((_, index) => index).sort((left, right) => (eligible[left].medianAwardValue ?? 0) - (eligible[right].medianAwardValue ?? 0));
  let centroids = Array.from({ length: k }, (_, index) => {
    const position = k === 1 ? 0 : Math.round(index * (orderedIndexes.length - 1) / (k - 1));
    return [...vectors[orderedIndexes[position]]];
  });
  let assignments = Array(eligible.length).fill(-1);

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const next = vectors.map((vector) => {
      let selected = 0;
      for (let index = 1; index < centroids.length; index += 1) {
        if (distance(vector, centroids[index]) < distance(vector, centroids[selected])) selected = index;
      }
      return selected;
    });
    if (next.every((value, index) => value === assignments[index])) break;
    assignments = next;
    centroids = centroids.map((centroid, cluster) => {
      const members = vectors.filter((_, index) => assignments[index] === cluster);
      if (!members.length) return centroid;
      return centroid.map((_, dimension) => members.reduce((total, member) => total + member[dimension], 0) / members.length);
    });
  }

  const segments = centroids.map((_, cluster) => {
    const members = eligible.filter((__, index) => assignments[index] === cluster);
    return {
      cluster,
      buyerCount: members.length,
      awardCount: members.reduce((total, member) => total + member.awards, 0),
      averageBundleRate: ratio(members.reduce((total, member) => total + member.bundleRate, 0), members.length),
      averageComplianceSignalRate: ratio(members.reduce((total, member) => total + member.complianceSignalRate, 0), members.length),
      averageLeadingSupplierShare: ratio(members.reduce((total, member) => total + member.leadingSupplierAwardShare, 0), members.length),
      medianAwardValue: median(members.map((member) => member.medianAwardValue).filter(Number.isFinite)),
      agencies: members.map((member) => member.agency).sort(),
    };
  });
  const bundledCluster = segments.reduce((best, segment) => segment.averageBundleRate > best.averageBundleRate ? segment : best, segments[0]).cluster;
  const remaining = segments.filter((segment) => segment.cluster !== bundledCluster);
  const relationshipCluster = remaining.length
    ? remaining.reduce((best, segment) => segment.averageLeadingSupplierShare > best.averageLeadingSupplierShare ? segment : best, remaining[0]).cluster
    : null;
  return segments.map((segment) => ({
    ...segment,
    label: segment.cluster === bundledCluster
      ? "Bundled program buyers"
      : segment.cluster === relationshipCluster
        ? "Relationship-concentrated buyers"
        : "Standalone / specialist buyers",
  })).sort((left, right) => right.awardCount - left.awardCount);
}

export function buildStrategicInsightSnapshot(records, metadata = {}) {
  const eligible = records.filter((record) => record && (record.scope || record.title));
  const enriched = eligible.map((record) => ({ record, bundle: analyseScopeBundle(record) }));
  const bundled = enriched.filter((item) => item.bundle.isBundled);
  const turnkey = enriched.filter((item) => item.bundle.isTurnkey);
  const standalone = enriched.filter((item) => !item.bundle.isBundled);
  const bundledValues = bundled.map((item) => Number(item.record.awardValue)).filter(Number.isFinite);
  const standaloneValues = standalone.map((item) => Number(item.record.awardValue)).filter(Number.isFinite);
  const associations = minePairAssociations(eligible, { minCount: 2, minSupport: 0.01 }).slice(0, 12);
  const suppliers = supplierBreadthProfiles(eligible);
  const buyers = buyerProfiles(eligible);
  const buyerSegments = clusterBuyerSegments(buyers);
  const insights = [];

  if (bundled.length >= 3) {
    const bundledMedian = median(bundledValues);
    const standaloneMedian = median(standaloneValues);
    insights.push({
      id: "bundle-value",
      title: "Bundled scope changes the commercial tier",
      finding: bundledMedian && standaloneMedian
        ? `Median disclosed value is ${Number((bundledMedian / standaloneMedian).toFixed(1))}x higher for detected multi-service packages.`
        : `${bundled.length} multi-service packages were detected in the eligible award set.`,
      evidence: { bundledAwards: bundled.length, standaloneAwards: standalone.length, bundledMedianValue: bundledMedian, standaloneMedianValue: standaloneMedian },
      confidence: bundled.length >= 20 ? "moderate" : "directional",
      action: "Position one accountable investigation, testing, and engineering delivery plan when the scope spans multiple service families.",
    });
  }

  const strongest = associations.find((item) => item.lift > 1 && item.count >= 2);
  if (strongest) {
    insights.push({
      id: "scope-association",
      title: "A repeatable scope pairing is visible",
      finding: `${strongest.antecedent.replace("family:", "")} predicts ${strongest.consequent.replace("family:", "")} with ${(strongest.confidence * 100).toFixed(0)}% confidence and ${strongest.lift.toFixed(2)} lift.`,
      evidence: strongest,
      confidence: strongest.count >= 10 ? "moderate" : "directional",
      action: "Qualify both capabilities and subcontractor coverage before treating the opportunity as a standalone service.",
    });
  }

  const repeatBuyer = buyers.find((buyer) => buyer.awards >= 4 && buyer.leadingSupplierAwardShare >= 0.25);
  if (repeatBuyer) {
    insights.push({
      id: "buyer-concentration",
      title: "Buyer history shows repeat-award concentration",
      finding: `${repeatBuyer.agency}'s leading supplier holds ${(repeatBuyer.leadingSupplierAwardShare * 100).toFixed(0)}% of observed geotechnical awards in this dataset.`,
      evidence: repeatBuyer,
      confidence: repeatBuyer.awards >= 10 ? "moderate" : "directional",
      action: "Treat relationship access and incumbent displacement as explicit pursuit workstreams.",
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    source: metadata.source ?? "Historical awarded contracts",
    coverage: metadata.coverage ?? null,
    metrics: {
      eligibleAwards: eligible.length,
      bundledAwards: bundled.length,
      bundleRate: ratio(bundled.length, eligible.length),
      turnkeyAwards: turnkey.length,
      turnkeyRate: ratio(turnkey.length, eligible.length),
      suppliers: suppliers.length,
      buyers: buyers.length,
    },
    insights,
    associations,
    buyerSegments,
    topSupplierProfiles: suppliers.slice(0, 10),
    topBuyerProfiles: buyers.slice(0, 10),
    modelReadiness: {
      winProbabilityTraining: "blocked",
      reason: "Award-only records do not contain unsuccessful bidders, bid prices, or evaluated capability features.",
      required: ["bidder participation", "submitted price", "evaluation outcome", "capability registry at bid date"],
    },
    guardrails: [
      "Association and lift describe observed co-occurrence, not causation.",
      "Supplier breadth is inferred from observed award scope, not verified ownership of rigs, laboratories, or accreditations.",
      "Repeat-award concentration is not bidder win rate.",
      "Low-count findings remain directional until more matched tender and bidder records are available.",
    ],
  };
}
