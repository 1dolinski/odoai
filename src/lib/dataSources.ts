export interface DataSourceEndpoint {
  id: string;
  path: string;
  method: "GET" | "POST";
  description: string;
  params?: Record<string, string>;
}

export interface DataSourceDefinition {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;
  authHeader: "Bearer" | "Basic" | "x-api-key";
  endpoints: DataSourceEndpoint[];
  description: string;
}

export interface FetchedData {
  sourceId: string;
  endpointId: string;
  data: unknown;
  fetchedAt: Date;
  error?: string;
}

export const DATA_SOURCE_REGISTRY: DataSourceDefinition[] = [
  {
    id: "boughtlook",
    name: "BoughtLook",
    baseUrl: "http://boughtlook.com",
    envKey: "BOUGHT_LOOK_API_KEY",
    authHeader: "Bearer",
    description: "E-commerce fashion platform — users, generations, finds, looklists, shares, engagement, revenue, cron health",
    endpoints: [
      {
        id: "stats",
        path: "/api/admin/stats",
        method: "GET",
        description: "Dashboard summary: users, generations, finds, looklists, shares, engagement, codes, revenue, cronHealth with trends and sparklines",
      },
      {
        id: "recent-activity",
        path: "/api/admin/recent-activity",
        method: "GET",
        description: "Chronological feed of all platform activity (users, generations, finds, purchases, etc.) with human-readable descriptions",
        params: { limit: "100", since: "" },
      },
    ],
  },
];

function getApiKey(envKey: string): string | null {
  return process.env[envKey] || null;
}

export async function fetchEndpoint(
  source: DataSourceDefinition,
  endpoint: DataSourceEndpoint,
  paramOverrides?: Record<string, string>
): Promise<FetchedData> {
  const apiKey = getApiKey(source.envKey);
  if (!apiKey) {
    return {
      sourceId: source.id,
      endpointId: endpoint.id,
      data: null,
      fetchedAt: new Date(),
      error: `Missing env var: ${source.envKey}`,
    };
  }

  const url = new URL(endpoint.path, source.baseUrl);
  const params = { ...endpoint.params, ...paramOverrides };
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {};
  if (source.authHeader === "Bearer") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (source.authHeader === "Basic") {
    headers["Authorization"] = `Basic ${apiKey}`;
  } else if (source.authHeader === "x-api-key") {
    headers["x-api-key"] = apiKey;
  }

  try {
    const res = await fetch(url.toString(), {
      method: endpoint.method,
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return {
        sourceId: source.id,
        endpointId: endpoint.id,
        data: null,
        fetchedAt: new Date(),
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    return { sourceId: source.id, endpointId: endpoint.id, data, fetchedAt: new Date() };
  } catch (err) {
    return {
      sourceId: source.id,
      endpointId: endpoint.id,
      data: null,
      fetchedAt: new Date(),
      error: String(err),
    };
  }
}

export async function fetchAllEndpoints(
  source: DataSourceDefinition
): Promise<FetchedData[]> {
  return Promise.all(source.endpoints.map((ep) => fetchEndpoint(source, ep)));
}

export async function fetchDataForChat(
  enabledSourceIds: string[]
): Promise<FetchedData[]> {
  const sources = DATA_SOURCE_REGISTRY.filter((s) => enabledSourceIds.includes(s.id));
  const results = await Promise.all(sources.map(fetchAllEndpoints));
  return results.flat();
}

export function formatDataForAI(results: FetchedData[]): string {
  if (!results.length) return "";

  const blocks: string[] = [];

  for (const r of results) {
    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === r.sourceId);
    const endpoint = source?.endpoints.find((e) => e.id === r.endpointId);
    const label = `${source?.name || r.sourceId} → ${endpoint?.description || r.endpointId}`;

    if (r.error) {
      blocks.push(`[${label}] Error: ${r.error}`);
      continue;
    }

    blocks.push(`[${label}]\n${JSON.stringify(r.data, null, 2)}`);
  }

  return blocks.join("\n\n");
}

export function getAvailableSources(): {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  endpoints: { id: string; description: string }[];
}[] {
  return DATA_SOURCE_REGISTRY.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    configured: !!getApiKey(s.envKey),
    endpoints: s.endpoints.map((e) => ({ id: e.id, description: e.description })),
  }));
}
