import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSpendSummary, getRecentSpends } from "@/lib/spend";
import Chat, { AiStyle } from "@/models/Chat";
import Task from "@/models/Task";
import Person from "@/models/Person";
import Job from "@/models/Job";

export async function GET(req: NextRequest) {
  await connectDB();

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const chatId = chat.telegramChatId;

  const [tasks, people, jobs, spendSummary, recentSpends] = await Promise.all([
    Task.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).lean(),
    Person.find({ telegramChatId: chatId }).sort({ messageCount: -1 }).lean(),
    Job.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).lean(),
    getSpendSummary(chatId),
    getRecentSpends(chatId),
  ]);

  return NextResponse.json({
    chat: {
      telegramChatId: chat.telegramChatId,
      title: chat.chatTitle || "Untitled Chat",
      mode: chat.mode,
      aiStyle: chat.aiStyle || "concise",
      contextSummary: chat.contextSummary,
      messageCount: chat.messages?.length || 0,
    },
    tasks,
    people: people.map((p) => ({
      username: p.username,
      firstName: p.firstName,
      role: p.role,
      context: p.context,
      intentions: p.intentions,
      messageCount: p.messageCount,
      lastSeen: p.lastSeen,
    })),
    jobs,
    spend: spendSummary,
    recentSpends,
  });
}

const VALID_STYLES: AiStyle[] = ["concise", "detailed", "casual", "professional", "technical"];

export async function PATCH(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { token, aiStyle } = body;

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token });
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  if (aiStyle && VALID_STYLES.includes(aiStyle)) {
    chat.aiStyle = aiStyle;
    await chat.save();
  }

  return NextResponse.json({ ok: true, aiStyle: chat.aiStyle });
}
