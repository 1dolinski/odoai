"use client";

import { useEffect, useState, useCallback } from "react";

interface ServiceStatus {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  detail?: string;
}

interface StatusData {
  overall: "healthy" | "degraded" | "partial";
  timestamp: string;
  services: ServiceStatus[];
  data: { chats: number; tasks: number; people: number; activities: number } | null;
}

const STATUS_COLORS = {
  up: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  down: { dot: "bg-red-500", bg: "bg-red-50 border-red-200", text: "text-red-700" },
  degraded: { dot: "bg-amber-500", bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
};

const OVERALL_COLORS = {
  healthy: { bg: "from-emerald-600 to-emerald-700", label: "All Systems Operational" },
  degraded: { bg: "from-red-600 to-red-700", label: "Service Disruption" },
  partial: { bg: "from-amber-600 to-amber-700", label: "Partial Outage" },
};

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status");
      setData(await res.json());
      setLastChecked(new Date());
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const overall = data ? OVERALL_COLORS[data.overall] : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <a href="/" className="text-lg font-bold tracking-tight text-gray-900">
              odo<span className="text-blue-500">ai</span>
            </a>
            <span className="text-gray-400 text-sm ml-2">system status</span>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>

        {overall && data && (
          <div className={`rounded-xl bg-gradient-to-r ${overall.bg} text-white px-5 py-4 mb-6 shadow-sm`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${data.overall === "healthy" ? "bg-white animate-pulse" : "bg-white/70"}`} />
              <span className="font-semibold text-sm">{overall.label}</span>
            </div>
            <p className="text-xs text-white/70 mt-1">
              Last checked: {lastChecked?.toLocaleTimeString() || "—"}
            </p>
          </div>
        )}

        {!data && !loading && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 mb-6">
            <p className="text-sm text-red-700 font-medium">Failed to reach status API</p>
          </div>
        )}

        {data && (
          <>
            <div className="space-y-2 mb-8">
              {data.services.map((s) => {
                const c = STATUS_COLORS[s.status];
                return (
                  <div key={s.name} className={`rounded-lg border ${c.bg} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900">{s.name}</span>
                        {s.detail && <p className="text-[11px] text-gray-500 truncate">{s.detail}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-gray-400 tabular-nums">{s.latencyMs}ms</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${c.text}`}>{s.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {data.data && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Data</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Chats", value: data.data.chats },
                    { label: "Tasks", value: data.data.tasks },
                    { label: "People", value: data.data.people },
                    { label: "Activities", value: data.data.activities },
                  ].map((d) => (
                    <div key={d.label} className="text-center">
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{d.value}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{d.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {loading && !data && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-white px-4 py-3 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
