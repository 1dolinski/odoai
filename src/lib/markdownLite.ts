/**
 * Minimal markdown for trusted dashboard copy (context summary, leverage play).
 * Escapes HTML, supports **bold**, ## / ### headings, - bullets, paragraphs, line breaks.
 */
export type MarkdownLiteTheme = "onDark" | "onLight" | "amber" | "violet";

const TW: Record<
  MarkdownLiteTheme,
  { p: string; strong: string; h2: string; h3: string; h4: string; ul: string; li: string }
> = {
  onDark: {
    p: "mb-3 text-white/90 leading-relaxed last:mb-0",
    strong: "text-white font-semibold",
    h2: "text-xl sm:text-2xl font-bold text-white mt-5 mb-2 first:mt-0",
    h3: "text-lg sm:text-xl font-semibold text-white/95 mt-4 mb-2 first:mt-0",
    h4: "text-base font-semibold text-white/95 mt-3 mb-1.5 first:mt-0",
    ul: "list-disc pl-5 space-y-1.5 my-3 text-white/90 leading-relaxed",
    li: "pl-0.5",
  },
  onLight: {
    p: "mb-3 text-slate-700 leading-relaxed last:mb-0",
    strong: "text-slate-900 font-semibold",
    h2: "text-xl font-bold text-slate-900 mt-5 mb-2 first:mt-0",
    h3: "text-lg font-semibold text-slate-900 mt-4 mb-2 first:mt-0",
    h4: "text-base font-semibold text-slate-800 mt-3 mb-1.5 first:mt-0",
    ul: "list-disc pl-5 space-y-1.5 my-3 text-slate-700 leading-relaxed",
    li: "pl-0.5",
  },
  amber: {
    p: "mb-3 text-amber-950 leading-relaxed last:mb-0",
    strong: "text-amber-950 font-semibold",
    h2: "text-xl font-bold text-amber-950 mt-4 mb-2 first:mt-0",
    h3: "text-lg font-semibold text-amber-950 mt-3 mb-2 first:mt-0",
    h4: "text-base font-semibold text-amber-900 mt-2 mb-1.5 first:mt-0",
    ul: "list-disc pl-5 space-y-1.5 my-3 text-amber-950 leading-relaxed",
    li: "pl-0.5",
  },
  violet: {
    p: "mb-3 text-purple-900 leading-relaxed last:mb-0",
    strong: "text-purple-950 font-semibold",
    h2: "text-xl font-bold text-purple-950 mt-4 mb-2 first:mt-0",
    h3: "text-lg font-semibold text-purple-900 mt-3 mb-2 first:mt-0",
    h4: "text-base font-semibold text-purple-900 mt-2 mb-1.5 first:mt-0",
    ul: "list-disc pl-5 space-y-1.5 my-3 text-purple-900 leading-relaxed",
    li: "pl-0.5",
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applyBold(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** First ~1–2 sentences or maxChars, for “Brief” mode. */
export function toBriefVision(text: string, maxChars = 380): string {
  const t = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const re = /[.!?]\s+/g;
  let best = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    if (m.index + 1 >= 80) best = m.index + 1;
  }
  if (best >= 80) return t.slice(0, best).trim();
  return `${slice.trimEnd()}…`;
}

export function markdownLiteToHtml(raw: string, theme: MarkdownLiteTheme): string {
  const tw = TW[theme];
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const blocks = text.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const head = trimmed.match(/^(#{1,3}) (.+)$/);
    if (head && !trimmed.includes("\n")) {
      const level = head[1].length;
      const cls = level === 1 ? tw.h2 : level === 2 ? tw.h3 : tw.h4;
      const inner = applyBold(escapeHtml(head[2]));
      const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      out.push(`<${tag} class="${cls}">${inner}</${tag}>`);
      continue;
    }

    const lines = trimmed.split("\n");
    const bulletLines = lines.filter((l) => l.trim().length > 0);
    const allBullets = bulletLines.length > 0 && bulletLines.every((l) => /^[-*]\s/.test(l.trim()));
    if (allBullets) {
      const items = bulletLines.map((l) => {
        const content = l.replace(/^[-*]\s+/, "").trim();
        return `<li class="${tw.li}">${applyBold(escapeHtml(content))}</li>`;
      });
      out.push(`<ul class="${tw.ul}">${items.join("")}</ul>`);
      continue;
    }

    const para = trimmed
      .split("\n")
      .map((line) => applyBold(escapeHtml(line)))
      .join("<br/>");
    out.push(`<p class="${tw.p}">${para}</p>`);
  }

  return `<div class="markdown-lite">${out.join("")}</div>`;
}
