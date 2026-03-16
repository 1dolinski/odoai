"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Task {
  _id: string;
  title: string;
  status: "todo" | "upcoming" | "done";
  createdByUsername?: string;
  createdAt: string;
}

interface Person {
  username?: string;
  firstName?: string;
  role?: string;
  context?: string;
  intentions: string[];
  messageCount: number;
  lastSeen: string;
}

interface Job {
  _id: string;
  title: string;
  status: string;
  description: string;
}

interface SpendEntry {
  type: string;
  label: string;
  tokens?: number;
  cost?: number;
  createdAt: string;
}

interface DashboardData {
  chat: {
    telegramChatId: string;
    title: string;
    mode: string;
    aiStyle: string;
    contextSummary: string;
    messageCount: number;
  };
  tasks: Task[];
  people: Person[];
  jobs: Job[];
  spend: {
    totalCalls: number;
    totalTokens: number;
    totalCost: number;
    byType: Record<string, { calls: number; tokens: number; cost: number }>;
  };
  recentSpends: SpendEntry[];
}

type AiStyle = "concise" | "detailed" | "casual" | "professional" | "technical";

const AI_STYLES: { value: AiStyle; label: string; desc: string }[] = [
  { value: "concise", label: "Concise", desc: "Short, direct answers" },
  { value: "detailed", label: "Detailed", desc: "Thorough explanations" },
  { value: "casual", label: "Casual", desc: "Friendly, informal tone" },
  { value: "professional", label: "Professional", desc: "Formal, business tone" },
  { value: "technical", label: "Technical", desc: "Dev-focused, code-heavy" },
];

export default function DashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/dashboard?token=${token}`);
    if (!res.ok) {
      setError("Invalid or expired dashboard link.");
      return;
    }
    setData(await res.json());
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function setAiStyle(style: AiStyle) {
    setSaving(true);
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, aiStyle: style }),
    });
    setData((d) => d ? { ...d, chat: { ...d.chat, aiStyle: style } } : d);
    setSaving(false);
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const todoTasks = data.tasks.filter((t) => t.status === "todo");
  const upcomingTasks = data.tasks.filter((t) => t.status === "upcoming");
  const doneTasks = data.tasks.filter((t) => t.status === "done");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-mono text-gray-500 mb-1">odoai dashboard</div>
            <h1 className="text-2xl font-bold">{data.chat.title}</h1>
            <div className="flex gap-3 mt-2 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${data.chat.mode === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"}`}>
                {data.chat.mode === "active" ? "Active" : "Passive"}
              </span>
              <span className="text-gray-500">{data.chat.messageCount} messages observed</span>
            </div>
          </div>
          <a
            href={`https://t.me/odoai_bot?start=open_${data.chat.telegramChatId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.99-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" /></svg>
            Open Chat
          </a>
        </div>

        {/* Task Board */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Tasks</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TaskColumn title="Todo" emoji="📝" tasks={todoTasks} color="blue" />
            <TaskColumn title="Upcoming" emoji="📋" tasks={upcomingTasks} color="yellow" />
            <TaskColumn title="Done" emoji="✅" tasks={doneTasks} color="green" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* People & Intents */}
          <section>
            <h2 className="text-lg font-semibold mb-4">People & Intents</h2>
            <div className="space-y-3">
              {data.people.length === 0 && (
                <p className="text-sm text-gray-600 italic">No people tracked yet.</p>
              )}
              {data.people.map((p, i) => (
                <div key={i} className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">@{p.username || p.firstName || "unknown"}</span>
                    <span className="text-xs text-gray-500">{p.messageCount} msgs</span>
                  </div>
                  {p.role && <div className="text-xs text-blue-400 mb-1">{p.role}</div>}
                  {p.context && <div className="text-sm text-gray-400 mb-2">{p.context}</div>}
                  {p.intentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.intentions.map((intent, j) => (
                        <span key={j} className="text-xs bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded-full">
                          {intent}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Wallet Spend */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Wallet Spend</h2>
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-5 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{data.spend.totalCalls}</div>
                  <div className="text-xs text-gray-500">API Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{(data.spend.totalTokens / 1000).toFixed(1)}k</div>
                  <div className="text-xs text-gray-500">Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">${data.spend.totalCost.toFixed(4)}</div>
                  <div className="text-xs text-gray-500">Est. Cost</div>
                </div>
              </div>

              {Object.keys(data.spend.byType).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2">
                  {Object.entries(data.spend.byType).map(([type, stats]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-gray-400">{type}</span>
                      <span className="text-gray-300">{stats.calls} calls · {(stats.tokens / 1000).toFixed(1)}k tokens</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.recentSpends.length > 0 && (
              <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-4">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">Recent Activity</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {data.recentSpends.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-3">{s.label}</span>
                      <span className="text-gray-500 whitespace-nowrap">
                        {s.tokens ? `${s.tokens} tok` : s.type}
                        {" · "}
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* AI Style Toggle */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">AI Style</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {AI_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => setAiStyle(style.value)}
                disabled={saving}
                className={`p-3 rounded-lg border text-left transition-all ${
                  data.chat.aiStyle === style.value
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30"
                    : "border-gray-700/50 bg-gray-800/30 hover:border-gray-600"
                }`}
              >
                <div className="font-medium text-sm">{style.label}</div>
                <div className="text-xs text-gray-500 mt-1">{style.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Active Jobs */}
        {data.jobs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Jobs</h2>
            <div className="space-y-3">
              {data.jobs.map((j) => (
                <div key={j._id} className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${j.status === "active" ? "bg-green-400" : j.status === "paused" ? "bg-yellow-400" : "bg-gray-500"}`} />
                    <span className="font-medium text-sm">{j.title}</span>
                  </div>
                  {j.description && <p className="text-sm text-gray-400">{j.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Context Summary */}
        {data.chat.contextSummary && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Context Summary</h2>
            <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-5">
              <div className="text-sm text-gray-300 whitespace-pre-wrap">{data.chat.contextSummary}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TaskColumn({ title, emoji, tasks, color }: { title: string; emoji: string; tasks: Task[]; color: string }) {
  const borderColors: Record<string, string> = { blue: "border-blue-500/30", yellow: "border-yellow-500/30", green: "border-green-500/30" };
  const bgColors: Record<string, string> = { blue: "bg-blue-500/5", yellow: "bg-yellow-500/5", green: "bg-green-500/5" };

  return (
    <div className={`rounded-xl border ${borderColors[color]} ${bgColors[color]} p-4`}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-gray-400">
        {emoji} {title} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t._id} className="bg-gray-800/60 rounded-lg p-3 text-sm">
            <div className="font-medium">{t.title}</div>
            {t.createdByUsername && <div className="text-xs text-gray-500 mt-1">@{t.createdByUsername}</div>}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-600 italic">No items</p>}
      </div>
    </div>
  );
}
