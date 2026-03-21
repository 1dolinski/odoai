"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { parseISO, format } from "date-fns";

interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

interface TitleChange {
  from: string;
  to: string;
  at: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: "todo" | "upcoming" | "done";
  categories?: string[];
  dueDate?: string;
  people?: string[];
  initiative?: string;
  subtasks?: Subtask[];
  titleHistory?: TitleChange[];
  createdByUsername?: string;
  completedAt?: string;
  momentum?: "new" | "in-motion" | "stalled" | "blocked";
  effort?: "low" | "medium" | "high";
  impact?: "low" | "medium" | "high";
  executionType?: "automated" | "human" | "hybrid";
  costEstimate?: string;
  revenueEstimate?: string;
  blockedBy?: string;
  waitingOn?: string;
  priorityScore?: number;
  priorityReason?: string;
  createdAt: string;
}

function offerRelatedTasks(offer: { id: string; name: string }, tasks: Task[]): Task[] {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "offer", "based", "data"]);
  const words = offer.name
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  if (!words.length) return [];
  return tasks
    .filter((t) => {
      const hay = `${t.title} ${t.description || ""}`.toLowerCase();
      return words.some((w) => hay.includes(w));
    })
    .slice(0, 6);
}

function truncateTaskTitle(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

interface Initiative {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
}

interface Relationship {
  name: string;
  label?: string;
  context?: string;
}

interface DumpEntry {
  _id?: string;
  text: string;
  source: string;
  category?: string;
  subject?: string;
  createdAt: string;
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
  dumps?: DumpEntry[];
  resources?: string;
  access?: string;
  avatarUrl?: string;
  source: "telegram" | "manual";
  personType: "member" | "contact";
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
  opportunities: boolean;
}

interface DashboardData {
  chat: {
    telegramChatId: string;
    title: string;
    mode: string;
    aiModel: string;
    aiStyle: string;
    guidance: string;
    abilities: string;
    dumps: DumpEntry[];
    lastSyncAt: string | null;
    lastReviewedAt: string | null;
    aiFeedEnabled: boolean;
    aiFeed: { _id: string; type: string; content: string; status?: string; createdAt: string }[];
    aiQuestions: { id: string; category: string; question: string; answer: string; skipped: boolean; answeredAt: string | null; createdAt: string }[];
    menu: { id: string; name: string; description: string; price: string; category: string; aiSuggestions: string; targetBuyers: string; createdAt: string }[];
    watchSettings: WatchSettings;
    contextSummary: string;
    priorityNarrative: string;
    leveragePlay: string;
    lastPrioritizedAt: string | null;
    offers: {
      id: string; name: string; description: string; pricePoint: string;
      targetBuyer: string; whyNow: string; deliveryMethod: string;
      costToDeliver: string; revenueEstimate: string;
      confidenceScore: number; confidenceReason: string;       validationNotes: string;
      meatAndPotatoes: string[];
      teamLeverage: string[];
      standoutActions: string[];
      creativePlays: string[];
      chatSignals: string[];
      teamPing: string;
      status: "hypothesis" | "validating" | "validated" | "rejected" | "live";
      iteration: number; createdAt: string; updatedAt: string;
    }[];
    offerIteration: number;
    offerResearchLog: {
      id: string; iteration: number; action: string; result: string;
      conversationCadence: string[];
      keptOffers: string[]; discardedOffers: string[]; newOffers: string[];
      createdAt: string;
    }[];
    messageCount: number;
    dataSources: { sourceId: string; endpointId: string; enabled: boolean; lastFetchAt?: string }[];
  };
  initiatives: Initiative[];
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
  walletAddress: string;
  availableDataSources: { id: string; name: string; description: string; configured: boolean; endpoints: { id: string; description: string }[] }[];
  socialPlatforms: { id: string; label: string; endpointCount: number }[];
  socialConfigured: boolean;
}

type AiStyle = "concise" | "detailed" | "casual" | "professional" | "technical";

/** How many execution lines show before "Show more" on offer cards. */
const OFFER_EXECUTION_PREVIEW = 3;

const AI_STYLES: { value: AiStyle; label: string; desc: string }[] = [
  { value: "concise", label: "Concise", desc: "Short, direct answers" },
  { value: "detailed", label: "Detailed", desc: "Thorough explanations" },
  { value: "casual", label: "Casual", desc: "Friendly, informal tone" },
  { value: "professional", label: "Professional", desc: "Formal, business tone" },
  { value: "technical", label: "Technical", desc: "Dev-focused, code-heavy" },
];

const AI_MODELS: { value: string; label: string; pricing: string }[] = [
  { value: "moonshotai/kimi-k2.5", label: "Kimi K2.5", pricing: "$0.14/M" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", pricing: "$0.15/M" },
  { value: "openai/gpt-4o", label: "GPT-4o", pricing: "$2.50/M" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", pricing: "$3/M" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", pricing: "$0.15/M" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", pricing: "$1.25/M" },
  { value: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", pricing: "$0.14/M" },
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", pricing: "$0.20/M" },
  { value: "x-ai/grok-3-mini", label: "Grok 3 Mini", pricing: "$0.30/M" },
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
  { key: "opportunities", label: "Opportunities", desc: "Spot ways to be better, faster, cheaper" },
];

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function renderJsonWithLinks(obj: unknown): React.ReactNode {
  const json = JSON.stringify(obj, null, 2);
  const urlRe = /https?:\/\/[^\s"',\]]+/g;
  const shortcodeRe = /"shortcode"\s*:\s*"([A-Za-z0-9_-]+)"/g;
  const parts: (string | React.ReactNode)[] = [];
  let last = 0;
  const allMatches: { index: number; length: number; node: React.ReactNode }[] = [];

  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(json)) !== null) {
    const href = m[0].replace(/[)\]}]+$/, "");
    allMatches.push({ index: m.index, length: m[0].length, node: <a key={`u${m.index}`} href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{m[0]}</a> });
  }
  while ((m = shortcodeRe.exec(json)) !== null) {
    const code = m[1];
    const overlap = allMatches.some((a) => m!.index < a.index + a.length && m!.index + m![0].length > a.index);
    if (!overlap) {
      const display = m[0];
      const igUrl = `https://www.instagram.com/p/${code}/`;
      allMatches.push({ index: m.index, length: m[0].length, node: <span key={`s${m.index}`}>&quot;shortcode&quot;: &quot;<a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{code}</a>&quot;</span> });
    }
  }
  allMatches.sort((a, b) => a.index - b.index);
  for (const match of allMatches) {
    if (match.index > last) parts.push(json.slice(last, match.index));
    parts.push(match.node);
    last = match.index + match.length;
  }
  if (last < json.length) parts.push(json.slice(last));
  return <>{parts}</>;
}

export default function DashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dumpText, setDumpText] = useState("");
  const [dumpCategory, setDumpCategory] = useState("general");
  const [dumpSubject, setDumpSubject] = useState("");
  const [dumpSending, setDumpSending] = useState(false);
  const [dumpSent, setDumpSent] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");
  const [guidanceSaving, setGuidanceSaving] = useState(false);
  const [guidanceSaved, setGuidanceSaved] = useState(false);
  const [taskFilters, setTaskFilters] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("taskFilters");
      if (cached) try { return new Set(JSON.parse(cached)); } catch {}
    }
    return new Set(["todo", "upcoming", "done"]);
  });
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [categorizing, setCategorizing] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<"list" | "categories" | "priorities">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("taskViewMode");
      if (cached === "list" || cached === "categories" || cached === "priorities") return cached;
    }
    return "list";
  });
  const [prioritizing, setPrioritizing] = useState(false);
  const [researchingOffers, setResearchingOffers] = useState(false);
  const [offerCopyFlash, setOfferCopyFlash] = useState<string | null>(null);
  const [offerExecutionExpanded, setOfferExecutionExpanded] = useState<Record<string, boolean>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [syncingMembers, setSyncingMembers] = useState(false);
  const [personDumpId, setPersonDumpId] = useState<string | null>(null);
  const [personDumpText, setPersonDumpText] = useState("");
  const [personDumpSending, setPersonDumpSending] = useState(false);
  const [editingDump, setEditingDump] = useState<{ type: "person" | "chat"; id: string; index: number; personId?: string; text: string } | null>(null);
  const [taskSuggestions, setTaskSuggestions] = useState<Record<string, string[]>>({});
  const [suggestingTaskId, setSuggestingTaskId] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showWatch, setShowWatch] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showDump, setShowDump] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showInitiatives, setShowInitiatives] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [showAbilities, setShowAbilities] = useState(false);
  const [showDataSources, setShowDataSources] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [showAiQuestions, setShowAiQuestions] = useState(false);
  const [aiQGenerating, setAiQGenerating] = useState(false);
  const [aiQDrafts, setAiQDrafts] = useState<Record<string, string>>({});
  const [aiQSaving, setAiQSaving] = useState<string | null>(null);
  const [aiQFilter, setAiQFilter] = useState<string>("all");
  const [aiQShowCompleted, setAiQShowCompleted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [menuForm, setMenuForm] = useState({ name: "", description: "", price: "", category: "general" });
  const [menuAdding, setMenuAdding] = useState(false);
  const [menuEditing, setMenuEditing] = useState<string | null>(null);
  const [menuEditDraft, setMenuEditDraft] = useState<{ name: string; description: string; price: string; category: string }>({ name: "", description: "", price: "", category: "" });
  const [menuAiLoading, setMenuAiLoading] = useState<string | null>(null);
  const [menuAudit, setMenuAudit] = useState<string | null>(null);
  const [menuAuditing, setMenuAuditing] = useState(false);
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialEndpoint, setSocialEndpoint] = useState("");
  const [socialEndpoints, setSocialEndpoints] = useState<{ id: string; path: string; description: string; dependsOn?: string; params: { name: string; required: boolean; description: string; default?: string }[] }[]>([]);
  const [socialParams, setSocialParams] = useState<Record<string, string>>({});
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialResult, setSocialResult] = useState<{ data: Record<string, unknown> | null; cost: string; error?: string; jobToken?: string; pollStatus?: string; snapshotId?: string } | null>(null);
  const [pollLoading, setPollLoading] = useState(false);
  const [socialHistory, setSocialHistory] = useState<{ data: Record<string, unknown>; fetchedAt: string }[]>([]);
  const [socialSnapshots, setSocialSnapshots] = useState<{ sourceId: string; endpointId: string; count: number; latest: string; pollStatus?: string; params?: Record<string, string> }[]>([]);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsInsights, setDsInsights] = useState<string | null>(null);
  const [dsFetchedData, setDsFetchedData] = useState<{ sourceId: string; endpointId: string; data: Record<string, unknown> | null; error?: string }[] | null>(null);
  const [dsSnapCounts, setDsSnapCounts] = useState<{ sourceId: string; endpointId: string; count: number; latest: string }[]>([]);
  const [expandedSnap, setExpandedSnap] = useState<string | null>(null);
  const [expandedSnapData, setExpandedSnapData] = useState<Record<string, { data: Record<string, unknown>; fetchedAt: string }[] | null>>({});
  const [expandedSnapLoading, setExpandedSnapLoading] = useState<string | null>(null);
  const [pendingJobs, setPendingJobs] = useState<{ id: string; sourceId: string; endpointId: string; platform: string; jobToken: string; pollStatus: string; cost: string; params: Record<string, string>; fetchedAt: string }[]>([]);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [abilitiesDraft, setAbilitiesDraft] = useState("");
  const [abilitiesSaving, setAbilitiesSaving] = useState(false);
  const [generatingSubtasks, setGeneratingSubtasks] = useState<string | null>(null);
  const [newSubtaskText, setNewSubtaskText] = useState<Record<string, string>>({});
  const [feedGenerating, setFeedGenerating] = useState(false);
  const [askAIInput, setAskAIInput] = useState("");
  const [askAILoading, setAskAILoading] = useState(false);
  const [askAIResult, setAskAIResult] = useState<{ answer: string; suggestions: { title: string; type: string; detail: string }[]; sourcesUsed: number } | null>(null);
  const [feedQuestion, setFeedQuestion] = useState<{ index: number; text: string } | null>(null);
  const [feedQuestionLoading, setFeedQuestionLoading] = useState(false);
  const [feedAnswers, setFeedAnswers] = useState<Record<number, string>>({});
  const [focusedFeedIdx, setFocusedFeedIdx] = useState<number>(-1);
  const [newInitName, setNewInitName] = useState("");
  const [newInitDesc, setNewInitDesc] = useState("");
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState<{ id: string; draft: string } | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ type: "todo" as string, title: "", dueDate: "", personName: "", personRole: "", statusTaskSearch: "", statusNewStatus: "done" as string, dumpText: "", dumpCategory: "general", dumpSubject: "", taskPeople: [] as string[], taskInitiative: "" });
  const [actionSaving, setActionSaving] = useState(false);
  const [actionDone, setActionDone] = useState("");

  const [showWorkMode, setShowWorkMode] = useState(false);
  const [workModePersonId, setWorkModePersonId] = useState<string>("");
  const [workModeLoading, setWorkModeLoading] = useState(false);
  const [workModeData, setWorkModeData] = useState<{
    story: string;
    suggestedTaskIds: string[];
    ideationPrompt: string;
    businessContext: string;
    teamUpdates: string[];
    immediateValue: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/dashboard?token=${token}`);
    if (!res.ok) {
      setError("Invalid or expired dashboard link.");
      return;
    }
    setData(await res.json());
  }, [token]);

  /** Creates a todo tied to an offer (same pipeline as Quick Actions → add task). */
  const addOfferResearchTask = useCallback(
    async (offerName: string, offerId: string, shortLabel: string, detail: string) => {
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "addTask",
          task: {
            title: truncateTaskTitle(`[Offer] ${offerName} — ${shortLabel}`, 120),
            status: "todo",
            description: `Offer research · id: ${offerId}\n\n${detail}`,
          },
        }),
      });
      fetchData();
    },
    [token, fetchData]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (data?.chat.guidance !== undefined && guidanceText === "" && !guidanceSaved) {
      setGuidanceText(data.chat.guidance);
    }
  }, [data, guidanceText, guidanceSaved]);

  useEffect(() => {
    if (data?.chat.abilities !== undefined && abilitiesDraft === "" && !abilitiesSaving) {
      setAbilitiesDraft(data.chat.abilities);
    }
  }, [data, abilitiesDraft, abilitiesSaving]);

  useEffect(() => {
    if (showDataSources && token) {
      fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "getSnapshotCounts" }),
      })
        .then((r) => r.json())
        .then((j) => setDsSnapCounts(j.counts || []))
        .catch(() => {});
    }
  }, [showDataSources, token]);

  const refreshSocialSnapshots = () => {
    if (token) {
      fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "getSocialSnapshots" }),
      })
        .then((r) => r.json())
        .then((j) => setSocialSnapshots(j.snapshots || []))
        .catch(() => {});
    }
  };

  const refreshPendingJobs = () => {
    if (token) {
      fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "getPendingJobs" }),
      })
        .then((r) => r.json())
        .then((j) => setPendingJobs(j.jobs || []))
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (showSocial && token) {
      refreshSocialSnapshots();
      refreshPendingJobs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSocial, token]);

  useEffect(() => {
    if (showFeed && token) {
      refreshSocialSnapshots();
      fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "getSnapshotCounts" }),
      })
        .then((r) => r.json())
        .then((j) => setDsSnapCounts(j.counts || []))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFeed, token]);

  const visibleFeedIndices = data ? data.chat.aiFeed.map((f, i) => ({ i, status: f.status })).filter((x) => x.status !== "seen" && x.status !== "actioned").map((x) => x.i) : [];

  const feedAction = useCallback(async (action: "seen" | "todo" | "ask" | "done" | "doneCtx") => {
    if (!data || focusedFeedIdx < 0) return;
    const pos = focusedFeedIndices();
    if (pos === -1) return;
    const i = visibleFeedIndices[pos >= 0 ? pos : 0];
    if (i === undefined) return;
    const item = data.chat.aiFeed[i];
    if (!item) return;

    const fid = item._id;
    if (action === "seen") {
      setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === fid ? { ...f, status: "seen" } : f) } } : d);
      fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: fid, status: "seen" }) });
    } else if (action === "todo") {
      setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === fid ? { ...f, status: "actioned" } : f) } } : d);
      await Promise.all([
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addTask", task: { title: item.content, status: "todo", description: `Source: AI feed (${item.type})`, createdByUsername: "odoai" } }) }),
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: fid, status: "actioned" }) }),
      ]);
      fetchData();
    } else if (action === "ask") {
      setFeedQuestion((prev) => prev?.index === i ? null : { index: i, text: "" });
    } else if (action === "done") {
      setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === fid ? { ...f, status: "actioned" } : f) } } : d);
      fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: fid, status: "actioned" }) });
    } else if (action === "doneCtx") {
      const ctx = prompt("What happened? Add context:");
      if (ctx !== null && ctx.trim()) {
        setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === fid ? { ...f, status: "actioned" } : f) } } : d);
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: fid, status: "actioned" }) });
        fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedDoneWithContext", feedContent: item.content, feedType: item.type, context: ctx.trim() }) });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, focusedFeedIdx, token]);

  function focusedFeedIndices() {
    if (focusedFeedIdx < 0 || focusedFeedIdx >= visibleFeedIndices.length) return -1;
    return focusedFeedIdx;
  }

  useEffect(() => {
    function handleFeedKeys(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (visibleFeedIndices.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusedFeedIdx((p) => Math.min(p + 1, visibleFeedIndices.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusedFeedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === "s" || e.key === "S") {
        feedAction("seen");
      } else if (e.key === "t" || e.key === "T") {
        feedAction("todo");
      } else if (e.key === "a" || e.key === "A") {
        feedAction("ask");
      } else if (e.key === "d" || e.key === "D") {
        feedAction("done");
      } else if (e.key === "c" || e.key === "C") {
        feedAction("doneCtx");
      }
    }
    window.addEventListener("keydown", handleFeedKeys);
    return () => window.removeEventListener("keydown", handleFeedKeys);
  }, [visibleFeedIndices, feedAction]);

  async function setMode(newMode: string) {
    setData((d) => d ? { ...d, chat: { ...d.chat, mode: newMode } } : d);
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, mode: newMode }),
    });
  }

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

  async function setAiModel(model: string) {
    setData((d) => d ? { ...d, chat: { ...d.chat, aiModel: model } } : d);
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, aiModel: model }),
    });
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
      body: JSON.stringify({ token, action: "dump", text: dumpText, category: dumpCategory, subject: dumpSubject }),
    });
    setDumpText("");
    setDumpSubject("");
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

  async function changeTaskStatus(taskId: string, taskTitle: string, newStatus: string) {
    if (newStatus === "delete") {
      setData((d) => {
        if (!d) return d;
        return { ...d, tasks: d.tasks.filter((t) => t._id !== taskId) };
      });
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "deleteTask", taskId }),
      });
      return;
    }
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        tasks: d.tasks.map((t) =>
          t._id === taskId
            ? { ...t, status: newStatus as Task["status"], completedAt: newStatus === "done" ? new Date().toISOString() : undefined }
            : t
        ),
      };
    });
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "updateTaskStatus", taskId, status: newStatus, taskTitle }),
    });
  }

  async function changeTaskDate(taskId: string, dateVal: string) {
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        tasks: d.tasks.map((t) =>
          t._id === taskId ? { ...t, dueDate: dateVal || undefined } : t
        ),
      };
    });
    setEditingDateId(null);
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "updateTaskDate", taskId, dueDate: dateVal || null }),
    });
  }

  async function runAction() {
    setActionSaving(true);
    setActionDone("");
    if (actionForm.type === "person") {
      if (!actionForm.personName.trim()) { setActionSaving(false); return; }
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "addContact", contact: { name: actionForm.personName, role: actionForm.personRole } }),
      });
      setActionDone(`Added contact: ${actionForm.personName}`);
    } else if (actionForm.type === "status") {
      if (!actionForm.statusTaskSearch.trim()) { setActionSaving(false); return; }
      const match = data?.tasks.find((t) => t.title.toLowerCase().includes(actionForm.statusTaskSearch.toLowerCase()));
      if (match) {
        await changeTaskStatus(match._id, match.title, actionForm.statusNewStatus);
        setActionDone(`${match.title} → ${actionForm.statusNewStatus}`);
      } else {
        setActionDone("No matching task found");
      }
    } else if (actionForm.type === "dump") {
      if (!actionForm.dumpText.trim()) { setActionSaving(false); return; }
      const cat = actionForm.dumpCategory || "general";
      const subj = actionForm.dumpSubject || "";
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "dump", text: actionForm.dumpText, category: cat, subject: subj }),
      });
      setActionDone(subj ? `${cat} dump (${subj}) indexed` : "Dump processed and indexed");
    } else {
      if (!actionForm.title.trim()) { setActionSaving(false); return; }
      const taskData: Record<string, unknown> = { title: actionForm.title, status: actionForm.type };
      if (actionForm.dueDate) taskData.dueDate = actionForm.dueDate;
      if (actionForm.taskPeople.length) taskData.people = actionForm.taskPeople;
      if (actionForm.taskInitiative) taskData.initiative = actionForm.taskInitiative;
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "addTask", task: taskData }),
      });
      setActionDone(`Added ${actionForm.type}: ${actionForm.title}`);
    }
    setActionForm((f) => ({ ...f, title: "", dueDate: "", personName: "", personRole: "", statusTaskSearch: "", dumpText: "", dumpCategory: "general", dumpSubject: "", taskPeople: [], taskInitiative: "" }));
    setActionSaving(false);
    fetchData();
    setTimeout(() => setActionDone(""), 3000);
  }

  async function submitPersonDump(personId: string) {
    if (!personDumpText.trim()) return;
    setPersonDumpSending(true);
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "personDump", personId, text: personDumpText }),
    });
    setPersonDumpText("");
    setPersonDumpId(null);
    setPersonDumpSending(false);
    fetchData();
  }

  async function saveEditDump() {
    if (!editingDump || !editingDump.text.trim()) return;
    if (editingDump.type === "person" && editingDump.personId) {
      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "editPersonDump", personId: editingDump.personId, dumpId: editingDump.id, text: editingDump.text }) });
    } else {
      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "editChatDump", dumpIndex: editingDump.index, text: editingDump.text }) });
    }
    setEditingDump(null);
    fetchData();
  }

  async function deleteDump(type: "person" | "chat", id: string, index: number, personId?: string) {
    if (type === "person" && personId) {
      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "deletePersonDump", personId, dumpId: id }) });
    } else {
      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "deleteChatDump", dumpIndex: index }) });
    }
    fetchData();
  }

  async function syncMembers() {
    setSyncingMembers(true);
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "syncMembers" }),
    });
    const result = await res.json();
    if (result.added > 0) fetchData();
    setSyncingMembers(false);
  }

  async function deleteContact(id: string) {
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "deleteContact", contact: { _id: id } }),
    });
    fetchData();
  }

  async function toggleAiFeed(enabled: boolean) {
    setData((d) => d ? { ...d, chat: { ...d.chat, aiFeedEnabled: enabled } } : d);
    await fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, aiFeedEnabled: enabled }),
    });
  }

  async function generateFeed() {
    setFeedGenerating(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "generateFeed" }),
      });
      const json = await res.json();
      if (json.items?.length) {
        const now = new Date().toISOString();
        const newEntries = json.items.map((i: { type: string; content: string }) => ({ _id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: i.type, content: i.content, status: "new", createdAt: now }));
        setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: [...newEntries, ...d.chat.aiFeed] } } : d);
      }
      setFeedAnswers({});
    } catch (e) {
      console.error("generateFeed error:", e);
    }
    setFeedGenerating(false);
  }

  async function clearFeed() {
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "clearFeed" }),
    });
    setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: [] } } : d);
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

  const checkTasks: Task[] = data.checks.map((c) => ({
    _id: `check-${c._id}`,
    title: c.description,
    description: c.context || undefined,
    status: c.status === "pending" ? "upcoming" as const : "done" as const,
    dueDate: c.scheduledFor,
    people: ["odoai"],
    createdByUsername: "odoai",
    createdAt: c.createdAt,
    completedAt: c.completedAt,
    _isCheck: true,
    _checkId: c._id,
    _checkResult: c.result,
  })) as (Task & { _isCheck?: boolean; _checkId?: string; _checkResult?: string })[];

  const allTasks = [...data.tasks.map((t) => ({ ...t, _isCheck: false, _checkId: "", _checkResult: "" })), ...checkTasks];
  const activeTasks = allTasks.filter((t) => t.status === "todo" || t.status === "upcoming");
  const allCategories = [...new Set(activeTasks.flatMap((t) => t.categories || []))].sort().slice(0, 5);
  const statusFiltered = taskFilters.size === 3 ? allTasks : allTasks.filter((t) => taskFilters.has(t.status));
  const filteredTasks = categoryFilters.size === 0 ? statusFiltered : statusFiltered.filter((t) => (t.categories || []).some((c) => categoryFilters.has(c)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <div className="text-xs font-mono text-gray-400 mb-1">odoai dashboard</div>
            {editingTitle ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!titleDraft.trim()) return;
                  await fetch("/api/dashboard", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, chatTitle: titleDraft.trim() }),
                  });
                  setData((d) => d ? { ...d, chat: { ...d.chat, title: titleDraft.trim() } } : d);
                  setEditingTitle(false);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="text-2xl font-bold text-gray-900 bg-white border border-gray-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingTitle(false); }}
                />
                <button type="submit" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Save</button>
                <button type="button" onClick={() => setEditingTitle(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
              </form>
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-600 transition-colors"
                onClick={() => { setTitleDraft(data.chat.title); setEditingTitle(true); }}
                title="Click to edit"
              >
                {data.chat.title} <span className="text-gray-300 text-base">✎</span>
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {([
                  { key: "passive", label: "Passive", color: "bg-gray-200 text-gray-700" },
                  { key: "active", label: "Active", color: "bg-green-100 text-green-700" },
                  { key: "aggressive", label: "Aggressive", color: "bg-red-100 text-red-700" },
                ] as { key: string; label: string; color: string }[]).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      data.chat.mode === m.key
                        ? `${m.color} shadow-sm`
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <select
                value={data.chat.aiStyle}
                onChange={(e) => setAiStyle(e.target.value as AiStyle)}
                className="text-xs bg-gray-100 border-0 rounded-md px-2 py-1 text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {AI_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <select
                value={data.chat.aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="text-xs bg-gray-100 border-0 rounded-md px-2 py-1 text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 max-w-[160px]"
              >
                {AI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} ({m.pricing})</option>
                ))}
                {!AI_MODELS.some((m) => m.value === data.chat.aiModel) && (
                  <option value={data.chat.aiModel}>{data.chat.aiModel}</option>
                )}
              </select>
              <span className="text-gray-500">{data.chat.messageCount} msgs</span>
              {data.chat.lastReviewedAt && (
                <span className="text-xs text-gray-400">reviewed {formatRelativeTime(data.chat.lastReviewedAt)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={syncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              {syncing ? "..." : "Sync"}
            </button>
            <button
              onClick={() => { setShowWallet(!showWallet); setShowFeed(false); setShowPeople(false); setShowContext(false); setShowDump(false); setShowGuidance(false); setShowActions(false); setShowWatch(false); setShowDataSources(false); setShowSocial(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                showWallet ? "bg-gray-900 text-white border-gray-900" : "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              <span>{data.spend.totalCalls} calls</span>
              <span className="text-gray-400">·</span>
              <span>{(data.spend.totalTokens / 1000).toFixed(1)}k tok</span>
            </button>
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

        {/* Toolbar */}
        <section className="mb-10">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: "workMode", label: "Work Mode", state: showWorkMode, set: setShowWorkMode },
              { key: "offers", label: `Offer Research${data.chat.offers?.length ? ` (${data.chat.offers.filter((o) => o.status !== "rejected").length})` : ""}`, state: showOffers, set: setShowOffers },
              { key: "aiQuestions", label: `AI Questions${data.chat.aiQuestions?.length ? ` (${data.chat.aiQuestions.filter((q) => !q.answer && !q.skipped).length})` : ""}`, state: showAiQuestions, set: setShowAiQuestions },
              { key: "menu", label: `Menu${data.chat.menu?.length ? ` (${data.chat.menu.length})` : ""}`, state: showMenu, set: setShowMenu },
              { key: "feed", label: "AI Feed", state: showFeed, set: setShowFeed },
              { key: "people", label: `People (${data.people.length})`, state: showPeople, set: setShowPeople },
              { key: "initiatives", label: `Initiatives (${(data.initiatives || []).filter((i) => i.status === "active").length})`, state: showInitiatives, set: setShowInitiatives },
              { key: "context", label: "Chat Context", state: showContext, set: setShowContext },
              { key: "dump", label: "Add Dump", state: showDump, set: setShowDump },
              { key: "guidance", label: "Guidance", state: showGuidance, set: setShowGuidance },
              { key: "actions", label: "Quick Actions", state: showActions, set: setShowActions },
              { key: "watch", label: "Watch List", state: showWatch, set: setShowWatch },
              { key: "abilities", label: "Abilities", state: showAbilities, set: setShowAbilities },
              { key: "dataSources", label: `Data Sources${(() => { const availableIds = new Set((data.availableDataSources || []).flatMap((src: { id: string; endpoints: { id: string }[] }) => src.endpoints.map((ep) => `${src.id}/${ep.id}`))); const total = availableIds.size; const on = (data.chat.dataSources || []).filter((ds: { sourceId: string; endpointId: string; enabled: boolean }) => ds.enabled && availableIds.has(`${ds.sourceId}/${ds.endpointId}`)).length; return total ? ` (${on}/${total})` : ""; })()}`, state: showDataSources, set: setShowDataSources },
              { key: "social", label: "Social Query", state: showSocial, set: setShowSocial },
            ] as { key: string; label: string; state: boolean; set: (v: boolean) => void }[]).map((btn) => (
              <button
                key={btn.key}
                onClick={() => {
                  const next = !btn.state;
                  setShowFeed(false); setShowPeople(false); setShowInitiatives(false); setShowContext(false); setShowDump(false); setShowGuidance(false); setShowActions(false); setShowWatch(false); setShowWallet(false); setShowAbilities(false); setShowDataSources(false); setShowSocial(false); setShowAiQuestions(false); setShowMenu(false); setShowWorkMode(false); setShowOffers(false);
                  btn.set(next);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  btn.state
                    ? btn.key === "workMode" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : btn.key === "aiQuestions" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : btn.key === "menu" ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-gray-900 text-white border-gray-900"
                    : btn.key === "workMode" ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100" : btn.key === "aiQuestions" ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100" : btn.key === "menu" ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {btn.key === "workMode" && <span className="mr-1">⚡</span>}{btn.key === "aiQuestions" && <span className="mr-1">✦</span>}{btn.key === "menu" && <span className="mr-1">☰</span>}{btn.key === "offers" && <span className="mr-1">💰</span>}{btn.label}
              </button>
            ))}
          </div>
          {showOffers && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">Offer Research</h3>
                  {data.chat.offerIteration > 0 && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">iter {data.chat.offerIteration}</span>
                  )}
                  {data.chat.offers.length > 0 && (
                    <span className="text-[10px] text-gray-400">{data.chat.offers.filter((o) => o.status !== "rejected").length} active</span>
                  )}
                </div>
                <button
                  disabled={researchingOffers}
                  onClick={async () => {
                    setResearchingOffers(true);
                    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "researchOffers" }) });
                    await fetchData();
                    setResearchingOffers(false);
                  }}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
                >{researchingOffers ? "Researching..." : data.chat.offers.length > 0 ? "Iterate" : "Generate Offers"}</button>
              </div>
              {data.chat.offers.length > 0 && (
                <p className="text-[10px] text-gray-500 mb-3 leading-snug">
                  <span className="font-medium text-gray-600">Add to tasks</span> — buttons create todos (deduped by title) like Quick Actions. Use them to ship validation steps, ops, and creative moves without retyping.
                </p>
              )}

              {researchingOffers && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center animate-pulse mb-3">
                  <p className="text-sm text-emerald-700">Analyzing team context, conversations, abilities, metrics, and market signals to {data.chat.offers.length > 0 ? "refine offers..." : "generate offers..."}</p>
                </div>
              )}

              {data.chat.offerResearchLog.length > 0 && !researchingOffers && (() => {
                const lastOfferLog = data.chat.offerResearchLog[data.chat.offerResearchLog.length - 1];
                const cadence = lastOfferLog?.conversationCadence?.length ? lastOfferLog.conversationCadence : [];
                if (!cadence.length && !lastOfferLog?.result) return null;
                return (
                  <div className="mb-3 space-y-2">
                    {cadence.length > 0 && (
                      <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-800 mb-1.5">Keep the chat thriving this week</p>
                        <ul className="text-xs text-teal-900 space-y-1 list-disc list-inside leading-snug">
                          {cadence.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lastOfferLog?.result && (
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Iteration recap</p>
                        <p className="text-xs text-gray-600">{lastOfferLog.result}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {data.chat.offers.length > 0 && !researchingOffers && (
                <div className="space-y-2.5">
                  {[...data.chat.offers]
                    .sort((a, b) => b.confidenceScore - a.confidenceScore)
                    .map((o) => {
                      const relatedTasks = offerRelatedTasks(o, data.tasks);
                      const statusColors: Record<string, string> = {
                        hypothesis: "bg-blue-100 text-blue-700 border-blue-200",
                        validating: "bg-yellow-100 text-yellow-700 border-yellow-200",
                        validated: "bg-green-100 text-green-700 border-green-200",
                        rejected: "bg-red-100 text-red-700 border-red-200",
                        live: "bg-emerald-100 text-emerald-700 border-emerald-200",
                      };
                      const confColor = o.confidenceScore >= 70 ? "text-green-600" : o.confidenceScore >= 40 ? "text-yellow-600" : "text-gray-400";
                      return (
                        <div key={o.id} className={`border rounded-lg p-3 transition-all ${o.status === "rejected" ? "opacity-50 border-gray-200" : "border-gray-200 hover:shadow-sm"}`}>
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 w-10 text-center pt-0.5">
                              <div className={`text-lg font-bold ${confColor}`}>{o.confidenceScore}</div>
                              <div className="text-[8px] text-gray-400 uppercase">conf</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="font-semibold text-sm text-gray-900">{o.name}</span>
                                <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 border ${statusColors[o.status]}`}>{o.status}</span>
                                <span className="text-[10px] font-bold text-emerald-600">{o.pricePoint}</span>
                              </div>
                              <p className="text-xs text-gray-600 leading-relaxed mb-1">{o.description}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                                <span className="text-gray-500"><span className="font-medium text-gray-700">Buyer:</span> {o.targetBuyer}</span>
                                <span className="text-gray-500"><span className="font-medium text-gray-700">Delivery:</span> {o.deliveryMethod}</span>
                                {o.costToDeliver && <span className="text-red-500">Cost: {o.costToDeliver}</span>}
                                {o.revenueEstimate && <span className="text-green-600">Rev: {o.revenueEstimate}</span>}
                              </div>
                              {o.meatAndPotatoes?.length > 0 && (
                                <div className="mt-1.5 rounded-md bg-amber-50/90 border border-amber-100 px-2 py-1.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-900 mb-1">Meat & potatoes</p>
                                  <p className="text-[9px] text-amber-800/90 mb-1 leading-snug">What actually ships — scope buyers can feel on the day.</p>
                                  <ul className="text-[10px] text-amber-950 space-y-0.5 list-disc list-inside leading-snug">
                                    {o.meatAndPotatoes.map((line, i) => (
                                      <li key={i}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {o.teamLeverage?.length > 0 && (
                                <div className="mt-1.5 rounded-md bg-sky-50 border border-sky-100 px-2 py-1.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-900 mb-1">Leverage the team</p>
                                  <p className="text-[9px] text-sky-800/90 mb-1 leading-snug">Who does what with the skills you already have.</p>
                                  <ul className="text-[10px] text-sky-950 space-y-0.5 list-disc list-inside leading-snug">
                                    {o.teamLeverage.map((line, i) => (
                                      <li key={i}>{line}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {o.whyNow && <p className="text-[10px] text-amber-600 mt-1">Why now: {o.whyNow}</p>}
                              {o.confidenceReason && <p className="text-[10px] text-gray-400 mt-0.5">{o.confidenceReason}</p>}
                              {o.validationNotes?.trim() && (
                                <div className="mt-1.5 flex gap-2 items-start rounded-md border border-indigo-100 bg-indigo-50/60 px-2 py-1.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-semibold uppercase tracking-wide text-indigo-800 mb-0.5">Next validation</p>
                                    <p className="text-[10px] text-indigo-950 leading-snug">{o.validationNotes}</p>
                                  </div>
                                  {o.status !== "rejected" && (
                                    <button
                                      type="button"
                                      title="Creates a todo; title is deduped if you click twice"
                                      onClick={() => addOfferResearchTask(o.name, o.id, "validation", `Next validation:\n${o.validationNotes}`)}
                                      className="shrink-0 text-[9px] font-medium px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                                    >
                                      Add task
                                    </button>
                                  )}
                                </div>
                              )}
                              {o.standoutActions?.length > 0 && (() => {
                                const execExpanded = !!offerExecutionExpanded[o.id];
                                const execAll = o.standoutActions;
                                const execVisible = execExpanded ? execAll : execAll.slice(0, OFFER_EXECUTION_PREVIEW);
                                const execMore = Math.max(0, execAll.length - OFFER_EXECUTION_PREVIEW);
                                return (
                                <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 mb-0.5">Execution</p>
                                  <p className="text-[9px] text-gray-500 mb-1 leading-snug">Ops, logistics, proof, handoffs — the boring stuff that wins.</p>
                                  <ul className="space-y-1">
                                    {execVisible.map((action, i) => (
                                      <li key={i} className="flex gap-2 items-start text-[10px] text-gray-800">
                                        <span className="flex-1 min-w-0 leading-snug"><span className="font-semibold text-gray-400 mr-1">{i + 1}.</span>{action}</span>
                                        {o.status !== "rejected" && (
                                          <button
                                            type="button"
                                            title="Add this line as a task"
                                            onClick={() => addOfferResearchTask(o.name, o.id, `ops ${i + 1}`, `Execution:\n${action}`)}
                                            className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                          >
                                            Add
                                          </button>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                  {execMore > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setOfferExecutionExpanded((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
                                      className="mt-1.5 text-[9px] font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2 decoration-gray-300 hover:decoration-gray-600"
                                    >
                                      {execExpanded ? "Show less" : `Show ${execMore} more`}
                                    </button>
                                  )}
                                </div>
                                );
                              })()}
                              {o.creativePlays?.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-fuchsia-100">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-fuchsia-800 mb-0.5">Creative & differentiation</p>
                                  <p className="text-[9px] text-fuchsia-700/90 mb-1 leading-snug">Story, partnerships, wow — not the same as execution above.</p>
                                  <ul className="space-y-1">
                                    {o.creativePlays.map((play, i) => (
                                      <li key={i} className="flex gap-2 items-start text-[10px] text-fuchsia-950">
                                        <span className="flex-1 min-w-0 leading-snug"><span className="font-semibold text-fuchsia-500 mr-1">{i + 1}.</span>{play}</span>
                                        {o.status !== "rejected" && (
                                          <button
                                            type="button"
                                            title="Add this line as a task"
                                            onClick={() => addOfferResearchTask(o.name, o.id, `creative ${i + 1}`, `Creative play:\n${play}`)}
                                            className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100"
                                          >
                                            Add
                                          </button>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {o.chatSignals?.length > 0 && (
                                <div className="mt-1.5 rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Signals the chat is working</p>
                                  <ul className="text-[10px] text-slate-800 space-y-0.5 list-disc list-inside">
                                    {o.chatSignals.map((sig, i) => (
                                      <li key={i}>{sig}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {o.teamPing?.trim() && (
                                <div className="mt-1.5 rounded-md border border-violet-100 bg-violet-50/80 px-2 py-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-800 mb-0.5">Paste in Telegram</p>
                                      <p className="text-[10px] text-violet-950 whitespace-pre-wrap leading-snug">{o.teamPing}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await navigator.clipboard.writeText(o.teamPing);
                                          setOfferCopyFlash(o.id);
                                          setTimeout(() => setOfferCopyFlash((x) => (x === o.id ? null : x)), 2000);
                                        } catch {
                                          setOfferCopyFlash(null);
                                        }
                                      }}
                                      className="shrink-0 text-[9px] font-medium px-2 py-0.5 rounded-md bg-violet-600 text-white hover:bg-violet-700"
                                    >
                                      {offerCopyFlash === o.id ? "Copied" : "Copy"}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {relatedTasks.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  <span className="text-[9px] font-semibold uppercase text-gray-500">Linked tasks</span>
                                  {relatedTasks.map((t) => (
                                    <span
                                      key={t._id}
                                      className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                        t.status === "done" ? "bg-gray-100 text-gray-500 border-gray-200 line-through" : "bg-white text-gray-700 border-gray-200"
                                      }`}
                                      title={t.title}
                                    >
                                      {truncateTaskTitle(t.title, 36)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-1 mt-1.5">
                                {(["hypothesis", "validating", "validated", "live", "rejected"] as const).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => {
                                      setData((d) => d ? { ...d, chat: { ...d.chat, offers: d.chat.offers.map((offer) => offer.id === o.id ? { ...offer, status: s } : offer) } } : d);
                                      fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateOfferStatus", offerId: o.id, status: s }) });
                                    }}
                                    className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${o.status === s ? statusColors[s] : "text-gray-300 border-gray-200 hover:border-gray-300"}`}
                                  >{s === "live" ? "🟢 live" : s}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                  })}
                </div>
              )}

              {data.chat.offers.length === 0 && !researchingOffers && (
                <p className="text-xs text-gray-400 text-center py-3">Hit &ldquo;Generate Offers&rdquo; to research 3-5 offers based on your team&apos;s full context — conversations, abilities, metrics, and momentum.</p>
              )}
            </div>
          )}

          {showWorkMode && (
            <div className="mt-4 bg-white border border-indigo-200 rounded-xl p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-xl">⚡</span> Work Mode
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Select who you are to get a dynamic, personalized briefing on what matters right now.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={workModePersonId}
                    onChange={(e) => setWorkModePersonId(e.target.value)}
                    className="flex-1 sm:w-48 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-indigo-300 outline-none"
                  >
                    <option value="">Select yourself...</option>
                    {data.people.map(p => (
                      <option key={p._id} value={p._id}>{p.username || p.firstName || "Unknown"}</option>
                    ))}
                  </select>
                  <button
                    disabled={!workModePersonId || workModeLoading}
                    onClick={async () => {
                      setWorkModeLoading(true);
                      try {
                        const res = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "generateWorkMode", personId: workModePersonId })
                        });
                        const json = await res.json();
                        if (json.ok && json.workMode) {
                          setWorkModeData(json.workMode);
                        } else {
                          alert(json.error || "Failed to generate work mode");
                        }
                      } catch (e) {
                        alert("Error generating work mode");
                      }
                      setWorkModeLoading(false);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {workModeLoading ? "Generating..." : "Enter Mode"}
                  </button>
                </div>
              </div>

              {workModeLoading && (
                <div className="py-12 flex flex-col items-center justify-center text-indigo-500 animate-pulse">
                  <svg className="w-8 h-8 mb-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                  <p className="text-sm font-medium">Analyzing current state and compiling your brief...</p>
                </div>
              )}

              {!workModeLoading && workModeData && (
                <div className="space-y-6">
                  {/* The Story */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-indigo-900 mb-2 uppercase tracking-wider">Why it makes sense for you to work on this</h4>
                    <p className="text-indigo-800 text-sm leading-relaxed">{workModeData.story}</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Todos to focus on */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <span>🎯</span> Suggested Focus
                      </h4>
                      {workModeData.suggestedTaskIds && workModeData.suggestedTaskIds.length > 0 ? (
                        <div className="space-y-2">
                          {workModeData.suggestedTaskIds.map(tid => {
                            const t = data.tasks.find(x => x._id === tid);
                            if (!t) return null;
                            return (
                              <div key={tid} className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                                <p className="text-sm font-medium text-gray-800">{t.title}</p>
                                {t.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No specific tasks to suggest right now. Check the main task list!</p>
                      )}
                    </div>

                    {/* Immediate Value & Business Context */}
                    <div className="space-y-4">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <h4 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                          <span>🚀</span> Immediate Value
                        </h4>
                        <p className="text-sm text-emerald-800">{workModeData.immediateValue}</p>
                      </div>

                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                        <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                          <span>💡</span> Ideate
                        </h4>
                        <p className="text-sm text-amber-800">{workModeData.ideationPrompt}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Team Updates */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <span>👥</span> Team Updates
                      </h4>
                      {workModeData.teamUpdates && workModeData.teamUpdates.length > 0 ? (
                        <ul className="space-y-2">
                          {workModeData.teamUpdates.map((update, i) => (
                            <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                              <span className="text-blue-400 mt-0.5">•</span> {update}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-blue-600 italic">No major team updates right now.</p>
                      )}
                    </div>

                    {/* Business Context */}
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                      <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                        <span>🏢</span> Look at the Business
                      </h4>
                      <p className="text-sm text-purple-800">{workModeData.businessContext}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {showAiQuestions && (() => {
            const allQ = data.chat.aiQuestions || [];
            const activeQ = allQ.filter((q) => !q.answer && !q.skipped);
            const completedQ = allQ.filter((q) => q.answer || q.skipped);
            const catBadge = (cat: string) => ({
              strategy: "bg-purple-100 text-purple-700", abilities: "bg-blue-100 text-blue-700", sales: "bg-emerald-100 text-emerald-700",
              brand: "bg-orange-100 text-orange-700", content: "bg-pink-100 text-pink-700", faq: "bg-yellow-100 text-yellow-700", general: "bg-gray-100 text-gray-700",
            }[cat] || "bg-gray-100 text-gray-700");
            return (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">AI Questions</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Fill in answers to help AI give better strategy, sales, and partnership advice</p>
                </div>
                <div className="flex items-center gap-2">
                  {allQ.length > 0 && (
                    <button onClick={async () => { if (!confirm("Clear all AI questions?")) return; await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "clearAiQuestions" }) }); setData((d) => d ? { ...d, chat: { ...d.chat, aiQuestions: [] } } : d); setAiQDrafts({}); }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear All</button>
                  )}
                  <button
                    onClick={async () => { setAiQGenerating(true); try { const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "generateAiQuestions" }) }); const json = await res.json(); if (json.ok && json.questions?.length) fetchData(); } catch {} setAiQGenerating(false); }}
                    disabled={aiQGenerating}
                    className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                  >
                    {aiQGenerating ? (<><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>Generating…</>) : "Generate Questions"}
                  </button>
                </div>
              </div>

              {activeQ.length > 0 && (
                <div className="space-y-3">
                  {activeQ.filter((q) => aiQFilter === "all" || q.category === aiQFilter).map((q) => (
                    <div key={q.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mr-2 ${catBadge(q.category)}`}>{q.category}</span>
                          <span className="text-sm font-medium text-gray-800">{q.question}</span>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "skipAiQuestion", questionId: q.id }) });
                            setData((d) => d ? { ...d, chat: { ...d.chat, aiQuestions: d.chat.aiQuestions.map((x) => x.id === q.id ? { ...x, skipped: true } : x) } } : d);
                          }}
                          className="text-[10px] text-gray-400 hover:text-gray-600 whitespace-nowrap transition-colors"
                        >Skip</button>
                      </div>
                      <div className="mt-1.5">
                        <textarea
                          value={aiQDrafts[q.id] ?? ""}
                          onChange={(e) => setAiQDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                          placeholder="Type your answer…"
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-y"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button
                            disabled={aiQSaving === q.id || !(aiQDrafts[q.id] ?? "").trim()}
                            onClick={async () => {
                              const answer = (aiQDrafts[q.id] ?? "").trim();
                              setAiQSaving(q.id);
                              try { await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "answerAiQuestion", questionId: q.id, answer }) }); setData((d) => d ? { ...d, chat: { ...d.chat, aiQuestions: d.chat.aiQuestions.map((x) => x.id === q.id ? { ...x, answer, answeredAt: new Date().toISOString() } : x) } } : d); setAiQDrafts((d) => { const n = { ...d }; delete n[q.id]; return n; }); } catch {}
                              setAiQSaving(null);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                          >{aiQSaving === q.id ? "Saving…" : "Save"}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeQ.length === 0 && allQ.length > 0 && (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-sm">All caught up! Generate more questions to keep improving.</p>
                </div>
              )}

              {allQ.length === 0 && !aiQGenerating && (
                <div className="text-center py-8 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <p className="text-sm">No questions yet — click &ldquo;Generate Questions&rdquo; to get started</p>
                  <p className="text-xs mt-1">AI will look at everything it knows and ask questions to help with attention, sales, and brand partnerships</p>
                </div>
              )}

              {completedQ.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <button onClick={() => setAiQShowCompleted(!aiQShowCompleted)} className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors w-full">
                    <svg className={`w-3 h-3 transition-transform ${aiQShowCompleted ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                    Completed ({completedQ.filter((q) => q.answer).length} answered, {completedQ.filter((q) => q.skipped && !q.answer).length} skipped)
                  </button>
                  {aiQShowCompleted && (
                    <div className="space-y-2 mt-3">
                      {completedQ.map((q) => (
                        <div key={q.id} className={`rounded-lg border p-3 ${q.answer ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-100"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mr-2 ${catBadge(q.category)}`}>{q.category}</span>
                              <span className="text-sm text-gray-700">{q.question}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {q.skipped && !q.answer && (
                                <button onClick={async () => { await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "unskipAiQuestion", questionId: q.id }) }); setData((d) => d ? { ...d, chat: { ...d.chat, aiQuestions: d.chat.aiQuestions.map((x) => x.id === q.id ? { ...x, skipped: false } : x) } } : d); }} className="text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors">Unskip</button>
                              )}
                              {q.skipped && !q.answer && <span className="text-[10px] text-gray-400">Skipped</span>}
                              {q.answer && <span className="text-[10px] text-green-600 flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></span>}
                            </div>
                          </div>
                          {q.answer && !aiQDrafts[q.id] && (
                            <div className="mt-1.5 text-sm text-gray-600 bg-white rounded p-2 border border-green-100 cursor-pointer hover:border-green-300 transition-colors" onClick={() => setAiQDrafts((d) => ({ ...d, [q.id]: q.answer }))}>{q.answer}</div>
                          )}
                          {aiQDrafts[q.id] !== undefined && (
                            <div className="mt-1.5">
                              <textarea value={aiQDrafts[q.id]} onChange={(e) => setAiQDrafts((d) => ({ ...d, [q.id]: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-y" />
                              <div className="flex justify-end gap-2 mt-1.5">
                                <button onClick={() => setAiQDrafts((d) => { const n = { ...d }; delete n[q.id]; return n; })} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                <button disabled={aiQSaving === q.id || !(aiQDrafts[q.id] ?? "").trim()} onClick={async () => { const answer = (aiQDrafts[q.id] ?? "").trim(); setAiQSaving(q.id); try { await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "answerAiQuestion", questionId: q.id, answer }) }); setData((d) => d ? { ...d, chat: { ...d.chat, aiQuestions: d.chat.aiQuestions.map((x) => x.id === q.id ? { ...x, answer, answeredAt: new Date().toISOString(), skipped: false } : x) } } : d); setAiQDrafts((d) => { const n = { ...d }; delete n[q.id]; return n; }); } catch {} setAiQSaving(null); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors">{aiQSaving === q.id ? "Saving…" : "Save"}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {showMenu && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">Menu</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Your products and services — AI helps optimize each item for maximum impact</p>
                </div>
                <div className="flex items-center gap-2">
                  {(data.chat.menu || []).length > 0 && (
                    <button
                      onClick={async () => {
                        setMenuAuditing(true);
                        setMenuAudit(null);
                        try {
                          const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "aiMenuAudit" }) });
                          const json = await res.json();
                          if (json.ok) setMenuAudit(json.audit);
                        } catch {}
                        setMenuAuditing(false);
                      }}
                      disabled={menuAuditing}
                      className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                    >
                      {menuAuditing ? (<><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>Auditing…</>) : "AI Menu Audit"}
                    </button>
                  )}
                </div>
              </div>

              {menuAudit && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-indigo-600">AI Menu Audit</span>
                    <button onClick={() => setMenuAudit(null)} className="text-[10px] text-indigo-400 hover:text-indigo-600">Dismiss</button>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{menuAudit}</div>
                </div>
              )}

              <div className="mb-4 bg-gray-50 rounded-lg border border-gray-200 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input type="text" value={menuForm.name} onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))} placeholder="Item name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none" />
                  <input type="text" value={menuForm.description} onChange={(e) => setMenuForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none" />
                  <input type="text" value={menuForm.price} onChange={(e) => setMenuForm((f) => ({ ...f, price: e.target.value }))} placeholder="Price" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none" />
                  <div className="flex gap-2">
                    <select value={menuForm.category} onChange={(e) => setMenuForm((f) => ({ ...f, category: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-emerald-300 outline-none bg-white">
                      <option value="general">General</option>
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                      <option value="package">Package</option>
                      <option value="addon">Add-on</option>
                    </select>
                    <button
                      disabled={menuAdding || !menuForm.name.trim()}
                      onClick={async () => {
                        setMenuAdding(true);
                        try {
                          const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addMenuItem", item: menuForm }) });
                          const json = await res.json();
                          if (json.ok) { setData((d) => d ? { ...d, chat: { ...d.chat, menu: [...d.chat.menu, json.item] } } : d); setMenuForm({ name: "", description: "", price: "", category: "general" }); }
                        } catch {}
                        setMenuAdding(false);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
                    >{menuAdding ? "Adding…" : "Add"}</button>
                  </div>
                </div>
              </div>

              {(data.chat.menu || []).length > 0 ? (
                <div className="space-y-3">
                  {data.chat.menu.map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      {menuEditing === item.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <input type="text" value={menuEditDraft.name} onChange={(e) => setMenuEditDraft((d) => ({ ...d, name: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
                            <input type="text" value={menuEditDraft.description} onChange={(e) => setMenuEditDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
                            <input type="text" value={menuEditDraft.price} onChange={(e) => setMenuEditDraft((d) => ({ ...d, price: e.target.value }))} placeholder="Price" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
                            <select value={menuEditDraft.category} onChange={(e) => setMenuEditDraft((d) => ({ ...d, category: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-300 outline-none bg-white">
                              <option value="general">General</option><option value="product">Product</option><option value="service">Service</option><option value="package">Package</option><option value="addon">Add-on</option>
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setMenuEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            <button onClick={async () => {
                              await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateMenuItem", itemId: item.id, ...menuEditDraft }) });
                              setData((d) => d ? { ...d, chat: { ...d.chat, menu: d.chat.menu.map((m) => m.id === item.id ? { ...m, ...menuEditDraft } : m) } } : d);
                              setMenuEditing(null);
                            }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors">Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${{ product: "bg-blue-100 text-blue-700", service: "bg-purple-100 text-purple-700", package: "bg-amber-100 text-amber-700", addon: "bg-teal-100 text-teal-700", general: "bg-gray-100 text-gray-600" }[item.category] || "bg-gray-100 text-gray-600"}`}>{item.category}</span>
                                <span className="text-sm font-semibold text-gray-800">{item.name}</span>
                                {item.price && <span className="text-sm font-medium text-emerald-600">{item.price}</span>}
                              </div>
                              {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => { setMenuEditing(item.id); setMenuEditDraft({ name: item.name, description: item.description, price: item.price, category: item.category }); }} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Edit</button>
                              <button
                                disabled={menuAiLoading === item.id}
                                onClick={async () => {
                                  setMenuAiLoading(item.id);
                                  try {
                                    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "aiMenuSuggestions", itemId: item.id }) });
                                    const json = await res.json();
                                    if (json.ok) setData((d) => d ? { ...d, chat: { ...d.chat, menu: d.chat.menu.map((m) => m.id === item.id ? { ...m, aiSuggestions: json.suggestions, targetBuyers: json.targetBuyers } : m) } } : d);
                                  } catch {}
                                  setMenuAiLoading(null);
                                }}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-0.5"
                              >{menuAiLoading === item.id ? <><svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg></> : "AI Suggest"}</button>
                              <button onClick={async () => { if (!confirm(`Delete "${item.name}"?`)) return; await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "deleteMenuItem", itemId: item.id }) }); setData((d) => d ? { ...d, chat: { ...d.chat, menu: d.chat.menu.filter((m) => m.id !== item.id) } } : d); }} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">Delete</button>
                            </div>
                          </div>
                          {(item.aiSuggestions || item.targetBuyers) && (
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {item.aiSuggestions && (
                                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                                  <span className="text-[10px] font-medium text-indigo-600 block mb-1">Improvement Ideas</span>
                                  <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{item.aiSuggestions}</div>
                                </div>
                              )}
                              {item.targetBuyers && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                                  <span className="text-[10px] font-medium text-emerald-600 block mb-1">Who to Sell To</span>
                                  <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{item.targetBuyers}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-sm">No menu items yet — add your products and services above</p>
                  <p className="text-xs mt-1">AI will help you optimize each item and find the right buyers</p>
                </div>
              )}
            </div>
          )}

          {showFeed && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-800">AI Feed</h3>
                  <button
                    onClick={() => toggleAiFeed(!data.chat.aiFeedEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      data.chat.aiFeedEnabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        data.chat.aiFeedEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-gray-500">{data.chat.aiFeedEnabled ? "Auto-generates in active/aggressive mode" : "Off"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {data.chat.aiFeed.length > 0 && (
                    <button
                      onClick={clearFeed}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={generateFeed}
                    disabled={feedGenerating}
                    className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                  >
                    {feedGenerating ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                        Generating...
                      </>
                    ) : "Generate Now"}
                  </button>
                </div>
              </div>
              {(() => {
                const socialKeys = new Set(socialSnapshots.filter((s) => s.pollStatus === "finished").map((s) => `${s.sourceId}/${s.endpointId}`));
                const dsBadges = dsSnapCounts.filter((d) => !d.sourceId.startsWith("social-") && !socialKeys.has(`${d.sourceId}/${d.endpointId}`));
                const finishedSocial = socialSnapshots.filter((s) => s.pollStatus === "finished");
                if (!finishedSocial.length && !dsBadges.length) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {finishedSocial.map((s) => {
                      const platform = s.sourceId.replace("social-", "");
                      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
                      const handle = s.params?.handle || s.params?.profile_id || s.params?.query || "";
                      const isStale = Date.now() - new Date(s.latest).getTime() > 24 * 60 * 60 * 1000;
                      return (
                        <span key={`${s.sourceId}-${s.endpointId}`} className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-medium ${isStale ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                          {label} {s.endpointId}{handle ? ` @${handle}` : ""} — {timeAgo(s.latest)}
                        </span>
                      );
                    })}
                    {dsBadges.map((d) => {
                      const isStale = Date.now() - new Date(d.latest).getTime() > 24 * 60 * 60 * 1000;
                      return (
                        <span key={`${d.sourceId}-${d.endpointId}`} className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-medium ${isStale ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                          {d.sourceId}/{d.endpointId} — {timeAgo(d.latest)}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={askAIInput}
                    onChange={(e) => setAskAIInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && askAIInput.trim() && !askAILoading) {
                        e.preventDefault();
                        (async () => {
                          setAskAILoading(true);
                          setAskAIResult(null);
                          try {
                            const res = await fetch("/api/dashboard", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ token, action: "askAI", question: askAIInput.trim() }),
                            });
                            const json = await res.json();
                            if (json.ok) setAskAIResult({ answer: json.answer, suggestions: json.suggestions || [], sourcesUsed: json.sourcesUsed || 0 });
                            else setAskAIResult({ answer: json.error || "Failed", suggestions: [], sourcesUsed: 0 });
                          } catch (err) {
                            setAskAIResult({ answer: String(err), suggestions: [], sourcesUsed: 0 });
                          }
                          setAskAILoading(false);
                        })();
                      }
                    }}
                    placeholder="Ask AI about your data, social posts, trends, strategy…"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                    disabled={askAILoading}
                  />
                  <button
                    disabled={askAILoading || !askAIInput.trim()}
                    onClick={async () => {
                      setAskAILoading(true);
                      setAskAIResult(null);
                      try {
                        const res = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "askAI", question: askAIInput.trim() }),
                        });
                        const json = await res.json();
                        if (json.ok) setAskAIResult({ answer: json.answer, suggestions: json.suggestions || [], sourcesUsed: json.sourcesUsed || 0 });
                        else setAskAIResult({ answer: json.error || "Failed", suggestions: [], sourcesUsed: 0 });
                      } catch (err) {
                        setAskAIResult({ answer: String(err), suggestions: [], sourcesUsed: 0 });
                      }
                      setAskAILoading(false);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {askAILoading ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                        Thinking…
                      </>
                    ) : "Ask AI"}
                  </button>
                </div>

                {askAIResult && (
                  <div className="mt-3 space-y-3">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-indigo-600">AI Answer</span>
                        <span className="text-[10px] text-indigo-400">{askAIResult.sourcesUsed} sources used</span>
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{askAIResult.answer}</div>
                    </div>

                    {askAIResult.suggestions.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-2">Suggestions</h4>
                        <div className="space-y-1.5">
                          {askAIResult.suggestions.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${
                                s.type === "todo" ? "bg-blue-50 text-blue-700" : s.type === "insight" ? "bg-purple-50 text-purple-700" : "bg-green-50 text-green-700"
                              }`}>{s.type}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800">{s.title}</p>
                                {s.detail && <p className="text-[11px] text-gray-500 mt-0.5">{s.detail}</p>}
                              </div>
                              <button
                                className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors shrink-0"
                                onClick={async () => {
                                  await fetch("/api/dashboard", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ token, action: "addTask", task: { title: s.title, description: s.detail, status: "todo" } }),
                                  });
                                  setAskAIResult((prev) => prev ? { ...prev, suggestions: prev.suggestions.map((x, j) => j === i ? { ...x, type: "added" } : x) } : prev);
                                }}
                                disabled={s.type === "added"}
                              >
                                {s.type === "added" ? "Added ✓" : "+ Todo"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {data.chat.aiFeed.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No feed items yet. Click &quot;Generate Now&quot; or enable auto-generation for active/aggressive mode.
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {focusedFeedIdx >= 0 && (
                    <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400 px-1 pb-1">
                      <span>↑↓ navigate</span>
                      <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">S</kbd> seen</span>
                      <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">T</kbd> todo</span>
                      <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">A</kbd> ask</span>
                      <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">D</kbd> done</span>
                      <span><kbd className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">C</kbd> done+ctx</span>
                    </div>
                  )}
                  {data.chat.aiFeed.map((item, i) => {
                    if (item.status === "seen" || item.status === "actioned") return null;
                    const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
                      cleanup: { icon: "🧹", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
                      suggestion: { icon: "💡", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
                      checkin: { icon: "📋", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
                      insight: { icon: "🔍", color: "text-teal-700", bg: "bg-teal-50 border-teal-200" },
                      reminder: { icon: "⏰", color: "text-red-700", bg: "bg-red-50 border-red-200" },
                      shout: { icon: "📢", color: "text-green-700", bg: "bg-green-50 border-green-300" },
                    };
                    const cfg = typeConfig[item.type] || { icon: "📌", color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
                    return (
                      <div key={i} className={`border rounded-lg px-3 sm:px-4 py-3 ${cfg.bg} ${visibleFeedIndices[focusedFeedIdx] === i ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-base mt-0.5">{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{item.type}</span>
                              {item.type === "shout" && <span className="text-[10px] text-green-500 font-medium">→ posted to group</span>}
                              <span className="text-xs text-gray-400">{formatET(item.createdAt)}</span>
                            </div>
                            <p className="text-sm text-gray-800">{item.content}</p>
                            {feedAnswers[i] && (
                              <div className="mt-2 bg-white/70 border border-gray-200 rounded-md px-3 py-2">
                                <p className="text-xs text-gray-600 whitespace-pre-wrap">{feedAnswers[i]}</p>
                              </div>
                            )}
                            {feedQuestion?.index === i && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={feedQuestion.text}
                                  onChange={(e) => setFeedQuestion({ index: i, text: e.target.value })}
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter" && feedQuestion.text.trim()) {
                                      setFeedQuestionLoading(true);
                                      const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "askAboutFeed", feedContent: item.content, feedType: item.type, question: feedQuestion.text.trim() }) });
                                      const json = await res.json();
                                      setFeedAnswers((prev) => ({ ...prev, [i]: json.answer || "No answer" }));
                                      setFeedQuestion(null);
                                      setFeedQuestionLoading(false);
                                    }
                                    if (e.key === "Escape") setFeedQuestion(null);
                                  }}
                                  placeholder="Ask about this..."
                                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                                  disabled={feedQuestionLoading}
                                />
                                {feedQuestionLoading && <span className="text-[10px] text-gray-400">Thinking...</span>}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <button
                                onClick={async () => {
                                  setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === item._id ? { ...f, status: "seen" } : f) } } : d);
                                  fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: item._id, status: "seen" }) });
                                }}
                                className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                              >✓ Seen</button>
                              <button
                                onClick={async () => {
                                  setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === item._id ? { ...f, status: "actioned" } : f) } } : d);
                                  await Promise.all([
                                    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addTask", task: { title: item.content, status: "todo", description: `Source: AI feed (${item.type})`, createdByUsername: "odoai" } }) }),
                                    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: item._id, status: "actioned" }) }),
                                  ]);
                                  fetchData();
                                }}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                              >+ Todo</button>
                              <button
                                onClick={() => setFeedQuestion(feedQuestion?.index === i ? null : { index: i, text: "" })}
                                className="text-[10px] text-amber-500 hover:text-amber-700 font-medium transition-colors"
                              >? Ask</button>
                              <button
                                onClick={async () => {
                                  const ctx = prompt("What happened? Add context:");
                                  if (ctx !== null && ctx.trim()) {
                                    setData((d) => d ? { ...d, chat: { ...d.chat, aiFeed: d.chat.aiFeed.map((f) => f._id === item._id ? { ...f, status: "actioned" } : f) } } : d);
                                    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedItemStatus", feedId: item._id, status: "actioned" }) });
                                    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "feedDoneWithContext", feedContent: item.content, feedType: item.type, context: ctx.trim() }) });
                                  }
                                }}
                                className="text-[10px] text-green-500 hover:text-green-700 font-medium transition-colors"
                              >✓ Done</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const dismissed = data.chat.aiFeed.filter((f) => f.status === "seen" || f.status === "actioned").length;
                    if (!dismissed) return null;
                    return <p className="text-[10px] text-gray-400 mt-2 text-center">{dismissed} dismissed item{dismissed !== 1 ? "s" : ""}</p>;
                  })()}
                </div>
              )}
            </div>
          )}
          {showInitiatives && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-4">Initiatives</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  value={newInitName}
                  onChange={(e) => setNewInitName(e.target.value)}
                  placeholder="Initiative name (e.g. Content Creation)"
                  onKeyDown={(e) => { if (e.key === "Enter" && newInitName.trim()) { fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addInitiative", initiative: { name: newInitName, description: newInitDesc } }) }).then(() => { setNewInitName(""); setNewInitDesc(""); fetchData(); }); } }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <input
                  value={newInitDesc}
                  onChange={(e) => setNewInitDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                <button
                  onClick={() => {
                    if (!newInitName.trim()) return;
                    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addInitiative", initiative: { name: newInitName, description: newInitDesc } }) }).then(() => { setNewInitName(""); setNewInitDesc(""); fetchData(); });
                  }}
                  disabled={!newInitName.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  Add
                </button>
              </div>
              {(data.initiatives || []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">No initiatives yet. Add one above.</p>
              ) : (
                <div className="space-y-3">
                  {(data.initiatives || []).map((ini) => {
                    const iniTasks = data.tasks.filter((t) => t.initiative === ini.id);
                    const iniDumps = data.chat.dumps.filter((d) => d.category === "initiative" && d.subject?.toLowerCase() === ini.name.toLowerCase());
                    const doneTasks = iniTasks.filter((t) => t.status === "done").length;
                    const totalTasks = iniTasks.length;
                    return (
                      <div key={ini.id} className={`border rounded-lg p-4 ${ini.status === "active" ? "border-purple-200 bg-purple-50/50" : ini.status === "paused" ? "border-yellow-200 bg-yellow-50/30" : "border-gray-200 bg-gray-50"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${ini.status === "active" ? "bg-purple-500" : ini.status === "paused" ? "bg-yellow-500" : "bg-gray-400"}`} />
                          <span className="font-medium text-sm text-gray-900">{ini.name}</span>
                          <select
                            value={ini.status}
                            onChange={(e) => {
                              fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateInitiative", initiativeId: ini.id, status: e.target.value }) }).then(() => fetchData());
                            }}
                            className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white ml-auto"
                          >
                            <option value="active">Active</option>
                            <option value="paused">Paused</option>
                            <option value="completed">Completed</option>
                          </select>
                          <button
                            onClick={() => { if (confirm(`Delete "${ini.name}"?`)) { fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "deleteInitiative", initiativeId: ini.id }) }).then(() => fetchData()); } }}
                            className="text-[10px] text-red-400 hover:text-red-600"
                            title="Delete"
                          >✕</button>
                        </div>
                        {ini.description && <p className="text-xs text-gray-500 ml-4 mb-2">{ini.description}</p>}
                        <div className="ml-4 flex items-center gap-3 text-[10px] text-gray-400">
                          {totalTasks > 0 && (
                            <span>{doneTasks}/{totalTasks} tasks done</span>
                          )}
                          {totalTasks > 0 && (
                            <div className="flex-1 max-w-[120px] bg-gray-200 rounded-full h-1.5">
                              <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
                            </div>
                          )}
                          {iniDumps.length > 0 && <span>{iniDumps.length} dumps</span>}
                        </div>
                        {iniTasks.length > 0 && (
                          <div className="mt-2 ml-4 space-y-0.5">
                            {iniTasks.slice(0, 5).map((t) => (
                              <div key={t._id} className="flex items-center gap-1.5 text-[10px]">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "done" ? "bg-green-400" : t.status === "upcoming" ? "bg-yellow-400" : "bg-blue-400"}`} />
                                <span className={t.status === "done" ? "line-through text-gray-400" : "text-gray-700"}>{t.title}</span>
                                <span className="text-gray-300 ml-auto">{t.status}</span>
                              </div>
                            ))}
                            {iniTasks.length > 5 && <div className="text-[10px] text-gray-400">+{iniTasks.length - 5} more</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {showPeople && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Chat Members</h3>
                <button
                  onClick={syncMembers}
                  disabled={syncingMembers}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  {syncingMembers ? "Syncing..." : "Sync from Telegram"}
                </button>
              </div>
              <div className="space-y-2 mb-5">
                {data.people.filter((p) => p.personType !== "contact").length === 0 && (
                  <p className="text-sm text-gray-400 italic">No members yet. Hit Sync to pull from Telegram.</p>
                )}
                {data.people.filter((p) => p.personType !== "contact").map((p) => {
                  const pName = (p.username || p.firstName || "").toLowerCase();
                  const personTasks = pName ? data.tasks.filter((t) => t.people?.some((tp) => tp.toLowerCase() === pName)) : [];
                  const activeTasks = personTasks.filter((t) => t.status !== "done");
                  const doneTasks = personTasks.filter((t) => t.status === "done");
                  const dedupedIntentions = [...new Map(p.intentions.map((i) => [i.toLowerCase(), i])).values()];
                  return (
                    <div key={p._id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const url = prompt("Avatar image URL:", p.avatarUrl || "");
                            if (url !== null) {
                              setData((d) => d ? { ...d, people: d.people.map((pp) => pp._id === p._id ? { ...pp, avatarUrl: url } : pp) } : d);
                              fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateAvatar", personId: p._id, avatarUrl: url }) });
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 overflow-hidden hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
                          title="Click to set avatar URL"
                        >
                          {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : (p.username || p.firstName || "?")[0].toUpperCase()}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs text-gray-900 truncate">{p.username || p.firstName || "unknown"}</div>
                          <div className="text-[10px] text-gray-400">
                            {p.role && p.role !== "null" && <span className="text-blue-600">{p.role}</span>}
                            {p.role && p.role !== "null" && p.messageCount > 0 && " · "}
                            {p.messageCount > 0 && `${p.messageCount} msgs`}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            setData((d) => d ? { ...d, people: d.people.map((pp) => pp._id === p._id ? { ...pp, personType: "contact" as const } : pp) } : d);
                            await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateContact", contact: { _id: p._id, personType: "contact" } }) });
                            await fetchData();
                          }}
                          className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors whitespace-nowrap font-medium"
                          title="Move to contacts"
                        >→ contact</button>
                      </div>
                      {(p.context || (p.relationships && p.relationships.length > 0)) && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">How we know them</div>
                          {p.context && <div className="text-xs text-gray-600">{p.context}</div>}
                          {p.relationships && p.relationships.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {p.relationships.map((r, j) => (
                                <div key={j} className="text-[10px] text-gray-500">
                                  <span className="text-gray-400">↔</span> <span className="font-medium text-gray-700">{r.name}</span>
                                  {r.label && <span className="text-blue-600"> [{r.label}]</span>}
                                  {r.context && <span> — {r.context}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(dedupedIntentions.length > 0 || p.resources || p.access) && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">How they can help</div>
                          {dedupedIntentions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-0.5">
                              {dedupedIntentions.map((intent, j) => (
                                <span key={j} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{intent}</span>
                              ))}
                            </div>
                          )}
                          {p.resources && <div className="text-[10px] text-emerald-600">🔑 {p.resources}</div>}
                          {p.access && <div className="text-[10px] text-amber-600">🔓 {p.access}</div>}
                        </div>
                      )}
                      {personTasks.length > 0 && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Tasks ({activeTasks.length} active{doneTasks.length > 0 ? `, ${doneTasks.length} done` : ""})</div>
                          {activeTasks.map((t) => (
                            <div key={t._id} className="flex items-center gap-1.5 text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "upcoming" ? "bg-yellow-400" : "bg-blue-400"}`} />
                              <span className="text-gray-700">{t.title}</span>
                              <span className="text-gray-300 ml-auto">{t.status}</span>
                            </div>
                          ))}
                          {doneTasks.length > 0 && activeTasks.length > 0 && <div className="border-t border-gray-100 mt-1 pt-0.5" />}
                          {doneTasks.slice(0, 3).map((t) => (
                            <div key={t._id} className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-400" />
                              <span className="line-through text-gray-400">{t.title}</span>
                              <span className="text-gray-300 ml-auto">done</span>
                            </div>
                          ))}
                          {doneTasks.length > 3 && <div className="text-[10px] text-gray-400">+{doneTasks.length - 3} more done</div>}
                        </div>
                      )}
                      {p.dumps && p.dumps.length > 0 && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Notes ({p.dumps.length})</div>
                          {p.dumps.map((d, j) => (
                            <div key={d._id || j} className="text-[10px] bg-white border border-gray-100 rounded px-2 py-1 mb-0.5 group/note">
                              {editingDump?.type === "person" && editingDump?.id === d._id ? (
                                <div className="space-y-1">
                                  <textarea autoFocus value={editingDump.text} onChange={(e) => setEditingDump((ed) => ed ? { ...ed, text: e.target.value } : ed)} rows={2} className="w-full px-1.5 py-1 border border-gray-200 rounded text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y" />
                                  <div className="flex gap-1">
                                    <button onClick={saveEditDump} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-medium">Save</button>
                                    <button onClick={() => setEditingDump(null)} className="text-[10px] text-gray-400">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-gray-600">{d.text}</div>
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-gray-300">{formatET(d.createdAt)}</span>
                                    <span className="opacity-0 group-hover/note:opacity-100 flex gap-1.5 transition-opacity">
                                      <button onClick={() => setEditingDump({ type: "person", id: d._id || "", index: j, personId: p._id, text: d.text })} className="text-gray-400 hover:text-blue-600">edit</button>
                                      <button onClick={() => { if (confirm("Delete this note?")) deleteDump("person", d._id || "", j, p._id); }} className="text-gray-400 hover:text-red-500">delete</button>
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 ml-9">
                        {personDumpId === p._id ? (
                          <div className="space-y-1.5">
                            <textarea autoFocus value={personDumpText} onChange={(e) => setPersonDumpText(e.target.value)} placeholder={`Add info about ${p.username || p.firstName || "this person"}...`} rows={2} className="w-full px-2 py-1 border border-gray-200 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y" />
                            <div className="flex gap-1.5">
                              <button onClick={() => submitPersonDump(p._id)} disabled={personDumpSending || !personDumpText.trim()} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-medium disabled:opacity-50">{personDumpSending ? "Saving..." : "Save"}</button>
                              <button onClick={() => { setPersonDumpId(null); setPersonDumpText(""); }} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setPersonDumpId(p._id)} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">+ Add info</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Contacts</h3>
                  <button
                    onClick={() => setShowAddContact(!showAddContact)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showAddContact ? "Cancel" : "+ Add Contact"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">People you work with outside the chat. The AI helps you make thoughtful use of these connections.</p>

                {showAddContact && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                      <input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      <input placeholder="Role / title" value={contactForm.role} onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      <input placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      <input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <input placeholder="Resources / what they bring" value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    <button onClick={addContact} disabled={contactSaving || !contactForm.name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
                      {contactSaving ? "Saving..." : "Add Contact"}
                    </button>
                  </div>
                )}

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {data.people.filter((p) => p.personType === "contact").length === 0 && (
                    <p className="text-sm text-gray-400 italic">No contacts yet.</p>
                  )}
                  {data.people.filter((p) => p.personType === "contact").map((p) => {
                    const pName = (p.username || p.firstName || "").toLowerCase();
                    const personTasks = pName ? data.tasks.filter((t) => t.people?.some((tp) => tp.toLowerCase() === pName)) : [];
                    const activeTasks = personTasks.filter((t) => t.status !== "done");
                    const doneTasks = personTasks.filter((t) => t.status === "done");
                    const dedupedIntentions = [...new Map(p.intentions.map((i) => [i.toLowerCase(), i])).values()];
                    return (
                    <div key={p._id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-600 shrink-0">
                            {(p.username || p.firstName || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-sm text-gray-900">{p.username || p.firstName || "unknown"}</span>
                            {p.role && p.role !== "null" && <div className="text-[10px] text-blue-600">{p.role}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              setData((d) => d ? { ...d, people: d.people.map((pp) => pp._id === p._id ? { ...pp, personType: "member" as const } : pp) } : d);
                              await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateContact", contact: { _id: p._id, personType: "member" } }) });
                              fetchData();
                            }}
                            className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                            title="Move to chat members"
                          >→ member</button>
                          <button onClick={() => deleteContact(p._id)} className="text-[10px] text-red-400 hover:text-red-600">remove</button>
                        </div>
                      </div>
                      {(p.context || (p.relationships && p.relationships.length > 0) || p.email || p.phone) && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">How we know them</div>
                          {p.context && <div className="text-xs text-gray-600">{p.context}</div>}
                          {(p.email || p.phone) && (
                            <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                              {p.email && <span>📧 {p.email}</span>}
                              {p.phone && <span>📱 {p.phone}</span>}
                            </div>
                          )}
                          {p.relationships && p.relationships.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {p.relationships.map((r, j) => (
                                <div key={j} className="text-[10px] text-gray-500">
                                  <span className="text-gray-400">↔</span> <span className="font-medium text-gray-700">{r.name}</span>
                                  {r.label && <span className="text-blue-600"> [{r.label}]</span>}
                                  {r.context && <span> — {r.context}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(dedupedIntentions.length > 0 || p.resources || p.access) && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">How they can help</div>
                          {dedupedIntentions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-0.5">
                              {dedupedIntentions.map((intent, j) => (
                                <span key={j} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{intent}</span>
                              ))}
                            </div>
                          )}
                          {p.resources && <div className="text-[10px] text-emerald-600">🔑 {p.resources}</div>}
                          {p.access && <div className="text-[10px] text-amber-600">🔓 {p.access}</div>}
                        </div>
                      )}
                      {personTasks.length > 0 && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Tasks ({activeTasks.length} active{doneTasks.length > 0 ? `, ${doneTasks.length} done` : ""})</div>
                          {activeTasks.map((t) => (
                            <div key={t._id} className="flex items-center gap-1.5 text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "upcoming" ? "bg-yellow-400" : "bg-blue-400"}`} />
                              <span className="text-gray-700">{t.title}</span>
                              <span className="text-gray-300 ml-auto">{t.status}</span>
                            </div>
                          ))}
                          {doneTasks.length > 0 && activeTasks.length > 0 && <div className="border-t border-gray-100 mt-1 pt-0.5" />}
                          {doneTasks.slice(0, 3).map((t) => (
                            <div key={t._id} className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-400" />
                              <span className="line-through text-gray-400">{t.title}</span>
                              <span className="text-gray-300 ml-auto">done</span>
                            </div>
                          ))}
                          {doneTasks.length > 3 && <div className="text-[10px] text-gray-400">+{doneTasks.length - 3} more done</div>}
                        </div>
                      )}
                      {p.dumps && p.dumps.length > 0 && (
                        <div className="mt-2 ml-9">
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Notes ({p.dumps.length})</div>
                          {p.dumps.map((d, j) => (
                            <div key={d._id || j} className="text-[10px] bg-white border border-gray-100 rounded px-2 py-1 mb-0.5 group/note">
                              {editingDump?.type === "person" && editingDump?.id === d._id ? (
                                <div className="space-y-1">
                                  <textarea autoFocus value={editingDump.text} onChange={(e) => setEditingDump((ed) => ed ? { ...ed, text: e.target.value } : ed)} rows={2} className="w-full px-1.5 py-1 border border-gray-200 rounded text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y" />
                                  <div className="flex gap-1">
                                    <button onClick={saveEditDump} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-medium">Save</button>
                                    <button onClick={() => setEditingDump(null)} className="text-[10px] text-gray-400">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="text-gray-600">{d.text}</div>
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-gray-300">{formatET(d.createdAt)}</span>
                                    <span className="opacity-0 group-hover/note:opacity-100 flex gap-1.5 transition-opacity">
                                      <button onClick={() => setEditingDump({ type: "person", id: d._id || "", index: j, personId: p._id, text: d.text })} className="text-gray-400 hover:text-blue-600">edit</button>
                                      <button onClick={() => { if (confirm("Delete this note?")) deleteDump("person", d._id || "", j, p._id); }} className="text-gray-400 hover:text-red-500">delete</button>
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 ml-9">
                        {personDumpId === p._id ? (
                          <div className="space-y-1.5">
                            <textarea autoFocus value={personDumpText} onChange={(e) => setPersonDumpText(e.target.value)} placeholder={`Add info about ${p.username || p.firstName || "this person"}...`} rows={2} className="w-full px-2 py-1 border border-gray-200 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y" />
                            <div className="flex gap-1.5">
                              <button onClick={() => submitPersonDump(p._id)} disabled={personDumpSending || !personDumpText.trim()} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-medium disabled:opacity-50">{personDumpSending ? "Saving..." : "Save"}</button>
                              <button onClick={() => { setPersonDumpId(null); setPersonDumpText(""); }} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setPersonDumpId(p._id)} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">+ Add info</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {showActions && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
                {([
                  { key: "todo", label: "Add Todo" },
                  { key: "upcoming", label: "Add Upcoming" },
                  { key: "done", label: "Log Done" },
                  { key: "person", label: "Add Person" },
                  { key: "status", label: "Change Status" },
                  { key: "dump", label: "Dump Info" },
                ] as { key: string; label: string }[]).map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setActionForm((f) => ({ ...f, type: a.key }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      actionForm.type === a.key
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {actionForm.type === "person" ? (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Name</label>
                    <input
                      value={actionForm.personName}
                      onChange={(e) => setActionForm((f) => ({ ...f, personName: e.target.value }))}
                      placeholder="Person name"
                      onKeyDown={(e) => { if (e.key === "Enter") runAction(); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Role</label>
                    <input
                      value={actionForm.personRole}
                      onChange={(e) => setActionForm((f) => ({ ...f, personRole: e.target.value }))}
                      placeholder="Role (optional)"
                      onKeyDown={(e) => { if (e.key === "Enter") runAction(); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <button
                    onClick={runAction}
                    disabled={actionSaving || !actionForm.personName.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
                  >
                    {actionSaving ? "Adding..." : "Add"}
                  </button>
                </div>
              ) : actionForm.type === "status" ? (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Search task</label>
                    <input
                      value={actionForm.statusTaskSearch}
                      onChange={(e) => setActionForm((f) => ({ ...f, statusTaskSearch: e.target.value }))}
                      placeholder="Type to find task..."
                      onKeyDown={(e) => { if (e.key === "Enter") runAction(); }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    {actionForm.statusTaskSearch && data && (
                      <div className="mt-1 space-y-0.5">
                        {data.tasks
                          .filter((t) => t.title.toLowerCase().includes(actionForm.statusTaskSearch.toLowerCase()))
                          .slice(0, 5)
                          .map((t) => (
                            <div key={t._id} className="text-xs text-gray-500 px-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${t.status === "done" ? "bg-green-400" : t.status === "upcoming" ? "bg-yellow-400" : "bg-blue-400"}`} />
                              {t.title} <span className="text-gray-400">({t.status})</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="w-full sm:w-36">
                    <label className="text-xs text-gray-500 mb-1 block">New status</label>
                    <select
                      value={actionForm.statusNewStatus}
                      onChange={(e) => setActionForm((f) => ({ ...f, statusNewStatus: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="todo">Todo</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <button
                    onClick={runAction}
                    disabled={actionSaving || !actionForm.statusTaskSearch.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
                  >
                    {actionSaving ? "Updating..." : "Update"}
                  </button>
                </div>
              ) : actionForm.type === "dump" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={actionForm.dumpCategory || "general"}
                      onChange={(e) => setActionForm((f) => ({ ...f, dumpCategory: e.target.value }))}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="general">General</option>
                      <option value="person">Person</option>
                      <option value="business">Business</option>
                      <option value="event">Event</option>
                      <option value="initiative">Initiative</option>
                    </select>
                    {(actionForm.dumpCategory || "general") !== "general" && (
                      <input
                        value={actionForm.dumpSubject || ""}
                        onChange={(e) => setActionForm((f) => ({ ...f, dumpSubject: e.target.value }))}
                        placeholder={`${(actionForm.dumpCategory || "person").charAt(0).toUpperCase() + (actionForm.dumpCategory || "person").slice(1)} name...`}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    )}
                  </div>
                  <div>
                    <textarea
                      value={actionForm.dumpText}
                      onChange={(e) => setActionForm((f) => ({ ...f, dumpText: e.target.value }))}
                      placeholder={((actionForm.dumpCategory || "general") === "general") ? "Paste notes, context, meeting transcripts, links..." : `Info about this ${actionForm.dumpCategory}...`}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
                    />
                  </div>
                  <button
                    onClick={runAction}
                    disabled={actionSaving || !actionForm.dumpText.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {actionSaving ? "Processing..." : "Submit Dump"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Task</label>
                      <input
                        value={actionForm.title}
                        onChange={(e) => setActionForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="What needs to be done?"
                        onKeyDown={(e) => { if (e.key === "Enter") runAction(); }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="w-full sm:w-40">
                      <label className="text-xs text-gray-500 mb-1 block">Due date</label>
                      <input
                        type="date"
                        value={actionForm.dueDate}
                        onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <button
                      onClick={runAction}
                      disabled={actionSaving || !actionForm.title.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
                    >
                      {actionSaving ? "Adding..." : "Add"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-400">People:</span>
                      {data.people.map((p) => {
                        const name = p.username || p.firstName || "";
                        if (!name) return null;
                        const isSelected = actionForm.taskPeople.includes(name);
                        return (
                          <button
                            key={p._id}
                            onClick={() => setActionForm((f) => ({
                              ...f,
                              taskPeople: isSelected ? f.taskPeople.filter((n) => n !== name) : [...f.taskPeople, name],
                            }))}
                            className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium transition-all ${isSelected ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200"}`}
                          >
                            {isSelected ? "✓ " : ""}{name}
                          </button>
                        );
                      })}
                    </div>
                    {(data.initiatives || []).length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">Initiative:</span>
                        <select
                          value={actionForm.taskInitiative}
                          onChange={(e) => setActionForm((f) => ({ ...f, taskInitiative: e.target.value }))}
                          className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="">None</option>
                          {(data.initiatives || []).map((ini) => (
                            <option key={ini.id} value={ini.id}>{ini.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {actionDone && (
                <div className="mt-3 text-sm text-green-600 font-medium">{actionDone}</div>
              )}
            </div>
          )}
          {showContext && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              {data.chat.contextSummary ? (
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{data.chat.contextSummary}</div>
              ) : (
                <p className="text-sm text-gray-400 italic">No context yet. The AI builds this automatically as conversations happen.</p>
              )}
              {data.chat.dumps && data.chat.dumps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 mb-2">Past Dumps ({data.chat.dumps.length})</div>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {data.chat.dumps.map((d, i) => (
                      <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 group/chatdump">
                        <div className="flex items-center gap-1.5 mb-1">
                          {d.category && d.category !== "general" && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${d.category === "person" ? "bg-indigo-100 text-indigo-700" : d.category === "business" ? "bg-emerald-100 text-emerald-700" : d.category === "initiative" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"}`}>
                              {d.category}
                            </span>
                          )}
                          {d.subject && <span className="text-xs font-medium text-gray-700">{d.subject}</span>}
                        </div>
                        {editingDump?.type === "chat" && editingDump?.index === i ? (
                          <div className="space-y-1.5">
                            <textarea autoFocus value={editingDump.text} onChange={(e) => setEditingDump((ed) => ed ? { ...ed, text: e.target.value } : ed)} rows={3} className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y" />
                            <div className="flex gap-1.5">
                              <button onClick={saveEditDump} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-medium">Save</button>
                              <button onClick={() => setEditingDump(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm text-gray-700">{d.text}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-gray-400">{formatET(d.createdAt)} · {d.source}</span>
                              <span className="opacity-0 group-hover/chatdump:opacity-100 flex gap-2 transition-opacity">
                                <button onClick={() => setEditingDump({ type: "chat", id: "", index: i, text: d.text })} className="text-xs text-gray-400 hover:text-blue-600">edit</button>
                                <button onClick={() => { if (confirm("Delete this dump?")) deleteDump("chat", "", i); }} className="text-xs text-gray-400 hover:text-red-500">delete</button>
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {showDump && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-3">Paste notes, context, meeting transcripts, links — anything to get the AI up to speed.</p>
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={dumpCategory}
                  onChange={(e) => setDumpCategory(e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="general">General</option>
                  <option value="person">Person</option>
                  <option value="business">Business</option>
                  <option value="event">Event</option>
                  <option value="initiative">Initiative</option>
                </select>
                {dumpCategory !== "general" && (
                  <input
                    value={dumpSubject}
                    onChange={(e) => setDumpSubject(e.target.value)}
                    placeholder={dumpCategory === "person" ? "Person name..." : dumpCategory === "business" ? "Business name..." : dumpCategory === "initiative" ? "Initiative name..." : "Event name..."}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                )}
              </div>
              <textarea
                value={dumpText}
                onChange={(e) => setDumpText(e.target.value)}
                placeholder={dumpCategory === "general" ? "Paste information here..." : `Info about this ${dumpCategory}...`}
                rows={4}
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
                  <span className="text-sm text-green-600 font-medium">Processed and indexed</span>
                )}
              </div>
            </div>
          )}
          {showGuidance && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <p className="text-sm text-gray-500 mb-3">Custom instructions for how the AI should behave in this chat.</p>
              <textarea
                value={guidanceText}
                onChange={(e) => { setGuidanceText(e.target.value); setGuidanceSaved(false); }}
                placeholder="e.g. Always respond in Spanish. Focus on dev tasks. Don't mention competitor X..."
                rows={4}
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
          )}
          {showWallet && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Wallet</h3>
                {data.walletAddress && (
                  <a
                    href={`https://basescan.org/address/${data.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 font-mono"
                  >
                    {data.walletAddress.slice(0, 6)}...{data.walletAddress.slice(-4)} ↗
                  </a>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center mb-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{data.spend.totalCalls}</div>
                  <div className="text-xs text-gray-500">API Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{(data.spend.totalTokens / 1000).toFixed(1)}k</div>
                  <div className="text-xs text-gray-500">Total Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">${data.spend.totalCost.toFixed(4)}</div>
                  <div className="text-xs text-gray-500">Est. Cost</div>
                </div>
              </div>
              {Object.keys(data.spend.byType).length > 0 && (
                <div className="pt-3 border-t border-gray-100 space-y-1.5 mb-4">
                  {Object.entries(data.spend.byType).map(([type, stats]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-gray-500">{type}</span>
                      <span className="text-gray-700">{stats.calls} calls · {(stats.tokens / 1000).toFixed(1)}k tok</span>
                    </div>
                  ))}
                </div>
              )}
              {data.recentSpends.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Recent</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {data.recentSpends.map((s, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600 truncate mr-3">{s.label}</span>
                        <span className="text-gray-400 whitespace-nowrap">
                          {s.tokens ? `${s.tokens} tok` : s.type}
                          {" · "}
                          {formatET(s.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {showWatch && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
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
            </div>
          )}

          {showAbilities && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Team Abilities & Resources</h3>
              <p className="text-xs text-gray-500 mb-3">Describe what you and your team can do — skills, tools, access, budget. The AI uses this to tailor task breakdowns and subtask steps to what&apos;s actually achievable.</p>
              <textarea
                value={abilitiesDraft}
                onChange={(e) => setAbilitiesDraft(e.target.value)}
                placeholder="e.g. We can code in TypeScript/Python, have access to Figma, $500/mo budget for tools, can do video editing in DaVinci..."
                className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  disabled={abilitiesSaving}
                  onClick={async () => {
                    setAbilitiesSaving(true);
                    setData((d) => d ? { ...d, chat: { ...d.chat, abilities: abilitiesDraft } } : d);
                    await fetch("/api/dashboard", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ token, abilities: abilitiesDraft }),
                    });
                    setAbilitiesSaving(false);
                    await fetchData();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {abilitiesSaving ? "Saving..." : "Save"}
                </button>
                <span className="text-xs text-gray-400">Used by AI when generating subtask steps</span>
              </div>
            </div>
          )}

          {showDataSources && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Data Sources</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Toggle individual endpoints. Each fetch is stored as a snapshot for trend analysis.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={dsLoading}
                    onClick={async () => {
                      setDsLoading(true);
                      setDsInsights(null);
                      try {
                        const res = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "fetchDataSources" }),
                        });
                        const json = await res.json();
                        setDsFetchedData(json.data || []);
                        const countsRes = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "getSnapshotCounts" }),
                        });
                        const countsJson = await countsRes.json();
                        setDsSnapCounts(countsJson.counts || []);
                      } catch { /* ignore */ }
                      setDsLoading(false);
                      await fetchData();
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium border bg-white text-gray-600 border-gray-200 hover:border-gray-400 disabled:opacity-50 transition-all"
                  >
                    {dsLoading ? "Fetching..." : "Fetch & Store"}
                  </button>
                  <button
                    disabled={dsLoading}
                    onClick={async () => {
                      setDsLoading(true);
                      setDsInsights(null);
                      try {
                        const res = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "analyzeDataSources" }),
                        });
                        const json = await res.json();
                        setDsInsights(json.insights || "No insights.");
                        const countsRes = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "getSnapshotCounts" }),
                        });
                        const countsJson = await countsRes.json();
                        setDsSnapCounts(countsJson.counts || []);
                      } catch { /* ignore */ }
                      setDsLoading(false);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {dsLoading ? "Analyzing..." : "Analyze w/ Trends"}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {(data.availableDataSources || []).map((source: { id: string; name: string; description: string; configured: boolean; endpoints: { id: string; description: string }[] }) => (
                  <div key={source.id} className="rounded-lg border border-gray-100 bg-gray-50/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-100/80 border-b border-gray-100">
                      <span className="text-sm font-medium text-gray-800">{source.name}</span>
                      {source.configured ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">API key set</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Missing key</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{source.description}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {source.endpoints.map((ep) => {
                        const chatDs = (data.chat.dataSources || []).find(
                          (ds: { sourceId: string; endpointId: string }) => ds.sourceId === source.id && ds.endpointId === ep.id
                        );
                        const isOn = chatDs?.enabled ?? false;
                        const snapInfo = dsSnapCounts.find((s) => s.sourceId === source.id && s.endpointId === ep.id);
                        const dsKey = `ds-${source.id}-${ep.id}`;
                        const isDsExpanded = expandedSnap === dsKey;
                        const latestDate = snapInfo?.latest || chatDs?.lastFetchAt;
                        const isStale = latestDate ? Date.now() - new Date(latestDate).getTime() > 24 * 60 * 60 * 1000 : false;
                        return (
                          <div key={ep.id}>
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              <button
                                onClick={async () => {
                                  await fetch("/api/dashboard", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ token, action: "toggleEndpoint", sourceId: source.id, endpointId: ep.id }),
                                  });
                                  await fetchData();
                                }}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${isOn ? "bg-green-500" : "bg-gray-300"}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isOn ? "translate-x-4" : "translate-x-0.5"}`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <code className="text-xs font-medium text-gray-700">{ep.id}</code>
                                  <span className="text-[10px] text-gray-400">{ep.description}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {snapInfo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{snapInfo.count} snapshot{snapInfo.count !== 1 ? "s" : ""}</span>
                                )}
                                {latestDate && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isStale ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{timeAgo(latestDate)}</span>
                                )}
                                {snapInfo && snapInfo.count > 0 && (
                                  <button
                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
                                    onClick={async () => {
                                      if (isDsExpanded) { setExpandedSnap(null); return; }
                                      setExpandedSnap(dsKey);
                                      if (!expandedSnapData[dsKey]) {
                                        setExpandedSnapLoading(dsKey);
                                        try {
                                          const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "getSnapshotHistory", sourceId: source.id, endpointId: ep.id, limit: 3 }) });
                                          const json = await res.json();
                                          setExpandedSnapData((prev) => ({ ...prev, [dsKey]: json.history || [] }));
                                        } catch { setExpandedSnapData((prev) => ({ ...prev, [dsKey]: [] })); }
                                        setExpandedSnapLoading(null);
                                      }
                                    }}
                                  >{isDsExpanded ? "Hide ▲" : "View ▼"}</button>
                                )}
                              </div>
                            </div>
                            {isDsExpanded && (
                              <div className="px-3 pb-3 bg-gray-50/50 ml-12">
                                {expandedSnapLoading === dsKey ? (
                                  <p className="text-[10px] text-gray-400 py-2">Loading...</p>
                                ) : (expandedSnapData[dsKey] || []).length === 0 ? (
                                  <p className="text-[10px] text-gray-400 py-2">No snapshots stored yet.</p>
                                ) : (
                                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {(expandedSnapData[dsKey] || []).map((h, i) => (
                                      <div key={i} className="bg-white rounded-lg border border-gray-100 p-2">
                                        <p className="text-[10px] text-gray-400 mb-1 font-medium">{new Date(h.fetchedAt).toLocaleString()} ({timeAgo(h.fetchedAt)})</p>
                                        <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">{renderJsonWithLinks(h.data)}</pre>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {(data.availableDataSources || []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No data sources registered yet.</p>
                )}
              </div>

              {dsFetchedData && dsFetchedData.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">Latest Fetch</h4>
                  <div className="max-h-[300px] overflow-y-auto bg-gray-50 rounded-lg p-3">
                    {dsFetchedData.map((d, i) => (
                      <div key={i} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-medium text-gray-500">{d.sourceId}/{d.endpointId}</p>
                          {d.error && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">{d.error}</span>}
                          {!d.error && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">stored</span>}
                        </div>
                        {d.data && <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-all">{JSON.stringify(d.data, null, 2).substring(0, 3000)}</pre>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dsInsights && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">AI Analysis (with trend data)</h4>
                  <div className="prose prose-sm max-w-none text-sm text-gray-700 whitespace-pre-wrap">{dsInsights}</div>
                </div>
              )}
            </div>
          )}

          {showSocial && (
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">Social Media Query</h3>
                  {data.socialConfigured ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Wallet connected</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">APINOW_PRIVATE_KEY not set</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Pull social media data via apinow proxy. $0.07/request ($0.06 upstream + $0.01 proxy, USDC on Base).</p>
                <button
                  className="mt-1 text-[10px] text-indigo-500 underline hover:text-indigo-700"
                  onClick={async () => {
                    const r = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "testSocial" }) });
                    const j = await r.json();
                    console.log("testSocial result:", JSON.stringify(j.steps, null, 2));
                  }}
                >Run connection test</button>
              </div>

              {socialSnapshots.length > 0 && (
                <div className="mb-4 border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-700">Collected Data</h4>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {socialSnapshots.map((s) => {
                      const platform = s.sourceId.replace("social-", "");
                      const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
                      const handle = s.params?.handle || s.params?.profile_id || s.params?.query || s.params?.post_id || "";
                      const snapKey = `social-${platform}-${s.endpointId}`;
                      const isExpanded = expandedSnap === snapKey;
                      const isStale = Date.now() - new Date(s.latest).getTime() > 24 * 60 * 60 * 1000;
                      return (
                        <div key={snapKey}>
                          <button
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                            onClick={async () => {
                              if (isExpanded) { setExpandedSnap(null); return; }
                              setExpandedSnap(snapKey);
                              if (!expandedSnapData[snapKey]) {
                                setExpandedSnapLoading(snapKey);
                                try {
                                  const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "getSocialHistory", platform, endpoint: s.endpointId, limit: 3 }) });
                                  const json = await res.json();
                                  setExpandedSnapData((prev) => ({ ...prev, [snapKey]: json.history || [] }));
                                } catch { setExpandedSnapData((prev) => ({ ...prev, [snapKey]: [] })); }
                                setExpandedSnapLoading(null);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.pollStatus === "finished" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                                {s.pollStatus === "finished" ? "✓" : "⏳"}
                              </span>
                              <span className="text-xs font-medium text-gray-800">{platformLabel}</span>
                              <span className="text-[11px] text-gray-500">{s.endpointId}</span>
                              {handle && <span className="text-[10px] text-gray-400 font-mono">@{handle}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-right">
                              <span className="text-[10px] text-gray-400">{s.count} call{s.count !== 1 ? "s" : ""}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isStale ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{timeAgo(s.latest)}</span>
                              <span className="text-[10px] text-gray-300">{isExpanded ? "▲" : "▼"}</span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 bg-gray-50/50">
                              {expandedSnapLoading === snapKey ? (
                                <p className="text-[10px] text-gray-400 py-2">Loading...</p>
                              ) : (expandedSnapData[snapKey] || []).length === 0 ? (
                                <p className="text-[10px] text-gray-400 py-2">No data stored yet.</p>
                              ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                  {(expandedSnapData[snapKey] || []).map((h, i) => (
                                    <div key={i} className="bg-white rounded-lg border border-gray-100 p-2">
                                      <p className="text-[10px] text-gray-400 mb-1 font-medium">{new Date(h.fetchedAt).toLocaleString()} ({timeAgo(h.fetchedAt)})</p>
                                      <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">{renderJsonWithLinks(h.data)}</pre>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {pendingJobs.length > 0 && (
                <div className="mb-4 border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                  <div className="bg-amber-50 px-3 py-2 border-b border-amber-200">
                    <h4 className="text-xs font-semibold text-amber-800">Pending Jobs ({pendingJobs.length})</h4>
                    <p className="text-[10px] text-amber-600 mt-0.5">Payment completed — waiting for results. Retry is free.</p>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {pendingJobs.map((job) => {
                      const platformLabel = job.platform.charAt(0).toUpperCase() + job.platform.slice(1);
                      const handle = job.params?.handle || job.params?.profile_id || job.params?.query || "";
                      const isRetrying = retryingJob === job.id;
                      return (
                        <div key={job.id} className="flex items-center justify-between px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
                              {job.pollStatus === "timeout" ? "⏱ timed out" : "⏳ pending"}
                            </span>
                            <span className="text-xs font-medium text-gray-800">{platformLabel}</span>
                            <span className="text-[11px] text-gray-500">{job.endpointId}</span>
                            {handle && <span className="text-[10px] text-gray-400 font-mono">@{handle}</span>}
                            <span className="text-[10px] text-gray-400">{job.cost}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">{timeAgo(job.fetchedAt)}</span>
                            <button
                              disabled={isRetrying}
                              onClick={async () => {
                                setRetryingJob(job.id);
                                try {
                                  const res = await fetch("/api/dashboard", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ token, action: "pollSocialJob", jobToken: job.jobToken, snapshotId: job.id, platform: job.platform, endpoint: job.endpointId, params: job.params, deadlineMs: 25000 }),
                                  });
                                  const json = await res.json();
                                  if (json.status === "finished" && json.data) {
                                    setSocialResult({ data: json.data as Record<string, unknown>, cost: job.cost, pollStatus: "finished" });
                                    refreshSocialSnapshots();
                                    refreshPendingJobs();
                                  } else {
                                    refreshPendingJobs();
                                  }
                                } catch {}
                                setRetryingJob(null);
                              }}
                              className="px-2.5 py-1 bg-amber-600 text-white text-[10px] font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                            >
                              {isRetrying ? (
                                <>
                                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                                  Polling…
                                </>
                              ) : "Retry Poll"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Platform</label>
                  <select
                    value={socialPlatform}
                    onChange={async (e) => {
                      const p = e.target.value;
                      setSocialPlatform(p);
                      setSocialEndpoint("");
                      setSocialParams({});
                      setSocialResult(null);
                      setSocialHistory([]);
                      if (p) {
                        try {
                          const res = await fetch("/api/dashboard", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token, action: "getSocialEndpoints", platform: p }),
                          });
                          const json = await res.json();
                          setSocialEndpoints(json.endpoints || []);
                        } catch { setSocialEndpoints([]); }
                      } else {
                        setSocialEndpoints([]);
                      }
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                  >
                    <option value="">Select platform...</option>
                    {(data.socialPlatforms || []).map((p: { id: string; label: string; endpointCount: number }) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.endpointCount} endpoints)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Endpoint</label>
                  <select
                    value={socialEndpoint}
                    onChange={(e) => {
                      setSocialEndpoint(e.target.value);
                      setSocialResult(null);
                      const ep = socialEndpoints.find((ep) => ep.id === e.target.value);
                      if (ep) {
                        const defaults: Record<string, string> = {};
                        for (const param of ep.params) {
                          defaults[param.name] = socialParams[param.name] || param.default || "";
                        }
                        setSocialParams(defaults);
                      }
                    }}
                    disabled={!socialPlatform}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Select endpoint...</option>
                    {socialEndpoints.map((ep) => (
                      <option key={ep.id} value={ep.id}>{ep.id} — {ep.description}{ep.dependsOn ? ` (needs ${ep.dependsOn} first)` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {socialEndpoint && (() => {
                const ep = socialEndpoints.find((e) => e.id === socialEndpoint);
                if (!ep) return null;
                return (
                  <div className="mb-4">
                    {ep.dependsOn && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded mb-2">Depends on <strong>{ep.dependsOn}</strong> — run that endpoint first for best results.</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ep.params.map((param) => {
                        const enumMatch = param.description.match(/\(([a-z0-9_]+(?:,\s*[a-z0-9_]+)+)\)/i);
                        const options = enumMatch ? enumMatch[1].split(/,\s*/) : null;
                        return (
                          <div key={param.name}>
                            <label className="text-[10px] font-medium text-gray-500 mb-0.5 block">
                              {param.name}{param.required && <span className="text-red-400">*</span>} <span className="font-normal text-gray-400">— {param.description}</span>
                            </label>
                            {options ? (
                              <select
                                value={socialParams[param.name] || ""}
                                onChange={(e) => setSocialParams((p) => ({ ...p, [param.name]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                              >
                                {!param.default && <option value="">Select...</option>}
                                {options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                value={socialParams[param.name] || ""}
                                onChange={(e) => setSocialParams((p) => ({ ...p, [param.name]: e.target.value }))}
                                placeholder={param.description}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3">
                <button
                  disabled={socialLoading || !socialPlatform || !socialEndpoint}
                  onClick={async () => {
                    setSocialLoading(true);
                    setSocialResult(null);
                    try {
                      const res = await fetch("/api/dashboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token, action: "querySocial", platform: socialPlatform, endpoint: socialEndpoint, params: socialParams }),
                      });
                      const json = await res.json();
                      setSocialResult({ data: json.data, cost: json.cost, error: json.error, jobToken: json.jobToken, pollStatus: json.pollStatus, snapshotId: json.snapshotId });
                      refreshPendingJobs();
                      const histRes = await fetch("/api/dashboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token, action: "getSocialHistory", platform: socialPlatform, endpoint: socialEndpoint, limit: 5 }),
                      });
                      const histJson = await histRes.json();
                      setSocialHistory(histJson.history || []);
                      refreshSocialSnapshots();
                    } catch (err) {
                      setSocialResult({ data: null, cost: "$0.00", error: String(err) });
                    }
                    setSocialLoading(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-2"
                >
                  {socialLoading ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                      Querying + Polling…
                    </>
                  ) : "Query & Fetch ($0.07)"}
                </button>
                {socialResult?.cost && !socialResult.error && (
                  <span className="text-[10px] px-2 py-1 rounded bg-green-50 text-green-600 font-medium">
                    {socialResult.cost} — {socialResult.pollStatus === "finished" ? "data received & stored" : socialResult.pollStatus === "timeout" ? "poll timed out (can retry)" : socialResult.pollStatus === "pending" ? "job pending" : "stored as snapshot"}
                  </span>
                )}
                {socialResult?.error && (
                  <span className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-500 font-medium">{socialResult.error}</span>
                )}
                {socialResult?.jobToken && socialResult.pollStatus !== "finished" && (
                  <button
                    disabled={pollLoading}
                    onClick={async () => {
                      setPollLoading(true);
                      try {
                        const res = await fetch("/api/dashboard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token, action: "pollSocialJob", jobToken: socialResult.jobToken, snapshotId: socialResult.snapshotId, platform: socialPlatform, endpoint: socialEndpoint, params: socialParams, deadlineMs: 25000 }),
                        });
                        const json = await res.json();
                        if (json.status === "finished" && json.data) {
                          setSocialResult((prev) => prev ? { ...prev, data: json.data, pollStatus: "finished", error: undefined } : prev);
                          const histRes = await fetch("/api/dashboard", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token, action: "getSocialHistory", platform: socialPlatform, endpoint: socialEndpoint, limit: 5 }),
                          });
                          const histJson = await histRes.json();
                          setSocialHistory(histJson.history || []);
                          refreshSocialSnapshots();
                          refreshPendingJobs();
                        } else if (json.status === "failed") {
                          setSocialResult((prev) => prev ? { ...prev, pollStatus: "failed", error: json.error } : prev);
                        }
                      } catch (err) {
                        setSocialResult((prev) => prev ? { ...prev, error: `Poll error: ${err}` } : prev);
                      }
                      setPollLoading(false);
                    }}
                    className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5"
                  >
                    {pollLoading ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                        Polling…
                      </>
                    ) : "Retry Poll"}
                  </button>
                )}
              </div>

              {socialResult?.data && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">
                    {socialResult.pollStatus === "finished" ? "Result" : socialResult.pollStatus === "timeout" ? "Partial (Job Token)" : socialResult.pollStatus === "pending" ? "Pending…" : "Result"}
                  </h4>
                  {socialResult.pollStatus !== "finished" && socialResult.jobToken && (
                    <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-[11px] text-amber-700">Payment succeeded. Job submitted — polling via SIWX wallet auth{socialResult.pollStatus === "timeout" ? " timed out. Click Retry Poll to continue." : "."}</p>
                      <p className="text-[10px] text-amber-600 mt-1 font-mono break-all">Token: {socialResult.jobToken.substring(0, 80)}…</p>
                    </div>
                  )}
                  <div className="max-h-[400px] overflow-y-auto bg-gray-50 rounded-lg p-3">
                    <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-all">{renderJsonWithLinks(socialResult.data)}</pre>
                  </div>
                </div>
              )}

              {socialHistory.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">Previous Snapshots ({socialHistory.length})</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {socialHistory.map((h, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[10px] text-gray-400 mb-1">{new Date(h.fetchedAt).toLocaleString()}</p>
                        <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all">{renderJsonWithLinks(h.data)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Task Board */}
        <section className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Tasks <span className="text-sm font-normal text-gray-400">({filteredTasks.length})</span></h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {([
                  { key: "todo", label: "Todo", count: allTasks.filter((t) => t.status === "todo").length },
                  { key: "upcoming", label: "Upcoming", count: allTasks.filter((t) => t.status === "upcoming").length },
                  { key: "done", label: "Done", count: allTasks.filter((t) => t.status === "done").length },
                ] as { key: string; label: string; count: number }[]).map((f) => {
                  const active = taskFilters.has(f.key);
                  return (
                    <button
                      key={f.key}
                      onClick={() => {
                        setTaskFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.key)) { if (next.size > 1) next.delete(f.key); }
                          else next.add(f.key);
                          localStorage.setItem("taskFilters", JSON.stringify([...next]));
                          return next;
                        });
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        active
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {f.label} ({f.count})
                    </button>
                  );
                })}
              </div>
              <button
                disabled={categorizing}
                onClick={async () => {
                  setCategorizing(true);
                  await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "categorizeTasks" }) });
                  await fetchData();
                  setCategorizing(false);
                }}
                className="text-[10px] text-gray-400 hover:text-gray-600 font-medium transition-colors disabled:opacity-50"
              >{categorizing ? "..." : activeTasks.some((t) => !t.categories || t.categories.length === 0) && allCategories.length > 0 ? "⟳ Re-categorize" : "⟳ Categorize"}</button>
              <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
                <button onClick={() => { setTaskViewMode("list"); localStorage.setItem("taskViewMode", "list"); }} className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${taskViewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>List</button>
                {allCategories.length > 0 && (
                  <button
                    disabled={categorizing}
                    onClick={async () => {
                      if (taskViewMode === "categories") { setTaskViewMode("list"); localStorage.setItem("taskViewMode", "list"); return; }
                      if (allCategories.length === 0) {
                        setCategorizing(true);
                        await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "categorizeTasks" }) });
                        await fetchData();
                        setCategorizing(false);
                      }
                      setTaskViewMode("categories");
                      localStorage.setItem("taskViewMode", "categories");
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${taskViewMode === "categories" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"} disabled:opacity-50`}
                  >{categorizing ? "..." : "Categories"}</button>
                )}
                <button
                  disabled={prioritizing}
                  onClick={async () => {
                    if (taskViewMode === "priorities") { setTaskViewMode("list"); localStorage.setItem("taskViewMode", "list"); return; }
                    const hasPriorities = activeTasks.some((t) => (t.priorityScore ?? 0) > 0);
                    if (!hasPriorities) {
                      setPrioritizing(true);
                      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "prioritizeTasks" }) });
                      await fetchData();
                      setPrioritizing(false);
                    }
                    setTaskViewMode("priorities");
                    localStorage.setItem("taskViewMode", "priorities");
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${taskViewMode === "priorities" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"} disabled:opacity-50`}
                >{prioritizing ? "..." : "Priorities"}</button>
              </div>
            </div>
          </div>

          {taskViewMode === "priorities" ? (
            <div className="mb-4">
              {data.chat.priorityNarrative && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-amber-900">State of the Board</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {data.chat.lastPrioritizedAt && (
                        <span className="text-[10px] text-amber-500">{timeAgo(data.chat.lastPrioritizedAt)}</span>
                      )}
                      <button
                        disabled={prioritizing}
                        onClick={async () => {
                          setPrioritizing(true);
                          await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "prioritizeTasks" }) });
                          await fetchData();
                          setPrioritizing(false);
                        }}
                        className="text-[10px] text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
                      >{prioritizing ? "Re-prioritizing..." : "Re-prioritize"}</button>
                    </div>
                  </div>
                  <div className="text-sm text-amber-800 leading-relaxed whitespace-pre-line [&>p]:mb-2" dangerouslySetInnerHTML={{ __html: data.chat.priorityNarrative.replace(/\*\*(.+?)\*\*/g, '<strong class="text-amber-900">$1</strong>') }} />
                </div>
              )}
              {data.chat.leveragePlay && (
                <div className="bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50 border border-purple-200 rounded-xl p-4 mb-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-purple-100/50 rounded-full -translate-y-8 translate-x-8" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-purple-600">Leverage Play</span>
                      <span className="text-[10px] text-purple-400 font-medium bg-purple-100 rounded-full px-2 py-0.5">high-conviction unlock</span>
                    </div>
                    <div className="text-sm text-purple-900 leading-relaxed" dangerouslySetInnerHTML={{ __html: data.chat.leveragePlay.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
                  </div>
                </div>
              )}
              
              {!data.chat.priorityNarrative && !prioritizing && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-4 text-center">
                  <p className="text-sm text-gray-500 mb-3">No priorities analyzed yet. Run the AI to score tasks by momentum, impact, effort, and switching costs.</p>
                  <button
                    onClick={async () => {
                      setPrioritizing(true);
                      await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "prioritizeTasks" }) });
                      await fetchData();
                      setPrioritizing(false);
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                  >Analyze Priorities</button>
                </div>
              )}
              {prioritizing && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-4 text-center">
                  <div className="animate-pulse text-sm text-amber-700">Analyzing tasks against momentum, resources, switching costs, and expected return...</div>
                </div>
              )}
              {(() => {
                const ranked = [...activeTasks].filter((t) => t.status !== "done").sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
                const autoCount = ranked.filter((t) => t.executionType === "automated").length;
                const humanCount = ranked.filter((t) => t.executionType === "human").length;
                const hybridCount = ranked.filter((t) => t.executionType === "hybrid").length;
                const hasCostData = ranked.some((t) => t.costEstimate || t.revenueEstimate);
                const inMotion = ranked.filter((t) => t.momentum === "in-motion");
                const blocked = ranked.filter((t) => t.momentum === "blocked" || t.blockedBy || t.waitingOn);
                const newIdeas = ranked.filter((t) => t.momentum === "new" && !t.blockedBy && !t.waitingOn);
                const stalled = ranked.filter((t) => t.momentum === "stalled" && !t.blockedBy && !t.waitingOn);
                const momentumColors: Record<string, string> = {
                  "in-motion": "bg-green-100 text-green-700 border-green-200",
                  "new": "bg-blue-100 text-blue-700 border-blue-200",
                  "stalled": "bg-yellow-100 text-yellow-700 border-yellow-200",
                  "blocked": "bg-red-100 text-red-700 border-red-200",
                };
                const impactColors: Record<string, string> = {
                  high: "text-green-700 bg-green-50",
                  medium: "text-yellow-700 bg-yellow-50",
                  low: "text-gray-500 bg-gray-50",
                };
                const effortColors: Record<string, string> = {
                  low: "text-green-600",
                  medium: "text-yellow-600",
                  high: "text-red-600",
                };
                const execColors: Record<string, string> = {
                  automated: "bg-cyan-100 text-cyan-700 border-cyan-200",
                  human: "bg-orange-100 text-orange-700 border-orange-200",
                  hybrid: "bg-violet-100 text-violet-700 border-violet-200",
                };
                const execIcons: Record<string, string> = { automated: "⚡", human: "👤", hybrid: "🔄" };
                const renderPriorityTask = (t: typeof ranked[0]) => (
                  <div key={t._id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                    <div className="shrink-0 w-10 text-center">
                      <div className={`text-lg font-bold ${(t.priorityScore ?? 0) >= 70 ? "text-green-600" : (t.priorityScore ?? 0) >= 40 ? "text-yellow-600" : "text-gray-400"}`}>
                        {t.priorityScore ?? "–"}
                      </div>
                      <div className="text-[8px] text-gray-400 uppercase">score</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">{t.title}</span>
                        <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 border ${momentumColors[t.momentum || "new"]}`}>{t.momentum || "new"}</span>
                        {t.executionType && (
                          <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 border ${execColors[t.executionType]}`}>
                            {execIcons[t.executionType]} {t.executionType}
                          </span>
                        )}
                        {t.impact && <span className={`text-[9px] font-medium rounded px-1 py-0.5 ${impactColors[t.impact]}`}>impact: {t.impact}</span>}
                        {t.effort && <span className={`text-[9px] font-medium ${effortColors[t.effort]}`}>effort: {t.effort}</span>}
                      </div>
                      {t.priorityReason && <p className="text-xs text-gray-500 mt-0.5">{t.priorityReason}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {(t.costEstimate || t.revenueEstimate) && (
                          <span className="text-[10px] font-medium">
                            {t.costEstimate && <span className="text-red-500">cost: {t.costEstimate}</span>}
                            {t.costEstimate && t.revenueEstimate && <span className="text-gray-300 mx-1">→</span>}
                            {t.revenueEstimate && <span className="text-green-600">rev: {t.revenueEstimate}</span>}
                          </span>
                        )}
                        {(t.blockedBy || t.waitingOn) && (
                          <span className="text-[10px] text-red-500 font-medium">
                            {t.blockedBy ? `blocked: ${t.blockedBy}` : `waiting: ${t.waitingOn}`}
                          </span>
                        )}
                        {t.people && t.people.length > 0 && (
                          <span className="text-[10px] text-gray-400">{t.people.join(", ")}</span>
                        )}
                        {t.dueDate && (
                          <span className={`text-[10px] font-medium ${new Date(t.dueDate) < new Date() ? "text-red-500" : "text-orange-500"}`}>
                            due {format(parseISO(typeof t.dueDate === "string" && t.dueDate.length === 10 ? t.dueDate + "T12:00:00" : t.dueDate), "MMM d")}
                          </span>
                        )}
                        {t.initiative && (() => { const ini = (data.initiatives || []).find((i) => i.id === t.initiative); return ini ? <span className="text-[10px] text-purple-500">{ini.name}</span> : null; })()}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {(["in-motion", "new", "stalled", "blocked"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => {
                              setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, momentum: m } : task) } : d);
                              fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateTaskPriority", taskId: t._id, momentum: m }) });
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${t.momentum === m ? momentumColors[m] : "text-gray-300 border-gray-200 hover:border-gray-300"}`}
                          >{m}</button>
                        ))}
                        <span className="text-gray-200 mx-0.5">|</span>
                        {(["automated", "hybrid", "human"] as const).map((ex) => (
                          <button
                            key={`e-${ex}`}
                            onClick={() => {
                              setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, executionType: ex } : task) } : d);
                              fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateTaskPriority", taskId: t._id, executionType: ex }) });
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${t.executionType === ex ? execColors[ex] : "text-gray-300 border-gray-200 hover:border-gray-300"}`}
                          >{execIcons[ex]}{ex[0].toUpperCase()}</button>
                        ))}
                        <span className="text-gray-200 mx-0.5">|</span>
                        {(["low", "medium", "high"] as const).map((imp) => (
                          <button
                            key={`i-${imp}`}
                            onClick={() => {
                              setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, impact: imp } : task) } : d);
                              fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateTaskPriority", taskId: t._id, impact: imp }) });
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${t.impact === imp ? impactColors[imp] + " font-medium" : "text-gray-300 hover:text-gray-500"}`}
                          >{imp[0].toUpperCase()}</button>
                        ))}
                      </div>
                    </div>
                    <select
                      value={t.status}
                      onChange={(e) => changeTaskStatus(t._id, t.title, e.target.value)}
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 border border-gray-200 cursor-pointer"
                    >
                      <option value="todo">todo</option>
                      <option value="upcoming">upcoming</option>
                      <option value="done">done</option>
                    </select>
                  </div>
                );
                return (
                  <div className="space-y-4">
                    {ranked.length > 0 && (autoCount > 0 || humanCount > 0 || hasCostData) && (
                      <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Execution mix:</span>
                        {humanCount > 0 && <span className="text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">👤 {humanCount} human</span>}
                        {hybridCount > 0 && <span className="text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">🔄 {hybridCount} hybrid</span>}
                        {autoCount > 0 && <span className="text-[10px] font-medium text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-full px-2 py-0.5">⚡ {autoCount} automated</span>}
                        {hasCostData && (
                          <>
                            <span className="text-gray-200">|</span>
                            <span className="text-[10px] text-gray-500">{ranked.filter((t) => t.costEstimate).length} with cost data</span>
                            <span className="text-[10px] text-gray-500">{ranked.filter((t) => t.revenueEstimate).length} with revenue est.</span>
                          </>
                        )}
                      </div>
                    )}
                    {inMotion.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">In Motion — protect this momentum</h4>
                          <span className="text-[10px] text-gray-400">{inMotion.length}</span>
                        </div>
                        <div className="space-y-1.5">{inMotion.map(renderPriorityTask)}</div>
                      </div>
                    )}
                    {blocked.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Blocked / Waiting</h4>
                          <span className="text-[10px] text-gray-400">{blocked.length}</span>
                        </div>
                        <div className="space-y-1.5">{blocked.map(renderPriorityTask)}</div>
                      </div>
                    )}
                    {newIdeas.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New Ideas — evaluate vs. switching cost</h4>
                          <span className="text-[10px] text-gray-400">{newIdeas.length}</span>
                        </div>
                        <div className="space-y-1.5">{newIdeas.map(renderPriorityTask)}</div>
                      </div>
                    )}
                    {stalled.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stalled — needs attention or deprioritize</h4>
                          <span className="text-[10px] text-gray-400">{stalled.length}</span>
                        </div>
                        <div className="space-y-1.5">{stalled.map(renderPriorityTask)}</div>
                      </div>
                    )}
                    {ranked.length === 0 && (
                      <p className="text-sm text-gray-400 italic py-4 text-center">No active tasks to prioritize</p>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : taskViewMode === "categories" && allCategories.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                {allCategories.map((cat) => {
                  const catTasks = activeTasks.filter((t) => (t.categories || []).includes(cat));
                  const todo = catTasks.filter((t) => t.status === "todo").length;
                  const upcoming = catTasks.filter((t) => t.status === "upcoming").length;
                  const done = catTasks.filter((t) => t.status === "done").length;
                  const total = catTasks.length;
                  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isExpanded = expandedCategory === cat;
                  const overdue = catTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
                  const people = [...new Set(catTasks.flatMap((t) => t.people || []))];
                  return (
                    <button
                      key={cat}
                      onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                      className={`text-left rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                        isExpanded
                          ? "border-indigo-500 bg-indigo-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900 capitalize">{cat}</span>
                        <span className="text-lg font-bold text-gray-700">{total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                        <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        {todo > 0 && <span className="text-blue-600 font-medium">{todo} todo</span>}
                        {upcoming > 0 && <span className="text-yellow-600 font-medium">{upcoming} upcoming</span>}
                        {done > 0 && <span className="text-green-600 font-medium">{done} done</span>}
                      </div>
                      {overdue > 0 && <div className="text-[10px] text-red-500 font-medium mt-1">⚠ {overdue} overdue</div>}
                      {people.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {people.slice(0, 3).map((p) => (
                            <span key={p} className="text-[9px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{p}</span>
                          ))}
                          {people.length > 3 && <span className="text-[9px] text-gray-400">+{people.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {expandedCategory && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-800 capitalize">{expandedCategory}</h3>
                    <span className="text-xs text-gray-400">{activeTasks.filter((t) => (t.categories || []).includes(expandedCategory)).length} tasks</span>
                    <button onClick={() => setExpandedCategory(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">✕ close</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {allCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {categoryFilters.size > 0 && (
                    <button
                      onClick={() => setCategoryFilters(new Set())}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-900 text-white"
                    >All</button>
                  )}
                  {allCategories.map((cat) => {
                    const count = statusFiltered.filter((t) => (t.categories || []).includes(cat)).length;
                    const active = categoryFilters.has(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat)) next.delete(cat); else next.add(cat);
                          return next;
                        })}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                          active
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >{cat} <span className={active ? "text-indigo-200" : "text-gray-400"}>{count}</span></button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {taskViewMode !== "priorities" && <div className="space-y-2">
            {(taskViewMode === "categories" && expandedCategory
              ? activeTasks.filter((t) => (t.categories || []).includes(expandedCategory))
              : filteredTasks
            ).map((t) => {
              const statusColors: Record<string, string> = {
                todo: "border-l-blue-400 bg-blue-50/50",
                upcoming: "border-l-yellow-400 bg-yellow-50/50",
                done: "border-l-green-400 bg-green-50/50",
              };
              const statusBadge: Record<string, string> = {
                todo: "bg-blue-100 text-blue-700",
                upcoming: "bg-yellow-100 text-yellow-700",
                done: "bg-green-100 text-green-700",
              };
              return (
                <div
                  key={t._id}
                  className={`rounded-lg border border-gray-200 border-l-4 p-2.5 sm:p-3 ${statusColors[t.status] || ""}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {editingTaskTitle?.id === t._id ? (
                          <input
                            autoFocus
                            value={editingTaskTitle.draft}
                            onChange={(e) => setEditingTaskTitle({ id: t._id, draft: e.target.value })}
                            onBlur={async () => {
                              const newTitle = editingTaskTitle.draft.trim();
                              if (newTitle && newTitle !== t.title) {
                                setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, title: newTitle, titleHistory: [...(task.titleHistory || []), { from: t.title, to: newTitle, at: new Date().toISOString() }] } : task) } : d);
                                fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "renameTask", taskId: t._id, newTitle }) });
                              }
                              setEditingTaskTitle(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingTaskTitle(null);
                            }}
                            className="font-medium text-sm text-gray-900 border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400 w-full min-w-0"
                          />
                        ) : (
                          <span
                            onClick={() => setEditingTaskTitle({ id: t._id, draft: t.title })}
                            className={`font-medium text-sm cursor-pointer hover:bg-gray-100 rounded px-0.5 -mx-0.5 transition-colors ${t.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}
                            title="Click to edit title"
                          >
                            {t.title}
                          </span>
                        )}
                        <button
                          onClick={() => setExpandedTaskId(expandedTaskId === t._id ? null : t._id)}
                          className={`transition-colors ${expandedTaskId === t._id ? "text-blue-500" : "text-gray-300 hover:text-gray-500"}`}
                          title="Assign & details"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {t.people && t.people.length > 0 && (
                          <span className="flex items-center -space-x-1 ml-1">
                            {t.people.map((p) => {
                              const person = data.people.find((pp) => (pp.username || pp.firstName || "").toLowerCase() === p.toLowerCase());
                              const avatar = person?.avatarUrl;
                              return (
                                <span key={p} className="relative group">
                                  {avatar ? (
                                    <img src={avatar} alt={p} className="w-5 h-5 rounded-full border-2 border-white object-cover" title={p} />
                                  ) : (
                                    <span className="w-5 h-5 rounded-full border-2 border-white bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold" title={p}>
                                      {p[0].toUpperCase()}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        {(t as { _isCheck?: boolean })._isCheck && (
                          <span className="inline-flex items-center text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-1.5 py-0.5 ml-1">🔔 check</span>
                        )}
                        {t.initiative && (() => { const ini = (data.initiatives || []).find((i) => i.id === t.initiative); return ini ? (<span className="inline-flex items-center text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-100 rounded-full px-1.5 py-0.5 ml-1">{ini.name}</span>) : null; })()}
                        {t.subtasks && t.subtasks.length > 0 && (
                          <span className={`inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 ml-1 border ${t.subtasks.every((s) => s.done) ? "bg-green-50 text-green-600 border-green-100" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                            {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} steps
                          </span>
                        )}
                        {t.categories && t.categories.length > 0 && t.categories.map((cat) => (
                          <button
                            key={cat}
                            onClick={(e) => { e.stopPropagation(); setCategoryFilters((prev) => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); }}
                            className="inline-flex items-center text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-1.5 py-0.5 ml-0.5 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors cursor-pointer"
                          >{cat}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.createdByUsername && (
                          <span className="text-xs text-gray-400">@{t.createdByUsername}</span>
                        )}
                        <span className="text-xs text-gray-400">
                          {t.completedAt
                            ? `done ${formatRelativeTime(t.completedAt)}`
                            : formatRelativeTime(t.createdAt)}
                        </span>
                        {editingDateId === t._id ? (
                          <input
                            type="date"
                            autoFocus
                            defaultValue={t.dueDate ? (t.dueDate.length === 10 ? t.dueDate : t.dueDate.substring(0, 10)) : ""}
                            onBlur={(e) => changeTaskDate(t._id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") changeTaskDate(t._id, (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") setEditingDateId(null);
                            }}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 w-[110px] h-[22px] leading-none"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingDateId(t._id)}
                            className={`text-xs leading-none ${t.dueDate ? "text-orange-500 hover:text-orange-600" : "text-gray-300 hover:text-gray-500"}`}
                          >
                            {t.dueDate ? `due ${format(parseISO(typeof t.dueDate === "string" && t.dueDate.length === 10 ? t.dueDate + "T12:00:00" : t.dueDate), "MMM d")}` : "+ date"}
                          </button>
                        )}
                      </div>
                    </div>
                    {(t as { _isCheck?: boolean })._isCheck ? (
                      <div className="flex flex-wrap items-center gap-1 shrink-0">
                        {t.status === "upcoming" ? (
                          <>
                            <button
                              onClick={() => {
                                const checkId = (t as { _checkId?: string })._checkId;
                                setData((d) => d ? { ...d, checks: d.checks.map((c) => c._id === checkId ? { ...c, status: "done" as const } : c) } : d);
                                fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "clearCheck", checkId, status: "done" }) });
                              }}
                              className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium hover:bg-green-200"
                            >✓ done</button>
                            <button
                              onClick={() => {
                                const checkId = (t as { _checkId?: string })._checkId;
                                const ctx = prompt("Add context (what happened, outcome):");
                                if (ctx !== null && ctx.trim()) {
                                  setData((d) => d ? { ...d, checks: d.checks.map((c) => c._id === checkId ? { ...c, status: "done" as const, result: ctx.trim() } : c) } : d);
                                  fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "clearCheck", checkId, status: "done", context: ctx.trim(), result: ctx.trim() }) });
                                }
                              }}
                              className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium hover:bg-indigo-200"
                            >+ ctx</button>
                            <button
                              onClick={() => {
                                const checkId = (t as { _checkId?: string })._checkId;
                                setData((d) => d ? { ...d, checks: d.checks.map((c) => c._id === checkId ? { ...c, status: "skipped" as const } : c) } : d);
                                fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "clearCheck", checkId, status: "skipped" }) });
                              }}
                              className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium hover:bg-gray-200"
                            >✕</button>
                          </>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">done</span>
                        )}
                      </div>
                    ) : (
                      <select
                        value={t.status}
                        onChange={(e) => changeTaskStatus(t._id, t.title, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 border-0 cursor-pointer appearance-none pr-5 ${statusBadge[t.status] || ""}`}
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
                      >
                        <option value="todo">todo</option>
                        <option value="upcoming">upcoming</option>
                        <option value="done">done</option>
                        <option value="delete" className="text-red-600">🗑 delete</option>
                      </select>
                    )}
                  </div>
                  {expandedTaskId === t._id && (
                    <div className="mt-2 ml-0.5 text-xs text-gray-500 bg-white/60 border border-gray-100 rounded-md px-3 py-2 space-y-1.5">
                      {t.description && <p>{t.description}</p>}
                      {t.titleHistory && t.titleHistory.length > 0 && (
                        <div className="text-[10px] text-gray-400">
                          <span className="font-medium">Title changes:</span>
                          {t.titleHistory.map((h, hi) => (
                            <span key={hi} className="ml-1">
                              <span className="line-through">{h.from}</span> → <span className="text-gray-600">{h.to}</span>
                              <span className="text-gray-300 ml-0.5">({new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>
                              {hi < (t.titleHistory?.length || 0) - 1 && " · "}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-400">Assigned:</span>
                        {(() => {
                          const members = data.people.filter((p) => p.personType !== "contact");
                          const allPeople = data.people;
                          const currentPeople = t.people || [];
                          const sortedPeople = [...members, ...allPeople.filter((p) => p.personType === "contact" && currentPeople.includes((p.username || p.firstName || "").toLowerCase()))];
                          const seen = new Set<string>();
                          return sortedPeople.filter((p) => { const n = (p.username || p.firstName || ""); if (!n || seen.has(n)) return false; seen.add(n); return true; }).map((p) => {
                            const name = p.username || p.firstName || "";
                            const isAssigned = currentPeople.some((cp) => cp.toLowerCase() === name.toLowerCase());
                            return (
                              <button
                                key={p._id}
                                onClick={() => {
                                  const updated = isAssigned
                                    ? currentPeople.filter((cp) => cp.toLowerCase() !== name.toLowerCase())
                                    : [...currentPeople, name];
                                  setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, people: updated } : task) } : d);
                                  fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "updateTaskPeople", taskId: t._id, people: updated }) });
                                }}
                                className={`inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 transition-all ${
                                  isAssigned
                                    ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                    : "bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200"
                                }`}
                              >
                                {isAssigned ? "✓ " : ""}{name}
                              </button>
                            );
                          });
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Initiative:</span>
                        <select
                          value={t.initiative || ""}
                          onChange={(e) => {
                            fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "setTaskInitiative", taskId: t._id, initiative: e.target.value }) }).then(() => fetchData());
                          }}
                          className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="">None</option>
                          {(data.initiatives || []).map((ini) => (
                            <option key={ini.id} value={ini.id}>{ini.name}</option>
                          ))}
                        </select>
                      </div>
                      {/* Subtasks */}
                      <div className="pt-1.5 border-t border-gray-100 mt-1.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 font-medium">Steps:</span>
                          <button
                            onClick={async () => {
                              setGeneratingSubtasks(t._id);
                              const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "generateSubtasks", taskId: t._id }) });
                              const json = await res.json();
                              if (json.subtasks) {
                                setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, subtasks: json.subtasks } : task) } : d);
                              }
                              setGeneratingSubtasks(null);
                            }}
                            disabled={generatingSubtasks === t._id}
                            className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                          >
                            {generatingSubtasks === t._id ? "Generating..." : (t.subtasks && t.subtasks.length > 0 ? "🔄 Regenerate" : "🧩 Break down steps")}
                          </button>
                          {t.subtasks && t.subtasks.length > 0 && (
                            <span className="text-[10px] text-gray-300">{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} done</span>
                          )}
                        </div>
                        {t.subtasks && t.subtasks.length > 0 && (
                          <div className="space-y-0.5 mb-1.5">
                            {t.subtasks.map((sub) => (
                              <div key={sub.id} className="flex items-center gap-1.5 group/sub">
                                <button
                                  onClick={async () => {
                                    setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, subtasks: (task.subtasks || []).map((s) => s.id === sub.id ? { ...s, done: !s.done } : s) } : task) } : d);
                                    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "toggleSubtask", taskId: t._id, subtaskId: sub.id }) });
                                  }}
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${sub.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-indigo-400"}`}
                                >
                                  {sub.done && <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                </button>
                                <span className={`text-[10px] flex-1 ${sub.done ? "line-through text-gray-300" : "text-gray-600"}`}>{sub.title}</span>
                                <button
                                  onClick={async () => {
                                    setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, subtasks: (task.subtasks || []).filter((s) => s.id !== sub.id) } : task) } : d);
                                    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "removeSubtask", taskId: t._id, subtaskId: sub.id }) });
                                  }}
                                  className="text-[10px] text-gray-300 hover:text-red-400 sm:opacity-0 sm:group-hover/sub:opacity-100 transition-opacity shrink-0"
                                >✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newSubtaskText[t._id] || ""}
                            onChange={(e) => setNewSubtaskText((prev) => ({ ...prev, [t._id]: e.target.value }))}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && (newSubtaskText[t._id] || "").trim()) {
                                const title = newSubtaskText[t._id].trim();
                                const tempSub = { id: `${Date.now()}-m`, title, done: false };
                                setData((d) => d ? { ...d, tasks: d.tasks.map((task) => task._id === t._id ? { ...task, subtasks: [...(task.subtasks || []), tempSub] } : task) } : d);
                                setNewSubtaskText((prev) => ({ ...prev, [t._id]: "" }));
                                await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addSubtask", taskId: t._id, title }) });
                              }
                            }}
                            placeholder="+ Add step..."
                            className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                          />
                        </div>
                      </div>
                      {/* Suggestions */}
                      <div className="pt-1.5 border-t border-gray-100 mt-1.5">
                        <button
                          onClick={async () => {
                            setSuggestingTaskId(t._id);
                            const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "suggestForTask", taskId: t._id }) });
                            const json = await res.json();
                            setTaskSuggestions((prev) => ({ ...prev, [t._id]: json.suggestions || [] }));
                            setSuggestingTaskId(null);
                          }}
                          disabled={suggestingTaskId === t._id}
                          className="text-[10px] text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50"
                        >
                          {suggestingTaskId === t._id ? "Thinking..." : "💡 Suggest next steps"}
                        </button>
                        {taskSuggestions[t._id] && taskSuggestions[t._id].length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {taskSuggestions[t._id].map((s, si) => (
                              <div key={si} className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                                <span className="text-[10px] text-amber-800 flex-1">{s}</span>
                                <button
                                  onClick={async () => {
                                    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "addTask", task: { title: s, status: "todo" } }) });
                                    setTaskSuggestions((prev) => ({ ...prev, [t._id]: prev[t._id].filter((_, i) => i !== si) }));
                                    fetchData();
                                  }}
                                  className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded font-medium hover:bg-amber-700 shrink-0"
                                >+ Add</button>
                                <button
                                  onClick={() => setTaskSuggestions((prev) => ({ ...prev, [t._id]: prev[t._id].filter((_, i) => i !== si) }))}
                                  className="text-[10px] text-amber-400 hover:text-amber-600 shrink-0"
                                >✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {(taskViewMode === "categories" && expandedCategory ? activeTasks.filter((t) => (t.categories || []).includes(expandedCategory)) : filteredTasks).length === 0 && (
              <p className="text-sm text-gray-400 italic py-4 text-center">No items</p>
            )}
          </div>}
          {taskFilters.has("upcoming") && taskFilters.size === 1 && (
            <div className="mt-3">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                📅 {showCalendar ? "Hide calendar" : "Show calendar"}
              </button>
              {showCalendar && (
                <div className="mt-3">
                  <CalendarView tasks={data.tasks} checks={data.checks} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Checks are now merged into the task board above */}

        {/* (Chat Members + Contacts moved to toolbar People panel) */}

        {/* (Dump + Guidance moved to top toolbar) */}

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
                <div key={a._id} className="flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                  <span className="text-base mt-0.5">{activityIcon(a.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">{a.title}</span>
                      {a.detail && <span className="text-gray-500"> — {a.detail}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.actor && <span className="text-xs text-gray-400">@{a.actor}</span>}
                      <span className="text-xs text-gray-400" title={formatET(a.createdAt)}>{formatET(a.createdAt)}</span>
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

        {/* (Context Summary moved to top toolbar) */}
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
    ai_triggered: "⚡",
    ai_result: "✨",
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
    ai_triggered: "triggered",
    ai_result: "result",
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
    ai_triggered: "bg-orange-100 text-orange-700",
    ai_result: "bg-emerald-100 text-emerald-700",
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
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
        <div className="grid grid-cols-7 border-b border-gray-100 min-w-[320px]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-xs font-medium text-gray-400 text-center py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-w-[320px]">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[60px] sm:min-h-[80px] border-b border-r border-gray-50" />;
            const key = dayKey(day);
            const isToday = key === todayKey;
            const dayTasks = tasksByDay[key] || [];
            const dayChecks = checksByDay[key] || [];
            const hasItems = dayTasks.length > 0 || dayChecks.length > 0;

            return (
              <div
                key={i}
                className={`min-h-[60px] sm:min-h-[80px] border-b border-r border-gray-50 p-1 sm:p-1.5 ${isToday ? "bg-blue-50" : hasItems ? "bg-gray-50/50" : ""}`}
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

function formatET(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

