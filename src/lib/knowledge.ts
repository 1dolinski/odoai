const QMD_URL = process.env.QMD_URL || "http://localhost:8181";
const QMD_API_KEY = process.env.QMD_API_KEY || "";

// ---- QMD HTTP client ----

let qmdDown = false;
let qmdDownUntil = 0;

async function qmdFetch(path: string, body?: unknown) {
  // Circuit breaker: if QMD failed recently, skip for 60s
  if (qmdDown && Date.now() < qmdDownUntil) {
    throw new Error("QMD circuit open — skipping");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (QMD_API_KEY) headers["Authorization"] = `Bearer ${QMD_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${QMD_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QMD ${path} error ${res.status}: ${text}`);
    }

    qmdDown = false;
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    // Trip circuit breaker on timeout
    qmdDown = true;
    qmdDownUntil = Date.now() + 60000;
    if ((e as Error).name === "AbortError") throw new Error(`QMD ${path} timeout`);
    throw e;
  }
}

// ---- Ingest (push content to QMD service) ----

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 80);
}

export async function writeKnowledge(
  chatId: string,
  category: "dumps" | "context" | "people" | "tasks",
  slug: string,
  content: string,
  metadata?: Record<string, string>
) {
  return qmdFetch("/ingest", {
    chatId,
    category,
    slug: sanitize(slug),
    content,
    metadata,
  });
}

export async function writeDump(
  chatId: string,
  title: string,
  content: string,
  username?: string
) {
  const slug = `${Date.now()}-${sanitize(title)}`;
  return writeKnowledge(chatId, "dumps", slug, `# ${title}\n\n${content}`, {
    author: username || "unknown",
    title,
  });
}

export async function writeContextSummary(chatId: string, summary: string) {
  return writeKnowledge(chatId, "context", "latest-summary", `# Chat Context\n\n${summary}`);
}

export async function writePeopleSnapshot(
  chatId: string,
  people: Array<{
    username?: string;
    firstName?: string;
    telegramUserId: string;
    role?: string;
    context?: string;
    intentions?: string[];
  }>
) {
  let content = "# People in Chat\n\n";
  for (const p of people) {
    const name = p.username || p.firstName || p.telegramUserId;
    content += `## @${name}\n`;
    if (p.role) content += `**Role:** ${p.role}\n`;
    if (p.context) content += `**Context:** ${p.context}\n`;
    if (p.intentions?.length) content += `**Intentions:** ${p.intentions.join(", ")}\n`;
    content += "\n";
  }
  return writeKnowledge(chatId, "people", "snapshot", content);
}

export async function writePersonKnowledge(
  chatId: string,
  personName: string,
  content: string,
  metadata?: Record<string, string>
) {
  const slug = `${sanitize(personName)}-${Date.now()}`;
  return writeKnowledge(chatId, "people", slug, `# ${personName}\n\n${content}`, {
    person: personName,
    ...metadata,
  });
}

export async function writeTasksSnapshot(
  chatId: string,
  tasks: Array<{ title: string; status: string; createdByUsername?: string }>
) {
  let content = "# Tasks\n\n";
  const grouped = { todo: [] as string[], upcoming: [] as string[], done: [] as string[] };
  for (const t of tasks) {
    const key = t.status as keyof typeof grouped;
    if (grouped[key]) {
      grouped[key].push(`- ${t.title}${t.createdByUsername ? ` (@${t.createdByUsername})` : ""}`);
    }
  }
  if (grouped.todo.length) content += `## Todo\n${grouped.todo.join("\n")}\n\n`;
  if (grouped.upcoming.length) content += `## Upcoming\n${grouped.upcoming.join("\n")}\n\n`;
  if (grouped.done.length) content += `## Done\n${grouped.done.join("\n")}\n\n`;
  return writeKnowledge(chatId, "tasks", "snapshot", content);
}

// ---- Search ----

export interface QMDResult {
  title: string;
  displayPath: string;
  snippet: string;
  score: number;
  context?: string;
}

export async function qmdTextSearch(query: string, limit = 8): Promise<QMDResult[]> {
  try {
    const data = await qmdFetch("/search", { query, limit });
    const results = data.results || data || [];
    if (!Array.isArray(results)) return [];
    return results.map((r: Record<string, unknown>) => ({
      title: (r.title as string) || "",
      displayPath: (r.displayPath as string) || (r.path as string) || "",
      snippet: (r.snippet as string) || (r.content as string) || "",
      score: typeof r.score === "number" ? r.score : 0.5,
      context: r.context as string | undefined,
    }));
  } catch {
    return [];
  }
}

export async function qmdSearch(query: string, limit = 8): Promise<QMDResult[]> {
  try {
    const data = await qmdFetch("/query", { query, limit });

    // QMD --json returns an array of result objects
    const results = data.results || data || [];
    if (!Array.isArray(results)) return [];

    return results.map((r: Record<string, unknown>) => ({
      title: (r.title as string) || "",
      displayPath: (r.displayPath as string) || (r.path as string) || "",
      snippet: (r.snippet as string) || (r.content as string) || "",
      score: typeof r.score === "number" ? r.score : 0.5,
      context: r.context as string | undefined,
    }));
  } catch {
    return [];
  }
}

export async function qmdStatus(): Promise<string> {
  try {
    const data = await qmdFetch("/status");
    return data.status || "QMD connected";
  } catch {
    return "QMD not connected";
  }
}

export function formatQMDResults(results: QMDResult[]): string {
  if (!results.length) return "No relevant knowledge found.";

  return results
    .map((r, i) => {
      let line = `${i + 1}. *${r.title}* (${Math.round(r.score * 100)}%)`;
      if (r.snippet) line += `\n   ${r.snippet.substring(0, 200)}`;
      return line;
    })
    .join("\n\n");
}
