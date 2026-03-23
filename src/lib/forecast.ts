const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

function summarizeOpenRouterBody(data: Record<string, unknown>): string {
  const choices = data.choices as unknown[] | undefined;
  const choice = (choices?.[0] as Record<string, unknown> | undefined) ?? undefined;
  const msg = choice?.message as Record<string, unknown> | undefined;
  const usage = data.usage as Record<string, unknown> | undefined;
  const meta = {
    http_model: data.model,
    id: data.id,
    finish_reason: choice?.finish_reason,
    native_finish_reason: choice?.native_finish_reason,
    refusal: msg?.refusal,
    content_type: msg?.content === null ? "null" : typeof msg?.content,
    content_len: typeof msg?.content === "string" ? msg.content.length : undefined,
    usage: usage
      ? {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        }
      : undefined,
  };
  try {
    return JSON.stringify(meta);
  } catch {
    return String(data);
  }
}

async function forecastChat(messages: { role: string; content: string }[], model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: 8000 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 2000);
      try {
        const j = JSON.parse(text) as { error?: { message?: string; code?: string }; message?: string };
        if (j.error?.message) detail = `${j.error.code || "error"}: ${j.error.message}`;
        else if (j.message) detail = j.message;
      } catch {
        /* keep raw */
      }
      throw new Error(`OpenRouter HTTP ${res.status} (${model}): ${detail}`);
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`OpenRouter returned non-JSON (model ${model}): ${text.slice(0, 500)}`);
    }
    const choices = data.choices as unknown[] | undefined;
    const choice = choices?.[0] as Record<string, unknown> | undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    const str = typeof content === "string" ? content : "";
    if (!str.trim()) {
      throw new Error(
        `Empty model output for ${model}. Provider meta: ${summarizeOpenRouterBody(data)}. ` +
          `If completion_tokens=0, the prompt may exceed context or the model refused; try a smaller chat or another model.`,
      );
    }
    return str;
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`OpenRouter request timed out (180s) for model ${model}`);
    }
    throw e;
  }
}

import { pickNorthStarSnapshot, type NorthStarSnapshot } from "@/lib/northStarHistory";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Activity from "@/models/Activity";
import Check from "@/models/Check";
import Job from "@/models/Job";

export type Horizon = "1d" | "3d" | "7d" | "30d";

export interface SimulatedMessage {
  role: "user" | "assistant";
  author: string;
  content: string;
  timestamp: string;
}

export interface HorizonForecast {
  horizon: Horizon;
  label: string;
  messages: SimulatedMessage[];
  keyMilestones: string[];
  score: number;
}

export interface ForecastResult {
  guidance: string;
  horizons: HorizonForecast[];
  iterations: number;
  generatedAt: Date;
}

const HORIZON_META: Record<
  Horizon,
  { label: string; desc: string; timingBrief: string; maxSpanNote: string }
> = {
  "1d": {
    label: "Tomorrow",
    desc: "Next 24 hours",
    timingBrief:
      "Same-day / next-day only: pings, confirmations, on-site tweaks, shipping a mockup, one round of replies. No closing multi-week enterprise deals unless context shows signature is already imminent.",
    maxSpanNote: "All message timestamps must fall within ~24 hours from now.",
  },
  "3d": {
    label: "3 Days",
    desc: "Next 3 days",
    timingBrief:
      "Fits a tight activation arc: load-in → peak night(s) → teardown OR a 3-day sprint on one initiative. Good for a race weekend slice, pop-up, or partner push — not a full retail rollout.",
    maxSpanNote: "Timestamps span at most 3 days; keep density realistic (sleep exists).",
  },
  "7d": {
    label: "1 Week",
    desc: "Next 7 days",
    timingBrief:
      "One week: post-event debrief, first follow-ups, case-study draft, 1–2 meaningful pipeline moves. If there was a major event early in the week, later days shift to inbound, logistics, and next activations — not infinite on-site 'event day' energy.",
    maxSpanNote: "Do not pack a month of outcomes into seven days.",
  },
  "30d": {
    label: "1 Month",
    desc: "Next 30 days",
    timingBrief:
      "~4 calendar weeks with clear phases. On-site events (MotoGP weekend, VIP lounge night, single-city activation) are SHORT — usually a few concentrated days, not a month-long 'MotoGP initiative'. After the event: debrief, case study, retailer pilots, Content Studio delivery, Fashion Week prep — spread across plausible weeks with gaps.",
    maxSpanNote:
      "Sequence wins across the month; early window may still be event-adjacent, then pivot narrative to pipeline, revenue, product — never imply the same race weekend is still 'happening' on day 28.",
  },
};

interface FullContext {
  chatTitle: string;
  mode: string;
  contextSummary: string;
  leveragePlay: string;
  priorityNarrative: string;
  guidance: string;
  recentMessages: { role: string; content: string; firstName?: string; telegramUsername?: string; createdAt?: string }[];
  people: { firstName?: string; username?: string; role?: string; context?: string; intentions?: string[]; personType?: string; relationships?: { name: string; label?: string; context?: string }[]; resources?: string; access?: string }[];
  todoTasks: { title: string; actionLane?: string; dueDate?: Date; people?: string[]; priorityScore?: number; momentum?: string; effort?: string; impact?: string; costEstimate?: string; revenueEstimate?: string; blockedBy?: string; categories?: string[] }[];
  upcomingTasks: { title: string; dueDate?: Date; people?: string[]; categories?: string[] }[];
  doneTasks: { title: string; completedAt?: Date; categories?: string[] }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offers: any[];
  activities: { type: string; title: string; detail?: string; actor?: string; createdAt: Date }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: any[];
  dumps: { text: string; source: string; category: string; subject: string; createdAt: Date }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initiatives: any[];
  northStarHistory: NorthStarSnapshot[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offerResearchLog: any[];
  qmdMemory: string;
}

async function gatherContext(chatId: string, userGuidance: string): Promise<FullContext> {
  const [chatDoc, tasks, people, activities, checks, jobs] = await Promise.all([
    Chat.findOne({ telegramChatId: chatId }).lean(),
    Task.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(60).lean(),
    Person.find({ telegramChatId: chatId }).lean(),
    Activity.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(80).lean(),
    Check.find({ telegramChatId: chatId }).sort({ scheduledFor: 1 }).lean(),
    Job.find({ telegramChatId: chatId, status: "active" }).lean(),
  ]);

  if (!chatDoc) throw new Error("Chat not found");

  const recentMessages = (chatDoc.messages || []).slice(-40);
  const todoTasks = tasks.filter((t) => t.status === "todo");
  const upcomingTasks = tasks.filter((t) => t.status === "upcoming");
  const doneTasks = tasks.filter((t) => t.status === "done").slice(0, 20);
  const offers = (chatDoc.offers || []).filter((o: { status: string }) => o.status !== "rejected");
  const dumps = (chatDoc.dumps || []).slice(-15);
  const initiatives = (chatDoc.initiatives || []).filter((i: { status: string }) => i.status === "active");
  const northStarHistory = (chatDoc.northStarHistory || []).map((s: { _id?: { toString(): string }; at: Date; leveragePlay: string; contextSummary: string; priorityNarrative: string }) => ({
    id: s._id?.toString(),
    at: new Date(s.at).toISOString(),
    leveragePlay: s.leveragePlay || "",
    contextSummary: s.contextSummary || "",
    priorityNarrative: s.priorityNarrative || "",
  }));
  const offerResearchLog = (chatDoc.offerResearchLog || []).slice(-5);

  let qmdMemory = "";
  try {
    const { qmdTextSearch, formatQMDResults } = await import("@/lib/knowledge");
    const results = await qmdTextSearch(userGuidance || chatDoc.leveragePlay || chatDoc.contextSummary || "next steps", 8);
    if (results.length) qmdMemory = formatQMDResults(results);
  } catch { /* QMD unavailable */ }

  return {
    chatTitle: chatDoc.chatTitle || "Team Chat",
    mode: chatDoc.mode,
    contextSummary: chatDoc.contextSummary || "",
    leveragePlay: chatDoc.leveragePlay || "",
    priorityNarrative: chatDoc.priorityNarrative || "",
    guidance: chatDoc.guidance || "",
    recentMessages,
    people,
    todoTasks,
    upcomingTasks,
    doneTasks,
    offers,
    activities,
    checks,
    jobs,
    dumps,
    initiatives,
    northStarHistory,
    offerResearchLog,
    qmdMemory,
  };
}

function buildContextBlock(ctx: FullContext): string {
  const parts: string[] = [];

  if (ctx.contextSummary) parts.push(`CONTEXT SUMMARY:\n${ctx.contextSummary}`);
  if (ctx.leveragePlay) parts.push(`CURRENT LEVERAGE PLAY:\n${ctx.leveragePlay}`);
  if (ctx.priorityNarrative) parts.push(`PRIORITY NARRATIVE:\n${ctx.priorityNarrative}`);
  if (ctx.guidance) parts.push(`TEAM GUIDANCE:\n${ctx.guidance}`);

  // North star evolution — show where the team has been
  if (ctx.northStarHistory.length > 1) {
    const snapD7 = pickNorthStarSnapshot(ctx.northStarHistory, "d7");
    const snapD30 = pickNorthStarSnapshot(ctx.northStarHistory, "d30");
    const evolution: string[] = [];
    if (snapD30) evolution.push(`30 days ago — leverage: ${snapD30.leveragePlay || "(none)"} | priorities: ${snapD30.priorityNarrative || "(none)"}`);
    if (snapD7) evolution.push(`7 days ago — leverage: ${snapD7.leveragePlay || "(none)"} | priorities: ${snapD7.priorityNarrative || "(none)"}`);
    evolution.push(`Now — leverage: ${ctx.leveragePlay || "(none)"} | priorities: ${ctx.priorityNarrative || "(none)"}`);
    parts.push(`NORTH STAR EVOLUTION (how direction has shifted):\n${evolution.join("\n")}`);
  }

  // People with full detail
  if (ctx.people.length) {
    const pList = ctx.people.map((p) => {
      let line = `- ${p.firstName || p.username || "Unknown"}`;
      if (p.role) line += ` (${p.role})`;
      if (p.personType === "contact") line += " [contact]";
      if (p.context) line += `: ${p.context}`;
      if (p.intentions?.length) line += ` | Intentions: ${p.intentions.join(", ")}`;
      if (p.resources) line += ` | Resources: ${p.resources}`;
      if (p.access) line += ` | Access: ${p.access}`;
      if (p.relationships?.length) {
        const rels = p.relationships.map((r) => `${r.name}${r.label ? ` [${r.label}]` : ""}`).join(", ");
        line += ` | Knows: ${rels}`;
      }
      return line;
    }).join("\n");
    parts.push(`PEOPLE (${ctx.people.length}):\n${pList}`);
  }

  // Tasks with richer metadata
  if (ctx.todoTasks.length) {
    const tList = ctx.todoTasks.slice(0, 15).map((t) => {
      let line = `- ${t.title}`;
      if (t.actionLane) line += ` [${t.actionLane}]`;
      if (t.dueDate) line += ` due:${new Date(t.dueDate).toISOString().split("T")[0]}`;
      if (t.people?.length) line += ` @${t.people.join(",")}`;
      if (t.priorityScore) line += ` p:${t.priorityScore}`;
      if (t.momentum && t.momentum !== "new") line += ` (${t.momentum})`;
      if (t.blockedBy) line += ` BLOCKED:${t.blockedBy}`;
      if (t.revenueEstimate) line += ` rev:${t.revenueEstimate}`;
      return line;
    }).join("\n");
    parts.push(`TODO (${ctx.todoTasks.length}):\n${tList}`);
  }

  if (ctx.upcomingTasks.length) {
    const uList = ctx.upcomingTasks.slice(0, 10).map((t) => {
      let line = `- ${t.title}`;
      if (t.dueDate) line += ` due:${new Date(t.dueDate).toISOString().split("T")[0]}`;
      if (t.people?.length) line += ` @${t.people.join(",")}`;
      return line;
    }).join("\n");
    parts.push(`UPCOMING (${ctx.upcomingTasks.length}):\n${uList}`);
  }

  if (ctx.doneTasks.length) {
    const dList = ctx.doneTasks.map((t) => {
      let line = `- ${t.title}`;
      if (t.completedAt) line += ` (done ${new Date(t.completedAt).toISOString().split("T")[0]})`;
      return line;
    }).join("\n");
    parts.push(`RECENTLY COMPLETED (${ctx.doneTasks.length}):\n${dList}`);
  }

  // Offers with full detail
  if (ctx.offers.length) {
    const oList = ctx.offers.map((o) => {
      const lines = [`- ${o.name} [${o.status}] conf:${o.confidenceScore ?? "?"}`];
      if (o.description) lines.push(`  ${o.description.slice(0, 150)}`);
      if (o.pricePoint) lines.push(`  Price: ${o.pricePoint} | Buyer: ${o.targetBuyer || "?"}`);
      if (o.whyNow) lines.push(`  Why now: ${o.whyNow.slice(0, 120)}`);
      if (o.meatAndPotatoes?.length) lines.push(`  Core: ${o.meatAndPotatoes.join("; ")}`);
      if (o.teamLeverage?.length) lines.push(`  Team leverage: ${o.teamLeverage.join("; ")}`);
      if (o.chatSignals?.length) lines.push(`  Winning chat signals: ${o.chatSignals.join("; ")}`);
      return lines.join("\n");
    }).join("\n\n");
    parts.push(`ACTIVE OFFERS (${ctx.offers.length}):\n${oList}`);
  }

  // Offer research log — what's been tried
  if (ctx.offerResearchLog.length) {
    const rLog = ctx.offerResearchLog.map((r: { iteration: number; action: string; result: string; conversationCadence?: string[] }) => {
      let line = `Iter ${r.iteration}: ${r.action} → ${r.result}`;
      if (r.conversationCadence?.length) line += ` | cadence: ${r.conversationCadence.join("; ")}`;
      return line;
    }).join("\n");
    parts.push(`OFFER RESEARCH HISTORY:\n${rLog}`);
  }

  // Initiatives
  if (ctx.initiatives.length) {
    const iList = ctx.initiatives.map((i: { name: string; description?: string }) =>
      `- ${i.name}${i.description ? `: ${i.description}` : ""}`
    ).join("\n");
    parts.push(`ACTIVE INITIATIVES:\n${iList}`);
  }

  // Dumps — team knowledge
  if (ctx.dumps.length) {
    const dList = ctx.dumps.map((d) =>
      `- [${d.category}${d.subject ? `/${d.subject}` : ""}] ${d.text.slice(0, 200)}`
    ).join("\n");
    parts.push(`TEAM KNOWLEDGE DUMPS (${ctx.dumps.length}):\n${dList}`);
  }

  // Active jobs & checks
  if (ctx.jobs.length) {
    const jList = ctx.jobs.map((j: { title: string; description?: string }) => `- ${j.title}${j.description ? `: ${j.description}` : ""}`).join("\n");
    parts.push(`ACTIVE JOBS:\n${jList}`);
  }

  if (ctx.checks.length) {
    const cList = ctx.checks.slice(0, 8).map((c: { description: string; scheduledFor: Date; status: string }) =>
      `- ${c.description} (${c.status}, ${new Date(c.scheduledFor).toISOString().split("T")[0]})`
    ).join("\n");
    parts.push(`SCHEDULED CHECKS:\n${cList}`);
  }

  // Recent messages — more history
  if (ctx.recentMessages.length) {
    const mList = ctx.recentMessages.slice(-20).map((m: { role: string; content: string; firstName?: string; telegramUsername?: string; createdAt?: string }) => {
      const name = m.firstName || m.telegramUsername || (m.role === "assistant" ? "odoai" : "User");
      const time = m.createdAt ? ` (${new Date(m.createdAt).toLocaleDateString()})` : "";
      return `${name}${time}: ${m.content.slice(0, 300)}`;
    }).join("\n");
    parts.push(`RECENT CONVERSATION (${ctx.recentMessages.length} msgs):\n${mList}`);
  }

  // Activity feed — deeper history
  if (ctx.activities.length) {
    const aList = ctx.activities.slice(0, 30).map((a) => {
      let line = `- [${a.type}] ${a.title}`;
      if (a.detail) line += ` — ${a.detail.slice(0, 100)}`;
      if (a.actor) line += ` (@${a.actor})`;
      return line;
    }).join("\n");
    parts.push(`ACTIVITY HISTORY (${ctx.activities.length} events):\n${aList}`);
  }

  // QMD semantic memory
  if (ctx.qmdMemory) {
    parts.push(`SEMANTIC MEMORY (relevant knowledge from team's accumulated context):\n${ctx.qmdMemory}`);
  }

  return parts.join("\n\n");
}

function repairAndParseJSON(raw: string): { messages: SimulatedMessage[]; keyMilestones: string[]; score: number } {
  // Strip markdown fences
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  // Extract the outermost JSON object
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON object found in response");
  s = s.slice(firstBrace, lastBrace + 1);

  // Try direct parse first
  try {
    return JSON.parse(s);
  } catch { /* continue to repair */ }

  // Repair common LLM JSON mistakes
  // 1. Trailing commas before ] or }
  s = s.replace(/,\s*([}\]])/g, "$1");
  // 2. Single quotes → double quotes (but not inside double-quoted strings)
  // 3. Unescaped newlines inside strings
  s = s.replace(/[\r\n]+/g, " ");
  // 4. Control characters
  s = s.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === "\t") return "\\t";
    if (ch === "\n") return "\\n";
    if (ch === "\r") return "\\r";
    return "";
  });

  try {
    return JSON.parse(s);
  } catch { /* continue */ }

  // Last resort: try to extract messages array and milestones separately via regex
  const messagesMatch = s.match(/"messages"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  const milestonesMatch = s.match(/"keyMilestones"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  const scoreMatch = s.match(/"score"\s*:\s*(\d+)/);

  if (messagesMatch) {
    let msgStr = messagesMatch[1].replace(/,\s*\]/g, "]").replace(/[\r\n]+/g, " ");
    let messages: SimulatedMessage[] = [];
    try {
      messages = JSON.parse(msgStr);
    } catch {
      // Try removing the last potentially broken element
      const lastGoodBracket = msgStr.lastIndexOf("},");
      if (lastGoodBracket > 0) {
        msgStr = msgStr.slice(0, lastGoodBracket + 1) + "]";
        try { messages = JSON.parse(msgStr); } catch { /* give up on messages */ }
      }
    }

    let milestones: string[] = [];
    if (milestonesMatch) {
      try { milestones = JSON.parse(milestonesMatch[1].replace(/,\s*\]/g, "]")); } catch { /* skip */ }
    }

    return {
      messages,
      keyMilestones: milestones,
      score: scoreMatch ? parseInt(scoreMatch[1]) : 5,
    };
  }

  throw new Error("Failed to parse forecast JSON after repair attempts");
}

async function generateForecast(
  ctx: FullContext,
  userGuidance: string,
  horizon: Horizon,
  previousAttempt?: HorizonForecast,
  model?: string,
): Promise<HorizonForecast> {
  const meta = HORIZON_META[horizon];
  const contextBlock = buildContextBlock(ctx);

  const refinementNote = previousAttempt
    ? `\n\nPREVIOUS ATTEMPT (score: ${previousAttempt.score}/10):\n${JSON.stringify(previousAttempt.messages.slice(0, 8), null, 2)}\n\nMilestones: ${previousAttempt.keyMilestones.join(", ")}\n\nMake this version MORE specific, realistic, and actionable. Use real names, real tasks, real offers from the context. Reference actual deadlines, contacts, and decisions. Fix any calendar abuse (e.g. treating a race weekend or single activation as if it lasted the whole horizon, or cramming many multi-week wins into 1d/3d). The previous attempt scored ${previousAttempt.score}/10 — beat it on both specificity AND temporal realism.`
    : "";

  const prompt = `You are simulating what the BEST possible group chat conversation looks like over the ${meta.desc} for this team.

${contextBlock}

USER DIRECTION: ${userGuidance || "Build a successful business — focus on highest-leverage moves."}
${refinementNote}

Generate a realistic Telegram group chat conversation that shows what WINNING looks like for this team over the ${meta.desc}. This should feel like reading a real chat where things are going incredibly well — momentum, clarity, action, results.

TEMPORAL REALISM (non-negotiable — low score if violated):
- This horizon is ONLY: ${meta.timingBrief}
- ${meta.maxSpanNote}
- Physical activations (MotoGP / Grand Prix weekend, VIP lounge night, circuit club night, pop-up, booth) are BRIEF: typically hours to a few peak days. They are NOT a month-long initiative. Never write as if the same on-site race event is still "happening" across all 30 days.
- For "30d": structure time — e.g. days 1–3 event execution + hot follow-up, week 2 debrief + case study + inbound, week 3–4 pilots, contracts, next event prep. Major unrelated wins should sit in later weeks, not all crammed into "day 2" of the month.
- For "1d" / "3d": if the team has an imminent event, stay inside setup, live night, or immediate aftermath — do not leap to outcomes that need weeks (full kiosk chain rollout, four new enterprise retainers) unless the context already shows those deals at the one-yard line.
- Each horizon is a different calendar slice: do not recycle the identical "event is live" beat from short horizons into the month view as if no time passed.
- Timestamps in messages must respect the horizon (no "April 22" outcomes inside a "Tomorrow" simulation).

Critical rules:
- Use REAL names from the team and contacts. If the AI assistant speaks, use "odoai".
- Reference REAL tasks by name, real offers, real contacts, real initiatives, real deadlines.
- Ground everything in the team's actual context — their leverage play, their knowledge dumps, their relationships, their current momentum.
- Show natural conversation — short messages, reactions, back-and-forth, excitement, quick updates. Not essays.
- Include timestamps relative to now (e.g. "Tomorrow 9am", "Day 3 2pm", "Week 2 Mon").
- Show concrete wins: tasks completing, offers getting traction, contacts responding, revenue coming in, blockers clearing.
- Show the AI (odoai) being proactive — surfacing insights, connecting dots, suggesting next moves.
- If there are chatSignals defined on offers, show those exact signals happening naturally.
- The conversation should build on what's already in motion — don't start from scratch.
- Message counts: 8-15 for 1d, 12-20 for 3d, 15-25 for 7d, 20-35 for 30d — but fewer messages is better than violating calendar realism.

Respond in VALID JSON. No markdown fences. No trailing commas. Escape all quotes inside strings with backslash.

Example of the EXACT format (follow this structure precisely):
{"messages":[{"role":"user","author":"Chris","content":"Hey team, just got off the call","timestamp":"Tomorrow 9am"},{"role":"assistant","author":"odoai","content":"Nice — that aligns with the pitch deck task","timestamp":"Tomorrow 9:05am"}],"keyMilestones":["First client call booked","Pitch deck sent"],"score":7}

Rules for valid JSON:
- role must be exactly "user" or "assistant" (strings, not union types)
- All strings must use double quotes
- No trailing commas after the last element in arrays or objects
- Escape any double quotes inside content strings with backslash
- No comments, no ellipsis (...), no placeholders`;

  const useModel = (model || "moonshotai/kimi-k2.5").trim();
  const raw = await forecastChat([{ role: "user", content: prompt }], useModel);

  let parsed: { messages: SimulatedMessage[]; keyMilestones: string[]; score: number };
  try {
    parsed = repairAndParseJSON(raw);
  } catch (parseErr) {
    const hint = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const preview = raw.replace(/\s+/g, " ").slice(0, 400);
    throw new Error(
      `[${meta.label} / ${horizon}] JSON parse failed: ${hint}. First 400 chars of model output: ${preview}${raw.length > 400 ? "…" : ""}`,
    );
  }

  return {
    horizon,
    label: meta.label,
    messages: parsed.messages || [],
    keyMilestones: parsed.keyMilestones || [],
    score: parsed.score || 5,
  };
}

export type ForecastLogger = (msg: string) => void | Promise<void>;

export async function runForecast(
  chatId: string,
  userGuidance: string,
  { iterations = 1, horizons = ["1d", "3d", "7d", "30d"] as Horizon[], model, log }: { iterations?: number; horizons?: Horizon[]; model?: string; log?: ForecastLogger } = {},
): Promise<ForecastResult> {
  const emit = async (msg: string) => {
    if (log) await Promise.resolve(log(msg));
  };

  await emit("Gathering context from MongoDB...");
  const ctx = await gatherContext(chatId, userGuidance);
  await emit(`Context loaded — ${ctx.todoTasks.length} tasks, ${ctx.people.length} people, ${ctx.activities.length} activities, ${ctx.offers.length} offers`);
  if (ctx.qmdMemory) await emit("QMD semantic memory loaded");
  else await emit("QMD unavailable — proceeding without semantic memory");
  await emit(`Building context block (${ctx.recentMessages.length} messages, ${ctx.doneTasks.length} completed tasks)`);

  const useModel = (model || "moonshotai/kimi-k2.5").trim();
  await emit(`Model: ${useModel}`);
  await emit(`Starting ${horizons.length} horizons in parallel: ${horizons.join(", ")}`);

  const runHorizon = async (horizon: Horizon): Promise<HorizonForecast> => {
    let best: HorizonForecast | undefined;
    for (let i = 0; i < iterations; i++) {
      const label = HORIZON_META[horizon].label;
      await emit(`[${label}] Iteration ${i + 1}/${iterations} — sending to LLM...`);
      const attempt = await generateForecast(ctx, userGuidance, horizon, best, model);
      await emit(`[${label}] Got ${attempt.messages.length} messages, score ${attempt.score}/10, ${attempt.keyMilestones.length} milestones`);
      if (!best || attempt.score > best.score) best = attempt;
    }
    return best!;
  };

  const settled = await Promise.allSettled(horizons.map(runHorizon));
  const failures: string[] = [];
  const results: HorizonForecast[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const hz = horizons[i];
    if (s.status === "fulfilled") {
      results.push(s.value);
    } else {
      const reason = s.reason;
      const line =
        reason instanceof Error
          ? reason.message
          : `[${hz}] ${String(reason)}`;
      failures.push(line);
    }
  }
  if (failures.length) {
    await emit(`FAILED — ${failures.length} horizon(s) errored:\n${failures.map((l) => `  • ${l}`).join("\n")}`);
    throw new Error(failures.join("\n"));
  }

  await emit(`All horizons complete — scores: ${results.map((r) => `${r.label}=${r.score}/10`).join(", ")}`);

  return {
    guidance: userGuidance,
    horizons: results,
    iterations,
    generatedAt: new Date(),
  };
}
