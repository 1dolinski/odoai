import { chat as aiChat } from "@/lib/openrouter";
import { qmdSearch, writeDump, writeContextSummary, writePeopleSnapshot, writeTasksSnapshot, formatQMDResults } from "@/lib/knowledge";
import Chat from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";

const SUMMARIZE_EVERY = 20;

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

  const peopleBlock = people.length
    ? people
        .map((p) => {
          let line = `- @${p.username || p.firstName || p.telegramUserId}`;
          if (p.role) line += ` (${p.role})`;
          if (p.intentions.length) line += ` | Intentions: ${p.intentions.join(", ")}`;
          if (p.context) line += ` | Context: ${p.context}`;
          return line;
        })
        .join("\n")
    : "No people tracked yet.";

  const taskBlock = tasks.length
    ? tasks.map((t) => `- [${t.status}] ${t.title}`).join("\n")
    : "No active tasks.";

  const jobBlock = activeJobs.length
    ? activeJobs.map((j) => `- ${j.title}: ${j.description}`).join("\n")
    : "No active jobs.";

  // RAG: pull relevant knowledge from QMD if we have a query
  let knowledgeBlock = "";
  if (userQuery) {
    const results = await qmdSearch(userQuery);
    if (results.length) {
      knowledgeBlock = `\nRELEVANT KNOWLEDGE (from QMD semantic search):\n${formatQMDResults(results)}`;
    }
  }

  return `You are odoai, an AI assistant embedded in a Telegram group chat.

MODE: ${mode.toUpperCase()}
${mode === "passive" ? "You are in PASSIVE mode. Only respond when directly mentioned (@odoai_bot) or when a command is used. You silently observe and build context." : "You are in ACTIVE mode. You are an active collaborator. Proactively check in, ask clarifying questions, and push the team forward."}

CHAT CONTEXT SUMMARY:
${contextSummary}

PEOPLE IN THIS CHAT:
${peopleBlock}

ACTIVE TASKS:
${taskBlock}

ACTIVE JOBS:
${jobBlock}
${knowledgeBlock}
CAPABILITIES:
- You track todo/upcoming/done tasks for the group
- You understand each person's role, intentions, and relationships
- You can search the web with [SEARCH: query] when you need real-time info
- You can recall knowledge from past dumps and context with [RECALL: query]
- Users can /dump information to get you up to speed on anything
- You can /optimize plans by analyzing tasks and suggesting improvements

COMMUNICATION STYLE: ${aiStyle.toUpperCase()}
${aiStyle === "concise" ? "Be brief and direct. Short sentences. No filler." : ""}${aiStyle === "detailed" ? "Give thorough explanations. Include reasoning and context." : ""}${aiStyle === "casual" ? "Be friendly and informal. Use conversational language." : ""}${aiStyle === "professional" ? "Use formal, business-appropriate language. Be structured." : ""}${aiStyle === "technical" ? "Be technical and precise. Include specifics, code references, and data." : ""}

BEHAVIOR:
- Reference people by their @username when relevant
- When someone dumps info, extract intentions, tasks, relationships, and context
- When analyzing plans, be specific about priorities and blockers
- Format responses for Telegram (use *bold* and _italic_ sparingly)
- Use [SEARCH: query] when you need current web information
- Use [RECALL: query] when you need to look up something from past dumps or context
- If you need to perform an action (add task, update person), output a structured action block`;
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

  // Write to QMD knowledge directory so it gets indexed
  await writeContextSummary(chatId, newSummary).catch(console.error);

  // Also snapshot people and tasks for QMD
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
      $set: { username, firstName, lastSeen: new Date() },
      $inc: { messageCount: 1 },
      $setOnInsert: { context: "", intentions: [], relationships: [] },
    },
    { upsert: true }
  );
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
- tasks: array of {title, status} where status is "todo"|"upcoming"|"done"
- people: array of {identifier, role, intentions, context} for any people mentioned
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
        await Task.findOneAndUpdate(
          { telegramChatId: chatId, title: t.title },
          {
            $set: { status: t.status || "todo", createdBy: userId, createdByUsername: username },
          },
          { upsert: true }
        );
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
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }
    }

    if (parsed.intentions?.length) {
      await Person.findOneAndUpdate(
        { telegramUserId: userId, telegramChatId: chatId },
        { $addToSet: { intentions: { $each: parsed.intentions } } }
      );
    }

    // Write dump to QMD knowledge directory for semantic indexing
    await writeDump(chatId, parsed.title || "Info Dump", parsed.summary || content, username).catch(console.error);

    return parsed;
  } catch {
    // Still write the raw dump even if parsing failed
    await writeDump(chatId, "Info Dump", content, username).catch(console.error);
    return { summary: analysis, title: "Info Dump", tasks: [], people: [], intentions: [] };
  }
}
