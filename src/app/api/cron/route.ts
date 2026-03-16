import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { sendMessage } from "@/lib/telegram";
import { chat as aiChat } from "@/lib/openrouter";
import { buildSystemPrompt, generateAiFeed } from "@/lib/brain";
import { qmdSearch, formatQMDResults } from "@/lib/knowledge";
import Chat from "@/models/Chat";
import Job from "@/models/Job";
import Task from "@/models/Task";
import Check from "@/models/Check";
import Activity from "@/models/Activity";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isSecretParam = secret === process.env.CRON_SECRET;

  if (!isVercelCron && !isSecretParam) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await connectDB();

  // Process due scheduled checks
  const dueChecks = await Check.find({
    status: "pending",
    scheduledFor: { $lte: new Date() },
  });

  for (const check of dueChecks) {
    try {
      const chatDoc = await Chat.findOne({ telegramChatId: check.telegramChatId });
      const model = chatDoc?.aiModel || undefined;
      const systemPrompt = await buildSystemPrompt(check.telegramChatId, check.description);
      const tasks = await Task.find({
        telegramChatId: check.telegramChatId,
        status: { $ne: "done" },
      });
      const taskList = tasks.map((t) => `[${t.status}] ${t.title}`).join("\n");

      const knowledgeResults = await qmdSearch(check.description);
      const knowledgeContext = knowledgeResults.length
        ? `\nRelevant memory:\n${formatQMDResults(knowledgeResults)}`
        : "";

      const response = await aiChat([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Scheduled check-in: "${check.description}"
Original context: "${check.context}"
Current tasks:\n${taskList || "None"}${knowledgeContext}

This is a timed check-in you scheduled earlier. Give a brief, relevant nudge or question (1-2 sentences). Be helpful, not nagging.`,
        },
      ], model);

      await sendMessage(Number(check.telegramChatId), `⏰ ${response}`);
      check.status = "done";
      check.result = response;
      check.completedAt = new Date();
      await check.save();
    } catch (err) {
      console.error(`Check failed ${check._id}:`, err);
    }
  }

  // Process due job check-ins
  const dueJobs = await Job.find({
    status: "active",
    nextCheckIn: { $lte: new Date() },
  });

  for (const job of dueJobs) {
    try {
      const jobChat = await Chat.findOne({ telegramChatId: job.telegramChatId });
      const jobModel = jobChat?.aiModel || undefined;
      const systemPrompt = await buildSystemPrompt(job.telegramChatId, job.title);
      const tasks = await Task.find({
        telegramChatId: job.telegramChatId,
        status: { $ne: "done" },
      });

      const taskList = tasks.map((t) => `[${t.status}] ${t.title}`).join("\n");

      const knowledgeResults = await qmdSearch(job.title);
      const knowledgeContext = knowledgeResults.length
        ? `\nRelevant memory:\n${formatQMDResults(knowledgeResults)}`
        : "";

      const checkIn = await aiChat([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `You are doing a scheduled check-in for the active job: "${job.title}" (${job.description}).

Current tasks:\n${taskList || "None"}${knowledgeContext}

Generate a brief, helpful check-in message. Ask a specific question about progress, flag if something looks blocked, or suggest a next step. Keep it short (2-3 sentences). Be a good collaborator, not annoying.`,
        },
      ], jobModel);

      await sendMessage(Number(job.telegramChatId), `🟢 Check-in: ${job.title}\n\n${checkIn}`);

      const nextCheckIn = new Date(Date.now() + job.checkInIntervalMin * 60 * 1000);
      await Job.updateOne(
        { _id: job._id },
        { $set: { lastCheckIn: new Date(), nextCheckIn } }
      );
    } catch (err) {
      console.error(`Check-in failed for job ${job._id}:`, err);
    }
  }

  // Auto-generate AI feed for active/aggressive chats with feed enabled
  let feedGenerated = 0;
  const feedChats = await Chat.find({
    aiFeedEnabled: true,
    mode: { $in: ["active", "aggressive"] },
  });
  for (const fc of feedChats) {
    try {
      const items = await generateAiFeed(fc.telegramChatId);
      if (items.length) {
        const entries = items.map((i) => ({ type: i.type, content: i.content, createdAt: new Date() }));
        await Chat.updateOne(
          { _id: fc._id },
          { $push: { aiFeed: { $each: entries, $slice: -50 } } }
        );
        Activity.create({
          telegramChatId: fc.telegramChatId,
          type: "ai_triggered",
          title: "AI feed auto-generated",
          detail: `${items.length} items`,
          actor: "odoai",
        }).catch(console.error);
        feedGenerated++;
      }
    } catch (err) {
      console.error(`Feed gen failed for ${fc.telegramChatId}:`, err);
    }
  }

  return NextResponse.json({ checks: dueChecks.length, jobs: dueJobs.length, feedGenerated });
}
