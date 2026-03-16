const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(chatId: number | string, text: string, parseMode: string = "Markdown") {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });
  return res.json();
}

export async function sendMessageWithButtons(
  chatId: number | string,
  text: string,
  buttons: Array<{ text: string; url: string }>,
  parseMode: string = "Markdown"
) {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: {
        inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))],
      },
    }),
  });
  return res.json();
}

export async function setWebhook(url: string) {
  const res = await fetch(`${BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
