import { NextResponse } from "next/server";
import { setWebhook } from "@/lib/telegram";

export async function GET() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "APP_URL not set" }, { status: 500 });
  }

  const webhookUrl = `${appUrl}/api/telegram`;
  const result = await setWebhook(webhookUrl);

  return NextResponse.json({ webhookUrl, result });
}
