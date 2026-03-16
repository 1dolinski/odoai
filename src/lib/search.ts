import { createClient } from "apinow-sdk";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createClient({ privateKey: process.env.APINOW_PRIVATE_KEY as `0x${string}` });
  }
  return _client;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export async function webSearch(query: string, maxResults = 5): Promise<{ answer?: string; results: SearchResult[] }> {
  const apinow = getClient();

  const data = await apinow.call(
    "https://www.apinow.fun/api/endpoints/tavily/tavily_search",
    {
      method: "POST",
      body: {
        query,
        search_depth: "basic",
        max_results: String(maxResults),
        include_answer: "true",
        include_raw_content: "false",
        include_images: "false",
      },
    }
  );

  const parsed = typeof data === "string" ? JSON.parse(data) : data;

  return {
    answer: parsed.answer,
    results: (parsed.results || []).map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  };
}
