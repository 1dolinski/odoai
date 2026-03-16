import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSpendSummary, getRecentSpends } from "@/lib/spend";
import Chat, { AiStyle, WATCH_DEFAULTS } from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";
import Check from "@/models/Check";
import Activity from "@/models/Activity";
import { autoExtract, maybeUpdateContext, deepProcessDump } from "@/lib/brain";
import { writeKnowledge } from "@/lib/knowledge";

export async function GET(req: NextRequest) {
  await connectDB();

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const chatId = chat.telegramChatId;

  const [tasks, people, jobs, checks, activities, spendSummary, recentSpends] = await Promise.all([
    Task.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).lean(),
    Person.find({ telegramChatId: chatId }).sort({ messageCount: -1 }).lean(),
    Job.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).lean(),
    Check.find({ telegramChatId: chatId }).sort({ scheduledFor: 1 }).lean(),
    Activity.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(50).lean(),
    getSpendSummary(chatId),
    getRecentSpends(chatId),
  ]);

  return NextResponse.json({
    chat: {
      telegramChatId: chat.telegramChatId,
      title: chat.chatTitle || "Untitled Chat",
      mode: chat.mode,
      aiStyle: chat.aiStyle || "concise",
      watchSettings: { ...WATCH_DEFAULTS, ...chat.watchSettings },
      guidance: chat.guidance || "",
      contextSummary: chat.contextSummary,
      lastSyncAt: chat.lastSyncAt || null,
      messageCount: chat.messages?.length || 0,
    },
    tasks,
    people: people.map((p) => ({
      _id: p._id,
      username: p.username,
      firstName: p.firstName,
      role: p.role,
      context: p.context,
      intentions: p.intentions,
      relationships: (p.relationships || []).map((r: { name: string; label: string; context: string }) => ({
        name: r.name,
        label: r.label,
        context: r.context,
      })),
      email: p.email,
      phone: p.phone,
      notes: p.notes,
      source: p.source || "telegram",
      messageCount: p.messageCount,
      lastSeen: p.lastSeen,
    })),
    jobs,
    checks: checks.map((c) => ({
      _id: c._id,
      description: c.description,
      status: c.status,
      scheduledFor: c.scheduledFor,
      context: c.context,
      triggeredByUsername: c.triggeredByUsername,
      result: c.result,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    })),
    activities: activities.map((a) => ({
      _id: a._id,
      type: a.type,
      title: a.title,
      detail: a.detail,
      actor: a.actor,
      createdAt: a.createdAt,
    })),
    spend: spendSummary,
    recentSpends,
  });
}

const VALID_STYLES: AiStyle[] = ["concise", "detailed", "casual", "professional", "technical"];
const VALID_WATCH_KEYS = ["deadlines", "blockers", "actionItems", "sentiment", "questions", "followUps", "newPeople", "decisions"];

export async function PATCH(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { token, aiStyle, watchSettings, chatTitle } = body;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token });
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  if (chatTitle && typeof chatTitle === "string") {
    chat.chatTitle = chatTitle.trim();
  }

  if (aiStyle && VALID_STYLES.includes(aiStyle)) {
    chat.aiStyle = aiStyle;
  }

  if (watchSettings && typeof watchSettings === "object") {
    if (!chat.watchSettings) {
      chat.watchSettings = { ...WATCH_DEFAULTS };
    }
    for (const key of VALID_WATCH_KEYS) {
      if (key in watchSettings && typeof watchSettings[key] === "boolean") {
        (chat.watchSettings as Record<string, boolean>)[key] = watchSettings[key];
      }
    }
    chat.markModified("watchSettings");
  }

  await chat.save();

  return NextResponse.json({ ok: true, aiStyle: chat.aiStyle, watchSettings: chat.watchSettings });
}

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { token, action, contact } = body;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const chatId = chat.telegramChatId;

  if (action === "sync") {
    await Promise.all([
      autoExtract(chatId, true),
      maybeUpdateContext(chatId),
    ]);
    const updated = await Chat.findOne({ telegramChatId: chatId }).lean();
    return NextResponse.json({ ok: true, lastSyncAt: updated?.lastSyncAt });
  }

  if (action === "addContact" && contact) {
    const name = (contact.name || "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const person = await Person.findOneAndUpdate(
      { telegramChatId: chatId, $or: [{ username: name }, { firstName: name }] },
      {
        $set: {
          username: name,
          firstName: name,
          role: contact.role || "",
          context: contact.context || "",
          email: contact.email || "",
          phone: contact.phone || "",
          notes: contact.notes || "",
          source: "manual",
          lastSeen: new Date(),
        },
        $setOnInsert: {
          telegramUserId: `manual_${name}_${Date.now()}`,
          intentions: [],
          relationships: [],
          messageCount: 0,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ ok: true, person });
  }

  if (action === "updateContact" && contact && contact._id) {
    const update: Record<string, string> = {};
    if (contact.role !== undefined) update.role = contact.role;
    if (contact.context !== undefined) update.context = contact.context;
    if (contact.email !== undefined) update.email = contact.email;
    if (contact.phone !== undefined) update.phone = contact.phone;
    if (contact.notes !== undefined) update.notes = contact.notes;

    await Person.updateOne({ _id: contact._id, telegramChatId: chatId }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteContact" && contact?._id) {
    await Person.deleteOne({ _id: contact._id, telegramChatId: chatId, source: "manual" });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateTaskStatus" && body.taskId && body.status) {
    const validStatuses = ["todo", "upcoming", "done"];
    if (!validStatuses.includes(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    const update: Record<string, unknown> = { status: body.status };
    if (body.status === "done") update.completedAt = new Date();
    else update.completedAt = null;
    await Task.updateOne({ _id: body.taskId, telegramChatId: chatId }, { $set: update });
    Activity.create({ telegramChatId: chatId, type: body.status === "done" ? "task_converted" : "task_added", title: body.taskTitle || "task", detail: `→ ${body.status} (dashboard)`, actor: "dashboard" }).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "dump" && body.text) {
    const text = (body.text as string).trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    deepProcessDump(chatId, "dashboard", "dashboard", text).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "saveGuidance") {
    const guidance = (body.guidance as string || "").trim();
    await Chat.updateOne({ telegramChatId: chatId }, { $set: { guidance } });
    if (guidance) {
      writeKnowledge(chatId, "context", "chat-guidance", `# Chat Guidance\n\n${guidance}`).catch(console.error);
    }
    return NextResponse.json({ ok: true, guidance });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
