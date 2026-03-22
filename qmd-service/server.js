import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const PORT = parseInt(process.env.PORT || "8181");
const API_KEY = process.env.QMD_API_KEY || "";
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || "/data/knowledge";
const QMD_BIN = process.env.QMD_BIN || "qmd";

// Debounced re-indexing — batch writes before running qmd update + embed
let reindexTimer = null;
let reindexing = false;
const REINDEX_DELAY_MS = 10_000;

function scheduleReindex() {
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = setTimeout(runReindex, REINDEX_DELAY_MS);
}

async function runReindex() {
  if (reindexing) return;
  reindexing = true;
  try {
    console.log("[qmd] Reindexing...");
    await exec(QMD_BIN, ["update"]);
    await exec(QMD_BIN, ["embed"]);
    console.log("[qmd] Reindex complete");
  } catch (err) {
    console.error("[qmd] Reindex failed:", err.message);
  } finally {
    reindexing = false;
  }
}

function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9_\-/.]/g, "_").substring(0, 200);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function checkAuth(req, res) {
  if (!API_KEY) return true;
  const auth = req.headers["authorization"];
  if (auth === `Bearer ${API_KEY}`) return true;
  json(res, 401, { error: "unauthorized" });
  return false;
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      json(res, 200, { status: "ok", knowledgeDir: KNOWLEDGE_DIR });
      return;
    }

    // Ingest content — POST /ingest
    // { chatId, category, slug, content, metadata? }
    if (url.pathname === "/ingest" && req.method === "POST") {
      if (!checkAuth(req, res)) return;

      const body = JSON.parse(await readBody(req));
      const { chatId, category, slug, content, metadata } = body;

      if (!chatId || !category || !slug || !content) {
        json(res, 400, { error: "chatId, category, slug, content required" });
        return;
      }

      const dir = path.join(KNOWLEDGE_DIR, sanitize(chatId), sanitize(category));
      await ensureDir(dir);

      let frontmatter = "---\n";
      frontmatter += `chatId: "${chatId}"\n`;
      frontmatter += `category: "${category}"\n`;
      frontmatter += `date: "${new Date().toISOString()}"\n`;
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          frontmatter += `${k}: "${v}"\n`;
        }
      }
      frontmatter += "---\n\n";

      const filename = `${sanitize(slug)}.md`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, frontmatter + content, "utf-8");

      scheduleReindex();

      json(res, 201, {
        path: path.join(chatId, category, filename),
        indexed: false,
        message: "Written. Reindex scheduled.",
      });
      return;
    }

    // Search — POST /search
    // { query, collection?, limit? }
    if (url.pathname === "/search" && req.method === "POST") {
      if (!checkAuth(req, res)) return;

      const body = JSON.parse(await readBody(req));
      const { query, limit } = body;

      if (!query) {
        json(res, 400, { error: "query required" });
        return;
      }

      const args = ["search", query, "-n", String(limit || 8), "--json"];
      const { stdout } = await exec(QMD_BIN, args, { timeout: 12000 });
      const results = JSON.parse(stdout);
      json(res, 200, { results });
      return;
    }

    // Semantic search — POST /query
    // { query, collection?, limit? }
    if (url.pathname === "/query" && req.method === "POST") {
      if (!checkAuth(req, res)) return;

      const body = JSON.parse(await readBody(req));
      const { query, limit } = body;

      if (!query) {
        json(res, 400, { error: "query required" });
        return;
      }

      const args = ["query", query, "-n", String(limit || 8), "--json"];
      const { stdout } = await exec(QMD_BIN, args, { timeout: 12000 });
      const results = JSON.parse(stdout);
      json(res, 200, { results });
      return;
    }

    // Force reindex — POST /reindex
    if (url.pathname === "/reindex" && req.method === "POST") {
      if (!checkAuth(req, res)) return;
      await runReindex();
      json(res, 200, { ok: true });
      return;
    }

    // Status — GET /status
    if (url.pathname === "/status" && req.method === "GET") {
      try {
        const { stdout } = await exec(QMD_BIN, ["status"], { timeout: 5000 });
        json(res, 200, { status: stdout.trim() });
      } catch {
        json(res, 200, { status: "QMD not initialized yet" });
      }
      return;
    }

    // Proxy to QMD MCP — POST /mcp
    if (url.pathname === "/mcp" && req.method === "POST") {
      if (!checkAuth(req, res)) return;
      // Forward to QMD's own MCP HTTP if it's running
      try {
        const mcpRes = await fetch(`http://localhost:${PORT + 1}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: await readBody(req),
        });
        const data = await mcpRes.text();
        res.writeHead(mcpRes.status, { "Content-Type": "application/json" });
        res.end(data);
      } catch {
        json(res, 502, { error: "QMD MCP not available" });
      }
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("Request error:", err);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`QMD service listening on :${PORT}`);
  console.log(`Knowledge dir: ${KNOWLEDGE_DIR}`);

  // Run embedding 30s after startup so healthcheck passes first
  setTimeout(async () => {
    console.log("[qmd] Starting deferred embed (30s after boot)...");
    try {
      await exec(QMD_BIN, ["embed"], { timeout: 600000 });
      console.log("[qmd] Embedding complete — semantic search ready");
    } catch (err) {
      console.error("[qmd] Embed failed (will retry on next ingest):", err.message);
    }
  }, 30000);
});
