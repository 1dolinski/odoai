import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Task from "@/models/Task";

export async function GET(req: NextRequest) {
  await connectDB();

  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });

  const tasks = await Task.find({ telegramChatId: chatId }).sort({ createdAt: -1 });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { telegramChatId, title, description, status, createdBy, createdByUsername } = body;

  if (!telegramChatId || !title || !createdBy) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const task = await Task.create({
    telegramChatId,
    title,
    description,
    status: status || "todo",
    createdBy,
    createdByUsername,
  });

  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { taskId, status } = body;

  if (!taskId || !status) {
    return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
  }

  const task = await Task.findByIdAndUpdate(taskId, { status }, { new: true });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest) {
  await connectDB();

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  await Task.findByIdAndDelete(taskId);
  return NextResponse.json({ ok: true });
}
