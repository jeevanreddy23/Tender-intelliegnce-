import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registry = JSON.parse(await readFile(new URL("../config/procurement-portals.json", import.meta.url), "utf8"));

test("keeps community adapters separate from authoritative source implementations", () => {
  const opencontractau = registry.portals.find(({ id }) => id === "opencontractau");

  assert.ok(opencontractau, "opencontractau must be explicitly registered");
  assert.equal(opencontractau.collectionStatus, "reference-only");
  assert.match(opencontractau.automationPolicy, /licence.*source mappings.*coverage.*tests/i);
});

test("uses unique source registry identifiers", () => {
  const identifiers = registry.portals.map(({ id }) => id);
  assert.equal(new Set(identifiers).size, identifiers.length);
});

test("does not present the retired NSW eTendering API as a live collector", () => {
  const legacyApi = registry.portals.find(({ id }) => id === "nsw-etendering-api");
  const buyNsw = registry.portals.find(({ id }) => id === "buy-nsw");

  assert.ok(legacyApi, "the official legacy API repository must be registered for provenance");
  assert.equal(legacyApi.url, "https://github.com/NSW-eTendering/NSW-eTendering-API");
  assert.equal(legacyApi.collectionStatus, "historical-reference-only");
  assert.match(legacyApi.lifecycle, /retired.*not a current/i);
  assert.doesNotMatch(buyNsw.accessMode, /API/i);
  assert.match(buyNsw.accessMode, /Notice Report CSV/i);
});
