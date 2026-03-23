export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Chat from "@/models/Chat";
import Forecast from "@/models/Forecast";
import { runForecast, type Horizon } from "@/lib/forecast";

function normalizeForecast(f: Record<string, unknown>) {
  const horizons = (f.horizons as unknown[]) || [];
  const status =
    (f.status as string) || (horizons.length > 0 ? "complete" : "running");
  const legacyModel = f.model as string | undefined;
  const llmModel = (f.llmModel as string | undefined) || legacyModel || "";
  const { model: _drop, ...rest } = f;
  return { ...rest, llmModel, model: llmModel, status };
}

export async function GET(req: NextRequest) {
  await connectDB();
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chat = await Chat.findOne({ dashboardToken: token }).lean();
  if (!chat) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const forecasts = await Forecast.find({ telegramChatId: chat.telegramChatId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return NextResponse.json({
    forecasts: forecasts.map((f) => normalizeForecast(f as unknown as Record<string, unknown>)),
  });
}

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

  const useModel = (chat.aiModel || "moonshotai/kimi-k2.5").trim();
  const iters = Math.min(iterations || 1, 4);
  const hz = horizons || (["1d", "3d", "7d", "30d"] as Horizon[]);

  const pending = await Forecast.create({
    telegramChatId: chat.telegramChatId,
    guidance: guidance || "",
    horizons: [],
    iterations: iters,
    llmModel: useModel,
    status: "running",
    generatedAt: new Date(),
    lastLog: "Queued on server",
    progressLogs: ["Job started — you can close this tab; it will finish in the background."],
  });

  const forecastId = pending._id.toString();
  const telegramChatId = chat.telegramChatId;
  const userGuidance = guidance || "";
  const aiModel = chat.aiModel || undefined;

  after(async () => {
    const id = forecastId;
    const pushLog = async (msg: string) => {
      try {
        await Forecast.updateOne(
          { _id: id },
          {
            $set: { lastLog: msg },
            $push: { progressLogs: { $each: [msg], $slice: -100 } },
          },
        );
      } catch {
        /* ignore log write failures */
      }
    };

    try {
      await connectDB();
      await pushLog("Background worker: gathering context & calling LLM…");

      const result = await runForecast(telegramChatId, userGuidance, {
        iterations: iters,
        horizons: hz,
        model: aiModel,
        log: pushLog,
      });

      await Forecast.updateOne(
        { _id: id },
        {
          $set: {
            status: "complete",
            horizons: result.horizons,
            iterations: result.iterations,
            generatedAt: result.generatedAt,
            lastLog: "Forecast complete",
          },
          $push: { progressLogs: { $each: ["Saved to history."], $slice: -100 } },
        },
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const msg = e.message;
      const stack = e.stack?.slice(0, 8000) || "";
      const lines = [
        "--- forecast job failed ---",
        `Error: ${msg}`,
        ...(stack ? [`Stack:\n${stack}`] : []),
        `Time: ${new Date().toISOString()}`,
      ];
      try {
        await connectDB();
        await Forecast.updateOne(
          { _id: id },
          {
            $set: {
              status: "failed",
              errorMessage: msg,
              errorStack: stack || undefined,
              lastLog: msg,
            },
            $push: { progressLogs: { $each: lines, $slice: -100 } },
          },
        );
      } catch {
        /* ignore */
      }
    }
  });

  const obj = pending.toObject();
  const forecast = normalizeForecast({
    ...obj,
    _id: forecastId,
  } as unknown as Record<string, unknown>);

  return NextResponse.json({ forecastId, forecast });
}
