"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Task {
  _id: string;
  title: string;
  status: "todo" | "upcoming" | "done";
  dueDate?: string;
  createdByUsername?: string;
  completedAt?: string;
  createdAt: string;
}

interface Relationship {
  name: string;
  label?: string;
  context?: string;
}

interface Person {
  _id: string;
  username?: string;
  firstName?: string;
  role?: string;
  context?: string;
  intentions: string[];
  relationships: Relationship[];
  email?: string;
  phone?: string;
  notes?: string;
  source: "telegram" | "manual";
  messageCount: number;
  lastSeen: string;
}

interface Job {
  _id: string;
  title: string;
  status: string;
  description: string;
}

interface CheckItem {
  _id: string;
  description: string;
  status: "pending" | "done" | "skipped";
  scheduledFor: string;
  context: string;
  triggeredByUsername?: string;
  result?: string;
  completedAt?: string;
  createdAt: string;
}

interface ActivityItem {
  _id: string;
  type: string;
  title: string;
  detail?: string;
  actor?: string;
  createdAt: string;
}

interface SpendEntry {
  type: string;
  label: string;
  tokens?: number;
  cost?: number;
  createdAt: string;
}

interface WatchSettings {
  deadlines: boolean;
  blockers: boolean;
  actionItems: boolean;
  sentiment: boolean;
  questions: boolean;
  followUps: boolean;
  newPeople: boolean;
  decisions: boolean;
}

interface DashboardData {
  chat: {
    telegramChatId: string;
    title: string;
    mode: string;
    aiStyle: string;
    guidance: string;
    lastSyncAt: string | null;
    watchSettings: WatchSettings;
    contextSummary: string;
    messageCount: number;
  };
  tasks: Task[];
  people: Person[];
  jobs: Job[];
  checks: CheckItem[];
  activities: ActivityItem[];
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

const WATCH_ITEMS: { key: keyof WatchSettings; label: string; desc: string }[] = [
  { key: "deadlines", label: "Deadlines", desc: "Flag dates, times, due dates" },
  { key: "blockers", label: "Blockers", desc: "Detect when someone is stuck" },
  { key: "actionItems", label: "Action Items", desc: "Catch commitments and promises" },
  { key: "sentiment", label: "Sentiment", desc: "Monitor mood and frustration" },
  { key: "questions", label: "Questions", desc: "Track unanswered questions" },
  { key: "followUps", label: "Follow-ups", desc: "Notice things needing revisit" },
  { key: "newPeople", label: "New People", desc: "Track new contacts mentioned" },
  { key: "decisions", label: "Decisions", desc: "Capture group decisions" },
];

export default function DashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dumpText, setDumpText] = useState("");
  const [dumpSending, setDumpSending] = useState(false);
  const [dumpSent, setDumpSent] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");
  const [guidanceSaving, setGuidanceSaving] = useState(false);
  const [guidanceSaved, setGuidanceSaved] = useState(false);

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

  useEffect(() => {
    if (data?.chat.guidance !== undefined && guidanceText === "" && !guidanceSaved) {
      setGuidanceText(data.chat.guidance);
    }
  }, [data, guidanceText, guidanceSaved]);

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

  async function toggleWatch(key: keyof WatchSettings) {
    if (!data) return;
    const newVal = !data.chat.watchSettings[key];
    setData((d) => d ? {
      ...d,
      chat: { ...d.chat, watchSettings: { ...d.chat.watchSettings, [key]: newVal } },
    } : d);
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, watchSettings: { [key]: newVal } }),
    });
  }

  async function syncNow() {
    setSyncing(true);
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "sync" }),
    });
    const result = await res.json();
    if (result.lastSyncAt) {
      setData((d) => d ? { ...d, chat: { ...d.chat, lastSyncAt: result.lastSyncAt } } : d);
    }
    await fetchData();
    setSyncing(false);
  }

  async function addContact() {
    if (!contactForm.name.trim()) return;
    setContactSaving(true);
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "addContact", contact: contactForm }),
    });
    setContactForm({ name: "", role: "", email: "", phone: "", notes: "" });
    setShowAddContact(false);
    setContactSaving(false);
    fetchData();
  }

  async function submitDump() {
    if (!dumpText.trim()) return;
    setDumpSending(true);
    setDumpSent(false);
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "dump", text: dumpText }),
    });
    setDumpText("");
    setDumpSending(false);
    setDumpSent(true);
    setTimeout(() => setDumpSent(false), 4000);
    fetchData();
  }

  async function saveGuidance() {
    setGuidanceSaving(true);
    setGuidanceSaved(false);
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "saveGuidance", guidance: guidanceText }),
    });
    setGuidanceSaving(false);
    setGuidanceSaved(true);
    setTimeout(() => setGuidanceSaved(false), 3000);
  }

  async function deleteContact(id: string) {
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "deleteContact", contact: { _id: id } }),
    });
    fetchData();
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  const todoTasks = data.tasks.filter((t) => t.status === "todo");
  const upcomingTasks = data.tasks.filter((t) => t.status === "upcoming");
  const doneTasks = data.tasks.filter((t) => t.status === "done");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-mono text-gray-400 mb-1">odoai dashboard</div>
            <h1 className="text-2xl font-bold text-gray-900">{data.chat.title}</h1>
            <div className="flex gap-3 mt-2 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${data.chat.mode === "active" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                {data.chat.mode === "active" ? "Active" : "Passive"}
              </span>
              <span className="text-gray-500">{data.chat.messageCount} messages observed</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <button
                onClick={syncNow}
                disabled={syncing}
                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                {syncing ? "Syncing..." : "Sync"}
              </button>
              {data.chat.lastSyncAt && (
                <div className="text-xs text-gray-400 mt-1">
                  Last sync {formatRelativeTime(data.chat.lastSyncAt)}
                </div>
              )}
            </div>
            <a
              href={`https://t.me/odoai_bot?start=open_${data.chat.telegramChatId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors px-4 py-2.5 rounded-lg text-sm font-medium shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.99-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" /></svg>
              Open Chat
            </a>
          </div>
        </div>

        {/* Watch List */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Watch List</h2>
          <p className="text-sm text-gray-500 mb-3">Toggle what odoai actively looks for in your conversations.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {WATCH_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => toggleWatch(item.key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  data.chat.watchSettings[item.key]
                    ? "border-green-400 bg-green-50 ring-1 ring-green-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900">{item.label}</span>
                  <span className={`w-2 h-2 rounded-full ${data.chat.watchSettings[item.key] ? "bg-green-500" : "bg-gray-300"}`} />
                </div>
                <div className="text-xs text-gray-500">{item.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Task Board */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Tasks</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TaskColumn title="Todo" emoji="📝" tasks={todoTasks} color="blue" />
            <TaskColumn title="Upcoming" emoji="📋" tasks={upcomingTasks} color="yellow" />
            <TaskColumn title="Done" emoji="✅" tasks={doneTasks} color="green" />
          </div>
        </section>

        {/* Calendar View */}
        <CalendarView tasks={data.tasks} checks={data.checks} />

        {/* Upcoming Checks */}
        {data.checks.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Scheduled Checks</h2>
            <div className="space-y-2">
              {data.checks.map((c) => {
                const isPending = c.status === "pending";
                const isFuture = new Date(c.scheduledFor) > new Date();
                return (
                  <div
                    key={c._id}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      isPending && isFuture
                        ? "border-amber-300 bg-amber-50"
                        : isPending
                          ? "border-orange-300 bg-orange-50"
                          : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <span className="text-lg mt-0.5">
                      {c.status === "done" ? "✅" : isFuture ? "⏳" : "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{c.description}</div>
                      {c.context && (
                        <div className="text-xs text-gray-500 mt-1 truncate">Context: {c.context}</div>
                      )}
                      {c.result && (
                        <div className="text-xs text-green-700 mt-1">{c.result}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-500">{formatRelativeTime(c.scheduledFor)}</div>
                      {c.triggeredByUsername && (
                        <div className="text-xs text-gray-400">@{c.triggeredByUsername}</div>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${
                          c.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : c.status === "done"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* Contacts & People */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Contacts</h2>
              <button
                onClick={() => setShowAddContact(!showAddContact)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAddContact ? "Cancel" : "+ Add Contact"}
              </button>
            </div>

            {showAddContact && (
              <div className="bg-white border border-blue-200 rounded-lg p-4 mb-4 shadow-sm">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    placeholder="Name *"
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <input
                    placeholder="Role"
                    value={contactForm.role}
                    onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <input
                    placeholder="Email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <input
                    placeholder="Phone"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <input
                  placeholder="Notes"
                  value={contactForm.notes}
                  onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  onClick={addContact}
                  disabled={contactSaving || !contactForm.name.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm"
                >
                  {contactSaving ? "Saving..." : "Add Contact"}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {data.people.length === 0 && (
                <p className="text-sm text-gray-400 italic">No people tracked yet.</p>
              )}
              {data.people.map((p) => (
                <div key={p._id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {p.username || p.firstName || "unknown"}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        p.source === "manual" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {p.source === "manual" ? "contact" : "telegram"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.messageCount > 0 && <span className="text-xs text-gray-400">{p.messageCount} msgs</span>}
                      {p.source === "manual" && (
                        <button onClick={() => deleteContact(p._id)} className="text-xs text-red-400 hover:text-red-600">remove</button>
                      )}
                    </div>
                  </div>
                  {p.role && <div className="text-xs text-blue-600 mb-1">{p.role}</div>}
                  {p.context && <div className="text-sm text-gray-500 mb-1">{p.context}</div>}
                  {(p.email || p.phone) && (
                    <div className="flex gap-3 text-xs text-gray-400 mb-1">
                      {p.email && <span>{p.email}</span>}
                      {p.phone && <span>{p.phone}</span>}
                    </div>
                  )}
                  {p.notes && <div className="text-xs text-gray-400 italic mb-1">{p.notes}</div>}
                  {p.intentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {p.intentions.map((intent, j) => (
                        <span key={j} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          {intent}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.relationships?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">Relationships</div>
                      <div className="space-y-1">
                        {p.relationships.map((r, j) => (
                          <div key={j} className="flex items-start gap-1.5 text-xs">
                            <span className="text-gray-400 shrink-0">🔗</span>
                            <div>
                              <span className="font-medium text-gray-700">{r.name}</span>
                              {r.label && <span className="text-blue-600 ml-1">[{r.label}]</span>}
                              {r.context && <span className="text-gray-500 ml-1">— {r.context}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Wallet Spend */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Wallet Spend</h2>
            <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{data.spend.totalCalls}</div>
                  <div className="text-xs text-gray-500">API Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{(data.spend.totalTokens / 1000).toFixed(1)}k</div>
                  <div className="text-xs text-gray-500">Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">${data.spend.totalCost.toFixed(4)}</div>
                  <div className="text-xs text-gray-500">Est. Cost</div>
                </div>
              </div>

              {Object.keys(data.spend.byType).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  {Object.entries(data.spend.byType).map(([type, stats]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-gray-500">{type}</span>
                      <span className="text-gray-700">{stats.calls} calls · {(stats.tokens / 1000).toFixed(1)}k tokens</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.recentSpends.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="text-xs uppercase tracking-wider text-gray-400 mb-3">Recent Activity</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {data.recentSpends.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 truncate mr-3">{s.label}</span>
                      <span className="text-gray-400 whitespace-nowrap">
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
          <h2 className="text-lg font-semibold mb-4 text-gray-800">AI Style</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {AI_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => setAiStyle(style.value)}
                disabled={saving}
                className={`p-3 rounded-lg border text-left transition-all ${
                  data.chat.aiStyle === style.value
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
                }`}
              >
                <div className="font-medium text-sm text-gray-900">{style.label}</div>
                <div className="text-xs text-gray-500 mt-1">{style.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Dump Info + Chat Guidance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <section>
            <h2 className="text-lg font-semibold mb-2 text-gray-800">Dump Info</h2>
            <p className="text-sm text-gray-500 mb-3">Paste notes, context, meeting transcripts, links — anything to get the AI up to speed.</p>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <textarea
                value={dumpText}
                onChange={(e) => setDumpText(e.target.value)}
                placeholder="Paste information here..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y mb-3"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={submitDump}
                  disabled={dumpSending || !dumpText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm"
                >
                  {dumpSending ? "Processing..." : "Submit Dump"}
                </button>
                {dumpSent && (
                  <span className="text-sm text-green-600 font-medium">Processed and indexed into memory</span>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-gray-800">Chat Guidance</h2>
            <p className="text-sm text-gray-500 mb-3">Custom instructions for how the AI should behave in this chat. It will follow these closely.</p>
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <textarea
                value={guidanceText}
                onChange={(e) => { setGuidanceText(e.target.value); setGuidanceSaved(false); }}
                placeholder="e.g. Always respond in Spanish. Focus on dev tasks. Don't mention competitor X..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y mb-3"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={saveGuidance}
                  disabled={guidanceSaving}
                  className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm"
                >
                  {guidanceSaving ? "Saving..." : "Save Guidance"}
                </button>
                {guidanceSaved && (
                  <span className="text-sm text-green-600 font-medium">Saved and indexed</span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Active Jobs */}
        {data.jobs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Jobs</h2>
            <div className="space-y-3">
              {data.jobs.map((j) => (
                <div key={j._id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${j.status === "active" ? "bg-green-500" : j.status === "paused" ? "bg-yellow-500" : "bg-gray-400"}`} />
                    <span className="font-medium text-sm text-gray-900">{j.title}</span>
                  </div>
                  {j.description && <p className="text-sm text-gray-500">{j.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Activity Feed */}
        {data.activities.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Activity Feed</h2>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {data.activities.map((a) => (
                <div key={a._id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-base mt-0.5">{activityIcon(a.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">{a.title}</span>
                      {a.detail && <span className="text-gray-500"> — {a.detail}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.actor && <span className="text-xs text-gray-400">@{a.actor}</span>}
                      <span className="text-xs text-gray-400">{formatRelativeTime(a.createdAt)}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${activityBadge(a.type)}`}>
                    {activityLabel(a.type)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Context Summary */}
        {data.chat.contextSummary && (
          <section>
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Context Summary</h2>
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{data.chat.contextSummary}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function activityIcon(type: string) {
  const icons: Record<string, string> = {
    task_added: "📝",
    task_upcoming: "📋",
    task_done: "✅",
    task_converted: "🎉",
    person_added: "👤",
    check_scheduled: "⏰",
    check_completed: "✔️",
    style_changed: "🎨",
    mode_changed: "🔄",
    dump: "📦",
  };
  return icons[type] || "•";
}

function activityLabel(type: string) {
  const labels: Record<string, string> = {
    task_added: "todo",
    task_upcoming: "upcoming",
    task_done: "done",
    task_converted: "completed",
    person_added: "contact",
    check_scheduled: "check",
    check_completed: "check done",
    style_changed: "style",
    mode_changed: "mode",
    dump: "dump",
  };
  return labels[type] || type;
}

function activityBadge(type: string) {
  const badges: Record<string, string> = {
    task_added: "bg-blue-100 text-blue-700",
    task_upcoming: "bg-yellow-100 text-yellow-700",
    task_done: "bg-green-100 text-green-700",
    task_converted: "bg-green-100 text-green-700",
    person_added: "bg-purple-100 text-purple-700",
    check_scheduled: "bg-amber-100 text-amber-700",
    check_completed: "bg-green-100 text-green-600",
    style_changed: "bg-pink-100 text-pink-700",
    mode_changed: "bg-indigo-100 text-indigo-700",
    dump: "bg-gray-100 text-gray-600",
  };
  return badges[type] || "bg-gray-100 text-gray-500";
}

function CalendarView({ tasks, checks }: { tasks: Task[]; checks: CheckItem[] }) {
  const [offset, setOffset] = useState(0);

  const today = new Date();
  const viewDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dayKey = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const tasksByDay: Record<string, Task[]> = {};
  const checksByDay: Record<string, CheckItem[]> = {};

  for (const t of tasks) {
    const date = t.dueDate || (t.status === "done" ? t.completedAt : undefined);
    if (!date) continue;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!tasksByDay[key]) tasksByDay[key] = [];
    tasksByDay[key].push(t);
  }

  for (const c of checks) {
    const d = new Date(c.scheduledFor);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!checksByDay[key]) checksByDay[key] = [];
    checksByDay[key].push(c);
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Calendar</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setOffset((o) => o - 1)} className="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-1 rounded hover:bg-gray-100">←</button>
          <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">{monthName}</span>
          <button onClick={() => setOffset((o) => o + 1)} className="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-1 rounded hover:bg-gray-100">→</button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-xs text-blue-600 hover:text-blue-700 ml-1">Today</button>
          )}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-xs font-medium text-gray-400 text-center py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[80px] border-b border-r border-gray-50" />;
            const key = dayKey(day);
            const isToday = key === todayKey;
            const dayTasks = tasksByDay[key] || [];
            const dayChecks = checksByDay[key] || [];
            const hasItems = dayTasks.length > 0 || dayChecks.length > 0;

            return (
              <div
                key={i}
                className={`min-h-[80px] border-b border-r border-gray-50 p-1.5 ${isToday ? "bg-blue-50" : hasItems ? "bg-gray-50/50" : ""}`}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? "text-blue-600" : "text-gray-400"}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t._id}
                      className={`text-xs truncate rounded px-1 py-0.5 ${
                        t.status === "done"
                          ? "bg-green-100 text-green-700"
                          : t.status === "todo"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayChecks.slice(0, 2).map((c) => (
                    <div
                      key={c._id}
                      className={`text-xs truncate rounded px-1 py-0.5 ${
                        c.status === "done"
                          ? "bg-green-50 text-green-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      ⏰ {c.description}
                    </div>
                  ))}
                  {(dayTasks.length > 3 || dayChecks.length > 2) && (
                    <div className="text-xs text-gray-400 px-1">
                      +{Math.max(0, dayTasks.length - 3) + Math.max(0, dayChecks.length - 2)} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs < 0;

  if (absDiff < 60000) return isPast ? "just now" : "in <1m";
  if (absDiff < 3600000) {
    const mins = Math.round(absDiff / 60000);
    return isPast ? `${mins}m ago` : `in ${mins}m`;
  }
  if (absDiff < 86400000) {
    const hrs = Math.round(absDiff / 3600000);
    return isPast ? `${hrs}h ago` : `in ${hrs}h`;
  }
  const days = Math.round(absDiff / 86400000);
  return isPast ? `${days}d ago` : `in ${days}d`;
}

function TaskColumn({ title, emoji, tasks, color }: { title: string; emoji: string; tasks: Task[]; color: string }) {
  const borderColors: Record<string, string> = { blue: "border-blue-200", yellow: "border-yellow-200", green: "border-green-200" };
  const bgColors: Record<string, string> = { blue: "bg-blue-50", yellow: "bg-yellow-50", green: "bg-green-50" };

  return (
    <div className={`rounded-xl border ${borderColors[color]} ${bgColors[color]} p-4`}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-gray-500">
        {emoji} {title} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t._id} className="bg-white rounded-lg p-3 text-sm shadow-sm border border-gray-100">
            <div className="font-medium text-gray-900">{t.title}</div>
            <div className="flex items-center gap-2 mt-1">
              {t.createdByUsername && <span className="text-xs text-gray-400">@{t.createdByUsername}</span>}
              <span className="text-xs text-gray-400">
                {t.completedAt
                  ? `done ${formatRelativeTime(t.completedAt)}`
                  : formatRelativeTime(t.createdAt)}
              </span>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-400 italic">No items</p>}
      </div>
    </div>
  );
}
