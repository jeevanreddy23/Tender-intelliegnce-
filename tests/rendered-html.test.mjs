import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the NSW Opportunity Radar cockpit", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>NSW Opportunity Radar<\/title>/i);
  assert.match(html, /GeoFlow opportunity intelligence/);
  assert.match(html, /NSW construction and professional services radar/);
  assert.match(html, /Active NSW tenders only/);
  assert.match(html, /Loading live NSW opportunities/);
  assert.doesNotMatch(html, /Parramatta Civic Quarter towers/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/);
});

test("keeps starter-only code out of the product surface", async () => {
  const [css, page, layout, packageJson, strategicSnapshotSource] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/data/strategic-insights.json", import.meta.url), "utf8"),
  ]);
  const strategicSnapshot = JSON.parse(strategicSnapshotSource);

  assert.match(packageJson, /"name": "sts-tender-intelligence"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(page, /scoreOpportunity/);
  assert.match(page, /Decision queue/);
  assert.match(page, /Evidence and verification/);
  assert.match(page, /Win Driver Autopsy/);
  assert.match(page, /Evidence-gated NLI assessment · not a causal explanation/);
  assert.doesNotMatch(page, /true win driver|why the winner won|caused the award/i);
  assert.match(layout, /title:\s*"NSW Opportunity Radar"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /_sites-preview|Starter Project|codex-preview/);
  assert.match(css, /--forest:/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.match(css, /\.driver-autopsy summary\{[^}]*min-height:70px/);
  assert.match(css, /\.public-search-row a\{[^}]*min-height:44px/);
  assert.match(css, /summary:focus-visible/);
  assert.equal(strategicSnapshot.winLossValidation.hypothesesGenerated, 572);
  assert.equal(strategicSnapshot.winLossValidation.modelCallsAttempted, 0);
  assert.equal(strategicSnapshot.winLossValidation.modelCallsCompleted, 0);
  assert.equal(strategicSnapshot.winLossValidation.modelCallsFailed, 0);
  assert.equal(strategicSnapshot.winLossValidation.verdictCounts.insufficientEvidence, 572);
  assert.equal(strategicSnapshot.winLossValidation.driverAutopsy.drivers.length, 4);
  assert.ok(strategicSnapshot.winLossValidation.driverAutopsy.drivers.every(({ state }) => state === "EVIDENCE_REQUIRED"));
  assert.equal(strategicSnapshot.winLossValidation.driverAutopsy.causalClaimAllowed, false);
  assert.equal(strategicSnapshot.winLossValidation.driverAutopsy.scoreMutationAllowed, false);
  assert.equal(strategicSnapshot.winLossValidation.driverAutopsy.humanReviewRequired, true);
});
