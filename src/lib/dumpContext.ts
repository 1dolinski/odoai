/** Format chat-level dumps for LLM prompts — full text within token-safe budgets (newest first). */

export type DumpLike = { text: string; category: string; subject: string };

const DEFAULTS = {
  maxItems: 15,
  maxCharsPerDump: 14_000,
  maxTotalChars: 72_000,
} as const;

export function formatDumpsForPrompt(
  dumps: DumpLike[],
  options?: Partial<{ maxItems: number; maxCharsPerDump: number; maxTotalChars: number }>,
): string {
  const maxItems = options?.maxItems ?? DEFAULTS.maxItems;
  const maxPer = options?.maxCharsPerDump ?? DEFAULTS.maxCharsPerDump;
  const maxTotal = options?.maxTotalChars ?? DEFAULTS.maxTotalChars;

  const recent = dumps.slice(-maxItems).reverse();
  let used = 0;
  const blocks: string[] = [];

  for (const d of recent) {
    const label = `[${d.category}${d.subject ? `/${d.subject}` : ""}]`;
    const overhead = label.length + 8;
    const room = maxTotal - used - overhead;
    if (room < 200) break;

    const cap = Math.min(maxPer, room);
    const raw = (d.text || "").trim();
    const truncNote = "\n[…]";
    const body = raw.length <= cap ? raw : `${raw.slice(0, Math.max(0, cap - truncNote.length))}${truncNote}`;
    blocks.push(`${label}\n${body}`);
    used += overhead + body.length;
  }

  return blocks.join("\n\n---\n\n");
}
