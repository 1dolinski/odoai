import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Activity from "@/models/Activity";
import Person from "@/models/Person";

const QMD_URL = process.env.QMD_URL || "";
const QMD_API_KEY = process.env.QMD_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

interface ServiceStatus {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  detail?: string;
}

async function checkMongo(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await connectDB();
    const count = await Chat.countDocuments();
    return { name: "MongoDB", status: "up", latencyMs: Date.now() - start, detail: `${count} chats` };
  } catch (e) {
    return { name: "MongoDB", status: "down", latencyMs: Date.now() - start, detail: String(e) };
  }
}

async function checkQMDHealth(): Promise<ServiceStatus> {
  if (!QMD_URL) return { name: "QMD", status: "down", latencyMs: 0, detail: "QMD_URL not configured" };
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    if (QMD_API_KEY) headers["Authorization"] = `Bearer ${QMD_API_KEY}`;
    const res = await fetch(`${QMD_URL}/health`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    return { name: "QMD Health", status: res.ok ? "up" : "down", latencyMs: Date.now() - start, detail: JSON.stringify(data) };
  } catch {
    return { name: "QMD Health", status: "down", latencyMs: Date.now() - start, detail: "timeout or unreachable" };
  }
}

async function checkQMDSearch(): Promise<ServiceStatus> {
  if (!QMD_URL) return { name: "QMD Search", status: "down", latencyMs: 0, detail: "not configured" };
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (QMD_API_KEY) headers["Authorization"] = `Bearer ${QMD_API_KEY}`;
    const res = await fetch(`${QMD_URL}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "test", limit: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { name: "QMD Search (BM25)", status: "down", latencyMs: Date.now() - start, detail: `HTTP ${res.status}` };
    const data = await res.json();
    const count = Array.isArray(data.results) ? data.results.length : 0;
    return { name: "QMD Search (BM25)", status: "up", latencyMs: Date.now() - start, detail: `${count} results` };
  } catch {
    return { name: "QMD Search (BM25)", status: "down", latencyMs: Date.now() - start, detail: "timeout" };
  }
}

async function checkQMDSemantic(): Promise<ServiceStatus> {
  if (!QMD_URL) return { name: "QMD Semantic", status: "down", latencyMs: 0, detail: "not configured" };
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (QMD_API_KEY) headers["Authorization"] = `Bearer ${QMD_API_KEY}`;
    const res = await fetch(`${QMD_URL}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "test", limit: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { name: "QMD Semantic (embeddings)", status: "degraded", latencyMs: Date.now() - start, detail: `HTTP ${res.status} — embeddings may not be ready` };
    const data = await res.json();
    const count = Array.isArray(data.results) ? data.results.length : 0;
    return { name: "QMD Semantic (embeddings)", status: "up", latencyMs: Date.now() - start, detail: `${count} results` };
  } catch {
    return { name: "QMD Semantic (embeddings)", status: "degraded", latencyMs: Date.now() - start, detail: "timeout — embeddings likely not generated yet" };
  }
}

async function checkOpenRouter(): Promise<ServiceStatus> {
  if (!OPENROUTER_API_KEY) return { name: "OpenRouter", status: "down", latencyMs: 0, detail: "API key not configured" };
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { name: "OpenRouter (LLM)", status: res.ok ? "up" : "down", latencyMs: Date.now() - start, detail: res.ok ? "connected" : `HTTP ${res.status}` };
  } catch {
    return { name: "OpenRouter (LLM)", status: "down", latencyMs: Date.now() - start, detail: "timeout" };
  }
}

async function getDataStats() {
  try {
    await connectDB();
    const [chats, tasks, people, activities] = await Promise.all([
      Chat.countDocuments(),
      Task.countDocuments(),
      Person.countDocuments(),
      Activity.countDocuments(),
    ]);
    return { chats, tasks, people, activities };
  } catch {
    return null;
  }
}

export async function GET() {
  const [mongo, qmdHealth, qmdSearch, qmdSemantic, openrouter, stats] = await Promise.all([
    checkMongo(),
    checkQMDHealth(),
    checkQMDSearch(),
    checkQMDSemantic(),
    checkOpenRouter(),
    getDataStats(),
  ]);

  const services = [mongo, qmdHealth, qmdSearch, qmdSemantic, openrouter];
  const allUp = services.every((s) => s.status === "up");
  const anyDown = services.some((s) => s.status === "down");

  return NextResponse.json({
    overall: anyDown ? "degraded" : allUp ? "healthy" : "partial",
    timestamp: new Date().toISOString(),
    services,
    data: stats,
  });
}
