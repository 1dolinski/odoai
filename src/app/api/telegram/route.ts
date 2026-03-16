export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { sendMessage, sendMessageWithButtons, getChatAdmins, reactToMessage, reactWithEmoji } from "@/lib/telegram";
import { chat as aiChat, chatWithUsage } from "@/lib/openrouter";
import { webSearch } from "@/lib/search";
import { qmdSearch, qmdStatus, formatQMDResults, writePeopleSnapshot } from "@/lib/knowledge";
import { buildSystemPrompt, maybeUpdateContext, autoExtract, extractPersonInfo, deepProcessDump, maybeProactiveSuggest } from "@/lib/brain";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Job from "@/models/Job";
import Person from "@/models/Person";
import Check from "@/models/Check";
import Activity from "@/models/Activity";
import SharedLink from "@/models/SharedLink";
import { nanoid } from "nanoid";
import { trackSpend } from "@/lib/spend";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const BOT_USERNAME = "@odoai_bot";

let _botId: number | null = null;
async function getBotId(): Promise<number> {
  if (_botId) return _botId;
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await res.json();
  _botId = data.result?.id ?? 0;
  return _botId!;
}

interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

interface TelegramUpdate {
  message?: {
    message_id: number;
    from: TelegramUser;
    chat: { id: number; title?: string; type: string };
    text?: string;
    date: number;
    new_chat_members?: TelegramUser[];
    left_chat_member?: TelegramUser;
  };
}

// ---- Commands ----

async function cmdHelp(chatId: number) {
  const helpText = [
    "🤖 odoai",
    "",
    "I live in your chat. I listen, learn context, and help when you need me.",
    "",
    "Modes:",
    "/passive — I only respond when mentioned",
    "/active [job] — I become an active collaborator",
    "/status — Current mode & context",
    "/dashboard — Open web dashboard",
    "",
    "Tasks:",
    "/add [task] — Add todo",
    "/upcoming [task] — Add upcoming",
    "/done [task] — Mark done",
    "/tasks — View board",
    "/optimize — AI plan optimization",
    "",
    "Context:",
    "/dump [info] — Feed me info (I extract tasks, people, intentions)",
    "/recall [query] — Search my memory",
    "/people — Who I know in this chat",
    "/search [query] — Web search",
    "",
    "Sharing:",
    "/share [title] | [content]",
    "",
    `Or just mention me ${BOT_USERNAME} to talk.`,
  ].join("\n");
  return sendMessage(chatId, helpText, "");
}

async function cmdAdd(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /add <task>");
  await Task.create({ telegramChatId: String(chatId), title: args, status: "todo", createdBy: userId, createdByUsername: username });
  Activity.create({ telegramChatId: String(chatId), type: "task_added", title: args, actor: username || userId }).catch(console.error);
  return sendMessage(chatId, `✅ *todo*: ${args}`);
}

async function cmdUpcoming(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /upcoming <task>");
  await Task.create({ telegramChatId: String(chatId), title: args, status: "upcoming", createdBy: userId, createdByUsername: username });
  Activity.create({ telegramChatId: String(chatId), type: "task_upcoming", title: args, actor: username || userId }).catch(console.error);
  return sendMessage(chatId, `📋 *upcoming*: ${args}`);
}

async function cmdDone(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /done <task>");
  const existing = await Task.findOne({
    telegramChatId: String(chatId),
    title: { $regex: new RegExp(args, "i") },
    status: { $ne: "done" },
  });
  if (existing) {
    const prevStatus = existing.status;
    existing.status = "done";
    existing.completedAt = new Date();
    await existing.save();
    Activity.create({ telegramChatId: String(chatId), type: "task_converted", title: existing.title, detail: `${prevStatus} → done`, actor: username || userId }).catch(console.error);
    return sendMessage(chatId, `🎉 Done: ${existing.title}`);
  }
  await Task.create({ telegramChatId: String(chatId), title: args, status: "done", createdBy: userId, createdByUsername: username, completedAt: new Date() });
  Activity.create({ telegramChatId: String(chatId), type: "task_done", title: args, actor: username || userId }).catch(console.error);
  return sendMessage(chatId, `🎉 Done: ${args}`);
}

async function cmdTasks(chatId: number) {
  const tasks = await Task.find({ telegramChatId: String(chatId) }).sort({ createdAt: -1 });
  if (!tasks.length) return sendMessage(chatId, "No tasks yet. /add something.");

  const grouped = { todo: [] as string[], upcoming: [] as string[], done: [] as string[] };
  for (const t of tasks) {
    grouped[t.status as keyof typeof grouped].push(`• ${t.title}`);
  }

  let msg = "*📋 Tasks*\n\n";
  if (grouped.todo.length) msg += `*Todo:*\n${grouped.todo.join("\n")}\n\n`;
  if (grouped.upcoming.length) msg += `*Upcoming:*\n${grouped.upcoming.join("\n")}\n\n`;
  if (grouped.done.length) msg += `*Done:*\n${grouped.done.join("\n")}`;

  return sendMessage(chatId, msg);
}

async function cmdOptimize(chatId: number) {
  const tasks = await Task.find({ telegramChatId: String(chatId), status: { $ne: "done" } });
  if (!tasks.length) return sendMessage(chatId, "No active tasks to optimize.");

  const taskList = tasks.map((t) => `[${t.status}] ${t.title}`).join("\n");

  // Pull relevant knowledge from QMD to enrich optimization
  const knowledgeResults = await qmdSearch(`optimize plan tasks: ${taskList.substring(0, 200)}`);
  const knowledgeContext = knowledgeResults.length
    ? `\n\nRelevant knowledge from memory:\n${formatQMDResults(knowledgeResults)}`
    : "";

  const chatDoc = await Chat.findOne({ telegramChatId: String(chatId) });
  const systemPrompt = await buildSystemPrompt(String(chatId), taskList);
  const response = await aiChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Here are the current tasks:\n${taskList}${knowledgeContext}\n\nOptimize this plan: priorities, blockers, sequencing, missing steps. Be specific.`,
    },
  ], chatDoc?.aiModel || undefined);

  return sendMessage(chatId, `🧠 *Plan Optimization*\n\n${response}`);
}

async function cmdDump(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /dump <information>");

  await sendMessage(chatId, "🧠 Processing dump...");

  const parsed = await deepProcessDump(String(chatId), userId, username, args);

  const linkId = nanoid(10);
  await SharedLink.create({
    linkId,
    telegramChatId: String(chatId),
    title: parsed.title || "Info Dump",
    content: parsed.summary || args,
    createdBy: userId,
    createdByUsername: username,
  });

  let reply = `📝 *Got it.* Processed your dump.\n`;
  if (parsed.tasks?.length) reply += `\n📋 Extracted *${parsed.tasks.length}* tasks`;
  if (parsed.people?.length) reply += `\n👥 Noted *${parsed.people.length}* people`;
  if (parsed.intentions?.length) reply += `\n🎯 Tracked *${parsed.intentions.length}* intentions`;
  reply += `\n📚 Indexed for semantic recall`;
  reply += `\n\n🔗 ${APP_URL}/share/${linkId}`;

  return sendMessage(chatId, reply);
}

async function cmdRecall(chatId: number, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /recall <what to search for>");

  const results = await qmdSearch(args);
  if (!results.length) {
    return sendMessage(chatId, `🔍 No results for "${args}". Dump more info with /dump to build my memory.`);
  }

  let msg = `🧠 *Recall: ${args}*\n\n`;
  for (const r of results.slice(0, 5)) {
    msg += `*${r.title}* (${Math.round(r.score * 100)}%)\n`;
    if (r.snippet) msg += `${r.snippet.substring(0, 150)}\n`;
    msg += "\n";
  }

  return sendMessage(chatId, msg);
}

async function cmdPeople(chatId: number) {
  const people = await Person.find({ telegramChatId: String(chatId) }).sort({ messageCount: -1 });
  if (!people.length) return sendMessage(chatId, "Haven't met anyone yet. I learn as people chat.");

  let msg = "*👥 People*\n\n";
  for (const p of people) {
    msg += `*@${p.username || p.firstName || p.telegramUserId}*`;
    if (p.role) msg += ` — ${p.role}`;
    msg += `\n`;
    if (p.intentions.length) msg += `  🎯 ${p.intentions.join(", ")}\n`;
    if (p.context) msg += `  💬 ${p.context}\n`;
    msg += `  📊 ${p.messageCount} messages\n\n`;
  }

  return sendMessage(chatId, msg);
}

async function cmdSearch(chatId: number, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /search <query>");

  await sendMessage(chatId, `🔍 Searching: ${args}...`);

  try {
    const results = await webSearch(args);
    let msg = `🔍 *Search: ${args}*\n\n`;
    if (results.answer) msg += `${results.answer}\n\n`;
    if (results.results.length) {
      msg += `*Sources:*\n`;
      for (const r of results.results.slice(0, 3)) {
        msg += `• [${r.title}](${r.url})\n`;
      }
    }
    return sendMessage(chatId, msg);
  } catch (err) {
    console.error("Search error:", err);
    return sendMessage(chatId, "Search failed. Check apinow config.");
  }
}

async function cmdShare(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /share <title> | <content>");
  const parts = args.split("|").map((s) => s.trim());
  const title = parts[0];
  const content = parts.slice(1).join("|").trim() || title;

  const linkId = nanoid(10);
  await SharedLink.create({
    linkId,
    telegramChatId: String(chatId),
    title,
    content,
    createdBy: userId,
    createdByUsername: username,
  });

  return sendMessage(chatId, `🔗 ${APP_URL}/share/${linkId}`);
}

async function cmdPassive(chatId: number) {
  await Chat.updateOne({ telegramChatId: String(chatId) }, { $set: { mode: "passive" } });
  return sendMessage(chatId, "👁 *Passive mode.* I'll listen silently and only respond when mentioned.");
}

async function cmdActive(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /active <job description>\nExample: /active launching the MVP by Friday");

  await Chat.updateOne({ telegramChatId: String(chatId) }, { $set: { mode: "active" } });

  const nextCheckIn = new Date(Date.now() + 60 * 60 * 1000);
  await Job.create({
    telegramChatId: String(chatId),
    title: args.substring(0, 100),
    description: args,
    status: "active",
    checkInIntervalMin: 60,
    lastCheckIn: new Date(),
    nextCheckIn,
    createdBy: userId,
    createdByUsername: username,
  });

  return sendMessage(
    chatId,
    `🟢 *Active mode* on: ${args}\n\nI'll collaborate actively — checking in, asking questions, pushing progress. Use /passive to go back to quiet mode.`
  );
}

async function cmdStatus(chatId: number) {
  const [chatDoc, taskCount, personCount, activeJobs, qmdStatusText] = await Promise.all([
    Chat.findOne({ telegramChatId: String(chatId) }),
    Task.countDocuments({ telegramChatId: String(chatId), status: { $ne: "done" } }),
    Person.countDocuments({ telegramChatId: String(chatId) }),
    Job.find({ telegramChatId: String(chatId), status: "active" }),
    qmdStatus(),
  ]);

  const mode = chatDoc?.mode || "passive";
  let msg = `*📊 Status*\n\n`;
  msg += `*Mode:* ${mode === "active" ? "🟢 Active" : "👁 Passive"}\n`;
  msg += `*Active tasks:* ${taskCount}\n`;
  msg += `*People tracked:* ${personCount}\n`;
  if (chatDoc?.contextSummary) msg += `*Context:* Yes (${chatDoc.messages?.length || 0} messages observed)\n`;
  msg += `*QMD:* ${qmdStatusText.substring(0, 100)}\n`;
  if (activeJobs.length) {
    msg += `\n*Active Jobs:*\n`;
    for (const j of activeJobs) msg += `• ${j.title}\n`;
  }

  return sendMessage(chatId, msg);
}

async function cmdDashboard(chatId: number) {
  let chatDoc = await Chat.findOne({ telegramChatId: String(chatId) });
  if (!chatDoc) {
    chatDoc = await Chat.create({ telegramChatId: String(chatId) });
  }

  if (!chatDoc.dashboardToken) {
    chatDoc.dashboardToken = nanoid(16);
    await chatDoc.save();
  }

  const url = `${APP_URL}/dashboard/${chatDoc.dashboardToken}`;
  return sendMessageWithButtons(
    chatId,
    `📊 *Dashboard*\n\nTasks, people, intents, wallet spend, and AI style.`,
    [{ text: "Open Dashboard", url }]
  );
}

// ---- Conversational response (mention / DM) ----

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function wordSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function isSimilarTask(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = wordSet(a);
  const wb = wordSet(b);
  const intersection = [...wa].filter((w) => wb.has(w));
  const union = new Set([...wa, ...wb]);
  const jaccard = intersection.length / union.size;
  if (jaccard >= 0.5) return true;
  const smaller = Math.min(wa.size, wb.size);
  if (smaller > 0 && intersection.length / smaller >= 0.75) return true;
  return false;
}

async function findSimilarTask(chatId: string, title: string): Promise<{ _id: string; title: string; status: string; description?: string } | null> {
  const tasks = await Task.find({ telegramChatId: chatId }).lean();
  for (const t of tasks) {
    if (isSimilarTask(title, (t as { title: string }).title)) {
      return t as { _id: string; title: string; status: string; description?: string };
    }
  }
  return null;
}

async function handleConversation(
  chatId: number,
  userId: string,
  username: string | undefined,
  text: string,
  opts?: { silent?: boolean; messageId?: number }
): Promise<string[]> {
  const cid = String(chatId);

  const [systemPrompt, chatDoc] = await Promise.all([
    buildSystemPrompt(cid, text),
    Chat.findOne({ telegramChatId: cid }),
  ]);
  const recentMessages = chatDoc?.messages?.slice(-20) || [];

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...recentMessages.map((m: { role: string; content: string; telegramUsername?: string }) => ({
      role: m.role as "user" | "assistant",
      content: `${m.telegramUsername ? `@${m.telegramUsername}` : "user"}: ${m.content}`,
    })),
    { role: "user" as const, content: `@${username || userId}: ${text}` },
  ];

  const model = chatDoc?.aiModel || undefined;
  const result = await chatWithUsage(messages, model);
  const response = result.content;
  trackSpend(cid, "openrouter", `chat (${result.model}): ${text.substring(0, 50)}`, result.totalTokens).catch(console.error);

  // Execute action directives
  const actions: string[] = [];
  const cid2 = String(chatId);

  const chatInitiatives = chatDoc?.initiatives?.filter((i: { status: string }) => i.status === "active") || [];
  function resolveInitiative(parts: string[]): string {
    const iniPart = parts.find((p) => p.startsWith("#"));
    if (!iniPart) return "";
    const name = iniPart.replace(/^#/, "").trim().toLowerCase();
    const match = chatInitiatives.find((i: { name: string }) => i.name.toLowerCase() === name);
    return match ? (match as { id: string }).id : "";
  }

  const todoMatches = [...response.matchAll(/\[ADD_TODO:\s*(.+?)\]/gi)];
  for (const m of todoMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const title = parts[0];
    const dueDate = parts[1] && /\d{4}-\d{2}-\d{2}/.test(parts[1]) ? new Date(parts[1]) : undefined;
    const contextPart = parts.find((p, i) => i > 0 && !/\d{4}-\d{2}-\d{2}/.test(p) && !p.startsWith("@") && !p.startsWith("#"));
    const peoplePart = parts.find((p) => p.startsWith("@"));
    const people = peoplePart ? peoplePart.split(",").map((n) => n.trim().replace(/^@/, "")).filter(Boolean) : [];
    const initiative = resolveInitiative(parts);
    const existing = await findSimilarTask(cid2, title);
    if (existing) {
      const upd: Record<string, unknown> = {};
      if (dueDate) upd.dueDate = dueDate;
      if (contextPart && !existing.description) upd.description = contextPart;
      if (initiative) upd.initiative = initiative;
      if (people.length) upd.$addToSet = { people: { $each: people } };
      if (Object.keys(upd).length) {
        const addToSet = upd.$addToSet;
        delete upd.$addToSet;
        const updateOp: Record<string, unknown> = {};
        if (Object.keys(upd).length) updateOp.$set = upd;
        if (addToSet) updateOp.$addToSet = addToSet;
        if (Object.keys(updateOp).length) await Task.updateOne({ _id: existing._id }, updateOp);
      }
      continue;
    }
    const taskData: Record<string, unknown> = { telegramChatId: cid2, title, status: "todo", createdBy: userId, createdByUsername: username, people };
    if (dueDate) taskData.dueDate = dueDate;
    if (contextPart) taskData.description = contextPart;
    if (initiative) taskData.initiative = initiative;
    await Task.create(taskData);
    actions.push(`+ todo: ${title}${people.length ? ` (${people.join(", ")})` : ""}${dueDate ? ` (due ${parts[1]})` : ""}`);
    Activity.create({ telegramChatId: cid2, type: "task_added", title, detail: contextPart || (dueDate ? `due ${parts[1]}` : undefined), actor: username || userId }).catch(console.error);
  }

  const upcomingMatches = [...response.matchAll(/\[ADD_UPCOMING:\s*(.+?)\]/gi)];
  for (const m of upcomingMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const title = parts[0];
    const dueDate = parts[1] && /\d{4}-\d{2}-\d{2}/.test(parts[1]) ? new Date(parts[1]) : undefined;
    const contextPart = parts.find((p, i) => i > 0 && !/\d{4}-\d{2}-\d{2}/.test(p) && !p.startsWith("@") && !p.startsWith("#"));
    const peoplePart = parts.find((p) => p.startsWith("@"));
    const people = peoplePart ? peoplePart.split(",").map((n) => n.trim().replace(/^@/, "")).filter(Boolean) : [];
    const initiative = resolveInitiative(parts);
    const existing = await findSimilarTask(cid2, title);
    if (existing) {
      const upd: Record<string, unknown> = {};
      if (dueDate) upd.dueDate = dueDate;
      if (contextPart && !existing.description) upd.description = contextPart;
      if (initiative) upd.initiative = initiative;
      if (people.length) upd.$addToSet = { people: { $each: people } };
      if (Object.keys(upd).length) {
        const addToSet = upd.$addToSet;
        delete upd.$addToSet;
        const updateOp: Record<string, unknown> = {};
        if (Object.keys(upd).length) updateOp.$set = upd;
        if (addToSet) updateOp.$addToSet = addToSet;
        if (Object.keys(updateOp).length) await Task.updateOne({ _id: existing._id }, updateOp);
      }
      continue;
    }
    const taskData: Record<string, unknown> = { telegramChatId: cid2, title, status: "upcoming", createdBy: userId, createdByUsername: username, people };
    if (dueDate) taskData.dueDate = dueDate;
    if (contextPart) taskData.description = contextPart;
    if (initiative) taskData.initiative = initiative;
    await Task.create(taskData);
    actions.push(`+ upcoming: ${title}${people.length ? ` (${people.join(", ")})` : ""}${dueDate ? ` (due ${parts[1]})` : ""}`);
    Activity.create({ telegramChatId: cid2, type: "task_upcoming", title, detail: contextPart || (dueDate ? `due ${parts[1]}` : undefined), actor: username || userId }).catch(console.error);
  }

  const doneMatches = [...response.matchAll(/\[MARK_DONE:\s*(.+?)\]/gi)];
  for (const m of doneMatches) {
    const existing = await Task.findOne({
      telegramChatId: cid2,
      title: { $regex: new RegExp(m[1].trim(), "i") },
      status: { $ne: "done" },
    });
    if (existing) {
      const prevStatus = existing.status;
      existing.status = "done";
      existing.completedAt = new Date();
      await existing.save();
      actions.push(`✓ done: ${existing.title}`);
      Activity.create({ telegramChatId: cid2, type: "task_converted", title: existing.title, detail: `${prevStatus} → done`, actor: username || userId }).catch(console.error);
    }
  }

  const personMatches = [...response.matchAll(/\[ADD_PERSON:\s*(.+?)\]/gi)];
  for (const m of personMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const name = parts[0].replace("@", "");
    const role = parts[1] || "";
    const context = parts[2] || "";
    const existing = await Person.findOne({ telegramChatId: cid2, $or: [{ username: name }, { firstName: name }] });
    const isExternalPerson = !existing || existing.source === "manual";
    const personType = isExternalPerson && !existing?.telegramUserId?.match(/^\d+$/) ? "contact" : "member";
    await Person.findOneAndUpdate(
      { telegramChatId: cid2, $or: [{ username: name }, { firstName: name }] },
      {
        $set: { username: name, firstName: name, role, context, lastSeen: new Date(), ...(isExternalPerson && !existing ? { personType } : {}) },
        $setOnInsert: { telegramUserId: `manual_${name}`, intentions: [], relationships: [], messageCount: 0, personType },
      },
      { upsert: true }
    );
    actions.push(`+ ${personType}: ${name}${role ? ` (${role})` : ""}`);
    Activity.create({ telegramChatId: cid2, type: "person_added", title: name, detail: role || undefined, actor: username || userId }).catch(console.error);
  }

  const contactMatches = [...response.matchAll(/\[ADD_CONTACT:\s*(.+?)\]/gi)];
  for (const m of contactMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const name = parts[0].replace("@", "");
    const role = parts[1] || "";
    const context = parts[2] || "";
    const resources = parts[3] || "";
    const access = parts[4] || "";
    await Person.findOneAndUpdate(
      { telegramChatId: cid2, $or: [{ username: name }, { firstName: name }] },
      {
        $set: { username: name, firstName: name, role, context, resources, access, personType: "contact", lastSeen: new Date() },
        $setOnInsert: { telegramUserId: `manual_${name}`, source: "manual", intentions: [], relationships: [], messageCount: 0 },
      },
      { upsert: true }
    );
    actions.push(`+ contact: ${name}${role ? ` (${role})` : ""}`);
    Activity.create({ telegramChatId: cid2, type: "person_added", title: name, detail: `contact${role ? ` — ${role}` : ""}`, actor: username || userId }).catch(console.error);
  }

  const relMatches = [...response.matchAll(/\[ADD_RELATIONSHIP:\s*(.+?)\]/gi)];
  for (const m of relMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const [person1, person2, label, context] = [parts[0], parts[1], parts[2] || "", parts[3] || ""];
    if (person1 && person2) {
      await Person.updateOne(
        { telegramChatId: cid2, $or: [{ username: person1 }, { firstName: person1 }] },
        { $addToSet: { relationships: { name: person2, label, context } } }
      );
      await Person.updateOne(
        { telegramChatId: cid2, $or: [{ username: person2 }, { firstName: person2 }] },
        { $addToSet: { relationships: { name: person1, label, context } } }
      );
      actions.push(`🔗 ${person1} ↔ ${person2}${label ? ` (${label})` : ""}`);
      Activity.create({ telegramChatId: cid2, type: "person_added", title: `${person1} ↔ ${person2}`, detail: context || label || undefined, actor: username || userId }).catch(console.error);
    }
  }

  const checkMatches = [...response.matchAll(/\[SCHEDULE_CHECK:\s*(.+?)\]/gi)];
  for (const m of checkMatches) {
    const parts = m[1].split("|").map((s) => s.trim());
    const desc = parts[0];
    const minutes = parseInt(parts[1]) || 30;
    const scheduledFor = new Date(Date.now() + minutes * 60 * 1000);
    await Check.create({
      telegramChatId: cid2,
      description: desc,
      scheduledFor,
      context: text,
      triggeredBy: userId,
      triggeredByUsername: username,
    });
    actions.push(`⏰ check in ${minutes}m: ${desc}`);
    Activity.create({ telegramChatId: cid2, type: "check_scheduled", title: desc, detail: `in ${minutes}m`, actor: username || userId }).catch(console.error);
  }

  // In active mode, auto-schedule a smart check if the conversation seems actionable
  // and no check was already explicitly scheduled
  const chatDocForMode = await Chat.findOne({ telegramChatId: cid2 });
  if (chatDocForMode?.mode === "active" && checkMatches.length === 0) {
    const shouldSchedule = await aiChat([
      {
        role: "system",
        content: `You decide whether a follow-up check-in should be scheduled based on a conversation. 
Respond with ONLY a JSON object: {"schedule": true/false, "description": "what to check", "minutes": number}
Schedule if: someone committed to a deliverable, a deadline was mentioned, a task was just added that needs follow-up, or there's an open question.
Do NOT schedule for casual chitchat or completed items. Be smart about timing — match the urgency.`,
      },
      {
        role: "user",
        content: `User said: "${text}"\nBot responded: "${response.substring(0, 300)}"`,
      },
    ], chatDocForMode?.aiModel || undefined);
    try {
      const parsed = JSON.parse(shouldSchedule.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      if (parsed.schedule && parsed.description && parsed.minutes) {
        const scheduledFor = new Date(Date.now() + parsed.minutes * 60 * 1000);
        await Check.create({
          telegramChatId: cid2,
          description: parsed.description,
          scheduledFor,
          context: text,
          triggeredBy: "system",
        });
        actions.push(`⏰ auto-check in ${parsed.minutes}m: ${parsed.description}`);
      }
    } catch {
      // AI didn't return valid JSON — no check scheduled, that's fine
    }
  }

  // Self-tuning: style changes
  const styleMatch = response.match(/\[SET_STYLE:\s*(\w+)\]/i);
  if (styleMatch) {
    const validStyles = ["concise", "detailed", "casual", "professional", "technical"];
    const newStyle = styleMatch[1].toLowerCase();
    if (validStyles.includes(newStyle)) {
      await Chat.updateOne({ telegramChatId: cid2 }, { $set: { aiStyle: newStyle } });
      actions.push(`🎨 style → ${newStyle}`);
      Activity.create({ telegramChatId: cid2, type: "style_changed", title: `Style → ${newStyle}`, actor: "odoai" }).catch(console.error);
    }
  }

  // Self-tuning: check-in pace
  const paceMatch = response.match(/\[SET_CHECK_PACE:\s*(\w+)\]/i);
  if (paceMatch) {
    const pace = paceMatch[1].toLowerCase();
    if (pace === "pause") {
      await Check.updateMany(
        { telegramChatId: cid2, status: "pending" },
        { $set: { status: "skipped" } }
      );
      actions.push("⏸ checks paused");
    } else if (pace === "resume") {
      await Check.updateMany(
        { telegramChatId: cid2, status: "skipped" },
        { $set: { status: "pending" } }
      );
      actions.push("▶ checks resumed");
    } else if (pace === "slower") {
      const pending = await Check.find({ telegramChatId: cid2, status: "pending" });
      for (const c of pending) {
        const remaining = c.scheduledFor.getTime() - Date.now();
        if (remaining > 0) {
          c.scheduledFor = new Date(Date.now() + remaining * 2);
          await c.save();
        }
      }
      await Job.updateMany(
        { telegramChatId: cid2, status: "active" },
        [{ $set: { checkInIntervalMin: { $multiply: ["$checkInIntervalMin", 2] } } }]
      );
      actions.push("🐢 check pace slower");
    } else if (pace === "faster") {
      const pending = await Check.find({ telegramChatId: cid2, status: "pending" });
      for (const c of pending) {
        const remaining = c.scheduledFor.getTime() - Date.now();
        if (remaining > 0) {
          c.scheduledFor = new Date(Date.now() + remaining / 2);
          await c.save();
        }
      }
      await Job.updateMany(
        { telegramChatId: cid2, status: "active" },
        [{ $set: { checkInIntervalMin: { $max: [5, { $divide: ["$checkInIntervalMin", 2] }] } } }]
      );
      actions.push("🐇 check pace faster");
    }
  }

  let cleanResponse = response
    .replace(/\[(?:SEARCH|RECALL|ADD_TODO|ADD_UPCOMING|MARK_DONE|ADD_PERSON|ADD_CONTACT|ADD_RELATIONSHIP|SCHEDULE_CHECK|SET_STYLE|SET_CHECK_PACE):\s*.+?\]/gi, "")
    .trim();

  const hasDate = todoMatches.some((m) => /\d{4}-\d{2}-\d{2}/.test(m[1]))
    || upcomingMatches.some((m) => /\d{4}-\d{2}-\d{2}/.test(m[1]))
    || checkMatches.length > 0;

  if (opts?.silent && opts.messageId) {
    if (actions.length > 0 || hasDate) {
      await reactToMessage(chatId, opts.messageId, actions.length, hasDate);
    }
  } else {
    if (actions.length) {
      cleanResponse += "\n\n" + actions.join("\n");
    }
    await sendMessage(chatId, cleanResponse);
  }

  await Chat.findOneAndUpdate(
    { telegramChatId: cid2 },
    { $push: { messages: { role: "assistant", content: cleanResponse } } }
  );

  return actions;
}

// ---- Main webhook handler ----

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const update: TelegramUpdate = await req.json();
    const msg = update.message;
    if (!msg) return NextResponse.json({ ok: true });

    // Handle new members joining the chat
    if (msg.new_chat_members?.length) {
      const chatId = String(msg.chat.id);
      const botId = await getBotId();
      const botJoined = msg.new_chat_members.some((m) => m.id === botId);

      for (const member of msg.new_chat_members) {
        if (member.id === botId) continue;
        await extractPersonInfo(chatId, String(member.id), member.username, member.first_name, "");
      }

      // When bot joins, also sync all admins/members from Telegram API
      if (botJoined) {
        const admins = await getChatAdmins(msg.chat.id);
        for (const member of admins) {
          if (member.isBot) continue;
          const exists = await Person.findOne({
            telegramChatId: chatId,
            telegramUserId: String(member.userId),
          });
          if (!exists) {
            await Person.create({
              telegramChatId: chatId,
              telegramUserId: String(member.userId),
              username: member.username || "",
              firstName: member.firstName || "",
              role: member.status === "creator" ? "owner" : member.status === "administrator" ? "admin" : "",
              source: "telegram",
              intentions: [],
              relationships: [],
              messageCount: 0,
              lastSeen: new Date(),
            });
          }
        }
      }

      const names = msg.new_chat_members
        .filter((m) => m.username !== "odoai_bot")
        .map((m) => `@${m.username || m.first_name}`);
      if (names.length) {
        await Chat.findOneAndUpdate(
          { telegramChatId: chatId },
          {
            $set: { chatTitle: msg.chat.title },
            $push: {
              messages: {
                role: "user" as const,
                content: `[${names.join(", ")} joined the chat]`,
                telegramUserId: String(msg.from.id),
                telegramUsername: msg.from.username,
                firstName: msg.from.first_name,
              },
            },
            $inc: { messagesSinceSummary: 1 },
          },
          { upsert: true }
        );
      }
      const people = await Person.find({ telegramChatId: chatId }).lean();
      writePeopleSnapshot(chatId, people).catch(console.error);
      return NextResponse.json({ ok: true });
    }

    // Handle member leaving
    if (msg.left_chat_member) {
      const chatId = String(msg.chat.id);
      const left = msg.left_chat_member;
      await Chat.findOneAndUpdate(
        { telegramChatId: chatId },
        {
          $push: {
            messages: {
              role: "user" as const,
              content: `[@${left.username || left.first_name} left the chat]`,
              telegramUserId: String(msg.from.id),
              telegramUsername: msg.from.username,
              firstName: msg.from.first_name,
            },
          },
          $inc: { messagesSinceSummary: 1 },
        }
      );
      return NextResponse.json({ ok: true });
    }

    if (!msg.text) return NextResponse.json({ ok: true });

    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const username = msg.from.username;
    const firstName = msg.from.first_name;
    const text = msg.text.trim();

    // Always store every message and track the person
    await Promise.all([
      Chat.findOneAndUpdate(
        { telegramChatId: String(chatId) },
        {
          $set: { chatTitle: msg.chat.title },
          $push: {
            messages: {
              role: "user",
              content: text,
              telegramUserId: userId,
              telegramUsername: username,
              firstName,
            },
          },
          $inc: { messagesSinceSummary: 1 },
        },
        { upsert: true }
      ),
      extractPersonInfo(String(chatId), userId, username, firstName, text),
    ]);

    // Background: auto-extract insights + update context summary + QMD knowledge
    autoExtract(String(chatId)).catch(console.error);
    maybeUpdateContext(String(chatId)).catch(console.error);

    const TRIGGER_EMOJIS = /[\u{1F600}-\u{1F606}\u{1F609}-\u{1F60E}\u{1F617}-\u{1F61D}\u{1F920}\u{1F973}\u{1F60A}\u{1F607}\u{263A}\u{1F642}\u{1F643}]/u;
    const isMentioned = text.includes(BOT_USERNAME) || TRIGGER_EMOJIS.test(text);
    const isPrivate = msg.chat.type === "private";
    const cleanText = text.replace(BOT_USERNAME, "").trim();

    // Handle slash commands
    if (cleanText.startsWith("/")) {
      const spaceIdx = cleanText.indexOf(" ");
      const command = (spaceIdx > -1 ? cleanText.substring(0, spaceIdx) : cleanText).toLowerCase().split("@")[0];
      const args = spaceIdx > -1 ? cleanText.substring(spaceIdx + 1).trim() : "";

      switch (command) {
        case "/start":
        case "/help":
          return ok(await cmdHelp(chatId));
        case "/add":
        case "/todo":
          return ok(await cmdAdd(chatId, userId, username, args));
        case "/upcoming":
          return ok(await cmdUpcoming(chatId, userId, username, args));
        case "/done":
          return ok(await cmdDone(chatId, userId, username, args));
        case "/tasks":
          return ok(await cmdTasks(chatId));
        case "/optimize":
          return ok(await cmdOptimize(chatId));
        case "/dump":
          return ok(await cmdDump(chatId, userId, username, args));
        case "/recall":
          return ok(await cmdRecall(chatId, args));
        case "/people":
          return ok(await cmdPeople(chatId));
        case "/search":
          return ok(await cmdSearch(chatId, args));
        case "/share":
          return ok(await cmdShare(chatId, userId, username, args));
        case "/passive":
          return ok(await cmdPassive(chatId));
        case "/active":
          return ok(await cmdActive(chatId, userId, username, args));
        case "/status":
          return ok(await cmdStatus(chatId));
        case "/dashboard":
          return ok(await cmdDashboard(chatId));
      }
    }

    // If mentioned or in DM — respond based on user intent
    if (isMentioned || isPrivate) {
      const cid = String(chatId);
      const trigger = isPrivate ? "dm" : text.includes(BOT_USERNAME) ? "mention" : "emoji";
      const isSilent = trigger === "emoji";
      Activity.create({
        telegramChatId: cid,
        type: "ai_triggered",
        title: `AI triggered via ${trigger}`,
        detail: cleanText.substring(0, 120),
        actor: username || userId,
      }).catch(console.error);
      reactWithEmoji(chatId, msg.message_id, "👀").catch(console.error);
      autoExtract(cid, true).catch(console.error);
      maybeUpdateContext(cid).catch(console.error);
      const actions = await handleConversation(chatId, userId, username, cleanText, {
        silent: isSilent,
        messageId: msg.message_id,
      });
      if (actions.length === 0) {
        reactWithEmoji(chatId, msg.message_id, "👌").catch(console.error);
      }
      Chat.updateOne({ telegramChatId: cid }, { $set: { lastReviewedAt: new Date() } }).catch(console.error);
      Activity.create({
        telegramChatId: cid,
        type: "ai_result",
        title: actions.length
          ? `AI took ${actions.length} action${actions.length > 1 ? "s" : ""}`
          : "AI responded (no actions)",
        detail: actions.length ? actions.join(" · ") : "conversational reply",
        actor: "odoai",
      }).catch(console.error);
      return ok();
    }

    // Check mode for non-mentioned messages
    const chatMode = (await Chat.findOne({ telegramChatId: String(chatId) }))?.mode || "passive";

    // Aggressive mode: AI reviews every message silently — react with emoji only
    if (chatMode === "aggressive") {
      const cid = String(chatId);
      reactWithEmoji(chatId, msg.message_id, "👀").catch(console.error);
      Activity.create({
        telegramChatId: cid,
        type: "ai_triggered",
        title: "AI auto-review (aggressive)",
        detail: cleanText.substring(0, 120),
        actor: username || userId,
      }).catch(console.error);
      autoExtract(cid, true).catch(console.error);
      const actions = await handleConversation(chatId, userId, username, cleanText, {
        silent: true,
        messageId: msg.message_id,
      });
      if (actions.length === 0) {
        reactWithEmoji(chatId, msg.message_id, "👌").catch(console.error);
      }
      Chat.updateOne({ telegramChatId: cid }, { $set: { lastReviewedAt: new Date() } }).catch(console.error);
      Activity.create({
        telegramChatId: cid,
        type: "ai_result",
        title: actions.length
          ? `AI took ${actions.length} action${actions.length > 1 ? "s" : ""}`
          : "AI reviewed (no actions)",
        detail: actions.length ? actions.join(" · ") : "reviewed message",
        actor: "odoai",
      }).catch(console.error);
      return ok();
    }

    // Active mode: maybe proactively suggest something useful
    if (chatMode === "active") {
      const suggestion = await maybeProactiveSuggest(String(chatId));
      if (suggestion) {
        Activity.create({
          telegramChatId: String(chatId),
          type: "ai_triggered",
          title: "AI proactive suggestion",
          detail: suggestion.substring(0, 120),
          actor: "odoai",
        }).catch(console.error);
        await sendMessage(chatId, suggestion, "");
        await Chat.findOneAndUpdate(
          { telegramChatId: String(chatId) },
          { $push: { messages: { role: "assistant", content: suggestion } } }
        );
      }
    }

    // Passive mode: just observed. Stamp lastReviewedAt so we know where we left off.
    Chat.updateOne({ telegramChatId: String(chatId) }, { $set: { lastReviewedAt: new Date() } }).catch(console.error);

    return ok();
  } catch (error) {
    console.error("Telegram webhook error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

function ok(data?: unknown) {
  void data;
  return NextResponse.json({ ok: true });
}
