declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & {
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_STRATEGY_MODEL?: string;
  };
}
