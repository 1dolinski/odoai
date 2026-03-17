export const maxDuration = 300;

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
import { chat as aiChat } from "@/lib/openrouter";
import { writeKnowledge, writePersonKnowledge, writePeopleSnapshot } from "@/lib/knowledge";
import { getChatAdmins, sendMessage } from "@/lib/telegram";

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
      abilities: chat.abilities || "",
      dumps: (chat.dumps || []).sort((a: { createdAt: Date }, b: { createdAt: Date }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      contextSummary: chat.contextSummary,
      lastSyncAt: chat.lastSyncAt || null,
      lastReviewedAt: chat.lastReviewedAt || null,
      aiFeedEnabled: chat.aiFeedEnabled ?? false,
      aiFeed: (chat.aiFeed || []).map((f: { _id?: unknown; type: string; content: string; status?: string; createdAt: Date }) => ({ _id: String(f._id || ""), type: f.type, content: f.content, status: f.status || "new", createdAt: f.createdAt })).sort((a: { createdAt: Date }, b: { createdAt: Date }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      messageCount: chat.messages?.length || 0,
    },
    tasks,
    initiatives: chat.initiatives || [],
    people: (() => {
      const mapped = people.map((p) => ({
        _id: p._id,
        username: p.username,
        firstName: p.firstName,
        role: p.role && p.role !== "null" ? p.role : "",
        context: p.context,
        intentions: p.intentions || [],
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
        messageCount: p.messageCount || 0,
        lastSeen: p.lastSeen,
      }));
      const seen = new Map<string, typeof mapped[0]>();
      for (const p of mapped) {
        const key = (p.username || p.firstName || "").toLowerCase().trim();
        if (!key) { seen.set(p._id.toString(), p); continue; }
        const existing = [...seen.values()].find((e) => (e.username || e.firstName || "").toLowerCase().trim() === key);
        if (existing) {
          if (p.messageCount > existing.messageCount) existing.messageCount = p.messageCount;
          if (p.context && !existing.context) existing.context = p.context;
          if (p.role && !existing.role) existing.role = p.role;
          if (p.source === "telegram") existing.source = "telegram";
          existing.intentions = [...new Set([...existing.intentions, ...p.intentions])];
          existing.relationships = [...existing.relationships, ...p.relationships.filter((r: { name: string }) => !existing.relationships.some((er: { name: string }) => er.name === r.name))];
          existing.dumps = [...existing.dumps, ...p.dumps];
          if (p.resources && !existing.resources) existing.resources = p.resources;
          if (p.access && !existing.access) existing.access = p.access;
          if (p.email && !existing.email) existing.email = p.email;
          if (p.phone && !existing.phone) existing.phone = p.phone;
          if (p.lastSeen && (!existing.lastSeen || new Date(p.lastSeen) > new Date(existing.lastSeen))) existing.lastSeen = p.lastSeen;
        } else {
          seen.set(p._id.toString(), p);
        }
      }
      return [...seen.values()];
    })(),
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
  try {
  await connectDB();

  const body = await req.json();
  const { token, aiStyle, aiModel, watchSettings, chatTitle, mode, aiFeedEnabled, abilities } = body;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token });
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (chatTitle && typeof chatTitle === "string") update.chatTitle = chatTitle.trim();

  const VALID_MODES = ["passive", "active", "aggressive"];
  if (mode && VALID_MODES.includes(mode)) update.mode = mode;

  if (aiStyle && VALID_STYLES.includes(aiStyle)) update.aiStyle = aiStyle;

  if (typeof aiFeedEnabled === "boolean") update.aiFeedEnabled = aiFeedEnabled;

  if (aiModel && typeof aiModel === "string") update.aiModel = aiModel.trim();

  if (typeof abilities === "string") update.abilities = abilities;

  if (watchSettings && typeof watchSettings === "object") {
    const current = chat.watchSettings || { ...WATCH_DEFAULTS };
    for (const key of VALID_WATCH_KEYS) {
      if (key in watchSettings && typeof watchSettings[key] === "boolean") {
        (current as Record<string, boolean>)[key] = watchSettings[key];
      }
    }
    update.watchSettings = current;
  }

  if (Object.keys(update).length) {
    await Chat.updateOne({ dashboardToken: token }, { $set: update });
  }

  if (typeof abilities === "string" && abilities.trim()) {
    writeKnowledge(chat.telegramChatId, "context", "team-abilities", `# Team Abilities & Resources\n\n${abilities.trim()}`).catch(console.error);
  }

  return NextResponse.json({ ok: true, aiStyle: update.aiStyle ?? chat.aiStyle, watchSettings: update.watchSettings ?? chat.watchSettings });
  } catch (err) {
    console.error("PATCH /api/dashboard error:", err);
    return NextResponse.json({ error: "internal error", detail: String(err) }, { status: 500 });
  }
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
    const allPeople = await Person.find({ telegramChatId: chatId });
    const nameMap = new Map<string, typeof allPeople[0]>();
    let merged = 0;
    for (const p of allPeople) {
      const key = (p.username || p.firstName || "").toLowerCase().trim();
      if (!key) continue;
      const existing = nameMap.get(key);
      if (existing) {
        if (p.context && !existing.context) existing.context = p.context;
        if (p.role && p.role !== "null" && !existing.role) existing.role = p.role;
        if (p.email && !existing.email) existing.email = p.email;
        if (p.phone && !existing.phone) existing.phone = p.phone;
        if (p.resources && !existing.resources) existing.resources = p.resources;
        if (p.access && !existing.access) existing.access = p.access;
        if (p.messageCount > (existing.messageCount || 0)) existing.messageCount = p.messageCount;
        const existingIntentions = new Set((existing.intentions || []).map((i: string) => i.toLowerCase()));
        for (const i of (p.intentions || [])) { if (!existingIntentions.has(i.toLowerCase())) existing.intentions.push(i); }
        for (const r of (p.relationships || [])) { if (!existing.relationships.some((er: { name: string }) => er.name === r.name)) existing.relationships.push(r); }
        for (const d of (p.dumps || [])) existing.dumps.push(d);
        if (p.source === "telegram" && existing.source !== "telegram") existing.source = "telegram";
        await existing.save();
        await Person.deleteOne({ _id: p._id });
        merged++;
      } else {
        nameMap.set(key, p);
      }
    }
    const people = await Person.find({ telegramChatId: chatId }).lean();
    writePeopleSnapshot(chatId, people).catch(console.error);
    return NextResponse.json({ ok: true, added, merged, total: people.length });
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
    const { title, status, dueDate, people, initiative, description, createdByUsername } = body.task;
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const taskData: Record<string, unknown> = {
      status: ["todo", "upcoming", "done"].includes(status) ? status : "todo",
      createdBy: "dashboard",
      createdByUsername: createdByUsername || "dashboard",
    };
    if (description) taskData.description = description;
    if (dueDate && /\d{4}-\d{2}-\d{2}/.test(dueDate)) taskData.dueDate = new Date(dueDate);
    if (status === "done") taskData.completedAt = new Date();
    if (Array.isArray(people) && people.length) taskData.people = people;
    if (initiative) taskData.initiative = initiative;
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

  if (action === "askAboutFeed" && body.feedContent && body.question) {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    const response = await aiChat([
      { role: "system", content: "You are odoai, answering a follow-up question about an AI feed item. Be concise and helpful. 2-3 sentences max." },
      { role: "user", content: `Feed item (${body.feedType}): "${body.feedContent}"\n\nQuestion: ${body.question}${chatDoc?.contextSummary ? `\n\nChat context: ${chatDoc.contextSummary}` : ""}` },
    ], "openai/gpt-4o-mini");
    return NextResponse.json({ ok: true, answer: response });
  }

  if (action === "generateFeed") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    try {
      const items = await generateAiFeed(chatId);
      if (items.length) {
        const entries = items.map((i) => ({ type: i.type, content: i.content, createdAt: new Date() }));
        await Chat.updateOne({ telegramChatId: chatId }, { $push: { aiFeed: { $each: entries } } });
        Activity.create({ telegramChatId: chatId, type: "ai_triggered", title: "AI feed generated", detail: `${items.length} items`, actor: "odoai" }).catch(console.error);
        const shouts = items.filter((i) => i.type === "shout");
        for (const s of shouts) {
          const result = await sendMessage(chatId, `📢 ${s.content}`, "");
          if (!result.ok) console.error("Shout send failed:", JSON.stringify(result), "chatId:", chatId);
        }
      }
      return NextResponse.json({ ok: true, items });
    } catch (err) {
      console.error("generateFeed error:", err);
      return NextResponse.json({ ok: false, items: [], error: String(err) });
    }
  }

  if (action === "feedItemStatus" && body.status) {
    if (body.feedId) {
      await Chat.updateOne(
        { telegramChatId: chatId, "aiFeed._id": body.feedId },
        { $set: { "aiFeed.$.status": body.status } }
      );
    } else if (typeof body.feedIndex === "number") {
      await Chat.updateOne(
        { telegramChatId: chatId },
        { $set: { [`aiFeed.${body.feedIndex}.status`]: body.status } }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "feedDoneWithContext" && body.feedContent && body.context) {
    writeKnowledge(chatId, "context", `feed-done-${Date.now()}`, `# Feed Item Resolved — ${new Date().toISOString().split("T")[0]}\n\nItem: ${body.feedContent}\nType: ${body.feedType || "unknown"}\nOutcome: ${body.context}`).catch(console.error);
    return NextResponse.json({ ok: true });
  }

  if (action === "categorizeTasks") {
    const tasks = await Task.find({ telegramChatId: chatId }).lean();
    if (!tasks.length) return NextResponse.json({ ok: true, categories: {} });
    const taskList = tasks.map((t) => ({ id: String((t as { _id: unknown })._id), title: (t as { title: string }).title, existing: (t as { categories?: string[] }).categories || [] }));
    const response = await aiChat([
      { role: "system", content: `You categorize tasks into short, lowercase topic tags. Each task can have 1-3 tags. Use consistent naming — merge similar concepts (e.g. "motogp" not "moto gp", "payments" not "payment"). Prefer broad categories that group multiple tasks.

Respond ONLY with valid JSON: { "taskId": ["tag1", "tag2"], ... }

Rules:
- Tags are 1-2 words, lowercase, no special chars
- Reuse tags across tasks when topics overlap
- Common patterns: project names, functional areas (logistics, marketing, finance), themes
- Keep total unique tags under 8-10 for the whole set` },
      { role: "user", content: `Tasks:\n${taskList.map((t) => `${t.id}: ${t.title}`).join("\n")}` },
    ], "openai/gpt-4o-mini");
    try {
      const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const mapping = JSON.parse(cleaned);
      const ops = Object.entries(mapping).map(([id, cats]) =>
        Task.updateOne({ _id: id }, { $set: { categories: cats } })
      );
      await Promise.all(ops);
      return NextResponse.json({ ok: true, mapping });
    } catch {
      return NextResponse.json({ ok: false, error: "Failed to parse categories" });
    }
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
    writeKnowledge(chatId, "context", `initiative-${id}`, `# Initiative: ${name.trim()}\n\n${(description || "").trim() || "No description."}\n\nStatus: active\nCreated: ${new Date().toISOString().split("T")[0]}`).catch(console.error);
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

  if (action === "suggestForTask" && body.taskId) {
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    const otherTasks = await Task.find({ telegramChatId: chatId, status: { $ne: "done" } }).lean();
    const existing = otherTasks.map((t) => t.title).join(", ");
    const response = await aiChat([
      { role: "system", content: "You suggest practical next-step tasks. Return a JSON array of 2-5 short task title strings. Only return the JSON array, no markdown fences or explanation. Tasks should be specific, actionable, and not duplicate any existing tasks." },
      { role: "user", content: `Task: "${task.title}"${task.description ? `\nContext: ${task.description}` : ""}${chatDoc?.contextSummary ? `\nChat context: ${chatDoc.contextSummary}` : ""}\n\nExisting tasks (DO NOT suggest duplicates): ${existing}\n\nSuggest 2-5 practical next steps or sub-tasks:` },
    ], "openai/gpt-4o-mini");
    try {
      const cleaned = response.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const suggestions = JSON.parse(cleaned);
      return NextResponse.json({ ok: true, suggestions: Array.isArray(suggestions) ? suggestions : [] });
    } catch {
      return NextResponse.json({ ok: true, suggestions: [] });
    }
  }

  if (action === "generateSubtasks" && body.taskId) {
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    const abilitiesCtx = chatDoc?.abilities ? `\nUser/team abilities & resources: ${chatDoc.abilities}` : "";
    const response = await aiChat([
      { role: "system", content: `You break tasks into simple, digestible subtasks (steps to completion). Each step should be concrete and achievable by someone with the described abilities. Return a JSON array of short step strings (3-8 steps). Only return the JSON array, no markdown fences or explanation.${abilitiesCtx}` },
      { role: "user", content: `Task: "${task.title}"${task.description ? `\nDescription: ${task.description}` : ""}${chatDoc?.contextSummary ? `\nChat context: ${chatDoc.contextSummary}` : ""}${abilitiesCtx}\n\nBreak this into simple, digestible steps:` },
    ], "openai/gpt-4o-mini");
    try {
      const cleaned = response.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const steps: string[] = JSON.parse(cleaned);
      if (Array.isArray(steps)) {
        const subtasks = steps.map((s, i) => ({ id: `${Date.now()}-${i}`, title: s, done: false }));
        task.subtasks = subtasks;
        await task.save();
        return NextResponse.json({ ok: true, subtasks });
      }
      return NextResponse.json({ ok: true, subtasks: [] });
    } catch {
      return NextResponse.json({ ok: true, subtasks: [] });
    }
  }

  if (action === "clearCheck" && body.checkId) {
    const status = body.status === "done" ? "done" : "skipped";
    const update: Record<string, unknown> = { status, completedAt: new Date() };
    if (body.result) update.result = body.result;
    await Check.updateOne({ _id: body.checkId, telegramChatId: chatId }, { $set: update });
    if (body.context && typeof body.context === "string" && body.context.trim()) {
      const check = await Check.findById(body.checkId).lean();
      if (check) {
        const desc = (check as { description: string }).description;
        writeKnowledge(chatId, "context", `check-resolved-${body.checkId}`, `# Check Resolved: ${desc}\n\nStatus: ${status}\nContext: ${body.context.trim()}\nResolved: ${new Date().toISOString().split("T")[0]}`).catch(console.error);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "clearAllChecks") {
    const status = body.status === "done" ? "done" : "skipped";
    const update: Record<string, unknown> = { status, completedAt: new Date() };
    if (body.context && typeof body.context === "string" && body.context.trim()) {
      update.result = body.context.trim();
    }
    await Check.updateMany({ telegramChatId: chatId, status: "pending" }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "renameTask" && body.taskId && body.newTitle) {
    const newTitle = (body.newTitle as string).trim();
    if (!newTitle) return NextResponse.json({ error: "title required" }, { status: 400 });
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const oldTitle = task.title;
    if (oldTitle !== newTitle) {
      await Task.updateOne(
        { _id: body.taskId },
        { $set: { title: newTitle }, $push: { titleHistory: { from: oldTitle, to: newTitle, at: new Date() } } }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "toggleSubtask" && body.taskId && body.subtaskId) {
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const sub = (task.subtasks || []).find((s: { id: string }) => s.id === body.subtaskId);
    if (sub) {
      sub.done = !sub.done;
      await task.save();
    }
    return NextResponse.json({ ok: true, subtasks: task.subtasks });
  }

  if (action === "addSubtask" && body.taskId && body.title) {
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    if (!task.subtasks) task.subtasks = [];
    const newSub = { id: `${Date.now()}-m`, title: body.title, done: false };
    task.subtasks.push(newSub);
    await task.save();
    return NextResponse.json({ ok: true, subtasks: task.subtasks });
  }

  if (action === "removeSubtask" && body.taskId && body.subtaskId) {
    const task = await Task.findOne({ _id: body.taskId, telegramChatId: chatId });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    task.subtasks = (task.subtasks || []).filter((s: { id: string }) => s.id !== body.subtaskId);
    await task.save();
    return NextResponse.json({ ok: true, subtasks: task.subtasks });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
