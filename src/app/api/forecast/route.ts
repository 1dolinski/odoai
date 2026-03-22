export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Chat from "@/models/Chat";
import { runForecast, type Horizon } from "@/lib/forecast";

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { token, guidance, horizons, iterations } = body as {
    token: string;
    guidance?: string;
    horizons?: Horizon[];
    iterations?: number;
  };

  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  try {
    const result = await runForecast(chat.telegramChatId, guidance || "", {
      iterations: Math.min(iterations || 2, 4),
      horizons: horizons || ["1d", "3d", "7d", "30d"],
      model: chat.aiModel || undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
