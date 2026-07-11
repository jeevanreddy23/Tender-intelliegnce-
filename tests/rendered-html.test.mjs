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

test("server-renders the STS Tender Intelligence cockpit", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>STS Tender Intelligence<\/title>/i);
  assert.match(html, /GeoFlow Opportunity Intelligence/);
  assert.match(html, /Construction intelligence before tender time/);
  assert.match(html, /Parramatta Civic Quarter towers/);
  assert.match(html, /AI agents/);
  assert.match(html, /Proposal automation/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/);
});

test("keeps starter-only code out of the product surface", async () => {
  const [css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"name": "sts-tender-intelligence"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(page, /scoreOpportunity/);
  assert.match(page, /Opportunity scoring/);
  assert.match(layout, /title:\s*"STS Tender Intelligence"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /_sites-preview|Starter Project|codex-preview/);
  assert.match(css, /--accent:/);
  assert.match(css, /@media \(max-width: 820px\)/);
});
