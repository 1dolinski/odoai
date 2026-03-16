import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSpendSummary, getRecentSpends } from "@/lib/spend";
import Chat, { AiStyle, WATCH_DEFAULTS } from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";
import Check from "@/models/Check";
import Activity from "@/models/Activity";
import { autoExtract, maybeUpdateContext, deepProcessDump, generateAiFeed } from "@/lib/brain";
import { writeKnowledge, writePersonKnowledge, writePeopleSnapshot } from "@/lib/knowledge";
import { getChatAdmins } from "@/lib/telegram";

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
      aiModel: chat.aiModel || "moonshotai/kimi-k2.5",
      aiStyle: chat.aiStyle || "concise",
      watchSettings: { ...WATCH_DEFAULTS, ...chat.watchSettings },
      guidance: chat.guidance || "",
      dumps: (chat.dumps || []).sort((a: { createdAt: Date }, b: { createdAt: Date }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      contextSummary: chat.contextSummary,
      lastSyncAt: chat.lastSyncAt || null,
      lastReviewedAt: chat.lastReviewedAt || null,
      aiFeedEnabled: chat.aiFeedEnabled ?? false,
      aiFeed: (chat.aiFeed || []).sort((a: { createdAt: Date }, b: { createdAt: Date }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      messageCount: chat.messages?.length || 0,
    },
    tasks,
    initiatives: chat.initiatives || [],
    people: people.map((p) => ({
      _id: p._id,
      username: p.username,
      firstName: p.firstName,
      role: p.role && p.role !== "null" ? p.role : "",
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
      personType: p.personType || "member",
      dumps: p.dumps || [],
      resources: p.resources || "",
      access: p.access || "",
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
    walletAddress: process.env.WALLET_ADDRESS || "",
  });
}

const VALID_STYLES: AiStyle[] = ["concise", "detailed", "casual", "professional", "technical"];
const VALID_WATCH_KEYS = ["deadlines", "blockers", "actionItems", "sentiment", "questions", "followUps", "newPeople", "decisions", "opportunities"];

export async function PATCH(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { token, aiStyle, aiModel, watchSettings, chatTitle, mode, aiFeedEnabled } = body;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token });
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  if (chatTitle && typeof chatTitle === "string") {
    chat.chatTitle = chatTitle.trim();
  }

  const VALID_MODES = ["passive", "active", "aggressive"];
  if (mode && VALID_MODES.includes(mode)) {
    chat.mode = mode;
  }

  if (aiStyle && VALID_STYLES.includes(aiStyle)) {
    chat.aiStyle = aiStyle;
  }

  if (typeof aiFeedEnabled === "boolean") {
    chat.aiFeedEnabled = aiFeedEnabled;
  }

  if (aiModel && typeof aiModel === "string") {
    chat.aiModel = aiModel.trim();
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

  if (action === "syncMembers") {
    const admins = await getChatAdmins(chatId);
    let added = 0;
    for (const member of admins) {
      if (member.isBot) continue;
      const exists = await Person.findOne({
        telegramChatId: chatId,
        $or: [
          { telegramUserId: String(member.userId) },
          ...(member.username ? [{ username: member.username }] : []),
        ],
      });
      if (!exists) {
        await Person.create({
          telegramChatId: chatId,
          telegramUserId: String(member.userId),
          username: member.username || "",
          firstName: member.firstName || "",
          role: member.status === "creator" ? "owner" : member.status === "administrator" ? "admin" : "",
          source: "telegram",
          personType: "member",
          intentions: [],
          relationships: [],
          messageCount: 0,
          lastSeen: new Date(),
        });
        added++;
      }
    }
    const people = await Person.find({ telegramChatId: chatId }).lean();
    writePeopleSnapshot(chatId, people).catch(console.error);
    return NextResponse.json({ ok: true, added, total: people.length });
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
          resources: contact.resources || "",
          access: contact.access || "",
          source: "manual",
          personType: "contact",
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
    if (contact.resources !== undefined) update.resources = contact.resources;
    if (contact.access !== undefined) update.access = contact.access;
    if (contact.personType !== undefined) update.personType = contact.personType;

    await Person.updateOne({ _id: contact._id, telegramChatId: chatId }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateTaskPeople" && body.taskId) {
    const people = Array.isArray(body.people) ? body.people.filter((p: unknown) => typeof p === "string" && p) : [];
    await Task.updateOne({ _id: body.taskId, telegramChatId: chatId }, { $set: { people } });
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteContact" && contact?._id) {
    await Person.deleteOne({ _id: contact._id, telegramChatId: chatId, source: "manual" });
    return NextResponse.json({ ok: true });
  }

  if (action === "addTask" && body.task) {
    const { title, status, dueDate } = body.task;
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const taskData: Record<string, unknown> = {
      status: ["todo", "upcoming", "done"].includes(status) ? status : "todo",
      createdBy: "dashboard",
      createdByUsername: "dashboard",
    };
    if (dueDate && /\d{4}-\d{2}-\d{2}/.test(dueDate)) taskData.dueDate = new Date(dueDate);
    if (status === "done") taskData.completedAt = new Date();
    await Task.findOneAndUpdate(
      { telegramChatId: chatId, title },
      { $set: taskData },
      { upsert: true }
    );
    const type = status === "upcoming" ? "task_upcoming" : status === "done" ? "task_done" : "task_added";
    Activity.create({ telegramChatId: chatId, type, title, detail: "from dashboard", actor: "dashboard" }).catch(console.error);
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

  if (action === "updateTaskDate" && body.taskId) {
    const update: Record<string, unknown> = {};
    if (body.dueDate && /\d{4}-\d{2}-\d{2}/.test(body.dueDate)) {
      update.dueDate = new Date(body.dueDate);
    } else {
      update.dueDate = null;
    }
    await Task.updateOne({ _id: body.taskId, telegramChatId: chatId }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteTask" && body.taskId) {
    const task = await Task.findOneAndDelete({ _id: body.taskId, telegramChatId: chatId });
    if (task) {
      Activity.create({ telegramChatId: chatId, type: "task_converted", title: task.title, detail: "deleted (dashboard)", actor: "dashboard" }).catch(console.error);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "personDump" && body.personId && body.text) {
    const text = (body.text as string).trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const person = await Person.findOne({ _id: body.personId, telegramChatId: chatId });
    if (!person) return NextResponse.json({ error: "person not found" }, { status: 404 });
    const personName = person.username || person.firstName || "unknown";
    const entry = { text, source: "dashboard", createdAt: new Date() };
    await Person.updateOne({ _id: body.personId }, { $push: { dumps: entry } });
    writePersonKnowledge(chatId, personName, text, { source: "dashboard", timestamp: entry.createdAt.toISOString() }).catch(console.error);
    Activity.create({ telegramChatId: chatId, type: "dump", title: `Dump → ${personName}`, detail: text.substring(0, 100), actor: "dashboard" }).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "editPersonDump" && body.personId && body.dumpId) {
    const text = (body.text as string || "").trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    await Person.updateOne(
      { _id: body.personId, telegramChatId: chatId, "dumps._id": body.dumpId },
      { $set: { "dumps.$.text": text } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "deletePersonDump" && body.personId && body.dumpId) {
    await Person.updateOne(
      { _id: body.personId, telegramChatId: chatId },
      { $pull: { dumps: { _id: body.dumpId } } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "editChatDump" && body.dumpIndex !== undefined) {
    const text = (body.text as string || "").trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    await Chat.updateOne(
      { telegramChatId: chatId },
      { $set: { [`dumps.${body.dumpIndex}.text`]: text } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteChatDump" && body.dumpIndex !== undefined) {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (chatDoc && chatDoc.dumps[body.dumpIndex]) {
      chatDoc.dumps.splice(body.dumpIndex, 1);
      await chatDoc.save();
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "dump" && body.text) {
    const text = (body.text as string).trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const category = (body.category as string || "general").trim();
    const subject = (body.subject as string || "").trim();
    const entry = { text, source: "dashboard", category, subject, createdAt: new Date() };
    await Chat.updateOne({ telegramChatId: chatId }, { $push: { dumps: entry } });
    const dumpContext = subject ? `[${category}: ${subject}] ${text}` : text;
    deepProcessDump(chatId, "dashboard", "dashboard", dumpContext).catch(console.error);
    const titleLabel = subject ? `${category}: ${subject}` : `${category} dump`;
    Activity.create({ telegramChatId: chatId, type: "dump", title: titleLabel, detail: text.substring(0, 100), actor: "dashboard" }).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "generateFeed") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    const items = await generateAiFeed(chatId);
    if (items.length) {
      const entries = items.map((i) => ({ type: i.type, content: i.content, createdAt: new Date() }));
      await Chat.updateOne({ telegramChatId: chatId }, { $push: { aiFeed: { $each: entries } } });
      Activity.create({ telegramChatId: chatId, type: "ai_triggered", title: "AI feed generated", detail: `${items.length} items`, actor: "odoai" }).catch(console.error);
    }
    return NextResponse.json({ ok: true, items });
  }

  if (action === "clearFeed") {
    await Chat.updateOne({ telegramChatId: chatId }, { $set: { aiFeed: [] } });
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

  if (action === "addInitiative" && body.initiative) {
    const { name, description } = body.initiative as { name: string; description?: string };
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const id = `ini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = { id, name: name.trim(), description: (description || "").trim(), status: "active", createdAt: new Date() };
    await Chat.updateOne({ telegramChatId: chatId }, { $push: { initiatives: entry } });
    Activity.create({ telegramChatId: chatId, type: "dump", title: `Initiative: ${name.trim()}`, detail: (description || "").substring(0, 100), actor: "dashboard" }).catch(console.error);
    return NextResponse.json({ ok: true, initiative: entry });
  }

  if (action === "updateInitiative" && body.initiativeId) {
    const { initiativeId, name, description, status } = body as { initiativeId: string; name?: string; description?: string; status?: string };
    const update: Record<string, string> = {};
    if (name !== undefined) update["initiatives.$.name"] = name.trim();
    if (description !== undefined) update["initiatives.$.description"] = description.trim();
    if (status !== undefined) update["initiatives.$.status"] = status;
    await Chat.updateOne(
      { telegramChatId: chatId, "initiatives.id": initiativeId },
      { $set: update }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteInitiative" && body.initiativeId) {
    await Chat.updateOne(
      { telegramChatId: chatId },
      { $pull: { initiatives: { id: body.initiativeId } } }
    );
    await Task.updateMany(
      { telegramChatId: chatId, initiative: body.initiativeId },
      { $set: { initiative: "" } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "setTaskInitiative" && body.taskId !== undefined) {
    await Task.updateOne(
      { _id: body.taskId, telegramChatId: chatId },
      { $set: { initiative: body.initiative || "" } }
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
