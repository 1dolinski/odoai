const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_MODEL = (process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini").trim();

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function chat(messages: Message[]): Promise<string> {
  const result = await chatWithUsage(messages);
  return result.content;
}

export async function chatWithUsage(messages: Message[]): Promise<ChatResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };
}
