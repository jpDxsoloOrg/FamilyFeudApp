/**
 * Where the API lives and the key that gets us in. sst.config.ts builds the
 * site with these set from the stack's own outputs. The API key is not a
 * secret — it ships in the bundle; the host token is what authorises anything.
 */
export interface ApiConfig {
  url: string;
  realtimeUrl: string;
  apiKey: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. sst.config.ts sets it on deploy; for local dev put it in packages/frontend/.env.local.`);
  }
  return value;
}

let override: ApiConfig | undefined;

/** Point the client somewhere else. Tests use this; nothing else should. */
export function setApiConfig(config: ApiConfig | undefined): void {
  override = config;
}

export function apiConfig(): ApiConfig {
  if (override) return override;
  const env = import.meta.env;
  const url = required("VITE_GRAPHQL_URL", env.VITE_GRAPHQL_URL);
  return {
    url,
    realtimeUrl:
      env.VITE_GRAPHQL_REALTIME_URL ??
      url.replace("appsync-api", "appsync-realtime-api").replace(/^http/, "ws"),
    apiKey: required("VITE_GRAPHQL_API_KEY", env.VITE_GRAPHQL_API_KEY),
  };
}
