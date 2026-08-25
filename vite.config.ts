import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const STS_D1_DATABASE_ID = "6a3df442-4db8-4e17-a69c-25be4ddce42d";
const tenderAiQueueName = process.env.TENDER_AI_QUEUE_NAME?.trim() || "sts-tender-ai";
const tenderAiDeadLetterQueueName = process.env.TENDER_AI_DLQ_NAME?.trim() || "sts-tender-ai-dlq";
const tenderAiCron = process.env.TENDER_AI_CRON?.trim() || "0 */3 * * *";
const tenderSourceCron = process.env.TENDER_SOURCE_CRON?.trim() || "15 18 * * *";
const deepSeekModel = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
const deepSeekStrategyModel = process.env.DEEPSEEK_STRATEGY_MODEL?.trim() || "deepseek-v4-flash";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    DEEPSEEK_MODEL: deepSeekModel,
    DEEPSEEK_STRATEGY_MODEL: deepSeekStrategyModel,
    TENDER_SOURCE_CRON: tenderSourceCron,
  },
  browser: { binding: "BROWSER" },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "sts-tender-intelligence-db",
          database_id: STS_D1_DATABASE_ID,
          migrations_dir: "../../drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
  ...(tenderAiQueueName
    ? {
        queues: {
          producers: [{ binding: "TENDER_AI_QUEUE", queue: tenderAiQueueName }],
          consumers: [{
            queue: tenderAiQueueName,
            max_batch_size: 1,
            max_batch_timeout: 10,
            max_retries: 3,
            ...(tenderAiDeadLetterQueueName ? { dead_letter_queue: tenderAiDeadLetterQueueName } : {}),
          }],
        },
        triggers: { crons: [tenderAiCron, tenderSourceCron] },
      }
    : {}),
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
