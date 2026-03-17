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
import { autoExtract, maybeUpdateContext, deepProcessDump, generateAiFeed, generateAiQuestions } from "@/lib/brain";
import { chat as aiChat } from "@/lib/openrouter";
import { writeKnowledge, writePersonKnowledge, writePeopleSnapshot, qmdSearch, formatQMDResults } from "@/lib/knowledge";
import { getChatAdmins, sendMessage } from "@/lib/telegram";
import { getAvailableSources, fetchEnabledEndpoints, formatDataForAI, persistSnapshots, getSnapshotHistory, DATA_SOURCE_REGISTRY, fetchEndpoint } from "@/lib/dataSources";
import { getAllPlatforms, getEndpointsForPlatform, querySocial, pollJobResult, isConfigured as isSocialConfigured, type Platform } from "@/lib/social";
import DataSnapshot from "@/models/DataSnapshot";

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
      dataSources: chat.dataSources || [],
      aiQuestions: (chat.aiQuestions || []).map((q: { id: string; category: string; question: string; answer: string; skipped?: boolean; answeredAt?: Date; createdAt: Date }) => ({
        id: q.id,
        category: q.category,
        question: q.question,
        answer: q.answer || "",
        skipped: q.skipped || false,
        answeredAt: q.answeredAt || null,
        createdAt: q.createdAt,
      })),
      menu: (chat.menu || []).map((m: { id: string; name: string; description: string; price: string; category: string; aiSuggestions?: string; targetBuyers?: string; createdAt: Date }) => ({
        id: m.id,
        name: m.name,
        description: m.description || "",
        price: m.price || "",
        category: m.category || "general",
        aiSuggestions: m.aiSuggestions || "",
        targetBuyers: m.targetBuyers || "",
        createdAt: m.createdAt,
      })),
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
        avatarUrl: p.avatarUrl || "",
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
    availableDataSources: getAvailableSources(),
    socialPlatforms: getAllPlatforms(),
    socialConfigured: isSocialConfigured(),
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
    if (contact.avatarUrl !== undefined) update.avatarUrl = contact.avatarUrl;

    await Person.updateOne({ _id: contact._id, telegramChatId: chatId }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateAvatar" && body.personId && typeof body.avatarUrl === "string") {
    await Person.updateOne({ _id: body.personId, telegramChatId: chatId }, { $set: { avatarUrl: body.avatarUrl } });
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

  if (action === "askAI" && body.question) {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });

    const question = (body.question as string).trim();

    const qmdResults = await qmdSearch(question, 10);
    const qmdContext = formatQMDResults(qmdResults);

    const socialSnaps = await DataSnapshot.find({
      telegramChatId: chatId,
      sourceId: /^social-/,
      "data.pollStatus": "finished",
    }).sort({ fetchedAt: -1 }).limit(5).lean();

    const socialContext = socialSnaps.length
      ? socialSnaps.map((s) => {
          const d = s as { sourceId: string; endpointId: string; data: { params?: Record<string, string>; result?: unknown }; fetchedAt: Date };
          return `### ${d.sourceId}/${d.endpointId} (${new Date(d.fetchedAt).toLocaleDateString()})\n${JSON.stringify(d.data?.result || d.data, null, 2).substring(0, 1500)}`;
        }).join("\n\n")
      : "";

    const dsSnaps = await DataSnapshot.find({
      telegramChatId: chatId,
      sourceId: { $not: /^social-/ },
    }).sort({ fetchedAt: -1 }).limit(5).lean();

    const dsContext = dsSnaps.length
      ? dsSnaps.map((s) => {
          const d = s as { sourceId: string; endpointId: string; data: unknown; fetchedAt: Date };
          return `### ${d.sourceId}/${d.endpointId} (${new Date(d.fetchedAt).toLocaleDateString()})\n${JSON.stringify(d.data, null, 2).substring(0, 1500)}`;
        }).join("\n\n")
      : "";

    const tasks = await Task.find({ telegramChatId: chatId, status: { $in: ["open", "in-progress"] } }).lean();
    const taskContext = tasks.length
      ? tasks.map((t) => `- [${(t as { status: string }).status}] ${(t as { title: string }).title}`).join("\n")
      : "";

    const systemPrompt = `You are odoai, an AI business strategist. You have deep knowledge about this team and their data.

Answer the user's question using ALL the context below. Be specific — reference actual numbers, handles, dates. If you can derive insights, trends, or action items, do so.

After your answer, generate 1-5 actionable suggestions as a JSON array under a --- separator. Each suggestion: { "title": "short action item", "type": "todo"|"suggestion"|"insight", "detail": "1-2 sentence explanation" }

## Knowledge Base (QMD)
${qmdContext}
${socialContext ? `\n## Social Media Data\n${socialContext}` : ""}
${dsContext ? `\n## Business Data Sources\n${dsContext}` : ""}
${taskContext ? `\n## Current Tasks\n${taskContext}` : ""}
${chatDoc.contextSummary ? `\n## Team Context\n${chatDoc.contextSummary}` : ""}`;

    const response = await aiChat([
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ], "openai/gpt-4o");

    let answer = response;
    let suggestions: { title: string; type: string; detail: string }[] = [];
    const sepIdx = response.indexOf("---");
    if (sepIdx !== -1) {
      answer = response.substring(0, sepIdx).trim();
      const jsonPart = response.substring(sepIdx + 3).trim();
      const jsonMatch = jsonPart.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try { suggestions = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ ok: true, answer, suggestions, sourcesUsed: qmdResults.length + socialSnaps.length + dsSnaps.length });
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

  if (action === "generateAiQuestions") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    try {
      const questions = await generateAiQuestions(chatId);
      if (questions.length) {
        const entries = questions.map((q) => ({ id: q.id, category: q.category, question: q.question, answer: "", createdAt: new Date() }));
        await Chat.updateOne({ telegramChatId: chatId }, { $push: { aiQuestions: { $each: entries } } });
        Activity.create({ telegramChatId: chatId, type: "ai_triggered", title: "AI questions generated", detail: `${questions.length} questions`, actor: "odoai" }).catch(console.error);
      }
      return NextResponse.json({ ok: true, questions });
    } catch (err) {
      console.error("generateAiQuestions error:", err);
      return NextResponse.json({ ok: false, questions: [], error: String(err) });
    }
  }

  if (action === "answerAiQuestion" && body.questionId && typeof body.answer === "string") {
    const answer = (body.answer as string).trim();
    await Chat.updateOne(
      { telegramChatId: chatId, "aiQuestions.id": body.questionId },
      { $set: { "aiQuestions.$.answer": answer, "aiQuestions.$.answeredAt": answer ? new Date() : null } }
    );
    if (answer) {
      const chatDoc = await Chat.findOne({ telegramChatId: chatId });
      const q = chatDoc?.aiQuestions?.find((q: { id: string }) => q.id === body.questionId);
      if (q) {
        writeKnowledge(chatId, "context", `ai-qa-${body.questionId}`, `# AI Q&A: ${q.category}\n\nQ: ${q.question}\nA: ${answer}`).catch(console.error);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "clearAiQuestions") {
    await Chat.updateOne({ telegramChatId: chatId }, { $set: { aiQuestions: [] } });
    return NextResponse.json({ ok: true });
  }

  if (action === "skipAiQuestion" && body.questionId) {
    await Chat.updateOne(
      { telegramChatId: chatId, "aiQuestions.id": body.questionId },
      { $set: { "aiQuestions.$.skipped": true } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "unskipAiQuestion" && body.questionId) {
    await Chat.updateOne(
      { telegramChatId: chatId, "aiQuestions.id": body.questionId },
      { $set: { "aiQuestions.$.skipped": false } }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "addMenuItem") {
    const item = body.item;
    if (!item?.name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const id = `menu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, name: item.name, description: item.description || "", price: item.price || "", category: item.category || "general", aiSuggestions: "", targetBuyers: "", createdAt: new Date() };
    await Chat.updateOne({ telegramChatId: chatId }, { $push: { menu: entry } });
    writeKnowledge(chatId, "context", `menu-item-${id}`, `# Menu Item: ${item.name}\n\nDescription: ${item.description || "N/A"}\nPrice: ${item.price || "N/A"}\nCategory: ${item.category || "general"}`).catch(console.error);
    return NextResponse.json({ ok: true, item: entry });
  }

  if (action === "updateMenuItem" && body.itemId) {
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates["menu.$.name"] = body.name;
    if (body.description !== undefined) updates["menu.$.description"] = body.description;
    if (body.price !== undefined) updates["menu.$.price"] = body.price;
    if (body.category !== undefined) updates["menu.$.category"] = body.category;
    if (body.aiSuggestions !== undefined) updates["menu.$.aiSuggestions"] = body.aiSuggestions;
    if (body.targetBuyers !== undefined) updates["menu.$.targetBuyers"] = body.targetBuyers;
    if (Object.keys(updates).length) {
      await Chat.updateOne({ telegramChatId: chatId, "menu.id": body.itemId }, { $set: updates });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteMenuItem" && body.itemId) {
    await Chat.updateOne({ telegramChatId: chatId }, { $pull: { menu: { id: body.itemId } } });
    return NextResponse.json({ ok: true });
  }

  if (action === "aiMenuSuggestions" && body.itemId) {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    const menuItem = (chatDoc.menu || []).find((m: { id: string }) => m.id === body.itemId);
    if (!menuItem) return NextResponse.json({ error: "item not found" }, { status: 404 });

    const allItems = (chatDoc.menu || []).map((m: { name: string; description: string; price: string; category: string }) => `- ${m.name}: ${m.description || "no description"} (${m.price || "no price"}) [${m.category}]`).join("\n");
    const qaContext = (chatDoc.aiQuestions || []).filter((q: { answer: string }) => q.answer).map((q: { question: string; answer: string }) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n");

    let qmdContext = "";
    try {
      const results = await qmdSearch(`${menuItem.name} ${menuItem.description}`, 5);
      if (results.length) qmdContext = results.map((r) => `- ${r.title}: ${r.snippet?.substring(0, 150) || ""}`).join("\n");
    } catch {}

    const response = await aiChat([
      {
        role: "system",
        content: `You are a strategic business advisor. Analyze this menu item and provide two things:

1. IMPROVEMENT SUGGESTIONS: How to make this offering better — naming, description, pricing, positioning, bundling, upsells, presentation
2. TARGET BUYERS: Who specifically should this be sold to — demographics, company types, roles, use cases, channels to reach them

Be specific, actionable, and reference the team's context when relevant. Keep each section to 2-4 bullet points.

Respond as JSON: {"suggestions": "markdown string with improvement ideas", "targetBuyers": "markdown string with target buyer profiles"}`,
      },
      {
        role: "user",
        content: `MENU ITEM:\nName: ${menuItem.name}\nDescription: ${menuItem.description || "none"}\nPrice: ${menuItem.price || "not set"}\nCategory: ${menuItem.category}\n\nFULL MENU:\n${allItems}\n${qaContext ? `\nTEAM Q&A:\n${qaContext}` : ""}${chatDoc.contextSummary ? `\n\nTEAM CONTEXT:\n${chatDoc.contextSummary}` : ""}${chatDoc.abilities ? `\n\nTEAM ABILITIES:\n${chatDoc.abilities}` : ""}${qmdContext ? `\n\nKNOWLEDGE BASE:\n${qmdContext}` : ""}`,
      },
    ], "openai/gpt-4o-mini");

    try {
      const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      await Chat.updateOne(
        { telegramChatId: chatId, "menu.id": body.itemId },
        { $set: { "menu.$.aiSuggestions": parsed.suggestions || "", "menu.$.targetBuyers": parsed.targetBuyers || "" } }
      );
      return NextResponse.json({ ok: true, suggestions: parsed.suggestions || "", targetBuyers: parsed.targetBuyers || "" });
    } catch {
      return NextResponse.json({ ok: false, error: "Failed to parse AI response" });
    }
  }

  if (action === "aiMenuAudit") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    const menuItems = chatDoc.menu || [];
    if (!menuItems.length) return NextResponse.json({ ok: true, audit: "No menu items to audit. Add some items first." });

    const allItems = menuItems.map((m: { name: string; description: string; price: string; category: string }) => `- ${m.name}: ${m.description || "no description"} (${m.price || "no price"}) [${m.category}]`).join("\n");
    const qaContext = (chatDoc.aiQuestions || []).filter((q: { answer: string }) => q.answer).map((q: { question: string; answer: string }) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n");

    const response = await aiChat([
      {
        role: "system",
        content: `You are a business strategist auditing a product/service menu. Analyze the ENTIRE menu and provide:

1. OVERALL ASSESSMENT: Is the menu strong? Are there gaps?
2. MISSING ITEMS: What products/services should they add based on their abilities and market?
3. PRICING STRATEGY: Are prices competitive? Suggestions for tiers, bundles, packages
4. POSITIONING: How to frame the menu for maximum impact with potential partners and customers
5. QUICK WINS: 2-3 easiest changes that would make the biggest difference

Be specific and actionable. Reference their actual items and context.`,
      },
      {
        role: "user",
        content: `MENU:\n${allItems}\n${qaContext ? `\nTEAM Q&A:\n${qaContext}` : ""}${chatDoc.contextSummary ? `\n\nTEAM CONTEXT:\n${chatDoc.contextSummary}` : ""}${chatDoc.abilities ? `\n\nTEAM ABILITIES:\n${chatDoc.abilities}` : ""}`,
      },
    ], "openai/gpt-4o-mini");

    return NextResponse.json({ ok: true, audit: response });
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
    const tasks = await Task.find({ telegramChatId: chatId, status: { $in: ["todo", "upcoming"] } }).lean();
    if (!tasks.length) return NextResponse.json({ ok: true, categories: {} });
    const taskList = tasks.map((t) => ({ id: String((t as { _id: unknown })._id), title: (t as { title: string }).title }));
    const response = await aiChat([
      { role: "system", content: `You categorize tasks into short, lowercase topic tags. Each task can have 1-3 tags. Use consistent naming — merge similar concepts (e.g. "motogp" not "moto gp", "payments" not "payment"). Prefer broad categories that group multiple tasks.

Respond ONLY with valid JSON: { "taskId": ["tag1", "tag2"], ... }

Rules:
- Tags are 1-2 words, lowercase, no special chars
- Reuse tags across tasks when topics overlap
- Common patterns: project names, functional areas (logistics, marketing, finance), themes
- Use EXACTLY 5 unique tags total — no more. Group tasks into the 5 most meaningful buckets. Every task must fit into one of these 5.` },
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

  if (action === "toggleEndpoint" && body.sourceId && body.endpointId) {
    const sourceId = body.sourceId as string;
    const endpointId = body.endpointId as string;
    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === sourceId);
    if (!source) return NextResponse.json({ error: "unknown source" }, { status: 400 });
    if (!source.endpoints.find((e) => e.id === endpointId)) return NextResponse.json({ error: "unknown endpoint" }, { status: 400 });
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    if (!chatDoc) return NextResponse.json({ error: "chat not found" }, { status: 404 });
    const existing = (chatDoc.dataSources || []).find(
      (ds: { sourceId: string; endpointId: string }) => ds.sourceId === sourceId && ds.endpointId === endpointId
    );
    if (existing) {
      await Chat.updateOne(
        { telegramChatId: chatId, "dataSources.sourceId": sourceId, "dataSources.endpointId": endpointId },
        { $set: { "dataSources.$.enabled": !existing.enabled } }
      );
    } else {
      await Chat.updateOne(
        { telegramChatId: chatId },
        { $push: { dataSources: { sourceId, endpointId, enabled: true } } }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "fetchDataSources") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    const enabledEps = (chatDoc?.dataSources || [])
      .filter((ds: { enabled: boolean }) => ds.enabled)
      .map((ds: { sourceId: string; endpointId: string }) => ({ sourceId: ds.sourceId, endpointId: ds.endpointId }));
    if (!enabledEps.length) return NextResponse.json({ ok: true, data: [], formatted: "" });
    const results = await fetchEnabledEndpoints(enabledEps);
    const formatted = formatDataForAI(results);
    await persistSnapshots(chatId, results);
    const updateOps: Record<string, unknown> = {};
    for (const r of results) {
      if (!r.error && r.data) {
        const allDs = chatDoc?.dataSources || [];
        const idx = allDs.findIndex((ds: { sourceId: string; endpointId: string }) => ds.sourceId === r.sourceId && ds.endpointId === r.endpointId);
        if (idx >= 0) updateOps[`dataSources.${idx}.lastFetchAt`] = r.fetchedAt;
      }
    }
    if (Object.keys(updateOps).length) {
      await Chat.updateOne({ telegramChatId: chatId }, { $set: updateOps });
    }
    return NextResponse.json({ ok: true, data: results, formatted });
  }

  if (action === "fetchDataSourceEndpoint" && body.sourceId && body.endpointId) {
    const source = DATA_SOURCE_REGISTRY.find((s) => s.id === body.sourceId);
    if (!source) return NextResponse.json({ error: "unknown source" }, { status: 400 });
    const endpoint = source.endpoints.find((e) => e.id === body.endpointId);
    if (!endpoint) return NextResponse.json({ error: "unknown endpoint" }, { status: 400 });
    const result = await fetchEndpoint(source, endpoint, body.params);
    if (!result.error && result.data) {
      await persistSnapshots(chatId, [result]);
    }
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "getSnapshotHistory" && body.sourceId && body.endpointId) {
    const history = await getSnapshotHistory(chatId, body.sourceId, body.endpointId, body.limit || 10);
    return NextResponse.json({ ok: true, history });
  }

  if (action === "getSnapshotCounts") {
    const counts = await DataSnapshot.aggregate([
      { $match: { telegramChatId: chatId } },
      { $group: { _id: { sourceId: "$sourceId", endpointId: "$endpointId" }, count: { $sum: 1 }, latest: { $max: "$fetchedAt" } } },
    ]);
    return NextResponse.json({ ok: true, counts: counts.map((c) => ({ sourceId: c._id.sourceId, endpointId: c._id.endpointId, count: c.count, latest: c.latest })) });
  }

  if (action === "analyzeDataSources") {
    const chatDoc = await Chat.findOne({ telegramChatId: chatId });
    const enabledEps = (chatDoc?.dataSources || [])
      .filter((ds: { enabled: boolean }) => ds.enabled)
      .map((ds: { sourceId: string; endpointId: string }) => ({ sourceId: ds.sourceId, endpointId: ds.endpointId }));
    if (!enabledEps.length) return NextResponse.json({ ok: true, insights: "No data source endpoints enabled." });
    const results = await fetchEnabledEndpoints(enabledEps);
    const formatted = formatDataForAI(results);
    if (!formatted) return NextResponse.json({ ok: true, insights: "No data available from sources." });
    await persistSnapshots(chatId, results);

    let historyContext = "";
    for (const ep of enabledEps) {
      const history = await getSnapshotHistory(chatId, ep.sourceId, ep.endpointId, 5);
      if (history.length > 1) {
        historyContext += `\n\n--- ${ep.sourceId}/${ep.endpointId} history (${history.length} snapshots) ---`;
        for (const snap of history.slice(1)) {
          historyContext += `\n[${new Date(snap.fetchedAt).toISOString().split("T")[0]}] ${JSON.stringify(snap.data, null, 2).substring(0, 1500)}`;
        }
      }
    }

    const analysis = await aiChat([
      {
        role: "system",
        content: `You are a business analyst AI. Analyze live data from connected platforms plus historical snapshots. Focus on:
- Key metrics and their trends over time (compare current vs previous snapshots)
- Week-over-week and month-over-month changes
- Anomalies or concerning patterns
- Growth opportunities
- Revenue and engagement highlights
- User behavior patterns
- Things that need immediate attention
- Strategic recommendations based on trend direction

Be specific with numbers. Compare across time periods when historical data is available. Use bullet points.${chatDoc?.contextSummary ? `\n\nTeam context: ${chatDoc.contextSummary}` : ""}`,
      },
      { role: "user", content: `Current data:\n${formatted}${historyContext ? `\n\nHistorical snapshots:\n${historyContext}` : ""}` },
    ], "openai/gpt-4o-mini");
    return NextResponse.json({ ok: true, insights: analysis });
  }

  if (action === "testSocial") {
    const steps: { step: string; ok: boolean; detail?: string; ms?: number }[] = [];
    const pk = process.env.APINOW_PRIVATE_KEY?.trim();
    steps.push({ step: "APINOW_PRIVATE_KEY exists", ok: !!pk, detail: pk ? `length=${pk.length}, starts=0x=${pk.startsWith("0x")}` : "missing" });
    if (pk) {
      const t_sdk = Date.now();
      try {
        const { createClient } = await import("apinow-sdk");
        let k = pk;
        if (!k.startsWith("0x")) k = `0x${k}`;
        const sdk = createClient({ privateKey: k as `0x${string}` });
        const data = await sdk.callExternal("https://stablesocial.dev/api/instagram/profile", { method: "POST", body: { handle: "nike" } });
        steps.push({ step: "SDK callExternal (0.21.0)", ok: true, detail: JSON.stringify(data).substring(0, 200), ms: Date.now() - t_sdk });
      } catch (e: unknown) {
        const err = e as Error;
        steps.push({ step: "SDK callExternal (0.21.0)", ok: false, detail: `${err.message} | cause: ${err.cause ? JSON.stringify(err.cause, Object.getOwnPropertyNames(err.cause as object)) : "none"}`, ms: Date.now() - t_sdk });
      }

      const t0 = Date.now();
      try {
        const result = await querySocial("instagram", "profile", { handle: "nike" }, { autoPoll: false });
        steps.push({ step: "custom callExternal (trigger)", ok: !result.error, detail: `pollStatus=${result.pollStatus} jobToken=${result.jobToken ? result.jobToken.substring(0, 30) + "…" : "no"} error=${result.error || "none"} cost=${result.cost}`, ms: Date.now() - t0 });

        if (result.jobToken) {
          const t1 = Date.now();
          try {
            const poll = await pollJobResult(result.jobToken, { maxAttempts: 5, deadlineMs: 15000 });
            steps.push({ step: "pollJobResult (SIWX)", ok: poll.status === "finished", detail: `status=${poll.status} attempts=${poll.attempts} error=${poll.error || "none"} data=${poll.data ? JSON.stringify(poll.data).substring(0, 200) : "null"}`, ms: Date.now() - t1 });
          } catch (e: unknown) {
            steps.push({ step: "pollJobResult (SIWX)", ok: false, detail: (e as Error).message, ms: Date.now() - t1 });
          }
        }
      } catch (e: unknown) {
        const err = e as Error;
        steps.push({ step: "custom callExternal (trigger)", ok: false, detail: `${err.message} | cause: ${err.cause ? JSON.stringify(err.cause, Object.getOwnPropertyNames(err.cause as object)) : "none"}`, ms: Date.now() - t0 });
      }
    }
    return NextResponse.json({ ok: true, steps });
  }

  if (action === "getSocialEndpoints" && body.platform) {
    const endpoints = getEndpointsForPlatform(body.platform as Platform);
    return NextResponse.json({ ok: true, endpoints });
  }

  if (action === "querySocial" && body.platform && body.endpoint && body.params) {
    if (!isSocialConfigured()) {
      return NextResponse.json({ ok: false, error: "APINOW_PRIVATE_KEY not configured — add it to Vercel env vars (hex string starting with 0x)", cost: "$0.00", data: null, fetchedAt: new Date() });
    }
    try {
      const result = await querySocial(body.platform as Platform, body.endpoint, body.params);
      if (!result.error) {
        const snap = await DataSnapshot.create({
          telegramChatId: chatId,
          sourceId: `social-${body.platform}`,
          endpointId: body.endpoint,
          data: { params: body.params, result: result.data, pollStatus: result.pollStatus || "pending", jobToken: result.jobToken, cost: result.cost },
          fetchedAt: result.fetchedAt,
        });
        if (result.pollStatus === "finished") {
          writeKnowledge(
            chatId,
            "context",
            `social-${body.platform}-${body.endpoint}-${Date.now()}`,
            `# Social Data: ${body.platform}/${body.endpoint}\nParams: ${JSON.stringify(body.params)}\nFetched: ${result.fetchedAt.toISOString()}\nCost: ${result.cost}\nStatus: ${result.pollStatus}\n\n${JSON.stringify(result.data, null, 2).substring(0, 4000)}`,
            { source: `social-${body.platform}`, endpoint: body.endpoint }
          ).catch(console.error);
        }
        return NextResponse.json({ ok: true, ...result, snapshotId: snap._id, fetchedAt: result.fetchedAt.toISOString() });
      }
      return NextResponse.json({ ok: true, ...result, fetchedAt: result.fetchedAt.toISOString() });
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err), cost: "$0.00", data: null, fetchedAt: new Date().toISOString() });
    }
  }

  if (action === "pollSocialJob" && body.jobToken) {
    if (!isSocialConfigured()) {
      return NextResponse.json({ ok: false, error: "APINOW_PRIVATE_KEY not configured" });
    }
    try {
      const poll = await pollJobResult(body.jobToken, { deadlineMs: body.deadlineMs || 25000 });
      if (poll.status === "finished" && poll.data) {
        if (body.snapshotId) {
          await DataSnapshot.findByIdAndUpdate(body.snapshotId, {
            "data.result": poll.data,
            "data.pollStatus": "finished",
            fetchedAt: new Date(),
          });
        } else if (body.platform && body.endpoint) {
          await DataSnapshot.create({
            telegramChatId: chatId,
            sourceId: `social-${body.platform}`,
            endpointId: body.endpoint,
            data: { params: body.params || {}, result: poll.data, pollStatus: "finished" },
            fetchedAt: new Date(),
          });
        }
        if (body.platform && body.endpoint) {
          writeKnowledge(
            chatId,
            "context",
            `social-${body.platform}-${body.endpoint}-${Date.now()}`,
            `# Social Data: ${body.platform}/${body.endpoint}\nPolled result\n\n${JSON.stringify(poll.data, null, 2).substring(0, 4000)}`,
            { source: `social-${body.platform}`, endpoint: body.endpoint }
          ).catch(console.error);
        }
      } else if (body.snapshotId && poll.status === "timeout") {
        await DataSnapshot.findByIdAndUpdate(body.snapshotId, { "data.pollStatus": "timeout" });
      }
      return NextResponse.json({ ok: true, ...poll });
    } catch (err) {
      return NextResponse.json({ ok: false, status: "failed", error: String(err), attempts: 0 });
    }
  }

  if (action === "getPendingJobs") {
    const pending = await DataSnapshot.find({
      telegramChatId: chatId,
      sourceId: /^social-/,
      "data.jobToken": { $exists: true, $ne: null },
      "data.pollStatus": { $in: ["pending", "timeout"] },
    }).sort({ fetchedAt: -1 }).limit(20).lean();
    return NextResponse.json({
      ok: true,
      jobs: pending.map((j) => {
        const d = j as unknown as { _id: string; sourceId: string; endpointId: string; data: { params?: Record<string, string>; jobToken: string; pollStatus: string; cost?: string }; fetchedAt: Date };
        return {
          id: String(d._id),
          sourceId: d.sourceId,
          endpointId: d.endpointId,
          platform: d.sourceId.replace("social-", ""),
          jobToken: d.data.jobToken,
          pollStatus: d.data.pollStatus,
          cost: d.data.cost || "$0.07",
          params: d.data.params || {},
          fetchedAt: d.fetchedAt,
        };
      }),
    });
  }

  if (action === "getSocialHistory" && body.platform && body.endpoint) {
    const history = await DataSnapshot.find({
      telegramChatId: chatId,
      sourceId: `social-${body.platform}`,
      endpointId: body.endpoint,
    }).sort({ fetchedAt: -1 }).limit(body.limit || 10).lean();
    return NextResponse.json({
      ok: true,
      history: history.map((h) => ({
        data: (h as { data: Record<string, unknown> }).data,
        fetchedAt: (h as { fetchedAt: Date }).fetchedAt,
      })),
    });
  }

  if (action === "getSocialSnapshots") {
    const snapshots = await DataSnapshot.aggregate([
      { $match: { telegramChatId: chatId, sourceId: /^social-/ } },
      { $sort: { fetchedAt: -1 } },
      { $group: {
        _id: { sourceId: "$sourceId", endpointId: "$endpointId" },
        count: { $sum: 1 },
        latest: { $first: "$fetchedAt" },
        latestPollStatus: { $first: "$data.pollStatus" },
        latestParams: { $first: "$data.params" },
      }},
      { $sort: { latest: -1 } },
    ]);
    return NextResponse.json({
      ok: true,
      snapshots: snapshots.map((s) => ({
        sourceId: s._id.sourceId,
        endpointId: s._id.endpointId,
        count: s.count,
        latest: s.latest,
        pollStatus: s.latestPollStatus,
        params: s.latestParams,
      })),
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
