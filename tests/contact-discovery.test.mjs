import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicProfileQueries, searchPublicProfilesWithSerpApi } from "../lib/contact-discovery.js";

test("builds narrow public-profile X-ray searches", () => {
  const [query] = buildPublicProfileQueries({
    company: "Example Civil",
    project: "Western Sydney Airport",
    role: "Estimating Manager",
    roles: ["Estimating Manager"],
    location: "Sydney",
  });
  assert.match(query.query, /site:linkedin\.com\/in\//);
  assert.match(query.query, /"Example Civil"/);
  assert.match(query.query, /"Estimating Manager"/);
  assert.match(query.googleUrl, /^https:\/\/www\.google\.com\/search\?/);
  assert.match(query.duckDuckGoUrl, /^https:\/\/duckduckgo\.com\/\?q=/);
});

test("uses search-result metadata without fetching profile pages", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return {
      ok: true,
      json: async () => ({
        organic_results: [
          { title: "A Person - Estimating Manager", link: "https://au.linkedin.com/in/a-person", snippet: "Example Civil" },
          { title: "Jobs", link: "https://linkedin.com/jobs/123", snippet: "Not a profile" },
        ],
      }),
    };
  };
  const results = await searchPublicProfilesWithSerpApi(
    { company: "Example Civil", roles: ["Estimating Manager"] },
    { apiKey: "test-key", fetchImpl, discoveredAt: "2026-08-19T00:00:00.000Z" },
  );
  assert.equal(requested.length, 1);
  assert.match(requested[0], /^https:\/\/serpapi\.com\/search\.json\?/);
  assert.equal(results.length, 1);
  assert.equal(results[0].profileUrl, "https://au.linkedin.com/in/a-person");
});

