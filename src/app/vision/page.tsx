import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vision — odoai",
  description: "What if every conversation moved your business forward?",
};

export default function VisionPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden selection:bg-blue-500/30">
      {/* Ambient light */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[-30%] left-[20%] w-[600px] h-[600px] bg-blue-600/6 rounded-full blur-[150px]" />
        <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[130px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-amber-500/4 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-tight">
            odo<span className="text-blue-400">ai</span>
          </a>
          <div className="flex items-center gap-3 sm:gap-4 text-sm text-gray-400">
            <a href="/autoresearch" className="hover:text-white transition-colors">
              Autoresearch
            </a>
            <a
              href="https://t.me/odoai_bot"
              className="hover:text-white transition-colors"
            >
              Try it →
            </a>
          </div>
        </nav>

        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-32 text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-400 font-medium mb-10 backdrop-blur-sm">
            A new way to run things
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Your team already talks.<br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
              What if that was enough?
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto leading-relaxed">
            Every conversation contains tasks, decisions, priorities, and opportunities.
            Most of it disappears. We built an AI that makes sure none of it does.
          </p>
        </section>

        {/* The Problem */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
            <ProblemCard
              number="1"
              text="Ideas come up in conversation. They never become tasks."
            />
            <ProblemCard
              number="2"
              text="Someone says they'll do something. Nobody tracks if it happened."
            />
            <ProblemCard
              number="3"
              text="New ideas feel urgent. In-progress work quietly dies."
            />
          </div>
        </section>

        {/* The Shift */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-32">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-4 sm:mb-6">
            The shift
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-4 sm:mb-6">
            An AI that listens to your group chat,<br className="hidden sm:block" />
            builds the full picture, and tells you{" "}
            <span className="text-blue-400">what actually matters</span>.
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed max-w-2xl">
            Not another project management tool you have to update. Not a dashboard
            you forget to check. Just keep talking — the AI observes, extracts,
            connects, and surfaces what you need to see.
          </p>
        </section>

        {/* The Flow */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 sm:pb-32">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-6 sm:mb-10 text-center">
            The flow
          </p>
          <div className="space-y-0">
            <FlowStep
              number="01"
              title="Conversation"
              accent="blue"
              description="Your team talks in Telegram — planning, debating, sharing updates. This is where real work happens."
              detail="The AI listens passively. Every message adds to a living context model of your team, projects, and relationships."
            />
            <FlowConnector />
            <FlowStep
              number="02"
              title="Extraction"
              accent="cyan"
              description="Tasks, people, decisions, deadlines, and intentions are automatically inferred from natural conversation."
              detail="'I'll handle the pitch deck by Friday' becomes a tracked task with an owner and a deadline. No slash commands needed."
            />
            <FlowConnector />
            <FlowStep
              number="03"
              title="Context"
              accent="purple"
              description="Dumps, notes, data sources, and metrics flow in. The AI indexes everything into a searchable knowledge base."
              detail="Team abilities, contact networks, business data, social metrics — all queryable, all connected to the task board."
            />
            <FlowConnector />
            <FlowStep
              number="04"
              title="Prioritization"
              accent="amber"
              description="AI ranks every task against what has momentum, what's blocked, what resources exist, and what the data says."
              detail="New ideas compete against existing momentum. Switching costs are real. The AI accounts for what's in motion, not just what's exciting."
            />
            <FlowConnector />
            <FlowStep
              number="05"
              title="Narrative"
              accent="orange"
              description="A 'State of the Board' — the story of what matters now. Acknowledgement, accountability, and a clear defer list."
              detail="Not a list of tasks. A narrative: what's moving, what's blocked, who did what, what to ignore, and what's being discussed that hasn't been tasked yet."
            />
            <FlowConnector />
            <FlowStep
              number="06"
              title="Leverage"
              accent="pink"
              description="The AI identifies the single highest-leverage unlock — grounded in your data, not hypothetical."
              detail="'You're already producing 3 videos/week. A dedicated editor turns that into 15 cross-platform pieces. Your short-form gets 4x engagement. This is the bottleneck.' — backed by your actual metrics."
            />
          </div>
        </section>

        {/* What changes */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-32">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 backdrop-blur-sm p-5 sm:p-8 md:p-10">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-6 sm:mb-8">
              What changes
            </h2>
            <div className="space-y-6">
              <ChangeRow
                before="Ideas vanish in scroll"
                after="Every idea is captured, scored, and compared against what's already in motion"
              />
              <ChangeRow
                before="'Who's doing that?' — silence"
                after="Clear ownership, delegation tracking, and accountability in the narrative"
              />
              <ChangeRow
                before="New shiny thing kills momentum"
                after="Switching costs are visible. In-progress work is protected."
              />
              <ChangeRow
                before="Blocked tasks sit forever"
                after="Blockers are named. Unblocking becomes the priority when it should be."
              />
              <ChangeRow
                before="Completed work goes unnoticed"
                after="Acknowledgement is built in. Momentum compounds when people see progress."
              />
              <ChangeRow
                before="Gut feel on what matters"
                after="Priorities scored by momentum, impact, effort, timing, and data signals"
              />
              <ChangeRow
                before="Fundraising pitch is a scramble"
                after="The leverage play writes itself — grounded in what you're already doing"
              />
            </div>
          </div>
        </section>

        {/* The bigger idea */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-32 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-4 sm:mb-6">
            The best teams don&apos;t need more tools.<br />
            They need{" "}
            <span className="bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
              less friction between thinking and doing
            </span>.
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed max-w-2xl mx-auto mb-4">
            You already discuss your work. You already have the ideas, the people,
            the context. The gap isn&apos;t information — it&apos;s that no one is
            watching the full picture and telling you what it means.
          </p>
          <p className="text-gray-500 text-base leading-relaxed max-w-2xl mx-auto">
            odoai sits in your chat. It builds the map while you move.
            When you look up, everything is organized, ranked, and narrated —
            with a clear answer to &ldquo;what should we do next?&rdquo;
          </p>
        </section>

        {/* Vision block */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 sm:pb-32">
          <div className="relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-gray-950 to-blue-950/30 p-5 sm:p-8 md:p-12 overflow-hidden">
            <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px]" />
            <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-[60px]" />
            <div className="relative">
              <p className="text-xs uppercase tracking-[0.2em] text-purple-400 font-semibold mb-4">
                The leverage play
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                Imagine every team had this.
              </h2>
              <div className="space-y-4 text-gray-300 text-base sm:text-lg leading-relaxed">
                <p>
                  A team of 4 people discussing in a group chat. An AI that
                  tracks every task, every decision, every commitment. That knows
                  who&apos;s working on what, what&apos;s blocked, what data says
                  is working.
                </p>
                <p>
                  That produces a weekly narrative — not a spreadsheet, a{" "}
                  <em className="text-white">story</em> — of where the team is,
                  what momentum looks like, and what the single highest-leverage
                  move is.
                </p>
                <p>
                  That catches the &ldquo;we should do X&rdquo; in conversation
                  and scores it against everything already in flight. That says:
                  &ldquo;this is a great idea, but finishing Y first is worth 3x
                  more because you&apos;re 70% done and the switching cost is
                  real.&rdquo;
                </p>
                <p className="text-white font-medium">
                  Every conversation becomes an input.
                  Every task has context.
                  Every priority has a reason.
                  And there&apos;s always a clear answer to &ldquo;what&apos;s the
                  one thing that would change everything?&rdquo;
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-3 sm:mb-4">
            Start with a conversation.
          </h2>
          <p className="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8 max-w-lg mx-auto">
            Add odoai to your Telegram group. Keep talking like you always do.
            The AI handles the rest.
          </p>
          <a
            href="https://t.me/odoai_bot"
            className="group inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-all duration-200 px-7 py-3.5 rounded-xl font-medium text-[15px] shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:-translate-y-0.5"
          >
            Add to Telegram
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </a>
          <p className="text-gray-600 text-xs mt-4">
            Free to use · Works in any group chat
          </p>
        </section>

        {/* Footer */}
        <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 border-t border-gray-800/50 flex items-center justify-between text-xs text-gray-600">
          <span>
            odo<span className="text-gray-500">ai</span>
          </span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-gray-400 transition-colors">
              Home
            </a>
            <a href="/autoresearch" className="hover:text-gray-400 transition-colors">
              Autoresearch
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ProblemCard({ number, text }: { number: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5 backdrop-blur-sm">
      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
        Problem {number}
      </span>
      <p className="text-gray-300 text-sm leading-relaxed mt-2">{text}</p>
    </div>
  );
}

function FlowStep({
  number,
  title,
  accent,
  description,
  detail,
}: {
  number: string;
  title: string;
  accent: string;
  description: string;
  detail: string;
}) {
  const dotColor: Record<string, string> = {
    blue: "bg-blue-400",
    cyan: "bg-cyan-400",
    purple: "bg-purple-400",
    amber: "bg-amber-400",
    orange: "bg-orange-400",
    pink: "bg-pink-400",
  };
  const numColor: Record<string, string> = {
    blue: "text-blue-500",
    cyan: "text-cyan-500",
    purple: "text-purple-500",
    amber: "text-amber-500",
    orange: "text-orange-500",
    pink: "text-pink-500",
  };
  return (
    <div className="flex gap-3 sm:gap-5 md:gap-8">
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${dotColor[accent] || "bg-gray-400"} shadow-lg`}
          style={{ boxShadow: `0 0 12px 2px currentColor` }}
        />
      </div>
      <div className="pb-2 min-w-0">
        <div className="flex items-baseline gap-2 sm:gap-3 mb-1">
          <span
            className={`text-[10px] sm:text-xs font-mono font-bold ${numColor[accent] || "text-gray-500"}`}
          >
            {number}
          </span>
          <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">{title}</h3>
        </div>
        <p className="text-gray-300 text-[13px] sm:text-sm md:text-base leading-relaxed mb-1">
          {description}
        </p>
        <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex gap-3 sm:gap-5 md:gap-8">
      <div className="flex flex-col items-center shrink-0 w-2.5 sm:w-3">
        <div className="w-px h-5 sm:h-8 bg-gradient-to-b from-gray-700 to-gray-800" />
      </div>
      <div />
    </div>
  );
}

function ChangeRow({ before, after }: { before: string; after: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
      <div className="flex items-start gap-2 sm:w-2/5 shrink-0">
        <span className="text-red-400/60 text-xs mt-0.5 shrink-0">✕</span>
        <span className="text-gray-500 text-sm leading-relaxed line-through decoration-gray-700">
          {before}
        </span>
      </div>
      <span className="hidden sm:block text-gray-700 mt-0.5">→</span>
      <div className="flex items-start gap-2 flex-1">
        <span className="text-green-400/80 text-xs mt-0.5 shrink-0">✓</span>
        <span className="text-gray-200 text-sm leading-relaxed">{after}</span>
      </div>
    </div>
  );
}
