export type NorthStarSnapshot = {
  /** Mongo subdocument _id — used to delete from history */
  id?: string;
  at: string;
  leveragePlay: string;
  contextSummary: string;
  priorityNarrative: string;
};

export type HouseTimeLens = "live" | "h24" | "d7" | "d30";

/** Latest snapshot with `at <= now - offset` (state as it was at least that long ago). */
export function pickNorthStarSnapshot(history: NorthStarSnapshot[], lens: Exclude<HouseTimeLens, "live">): NorthStarSnapshot | null {
  if (!history.length) return null;
  const ms = lens === "h24" ? 86400000 : lens === "d7" ? 7 * 86400000 : 30 * 86400000;
  const target = Date.now() - ms;
  let best: NorthStarSnapshot | null = null;
  let bestT = -Infinity;
  for (const s of history) {
    const t = new Date(s.at).getTime();
    if (t <= target && t > bestT) {
      bestT = t;
      best = { ...s };
    }
  }
  return best;
}
