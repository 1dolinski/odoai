import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { sendMessage, sendMessageWithButtons } from "@/lib/telegram";
import { chat as aiChat, chatWithUsage } from "@/lib/openrouter";
import { webSearch } from "@/lib/search";
import { qmdSearch, qmdStatus, formatQMDResults, writePeopleSnapshot } from "@/lib/knowledge";
import { buildSystemPrompt, maybeUpdateContext, extractPersonInfo, deepProcessDump } from "@/lib/brain";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Job from "@/models/Job";
import Person from "@/models/Person";
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
  return sendMessage(
    chatId,
    `🤖 *odoai*\n\nI live in your chat. I listen, learn context, and help when you need me.\n\n*Modes:*\n/passive — I only respond when mentioned\n/active <job> — I become an active collaborator\n/status — Current mode & context\n/dashboard — Open web dashboard\n\n*Tasks:*\n/add <task> — Add todo\n/upcoming <task> — Add upcoming\n/done <task> — Mark done\n/tasks — View board\n/optimize — AI plan optimization\n\n*Context:*\n/dump <info> — Feed me info (I extract tasks, people, intentions)\n/recall <query> — Search my memory (QMD semantic search)\n/people — Who I know in this chat\n/search <query> — Web search\n\n*Sharing:*\n/share <title> | <content>\n\nOr just mention me ${BOT_USERNAME} to talk.`
  );
}

async function cmdAdd(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /add <task>");
  await Task.create({ telegramChatId: String(chatId), title: args, status: "todo", createdBy: userId, createdByUsername: username });
  return sendMessage(chatId, `✅ *todo*: ${args}`);
}

async function cmdUpcoming(chatId: number, userId: string, username: string | undefined, args: string) {
  if (!args) return sendMessage(chatId, "Usage: /upcoming <task>");
  await Task.create({ telegramChatId: String(chatId), title: args, status: "upcoming", createdBy: userId, createdByUsername: username });
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
    existing.status = "done";
    await existing.save();
    return sendMessage(chatId, `🎉 Done: ${existing.title}`);
  }
  await Task.create({ telegramChatId: String(chatId), title: args, status: "done", createdBy: userId, createdByUsername: username });
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

  const systemPrompt = await buildSystemPrompt(String(chatId), taskList);
  const response = await aiChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Here are the current tasks:\n${taskList}${knowledgeContext}\n\nOptimize this plan: priorities, blockers, sequencing, missing steps. Be specific.`,
    },
  ]);

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

async function handleConversation(
  chatId: number,
  userId: string,
  username: string | undefined,
  text: string
) {
  // Build system prompt with RAG from QMD
  const systemPrompt = await buildSystemPrompt(String(chatId), text);
  const chatDoc = await Chat.findOne({ telegramChatId: String(chatId) });
  const recentMessages = chatDoc?.messages?.slice(-20) || [];

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...recentMessages.map((m: { role: string; content: string; telegramUsername?: string }) => ({
      role: m.role as "user" | "assistant",
      content: `${m.telegramUsername ? `@${m.telegramUsername}` : "user"}: ${m.content}`,
    })),
    { role: "user" as const, content: `@${username || userId}: ${text}` },
  ];

  const cid = String(chatId);
  let result = await chatWithUsage(messages);
  let response = result.content;
  trackSpend(cid, "openrouter", `chat: ${text.substring(0, 50)}`, result.totalTokens).catch(console.error);

  // Handle tool use: [SEARCH: query] for web, [RECALL: query] for QMD
  let iterations = 0;
  while (iterations < 3 && (response.includes("[SEARCH:") || response.includes("[RECALL:"))) {
    iterations++;

    const searchMatch = response.match(/\[SEARCH:\s*(.+?)\]/i);
    const recallMatch = response.match(/\[RECALL:\s*(.+?)\]/i);

    if (searchMatch) {
      try {
        const searchResults = await webSearch(searchMatch[1]);
        trackSpend(cid, "apinow_search", `search: ${searchMatch[1].substring(0, 50)}`).catch(console.error);
        const searchContext = searchResults.answer
          ? `Web search for "${searchMatch[1]}": ${searchResults.answer}`
          : `Web results for "${searchMatch[1]}": ${searchResults.results.map((r) => `${r.title}: ${r.content}`).join("\n")}`;

        messages.push({ role: "assistant" as const, content: response });
        messages.push({ role: "user" as const, content: `[System: web search results]\n${searchContext}` });
      } catch {
        messages.push({ role: "assistant" as const, content: response });
        messages.push({ role: "user" as const, content: `[System: web search failed]` });
      }
    }

    if (recallMatch) {
      const recallResults = await qmdSearch(recallMatch[1]);
      trackSpend(cid, "qmd", `recall: ${recallMatch[1].substring(0, 50)}`).catch(console.error);
      const recallContext = recallResults.length
        ? `Knowledge recall for "${recallMatch[1]}":\n${formatQMDResults(recallResults)}`
        : `No knowledge found for "${recallMatch[1]}"`;

      messages.push({ role: "assistant" as const, content: response });
      messages.push({ role: "user" as const, content: `[System: knowledge recall]\n${recallContext}` });
    }

    result = await chatWithUsage(messages);
    response = result.content;
    trackSpend(cid, "openrouter", `chat follow-up #${iterations}`, result.totalTokens).catch(console.error);
  }

  // Clean any remaining tool markers from final response
  response = response.replace(/\[(?:SEARCH|RECALL):\s*.+?\]/gi, "").trim();

  await sendMessage(chatId, response);

  await Chat.findOneAndUpdate(
    { telegramChatId: String(chatId) },
    { $push: { messages: { role: "assistant", content: response } } }
  );
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
      for (const member of msg.new_chat_members) {
        if (member.id === (await getBotId())) continue;
        await extractPersonInfo(chatId, String(member.id), member.username, member.first_name, "");
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
        // Write updated people snapshot to QMD
        const people = await Person.find({ telegramChatId: chatId }).lean();
        writePeopleSnapshot(chatId, people).catch(console.error);
      }
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

    // Background: maybe update context summary + QMD knowledge
    maybeUpdateContext(String(chatId)).catch(console.error);

    const isMentioned = text.includes(BOT_USERNAME);
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

    // If mentioned or in DM, have a conversation
    if (isMentioned || isPrivate) {
      await handleConversation(chatId, userId, username, cleanText);
      return ok();
    }

    // Passive mode: just observed. No response.
    // Active mode: check if we should proactively respond
    const chatDoc = await Chat.findOne({ telegramChatId: String(chatId) });
    if (chatDoc?.mode === "active") {
      const activeJobs = await Job.find({ telegramChatId: String(chatId), status: "active" });
      if (activeJobs.length) {
        const jobContext = activeJobs.map((j) => j.title).join(", ");
        const shouldRespond = await aiChat([
          {
            role: "system",
            content: `You are deciding whether to respond to a message in a group chat. The active job is: "${jobContext}". Only respond "YES" if the message is directly relevant to the job and you have something useful to add. Otherwise respond "NO". Single word answer only.`,
          },
          { role: "user", content: text },
        ]);

        if (shouldRespond.trim().toUpperCase() === "YES") {
          await handleConversation(chatId, userId, username, text);
        }
      }
    }

    return ok();
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

function ok(data?: unknown) {
  void data;
  return NextResponse.json({ ok: true });
}
