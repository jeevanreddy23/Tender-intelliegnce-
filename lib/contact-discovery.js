const DEFAULT_ROLES = [
  "procurement manager",
  "project director",
  "geotechnical lead",
  "engineering manager",
];

function quote(value) {
  const text = String(value ?? "").replace(/["\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return text ? `"${text}"` : null;
}

function compact(values) {
  return values.filter(Boolean);
}

export function buildPublicProfileQueries(input) {
  const roles = input.roles?.length ? input.roles : DEFAULT_ROLES;
  const company = quote(input.company);
  const agency = quote(input.agency);
  const project = quote(input.project);
  const location = quote(input.location ?? "Australia");
  return roles.map((role) => {
    const query = compact([
      "site:linkedin.com/in/",
      quote(role),
      company ?? agency,
      project,
      location,
      "-jobs",
      "-posts",
    ]).join(" ");
    return {
      role,
      query,
      googleUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      duckDuckGoUrl: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    };
  });
}

function isPublicProfileUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/in\//i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Uses SerpApi's supported Google-results API. It stores search-result metadata
 * only and never requests LinkedIn profile pages or authenticated sessions.
 */
export async function searchPublicProfilesWithSerpApi(input, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("SERPAPI_API_KEY is required for automated public-profile discovery.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const queries = buildPublicProfileQueries(input).slice(0, options.maxQueries ?? 4);
  const results = [];

  for (const item of queries) {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", item.query);
    url.searchParams.set("location", options.location ?? "Sydney, New South Wales, Australia");
    url.searchParams.set("google_domain", "google.com.au");
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "au");
    url.searchParams.set("api_key", apiKey);
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`SerpApi search failed with HTTP ${response.status}.`);
    const payload = await response.json();
    for (const result of payload.organic_results ?? []) {
      if (!isPublicProfileUrl(result.link)) continue;
      results.push({
        roleQuery: item.role,
        title: result.title ?? null,
        snippet: result.snippet ?? null,
        profileUrl: result.link,
        source: "SerpApi Google Search result",
        discoveredAt: options.discoveredAt ?? new Date().toISOString(),
        query: item.query,
      });
    }
  }

  return [...new Map(results.map((result) => [result.profileUrl, result])).values()]
    .slice(0, options.maxResults ?? 20);
}
