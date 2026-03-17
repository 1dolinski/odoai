import DataSnapshot from "@/models/DataSnapshot";
import { writeKnowledge } from "@/lib/knowledge";

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

export interface EnabledEndpoint {
  sourceId: string;
  endpointId: string;
}

export const DATA_SOURCE_REGISTRY: DataSourceDefinition[] = [
  {
    id: "boughtlook",
    name: "BoughtLook",
    baseUrl: "https://www.boughtlook.com",
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

export async function fetchEnabledEndpoints(
  enabled: EnabledEndpoint[]
): Promise<FetchedData[]> {
  const grouped = new Map<string, string[]>();
  for (const ep of enabled) {
    const list = grouped.get(ep.sourceId) || [];
    list.push(ep.endpointId);
    grouped.set(ep.sourceId, list);
  }

  const fetches: Promise<FetchedData>[] = [];
  for (const [sourceId, endpointIds] of grouped) {
    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === sourceId);
    if (!source) continue;
    for (const epId of endpointIds) {
      const ep = source.endpoints.find((e) => e.id === epId);
      if (ep) fetches.push(fetchEndpoint(source, ep));
    }
  }

  return Promise.all(fetches);
}

export async function persistSnapshots(
  chatId: string,
  results: FetchedData[]
): Promise<void> {
  const ops: Promise<unknown>[] = [];

  for (const r of results) {
    if (r.error || !r.data) continue;

    ops.push(
      DataSnapshot.create({
        telegramChatId: chatId,
        sourceId: r.sourceId,
        endpointId: r.endpointId,
        data: r.data,
        fetchedAt: r.fetchedAt,
      })
    );

    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === r.sourceId);
    const ep = source?.endpoints.find((e) => e.id === r.endpointId);
    const label = `${source?.name || r.sourceId} / ${ep?.id || r.endpointId}`;
    const dateStr = r.fetchedAt.toISOString().split("T")[0];
    const timeStr = r.fetchedAt.toISOString().split("T")[1]?.split(".")[0] || "";

    const summary = typeof r.data === "object" ? JSON.stringify(r.data, null, 2).substring(0, 4000) : String(r.data);
    ops.push(
      writeKnowledge(
        chatId,
        "context",
        `datasource-${r.sourceId}-${r.endpointId}-${Date.now()}`,
        `# Data Snapshot: ${label}\nFetched: ${dateStr} ${timeStr}\n\n${summary}`,
        { source: r.sourceId, endpoint: r.endpointId, fetchedAt: r.fetchedAt.toISOString() }
      ).catch(console.error)
    );
  }

  await Promise.all(ops);
}

export async function getSnapshotHistory(
  chatId: string,
  sourceId: string,
  endpointId: string,
  limit = 10
): Promise<{ data: Record<string, unknown>; fetchedAt: Date }[]> {
  const snapshots = await DataSnapshot.find({
    telegramChatId: chatId,
    sourceId,
    endpointId,
    error: { $exists: false },
  })
    .sort({ fetchedAt: -1 })
    .limit(limit)
    .lean();

  return snapshots.map((s) => ({
    data: (s as { data: Record<string, unknown> }).data,
    fetchedAt: (s as { fetchedAt: Date }).fetchedAt,
  }));
}

export async function buildTrendContext(
  chatId: string,
  enabledEndpoints: EnabledEndpoint[]
): Promise<string> {
  if (!enabledEndpoints.length) return "";

  const blocks: string[] = [];

  for (const ep of enabledEndpoints) {
    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === ep.sourceId);
    const endpoint = source?.endpoints.find((e) => e.id === ep.endpointId);
    if (!source || !endpoint) continue;

    const history = await getSnapshotHistory(chatId, ep.sourceId, ep.endpointId, 5);
    if (!history.length) continue;

    const label = `${source.name} → ${endpoint.id}`;
    const latest = history[0];
    const latestDate = new Date(latest.fetchedAt).toISOString().split("T")[0];

    let block = `[${label} — latest: ${latestDate}]\n${JSON.stringify(latest.data, null, 2)}`;

    if (history.length > 1) {
      block += `\n\nPrevious snapshots (${history.length - 1} older):`;
      for (const snap of history.slice(1)) {
        const snapDate = new Date(snap.fetchedAt).toISOString().split("T")[0];
        block += `\n--- ${snapDate} ---\n${JSON.stringify(snap.data, null, 2).substring(0, 2000)}`;
      }
    }

    blocks.push(block);
  }

  return blocks.length ? blocks.join("\n\n") : "";
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
