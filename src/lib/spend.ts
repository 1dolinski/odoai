import Spend, { SpendType } from "@/models/Spend";

export async function trackSpend(
  chatId: string,
  type: SpendType,
  label: string,
  tokens?: number,
  cost?: number
) {
  await Spend.create({ telegramChatId: chatId, type, label, tokens, cost }).catch(console.error);
}

export async function getSpendSummary(chatId: string) {
  const spends = await Spend.find({ telegramChatId: chatId });

  const summary = {
    totalCalls: spends.length,
    totalTokens: 0,
    totalCost: 0,
    byType: {} as Record<string, { calls: number; tokens: number; cost: number }>,
  };

  for (const s of spends) {
    summary.totalTokens += s.tokens || 0;
    summary.totalCost += s.cost || 0;

    if (!summary.byType[s.type]) {
      summary.byType[s.type] = { calls: 0, tokens: 0, cost: 0 };
    }
    summary.byType[s.type].calls++;
    summary.byType[s.type].tokens += s.tokens || 0;
    summary.byType[s.type].cost += s.cost || 0;
  }

  return summary;
}

export async function getRecentSpends(chatId: string, limit = 20) {
  return Spend.find({ telegramChatId: chatId }).sort({ createdAt: -1 }).limit(limit).lean();
}
