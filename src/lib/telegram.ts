const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(chatId: number | string, text: string, parseMode: string = "Markdown") {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  let res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = await res.json();
  if (!data.ok && parseMode) {
    res = await fetch(`${BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    data = await res.json();
  }
  if (!data.ok) console.error("sendMessage failed:", JSON.stringify(data), "chatId:", chatId, "text:", text.substring(0, 80));
  return data;
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

/** Inline button that opens the URL inside Telegram as a Mini App (web_app). */
export async function sendMessageWithWebAppButton(
  chatId: number | string,
  text: string,
  button: { text: string; url: string },
  parseMode: string = ""
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]],
    },
  };
  if (parseMode) payload.parse_mode = parseMode;
  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

const ACTION_EMOJIS = ["👍", "👏", "🔥", "🎉", "🏆"];

export async function reactWithEmoji(
  chatId: number | string,
  messageId: number,
  emoji: string
) {
  await fetch(`${BASE}/setMessageReaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    }),
  }).catch(console.error);
}

export async function reactToMessage(
  chatId: number | string,
  messageId: number,
  actionCount: number,
  hasDate: boolean
) {
  if (actionCount <= 0 && !hasDate) return;

  const reaction: { type: string; emoji: string }[] = [];
  if (actionCount > 0) {
    reaction.push({ type: "emoji", emoji: ACTION_EMOJIS[Math.min(actionCount, 5) - 1] });
  }
  if (hasDate && reaction.length === 0) {
    reaction.push({ type: "emoji", emoji: "⏰" });
  }

  await fetch(`${BASE}/setMessageReaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reaction,
    }),
  }).catch(console.error);
}

export async function getChatAdmins(chatId: number | string) {
  const res = await fetch(`${BASE}/getChatAdministrators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }),
  });
  const data = await res.json();
  if (!data.ok) return [];
  return (data.result || []).map((m: { user: { id: number; username?: string; first_name: string; last_name?: string; is_bot?: boolean }; status: string }) => ({
    userId: m.user.id,
    username: m.user.username,
    firstName: m.user.first_name,
    lastName: m.user.last_name,
    isBot: m.user.is_bot || false,
    status: m.status,
  }));
}

export async function setWebhook(url: string) {
  const res = await fetch(`${BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
