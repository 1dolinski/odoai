export const maxDuration = 300;

import { NextRequest } from "next/server";
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

  if (!token) return new Response(JSON.stringify({ error: "token required" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return new Response(JSON.stringify({ error: "invalid token" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const log = (msg: string) => send("log", { msg, ts: Date.now() });

      log("Connected to forecast API");

      try {
        const result = await runForecast(chat.telegramChatId, guidance || "", {
          iterations: Math.min(iterations || 1, 4),
          horizons: horizons || ["1d", "3d", "7d", "30d"],
          model: chat.aiModel || undefined,
          log,
        });

        send("result", result);
        log("Forecast complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Error: ${msg}`);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
