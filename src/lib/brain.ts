import { chat as aiChat } from "@/lib/openrouter";
import { qmdSearch, writeKnowledge, writeDump, writeContextSummary, writePeopleSnapshot, writePersonKnowledge, writeTasksSnapshot, formatQMDResults } from "@/lib/knowledge";
import { fetchEnabledEndpoints, formatDataForAI, persistSnapshots, buildTrendContext, type EnabledEndpoint } from "@/lib/dataSources";
import Chat, { WATCH_DEFAULTS } from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";
import Activity from "@/models/Activity";

const SUMMARIZE_EVERY = 10;
const EXTRACT_EVERY = 5;

function getModel(chatDoc: { aiModel?: string } | null): string | undefined {
  return chatDoc?.aiModel || undefined;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function dedupeIntentions(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((i) => i.toLowerCase()));
  const merged = [...existing];
  for (const i of incoming) {
    if (!seen.has(i.toLowerCase())) {
      seen.add(i.toLowerCase());
      merged.push(i);
    }
  }
  return merged;
}

function isSimilarTask(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter(Boolean));
  const wb = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...wa].filter((w) => wb.has(w));
  const union = new Set([...wa, ...wb]);
  const jaccard = intersection.length / union.size;
  if (jaccard >= 0.5) return true;
  const smaller = Math.min(wa.size, wb.size);
  if (smaller > 0 && intersection.length / smaller >= 0.75) return true;
  return false;
}

function getEnabledEndpoints(chatDoc: { dataSources?: { sourceId: string; endpointId: string; enabled: boolean }[] } | null): EnabledEndpoint[] {
  if (!chatDoc?.dataSources?.length) return [];
  return chatDoc.dataSources
    .filter((ds) => ds.enabled)
    .map((ds) => ({ sourceId: ds.sourceId, endpointId: ds.endpointId }));
}

async function getDataSourceContext(chatId: string, chatDoc: { dataSources?: { sourceId: string; endpointId: string; enabled: boolean }[] } | null): Promise<string> {
  const enabled = getEnabledEndpoints(chatDoc);
  if (!enabled.length) return "";

  try {
    const trendContext = await buildTrendContext(chatId, enabled);
    return trendContext ? `\nDATA SOURCES (live business data + historical snapshots for trend analysis):\n${trendContext}` : "";
  } catch {
    return "";
  }
}

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

  const members = people.filter((p) => p.personType !== "contact");
  const contacts = people.filter((p) => p.personType === "contact");

  const formatPerson = (p: typeof people[0]) => {
    let line = `- @${p.username || p.firstName || p.telegramUserId}`;
    if (p.role) line += ` (${p.role})`;
    if (p.intentions.length) line += ` | Intentions: ${p.intentions.join(", ")}`;
    if (p.context) line += ` | Context: ${p.context}`;
    if (p.resources) line += ` | Resources: ${p.resources}`;
    if (p.access) line += ` | Access: ${p.access}`;
    if (p.relationships?.length) {
      const rels = p.relationships.map((r: { name: string; label?: string; context?: string }) => `${r.name}${r.label ? ` [${r.label}]` : ""}${r.context ? `: ${r.context}` : ""}`);
      line += ` | Knows: ${rels.join("; ")}`;
    }
    return line;
  };

  const membersBlock = members.length
    ? members.map(formatPerson).join("\n")
    : "No chat members tracked yet.";

  const contactsBlock = contacts.length
    ? contacts.map(formatPerson).join("\n")
    : "No contacts added yet.";

  const initiatives = (chatDoc?.initiatives || []).filter((i: { status: string }) => i.status === "active");

  const taskBlock = tasks.length
    ? tasks.map((t) => {
        let line = `- [${t.status}] ${t.title}`;
        if (t.dueDate) line += ` (due ${t.dueDate.toISOString().split("T")[0]})`;
        if (t.initiative) {
          const ini = initiatives.find((i: { id: string }) => i.id === t.initiative);
          if (ini) line += ` [initiative: ${(ini as { name: string }).name}]`;
        }
        return line;
      }).join("\n")
    : "No active tasks.";

  const initiativeBlock = initiatives.length
    ? initiatives.map((i: { name: string; description: string }) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n")
    : "No initiatives defined yet.";

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

  const dataSourceBlock = await getDataSourceContext(chatId, chatDoc);

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

CHAT MEMBERS (people in this Telegram group):
${membersBlock}

CONTACTS (external people the team works with — connections, resources, access. Help the team make tasteful, thoughtful use of these relationships):
${contactsBlock}

INITIATIVES (ongoing workstreams — tag new tasks with the relevant initiative when applicable):
${initiativeBlock}

ACTIVE TASKS:
${taskBlock}

ACTIVE JOBS:
${jobBlock}
${knowledgeBlock}${dataSourceBlock}
WATCHING FOR: ${watchLines.join(", ")}

WHEN MENTIONED OR IN DM:
You have just been synced — you've caught up on all recent messages. Look at the conversation history to understand what the user wants. Infer their intent from context. If they mentioned something earlier that needs action (web search, adding a task, looking something up), do it NOW without being asked again.

You work ALONGSIDE the team. You are not a command executor — you are a collaborator. If someone says "search for X and add it in", you search and add tasks. If they say "get to work", review recent history and act on anything pending. If they just want to chat, chat.

CRITICAL: Break every message into AS MANY individual actions as needed. A single message can contain multiple tasks, people, relationships, searches — extract ALL of them. "buy stands, book hotel, and check flights" = 3 separate ADD_TODO directives. "met John the designer and Sarah from marketing" = 2 separate ADD_PERSON directives. Never lump multiple items into one action. More granular = better.

DEDUP: NEVER add a task that already exists in ACTIVE TASKS above, even if worded slightly differently. "print stand inserts" and "printing stand inserts" are the SAME task. "make QR code" and "making QR code" are the SAME task. Check the existing list carefully before adding. If a task is essentially the same thing, do NOT emit an ADD_TODO/ADD_UPCOMING directive for it.

Available actions (embed naturally in your response, use MULTIPLE per message):
  [ADD_TODO: desc | YYYY-MM-DD | context | @person1,@person2 | #initiative] — context = 1-sentence explanation (ALWAYS include). People field = comma-separated names of people involved. Initiative field = name of the initiative this task belongs to (from INITIATIVES list above). Omit fields you don't need but always include context.
  [ADD_UPCOMING: desc | YYYY-MM-DD | context | @person1,@person2 | #initiative] — same format as ADD_TODO
  [MARK_DONE: desc]
  [ADD_PERSON: name | role | context] — for chat members
  [ADD_CONTACT: name | role | context | resources | access] — for external contacts/connections
  [ADD_RELATIONSHIP: person1 | person2 | label | context]
  [SCHEDULE_CHECK: desc | minutes]
  [SET_STYLE: concise|detailed|casual|professional|technical]
  [SET_CHECK_PACE: faster|slower|pause|resume]
  [SEARCH: query] — web search (USE THIS when info needs looking up)
  [RECALL: query] — memory search

COMMUNICATION STYLE: ${aiStyle.toUpperCase()}
${aiStyle === "concise" ? "Be brief and direct." : ""}${aiStyle === "detailed" ? "Give thorough explanations." : ""}${aiStyle === "casual" ? "Be friendly and informal." : ""}${aiStyle === "professional" ? "Be formal and structured." : ""}${aiStyle === "technical" ? "Be technical and precise." : ""}

${guidance ? `CHAT GUIDANCE (custom instructions from the admin — follow these closely):\n${guidance}\n` : ""}${chatDoc?.abilities ? `TEAM ABILITIES & RESOURCES (what the team/users can do — tailor task suggestions and subtask breakdowns to these capabilities):\n${chatDoc.abilities}\n\n` : ""}CORE PRINCIPLES:
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

  const model = getModel(chatDoc);
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
  ], model);

  try {
    const cleaned = extraction.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleaned);

    // Process tasks (with fuzzy dedup)
    if (data.tasks?.length) {
      const allTasks = await Task.find({ telegramChatId: chatId }).lean();
      for (const t of data.tasks) {
        if (!t.title) continue;
        const isDupe = allTasks.some((ex) => isSimilarTask(t.title, (ex as { title: string }).title));
        if (isDupe) continue;
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
        allTasks.push(taskData as typeof allTasks[0]);
        const type = t.status === "upcoming" ? "task_upcoming" : "task_added";
        Activity.create({
          telegramChatId: chatId, type, title: t.title,
          detail: `inferred${t.assignee ? ` (${t.assignee})` : ""}${t.dueDate ? ` due ${t.dueDate}` : ""}`,
          actor: "odoai",
        }).catch(console.error);
      }
    }

    // Process people
    if (data.people?.length) {
      for (const p of data.people) {
        const name = (p.name || "").replace("@", "").trim();
        if (!name) continue;
        const updates: Record<string, unknown> = { lastSeen: new Date() };
        if (p.role && p.role !== "null") updates.role = p.role;
        if (p.context && p.context !== "null") updates.context = p.context;

        if (p.intentions?.length) {
          const existingPerson = await Person.findOne({ telegramChatId: chatId, $or: [{ username: name }, { firstName: name }] });
          updates.intentions = dedupeIntentions(existingPerson?.intentions || [], p.intentions);
        }
        await Person.findOneAndUpdate(
          { telegramChatId: chatId, $or: [{ username: name }, { firstName: name }] },
          {
            $set: updates,
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
  ], getModel(chatDoc));

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
  ], getModel(chatDoc));

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
  const chatDoc = await Chat.findOne({ telegramChatId: chatId });
  const model = getModel(chatDoc);
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
  ], model);

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
        const existingP = await Person.findOne({ telegramChatId: chatId, $or: [{ username: id }, { firstName: id }] });
        const setFields: Record<string, unknown> = {};
        if (p.role && p.role !== "null") setFields.role = p.role;
        if (p.context && p.context !== "null") setFields.context = p.context;
        if (p.intentions?.length) setFields.intentions = dedupeIntentions(existingP?.intentions || [], p.intentions);
        await Person.findOneAndUpdate(
          { telegramChatId: chatId, $or: [{ username: id }, { firstName: id }] },
          {
            $set: setFields,
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
      const existingUser = await Person.findOne({ telegramUserId: userId, telegramChatId: chatId });
      await Person.findOneAndUpdate(
        { telegramUserId: userId, telegramChatId: chatId },
        { $set: { intentions: dedupeIntentions(existingUser?.intentions || [], parsed.intentions) } }
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

export async function generateAiFeed(chatId: string): Promise<{ type: string; content: string }[]> {
  const [chatDoc, tasks, people] = await Promise.all([
    Chat.findOne({ telegramChatId: chatId }),
    Task.find({ telegramChatId: chatId }).lean(),
    Person.find({ telegramChatId: chatId }).lean(),
  ]);
  if (!chatDoc) return [];

  const recentMessages = chatDoc.messages.slice(-30);
  const transcript = recentMessages
    .map((m: { telegramUsername?: string; firstName?: string; content: string }) =>
      `${m.telegramUsername || m.firstName || "user"}: ${m.content}`
    )
    .join("\n");

  const openTasks = tasks.filter((t) => (t as { status: string }).status !== "done");
  const doneTasks = tasks.filter((t) => (t as { status: string }).status === "done");
  const taskSummary = openTasks.map((t) => `[${(t as { status: string }).status}] ${(t as { title: string }).title}`).join("\n") || "none";
  const peopleSummary = people.map((p) => {
    const name = (p as { username?: string; firstName?: string }).username || (p as { username?: string; firstName?: string }).firstName;
    const role = (p as { role?: string }).role;
    const intentions = (p as { intentions?: string[] }).intentions || [];
    return name ? `${name}${role && role !== "null" ? ` (${role})` : ""}${intentions.length ? ` — ${intentions.join(", ")}` : ""}` : null;
  }).filter(Boolean).join("\n") || "none";

  const recentFeedItems = (chatDoc.aiFeed || []).slice(-20);
  const existingFeed = recentFeedItems.map((f: { type: string; content: string }) => `[${f.type}] ${f.content}`).join("\n");

  const initiatives = (chatDoc.initiatives || []).filter((i: { status: string }) => i.status === "active");
  const initiativeBlock = initiatives.length
    ? initiatives.map((i: { name: string; description: string }) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n")
    : "";

  const abilitiesBlock = chatDoc.abilities || "";

  const dumps = (chatDoc.dumps || []).slice(-10).map((d: { text: string; category: string; subject: string }) =>
    `[${d.category}${d.subject ? `:${d.subject}` : ""}] ${d.text.substring(0, 150)}`
  ).join("\n");

  // Pull relevant context from QMD based on current tasks and recent chat
  const searchQueries = [
    openTasks.slice(0, 3).map((t) => (t as { title: string }).title).join(", "),
    recentMessages.slice(-5).map((m: { content: string }) => m.content).join(" ").substring(0, 200),
  ].filter((q) => q.length > 5);

  let qmdContext = "";
  for (const q of searchQueries) {
    try {
      const results = await qmdSearch(q, 4);
      if (results.length) {
        qmdContext += results.map((r) => `- ${r.title}: ${r.snippet?.substring(0, 150) || ""}`).join("\n") + "\n";
      }
    } catch { /* QMD unavailable */ }
  }

  let dataSourceContext = "";
  const enabledEps = getEnabledEndpoints(chatDoc);
  if (enabledEps.length) {
    try {
      const dsResults = await fetchEnabledEndpoints(enabledEps);
      dataSourceContext = formatDataForAI(dsResults);
      persistSnapshots(chatId, dsResults).catch(console.error);
      const updateOps: Record<string, unknown> = {};
      for (const r of dsResults) {
        if (!r.error && r.data) {
          const allDs = chatDoc.dataSources || [];
          const idx = allDs.findIndex((ds: { sourceId: string; endpointId: string }) => ds.sourceId === r.sourceId && ds.endpointId === r.endpointId);
          if (idx >= 0) updateOps[`dataSources.${idx}.lastFetchAt`] = r.fetchedAt;
        }
      }
      if (Object.keys(updateOps).length) {
        Chat.updateOne({ telegramChatId: chatId }, { $set: updateOps }).catch(console.error);
      }
      const trendCtx = await buildTrendContext(chatId, enabledEps);
      if (trendCtx) dataSourceContext += `\n\nHISTORICAL SNAPSHOTS:\n${trendCtx}`;
    } catch { /* data sources unavailable */ }
  }

  const response = await aiChat([
    {
      role: "system",
      content: `You are an AI assistant reviewing a team's chat, tasks, people, knowledge base, initiatives, and live business data from connected data sources. Generate actionable feed items that are timely, relevant, and leverage everything you know — including trends, anomalies, and opportunities visible in the data sources.

Respond ONLY with valid JSON array. Each item: {"type": "cleanup"|"suggestion"|"checkin"|"insight"|"reminder"|"shout", "content": "..."}

Types:
- cleanup: duplicate tasks, stale todos, things that should be marked done or removed
- suggestion: ideas, optimizations, next steps the team should consider — leverage knowledge from dumps, people's abilities, and initiatives
- checkin: status checks on open tasks, asking if something is done
- insight: patterns you notice, connections between conversations/tasks/people/knowledge — connect the dots
- reminder: upcoming deadlines, things that need attention soon
- shout: ONLY for truly high-impact, easy-win ideas worth interrupting the group for. Write these conversationally as if talking to friends: "hey guys, you should think about X because Y — it's pretty easy and could Z". Keep it casual and compelling. Use shout SPARINGLY — max 1 per generation, only if something is genuinely great.

Rules:
- Generate 2-5 items, whatever is genuinely useful
- Be specific — reference actual task names, people, dates, initiatives
- Cross-reference knowledge base findings with current tasks to surface connections
- Consider the team's abilities when suggesting actions — suggest things they can actually do
- CRITICAL DEDUP: Read the recent feed below carefully. Do NOT generate items about the same TOPIC, THEME, or SUBJECT as any existing item — even if you phrase it differently. Each new item must cover a genuinely different angle or topic. If you can't think of something new, return fewer items or [].
- If nothing useful to say, return empty array []
- Keep each item to 1-2 sentences (shout can be slightly longer)
- Today is ${new Date().toISOString().split("T")[0]}
- shout: posted to the group chat. Max 1 per generation, ONLY if the topic hasn't been covered in recent feed. Skip shout entirely if recent feed already has shouts on similar topics.

RECENT FEED (do NOT repeat these topics):
${existingFeed || "nothing yet"}`,
    },
    {
      role: "user",
      content: `RECENT CHAT:\n${transcript || "no recent messages"}\n\nOPEN TASKS:\n${taskSummary}\n\nDONE TASKS (${doneTasks.length}):\n${doneTasks.slice(-5).map((t) => (t as { title: string }).title).join(", ") || "none"}\n\nPEOPLE:\n${peopleSummary}${initiativeBlock ? `\n\nACTIVE INITIATIVES:\n${initiativeBlock}` : ""}${abilitiesBlock ? `\n\nTEAM ABILITIES:\n${abilitiesBlock}` : ""}${dumps ? `\n\nRECENT DUMPS/NOTES:\n${dumps}` : ""}${qmdContext ? `\n\nKNOWLEDGE BASE (semantic memory — relevant stored info):\n${qmdContext}` : ""}${dataSourceContext ? `\n\nLIVE DATA SOURCES (business metrics, activity feeds — look for trends, anomalies, opportunities):\n${dataSourceContext}` : ""}\n\nCONTEXT: ${chatDoc.contextSummary || "none"}`,
    },
  ], "openai/gpt-4o-mini");

  try {
    const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const items = JSON.parse(cleaned);
    if (!Array.isArray(items)) return [];
    const valid = items.filter((i: { type?: string; content?: string }) => i.type && i.content).slice(0, 5);

    // Semantic dedup via QMD — drop items too similar to previously stored feed insights
    const filtered: { type: string; content: string }[] = [];
    for (const item of valid as { type: string; content: string }[]) {
      try {
        const hits = await qmdSearch(item.content, 3);
        const isFeedDupe = hits.some((h) => h.score > 0.75 && h.title.includes("Feed Insights"));
        if (!isFeedDupe) filtered.push(item);
      } catch {
        filtered.push(item);
      }
    }

    // Write insights back to QMD for future retrieval
    if (filtered.length) {
      const insightContent = filtered.map((i: { type: string; content: string }) => `[${i.type}] ${i.content}`).join("\n\n");
      writeKnowledge(chatId, "context", `feed-${Date.now()}`, `# AI Feed Insights — ${new Date().toISOString().split("T")[0]}\n\n${insightContent}`).catch(console.error);
    }

    return filtered;
  } catch {
    return [];
  }
}

export async function generateAiQuestions(chatId: string): Promise<{ id: string; category: string; question: string }[]> {
  const [chatDoc, tasks, people] = await Promise.all([
    Chat.findOne({ telegramChatId: chatId }),
    Task.find({ telegramChatId: chatId }).lean(),
    Person.find({ telegramChatId: chatId }).lean(),
  ]);
  if (!chatDoc) return [];

  const recentMessages = chatDoc.messages.slice(-30);
  const transcript = recentMessages
    .map((m: { telegramUsername?: string; firstName?: string; content: string }) =>
      `${m.telegramUsername || m.firstName || "user"}: ${m.content}`
    )
    .join("\n");

  const openTasks = tasks.filter((t) => (t as { status: string }).status !== "done");
  const taskSummary = openTasks.map((t) => `[${(t as { status: string }).status}] ${(t as { title: string }).title}`).join("\n") || "none";

  const peopleSummary = people.map((p) => {
    const name = (p as { username?: string; firstName?: string }).username || (p as { username?: string; firstName?: string }).firstName;
    const role = (p as { role?: string }).role;
    const intentions = (p as { intentions?: string[] }).intentions || [];
    return name ? `${name}${role && role !== "null" ? ` (${role})` : ""}${intentions.length ? ` — ${intentions.join(", ")}` : ""}` : null;
  }).filter(Boolean).join("\n") || "none";

  const initiatives = (chatDoc.initiatives || []).filter((i: { status: string }) => i.status === "active");
  const initiativeBlock = initiatives.length
    ? initiatives.map((i: { name: string; description: string }) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n")
    : "";

  const abilitiesBlock = chatDoc.abilities || "";

  const dumps = (chatDoc.dumps || []).slice(-15).map((d: { text: string; category: string; subject: string }) =>
    `[${d.category}${d.subject ? `:${d.subject}` : ""}] ${d.text.substring(0, 200)}`
  ).join("\n");

  const existingQA = (chatDoc.aiQuestions || [])
    .filter((q: { answer: string }) => q.answer)
    .map((q: { category: string; question: string; answer: string }) => `[${q.category}] Q: ${q.question}\nA: ${q.answer}`)
    .join("\n\n");

  const unanswered = (chatDoc.aiQuestions || [])
    .filter((q: { answer: string }) => !q.answer)
    .map((q: { category: string; question: string }) => `[${q.category}] ${q.question}`)
    .join("\n");

  let qmdContext = "";
  const searchTerms = [
    "team strategy goals",
    "brand partnerships opportunities",
    "sales revenue pipeline",
    "content social media audience",
  ];
  for (const q of searchTerms) {
    try {
      const results = await qmdSearch(q, 3);
      if (results.length) {
        qmdContext += results.map((r) => `- ${r.title}: ${r.snippet?.substring(0, 150) || ""}`).join("\n") + "\n";
      }
    } catch { /* QMD unavailable */ }
  }

  const enabledEps = getEnabledEndpoints(chatDoc);
  let dataSourceContext = "";
  if (enabledEps.length) {
    try {
      const trendCtx = await buildTrendContext(chatId, enabledEps);
      if (trendCtx) dataSourceContext = trendCtx.substring(0, 2000);
    } catch { /* data sources unavailable */ }
  }

  const response = await aiChat([
    {
      role: "system",
      content: `You are a strategic AI advisor helping a team build a stronger business profile. Your job is to generate SMART, SPECIFIC questions that will help you deeply understand this team so you can better help them get attention, sales, and brand partnerships.

Generate questions across these categories:
- strategy: Growth direction, positioning, competitive advantages, goals, target market
- abilities: What the team can actually do, tools they use, skills, production capabilities
- sales: Revenue model, pipeline, pricing, conversion, customer acquisition
- brand: Partnership potential, what they offer partners, ideal partner profiles, collaboration ideas
- content: Social strategy, content types, audience demographics, engagement patterns, distribution
- faq: Questions their audience/customers/partners would commonly ask
- general: Anything else that would help you understand the team better

CRITICAL RULES:
- Generate 5-8 questions total, spread across categories
- Make questions SPECIFIC to what you already know about this team — reference their actual tasks, people, initiatives, data
- Ask about GAPS in your knowledge — things you don't know yet that would help you advise better
- Don't ask things you already have answers to from the existing Q&A below
- Don't repeat questions from the unanswered list below
- Questions should be actionable — the answer should directly help with attention, sales, or brand partnerships
- Frame questions so the answers will help you give better strategic advice
- Keep questions concise but specific

Respond ONLY with valid JSON array. Each item: {"id": "unique-id", "category": "strategy"|"abilities"|"sales"|"brand"|"content"|"faq"|"general", "question": "the question"}`,
    },
    {
      role: "user",
      content: `TEAM CONTEXT: ${chatDoc.contextSummary || "none yet"}

OPEN TASKS:\n${taskSummary}

PEOPLE:\n${peopleSummary}
${initiativeBlock ? `\nINITIATIVES:\n${initiativeBlock}` : ""}
${abilitiesBlock ? `\nTEAM ABILITIES:\n${abilitiesBlock}` : ""}
${dumps ? `\nDUMPS/NOTES:\n${dumps}` : ""}
${qmdContext ? `\nKNOWLEDGE BASE:\n${qmdContext}` : ""}
${dataSourceContext ? `\nDATA SOURCES:\n${dataSourceContext}` : ""}
${existingQA ? `\nALREADY ANSWERED (don't ask these again):\n${existingQA}` : ""}
${unanswered ? `\nSTILL UNANSWERED (don't repeat):\n${unanswered}` : ""}
RECENT CHAT:\n${transcript || "no recent messages"}`,
    },
  ], "openai/gpt-4o-mini");

  try {
    const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const items = JSON.parse(cleaned);
    if (!Array.isArray(items)) return [];
    return items
      .filter((i: { id?: string; category?: string; question?: string }) => i.category && i.question)
      .map((i: { id?: string; category: string; question: string }) => ({
        id: i.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        category: i.category,
        question: i.question,
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}
