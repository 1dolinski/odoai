import { chat as aiChat } from "@/lib/openrouter";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Activity from "@/models/Activity";

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

const HORIZON_META: Record<Horizon, { label: string; desc: string }> = {
  "1d": { label: "Tomorrow", desc: "Next 24 hours" },
  "3d": { label: "3 Days", desc: "Next 3 days" },
  "7d": { label: "1 Week", desc: "Next 7 days" },
  "30d": { label: "1 Month", desc: "Next 30 days" },
};

async function gatherContext(chatId: string) {
  const [chatDoc, tasks, people, activities] = await Promise.all([
    Chat.findOne({ telegramChatId: chatId }).lean(),
    Task.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(30).lean(),
    Person.find({ telegramChatId: chatId }).lean(),
    Activity.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(40).lean(),
  ]);

  if (!chatDoc) throw new Error("Chat not found");

  const recentMessages = (chatDoc.messages || []).slice(-20);
  const todoTasks = tasks.filter((t) => t.status === "todo");
  const upcomingTasks = tasks.filter((t) => t.status === "upcoming");
  const doneTasks = tasks.filter((t) => t.status === "done").slice(0, 10);
  const offers = (chatDoc.offers || []).filter((o: { status: string }) => o.status !== "rejected");

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
  };
}

function buildContextBlock(ctx: Awaited<ReturnType<typeof gatherContext>>): string {
  const parts: string[] = [];

  if (ctx.contextSummary) parts.push(`CONTEXT: ${ctx.contextSummary}`);
  if (ctx.leveragePlay) parts.push(`LEVERAGE PLAY: ${ctx.leveragePlay}`);
  if (ctx.priorityNarrative) parts.push(`PRIORITIES: ${ctx.priorityNarrative}`);

  if (ctx.people.length) {
    const pList = ctx.people.map((p) => `- ${p.firstName || p.username || "Unknown"}${p.role ? ` (${p.role})` : ""}${p.context ? `: ${p.context}` : ""}`).join("\n");
    parts.push(`TEAM (${ctx.people.length}):\n${pList}`);
  }

  if (ctx.todoTasks.length) {
    const tList = ctx.todoTasks.slice(0, 10).map((t) => `- ${t.title}${t.actionLane ? ` [${t.actionLane}]` : ""}`).join("\n");
    parts.push(`TODO (${ctx.todoTasks.length}):\n${tList}`);
  }

  if (ctx.upcomingTasks.length) {
    const uList = ctx.upcomingTasks.slice(0, 5).map((t) => `- ${t.title}`).join("\n");
    parts.push(`UPCOMING:\n${uList}`);
  }

  if (ctx.doneTasks.length) {
    const dList = ctx.doneTasks.map((t) => `- ${t.title}`).join("\n");
    parts.push(`RECENTLY DONE:\n${dList}`);
  }

  if (ctx.offers.length) {
    const oList = ctx.offers.map((o: { name: string; status: string; confidenceScore?: number }) =>
      `- ${o.name} [${o.status}]${o.confidenceScore ? ` conf:${o.confidenceScore}` : ""}`
    ).join("\n");
    parts.push(`OFFERS:\n${oList}`);
  }

  if (ctx.recentMessages.length) {
    const mList = ctx.recentMessages.slice(-10).map((m) => {
      const name = m.firstName || m.telegramUsername || (m.role === "assistant" ? "odoai" : "User");
      return `${name}: ${m.content.slice(0, 200)}`;
    }).join("\n");
    parts.push(`RECENT CHAT:\n${mList}`);
  }

  if (ctx.activities.length) {
    const aList = ctx.activities.slice(0, 15).map((a) => `- [${a.type}] ${a.title}`).join("\n");
    parts.push(`RECENT ACTIVITY:\n${aList}`);
  }

  return parts.join("\n\n");
}

async function generateForecast(
  ctx: Awaited<ReturnType<typeof gatherContext>>,
  userGuidance: string,
  horizon: Horizon,
  previousAttempt?: HorizonForecast,
  model?: string,
): Promise<HorizonForecast> {
  const meta = HORIZON_META[horizon];
  const contextBlock = buildContextBlock(ctx);

  const refinementNote = previousAttempt
    ? `\n\nPREVIOUS ATTEMPT (score: ${previousAttempt.score}/10):\n${JSON.stringify(previousAttempt.messages.slice(0, 5), null, 2)}\n\nMake this version MORE specific, realistic, and actionable. Use real names, real tasks, real offers from the context. The previous attempt scored ${previousAttempt.score}/10 — beat it.`
    : "";

  const prompt = `You are simulating what the BEST possible group chat conversation looks like over the ${meta.desc} for a team trying to build a successful business.

${contextBlock}

USER DIRECTION: ${userGuidance || "Build a successful business — focus on highest-leverage moves."}
${refinementNote}

Generate a realistic Telegram group chat conversation that shows what WINNING looks like for this team over the ${meta.desc}. This should feel like reading a real chat where things are going incredibly well — momentum, clarity, action, results.

Rules:
- Use REAL names from the team (people listed above). If the AI assistant speaks, use "odoai".
- Reference REAL tasks, offers, and context — don't make up generic stuff.
- Show natural conversation — short messages, reactions, back-and-forth, not essays.
- Include timestamps relative to now (e.g. "Tomorrow 9am", "Day 3 2pm").
- Show concrete wins: tasks getting done, offers getting traction, decisions being made, blockers getting cleared.
- 8-15 messages for 1d, 12-20 for 3d, 15-25 for 7d, 20-35 for 30d.

Respond in this exact JSON format:
{
  "messages": [
    {"role": "user"|"assistant", "author": "Name", "content": "message text", "timestamp": "relative timestamp"}
  ],
  "keyMilestones": ["milestone 1", "milestone 2", ...],
  "score": <1-10 self-score on how realistic, specific, and actionable this conversation is>
}

JSON only, no markdown fences.`;

  const raw = await aiChat([{ role: "user", content: prompt }], model);
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: { messages: SimulatedMessage[]; keyMilestones: string[]; score: number };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse forecast response");
    parsed = JSON.parse(jsonMatch[0]);
  }

  return {
    horizon,
    label: meta.label,
    messages: parsed.messages || [],
    keyMilestones: parsed.keyMilestones || [],
    score: parsed.score || 5,
  };
}

export async function runForecast(
  chatId: string,
  userGuidance: string,
  { iterations = 2, horizons = ["1d", "3d", "7d", "30d"] as Horizon[], model }: { iterations?: number; horizons?: Horizon[]; model?: string } = {},
): Promise<ForecastResult> {
  const ctx = await gatherContext(chatId);

  const results: HorizonForecast[] = [];

  for (const horizon of horizons) {
    let best: HorizonForecast | undefined;

    for (let i = 0; i < iterations; i++) {
      const attempt = await generateForecast(ctx, userGuidance, horizon, best, model);
      if (!best || attempt.score > best.score) {
        best = attempt;
      }
    }

    results.push(best!);
  }

  return {
    guidance: userGuidance,
    horizons: results,
    iterations,
    generatedAt: new Date(),
  };
}
