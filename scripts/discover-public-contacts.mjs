import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildPublicProfileQueries, searchPublicProfilesWithSerpApi } from "../lib/contact-discovery.js";

function parseArgs(argv) {
  const options = { company: "", agency: "", project: "", location: "Australia", output: "data/contact-discovery/results.json" };
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue;
    const [key, value = ""] = argument.slice(2).split("=", 2);
    if (key in options) options[key] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = { company: options.company, agency: options.agency, project: options.project, location: options.location };
  if (!process.env.SERPAPI_API_KEY) {
    console.log(JSON.stringify({ mode: "manual", queries: buildPublicProfileQueries(input) }, null, 2));
    return;
  }
  const results = await searchPublicProfilesWithSerpApi(input, { apiKey: process.env.SERPAPI_API_KEY });
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify({ mode: "serpapi", input, results }, null, 2)}\n`);
  console.log(`Saved ${results.length} public search-result leads to ${options.output}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
