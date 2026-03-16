import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { sendMessage } from "@/lib/telegram";
import { chat as aiChat } from "@/lib/openrouter";
import { buildSystemPrompt } from "@/lib/brain";
import { qmdSearch, formatQMDResults } from "@/lib/knowledge";
import Job from "@/models/Job";
import Task from "@/models/Task";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isSecretParam = secret === process.env.CRON_SECRET;

  if (!isVercelCron && !isSecretParam) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await connectDB();

  const dueJobs = await Job.find({
    status: "active",
    nextCheckIn: { $lte: new Date() },
  });

  for (const job of dueJobs) {
    try {
      const systemPrompt = await buildSystemPrompt(job.telegramChatId, job.title);
      const tasks = await Task.find({
        telegramChatId: job.telegramChatId,
        status: { $ne: "done" },
      });

      const taskList = tasks.map((t) => `[${t.status}] ${t.title}`).join("\n");

      // Pull relevant knowledge from QMD for richer check-ins
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
      ]);

      await sendMessage(Number(job.telegramChatId), `🟢 *Check-in: ${job.title}*\n\n${checkIn}`);

      const nextCheckIn = new Date(Date.now() + job.checkInIntervalMin * 60 * 1000);
      await Job.updateOne(
        { _id: job._id },
        { $set: { lastCheckIn: new Date(), nextCheckIn } }
      );
    } catch (err) {
      console.error(`Check-in failed for job ${job._id}:`, err);
    }
  }

  return NextResponse.json({ processed: dueJobs.length });
}
