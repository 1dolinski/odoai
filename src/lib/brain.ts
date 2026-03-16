import { chat as aiChat } from "@/lib/openrouter";
import { qmdSearch, writeDump, writeContextSummary, writePeopleSnapshot, writePersonKnowledge, writeTasksSnapshot, formatQMDResults } from "@/lib/knowledge";
import Chat, { WATCH_DEFAULTS } from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";
import Activity from "@/models/Activity";

const SUMMARIZE_EVERY = 10;
const EXTRACT_EVERY = 5;

export async function buildSystemPrompt(chatId: string, userQuery?: string): Promise<string> {
  const [chatDoc, people, tasks, activeJobs] = await Promise.all([
    Chat.findOne({ telegramChatId: chatId }),
    Person.find({ telegramChatId: chatId }),
    Task.find({ telegramChatId: chatId, status: { $ne: "done" } }),
    Job.find({ telegramChatId: chatId, status: "active" }),
  ]);

  const mode = chatDoc?.mode || "passive";
  const aiStyle = chatDoc?.aiStyle || "concise";
  const contextSummary = chatDoc?.contextSummary || "No prior context yet.";
  const guidance = chatDoc?.guidance || "";
  const watch = { ...WATCH_DEFAULTS, ...chatDoc?.watchSettings };

  const peopleBlock = people.length
    ? people
        .map((p) => {
          let line = `- @${p.username || p.firstName || p.telegramUserId}`;
          if (p.role) line += ` (${p.role})`;
          if (p.intentions.length) line += ` | Intentions: ${p.intentions.join(", ")}`;
          if (p.context) line += ` | Context: ${p.context}`;
          if (p.relationships?.length) {
            const rels = p.relationships.map((r: { name: string; label?: string; context?: string }) => `${r.name}${r.label ? ` [${r.label}]` : ""}${r.context ? `: ${r.context}` : ""}`);
            line += ` | Knows: ${rels.join("; ")}`;
          }
          return line;
        })
        .join("\n")
    : "No people tracked yet.";

  const taskBlock = tasks.length
    ? tasks.map((t) => `- [${t.status}] ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().split("T")[0]})` : ""}`).join("\n")
    : "No active tasks.";

  const jobBlock = activeJobs.length
    ? activeJobs.map((j) => `- ${j.title}: ${j.description}`).join("\n")
    : "No active jobs.";

  let knowledgeBlock = "";
  if (userQuery) {
    const results = await qmdSearch(userQuery);
    if (results.length) {
      knowledgeBlock = `\nRELEVANT KNOWLEDGE (from memory):\n${formatQMDResults(results)}`;
    }
  }

  const watchLines = [
    watch.deadlines && "deadlines/dates",
    watch.blockers && "blockers/stuck points",
    watch.actionItems && "action items/commitments",
    watch.sentiment && "sentiment/mood",
    watch.questions && "unanswered questions",
    watch.followUps && "things needing follow-up",
    watch.newPeople && "new people mentioned",
    watch.decisions && "decisions made",
    watch.opportunities && "opportunities — ways to do things better, faster, cheaper, make more money, get more content, more distribution. If you spot an obvious high-impact improvement, suggest it immediately",
  ].filter(Boolean);

  return `You are odoai, an AI assistant embedded in a Telegram chat.

YOUR PRIMARY ROLE: You are an intelligent observer. You listen to conversations and build a rich understanding of the people, their tasks, intentions, relationships, and context. You do NOT wait for commands — you infer everything from natural conversation.

MODE: ${mode.toUpperCase()}
${mode === "passive" ? "PASSIVE: You silently observe. Only respond when directly mentioned (@odoai_bot) or when a slash command is used. But you are ALWAYS learning from every message." : mode === "aggressive" ? "AGGRESSIVE: You review EVERY single message. Extract tasks, people, relationships, and insights from each one. Respond to anything actionable — add todos, flag blockers, note deadlines, track people. You are always on, always working. Treat every message as if someone asked you to process it." : "ACTIVE: You are an active collaborator. When you notice something useful — a missed follow-up, an insight, a suggestion — share it. Proactively check in on open threads. Be a helpful teammate, not a command executor."}

CONTEXT SUMMARY:
${contextSummary}

PEOPLE:
${peopleBlock}

ACTIVE TASKS:
${taskBlock}

ACTIVE JOBS:
${jobBlock}
${knowledgeBlock}
WATCHING FOR: ${watchLines.join(", ")}

WHEN MENTIONED OR IN DM:
You have just been synced — you've caught up on all recent messages. Look at the conversation history to understand what the user wants. Infer their intent from context. If they mentioned something earlier that needs action (web search, adding a task, looking something up), do it NOW without being asked again.

You work ALONGSIDE the team. You are not a command executor — you are a collaborator. If someone says "search for X and add it in", you search and add tasks. If they say "get to work", review recent history and act on anything pending. If they just want to chat, chat.

CRITICAL: Break every message into AS MANY individual actions as needed. A single message can contain multiple tasks, people, relationships, searches — extract ALL of them. "buy stands, book hotel, and check flights" = 3 separate ADD_TODO directives. "met John the designer and Sarah from marketing" = 2 separate ADD_PERSON directives. Never lump multiple items into one action. More granular = better.

Available actions (embed naturally in your response, use MULTIPLE per message):
  [ADD_TODO: desc] or [ADD_TODO: desc | YYYY-MM-DD]
  [ADD_UPCOMING: desc] or [ADD_UPCOMING: desc | YYYY-MM-DD]
  [MARK_DONE: desc]
  [ADD_PERSON: name | role | context]
  [ADD_RELATIONSHIP: person1 | person2 | label | context]
  [SCHEDULE_CHECK: desc | minutes]
  [SET_STYLE: concise|detailed|casual|professional|technical]
  [SET_CHECK_PACE: faster|slower|pause|resume]
  [SEARCH: query] — web search (USE THIS when info needs looking up)
  [RECALL: query] — memory search

COMMUNICATION STYLE: ${aiStyle.toUpperCase()}
${aiStyle === "concise" ? "Be brief and direct." : ""}${aiStyle === "detailed" ? "Give thorough explanations." : ""}${aiStyle === "casual" ? "Be friendly and informal." : ""}${aiStyle === "professional" ? "Be formal and structured." : ""}${aiStyle === "technical" ? "Be technical and precise." : ""}

${guidance ? `CHAT GUIDANCE (custom instructions from the admin — follow these closely):\n${guidance}\n` : ""}CORE PRINCIPLES:
- You are an observer first, responder second
- When you DO respond, be natural and conversational — not robotic
- Use directives naturally within your response — use as MANY as needed per message, one per item
- In ACTIVE mode, share insights proactively: "Hey, noticed X hasn't been followed up on" or "Based on what Y said earlier, might want to consider Z"
- Read the room. If people are frustrated, ease off. If they want more, lean in.
- Keep Telegram formatting simple — no underscores, minimal bold
- NEVER output empty numbered lists or blank items (no "1. 2. 3." with nothing after). Only list items if you have actual content for each one.
- Keep responses tight — one clear sentence confirming each action is enough`;
}

/**
 * Auto-extract insights from recent conversation.
 * Runs every EXTRACT_EVERY messages. Infers tasks, people, relationships,
 * intentions, deadlines — all without being asked.
 */
export async function autoExtract(chatId: string, force = false) {
  const chatDoc = await Chat.findOne({ telegramChatId: chatId });
  if (!chatDoc) return;
  if (!force && chatDoc.messagesSinceSummary < EXTRACT_EVERY) return;

  const recentMessages = chatDoc.messages.slice(-15);
  const transcript = recentMessages
    .map((m: { telegramUsername?: string; firstName?: string; telegramUserId?: string; content: string }) =>
      `${m.telegramUsername || m.firstName || m.telegramUserId || "unknown"}: ${m.content}`
    )
    .join("\n");

  if (!transcript.trim()) return;

  const watch = { ...WATCH_DEFAULTS, ...chatDoc.watchSettings };

  const existingPeople = await Person.find({ telegramChatId: chatId }).lean();
  const existingTasks = await Task.find({ telegramChatId: chatId, status: { $ne: "done" } }).lean();

  const peopleNames = existingPeople.map((p) => p.username || p.firstName).filter(Boolean);
  const taskTitles = existingTasks.map((t) => t.title);

  const extraction = await aiChat([
    {
      role: "system",
      content: `You analyze chat transcripts and extract structured data. You are thorough but avoid duplicates.

Existing people: ${peopleNames.join(", ") || "none yet"}
Existing tasks: ${taskTitles.join(", ") || "none yet"}

Respond ONLY with valid JSON (no markdown fences). Extract:
{
  "tasks": [{"title": "...", "status": "todo|upcoming", "dueDate": "YYYY-MM-DD or null", "assignee": "username or null"}],
  "people": [{"name": "...", "role": "...", "context": "...", "intentions": ["..."]}],
  "relationships": [{"person1": "...", "person2": "...", "label": "...", "context": "..."}],
  "decisions": ["..."],
  "blockers": ["..."],
  "questions": ["unanswered questions from the chat"],
  "sentiment": "brief note on group mood, or null"
}

Rules:
- Only extract NEW items not already in existing lists
- Break EVERY item into its own entry. "buy stands and book hotel" = 2 tasks, never 1. "met John and Sarah" = 2 people.
- Infer tasks from commitments ("I'll do X", "we need to Y", "let's Z by Friday")
- Infer relationships from context ("my cofounder", "works with", "knows X from Y")
- Infer intentions from what people say they want or plan to do
- Parse dates naturally ("by Friday" = next Friday's date, "tomorrow" = tomorrow's date, "end of month" = last day of month). Today is ${new Date().toISOString().split("T")[0]}.
- If nothing new to extract, return empty arrays
- Be thorough — extract everything that's clearly implied, but don't hallucinate`,
    },
    {
      role: "user",
      content: `RECENT CONVERSATION:\n${transcript}`,
    },
  ]);

  try {
    const cleaned = extraction.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleaned);

    // Process tasks
    if (data.tasks?.length) {
      for (const t of data.tasks) {
        if (!t.title) continue;
        const existing = await Task.findOne({
          telegramChatId: chatId,
          title: { $regex: new RegExp(`^${t.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });
        if (!existing) {
          const taskData: Record<string, unknown> = {
            telegramChatId: chatId,
            title: t.title,
            status: t.status || "todo",
            createdBy: "odoai",
            createdByUsername: "odoai",
          };
          if (t.dueDate && /\d{4}-\d{2}-\d{2}/.test(t.dueDate)) {
            taskData.dueDate = new Date(t.dueDate);
          }
          await Task.create(taskData);
          const type = t.status === "upcoming" ? "task_upcoming" : "task_added";
          Activity.create({
            telegramChatId: chatId, type, title: t.title,
            detail: `inferred${t.assignee ? ` (${t.assignee})` : ""}${t.dueDate ? ` due ${t.dueDate}` : ""}`,
            actor: "odoai",
          }).catch(console.error);
        }
      }
    }

    // Process people
    if (data.people?.length) {
      for (const p of data.people) {
        const name = (p.name || "").replace("@", "").trim();
        if (!name) continue;
        const updates: Record<string, unknown> = { lastSeen: new Date() };
        if (p.role) updates.role = p.role;
        if (p.context) updates.context = p.context;

        await Person.findOneAndUpdate(
          { telegramChatId: chatId, $or: [{ username: name }, { firstName: name }] },
          {
            $set: updates,
            $addToSet: p.intentions?.length ? { intentions: { $each: p.intentions } } : {},
            $setOnInsert: {
              telegramUserId: `inferred_${name}`,
              username: name,
              firstName: name,
              source: "manual",
              relationships: [],
              messageCount: 0,
            },
          },
          { upsert: true }
        );
      }
    }

    // Process relationships
    if (data.relationships?.length) {
      for (const r of data.relationships) {
        if (!r.person1 || !r.person2) continue;
        await Person.updateOne(
          { telegramChatId: chatId, $or: [{ username: r.person1 }, { firstName: r.person1 }] },
          { $addToSet: { relationships: { name: r.person2, label: r.label || "", context: r.context || "" } } }
        );
        await Person.updateOne(
          { telegramChatId: chatId, $or: [{ username: r.person2 }, { firstName: r.person2 }] },
          { $addToSet: { relationships: { name: r.person1, label: r.label || "", context: r.context || "" } } }
        );
      }
    }

    // Log decisions as activity
    if (watch.decisions && data.decisions?.length) {
      for (const d of data.decisions) {
        Activity.create({ telegramChatId: chatId, type: "dump", title: d, detail: "decision inferred", actor: "odoai" }).catch(console.error);
      }
    }

  } catch {
    // extraction failed, no worries — will try again next batch
  }

  await Chat.updateOne({ telegramChatId: chatId }, { $set: { lastSyncAt: new Date() } });
}

export async function maybeUpdateContext(chatId: string) {
  const chatDoc = await Chat.findOne({ telegramChatId: chatId });
  if (!chatDoc || chatDoc.messagesSinceSummary < SUMMARIZE_EVERY) return;

  const recentMessages = chatDoc.messages.slice(-50);
  const transcript = recentMessages
    .map((m: { telegramUsername?: string; telegramUserId?: string; content: string }) => `${m.telegramUsername || m.telegramUserId || "bot"}: ${m.content}`)
    .join("\n");

  const oldSummary = chatDoc.contextSummary || "None";

  const newSummary = await aiChat([
    {
      role: "system",
      content: "You are a context summarizer. Given the previous summary and recent messages, produce an updated summary. Track: key topics, decisions made, people's roles/intentions, ongoing tasks, relationships between people. Be concise but comprehensive. Max 500 words.",
    },
    {
      role: "user",
      content: `PREVIOUS SUMMARY:\n${oldSummary}\n\nRECENT MESSAGES:\n${transcript}\n\nProduce an updated context summary.`,
    },
  ]);

  await Chat.updateOne(
    { telegramChatId: chatId },
    {
      $set: {
        contextSummary: newSummary,
        lastSummaryAt: new Date(),
        messagesSinceSummary: 0,
      },
    }
  );

  await writeContextSummary(chatId, newSummary).catch(console.error);

  const [people, tasks] = await Promise.all([
    Person.find({ telegramChatId: chatId }).lean(),
    Task.find({ telegramChatId: chatId }).lean(),
  ]);
  await Promise.all([
    writePeopleSnapshot(chatId, people).catch(console.error),
    writeTasksSnapshot(chatId, tasks).catch(console.error),
  ]);
}

export async function extractPersonInfo(
  chatId: string,
  userId: string,
  username: string | undefined,
  firstName: string | undefined,
  _messageContent: string
) {
  await Person.findOneAndUpdate(
    { telegramUserId: userId, telegramChatId: chatId },
    {
      $set: { username, firstName, lastSeen: new Date(), source: "telegram" },
      $inc: { messageCount: 1 },
      $setOnInsert: { context: "", intentions: [], relationships: [] },
    },
    { upsert: true }
  );
}

/**
 * In active mode, decide if the bot should proactively message
 * based on recent extraction results.
 */
export async function maybeProactiveSuggest(chatId: string): Promise<string | null> {
  const chatDoc = await Chat.findOne({ telegramChatId: chatId });
  if (!chatDoc || chatDoc.mode !== "active") return null;

  // Only suggest every ~10 messages to avoid being annoying
  if ((chatDoc.messagesSinceSummary || 0) % 10 !== 0 || chatDoc.messagesSinceSummary === 0) return null;

  const [tasks, people] = await Promise.all([
    Task.find({ telegramChatId: chatId, status: { $ne: "done" } }).lean(),
    Person.find({ telegramChatId: chatId }).lean(),
  ]);

  const recentMessages = chatDoc.messages.slice(-10);
  const transcript = recentMessages
    .map((m: { telegramUsername?: string; content: string }) => `${m.telegramUsername || "?"}: ${m.content}`)
    .join("\n");

  const suggestion = await aiChat([
    {
      role: "system",
      content: `You are odoai in ACTIVE mode. Based on the recent conversation, current tasks, and people — decide if you have something genuinely useful to say.

If YES: Write a brief, natural message (1-3 sentences). Could be:
- Flagging something that was missed
- Connecting dots between what different people said
- Suggesting a next step
- Noticing a blocker or open question
- Reminding about something relevant

If NO: Respond with exactly "PASS"

Be genuinely helpful, not performative. Don't repeat what was just said. Don't be annoying.`,
    },
    {
      role: "user",
      content: `Recent chat:\n${transcript}\n\nOpen tasks: ${tasks.map((t) => t.title).join(", ") || "none"}\nPeople: ${people.map((p) => p.username || p.firstName).join(", ") || "none"}`,
    },
  ]);

  const trimmed = suggestion.trim();
  if (trimmed === "PASS" || trimmed.length < 5) return null;
  return trimmed;
}

export async function deepProcessDump(
  chatId: string,
  userId: string,
  username: string | undefined,
  content: string
) {
  const systemPrompt = await buildSystemPrompt(chatId);

  const analysis = await aiChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `A user (@${username || userId}) just dumped the following information. Analyze it and respond with a JSON block with these fields:
- summary: string (clean organized summary)
- title: string (short title for the dump)
- tasks: array of {title, status, dueDate} where status is "todo"|"upcoming"|"done"
- people: array of {identifier, role, intentions, context} for any people mentioned
- relationships: array of {person1, person2, label, context}
- intentions: array of strings for the dumper's intentions

Respond ONLY with valid JSON, no markdown fences.

DUMP CONTENT:
${content}`,
    },
  ]);

  try {
    const cleaned = analysis.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.tasks?.length) {
      for (const t of parsed.tasks) {
        const taskData: Record<string, unknown> = {
          status: t.status || "todo",
          createdBy: userId,
          createdByUsername: username,
        };
        if (t.dueDate && /\d{4}-\d{2}-\d{2}/.test(t.dueDate)) {
          taskData.dueDate = new Date(t.dueDate);
        }
        await Task.findOneAndUpdate(
          { telegramChatId: chatId, title: t.title },
          { $set: taskData },
          { upsert: true }
        );
        const type = t.status === "upcoming" ? "task_upcoming" : t.status === "done" ? "task_done" : "task_added";
        Activity.create({ telegramChatId: chatId, type, title: t.title, detail: "from dump", actor: username || userId }).catch(console.error);
      }
    }

    if (parsed.people?.length) {
      for (const p of parsed.people) {
        const id = p.identifier?.replace("@", "") || "";
        if (!id) continue;
        await Person.findOneAndUpdate(
          { telegramChatId: chatId, $or: [{ username: id }, { firstName: id }] },
          {
            $set: { role: p.role, context: p.context },
            $addToSet: { intentions: { $each: p.intentions || [] } },
            $setOnInsert: { telegramUserId: `dump_${id}`, source: "manual", relationships: [], messageCount: 0 },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
        const personContent = [
          p.role && `Role: ${p.role}`,
          p.context && `Context: ${p.context}`,
          p.intentions?.length && `Intentions: ${p.intentions.join(", ")}`,
        ].filter(Boolean).join("\n");
        if (personContent) {
          writePersonKnowledge(chatId, id, personContent, { source: "dump" }).catch(console.error);
        }
      }
    }

    if (parsed.relationships?.length) {
      for (const r of parsed.relationships) {
        if (!r.person1 || !r.person2) continue;
        await Person.updateOne(
          { telegramChatId: chatId, $or: [{ username: r.person1 }, { firstName: r.person1 }] },
          { $addToSet: { relationships: { name: r.person2, label: r.label || "", context: r.context || "" } } }
        );
        await Person.updateOne(
          { telegramChatId: chatId, $or: [{ username: r.person2 }, { firstName: r.person2 }] },
          { $addToSet: { relationships: { name: r.person1, label: r.label || "", context: r.context || "" } } }
        );
      }
    }

    if (parsed.intentions?.length) {
      await Person.findOneAndUpdate(
        { telegramUserId: userId, telegramChatId: chatId },
        { $addToSet: { intentions: { $each: parsed.intentions } } }
      );
    }

    await writeDump(chatId, parsed.title || "Info Dump", parsed.summary || content, username).catch(console.error);
    Activity.create({ telegramChatId: chatId, type: "dump", title: parsed.title || "Info Dump", actor: username || userId }).catch(console.error);

    return parsed;
  } catch {
    await writeDump(chatId, "Info Dump", content, username).catch(console.error);
    return { summary: analysis, title: "Info Dump", tasks: [], people: [], intentions: [] };
  }
}
