const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const DEFAULT_MODEL = (process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.5").trim();

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function chat(messages: Message[], model?: string): Promise<string> {
  const result = await chatWithUsage(messages, model);
  return result.content;
}

export async function chatWithUsage(messages: Message[], model?: string): Promise<ChatResult> {
  const useModel = (model || DEFAULT_MODEL).trim();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error (${useModel}): ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    model: useModel,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };
}
